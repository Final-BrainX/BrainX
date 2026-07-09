# BrainX Helm Chart 설계 문서 (HELM_DESIGN)

> 이 문서는 **설계 문서**다. 실제 Helm Chart 파일(`Chart.yaml`, `values.yaml`, `templates/*`)은
> 이 문서에서 만들지 않는다. 기존 `k8s/apps`, `k8s/monitoring`, `k8s/secrets` 매니페스트를 삭제하거나
> `kubectl apply` 하지 않으며, 실제 Secret 값도 작성하지 않는다.
>
> 목적: 현재 순수 YAML(raw manifest) 구조를 Helm Chart로 옮기기 위한 **구조 · values · 분리 전략 ·
> 마이그레이션 순서 · 검증 방법**을 사전에 확정하는 것.

---

## 0. 현재 상태 요약 (설계 입력값)

Helm 설계는 아래 "지금 존재하는 리소스"를 그대로 반영하는 것을 원칙으로 한다.

### 0.1 애플리케이션 서비스 (`k8s/apps/`)

| 서비스 | 파일 | 구성 리소스 | 포트 | ConfigMap | 참조 Secret | 특이사항 |
|---|---|---|---|---|---|---|
| Discovery | `discovery-service.yaml` | Deployment + Service | 8761 | 없음(inline env) | 없음 | Eureka 서버 |
| Gateway | `gateway-service.yaml` | Deployment + Service | 8088 | 없음(inline env) | `gateway-secret`(`SERVICE_TOKEN`, `JWT_SECRET`) | Eureka client 비활성, `SPRING_APPLICATION_JSON` 정적 discovery |
| User | `user-service.yaml` | Deployment + Service | 8080 | 없음(inline env) | `postgres-secret`, `gateway-secret`(`SERVICE_TOKEN`, `JWT_SECRET`), `user-service-oauth-secret`(선택) | `startupProbe` 사용 |
| Admin | `admin-service.yaml` | ConfigMap + Deployment + Service | 8085 | `admin-service-config` (동일 파일 내) | `postgres-secret`, `gateway-secret`, `admin-service-secret` | Kafka 의존 |
| Workspace | `workspace-service.yaml` | ConfigMap + Deployment + Service | 8082 | `workspace-service-config` (동일 파일 내) | `postgres-secret`, `gateway-secret`, `workspace-secret` | Neo4j 백필, readiness=db+redis |
| MCP | `mcp-service.yaml` + `mcp-service-configmap.yaml` | Deployment + Service (+ 분리된 ConfigMap 파일) | 8087 | `mcp-service-config` (별도 파일) | `postgres-secret`, `gateway-secret`, `mcp-service-secret` | `startupProbe`, OAuth issuer/resource |

관찰된 **비일관성**(Helm 전환으로 통일할 대상):

- ConfigMap 채택이 서비스마다 다르다. Discovery/Gateway/User는 inline env, Admin/Workspace는 파일 내 ConfigMap, MCP는 별도 파일 ConfigMap.
- Probe 구성이 제각각이다. 일부는 `startupProbe`가 있고(User, MCP) 일부는 없다. `initialDelaySeconds`, probe path(`/actuator/health` vs `/actuator/health/readiness`)가 서비스별로 다르다.
- 이미지 태그는 모두 `brainx-<svc>-service:local` + `imagePullPolicy: IfNotPresent`로 통일돼 있다.
- 모든 다운스트림 주소가 `host.docker.internal:<port>` 기반이다. 이는 **Docker Desktop 로컬 전용**이며 운영 클러스터에서는 다른 주소 체계가 필요하다.

### 0.2 모니터링 (`k8s/monitoring/`)

| 컴포넌트 | 파일 | 구성 | 포트 | 참조 Secret | 스토리지 |
|---|---|---|---|---|---|
| Prometheus | `prometheus.yaml` + `prometheus-configmap.yaml` | Deployment + Service + ConfigMap | 9090 | 없음 | `emptyDir` (휘발) |
| Grafana | `grafana.yaml` + `grafana-configmap.yaml` | Deployment + Service + ConfigMap | 3000 | `grafana-secret` | `emptyDir` (휘발) |

- Prometheus는 `<svc>.brainx.svc.cluster.local:<port>` static target으로 스크레이프한다. 현재 활성 대상은 user/gateway/admin/workspace. mcp는 `/actuator/prometheus`를 아직 노출하지 않아 주석 처리했고, ingestion/commerce/intelligence는 Service 자체가 없어 주석 처리된 미래 대상이다.
- Grafana는 datasource/dashboard provisioning을 ConfigMap subPath 마운트로 주입한다.

### 0.3 Secret 인벤토리 (`k8s/secrets/`, example만 Git 추적)

| Secret | 키 | 공유 범위 |
|---|---|---|
| `postgres-secret` | `POSTGRES_USER`, `POSTGRES_PASSWORD` | User, Admin, Workspace, MCP 공유 |
| `gateway-secret` | `SERVICE_TOKEN`, `JWT_SECRET` | Gateway, User, Admin, Workspace, MCP 공유 (`JWT_SECRET`은 Gateway/User가 참조) |
| `workspace-secret` | `JWT_SECRET`, `NEO4J_PASSWORD` | Workspace 전용 |
| `admin-service-secret` | `JWT_SECRET`, `MAIL_USERNAME`, `MAIL_PASSWORD`, `SEED_ADMIN_LOGIN_ID`, `SEED_ADMIN_PASSWORD`, `SEED_ADMIN_NAME` | Admin 전용 |
| `mcp-service-secret` | `JWT_SECRET` | MCP 전용 |
| `grafana-secret` | `GF_SECURITY_ADMIN_USER`, `GF_SECURITY_ADMIN_PASSWORD` | Grafana 전용 |
| `user-service-oauth-secret` (선택) | `GOOGLE_CLIENT_ID`/`SECRET`/`REDIRECT_URI`, `KAKAO_*`, `NAVER_*` | User 전용, 모든 키 `optional: true` |

