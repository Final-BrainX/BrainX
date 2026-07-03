-- estimated_cost가 numeric(*, 6)이라 임베딩처럼 건당 비용이 $0.0000005 미만인 이벤트는
-- 저장 시점에 0으로 반올림되어 버린다(예: voyage-4-lite 1000토큰당 $0.00002, 검색 1회에
-- 토큰 수 개~수십 개면 실제 비용이 6번째 소수 자리보다 작음). 그 결과 시맨틱 검색을 아무리
-- 반복해도 크레딧 환산값이 항상 0이 되어 토큰 사용량 대시보드가 늘지 않는다.
-- Intelligence-Service의 AiTokenUsageCostEstimator가 scale 12로 계산하므로 여기도 맞춘다.
-- spring.sql.init.mode=always로 매 기동마다 재실행되므로 idempotent하게 작성한다.
-- spring.sql.init 스크립트는 Hibernate ddl-auto보다 먼저 실행되므로, 이 테이블들이
-- 이번 배포에서 처음 생성되는 신규 환경(예: 최초 EC2/RDS 배포)에서는 ALTER 시점에
-- 테이블이 아직 없어 "relation does not exist" 오류로 기동이 실패한다.
-- IF EXISTS로 그런 환경에서는 조용히 건너뛰고, 뒤이어 Hibernate가 엔티티에 정의된
-- precision=24, scale=12로 테이블을 새로 생성하도록 한다.
ALTER TABLE IF EXISTS commerce_token_usage_raw ALTER COLUMN estimated_cost TYPE numeric(24, 12);
ALTER TABLE IF EXISTS commerce_token_usage_daily ALTER COLUMN estimated_cost TYPE numeric(24, 12);
ALTER TABLE IF EXISTS commerce_token_usage_monthly ALTER COLUMN estimated_cost TYPE numeric(24, 12);
