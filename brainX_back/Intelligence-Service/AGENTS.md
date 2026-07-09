# Agents Guide

## Project

`intelligence-service`는 BrainX Knowledge Intelligence API를 담당하는 Java 21 / Spring Boot 3.5 서비스입니다. 서비스 사양의 최상위 기준은 `../../contracts-v2/brainx-openapi.ssot.yaml`이고, 로컬 `src/main/resources/contracts/knowledge-intelligence.openapi.yaml`은 추출본입니다.

## Context Vault

세부 프로젝트 사양, task guide, workflow, worklog, decision note, durable improvement는 `vaults/INDEX.md`에서 필요한 문서만 골라 읽습니다. 루트 문서는 항상 따라야 하는 규칙과 읽기 순서만 유지합니다.

## Suggested Reading Order

1. `AGENTS.md`
2. `vaults/INDEX.md`
3. 현재 작업에 맞는 `vaults/agents/` 또는 `vaults/workflows/` 문서
4. 대상 코드와 관련 테스트
5. 반복 수정이나 재사용 가능한 agent-process 개선이 있으면 `vaults/durable/INDEX.md`

## Always Follow

- API 동작, endpoint, schema, 이벤트 coupling은 OpenAPI 계약을 먼저 확인합니다.
- 공개 API 계약 변경은 `../../contracts-v2/brainx-openapi.ssot.yaml`을 먼저 수정한 뒤 `scripts/extract_intelligence_openapi.py`로 로컬 추출본을 재생성합니다.
- OpenAPI 계약과 구현이 충돌하면 계약을 기준으로 불일치를 명시하고, 임의로 계약을 바꾸지 않습니다.
- 문서와 agent-facing guide는 기본적으로 한국어로 작성하되 code identifier, command, file path, API path, package name은 원문을 유지합니다.
- 기존 사용자 변경이나 생성된 파일은 되돌리지 않습니다.
- 루트 문서에 endpoint 목록, 배포 세부사항, 긴 작업 절차를 넣지 않습니다. 그런 내용은 `vaults/INDEX.md`에서 라우팅합니다.

## Completion Checklist

작업이 code, docs, configuration, tests, build artifacts를 실질적으로 바꾸면 final response 전에 다음을 수행합니다.

1. 관련 검증을 실행하거나, 문서 전용 변경 등 합리적인 사유로 생략했음을 명시합니다.
2. `vaults/workflows/worklog.md`에 따라 작업 로그를 남깁니다.
3. worklog 채널이 없으면 `vaults/worklogs/YYYY-MM.md`에 `YYYY-MM-DD HH:mm - <short title>` 형식으로 기록합니다.
4. final response에 변경 요약, 검증 결과, worklog 위치를 포함합니다.

## Closing The Loop

같은 correction이 반복되면 채팅에만 남기지 않습니다. `vaults/durable/INDEX.md`를 읽고 가장 작은 durable improvement 항목을 추가하거나 갱신한 뒤, 해당 규칙이 항상 적용되어야 할 때만 루트 guide, task guide, workflow guide, decision note, reusable skill로 승격합니다.

## Git Safety

- `git reset --hard`, `git checkout --`, 대량 삭제 같은 destructive command는 사용자가 명시적으로 요청한 경우에만 실행합니다.
- dirty worktree에서는 작업 범위 파일만 수정하고, 관련 없는 변경은 무시합니다.
