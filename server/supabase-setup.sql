-- MySaveTheDate Platform — Setup Supabase
-- Exécuter dans SQL Editor → New query → Run

-- ── SITES ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sites (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subdomain   TEXT UNIQUE NOT NULL,
  template    TEXT DEFAULT 'bar-mitsva',
  config      JSONB NOT NULL DEFAULT '{}',
  active      BOOLEAN DEFAULT true,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE sites ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_sites_subdomain ON sites(subdomain);

-- ── RSVP ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS rsvp_submissions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id     UUID REFERENCES sites(id) ON DELETE CASCADE,
  nom         TEXT DEFAULT '',
  prenom      TEXT DEFAULT '',
  data        JSONB DEFAULT '{}',   -- { eventId: { presence, adults, children } }
  message     TEXT DEFAULT '',
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE rsvp_submissions ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_rsvp_site ON rsvp_submissions(site_id);

-- ── VIDEO SUBMISSIONS ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS video_submissions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id     UUID REFERENCES sites(id) ON DELETE CASCADE,
  name        TEXT DEFAULT 'Anonyme',
  message     TEXT DEFAULT '',
  video_url   TEXT NOT NULL,
  file_name   TEXT NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE video_submissions ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_videos_site ON video_submissions(site_id);

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
