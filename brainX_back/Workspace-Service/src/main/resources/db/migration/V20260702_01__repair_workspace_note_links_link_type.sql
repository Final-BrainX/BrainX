ALTER TABLE workspace_note_links
ADD COLUMN IF NOT EXISTS link_type VARCHAR(64);

UPDATE workspace_note_links
SET link_type = COALESCE(NULLIF(TRIM(link_type), ''), 'MANUAL')
WHERE link_type IS NULL OR TRIM(link_type) = '';

ALTER TABLE workspace_note_links
ALTER COLUMN link_type SET DEFAULT 'MANUAL';

ALTER TABLE workspace_note_links
ALTER COLUMN link_type SET NOT NULL;
