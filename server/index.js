require('dotenv').config();

// Suivi d'erreurs (Sentry) — initialisé tout en haut du fichier, avant les
// autres require, comme recommandé par Sentry pour capturer un maximum
// d'erreurs (y compris celles qui surviendraient pendant le chargement des
// modules suivants). Entièrement optionnel : sans SENTRY_DSN, Sentry.init
// ne fait rien et le serveur tourne exactement comme avant.
const Sentry = require('@sentry/node');
if (process.env.SENTRY_DSN) {
  Sentry.init({ dsn: process.env.SENTRY_DSN, tracesSampleRate: 0.1 });
}

const express = require('express');
const rateLimit = require('express-rate-limit');
const multer  = require('multer');
const cors    = require('cors');
const path    = require('path');
const fs      = require('fs');
const crypto  = require('crypto');
const ws      = require('ws');
const { createClient } = require('@supabase/supabase-js');
const Stripe = require('stripe');
const renderBarMitsva = require('./templates/bar-mitsva/render');
const defaultConfig   = require('./templates/bar-mitsva/default-config');
const { POSTS } = require('./blog/posts');
const { renderPostPage, renderIndexPage } = require('./blog/render');
const { ARTICLES_A_REDIGER } = require('./blog/calendrier');

const supabase   = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, { realtime: { transport: ws } });
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || '';
const ADMIN_KEY  = process.env.ADMIN_KEY;
if (!ADMIN_KEY) {
  console.error('❌ ADMIN_KEY manquant dans les variables d\'environnement — arrêt du serveur (aucune valeur par défaut par sécurité).');
  process.exit(1);
}
const PORT       = process.env.PORT || 3000;
const TMP_DIR    = path.join(__dirname, 'tmp');
const BUCKET_MEDIA = 'msd-media';
const BUCKET_VIDEO = 'msd-videos';

// Connexion Google — callback fait maison (voir plus bas) : le code échangé
// avec Google reste entièrement sur notre propre domaine, contrairement au
// flux OAuth intégré de Supabase qui fait transiter l'utilisateur par l'écran
// "Accéder à l'application <projet>.supabase.co" (domaine que nous ne
// possédons pas, donc impossible à personnaliser côté Google).
const GOOGLE_CLIENT_ID     = process.env.GOOGLE_CLIENT_ID     || '';
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';

// Paiement réel via Stripe Checkout. Optionnel au démarrage (comme Dokploy) :
// si absent, les routes de paiement répondent une erreur explicite plutôt que
// de faire planter tout le serveur — utile pour développer le reste sans
// avoir de compte Stripe sous la main.
const STRIPE_SECRET_KEY     = process.env.STRIPE_SECRET_KEY     || '';
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || '';
const stripe = STRIPE_SECRET_KEY ? new Stripe(STRIPE_SECRET_KEY) : null;

if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true });

const app = express();
// Le serveur tourne derrière le proxy Traefik de Dokploy (TLS terminé en
// amont) : sans ceci, req.protocol renverrait toujours 'http', ce qui
// casserait le redirect_uri envoyé à Google (doit être identique au https://
// enregistré dans Google Cloud Console) et les liens générés avec req.protocol.
app.set('trust proxy', 1);

// Redirection .fr → .com (301 permanent)
app.use((req, res, next) => {
  const host = req.hostname || '';
  if (host.endsWith('.fr')) {
    const target = `https://${host.replace(/\.fr$/, '.com')}${req.originalUrl}`;
    return res.redirect(301, target);
  }
  next();
});

app.use(cors());
// "verify" conserve le corps brut de la requête (req.rawBody) : nécessaire
// pour vérifier la signature des webhooks Stripe, qui doit porter sur les
// octets exacts envoyés — express.json() a déjà consommé/reformaté req.body
// à ce stade pour toutes les autres routes, ça n'affecte qu'elles en plus.
app.use(express.json({ limit: '2mb', verify: (req,res,buf) => { req.rawBody = buf; } }));

// Multer — seuls images/vidéos/audio sont acceptés (logos, photos, musique,
// vidéos invités). Le mimetype vient du header envoyé par le client, donc pas
// infaillible contre un attaquant volontaire, mais bloque déjà les fichiers
// hors sujet (exécutables, scripts…) envoyés par erreur ou en masse.
const storage = multer.diskStorage({ destination: TMP_DIR, filename: (req,file,cb) => cb(null, Date.now()+'-'+file.originalname.replace(/\s+/g,'_')) });
const upload = multer({
  storage,
  limits: { fileSize: 500*1024*1024 },
  fileFilter: (req, file, cb) => {
    const ok = /^(image|video|audio)\//.test(file.mimetype);
    cb(ok ? null : new Error('Type de fichier non autorisé'), ok);
  },
});

// Rate-limiting sur les routes publiques (pas d'authentification) les plus
// exposées au spam : création de compte/faire-part, RSVP, uploads invités.
const limiterPublic = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Trop de requêtes, merci de réessayer dans quelques minutes.' },
});

function requireAdmin(req,res,next){
  const key = req.headers['x-admin-key']||req.query.adminKey;
  if(key!==ADMIN_KEY) return res.status(401).json({error:'Non autorisé'});
  next();
}

// Lecture d'un cookie précis depuis l'en-tête brut (évite d'ajouter la
// dépendance cookie-parser pour un unique usage : le nonce anti-CSRF Google).
function lireCookie(req, nom){
  const entete = req.headers.cookie || '';
  const trouve = entete.split(';').map(c=>c.trim()).find(c=>c.startsWith(nom+'='));
  return trouve ? decodeURIComponent(trouve.slice(nom.length+1)) : null;
}

// Vérifie le jeton Supabase Auth envoyé par un client connecté depuis /espace
// (Authorization: Bearer <access_token>). Ajoute req.clientUser si valide.
async function requireClientAuth(req,res,next){
  const header = req.headers.authorization||'';
  const token  = header.startsWith('Bearer ') ? header.slice(7) : null;
  if(!token) return res.status(401).json({error:'Non authentifié'});
  const { data, error } = await supabase.auth.getUser(token);
  if(error || !data?.user) return res.status(401).json({error:'Session invalide, merci de vous reconnecter'});
  req.clientUser = data.user;
  next();
}

// Vérifie que le site demandé appartient bien au client connecté.
// Ajoute req.site si tout est bon, répond directement en cas d'erreur.
async function chargerSiteDuClient(req,res,next){
  const { data:site, error } = await supabase.from('msd_sites').select('*').eq('id',req.params.id).single();
  if(error || !site) return res.status(404).json({error:'Site introuvable'});
  if(site.user_id !== req.clientUser.id) return res.status(403).json({error:'Ce site ne vous appartient pas'});
  req.site = site;
  next();
}

// ─── Merge deep config avec defaults ────────────────────────────────────────
function mergeConfig(partial) {
  const base = JSON.parse(JSON.stringify(defaultConfig));
  function merge(target, src) {
    for (const k of Object.keys(src||{})) {
      if (src[k]!==null && typeof src[k]==='object' && !Array.isArray(src[k])) {
        target[k] = target[k]||{};
        merge(target[k], src[k]);
      } else {
        target[k] = src[k];
      }
    }
  }
  merge(base, partial||{});
  return base;
}

// ─── Génération automatique du faire-part de base (juste après le questionnaire) ─

// Mêmes palettes de couleurs que celles proposées dans le panneau admin, pour
// que le choix de style du questionnaire prospect ait un rendu cohérent.
const PRESETS_COULEUR = {
  'bleu-blanc':  { cream:'#f0f5ff',creamWarm:'#e8f0fe',creamDeep:'#dbeafe',paper:'#ffffff',gold:'#2563eb',goldBright:'#3b82f6',goldDeep:'#1d4ed8',bronze:'#1e3a8a',ink:'#0d1f3c',inkSoft:'#475569' },
  'bleu-marine': { cream:'#e8eaf6',creamWarm:'#eef0fa',creamDeep:'#c5cae9',paper:'#f5f6fe',gold:'#3f51b5',goldBright:'#5c6bc0',goldDeep:'#283593',bronze:'#1a237e',ink:'#0d0d2b',inkSoft:'#303f9f' },
  'noir-blanc':  { cream:'#f5f5f5',creamWarm:'#fafafa',creamDeep:'#e8e8e8',paper:'#ffffff',gold:'#1a1a1a',goldBright:'#333333',goldDeep:'#0d0d0d',bronze:'#555555',ink:'#111111',inkSoft:'#444444' },
  'bleu-or':     { cream:'#f0f5ff',creamWarm:'#e8f0fe',creamDeep:'#dbeafe',paper:'#ffffff',gold:'#d97706',goldBright:'#f59e0b',goldDeep:'#b45309',bronze:'#1e3a8a',ink:'#0d1f3c',inkSoft:'#475569' },
  'emeraude':    { cream:'#eefbf3',creamWarm:'#e0f6e9',creamDeep:'#c6ecd6',paper:'#ffffff',gold:'#0f7a4e',goldBright:'#14a366',goldDeep:'#0a5c3a',bronze:'#0d4a30',ink:'#0a2a1c',inkSoft:'#3a6b52' },
  'bordeaux':    { cream:'#f7ecec',creamWarm:'#f2dede',creamDeep:'#e8c4c4',paper:'#fffafa',gold:'#7a1f2b',goldBright:'#a02c3b',goldDeep:'#5c1620',bronze:'#4a1119',ink:'#2b0d12',inkSoft:'#6b3038' },
  'terracotta':  { cream:'#fdf3ec',creamWarm:'#fae6d6',creamDeep:'#f0cba8',paper:'#fffaf5',gold:'#c1622d',goldBright:'#de7d43',goldDeep:'#9c4a20',bronze:'#7a3a19',ink:'#3d1f0d',inkSoft:'#6b4128' },
};

