-- MySaveTheDate Platform — Setup Supabase
-- Exécuter dans SQL Editor → New query → Run
-- (Ce script est ré-exécutable sans risque : IF NOT EXISTS partout.)

-- ⚠️  Ces tables sont DIFFÉRENTES de celles du site Ethan (bmethan).
--     Elles utilisent le préfixe "msd_" pour éviter tout conflit.

-- ── SITES ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS msd_sites (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subdomain   TEXT UNIQUE NOT NULL,
  template    TEXT DEFAULT 'bar-mitsva',
  config      JSONB NOT NULL DEFAULT '{}',
  active      BOOLEAN DEFAULT true,
  -- Compte client propriétaire du site (Supabase Auth). Nullable : les
  -- sites créés depuis l'admin sans compte client associé restent valides.
  user_id     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE msd_sites ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_msd_sites_subdomain ON msd_sites(subdomain);
CREATE INDEX IF NOT EXISTS idx_msd_sites_user ON msd_sites(user_id);

-- Si la table existait déjà sans la colonne user_id (mise à jour d'une
-- base existante), on l'ajoute ici sans tout recréer :
ALTER TABLE msd_sites ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- ── RSVP ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS msd_rsvp (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id     UUID REFERENCES msd_sites(id) ON DELETE CASCADE,
  nom         TEXT DEFAULT '',
  prenom      TEXT DEFAULT '',
  data        JSONB DEFAULT '{}',   -- { eventId: { presence, adults, children } }
  message     TEXT DEFAULT '',
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE msd_rsvp ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_msd_rsvp_site ON msd_rsvp(site_id);

-- ── VIDEO SUBMISSIONS ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS msd_videos (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id     UUID REFERENCES msd_sites(id) ON DELETE CASCADE,
  name        TEXT DEFAULT 'Anonyme',
  message     TEXT DEFAULT '',
  video_url   TEXT NOT NULL,
  file_name   TEXT NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE msd_videos ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_msd_videos_site ON msd_videos(site_id);

-- ── MUR DE PHOTOS (galerie collaborative post-soirée) ──────────
-- Option payante : photos/vidéos envoyées par les invités, visibles par
-- tous une fois la page "Mur de photos" activée (voir sections.mur dans
-- le config JSONB de msd_sites).
CREATE TABLE IF NOT EXISTS msd_mur_medias (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id     UUID REFERENCES msd_sites(id) ON DELETE CASCADE,
  type        TEXT NOT NULL DEFAULT 'photo',  -- 'photo' | 'video'
  url         TEXT NOT NULL,
  file_name   TEXT NOT NULL,
  name        TEXT DEFAULT '',
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE msd_mur_medias ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_msd_mur_medias_site ON msd_mur_medias(site_id);

-- ── LEADS (prospects du questionnaire vitrine) ─────────────────
CREATE TABLE IF NOT EXISTS msd_leads (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type     TEXT DEFAULT '',
  event_date     TEXT DEFAULT '',
  event_location TEXT DEFAULT '',
  guests         INTEGER DEFAULT 0,
  style          TEXT DEFAULT '',
  budget         TEXT DEFAULT '',
  first_name     TEXT DEFAULT '',
  last_name      TEXT DEFAULT '',
  email          TEXT DEFAULT '',
  phone          TEXT DEFAULT '',
  rdv_date       TEXT DEFAULT '',
  rdv_time       TEXT DEFAULT '',
  rdv_formatted  TEXT DEFAULT '',
  -- Site auto-généré pour ce prospect juste après sa soumission (rempli une
  -- fois le compte client + le faire-part de base créés).
  site_id        UUID REFERENCES msd_sites(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE msd_leads ENABLE ROW LEVEL SECURITY;

-- ── FAQ (base de connaissances du chatbot, éditable depuis l'admin) ────
CREATE TABLE IF NOT EXISTS msd_faq (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  categorie   TEXT DEFAULT '',
  ordre       INTEGER DEFAULT 0,
  question    TEXT NOT NULL,
  reponse     TEXT NOT NULL,
  active      BOOLEAN DEFAULT true,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE msd_faq ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_msd_faq_ordre ON msd_faq(ordre);
-- Contenu initial (100 questions/réponses) : voir server/faq-seed.sql, à
-- exécuter une fois cette table créée.

-- ── BUCKETS (créer manuellement dans Storage UI) ──────────────
-- Bucket 1 : "msd-media"  → Public  (logos, photos, musiques)
-- Bucket 2 : "msd-videos" → Public  (vidéos invités)

-- ── STORAGE POLICIES ─────────────────────────────────────────
-- (à exécuter une fois les deux buckets créés — sinon Postgres refusera
--  la policy faute de bucket existant)
DROP POLICY IF EXISTS "Lecture publique msd-media" ON storage.objects;
DROP POLICY IF EXISTS "Lecture publique msd-videos" ON storage.objects;
DROP POLICY IF EXISTS "Upload service msd-media" ON storage.objects;
DROP POLICY IF EXISTS "Upload service msd-videos" ON storage.objects;
DROP POLICY IF EXISTS "Delete service msd-media" ON storage.objects;
DROP POLICY IF EXISTS "Delete service msd-videos" ON storage.objects;

CREATE POLICY "Lecture publique msd-media"  ON storage.objects FOR SELECT USING (bucket_id='msd-media');
CREATE POLICY "Lecture publique msd-videos" ON storage.objects FOR SELECT USING (bucket_id='msd-videos');
CREATE POLICY "Upload service msd-media"    ON storage.objects FOR INSERT WITH CHECK (bucket_id='msd-media'  AND auth.role()='service_role');
CREATE POLICY "Upload service msd-videos"   ON storage.objects FOR INSERT WITH CHECK (bucket_id='msd-videos' AND auth.role()='service_role');
CREATE POLICY "Delete service msd-media"    ON storage.objects FOR DELETE USING (bucket_id='msd-media'  AND auth.role()='service_role');
CREATE POLICY "Delete service msd-videos"   ON storage.objects FOR DELETE USING (bucket_id='msd-videos' AND auth.role()='service_role');

-- ── AUTH ─────────────────────────────────────────────────────
-- Aucune table à créer pour les comptes clients : Supabase Auth gère déjà
-- ses utilisateurs dans le schéma "auth" (auth.users). msd_sites.user_id
-- pointe directement dessus.
--
-- Pensez à activer "Email" comme méthode de connexion dans
-- Authentication → Providers si ce n'est pas déjà fait (activé par défaut
-- sur un nouveau projet).