**핵심 제약**: `postgres-secret`, `gateway-secret`은 여러 서비스가 공유한다. 또한 `JWT_SECRET`은 Gateway/User/Workspace/Admin/MCP가 **동일한 값**이어야 토큰 검증이 맞는다(`gateway-secret`, `workspace-secret`, `admin-service-secret`, `mcp-service-secret`에 각각 존재하지만 값은 같아야 함). Helm 설계는 이 "공유 Secret" 특성을 반드시 보존해야 한다.

---

## 1. Chart 구조 제안

BrainX는 서비스가 6개(앱) + 2개(모니터링)이고, 서비스 간 구조가 거의 동일(Deployment + Service + 선택적 ConfigMap)하다. 이 규모에서는 **단일 umbrella chart + 공통 helper 템플릿 + 서비스별 values 블록** 방식이 가장 관리 비용이 낮다. 초기 전환 단계에서 서비스마다 subchart를 만드는 것은 과설계다.

### 1.1 제안 디렉터리 구조 (파일은 아직 생성하지 않음)

```text
k8s/
├─ apps/                      # (유지) 기존 raw manifest — 삭제 금지
├─ monitoring/                # (유지) 기존 raw manifest — 삭제 금지
├─ secrets/                   # (유지) example만 추적
└─ helm/
   ├─ HELM_DESIGN.md          # ← 본 문서
   └─ brainx/                 # ← 향후 생성할 Chart 루트 (지금은 만들지 않음)
      ├─ Chart.yaml
      ├─ values.yaml          # 공통 기본값 + 서비스별 블록
      ├─ values-local.yaml    # Docker Desktop 로컬 오버라이드
      ├─ values-prod.yaml     # 운영 클러스터 오버라이드
      ├─ .helmignore
      ├─ templates/
      │  ├─ _helpers.tpl              # 공통 라벨/이름/셀렉터 helper
      │  ├─ NOTES.txt                 # 설치 후 port-forward 안내
      │  ├─ namespace.yaml            # (선택) namespace 생성 토글
      │  ├─ app-deployment.yaml       # range 로 서비스 전체 Deployment 생성
      │  ├─ app-service.yaml          # range 로 서비스 전체 Service 생성
      │  ├─ app-configmap.yaml        # config 블록이 있는 서비스만 ConfigMap 생성
      │  └─ monitoring/
      │     ├─ prometheus-deployment.yaml
      │     ├─ prometheus-service.yaml
      │     ├─ prometheus-configmap.yaml
      │     ├─ grafana-deployment.yaml
      │     ├─ grafana-service.yaml
      │     └─ grafana-configmap.yaml
      └─ templates/tests/              # (선택) helm test 훅
         └─ health-check.yaml
```

설계 판단:

- **Chart 하나(`brainx`)** 로 앱 + 모니터링을 모두 포함한다. 모니터링을 켜고 끄는 것은 `values`의 `monitoring.enabled` 토글로 제어한다.
- 앱 서비스는 구조가 동일하므로 `range $name, $svc := .Values.services` 순회로 Deployment/Service/ConfigMap을 한 벌의 템플릿에서 생성한다. 서비스별로 파일을 6개씩 복제하지 않는다.
- 모니터링은 구조가 앱과 달라(volume/subPath 마운트, 외부 이미지) 순회에 억지로 넣지 않고 **별도 템플릿 파일**로 유지한다.
- **Secret 템플릿은 chart에 넣지 않는다** (4장 참조). Chart는 Secret을 "이름으로 참조"만 한다.

### 1.2 왜 subchart(서비스별 chart)가 아닌가

- 서비스 간 배포 순서·의존성은 있지만, 릴리스 단위는 "BrainX 전체"이지 개별 서비스가 아니다.
- 공유 Secret(`postgres-secret`, `gateway-secret`)과 공유 `JWT_SECRET` 제약 때문에 서비스를 독립 chart로 쪼개면 값 동기화가 오히려 어려워진다.
- 나중에 서비스별 릴리스 주기가 갈라지면 그때 subchart로 분리해도 늦지 않다. 초기엔 umbrella 단일 chart가 정답.

---

## 2. `values.yaml` 설계

`values.yaml`은 "환경 무관 기본값 + 서비스 카탈로그"를 담는다. 환경별로 달라지는 값(이미지 태그, 다운스트림 호스트, replica 등)은 3장의 오버라이드 파일에서 덮는다.

### 2.1 최상위 구조 (스키마 제안)

