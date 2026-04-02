-- migrations/0005_phase2_schema_fix.sql
-- Finalization: indexes for slug columns and any supplemental fixes

-- Indexes for slug lookups (safe - IF NOT EXISTS)
CREATE INDEX IF NOT EXISTS idx_statuses_slug    ON work_item_statuses(slug);
CREATE INDEX IF NOT EXISTS idx_priorities_slug  ON work_item_priorities(slug);
CREATE INDEX IF NOT EXISTS idx_types_slug       ON work_item_types(slug);

-- Update any null slugs from existing priority data
UPDATE work_item_priorities SET slug = lower(replace(name, ' ', '_')) WHERE slug IS NULL;
UPDATE work_item_statuses    SET slug = lower(replace(name, ' ', '_')) WHERE slug IS NULL;
UPDATE work_item_types       SET slug = lower(replace(name, ' ', '_')) WHERE slug IS NULL;
