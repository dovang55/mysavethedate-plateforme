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
};
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
function construireConfigParDefaut(lead){
  const config = JSON.parse(JSON.stringify(defaultConfig));
  const prenom = lead.firstName || 'Prénom';
  const nom    = lead.lastName  || 'Nom';
  const typesConnus = ['bar-mitsva','bat-mitsva','mariage','anniversaire'];
  const eventType = typesConnus.includes(lead.eventType) ? lead.eventType : 'mariage';

  config.identity.firstName = prenom;
  config.identity.lastName  = nom;
  config.identity.eventType = eventType;
  config.meta.title = `${prenom} ${nom}`;

  if (lead.date) config.target.date = lead.date;

  const ligneLieu = (config.sections.fairepart.events||[]).find(e => e.label === 'Lieu');
  if (ligneLieu && lead.location) ligneLieu.value = lead.location;

  const presetId = STYLE_VERS_PRESET[lead.style] || 'bleu-blanc';
  Object.assign(config.theme.colors, PRESETS_COULEUR[presetId]);

  const estJuif = eventType === 'bar-mitsva' || eventType === 'bat-mitsva';
  if (!estJuif) {
    // Le contenu par défaut (hommage, Shabbat, infos visa) est spécifique
    // aux Bar/Bat Mitsva : on le désactive et on adapte les textes pour un
    // mariage ou un anniversaire. Le client peut tout réactiver/modifier
    // ensuite depuis son éditeur.
    config.identity.bsd = false;
    config.sections.hommage.enabled = false;
    config.sections.shabbat.enabled = false;
    config.sections.infos.enabled   = false;

    const estMariage = eventType === 'mariage';
    config.sections.hero.eyebrow = estMariage ? 'Mariage' : 'Anniversaire';
    config.sections.fairepart.blessing     = '';
    config.sections.fairepart.ceremonyTag  = estMariage ? 'Cérémonie' : 'Fête';
    config.sections.fairepart.ceremonyName = estMariage ? 'Notre mariage' : `Anniversaire de ${prenom}`;
    config.sections.fairepart.ceremonyHe   = '';
    config.sections.fairepart.familyLine   = estMariage
      ? `${prenom} & ${nom} ont le plaisir de vous convier à leur mariage`
      : `${prenom} a le plaisir de vous inviter`;
    config.sections.fairepart.inviteHe  = '';
    config.sections.fairepart.inviteSub = 'Nous serions heureux de célébrer ce moment avec vous.';
    config.sections.rsvp.events = [
      { id:'principal', name: estMariage ? 'Cérémonie & Réception' : 'La fête', date: lead.date || '' }
    ];
  }

  config.pageOrder = [...SECTIONS_REORDONNABLES];
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
  const { data:site } = await supabase.from('msd_sites').select('id,config').eq('subdomain', sub).single();
  if (!site) return res.status(404).send('Site not found');
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
    const { data:site } = await supabase.from('msd_sites').select('id,config').eq('subdomain',sub).single();
    if(!site) return res.status(404).json({error:'Site introuvable'});

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
app.post('/api/upload', upload.single('video'), async (req,res) => {
  const tmpPath = req.file?.path;
  const sub = getSubdomain(req);
  try {
    const { data:site } = await supabase.from('msd_sites').select('id').eq('subdomain',sub).single();
    if(!site) return res.status(404).json({error:'Site introuvable'});
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
    const html = renderBarMitsva(cfg, site.id);
    res.send(html);
  } catch(err) {
    res.status(500).send('Erreur serveur');
  }
});

app.listen(PORT, () => {
  console.log(`✅  MySaveTheDate Platform — port ${PORT}`);
  console.log(`   Admin → http://localhost:${PORT}/admin`);
});
