-- Migration: Fix Regions Table Drift
-- Created: 2026-02-06
-- Purpose: Unify regions table schema (code/name_en/name_ka) and resolve conflicts between 001 and 003.

DO $$ 
BEGIN
    -- Check if 'regions' table exists and lacks the 'code' column (legacy 001 schema)
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'regions') AND 
       NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'regions' AND column_name = 'code') THEN
        
        RAISE NOTICE 'Legacy regions table detected. Renaming for migration.';
        ALTER TABLE regions RENAME TO regions_legacy;
    END IF;

    -- Create unified regions table if it doesn't exist
    CREATE TABLE IF NOT EXISTS regions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        code TEXT UNIQUE NOT NULL,
        name_en TEXT NOT NULL,
        name_ka TEXT NOT NULL,
        parent_region_id UUID NULL REFERENCES regions(id) ON DELETE SET NULL,
        active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_regions_code ON regions(code);
    CREATE INDEX IF NOT EXISTS idx_regions_active ON regions(active);

    -- Migrate legacy data if regions_legacy exists
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'regions_legacy') THEN
        INSERT INTO regions (code, name_en, name_ka, active)
        SELECT 
            'legacy_' || id as code,
            name as name_en,
            name as name_ka,
            active
        FROM regions_legacy
        ON CONFLICT (code) DO NOTHING;
    END IF;

    -- Seed canonical regions if table is empty
    IF NOT EXISTS (SELECT 1 FROM regions) THEN
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
            ('reg_south_ossetia', 'South Ossetia (Tskhinvali Region)', 'სამხრეთ ოსეთი', false);
    END IF;

END $$;
