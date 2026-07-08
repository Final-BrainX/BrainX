# BrainX Kubernetes 1차 전환

## 현재 Kubernetes 적용 범위

- Namespace: `brainx`
- 1차 전환 서비스: `Discovery-Service`
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
- 나머지 애플리케이션 서비스 전체

## 프로젝트 구조

```text
k8s/
├─ README.md
├─ namespace.yaml
├─ apps/
│  └─ discovery-service.yaml
├─ monitoring/
├─ configs/
└─ secrets/
```

## 이미지 빌드

Docker Desktop Kubernetes 로컬 클러스터 기준으로, 먼저 Discovery-Service 이미지를 빌드한다.

```powershell
docker build -t brainx-discovery-service:local .\brainX_back\Discovery-Service
```

## kubectl apply

```powershell
kubectl apply -f .\k8s\namespace.yaml
kubectl apply -f .\k8s\apps\discovery-service.yaml
```

## 리소스 삭제

```powershell
kubectl delete -f .\k8s\apps\discovery-service.yaml
kubectl delete -f .\k8s\namespace.yaml
```

Namespace 전체를 지우면 이후 추가한 다른 Kubernetes 리소스도 함께 삭제되므로 주의한다.

## Pod 확인

```powershell
kubectl -n brainx get all
kubectl -n brainx get pods
kubectl -n brainx describe pod -l app=discovery-service
```

## port-forward

기존 Docker Compose 의 `8761` 포트와 충돌하지 않도록 로컬 포트 `18761` 사용을 권장한다.

```powershell
kubectl -n brainx port-forward svc/discovery-service 18761:8761
```

확인 주소:

- Eureka UI: `http://localhost:18761`
- Health: `http://localhost:18761/actuator/health`

## 로그 보기

```powershell
kubectl -n brainx logs deployment/discovery-service
kubectl -n brainx logs -f deployment/discovery-service
```

## 자동 복구 확인

현재 Pod 이름 확인:

```powershell
kubectl -n brainx get pods -l app=discovery-service
```

Pod 하나 삭제:

```powershell
kubectl -n brainx delete pod -l app=discovery-service
```

복구 확인:

```powershell
kubectl -n brainx get pods -w
```

## Docker Compose와 병행 실행

- 기존 `brainX_back/docker-compose.yml`은 수정하지 않는다.
- 1차에서는 Kubernetes 에 `Discovery-Service`만 올리고, DB/Redis/Neo4j/Qdrant/Kafka 및 나머지 앱 서비스는 기존 Compose 로 유지한다.
- Compose 쪽 `discovery-service`와 동시에 접근 테스트를 해야 하면 `kubectl port-forward` 로 다른 로컬 포트를 사용한다.
- 운영 환경이나 EC2 배포 구성은 이번 범위에 포함하지 않는다.

## 실행 순서 예시

1. 기존 Docker Compose 환경이 필요하면 평소처럼 실행한다.
2. Discovery-Service 이미지를 로컬에 빌드한다.
3. `namespace.yaml` 과 `apps/discovery-service.yaml` 을 apply 한다.
4. Pod Ready 확인 후 `port-forward` 로 상태를 검증한다.

## 후속 전환 순서

권장 순서:

1. `Discovery-Service`
2. `Mcp-Service`
3. `Admin-Service`
4. `User-Service`
5. `Workspace-Service`
6. `Gateway-Service`

정리:

- `Mcp-Service`는 stateless 이지만 Postgres, Workspace, Intelligence, OAuth 설정 의존성이 있어 2순위가 적절하다.
- `Admin-Service`는 DB 와 여러 서비스 health 의존성이 있어 Discovery 이후가 적절하다.
- `User-Service`와 `Workspace-Service`는 핵심 비즈니스 및 데이터 의존성이 커서 후순위가 안전하다.
- `Gateway-Service`는 전체 진입점이므로 마지막 단계에서 전환한다.
