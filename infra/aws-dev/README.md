# BrainX AWS Dev Deployment

이 디렉토리는 BrainX 개발환경을 AWS에 배포하기 위한 독립 인프라/CI 설정이다. 기존 애플리케이션 소스는 수정하지 않고, GitHub Actions + ECR + EC2 SSM + Docker Compose로 배포한다.

## Architecture

- Region: `ap-northeast-2`
- Compute: single EC2 `r7i.xlarge` with Docker, 32 GiB RAM, 8 GiB swap
- Database: one RDS PostgreSQL instance, service-specific logical databases
- Object storage: private S3 bucket for future user assets, note images, and attachments
- Container runtime on EC2:
  - `discovery-service`, `gateway-service`, `user-service`, `workspace-service`, `ingestion-service`, `commerce-service`, `admin-service`, `intelligence-service`, `mcp-service`
  - `frontend`, `admin-frontend`
  - `prometheus`, `grafana`, `redis`, `neo4j`, `qdrant`, `kafka`, `caddy`

`discovery-service` listens on port `8761` and stays on the internal registry path; Caddy does not publish it as a public route.
- Public entry:
  - user frontend: `https://<public-domain>/`
  - admin frontend: `https://<admin-domain>/`
  - `/mcp*`, `/api/v1/mcp/*`, `/.well-known/oauth-protected-resource` route directly to Mcp-Service through Caddy.
  - `/oauth/token`, `/oauth/register`, `/.well-known/oauth-authorization-server`, `/.well-known/openid-configuration` route directly to User-Service through Caddy for MCP OAuth discovery/login.
  - Grafana: `https://<admin-domain>/grafana/`
  - all other `/api/v1/*` routes (including `/api/v1/ai/*`, `/api/v1/intelligence/*`, `/api/v1/notes/*/summary`, `/api/v1/users/me/style-profile`) go to Gateway-Service, which then routes to the correct downstream service. Caddy no longer proxies any `/api/v1/*` path directly to Intelligence-Service: guest AI usage depends on the `X-Guest-Id` cookie that only Gateway-Service's `JwtAuthenticationGlobalFilter` issues/validates, and `/api/v1/ai/usage` is actually owned by Commerce-Service, not Intelligence-Service.

Prometheus stays on the internal Docker network and scrapes `user-service`, `gateway-service`, `workspace-service`, `admin-service`, `commerce-service`, `ingestion-service`, and `intelligence-service` from their `/actuator/prometheus` endpoints. Grafana is auto-provisioned with that Prometheus datasource, so you do not need to add it manually in the UI.

The monitoring dashboard is file-provisioned from `/etc/grafana/dashboards/spring-boot-2-1-system-monitor.json` inside the Grafana container, which maps back to `infra/aws-dev/deploy/grafana/dashboards/spring-boot-2-1-system-monitor.json` in this repository. Because `allowUiUpdates: false` is set, UI edits are temporary unless you click `Save JSON to file`, overwrite that provisioned JSON path, and let Grafana reload the file.

The provider also sets `updateIntervalSeconds: 30`, so Grafana should pick up the changed dashboard automatically within about 30 seconds; if it does not, restart Grafana with `docker compose --env-file /opt/brainx/env/runtime.env -f docker-compose.yml restart grafana`.

The imported Spring Boot monitor dashboard expects each service to publish an `application` metric tag. We still set that tag in each service's `management.metrics.tags.application` config, and Prometheus also stamps the same label from the scrape target as a fallback so the dashboard keeps working even if one container is briefly on an older image.

The dashboard also expects Micrometer's extra JVM binders for some of the JVM and process panels. We keep `io.github.mweirauch:micrometer-jvm-extras:0.2.2` on the monitored services so the panels do not fall back to `N/A` when those meters are queried.

The Grafana dashboard itself is also provisioned from this repository now, so the `spring_boot_21` dashboard UID points directly at the provisioned Prometheus datasource instead of depending on the UI import placeholder `${DS_PROMETHEUS}`. This avoids the `Datasource ${DS_PROMETHEUS} was not found` error and keeps the dashboard stable after redeploys.

Those monitoring panels are now `Time series` charts instead of `Stat` tiles, so the dashboard shows the actual line graphs rather than only the sparkline preview.

The rightmost "Open Files" panels query `process_files_open_files` first and fall back to `process_open_fds` for older images, which keeps the panel readable across both the new Micrometer binder and the legacy process metric. If those panels still show `No data`, it usually means the service image is not exposing `/actuator/prometheus` yet or the target container is unhealthy.