// ── Génération d'une palette complète à partir d'une ou deux couleurs
// choisies librement (option "Personnalisé" du questionnaire) ────────────
function hexVersHsl(hex) {
  hex = (hex||'#c9a96e').replace('#','');
  if (hex.length===3) hex = hex.split('').map(c=>c+c).join('');
  const r = parseInt(hex.slice(0,2),16)/255, g = parseInt(hex.slice(2,4),16)/255, b = parseInt(hex.slice(4,6),16)/255;
  const max = Math.max(r,g,b), min = Math.min(r,g,b);
  let h=0, s=0, l = (max+min)/2;
  if (max!==min) {
    const d = max-min;
    s = l>0.5 ? d/(2-max-min) : d/(max+min);
    if (max===r) h = (g-b)/d + (g<b?6:0);
    else if (max===g) h = (b-r)/d + 2;
    else h = (r-g)/d + 4;
    h /= 6;
  }
  return { h:h*360, s:s*100, l:l*100 };
}
function hslVersHex(h,s,l) {
  h/=360; s/=100; l/=100;
  let r,g,b;
  if (s===0) { r=g=b=l; }
  else {
    const hue2rgb = (p,q,t) => { if(t<0)t+=1; if(t>1)t-=1; if(t<1/6)return p+(q-p)*6*t; if(t<1/2)return q; if(t<2/3)return p+(q-p)*(2/3-t)*6; return p; };
    const q = l<0.5 ? l*(1+s) : l+s-l*s;
    const p = 2*l-q;
    r = hue2rgb(p,q,h+1/3); g = hue2rgb(p,q,h); b = hue2rgb(p,q,h-1/3);
  }
  const toHex = x => Math.round(Math.max(0,Math.min(1,x))*255).toString(16).padStart(2,'0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}
// Une seule couleur choisie : elle devient l'accent ("gold"), le reste de
// la palette (fonds clairs, encre) est dérivé automatiquement de sa teinte.
function paletteDepuisCouleurUnique(hexAccent) {
  const a = hexVersHsl(hexAccent);
  return {
    cream:      hslVersHex(a.h, Math.min(a.s,40), 96),
    creamWarm:  hslVersHex(a.h, Math.min(a.s,45), 93),
    creamDeep:  hslVersHex(a.h, Math.min(a.s,50), 87),
    paper:      '#ffffff',
    gold:       hexAccent,
    goldBright: hslVersHex(a.h, a.s, Math.min(a.l+12,85)),
    goldDeep:   hslVersHex(a.h, a.s, Math.max(a.l-15,10)),
    bronze:     hslVersHex(a.h, Math.min(a.s+10,90), Math.max(a.l-25,15)),
    ink:        hslVersHex(a.h, Math.min(a.s*0.6,30), 12),
    inkSoft:    hslVersHex(a.h, Math.min(a.s*0.5,25), 35),
  };
}
// Dégradé entre deux couleurs : la première sert d'accent, les fonds sont
// dérivés d'un mélange des deux teintes (cohérent avec le dégradé de fond
// existant, qui utilise déjà cream/creamWarm/creamDeep pour son linear-gradient).
function paletteDepuisDegrade(hex1, hex2) {
  const c1 = hexVersHsl(hex1), c2 = hexVersHsl(hex2);
  return {
    cream:      hslVersHex(c2.h, Math.min(c2.s,40), 95),
    creamWarm:  hslVersHex(c1.h, Math.min(c1.s,45), 92),
    creamDeep:  hslVersHex(c2.h, Math.min(c2.s,50), 86),
    paper:      '#ffffff',
    gold:       hex1,
    goldBright: hslVersHex(c1.h, c1.s, Math.min(c1.l+12,85)),
    goldDeep:   hslVersHex(c1.h, c1.s, Math.max(c1.l-15,10)),
    bronze:     hslVersHex(c2.h, Math.min(c2.s+10,90), Math.max(c2.l-20,15)),
    ink:        hslVersHex(c1.h, Math.min(c1.s*0.6,30), 12),
    inkSoft:    hslVersHex(c1.h, Math.min(c1.s*0.5,25), 35),
  };
}
// Correspond aux 3 cartes de style proposées dans le questionnaire vitrine
const STYLE_VERS_PRESET = {
  'Élégant & Classique': 'bleu-or',
  'Moderne & Épuré':     'noir-blanc',
  'Festif & Coloré':     'bleu-blanc',
};

const SECTIONS_REORDONNABLES = ['fairepart','hommage','shabbat','infos','video','rsvp'];

// Transforme "Jean Dupont" en "jean-dupont" (sans accents, sans caractères spéciaux)
function slugifier(texte){
  return (texte||'').toString().normalize('NFD').replace(/[̀-ͯ]/g,'')
    .toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'');
}

// Le sous-domaine doit porter le nom du "concerné" (l'enfant, les mariés, la
// personne fêtée…), pas celui de la personne qui remplit le questionnaire —
// ils sont souvent différents (parents pour une Bar Mitsva, témoin pour un
// mariage…). Même repli que construireConfigParDefaut plus bas.
function nomsSujetPourSousDomaine(lead){
  const prenom  = lead.subjectFirstName || lead.firstName || '';
  const prenom2 = lead.subjectSecondFirstName || '';
  const nom     = lead.subjectLastName || lead.lastName || '';
  return { prenom: prenom2 ? `${prenom}-${prenom2}` : prenom, nom };
}

// Génère un sous-domaine unique à partir du prénom/nom, en ajoutant un
// suffixe numérique si celui-ci est déjà pris.
async function genererSousDomaineUnique(prenom, nom){
  const base = slugifier(`${prenom||''}-${nom||''}`) || 'faire-part';
  let candidat = base;
  let suffixe = 0;
  while (true) {
    const { data } = await supabase.from('msd_sites').select('id').eq('subdomain', candidat).maybeSingle();
    if (!data) return candidat;
    suffixe += 1;
    candidat = `${base}-${suffixe}`;
  }
}

// Construit une configuration de départ à partir des réponses du
// questionnaire prospect. Tout reste ensuite modifiable par le client dans
// son espace personnel — ceci n'est qu'un point de départ personnalisé.
// La vitrine envoie le libellé affiché ("Bar Mitsva", "Mariage"…), pas un
// identifiant technique : on normalise ici.
const EVENT_TYPE_VERS_SLUG = {
  'bar-mitsva':'bar-mitsva', 'bat-mitsva':'bat-mitsva', 'mariage':'mariage', 'anniversaire':'anniversaire',
  'Bar Mitsva':'bar-mitsva', 'Bat Mitsva':'bat-mitsva', 'Mariage':'mariage', 'Anniversaire':'anniversaire',
  'Brit Mila':'brit-mila', 'Autre':'autre',
};

// Contenus prédéfinis pour la page "Informations complémentaires", proposés
// comme sous-question du questionnaire dès que cette page est cochée.
const INFOS_PRESETS = {
  visa: {
    title: 'Informations complémentaires', subtitle: 'Demande de VISA',
    body: "Depuis le 1er Août 2024, il est obligatoire pour les touristes souhaitant se rendre en Israel de remplir le formulaire ETA suivant :",
    ctaText: 'Faire une demande de visa — Site officiel', ctaUrl: 'https://israel-eta.piba.gov.il/',
  },
  hebergement: {
    title: 'Où loger et comment venir ?', subtitle: 'Hébergement & Transport',
    body: "Nous vous conseillons de réserver votre hébergement et votre transport à l'avance. N'hésitez pas à nous contacter pour des recommandations d'hôtels ou d'options de navette.",
    ctaText: '', ctaUrl: '',
  },
  tenue: {
    title: "Comment s'habiller ?", subtitle: 'Tenue de soirée',
    body: "Nous vous invitons à venir dans une tenue élégante, adaptée à l'occasion.",
    ctaText: '', ctaUrl: '',
  },
  cadeaux: {
    title: 'Une pensée pour nous ?', subtitle: 'Liste de mariage',
    body: "Votre présence est le plus beau des cadeaux. Si vous souhaitez néanmoins nous gâter, voici où trouver notre liste.",
    ctaText: 'Voir la liste de cadeaux', ctaUrl: '',
  },
};

// "2026-11-05" → "jeudi 5 novembre 2026" (capitalisé), pour l'affichage dans
// la ligne "Date" du faire-part.
function formaterDateFr(iso){
  if (!iso) return '';
  try {
    const texte = new Date(iso+'T12:00:00').toLocaleDateString('fr-FR', { weekday:'long', day:'numeric', month:'long', year:'numeric' });
    return texte.charAt(0).toUpperCase() + texte.slice(1);
  } catch(e) { return ''; }
}

function construireConfigParDefaut(lead){
  const config = JSON.parse(JSON.stringify(defaultConfig));
  const eventType = EVENT_TYPE_VERS_SLUG[lead.eventType] || 'mariage';
  const libelleEvenement = lead.eventType || 'Événement';
  const estMariage    = eventType === 'mariage';
  const estAnniv      = eventType === 'anniversaire';
  const estBarMitsva  = eventType === 'bar-mitsva';
  const estBatMitsva  = eventType === 'bat-mitsva';

  // Le "sujet" du faire-part (l'enfant, les mariés, la personne fêtée…)
  // n'est pas forcément la personne qui remplit le questionnaire : on
  // utilise en priorité les champs "sujet", avec les coordonnées de
  // l'organisateur en repli si jamais ils manquent.
  const sujetPrenom  = lead.subjectFirstName || lead.firstName || 'Prénom';
  const sujetPrenom2 = lead.subjectSecondFirstName || '';
  const sujetNom     = lead.subjectLastName || lead.lastName || 'Nom';
  const sujetExtra   = (lead.subjectExtra || '').trim(); // parents (bar/bat mitsva) ou âge (anniversaire)

  config.identity.firstName = sujetPrenom;
  // Pour un mariage avec les deux prénoms, "Camille" / "& Antoine" rend
  // très bien avec la mise en forme du hero (deux lignes, la 2e en couleur).
  config.identity.lastName = (estMariage && sujetPrenom2) ? `& ${sujetPrenom2}` : sujetNom;
  // "brit-mila" et "autre" n'ont pas d'option dédiée dans l'éditeur : on les
  // fait démarrer sur une base "mariage", modifiable ensuite.
  const TYPES_AVEC_OPTION_DEDIEE = ['bar-mitsva','bat-mitsva','mariage','anniversaire'];
  config.identity.eventType = TYPES_AVEC_OPTION_DEDIEE.includes(eventType) ? eventType : 'mariage';
  config.meta.title = (estMariage && sujetPrenom2) ? `${sujetPrenom} & ${sujetPrenom2}` : `${sujetPrenom} ${sujetNom}`;

  if (lead.date) config.target.date = lead.date;

  const ligneLieu = (config.sections.fairepart.events||[]).find(e => e.label === 'Lieu');
  if (ligneLieu && lead.location) ligneLieu.value = lead.location;

  if (lead.colorPreset === 'custom' && lead.customColor1) {
    const palette = (lead.customType === 'degrade' && lead.customColor2)
      ? paletteDepuisDegrade(lead.customColor1, lead.customColor2)
      : paletteDepuisCouleurUnique(lead.customColor1);
    Object.assign(config.theme.colors, palette);
    config.theme.background = { type: lead.customType === 'degrade' ? 'degrade' : 'uni', angle: 155 };
  } else {
    const presetId = PRESETS_COULEUR[lead.colorPreset] ? lead.colorPreset : (STYLE_VERS_PRESET[lead.style] || 'bleu-blanc');
    Object.assign(config.theme.colors, PRESETS_COULEUR[presetId]);
  }

  if (estBarMitsva) {
    // Le contenu par défaut (defaultConfig.js) est déjà écrit pour une Bar
    // Mitsva ("Mise des Téfilines", etc.) — on ajoute juste les prénoms des
    // parents s'ils ont été renseignés.
    if (sujetExtra) config.sections.fairepart.familyLine = `${sujetExtra} ont le plaisir de vous convier`;

  } else if (estBatMitsva) {
    // La Bat Mitsva a son propre rituel : contrairement à la Bar Mitsva, il
    // n'y a pas de "Mise des Téfilines" (spécifique aux garçons). On adapte
    // les textes pour ne pas afficher un contenu qui n'a pas de sens ici.
    config.sections.hero.eyebrow = 'Bat Mitsva';
    config.sections.fairepart.ceremonyTag = 'Cérémonie';
    config.sections.fairepart.ceremonyName = `Bat Mitsva de ${sujetPrenom}`;
    config.sections.fairepart.ceremonyHe = '';
    config.sections.fairepart.familyLine = sujetExtra
      ? `${sujetExtra} ont le plaisir de vous convier`
      : 'Les parents ont le plaisir de vous convier';
    config.sections.fairepart.events = (config.sections.fairepart.events||[]).map(ev =>
      ev.label === 'Heure' ? { ...ev, value: 'La cérémonie débutera à 10h30' } : ev
    );
    config.sections.rsvp.events = [
      { id:'ceremonie', name:'Cérémonie & Réception', date: lead.date || '' },
      { id:'shabbat',   name:'Shabbat Bat Mitsva',    date:'' },
    ];
    config.sections.shabbat.tag = 'Shabbat Bat Mitsva';
    config.sections.footer.credit = 'Bat Mitzvah · MMXXVI';

  } else {
    // Mariage / Anniversaire / Brit Mila / Autre : le contenu par défaut
    // (hommage, Shabbat, infos visa) est spécifique aux Bar/Bat Mitsva, on
    // le désactive et on adapte les textes. Le client peut tout modifier
    // ensuite depuis son éditeur.
    config.identity.bsd = false;
    config.sections.hommage.enabled = false;
    config.sections.shabbat.enabled = false;
    config.sections.infos.enabled   = false;

    config.sections.hero.eyebrow = libelleEvenement;
    config.sections.fairepart.blessing     = '';
    config.sections.fairepart.ceremonyTag  = estMariage ? 'Cérémonie' : 'Célébration';
    config.sections.fairepart.ceremonyName = estMariage ? 'Notre mariage'
      : estAnniv ? `${sujetPrenom} fête ses ${sujetExtra || '?'} ans`
      : `${libelleEvenement} de ${sujetPrenom}`;
    config.sections.fairepart.ceremonyHe   = '';
    config.sections.fairepart.familyLine   = estMariage
      ? `${sujetPrenom} & ${sujetPrenom2 || sujetNom} ont le plaisir de vous convier à leur mariage`
      : `${sujetPrenom} a le plaisir de vous inviter`;
    config.sections.fairepart.inviteHe  = '';
    config.sections.fairepart.inviteSub = 'Nous serions heureux de célébrer ce moment avec vous.';
    // Les lignes Date/Heure/Lieu et le mot de clôture par défaut
    // (defaultConfig.js) sont écrits pour une Bar Mitsva ("L'office
    // débutera…") — sans texte générique ici, un anniversaire ou un mariage
    // affichait ce même vocabulaire religieux, ce qui n'a pas de sens.
    const dateAffichee = formaterDateFr(lead.date);
    config.sections.fairepart.events = [
      { label:'Date', value: dateAffichee ? `Le ${dateAffichee}` : 'Date à venir' },
      { label:'Heure', value: estMariage ? 'La cérémonie débutera à 16h00' : 'La fête débutera à 18h00' },
      { label:'Lieu', value: lead.location || 'Nom du lieu', address:'', wazeUrl:'' }
    ];
    config.sections.fairepart.followup = estMariage
      ? 'La cérémonie sera suivie d\'un cocktail et d\'un dîner'
      : 'La soirée se poursuivra autour d\'un cocktail dînatoire';
    config.sections.rsvp.events = [
      { id:'principal', name: estMariage ? 'Cérémonie & Réception' : libelleEvenement, date: lead.date || '' }
    ];
  }

  // Choix des pages fait dans le questionnaire (case à cocher par section).
  // Non fourni = on garde les valeurs par défaut définies ci-dessus.
  if (lead.pages && typeof lead.pages === 'object') {
    SECTIONS_REORDONNABLES.forEach(cle => {
      if (cle === 'fairepart') return; // toujours activée
      if (Object.prototype.hasOwnProperty.call(lead.pages, cle)) {
        config.sections[cle].enabled = !!lead.pages[cle];
      }
    });
  }
  config.pageOrder = SECTIONS_REORDONNABLES.filter(cle => cle === 'fairepart' || config.sections[cle]?.enabled !== false);

  // Sous-question "Informations complémentaires" (posée si la page infos a
  // été cochée) : remplace le contenu par défaut (visa) par le sujet choisi.
  if (lead.infosCategorie === 'custom' && lead.infosCustom) {
    Object.assign(config.sections.infos, {
      title:    lead.infosCustom.title || config.sections.infos.title,
      subtitle: lead.infosCustom.subtitle || '',
      body:     lead.infosCustom.body || '',
      ctaText:  lead.infosCustom.ctaText || '',
      ctaUrl:   lead.infosCustom.ctaUrl || '',
    });
  } else if (INFOS_PRESETS[lead.infosCategorie]) {
    Object.assign(config.sections.infos, INFOS_PRESETS[lead.infosCategorie]);
  }

  return config;
}

// ─── Page d'erreur brandée (404/500 vues par de vrais invités) ──────────────
function pageErreur(titre, message){
  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<title>${titre} — MySaveTheDate</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@700;800&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box}
body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#f0f5ff;font-family:'Inter',sans-serif;color:#0d1f3c;padding:20px}
.carte{background:#fff;border-top:4px solid #2563eb;box-shadow:0 20px 60px rgba(13,31,60,.12);padding:52px 44px;max-width:440px;width:100%;text-align:center}
.logo{font-family:'Montserrat',sans-serif;font-weight:800;font-size:18px;letter-spacing:.06em;text-transform:uppercase;margin-bottom:28px}
.logo em{color:#2563eb;font-style:normal;font-weight:400}
h1{font-family:'Montserrat',sans-serif;font-size:20px;font-weight:800;margin:0 0 14px}
p{font-size:14px;line-height:1.6;color:#1e3a8a;margin:0 0 28px}
a.btn{display:inline-block;background:#0d1f3c;color:#fff;text-decoration:none;padding:13px 28px;font-family:'Montserrat',sans-serif;font-size:10px;font-weight:700;letter-spacing:.2em;text-transform:uppercase;border-radius:4px}
a.btn:hover{background:#2563eb}
</style>
</head>
<body>
  <div class="carte">
    <div class="logo">MySaveThe<em>Date</em></div>
    <h1>${titre}</h1>
    <p>${message}</p>
    <a class="btn" href="https://mysavethedate.com">Retour à l'accueil</a>
  </div>
</body>
</html>`;
}

// ─── Subdomain detection ────────────────────────────────────────────────────
function getSubdomain(req) {
  const host = req.hostname||'';
  const parts = host.split('.');
  if (parts.length >= 3) return parts[0];
  return null;
}

// ─── Dokploy — enregistrement automatique du sous-domaine ──────────────────
// Chaque client a son propre sous-domaine (ex: dupont.mysavethedate.com). Un
// certificat wildcard nécessiterait une validation DNS que notre hébergeur DNS
// ne permet pas d'automatiser dans Dokploy — à la place, on enregistre un
// domaine "classique" (validation HTTP, Let's Encrypt) par sous-domaine via
// l'API Dokploy, dès qu'un site devient actif. C'est exactement l'action
// qu'on ferait à la main dans Dokploy → Domains → Add Domain.
const DOKPLOY_API_URL   = process.env.DOKPLOY_API_URL   || '';
const DOKPLOY_API_KEY   = process.env.DOKPLOY_API_KEY   || '';
const DOKPLOY_APP_ID    = process.env.DOKPLOY_APP_ID    || '';
const DOKPLOY_SERVER_IP = process.env.DOKPLOY_SERVER_IP || '';

async function creerDomaineDokploy(subdomain) {
  if (!DOKPLOY_API_URL || !DOKPLOY_API_KEY || !DOKPLOY_APP_ID) {
    console.warn('⚠️  DOKPLOY_API_URL / DOKPLOY_API_KEY / DOKPLOY_APP_ID manquants — sous-domaine non enregistré automatiquement dans Dokploy.');
    return;
  }
  const host = `${subdomain}.mysavethedate.com`;
  const r = await fetch(`${DOKPLOY_API_URL}/domain.create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': DOKPLOY_API_KEY },
    body: JSON.stringify({
      host,
      path: '/',
      port: 3000,
      https: true,
      certificateType: 'letsencrypt',
      applicationId: DOKPLOY_APP_ID,
      domainType: 'application',
    }),
  });
  if (!r.ok) {
    const detail = await r.text().catch(() => '');
    throw new Error(`Dokploy domain.create a échoué (${r.status}) : ${detail}`);
  }

  // domain.create ne fait qu'enregistrer l'entrée : sans cette étape, Traefik
  // ne route rien et ne demande pas le certificat tant qu'un humain n'a pas
  // cliqué "Validate" à la main dans Dokploy (constaté en testant).
  if (!DOKPLOY_SERVER_IP) {
    console.warn('⚠️  DOKPLOY_SERVER_IP manquant — validation Let\'s Encrypt non déclenchée automatiquement pour ' + host + '.');
    return;
  }
  const rv = await fetch(`${DOKPLOY_API_URL}/domain.validateDomain`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': DOKPLOY_API_KEY },
    body: JSON.stringify({ domain: host, serverIp: DOKPLOY_SERVER_IP }),
  });
  if (!rv.ok) {
    const detail = await rv.text().catch(() => '');
    throw new Error(`Dokploy domain.validateDomain a échoué (${rv.status}) : ${detail}`);
  }
}

// ─── Serve vitrine (site vitrine — page d'accueil publique) ─────────────────
app.use('/vitrine', express.static(path.join(__dirname,'..','vitrine')));
app.get(['/','/?'], (req,res,next) => {
  const sub = getSubdomain(req);
  if (!sub || sub === 'www') res.sendFile(path.join(__dirname,'..','vitrine','index.html'));
  else next(); // sous-domaine client : laisse la route générale plus bas afficher son site
});

// ─── Serve admin (HTML public — auth gérée côté client JS) ──────────────────
// /admin = tableau de bord BOSS (vue d'ensemble clients/prospects/stats).
// /admin/editeur = l'éditeur de sites (création/modification d'un faire-part).
app.use('/admin', express.static(path.join(__dirname,'..','admin')));
app.get(['/admin','/admin/'], (req,res) => {
  res.sendFile(path.join(__dirname,'..','admin','index.html'));
});
app.get(['/admin/editeur','/admin/editeur/'], (req,res) => {
  res.sendFile(path.join(__dirname,'..','admin','editeur.html'));
});
// Ancienne URL du tableau de bord, conservée pour ne pas casser un lien existant.
app.get(['/admin/dashboard','/admin/dashboard/'], (req,res) => res.redirect('/admin/'));

// ─── Serve espace (espace client — connexion + éditeur self-service) ────────
app.use('/espace', express.static(path.join(__dirname,'..','espace')));
app.get(['/espace','/espace/'], (req,res) => {
  res.sendFile(path.join(__dirname,'..','espace','index.html'));
});
// Petit fichier de config généré à la volée, pour donner au navigateur
// l'URL Supabase et la clé publique "anon" (conçue pour être publique —
// seule la clé "service_role" doit rester secrète, côté serveur).
app.get('/espace/config.js', (req,res) => {
  res.type('application/javascript').send(
    `window.SUPABASE_URL=${JSON.stringify(process.env.SUPABASE_URL||'')};` +
    `window.SUPABASE_ANON_KEY=${JSON.stringify(SUPABASE_ANON_KEY)};`
  );
});

// ─── Connexion Google — callback OAuth fait maison ──────────────────────────
// Étape 1 : on redirige nous-mêmes vers Google (au lieu d'utiliser le flux
// OAuth intégré de Supabase), avec notre propre redirect_uri sur ce domaine.
// Un nonce anti-CSRF est stocké dans un cookie httpOnly de courte durée, et
// les paramètres à préserver (?revendiquer=...&next=...) voyagent dans
// "state", que Google nous renverra tel quel à l'étape 2.
app.get('/api/auth/google/start', (req,res) => {
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
    return res.redirect('/espace/?googleError=' + encodeURIComponent('Connexion Google non configurée sur le serveur.'));
  }
  const redirectUri = `${req.protocol}://${req.get('host')}/api/auth/google/callback`;
  const csrf = crypto.randomBytes(16).toString('hex');
  const state = Buffer.from(JSON.stringify({ csrf, qs: req.query.qs || '' })).toString('base64url');
  res.cookie('msd_google_state', csrf, { httpOnly:true, secure:req.secure, sameSite:'lax', maxAge:5*60*1000 });
  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    state,
    prompt: 'select_account',
  });
  res.redirect('https://accounts.google.com/o/oauth2/v2/auth?' + params.toString());
});

