# BrainX Kubernetes Setup

이 문서는 Docker Desktop 기반 로컬 Kubernetes 개발환경을 처음부터 다시 구성할 때 사용하는 공식 Setup 절차다.

- 대상 범위: `k8s/` 매니페스트 기반 로컬 재구성
- 비대상 범위: 제품 소개, 아키텍처 배경, Docker Compose 상세 설명
- 기준 원칙: 현재 `k8s/` 매니페스트는 Docker Desktop Kubernetes + `host.docker.internal` 기반 로컬 검증용이다.

## 1. 사전 준비

### 1-1. Docker Desktop 설치

- Docker Desktop for Windows를 설치한다.
- 설치 후 Docker Desktop을 실행한다.

### 1-2. Kubernetes Enable

Docker Desktop에서 다음 순서로 Kubernetes를 켠다.

1. `Settings`
2. `Kubernetes`
3. `Enable Kubernetes`
4. `Apply & Restart`

Kubernetes가 완전히 올라올 때까지 기다린다.

### 1-3. kubectl 확인

```powershell
kubectl version --client
kubectl config current-context
kubectl get nodes
```

확인 기준:

- `kubectl` 명령이 정상 동작해야 한다.
- current context가 Docker Desktop Kubernetes여야 한다.
- `kubectl get nodes` 결과에 로컬 노드가 `Ready` 상태로 보여야 한다.

### 1-4. Helm 설치

Helm은 현재 `k8s/` 기본 apply 절차의 필수는 아니지만, 로컬 확장 구성과 후속 차트 작업을 위해 함께 설치한다.

```powershell
helm version
```

설치 후 위 명령으로 동작 여부를 확인한다.

## 2. Repository 준비

```powershell
git clone <repository-url>
cd BrainX
git checkout <branch-name>
git status
```

확인 기준:

- 작업 브랜치가 맞아야 한다.
- 불필요한 로컬 변경이 없어야 한다.

## 2-1. Docker Compose 실행

현재 Kubernetes로 전환되지 않은 서비스(Postgres, Redis, Kafka, Neo4j, Qdrant 및 일부 Spring Boot 서비스)는 Docker Compose로 먼저 실행한다.

```powershell
.\run.ps1
```

확인 기준:

```powershell
docker compose -f .\brainX_back\docker-compose.yml ps
```

필수 서비스가 `Up` 상태인지 확인한다.

> 현재 Kubernetes는 Docker Compose 인프라와 함께 사용하는 점진 전환 구조이다.

## 3. Secret 생성

실제 Secret 파일은 example 파일을 복사해서 만든다.

```powershell
Copy-Item .\k8s\secrets\gateway-secret.example.yaml .\k8s\secrets\gateway-secret.yaml
Copy-Item .\k8s\secrets\postgres-secret.example.yaml .\k8s\secrets\postgres-secret.yaml
Copy-Item .\k8s\secrets\workspace-secret.example.yaml .\k8s\secrets\workspace-secret.yaml
Copy-Item .\k8s\secrets\ingestion-service-secret.example.yaml .\k8s\secrets\ingestion-service-secret.yaml
Copy-Item .\k8s\secrets\commerce-service-secret.example.yaml .\k8s\secrets\commerce-service-secret.yaml
Copy-Item .\k8s\secrets\intelligence-service-secret.example.yaml .\k8s\secrets\intelligence-service-secret.yaml
Copy-Item .\k8s\secrets\mcp-service-secret.example.yaml .\k8s\secrets\mcp-service-secret.yaml
Copy-Item .\k8s\secrets\admin-service-secret.example.yaml .\k8s\secrets\admin-service-secret.yaml
Copy-Item .\k8s\secrets\grafana-secret.example.yaml .\k8s\secrets\grafana-secret.yaml
# 소셜 로그인을 로컬에서 검증할 때만 필요 (선택)
Copy-Item .\k8s\secrets\user-service-oauth-secret.example.yaml .\k8s\secrets\user-service-oauth-secret.yaml
```

### 3-1. `gateway-secret.yaml`

파일: `k8s/secrets/gateway-secret.yaml`

입력 위치:

```yaml
stringData:
  SERVICE_TOKEN: CHANGE_ME
  JWT_SECRET: CHANGE_ME_AT_LEAST_32_BYTE_SECRET
```

설명:

- `SERVICE_TOKEN`에는 Gateway와 내부 서비스 간 호출에 사용하는 실제 토큰 값을 넣는다.
- `JWT_SECRET`에는 Gateway-Service와 User-Service가 토큰 서명/검증에 함께 쓰는 32바이트 이상 실제 값을 넣는다. `workspace-secret`, `commerce-service-secret`, `admin-service-secret`, `mcp-service-secret`의 `JWT_SECRET`과 반드시 같은 값이어야 한다.

### 3-2. `postgres-secret.yaml`

파일: `k8s/secrets/postgres-secret.yaml`

입력 위치:

```yaml
stringData:
  POSTGRES_USER: <actual-user>
  POSTGRES_PASSWORD: <actual-password>
```

설명:

- `POSTGRES_USER`에는 로컬 Postgres 사용자명을 넣는다.
- `POSTGRES_PASSWORD`에는 로컬 Postgres 비밀번호를 넣는다.

### 3-3. 준비된 추가 example Secret

- `workspace-secret.yaml`
  - `JWT_SECRET`
  - `NEO4J_PASSWORD`
- `ingestion-service-secret.yaml`
  - `NOTION_CLIENT_ID`
  - `NOTION_CLIENT_SECRET`
- `commerce-service-secret.yaml`
  - `JWT_SECRET`
  - `TOSS_CLIENT_KEY`
  - `TOSS_SECRET_KEY`
- `intelligence-service-secret.yaml`
  - `OPENAI_API_KEY`
  - `QDRANT_API_KEY`
- `mcp-service-secret.yaml`
  - `JWT_SECRET`
- `admin-service-secret.yaml`
  - `JWT_SECRET`
  - `MAIL_USERNAME`
  - `MAIL_PASSWORD`
  - `SEED_ADMIN_LOGIN_ID`
  - `SEED_ADMIN_PASSWORD`
  - `SEED_ADMIN_NAME`
- `grafana-secret.yaml`
  - `GF_SECURITY_ADMIN_USER`
  - `GF_SECURITY_ADMIN_PASSWORD`
- `user-service-oauth-secret.yaml` (선택)
  - `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`
  - `KAKAO_CLIENT_ID`, `KAKAO_CLIENT_SECRET`, `KAKAO_REDIRECT_URI`
  - `NAVER_CLIENT_ID`, `NAVER_CLIENT_SECRET`, `NAVER_REDIRECT_URI`

현재 기준:

- `gateway-service`, `user-service` 매니페스트는 `gateway-secret`의 `SERVICE_TOKEN`과 `JWT_SECRET`을 함께 참조한다.
- `workspace-service` 매니페스트는 `workspace-secret`을 참조한다.
- `ingestion-service` 매니페스트는 `ingestion-service-secret`을 참조한다.
- `commerce-service` 매니페스트는 `commerce-service-secret`을 참조한다.
- `intelligence-service` 매니페스트는 `intelligence-service-secret`을 참조한다.
- `mcp-service` 매니페스트는 `mcp-service-secret`을 참조한다.
- `admin-service` 매니페스트는 `admin-service-secret`을 참조한다.
- 따라서 `admin-service`를 실제 apply 하기 전에는 example을 복사한 실제 `admin-service-secret.yaml`을 만들고 먼저 apply 해야 한다.
- `grafana-secret` example은 Grafana 준비용 자산이다.
- `user-service` 매니페스트는 `user-service-oauth-secret`의 9개 키를 `optional: true`로 참조한다. Secret이 없으면 해당 env는 주입되지 않고 애플리케이션 기본값(placeholder)으로 fallback하며, Pod 기동 자체는 막지 않는다.

### 3-4. 실제 값을 어디에 입력하는가

- Gateway 토큰: `k8s/secrets/gateway-secret.yaml`의 `stringData.SERVICE_TOKEN`
- 공유 JWT 시크릿(Gateway/User): `k8s/secrets/gateway-secret.yaml`의 `stringData.JWT_SECRET`
- Postgres 사용자명: `k8s/secrets/postgres-secret.yaml`의 `stringData.POSTGRES_USER`
- Postgres 비밀번호: `k8s/secrets/postgres-secret.yaml`의 `stringData.POSTGRES_PASSWORD`
- Workspace JWT/Neo4j 비밀번호: `k8s/secrets/workspace-secret.yaml`
- Ingestion Notion OAuth 값: `k8s/secrets/ingestion-service-secret.yaml`
- Commerce JWT/Toss key: `k8s/secrets/commerce-service-secret.yaml`
- Intelligence OpenAI/Qdrant 값: `k8s/secrets/intelligence-service-secret.yaml`
- MCP JWT 시크릿: `k8s/secrets/mcp-service-secret.yaml`
  - `JWT_SECRET`은 Gateway-Service, User-Service, Workspace-Service, Admin-Service, Mcp-Service가 공통으로 쓰는 동일 값이어야 한다.
