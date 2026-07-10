# LLM 품질 상세 평가

이 디렉터리는 실제 provider 호출로 수행한 기능별 품질 평가의 상세 기록을 보관합니다. 각 문서는 실행 당시의 corpus, model, timeout, prompt를 반영한 역사적 snapshot이므로 현재 API·이벤트 계약이나 runtime default는 계약 문서와 관련 기능 문서에서 다시 확인합니다.

- [RAG 품질 상세 평가 - 2026-06-26](rag-quality-evaluation-2026-06-26.md): `sample_notes` 21개 기반 retrieval/chat의 근거, citation, context 품질을 확인합니다.
- [Chat Router 품질 상세 평가 - 2026-06-26](chat-router-quality-evaluation-2026-06-26.md): `NOTE_QA`, `WORKSPACE_SEARCH`, `COMPOSE`, `NOTE_ACTION`, `OUT_OF_SCOPE` route 판정을 확인합니다.
- [External Search 품질 상세 평가 - 2026-06-26](external-search-quality-evaluation-2026-06-26.md): OpenAI Responses `web_search`와 내부 노트 결합 질의를 확인합니다.
- [Inline Assist 품질 상세 평가 - 2026-06-26](inline-assist-quality-evaluation-2026-06-26.md): `SUMMARIZE`, `REWRITE`, `CONTINUE`, `TRANSLATE` 출력 품질을 확인합니다.
- [Connection 품질 상세 평가 - 2026-06-26](connection-quality-evaluation-2026-06-26.md): link suggestion과 bridge concept의 추천 품질을 확인합니다.
- [StyleProfile LLM 품질 평가 - 2026-07-04](style-profile-quality-evaluation-2026-07-04.md): `conversationTone`과 `writingStyle` 반영 품질을 확인합니다.

요약 보고서와 현재 기능 문서는 상위 [기술 문서 인덱스](../README.md)에서 찾습니다.