// Étape 2 : Google renvoie ici avec un code d'autorisation. On l'échange
// nous-mêmes contre un id_token (email vérifié par Google), on retrouve ou
// crée le compte Supabase correspondant, puis on génère un lien "magiclink"
// (via l'API admin, jamais envoyé par email) dont le jeton sert de pont pour
// établir une vraie session côté navigateur via supabase-js.verifyOtp().
app.get('/api/auth/google/callback', async (req,res) => {
  try {
    const { code, state } = req.query;
    if (!code || !state) throw new Error('Réponse Google incomplète');
    let decoded;
    try { decoded = JSON.parse(Buffer.from(String(state), 'base64url').toString()); }
    catch(_) { throw new Error('Paramètre state invalide'); }

    const csrfCookie = lireCookie(req, 'msd_google_state');
    if (!csrfCookie || csrfCookie !== decoded.csrf) throw new Error('Session expirée, merci de réessayer.');
    res.clearCookie('msd_google_state');

    const redirectUri = `${req.protocol}://${req.get('host')}/api/auth/google/callback`;
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code, client_id: GOOGLE_CLIENT_ID, client_secret: GOOGLE_CLIENT_SECRET,
        redirect_uri: redirectUri, grant_type: 'authorization_code',
      }),
    });
    const tokenData = await tokenRes.json();
    if (!tokenRes.ok || !tokenData.id_token) throw new Error(tokenData.error_description || 'Échange du code Google échoué');

    const payload = JSON.parse(Buffer.from(tokenData.id_token.split('.')[1], 'base64').toString());
    if (!payload.email || !payload.email_verified) throw new Error('Email Google non vérifié');
    const email = payload.email;

    const comptes = await listerTousLesComptes();
    let userId = comptes.find(u => u.email === email)?.id;
    if (!userId) {
      const { data:created, error:createErr } = await supabase.auth.admin.createUser({
        email, email_confirm: true, password: crypto.randomBytes(24).toString('hex'),
        user_metadata: { fullName: payload.name||'', provider: 'google' },
      });
      if (createErr) throw createErr;
      userId = created.user.id;
    }

    const { data:lienData, error:lienErr } = await supabase.auth.admin.generateLink({ type:'magiclink', email });
    if (lienErr) throw lienErr;
    const jeton = lienData.properties.hashed_token;

    const qs = decoded.qs ? decodeURIComponent(decoded.qs) : '';
    res.redirect(`/espace/${qs}${qs ? '&' : '?'}googleToken=${encodeURIComponent(jeton)}&googleEmail=${encodeURIComponent(email)}`);
  } catch(err) {
    res.redirect('/espace/?googleError=' + encodeURIComponent(err.message));
  }
});

