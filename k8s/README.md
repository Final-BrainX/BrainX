# BrainX Kubernetes 1차 전환

## 현재 Kubernetes 적용 범위

- Namespace: `brainx`
- 적용 완료 기준 서비스: `Discovery-Service`, `Gateway-Service`
- 준비 완료 매니페스트: `Discovery-Service`, `Admin-Service`, `Gateway-Service`, `User-Service`, `Workspace-Service`, `Ingestion-Service`, `Commerce-Service`, `Intelligence-Service`, `Mcp-Service`
- 목적: 기존 Docker Compose 개발 환경을 유지한 채, Kubernetes 리소스 추가와 로컬 검증 절차를 분리해서 준비

## 선정 이유

- `Discovery-Service`는 stateless 서비스다.
- [brainX_back/Discovery-Service/build.gradle](/C:/Edu/Final_Project/BrainX/brainX_back/Discovery-Service/build.gradle) 기준으로 Postgres, Redis, Neo4j, Qdrant, Kafka 의존성이 없다.
- [brainX_back/Discovery-Service/src/main/resources/application.yml](/C:/Edu/Final_Project/BrainX/brainX_back/Discovery-Service/src/main/resources/application.yml) 기준으로 `/actuator/health` 노출이 가능하다.
- 다른 핵심 비즈니스 기능을 직접 소유하지 않아 단독 배포 검증 시 영향 범위가 가장 작다.
- Gateway 첫 전환 금지 원칙을 지킬 수 있다.

## Docker Compose 유지 대상

- `postgres`
- `postgres-service-databases`
- `redis`
- `neo4j`
- `qdrant`
- `kafka`
- `gateway-service`
- `user-service`
- `workspace-service`
- `ingestion-service`
- `commerce-service`
- `intelligence-service`
- `mcp-service`
- 나머지 애플리케이션 서비스 전체

## 프로젝트 구조

```text
k8s/
├─ README.md
├─ namespace.yaml
├─ apps/
│  ├─ discovery-service.yaml
│  ├─ admin-service.yaml
│  ├─ gateway-service.yaml
│  ├─ user-service.yaml
│  ├─ workspace-service.yaml
│  ├─ ingestion-service.yaml
│  ├─ ingestion-service-configmap.yaml
│  ├─ commerce-service.yaml
│  ├─ intelligence-service.yaml
│  ├─ intelligence-service-configmap.yaml
│  └─ mcp-service.yaml
├─ monitoring/
├─ configs/
└─ secrets/
```

`k8s/secrets/`에는 example 파일만 Git에 추적하고, 실제 Secret 파일은 Git에 올리지 않는다.

## Secret 준비

실제 Secret 파일 생성:

```powershell
Copy-Item .\k8s\secrets\gateway-secret.example.yaml .\k8s\secrets\gateway-secret.yaml
Copy-Item .\k8s\secrets\postgres-secret.example.yaml .\k8s\secrets\postgres-secret.yaml
```

생성한 실제 파일에서 `CHANGE_ME`를 로컬 검증용 실제 값으로 바꾼다.

- `gateway-secret.yaml`
  - `SERVICE_TOKEN`: Gateway, User, Admin 간 내부 호출용 토큰
  - `JWT_SECRET`: Gateway-Service와 User-Service가 공유하는 서명 시크릿 (Workspace/Admin/MCP의 `JWT_SECRET`과 동일 값이어야 함)
- `postgres-secret.yaml`
  - `POSTGRES_USER`
  - `POSTGRES_PASSWORD`
- `admin-service.yaml`을 apply하려면 `admin-service-secret.yaml`도 먼저 만들어 apply해야 한다(아래 "kubectl apply" 순서 참고).
- `ingestion-service.yaml`을 apply하려면 `ingestion-service-secret.yaml`도 먼저 만들어 apply해야 한다.
- `commerce-service.yaml`을 apply하려면 `commerce-service-secret.yaml`도 먼저 만들어 apply해야 한다.
- `intelligence-service.yaml`을 apply하려면 `intelligence-service-secret.yaml`도 먼저 만들어 apply해야 한다.

주의:

- example 파일만 Git 추적 대상이다.
- 실제 Secret 파일은 `.gitignore`로 제외한다.
- 로컬 검증용이라도 평문 Secret을 커밋하지 않는다.
- 이미 원격 이력에 올라간 값은 마스킹 여부와 무관하게 안전하지 않으므로 재발급/변경이 필요하다.
- 새 준비 자산 중 `Workspace-Service`, `Admin-Service`, `Ingestion-Service`, `Commerce-Service`, `Intelligence-Service`, `Mcp-Service`는 비민감 env를 ConfigMap으로 분리하고, 민감값만 Secret으로 주입한다.

## 이미지 빌드

Docker Desktop Kubernetes 로컬 클러스터 기준으로, 먼저 Discovery-Service 이미지를 빌드한다.

```powershell
docker build -t brainx-discovery-service:local .\brainX_back\Discovery-Service
docker build -t brainx-admin-service:local .\brainX_back\Admin-Service
docker build -t brainx-gateway-service:local .\brainX_back\Gateway-Service
docker build -t brainx-user-service:local .\brainX_back\User-Service
docker build -t brainx-ingestion-service:local .\brainX_back\Ingestion-Service
docker build -t brainx-commerce-service:local .\brainX_back\Commerce-Service
docker build -t brainx-intelligence-service:local .\brainX_back\Intelligence-Service
```

## kubectl apply

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

권장 순서:

1. `namespace.yaml`
2. `k8s/secrets/*.yaml` (Admin은 `admin-service-secret.yaml`이 별도로 필요)
3. `discovery-service.yaml`
4. `gateway-service.yaml`
5. `user-service.yaml`
6. `admin-service-secret.yaml` (Admin 전용, `admin-service.yaml`보다 먼저)
7. `admin-service.yaml`
8. `ingestion-service-secret.yaml` -> `ingestion-service-configmap.yaml` -> `ingestion-service.yaml`
9. `commerce-service-secret.yaml` -> `commerce-service.yaml`
10. `intelligence-service-secret.yaml` -> `intelligence-service-configmap.yaml` -> `intelligence-service.yaml`

## 리소스 삭제

```powershell
kubectl delete -f .\k8s\apps\discovery-service.yaml
kubectl delete -f .\k8s\apps\admin-service.yaml
kubectl delete -f .\k8s\apps\gateway-service.yaml
kubectl delete -f .\k8s\apps\user-service.yaml
kubectl delete -f .\k8s\apps\commerce-service.yaml
kubectl delete -f .\k8s\apps\intelligence-service.yaml
kubectl delete -f .\k8s\namespace.yaml
```

Namespace 전체를 지우면 이후 추가한 다른 Kubernetes 리소스도 함께 삭제되므로 주의한다.

## Pod 확인

```powershell
kubectl -n brainx get all
kubectl -n brainx get pods
kubectl -n brainx describe pod -l app=discovery-service
kubectl -n brainx describe pod -l app=admin-service
kubectl -n brainx describe pod -l app=gateway-service
kubectl -n brainx describe pod -l app=user-service
kubectl -n brainx describe pod -l app=ingestion-service
kubectl -n brainx describe pod -l app=commerce-service
kubectl -n brainx describe pod -l app=intelligence-service
```

