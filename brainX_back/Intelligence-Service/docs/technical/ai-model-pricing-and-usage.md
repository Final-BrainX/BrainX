# AI 모델 비용과 사용량 기록

이 문서는 Intelligence Service에서 BrainX 제공 AI 모델 catalog, 사용자별 availability, token usage/cost estimate를 어떻게 분리하는지 정리한다.

## 모델 Catalog와 Availability

- `AiModel` catalog는 BrainX 서비스가 제공할 수 있는 모델 전체 목록과 vendor token 단가를 가진다.
- 사용자별 사용 가능 여부는 catalog가 아니라 `AiModelAvailabilityPort`가 외부 entitlement/plan 도메인에서 판단한다.
- `GET /api/v1/ai/models` 응답은 기존 `models`와 `enabledModels`를 유지하면서 각 model item에 `enabled`를 함께 내려준다.
- 따라서 frontend는 모델 상세 표시에는 `models[]`의 비용/이름/provider를 쓰고, 선택 가능 여부는 `models[].enabled` 또는 기존 `enabledModels`로 확인할 수 있다.

## VendorTokenCost 필드

`VendorTokenCost`는 vendor 원가 추정을 위한 정규화된 단가다.

- `inputCostPer1kTokens`: cached가 아닌 input/prompt token 1,000개당 vendor 단가
- `cachedInputCostPer1kTokens`: cached input token 1,000개당 vendor 단가
- `outputCostPer1kTokens`: output/completion token 1,000개당 vendor 단가
- `currencyCode`: ISO 4217 currency code. 기본값은 `USD`

OpenAI prompt caching은 API usage의 `prompt_tokens_details.cached_tokens`로 cached input token 수를 보고한다. OpenAI pricing page도 input, cached input, output 단가를 분리해 게시한다. 이 프로젝트는 provider별 원문 단가 단위가 달라도 DB/catalog에는 `per 1k tokens`로 정규화해 저장한다.

## TokenUsageRecord 의미

`TokenUsageRecord`는 Commerce usage ledger로 전달할 event-first payload 모델이다. Intelligence Service는 billing ledger의 source of truth를 직접 소유하지 않는다. `brainx.events.producer.enabled=true`이면 `KafkaIntelligenceEventAdapter`가 `brainx.knowledge.intelligence.token-usage-recorded-requested.v1` topic으로 publish하고, 기본값 `false`에서는 local/test 실행을 위해 NoOp adapter가 사용된다.

- `inputTokens`: provider가 보고한 전체 prompt/input token 수
- `cachedInputTokens`: `inputTokens`에 포함된 cached input token 수
- `billableInputTokens`: 일반 input 단가가 적용되는 token 수. 기본 계산은 `inputTokens - cachedInputTokens`
- `outputTokens`: provider가 보고한 completion/output token 수
- `reasoningTokens`: provider가 보고하면 `outputTokens`에 포함된 reasoning token 수
- `totalTokens`: provider가 보고한 total token 수. 없으면 `inputTokens + outputTokens`
- `estimatedInputCost`, `estimatedCachedInputCost`, `estimatedOutputCost`: catalog 단가로 계산한 component별 vendor cost estimate
- `estimatedCost`: component cost가 모두 계산 가능할 때의 합계
- `costCurrency`: cost estimate currency. 모델 단가를 찾지 못하면 null

계산식은 다음과 같다.

```text
estimatedInputCost = billableInputTokens * inputCostPer1kTokens / 1000
estimatedCachedInputCost = cachedInputTokens * cachedInputCostPer1kTokens / 1000
estimatedOutputCost = outputTokens * outputCostPer1kTokens / 1000
estimatedCost = estimatedInputCost + estimatedCachedInputCost + estimatedOutputCost
```

`cachedInputCostPer1kTokens`가 null이면 해당 provider/model은 cached input 할인 단가가 없다고 보고 일반 input 단가를 사용한다.

## AiUsageRecorder 사용 규칙

AI 호출 결과를 Commerce usage ledger로 넘길 때 각 usecase/adapter가 직접 `TokenUsageRecord`를 만들지 않는다. 모든 실제 provider usage 기록은 `AiUsageRecorder`를 통해 생성한다.