// ─── Static assets (shared) ──────────────────────────────────────────────────
app.use('/assets', express.static(path.join(__dirname,'..','public','assets')));
app.use('/legal', express.static(path.join(__dirname,'..','public','legal')));

// ─── SEO : robots.txt / sitemap.xml ─────────────────────────────────────────
// Le domaine principal (vitrine) doit être indexé, mais surtout pas les
// sous-domaines clients : ce sont des faire-part privés (données d'invités,
// RSVP...), pas du contenu marketing, et les indexer créerait en plus une
// masse de pages quasi-identiques (mauvais pour le référencement de tous).
app.get('/robots.txt', (req,res) => {
  const sub = getSubdomain(req);
  res.type('text/plain');
  if (!sub || sub === 'www') {
    res.send('User-agent: *\nAllow: /\nDisallow: /espace/\nDisallow: /admin/\nSitemap: https://mysavethedate.com/sitemap.xml');
  } else {
    res.send('User-agent: *\nDisallow: /');
  }
});

// N'affiche que les articles dont la date de publication est passée : on
// peut ainsi écrire des articles à l'avance sans tout publier d'un coup
// (une croissance de contenu trop soudaine est un mauvais signal pour Google).
function articlesPublies(){
  const maintenant = Date.now();
  return POSTS
    .filter(p => new Date(p.publishDate + 'T00:00:00').getTime() <= maintenant)
    .sort((a,b) => new Date(b.publishDate) - new Date(a.publishDate));
}

app.get('/blog', (req,res) => {
  res.send(renderIndexPage(articlesPublies()));
});

app.get('/blog/:slug', (req,res) => {
  const post = articlesPublies().find(p => p.slug === req.params.slug);
  if (!post) return res.status(404).send(pageErreur('Article introuvable', "Cet article n'existe pas ou n'est plus disponible."));
  const articlesLies = articlesPublies().filter(p => p.category === post.category && p.slug !== post.slug).slice(0,3);
  res.send(renderPostPage(post, articlesLies));
});

// Vue d'ensemble du calendrier éditorial pour l'admin : publiés, écrits mais
// pas encore publiés (date future), et sujets pas encore rédigés.
app.get('/api/admin/blog', requireAdmin, (req,res) => {
  const maintenant = Date.now();
  const estPublie = p => new Date(p.publishDate + 'T00:00:00').getTime() <= maintenant;
  const tri = (a,b) => new Date(a.publishDate) - new Date(b.publishDate);
  res.json({
    publies:    POSTS.filter(estPublie).sort(tri).reverse().map(p => ({ slug:p.slug, title:p.title, category:p.category, keyword:p.keyword, publishDate:p.publishDate, url:`/blog/${p.slug}` })),
    programmes: POSTS.filter(p => !estPublie(p)).sort(tri).map(p => ({ title:p.title, category:p.category, keyword:p.keyword, publishDate:p.publishDate })),
    aRediger:   ARTICLES_A_REDIGER,
    total: POSTS.length + ARTICLES_A_REDIGER.length,
  });
});

app.get('/sitemap.xml', (req,res) => {
  const sub = getSubdomain(req);
  if (sub && sub !== 'www') return res.status(404).end();
  const urls = [
    { loc:'https://mysavethedate.com/', priority:'1.0' },
    { loc:'https://mysavethedate.com/blog', priority:'0.7' },
    { loc:'https://mysavethedate.com/legal/mentions-legales.html', priority:'0.3' },
    { loc:'https://mysavethedate.com/legal/cgu.html', priority:'0.3' },
    { loc:'https://mysavethedate.com/legal/confidentialite.html', priority:'0.3' },
    ...articlesPublies().map(p => ({ loc:`https://mysavethedate.com/blog/${p.slug}`, priority:'0.6' })),
  ];
  res.type('application/xml').send(
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    urls.map(u => `  <url><loc>${u.loc}</loc><priority>${u.priority}</priority></url>`).join('\n') +
    `\n</urlset>`
  );
});

// ─── Upload pages (contextuelles au sous-domaine) ───────────────────────────
app.get('/upload', async (req,res) => {
  const sub = getSubdomain(req);
  const { data:site } = await supabase.from('msd_sites').select('id,config,active').eq('subdomain', sub).single();
  if (!site || !site.active) return res.status(404).send(pageErreur('Site introuvable', "Ce faire-part n'existe pas ou n'est pas encore accessible."));
  const cfg = mergeConfig(site.config);
  res.sendFile(path.join(__dirname,'..','public','upload.html'));
});

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN API — Sites
// ─────────────────────────────────────────────────────────────────────────────

// List all sites
app.get('/api/admin/sites', requireAdmin, async (req,res) => {
  const { data,error } = await supabase.from('msd_sites').select('id,subdomain,template,active,created_at,config').order('created_at',{ascending:false});
  if(error) return res.status(500).json({error:error.message});
  res.json(data);
});

// Get single site
app.get('/api/admin/sites/:id', requireAdmin, async (req,res) => {
  const { data,error } = await supabase.from('msd_sites').select('*').eq('id',req.params.id).single();
  if(error) return res.status(500).json({error:error.message});
  res.json(data);
});

// Create site
app.post('/api/admin/sites', requireAdmin, async (req,res) => {
  const { subdomain, template='bar-mitsva', config={} } = req.body;
  if(!subdomain) return res.status(400).json({error:'subdomain requis'});
  const fullConfig = mergeConfig(config);
  const { data,error } = await supabase.from('msd_sites').insert({ subdomain, template, config: fullConfig, active: true }).select().single();
  if(error) return res.status(500).json({error:error.message});
  creerDomaineDokploy(data.subdomain).catch(err => console.error('Dokploy domain.create échoué:', err.message));
  res.json(data);
});

// Update site config
app.put('/api/admin/sites/:id', requireAdmin, async (req,res) => {
  const { config, active, subdomain } = req.body;
  const { data:avant } = await supabase.from('msd_sites').select('subdomain,active').eq('id',req.params.id).single();
  const updates = {};
  if(config!==undefined) updates.config = config;
  if(active!==undefined) updates.active = active;
  if(subdomain!==undefined) updates.subdomain = subdomain;
  const { data,error } = await supabase.from('msd_sites').update(updates).eq('id',req.params.id).select().single();
  if(error) return res.status(500).json({error:error.message});
  if(data.active && (data.subdomain!==avant?.subdomain || !avant?.active)) {
    creerDomaineDokploy(data.subdomain).catch(err => console.error('Dokploy domain.create échoué:', err.message));
  }
  res.json(data);
});

// Delete site
app.delete('/api/admin/sites/:id', requireAdmin, async (req,res) => {
  const { error } = await supabase.from('msd_sites').delete().eq('id',req.params.id);
  if(error) return res.status(500).json({error:error.message});
  res.json({success:true});
});

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN API — Dashboard BOSS (clients, prospects, stats globales)
// Page dédiée (admin/dashboard.html), indépendante de l'éditeur de sites
// ci-dessus : routes en lecture seule + une action de suppression de compte.
// ─────────────────────────────────────────────────────────────────────────────

// Récupère tous les comptes Supabase Auth (l'API admin pagine par lots).
async function listerTousLesComptes(){
  let page = 1, tous = [];
  while(true){
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage:1000 });
    if(error) throw error;
    tous = tous.concat(data.users);
    if(data.users.length < 1000) break;
    page += 1;
  }
  return tous;
}

