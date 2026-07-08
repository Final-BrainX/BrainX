# AWS Dev Runtime Environment Guide

이 문서는 AWS dev 환경의 runtime 환경변수와 secret을 추가, 재설정, 배포하는 절차를 정리한다. 팀원이 직접 따라 하는 절차와 AI agent가 repo를 수정할 때 지켜야 할 절차를 함께 둔다.

## Runtime Env Flow

AWS dev runtime 값은 역할별로 나뉜다.

- GitHub repository variables: `.github/workflows/brainx-dev-deploy.yml`이 EC2, ECR, public URL, SSM prefix 같은 배포 인프라 값을 읽는다.
- AWS SSM Parameter Store: 앱 runtime secret과 서비스 설정 값을 `/brainx/dev/*` 아래에 저장한다.
- AWS Secrets Manager: RDS master username/password는 Terraform `manage_master_user_password`가 만든 secret에서 읽는다.
- EC2 runtime env: `infra/aws-dev/scripts/deploy_remote.sh`가 SSM과 Secrets Manager를 읽어 `/opt/brainx/env/runtime.env`를 만든다.
- Docker Compose: `infra/aws-dev/deploy/docker-compose.yml`의 각 service `environment:`에 명시된 key만 컨테이너로 전달된다.
- Next.js `NEXT_PUBLIC_*`: browser bundle에 공개되는 값이다. 대부분 image build time에 박히므로 SSM runtime 변경만으로는 반영되지 않는다.

## Human Operator Guide

### Reset An Existing SSM Value

값을 교체할 때는 `--overwrite`를 사용한다. 의도적으로 public인 값이 아니면 `SecureString`을 사용한다.

```powershell
aws ssm put-parameter `
  --profile brainx-dev `
  --region ap-northeast-2 `
  --name /brainx/dev/OPENAI_API_KEY `
  --type SecureString `
  --value "<new value>" `
  --overwrite
```

값 존재 여부만 확인한다. 공유 화면, issue, chat, log에 복호화된 secret을 출력하지 않는다.

```powershell
aws ssm get-parameter `
  --profile brainx-dev `
  --region ap-northeast-2 `
  --name /brainx/dev/OPENAI_API_KEY
