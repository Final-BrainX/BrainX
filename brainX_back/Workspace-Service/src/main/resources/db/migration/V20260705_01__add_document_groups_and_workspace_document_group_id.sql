CREATE TABLE IF NOT EXISTS document_groups (
    document_group_id VARCHAR(255) PRIMARY KEY,
    user_id VARCHAR(255),
    name VARCHAR(255),
    is_default BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP,
    updated_at TIMESTAMP
);

ALTER TABLE workspace_notes
ADD COLUMN IF NOT EXISTS document_group_id VARCHAR(255);

ALTER TABLE workspace_folders
ADD COLUMN IF NOT EXISTS document_group_id VARCHAR(255);