```yaml
# ── 전역 공통 ──────────────────────────────
global:
  namespace: brainx
  createNamespace: false          # 기존 namespace.yaml 과 충돌 방지용 토글
  imageRegistry: ""               # 로컬은 빈 값, 운영은 레지스트리 prefix
  imagePullPolicy: IfNotPresent
  # 다운스트림 호스트 앵커. 로컬=host.docker.internal, 운영=클러스터 DNS
  downstreamHost: host.docker.internal
  commonLabels:
    part-of: brainx

# ── 공유 Secret "참조 이름" (값 아님) ──────────
# Chart 는 이 이름의 Secret 을 만들지 않고 참조만 한다.
secretRefs:
  postgres: postgres-secret
  gateway: gateway-secret
  workspace: workspace-secret
  admin: admin-service-secret
  mcp: mcp-service-secret
  grafana: grafana-secret

# ── 앱 서비스 카탈로그 ─────────────────────────
services:
  discovery:
    enabled: true
    image: brainx-discovery-service
    tag: local
    port: 8761
    replicas: 1
    config: {}                    # ConfigMap 불필요
    env:                          # 비민감 inline env
      SERVER_PORT: "8761"
      EUREKA_SERVER_ENABLE_SELF_PRESERVATION: "false"
    secretEnv: []                 # secretKeyRef 없음
    probes:
      readiness: { path: /actuator/health, initialDelaySeconds: 20, periodSeconds: 10, timeoutSeconds: 5, failureThreshold: 6 }
      liveness:  { path: /actuator/health, initialDelaySeconds: 40, periodSeconds: 20, timeoutSeconds: 5, failureThreshold: 3 }

  gateway:
    enabled: true
    image: brainx-gateway-service
    tag: local
    port: 8088
    replicas: 1
    env:
      SERVER_PORT: "8088"
      EUREKA_CLIENT_ENABLED: "false"
      EUREKA_CLIENT_SERVICE_URL_DEFAULTZONE: http://discovery-service:8761/eureka/
      EUREKA_INSTANCE_HOSTNAME: gateway-service
      # SPRING_APPLICATION_JSON 은 downstreamHost 로 렌더링 (2.3 참조)
    secretEnv:
      - { name: SERVICE_TOKEN, secret: gateway, key: SERVICE_TOKEN }
      - { name: JWT_SECRET,    secret: gateway, key: JWT_SECRET }
    probes:
      readiness: { path: /actuator/health, initialDelaySeconds: 30, periodSeconds: 10, timeoutSeconds: 5, failureThreshold: 6 }
      liveness:  { path: /actuator/health, initialDelaySeconds: 60, periodSeconds: 20, timeoutSeconds: 5, failureThreshold: 3 }

  user:
    enabled: true
    image: brainx-user-service
    tag: local
    port: 8080
    replicas: 1
    env:
      SERVER_PORT: "8080"
      POSTGRES_PORT: "5432"
      USER_DB_NAME: brainx_user
      REDIS_PORT: "6379"
      REDIS_TIMEOUT: "2s"
      MANAGEMENT_HEALTH_MAIL_ENABLED: "false"
      EUREKA_INSTANCE_HOSTNAME: user-service
      # POSTGRES_HOST / REDIS_HOST / WORKSPACE_SERVICE_BASE_URL 는 downstreamHost 로 렌더
    secretEnv:
      - { name: POSTGRES_USER,     secret: postgres, key: POSTGRES_USER }
      - { name: POSTGRES_PASSWORD, secret: postgres, key: POSTGRES_PASSWORD }
      - { name: SERVICE_TOKEN,     secret: gateway,  key: SERVICE_TOKEN }
      - { name: JWT_SECRET,        secret: gateway,  key: JWT_SECRET }
      # GOOGLE_/KAKAO_/NAVER_* client id/secret/redirect uri는 user-service-oauth-secret에서
      # optional로 주입 (Secret 없으면 env 자체가 생략되고 애플리케이션 기본값으로 fallback)
    probes:
      startup:   { path: /actuator/health/liveness, periodSeconds: 10, timeoutSeconds: 5, failureThreshold: 18 }
      readiness: { path: /actuator/health/readiness, initialDelaySeconds: 40, periodSeconds: 10, timeoutSeconds: 5, failureThreshold: 6 }
      liveness:  { path: /actuator/health/liveness, initialDelaySeconds: 70, periodSeconds: 20, timeoutSeconds: 5, failureThreshold: 3 }

  admin:
    enabled: true
    image: brainx-admin-service
    tag: local
    port: 8085
    replicas: 1
    config:                        # → admin-service-config ConfigMap 으로 렌더
      SERVER_PORT: "8085"
      POSTGRES_PORT: "5432"
      ADMIN_DB_NAME: brainx_admin
      BRAINX_KAFKA_MONITORING_CONSUMER_GROUP_ID: intelligence-service
      BRAINX_ADMIN_MONITORING_TIMEZONE: Asia/Seoul
      BRAINX_ADMIN_MONITORING_DAILY_SNAPSHOT_CRON: "0 59 23 * * *"
      EUREKA_INSTANCE_HOSTNAME: admin-service
      # host 기반 URL(POSTGRES_HOST, KAFKA, *_SERVICE_URL)은 downstreamHost 로 렌더
    secretEnv:
      - { name: POSTGRES_USER,       secret: postgres, key: POSTGRES_USER }
      - { name: POSTGRES_PASSWORD,   secret: postgres, key: POSTGRES_PASSWORD }
      - { name: SERVICE_TOKEN,       secret: gateway,  key: SERVICE_TOKEN }
      - { name: JWT_SECRET,          secret: admin,    key: JWT_SECRET }
      - { name: MAIL_USERNAME,       secret: admin,    key: MAIL_USERNAME }
      - { name: MAIL_PASSWORD,       secret: admin,    key: MAIL_PASSWORD }
      - { name: SEED_ADMIN_LOGIN_ID, secret: admin,    key: SEED_ADMIN_LOGIN_ID }
      - { name: SEED_ADMIN_PASSWORD, secret: admin,    key: SEED_ADMIN_PASSWORD }
      - { name: SEED_ADMIN_NAME,     secret: admin,    key: SEED_ADMIN_NAME }
    probes:
      readiness: { path: /actuator/health/readiness, initialDelaySeconds: 40, periodSeconds: 10, timeoutSeconds: 5, failureThreshold: 6 }
      liveness:  { path: /actuator/health/liveness, initialDelaySeconds: 70, periodSeconds: 20, timeoutSeconds: 5, failureThreshold: 3 }

  workspace:
    enabled: true
    image: brainx-workspace-service
    tag: local
    port: 8082
    replicas: 1
    config:                        # → workspace-service-config ConfigMap
      SERVER_PORT: "8082"
      POSTGRES_PORT: "5432"
      WORKSPACE_DB_NAME: brainx_workspace
      REDIS_PORT: "6379"
      REDIS_TIMEOUT: "2s"
      NEO4J_ENABLED: "true"
      NEO4J_USERNAME: neo4j
      NEO4J_BACKFILL_ON_STARTUP: "true"
      EUREKA_INSTANCE_HOSTNAME: workspace-service
      SEED_DEMO_DATA: "true"
      WORKSPACE_DEV_FALLBACK_ENABLED: "false"
      WORKSPACE_DRAFT_TTL_SECONDS: "86400"
      WORKSPACE_DRAFT_FLUSH_INTERVAL_SECONDS: "30"
      WORKSPACE_DRAFT_FLUSH_IDLE_SECONDS: "10"
      # POSTGRES_HOST / REDIS_HOST / NEO4J_URI / KAFKA bootstrap 은 downstreamHost 로 렌더
    secretEnv:
      - { name: POSTGRES_USER,     secret: postgres,  key: POSTGRES_USER }
      - { name: POSTGRES_PASSWORD, secret: postgres,  key: POSTGRES_PASSWORD }
      - { name: SERVICE_TOKEN,     secret: gateway,   key: SERVICE_TOKEN }
      - { name: JWT_SECRET,        secret: workspace, key: JWT_SECRET }
      - { name: NEO4J_PASSWORD,    secret: workspace, key: NEO4J_PASSWORD }
    probes:
      readiness: { path: /actuator/health/readiness, initialDelaySeconds: 45, periodSeconds: 10, timeoutSeconds: 5, failureThreshold: 6 }
      liveness:  { path: /actuator/health/liveness, initialDelaySeconds: 80, periodSeconds: 20, timeoutSeconds: 5, failureThreshold: 3 }

  mcp:
    enabled: true
    image: brainx-mcp-service
    tag: local
    port: 8087
    replicas: 1
    config:                        # → mcp-service-config ConfigMap
      SERVER_PORT: "8087"
      POSTGRES_PORT: "5432"
      MCP_DB_NAME: brainx_mcp
      EUREKA_INSTANCE_HOSTNAME: mcp-service
      WORKSPACE_SERVICE_TIMEOUT: 5s
      INTELLIGENCE_SERVICE_TIMEOUT: 10s
      BRAINX_MCP_API_KEY_PREFIX: bxk_live_
      # PUBLIC_BASE_URL / BRAINX_OAUTH_ISSUER / BRAINX_MCP_RESOURCE /
      # BRAINX_MCP_PROTECTED_RESOURCE_METADATA_URL / *_SERVICE_URL 은
      # 환경별로 다르므로 오버라이드 파일에서 지정 (2.4 참조)
    secretEnv:
      - { name: POSTGRES_USER,     secret: postgres, key: POSTGRES_USER }
      - { name: POSTGRES_PASSWORD, secret: postgres, key: POSTGRES_PASSWORD }
      - { name: SERVICE_TOKEN,     secret: gateway,  key: SERVICE_TOKEN }
      - { name: JWT_SECRET,        secret: mcp,      key: JWT_SECRET }
    probes:
      startup:   { path: /actuator/health, periodSeconds: 10, timeoutSeconds: 5, failureThreshold: 30 }
      readiness: { path: /actuator/health, initialDelaySeconds: 10, periodSeconds: 10, timeoutSeconds: 5, failureThreshold: 6 }
      liveness:  { path: /actuator/health, initialDelaySeconds: 40, periodSeconds: 20, timeoutSeconds: 5, failureThreshold: 3 }

# ── 모니터링 ───────────────────────────────
monitoring:
  enabled: true
  prometheus:
    image: prom/prometheus
    tag: v3.13.0
    port: 9090
    persistence: { enabled: false }   # 로컬=emptyDir, 운영=PVC 토글
  grafana:
    image: grafana/grafana
    tag: 12.4.0
    port: 3000
    persistence: { enabled: false }
    secretRef: grafana
```

