# Technical Documentation

이 디렉터리는 Intelligence Service 구현 중 반복해서 확인해야 하는 framework, infrastructure, local runtime 관련 기술 메모를 둔다.

- `conditional-on-bean.md`: Spring Boot `@ConditionalOnBean`의 의미, 주의점, Qdrant adapter 적용 맥락을 설명한다.
- `consumed-events-implementation-checkpoints.md`: `AI-Service`가 consumer로 받는 이벤트별 구현 체크포인트를 정리한다.
- `note-chunking.md`: Workspace note markdown을 chunk 단위 vector index로 변환하는 규칙과 검색 결과 dedupe 정책을 설명한다.
- `sample-notes-rag-cli.md`: `sample_notes` markdown을 로컬 RAG 품질 테스트용으로 색인하고 질의하는 CLI 흐름을 설명한다.
- `vectorstore-embedding-model.md`: Spring AI Qdrant `VectorStore`가 Voyage embedding model을 사용하는 방식과 환경변수 설정을 설명한다.