- Admin JWT/메일/시드 관리자 값: `k8s/secrets/admin-service-secret.yaml`
- Grafana admin 계정: `k8s/secrets/grafana-secret.yaml`
- (선택) User-Service 소셜 로그인: `k8s/secrets/user-service-oauth-secret.yaml`
  - Google/Kakao/Naver OAuth client ID/secret/redirect URI. optional Secret이라 만들지 않아도 다른 서비스는 정상 기동하며, 이 경우 소셜 로그인만 placeholder 기본값으로 동작해 실패한다.

### 3-5. Git에 올리면 안 되는 파일

다음 파일은 절대 커밋하지 않는다.

- `k8s/secrets/gateway-secret.yaml`
- `k8s/secrets/postgres-secret.yaml`
- `k8s/secrets/workspace-secret.yaml`
- `k8s/secrets/ingestion-service-secret.yaml`
- `k8s/secrets/commerce-service-secret.yaml`
- `k8s/secrets/intelligence-service-secret.yaml`
- `k8s/secrets/mcp-service-secret.yaml`
- `k8s/secrets/admin-service-secret.yaml`
- `k8s/secrets/grafana-secret.yaml`
- `k8s/secrets/user-service-oauth-secret.yaml`

커밋 가능한 파일:

- `k8s/secrets/gateway-secret.example.yaml`
- `k8s/secrets/postgres-secret.example.yaml`
- `k8s/secrets/workspace-secret.example.yaml`
- `k8s/secrets/ingestion-service-secret.example.yaml`
- `k8s/secrets/commerce-service-secret.example.yaml`
- `k8s/secrets/intelligence-service-secret.example.yaml`
- `k8s/secrets/mcp-service-secret.example.yaml`
- `k8s/secrets/admin-service-secret.example.yaml`
- `k8s/secrets/grafana-secret.example.yaml`
- `k8s/secrets/user-service-oauth-secret.example.yaml`

현재 `.gitignore`는 아래 규칙으로 실제 secret 파일을 제외한다.

- `k8s/secrets/*.yaml`
- `!k8s/secrets/*.example.yaml`

## Kubernetes Helper Script (권장)

개별 서비스를 다시 배포할 때는 `k8s.ps1` 사용을 권장한다.

예시:

```powershell
.\k8s.ps1 discovery
.\k8s.ps1 gateway
.\k8s.ps1 user
.\k8s.ps1 ingestion
.\k8s.ps1 commerce
.\k8s.ps1 intelligence
.\k8s.ps1 admin
.\k8s.ps1 mcp
```

`k8s.ps1`는 아래 작업을 자동 수행한다.

- namespace 확인
- Secret 존재 확인
- Docker 이미지 빌드
- (서비스별 ConfigMap이 있으면) ConfigMap apply
- kubectl apply
- rollout restart
- rollout status
- Pod 상태 확인

`mcp`는 `k8s\apps\mcp-service-configmap.yaml`도 함께 apply한다. `mcp-service.yaml` Deployment가 `envFrom`으로 이 ConfigMap을 참조하므로, ConfigMap 없이 Deployment만 apply하면 Pod가 `CreateContainerConfigError`로 멈춘다.
`ingestion`은 `k8s\apps\ingestion-service-configmap.yaml`도 함께 apply한다. `ingestion-service.yaml` Deployment가 `envFrom`으로 이 ConfigMap을 참조하므로, ConfigMap 없이 Deployment만 apply하면 Pod가 `CreateContainerConfigError`로 멈춘다.
`intelligence`는 `k8s\apps\intelligence-service-configmap.yaml`도 함께 apply한다. `intelligence-service.yaml` Deployment가 `envFrom`으로 이 ConfigMap을 참조하므로, ConfigMap 없이 Deployment만 apply하면 Pod가 `CreateContainerConfigError`로 멈춘다.

Workspace, Ingestion, Intelligence, MCP는 현재 매니페스트 준비됨, 실제 apply 검증 전 상태다.

## 4. Docker 이미지 빌드

현재 `k8s/` 매니페스트 기준 기본 적용 대상 서비스:

```powershell
docker build -t brainx-discovery-service:local .\brainX_back\Discovery-Service
docker build -t brainx-gateway-service:local .\brainX_back\Gateway-Service
docker build -t brainx-user-service:local .\brainX_back\User-Service
docker build -t brainx-admin-service:local .\brainX_back\Admin-Service
```

