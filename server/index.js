require('dotenv').config();
const express = require('express');
const multer  = require('multer');
const cors    = require('cors');
const path    = require('path');
const fs      = require('fs');
const ws      = require('ws');
const { createClient } = require('@supabase/supabase-js');
const renderBarMitsva = require('./templates/bar-mitsva/render');
const defaultConfig   = require('./templates/bar-mitsva/default-config');

const supabase   = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, { realtime: { transport: ws } });
const ADMIN_KEY  = process.env.ADMIN_KEY || 'admin2026';
const PORT       = process.env.PORT || 3000;
const TMP_DIR    = path.join(__dirname, 'tmp');
const BUCKET_MEDIA = 'msd-media';
const BUCKET_VIDEO = 'msd-videos';

if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true });

const app = express();
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

// ─── Subdomain detection ────────────────────────────────────────────────────
function getSubdomain(req) {
  const host = req.hostname||'';
  const parts = host.split('.');
  if (parts.length >= 3) return parts[0];
  return null;
}

// ─── Serve admin ─────────────────────────────────────────────────────────────
app.get('/admin*', requireAdmin, (req,res) => {
  // Strip auth from URL check — admin pages served directly
});
app.use('/admin', requireAdmin, express.static(path.join(__dirname,'..','admin')));

// Admin fallback SPA
app.get(['/admin','/admin/'], requireAdmin, (req,res) => {
  res.sendFile(path.join(__dirname,'..','admin','index.html'));
});

// ─── Static assets (shared) ──────────────────────────────────────────────────
app.use('/assets', express.static(path.join(__dirname,'..','public','assets')));

// ─── Upload pages (contextuelles au sous-domaine) ───────────────────────────
app.get('/upload', async (req,res) => {
  const sub = getSubdomain(req);
  const { data:site } = await supabase.from('sites').select('id,config').eq('subdomain', sub).single();
  if (!site) return res.status(404).send('Site not found');
  const cfg = mergeConfig(site.config);
  res.sendFile(path.join(__dirname,'..','public','upload.html'));
});

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN API — Sites
// ─────────────────────────────────────────────────────────────────────────────

// List all sites
app.get('/api/admin/sites', requireAdmin, async (req,res) => {
  const { data,error } = await supabase.from('sites').select('id,subdomain,template,active,created_at,config').order('created_at',{ascending:false});
  if(error) return res.status(500).json({error:error.message});
  res.json(data);
});

// Get single site
app.get('/api/admin/sites/:id', requireAdmin, async (req,res) => {
  const { data,error } = await supabase.from('sites').select('*').eq('id',req.params.id).single();
  if(error) return res.status(500).json({error:error.message});
  res.json(data);
});

// Create site
app.post('/api/admin/sites', requireAdmin, async (req,res) => {
  const { subdomain, template='bar-mitsva', config={} } = req.body;
  if(!subdomain) return res.status(400).json({error:'subdomain requis'});
  const fullConfig = mergeConfig(config);
  const { data,error } = await supabase.from('sites').insert({ subdomain, template, config: fullConfig, active: true }).select().single();
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
  const { data,error } = await supabase.from('sites').update(updates).eq('id',req.params.id).select().single();
  if(error) return res.status(500).json({error:error.message});
  res.json(data);
});

// Delete site
app.delete('/api/admin/sites/:id', requireAdmin, async (req,res) => {
  const { error } = await supabase.from('sites').delete().eq('id',req.params.id);
  if(error) return res.status(500).json({error:error.message});
  res.json({success:true});
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
    const { data:site } = await supabase.from('sites').select('id,config').eq('subdomain',sub).single();
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

    const { error } = await supabase.from('rsvp_submissions').insert(row);
    if(error) throw error;
    res.json({success:true});
  } catch(err) {
    res.status(500).json({error:err.message});
  }
});

// Get RSVP for a site (admin)
app.get('/api/admin/sites/:id/rsvp', requireAdmin, async (req,res) => {
  const { data,error } = await supabase.from('rsvp_submissions').select('*').eq('site_id',req.params.id).order('created_at',{ascending:false});
  if(error) return res.status(500).json({error:error.message});
  res.json(data);
});

app.delete('/api/admin/rsvp/:id', requireAdmin, async (req,res) => {
  const { error } = await supabase.from('rsvp_submissions').delete().eq('id',req.params.id);
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
    const { data:site } = await supabase.from('sites').select('id').eq('subdomain',sub).single();
    if(!site) return res.status(404).json({error:'Site introuvable'});
    if(!req.file) return res.status(400).json({error:'Aucun fichier'});
    const { name='Anonyme', message='' } = req.body;
    const ext = path.extname(req.file.originalname).toLowerCase()||'.mp4';
    const fileName = `${site.id}/${Date.now()}_${name.replace(/[^a-z0-9]/gi,'_').slice(0,30)}${ext}`;
    const buffer = fs.readFileSync(tmpPath);
    const { error:upErr } = await supabase.storage.from(BUCKET_VIDEO).upload(fileName, buffer, { contentType: req.file.mimetype, upsert: false });
    if(upErr) throw upErr;
    const { data:urlData } = supabase.storage.from(BUCKET_VIDEO).getPublicUrl(fileName);
    await supabase.from('video_submissions').insert({ site_id:site.id, name, message, video_url:urlData.publicUrl, file_name:fileName });
    res.json({success:true, url:urlData.publicUrl});
  } catch(err) {
    res.status(500).json({error:err.message});
  } finally {
    if(tmpPath&&fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
  }
});

app.get('/api/admin/sites/:id/videos', requireAdmin, async (req,res) => {
  const { data,error } = await supabase.from('video_submissions').select('*').eq('site_id',req.params.id).order('created_at',{ascending:false});
  if(error) return res.status(500).json({error:error.message});
  res.json(data);
});

app.delete('/api/admin/videos/:id', requireAdmin, async (req,res) => {
  const { data:row } = await supabase.from('video_submissions').select('file_name').eq('id',req.params.id).single();
  if(row?.file_name) await supabase.storage.from(BUCKET_VIDEO).remove([row.file_name]);
  const { error } = await supabase.from('video_submissions').delete().eq('id',req.params.id);
  if(error) return res.status(500).json({error:error.message});
  res.json({success:true});
});

// ─────────────────────────────────────────────────────────────────────────────
// Render site (catch-all — doit être EN DERNIER)
// ─────────────────────────────────────────────────────────────────────────────
app.get('*', async (req,res) => {
  const sub = getSubdomain(req);

  // Admin direct access sans sous-domaine
  if (!sub || sub === 'www') {
    return res.sendFile(path.join(__dirname,'..','admin','index.html'));
  }

  try {
    const { data:site, error } = await supabase.from('sites').select('*').eq('subdomain',sub).eq('active',true).single();
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