### 2.2 설계 원칙

1. **서비스 카탈로그화**: 6개 앱을 `services.<name>` 맵으로 표현해 템플릿이 순회하도록 한다. 새 서비스 추가 = values에 블록 추가.
2. **비민감/민감 분리**: `env`/`config`는 평문(ConfigMap 또는 inline), `secretEnv`는 `secretKeyRef` 매핑만 담고 값은 담지 않는다.
3. **ConfigMap 채택 통일**: 현재 inline env인 Discovery/Gateway/User도 Helm에서는 동일하게 `env`(inline) 또는 `config`(ConfigMap) 중 하나로 표현 가능하게 스키마를 열어둔다. `config`가 비어있으면 ConfigMap을 렌더하지 않는다 → 기존 동작(inline) 보존.
4. **probe를 값으로**: probe는 서비스마다 다르므로 values에 그대로 노출한다. `startup`은 있는 서비스만 렌더한다.

### 2.3 `host.docker.internal` 처리 (환경 종속성 격리)

현재 매니페스트의 최대 이식성 문제는 `host.docker.internal`이 모든 다운스트림 주소에 하드코딩된 점이다. Helm에서는 이를 `global.downstreamHost` 앵커로 뽑아 템플릿에서 조합한다.

예) User-Service의 `WORKSPACE_SERVICE_BASE_URL`:

```yaml
# 템플릿 내부(개념)
value: "http://{{ .Values.global.downstreamHost }}:8082"
```

- 로컬(`values-local.yaml`): `downstreamHost: host.docker.internal`
- 운영(`values-prod.yaml`): `downstreamHost`를 클러스터 내부 DNS 기준으로 바꾸거나, 서비스별 완전 URL을 오버라이드.

Gateway의 `SPRING_APPLICATION_JSON`도 같은 앵커로 렌더해, 정적 discovery 인스턴스 URL이 환경에 따라 바뀌게 한다. (JSON 닫는 중괄호 누락 이슈는 template helper에서 `toJson`으로 생성해 원천 차단.)

### 2.4 환경별로 반드시 갈라지는 MCP OAuth 값

`PUBLIC_BASE_URL`, `BRAINX_OAUTH_ISSUER`, `BRAINX_MCP_RESOURCE`, `BRAINX_MCP_PROTECTED_RESOURCE_METADATA_URL`는 로컬에서 `http://localhost:3000` 기반이지만 실 공개 origin과 반드시 일치해야 한다. 또한 User-Service의 동일 값과도 맞아야 토큰 `iss/resource` 검증이 통과한다. 따라서 이 4개 값은 `values.yaml` 기본값에 로컬 값을 두되, **오버라이드 파일에서 환경별로 강제 교체**하는 것을 명시한다.

---

## 3. `values-local.yaml` / `values-prod.yaml` 분리 전략

`helm install/upgrade`는 `-f values.yaml -f values-<env>.yaml` 순서로 병합한다(뒤 파일이 우선). 즉 **공통값은 `values.yaml`**, **차이값만 오버라이드 파일**에 둔다.

### 3.1 분리 기준

| 항목 | `values.yaml` (공통) | `values-local.yaml` | `values-prod.yaml` |
|---|---|---|---|
| 서비스 목록/포트/probe | ○ (기준값) | 변경 없음 | 변경 없음 |
| `global.downstreamHost` | `host.docker.internal` | `host.docker.internal` (명시) | 클러스터 DNS / 실제 호스트 |
| `imageRegistry` | `""` | `""` (로컬 빌드) | 레지스트리 prefix |
| 이미지 `tag` | `local` | `local` | Git SHA / 릴리스 태그 |
| `imagePullPolicy` | `IfNotPresent` | `IfNotPresent` | `IfNotPresent`/`Always` |
| `replicas` | 1 | 1 | 서비스별 상향 |
| MCP OAuth origin 4종 | 로컬 기본 | `http://localhost:3000` 계열 | 실제 공개 origin |
| `monitoring.*.persistence` | `enabled: false` | `false` (emptyDir) | `true` (PVC) |
| `createNamespace` | `false` | `false` (기존 namespace.yaml 재사용) | 정책에 따라 |

### 3.2 `values-local.yaml` (Docker Desktop 로컬 검증)

- 기존 raw manifest와 **동일한 결과**를 내는 것이 목표. 즉 Helm 전환 후에도 로컬 검증 절차(port-forward 등)가 그대로 동작해야 한다.
- `downstreamHost: host.docker.internal` 유지, 이미지 태그 `local`, replica 1, emptyDir 스토리지.
- 이 파일이 "현재 YAML과 1:1로 맞는지"가 마이그레이션 검증의 기준선(baseline)이다(7장).

### 3.3 `values-prod.yaml` (운영/EC2 — 미래)

- 현재 README 기준으로 운영/EC2 구성은 범위 밖이지만, 스키마는 미리 열어둔다.
- `host.docker.internal` 제거가 핵심 전제. Compose 의존 서비스가 전부 Kubernetes로 올라오거나, 외부 관리형 DB/Redis/Neo4j/Kafka 엔드포인트로 교체돼야 한다.
- Secret은 절대 이 파일에 넣지 않는다(4장). `values-prod.yaml`은 "참조 이름"과 비민감 설정만 담는다.
- 이 파일은 **뼈대만 설계**하고 실제 운영 전환 시점에 채운다.

### 3.4 원칙

- 오버라이드 파일은 "덮어쓸 값만" 담아 최소화한다. 전체 복붙 금지(드리프트 원인).
- 민감값은 어느 values 파일에도 넣지 않는다.

