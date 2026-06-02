-- MySaveTheDate Platform — Setup Supabase
-- Exécuter dans SQL Editor → New query → Run

-- ⚠️  Ces tables sont DIFFÉRENTES de celles du site Ethan (bmethan).
--     Elles utilisent le préfixe "msd_" pour éviter tout conflit.

-- ── SITES ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS msd_sites (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subdomain   TEXT UNIQUE NOT NULL,
  template    TEXT DEFAULT 'bar-mitsva',
  config      JSONB NOT NULL DEFAULT '{}',
  active      BOOLEAN DEFAULT true,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE msd_sites ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_msd_sites_subdomain ON msd_sites(subdomain);

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

-- ── BUCKETS (créer manuellement dans Storage UI) ──────────────
-- Bucket 1 : "msd-media"  → Public  (logos, photos, musiques)
-- Bucket 2 : "msd-videos" → Public  (vidéos invités)

-- ── STORAGE POLICIES ─────────────────────────────────────────
CREATE POLICY "Lecture publique msd-media"  ON storage.objects FOR SELECT USING (bucket_id='msd-media');
CREATE POLICY "Lecture publique msd-videos" ON storage.objects FOR SELECT USING (bucket_id='msd-videos');
CREATE POLICY "Upload service msd-media"    ON storage.objects FOR INSERT WITH CHECK (bucket_id='msd-media'  AND auth.role()='service_role');
CREATE POLICY "Upload service msd-videos"   ON storage.objects FOR INSERT WITH CHECK (bucket_id='msd-videos' AND auth.role()='service_role');
CREATE POLICY "Delete service msd-media"    ON storage.objects FOR DELETE USING (bucket_id='msd-media'  AND auth.role()='service_role');
CREATE POLICY "Delete service msd-videos"   ON storage.objects FOR DELETE USING (bucket_id='msd-videos' AND auth.role()='service_role');
