# BrainX Kubernetes(Local) 운영 Runbook

이 문서는 Docker Desktop Kubernetes + `host.docker.internal` 기반 **로컬 검증 환경**을
실제로 운영(배포/재배포/장애 대응)할 때 그대로 따라 하는 절차서다.

- 대상 범위: `Discovery-Service`, `Gateway-Service`, `User-Service`, `Workspace-Service`, `Admin-Service`, `Mcp-Service`, `Monitoring`(Prometheus/Grafana)
- 비대상 범위: 최초 1회성 설치([SETUP.md](SETUP.md)), 구성 배경/전환 메모([README.md](README.md)), 장애 사례의 원인 분석 서술([TROUBLESHOOTING.md](TROUBLESHOOTING.md)), 운영 전환 체크리스트([PRODUCTION_CHECKLIST.md](PRODUCTION_CHECKLIST.md))
- 사용법: 이 문서는 "무엇을 확인하고, 어떤 명령을 실행하는가"만 다룬다. 원인 배경이 궁금하면 각 절차 끝의 참고 링크를 따라간다.
- 전제: `namespace/brainx`, Docker Desktop Kubernetes, Compose 인프라(Postgres/Redis/Neo4j/Kafka)가 이미 떠 있다는 것을 전제로 한다.

---

## 0. 현재 서비스 상태 요약

| 서비스 | 상태 | Deployment | Service/Port | k8s.ps1 지원 |
| --- | --- | --- | --- | --- |
| Discovery-Service | 적용 완료 | `discovery-service` | `discovery-service:8761` | `discovery` |
| Gateway-Service | 적용 완료 | `gateway-service` | `gateway-service:8088` | `gateway` |
| User-Service | 적용 완료 | `user-service` | `user-service:8080` | `user` |
| Admin-Service | 적용 완료 | `admin-service` | `admin-service:8085` | `admin` |
| Mcp-Service | 적용 완료 | `mcp-service` | `mcp-service:8087` | `mcp` |
| Workspace-Service | 적용 완료 | `workspace-service` | `workspace-service:8082` | `workspace` |
| Monitoring(Prometheus) | 로컬 검증용 | `prometheus` | `prometheus:9090` | 미지원(수동 apply) |
| Monitoring(Grafana) | 로컬 검증용 | `grafana` | `grafana:3000` | 미지원(수동 apply) |

`.\k8s.ps1 <service>`는 namespace 확인 → Secret 존재 확인 → 이미지 빌드 → (있으면) ConfigMap apply → Deployment apply → `rollout restart` → `rollout status` → Pod 확인까지 자동 수행한다. Monitoring은 `k8s.ps1`에 없으므로 이 문서의 명령을 수동으로 순서대로 실행한다.

---

## 1. 서비스 최초 배포

### 1-1. 전체 권장 순서

```powershell
# 0) 인프라 선행
.\run.ps1                                    # Compose: postgres/redis/neo4j/kafka 등
kubectl apply -f .\k8s\namespace.yaml

# 1) Secret (2장 참고, 서비스별로 필요한 것만 먼저 만들어도 됨)

# 2) 서비스 순서대로 배포
.\k8s.ps1 discovery
.\k8s.ps1 gateway
.\k8s.ps1 user
.\k8s.ps1 admin
.\k8s.ps1 mcp
.\k8s.ps1 workspace

# 3) Monitoring (4장 참고)
```

이 순서는 [README.md](README.md)의 "후속 전환 순서"(Discovery → Gateway → User → Admin → MCP → Workspace)와 동일하다. Admin은 Postgres/Kafka/Gateway/다른 앱 서비스, Workspace는 Postgres/Redis/Neo4j/Kafka에 의존하므로 관련 Compose 서비스가 먼저 `Up` 상태여야 한다.

### 1-2. 서비스별 필요 Secret / ConfigMap

