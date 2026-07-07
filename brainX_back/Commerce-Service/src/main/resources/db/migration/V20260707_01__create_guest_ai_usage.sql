CREATE TABLE commerce_guest_ai_usage (
    guest_id   VARCHAR(120) PRIMARY KEY,
    used_count INTEGER NOT NULL DEFAULT 0,
    updated_at TIMESTAMP NOT NULL DEFAULT now()
);
