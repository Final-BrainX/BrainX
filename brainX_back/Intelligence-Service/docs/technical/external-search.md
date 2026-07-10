# 외부 자료 검색 v1

이 문서는 Intelligence Service에서 public REST API 없이 내부 기능과 CLI용으로 외부 자료 검색을 제공하는 방식을 정리한다.

## 결정사항

- v1 provider는 OpenAI Responses API의 hosted `web_search` tool을 streaming 모드로 사용한다.
- 기본 web search model은 `gpt-5.4-mini`이며, `OPENAI_WEB_SEARCH_MODEL`을 명시하면 해당 값이 우선한다.
- application code는 `ExternalSearchPort`만 의존하고, provider별 HTTP 호출은 infrastructure adapter가 담당한다.
- 검색 결과 저장소는 만들지 않는다. `/chat`에서 사용한 웹 출처는 assistant chat message의 `webSources` JSON payload로 저장한다.
- 독립 external-search public endpoint는 만들지 않는다. public OpenAPI 변경은 chat message 응답의 `webSources` 필드에 한정한다.

OpenAI 문서는 신규 web search 통합에는 Responses API의 `web_search` tool 사용을 권장한다. 출처 목록은 Responses API `include`에 `web_search_call.action.sources`를 넣어 받을 수 있고, 답변에는 `url_citation` annotation이 포함될 수 있다. Chat SSE 경로는 OpenAI stream의 진행 이벤트와 누적 출처를 `web_search_progress`, `web_sources`로 브라우저에 전달한다.

## 구조

```text
ExternalSearchApplicationRunner 또는 ChatService
  -> ExternalSearchPort
    -> OpenAiExternalSearchAdapter
      -> OpenAI /v1/responses
      -> web_search tool
    -> NoOpExternalSearchAdapter
```

`ExternalSearchPort`의 출력은 “답변 + 출처” 형태다.

- `answer`: provider가 web search를 사용해 생성한 답변
- `sources`: title, url, snippet, rank
- `provider`: `openai` 또는 `none`
- `modelId`: 호출에 사용한 model
- `responseId`: OpenAI response id
- `tokenUsage`: provider usage와 catalog 기반 cost estimate

## 설정

```yaml
brainx:
  external-search:
    provider: ${BRAINX_EXTERNAL_SEARCH_PROVIDER:none}
    max-sources: ${BRAINX_EXTERNAL_SEARCH_MAX_SOURCES:8}
    timeout: ${BRAINX_EXTERNAL_SEARCH_TIMEOUT:60s}
    search-context-size: ${BRAINX_EXTERNAL_SEARCH_CONTEXT_SIZE:low}
    openai:
      api-key: ${OPENAI_API_KEY:}
      base-url: ${OPENAI_BASE_URL:https://api.openai.com}
      model: ${OPENAI_WEB_SEARCH_MODEL:gpt-5.4-mini}
```

`provider=openai`이어도 `OPENAI_API_KEY`가 비어 있으면 `NoOpExternalSearchAdapter`가 등록된다. 로컬과 테스트 환경에서 외부 호출 없이 context load를 유지하기 위한 정책이다. `search-context-size`는 `low | medium | high`를 받으며 blank/unknown 값은 `low`로 정규화한다.

## CLI

단일 질의:

```powershell
.\gradlew.bat --no-daemon bootRun --args="--spring.profiles.active=local --brainx.dev.external-search.enabled=true --brainx.dev.external-search.query='오늘 OpenAI Responses web_search 변경점은?'"
```

stdin loop:

```powershell
.\gradlew.bat --no-daemon bootRun --args="--spring.profiles.active=local --brainx.dev.external-search.enabled=true"
```

CLI 출력은 JSON이며 `query`, `answer`, `sources`, `provider`, `modelId`, `tokenUsage`, `responseId`를 포함한다. CLI는 최종 결과만 출력하고, `/chat` SSE는 검색 중 진행 상태와 source 도착 시점을 별도 이벤트로 노출한다.

