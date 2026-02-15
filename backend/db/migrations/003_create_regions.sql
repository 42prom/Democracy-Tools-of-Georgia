-- Migration: Create Regions Table
-- Created: 2026-01-30
-- Purpose: Store administrative regions for poll audience targeting

-- FORCE CLEAN RECREATE (removes any old schema drift from failed inits)
-- Safe in dev because we do `docker compose down -v` regularly
DROP TABLE IF EXISTS regions CASCADE;

-- Create regions table (fresh every time)
CREATE TABLE regions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(50) UNIQUE NOT NULL,
  name_en VARCHAR(255) NOT NULL,
  name_ka VARCHAR(255) NOT NULL,
  parent_region_id UUID REFERENCES regions(id) ON DELETE SET NULL,
  active BOOLEAN DEFAULT TRUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Create indexes for performance
CREATE INDEX idx_regions_code ON regions(code);
CREATE INDEX idx_regions_active ON regions(active);
CREATE INDEX idx_regions_parent ON regions(parent_region_id);
CREATE INDEX idx_regions_name_en ON regions(name_en);

-- Add comments
COMMENT ON TABLE regions IS 'Administrative regions for poll audience targeting';
COMMENT ON COLUMN regions.code IS 'Unique region code (e.g., reg_tbilisi)';
COMMENT ON COLUMN regions.name_en IS 'Region name in English';
COMMENT ON COLUMN regions.name_ka IS 'Region name in Georgian';
COMMENT ON COLUMN regions.parent_region_id IS 'Parent region for hierarchical regions';
COMMENT ON COLUMN regions.active IS 'Whether region is active and can be used in polls';

-- Insert default Georgian regions
INSERT INTO regions (code, name_en, name_ka, active) VALUES
  ('reg_tbilisi', 'Tbilisi', 'თბილისი', true),
  ('reg_adjara', 'Adjara', 'აჭარა', true),
  ('reg_guria', 'Guria', 'გურია', true),
  ('reg_imereti', 'Imereti', 'იმერეთი', true),
  ('reg_kakheti', 'Kakheti', 'კახეთი', true),
  ('reg_kvemo_kartli', 'Kvemo Kartli', 'ქვემო ქართლი', true),
  ('reg_mtskheta_mtianeti', 'Mtskheta-Mtianeti', 'მცხეთა-მთიანეთი', true),
  ('reg_racha_lechkhumi', 'Racha-Lechkhumi and Kvemo Svaneti', 'რაჭა-ლეჩხუმი და ქვემო სვანეთი', true),
  ('reg_samegrelo_zemo_svaneti', 'Samegrelo-Zemo Svaneti', 'სამეგრელო-ზემო სვანეთი', true),
  ('reg_samtskhe_javakheti', 'Samtskhe-Javakheti', 'სამცხე-ჯავახეთი', true),
  ('reg_shida_kartli', 'Shida Kartli', 'შიდა ქართლი', true),
  ('reg_abkhazia', 'Abkhazia (Autonomous Republic)', 'აფხაზეთი', false),
  ('reg_south_ossetia', 'South Ossetia (Tskhinvali Region)', 'სამხრეთ ოსეთი', false)
ON CONFLICT (code) DO NOTHING;

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_regions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically update updated_at
CREATE TRIGGER regions_updated_at
  BEFORE UPDATE ON regions
  FOR EACH ROW
  EXECUTE FUNCTION update_regions_updated_at();

-- Grant permissions (uncomment if needed)
-- GRANT SELECT, INSERT, UPDATE, DELETE ON regions TO DTG_app;
-- GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO DTG_app;