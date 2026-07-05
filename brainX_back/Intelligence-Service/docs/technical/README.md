# 기술 문서

이 폴더에는 구현할 때 실제로 참고할 만한 서비스 로컬 문서만 남깁니다.

## 남겨둘 문서

- `conditional-on-bean.md`: Spring Boot `@ConditionalOnBean` 동작과 Qdrant adapter 연결 방식
- `ai-feature-catalog.md`: Intelligence-Service AI/LLM 기능 전체 카탈로그와 공개 API/LLM 호출 경계
- `ai-model-pricing-and-usage.md`: AI 모델 카탈로그 가격과 token usage / cost 추정 메모
- `intelligence-operational-db-ddl.md`: 운영 PostgreSQL schema baseline DDL과 부분 적용 DB 체크리스트
- `connection-api.md`: 연결 추천 공개 API와 event / usage 경계
- `external-search.md`: OpenAI `web_search` 기반 검색 port와 품질 캡처 메모
- `frontend-ai-context-management.md`: 프론트엔드 AI context 흐름과 chat / inline assist 전달
- `rag-chat-api-frontend-integration.md`: `/chat` 화면과 RAG 채팅 API, thread 목록 pagination, SSE, persistence 주의점
- `insight-reports.md`: insight report job 흐름, persistence, event 동작
- `knowledge-structure-analysis.md`: knowledge structure analysis job 흐름과 persistence
- `note-auto-linking.md`: note auto-linking 전략과 CLI 품질 캡처 메모
- `note-chunking.md`: note chunking과 search/vector indexing 메모
- `sample-notes-rag-cli.md`: 로컬 RAG 샘플 CLI 메모
- `vectorstore-embedding-model.md`: Qdrant와 Voyage embedding 메모
- `consumed-event-contract-alignment.md`: Kafka 계약 정합성 포인터
- `consumed-events-implementation-checkpoints.md`: Kafka 구현 체크리스트

## Kafka 진행 요약

자세한 Kafka 진행 요약은 아래 문서를 봅니다.

- [brainX_back/KAFKA_IMPLEMENTATION_SUMMARY.md](../../../KAFKA_IMPLEMENTATION_SUMMARY.md)