후속 서비스 매니페스트를 추가하거나 확장 검증할 때 사용할 빌드 명령:

```powershell
docker build -t brainx-workspace-service:local .\brainX_back\Workspace-Service
docker build -t brainx-ingestion-service:local .\brainX_back\Ingestion-Service
docker build -t brainx-commerce-service:local .\brainX_back\Commerce-Service
docker build -t brainx-intelligence-service:local .\brainX_back\Intelligence-Service
docker build -t brainx-mcp-service:local .\brainX_back\Mcp-Service
```

주의:

- Docker Desktop Kubernetes는 같은 Docker 엔진의 로컬 이미지를 그대로 사용할 수 있어야 한다.
- 이미지 태그는 매니페스트와 맞춰 `:local`을 사용한다.

> 참고:
>
> `k8s.ps1`를 사용할 경우 Docker 이미지는 자동으로 빌드되므로 일반적인 개발 과정에서는 직접 `docker build`를 실행할 필요가 없다.

## 5. Kubernetes 적용 순서

현재 저장소 기준 적용 순서:

```powershell
kubectl apply -f .\k8s\namespace.yaml
kubectl apply -f .\k8s\secrets\gateway-secret.yaml
kubectl apply -f .\k8s\secrets\postgres-secret.yaml
kubectl apply -f .\k8s\apps\discovery-service.yaml
kubectl apply -f .\k8s\apps\gateway-service.yaml
kubectl apply -f .\k8s\apps\user-service.yaml
kubectl apply -f .\k8s\secrets\ingestion-service-secret.yaml
kubectl apply -f .\k8s\apps\ingestion-service-configmap.yaml
kubectl apply -f .\k8s\apps\ingestion-service.yaml
kubectl apply -f .\k8s\secrets\commerce-service-secret.yaml
kubectl apply -f .\k8s\apps\commerce-service.yaml
kubectl apply -f .\k8s\secrets\intelligence-service-secret.yaml
kubectl apply -f .\k8s\apps\intelligence-service-configmap.yaml
kubectl apply -f .\k8s\apps\intelligence-service.yaml
kubectl apply -f .\k8s\secrets\admin-service-secret.yaml
kubectl apply -f .\k8s\apps\admin-service.yaml
```

권장 순서

1. run.ps1
2. Secret 생성
3. k8s.ps1 discovery
4. k8s.ps1 gateway
5. k8s.ps1 user
6. 이후 서비스

현재 `k8s/apps/`에 있는 후속 서비스:

- `admin-service.yaml`
- `workspace-service.yaml`
- `ingestion-service.yaml`
- `ingestion-service-configmap.yaml`
- `intelligence-service.yaml`
- `intelligence-service-configmap.yaml`
- `mcp-service.yaml`

`workspace-service`, `intelligence-service`, `mcp-service`는 파일은 준비되어 있지만 아직 실제 apply 검증 전 기준으로 취급한다.

## 6. 동작 확인

### 6-1. Pod 상태 확인

```powershell
kubectl -n brainx get pods
kubectl -n brainx get deployments
kubectl -n brainx get services
```

### 6-2. rollout status 확인

```powershell
kubectl -n brainx rollout status deployment/discovery-service
kubectl -n brainx rollout status deployment/gateway-service
kubectl -n brainx rollout status deployment/user-service
kubectl -n brainx rollout status deployment/ingestion-service
kubectl -n brainx rollout status deployment/intelligence-service
kubectl -n brainx rollout status deployment/admin-service
```

### 6-3. port-forward

기존 로컬 포트와 충돌하지 않도록 다음 포트를 권장한다.

```powershell
kubectl -n brainx port-forward svc/discovery-service 18761:8761
kubectl -n brainx port-forward svc/gateway-service 18088:8088
kubectl -n brainx port-forward svc/user-service 18080:8080
kubectl -n brainx port-forward svc/ingestion-service 18083:8083
kubectl -n brainx port-forward svc/intelligence-service 18086:8086
kubectl -n brainx port-forward svc/admin-service 18085:8085
```

### 6-4. actuator health 확인

```powershell
curl.exe http://localhost:18761/actuator/health
curl.exe http://localhost:18088/actuator/health
curl.exe http://localhost:18080/actuator/health
curl.exe http://localhost:18080/actuator/health/readiness
curl.exe http://localhost:18080/actuator/health/liveness
curl.exe http://localhost:18083/actuator/health
curl.exe http://localhost:18086/actuator/health/readiness
curl.exe http://localhost:18086/actuator/health/liveness
curl.exe http://localhost:18085/actuator/health
curl.exe http://localhost:18085/actuator/health/readiness
curl.exe http://localhost:18085/actuator/health/liveness
```

