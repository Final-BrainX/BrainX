# BrainX Kubernetes 1차 전환

## 현재 Kubernetes 적용 범위

- Namespace: `brainx`
- 적용 완료 기준 서비스: `Discovery-Service`
- 준비 완료 매니페스트: `Discovery-Service`, `Admin-Service`, `Gateway-Service`
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
│  └─ gateway-service.yaml
├─ monitoring/
├─ configs/
└─ secrets/
```

## 이미지 빌드

Docker Desktop Kubernetes 로컬 클러스터 기준으로, 먼저 Discovery-Service 이미지를 빌드한다.

```powershell
docker build -t brainx-discovery-service:local .\brainX_back\Discovery-Service
docker build -t brainx-admin-service:local .\brainX_back\Admin-Service
docker build -t brainx-gateway-service:local .\brainX_back\Gateway-Service
```

## kubectl apply

```powershell
kubectl apply -f .\k8s\namespace.yaml
kubectl apply -f .\k8s\apps\discovery-service.yaml
kubectl apply -f .\k8s\apps\admin-service.yaml
kubectl apply -f .\k8s\apps\gateway-service.yaml
```

## 리소스 삭제

```powershell
kubectl delete -f .\k8s\apps\discovery-service.yaml
kubectl delete -f .\k8s\apps\admin-service.yaml
kubectl delete -f .\k8s\apps\gateway-service.yaml
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
```

## port-forward

기존 Docker Compose 의 `8761` 포트와 충돌하지 않도록 로컬 포트 `18761` 사용을 권장한다.

```powershell
kubectl -n brainx port-forward svc/discovery-service 18761:8761
kubectl -n brainx port-forward svc/admin-service 18085:8085
kubectl -n brainx port-forward svc/gateway-service 18088:8088
```

확인 주소:

- Eureka UI: `http://localhost:18761`
- Health: `http://localhost:18761/actuator/health`
- Admin Health: `http://localhost:18085/actuator/health`
- Gateway Health: `http://localhost:18088/actuator/health`

## 로그 보기

```powershell
kubectl -n brainx logs deployment/discovery-service
kubectl -n brainx logs -f deployment/discovery-service
kubectl -n brainx logs deployment/admin-service
kubectl -n brainx logs -f deployment/admin-service
kubectl -n brainx logs deployment/gateway-service
kubectl -n brainx logs -f deployment/gateway-service
```

## 자동 복구 확인

현재 Pod 이름 확인:

```powershell
kubectl -n brainx get pods -l app=discovery-service
kubectl -n brainx get pods -l app=admin-service
kubectl -n brainx get pods -l app=gateway-service
```

Pod 하나 삭제:

```powershell
kubectl -n brainx delete pod -l app=discovery-service
kubectl -n brainx delete pod -l app=admin-service
kubectl -n brainx delete pod -l app=gateway-service
```

복구 확인:

```powershell
kubectl -n brainx get pods -w
```

## Docker Compose와 병행 실행

- 기존 `brainX_back/docker-compose.yml`은 수정하지 않는다.
- 현재 적용 완료 기준으로는 Kubernetes 에 `Discovery-Service`를 올리고, DB/Redis/Neo4j/Qdrant/Kafka 및 나머지 앱 서비스는 기존 Compose 로 유지한다.
- `Admin-Service` 매니페스트는 준비 단계이며, 적용 시에도 상태 저장 인프라와 관련 앱 서비스는 계속 Compose 로 유지한다.
- `Gateway-Service` 매니페스트도 준비 단계이며, 적용 시 라우팅 대상 앱 서비스는 계속 Compose 로 유지한다.
- Compose 쪽 `discovery-service`와 동시에 접근 테스트를 해야 하면 `kubectl port-forward` 로 다른 로컬 포트를 사용한다.
- `Admin-Service`를 Kubernetes 에서 띄울 때는 Compose 서비스명을 직접 해석하지 않고 `host.docker.internal` 을 통해 호스트에 publish 된 Compose 포트로 접속한다.
- `Gateway-Service`는 코드의 `lb://...` 라우트를 유지하되, Kubernetes 매니페스트에서만 Spring Simple Discovery 정적 인스턴스를 주입해 `host.docker.internal:<port>` 로 Compose 서비스를 바라보게 한다.
- 따라서 이 방식은 Docker Desktop Kubernetes 로컬 검증 전용이며, Linux bare-metal Kubernetes 나 운영 클러스터 주소 체계와는 다르다.
- 운영 환경이나 EC2 배포 구성은 이번 범위에 포함하지 않는다.

