# BrainX AWS Dev 처음부터 배포하기

이 문서는 빈 AWS 계정 또는 새 BrainX dev 환경에 **현재 저장소의 실제 배포 경로**를 처음부터 준비하는 절차다.

```text
Terraform
  -> EC2, RDS, ECR, S3, IAM/OIDC, SSM 접근 권한
  -> SSM Parameter Store + RDS Secrets Manager
  -> GitHub Actions
  -> ECR image + S3 deploy bundle
  -> SSM Run Command
  -> EC2 Docker Compose + Caddy HTTPS
```

기준 구현은 [`aws-dev/README.md`](aws-dev/README.md), [`aws-dev/runtime-environment.md`](aws-dev/runtime-environment.md), [`.github/workflows/brainx-dev-deploy.yml`](../.github/workflows/brainx-dev-deploy.yml)이다. 이 문서는 첫 배포 순서와 확인 지점에 집중하며, 실제 secret 값은 절대 저장소나 GitHub Variables에 넣지 않는다.

## 0. 범위와 사전 조건

이 가이드는 `ap-northeast-2`의 단일 EC2 + RDS PostgreSQL 기반 AWS dev 환경을 만든다. 배포된 EC2에서는 Docker Compose가 backend, frontend, Redis, Neo4j, Qdrant, Kafka, Caddy와 관측 스택을 실행한다.

- Kubernetes 매니페스트는 현재 준비 자산이므로 이 첫 배포 절차에는 사용하지 않는다.
- Terraform state bucket은 이 Terraform stack **밖에서 한 번** bootstrap한다.
- 완전한 public 배포에는 메인·관리자 도메인과 HTTPS 인증용 이메일이 필요하다. 현재 GitHub Actions preflight는 두 public URL과 두 site address가 모두 있어야 배포를 진행한다.
- `terraform apply`, DNS 변경, GitHub Actions deploy는 AWS 비용 또는 외부 상태를 바꾼다. 실행 전 `terraform plan`과 대상 계정·리전을 확인한다.

로컬 도구:

- Git, Terraform, AWS CLI v2, GitHub CLI(`gh`)
- AWS 계정의 Terraform/IAM/RDS/EC2/ECR/S3/SSM 권한
- GitHub 저장소 관리자 권한(Repository Variables와 Actions OIDC)
- 메인 도메인과 관리자 서브도메인을 수정할 수 있는 DNS 권한

```powershell
git clone https://github.com/Final-BrainX/BrainX.git
Set-Location BrainX
git switch main
git pull --ff-only origin main

aws configure --profile brainx-dev
aws sts get-caller-identity --profile brainx-dev
gh auth status
```

이후 예시는 PowerShell 기준이다. 사용할 AWS profile과 region을 먼저 고정한다.

```powershell
$env:AWS_PROFILE = "brainx-dev"
$env:AWS_REGION = "ap-northeast-2"
```

## 0-1. 팀원별 독립 배포: fork가 필요한가?

각자가 자신의 AWS 환경에 독립적으로 배포하려면 **fork를 권장한다**. 이 배포 경로는 GitHub Actions OIDC role을 `github_repository`에 연결하고, GitHub Repository Variables도 저장소별로 읽으므로 원본 저장소를 공유하면 배포 권한·변수·workflow run이 섞일 수 있다.

| 목표 | fork 필요 여부 | 권장 방법 |
| --- | --- | --- |
| 로컬 Docker Compose 실행·코드 실습 | 필수 아님 | 원본을 clone하거나 fork를 clone한다. |
| 각자 AWS dev 환경에 독립 배포 | 권장 | 각자 fork 후 자신의 fork `main`에서 GitHub Actions를 실행한다. |
| 팀 공용 AWS dev 환경에 함께 배포 | 불필요 | 원본 저장소의 단일 workflow만 사용하고 deploy run을 병렬 실행하지 않는다. |

개인 fork를 만들었다면 다음처럼 clone하고, 필요할 때만 원본을 `upstream`으로 추가한다.

```powershell
git clone https://github.com/<your-github-id>/BrainX.git
Set-Location BrainX
git remote add upstream https://github.com/Final-BrainX/BrainX.git
git fetch upstream
```