확인 기준:

- Discovery: `/actuator/health`
- Gateway: `/actuator/health`
- User: `/actuator/health`, `/actuator/health/readiness`, `/actuator/health/liveness`
- Intelligence: `/actuator/health/readiness`, `/actuator/health/liveness`
- Admin: `/actuator/health`, `/actuator/health/readiness`, `/actuator/health/liveness`

## 7. Docker Desktop에서 확인할 위치

Docker Desktop의 `Containers`가 아니라 Kubernetes 리소스 화면에서 확인한다.

확인 위치:

- Pods
- Deployments
- Services
- Secrets
- ConfigMaps

주요 확인 포인트:

- Pod가 `Running` 또는 `Ready` 상태인지
- Deployment replica가 모두 준비되었는지
- Service가 `brainx` namespace에 생성되었는지
- Secret이 `gateway-secret`, `postgres-secret` 이름으로 생성되었는지
- Admin-Service 준비 검증 시 `admin-service-secret`도 함께 확인하는지
- Commerce-Service 준비 검증 시 `commerce-service-secret`도 함께 확인하는지
- Intelligence 준비 검증 시 `intelligence-service-secret`도 함께 확인하는지
- Workspace/MCP/Grafana 준비 검증 시 `workspace-secret`, `mcp-service-secret`, `grafana-secret`도 함께 확인하는지
- Ingestion 준비 검증 시 `ingestion-service-secret`도 함께 확인하는지
- ConfigMap이 필요한 구조로 확장되었을 때 정상 반영되는지

## 8. Troubleshooting

### 8-1. CrashLoopBackOff

확인 명령:

```powershell
kubectl -n brainx logs deployment/discovery-service
kubectl -n brainx logs deployment/gateway-service
kubectl -n brainx logs deployment/user-service
kubectl -n brainx logs deployment/intelligence-service
kubectl -n brainx logs deployment/admin-service
```

점검 순서:

1. Secret 값이 비어 있지 않은지 확인한다.
2. 이미지 태그가 매니페스트와 일치하는지 확인한다.
3. `host.docker.internal`로 연결하는 Compose 대상 서비스가 실제로 떠 있는지 확인한다.
4. Gateway의 경우 `SPRING_APPLICATION_JSON` 오타나 JSON 형식 오류가 없는지 확인한다.

### 8-2. 401 Health Probe

증상:

- Pod는 떴지만 readiness/liveness probe가 계속 실패한다.
- `GET /actuator/health` 또는 `/actuator/health/readiness`가 `401`을 반환한다.

의미:

- 애플리케이션 자체 기동 문제라기보다 actuator 보안 설정 문제일 가능성이 크다.

대응:

- User-Service와 Admin-Service는 최소한 `/actuator/health`, `/actuator/health/readiness`, `/actuator/health/liveness`가 probe에서 접근 가능해야 한다.
- 먼저 `port-forward` 후 직접 health endpoint 응답을 확인한다.

### 8-3. ImagePullBackOff

원인 후보:

- 로컬 이미지가 아직 빌드되지 않았다.
- 태그명이 매니페스트와 다르다.

대응:

1. `docker images`로 이미지 존재 여부를 확인한다.
2. 매니페스트의 `image:` 값과 동일한 태그로 다시 빌드한다.
3. Docker Desktop Kubernetes가 같은 로컬 Docker 엔진을 보고 있는지 확인한다.

### 8-4. Secret 누락

증상:

- `secret not found`
- 환경 변수 주입 실패
- Pod 생성 직후 `CreateContainerConfigError`

대응:

```powershell
kubectl -n brainx get secrets
kubectl apply -f .\k8s\secrets\gateway-secret.yaml
kubectl apply -f .\k8s\secrets\postgres-secret.yaml
```

Secret을 먼저 적용한 뒤 Deployment를 다시 apply 한다.

`mcp-service`, `workspace-service`, Grafana를 검증할 때는 해당 example에서 만든 실제 Secret도 먼저 apply 해야 한다.

### 8-5. Port Forward 충돌

증상:

- `address already in use`

대응:

- 이미 사용 중인 로컬 포트를 피해서 다른 포트로 바꾼다.
- 예: `8761` 대신 `18761`, `8088` 대신 `18088`