app.get('/api/admin/dashboard', requireAdmin, async (req,res) => {
  try {
    const [comptes, sitesRes, leadsRes, rsvpRes, videosRes, murRes] = await Promise.all([
      listerTousLesComptes(),
      supabase.from('msd_sites').select('id,subdomain,template,active,config,user_id,created_at').order('created_at',{ascending:false}),
      supabase.from('msd_leads').select('*').order('created_at',{ascending:false}),
      supabase.from('msd_rsvp').select('id,site_id'),
      supabase.from('msd_videos').select('id,site_id'),
      supabase.from('msd_mur_medias').select('id,site_id'),
    ]);
    if (sitesRes.error) throw sitesRes.error;
    if (leadsRes.error) throw leadsRes.error;

    const sites  = sitesRes.data||[];
    const leads  = leadsRes.data||[];
    const rsvp   = rsvpRes.data||[];
    const videos = videosRes.data||[];
    const mur    = murRes.data||[];

    // Nombre de lignes par site_id (RSVP / vidéos / mur), pour éviter le
    // N+1 (une requête par site) sur des tables qui restent petites.
    const compterParSite = (lignes) => lignes.reduce((acc,l)=>{ acc[l.site_id]=(acc[l.site_id]||0)+1; return acc; },{});
    const nbRsvp   = compterParSite(rsvp);
    const nbVideos = compterParSite(videos);
    const nbMur    = compterParSite(mur);

    // Retrouve le lead d'origine d'un site (téléphone, budget…), utile car
    // ces infos ne sont pas stockées dans msd_sites lui-même.
    const leadParSite = {};
    leads.forEach(l => { if(l.site_id) leadParSite[l.site_id] = l; });

    const sitesEnrichis = sites.map(s => ({
      id: s.id, subdomain: s.subdomain, template: s.template, active: s.active,
      createdAt: s.created_at, userId: s.user_id,
      firstName: s.config?.identity?.firstName||'', lastName: s.config?.identity?.lastName||'',
      eventType: s.config?.identity?.eventType||'',
      rsvpCount: nbRsvp[s.id]||0, videosCount: nbVideos[s.id]||0, murCount: nbMur[s.id]||0,
      leadPhone: leadParSite[s.id]?.phone||'', leadBudget: leadParSite[s.id]?.budget||'',
    }));

    // Un compte peut avoir plusieurs faire-part.
    const sitesParUser = {};
    sitesEnrichis.forEach(s => { if(s.userId){ (sitesParUser[s.userId] = sitesParUser[s.userId]||[]).push(s); } });

    const clients = comptes.map(u => ({
      userId: u.id, email: u.email, createdAt: u.created_at,
      firstName: u.user_metadata?.firstName||'', lastName: u.user_metadata?.lastName||'',
      sites: sitesParUser[u.id]||[],
    }));

    const sitesOrphelins = sitesEnrichis.filter(s => !s.userId);

    const stats = {
      totalComptes: comptes.length,
      totalSites: sites.length,
      sitesActifs: sites.filter(s=>s.active).length,
      sitesInactifs: sites.filter(s=>!s.active).length,
      totalLeads: leads.length,
      totalRsvp: rsvp.length,
      totalVideos: videos.length,
      totalMur: mur.length,
      revenuEstime: sites.filter(s=>s.active && s.user_id).length * PRIX_PARTAGE_EUROS,
    };

    res.json({ stats, clients, sitesOrphelins, leads });
  } catch(err) {
    res.status(500).json({ error: err.message });
  }
});

// Supprime un compte client (Supabase Auth). Ses sites ne sont pas
// supprimés : ils deviennent orphelins (user_id repasse à NULL, cf.
// ON DELETE SET NULL dans supabase-setup.sql).
app.delete('/api/admin/dashboard/comptes/:userId', requireAdmin, async (req,res) => {
  const { error } = await supabase.auth.admin.deleteUser(req.params.userId);
  if(error) return res.status(500).json({error:error.message});
  res.json({success:true});
});

// ─────────────────────────────────────────────────────────────────────────────
// ESPACE CLIENT — API scopée au compte connecté (Supabase Auth)
// ─────────────────────────────────────────────────────────────────────────────

// Tous les faire-part du compte connecté (un client peut en avoir plusieurs),
// avec le nombre de réponses RSVP par site pour l'affichage du tableau de bord.
app.get('/api/mon-compte/sites', requireClientAuth, async (req,res) => {
  const { data: sites, error } = await supabase.from('msd_sites').select('*')
    .eq('user_id', req.clientUser.id).order('created_at',{ascending:false});
  if(error) return res.status(500).json({error:error.message});
  if(!sites.length) return res.json([]);
  const { data: rsvp } = await supabase.from('msd_rsvp').select('site_id').in('site_id', sites.map(s=>s.id));
  const compteur = {};
  (rsvp||[]).forEach(r => { compteur[r.site_id] = (compteur[r.site_id]||0)+1; });
  res.json(sites.map(s => ({ ...s, rsvpCount: compteur[s.id]||0 })));
});

// Création d'un nouveau faire-part pour le compte connecté, à partir des
// réponses du questionnaire (vitrine). Contrairement à /api/lead, on est
// déjà authentifié ici : pas besoin de créer de compte ni de lien de
// récupération, le site est directement rattaché à l'utilisateur connecté.
// ─────────────────────────────────────────────────────────────────────────────
// APERÇU PUBLIC — questionnaire → faire-part généré, sans compte
// ─────────────────────────────────────────────────────────────────────────────
// Le visiteur remplit le questionnaire sur la vitrine sans se connecter : on
// génère tout de suite un vrai aperçu de son faire-part. Le compte n'est
// demandé qu'ensuite, s'il veut le personnaliser ou le partager (voir
// /api/mon-compte/site/:id/revendiquer plus bas).
app.post('/api/apercu', limiterPublic, async (req,res) => {
  const lead = req.body || {};
  try {
    let leadId = null;
    try {
      const { data:leadRow } = await supabase.from('msd_leads').insert({
        event_type: lead.eventType, event_date: lead.date, event_location: lead.location,
        guests: parseInt(lead.guests)||0, style: lead.style, budget: lead.budget,
        first_name: lead.firstName, last_name: lead.lastName,
        email: lead.email, phone: lead.phone,
      }).select().single();
      leadId = leadRow?.id || null;
    } catch(_) { /* table optionnelle */ }

    const sujetPourDomaine = nomsSujetPourSousDomaine(lead);
    const subdomain = await genererSousDomaineUnique(sujetPourDomaine.prenom, sujetPourDomaine.nom);
    const config = construireConfigParDefaut(lead);

    const { data:site, error:siteErr } = await supabase.from('msd_sites')
      .insert({ subdomain, template:'bar-mitsva', config, active:false, user_id:null })
      .select().single();
    if (siteErr) throw siteErr;

    if (leadId) await supabase.from('msd_leads').update({ site_id:site.id }).eq('id', leadId);

    res.json({ id: site.id });
  } catch(err) {
    res.status(500).json({ error: err.message });
  }
});

// Musique choisie dans le questionnaire (juste après /api/apercu, donc pas
// encore de compte à ce stade) : upload public, mais limité au site qui
// vient d'être créé (identifié par son UUID aléatoire, même principe que
// l'upload public du mur de photos).
app.post('/api/apercu/:id/musique', limiterPublic, upload.single('file'), async (req,res) => {
  const tmpPath = req.file?.path;
  try {
    const { data:site } = await supabase.from('msd_sites').select('id,config').eq('id',req.params.id).single();
    if (!site) return res.status(404).json({error:'Site introuvable'});
    if (!req.file) return res.status(400).json({error:'Aucun fichier'});
    const ext = path.extname(req.file.originalname).toLowerCase() || '.mp3';
    const nomFichier = `${site.id}/musique-questionnaire-${Date.now()}${ext}`;
    const buffer = fs.readFileSync(tmpPath);
    const { error:upErr } = await supabase.storage.from(BUCKET_MEDIA).upload(nomFichier, buffer, { contentType: req.file.mimetype, upsert:true });
    if (upErr) throw upErr;
    const { data:urlData } = supabase.storage.from(BUCKET_MEDIA).getPublicUrl(nomFichier);
    const cfg = mergeConfig(site.config);
    cfg.musicMode = 'general';
    cfg.music[0] = { url: urlData.publicUrl, startAt:0, loopFrom:0, pages:[], label:'Piste principale' };
    await supabase.from('msd_sites').update({ config: cfg }).eq('id', site.id);
    res.json({ success:true, url: urlData.publicUrl });
  } catch(err) {
    res.status(500).json({ error: err.message });
  } finally {
    if (tmpPath && fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
  }
});

// Revendication d'un faire-part créé anonymement : dès que le visiteur se
// connecte (ou crée son compte) depuis la page d'aperçu, on rattache le
// site à son compte — seulement s'il n'appartient encore à personne.
app.post('/api/mon-compte/site/:id/revendiquer', requireClientAuth, async (req,res) => {
  const { data:site, error:findErr } = await supabase.from('msd_sites').select('id,user_id').eq('id',req.params.id).single();
  if (findErr || !site) return res.status(404).json({error:'Faire-part introuvable'});
  if (site.user_id && site.user_id !== req.clientUser.id) return res.status(403).json({error:'Ce faire-part appartient déjà à quelqu\'un d\'autre'});

  const { data, error } = await supabase.from('msd_sites').update({ user_id:req.clientUser.id }).eq('id',req.params.id).select().single();
  if (error) return res.status(500).json({error:error.message});
  res.json(data);
});

app.post('/api/mon-compte/sites', requireClientAuth, async (req,res) => {
  const lead = req.body || {};
  try {
    // Sauvegarde optionnelle en base pour vos statistiques (best-effort)
    let leadId = null;
    try {
      const { data:leadRow } = await supabase.from('msd_leads').insert({
        event_type: lead.eventType, event_date: lead.date, event_location: lead.location,
        guests: parseInt(lead.guests)||0, style: lead.style, budget: lead.budget,
        first_name: lead.firstName, last_name: lead.lastName,
        email: req.clientUser.email, phone: lead.phone,
        rdv_date: lead.rdvDay, rdv_time: lead.rdvTime, rdv_formatted: lead.rdvFormatted,
      }).select().single();
      leadId = leadRow?.id || null;
    } catch(_) { /* table optionnelle */ }

    const sujetPourDomaine = nomsSujetPourSousDomaine(lead);
    const subdomain = await genererSousDomaineUnique(sujetPourDomaine.prenom, sujetPourDomaine.nom);
    const config = construireConfigParDefaut(lead);

    const { data:site, error:siteErr } = await supabase.from('msd_sites')
      // Créé inactif : le faire-part est visible par son créateur dans son
      // espace, mais pas encore accessible aux invités tant qu'il n'a pas
      // débloqué le partage (voir /api/mon-compte/site/:id/payer).
      .insert({ subdomain, template:'bar-mitsva', config, active:false, user_id:req.clientUser.id })
      .select().single();
    if (siteErr) throw siteErr;

    if (leadId) await supabase.from('msd_leads').update({ site_id:site.id }).eq('id', leadId);

    res.json(site);
  } catch(err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/mon-compte/site/:id', requireClientAuth, chargerSiteDuClient, async (req,res) => {
  const { config, active, subdomain } = req.body;
  const updates = {};
  if(config!==undefined) updates.config = config;
  if(active!==undefined) updates.active = active;
  if(subdomain!==undefined) updates.subdomain = subdomain;
  const { data, error } = await supabase.from('msd_sites').update(updates).eq('id',req.params.id).select().single();
  if(error) return res.status(500).json({error:error.message});
  if(data.active && (data.subdomain!==req.site.subdomain || !req.site.active)) {
    creerDomaineDokploy(data.subdomain).catch(err => console.error('Dokploy domain.create échoué:', err.message));
  }
  res.json(data);
});

// Paiement réel via Stripe Checkout. Le site n'est activé (ou le mur débloqué)
// que par le webhook /api/stripe/webhook une fois le paiement confirmé par
// Stripe — jamais directement ici, pour ne pas se fier à un simple retour
// navigateur (l'utilisateur pourrait fermer l'onglet, ou trafiquer l'URL).
//
// 3 formules, dimensionnées sur le nombre d'invités attendus (plus l'événement
// est grand, plus il y aura de réponses/vidéos/photos à gérer) :
const PLANS = {
  essentiel: { id:'essentiel', label:'Essentiel', subtitle:'Petit événement',  prix:30,  includedInvites:30,  videoEnabled:false, murIncluded:false },
  populaire: { id:'populaire', label:'Populaire', subtitle:'Bar / Bat Mitsva', prix:120, includedInvites:200, videoEnabled:true,  murIncluded:false },
  premium:   { id:'premium',   label:'Premium',   subtitle:'Mariage',         prix:220, includedInvites:400, videoEnabled:true,  murIncluded:true  },
};

app.get('/api/mon-compte/tarif', requireClientAuth, (req,res) => {
  res.json({ plans: Object.values(PLANS) });
});

app.post('/api/mon-compte/site/:id/payer', requireClientAuth, chargerSiteDuClient, async (req,res) => {
  if (!stripe) return res.status(500).json({error:'Paiement non configuré sur le serveur (STRIPE_SECRET_KEY manquant).'});
  const plan = PLANS[req.body?.planId];
  if (!plan) return res.status(400).json({error:'Formule invalide.'});
  try {
    const origine = `${req.protocol}://${req.get('host')}`;
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      customer_email: req.clientUser.email,
      line_items: [{
        price_data: {
          currency: 'eur',
          product_data: { name: `MySaveTheDate — Formule ${plan.label}`, description: `Faire-part : ${req.site.subdomain}.mysavethedate.com — jusqu'à ${plan.includedInvites} invités` },
          unit_amount: Math.round(plan.prix * 100),
        },
        quantity: 1,
      }],
      success_url: `${origine}/espace/?paiement=succes&site=${req.params.id}&kind=partage`,
      cancel_url: `${origine}/espace/?paiement=annule&site=${req.params.id}`,
      metadata: { siteId: req.params.id, kind: 'partage', planId: plan.id },
    });
    res.json({ url: session.url });
  } catch(err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Mur de photos (option payante, indépendante du forfait "partage") ──────
const PRIX_MUR_EUROS = 29.99;

app.get('/api/mon-compte/tarif-mur', requireClientAuth, (req,res) => {
  res.json({ prix: PRIX_MUR_EUROS });
});

app.post('/api/mon-compte/site/:id/acheter-mur', requireClientAuth, chargerSiteDuClient, async (req,res) => {
  if (!stripe) return res.status(500).json({error:'Paiement non configuré sur le serveur (STRIPE_SECRET_KEY manquant).'});
  try {
    const origine = `${req.protocol}://${req.get('host')}`;
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      customer_email: req.clientUser.email,
      line_items: [{
        price_data: {
          currency: 'eur',
          product_data: { name: 'MySaveTheDate — Mur de photos', description: `Faire-part : ${req.site.subdomain}.mysavethedate.com` },
          unit_amount: Math.round(PRIX_MUR_EUROS * 100),
        },
        quantity: 1,
      }],
      success_url: `${origine}/espace/?paiement=succes&site=${req.params.id}&kind=mur`,
      cancel_url: `${origine}/espace/?paiement=annule&site=${req.params.id}`,
      metadata: { siteId: req.params.id, kind: 'mur' },
    });
    res.json({ url: session.url });
  } catch(err) {
    res.status(500).json({ error: err.message });
  }
});

// Confirmation asynchrone du paiement par Stripe (source de vérité — jamais
// le simple retour navigateur sur success_url, qui peut être manqué ou
// falsifié). La signature garantit que la requête vient bien de Stripe.
app.post('/api/stripe/webhook', async (req,res) => {
  if (!stripe || !STRIPE_WEBHOOK_SECRET) return res.status(500).send('Webhook non configuré');
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.rawBody, req.headers['stripe-signature'], STRIPE_WEBHOOK_SECRET);
  } catch(err) {
    return res.status(400).send(`Signature invalide : ${err.message}`);
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const siteId = session.metadata?.siteId;
    const kind    = session.metadata?.kind;
    try {
      if (siteId && kind === 'partage') {
        const plan = PLANS[session.metadata?.planId];
        const { data:site } = await supabase.from('msd_sites').select('config').eq('id',siteId).single();
        if (site) {
          const cfg = mergeConfig(site.config);
          if (plan) {
            cfg.plan = { id:plan.id, includedInvites:plan.includedInvites, videoEnabled:plan.videoEnabled, murIncluded:plan.murIncluded, rsvpOverflowUnlocked:false };
            cfg.sections.video.enabled = plan.videoEnabled;
            if (plan.murIncluded) cfg.sections.mur.achete = true;
          }
          const { data } = await supabase.from('msd_sites').update({ active:true, config:cfg }).eq('id',siteId).select().single();
          if (data) creerDomaineDokploy(data.subdomain).catch(err => console.error('Dokploy domain.create échoué:', err.message));
        }
      } else if (siteId && kind === 'mur') {
        const { data:site } = await supabase.from('msd_sites').select('config').eq('id',siteId).single();
        if (site) {
          const cfg = mergeConfig(site.config);
          cfg.sections.mur.achete = true;
          await supabase.from('msd_sites').update({ config:cfg }).eq('id',siteId);
        }
      } else if (siteId && kind === 'rsvp_overflow') {
        const { data:site } = await supabase.from('msd_sites').select('config').eq('id',siteId).single();
        if (site) {
          const cfg = mergeConfig(site.config);
          if (!cfg.plan) cfg.plan = {};
          cfg.plan.rsvpOverflowUnlocked = true;
          await supabase.from('msd_sites').update({ config:cfg }).eq('id',siteId);
        }
      }
    } catch(err) {
      // Le plus critique à savoir en priorité : un client a payé mais son
      // site/mur/quota RSVP n'a pas été débloqué — capturé explicitement
      // plutôt que de compter sur le filet de sécurité générique.
      if (process.env.SENTRY_DSN) Sentry.captureException(err, { extra:{ siteId, kind } });
      console.error('Webhook Stripe : échec de mise à jour du site', siteId, err.message);
      return res.status(500).send('Erreur interne');
    }
  }

  res.json({ received:true });
});

