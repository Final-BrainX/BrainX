# Intelligence Service Contracts

이 디렉터리는 Intelligence Service가 소유하거나 소비하는 계약 슬라이스를 둔다. 원천 SSOT는 상위 repository의 `contracts-v2`이며, 이 디렉터리의 YAML은 서비스 작업자가 바로 확인할 수 있도록 추출한 사본이다.

## Files

- `knowledge-intelligence.openapi.yaml`: 이 서비스가 provider인 REST API 계약. `x-producer-service: knowledge-intelligence` 또는 `Knowledge Intelligence` tag 기준으로 추출한다.
- `knowledge-intelligence.consumed.openapi.yaml`: 이 서비스가 consumer인 동기 내부 REST API 계약. `x-consumers[].id: internal.knowledge-intelligence` 기준으로 추출한다.
- `knowledge-intelligence.asyncapi.yaml`: 이 서비스가 producer 또는 consumer인 이벤트 계약. AsyncAPI SSOT에서는 Intelligence Service가 `Intelligence-Service`로 표기되어 있어 `x-producer-service: Intelligence-Service` 또는 `x-consumer-services`에 `Intelligence-Service`가 포함된 channel을 추출한다.

## Regeneration

```powershell
uv run --no-project --with PyYAML python scripts\extract_intelligence_openapi.py
uv run --no-project --with PyYAML python scripts\extract_intelligence_related_contracts.py
```

`brainx-openapi.ssot.yaml`에 merge conflict marker가 남아 있으면 두 스크립트 모두 기본적으로 `--conflict-side right`를 사용한다.
