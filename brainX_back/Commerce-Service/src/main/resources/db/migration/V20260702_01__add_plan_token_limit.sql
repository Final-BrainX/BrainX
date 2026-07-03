ALTER TABLE commerce_plans ADD COLUMN IF NOT EXISTS monthly_token_limit BIGINT;

UPDATE commerce_plans SET monthly_token_limit = 50000
WHERE plan_id = 'free' AND monthly_token_limit IS NULL;

UPDATE commerce_plans SET monthly_token_limit = 1000000
WHERE plan_id = 'pro' AND monthly_token_limit IS NULL;

-- max는 무제한 유지(NULL)
