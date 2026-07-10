# 기술 문서

이 폴더에는 구현·운영 시 실제로 참고할 서비스 로컬 문서를 둡니다. 문서마다 현재 동작을 설명하는지, 과거 품질 평가를 기록하는지 구분해서 읽습니다.

## 기능과 서비스 연동

- [AI 기능 카탈로그](ai-feature-catalog.md): AI/LLM 기능 전체, public API, provider/model 경계를 빠르게 확인할 때 읽습니다.
- [RAG 채팅 프론트엔드 연동](rag-chat-api-frontend-integration.md): `/chat` API, thread pagination, SSE, persistence 주의점을 구현하거나 점검할 때 읽습니다.
- [외부 검색](external-search.md): OpenAI `web_search` port, stream capture, RAG chat router 결합을 확인할 때 읽습니다.
- [프론트엔드 AI context 관리](frontend-ai-context-management.md): `clientContext`/`noteScope`, chat·inline assist context 조립을 점검할 때 읽습니다.
- [Inline Assist SSE lifecycle](inline-assist-frontend-stream-lifecycle.md): 프론트 stream abort/state cleanup 문제를 분석하거나 재발을 막을 때 읽습니다.
- [Connection API](connection-api.md): link suggestion·bridge concept의 public API, document group 경계, event/usage 처리를 확인할 때 읽습니다.
- [Note Auto Linking](note-auto-linking.md): 내부 자동 연결 전략, anchor 위치, CLI 품질 capture를 확인할 때 읽습니다.
- [Knowledge Structure Analysis](knowledge-structure-analysis.md): AI 클러스터링 job, persistence, usage/event 정책을 확인할 때 읽습니다.
- [Insight Reports](insight-reports.md): insight report job, persistence, usage/event 정책을 확인할 때 읽습니다.
- [LLMOps](llmops.md): LLM run log, PromptOps registry, eval run, 사용자 피드백 API 기준을 확인할 때 읽습니다.

## 데이터, 검색, 운영

- [AI 모델 비용과 사용량 기록](ai-model-pricing-and-usage.md): model catalog, availability, token/cost estimate와 usage event를 확인할 때 읽습니다.
- [Note Chunking](note-chunking.md): markdown chunk, document group 격리, semantic search dedupe를 확인할 때 읽습니다.
- [Vectorstore Embedding Model](vectorstore-embedding-model.md): Qdrant와 Voyage embedding model 설정·저장·검색 정책을 확인할 때 읽습니다.
- [운영 DB DDL](intelligence-operational-db-ddl.md): PostgreSQL schema baseline, 부분 적용 DB 점검, 권장 index를 확인할 때 읽습니다.
- [AWS 운영 위험 감사](aws-production-risk-audit-2026-07-10.md): IAM, 이벤트 유실, RDS, 단일 EC2, 관측성 위험과 후속 조치를 확인할 때 읽습니다.
- [Sample Notes RAG CLI](sample-notes-rag-cli.md): `sample_notes` 기반 로컬 RAG 색인·질의·capture를 실행할 때 읽습니다.
- [Conditional on Bean](conditional-on-bean.md): Spring Boot `@ConditionalOnBean`과 Qdrant adapter 등록 조건을 확인할 때 읽습니다.

## 이벤트 계약

- [소비 이벤트 계약 정합성](consumed-event-contract-alignment.md): AsyncAPI SSOT와 구현의 빠른 확인 지점을 찾을 때 읽습니다.
- [소비 이벤트 구현 체크포인트](consumed-events-implementation-checkpoints.md): 현재 기본 listener가 처리하는 event와 아직 구독하지 않는 contract event를 확인할 때 읽습니다.

## 품질 평가 기록

- [2026-06-26 LLM 품질 평가 요약](llm-quality-evaluation-report-2026-06-26.md): RAG/chat router/external search/inline assist/connection의 당시 provider 평가 결과와 조치를 확인할 때 읽습니다. 현재 API 계약은 별도 계약 문서로 다시 확인합니다.
- [2026-07-04 StyleProfile 품질 평가 요약](llm-quality-evaluation-report-2026-07-04.md): StyleProfile 문체 설정 평가의 결론과 후속 작업을 확인할 때 읽습니다.
- [LLM 품질 상세 평가 인덱스](llm-quality-evaluations/README.md): 기능별 상세 시나리오·관찰을 확인할 때 읽습니다.

## Kafka 진행 요약

더 넓은 Kafka 작업 진행 상황은 [brainX_back/KAFKA_IMPLEMENTATION_SUMMARY.md](../../../KAFKA_IMPLEMENTATION_SUMMARY.md)에서 확인합니다. 이 폴더의 event 문서는 Intelligence-Service의 현재 구현과 계약 경계에 집중합니다.