```

SSM 값만 바꿔도 실행 중인 컨테이너에는 바로 반영되지 않는다. GitHub Actions `BrainX Dev Deploy`를 `workflow_dispatch`로 실행하고 `deploy_all=true` 또는 영향을 받는 service를 지정한다.

```text
services: intelligence-service
```

Mcp-Service는 별도 secret을 만들지 않고 기존 `/brainx/dev/JWT_SECRET`으로 사용자 JWT를 검증한다. API key 원문은 발급 응답에서 한 번만 반환되고 DB에는 hash만 저장된다.

### Required SSM Parameters

```powershell
aws ssm put-parameter --name /brainx/dev/JWT_SECRET --type SecureString --value "<32+ byte jwt secret>"
aws ssm put-parameter --name /brainx/dev/SERVICE_TOKEN --type SecureString --value "<internal service token>"
aws ssm put-parameter --name /brainx/dev/NEO4J_PASSWORD --type SecureString --value "<neo4j password>"
aws ssm put-parameter --name /brainx/dev/SEED_ADMIN_PASSWORD --type SecureString --value "<initial admin password>"
```

### Optional SSM Parameters

전체 제품 동작에 필요한 외부 provider 값이다.

```powershell
aws ssm put-parameter --name /brainx/dev/OPENAI_API_KEY --type SecureString --value "<openai api key>"
aws ssm put-parameter --name /brainx/dev/VOYAGE_API_KEY --type SecureString --value "<voyage api key>"
aws ssm put-parameter --name /brainx/dev/TOSS_CLIENT_KEY --type SecureString --value "<toss client key>"
aws ssm put-parameter --name /brainx/dev/TOSS_SECRET_KEY --type SecureString --value "<toss secret key>"
aws ssm put-parameter --name /brainx/dev/TOSS_CONFIRM_URL --type SecureString --value "https://api.tosspayments.com/v1/payments/confirm"
aws ssm put-parameter --name /brainx/dev/GOOGLE_CLIENT_ID --type SecureString --value "<google client id>"
aws ssm put-parameter --name /brainx/dev/GOOGLE_CLIENT_SECRET --type SecureString --value "<google client secret>"
aws ssm put-parameter --name /brainx/dev/KAKAO_CLIENT_ID --type SecureString --value "<kakao rest api key>"
aws ssm put-parameter --name /brainx/dev/KAKAO_CLIENT_SECRET --type SecureString --value "<kakao client secret or empty>"
aws ssm put-parameter --name /brainx/dev/NAVER_CLIENT_ID --type SecureString --value "<naver client id>"
aws ssm put-parameter --name /brainx/dev/NAVER_CLIENT_SECRET --type SecureString --value "<naver client secret>"
aws ssm put-parameter --name /brainx/dev/MAIL_USERNAME --type SecureString --value "<smtp username>"
aws ssm put-parameter --name /brainx/dev/MAIL_PASSWORD --type SecureString --value "<smtp password>"
aws ssm put-parameter --name /brainx/dev/MAIL_FROM --type SecureString --value "<sender email>"
aws ssm put-parameter --name /brainx/dev/NOTION_CLIENT_ID --type SecureString --value "<notion client id>"
aws ssm put-parameter --name /brainx/dev/NOTION_CLIENT_SECRET --type SecureString --value "<rotated notion client secret>"
aws ssm put-parameter --name /brainx/dev/NOTION_REDIRECT_URI --type SecureString --value "https://brainx.p-e.kr/notion-callback"
aws ssm put-parameter --name /brainx/dev/CDN_BASE_URL --type SecureString --value "https://brainx.p-e.kr"
aws ssm put-parameter --name /brainx/dev/ASSET_STORAGE_DIR --type SecureString --value "/app/asset-storage"
```

Notion import는 Notion integration settings에 아래 redirect URI를 등록해야 한다.

```text
https://brainx.p-e.kr/notion-callback
```

`NOTION_CLIENT_SECRET`이 chat, issue, log에 노출된 적이 있으면 재발급한 뒤 SSM에 저장한다. 현재 Ingestion-Service는 S3 adapter가 아니라 local disk `AssetStorageService`를 사용하므로 `ASSET_STORAGE_DIR=/app/asset-storage`는 `ingestion_asset_storage` Docker volume에 연결된다.

Optional admin seed overrides:

```powershell
aws ssm put-parameter --name /brainx/dev/SEED_ADMIN_LOGIN_ID --type SecureString --value "admin"
aws ssm put-parameter --name /brainx/dev/SEED_ADMIN_NAME --type SecureString --value "BrainX Admin"
```

`deploy_remote.sh` also writes the shared non-secret runtime defaults into `/opt/brainx/env/runtime.env` on every CI/CD deploy so the compose file can consume the same values automatically: `ADMIN_DB_NAME`, `GATEWAY_SERVICE_URL`, `USER_SERVICE_URL`, `COMMERCE_SERVICE_URL`, `WORKSPACE_SERVICE_URL`, `INGESTION_SERVICE_URL`, `INTELLIGENCE_SERVICE_URL`, `MCP_SERVICE_URL`, `EUREKA_CLIENT_SERVICE_URL_DEFAULTZONE`, `MAIL_HOST`, and `MAIL_PORT`.

For Eureka-backed service lookup, keep the service-id casing aligned with Spring registration names. In AWS dev that means `User-Service`, `Commerce-Service`, `Workspace-Service`, `Admin-Service`, and `Gateway-Service` stay capitalized, while `ingestion-service`, `intelligence-service`, and `mcp-service` stay lowercase because those services register with lowercase `spring.application.name` values.

For Kafka lag monitoring, the same runtime env now also carries `KAFKA_BOOTSTRAP_SERVERS` and `BRAINX_KAFKA_MONITORING_CONSUMER_GROUP_ID` so `admin-service` can read the broker address and consumer group from deployment-time values instead of falling back to `localhost:9092`.

Mcp-Service는 `deploy_remote.sh`가 `brainx_mcp` logical database를 만들고, Docker Compose가 `JWT_SECRET`과 RDS 접속 정보를 주입한다. 첫 배포 전에는 Terraform apply로 `brainx-dev-mcp-service` ECR repository를 만든다.

RDS master username/password는 AWS Secrets Manager에서 읽는다. GitHub secrets나 SSM에 복사하지 않는다.

### Add A Backend Runtime Env Variable

새 backend env var는 값을 소비하는 application code와 값을 운반하는 infra layer를 함께 수정해야 한다.

1. 대상 service의 `application.yml` 또는 `application.yaml`에 env lookup을 추가한다.

```yaml
brainx:
  feature:
    enabled: ${BRAINX_FEATURE_ENABLED:false}