---

## 4. Secret 외부 참조(external reference) 전략

**대원칙: Helm Chart는 Secret 리소스를 생성/관리하지 않는다. 이름으로 참조만 한다.**

현재 구조가 이미 "example만 Git 추적 + 실제 Secret은 `kubectl apply`로 별도 주입 + `.gitignore` 제외"이므로, 이 방침을 Helm에서도 그대로 이어간다.

### 4.1 왜 외부 참조인가

- 공유 Secret(`postgres-secret`, `gateway-secret`)과 공유 `JWT_SECRET`을 chart가 소유하면, chart 릴리스마다 Secret이 재생성/충돌할 위험이 있다.
- Secret 값이 values 파일이나 `helm template` 출력에 노출되는 것을 원천 차단한다.
- `helm template`/`helm lint`/dry-run이 실제 비밀값 없이도 항상 안전하게 동작한다.

### 4.2 참조 방식

- values의 `secretRefs`(2.1)에 Secret **이름만** 둔다.
- Deployment 템플릿은 `secretEnv[].secret`을 `secretRefs`로 lookup해 `secretKeyRef.name`을 채운다.
- 실제 Secret은 지금처럼 `k8s/secrets/<name>.yaml`을 `kubectl apply`로 먼저 주입한다. Chart는 그 Secret이 이미 존재한다고 가정한다.

### 4.3 향후 옵션 (설계만, 지금 도입 안 함)

- **SealedSecrets / SOPS**: 암호화된 Secret을 Git에 안전하게 커밋하고 클러스터에서 복호화. GitOps 전환 시 후보.
- **External Secrets Operator(ESO)**: AWS Secrets Manager/Vault 등 외부 저장소에서 Secret을 동기화. EC2/운영 전환 시 후보.
- 위 옵션 채택 시에도 "chart 본체는 참조만" 원칙은 유지한다. 생성 주체만 Operator로 바뀐다.

### 4.4 금지 사항 (본 작업 범위)

- values 파일에 실제 Secret 값 작성 금지.
- chart `templates/`에 `kind: Secret` + 실제 데이터 삽입 금지.
- `stringData`에 평문 커밋 금지(기존 원칙 승계).

---

## 5. 템플릿 분리 전략 (Deployment / Service / ConfigMap / Secret / Monitoring)

### 5.1 공통 helper (`_helpers.tpl`)

- `brainx.fullname`, `brainx.labels`, `brainx.selectorLabels`, `brainx.namespace` 등 공통 이름/라벨을 helper로 정의.
- 라벨은 기존 매니페스트의 `app: <svc>` 셀렉터를 **그대로 보존**한다(셀렉터 변경은 Deployment 재생성/다운타임을 유발하므로 초기 전환에서 바꾸지 않는다).
- `brainx.downstreamUrl`: `global.downstreamHost` + 포트로 URL을 만드는 helper.

### 5.2 앱 Deployment (`app-deployment.yaml`)

- `range $name, $svc := .Values.services` 순회, `$svc.enabled`인 것만 렌더.
- 컨테이너 공통: image=`{{ registry }}/{{ image }}:{{ tag }}`, `imagePullPolicy`, port(name `http`).
- env 조립 순서:
  1. `$svc.config`가 있으면 `envFrom.configMapRef`(→ `app-configmap.yaml`이 만든 ConfigMap).
  2. `$svc.env`(inline 평문)를 `env` 리스트로.
  3. `downstreamHost` 기반 URL env를 helper로 추가.
  4. `$svc.secretEnv`를 `secretKeyRef`로.
- probe: `readiness`/`liveness`는 항상, `startup`은 존재할 때만 렌더.
- Gateway의 `SPRING_APPLICATION_JSON`은 helper에서 `toJson`으로 생성(중괄호 오류 방지).

### 5.3 앱 Service (`app-service.yaml`)

- 동일하게 순회. `type: ClusterIP`, `port: $svc.port`, `targetPort: http`. 기존과 동일.

### 5.4 앱 ConfigMap (`app-configmap.yaml`)

- `$svc.config`가 비어있지 않은 서비스만 `<name>-service-config` ConfigMap 생성.
- Discovery/Gateway/User는 `config`가 비어 inline env 유지 → 기존 동작 보존.
- Admin/Workspace/MCP는 `config`로 ConfigMap 생성 → 기존 동작 재현.
- MCP처럼 ConfigMap이 별도 파일이던 것도 여기서 통합 생성(파일 위치만 바뀌고 결과 ConfigMap은 동일).

### 5.5 Secret

- **템플릿 없음**(4장). Chart는 Secret을 만들지 않는다.
- `templates/`에 Secret 파일을 두지 않고, 참조만 Deployment에서 수행.

### 5.6 Monitoring (`templates/monitoring/`)

- `monitoring.enabled`로 전체 on/off.
- Prometheus: Deployment + Service + ConfigMap. ConfigMap의 scrape target은 `<svc>.{{ namespace }}.svc.cluster.local:<port>`를 순회 생성 가능(또는 초기엔 기존 정적 목록 그대로 임베드). `persistence.enabled`로 emptyDir↔PVC 전환.
- Grafana: Deployment + Service + ConfigMap. `grafana-secret` 참조(외부). provisioning subPath 마운트는 기존과 동일 유지. `persistence.enabled` 토글.
- 모니터링은 앱과 구조가 달라 순회에 넣지 않고 개별 파일로 명시적으로 관리한다.

