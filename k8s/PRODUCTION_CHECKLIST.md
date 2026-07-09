# BrainX Kubernetes Production Checklist

이 문서는 현재 **Docker Desktop Kubernetes + `host.docker.internal` 로컬 검증 구성**을
운영(EC2 k3s / EKS) 환경으로 옮기기 전에 **빠짐없이 정리해야 하는 작업 목록**이다.

- 대상 범위: `k8s/` 매니페스트 운영 전환 준비
- 비대상 범위: 실제 인프라 파일 생성, 기존 YAML 수정, Secret 실제 값 작성
- 전제: 이 문서는 **체크리스트/의사결정 문서**이며, 여기서 새 매니페스트를 만들거나 기존 매니페스트를 고치지 않는다.

> 우선순위 표기
> - **P0**: 이게 안 되면 운영 배포 자체가 불가능하거나 보안 사고로 직결
> - **P1**: 운영 초기에 반드시 필요 (안정성/가용성/관측성)
> - **P2**: 운영 안정화 이후 개선 항목

---

## 0. 현재 상태 스냅샷 (전환 출발점)

| 영역 | 현재 상태 | 근거 |
| --- | --- | --- |
| 클러스터 | Docker Desktop Kubernetes 단일 노드 | `k8s/SETUP.md` |
| 서비스 간 연결 | 다수 매니페스트가 `host.docker.internal` 경유 | `gateway-service.yaml`, `workspace-service.yaml`, `user`, `admin`, `mcp-service-configmap.yaml` |
| 상태 저장 인프라 | Postgres / Redis / Neo4j / Kafka / Qdrant 전부 Compose | `k8s/README.md` |
| ConfigMap 분리 | `workspace-service`, `mcp-service`만 적용. Discovery/Gateway/User/Admin은 inline env | `workspace-service.yaml`, `mcp-service-configmap.yaml` |
| Secret | 전부 평문 `stringData` 기반 로컬 Secret | `k8s/secrets/*` |
| 이미지 | 전부 `*:local` + `imagePullPolicy: IfNotPresent` | 각 app 매니페스트 |
| 복제본 | 모든 Deployment `replicas: 1` | 각 app 매니페스트 |
| 리소스 제한 | `resources.requests/limits` 미설정 | 각 app 매니페스트 |
| 외부 노출 | 전부 `ClusterIP` + `port-forward`, Ingress 없음 | `k8s/SETUP.md` |
| 모니터링 | Prometheus/Grafana `emptyDir` (재생성 시 소실), Alertmanager 없음 | `prometheus.yaml`, `grafana.yaml` |
| 보안 정책 | RBAC/NetworkPolicy/securityContext 미설정 | 전체 매니페스트 |

---

## 1. host.docker.internal 제거 (P0)

`host.docker.internal`은 **Docker Desktop 전용 호스트 별칭**이라 EC2 k3s / EKS 에서는 해석되지 않는다.
운영 전에 아래 위치를 전부 실제 대상(클러스터 Service DNS 또는 관리형 엔드포인트)으로 치환해야 한다.

### 제거 대상 인벤토리

- [ ] **Gateway** `k8s/apps/gateway-service.yaml` — `SPRING_APPLICATION_JSON`의 정적 discovery 인스턴스 7개
  (`User-Service`, `Workspace-Service`, `ingestion-service`, `Commerce-Service`, `Admin-Service`, `intelligence-service`, `mcp-service`)가 모두 `http://host.docker.internal:8080~8087`
- [ ] **Workspace** `k8s/apps/workspace-service.yaml`(ConfigMap) — `POSTGRES_HOST`, `REDIS_HOST`, `NEO4J_URI(bolt://host.docker.internal:7687)`, `SPRING_KAFKA_BOOTSTRAP_SERVERS(host.docker.internal:9092)`
- [ ] **User** `k8s/apps/user-service.yaml` — Postgres/Redis/Workspace-Service 경로
- [ ] **Admin** `k8s/apps/admin-service.yaml` — Postgres/Kafka/Gateway/다른 앱 서비스 경로
- [ ] **MCP** `k8s/apps/mcp-service-configmap.yaml` — Postgres/Workspace/Intelligence 경로 + OAuth 공개 URL(`http://localhost:3000` 계열)