```

2. `infra/aws-dev/scripts/deploy_remote.sh`에서 SSM parameter를 읽고 `runtime.env`에 쓴다.

```bash
BRAINX_FEATURE_ENABLED="$(get_parameter BRAINX_FEATURE_ENABLED false)"
...
write_env BRAINX_FEATURE_ENABLED "$BRAINX_FEATURE_ENABLED"
```

3. `infra/aws-dev/deploy/docker-compose.yml`에서 대상 service에 값을 전달한다.

```yaml
environment:
  BRAINX_FEATURE_ENABLED: ${BRAINX_FEATURE_ENABLED:-false}
```

4. SSM에 값을 등록한다.

```powershell
aws ssm put-parameter `
  --profile brainx-dev `
  --region ap-northeast-2 `
  --name /brainx/dev/BRAINX_FEATURE_ENABLED `
  --type SecureString `
  --value "true" `
  --overwrite
```

5. 팀원이 직접 운영해야 하는 값이면 이 문서의 parameter 목록에 추가한다.

6. 변경을 `main`에 merge하거나 GitHub Actions `workflow_dispatch`로 영향을 받는 service를 재배포한다.

### Add A Frontend `NEXT_PUBLIC_*` Value

`NEXT_PUBLIC_*`는 browser에서 볼 수 있는 공개 값이다. secret, token, password, API key를 넣지 않는다.

1. `infra/aws-dev/dockerfiles/brainx-next.Dockerfile`에 `ARG`와 `ENV`를 추가한다.

```dockerfile
ARG NEXT_PUBLIC_FEATURE_FLAG=false
ENV NEXT_PUBLIC_FEATURE_FLAG=$NEXT_PUBLIC_FEATURE_FLAG
```

2. `.github/workflows/brainx-dev-deploy.yml`의 frontend build args에 추가한다.

```bash
--build-arg "NEXT_PUBLIC_FEATURE_FLAG=false"
```

3. server process도 runtime에 읽어야 할 때만 `infra/aws-dev/deploy/docker-compose.yml`의 `frontend.environment`에 추가한다.

4. `frontend` image를 다시 build/deploy한다. 컨테이너 재시작만으로 이미 build된 client bundle 값은 바뀌지 않는다.

### Add Or Reset A GitHub Repository Variable

GitHub repository variable은 workflow가 EC2에 도달하기 전에 필요한 배포 인프라 값 또는 non-secret build 설정에만 사용한다.

```powershell
gh variable set AWS_DEV_PUBLIC_BASE_URL --body "https://brainx.p-e.kr"
```

앱 API key, password, token은 GitHub repository variable에 넣지 않는다. 이 배포 경로에서는 SSM Parameter Store를 사용한다.

### Team Access For SSM Env Management

공유 IAM user나 공유 access key를 만들지 않는다. AWS Organizations/IAM Identity Center를 쓰지 않는 경우에도 사람마다 별도 IAM user를 만들고 MFA를 켠 뒤 최소권한 policy를 붙인다.

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "ManageBrainxDevSsmParameters",
      "Effect": "Allow",
      "Action": [
        "ssm:GetParameter",
        "ssm:GetParameters",
        "ssm:GetParametersByPath",
        "ssm:DescribeParameters",
        "ssm:PutParameter"
      ],
      "Resource": "arn:aws:ssm:ap-northeast-2:<AWS_ACCOUNT_ID>:parameter/brainx/dev/*"
    }
  ]
}
```