| 서비스 | 필요 Secret | 필요 ConfigMap | 비고 |
| --- | --- | --- | --- |
| Discovery | 없음 | 없음 | stateless |
| Gateway | `gateway-secret` | 없음(inline `SPRING_APPLICATION_JSON`) | |
| User | `gateway-secret`, `postgres-secret` | 없음(inline env) | `user-service-oauth-secret`은 optional |
| Admin | `gateway-secret`, `postgres-secret`, `admin-service-secret` | `admin-service-config`(같은 파일 내 정의) | |
| MCP | `gateway-secret`, `postgres-secret`, `mcp-service-secret` | `mcp-service-config`(`mcp-service-configmap.yaml`, 별도 파일) | ConfigMap을 먼저/같이 apply해야 함 |
| Workspace | `gateway-secret`, `postgres-secret`, `workspace-secret` | `workspace-service-config`(같은 파일 내 정의) | |
| Monitoring | `grafana-secret` | `prometheus-config`, `grafana-config` | Prometheus는 Secret 불필요 |

### 1-3. 단일 서비스 재배포(코드 변경 후)

```powershell
.\k8s.ps1 <discovery|gateway|user|admin|mcp|workspace>
```

PowerShell 실행 정책 문제로 스크립트가 막히면:

```powershell
powershell -ExecutionPolicy Bypass -File .\k8s.ps1 <service>
```

---

## 2. Secret 생성 순서

example 파일을 복사해서 실제 파일을 만들고, `CHANGE_ME`를 실제 값으로 채운 뒤 apply한다. 실제 Secret 파일은 `.gitignore`(`k8s/secrets/*.yaml`, `!k8s/secrets/*.example.yaml`)로 제외되므로 절대 커밋하지 않는다.

### 2-1. 생성 순서 (의존 관계 기준)

```powershell
kubectl apply -f .\k8s\namespace.yaml

# 1) 공용 Secret (Gateway/User/Admin/MCP/Workspace가 공유)
Copy-Item .\k8s\secrets\gateway-secret.example.yaml .\k8s\secrets\gateway-secret.yaml
Copy-Item .\k8s\secrets\postgres-secret.example.yaml .\k8s\secrets\postgres-secret.yaml
kubectl apply -f .\k8s\secrets\gateway-secret.yaml
kubectl apply -f .\k8s\secrets\postgres-secret.yaml

# 2) 서비스 전용 Secret
Copy-Item .\k8s\secrets\workspace-secret.example.yaml .\k8s\secrets\workspace-secret.yaml
Copy-Item .\k8s\secrets\mcp-service-secret.example.yaml .\k8s\secrets\mcp-service-secret.yaml
Copy-Item .\k8s\secrets\admin-service-secret.example.yaml .\k8s\secrets\admin-service-secret.yaml
kubectl apply -f .\k8s\secrets\workspace-secret.yaml
kubectl apply -f .\k8s\secrets\mcp-service-secret.yaml
kubectl apply -f .\k8s\secrets\admin-service-secret.yaml

# 3) Monitoring
Copy-Item .\k8s\secrets\grafana-secret.example.yaml .\k8s\secrets\grafana-secret.yaml
kubectl apply -f .\k8s\secrets\grafana-secret.yaml

# 4) 선택 (소셜 로그인 검증 시에만)
Copy-Item .\k8s\secrets\user-service-oauth-secret.example.yaml .\k8s\secrets\user-service-oauth-secret.yaml
kubectl apply -f .\k8s\secrets\user-service-oauth-secret.yaml
```

### 2-2. `JWT_SECRET` 공유 규칙 (가장 자주 틀리는 부분)

`gateway-secret`, `workspace-secret`, `mcp-service-secret`, `admin-service-secret`의 `JWT_SECRET`은 **전부 동일한 값**이어야 한다(Gateway/User/Workspace/Admin/MCP가 같은 서명키로 토큰을 검증). 하나라도 다르면 3번 참고 항목의 "Gateway JWT 오류"가 발생한다.

