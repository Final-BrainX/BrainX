# BrainX API SSOT 패키지

생성일: 2026-06-16

파일 구성:

- `brainx-openapi.ssot.yaml` — public REST API와 내부 동기 service API 명세. operation 단위의 `x-consumers`, `x-producer-service`, `x-produces-events`, `x-internal-sync-calls`, `x-visibility`, `x-async-boundary` 정보를 포함한다.
- `brainx-asyncapi.ssot.yaml` — service-to-service event contract 명세. event channel, message, payload schema, producer service, consumer service, delivery/idempotency metadata를 포함한다.

명세에 반영된 주요 아키텍처 결정:

1. Browser/external client는 `/api/v1/**`만 호출한다.
2. Service-to-service 동기 API는 `/internal/v1/**` 하위로 격리한다.
3. Support API는 `/api/v1/support/tickets`로 통합한다. `/support/inquiries`는 의도적으로 제외한다.
4. 중복된 member deletion cancel API는 의도적으로 제외한다.
5. `POST /api/v1/publish-jobs`는 `202 Accepted`를 반환한다.
6. AI suggestion decision은 `ACCEPTED`, `REJECTED`, `REGENERATED` 모두 `AiSuggestionDecisionRecorded`를 사용한다.
7. Token usage는 `TokenUsageRecordedRequested`, `TokenUsageRecorded` event 기반으로 처리한다. public token-usage command API는 노출하지 않는다.
8. Workspace는 note ledger의 authoritative source로 유지한다. import, extension, MCP, AI mutation은 Workspace command API를 통해 처리한다.

권장 검증 명령:

```bash
npx @redocly/cli lint brainx-openapi.ssot.yaml
npx @asyncapi/cli validate brainx-asyncapi.ssot.yaml
```

로컬 문서 서버:

Spring backend에서 자주 쓰는 `8080`, `8081`과 겹치지 않도록 문서 서버는 `18080`, `18081`을 사용한다.
아래 명령은 이 `contracts-v2` 디렉터리에서 실행한다고 가정한다.

OpenAPI / Swagger UI:

```powershell
npx --yes swagger-ui-watcher .\brainx-openapi.ssot.yaml -p 18080 -h 127.0.0.1 --no-open
```

브라우저에서 <http://127.0.0.1:18080>을 연다.

AsyncAPI 문서:

```powershell
npx --yes http-server . -p 18081 -a 127.0.0.1
```

브라우저에서 <http://127.0.0.1:18081/brainx-asyncapi.html>을 연다.