### 치환 원칙

- [ ] **앱 → 앱** 호출은 클러스터 내부 Service DNS(`http://<service>.<namespace>.svc.cluster.local:<port>` 또는 `http://<service>:<port>`)로 전환
- [ ] **앱 → 상태 저장 인프라**(PG/Redis/Neo4j/Kafka)는 4번 항목의 운영 방식 결정에 따라 관리형 엔드포인트 또는 in-cluster Service로 전환
- [ ] Gateway는 정적 discovery 매핑을 걷어내고 **Eureka 기반 `lb://` 또는 Kubernetes Service DNS** 중 하나로 라우팅 전략 확정 (README "완전한 Gateway 전환" 메모 참고)
- [ ] OAuth 공개 URL(`PUBLIC_BASE_URL`, `BRAINX_OAUTH_ISSUER`, `BRAINX_MCP_RESOURCE`, `BRAINX_MCP_PROTECTED_RESOURCE_METADATA_URL`) 4개를 **실제 공개 도메인**으로 통일하고 User-Service와 값 일치 확인
- [ ] 전 매니페스트 `grep host.docker.internal` 결과가 **0건**인지 최종 확인

---

## 2. ConfigMap / Secret 정리 (P0/P1)

### ConfigMap 표준화 (P1)

- [ ] 현재 ConfigMap 분리가 된 서비스는 `workspace-service`, `mcp-service` 2개뿐 → **Discovery/Gateway/User/Admin도 동일 패턴(`envFrom` + ConfigMap)으로 통일**
- [ ] 환경별 값 분리 전략 확정: `dev` / `staging` / `prod` ConfigMap 분리 또는 Kustomize overlay / Helm values
- [ ] 비민감 값(포트, 호스트, Eureka URL, 타임아웃, feature flag)만 ConfigMap에 유지, **민감값이 ConfigMap에 섞이지 않았는지** 재점검

### Secret 정리 (P0)

- [ ] 현재 Secret은 전부 평문 `stringData` → **운영에서는 평문 Secret을 Git/클러스터에 두지 않는 방식**으로 전환 (아래 택1)
  - [ ] SealedSecrets (Bitnami)
  - [ ] External Secrets Operator + AWS Secrets Manager / SSM Parameter Store
  - [ ] HashiCorp Vault
- [ ] **`JWT_SECRET` 공유 범위 확인**: Gateway / User / Workspace / Admin / MCP 5개 서비스가 동일 값을 공유 → 운영 시크릿 회전(rotation) 시 5개 동시 반영 절차 문서화
- [ ] **`SERVICE_TOKEN`(gateway-secret)** 운영값 신규 발급 (로컬 검증값 재사용 금지)
- [ ] **Postgres 계정**(`postgres-secret`) 운영 전용 계정/비밀번호로 분리
- [ ] **Git 이력 유출 점검**: README/SETUP 경고대로, 과거 커밋에 토큰/비밀번호가 들어간 적 있으면 **파일 수정만으로 불충분** → 운영 전 전량 재발급
- [ ] `.gitignore`(`k8s/secrets/*.yaml`, `!k8s/secrets/*.example.yaml`) 규칙이 운영 브랜치에도 유지되는지 확인
- [ ] example 파일의 키 이름과 매니페스트 `secretKeyRef.key` 일치 여부 최종 확인

---

## 3. DB / Redis / Neo4j / Kafka 운영 방식 결정 (P0)

현재 전부 Compose. 운영에서는 **관리형(Managed)** vs **in-cluster StatefulSet** 중 서비스별로 결정해야 한다.

| 컴포넌트 | 권장(EKS) | 대안(EC2 k3s) | 결정 |
| --- | --- | --- | --- |
| Postgres | RDS for PostgreSQL (Multi-AZ) | k3s StatefulSet + PVC + 백업 | ☐ |
| Redis | ElastiCache for Redis | k3s StatefulSet / Bitnami Helm | ☐ |
| Neo4j | Neo4j AuraDB 또는 self-managed StatefulSet | StatefulSet + PVC | ☐ |
| Kafka | MSK 또는 MSK Serverless | Strimzi Operator / Redpanda | ☐ |
| Qdrant | Qdrant Cloud 또는 StatefulSet | StatefulSet + PVC | ☐ |