`Gateway-Service` must allow `/actuator/prometheus` through its global auth filter, otherwise Prometheus receives `401 Unauthorized` when it scrapes the gateway target.

`Commerce-Service` and `Ingestion-Service` now explicitly allow `/actuator/prometheus` through their security chains, and `Admin-Service` already permits all actuator endpoints. `Intelligence-Service` exposes `/actuator/prometheus` through its management endpoint config and leaves the path reachable outside `/api/v1/**`.

`Ingestion-Service` also needs `spring-boot-starter-actuator` in its Gradle dependencies so the `/actuator/prometheus` endpoint exists at runtime; without that starter, Prometheus has nothing to scrape and Grafana panels stay on `No data`.

`Discovery-Service` is the Eureka registry for the AWS dev stack. The gateway and backend services register with it before they start serving traffic, and Admin-Service reads `User-Service`, `Commerce-Service`, and `Workspace-Service` through Eureka-backed `RestClient` beans instead of hardcoded Docker DNS names.

Grafana is mounted behind Caddy on the admin site path so we do not need to expose a new public port. It reuses the existing runtime admin password (`SEED_ADMIN_PASSWORD`) for the initial Grafana login.

## Terraform

```powershell
cd C:\Edu\final-project\BrainX\infra\aws-dev\terraform
terraform init
terraform plan -out tfplan
terraform apply tfplan
```

If a GitHub OIDC provider already exists in the AWS account, set `github_oidc_provider_arn` in `terraform.tfvars`. GitHub's OIDC provider is account-wide and should not be created repeatedly.

Terraform state is stored in the S3 backend declared in `terraform/backend.tf`:

- Bucket: `brainx-dev-terraform-state-049882582319-ap-northeast-2`
- Key: `brainx/dev/terraform.tfstate`
- Locking: native S3 lockfile with `use_lockfile = true`

The state bucket is bootstrapped outside this stack and has versioning, AES256 server-side encryption, and public access block enabled. Keep `terraform.tfstate` and `tfplan` files local-only; they are intentionally ignored.

The dev EC2 host is kept stable during normal Terraform applies. We do not force instance replacement on `user_data` edits, so bootstrap changes should be introduced intentionally instead of recreating the running app host during a routine infra update.

### Cost Control

개발환경을 쓰지 않을 때는 Terraform 변수로 EC2와 RDS runtime을 멈출 수 있다.

```powershell
cd C:\Edu\final-project\BrainX\infra\aws-dev\terraform

# Stop compute/database runtime.
terraform apply -var="ec2_runtime_state=stopped" -var="rds_runtime_state=stopped"

# Start again.
terraform apply -var="ec2_runtime_state=running" -var="rds_runtime_state=running"
```

`ec2_runtime_state`는 Terraform AWS provider의 `aws_ec2_instance_state` 리소스로 관리한다. `stopped` 상태에서는 EC2 instance-hour 비용은 멈추지만 root EBS volume, Elastic IP/public IPv4, ECR, S3 비용은 남는다.

`rds_runtime_state`는 AWS provider가 RDS stopped/running 상태를 직접 모델링하지 않기 때문에 Terraform `local-exec` helper가 AWS CLI로 `start-db-instance`/`stop-db-instance`를 호출한다. 따라서 apply 환경에는 `python`과 `aws` CLI가 필요하다. RDS를 멈춰도 storage, backup, Secrets Manager 비용은 남고, AWS는 장기간 정지된 DB instance를 자동으로 다시 시작할 수 있다. 같은 desired state에서 helper를 다시 실행해야 하면 `rds_runtime_state_operation_nonce` 값을 바꿔서 apply한다.

```powershell
terraform apply -var="rds_runtime_state=stopped" -var="rds_runtime_state_operation_nonce=1"
```

## GitHub Repository Variables

The deploy workflow uses GitHub OIDC and does not require AWS access key secrets. After `terraform apply`, set these repository variables. For domain deployment, set `public_domain_name` and `admin_domain_name` before reading Terraform outputs.

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

## External DNS And HTTPS

이 개발환경은 Route 53, ALB, ACM을 만들지 않는다. 외부 DNS provider에서 직접 A record를 만든 뒤 Caddy가 EC2에서 HTTPS 인증서를 자동 발급한다.

Required DNS records:

```text
<public-domain>       A  43.201.161.67
admin.<public-domain> A  43.201.161.67
```

Terraform 변수는 도메인 값으로 설정한다.

```hcl
public_domain_name = "example.com"
admin_domain_name  = "admin.example.com"
acme_email         = "admin@example.com"
```