## port-forward

기존 Docker Compose 의 `8761` 포트와 충돌하지 않도록 로컬 포트 `18761` 사용을 권장한다.

```powershell
kubectl -n brainx port-forward svc/discovery-service 18761:8761
kubectl -n brainx port-forward svc/admin-service 18085:8085
kubectl -n brainx port-forward svc/gateway-service 18088:8088
kubectl -n brainx port-forward svc/user-service 18080:8080
kubectl -n brainx port-forward svc/ingestion-service 18083:8083
kubectl -n brainx port-forward svc/commerce-service 18084:8084
kubectl -n brainx port-forward svc/intelligence-service 18086:8086
```

확인 주소:

- Eureka UI: `http://localhost:18761`
- Health: `http://localhost:18761/actuator/health`
- Admin Health: `http://localhost:18085/actuator/health`
- Gateway Health: `http://localhost:18088/actuator/health`
- User Health: `http://localhost:18080/actuator/health`
- User Readiness: `http://localhost:18080/actuator/health/readiness`
- User Liveness: `http://localhost:18080/actuator/health/liveness`
- Ingestion Health: `http://localhost:18083/actuator/health`
- Commerce Health: `http://localhost:18084/actuator/health`
- Commerce Prometheus: `http://localhost:18084/actuator/prometheus`
- Intelligence Readiness: `http://localhost:18086/actuator/health/readiness`
- Intelligence Liveness: `http://localhost:18086/actuator/health/liveness`
- Intelligence Prometheus: `http://localhost:18086/actuator/prometheus`

## 로그 보기

```powershell
kubectl -n brainx logs deployment/discovery-service
kubectl -n brainx logs -f deployment/discovery-service
kubectl -n brainx logs deployment/admin-service
kubectl -n brainx logs -f deployment/admin-service
kubectl -n brainx logs deployment/gateway-service
kubectl -n brainx logs -f deployment/gateway-service
kubectl -n brainx logs deployment/user-service
kubectl -n brainx logs -f deployment/user-service
kubectl -n brainx logs deployment/ingestion-service
kubectl -n brainx logs -f deployment/ingestion-service
kubectl -n brainx logs deployment/commerce-service
kubectl -n brainx logs -f deployment/commerce-service
kubectl -n brainx logs deployment/intelligence-service
kubectl -n brainx logs -f deployment/intelligence-service
```

## 자동 복구 확인

현재 Pod 이름 확인:

```powershell
kubectl -n brainx get pods -l app=discovery-service
kubectl -n brainx get pods -l app=admin-service
kubectl -n brainx get pods -l app=gateway-service
kubectl -n brainx get pods -l app=user-service
kubectl -n brainx get pods -l app=ingestion-service
kubectl -n brainx get pods -l app=commerce-service
kubectl -n brainx get pods -l app=intelligence-service
```

Pod 하나 삭제:

```powershell
kubectl -n brainx delete pod -l app=discovery-service
kubectl -n brainx delete pod -l app=admin-service
kubectl -n brainx delete pod -l app=gateway-service
kubectl -n brainx delete pod -l app=user-service
kubectl -n brainx delete pod -l app=ingestion-service
kubectl -n brainx delete pod -l app=intelligence-service
```

복구 확인:

```powershell
kubectl -n brainx get pods -w
```

## Docker Compose와 병행 실행

- 기존 `brainX_back/docker-compose.yml`은 수정하지 않는다.
- 현재 적용 완료 기준으로는 Kubernetes 에 `Discovery-Service`를 올리고, DB/Redis/Neo4j/Qdrant/Kafka 및 나머지 앱 서비스는 기존 Compose 로 유지한다.
- `Admin-Service` 매니페스트는 준비 단계이며, 적용 시에도 상태 저장 인프라와 관련 앱 서비스는 계속 Compose 로 유지한다.
- `Gateway-Service`는 Kubernetes 적용을 완료했더라도, 라우팅 대상 앱 서비스가 Compose 에 남아 있는 동안은 병행 운영 형태로 검증한다.
- `User-Service` 매니페스트는 준비 단계이며, 적용 시에도 Postgres/Redis/Workspace-Service 는 계속 Compose 로 유지한다.
- Compose 쪽 `discovery-service`와 동시에 접근 테스트를 해야 하면 `kubectl port-forward` 로 다른 로컬 포트를 사용한다.
- `Admin-Service`를 Kubernetes 에서 띄울 때는 Compose 서비스명을 직접 해석하지 않고 `host.docker.internal` 을 통해 호스트에 publish 된 Compose 포트로 접속한다.
- `Gateway-Service`는 코드의 `lb://...` 라우트를 유지하되, Kubernetes 매니페스트에서만 Spring Simple Discovery 정적 인스턴스를 주입해 `host.docker.internal:<port>` 로 Compose 서비스를 바라보게 한다.
- `User-Service`를 Kubernetes 에서 띄울 때는 Postgres, Redis, Workspace-Service 를 `host.docker.internal` 경유로 바라보게 한다.
- 따라서 이 방식은 Docker Desktop Kubernetes 로컬 검증 전용이며, Linux bare-metal Kubernetes 나 운영 클러스터 주소 체계와는 다르다.
- 운영 환경이나 EC2 배포 구성은 이번 범위에 포함하지 않는다.

## 실행 순서 예시

1. 기존 Docker Compose 환경이 필요하면 평소처럼 실행한다.
2. User-Service 를 검증할 때는 Compose 의 `postgres`, `redis`, `workspace-service` 가 먼저 떠 있어야 한다.
3. Admin-Service 를 검증할 때는 Compose 의 `postgres`, `kafka`, `gateway-service` 와 관련 앱 서비스들이 먼저 떠 있어야 한다.
4. Gateway-Service 를 검증할 때는 Compose 의 `user-service`, `workspace-service`, `ingestion-service`, `commerce-service`, `admin-service`, `intelligence-service`, `mcp-service` 가 먼저 떠 있어야 한다.
5. Discovery-Service, Gateway-Service, User-Service, Admin-Service 이미지를 로컬에 빌드한다.
6. `namespace.yaml`, `apps/discovery-service.yaml`, `apps/gateway-service.yaml`, `apps/user-service.yaml`, `apps/admin-service.yaml` 을 apply 한다.
7. Pod Ready 확인 후 `port-forward` 로 상태를 검증한다.

## User-Service 전환 메모

Compose 기준 User-Service 설정 요약:

- build context: `./User-Service`
- port: `8080:8080`
- depends_on: `discovery-service`, `postgres`, `redis`
- healthcheck: 없음

구성 분석:

- [brainX_back/User-Service/src/main/resources/application.yml](/C:/Edu/Final_Project/BrainX/brainX_back/User-Service/src/main/resources/application.yml) 기준으로 Postgres, Redis, Workspace-Service, Eureka 주소를 모두 환경 변수로 주입할 수 있다.
- [brainX_back/User-Service/build.gradle](/C:/Edu/Final_Project/BrainX/brainX_back/User-Service/build.gradle) 에 `spring-boot-starter-actuator` 가 포함되어 있다.
- 같은 `application.yml` 에서 `/actuator/health` 가 노출되고, `management.endpoint.health.probes.enabled=true` 와 readiness/liveness group 이 설정되어 있다.
- [brainX_back/User-Service/src/main/java/brain/web/mvc/client/WorkspaceServiceClient.java](/C:/Edu/Final_Project/BrainX/brainX_back/User-Service/src/main/java/brain/web/mvc/client/WorkspaceServiceClient.java) 기준으로 Workspace-Service 호출은 `workspace-service.base-url` 과 `brainx.service-token` 으로 분리되어 있다.
- [brainX_back/User-Service/src/main/java/brain/web/mvc/service/AuthService.java](/C:/Edu/Final_Project/BrainX/brainX_back/User-Service/src/main/java/brain/web/mvc/service/AuthService.java) 기준으로 default workspace 생성은 best-effort 호출이라, Workspace-Service 장애가 있어도 User-Service 자체 기동이 반드시 막히는 구조는 아니다.

Kubernetes 준비 매니페스트의 연결 방식:

- Eureka: `http://discovery-service:8761/eureka/`
- Postgres: `host.docker.internal:5432`
- Redis: `host.docker.internal:6379`
- Workspace-Service: `http://host.docker.internal:8082`
- Postgres credentials: `postgres-secret` 의 `POSTGRES_USER`, `POSTGRES_PASSWORD`
- Service Token: `gateway-secret` 의 `SERVICE_TOKEN`
- JWT 시크릿: `gateway-secret` 의 `JWT_SECRET` (Gateway-Service와 공유)
- 소셜 로그인(선택): `user-service-oauth-secret` 의 Google/Kakao/Naver client ID/secret/redirect URI (모두 `optional: true`)

주의:

- User-Service 는 stateless 애플리케이션이지만, readiness 는 DB 와 Redis 상태에 직접 영향받는다.
- Workspace-Service 가 내려가 있어도 Pod 가 기동될 수는 있지만, 회원가입/온보딩 직후 default workspace 생성이 실패할 수 있다.
- `host.docker.internal` 경로는 Docker Desktop Kubernetes 로컬 검증에서는 유효하지만 다른 Kubernetes 환경에서는 그대로 동작하지 않을 수 있다.
- User-Service 의 Postgres 계정, `SERVICE_TOKEN`, `JWT_SECRET`은 각각 `postgres-secret`, `gateway-secret`에서 주입한다.
- `user-service-oauth-secret`이 없거나 값이 비어 있으면 Pod 기동은 그대로 되지만, `AuthService.authorizeOAuth()`가 `application.yml`의 placeholder 기본값(`your_google_client_id` 등)으로 동작해 소셜 로그인만 실패한다.

## Admin-Service 전환 메모

Compose 기준 Admin-Service 설정 요약:

- build context: `./Admin-Service`
- port: `8085:8085`
- depends_on: `discovery-service`, `postgres`, `gateway-service`, `kafka`
- healthcheck: `wget -qO- http://localhost:8085/actuator/health | grep -q UP`

Kubernetes 준비 매니페스트의 연결 방식:

- Eureka: `http://discovery-service:8761/eureka/`
- Postgres: `host.docker.internal:5432`
- Kafka: `host.docker.internal:9093` (k8s Pod 전용 `K8S` 리스너, EXTERNAL `localhost:9092`와 별도)
- Gateway 및 나머지 앱 서비스: `host.docker.internal` + Compose publish 포트

주의:

- Admin-Service 자체는 stateless 가 아니고 Postgres/Kafka/Gateway/다른 앱 서비스 상태에 강하게 의존한다.
- 이번 매니페스트는 "Admin-Service Pod 를 Kubernetes 에서 띄울 수 있는지" 확인하는 로컬 준비 단계다.
- Admin-Service 의 Postgres 계정과 `SERVICE_TOKEN`은 각각 `postgres-secret`, `gateway-secret` 에서 주입한다.
- Compose 의 관련 서비스가 내려가 있으면 Admin-Service readiness 는 실패하거나 일부 관리자 기능이 정상 동작하지 않을 수 있다.

## Gateway-Service 전환 메모

Compose 기준 Gateway-Service 설정 요약:

- build context: `./Gateway-Service`
- port: `8088:8088`
- depends_on: `discovery-service`, `user-service`, `workspace-service`, `ingestion-service`, `commerce-service`, `mcp-service`
- healthcheck: `wget -qO- http://localhost:8088/actuator/health | grep -q UP`

라우팅 방식 분석:

- [brainX_back/Gateway-Service/src/main/resources/application.yml](/C:/Edu/Final_Project/BrainX/brainX_back/Gateway-Service/src/main/resources/application.yml) 의 라우트들은 모두 `lb://...` 형태다.
- 즉 Gateway 는 기본적으로 Eureka/DiscoveryClient 기반 서비스 해석을 전제로 한다.
- 현재 Compose 서비스들은 `EUREKA_CLIENT_SERVICE_URL_DEFAULTZONE=http://discovery-service:8761/eureka/` 를 바라보지만, Docker Compose 컨테이너가 Kubernetes DNS 이름 `discovery-service` 를 바로 해석한다는 보장은 없다.
- 그래서 로컬 Kubernetes 준비 매니페스트에서는 Eureka client 를 비활성화하고, Spring Simple Discovery 정적 인스턴스를 사용해 `host.docker.internal:<port>` 로 Compose 서비스에 연결한다.

Kubernetes 준비 매니페스트의 연결 방식:

- Discovery health/probe: Kubernetes `discovery-service:8761`
- 실제 라우팅 대상: `host.docker.internal:8080~8087`
- 라우팅 대상 서비스 ID 매핑:
  - `User-Service` -> `http://host.docker.internal:8080`
  - `Workspace-Service` -> `http://host.docker.internal:8082`
  - `ingestion-service` -> `http://host.docker.internal:8083`
  - `Commerce-Service` -> `http://host.docker.internal:8084`
  - `Admin-Service` -> `http://host.docker.internal:8085`
  - `intelligence-service` -> `http://host.docker.internal:8086`
  - `mcp-service` -> `http://host.docker.internal:8087`

주의:

- Gateway 코드 자체는 Eureka 주소를 Kubernetes Discovery 로 연결할 수 있지만, 그것만으로는 Compose 서비스 라우팅이 보장되지 않는다.
- 이번 매니페스트는 Eureka 기반 운영 전환이 아니라, Gateway Pod 를 Kubernetes 에서 띄운 뒤 Compose 앱 서비스로 프록시 가능한지 확인하는 로컬 준비 단계다.
- [brainX_back/Gateway-Service/src/main/resources/application.yml](/C:/Edu/Final_Project/BrainX/brainX_back/Gateway-Service/src/main/resources/application.yml) 의 `lb://서비스명`과 `k8s/apps/gateway-service.yaml` 의 Spring Simple Discovery `instances` key 는 대소문자까지 100% 일치해야 한다.
- `SERVICE_TOKEN`, `JWT_SECRET`은 더 이상 매니페스트에 평문으로 두지 않고 `gateway-secret` 에서 주입한다. Gateway의 전역 인증 필터가 `brainx.jwt.secret`으로 Bearer 토큰을 검증하므로, User-Service가 서명하는 토큰과 같은 `JWT_SECRET`이어야 한다.
- `mcp-service`를 Kubernetes에 먼저 올려도 Gateway가 즉시 그 Pod를 쓰는 것은 아니다. 현재 Gateway 정적 매핑은 여전히 `http://host.docker.internal:8087` 을 바라보므로, Gateway cutover 전까지는 direct `port-forward` 또는 `svc/mcp-service` 기준으로 따로 검증해야 한다.
- `host.docker.internal` 경로는 Docker Desktop 에서는 유효하지만 모든 Kubernetes 환경에서 동일하게 동작하지 않는다.
- Compose 의 대상 앱 서비스 중 하나라도 내려가 있으면 해당 라우트만 5xx/fallback 으로 보일 수 있다.

## Workspace-Service 전환 메모

Compose 기준 Workspace-Service 설정 요약:

- build context: `./Workspace-Service`
- port: `8082:8082`
- depends_on: `discovery-service`, `postgres`, `redis`, `neo4j`, `kafka`
- healthcheck: 없음

구성 분석:

- [brainX_back/Workspace-Service/src/main/resources/application.yml](/C:/Edu/Final_Project/BrainX/brainX_back/Workspace-Service/src/main/resources/application.yml) 기준으로 Postgres, Redis, Neo4j, Kafka, Eureka 주소를 모두 환경 변수로 주입할 수 있다.
- 같은 `application.yml`에서 `management.endpoint.health.probes.enabled=true`이며 readiness 그룹은 `readinessState, db, redis`, liveness 그룹은 `livenessState`로 구성되어 있다. 즉 readiness는 Postgres와 Redis 상태에 직접 영향받고, Neo4j/Kafka는 readiness 그룹에 포함되지 않는다.
- `Neo4jAutoConfiguration`은 `spring.autoconfigure.exclude`로 비활성화되어 있고, 그래프 연동은 `brainx.graph.neo4j.*`(기본 `enabled=true`, `backfill-on-startup=true`)로 별도 제어된다.
- Postgres 계정, `SERVICE_TOKEN`, `JWT_SECRET`, `NEO4J_PASSWORD`는 모두 환경 변수로 외부화할 수 있어 평문으로 매니페스트에 둘 필요가 없다.

Kubernetes 준비 매니페스트의 연결 방식:

- Eureka: `http://discovery-service:8761/eureka/`
- Postgres: `host.docker.internal:5432` (DB `brainx_workspace`)
- Redis: `host.docker.internal:6379`
- Neo4j: `bolt://host.docker.internal:7687`
- Kafka: `host.docker.internal:9093` (k8s Pod 전용 `K8S` 리스너, EXTERNAL `localhost:9092`와 별도)
- Postgres 계정: `postgres-secret`의 `POSTGRES_USER`, `POSTGRES_PASSWORD` (기존 Secret 재사용)
- Service Token: `gateway-secret`의 `SERVICE_TOKEN` (기존 Secret 재사용)
- JWT 시크릿, Neo4j 비밀번호: `workspace-secret`의 `JWT_SECRET`, `NEO4J_PASSWORD` (신규 Secret)

ConfigMap 분리:

- 비민감 env(`SERVER_PORT`, `PUBLIC_BASE_URL`, `POSTGRES_HOST`/`POSTGRES_PORT`/`WORKSPACE_DB_NAME`, `REDIS_HOST`/`REDIS_PORT`/`REDIS_TIMEOUT`, `NEO4J_ENABLED`/`NEO4J_URI`/`NEO4J_USERNAME`/`NEO4J_BACKFILL_ON_STARTUP`, `SPRING_KAFKA_BOOTSTRAP_SERVERS`, Eureka URL/hostname, `SEED_DEMO_DATA`, `WORKSPACE_DEV_FALLBACK_ENABLED`, draft 관련 값)는 `workspace-service-config` ConfigMap으로 분리해 `envFrom`으로 주입한다.
- 민감값(Postgres 계정, `SERVICE_TOKEN`, `JWT_SECRET`, `NEO4J_PASSWORD`)만 `secretKeyRef`로 주입한다.
- Workspace-Service부터 ConfigMap 분리를 처음 도입했고, 기존 Discovery/Gateway/User/Admin 매니페스트의 inline env 방식은 이번 작업에서 변경하지 않았다.

Secret 준비:

```powershell
Copy-Item .\k8s\secrets\workspace-secret.example.yaml .\k8s\secrets\workspace-secret.yaml
```

- `workspace-secret.yaml`
  - `JWT_SECRET`: 32바이트 이상 실제 서명 시크릿 (User/Workspace/Admin/MCP 공통 값)
  - `NEO4J_PASSWORD`: Compose Neo4j 실제 비밀번호
- example 파일만 Git 추적 대상이며 실제 `workspace-secret.yaml`은 `.gitignore`(`k8s/secrets/*.yaml`)로 제외된다.

적용/검증(참고):

```powershell
kubectl apply -f .\k8s\secrets\workspace-secret.yaml
kubectl apply -f .\k8s\apps\workspace-service.yaml
kubectl -n brainx port-forward svc/workspace-service 18082:8082
```

- Workspace Health: `http://localhost:18082/actuator/health`
- Workspace Readiness: `http://localhost:18082/actuator/health/readiness`
- Workspace Liveness: `http://localhost:18082/actuator/health/liveness`

주의:

- Workspace-Service는 stateless 애플리케이션이 아니며, readiness는 Postgres와 Redis 상태에 직접 의존한다. 둘 중 하나라도 Compose에서 내려가 있으면 readiness probe가 실패한다.
- 로컬 apply 전 검증 기본값은 `PUBLIC_BASE_URL=http://localhost:3000`, `SEED_DEMO_DATA=false`, `NEO4J_BACKFILL_ON_STARTUP=false`로 둔다. share URL을 명시적으로 로컬 web origin에 맞추고, 불필요한 demo data 쓰기와 기동 시 대량 graph backfill을 피하기 위함이다.
- Neo4j projection 자체는 `NEO4J_ENABLED=true`로 유지하므로, 기동 이후 실제 note 이벤트는 계속 Neo4j로 반영된다. 전체 ledger backfill만 startup에서 생략한다.
- `host.docker.internal` 경로는 Docker Desktop Kubernetes 로컬 검증에서만 유효하며 다른 Kubernetes 환경에서는 그대로 동작하지 않는다.
- Postgres 계정과 `SERVICE_TOKEN`은 기존 `postgres-secret`, `gateway-secret`에서 그대로 주입하므로 Workspace 검증 전에 두 Secret이 먼저 apply되어 있어야 한다.
- `k8s.ps1 workspace`는 이제 `workspace-secret` 존재도 함께 검사하므로, helper로 재배포할 때 Secret 누락을 apply 전에 바로 잡을 수 있다.