- chat provider usage는 `recordChatUsage(userId, featureId, modelId, causationId, tokenUsage)`를 사용한다.
- embedding provider usage는 `recordEmbeddingUsage(userId, featureId, causationId, embeddingResponse)`를 사용한다. Voyage embedding의 `totalTokens`는 input token으로 기록한다.
- external search처럼 별도 usage DTO를 쓰는 adapter는 `recordRawUsage(...)`를 사용한다.
- `sourceService`는 `Intelligence-Service`로 고정한다.
- provider usage가 없거나 token count가 모두 불명확한 estimate-only 흐름은 Commerce ledger 이벤트를 발행하지 않는다.

Commerce-Service는 이 이벤트를 소비해 credit policy, ledger 저장, 기간별 token/credit usage 조회 API를 소유한다. Intelligence-Service는 별도 usage ledger DB나 public 조회 API를 만들지 않는다.

`AiRunRecorder`는 별도 책임이다. LLM run log, prompt key/version, preview, latency, feedback 연결을 저장하지만 Commerce billing event를 대체하지 않는다. 생성형 usecase는 provider 호출 주변에 `AiRunRecorder`를 붙이고, usage ledger가 필요한 경우에는 기존 featureId로 `AiUsageRecorder`도 호출한다.

## 현재 기록 범위

- `SampleRagService.ask(...)`: `AiChatPort.generate(...)` 응답의 token usage를 기록하고, catalog에 모델 단가가 있으면 estimated cost를 채운다. 개발용 RAG CLI 응답은 실행 중 기록된 query embedding/chat usage를 `usageRecords[]`에도 함께 노출한다.
- `AssistService.createInlineAssist(...)`: 사용자 기본 모델(`AiModelSettings.defaultModelId`)을 우선 사용하고 없으면 `brainx.assist.default-model`을 사용한다. `AiChatPort.generate(...)` 응답의 token usage를 `inline-assist-chat` featureId로 기록하고, catalog에 모델 단가가 있으면 estimated cost를 채운다.
- `LlmChatRouteDecider.decide(...)`: 본 채팅 1차 route classifier 호출 usage를 답변 생성 usage와 분리해 `chat-router-classifier` featureId로 기록한다. 기본 router model은 `brainx.chat.router.model` 또는 `BRAINX_CHAT_ROUTER_MODEL`로 지정하며 local/dev 기본값은 `gpt-5.4-nano`다.
- `ChatService.sendChatMessage(...)`: stream 기반 답변은 provider token usage를 직접 받지 못하므로 기존 `ChatTokenUsage` 추정값을 `rag-chat` featureId로 기록한다. fixed out-of-scope 안내처럼 실제 provider 호출이 없는 응답은 usage event와 `llmRunId`를 만들지 않는다.
- `OpenAiExternalSearchAdapter.search(...)`: OpenAI Responses API `web_search` 응답의 token usage를 `external-search-web` featureId로 기록하고, catalog에 모델 단가가 있으면 estimated cost를 채운다. web search tool call 자체의 별도 과금은 v1 catalog에 없으므로 token usage 중심으로만 기록한다.
- `ClusteringService.requestClusterJob(...)`: note card 기반 지식 구조 분석 LLM 호출에서 provider usage가 있으면 `ai-clustering-chat` featureId로 기록하고, catalog에 모델 단가가 있으면 estimated cost를 채운다.
- `InsightService.requestInsightReport(...)`: 지식 공백/추천사항 리포트 LLM 호출에서 provider usage가 있으면 `insight-report-chat` featureId로 기록하고, catalog에 모델 단가가 있으면 estimated cost를 채운다.
- `NoteAutoLinkService`: `VECTOR_LLM`의 LLM refine call은 `note-auto-link-vector-refine-chat`, `LLM_ONLY`의 LLM call은 `note-auto-link-llm-only-chat`, 애매한 자동 링크 후보의 relation verifier call은 `note-auto-link-relation-verifier-chat` featureId로 기록한다. dev CLI에서는 strategy별 usage recorder가 이 chat usage와 `VECTOR_LLM`의 `note-search-query-embedding` usage를 함께 캡처해 비용 비교 JSON에 포함한다.
- `QdrantNoteSearchIndexAdapter.search(...)` / `searchChunks(...)`: query embedding의 Voyage `usage.total_tokens`를 `note-search-query-embedding` usage로 기록하고, catalog에 단가가 있으면 estimated cost를 채운다.
- `QdrantNoteSearchIndexAdapter.replaceNoteChunks(...)` / `save(...)`: document embedding의 Voyage `usage.total_tokens`를 `note-search-index-embedding` usage로 기록하고, catalog에 단가가 있으면 estimated cost를 채운다.
- `ExplorationService.semanticSearch(...)`: query text 기반 token estimate는 entitlement와 public response `tokenEstimate`용으로만 유지한다. ledger usage record는 실제 provider usage가 있는 embedding adapter 경로에서 생성한다.