필요하면 CLI에서 domain filter를 지정할 수 있다.

```powershell
$env:BRAINX_DEV_EXTERNAL_SEARCH_ALLOWED_DOMAINS = "developers.openai.com,platform.openai.com"
```

Streaming smoke:

```powershell
.\gradlew.bat --no-daemon bootRun --args="--spring.profiles.active=local --brainx.dev.external-search.enabled=true --brainx.dev.external-search.stream-events=true --brainx.dev.external-search.query='오늘 OpenAI Responses web_search 변경점은?'"
```

`stream-events=true` mode adds `streamEvents` to the CLI JSON. Each item records `eventType`, `status`, `actionType`, `query`, `message`, `sourceCount`, and `sources`, while the top-level response keeps the final `answer`, `sources`, `provider`, `modelId`, `tokenUsage`, and `responseId`.

## Batch Capture

실제 provider 검색 품질은 dev-only helper로 batch capture한다.

```powershell
uv run --no-project python scripts\capture_external_search_cli.py --run-name 20260626-external-search-quality
```

Streaming event capture:

```powershell
uv run --no-project python scripts\capture_external_search_cli.py --run-name 20260708-external-search-stream-smoke --stream-events --timeout-seconds 300
```

When `--stream-events` is set, each scenario also requires stream events, a progress event, a source signal, and a completed event. The report records `streamEventCount`, `firstSourceEvent`, and `completedEvent`.

이 script는 실행 전 `.brainx-local.properties` 또는 환경변수의 `OPENAI_API_KEY`를 확인한다. 없으면 provider 호출 없이 exit code `2`로 실패 report를 남긴다. scenario별로 `allowedDomains`, `blockedDomains`, `minSourceCount`, `requiredSourceDomains`, `forbiddenSourceDomains`, `answerMustContain`, `requireTokenUsage`를 검증하고 실패 시 exit code `1`을 반환한다.

출력 위치는 `build/external-search-captures/<run-id>/`이며 `summary.json`, `responses.jsonl`, `report.md`, `raw/*.stdout.txt`, `raw/*.stderr.txt`를 남긴다.

## Usage와 비용

OpenAI response usage가 있으면 `TokenUsagePort`에 `featureId=external-search-web`으로 기록한다.

- `inputTokens`, `outputTokens`, `totalTokens`: OpenAI Responses usage 기준
- `cachedInputTokens`: `input_tokens_details.cached_tokens`
- `reasoningTokens`: `output_tokens_details.reasoning_tokens`
- estimated cost: `ai_models` catalog의 `VendorTokenCost` 기준

OpenAI web search tool call 자체의 별도 단가는 현재 catalog 모델에 없다. v1은 token usage 중심으로 기록하고, tool-call 단가가 필요하면 후속 catalog/usage schema에서 확장한다.

## RAG Chat 연결

RAG chat router는 최종 intent route와 별도로 `requiresWebSearch`, `webSearchQuery`를 반환한다. `ChatService`는 `requiresWebSearch=true`일 때 사용자 질문 전체가 아니라 router가 만든 짧은 `webSearchQuery`만 `ExternalSearchPort`로 보낸다.

- `NOTES`: 기존 Qdrant note chunk retrieval
- `WEB`: `ExternalSearchPort`
- `BOTH`: note context와 web answer/source를 함께 prompt context로 구성

provider가 `none`이거나 검색에 실패하면 최신 사실을 추측하지 않고 안내 답변을 저장한다. 검색에 성공하면 검색 결과의 `answer`와 `sources`를 최종 채팅 답변 LLM prompt의 context로 전달한다. 따라서 사용자 문체, 대화 이력, 노트/클라이언트 context와 route별 답변 규칙을 적용하는 기존 최종 생성 단계는 유지되며, 순수 최신정보 조회도 같은 단계를 거친다. 생성된 assistant message에는 웹 출처를 `webSources`로 저장하고, 프론트는 AI 메시지 아래에 `근거 노트`와 `웹 출처`를 별도 섹션으로 표시한다.