### 5.7 Namespace

- 기존 `namespace.yaml`이 있으므로 chart 기본은 `createNamespace: false`(중복 생성 방지).
- 필요 시 토글로 chart가 namespace를 만들 수 있게 열어두되, 기존 raw manifest와 병행 검증 중에는 off.

---

## 6. Raw YAML → Helm 마이그레이션 단계별 순서

각 단계는 **기존 `k8s/apps`, `k8s/monitoring` 매니페스트를 지우지 않고 병행**하며, Helm 산출물이 기존과 동등함을 확인한 뒤에만 다음 단계로 간다. 이 문서 단계에서는 **파일을 만들지 않고 순서만 확정**한다.

**Phase 0 — 설계 확정 (현재 문서)**
1. 본 `HELM_DESIGN.md`로 구조·values·분리·Secret·검증 전략 합의.

**Phase 1 — Chart 스캐폴딩**
2. `k8s/helm/brainx/`에 `Chart.yaml`, 빈 `values.yaml`, `_helpers.tpl`, `.helmignore` 생성.
3. `helm lint`로 스캐폴드 통과 확인.

**Phase 2 — 앱 한 개로 파일럿 (Discovery)**
4. 가장 단순한 Discovery(Secret/ConfigMap 없음, inline env만)를 `services.discovery`로 옮기고 Deployment/Service 템플릿 작성.
5. `helm template`으로 렌더 결과를 기존 `discovery-service.yaml`과 **diff**해 동등성 확인.

**Phase 3 — Secret 참조 서비스 확장 (Gateway → User)**
6. `secretEnv` 매핑과 `secretRefs` lookup을 검증(Gateway=`gateway-secret`, User=`postgres`+`gateway`).
7. `startupProbe` 렌더 분기(User)를 검증.
8. 각 서비스 렌더 결과를 기존 파일과 diff.

**Phase 4 — ConfigMap 서비스 확장 (Admin → Workspace → MCP)**
9. `config` 블록 → ConfigMap 렌더 및 `envFrom` 연결 검증.
10. MCP OAuth 4종 값이 오버라이드로 주입되는지 확인.
11. `SPRING_APPLICATION_JSON`(Gateway)·`host.docker.internal` 조합이 `values-local`에서 기존과 문자 단위로 일치하는지 확인.

**Phase 5 — 모니터링 편입**
12. Prometheus/Grafana 템플릿과 ConfigMap을 `monitoring.*`로 옮기고, `grafana-secret` 참조 확인.
13. `persistence.enabled=false`(emptyDir) 렌더가 기존과 동등한지 확인.

**Phase 6 — 환경 오버라이드 정리**
14. `values-local.yaml`을 기존 raw manifest와 1:1 동등 baseline으로 확정.
15. `values-prod.yaml`은 뼈대(스키마)만 두고 실제 값은 운영 전환 시로 미룸.

**Phase 7 — 병행 검증 → 컷오버(미래)**
16. 로컬에서 Secret을 먼저 `kubectl apply` → `helm install brainx ./k8s/helm/brainx -f values-local.yaml --dry-run`으로 최종 확인.
17. 실제 설치는 별도 승인 후. 기존 raw manifest는 Helm 안정화가 확인될 때까지 **삭제하지 않고** 보관.

> 주의: 서비스 기동/의존 순서(Discovery→Gateway→User→Admin→MCP→Workspace)는 README의 후속 전환 순서를 따른다. Helm은 한 릴리스에 모두 배포하지만, 검증은 여전히 서비스 단위로 순차 진행한다. 공유 Secret(`postgres-secret`, `gateway-secret`)은 어떤 서비스보다 먼저 존재해야 한다.

---

## 7. 검증 방법 (helm lint / template / dry-run)

Helm Chart를 실제로 만든 뒤 사용할 검증 절차. **이 문서 단계에서는 실행하지 않고, 명령과 판정 기준만 정의**한다. (경로 예시는 `k8s/helm/brainx`.)

### 7.1 `helm lint` — 정적 검사

```powershell
helm lint .\k8s\helm\brainx -f .\k8s\helm\brainx\values-local.yaml
helm lint .\k8s\helm\brainx -f .\k8s\helm\brainx\values-prod.yaml
```

판정: `0 chart(s) failed`. values 스키마 오류, 필수 필드 누락, 템플릿 파싱 오류를 여기서 잡는다.

### 7.2 `helm template` — 렌더 결과 확인 및 기존 YAML과 diff

```powershell
# 로컬 오버라이드로 전체 렌더
helm template brainx .\k8s\helm\brainx -f .\k8s\helm\brainx\values-local.yaml > .\k8s\helm\_rendered-local.yaml

# 특정 서비스만 렌더해서 기존 파일과 비교 (예: discovery)
helm template brainx .\k8s\helm\brainx -f .\k8s\helm\brainx\values-local.yaml `
  --show-only templates/app-deployment.yaml