도메인 적용 후 GitHub variables를 갱신하고, frontend image에는 public base URL이 build-time에 들어가므로 `workflow_dispatch`에서 `deploy_all=true`로 한 번 재배포한다.

OAuth provider redirect URI도 public domain 기준으로 맞춘다.

```text
https://<public-domain>/oauth/google/callback
https://<public-domain>/oauth/kakao/callback
https://<public-domain>/oauth/naver/callback
```

## User Asset S3 Bucket

`aws_s3_bucket.assets`는 사용자 업로드 파일, 노트 이미지, 첨부파일을 위한 private object storage다. 현재 Ingestion-Service는 아직 로컬 디스크 기반 `AssetStorageService`를 사용하므로, 이 버킷은 S3 adapter/presigned URL 구현을 위한 인프라 준비 단계다.

Default bucket name:

```text
brainx-dev-assets-<aws-account-id>-<region>
```

Security/cost defaults:

- Public access block enabled
- Bucket owner enforced object ownership
- AES256 server-side encryption
- Incomplete multipart uploads aborted after 7 days
- EC2 instance profile has read/write/delete access to this bucket only
- `asset_bucket_force_destroy=false` by default to avoid accidental asset loss

If direct browser upload is implemented later, CORS defaults to the configured public/admin domains. Override with `asset_bucket_cors_allowed_origins` when needed.

## Runtime Environment And Secrets

Runtime app secrets and service configuration are managed through AWS SSM Parameter Store and EC2 Docker Compose runtime env. Human operation steps and AI agent editing rules are kept in [`runtime-environment.md`](runtime-environment.md).

## CI/CD Behavior

Workflow: `.github/workflows/brainx-dev-deploy.yml`

- Push to `main` detects changed paths and builds only affected images. If the change only touches the runtime deployment paths under `infra/aws-dev/deploy/`, `infra/aws-dev/scripts/`, `infra/aws-dev/terraform/`, or the deploy workflow, the pipeline promotes it to a full stack build/deploy so newly introduced images such as `discovery-service` exist before `docker compose up` refreshes the stack.
- `workflow_dispatch` can deploy all services or a specific service list.
- Workflow-level concurrency serializes AWS dev deploys with `group: brainx-dev-deploy` and `cancel-in-progress: false`.
- Image tags:
  - immutable: commit SHA
  - moving: `dev-latest`
- Docker build cache uses Docker Buildx GitHub Actions cache with one scope per service. The first build for a service can miss, and later builds reuse cache layers across GitHub-hosted runners.
- Deploy uses SSM `AWS-RunShellScript`; no SSH key or port 22 is required.
- GitHub waits on SSM by polling the command status until it reaches a terminal state, so longer remote redeploys no longer trip the default AWS CLI waiter timeout.
- Remote deploy reads SSM parameters in one batch, skips repeated database bootstrap after the first successful run for the current RDS target, and only skips image pulls when the deployment is not already rebuilding the affected stack.
- Remote deploy prints SSM stdout/stderr, `docker compose ps`, and endpoint checks. GitHub endpoint verification is limited to the changed service categories.
- For deploy overlap or endpoint verification failures, use [`troubleshooting.md`](troubleshooting.md).

Path mapping:

| Path | Rebuilt service |
| --- | --- |
| `brainX_back/Gateway-Service/**` | `gateway-service` |
| `brainX_back/User-Service/**` | `user-service` |
| `brainX_back/Workspace-Service/**` | `workspace-service` |
| `brainX_back/Ingestion-Service/**` | `ingestion-service` |
| `brainX_back/Commerce-Service/**` | `commerce-service` |
| `brainX_back/Admin-Service/**` | `admin-service` |
| `brainX_back/Intelligence-Service/**` | `intelligence-service` |
| `brainX_back/Mcp-Service/**` | `mcp-service` |
| `brainx-next/**` | `frontend` |
| `brainx-admin-next/**` | `admin-frontend` |
| `contracts-v2/**` | `intelligence-service`, `mcp-service`, `frontend` |
| `infra/aws-dev/deploy/**`, `infra/aws-dev/scripts/**`, `infra/aws-dev/terraform/**`, or workflow file | deploy config refresh, full-stack redeploy trigger |

For first deployment after adding Mcp-Service, run Terraform apply first so the `brainx-dev-mcp-service` ECR repository exists, then run the workflow manually with `deploy_all=true` so every ECR image exists before partial deployments start.

For first deployment after adding Discovery-Service or any other new backend service, run Terraform apply first so the matching `brainx-dev-<service>` ECR repository and GitHub Actions ECR policy exist before the workflow tries to push the image. If the repo is missing or the policy is stale, the build step will fail with a `403 Forbidden` push error.