예시:

```powershell
kubectl -n brainx port-forward svc/discovery-service 28761:8761
```

### 8-6. `host.docker.internal` 관련

현재 `gateway-service`, `user-service`, `admin-service`, `mcp-service` 매니페스트는 일부 의존 대상을 `host.docker.internal`로 본다.

의미:

- Docker Compose로 띄운 호스트 측 서비스에 Kubernetes Pod가 접근하는 로컬 전용 구성이다.

점검 항목:

1. Docker Compose 대상 서비스가 실제로 실행 중인지 확인한다.
2. 해당 서비스 포트가 호스트에 publish 되어 있는지 확인한다.
3. Docker Desktop Kubernetes 환경인지 확인한다.

주의:

- 이 방식은 운영 클러스터나 일반 Linux Kubernetes에 그대로 이식되지 않는다.

### 8-7. k8s.ps1 실행 오류

확인 항목

- Docker Desktop Kubernetes가 실행 중인지
- namespace가 생성되어 있는지
- 필요한 Secret이 적용되어 있는지
- Docker 이미지 빌드가 성공했는지
- rollout status가 완료되었는지

PowerShell 실행 정책으로 인해 스크립트가 실행되지 않으면 다음 명령으로 실행한다.

```powershell
powershell -ExecutionPolicy Bypass -File .\k8s.ps1 discovery
```

### 8-8. MCP OAuth 공개 URL 불일치

증상:

- `mcp-service` Pod는 떠 있지만 MCP client OAuth login 또는 `/mcp` 접근이 `401` 또는 discovery 오류로 실패한다.

원인 후보:

- `k8s/apps/mcp-service-configmap.yaml`의 `PUBLIC_BASE_URL`, `BRAINX_OAUTH_ISSUER`, `BRAINX_MCP_RESOURCE`, `BRAINX_MCP_PROTECTED_RESOURCE_METADATA_URL`가 User-Service의 MCP OAuth 설정과 다르다.
- `JWT_SECRET`은 같지만 token `iss` 또는 `resource`가 달라 Mcp-Service 검증에서 거부된다.

대응:

1. 로컬 Docker Desktop 검증이면 위 4개 값이 `http://localhost:3000`, `http://localhost:3000`, `http://localhost:3000/mcp`, `http://localhost:3000/.well-known/oauth-protected-resource`로 맞는지 확인한다.
2. User-Service 로컬/Compose 설정의 `BRAINX_OAUTH_ISSUER`, `BRAINX_MCP_RESOURCE`도 같은 값인지 확인한다.
3. 비로컬/실운영 검증이면 위 4개 값을 동일한 실제 공개 origin으로 함께 바꾼다.

### 8-9. Gateway가 계속 Compose MCP를 바라보는 문제

현재 `gateway-service`의 정적 discovery 매핑은 `mcp-service -> http://host.docker.internal:8087` 기준이다.

의미:

- `mcp-service`를 Kubernetes에 apply해도 Gateway 경유 트래픽은 자동으로 새 Pod로 전환되지 않는다.

안전한 전환 순서:

1. `svc/mcp-service` 또는 `port-forward`로 새 K8s `mcp-service`를 직접 검증한다.
2. Gateway 매핑을 `http://mcp-service:8087`로 바꿀 준비가 되었는지 확인한다.
3. Gateway를 재배포해 K8s MCP로 붙인 뒤 Compose `mcp-service`를 중단한다.

## 9. Git 규칙

- Secret은 절대 커밋하지 않는다.
- example 파일만 커밋한다.
- 실제 secret 파일이 변경되어도 `git add` 대상에 포함하지 않는다.
- 커밋 전 `git status`로 `k8s/secrets/*.yaml` 실제 파일들이 추적되지 않는지 확인한다.

커밋 전에는 항상 아래 명령으로 확인한다.

```powershell
git status
git status --ignored
```

실제 Secret 파일이 추적되지 않는지 확인한다.

`gateway-secret.yaml`, `postgres-secret.yaml`, `workspace-secret.yaml`, `commerce-service-secret.yaml`, `mcp-service-secret.yaml`, `admin-service-secret.yaml`, `grafana-secret.yaml` 같은 실제 Secret 파일이 Git에 추가되지 않았는지 확인한다.

## Commerce-Service apply 전 체크리스트