## 실행 순서 예시

1. 기존 Docker Compose 환경이 필요하면 평소처럼 실행한다.
2. Admin-Service 를 검증할 때는 Compose 의 `postgres`, `kafka`, `gateway-service` 와 관련 앱 서비스들이 먼저 떠 있어야 한다.
3. Gateway-Service 를 검증할 때는 Compose 의 `user-service`, `workspace-service`, `ingestion-service`, `commerce-service`, `admin-service`, `intelligence-service`, `mcp-service` 가 먼저 떠 있어야 한다.
4. Discovery-Service, Admin-Service, Gateway-Service 이미지를 로컬에 빌드한다.
5. `namespace.yaml`, `apps/discovery-service.yaml`, `apps/admin-service.yaml`, `apps/gateway-service.yaml` 을 apply 한다.
6. Pod Ready 확인 후 `port-forward` 로 상태를 검증한다.

## Admin-Service 전환 메모

Compose 기준 Admin-Service 설정 요약:

- build context: `./Admin-Service`
- port: `8085:8085`
- depends_on: `discovery-service`, `postgres`, `gateway-service`, `kafka`
- healthcheck: `wget -qO- http://localhost:8085/actuator/health | grep -q UP`

Kubernetes 준비 매니페스트의 연결 방식:

- Eureka: `http://discovery-service:8761/eureka/`
- Postgres: `host.docker.internal:5432`
- Kafka: `host.docker.internal:9092`
- Gateway 및 나머지 앱 서비스: `host.docker.internal` + Compose publish 포트

주의:

- Admin-Service 자체는 stateless 가 아니고 Postgres/Kafka/Gateway/다른 앱 서비스 상태에 강하게 의존한다.
- 이번 매니페스트는 "Admin-Service Pod 를 Kubernetes 에서 띄울 수 있는지" 확인하는 로컬 준비 단계다.
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
- `host.docker.internal` 경로는 Docker Desktop 에서는 유효하지만 모든 Kubernetes 환경에서 동일하게 동작하지 않는다.
- Compose 의 대상 앱 서비스 중 하나라도 내려가 있으면 해당 라우트만 5xx/fallback 으로 보일 수 있다.

## 후속 전환 순서

권장 순서:

1. `Discovery-Service`
2. `Admin-Service`
3. `Gateway-Service`
4. `Mcp-Service`
5. `User-Service`
6. `Workspace-Service`

정리:

- `Admin-Service`는 DB 와 Kafka, Gateway, 다른 앱 서비스 상태를 참조하므로 완전 독립적이지 않다. 다만 로컬 Docker Desktop 환경에서는 `host.docker.internal` 경유로 준비 가능하다.
- `Gateway-Service`는 전체 진입점이지만, 정적 discovery 매핑을 쓰면 로컬 준비 자체는 가능하다. 다만 운영형 전환으로 보기는 어렵다.
- `Mcp-Service`는 stateless 이지만 Postgres, Workspace, Intelligence, OAuth 설정 의존성이 있어 Gateway 이후가 적절하다.
- `User-Service`와 `Workspace-Service`는 핵심 비즈니스 및 데이터 의존성이 커서 후순위가 안전하다.
- 완전한 Gateway 전환은 결국 Compose 대상 서비스들의 Discovery 전략까지 함께 정리된 뒤에 진행하는 것이 안전하다.

## Troubleshooting

- Gateway-Service Pod 가 `CrashLoopBackOff` 이고 로그에 `SpringApplicationJsonEnvironmentPostProcessor`, `SPRING_APPLICATION_JSON`, `Unexpected end-of-input` 가 보이면 `k8s/apps/gateway-service.yaml` 의 JSON 닫는 중괄호가 부족한 경우를 먼저 확인한다.
- 이번 수정에서는 `SPRING_APPLICATION_JSON` 마지막 닫는 중괄호를 보강해 유효한 JSON 으로 맞췄다.
- 수정 후에는 `kubectl -n brainx logs deployment/gateway-service` 로 동일 파싱 예외가 사라졌는지 확인한다.