## LLMOps run log와 usage event

LLMOps run log는 `intelligence_llm_runs`에 저장되는 관측 데이터이고, Commerce usage event는 `TokenUsageRecordedRequested`로 publish되는 billing 입력 데이터다.

| 항목 | 소유 | 목적 |
| --- | --- | --- |
| `AiRunRecorder` / `intelligence_llm_runs` | Intelligence-Service | prompt/version, latency, preview, error, token/cost estimate, feedback 기준 `llmRunId` |
| `AiUsageRecorder` / `TokenUsageRecordedRequested` | Intelligence-Service publish, Commerce consume | credit/ledger/billing 집계 입력 |
| credit policy, 기간별 사용량 조회 | Commerce-Service | vendor cost에 policy multiplier를 적용한 credit ledger와 user-facing usage API |

run log와 usage event는 같은 AI 호출에서 둘 다 발생할 수 있다. 다만 LLMOps run log가 있다고 해서 반드시 Commerce ledger 이벤트가 있다는 뜻은 아니다. provider usage가 없거나 billing 대상이 아닌 내부 평가 호출은 run log만 남길 수 있다.

## Local/dev Seed Data

`local`과 `dev-ui` profile에서는 개발 편의를 위해 `ai_models` catalog에 sample RAG와 chat router에서 쓰는 OpenAI chat model, Voyage embedding model 단가를 seed한다. provider 단가표가 1,000,000 token 기준이면 이 프로젝트의 정규화 기준인 1,000 token당 단가로 나누어 저장한다.

OpenAI chat seed:

| modelId | provider | inputCostPer1kTokens | cachedInputCostPer1kTokens | outputCostPer1kTokens | currencyCode |
| --- | --- | ---: | ---: | ---: | --- |
| `gpt-5.4-mini` | `openai` | `0.000750` | `0.000075` | `0.004500` | `USD` |
| `gpt-5.4-nano` | `openai` | `0.000750` | `0.000075` | `0.004500` | `USD` |

Voyage embedding seed:

| modelId | provider | inputCostPer1kTokens | cachedInputCostPer1kTokens | outputCostPer1kTokens | currencyCode |
| --- | --- | ---: | ---: | ---: | --- |
| `voyage-4-large` | `voyage` | `0.000120` | null | null | `USD` |
| `voyage-4` | `voyage` | `0.000060` | null | null | `USD` |
| `voyage-4-lite` | `voyage` | `0.000020` | null | null | `USD` |
| `voyage-context-3` | `voyage` | `0.000180` | null | null | `USD` |

local/dev H2 실행은 `LocalAiModelSeedData`가 채우고, 운영 PostgreSQL catalog는 Flyway repeatable migration `R__seed_ai_model_catalog.sql`이 채운다. RAG CLI의 실제 provider 호출 모델은 `OPENAI_CHAT_MODEL`, `VOYAGE_EMBEDDING_MODEL`, `brainx.dev.sample-rag.chat-model` 같은 runtime 설정이 결정하고, DB catalog는 usage record의 cost estimate와 모델 메타데이터 조회에 사용한다.

## 운영 DB Migration

운영 DB schema는 Flyway migration으로 적용한다. 기본 profile은 `spring.jpa.hibernate.ddl-auto=validate`이므로 entity와 migration이 불일치하면 service startup validation에서 실패한다.

`ai_models`에 필요한 추가 컬럼:

```sql
alter table ai_models
  add column vendor_cached_input_cost_per_1k_tokens numeric(12, 6),
  add column vendor_cost_currency varchar(3) not null default 'USD';
```

기존 catalog row의 `vendor_input_cost_per_1k_tokens`, `vendor_output_cost_per_1k_tokens`, `vendor_cached_input_cost_per_1k_tokens` 값은 모두 1,000 token 기준으로 정규화해야 한다. BrainX가 실제로 제공하는 모든 modelId는 이 catalog에 seed/migration으로 들어가야 하며, availability는 catalog modelId를 기준으로 resolve한다.