// Prix du déblocage des réponses au-delà du quota inclus dans la formule :
// un forfait de base + un montant par réponse excédentaire. Volontairement
// élevé (≥ au tarif/invité de la formule Essentiel, la plus chère au prorata) :
// dépasser son quota ne doit jamais revenir moins cher que d'avoir pris la
// formule du dessus dès le départ — sinon tout le monde prendrait Essentiel
// et paierait le supplément plutôt que d'upgrader.
const RSVP_SUPPLEMENT_BASE = 5;
const RSVP_SUPPLEMENT_PAR_REPONSE = 1.50;

app.get('/api/mon-compte/site/:id/rsvp', requireClientAuth, chargerSiteDuClient, async (req,res) => {
  const { data,error } = await supabase.from('msd_rsvp').select('*').eq('site_id',req.params.id).order('created_at',{ascending:false});
  if(error) return res.status(500).json({error:error.message});
  const cfg = mergeConfig(req.site.config);
  const quota = cfg.plan?.includedInvites || null;
  const verrouille = !!quota && !cfg.plan?.rsvpOverflowUnlocked && data.length > quota;
  res.json({
    rsvp: verrouille ? data.slice(0, quota) : data,
    total: data.length,
    quota,
    verrouille,
    supplement: verrouille ? Math.round((RSVP_SUPPLEMENT_BASE + (data.length - quota) * RSVP_SUPPLEMENT_PAR_REPONSE) * 100) / 100 : 0,
  });
});

// Débloque l'accès à toutes les réponses au-delà du quota (une fois payé,
// débloqué définitivement — y compris pour les réponses reçues après coup).
app.post('/api/mon-compte/site/:id/rsvp/debloquer', requireClientAuth, chargerSiteDuClient, async (req,res) => {
  if (!stripe) return res.status(500).json({error:'Paiement non configuré sur le serveur (STRIPE_SECRET_KEY manquant).'});
  try {
    const { count, error } = await supabase.from('msd_rsvp').select('id',{count:'exact',head:true}).eq('site_id',req.params.id);
    if (error) throw error;
    const cfg = mergeConfig(req.site.config);
    const quota = cfg.plan?.includedInvites || 0;
    const supplement = Math.round((RSVP_SUPPLEMENT_BASE + Math.max(0, (count||0) - quota) * RSVP_SUPPLEMENT_PAR_REPONSE) * 100) / 100;
    const origine = `${req.protocol}://${req.get('host')}`;
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      customer_email: req.clientUser.email,
      line_items: [{
        price_data: {
          currency: 'eur',
          product_data: { name: 'MySaveTheDate — Déblocage des réponses RSVP', description: `Faire-part : ${req.site.subdomain}.mysavethedate.com` },
          unit_amount: Math.round(supplement * 100),
        },
        quantity: 1,
      }],
      success_url: `${origine}/espace/?paiement=succes&site=${req.params.id}&kind=rsvp_overflow`,
      cancel_url: `${origine}/espace/?paiement=annule&site=${req.params.id}`,
      metadata: { siteId: req.params.id, kind: 'rsvp_overflow' },
    });
    res.json({ url: session.url });
  } catch(err) {
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// FAQ — base de connaissances du chatbot, éditable depuis l'admin
// ─────────────────────────────────────────────────────────────────────────────
app.get('/api/admin/faq', requireAdmin, async (req,res) => {
  const { data,error } = await supabase.from('msd_faq').select('*').order('ordre',{ascending:true});
  if(error) return res.status(500).json({error:error.message});
  res.json(data);
});

app.post('/api/admin/faq', requireAdmin, async (req,res) => {
  const { question, reponse, categorie='', ordre=0, active=true } = req.body||{};
  if(!question || !reponse) return res.status(400).json({error:'question et reponse requis'});
  const { data,error } = await supabase.from('msd_faq').insert({ question, reponse, categorie, ordre, active }).select().single();
  if(error) return res.status(500).json({error:error.message});
  faqCache.at = 0; // force le rechargement au prochain message du chatbot
  res.json(data);
});

app.put('/api/admin/faq/:id', requireAdmin, async (req,res) => {
  const { question, reponse, categorie, ordre, active } = req.body||{};
  const updates = {};
  if(question!==undefined)  updates.question  = question;
  if(reponse!==undefined)   updates.reponse   = reponse;
  if(categorie!==undefined) updates.categorie = categorie;
  if(ordre!==undefined)     updates.ordre     = ordre;
  if(active!==undefined)    updates.active    = active;
  const { data,error } = await supabase.from('msd_faq').update(updates).eq('id',req.params.id).select().single();
  if(error) return res.status(500).json({error:error.message});
  faqCache.at = 0;
  res.json(data);
});

app.delete('/api/admin/faq/:id', requireAdmin, async (req,res) => {
  const { error } = await supabase.from('msd_faq').delete().eq('id',req.params.id);
  if(error) return res.status(500).json({error:error.message});
  faqCache.at = 0;
  res.json({success:true});
});

// ─────────────────────────────────────────────────────────────────────────────
// CHATBOT — assistant client (OpenAI), accessible depuis /espace une fois connecté
// ─────────────────────────────────────────────────────────────────────────────
// Optionnel au démarrage (comme Stripe) : si absent, la route répond une
// erreur explicite plutôt que de faire planter tout le serveur.
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';

// Cache en mémoire (5 min) : évite une requête Supabase à chaque message du
// chatbot, tout en restant à jour peu de temps après une modification faite
// depuis l'admin (qui vide aussi le cache immédiatement, voir plus haut).
let faqCache = { data: null, at: 0 };
async function recupererFaqPourChatbot() {
  const maintenant = Date.now();
  if (faqCache.data && (maintenant - faqCache.at) < 5*60*1000) return faqCache.data;
  const { data } = await supabase.from('msd_faq').select('question,reponse').eq('active', true).order('ordre',{ascending:true});
  faqCache = { data: data||[], at: maintenant };
  return faqCache.data;
}

// Contexte donné au modèle pour qu'il réponde comme un conseiller client
// MySaveTheDate, sans halluciner de fonctionnalités qui n'existent pas.
const CHATBOT_SYSTEM_PROMPT = `Tu es l'assistant virtuel de MySaveTheDate, un service qui crée des faire-part digitaux (site web personnalisé) pour mariages, bar/bat mitsva, anniversaires, brit mila...
Réponds toujours en français, de façon chaleureuse, claire et concise (quelques phrases, pas de longs pavés).

Comment fonctionne le service :
- Le client répond à un questionnaire (type d'événement, date, lieu, style) et un faire-part est généré automatiquement sur un sous-domaine (ex: prenom-nom.mysavethedate.com).
- Il peut ensuite tout personnaliser depuis son "espace" (éditeur) : textes, couleurs, photos, musique, ordre des pages (faire-part, hommage, shabbat, informations complémentaires, vidéo, RSVP).
- Le faire-part reste privé/inactif tant que le client n'a pas choisi une formule payante pour le "partager" avec ses invités.
- Un code QR et un lien du faire-part en ligne sont disponibles une fois le faire-part publié.
- Connexion possible par email/mot de passe ou par "Continuer avec Google".

Les 3 formules (paiement unique, via Stripe) :
- Essentiel : 30€, jusqu'à 30 invités, sans vidéo, sans mur de photos.
- Populaire : 120€, jusqu'à 200 invités, avec vidéo.
- Premium : 220€, jusqu'à 400 invités, avec vidéo et mur de photos inclus.
- Si le nombre de réponses RSVP dépasse le quota inclus dans la formule, un supplément est proposé (5€ de base + 1,50€ par réponse au-delà du quota) pour débloquer l'accès à toutes les réponses.
- Le "mur de photos" (photos/vidéos envoyées par les invités) est disponible en option à 29,99€ pour les formules qui ne l'incluent pas déjà.

Consignes :
- Si tu ne connais pas la réponse à une question précise sur le compte du client (facture, bug technique précis, remboursement), invite-le poliment à contacter le support MySaveTheDate par email.
- N'invente jamais de fonctionnalité, de prix ou de délai qui n'est pas mentionné ci-dessus.
- Ne donne aucune information technique interne (base de données, clés API, code).`;

// Limite dédiée (indépendante de limiterPublic) : cette route appelle une API
// tierce facturée à l'usage, on protège donc le coût même pour un compte
// authentifié.
const limiterChatbot = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 40,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Trop de messages envoyés à l\'assistant, merci de patienter quelques minutes.' },
});

