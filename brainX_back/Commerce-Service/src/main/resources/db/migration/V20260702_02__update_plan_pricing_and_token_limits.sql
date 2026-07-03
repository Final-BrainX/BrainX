-- Pro/Max 정식 가격 및 토큰 한도 반영 (Max는 더 이상 무제한이 아님)
UPDATE commerce_plans SET price = 24000, monthly_token_limit = 2000000
WHERE plan_id = 'pro';

UPDATE commerce_plans SET price = 80000, monthly_token_limit = 8000000
WHERE plan_id = 'max';

UPDATE commerce_plan_features SET feature = 'AI 토큰 월 200만'
WHERE plan_id = 'pro' AND feature = 'AI 토큰 월 100만';

UPDATE commerce_plan_features SET feature = 'AI 토큰 월 800만'
WHERE plan_id = 'max' AND feature = 'AI 토큰 무제한';