- `k8s/apps/commerce-service.yaml`의 `secretKeyRef.name`이 `postgres-secret`, `gateway-secret`, `commerce-service-secret`을 참조하는지 확인
- `k8s/secrets/commerce-service-secret.example.yaml`의 키가 `JWT_SECRET`, `TOSS_CLIENT_KEY`, `TOSS_SECRET_KEY`로 유지되는지 확인
- 실제 `commerce-service-secret.yaml` 생성 시 키 이름은 바꾸지 않고 값만 채우는지 확인
- `commerce-service-secret.yaml`의 `JWT_SECRET`이 Gateway-Service, User-Service, Workspace-Service, Admin-Service, Mcp-Service와 공통으로 쓰는 동일 값인지 확인
- `gateway-secret`, `postgres-secret`, `commerce-service-secret`이 모두 `brainx` namespace에 먼저 apply 되어 있는지 확인
- Postgres(`host.docker.internal:5432`, DB `brainx_commerce`), Kafka(`host.docker.internal:9092`), Eureka(`http://discovery-service:8761/eureka/`) 연결 가능 여부를 확인
- Commerce probe 경로가 `/actuator/health` 기준이고, `SecurityConfig`가 `/actuator/health`, `/actuator/prometheus`만 `permitAll`인 현재 코드와 맞는지 확인
- 실제 apply 직전 `kubectl -n brainx get secret commerce-service-secret`, `kubectl -n brainx get secret gateway-secret`, `kubectl -n brainx get secret postgres-secret`으로 선행 Secret 존재를 재확인

## MCP-Service apply 전 체크리스트

- `k8s/apps/mcp-service.yaml`의 `secretKeyRef.name`이 `postgres-secret`, `gateway-secret`, `mcp-service-secret`을 참조하는지 확인
- `mcp-service.yaml`의 `envFrom`이 참조하는 `mcp-service-config` ConfigMap(`k8s/apps/mcp-service-configmap.yaml`)이 먼저 apply 되어 있는지 확인. `.\k8s.ps1 mcp`는 이 ConfigMap을 자동으로 함께 apply하지만, `kubectl apply -f .\k8s\apps\mcp-service.yaml`을 직접 쓸 때는 ConfigMap을 빠뜨리면 Pod가 `CreateContainerConfigError`로 멈춘다
- `k8s/apps/mcp-service-configmap.yaml`의 `PUBLIC_BASE_URL`, `BRAINX_OAUTH_ISSUER`, `BRAINX_MCP_RESOURCE`, `BRAINX_MCP_PROTECTED_RESOURCE_METADATA_URL` 네 값이 같은 공개 origin 계열인지 확인
- 로컬 Docker Desktop 검증이면 위 공개 URL 4개 값이 `http://localhost:3000` 기준과 일치하는지 확인
- `k8s/secrets/mcp-service-secret.example.yaml`의 키가 `JWT_SECRET`으로 유지되는지 확인
- 실제 `mcp-service-secret.yaml` 생성 시 키 이름은 바꾸지 않고 값만 채우는지 확인
- `mcp-service-secret.yaml`의 `JWT_SECRET`이 User-Service, Workspace-Service, Admin-Service, Mcp-Service에서 공통으로 쓰는 동일 값인지 확인
- `gateway-secret`, `postgres-secret`, `mcp-service-secret`이 모두 `brainx` namespace에 먼저 apply 되어 있는지 확인
- Postgres(`host.docker.internal:5432`, DB `brainx_mcp`), Workspace(`http://host.docker.internal:8082`), Intelligence(`http://host.docker.internal:8086`), Eureka(`http://discovery-service:8761/eureka/`) 연결 가능 여부를 확인
- Gateway가 아직 `mcp-service -> http://host.docker.internal:8087` 정적 매핑을 쓰고 있다는 점을 인지하고, direct 검증 후에만 Gateway 전환을 계획하는지 확인
- 실제 apply 직전 `kubectl -n brainx get secret mcp-service-secret`, `kubectl -n brainx get secret gateway-secret`, `kubectl -n brainx get secret postgres-secret`으로 선행 Secret 존재를 재확인

## Admin-Service apply 전 체크리스트

