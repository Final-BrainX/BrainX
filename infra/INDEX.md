# Infra Documentation Index

`infra/` 작업자는 루트 `AGENTS.md`를 먼저 읽고, 다음 문서 중 현재 작업에 필요한 것만 추가로 읽는다.

## Core Guides

- [`AGENTS.md`](AGENTS.md): infra 하위 작업의 항상 적용되는 agent 규칙, 검증, worklog 완료 루프.
- [`DEPLOYMENT_FROM_SCRATCH.md`](DEPLOYMENT_FROM_SCRATCH.md): 새 AWS 계정·새 dev 환경에서 Terraform backend bootstrap부터 SSM, GitHub Variables, 첫 전체 deploy, public 검증까지 수행하는 순서형 가이드.
- [`aws-dev/README.md`](aws-dev/README.md): AWS 개발환경 전체 배포 가이드. Terraform, GitHub Actions, EC2/SSM, Docker Compose, 도메인, S3 asset bucket, 비용 제어를 포함한다.
- [`aws-dev/runtime-environment.md`](aws-dev/runtime-environment.md): AWS dev runtime 환경변수/secret 운영 가이드. SSM 재설정, 새 env 추가, `NEXT_PUBLIC_*`, GitHub variables, 팀원 IAM 접근, AI agent 수정 규칙을 포함한다.
- [`aws-dev/troubleshooting.md`](aws-dev/troubleshooting.md): AWS dev 배포 장애 표준 runbook. GitHub Actions run 겹침, SSM 진단, 복구, 재발방지 concurrency 설정을 포함한다.

## Code Areas

- [`aws-dev/terraform/`](aws-dev/terraform/): AWS dev 리소스 정의. EC2, RDS, ECR, S3, IAM, Security Group, Terraform backend 출력값을 관리한다.
- [`aws-dev/deploy/`](aws-dev/deploy/): EC2에서 실행되는 Docker Compose와 Caddy 설정.
- [`aws-dev/scripts/`](aws-dev/scripts/): GitHub Actions가 SSM으로 호출하는 원격 배포 스크립트와 변경 감지 스크립트.
- [`.github/workflows/brainx-dev-deploy.yml`](../.github/workflows/brainx-dev-deploy.yml): main push 또는 manual dispatch 기반 AWS dev 배포 workflow.

## Task Routing

- **도메인/HTTPS 변경**: `aws-dev/README.md`의 `External DNS And HTTPS`, `aws-dev/deploy/Caddyfile`, Terraform security group, GitHub variables를 확인한다.
- **S3/파일 저장 인프라**: `aws-dev/README.md`의 `User Asset S3 Bucket`, Terraform `aws_s3_bucket.assets`, EC2 runtime IAM policy를 확인한다.
- **비용 제어**: `aws-dev/README.md`의 `Cost Control`, Terraform `ec2_runtime_state`, `rds_runtime_state`를 확인한다.
- **환경변수/secret 변경**: `aws-dev/runtime-environment.md`, `aws-dev/scripts/deploy_remote.sh`, `aws-dev/deploy/docker-compose.yml`, 필요 시 workflow/Dockerfile을 함께 확인한다.
- **CI/CD 변경/장애 대응**: workflow, `aws-dev/scripts/deploy_remote.sh`, `aws-dev/scripts/detect_changed_services.py`, `aws-dev/deploy/docker-compose.yml`, `aws-dev/troubleshooting.md`를 함께 확인한다.
- **실제 AWS apply/deploy**: Terraform plan 또는 GitHub Actions run URL과 결과를 `worklogs/`에 남긴다.

## Worklogs

- [`worklogs/2026-06.md`](worklogs/2026-06.md): 2026년 6월 infra 작업 로그.

새 worklog 파일은 `worklogs/YYYY-MM.md` 이름으로 만들고, 각 항목은 `YYYY-MM-DD HH:mm - <short title>` 형식을 사용한다.
