-- ai_models 카탈로그가 비어 있으면 AiTokenUsageCostEstimator가 모든 모델에 대해
-- estimatedCost를 계산하지 못해(unknown) 크레딧이 영원히 0으로 남는다.
-- 기존에는 LocalAiModelSeedData(@Profile({"local","dev-ui"}))만 이 데이터를 채웠기 때문에,
-- 배포 환경(SPRING_PROFILES_ACTIVE 미설정)에서는 카탈로그가 비어 크레딧이 전혀 쌓이지 않았다.
-- spring.sql.init.mode=always로 매 기동마다 재실행되므로 idempotent하게 작성한다.
-- ON CONFLICT/MERGE는 H2(테스트)와 PostgreSQL(운영) 간 문법이 갈려서, 두 DB 모두에서
-- 동작하는 DELETE 후 재삽입 방식을 쓴다.
-- spring.jpa.defer-datasource-initialization=true로 Hibernate가 ai_models 테이블을
-- 먼저 만든 뒤에 이 스크립트가 실행된다.
DELETE FROM ai_models WHERE model_id IN (
    'gpt-5.4-mini', 'gpt-5.4-nano',
    'voyage-4-large', 'voyage-4', 'voyage-4-lite', 'voyage-context-3'
);

INSERT INTO ai_models (
    model_id, name, provider,
    vendor_input_cost_per_1k_tokens, vendor_cached_input_cost_per_1k_tokens,
    vendor_output_cost_per_1k_tokens, vendor_cost_currency
) VALUES
    ('gpt-5.4-mini', 'GPT-5.4 mini', 'openai', 0.000750, 0.000075, 0.004500, 'USD'),
    ('gpt-5.4-nano', 'GPT-5.4 nano', 'openai', 0.000750, 0.000075, 0.004500, 'USD'),
    ('voyage-4-large', 'Voyage 4 Large', 'voyage', 0.000120, NULL, NULL, 'USD'),
    ('voyage-4', 'Voyage 4', 'voyage', 0.000060, NULL, NULL, 'USD'),
    ('voyage-4-lite', 'Voyage 4 Lite', 'voyage', 0.000020, NULL, NULL, 'USD'),
    ('voyage-context-3', 'Voyage Context 3', 'voyage', 0.000180, NULL, NULL, 'USD');