값이 일치하는지 확인:

```powershell
kubectl -n brainx get secret gateway-secret -o jsonpath="{.data.JWT_SECRET}" | %{[System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String($_))}
kubectl -n brainx get secret workspace-secret -o jsonpath="{.data.JWT_SECRET}" | %{[System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String($_))}
kubectl -n brainx get secret mcp-service-secret -o jsonpath="{.data.JWT_SECRET}" | %{[System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String($_))}
kubectl -n brainx get secret admin-service-secret -o jsonpath="{.data.JWT_SECRET}" | %{[System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String($_))}
```

### 2-3. Secret 존재 확인

```powershell
kubectl -n brainx get secrets
```

`gateway-secret`, `postgres-secret`, `workspace-secret`, `mcp-service-secret`, `admin-service-secret`이 모두 apply 대상 서비스에 맞춰 존재해야 한다.

---

## 3. ConfigMap 변경 절차

ConfigMap이 분리된 서비스: `admin-service-config`, `workspace-service-config`, `mcp-service-config`, `prometheus-config`, `grafana-config`. Discovery/Gateway/User는 아직 inline env 방식이라 ConfigMap이 없다(값 변경은 Deployment YAML의 `env`를 직접 수정).

**핵심 규칙: ConfigMap을 `apply`만 하고 끝내지 않는다.** `envFrom`은 Pod 최초 기동 시점에만 값을 주입하므로, ConfigMap 값만 바꾸고 재시작하지 않으면 기존 Pod는 이전 값을 계속 들고 있다.

절차:

```powershell
# 1) ConfigMap 파일 수정 후 apply
kubectl apply -f .\k8s\apps\<service>-configmap.yaml   # 별도 파일인 mcp-service만 해당
kubectl apply -f .\k8s\apps\<service>-service.yaml      # admin/workspace는 같은 파일 안에 ConfigMap 포함

# 2) 반드시 재시작
kubectl -n brainx rollout restart deployment/<service-name>

# 3) 반영 확인
kubectl -n brainx rollout status deployment/<service-name>
kubectl -n brainx exec deployment/<service-name> -- env | findstr <바뀐_KEY>
```

Monitoring(Prometheus/Grafana)은 ConfigMap이 파일 마운트(`volumeMounts` + `subPath`)이므로 재시작해도 컨테이너 내부 프로세스가 자동으로 다시 읽지 않을 수 있다. 반드시 `rollout restart`로 컨테이너 자체를 재기동한다.

```powershell
kubectl apply -f .\k8s\monitoring\prometheus-configmap.yaml
kubectl -n brainx rollout restart deployment/prometheus

kubectl apply -f .\k8s\monitoring\grafana-configmap.yaml
kubectl -n brainx rollout restart deployment/grafana
```

MCP만 예시로 정리하면:

```powershell
kubectl apply -f .\k8s\apps\mcp-service-configmap.yaml
kubectl -n brainx rollout restart deployment/mcp-service
kubectl -n brainx rollout status deployment/mcp-service
```

`mcp-service-configmap.yaml`을 빠뜨리고 `mcp-service.yaml`만 apply하면 Pod가 `CreateContainerConfigError`로 멈춘다(9-1번 참고).

---

## 4. Monitoring 최초 배포 (수동)

`k8s.ps1`이 지원하지 않으므로 순서대로 수동 apply한다. Prometheus는 scrape 대상으로 `user-service`, `gateway-service`, `admin-service`, `workspace-service` Service가 먼저 존재해야 한다.

```powershell
kubectl apply -f .\k8s\namespace.yaml
kubectl apply -f .\k8s\monitoring\prometheus-configmap.yaml
kubectl apply -f .\k8s\monitoring\prometheus.yaml
kubectl apply -f .\k8s\secrets\grafana-secret.yaml
kubectl apply -f .\k8s\monitoring\grafana-configmap.yaml
kubectl apply -f .\k8s\monitoring\grafana.yaml
```

