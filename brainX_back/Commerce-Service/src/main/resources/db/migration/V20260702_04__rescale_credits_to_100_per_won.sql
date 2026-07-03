-- 크레딧 세분화: 1크레딧 = 1원 -> 100크레딧 = 1원.
-- 저가 이벤트(임베딩 등)가 반올림으로 0에 묻히는 걸 줄이기 위해 원 단위보다 100배 세분화.
-- 이 스크립트는 spring.sql.init.mode=always로 매 기동마다 재실행되므로, 상대 곱셈이 아니라
-- 절대값 SET으로 작성해 여러 번 실행돼도 안전하게(idempotent) 한다.
UPDATE commerce_plans SET monthly_credit_limit = 20000 WHERE plan_id = 'free';
UPDATE commerce_plans SET monthly_credit_limit = 600000 WHERE plan_id = 'pro';
UPDATE commerce_plans SET monthly_credit_limit = 2000000 WHERE plan_id = 'max';

UPDATE commerce_plan_features SET feature = 'AI 크레딧 월 20,000'
WHERE plan_id = 'free' AND feature = 'AI 크레딧 월 200';

UPDATE commerce_plan_features SET feature = 'AI 크레딧 월 600,000'
WHERE plan_id = 'pro' AND feature = 'AI 크레딧 월 6,000';

UPDATE commerce_plan_features SET feature = 'AI 크레딧 월 2,000,000'
WHERE plan_id = 'max' AND feature = 'AI 크레딧 월 20,000';
