# BrainX Kubernetes Troubleshooting

이 문서는 BrainX Kubernetes 전환(Docker Desktop Kubernetes + `host.docker.internal` 기반 로컬 검증 환경) 과정에서 실제로 겪은 문제들을 사례별로 정리한 상세 가이드다.

- 대상 범위: `k8s/` 매니페스트 기반 로컬 검증 중 발생한 실제 장애 사례와 원인 분석
- 비대상 범위: 최초 설치/셋업 절차([SETUP.md](SETUP.md)), 서비스별 구성 개요([README.md](README.md))
- 사용법: 증상이 비슷한 항목을 찾아 확인 명령어부터 그대로 실행해 원인을 좁힌다.

이 문서는 매니페스트나 기능 코드를 수정하지 않는다. 문제 해결을 위한 실제 조치는 각 항목의 "해결 방법"을 참고해 별도로 적용한다.

## 목차

1. [SPRING_APPLICATION_JSON 중괄호 누락으로 Gateway CrashLoopBackOff](#1-spring_application_json-중괄호-누락으로-gateway-crashloopbackoff)
2. [Secret 누락으로 CreateContainerConfigError](#2-secret-누락으로-createcontainerconfigerror)
3. [Postgres 비밀번호 불일치로 User CrashLoopBackOff](#3-postgres-비밀번호-불일치로-user-crashloopbackoff)
4. [Actuator health 401로 readiness/liveness 실패](#4-actuator-health-401로-readinessliveness-실패)
5. [port-forward 포트 충돌](#5-port-forward-포트-충돌)
6. [Docker Desktop Kubernetes와 Compose 혼합 환경에서 host.docker.internal 이슈](#6-docker-desktop-kubernetes와-compose-혼합-환경에서-hostdockerinternal-이슈)
7. [ImagePullBackOff](#7-imagepullbackoff)
8. [rollout restart 후 old replica pending termination](#8-rollout-restart-후-old-replica-pending-termination)
9. [Postgres too many clients로 rollout 중 신규 Pod CrashLoopBackOff](#9-postgres-too-many-clients로-rollout-중-신규-pod-crashloopbackoff)

---

## 1. SPRING_APPLICATION_JSON 중괄호 누락으로 Gateway CrashLoopBackOff

### 증상

- `gateway-service` Pod가 `CrashLoopBackOff` 상태를 반복한다.
- 로그에 `SpringApplicationJsonEnvironmentPostProcessor`, `SPRING_APPLICATION_JSON`, `Unexpected end-of-input` 등의 문구가 보인다.

### 확인 명령어

```powershell
kubectl -n brainx get pods -l app=gateway-service
kubectl -n brainx logs deployment/gateway-service
kubectl -n brainx logs deployment/gateway-service --previous
```

### 원인

- `k8s/apps/gateway-service.yaml`의 `SPRING_APPLICATION_JSON` 환경 변수 값이 유효하지 않은 JSON이었다.
- 특히 마지막 닫는 중괄호(`}`)가 하나 누락되어 있었고, Spring Boot의 `SpringApplicationJsonEnvironmentPostProcessor`가 이 값을 파싱하는 시점에 애플리케이션 컨텍스트 생성 자체가 실패했다.
- YAML 문법 자체는 깨지지 않기 때문에 `kubectl apply`는 성공하지만, 컨테이너 기동 직후 JSON 파싱 예외로 즉시 종료되어 `CrashLoopBackOff`로 이어진다.

### 해결 방법

1. `kubectl logs`에서 `Unexpected end-of-input` 등 JSON 파싱 예외 스택트레이스를 확인해 파싱 실패임을 먼저 확정한다.
2. `k8s/apps/gateway-service.yaml`의 `SPRING_APPLICATION_JSON` 문자열을 별도 편집기나 JSON 검증 도구에 붙여 넣어 중괄호/쉼표 짝이 맞는지 확인한다.
3. 닫는 중괄호를 보강해 유효한 JSON으로 맞춘 뒤 `kubectl apply -f .\k8s\apps\gateway-service.yaml`로 재적용한다.
4. `kubectl -n brainx rollout status deployment/gateway-service`로 rollout이 끝까지 진행되는지 확인한다.
5. `kubectl -n brainx logs deployment/gateway-service`로 동일 파싱 예외가 더 이상 나타나지 않는지 확인한다.

### 재발 방지

- `SPRING_APPLICATION_JSON`처럼 YAML 안에 JSON을 문자열로 심는 값은 수정할 때마다 JSON 유효성 검증을 먼저 거친다.
- 가능하면 이런 값은 ConfigMap의 개별 key-value 항목(`envFrom`)으로 분리해, JSON 중첩 자체를 피하는 방향을 후속 작업으로 검토한다(`Workspace-Service`/`Mcp-Service`에 이미 적용된 ConfigMap 분리 패턴 참고).
- PR 리뷰 시 `SPRING_APPLICATION_JSON` 등 인라인 JSON 값이 수정된 diff는 별도로 JSON 파서에 붙여 확인하는 것을 체크리스트에 넣는다.

---

## 2. Secret 누락으로 CreateContainerConfigError

### 증상

- Pod 상태가 `Running`으로 올라오지 못하고 `CreateContainerConfigError`로 멈춘다.
- `kubectl describe pod`에 `secret "xxx-secret" not found` 또는 `couldn't find key XXX in Secret` 메시지가 보인다.

### 확인 명령어

```powershell
kubectl -n brainx get pods
kubectl -n brainx describe pod -l app=<service-name>
kubectl -n brainx get secrets
```

### 원인

- Deployment가 `secretKeyRef`로 참조하는 실제 Secret(`gateway-secret`, `postgres-secret`, `workspace-secret`, `mcp-service-secret`, `admin-service-secret` 등)이 아직 apply되지 않은 상태에서 Deployment만 먼저 apply된 경우다.
- 또는 실제 Secret은 존재하지만 example 파일에서 키 이름을 바꿔서 복사해, Deployment가 요구하는 key(`POSTGRES_PASSWORD` 등)와 이름이 어긋난 경우다.
- `k8s/secrets/*.example.yaml`만 Git에 추적되고 실제 `*.yaml` 파일은 로컬에서 직접 생성해야 하므로, 새로 clone한 환경이나 신규 서비스(Workspace/MCP/Admin/Grafana)를 처음 적용할 때 특히 자주 발생한다.

### 해결 방법

1. `kubectl -n brainx describe pod`로 어떤 Secret/키가 없다는 것인지 정확히 확인한다.
2. 해당 서비스에 필요한 example Secret이 실제 파일로 복사되어 있는지 확인한다.

   ```powershell
   Copy-Item .\k8s\secrets\<service>-secret.example.yaml .\k8s\secrets\<service>-secret.yaml
   ```

3. 실제 값을 채운 뒤(`CHANGE_ME` 등 placeholder 제거) Secret을 먼저 apply한다.

   ```powershell
   kubectl apply -f .\k8s\secrets\<service>-secret.yaml
   ```

4. Deployment를 다시 apply하거나 `kubectl -n brainx rollout restart deployment/<service-name>`으로 재기동한다.
5. `kubectl -n brainx get secrets`로 Secret이 존재하는지, `kubectl -n brainx describe pod`로 에러가 사라졌는지 재확인한다.

### 재발 방지

- 항상 "Secret 먼저 apply, Deployment 나중"순서를 지킨다([README.md](README.md), [SETUP.md](SETUP.md)의 권장 순서와 동일).
- `k8s.ps1 <service>` 헬퍼 스크립트를 사용하면 apply 전에 필요한 Secret 존재 여부를 먼저 검사하므로, 신규/재배포 시 가능하면 헬퍼 스크립트를 우선 사용한다.
- 신규 서비스(Workspace/MCP/Admin/Grafana)를 처음 apply하기 전에는 [SETUP.md](SETUP.md)의 "apply 전 체크리스트" 항목을 먼저 확인한다.
- example 파일의 key 이름은 절대 바꾸지 않고, 값만 채운다.

---

## 3. Postgres 비밀번호 불일치로 User CrashLoopBackOff

### 증상

- `user-service` Pod가 `Running`까지는 올라오지만 곧 `CrashLoopBackOff`로 전환된다.
- 로그에 Postgres 인증 실패 관련 메시지(`password authentication failed for user`, `FATAL: password authentication failed`, 또는 HikariCP/DataSource 연결 실패 스택트레이스)가 보인다.

### 확인 명령어

```powershell
kubectl -n brainx logs deployment/user-service
kubectl -n brainx logs deployment/user-service --previous
kubectl -n brainx get secret postgres-secret -o yaml
```

### 원인

- `k8s/secrets/postgres-secret.yaml`에 채운 `POSTGRES_USER`/`POSTGRES_PASSWORD` 값이 Docker Compose로 띄운 실제 Postgres 컨테이너의 계정 정보와 다르다.
- `user-service`는 `host.docker.internal:5432`로 Compose Postgres에 접속하므로, Kubernetes Secret 값과 Compose `postgres` 서비스의 실제 계정이 항상 1:1로 일치해야 한다.
- Compose 쪽 Postgres 비밀번호를 바꿨거나 재생성했는데 Kubernetes Secret은 갱신하지 않은 경우에도 동일 증상이 나타난다.

### 해결 방법

1. 로그에서 인증 실패 메시지를 확인해 "기동 자체 실패"가 아니라 "DB 인증 실패"임을 먼저 확정한다.
2. Compose 쪽 Postgres 실제 계정을 확인한다(`docker-compose.yml`의 `POSTGRES_USER`/`POSTGRES_PASSWORD` 환경 변수, 또는 실제 컨테이너에 접속해 확인).
3. `kubectl -n brainx get secret postgres-secret -o jsonpath="{.data.POSTGRES_PASSWORD}"` 값을 base64 디코드해 현재 Kubernetes에 반영된 값을 확인한다.
4. 두 값이 다르면 `postgres-secret.yaml`을 실제 Compose 계정에 맞춰 수정한 뒤 다시 apply한다.

   ```powershell
   kubectl apply -f .\k8s\secrets\postgres-secret.yaml
   kubectl -n brainx rollout restart deployment/user-service
   ```

5. `kubectl -n brainx logs -f deployment/user-service`로 인증 실패 로그가 사라지고 정상 기동 로그(Eureka 등록, Tomcat 시작 등)가 보이는지 확인한다.

### 재발 방지

- Postgres 계정은 `postgres-secret` 하나만 사용하고, User/Admin/Workspace/MCP 서비스가 모두 이 Secret을 공유하므로 Compose 쪽 계정을 변경할 때는 반드시 이 Secret도 함께 갱신한다.
- Compose Postgres 계정/비밀번호를 변경하는 작업은 별도로 팀에 공지하고, 변경 직후 Kubernetes 쪽 `postgres-secret` 갱신을 같은 작업 단위로 묶는다.
- 이미 원격 이력에 노출된 비밀번호는 Secret 파일만 고쳐도 안전하지 않으므로, 노출 이력이 있다면 재발급을 우선한다.

---

## 4. Actuator health 401로 readiness/liveness 실패

### 증상

- Pod 자체는 `Running`이지만 `READY` 컬럼이 계속 `0/1`이다.
- `kubectl describe pod`의 Events에 readiness/liveness probe 실패, `HTTP probe failed with statuscode: 401`이 보인다.
- port-forward 후 직접 호출해도 `/actuator/health`, `/actuator/health/readiness`, `/actuator/health/liveness`가 모두 `401`을 반환한다.

### 확인 명령어

```powershell
kubectl -n brainx describe pod -l app=user-service
kubectl -n brainx port-forward svc/user-service 18080:8080
curl.exe -i http://localhost:18080/actuator/health
curl.exe -i http://localhost:18080/actuator/health/readiness
curl.exe -i http://localhost:18080/actuator/health/liveness
```

### 원인

- Spring Security 설정에서 `/actuator/prometheus`만 `permitAll`로 열려 있고 `/actuator/health` 계열은 인증이 필요한 상태로 남아 있었다.
- Kubernetes probe는 인증 헤더를 붙이지 않고 호출하므로, health endpoint가 보호되어 있으면 애플리케이션은 정상 기동했어도 probe는 항상 401로 실패해 readiness/liveness가 절대 `Ready`가 되지 않는다.
- `k8s/apps/user-service.yaml`의 probe 경로(`/actuator/health/readiness`, `/actuator/health/liveness`)와 `application.yml`의 health probe group 설정이 이름은 맞아도, Security 설정에서 그 경로 자체가 막혀 있으면 동일 증상이 재현된다.

### 해결 방법

1. port-forward 후 curl로 401이 재현되는지 먼저 확인해 "애플리케이션 미기동"이 아니라 "Security 설정 문제"임을 구분한다.
2. 해당 서비스의 `SecurityConfig`(예: `brainX_back/User-Service/.../SecurityConfig.java`, `brainX_back/Workspace-Service/.../SecurityConfig.java`)에서 `/actuator/health`, `/actuator/health/readiness`, `/actuator/health/liveness` 경로가 `permitAll`인지 확인한다.
3. 위 3개 경로만 `permitAll`로 열고, 다른 `/actuator/**` 엔드포인트나 일반 API 인증 정책은 그대로 유지한다(전체 actuator를 열지 않는다).
4. 애플리케이션 이미지를 다시 빌드하고 `kubectl -n brainx rollout restart deployment/<service-name>`으로 재배포한다.
5. 다시 port-forward로 각 endpoint가 200을 반환하는지, `kubectl -n brainx get pods`에서 `READY`가 `1/1`이 되는지 확인한다.

### 재발 방지

- 새 서비스를 Kubernetes에 올릴 때는 probe 경로와 Security permitAll 목록이 정확히 일치하는지를 apply 전 체크리스트에 항상 포함한다([README.md](README.md)의 User-Service/Workspace-Service 전환 메모 참고).
- Security 설정 변경 PR에서 `/actuator/**` 관련 규칙이 바뀌면, 리뷰어가 readiness/liveness에 사용되는 정확한 경로 목록과 대조하도록 리마인드한다.
- 전체 `/actuator/**`를 `permitAll`로 여는 방식은 지양하고, probe에 필요한 최소 경로만 예외로 둔다.

---

## 5. port-forward 포트 충돌

### 증상

- `kubectl port-forward` 실행 시 `error: unable to listen on port` 또는 `bind: address already in use`가 발생한다.
- 원인이 되는 로컬 포트가 Docker Compose로 이미 publish된 포트(`8761`, `8080`, `8082`, `8085`, `8087`, `8088` 등)와 겹치는 경우가 많다.

### 확인 명령어

```powershell
kubectl -n brainx port-forward svc/discovery-service 8761:8761
netstat -ano | findstr :8761
```

### 원인

- Docker Compose가 이미 같은 포트를 로컬 호스트에 publish하고 있는 상태에서, 동일한 로컬 포트로 Kubernetes Service에 port-forward를 시도했다.
- 여러 터미널에서 같은 서비스에 대해 port-forward를 중복 실행한 경우에도 동일하게 충돌한다.

### 해결 방법

1. 에러 메시지에 나온 포트 번호를 확인하고, 그 포트를 이미 점유 중인 프로세스가 있는지 확인한다.

   ```powershell
   netstat -ano | findstr :<port>
   ```

2. Compose와 겹치지 않는 별도 로컬 포트(예: `18761`, `18080`, `18082`, `18085`, `18087`, `18088`)로 port-forward를 다시 실행한다.

   ```powershell
   kubectl -n brainx port-forward svc/discovery-service 18761:8761
   ```

3. 이미 떠 있는 중복 port-forward 프로세스가 원인이면 해당 터미널/프로세스를 먼저 종료한 뒤 다시 시도한다.

### 재발 방지

- Compose 포트(`8761`, `8080`, `8082`, `8085`, `8087`, `8088` 등)와 겹치지 않도록 Kubernetes 검증용 로컬 포트는 항상 `1` 접두사를 붙인 규칙(`18xxx`)으로 통일한다([README.md](README.md), [SETUP.md](SETUP.md)에 정리된 포트 규칙과 동일하게 유지).
- 같은 서비스에 대해 여러 터미널에서 중복으로 port-forward를 띄우지 않도록, 팀 내에서 서비스별 고정 로컬 포트를 문서에 정해 공유한다.

---

## 6. Docker Desktop Kubernetes와 Compose 혼합 환경에서 host.docker.internal 이슈

### 증상

- Kubernetes Pod는 `Running`이지만 Postgres/Redis/Neo4j/Kafka/다른 앱 서비스 연결이 실패하거나 타임아웃난다.
- Gateway를 통한 라우팅이 특정 서비스에서만 5xx 또는 fallback으로 응답한다.
- readiness는 통과했는데 특정 API 호출 시점에만 다운스트림 연결 실패가 발생한다.

### 확인 명령어

```powershell
kubectl -n brainx logs deployment/<service-name>
docker compose -f .\brainX_back\docker-compose.yml ps
kubectl -n brainx exec -it deployment/<service-name> -- ping host.docker.internal
```

### 원인

- `gateway-service`, `user-service`, `admin-service`, `mcp-service` 등 여러 매니페스트가 Postgres/Redis/Neo4j/Kafka 및 아직 Kubernetes로 전환되지 않은 앱 서비스를 `host.docker.internal`로 바라보도록 구성되어 있다.
- 이 경로는 Docker Desktop Kubernetes 환경에서만 유효한 로컬 전용 구성이며, 대상 Compose 서비스가 다음 중 하나라도 해당하면 연결이 실패한다.
  - 아직 실행되지 않았거나 재시작 중이다.
  - 포트가 호스트에 publish되지 않았다(`ports:` 매핑 누락).
  - Docker Desktop이 아닌 다른 Kubernetes(minikube, 클라우드 클러스터, Linux bare-metal 등) 환경에서 같은 매니페스트를 그대로 적용했다.
- Gateway의 경우 라우팅 대상 서비스 ID와 `host.docker.internal:<port>` 매핑이 코드의 `lb://서비스명`과 대소문자까지 정확히 일치해야 하며, 어긋나면 특정 라우트만 실패한다.

### 해결 방법

1. `docker compose -f .\brainX_back\docker-compose.yml ps`로 대상 서비스가 실제로 `Up` 상태인지 먼저 확인한다.
2. 대상 서비스의 포트가 호스트에 publish되어 있는지(`docker-compose.yml`의 `ports:` 항목) 확인한다.
3. 현재 클러스터가 Docker Desktop Kubernetes인지 확인한다.

   ```powershell
   kubectl config current-context
   ```

4. Gateway 라우팅 문제라면 `k8s/apps/gateway-service.yaml`의 Spring Simple Discovery `instances` key와 `application.yml`의 `lb://서비스명`이 대소문자까지 동일한지 대조한다.
5. 필요한 Compose 서비스를 재기동한 뒤 해당 Kubernetes Deployment를 `rollout restart`로 재기동해 연결을 다시 맺게 한다.

### 재발 방지

- 이 구성은 Docker Desktop Kubernetes 로컬 검증 전용이며 운영/EC2/다른 Kubernetes 환경에는 그대로 이식되지 않는다는 점을 apply 전에 항상 재확인한다([README.md](README.md), [SETUP.md](SETUP.md)에 명시).
- Kubernetes로 전환된 서비스가 늘어날 때마다 `host.docker.internal` 의존 목록을 갱신하고, 어떤 서비스가 아직 Compose에 남아 있는지 최신 상태로 유지한다.
- 장기적으로는 `host.docker.internal` 의존성을 제거하고 Kubernetes Service/DNS 기반으로 전환하는 것을 운영 환경 적용의 선행 조건으로 둔다.

---

## 7. ImagePullBackOff

### 증상

- `kubectl -n brainx get pods`에서 Pod 상태가 `ImagePullBackOff` 또는 `ErrImagePull`로 표시된다.

### 확인 명령어

```powershell
kubectl -n brainx describe pod -l app=<service-name>
docker images | findstr brainx
```

### 원인

- 매니페스트의 `image:` 태그(예: `brainx-user-service:local`)에 해당하는 이미지가 로컬 Docker 엔진에 아직 빌드되어 있지 않다.
- 이미지 이름/태그 오타로 매니페스트와 실제 빌드된 이미지 이름이 다르다.
- Docker Desktop Kubernetes가 아닌 다른 컨텍스트를 보고 있어, 로컬에 빌드한 이미지를 클러스터가 찾지 못한다.

### 해결 방법

1. `docker images`로 매니페스트에 명시된 이름/태그의 이미지가 실제로 존재하는지 확인한다.
2. 없거나 태그가 다르면 매니페스트 기준 태그로 다시 빌드한다.

   ```powershell
   docker build -t brainx-<service>-service:local .\brainX_back\<Service-Name>
   ```

3. `kubectl config current-context`로 현재 컨텍스트가 Docker Desktop Kubernetes인지 확인한다(다른 클러스터를 보고 있으면 로컬 이미지를 인식하지 못한다).
4. Deployment를 다시 apply하거나 `kubectl -n brainx rollout restart deployment/<service-name>`으로 재기동한다.
5. `kubectl -n brainx get pods`에서 상태가 `Running`으로 바뀌는지 확인한다.

### 재발 방지

- `k8s.ps1 <service>` 헬퍼 스크립트를 사용하면 apply 전에 Docker 이미지를 자동으로 빌드하므로, 수동 `docker build`를 잊는 실수를 줄일 수 있다.
- 매니페스트의 `image:` 태그를 변경할 때는 반드시 실제 빌드 명령의 태그와 동시에 맞춘다.
- `imagePullPolicy: IfNotPresent`를 사용하는 로컬 전용 구성이므로, 코드 변경 후 재배포 시 이미지를 새로 빌드하지 않으면 이전 이미지가 그대로 재사용될 수 있다는 점도 함께 인지한다.

---

## 8. rollout restart 후 old replica pending termination

### 증상

- `kubectl -n brainx rollout restart deployment/<service-name>` 실행 후 `kubectl -n brainx get pods`에 이전 Pod와 새 Pod가 동시에 남아 있는 시간이 예상보다 길다.
- 이전 Pod가 `Terminating` 상태에서 오래 머무르거나, 새 Pod가 `Running`인데도 이전 Pod가 바로 사라지지 않는다.

### 확인 명령어

```powershell
kubectl -n brainx get pods -l app=<service-name>
kubectl -n brainx get pods -w
kubectl -n brainx describe pod <old-pod-name>
kubectl -n brainx rollout status deployment/<service-name>
```

### 원인

- 대부분의 서비스가 `replicas: 1`로 구성되어 있고 기본 rolling update 전략(`maxUnavailable`/`maxSurge` 기본값)을 사용하므로, 새 Pod가 `Ready` 상태가 되어야 이전 Pod의 종료가 진행된다.
- `readinessProbe`/`startupProbe`의 `initialDelaySeconds`, `failureThreshold`가 애플리케이션 실제 기동 시간(Eureka 등록, DB/Redis 연결 등)보다 짧게 잡혀 있으면 새 Pod가 계속 `NotReady`로 남아, 결과적으로 이전 Pod의 종료도 함께 지연되는 것처럼 보인다.
- 컨테이너가 SIGTERM을 받고도 진행 중인 요청이나 커넥션 정리를 마치지 못해 `terminationGracePeriodSeconds` 동안 `Terminating` 상태로 남아 있는 경우도 있다.
- replica 1개 구성에서는 새 Pod가 Ready가 되기 전까지 일시적으로 Pod가 0개 또는 이전 Pod만 응답 가능한 구간이 생길 수 있다는 점도 함께 고려해야 한다.

### 해결 방법

1. `kubectl -n brainx get pods -w`로 새 Pod가 `Running`/`Ready`로 전환되는 시점과 이전 Pod가 `Terminating`으로 바뀌는 시점을 함께 관찰한다.
2. `kubectl -n brainx rollout status deployment/<service-name>`이 끝까지 완료되는지 확인한다(중간에 멈춰 있으면 새 Pod의 readiness 실패가 원인일 가능성이 높다).
3. 새 Pod가 `NotReady`로 오래 머문다면 `kubectl -n brainx logs <new-pod-name>`으로 기동 로그를 확인해, 4번 항목(actuator 401)이나 6번 항목(`host.docker.internal` 연결 실패) 등 다른 원인이 겹쳐 있는지 먼저 배제한다.
4. 이전 Pod가 `Terminating`에서 멈춰 있다면 `kubectl -n brainx describe pod <old-pod-name>`으로 종료를 막는 이벤트(예: 종료 훅 실패)가 있는지 확인한다.
5. 정상적인 지연이라고 판단되면(단순히 새 Pod의 startupProbe 대기 시간) 별도 조치 없이 rollout이 끝날 때까지 기다린다.

### 재발 방지

- probe의 `initialDelaySeconds`/`failureThreshold`는 실제 서비스 기동 시간(특히 DB/Redis/Eureka 등록을 포함한 최초 기동)을 기준으로 여유 있게 잡는다.
- replica가 1개인 서비스는 rollout 중 짧은 다운타임이 발생할 수 있는 구조임을 팀에 공유하고, 무중단이 필요한 서비스는 `replicas`를 늘리거나 `maxUnavailable: 0` 전략을 후속 작업으로 검토한다.
- 재배포 직후에는 항상 `kubectl -n brainx rollout status`로 완료를 확인한 뒤 다음 작업(port-forward, 검증 등)으로 넘어간다.

---

## 9. Postgres too many clients로 rollout 중 신규 Pod CrashLoopBackOff

### 증상

- `admin-service`, `mcp-service` 등 rollout 중 기존 Pod는 `1/1 Running`으로 남아 있는데, 새 ReplicaSet Pod가 `CrashLoopBackOff`에 빠진다.
- 새 Pod 로그에 `FATAL: sorry, too many clients already`가 보인다.
- `mcp-service` 로그에는 HikariCP가 pool 크기를 명시적으로 받지 못해 `Maximum pool size: undefined`로 찍히는 것도 함께 관찰된다(설정이 아예 없어 초기화 로그 시점에 값이 비어 있는 것).

### 확인 명령어

```powershell
kubectl -n brainx get pods -l app=admin-service
kubectl -n brainx get pods -l app=mcp-service
kubectl -n brainx logs deployment/admin-service --previous
kubectl -n brainx logs deployment/mcp-service --previous
```

### 원인

- User/Workspace/Admin/MCP-Service 전부 `application.yml`(MCP는 `application.yaml`)에서 HikariCP pool 크기를 명시적으로 제한하지 않아, 서비스당 Spring Boot 기본값(최대 10)까지 커넥션을 열 수 있다.
- 이 4개 서비스(K8s) 외에도 Ingestion/Commerce/Intelligence-Service(아직 Compose로만 실행)까지 총 7개 Spring Boot 서비스가 **동일한 로컬 Compose Postgres 하나**를 공유한다.
- `brainX_back/docker-compose.yml`의 `postgres` 서비스에는 `max_connections`를 별도로 오버라이드하는 `command`/설정 파일이 없었으므로, `postgres:16-alpine` 이미지의 기본값인 `max_connections=100`이 그대로 적용되고 있었다(실행 중인 컨테이너에 직접 접속해 `SHOW max_connections;`로 재확인하는 것을 권장 — 이 조사는 `docker`/`psql` 실행 없이 설정 파일만으로 판단한 결과다).
- rolling update 중에는 이전 Pod가 잡고 있는 커넥션과 새 Pod가 새로 여는 커넥션이 일시적으로 동시에 존재해 순간 사용량이 더 튄다. 서비스별 pool 상한이 없는 상태에서 7개 서비스가 각자 최대 10개까지 열면 정상 시나리오에서도 최대 70개, 두 서비스가 동시에 rollout되면 그 이상까지 튈 수 있어 Postgres의 예약 커넥션(`superuser_reserved_connections`)까지 감안하면 `max_connections=100`을 넘기기 쉽다.

### 해결 방법 (적용 완료)

1. **rollingUpdate 전략 고정 (보조 대책)**: User/Workspace/Admin/MCP-Service 4개 Deployment 모두에 아래 `strategy`를 추가했다.

   ```yaml
   strategy:
     type: RollingUpdate
     rollingUpdate:
       maxSurge: 0
       maxUnavailable: 1
   ```

   `maxSurge: 0`이므로 새 Pod를 먼저 띄우지 않고 기존 Pod를 먼저 내린 뒤 새 Pod를 올린다. `replicas: 1` 구성에서는 old/new Pod가 동시에 떠서 Postgres 커넥션을 동시에 잡는 순간을 없애는 대신, rollout 중 짧은 다운타임(8번 항목과 동일한 성격)이 생긴다는 트레이드오프가 있다. **이 설정은 로컬 검증 전용이다** — 운영에서는 무중단 배포를 위해 `replicas>=2` + PodDisruptionBudget + 충분한 DB capacity + connection pooler(PgBouncer 등)를 함께 검토해야 하며, 그 경우 `maxSurge: 0`을 그대로 쓰면 안 된다(`k8s/PRODUCTION_CHECKLIST.md` 9번 항목 참고).

2. **서비스별 Hikari pool 상한 고정 (근본 대책)**: Admin/User/Workspace/MCP-Service의 K8s 매니페스트에 동일한 값을 추가했다.
   - `SPRING_DATASOURCE_HIKARI_MAXIMUM_POOL_SIZE: "3"`
   - `SPRING_DATASOURCE_HIKARI_MINIMUM_IDLE: "1"`
   - 적용 위치: `k8s/apps/admin-service.yaml`(ConfigMap), `k8s/apps/workspace-service.yaml`(ConfigMap), `k8s/apps/mcp-service-configmap.yaml`(ConfigMap), `k8s/apps/user-service.yaml`(User-Service는 ConfigMap이 없어 Deployment `env` 목록에 직접 추가).
   - 아직 K8s로 전환되지 않은 `ingestion-service`, `commerce-service`, `intelligence-service`도 같은 Postgres를 공유하므로 `brainX_back/docker-compose.yml`의 각 서비스 `environment`에도 동일한 두 값을 추가했다.
   - 이 값들은 `application.yml`에 Hikari 설정이 전혀 없어 Spring Boot의 relaxed binding으로 `spring.datasource.hikari.maximum-pool-size` / `minimum-idle`에 자동 매핑된다. `application.yml`/Java 코드 수정 없이 환경변수만으로 동작한다.
3. **Postgres `max_connections` 상향 (보조 안전 마진)**: `brainX_back/docker-compose.yml`의 `postgres` 서비스에 `command: ["postgres", "-c", "max_connections=200"]`를 추가했다. 근본 대책이 아니라, rolling update 중 순간 피크나 아직 pool을 제한하지 않은 신규 서비스가 추가되는 경우를 대비한 여유분이다.
4. ConfigMap/Deployment/Compose 변경 후 재적용 및 재기동.

   ```powershell
   kubectl apply -f .\k8s\apps\admin-service.yaml
   kubectl apply -f .\k8s\apps\workspace-service.yaml
   kubectl apply -f .\k8s\apps\mcp-service-configmap.yaml
   kubectl apply -f .\k8s\apps\mcp-service.yaml
   kubectl apply -f .\k8s\apps\user-service.yaml
   kubectl -n brainx rollout restart deployment/admin-service deployment/workspace-service deployment/mcp-service deployment/user-service

   docker compose -f .\brainX_back\docker-compose.yml up -d postgres ingestion-service commerce-service intelligence-service
   ```

5. `kubectl -n brainx rollout status deployment/<service>`로 각 rollout이 끝까지 완료되는지 확인한다.
6. `kubectl -n brainx logs deployment/<service> --previous`로 동일한 `too many clients` 로그가 더 이상 나타나지 않는지 확인한다.
7. Postgres에서 실제 활성 커넥션 수를 확인해 예산 안에 들어오는지 점검한다.

   ```powershell
   docker exec -it brainx-postgres psql -U postgres -c "SELECT count(*), state FROM pg_stat_activity GROUP BY state;"
   docker exec -it brainx-postgres psql -U postgres -c "SHOW max_connections;"
   ```

### 재발 방지

- **새 서비스를 추가하거나 Kubernetes로 전환할 때는 반드시** Hikari `maximum-pool-size`/`minimum-idle`을 기본값(10)이 아니라 이 프로젝트의 로컬 검증 표준값(각각 `3`, `1`)으로 명시적으로 설정하는 것을 apply 전 체크리스트(`k8s/SETUP.md`)에 추가한다. `application.yml`을 고칠 필요 없이 ConfigMap/`env`에 두 값만 추가하면 된다.
- Postgres `max_connections=200`은 로컬 검증 전용 여유분이다. 서비스가 늘어나 이 값을 다시 늘려야 한다면, 그 전에 먼저 "새로 추가된 서비스가 Hikari pool 상한을 지정했는지"부터 확인한다 — 인프라 값을 계속 올리는 것으로 근본 원인을 덮지 않는다.
- 운영(EC2 k3s/EKS) 전환 시에는 로컬처럼 `max_connections`를 계속 올리는 방식 대신 **PgBouncer 등 connection pooler**를 Postgres 앞단에 두는 것을 권장한다. 서비스 수/replica 수가 늘어도 실제 Postgres 백엔드 연결 수는 pooler가 흡수하므로, 서비스별 Hikari 값과 무관하게 안정적으로 확장된다(`k8s/PRODUCTION_CHECKLIST.md` 3번 항목에 후속 검토 항목으로 반영 권장).
- `replicas`를 2 이상으로 늘리거나 `maxSurge`를 키우는 변경이 있으면, 그 시점에 서비스 수 × (`maximum-pool-size` × `maxSurge`/`replicas` 배수)를 다시 계산해 Postgres 예산 안에 들어오는지 재검증한다.

---

## 추가로 기록하면 좋은 사례 (미기록, 향후 후보)

아래 항목은 이번 문서에는 포함하지 않았지만, 팀에서 추가로 겪게 되면 같은 형식으로 이 문서에 추가하는 것을 권장한다.

- Eureka에 Pod IP가 등록된 뒤 Pod가 재시작되어 IP가 바뀌었는데 Eureka self-preservation으로 오래된 인스턴스 정보가 남아 라우팅이 실패하는 사례
- ConfigMap 값만 수정하고 Deployment를 재시작하지 않아 이전 값이 계속 반영되는 사례 (`envFrom` 기반 서비스에서 특히 발생)
- Windows 방화벽/백신 소프트웨어가 `kubectl port-forward` 연결을 간헐적으로 끊는 사례
- Docker Desktop 리소스(CPU/메모리) 제한으로 여러 서비스를 동시에 올렸을 때 Pod가 `OOMKilled`로 재시작되는 사례
- Neo4j/Kafka처럼 아직 Kubernetes로 전환되지 않은 상태 저장 인프라가 Compose에서 먼저 내려가 순서상 재기동해야 하는 사례