---

## 5. rollout restart

```powershell
kubectl -n brainx rollout restart deployment/discovery-service
kubectl -n brainx rollout restart deployment/gateway-service
kubectl -n brainx rollout restart deployment/user-service
kubectl -n brainx rollout restart deployment/admin-service
kubectl -n brainx rollout restart deployment/mcp-service
kubectl -n brainx rollout restart deployment/workspace-service
kubectl -n brainx rollout restart deployment/prometheus
kubectl -n brainx rollout restart deployment/grafana
```

진행 확인(완료까지 블로킹):

```powershell
kubectl -n brainx rollout status deployment/<service-name>
```

직전 배포로 되돌리기(롤백):

```powershell
kubectl -n brainx rollout history deployment/<service-name>
kubectl -n brainx rollout undo deployment/<service-name>
```

User/Admin/MCP/Workspace는 `maxSurge: 0`, `maxUnavailable: 1` 전략이 걸려 있어([TROUBLESHOOTING.md #9](TROUBLESHOOTING.md#9-postgres-too-many-clients로-rollout-중-신규-pod-crashloopbackoff) 참고) 이전 Pod를 먼저 내린 뒤 새 Pod를 올린다. 즉 rollout 중 짧은 다운타임이 정상이다.

---

## 6. health 확인

| 서비스 | Health | Readiness | Liveness |
| --- | --- | --- | --- |
| Discovery | `/actuator/health` | - | - |
| Gateway | `/actuator/health` | - | - |
| User | `/actuator/health` | `/actuator/health/readiness` | `/actuator/health/liveness` |
| Admin | `/actuator/health` | `/actuator/health/readiness` | `/actuator/health/liveness` |
| Workspace | `/actuator/health` | `/actuator/health/readiness` | `/actuator/health/liveness` |
| MCP | `/actuator/health` | `/actuator/health`(startup/readiness 동일 경로) | `/actuator/health` |

port-forward 후(7장) 확인:

```powershell
curl.exe http://localhost:18761/actuator/health
curl.exe http://localhost:18088/actuator/health
curl.exe http://localhost:18080/actuator/health/readiness
curl.exe http://localhost:18080/actuator/health/liveness
curl.exe http://localhost:18085/actuator/health/readiness
curl.exe http://localhost:18085/actuator/health/liveness
curl.exe http://localhost:18082/actuator/health/readiness
curl.exe http://localhost:18082/actuator/health/liveness
curl.exe http://localhost:18087/actuator/health
curl.exe http://localhost:18087/api/v1/mcp/whoami
```

Monitoring은 Kubernetes probe 자체가 설정되어 있지 않으므로(현재 `prometheus.yaml`/`grafana.yaml`에 readiness/liveness probe 없음) 수동으로만 확인한다:

```powershell
curl.exe http://localhost:19090/-/healthy
curl.exe http://localhost:19090/-/ready
curl.exe -u <GF_SECURITY_ADMIN_USER>:<GF_SECURITY_ADMIN_PASSWORD> http://localhost:13000/api/health
```

Pod `READY` 컬럼이 `0/1`인데 애플리케이션 로그는 정상이면, health 응답이 `401`인지부터 의심한다(9-6번 참고).

---

## 7. port-forward

Compose가 이미 점유 중인 로컬 포트(`8761`, `8080`, `8082`, `8085`, `8087`, `8088`, Grafana 대상 서비스가 `3000`을 쓰는 `brainx-next` 프론트엔드 등)와 겹치지 않도록 `1` 접두사 로컬 포트를 사용한다.

```powershell
kubectl -n brainx port-forward svc/discovery-service 18761:8761
kubectl -n brainx port-forward svc/gateway-service 18088:8088
kubectl -n brainx port-forward svc/user-service 18080:8080
kubectl -n brainx port-forward svc/admin-service 18085:8085
kubectl -n brainx port-forward svc/workspace-service 18082:8082
kubectl -n brainx port-forward svc/mcp-service 18087:8087
kubectl -n brainx port-forward svc/prometheus 19090:9090
kubectl -n brainx port-forward svc/grafana 13000:3000
```

충돌 시:

```powershell
netstat -ano | findstr :<port>
```

다른 로컬 포트로 바꿔서 재시도한다(예: `28761:8761`).

---

## 8. 로그 확인

```powershell
# 실시간
kubectl -n brainx logs -f deployment/<service-name>

# 최근 로그(follow 없이)
kubectl -n brainx logs deployment/<service-name>

# 직전에 재시작/CrashLoop된 컨테이너의 로그 (원인 파악에 가장 중요)
kubectl -n brainx logs deployment/<service-name> --previous

# 이벤트(스케줄링/이미지/프로브 실패 등)
kubectl -n brainx describe pod -l app=<service-name>
```

`<service-name>`: `discovery-service`, `gateway-service`, `user-service`, `admin-service`, `mcp-service`, `workspace-service`, `prometheus`, `grafana`.

---

## 9. Rollout 실패 시 복구

각 항목은 "증상 → 확인 → 조치" 순서다. 배경 설명이 더 필요하면 괄호의 [TROUBLESHOOTING.md](TROUBLESHOOTING.md) 링크를 따라간다.

### 9-1. CreateContainerConfigError

**증상**: Pod가 `Running`으로 못 올라오고 `CreateContainerConfigError`.

**확인**:

```powershell
kubectl -n brainx describe pod -l app=<service-name>
kubectl -n brainx get secrets
kubectl -n brainx get configmaps
```

`secret "xxx" not found` 또는 `couldn't find key XXX in Secret`, 또는 MCP의 경우 `mcp-service-config` ConfigMap 누락 메시지를 확인한다.

**조치**:

```powershell
# Secret 누락이면
kubectl apply -f .\k8s\secrets\<service>-secret.yaml

# MCP ConfigMap 누락이면
kubectl apply -f .\k8s\apps\mcp-service-configmap.yaml

kubectl -n brainx rollout restart deployment/<service-name>
```

([TROUBLESHOOTING.md #2](TROUBLESHOOTING.md#2-secret-누락으로-createcontainerconfigerror))

### 9-2. CrashLoopBackOff

**증상**: Pod가 반복적으로 재시작된다.

**확인**:

```powershell
kubectl -n brainx logs deployment/<service-name> --previous
```

로그에서 원인별로 분기한다:

- `Unexpected end-of-input`, `SpringApplicationJsonEnvironmentPostProcessor` → Gateway `SPRING_APPLICATION_JSON` JSON 깨짐. `k8s/apps/gateway-service.yaml`의 JSON 문자열을 검증기에 붙여 넣어 중괄호/쉼표를 확인한다. ([TROUBLESHOOTING.md #1](TROUBLESHOOTING.md#1-spring_application_json-중괄호-누락으로-gateway-crashloopbackoff))
- `password authentication failed`, HikariCP 연결 실패 → `postgres-secret` 값이 Compose Postgres 실제 계정과 다름. ([TROUBLESHOOTING.md #3](TROUBLESHOOTING.md#3-postgres-비밀번호-불일치로-user-crashloopbackoff))
- `too many clients already` → 9-7번 참고.
- `Connection refused`(host.docker.internal) → 9-4번 대신 6번 항목([TROUBLESHOOTING.md #6](TROUBLESHOOTING.md#6-docker-desktop-kubernetes와-compose-혼합-환경에서-hostdockerinternal-이슈)) 참고.

**조치**: 원인 확정 후 해당 Secret/ConfigMap/Compose 서비스를 수정하고 `kubectl -n brainx rollout restart deployment/<service-name>`.

### 9-3. ImagePullBackOff

**증상**: Pod 상태가 `ImagePullBackOff` / `ErrImagePull`.

**확인**:

```powershell
kubectl -n brainx describe pod -l app=<service-name>
docker images | findstr brainx
kubectl config current-context
```

**조치**:

```powershell
docker build -t brainx-<service>-service:local .\brainX_back\<Service-Name>
kubectl -n brainx rollout restart deployment/<service-name>
```

`kubectl config current-context`가 Docker Desktop Kubernetes가 아니면 컨텍스트부터 바로잡는다. `.\k8s.ps1 <service>`를 쓰면 이미지 빌드가 자동 포함되어 이 문제 자체를 예방한다. ([TROUBLESHOOTING.md #7](TROUBLESHOOTING.md#7-imagepullbackoff))

### 9-4. Pending

**증상**: Pod가 `Pending`에서 넘어가지 않는다.

**확인**:

```powershell
kubectl -n brainx describe pod -l app=<service-name>
kubectl get nodes
kubectl top nodes 2>$null
```

`describe pod`의 `Events`에서 원인을 좁힌다. Docker Desktop 단일 노드 환경에서 흔한 원인:

- 노드 자체가 `NotReady` → Docker Desktop Kubernetes가 완전히 기동되지 않았거나 재시작 중.
- `Insufficient cpu` / `Insufficient memory` → 여러 서비스를 동시에 올려 Docker Desktop에 할당된 리소스가 부족(현재 매니페스트는 `resources.requests/limits` 미설정이라 흔치 않지만, Docker Desktop 자체 리소스 한도에는 걸릴 수 있다).
- `PersistentVolumeClaim` 관련 메시지 → 현재 `k8s/`는 PVC를 쓰지 않고 전부 `emptyDir`이므로 이 원인은 없어야 한다. 보이면 매니페스트가 의도치 않게 바뀐 것이니 `git diff`로 확인한다.

**조치**: 노드가 `NotReady`면 Docker Desktop을 재시작하고 `kubectl get nodes`로 `Ready`가 될 때까지 기다린다. 리소스 부족이면 불필요한 Pod/Compose 컨테이너를 내려 여유를 만든 뒤 재시도한다.

### 9-5. OOMKilled

**증상**: `kubectl -n brainx get pods`에서 `RESTARTS`가 계속 올라가고, `describe pod`의 `Last State`가 `Terminated`, `Reason: OOMKilled`(종료 코드 137)로 보인다.

**확인**:

```powershell
kubectl -n brainx describe pod -l app=<service-name>
kubectl -n brainx logs deployment/<service-name> --previous
```

**원인**: 현재 모든 Deployment에 `resources.limits`가 설정되어 있지 않다(`PRODUCTION_CHECKLIST.md` 0번 항목). 즉 컨테이너 자체 limit 초과가 아니라, Docker Desktop VM 전체의 메모리 한도를 여러 서비스가 동시에 소진했을 가능성이 크다. 특히 Postgres/Redis/Neo4j/Kafka(Compose) + 6개 Spring Boot Pod + Prometheus/Grafana를 한 번에 띄우면 Docker Desktop 기본 메모리 할당(예: 4~8GB)을 넘기기 쉽다.

**조치**:

1. Docker Desktop `Settings > Resources`에서 할당된 메모리를 확인하고 필요시 늘린다.
2. 지금 당장 필요하지 않은 Pod/Compose 컨테이너를 내려 메모리를 확보한다.
3. 재현 서비스가 특정되면 JVM 힙 옵션(`JAVA_TOOL_OPTIONS=-Xmx...` 등)을 해당 Deployment `env`에 임시로 추가해 완화할 수 있다(운영 전환 시에는 `resources.requests/limits`를 정식으로 설정하는 것이 근본 대책 — `PRODUCTION_CHECKLIST.md` 8번 항목).
4. `kubectl -n brainx rollout restart deployment/<service-name>`으로 재기동 후 `RESTARTS` 카운트가 더 늘지 않는지 관찰한다.

### 9-6. Gateway JWT 오류

**증상**: Gateway를 경유한 요청이 `401`/`403`으로 거부된다. Gateway 로그에 서명 검증 실패(`JWT signature does not match`, `SignatureException` 등)가 보인다. 또는 User-Service가 정상 발급한 토큰인데도 MCP/Workspace/Admin에서 검증이 실패한다.

**확인**: 2-2번의 base64 디코드 명령으로 `gateway-secret`, `workspace-secret`, `mcp-service-secret`, `admin-service-secret`의 `JWT_SECRET` 값이 전부 동일한지 비교한다. MCP는 `JWT_SECRET`뿐 아니라 `BRAINX_OAUTH_ISSUER`/`BRAINX_MCP_RESOURCE`도 User-Service 발급값과 같은지 함께 확인한다([SETUP.md 8-8](SETUP.md#8-8-mcp-oauth-공개-url-불일치)).

**조치**:

```powershell
# 값이 다른 Secret을 실제 파일에서 통일된 값으로 수정한 뒤
kubectl apply -f .\k8s\secrets\gateway-secret.yaml
kubectl apply -f .\k8s\secrets\workspace-secret.yaml
kubectl apply -f .\k8s\secrets\mcp-service-secret.yaml
kubectl apply -f .\k8s\secrets\admin-service-secret.yaml

# JWT_SECRET을 쓰는 모든 서비스를 함께 재시작해야 한다
kubectl -n brainx rollout restart deployment/gateway-service deployment/user-service deployment/workspace-service deployment/admin-service deployment/mcp-service
```

이와 별개로 애초에 401이 인증 실패가 아니라 actuator 자체가 막혀서 나는 401이라면 9-8번(actuator 401)을 먼저 배제한다.

### 9-7. Hikari/Postgres 연결수 부족

**증상**: `admin-service` 또는 `mcp-service`(또는 다른 Postgres 연동 서비스) rollout 중, 새 Pod만 `CrashLoopBackOff`. 로그에 `FATAL: sorry, too many clients already`. MCP는 `Maximum pool size: undefined` 로그도 함께 보일 수 있다.

**확인**:

```powershell
kubectl -n brainx logs deployment/<service-name> --previous
docker exec -it brainx-postgres psql -U postgres -c "SELECT count(*), state FROM pg_stat_activity GROUP BY state;"
docker exec -it brainx-postgres psql -U postgres -c "SHOW max_connections;"
```

**원인**: User/Workspace/Admin/MCP 4개 서비스가 같은 Compose Postgres를 공유하며, rolling update 중 old/new Pod가 동시에 커넥션을 열어 순간적으로 `max_connections`(기본 조치 후 200)를 넘길 수 있다. 현재는 4개 서비스 모두 `SPRING_DATASOURCE_HIKARI_MAXIMUM_POOL_SIZE=3`, `MINIMUM_IDLE=1`로 이미 고정되어 있고 `maxSurge: 0` 전략도 적용되어 있다.

**조치**:

1. 새로 추가한 서비스나 수정한 ConfigMap/Deployment에 위 두 값이 빠지지 않았는지 먼저 확인한다.
2. 값이 빠졌으면 해당 ConfigMap(`admin-service-config`/`workspace-service-config`/`mcp-service-config`) 또는 `user-service.yaml`의 `env`에 추가하고 재적용한다.
3. `kubectl -n brainx rollout restart deployment/<service-name>` 후 `rollout status`로 완료를 확인한다.
4. 위 `psql` 명령으로 활성 커넥션 수가 `max_connections` 예산 안인지 재확인한다.

인프라값(`max_connections`)을 계속 올리는 것은 임시방편이다. 서비스가 늘어날 때는 Hikari pool 상한을 먼저 맞추는 것이 원칙이다. ([TROUBLESHOOTING.md #9](TROUBLESHOOTING.md#9-postgres-too-many-clients로-rollout-중-신규-pod-crashloopbackoff))

### 9-8. (부록) Actuator 401로 readiness/liveness 실패

**증상**: Pod는 `Running`인데 `READY`가 계속 `0/1`. `describe pod` Events에 `HTTP probe failed with statuscode: 401`.

**확인/조치**: [TROUBLESHOOTING.md #4](TROUBLESHOOTING.md#4-actuator-health-401로-readinessliveness-실패) 그대로. 해당 서비스 `SecurityConfig`에서 `/actuator/health`, `/actuator/health/readiness`, `/actuator/health/liveness`만 `permitAll`인지 확인한다.

---

## 10. 최종 검증 체크리스트

배포/재배포 작업을 끝내기 전 아래 항목을 순서대로 확인한다.

- [ ] `kubectl -n brainx get namespace brainx`로 namespace 존재 확인
- [ ] `kubectl -n brainx get secrets`로 필요한 Secret(`gateway-secret`, `postgres-secret`, `workspace-secret`, `mcp-service-secret`, `admin-service-secret`, `grafana-secret`)이 모두 존재하는지 확인
- [ ] `kubectl -n brainx get configmaps`로 `admin-service-config`, `workspace-service-config`, `mcp-service-config`, `prometheus-config`, `grafana-config` 존재 확인
- [ ] `kubectl -n brainx get pods`에서 모든 대상 Pod의 `READY`가 `1/1`, `STATUS`가 `Running`
- [ ] 각 서비스 `kubectl -n brainx rollout status deployment/<service-name>`이 전부 성공으로 종료
- [ ] `kubectl -n brainx get pods`의 `RESTARTS`가 비정상적으로 증가하지 않는지(CrashLoop/OOMKilled 재발 여부) 확인
- [ ] 6장의 health/readiness/liveness curl 결과가 전부 `200`
- [ ] 7장의 port-forward가 모든 대상 서비스에서 정상 연결
- [ ] 2-2번 방식으로 `JWT_SECRET`이 `gateway-secret`/`workspace-secret`/`mcp-service-secret`/`admin-service-secret` 4곳에서 동일한지 확인
- [ ] `docker exec -it brainx-postgres psql -U postgres -c "SELECT count(*), state FROM pg_stat_activity GROUP BY state;"`로 활성 커넥션 수가 `max_connections` 예산 안인지 확인
- [ ] Gateway 경유 라우팅이 필요한 경우: Compose 대상 앱 서비스(`user-service`, `workspace-service`, `ingestion-service`, `commerce-service`, `admin-service`, `intelligence-service`, `mcp-service`)가 `Up` 상태인지 `docker compose -f .\brainX_back\docker-compose.yml ps`로 확인
- [ ] Prometheus: `http://localhost:19090/targets`에서 `user-service`/`gateway-service`/`admin-service`/`workspace-service` job이 `UP`
- [ ] Grafana: `http://localhost:13000`에 `grafana-secret` 계정으로 로그인 가능, Prometheus datasource 연결 정상
- [ ] `git status`, `git status --ignored`로 실제 Secret 파일(`k8s/secrets/*.yaml`, example 제외)이 추적되지 않는지 확인

---

## 주의

- 이 문서는 기존 `k8s/` YAML을 수정하지 않는다. 절차 중 문제가 발견되면 이 문서가 아니라 해당 매니페스트를 직접 고치고, 필요하면 [TROUBLESHOOTING.md](TROUBLESHOOTING.md)에 사례를 추가한다.
- 현재 구성은 Docker Desktop Kubernetes + `host.docker.internal` 로컬 검증 전용이다. EC2 k3s/EKS 등 다른 환경에는 그대로 적용되지 않는다([PRODUCTION_CHECKLIST.md](PRODUCTION_CHECKLIST.md) 참고).
- Secret 실제 값은 로컬 검증용이라도 절대 커밋하지 않는다. 이미 원격 이력에 노출된 값은 마스킹 여부와 무관하게 재발급 대상이다.

SSOT 계약에 맞게 구현 완료