## Ingestion-Service 전환 메모

Compose 기준 Ingestion-Service 설정 요약:

- build context: `./Ingestion-Service`
- port: `8083:8083`
- depends_on: `discovery-service`, `postgres`, `workspace-service`
- volume: `brainx_ingestion_asset_storage:/app/asset-storage`

구성 분석:

- [brainX_back/Ingestion-Service/src/main/resources/application.yml](/C:/Edu/0_Final_Project/brainX_2/BrainX/brainX_back/Ingestion-Service/src/main/resources/application.yml) 기준으로 Postgres, Kafka, Workspace-Service, Eureka, Notion OAuth, asset storage dir를 모두 환경 변수로 주입할 수 있다.
- 같은 `application.yml`에서 `management.endpoint.health.probes.enabled=true`, readiness group=`readinessState,db`, liveness group=`livenessState`, `/actuator/prometheus` 노출이 설정되어 있다.
- 다만 [brainX_back/Ingestion-Service/src/main/java/com/brainx/ingestion/config/SecurityConfig.java](/C:/Edu/0_Final_Project/brainX_2/BrainX/brainX_back/Ingestion-Service/src/main/java/com/brainx/ingestion/config/SecurityConfig.java)는 현재 `/actuator/health`와 `/actuator/prometheus`만 `permitAll`이라 `/actuator/health/readiness`, `/actuator/health/liveness` probe는 401 가능성이 있다.
- Compose에서 이미 `SPRING_DATASOURCE_HIKARI_MAXIMUM_POOL_SIZE=3`, `SPRING_DATASOURCE_HIKARI_MINIMUM_IDLE=1`로 낮춘 운영 메모리가 있으므로 K8s ConfigMap에도 같은 값을 유지한다.

Kubernetes 준비 매니페스트의 연결 방식:

- Eureka: `http://discovery-service:8761/eureka/`
- Postgres: `host.docker.internal:5432` (DB `brainx_ingestion`)
- Workspace-Service: `http://host.docker.internal:8082`
- Kafka: `host.docker.internal:9093` (k8s Pod 전용 `K8S` 리스너, EXTERNAL `localhost:9092`와 별도)
- JWT 시크릿: `gateway-secret`의 `JWT_SECRET` 재사용
- Postgres 계정: `postgres-secret`의 `POSTGRES_USER`, `POSTGRES_PASSWORD` 재사용
- Notion OAuth: `ingestion-service-secret`의 `NOTION_CLIENT_ID`, `NOTION_CLIENT_SECRET`

ConfigMap/Secret 분리:

- 비민감 env(`SERVER_PORT`, `POSTGRES_HOST`/`POSTGRES_PORT`/`INGESTION_DB_NAME`, Hikari 제한, `WORKSPACE_SERVICE_URL`, `SPRING_KAFKA_BOOTSTRAP_SERVERS`, Eureka URL/hostname, `CDN_BASE_URL`, `ASSET_STORAGE_DIR`, `ASSET_MAX_SIZE_BYTES`, `NOTION_REDIRECT_URI`, `BRAINX_EVENTS_PRODUCER_ENABLED`)는 `ingestion-service-config` ConfigMap으로 분리한다.
- 민감값은 `postgres-secret`, `gateway-secret`, `ingestion-service-secret`에서만 주입한다.

Secret 준비:

```powershell
Copy-Item .\k8s\secrets\ingestion-service-secret.example.yaml .\k8s\secrets\ingestion-service-secret.yaml
```

- `ingestion-service-secret.yaml`
  - `NOTION_CLIENT_ID`
  - `NOTION_CLIENT_SECRET`

적용/검증(참고):

```powershell
kubectl apply -f .\k8s\secrets\ingestion-service-secret.yaml
kubectl apply -f .\k8s\apps\ingestion-service-configmap.yaml
kubectl apply -f .\k8s\apps\ingestion-service.yaml
kubectl -n brainx port-forward svc/ingestion-service 18083:8083
```

- Ingestion Health: `http://localhost:18083/actuator/health`
- Ingestion Prometheus: `http://localhost:18083/actuator/prometheus`

주의:

- asset storage는 현재 `emptyDir`라 Pod 재생성 시 업로드/변환 산출물이 사라진다. 로컬 검증 준비 범위에서는 Compose named volume을 대체하지 않는다.
- `host.docker.internal` 경로는 Docker Desktop Kubernetes 로컬 검증에서만 유효하다.
- 기능 코드 수정 금지 범위라 probe는 현재 공개된 `/actuator/health`를 기준으로 구성했다. 보안 설정을 바꾸지 않으면 `/actuator/health/readiness`, `/actuator/health/liveness`는 401이 날 수 있다.
- `.\k8s.ps1 ingestion`은 `ingestion-service-secret`과 `ingestion-service-configmap.yaml` 존재를 함께 확인한다.

## Intelligence-Service 전환 메모

Compose 기준 Intelligence-Service 설정 요약:

- build context: `./Intelligence-Service`
- port: `8086`
- depends_on: `discovery-service`, `postgres`, `redis`, `qdrant`, `kafka`
- healthcheck: Compose는 `/actuator/health`

`application.yaml` 기준:

- [brainX_back/Intelligence-Service/src/main/resources/application.yaml](/C:/Edu/0_Final_Project/brainX_2/BrainX/brainX_back/Intelligence-Service/src/main/resources/application.yaml) 기준으로 Postgres, Redis, Kafka, Qdrant, Workspace-Service, Commerce-Service, OpenAI, Eureka, JWT, service token, actuator probe를 모두 환경 변수로 주입할 수 있다.
- readiness/liveness group이 이미 정의되어 있어 K8s probe는 `/actuator/health/readiness`, `/actuator/health/liveness`를 그대로 사용해도 된다.
- Compose에서 이미 `SPRING_DATASOURCE_HIKARI_MAXIMUM_POOL_SIZE=3`, `SPRING_DATASOURCE_HIKARI_MINIMUM_IDLE=1`로 낮춘 운영 메모리가 있으므로 K8s ConfigMap에도 같은 값을 유지한다.

필수 Secret:

- Postgres 계정: `postgres-secret`의 `POSTGRES_USER`, `POSTGRES_PASSWORD`
- Gateway 공유 토큰/JWT: `gateway-secret`의 `SERVICE_TOKEN`, `JWT_SECRET`
- OpenAI/Qdrant: `intelligence-service-secret`의 `OPENAI_API_KEY`, `QDRANT_API_KEY`

ConfigMap/Secret 분리:

- 비민감 env(`SERVER_PORT`, `SPRING_DATASOURCE_URL`, Hikari 제한, `REDIS_HOST`/`REDIS_PORT`/`REDIS_TIMEOUT`, `KAFKA_BOOTSTRAP_SERVERS`/`SPRING_KAFKA_BOOTSTRAP_SERVERS`, `BRAINX_EVENTS_*`, OpenAI model 선택값, `BRAINX_EXTERNAL_SEARCH_*`, `QDRANT_HOST`/`QDRANT_GRPC_PORT`/`QDRANT_COLLECTION`, Workspace/Commerce base URL, Eureka URL/hostname, repair 플래그)는 `intelligence-service-config` ConfigMap으로 분리한다.
- 민감값은 `postgres-secret`, `gateway-secret`, `intelligence-service-secret`에서만 주입한다.
- Workspace-Service는 이미 Kubernetes 검증이 끝났으므로 in-cluster `http://workspace-service:8082`를 사용하고, Commerce-Service와 Compose 유지 인프라(Postgres/Redis/Kafka/Qdrant)는 `host.docker.internal`로 둔다.

