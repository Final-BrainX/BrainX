# 외부 자료 검색 v1

이 문서는 Intelligence Service에서 public REST API 없이 내부 기능과 CLI용으로 외부 자료 검색을 제공하는 방식을 정리한다.

## 결정사항

- v1 provider는 OpenAI Responses API의 hosted `web_search` tool을 사용한다.
- application code는 `ExternalSearchPort`만 의존하고, provider별 HTTP 호출은 infrastructure adapter가 담당한다.
- 검색 결과 저장소는 만들지 않는다. RAG chat 세션에 붙일 때 필요한 citation persistence는 chat 구현 단계에서 추가한다.
- public OpenAPI 계약은 변경하지 않는다. 지금은 CLI와 이후 RAG chat router의 내부 dependency로만 사용한다.

OpenAI 문서는 신규 web search 통합에는 Responses API의 `web_search` tool 사용을 권장한다. 출처 목록은 Responses API `include`에 `web_search_call.action.sources`를 넣어 받을 수 있고, 답변에는 `url_citation` annotation이 포함될 수 있다.

## 구조

```text
ExternalSearchApplicationRunner 또는 future ChatService
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
    timeout: ${BRAINX_EXTERNAL_SEARCH_TIMEOUT:20s}
    openai:
      api-key: ${OPENAI_API_KEY:}
      base-url: ${OPENAI_BASE_URL:https://api.openai.com}
      model: ${OPENAI_WEB_SEARCH_MODEL:gpt-5.5}
```

`provider=openai`이어도 `OPENAI_API_KEY`가 비어 있으면 `NoOpExternalSearchAdapter`가 등록된다. 로컬과 테스트 환경에서 외부 호출 없이 context load를 유지하기 위한 정책이다.

## CLI

단일 질의:

```powershell
.\gradlew.bat --no-daemon bootRun --args="--spring.profiles.active=local --brainx.dev.external-search.enabled=true --brainx.dev.external-search.query='오늘 OpenAI Responses web_search 변경점은?'"
```

stdin loop:

```powershell
.\gradlew.bat --no-daemon bootRun --args="--spring.profiles.active=local --brainx.dev.external-search.enabled=true"
```

CLI 출력은 JSON이며 `query`, `answer`, `sources`, `provider`, `modelId`, `tokenUsage`, `responseId`를 포함한다.

필요하면 CLI에서 domain filter를 지정할 수 있다.

```powershell
$env:BRAINX_DEV_EXTERNAL_SEARCH_ALLOWED_DOMAINS = "developers.openai.com,platform.openai.com"
```

## Usage와 비용

OpenAI response usage가 있으면 `TokenUsagePort`에 `featureId=external-search-web`으로 기록한다.

- `inputTokens`, `outputTokens`, `totalTokens`: OpenAI Responses usage 기준
- `cachedInputTokens`: `input_tokens_details.cached_tokens`
- `reasoningTokens`: `output_tokens_details.reasoning_tokens`
- estimated cost: `ai_models` catalog의 `VendorTokenCost` 기준

OpenAI web search tool call 자체의 별도 단가는 현재 catalog 모델에 없다. v1은 token usage 중심으로 기록하고, tool-call 단가가 필요하면 후속 catalog/usage schema에서 확장한다.

## RAG Chat 연결 방향

RAG chat router는 이후 `ExternalSearchPort`를 note retrieval과 같은 tool 후보로 붙이면 된다.

- `NOTES`: 기존 Qdrant note chunk retrieval
- `WEB`: `ExternalSearchPort`
- `BOTH`: note context와 web answer/source를 함께 prompt context로 구성

v1 외부 검색은 저장소를 만들지 않으므로 chat에서 답변을 저장할 때 web sources를 assistant message citation payload로 함께 저장해야 한다.
