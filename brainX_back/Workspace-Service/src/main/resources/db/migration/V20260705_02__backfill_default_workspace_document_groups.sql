INSERT INTO document_groups (
    document_group_id,
    user_id,
    name,
    is_default,
    created_at,
    updated_at
)
SELECT
    'dgrp_default_' || src.user_id,
    src.user_id,
    'Default',
    TRUE,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM (
    SELECT DISTINCT user_id
    FROM workspace_notes
    WHERE user_id IS NOT NULL
      AND TRIM(user_id) <> ''
) src
WHERE NOT EXISTS (
    SELECT 1
    FROM document_groups existing
    WHERE existing.user_id = src.user_id
      AND COALESCE(existing.is_default, FALSE) = TRUE
);

UPDATE workspace_notes note
SET document_group_id = (
    SELECT MIN(default_group.document_group_id)
    FROM document_groups default_group
    WHERE default_group.user_id = note.user_id
      AND COALESCE(default_group.is_default, FALSE) = TRUE
)
WHERE note.document_group_id IS NULL
  AND EXISTS (
    SELECT 1
    FROM document_groups default_group
    WHERE default_group.user_id = note.user_id
      AND COALESCE(default_group.is_default, FALSE) = TRUE
);

UPDATE workspace_folders folder
SET document_group_id = (
    SELECT MIN(default_group.document_group_id)
    FROM document_groups default_group
    WHERE default_group.user_id = folder.user_id
      AND COALESCE(default_group.is_default, FALSE) = TRUE
)
WHERE folder.document_group_id IS NULL
  AND EXISTS (
    SELECT 1
    FROM document_groups default_group
    WHERE default_group.user_id = folder.user_id
      AND COALESCE(default_group.is_default, FALSE) = TRUE
);
