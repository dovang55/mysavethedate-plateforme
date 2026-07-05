require('dotenv').config();
const express = require('express');
const multer  = require('multer');
const cors    = require('cors');
const path    = require('path');
const fs      = require('fs');
const crypto  = require('crypto');
const ws      = require('ws');
const { createClient } = require('@supabase/supabase-js');
const renderBarMitsva = require('./templates/bar-mitsva/render');
const defaultConfig   = require('./templates/bar-mitsva/default-config');

const supabase   = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, { realtime: { transport: ws } });
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || '';
const ADMIN_KEY  = process.env.ADMIN_KEY || 'admin2026';
const PORT       = process.env.PORT || 3000;
const TMP_DIR    = path.join(__dirname, 'tmp');
const BUCKET_MEDIA = 'msd-media';
const BUCKET_VIDEO = 'msd-videos';

if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true });

const app = express();

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
app.use(express.json({ limit: '2mb' }));

// Multer
const storage = multer.diskStorage({ destination: TMP_DIR, filename: (req,file,cb) => cb(null, Date.now()+'-'+file.originalname.replace(/\s+/g,'_')) });
const upload = multer({ storage, limits: { fileSize: 500*1024*1024 } });

function requireAdmin(req,res,next){
  const key = req.headers['x-admin-key']||req.query.adminKey;
  if(key!==ADMIN_KEY) return res.status(401).json({error:'Non autorisé'});
  next();
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

// ─── Subdomain detection ────────────────────────────────────────────────────
function getSubdomain(req) {
  const host = req.hostname||'';
  const parts = host.split('.');
  if (parts.length >= 3) return parts[0];
  return null;
}

// ─── Serve vitrine (site vitrine — page d'accueil publique) ─────────────────
app.use('/vitrine', express.static(path.join(__dirname,'..','vitrine')));
app.get(['/','/?'], (req,res,next) => {
  const sub = getSubdomain(req);
  if (!sub || sub === 'www') res.sendFile(path.join(__dirname,'..','vitrine','index.html'));
  else next(); // sous-domaine client : laisse la route générale plus bas afficher son site
});

// ─── Serve admin (HTML public — auth gérée côté client JS) ──────────────────
app.use('/admin', express.static(path.join(__dirname,'..','admin')));
app.get(['/admin','/admin/'], (req,res) => {
  res.sendFile(path.join(__dirname,'..','admin','index.html'));
});

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

// ─── Static assets (shared) ──────────────────────────────────────────────────
app.use('/assets', express.static(path.join(__dirname,'..','public','assets')));

// ─── Upload pages (contextuelles au sous-domaine) ───────────────────────────
app.get('/upload', async (req,res) => {
  const sub = getSubdomain(req);
  const { data:site } = await supabase.from('msd_sites').select('id,config,active').eq('subdomain', sub).single();
  if (!site || !site.active) return res.status(404).send('Site not found');
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
  res.json(data);
});

// Update site config
app.put('/api/admin/sites/:id', requireAdmin, async (req,res) => {
  const { config, active, subdomain } = req.body;
  const updates = {};
  if(config!==undefined) updates.config = config;
  if(active!==undefined) updates.active = active;
  if(subdomain!==undefined) updates.subdomain = subdomain;
  const { data,error } = await supabase.from('msd_sites').update(updates).eq('id',req.params.id).select().single();
  if(error) return res.status(500).json({error:error.message});
  res.json(data);
});

// Delete site
app.delete('/api/admin/sites/:id', requireAdmin, async (req,res) => {
  const { error } = await supabase.from('msd_sites').delete().eq('id',req.params.id);
  if(error) return res.status(500).json({error:error.message});
  res.json({success:true});
});

// ─────────────────────────────────────────────────────────────────────────────
// ESPACE CLIENT — API scopée au compte connecté (Supabase Auth)
// ─────────────────────────────────────────────────────────────────────────────

// Le site du client connecté (on part du principe d'un site par compte pour
// l'instant — le plus récent si jamais il y en avait plusieurs).
app.get('/api/mon-compte/site', requireClientAuth, async (req,res) => {
  const { data, error } = await supabase.from('msd_sites').select('*')
    .eq('user_id', req.clientUser.id).order('created_at',{ascending:false}).limit(1).maybeSingle();
  if(error) return res.status(500).json({error:error.message});
  if(!data) return res.status(404).json({error:"Aucun faire-part associé à ce compte pour l'instant"});
  res.json(data);
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
app.post('/api/apercu', async (req,res) => {
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

    const subdomain = await genererSousDomaineUnique(lead.firstName, lead.lastName);
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
app.post('/api/apercu/:id/musique', upload.single('file'), async (req,res) => {
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

    const subdomain = await genererSousDomaineUnique(lead.firstName, lead.lastName);
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
  res.json(data);
});

// ⚠️ Paiement simulé pour l'instant : aucune vraie carte bancaire n'est
// débitée. On débloque directement le partage, comme si le paiement avait
// réussi. À remplacer par un vrai prestataire (ex. Stripe) plus tard.
const PRIX_PARTAGE_EUROS = 49.99;

app.get('/api/mon-compte/tarif', requireClientAuth, (req,res) => {
  res.json({ prix: PRIX_PARTAGE_EUROS });
});

app.post('/api/mon-compte/site/:id/payer', requireClientAuth, chargerSiteDuClient, async (req,res) => {
  const { data, error } = await supabase.from('msd_sites').update({ active:true }).eq('id',req.params.id).select().single();
  if(error) return res.status(500).json({error:error.message});
  res.json(data);
});

// ── Mur de photos (option payante, indépendante du forfait "partage") ──────
const PRIX_MUR_EUROS = 29.99;

app.get('/api/mon-compte/tarif-mur', requireClientAuth, (req,res) => {
  res.json({ prix: PRIX_MUR_EUROS });
});

app.post('/api/mon-compte/site/:id/acheter-mur', requireClientAuth, chargerSiteDuClient, async (req,res) => {
  const cfg = mergeConfig(req.site.config);
  cfg.sections.mur.achete = true;
  const { data, error } = await supabase.from('msd_sites').update({ config:cfg }).eq('id',req.params.id).select().single();
  if(error) return res.status(500).json({error:error.message});
  res.json(data);
});

app.get('/api/mon-compte/site/:id/rsvp', requireClientAuth, chargerSiteDuClient, async (req,res) => {
  const { data,error } = await supabase.from('msd_rsvp').select('*').eq('site_id',req.params.id).order('created_at',{ascending:false});
  if(error) return res.status(500).json({error:error.message});
  res.json(data);
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
app.post('/api/rsvp', async (req,res) => {
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

app.post('/api/mur/:siteId/upload', upload.single('file'), async (req,res) => {
  const tmpPath = req.file?.path;
  try {
    const { data:site } = await supabase.from('msd_sites').select('id,active,config').eq('id',req.params.siteId).single();
    if(!site || !site.active) return res.status(404).json({error:'Site introuvable'});
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
  const { data:site } = await supabase.from('msd_sites').select('id,active,config').eq('id',req.params.siteId).single();
  if(!site || !site.active) return res.status(404).json({error:'Site introuvable'});
  if(!murEstActif(mergeConfig(site.config))) return res.json([]);
  const { data,error } = await supabase.from('msd_mur_medias').select('id,type,url,created_at').eq('site_id',req.params.siteId).order('created_at',{ascending:false});
  if(error) return res.status(500).json({error:error.message});
  res.json(data);
});

app.post('/api/upload', upload.single('video'), async (req,res) => {
  const tmpPath = req.file?.path;
  const sub = getSubdomain(req);
  try {
    const { data:site } = await supabase.from('msd_sites').select('id,active').eq('subdomain',sub).single();
    if(!site || !site.active) return res.status(404).json({error:'Site introuvable'});
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
app.post('/api/lead', async (req,res) => {
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

    const subdomain = await genererSousDomaineUnique(lead.firstName, lead.lastName);
    const config = construireConfigParDefaut(lead);

    const { data:site, error:siteErr } = await supabase.from('msd_sites')
      .insert({ subdomain, template:'bar-mitsva', config, active:true }).select().single();
    if (siteErr) throw siteErr;

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
    if (error || !site) return res.status(404).send('<h1>Aperçu introuvable</h1><p>Ce lien n\'est plus valide.</p>');
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
    res.status(500).send('Erreur serveur');
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
    if(error||!site) return res.status(404).send('<h1>Site introuvable</h1><p>Ce faire-part n\'existe pas ou a été désactivé.</p>');
    const cfg = mergeConfig(site.config);
    const murMedias = murEstActif(cfg) ? (await supabase.from('msd_mur_medias').select('type,url').eq('site_id',site.id).order('created_at',{ascending:false})).data : [];
    const html = renderBarMitsva(cfg, site.id, murMedias);
    res.send(html);
  } catch(err) {
    res.status(500).send('Erreur serveur');
  }
});

app.listen(PORT, () => {
  console.log(`✅  MySaveTheDate Platform — port ${PORT}`);
  console.log(`   Admin → http://localhost:${PORT}/admin`);
});