Secret example 생성:

```powershell
Copy-Item .\k8s\secrets\intelligence-service-secret.example.yaml .\k8s\secrets\intelligence-service-secret.yaml
```

생성 후 채워야 할 키:

- `intelligence-service-secret.yaml`
  - `OPENAI_API_KEY`
  - `QDRANT_API_KEY` (로컬 Compose Qdrant 무인증이면 빈 문자열 가능)

예상 apply 순서:

```powershell
kubectl apply -f .\k8s\secrets\intelligence-service-secret.yaml
kubectl apply -f .\k8s\apps\intelligence-service-configmap.yaml
kubectl apply -f .\k8s\apps\intelligence-service.yaml
kubectl -n brainx port-forward svc/intelligence-service 18086:8086
```

검증 포인트:

- Readiness: `http://localhost:18086/actuator/health/readiness`
- Liveness: `http://localhost:18086/actuator/health/liveness`
- Prometheus: `http://localhost:18086/actuator/prometheus`

주의사항:

- 현재 Gateway 정적 매핑은 여전히 `intelligence-service -> http://host.docker.internal:8086`이다. 따라서 이번 단계의 정상 검증 기준은 `svc/intelligence-service` 또는 `port-forward` direct 호출이며, Gateway cutover는 별도 작업이다.
- `OPENAI_API_KEY`가 비어 있으면 Pod는 떠도 chat/assist/search/cluster/insight 계열 기능은 런타임 실패가 날 수 있다.
- `QDRANT_API_KEY`는 로컬 Compose Qdrant가 무인증이면 비워 둘 수 있지만, 운영형 Qdrant 인증을 쓴다면 실제 값으로 채워야 한다.
- `.\k8s.ps1 intelligence`는 `intelligence-service-secret`과 `intelligence-service-configmap.yaml` 존재를 함께 확인한다.

## Commerce-Service 전환 메모

Compose 기준 Commerce-Service 설정 요약:

- build context: `./Commerce-Service`
- port: `8084:8084`
- depends_on: `discovery-service`, `postgres`, `kafka`
- healthcheck: 없음

구성 분석:

- [brainX_back/Commerce-Service/src/main/resources/application.yml](/C:/Edu/0_Final_Project/brainX_2/BrainX/brainX_back/Commerce-Service/src/main/resources/application.yml) 기준으로 Postgres, Kafka, Eureka, `PUBLIC_BASE_URL`, Toss key/url, `SERVICE_TOKEN`, `JWT_SECRET`, 이벤트 플래그를 모두 환경 변수로 주입할 수 있다.
- 같은 `application.yml`에서 `management.endpoint.health.probes.enabled=true`, readiness group=`readinessState,db`, liveness group=`livenessState`, `/actuator/prometheus` 노출이 설정되어 있다.
- 다만 [brainX_back/Commerce-Service/src/main/java/com/brainx/commerce/config/SecurityConfig.java](/C:/Edu/0_Final_Project/brainX_2/BrainX/brainX_back/Commerce-Service/src/main/java/com/brainx/commerce/config/SecurityConfig.java)는 현재 `/actuator/health`와 `/actuator/prometheus`만 `permitAll`이라 `/actuator/health/readiness`, `/actuator/health/liveness` probe는 401 가능성이 있다.
- Compose에서 이미 `SPRING_DATASOURCE_HIKARI_MAXIMUM_POOL_SIZE=3`, `SPRING_DATASOURCE_HIKARI_MINIMUM_IDLE=1`로 Postgres pool 상한을 낮춰 쓰고 있으므로 K8s ConfigMap에도 같은 값을 유지한다.

Kubernetes 준비 매니페스트의 연결 방식:

- Eureka: `http://discovery-service:8761/eureka/`
- Postgres: `host.docker.internal:5432` (DB `brainx_commerce`)
- Kafka: `host.docker.internal:9093` (k8s Pod 전용 `K8S` 리스너, EXTERNAL `localhost:9092`와 별도)
- Postgres 계정: `postgres-secret`의 `POSTGRES_USER`, `POSTGRES_PASSWORD` 재사용
- Service Token: `gateway-secret`의 `SERVICE_TOKEN` 재사용
- JWT/Toss key: `commerce-service-secret`의 `JWT_SECRET`, `TOSS_CLIENT_KEY`, `TOSS_SECRET_KEY`

ConfigMap/Secret 분리:

- 비민감 env(`SERVER_PORT`, `PUBLIC_BASE_URL`, `POSTGRES_HOST`/`POSTGRES_PORT`/`COMMERCE_DB_NAME`, Hikari 제한, `SPRING_KAFKA_BOOTSTRAP_SERVERS`, Eureka URL/hostname, `BRAINX_EVENTS_CONSUMER_ENABLED`, `BRAINX_EVENTS_OUTBOX_ENABLED`, `TOSS_CONFIRM_URL`, `TOSS_CANCEL_URL`)는 `commerce-service-config` ConfigMap으로 분리한다.
- 민감값은 `postgres-secret`, `gateway-secret`, `commerce-service-secret`에서만 주입한다.

Secret 준비:

```powershell
Copy-Item .\k8s\secrets\commerce-service-secret.example.yaml .\k8s\secrets\commerce-service-secret.yaml
```

- `commerce-service-secret.yaml`
  - `JWT_SECRET`
  - `TOSS_CLIENT_KEY`
  - `TOSS_SECRET_KEY`

적용/검증(참고):

```powershell
kubectl apply -f .\k8s\secrets\commerce-service-secret.yaml
kubectl apply -f .\k8s\apps\commerce-service.yaml
kubectl -n brainx port-forward svc/commerce-service 18084:8084
```

- Commerce Health: `http://localhost:18084/actuator/health`
- Commerce Prometheus: `http://localhost:18084/actuator/prometheus`

주의:

- 기능 코드 수정 금지 범위라 probe는 현재 공개된 `/actuator/health`를 기준으로 `startup`, `readiness`, `liveness`를 모두 구성했다.
- `TOSS_CLIENT_KEY`, `TOSS_SECRET_KEY`는 실제 Secret 파일에만 채우고 저장소에는 example 파일만 둔다.
- `host.docker.internal` 경로는 Docker Desktop Kubernetes 로컬 검증에서만 유효하다.
- `.\k8s.ps1 commerce`는 `commerce-service-secret` 존재를 apply 전에 먼저 검사한다.

## Mcp-Service 전환 메모

Compose 기준 Mcp-Service 설정 요약:

- build context: `./Mcp-Service`
- port: `8087:8087`
- depends_on: `discovery-service`, `postgres`, `workspace-service`, `intelligence-service`
- healthcheck: `wget -qO- http://localhost:8087/actuator/health | grep -q UP`

