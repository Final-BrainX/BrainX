# AWS 운영 위험 조사 — 2026-07-10

조사 시각은 2026-07-10 06:00~07:00 KST이며, AWS CLI와 SSM으로 읽기 전용 상태만 확인했다. 리소스·설정·데이터를 변경하지 않았고 credential 값은 조회하거나 기록하지 않았다.

## 정상으로 확인한 상태

- Intelligence 컨테이너는 실행 중이고 restart count는 0이었다.
- Prometheus target은 `UP`, Qdrant collection은 green 상태였으며 1,354 points가 있었다.
- Intelligence Kafka consumer group의 조사 시점 lag은 0이었다.
- runtime `JWT_SECRET`, `SERVICE_TOKEN`은 값 노출 없이 각각 32 bytes 이상임을 확인했다.
- 새 idempotency unique constraint 적용 전 데이터 점검에서 cluster job 38 rows, insight report 9 rows였고 `(user_id, idempotency_key)` 중복 key는 양쪽 모두 0건이었다.

## 우선 조치가 필요한 위험

### P0 — AWS root principal 사용

현재 CLI session의 STS principal이 account root였다. 일상 운영과 배포는 최소 권한 IAM role/Identity Center session으로 전환하고 root access key 사용 여부를 확인해 제거해야 한다. root에는 MFA와 비상용 접근 절차만 남긴다.

### P1 — 재시도 소진 이벤트의 유실

운영 `event_consumption_records`에는 `FAILED_RETRYABLE` 220건이 남아 있었다. `UNEXPECTED_ERROR` 185건, `SNAPSHOT_UNAVAILABLE` 35건이며 최대 시도 횟수는 10회였다. event type별로는 `NoteContentSaved` 141, `NoteMetadataChanged` 60, `NoteCreated` 17, `NoteTrashed` 2건이었다. 현재 projection은 `INDEXED` 368, `REMOVED` 213, `FAILED` 0으로 후속 이벤트나 재색인 worker가 결과 상태를 회복했지만, 당시 consumer group lag이 0이고 DLQ가 없어 실패 원본을 재처리할 경로가 없었다.

이번 코드 변경은 retryable 오류를 제한 재시도 후 `<source-topic>.dlq`로, non-retryable 오류를 즉시 DLQ로 보내며 DLQ publish 실패를 recover 성공으로 처리하지 않는다. 배포 전 source topic과 같은 partition 수의 DLQ topic을 준비하고 alert/runbook을 연결해야 한다.

### P1 — RDS 복원력과 관측성

- 조사 구간의 `DatabaseConnections`는 평균 69.75, 최대 70이었다. 애플리케이션별 pool 합계와 실제 RDS `max_connections`를 함께 대조하고 connection alarm을 둔다.
- RDS는 storage encryption 비활성, Single-AZ, deletion protection 비활성, backup retention 3일이었다.
- CloudWatch alarm과 application log group이 없어 DB/호스트 장애를 AWS 외부에서 즉시 감지하기 어렵다.

암호화는 in-place 변경이 아니므로 encrypted snapshot 복원과 cutover 계획이 필요하다. 그 전에도 deletion protection, backup retention, CPU/storage/connections/replica lag alarm을 우선 적용한다.

### P1 — 단일 EC2와 내부 의존성 readiness

전체 서비스와 Kafka, Qdrant, Redis, Prometheus/Loki가 단일 EC2 Docker Compose에 함께 있어 host 장애가 곧 전체 장애가 된다. Intelligence readiness는 DB만 확인하고 Kafka/Qdrant 상태를 반영하지 않으며 컨테이너 자체 healthcheck도 없다. 최소한 dependency별 health indicator와 Compose healthcheck를 추가하고, 장기적으로 stateful dependency와 monitoring을 애플리케이션 host에서 분리한다.

## 그 밖의 운영 정리 항목

- 운영 Compose가 `BRAINX_REPAIR_LEGACY_DEFAULT_DOCUMENT_GROUP_BACKFILL_ENABLED=true`를 계속 override하고 있었다. 현재 repair target이 없으므로 `false`로 되돌려 매 startup scan을 제거한다.
- ECR의 현재 image에 vulnerability scan 결과가 없었다. push-on-scan 또는 Inspector enhanced scanning을 켜고 severity gate를 둔다.
- 배포 helper가 복호화된 cache와 평문 password fingerprint를 host에 남기는 경로가 있다. 임시 파일 수명·권한·삭제를 명시하고 가능하면 SSM Parameter Store/Secrets Manager runtime 주입으로 바꾼다.
- Prometheus/Loki가 같은 EC2에 있어 host 장애 시 장애 증거도 함께 사라진다. CloudWatch Logs 또는 외부 remote-write 보관 경로가 필요하다.

## 이번 repository 변경과 배포 경계

코드에서는 secret fail-fast, DB pool 축소와 장기 LLM transaction 분리, Kafka DLQ, note snapshot scope 검증, idempotency unique constraint를 반영했다. AWS resource 설정, Compose override, DLQ topic 생성, IAM/RDS/ECR/CloudWatch 변경은 이 조사에서 수행하지 않았다. 운영 반영 시 migration 전 중복 key 0건을 다시 확인하고 배포 후 DLQ publish·consumer lag·application readiness를 검증한다.