app.post('/api/mon-compte/chatbot', requireClientAuth, limiterChatbot, async (req,res) => {
  if (!OPENAI_API_KEY) return res.status(500).json({ error: "Assistant non configuré sur le serveur (OPENAI_API_KEY manquant)." });

  // On ne fait confiance qu'à la forme des messages envoyés par le client
  // (l'historique de conversation est géré côté navigateur, jamais stocké
  // en base) : rôle limité à user/assistant, contenu texte tronqué, et on
  // ne garde que les derniers échanges pour contenir le coût par requête.
  const messages = Array.isArray(req.body?.messages) ? req.body.messages : [];
  const historique = messages
    .filter(m => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
    .slice(-20)
    .map(m => ({ role: m.role, content: m.content.slice(0, 4000) }));
  if (!historique.length) return res.status(400).json({ error: 'Message manquant' });

  try {
    const faq = await recupererFaqPourChatbot();
    const blocFaq = faq.length
      ? '\n\nFAQ officielle MySaveTheDate (base-toi en priorité dessus pour répondre, reformule avec tes mots, ne la recopie pas telle quelle) :\n'
        + faq.map(f => `Q: ${f.question}\nR: ${f.reponse}`).join('\n\n')
      : '';

    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${OPENAI_API_KEY}` },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{ role: 'system', content: CHATBOT_SYSTEM_PROMPT + blocFaq }, ...historique],
        temperature: 0.4,
        max_tokens: 500,
      }),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error?.message || 'Erreur de l\'assistant OpenAI');
    const reply = data.choices?.[0]?.message?.content?.trim() || "Désolé, je n'ai pas de réponse à vous proposer pour le moment.";
    res.json({ reply });
  } catch(err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/mon-compte/site/:id/videos', requireClientAuth, chargerSiteDuClient, async (req,res) => {
  const { data,error } = await supabase.from('msd_videos').select('*').eq('site_id',req.params.id).order('created_at',{ascending:false});
  if(error) return res.status(500).json({error:error.message});
  res.json(data);
});

app.post('/api/mon-compte/upload-media', requireClientAuth, upload.single('file'), async (req,res) => {
  const tmpPath = req.file?.path;
  try {
    const { siteId, type='media' } = req.body;
    if(!siteId) return res.status(400).json({error:'siteId requis'});
    const { data:site } = await supabase.from('msd_sites').select('id,user_id').eq('id',siteId).single();
    if(!site || site.user_id!==req.clientUser.id) return res.status(403).json({error:'Ce site ne vous appartient pas'});
    if(!req.file) return res.status(400).json({error:'Aucun fichier'});
    const ext  = path.extname(req.file.originalname).toLowerCase()||'.bin';
    const name = `${siteId}/${type}-${Date.now()}${ext}`;
    const buf  = fs.readFileSync(tmpPath);
    const { error } = await supabase.storage.from(BUCKET_MEDIA).upload(name, buf, { contentType: req.file.mimetype, upsert: true });
    if(error) throw error;
    const { data:urlData } = supabase.storage.from(BUCKET_MEDIA).getPublicUrl(name);
    res.json({ success:true, url: urlData.publicUrl });
  } catch(err) {
    res.status(500).json({error:err.message});
  } finally {
    if(tmpPath&&fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN API — Upload media (logo, photos, musique)
// ─────────────────────────────────────────────────────────────────────────────
app.post('/api/admin/upload-media', requireAdmin, upload.single('file'), async (req,res) => {
  const tmpPath = req.file?.path;
  try {
    if(!req.file) return res.status(400).json({error:'Aucun fichier'});
    const { siteId='global', type='media' } = req.body;
    const ext  = path.extname(req.file.originalname).toLowerCase()||'.bin';
    const name = `${siteId}/${type}-${Date.now()}${ext}`;
    const buf  = fs.readFileSync(tmpPath);
    const { error } = await supabase.storage.from(BUCKET_MEDIA).upload(name, buf, { contentType: req.file.mimetype, upsert: true });
    if(error) throw error;
    const { data:urlData } = supabase.storage.from(BUCKET_MEDIA).getPublicUrl(name);
    res.json({ success:true, url: urlData.publicUrl });
  } catch(err) {
    res.status(500).json({error:err.message});
  } finally {
    if(tmpPath&&fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC API — RSVP
// ─────────────────────────────────────────────────────────────────────────────
app.post('/api/rsvp', limiterPublic, async (req,res) => {
  const sub = getSubdomain(req);
  try {
    const { data:site } = await supabase.from('msd_sites').select('id,config,active').eq('subdomain',sub).single();
    if(!site || !site.active) return res.status(404).json({error:'Site introuvable'});

    const body = req.body;
    const cfg  = mergeConfig(site.config);
    const rsvpEvents = cfg.sections?.rsvp?.events||[];

    const row = {
      site_id:  site.id,
      nom:      body.nom||'',
      prenom:   body.prenom||'',
      message:  body.message||'',
      data:     {}
    };
    rsvpEvents.forEach(ev => {
      row.data[ev.id] = {
        presence: body[`pres_${ev.id}`]||'non',
        adults:   parseInt(body[`adults_${ev.id}`])||0,
        children: parseInt(body[`children_${ev.id}`])||0
      };
    });

    const { error } = await supabase.from('msd_rsvp').insert(row);
    if(error) throw error;
    res.json({success:true});
  } catch(err) {
    res.status(500).json({error:err.message});
  }
});

// Get RSVP for a site (admin)
app.get('/api/admin/sites/:id/rsvp', requireAdmin, async (req,res) => {
  const { data,error } = await supabase.from('msd_rsvp').select('*').eq('site_id',req.params.id).order('created_at',{ascending:false});
  if(error) return res.status(500).json({error:error.message});
  res.json(data);
});

app.delete('/api/admin/rsvp/:id', requireAdmin, async (req,res) => {
  const { error } = await supabase.from('msd_rsvp').delete().eq('id',req.params.id);
  if(error) return res.status(500).json({error:error.message});
  res.json({success:true});
});

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC API — Video upload
// ─────────────────────────────────────────────────────────────────────────────
// Même règle d'activation que côté rendu (voir murEstActif dans render.js) :
// dupliquée ici volontairement pour éviter de changer la forme du module
// render.js, déjà utilisé tel quel à plusieurs endroits.
function murEstActif(cfg) {
  const m = cfg.sections?.mur;
  if (!m || !m.achete) return false;
  if (m.forceActif === true) return true;
  if (m.forceActif === false) return false;
  let seuil;
  if (m.activeLe) {
    seuil = new Date(m.activeLe).getTime();
  } else {
    const base = new Date(`${cfg.target?.date||'2026-01-01'}T00:00:00${cfg.target?.timezone||'+02:00'}`).getTime();
    seuil = base + 24*3600*1000;
  }
  return !isNaN(seuil) && Date.now() >= seuil;
}

app.post('/api/mur/:siteId/upload', limiterPublic, upload.single('file'), async (req,res) => {
  const tmpPath = req.file?.path;
  try {
    // Pas de vérification de site.active ici : le mur doit pouvoir être testé
    // depuis l'aperçu (/apercu/:id) avant même que le partage soit débloqué,
    // comme le reste de l'éditeur.
    const { data:site } = await supabase.from('msd_sites').select('id,config').eq('id',req.params.siteId).single();
    if(!site) return res.status(404).json({error:'Site introuvable'});
    if(!murEstActif(mergeConfig(site.config))) return res.status(403).json({error:'Le mur de photos n\'est pas encore ouvert'});
    if(!req.file) return res.status(400).json({error:'Aucun fichier'});
    const estVideo = req.file.mimetype.startsWith('video/');
    const ext = path.extname(req.file.originalname).toLowerCase() || (estVideo?'.mp4':'.jpg');
    const fileName = `${site.id}/${Date.now()}_${Math.random().toString(36).slice(2,8)}${ext}`;
    const bucket = estVideo ? BUCKET_VIDEO : BUCKET_MEDIA;
    const buffer = fs.readFileSync(tmpPath);
    const { error:upErr } = await supabase.storage.from(bucket).upload(fileName, buffer, { contentType: req.file.mimetype, upsert:false });
    if(upErr) throw upErr;
    const { data:urlData } = supabase.storage.from(bucket).getPublicUrl(fileName);
    await supabase.from('msd_mur_medias').insert({ site_id:site.id, type: estVideo?'video':'photo', url:urlData.publicUrl, file_name:fileName });
    res.json({ success:true, url:urlData.publicUrl, type: estVideo?'video':'photo' });
  } catch(err) {
    res.status(500).json({error:err.message});
  } finally {
    if(tmpPath&&fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
  }
});

app.get('/api/mur/:siteId/medias', async (req,res) => {
  const { data:site } = await supabase.from('msd_sites').select('id,config').eq('id',req.params.siteId).single();
  if(!site) return res.status(404).json({error:'Site introuvable'});
  if(!murEstActif(mergeConfig(site.config))) return res.json([]);
  const { data,error } = await supabase.from('msd_mur_medias').select('id,type,url,created_at').eq('site_id',req.params.siteId).order('created_at',{ascending:false});
  if(error) return res.status(500).json({error:error.message});
  res.json(data);
});

app.post('/api/upload', limiterPublic, upload.single('video'), async (req,res) => {
  const tmpPath = req.file?.path;
  const sub = getSubdomain(req);
  try {
    const { data:site } = await supabase.from('msd_sites').select('id,active,config').eq('subdomain',sub).single();
    if(!site || !site.active) return res.status(404).json({error:'Site introuvable'});
    // Le livre d'or vidéo dépend de la formule choisie (absent = site créé
    // hors du système de formules, ex. admin : pas de restriction dans ce cas).
    if (mergeConfig(site.config).sections?.video?.enabled === false) {
      return res.status(403).json({error:'Le livre d\'or vidéo n\'est pas inclus dans la formule de ce faire-part.'});
    }
    if(!req.file) return res.status(400).json({error:'Aucun fichier'});
    const { name='Anonyme', message='' } = req.body;
    const ext = path.extname(req.file.originalname).toLowerCase()||'.mp4';
    const fileName = `${site.id}/${Date.now()}_${name.replace(/[^a-z0-9]/gi,'_').slice(0,30)}${ext}`;
    const buffer = fs.readFileSync(tmpPath);
    const { error:upErr } = await supabase.storage.from(BUCKET_VIDEO).upload(fileName, buffer, { contentType: req.file.mimetype, upsert: false });
    if(upErr) throw upErr;
    const { data:urlData } = supabase.storage.from(BUCKET_VIDEO).getPublicUrl(fileName);
    await supabase.from('msd_videos').insert({ site_id:site.id, name, message, video_url:urlData.publicUrl, file_name:fileName });
    res.json({success:true, url:urlData.publicUrl});
  } catch(err) {
    res.status(500).json({error:err.message});
  } finally {
    if(tmpPath&&fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
  }
});

app.get('/api/admin/sites/:id/videos', requireAdmin, async (req,res) => {
  const { data,error } = await supabase.from('msd_videos').select('*').eq('site_id',req.params.id).order('created_at',{ascending:false});
  if(error) return res.status(500).json({error:error.message});
  res.json(data);
});

app.delete('/api/admin/videos/:id', requireAdmin, async (req,res) => {
  const { data:row } = await supabase.from('msd_videos').select('file_name').eq('id',req.params.id).single();
  if(row?.file_name) await supabase.storage.from(BUCKET_VIDEO).remove([row.file_name]);
  const { error } = await supabase.from('msd_videos').delete().eq('id',req.params.id);
  if(error) return res.status(500).json({error:error.message});
  res.json({success:true});
});

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC API — Lead / prise de contact vitrine
// ─────────────────────────────────────────────────────────────────────────────
app.post('/api/lead', limiterPublic, async (req,res) => {
  const lead = req.body;
  const ts   = new Date().toLocaleString('fr-FR', { timeZone:'Europe/Paris' });
  console.log(`\n📋 NOUVEAU PROSPECT [${ts}]`);
  console.log(`   Événement : ${lead.eventType} — ${lead.date} à ${lead.location}`);
  console.log(`   Contact   : ${lead.firstName} ${lead.lastName} | ${lead.email} | ${lead.phone}`);
  console.log(`   Invités   : ${lead.guests} | Style : ${lead.style} | Budget : ${lead.budget}`);
  console.log(`   RDV       : ${lead.rdvFormatted}\n`);

  let leadId = null;
  try {
    // Sauvegarde optionnelle en base si la table msd_leads existe
    const { data:leadRow } = await supabase.from('msd_leads').insert({
      event_type: lead.eventType, event_date: lead.date, event_location: lead.location,
      guests: parseInt(lead.guests)||0, style: lead.style, budget: lead.budget,
      first_name: lead.firstName, last_name: lead.lastName,
      email: lead.email, phone: lead.phone,
      rdv_date: lead.rdvDay, rdv_time: lead.rdvTime, rdv_formatted: lead.rdvFormatted
    }).select().single();
    leadId = leadRow?.id || null;
  } catch(_){ /* Table inexistante — log suffit */ }

  // ─── Génération automatique du compte client + du faire-part de base ────
  // On tente cette étape même si la sauvegarde du lead ci-dessus a échoué :
  // l'essentiel est que le prospect reparte avec un accès immédiat.
  let siteUrl = null, accessLink = null;
  try {
    if (!lead.email) throw new Error('Email manquant, impossible de créer le compte');

    const sujetPourDomaine = nomsSujetPourSousDomaine(lead);
    const subdomain = await genererSousDomaineUnique(sujetPourDomaine.prenom, sujetPourDomaine.nom);
    const config = construireConfigParDefaut(lead);

    const { data:site, error:siteErr } = await supabase.from('msd_sites')
      .insert({ subdomain, template:'bar-mitsva', config, active:true }).select().single();
    if (siteErr) throw siteErr;
    creerDomaineDokploy(subdomain).catch(err => console.error('Dokploy domain.create échoué:', err.message));

    // Compte Supabase Auth pour ce prospect (mot de passe aléatoire, jamais
    // communiqué : le client le définira lui-même via le lien ci-dessous).
    let userId = null;
    const { data:created, error:createErr } = await supabase.auth.admin.createUser({
      email: lead.email,
      email_confirm: true,
      password: crypto.randomBytes(24).toString('hex'),
      user_metadata: { firstName: lead.firstName, lastName: lead.lastName },
    });
    if (createErr) {
      // Prospect déjà connu (revient remplir le questionnaire une 2e fois) :
      // on récupère son compte existant plutôt que d'échouer.
      const { data:liste } = await supabase.auth.admin.listUsers({ perPage:200 });
      const existant = liste?.users?.find(u => u.email === lead.email);
      if (!existant) throw createErr;
      userId = existant.id;
    } else {
      userId = created.user.id;
    }

    await supabase.from('msd_sites').update({ user_id:userId }).eq('id', site.id);
    if (leadId) await supabase.from('msd_leads').update({ site_id:site.id }).eq('id', leadId);

    // Lien direct (sans dépendre de l'envoi d'un email) permettant au
    // prospect de définir son mot de passe et d'accéder immédiatement à son
    // espace, juste après avoir rempli le questionnaire.
    const origine = `${req.protocol}://${req.get('host')}/espace/`;
    const { data:lienData, error:lienErr } = await supabase.auth.admin.generateLink({
      type: 'recovery',
      email: lead.email,
      options: { redirectTo: origine },
    });
    if (!lienErr) accessLink = lienData.properties.action_link;

    siteUrl = `https://${subdomain}.mysavethedate.com`;
  } catch(err) {
    console.error('⚠️  Création automatique du compte/site échouée :', err.message);
  }

  res.json({ success:true, siteUrl, accessLink });
});

// Page d'aperçu public (juste après le questionnaire, avant tout compte) :
// affiche le vrai rendu du faire-part, quel que soit son statut, avec une
// petite barre d'outils "Personnaliser / Partager" ajoutée par-dessus.
app.get('/apercu/:id', async (req,res) => {
  try {
    const { data:site, error } = await supabase.from('msd_sites').select('*').eq('id',req.params.id).single();
    if (error || !site) return res.status(404).send(pageErreur('Aperçu introuvable', "Ce lien n'est plus valide."));
    const cfg = mergeConfig(site.config);
    const murMedias = murEstActif(cfg) ? (await supabase.from('msd_mur_medias').select('type,url').eq('site_id',site.id).order('created_at',{ascending:false})).data : [];
    const html = renderBarMitsva(cfg, site.id, murMedias);

    // Utilisé pour l'aperçu en direct dans l'éditeur (iframe) : pas besoin
    // de la barre d'outils Personnaliser/Partager dans ce contexte-là.
    if (req.query.embed) return res.send(html);

    const barreOutils = `
<style>.deck{margin-top:56px !important;height:calc(100vh - 56px) !important;}</style>
<div id="msd-preview-toolbar" style="position:fixed;top:0;left:0;right:0;height:56px;background:#0d1f3c;color:#fff;display:flex;align-items:center;justify-content:space-between;padding:0 20px;z-index:9999;font-family:'Inter',sans-serif;box-shadow:0 2px 10px rgba(0,0,0,.15)">
  <span style="font-family:'Montserrat',sans-serif;font-size:11px;font-weight:700;letter-spacing:.15em;text-transform:uppercase;opacity:.85">Aperçu de votre faire-part</span>
  <div style="display:flex;gap:10px">
    <button id="msd-btn-personnaliser" style="padding:9px 20px;border:1px solid rgba(255,255,255,.3);background:transparent;color:#fff;font-family:'Montserrat',sans-serif;font-size:10px;font-weight:700;letter-spacing:.2em;text-transform:uppercase;cursor:pointer;border-radius:4px">Personnaliser</button>
    <button id="msd-btn-partager" style="padding:9px 20px;border:none;background:#2563eb;color:#fff;font-family:'Montserrat',sans-serif;font-size:10px;font-weight:700;letter-spacing:.2em;text-transform:uppercase;cursor:pointer;border-radius:4px">Partager mon faire-part</button>
  </div>
</div>
<script>
  document.getElementById('msd-btn-personnaliser').addEventListener('click', function(){
    window.location.href = '/espace/?revendiquer=${site.id}&next=editeur';
  });
  document.getElementById('msd-btn-partager').addEventListener('click', function(){
    window.location.href = '/espace/?revendiquer=${site.id}&next=payer';
  });
</script>`;

    res.send(html.replace('</body>', barreOutils + '</body>'));
  } catch(err) {
    if (process.env.SENTRY_DSN) Sentry.captureException(err, { extra:{ siteId: req.params.id } });
    res.status(500).send(pageErreur('Erreur serveur', "Une erreur inattendue s'est produite. Merci de réessayer dans quelques instants."));
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Render site (catch-all — doit être EN DERNIER)
// ─────────────────────────────────────────────────────────────────────────────
app.get('*', async (req,res) => {
  const sub = getSubdomain(req);

  // Admin direct access ou sous-domaine "admin"
  if (!sub || sub === 'www' || sub === 'admin') {
    return res.sendFile(path.join(__dirname,'..','admin','index.html'));
  }

  try {
    const { data:site, error } = await supabase.from('msd_sites').select('*').eq('subdomain',sub).eq('active',true).single();
    if(error||!site) return res.status(404).send(pageErreur('Site introuvable', "Ce faire-part n'existe pas ou a été désactivé."));
    const cfg = mergeConfig(site.config);
    const murMedias = murEstActif(cfg) ? (await supabase.from('msd_mur_medias').select('type,url').eq('site_id',site.id).order('created_at',{ascending:false})).data : [];
    const html = renderBarMitsva(cfg, site.id, murMedias);
    res.send(html);
  } catch(err) {
    if (process.env.SENTRY_DSN) Sentry.captureException(err, { extra:{ subdomain: sub } });
    res.status(500).send(pageErreur('Erreur serveur', "Une erreur inattendue s'est produite. Merci de réessayer dans quelques instants."));
  }
});

// Filet de sécurité : capture toute erreur qui serait remontée à Express sans
// avoir été interceptée par un try/catch local (la plupart des routes ci-
// dessus gèrent déjà leurs erreurs elles-mêmes en renvoyant du JSON, mais
// mieux vaut être notifié aussi de celles qui nous auraient échappé).
if (process.env.SENTRY_DSN) Sentry.setupExpressErrorHandler(app);

app.listen(PORT, () => {
  console.log(`✅  MySaveTheDate Platform — port ${PORT}`);
  console.log(`   Admin → http://localhost:${PORT}/admin`);
});