체크리스트:

- [ ] 각 컴포넌트 **관리형 vs in-cluster 결정** 및 근거 기록
- [ ] in-cluster로 갈 경우 **StatefulSet + PVC + 백업/스냅샷 정책** 필수 (7번 항목 연계)
- [ ] **백업/복구(RPO/RTO)** 목표 정의 (특히 Postgres, Neo4j)
- [ ] DB 다중 인스턴스 분리 여부 결정: 현재 `brainx_workspace`, `brainx_mcp`, `brainx_admin` 등 서비스별 DB 사용 → 운영 계정/스키마 권한 최소화
- [ ] 접속 정보 전부 Secret/ConfigMap으로 외부화되어 있는지 확인 (하드코딩 금지)
- [ ] Workspace readiness는 **Postgres+Redis 상태에 직접 의존** → 관리형 전환 시 네트워크 지연/장애가 readiness에 미치는 영향 검증
- [ ] Kafka 토픽/파티션/보존정책 운영 기준 정의
- [ ] 마이그레이션 도구(Flyway/Liquibase 등) 운영 실행 전략 확정
- [ ] **Postgres connection pooler 도입 검토(PgBouncer 등)**: 로컬 검증 환경은 서비스별 Hikari `maximum-pool-size`를 낮게 고정(`3`)하고 Compose Postgres `max_connections`를 200으로 올려 임시 대응했다(`k8s/TROUBLESHOOTING.md` 9번 항목). 운영에서는 서비스/replica 수가 늘어날수록 `max_connections`를 계속 올리는 방식이 아니라 pooler로 백엔드 연결 수를 흡수하는 구조로 전환한다.

---

## 4. Ingress / TLS (P0)

현재 외부 노출은 `port-forward`뿐 → 운영은 Ingress + TLS 필수.

- [ ] **Ingress Controller** 배포 (EKS: AWS Load Balancer Controller / ingress-nginx, k3s: 내장 Traefik 또는 ingress-nginx)
- [ ] **진입점은 Gateway 단일화**: 외부 트래픽이 Gateway(`8088`)로만 들어오고 나머지 서비스는 `ClusterIP` 내부 전용 유지
- [ ] **TLS 인증서**: cert-manager + Let's Encrypt 또는 ACM(EKS ALB)
- [ ] HTTP → HTTPS 리다이렉트 강제
- [ ] 도메인/호스트 규칙 확정 (`api.brainx.<domain>` 등) 및 OAuth 공개 URL과 일치(1번 연계)
- [ ] Grafana/Prometheus 외부 노출 여부 결정 — 노출 시 **별도 인증/IP 제한** 필수
- [ ] WAF / rate limit 정책 검토 (P1)

---

## 5. 이미지 레지스트리 (ECR / Docker Hub) (P0)

현재 전부 `*:local` + `IfNotPresent` → 로컬 빌드 이미지에 의존. 운영 노드는 이 이미지를 가질 수 없다.

- [ ] **레지스트리 선택**: ECR(EKS 권장) 또는 Docker Hub(private repo)
- [ ] 이미지 태그 전략을 `:local` → **불변 태그(git SHA / semver)** 로 전환, `:latest` 금지
- [ ] `imagePullPolicy`를 `IfNotPresent` → **`Always` 또는 digest 고정(`@sha256:...`)**
- [ ] **imagePullSecrets** 구성 (private registry) / EKS는 IRSA 기반 ECR 권한
- [ ] CI에서 `build → push → 매니페스트 태그 갱신 → 배포` 파이프라인 구축
- [ ] 이미지 취약점 스캔(ECR scan / Trivy) 파이프라인 편입 (P1)
- [ ] 멀티아키(arm64/amd64) 필요 여부 결정 (노드 인스턴스 타입 기준)

---

## 6. PVC / Storage (P0/P1)

현재 영속 볼륨은 전부 `emptyDir` → Pod 재생성 시 데이터 소실.