`terraform.tfvars`에는 자신의 fork와 인프라 식별자를 설정한다.

```hcl
github_repository = "<your-github-id>/BrainX"
github_branch     = "main"

project_name         = "brainx-<your-id>"
environment          = "dev-<your-id>"
ssm_parameter_prefix = "/brainx/<your-id>/dev"

public_domain_name = "<your-id>.example.com"
admin_domain_name  = "admin.<your-id>.example.com"
```

가장 안전한 구성은 **각자 AWS 계정 + 각자 fork + 각자 state bucket**이다. 같은 AWS 계정을 공유해야 한다면 아래 값은 반드시 사람별로 고유해야 한다.

- Terraform state S3 bucket과 state key
- `project_name`, `environment`, `ssm_parameter_prefix`
- public/admin domain, asset bucket 이름, GitHub Repository Variables
- EC2, RDS, ECR, S3에 생성되는 Terraform resource 이름

Terraform state, `terraform.tfvars`, `.env`, SSM SecureString, RDS Secrets Manager credential, 기존 GitHub Variables 값을 다른 사람에게 복사하지 않는다. 각 fork에서 [1. Terraform state bucket bootstrap](#1-terraform-state-bucket-bootstrap)부터 별도로 수행하고, [4. 첫 runtime secret 등록](#4-첫-runtime-secret-등록)과 [5. GitHub Repository Variables 설정](#5-github-repository-variables-설정)도 자신의 AWS 자원 기준으로 다시 설정한다.

## 1. Terraform state bucket bootstrap

`infra/aws-dev/terraform/backend.tf`의 bucket은 Terraform 자체가 만들 수 없다. 새 환경에서는 고유한 bucket을 먼저 만든 뒤 [`backend.tf.example`](aws-dev/terraform/backend.tf.example)를 복사해 사용한다.

```powershell
$stateBucket = "<globally-unique-terraform-state-bucket>"

aws s3api create-bucket `
  --bucket $stateBucket `
  --region $env:AWS_REGION `
  --create-bucket-configuration LocationConstraint=$env:AWS_REGION

aws s3api put-bucket-versioning `
  --bucket $stateBucket `
  --versioning-configuration Status=Enabled

aws s3api put-public-access-block `
  --bucket $stateBucket `
  --public-access-block-configuration BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true

aws s3api put-bucket-encryption `
  --bucket $stateBucket `
  --server-side-encryption-configuration '{"Rules":[{"ApplyServerSideEncryptionByDefault":{"SSEAlgorithm":"AES256"}}]}'
```

```powershell
Set-Location infra\aws-dev\terraform
Copy-Item backend.tf.example backend.tf -Force
Copy-Item terraform.tfvars.example terraform.tfvars -Force
```

`backend.tf`의 `bucket`을 위 bucket 이름으로 바꾸고, `terraform.tfvars`에서 최소 다음을 실제 값으로 수정한다. `terraform.tfvars`는 로컬 전용이며 커밋하지 않는다.

```hcl
github_repository = "<GitHub owner/repository>"
github_branch     = "main"

public_domain_name = "app.example.com"
admin_domain_name  = "admin.app.example.com"
acme_email         = "ops@example.com"

# 가능하면 운영자의 공인 IP/CIDR만 허용한다.
allowed_http_cidr_blocks = ["<trusted-cidr>"]
```

`github_oidc_provider_arn`은 계정에 이미 GitHub Actions OIDC provider가 있을 때만 설정한다. 비워 두면 Terraform이 account-wide provider를 만든다. 다른 프로젝트가 이미 provider를 사용 중이면 새로 만들지 말고 기존 ARN을 사용한다.

## 2. AWS 인프라 생성

먼저 상태 backend와 provider를 초기화하고, 계획 결과에서 비용이 드는 EC2·RDS, public ingress, ECR repository, S3 bucket의 변경을 검토한다.

```powershell
terraform init -reconfigure
terraform fmt -check -recursive
terraform validate
terraform plan -out tfplan
terraform apply tfplan
```

이 apply는 다음 핵심 리소스를 만든다.

- Elastic IP가 연결된 EC2와 SSM 관리 권한
- RDS PostgreSQL 및 Secrets Manager master credential
- 각 deployable service의 ECR repository
- deploy artifact bucket과 private asset bucket
- GitHub Actions OIDC role 및 최소 배포 권한

apply가 끝나면 필요한 출력값을 확인한다. RDS credential 원문은 `terraform output`으로 출력하거나 GitHub에 복사하지 않는다.

```powershell
terraform output aws_region
terraform output ec2_instance_id
terraform output ec2_public_ip
terraform output ecr_repository_urls
terraform output rds_address
terraform output ssm_parameter_prefix
```

## 3. DNS와 HTTPS 준비

Terraform output의 Elastic IP로 외부 DNS provider에 두 A record를 만든다.

```text
<public_domain_name>       A  <terraform output -raw ec2_public_ip>
<admin_domain_name>        A  <terraform output -raw ec2_public_ip>
```

DNS 전파를 확인한 뒤 첫 deploy를 진행한다. Caddy가 EC2의 `80`/`443`에서 ACME 인증서를 발급하므로, record가 아직 없거나 다른 IP를 가리키면 HTTPS가 정상화되지 않는다.

```powershell
nslookup <public_domain_name>
nslookup <admin_domain_name>
```

OAuth를 사용할 경우 provider console에도 다음 redirect URI를 등록한다.

```text
https://<public_domain_name>/oauth/google/callback
https://<public_domain_name>/oauth/kakao/callback
https://<public_domain_name>/oauth/naver/callback
```

## 4. 첫 runtime secret 등록

Terraform은 RDS master credential을 Secrets Manager에 관리한다. 앱 runtime secret은 SSM Parameter Store의 `/brainx/dev/*` prefix에 둔다. GitHub repository variable에는 API key, password, token을 넣지 않는다.

첫 deploy 전에 아래 네 값은 필수다. 예시는 기본 prefix인 `/brainx/dev`를 사용하므로, `terraform.tfvars`에서 `ssm_parameter_prefix`를 바꿨다면 같은 prefix로 치환한다.

```powershell
aws ssm put-parameter --region $env:AWS_REGION --name /brainx/dev/JWT_SECRET --type SecureString --value "<32-byte-or-longer-secret>"
aws ssm put-parameter --region $env:AWS_REGION --name /brainx/dev/SERVICE_TOKEN --type SecureString --value "<internal-service-token>"
aws ssm put-parameter --region $env:AWS_REGION --name /brainx/dev/NEO4J_PASSWORD --type SecureString --value "<neo4j-password>"
aws ssm put-parameter --region $env:AWS_REGION --name /brainx/dev/SEED_ADMIN_PASSWORD --type SecureString --value "<admin-password>"
```

AI, 결제, OAuth, SMTP, Notion 기능을 켜려면 선택 parameter도 같은 prefix에 추가한다. 이름과 기본값은 [`aws-dev/runtime-environment.md`](aws-dev/runtime-environment.md)의 `Optional SSM Parameters`를 따른다. SSM 값은 `--with-decryption`으로 화면·로그에 출력하지 않는다.

## 5. GitHub Repository Variables 설정

Terraform directory에서 아래 값을 GitHub Repository Variables에 등록한다. 이 값들은 workflow가 AWS에 도달하기 위한 식별자와 공개 URL이며, secret 값이 아니다.

```powershell
gh variable set AWS_REGION --body "$(terraform output -raw aws_region)"
gh variable set AWS_ROLE_TO_ASSUME --body "$(terraform output -raw github_actions_role_arn)"
gh variable set AWS_DEV_INSTANCE_ID --body "$(terraform output -raw ec2_instance_id)"
gh variable set AWS_DEV_ARTIFACT_BUCKET --body "$(terraform output -raw artifact_bucket_name)"
gh variable set AWS_DEV_ASSET_BUCKET --body "$(terraform output -raw asset_bucket_name)"
gh variable set AWS_DEV_ASSET_BUCKET_REGION --body "$(terraform output -raw asset_bucket_region)"
gh variable set AWS_ECR_REGISTRY --body "$(terraform output -raw ecr_registry)"
gh variable set AWS_DEV_RDS_SECRET_ARN --body "$(terraform output -raw rds_secret_arn)"
gh variable set AWS_DEV_RDS_HOST --body "$(terraform output -raw rds_address)"
gh variable set AWS_DEV_RDS_PORT --body "$(terraform output -raw rds_port)"
gh variable set AWS_DEV_SSM_PARAMETER_PREFIX --body "$(terraform output -raw ssm_parameter_prefix)"
gh variable set AWS_DEV_PUBLIC_BASE_URL --body "$(terraform output -raw main_public_base_url)"
gh variable set AWS_DEV_ADMIN_PUBLIC_BASE_URL --body "$(terraform output -raw admin_public_base_url)"
gh variable set AWS_DEV_PUBLIC_SITE_ADDRESS --body "$(terraform output -raw public_site_address)"
gh variable set AWS_DEV_ADMIN_SITE_ADDRESS --body "$(terraform output -raw admin_site_address)"
gh variable set AWS_DEV_ACME_EMAIL --body "$(terraform output -raw acme_email)"
```

등록 직후 workflow의 `Check deployment configuration` job이 요구하는 값이 모두 있는지 GitHub Actions 화면에서 확인한다. `AWS_DEV_RDS_SECRET_ARN`은 secret 값이 아니라 Secrets Manager secret의 ARN이며, credential 원문은 EC2의 배포 script만 읽는다.

## 6. 첫 전체 배포

첫 전체 배포는 GitHub Actions `BrainX Dev Deploy`를 수동 실행한다. asset bucket이 비어 있으므로 `build_desktop_installer=true`가 필요하다. frontend build는 S3의 `desktop-installers/latest/BrainX Setup 0.1.0.exe`를 먼저 내려받기 때문이다.

저장소 루트에서 실행한다.

```powershell
Set-Location <repository-root>

gh workflow run "BrainX Dev Deploy" --ref main `
  -f deploy_all=true `
  -f force_runtime_refresh=false `
  -f build_desktop_installer=true `
  -f services=""

gh run list --workflow "BrainX Dev Deploy" --branch main --limit 5
gh run watch <run-id> --exit-status
```

workflow는 변경 감지 결과를 바탕으로 전체 서비스 image를 ECR에 push하고, `deploy/`와 `scripts/` bundle을 S3에 올린 뒤 SSM `AWS-RunShellScript`로 EC2 배포를 수행한다. EC2에서는 다음이 자동 처리된다.

1. SSM과 Secrets Manager에서 runtime env를 읽어 `/opt/brainx/env/runtime.env`를 mode `600`으로 생성
2. 서비스별 logical database(`brainx_user`, `brainx_workspace`, `brainx_ingestion`, `brainx_commerce`, `brainx_admin`, `brainx_intelligence`, `brainx_mcp`) bootstrap
3. ECR login, Docker Compose pull/up, Caddy 및 관측 컨테이너 기동
4. Discovery와 public route smoke check

## 7. 첫 배포 검증

GitHub Actions run이 성공한 뒤 public endpoint를 확인한다. 인증이 필요한 API는 `401`이 정상일 수 있으며, public read API는 5xx가 아니어야 한다.

```powershell
curl.exe -sS -o NUL -w "frontend %{http_code} %{time_total}`n" --max-time 15 https://<public_domain_name>/
curl.exe -sS -o NUL -w "admin %{http_code} %{time_total}`n" --max-time 15 https://<admin_domain_name>/
curl.exe -sS -o NUL -w "plans %{http_code} %{time_total}`n" --max-time 15 https://<public_domain_name>/api/v1/plans
curl.exe -sS -o NUL -w "notes %{http_code} %{time_total}`n" --max-time 15 https://<public_domain_name>/api/v1/notes
curl.exe -sS -o NUL -w "AI models %{http_code} %{time_total}`n" --max-time 15 https://<public_domain_name>/api/v1/ai/models
```

EC2 내부 상태는 SSM으로 제한된 출력만 조회한다. 자세한 command 예시는 [`aws-dev/troubleshooting.md`](aws-dev/troubleshooting.md)의 `EC2 Diagnosis Through SSM`을 사용한다.

확인 항목:

- `docker compose --env-file /opt/brainx/env/runtime.env -f docker-compose.yml ps`에서 Caddy, Gateway, Discovery, backend, frontend이 정상 상태인지
- `80`/`443` listener와 Caddy가 살아 있는지
- `https://<admin_domain_name>/grafana/`에서 provision된 Prometheus/Loki datasource와 dashboard가 보이는지

## 이후 운영

### 일반 코드 배포

`main`에 push하면 workflow가 변경된 서비스만 build/deploy한다. 처음부터 전체를 다시 배포할 필요가 없으며, deploy 설정·workflow·Terraform 경로를 바꾸면 workflow가 full stack 배포로 승격한다.

### secret 또는 runtime 값 교체

SSM에서 `--overwrite`로 값을 교체한 뒤 GitHub Actions를 수동 실행한다. image를 다시 만들 필요가 없다면 `force_runtime_refresh=true`를 사용한다.

```powershell
gh workflow run "BrainX Dev Deploy" --ref main `
  -f deploy_all=false `
  -f force_runtime_refresh=true `
  -f build_desktop_installer=false `
  -f services="intelligence-service"
```

값 분류와 backend/frontend 환경변수 추가 절차는 [`aws-dev/runtime-environment.md`](aws-dev/runtime-environment.md)를 따른다.

### 비용 절감용 중지/재시작

사용하지 않을 때는 Terraform으로 EC2와 RDS runtime을 중지하거나 재시작한다. storage, Elastic IP/public IPv4, ECR, S3, backup 비용은 중지 중에도 남는다.

```powershell
Set-Location infra\aws-dev\terraform

terraform apply -var="ec2_runtime_state=stopped" -var="rds_runtime_state=stopped"
terraform apply -var="ec2_runtime_state=running" -var="rds_runtime_state=running"
```

RDS는 장시간 정지 시 AWS가 자동 재시작할 수 있다. 같은 desired state에서 helper를 다시 실행해야 하면 `rds_runtime_state_operation_nonce`를 바꾼다.

## 실패 시 중단 지점

| 단계 | 먼저 확인할 것 | 다음 문서 |
| --- | --- | --- |
| `terraform init` 실패 | state bucket 이름·region·권한 | [`aws-dev/README.md`](aws-dev/README.md) |
| Terraform apply 실패 | plan, account OIDC provider, quota, 비용 영향 | [`aws-dev/README.md`](aws-dev/README.md) |
| workflow preflight 실패 | GitHub Repository Variables 누락 | [`.github/workflows/brainx-dev-deploy.yml`](../.github/workflows/brainx-dev-deploy.yml) |
| frontend build 실패 | asset bucket의 desktop installer, `build_desktop_installer=true` | [workflow](../.github/workflows/brainx-dev-deploy.yml) |
| SSM deploy 실패 | `/brainx/dev/*` 필수 parameter, RDS secret ARN, EC2 SSM 상태 | [`aws-dev/runtime-environment.md`](aws-dev/runtime-environment.md) |
| HTTPS 또는 endpoint 실패 | DNS A record, Caddy, Compose 상태, 중복 deploy run | [`aws-dev/troubleshooting.md`](aws-dev/troubleshooting.md) |

deploy run을 병렬로 실행하지 않는다. `BrainX Dev Deploy`의 workflow-level concurrency(`brainx-dev-deploy`, `cancel-in-progress: false`)는 단일 EC2 Docker Compose runtime의 경합을 막는 필수 보호 장치다.

## 문서 변경 시 검증

이 가이드를 수정할 때는 실제 secret을 넣지 않고 다음을 확인한다.

```powershell
docker compose -f infra/aws-dev/deploy/docker-compose.yml config --quiet
bash -n infra/aws-dev/scripts/deploy_remote.sh
git diff --check
```

문서만 바꾸는 작업은 `terraform apply`나 실제 GitHub Actions deploy를 실행하지 않는다.