구성 분석:

- [brainX_back/Mcp-Service/src/main/resources/application.yaml](/C:/Edu/0_Final_Project/brainX_2/BrainX/brainX_back/Mcp-Service/src/main/resources/application.yaml) 기준으로 Postgres, Eureka, Workspace-Service, Intelligence-Service, MCP OAuth 공개 URL, API key prefix, `JWT_SECRET`, `SERVICE_TOKEN`을 모두 환경 변수로 주입할 수 있다.
- 같은 `application.yaml`에서 `brainx.oauth.issuer`, `brainx.oauth.resource`, `brainx.oauth.protected-resource-metadata-url`는 각각 `BRAINX_OAUTH_ISSUER`, `BRAINX_MCP_RESOURCE`, `BRAINX_MCP_PROTECTED_RESOURCE_METADATA_URL`를 읽고, 기본 로컬 개발 origin은 `http://localhost:3000`이다.
- [brainX_back/User-Service/src/main/resources/application.yml](/C:/Edu/0_Final_Project/brainX_2/BrainX/brainX_back/User-Service/src/main/resources/application.yml) 기준으로 User-Service도 MCP OAuth token의 `issuer/resource`를 `BRAINX_OAUTH_ISSUER`, `BRAINX_MCP_RESOURCE`에서 읽는다. 따라서 Mcp-Service와 User-Service는 `JWT_SECRET`뿐 아니라 `issuer/resource` 값도 함께 맞아야 한다.
- [brainX_back/Mcp-Service/src/main/java/com/brainx/mcp/security/SecurityConfig.java](/C:/Edu/0_Final_Project/brainX_2/BrainX/brainX_back/Mcp-Service/src/main/java/com/brainx/mcp/security/SecurityConfig.java) 기준으로 `/mcp` 인증 실패 시 `WWW-Authenticate`의 `resource_metadata`가 `BRAINX_MCP_PROTECTED_RESOURCE_METADATA_URL`로 내려간다. 이 값이 실제 공개 origin과 다르면 MCP OAuth discovery가 깨진다.

Kubernetes 준비 매니페스트의 연결 방식:

- Eureka: `http://discovery-service:8761/eureka/`
- Postgres: `host.docker.internal:5432` (DB `brainx_mcp`)
- Workspace-Service: `http://host.docker.internal:8082`
- Intelligence-Service: `http://host.docker.internal:8086`
- Postgres 계정: `postgres-secret`의 `POSTGRES_USER`, `POSTGRES_PASSWORD` (기존 Secret 재사용)
- Service Token: `gateway-secret`의 `SERVICE_TOKEN` (기존 Secret 재사용)
- JWT 시크릿: `mcp-service-secret`의 `JWT_SECRET` (신규 Secret)
- 로컬 공개 origin: `http://localhost:3000`, resource=`http://localhost:3000/mcp`

ConfigMap/Secret 분리:

- 비민감 env(`SERVER_PORT`, `POSTGRES_HOST`/`POSTGRES_PORT`/`MCP_DB_NAME`, Eureka URL/hostname, `PUBLIC_BASE_URL`, `BRAINX_OAUTH_ISSUER`, `BRAINX_MCP_RESOURCE`, `BRAINX_MCP_PROTECTED_RESOURCE_METADATA_URL`, downstream URL, timeout, API key prefix)는 `mcp-service-config` ConfigMap으로 분리해 `envFrom`으로 주입한다.
- 민감값(Postgres 계정, `SERVICE_TOKEN`, `JWT_SECRET`)만 `secretKeyRef`로 주입한다.

Secret 준비:

```powershell
Copy-Item .\k8s\secrets\mcp-service-secret.example.yaml .\k8s\secrets\mcp-service-secret.yaml
```

- `mcp-service-secret.yaml`
  - `JWT_SECRET`: Gateway-Service, User-Service, Workspace-Service, Admin-Service, Mcp-Service가 공통으로 쓰는 실제 서명 시크릿
- example 파일만 Git 추적 대상이며 실제 `mcp-service-secret.yaml`은 `.gitignore`(`k8s/secrets/*.yaml`)로 제외된다.

적용/검증(참고):

```powershell
kubectl apply -f .\k8s\secrets\mcp-service-secret.yaml
kubectl apply -f .\k8s\apps\mcp-service-configmap.yaml
kubectl apply -f .\k8s\apps\mcp-service.yaml
kubectl -n brainx port-forward svc/mcp-service 18087:8087
```

`mcp-service.yaml`은 `envFrom`으로 `mcp-service-config` ConfigMap을 참조하므로, `mcp-service-configmap.yaml`을 먼저(또는 같이) apply해야 한다. `.\k8s.ps1 mcp`를 쓰면 이 ConfigMap apply까지 자동으로 처리된다.

- MCP Health: `http://localhost:18087/actuator/health`
- MCP Whoami: `http://localhost:18087/api/v1/mcp/whoami`

주의:

- 현재 `k8s/apps/mcp-service-configmap.yaml`의 OAuth 공개 origin은 로컬 검증 기준 `http://localhost:3000`으로 맞췄다. 비로컬/실운영 apply 전에는 User-Service와 Mcp-Service 양쪽에 동일한 실제 공개 origin으로 함께 바꿔야 한다.
- `JWT_SECRET` 값이 User-Service(및 Gateway-Service)와 다르면 `/mcp`와 `GET /api/v1/mcp/whoami`의 OAuth access token 검증이 실패한다.
- `BRAINX_OAUTH_ISSUER` 또는 `BRAINX_MCP_RESOURCE`가 User-Service 발급값과 다르면 서명키가 같아도 token `iss/resource` 검증이 실패한다.
- `gateway-service`는 아직 `mcp-service -> http://host.docker.internal:8087` 정적 매핑을 사용한다. 따라서 Mcp-Service를 Kubernetes에 적용해도 Gateway 경유 트래픽은 즉시 새 Pod로 넘어가지 않는다.
- 단계적 전환은 `1) mcp-service` direct 검증 -> `2) gateway-service`의 `mcp-service` 정적 매핑을 `http://mcp-service:8087`로 전환 -> `3) Compose mcp-service` 중단 순서가 안전하다.
- `host.docker.internal` 경로는 Docker Desktop Kubernetes 로컬 검증에서만 유효하며 다른 Kubernetes 환경에서는 그대로 동작하지 않는다.

## 후속 전환 순서

권장 순서:

1. `Discovery-Service`
2. `Gateway-Service`
3. `User-Service`
4. `Admin-Service`
5. `Commerce-Service`
6. `Mcp-Service`
7. `Workspace-Service`

정리:

- `Gateway-Service`는 전체 진입점이지만, 정적 discovery 매핑을 쓰면 로컬 준비 자체는 가능하다. 다만 운영형 전환으로 보기는 어렵다.
- `User-Service`는 DB 와 Redis 가 필요하지만, Workspace-Service 호출은 best-effort 이므로 로컬 Docker Desktop 환경에서는 비교적 분리된 검증이 가능하다.
- `Admin-Service`는 DB 와 Kafka, Gateway, 다른 앱 서비스 상태를 참조하므로 완전 독립적이지 않다. 다만 로컬 Docker Desktop 환경에서는 `host.docker.internal` 경유로 준비 가능하다.
- `Commerce-Service`는 DB 와 Kafka 가 필요하지만, 로컬 Docker Desktop 환경에서는 `host.docker.internal` 경유로 비교적 단순하게 분리 검증할 수 있다.
- `Mcp-Service`는 stateless 이지만 Postgres, Workspace, Intelligence, OAuth 설정 의존성이 있어 Gateway 이후가 적절하다.
- `Workspace-Service`는 핵심 비즈니스 및 데이터 의존성이 커서 후순위가 안전하다.
- 완전한 Gateway 전환은 결국 Compose 대상 서비스들의 Discovery 전략까지 함께 정리된 뒤에 진행하는 것이 안전하다.

## Monitoring 로컬 검증 메모

현재 `k8s/monitoring/*`은 Docker Desktop 기반 로컬 검증용 준비 자산이다.

- `prometheus-configmap.yaml`의 active scrape 대상은 현재 `brainx` namespace에 Service가 준비되고 `/actuator/prometheus`를 실제로 노출하는 `user-service`, `gateway-service`, `admin-service`, `workspace-service`, `commerce-service`를 포함한다.
- `mcp-service`는 Service는 있지만 `management.endpoints.web.exposure.include`가 `health,info`뿐이고 `SecurityConfig`도 `/actuator/health`, `/actuator/info`만 허용해 `/actuator/prometheus`를 노출하지 않는다. 그래서 scrape job은 주석 처리로 비활성화해 뒀다. Mcp-Service가 `micrometer-registry-prometheus`를 추가하고 endpoint를 열면 다시 활성화한다.
- `ingestion-service`, `intelligence-service`는 아직 active scrape 대상이 아니므로 계속 주석 상태로 둔다.
- Grafana admin 계정은 `k8s/secrets/grafana-secret.yaml`에서만 주입하며, 실제 Secret 값은 저장소에 커밋하지 않는다.
- `k8s/monitoring/prometheus.yaml`, `k8s/monitoring/grafana.yaml`의 `emptyDir` 볼륨은 로컬 검증 전용이다. Pod 재생성 시 Prometheus TSDB, Grafana 상태, 임시 dashboard 파일은 모두 사라진다.
- 따라서 현재 목적은 "Pod 기동, Service 연결, Prometheus scrape 설정, Grafana datasource 연결"까지의 로컬 검증이며, 운영 보존성은 아직 범위 밖이다.

실제 apply 전 체크리스트:

- `k8s/secrets/grafana-secret.example.yaml`의 키(`GF_SECURITY_ADMIN_USER`, `GF_SECURITY_ADMIN_PASSWORD`)와 `k8s/monitoring/grafana.yaml`의 `secretKeyRef`가 동일한지 확인
- `brainx` namespace가 먼저 생성되어 있는지 확인
- `user-service`, `gateway-service`, `admin-service`, `workspace-service` Service가 `brainx` namespace에 실제로 존재하는지 확인
- 각 서비스가 `/actuator/prometheus`를 실제로 노출하는지 런타임에서 확인
- `k8s/secrets/grafana-secret.yaml` 실제 파일을 example에서 복사해 만들었는지 확인
- 실제 Secret 파일이 Git 추적 대상에 포함되지 않았는지 확인
- 로컬 검증 환경이 Docker Desktop Kubernetes + `host.docker.internal` 전제인지 확인

적용 순서 예시:

```powershell
kubectl apply -f .\k8s\namespace.yaml
kubectl apply -f .\k8s\monitoring\prometheus-configmap.yaml
kubectl apply -f .\k8s\monitoring\prometheus.yaml
kubectl apply -f .\k8s\secrets\grafana-secret.yaml
kubectl apply -f .\k8s\monitoring\grafana-configmap.yaml
kubectl apply -f .\k8s\monitoring\grafana.yaml
```

후속 운영 보완 항목:

- PVC 도입으로 Prometheus TSDB와 Grafana 데이터를 영속화
- Grafana dashboard JSON/provisioning 자산을 ConfigMap 또는 파일 자산으로 분리
- Alertmanager 및 알림 채널 구성 추가
- Prometheus Operator 또는 Helm 기반 배포 전략 검토
- 운영 환경용 Service/Secret/Ingress 주소 체계로 `host.docker.internal` 의존성 제거

## Troubleshooting

- Gateway-Service Pod 가 `CrashLoopBackOff` 이고 로그에 `SpringApplicationJsonEnvironmentPostProcessor`, `SPRING_APPLICATION_JSON`, `Unexpected end-of-input` 가 보이면 `k8s/apps/gateway-service.yaml` 의 JSON 닫는 중괄호가 부족한 경우를 먼저 확인한다.
- 이번 수정에서는 `SPRING_APPLICATION_JSON` 마지막 닫는 중괄호를 보강해 유효한 JSON 으로 맞췄다.
- 수정 후에는 `kubectl -n brainx logs deployment/gateway-service` 로 동일 파싱 예외가 사라졌는지 확인한다.
- Secret 적용 전에 Deployment 를 먼저 apply 하면 `secret not found` 또는 환경 변수 주입 실패로 Pod 가 기동하지 않을 수 있다. 이 경우 Secret 을 먼저 apply 한 뒤 Deployment 를 다시 apply 한다.
- 예전 커밋이나 로컬 파일에 서비스 토큰, DB 비밀번호 같은 값이 들어갔던 경우, 파일을 고친 것만으로는 안전하지 않다. 이미 원격 이력에 포함된 값은 반드시 재발급/변경 대상으로 본다.
- User-Service Pod 가 정상 기동했는데 `/actuator/health`, `/actuator/health/readiness`, `/actuator/health/liveness` 가 모두 `401` 을 반환하면 Kubernetes probe 는 계속 실패한다. 원인은 User-Service Security 설정에서 `/actuator/prometheus` 만 공개되어 있고 health endpoint 는 인증이 필요한 상태였기 때문이다.
- 이 경우 [brainX_back/User-Service/src/main/java/brain/web/mvc/config/SecurityConfig.java](/C:/Edu/Final_Project/BrainX/brainX_back/User-Service/src/main/java/brain/web/mvc/config/SecurityConfig.java) 에서 `/actuator/health`, `/actuator/health/readiness`, `/actuator/health/liveness` 만 `permitAll` 로 열고, 다른 `/actuator/**` 나 일반 API 인증 정책은 그대로 유지한다.
- User-Service Kubernetes probe 경로는 [k8s/apps/user-service.yaml](/C:/Edu/Final_Project/BrainX/k8s/apps/user-service.yaml) 기준으로 readiness=`/actuator/health/readiness`, liveness=`/actuator/health/liveness` 이며, [brainX_back/User-Service/src/main/resources/application.yml](/C:/Edu/Final_Project/BrainX/brainX_back/User-Service/src/main/resources/application.yml) 의 health group 설정과 일치해야 한다.
