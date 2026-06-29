# Infra Agents Guide

## Purpose

이 문서는 `infra/` 하위 작업의 항상 적용되는 규칙만 둔다. 배포 세부사항, 리소스 목록, 실행 명령, 작업 기록은 `INDEX.md`에서 필요한 문서로 라우팅한다.

## Required Reading

1. 저장소 루트 `AGENTS.md`
2. `infra/INDEX.md`
3. 현재 작업 대상 문서나 코드
   - AWS dev 배포/도메인/CI/CD/Terraform: `aws-dev/README.md`
   - Terraform 코드: `aws-dev/terraform/`
   - 배포 bundle/Compose/SSM 스크립트: `aws-dev/deploy/`, `aws-dev/scripts/`

## Working Rules

- Terraform state는 S3 backend 기준으로 다룬다. state backend, lock, import, apply 전후 변경 범위를 명확히 확인한다.
- 비용이 발생하거나 외부 상태를 바꾸는 명령(`terraform apply`, GitHub Actions deploy, AWS 리소스 생성/삭제)은 실행 전 plan 또는 영향 범위를 먼저 확인한다.
- secrets, API key, password, token 값은 repo-tracked 파일에 쓰지 않는다. 런타임 비밀값은 SSM Parameter Store 또는 Secrets Manager를 우선한다.
- `infra/aws-dev/terraform/terraform.tfvars`는 로컬 적용용 파일이며 커밋하지 않는다.
- 앱 계약 또는 공개 API를 바꾸는 작업이 아니면 SSOT YAML을 수정하지 않는다. 다만 루트 규칙상 SSOT와 충돌하지 않는지 확인한다.
- 기존 사용자 변경이 섞여 있으면 작업 범위 파일만 수정하고, 관련 없는 변경은 되돌리지 않는다.

## Completion Checklist

infra 작업이 문서, Terraform, workflow, deploy script를 바꾸면 완료 전에 다음을 수행한다.

1. 관련 검증을 실행한다.
   - Terraform: `terraform fmt -check -recursive`, `terraform validate`, 필요 시 `terraform plan`
   - Docker/Caddy: `docker compose ... config --quiet`, `caddy validate`
   - GitHub/AWS 배포: run URL, endpoint, SSM 또는 AWS CLI 확인 결과 기록
2. `infra/worklogs/YYYY-MM.md`에 `YYYY-MM-DD HH:mm - <short title>` 형식으로 작업 로그를 남긴다.
3. final response에 변경 요약, 검증 결과, apply/deploy 여부, worklog 위치를 포함한다.

## Documentation Boundaries

- `infra/AGENTS.md`: 항상 적용되는 짧은 규칙과 완료 루프만 둔다.
- `infra/INDEX.md`: infra 문서와 작업별 읽기 경로를 안내한다.
- `infra/aws-dev/README.md`: AWS dev 배포 구조, Terraform 변수, GitHub variables, 운영 명령을 둔다.
- `infra/worklogs/`: infra 작업 이력과 검증 결과를 월별로 기록한다.
