-- 한도 단위를 토큰 개수에서 크레딧(estimatedCost 기반 원가 환산치)으로 전환.
-- 모델별 토큰 단가가 달라 토큰 개수만으로는 실제 원가를 대표하지 못하기 때문.
ALTER TABLE commerce_plans ADD COLUMN IF NOT EXISTS monthly_credit_limit BIGINT;

UPDATE commerce_plans SET monthly_credit_limit = 200 WHERE plan_id = 'free';
UPDATE commerce_plans SET monthly_credit_limit = 6000 WHERE plan_id = 'pro';
UPDATE commerce_plans SET monthly_credit_limit = 20000 WHERE plan_id = 'max';

ALTER TABLE commerce_plans DROP COLUMN IF EXISTS monthly_token_limit;

UPDATE commerce_plan_features SET feature = 'AI 크레딧 월 200'
WHERE plan_id = 'free' AND feature = 'AI 토큰 월 50,000';

UPDATE commerce_plan_features SET feature = 'AI 크레딧 월 6,000'
WHERE plan_id = 'pro' AND feature = 'AI 토큰 월 200만';

UPDATE commerce_plan_features SET feature = 'AI 크레딧 월 20,000'
WHERE plan_id = 'max' AND feature = 'AI 토큰 월 800만';