```

**동등성 판정(마이그레이션 핵심)**: `values-local` 렌더 결과가 기존 `k8s/apps/*.yaml`, `k8s/monitoring/*.yaml`과 의미상 일치해야 한다.

```powershell
# 개념적 diff (렌더본을 서비스별로 잘라 기존 파일과 비교)
# 공백/키 순서 차이는 무시하고, env/probe/port/secretKeyRef 가 동일한지 확인
```

확인 포인트:
- `env`/`envFrom` 목록과 값(특히 `host.docker.internal` 조합, `SPRING_APPLICATION_JSON` JSON 유효성).
- `secretKeyRef.name/key`가 기존과 정확히 동일(`postgres-secret`, `gateway-secret`, `*-secret`).
- probe path/delay/threshold, `startupProbe` 유무.
- Service `port`/`targetPort`, namespace, 라벨/셀렉터.
- **Secret 리소스가 렌더되지 않는지**(4장 원칙 준수 확인).

### 7.3 dry-run — 클러스터 스키마 검증

Secret은 반드시 **먼저** apply돼 있어야 참조가 성립한다.

```powershell
# (사전) 실제 Secret 주입 — 기존 절차 그대로
kubectl apply -f .\k8s\secrets\postgres-secret.yaml
kubectl apply -f .\k8s\secrets\gateway-secret.yaml
# ... 필요한 서비스별 Secret

# 서버 측 dry-run (클러스터 API 스키마까지 검증, 실제 생성 안 함)
helm install brainx .\k8s\helm\brainx -f .\k8s\helm\brainx\values-local.yaml `
  --namespace brainx --dry-run=server

# 이미 설치된 릴리스 업그레이드를 미리 볼 때
helm upgrade brainx .\k8s\helm\brainx -f .\k8s\helm\brainx\values-local.yaml `
  --namespace brainx --dry-run=server
```

- `--dry-run=server`: 클러스터 API가 매니페스트를 검증(스키마/필드 유효성). 실제 리소스는 만들지 않는다.
- `--dry-run=client`: 클러스터 접속 없이 로컬 렌더만. `helm template`과 유사.

### 7.4 추가 검증 (선택)

```powershell
# 렌더본을 kubectl 로 클라이언트 검증
helm template brainx .\k8s\helm\brainx -f .\k8s\helm\brainx\values-local.yaml `
  | kubectl apply --dry-run=client -f -

# kubeconform 등으로 스키마 검증 (도구 설치 시)
# helm template ... | kubeconform -strict -summary
```

### 7.5 검증 게이트 요약

| 단계 | 명령 | 통과 기준 |
|---|---|---|
| 정적 | `helm lint` | 실패 chart 0 |
| 렌더 동등성 | `helm template` + diff | 기존 raw manifest와 의미 일치, Secret 미렌더 |
| 서버 스키마 | `helm ... --dry-run=server` | 에러 없음, Secret 사전 apply 전제 |
| 실제 설치 | (승인 후) `helm install/upgrade` | 본 작업 범위 밖 |

---

## 8. 리스크 및 주의

- **셀렉터 라벨 변경 금지(초기)**: 기존 `app: <svc>` 셀렉터를 helper 공통 라벨로 바꾸면 Deployment 재생성이 필요할 수 있다. 전환 초기엔 기존 셀렉터를 그대로 보존한다.
- **공유 Secret 순서**: `postgres-secret`, `gateway-secret`은 어떤 앱 서비스보다 먼저 존재해야 한다. Helm은 Secret을 만들지 않으므로 이 선행 apply를 반드시 지킨다.
- **`JWT_SECRET` 동일성**: User/Workspace/Admin/MCP의 `JWT_SECRET`은 값이 같아야 한다. Helm은 이 값을 다루지 않으므로, 외부 Secret 주입 시 동일성은 운영 절차로 보장한다.
- **`host.docker.internal` 이식성**: `values-local` 전용 가정이다. 운영 전환은 Compose 의존 인프라 정리와 함께 별도로 진행한다.
- **MCP OAuth origin 일치**: 비로컬 apply 전 User-Service와 MCP-Service 양쪽 origin/issuer/resource를 동일 실제 값으로 함께 교체한다.
- **문서 동기화**: Chart 실제 생성 시 `k8s/README.md`, `k8s/SETUP.md`, 루트 `README.md`에 Helm 사용법을 반영한다(프로젝트 규칙).

---

## 부록 A. 현재 리소스 ↔ Helm 매핑 요약

| 현재 파일 | Helm 위치(향후) | 비고 |
|---|---|---|
| `apps/discovery-service.yaml` | `services.discovery` + `app-deployment/app-service` | inline env, Secret 없음 |
| `apps/gateway-service.yaml` | `services.gateway` | `SPRING_APPLICATION_JSON` helper 렌더 |
| `apps/user-service.yaml` | `services.user` | `startupProbe` 분기 |
| `apps/admin-service.yaml` | `services.admin` + `app-configmap` | ConfigMap + 다수 Secret |
| `apps/workspace-service.yaml` | `services.workspace` + `app-configmap` | ConfigMap + workspace-secret |
| `apps/mcp-service.yaml` + `mcp-service-configmap.yaml` | `services.mcp` + `app-configmap` | 분리 ConfigMap 통합 |
| `monitoring/prometheus*.yaml` | `templates/monitoring/prometheus-*` | `monitoring.prometheus` |
| `monitoring/grafana*.yaml` | `templates/monitoring/grafana-*` | `grafana-secret` 참조 |
| `secrets/*.example.yaml` | (chart 밖) 외부 참조 | `secretRefs` 이름만 |
| `namespace.yaml` | `createNamespace` 토글 | 기본 off |