- `k8s/apps/admin-service.yaml`의 `secretKeyRef.name`이 `admin-service-secret`을 참조하는지 확인
- `k8s/secrets/admin-service-secret.example.yaml`의 키가 `JWT_SECRET`, `MAIL_USERNAME`, `MAIL_PASSWORD`, `SEED_ADMIN_LOGIN_ID`, `SEED_ADMIN_PASSWORD`, `SEED_ADMIN_NAME`으로 유지되는지 확인
- 실제 `admin-service-secret.yaml` 생성 시 키 이름은 바꾸지 않고 값만 채우는지 확인
- `gateway-secret`, `postgres-secret`, `admin-service-secret`이 모두 `brainx` namespace에 먼저 apply 되어 있는지 확인
- Admin probe 경로가 `/actuator/health/readiness`, `/actuator/health/liveness`이고 SecurityConfig 에서 `/actuator/**`가 `permitAll`인지 확인
- Postgres(`host.docker.internal:5432`, DB `brainx_admin`), Kafka(`host.docker.internal:9092`), Eureka(`http://discovery-service:8761/eureka/`) 연결 가능 여부를 확인
- Downstream `gateway-service`, `user-service`, `commerce-service`, `workspace-service`, `ingestion-service`, `intelligence-service`, `mcp-service`가 ConfigMap URL 기준으로 접근 가능한지 확인
- `host.docker.internal` 기반 값은 Docker Desktop 로컬 검증용 전제이므로 다른 Kubernetes 환경에서는 그대로 실패할 수 있음을 확인
- 실제 apply 직전 `kubectl -n brainx get secret admin-service-secret`, `kubectl -n brainx get secret gateway-secret`, `kubectl -n brainx get secret postgres-secret`으로 선행 Secret 존재를 재확인

## 빠른 재구성 체크리스트

1. Docker Desktop 설치 및 Kubernetes Enable
2. `kubectl`, `helm` 동작 확인
3. 저장소 clone 및 브랜치 checkout
4. example secret 복사 후 실제 값 입력
5. Docker 이미지 빌드
6. namespace -> secret -> discovery -> gateway -> user -> 이후 서비스 순서로 apply
7. `kubectl get pods`, `rollout status`, `port-forward`, `actuator health`로 검증

## 향후 계획

현재 Kubernetes 적용 상태

- ✅ Discovery-Service
- ✅ Gateway-Service
- 🔄 User-Service
- ⏳ Workspace-Service: 매니페스트 준비됨, 실제 apply 검증 전
- ⏳ Ingestion-Service: 매니페스트 준비됨, 실제 apply 검증 전
- ⏳ Intelligence-Service: 매니페스트 준비됨, 실제 apply 검증 전
- ⏳ Admin-Service
- ⏳ MCP-Service: 매니페스트 준비됨, 실제 apply 검증 전

향후 작업

- Prometheus
- Grafana
- Helm Chart
- ConfigMap 분리
- 운영 환경(EC2) 적용

> 현재 구성은 Docker Desktop 기반 로컬 Kubernetes 검증 환경이다.
> 운영 환경에서는 `host.docker.internal` 대신 Kubernetes Service, Secret, ConfigMap 기반으로 구성해야 한다.

## Monitoring apply 전 체크리스트

- `k8s/secrets/grafana-secret.example.yaml`의 키가 `GF_SECURITY_ADMIN_USER`, `GF_SECURITY_ADMIN_PASSWORD`로 유지되는지 확인
- `k8s/monitoring/grafana.yaml`의 `secretKeyRef.name`이 `grafana-secret`을 참조하는지 확인
- 실제 `k8s/secrets/grafana-secret.yaml` 생성 시 키 이름은 바꾸지 않고 값만 채우는지 확인
- `kubectl -n brainx get svc user-service gateway-service admin-service workspace-service commerce-service mcp-service`로 Prometheus active scrape 대상 Service 존재를 재확인
- `ingestion-service`, `intelligence-service`는 아직 active scrape 대상이 아니므로 계속 주석 상태인지 확인
- 실제 apply 직전 `kubectl -n brainx get secret grafana-secret`으로 선행 Secret 존재를 재확인
- `k8s/monitoring/prometheus.yaml`, `k8s/monitoring/grafana.yaml`의 `emptyDir`가 로컬 검증용 임시 저장소라는 점을 팀이 인지하고 있는지 확인
- Prometheus/Grafana 적용 범위가 로컬 검증용이며 PVC, dashboard 자산 영속화, Alertmanager는 후속 작업으로 남겨 두는지 확인

## Monitoring 후속 운영 보완

- Prometheus PVC
- Grafana PVC
- Grafana dashboard provisioning 자산 고정화
- Alertmanager 및 알림 정책
- 운영 환경용 Helm/Operator 전략

## 참고

현재 Kubernetes 구성은 Docker Desktop 기반의 로컬 검증 환경이다.

운영 환경에서는

- host.docker.internal 제거
- Kubernetes Service 사용
- ConfigMap 사용
- Secret 사용
- Ingress 사용

방식으로 변경한다.