- [ ] **StorageClass 확정**: EKS는 EBS CSI(`gp3`), k3s는 local-path 또는 Longhorn
- [ ] **Prometheus TSDB** `emptyDir` → PVC (`prometheus.yaml:39`) — 메트릭 히스토리 보존
- [ ] **Grafana 데이터** `emptyDir` → PVC (`grafana.yaml:57`)
- [ ] Grafana dashboard/provisioning 자산 `emptyDir` → **ConfigMap 또는 Git 관리 자산으로 고정** (`grafana.yaml:54`)
- [ ] in-cluster DB(3번에서 선택 시) StatefulSet용 PVC + 용량 산정
- [ ] 볼륨 백업/스냅샷(EBS snapshot / Velero) 정책
- [ ] `ReclaimPolicy`(Retain vs Delete) 및 용량 확장 정책 확인

---

## 7. Monitoring / Alertmanager (P1)

- [ ] Prometheus/Grafana **PVC 영속화** (6번 연계)
- [ ] **배포 방식 결정**: 현재 수동 매니페스트 → kube-prometheus-stack(Helm) 또는 Prometheus Operator 전환 검토
- [ ] **scrape 대상 확장**: 현재 `user/gateway/admin/workspace/mcp`만 포함. `ingestion/commerce/intelligence`는 K8s Service 생성 후 편입 (`prometheus-configmap.yaml`)
- [ ] 각 서비스가 `/actuator/prometheus`를 실제 노출하는지 런타임 확인
- [ ] **Alertmanager 배포 + 알림 채널**(Slack/Email/PagerDuty) 구성
- [ ] 핵심 알림 규칙 정의: Pod CrashLoop, readiness 실패, DB/Redis 연결 실패, 노드 리소스 임계, 인증서 만료
- [ ] 로그 수집 전략(로그 aggregation): Loki / CloudWatch Logs / ELK 중 결정 (P1)
- [ ] 대시보드 provisioning 자산을 Git 관리로 고정 (임시 dashboard 소실 방지)
- [ ] Grafana admin 계정(`grafana-secret`) 운영값 분리, 익명 접근/`GF_USERS_ALLOW_SIGN_UP=false` 유지 확인

---

## 8. Security / RBAC / NetworkPolicy (P0/P1)

현재 매니페스트에 보안 관련 설정이 사실상 없다.

### 워크로드 하드닝 (P1)

- [ ] **`resources.requests/limits`** 전 Deployment 지정 (현재 전부 미설정 → 스케줄링/OOM 리스크)
- [ ] **`securityContext`**: `runAsNonRoot`, `readOnlyRootFilesystem`, `allowPrivilegeEscalation: false`, `drop ALL capabilities`
- [ ] **Pod Security Admission**(`restricted` 수준) 네임스페이스 라벨 적용
- [ ] `startupProbe` 추가 검토(기동 느린 서비스의 liveness 오탐 방지)

### RBAC (P0)

- [ ] 서비스별 **전용 ServiceAccount** + 최소 권한 Role/RoleBinding
- [ ] `default` ServiceAccount 자동 토큰 마운트 비활성화(`automountServiceAccountToken: false`)
- [ ] EKS는 **IRSA**로 AWS 리소스(ECR/Secrets Manager/S3) 접근 최소권한 부여

### NetworkPolicy (P1)

- [ ] `brainx` 네임스페이스 **default-deny** 후 필요한 통신만 허용
- [ ] 외부 진입은 Ingress→Gateway만, 앱→DB/Redis/Kafka 통신만 화이트리스트
- [ ] (k3s) NetworkPolicy 지원 CNI 확인 (기본 flannel은 미지원 → Calico 등 필요)

### 기타 (P0)

- [ ] Secret은 8-3(2번) 대로 외부화, 평문 커밋 금지
- [ ] 컨테이너 이미지 취약점 스캔 통과 기준 정의
- [ ] 최소 노출 원칙: DB/Redis/모니터링은 외부 미노출

---

## 9. Rollback / Blue-Green / Canary (P1)

현재 `replicas: 1` + 기본 RollingUpdate → 무중단/롤백 전략 부재.