일반 팀원 policy에는 `ssm:DeleteParameter`를 넣지 않는다. 삭제는 관리자만 수행한다.

각 팀원은 본인 profile을 설정한다.

```powershell
aws configure --profile brainx-dev
```

이후 SSM 수정 시 `--profile brainx-dev`를 붙인다.

## Eureka Deployment Notes

- `EUREKA_CLIENT_SERVICE_URL_DEFAULTZONE` is written into `/opt/brainx/env/runtime.env` during deploy, defaulting to `http://discovery-service:8761/eureka/`.
- `discovery-service` is the Eureka registry for AWS dev, and the backend services register against it before they start serving traffic.
- `Admin-Service` resolves `User-Service`, `Commerce-Service`, and `Workspace-Service` through load-balanced `RestClient` beans instead of container IPs or hardcoded Docker DNS names.
- `Intelligence-Service` still uses its direct Workspace base URL for now; that client can move to Eureka later without changing the deploy wiring again.

## Desktop Installer Delivery

Desktop installer artifacts are not stored in Git history or GitHub repository variables. In AWS dev, the `brainx-dev-deploy` workflow uploads the Windows installer to `s3://$AWS_DEV_ASSET_BUCKET/desktop-installers/latest/BrainX Setup 0.1.0.exe` and then downloads that object into `brainx-next/public/downloads/` before the frontend image build. Keep installer delivery in S3 object storage and reserve GitHub variables for small non-secret deploy settings only.

## AI Agent Guide

AI agent가 환경변수 관련 repo 변경을 수행할 때는 아래 순서를 따른다.

1. 먼저 `infra/AGENTS.md`, `infra/INDEX.md`, 이 문서를 읽는다.
2. 값의 종류를 분류한다.
   - app secret/runtime config: SSM Parameter Store
   - RDS master credential: Secrets Manager, 복사 금지
   - deploy infra value: GitHub repository variable
   - browser-visible frontend value: `NEXT_PUBLIC_*`, secret 금지
3. repo-tracked 파일에 실제 secret 값을 쓰지 않는다. 예시는 `<placeholder>` 또는 빈 기본값만 사용한다.
4. backend env 추가 시 `application.yml|yaml`, `deploy_remote.sh`, `deploy/docker-compose.yml`, 이 문서를 함께 맞춘다.
5. frontend `NEXT_PUBLIC_*` 추가 시 `brainx-next.Dockerfile`, workflow build args, 필요 시 compose runtime env를 함께 맞춘다.
6. deploy script 또는 compose 변경 시 최소 검증을 실행한다.

```powershell
docker compose -f infra/aws-dev/deploy/docker-compose.yml config --quiet
bash -n infra/aws-dev/scripts/deploy_remote.sh
git diff --check
```

7. 문서만 바뀌면 AWS apply/deploy를 실행하지 않는다. 생략 사유를 worklog에 남긴다.
8. AWS 상태를 바꾸는 명령, GitHub Actions deploy, Terraform apply는 영향 범위와 target을 확인하고 사용자 지시가 있을 때만 실행한다.
9. 변경 후 `infra/worklogs/YYYY-MM.md`에 `YYYY-MM-DD HH:mm - <short title>` 형식으로 기록한다.
10. 공개 API/AsyncAPI 계약 변경이 아니면 SSOT YAML을 수정하지 않는다.