- [ ] **`replicas >= 2`** + **PodDisruptionBudget** 로 최소 가용성 확보
- [ ] RollingUpdate `maxSurge`/`maxUnavailable` 파라미터 명시
- [ ] **`kubectl rollout undo`** 기반 롤백 절차 문서화 + `revisionHistoryLimit` 설정
- [ ] readiness/liveness가 롤아웃 게이트로 정확히 동작하는지 확인 (특히 Gateway/Workspace)
- [ ] 배포 전략 결정:
  - [ ] 기본: RollingUpdate (probe 신뢰 전제)
  - [ ] 고급(선택): Argo Rollouts / Flagger 기반 Canary·Blue-Green
- [ ] **HPA**(CPU/메모리 또는 커스텀 메트릭) 도입 여부 결정 — requests/limits(8번) 선행 필요
- [ ] DB 스키마 변경과 앱 배포의 **하위호환(backward-compatible) 마이그레이션** 순서 정의
- [ ] 배포 자동화: GitOps(ArgoCD/Flux) 또는 CI 파이프라인 배포 방식 확정

---

## 10. EC2 k3s vs EKS 선택 기준 (참고 비교)

| 기준 | EC2 + k3s | EKS |
| --- | --- | --- |
| 초기 비용 | 낮음 (단일/소수 EC2) | 높음 (control plane 시간당 과금 + 노드) |
| 운영 부담 | 높음 (control plane/업그레이드/HA 직접 관리) | 낮음 (control plane 관리형) |
| 확장성 | 수동/제한적 | Cluster Autoscaler/Karpenter로 우수 |
| AWS 통합 | 직접 구성 (ALB/IRSA/EBS CSI 수동) | 네이티브 (ALB Controller, IRSA, EBS CSI) |
| 고가용성 | 직접 구성 필요 | Multi-AZ control plane 기본 |
| 적합 상황 | PoC/소규모/비용 민감/학습 | 실제 운영/트래픽 증가/조직 표준 |

- [ ] **선택 기준 결정**: 트래픽 규모, 예산, 운영 인력, HA 요구수준
- [ ] 권장: **초기 검증·데모는 EC2 k3s**, **실제 운영/확장 단계는 EKS**
- [ ] 선택과 무관하게 1~9번 항목은 공통으로 해결되어야 함 (특히 host.docker.internal 제거, Secret 외부화, 관리형 DB 결정)

---

## 부록. 운영 전 반드시 해결해야 할 항목 요약

### P0 (미해결 시 운영 배포 불가 / 보안 사고 직결)

1. **host.docker.internal 전량 제거** (1번) — Docker Desktop 외 환경에서 미해석
2. **이미지 레지스트리 전환** (5번) — `*:local`은 운영 노드에서 pull 불가
3. **DB/Redis/Neo4j/Kafka 운영 방식 결정** (3번) — Compose 의존 제거
4. **Secret 외부화 + 운영값 재발급** (2번) — 평문 Secret/Git 이력 유출 차단, `JWT_SECRET`·`SERVICE_TOKEN`·DB 계정 신규 발급
5. **Ingress + TLS** (4번) — port-forward 기반 노출 불가
6. **영속 스토리지(PVC)** (6번) — `emptyDir`는 재생성 시 소실
7. **RBAC 최소권한 / Secret 미노출** (8번)

### P1 (운영 초기 안정성·가용성·관측성)

1. **ConfigMap 표준화 + 환경별 분리** (2번)
2. **resources requests/limits + securityContext** (8번)
3. **replicas>=2 + PDB + 롤백 절차** (9번)
4. **Alertmanager + 알림 규칙 + 로그 수집** (7번)
5. **NetworkPolicy default-deny** (8번)
6. **Prometheus scrape 대상 확장(ingestion/commerce/intelligence)** (7번)

### P2 (안정화 이후 개선)

1. Canary/Blue-Green(Argo Rollouts/Flagger) 및 HPA (9번)
2. GitOps(ArgoCD/Flux) 배포 자동화
3. kube-prometheus-stack/Operator 전환 (7번)
4. WAF / rate limit (4번)

---

SSOT 계약에 맞게 구현 완료
