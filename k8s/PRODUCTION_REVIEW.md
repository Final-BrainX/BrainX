# BrainX Kubernetes Production Review

> 리뷰 일자: 2026-07-09
> 리뷰 대상: `k8s/` 전체 매니페스트 및 문서
> 리뷰 목적: 현재 로컬 검증 구성의 운영 전환 관점 위험 식별

---

## 리뷰 범위

### 서비스 매니페스트

| 서비스 | 파일 | 리뷰 완료 |
|---|---|---|
| Discovery | `k8s/apps/discovery-service.yaml` | O |
| Gateway | `k8s/apps/gateway-service.yaml` | O |
| User | `k8s/apps/user-service.yaml` | O |
| Workspace | `k8s/apps/workspace-service.yaml` | O |
| Admin | `k8s/apps/admin-service.yaml` | O |
| MCP | `k8s/apps/mcp-service.yaml`, `k8s/apps/mcp-service-configmap.yaml` | O |

### 모니터링

| 컴포넌트 | 파일 | 리뷰 완료 |
|---|---|---|
| Prometheus | `k8s/monitoring/prometheus.yaml`, `prometheus-configmap.yaml` | O |
| Grafana | `k8s/monitoring/grafana.yaml`, `grafana-configmap.yaml` | O |

### Secret

| Secret | 파일 (example) | 리뷰 완료 |
|---|---|---|
| postgres-secret | `k8s/secrets/postgres-secret.example.yaml` | O |
| gateway-secret | `k8s/secrets/gateway-secret.example.yaml` | O |
| workspace-secret | `k8s/secrets/workspace-secret.example.yaml` | O |
| admin-service-secret | `k8s/secrets/admin-service-secret.example.yaml` | O |
| mcp-service-secret | `k8s/secrets/mcp-service-secret.example.yaml` | O |
| grafana-secret | `k8s/secrets/grafana-secret.example.yaml` | O |
| user-service-oauth-secret | `k8s/secrets/user-service-oauth-secret.example.yaml` | O |

### 문서

| 문서 | 파일 | 리뷰 완료 |
|---|---|---|
| README | `k8s/README.md` | O |
| SETUP | `k8s/SETUP.md` | O |
| HELM_DESIGN | `k8s/helm/HELM_DESIGN.md` | O |
| PRODUCTION_CHECKLIST | `k8s/PRODUCTION_CHECKLIST.md` | O |
| TROUBLESHOOTING | `k8s/TROUBLESHOOTING.md` | O |

---

## 우선순위 기준

- **P0**: 미해결 시 운영 배포 불가 또는 보안 사고 직결
- **P1**: 운영 초기에 반드시 필요 (안정성/가용성/관측성)
- **P2**: 운영 안정화 이후 개선 항목

---

## P0 Findings

### P0-01. Secret — 평문 stringData 기반 관리

| 항목 | 내용 |
|---|---|
| **문제** | 7개 Secret 전부 `stringData` 평문으로 관리된다. 운영 환경에서 평문 Secret을 클러스터에 적용하면 etcd에 base64 인코딩만 된 상태로 저장되어 실질적 암호화가 없다. |
| **영향** | etcd 접근 권한을 가진 공격자가 모든 DB 비밀번호, JWT 서명 키, 서비스 토큰, 메일 계정, 관리자 시드 값을 평문으로 탈취할 수 있다. |
| **권장 수정** | (1) etcd encryption at rest 활성화, (2) SealedSecrets / External Secrets Operator(AWS Secrets Manager/SSM) / HashiCorp Vault 중 택1 도입, (3) 운영 값은 Git/로컬 파일에 절대 보관하지 않는 구조로 전환 |
| **현재 상태** | `.gitignore`(`k8s/secrets/*.yaml`, `!k8s/secrets/*.example.yaml`)로 실제 Secret 파일은 Git 추적에서 제외되어 있다. example 파일만 Git에 커밋된다. 그러나 클러스터 내 저장/전달 암호화는 미적용. |
| **대상 파일** | `k8s/secrets/*.yaml` (7개 전체) |

---

### P0-02. Secret — Git 이력 유출 재발급 필요

| 항목 | 내용 |
|---|---|
| **문제** | `k8s/README.md`에 "이미 원격 이력에 올라간 값은 마스킹 여부와 무관하게 안전하지 않으므로 재발급/변경이 필요하다"는 경고가 있다. 과거 커밋에 평문 Secret이 들어간 이력이 있을 수 있다. |
| **영향** | Git 이력을 탐색하면 DB 비밀번호, JWT 시크릿, 서비스 토큰이 노출될 수 있다. 파일 수정만으로는 이력의 평문이 제거되지 않는다. |
| **권장 수정** | (1) 운영 전 모든 Secret 값(POSTGRES_PASSWORD, JWT_SECRET, SERVICE_TOKEN, MAIL_PASSWORD, SEED_ADMIN_PASSWORD, NEO4J_PASSWORD, Grafana admin 비밀번호, OAuth client secret)을 신규 발급, (2) Git 이력에 노출 여부 감사(`git log -p -- k8s/secrets/`), (3) 필요 시 `git filter-repo` 또는 BFG로 이력 정리 |
| **현재 상태** | README/SETUP에 경고 문구 존재. 실제 재발급/이력 정리 여부는 미확인. |
| **대상 파일** | `k8s/secrets/*.yaml`, Git 이력 전체 |

---

### P0-03. JWT_SECRET — 4개 Secret에 분산 저장, 수동 동기화 의존

| 항목 | 내용 |
|---|---|
| **문제** | `JWT_SECRET`이 `gateway-secret`, `workspace-secret`, `admin-service-secret`, `mcp-service-secret` 4개 Secret에 각각 별도로 저장된다. 5개 서비스(Gateway, User, Workspace, Admin, MCP)가 동일 값을 공유해야 하지만, 값 일치를 강제하는 메커니즘이 없다. |
| **영향** | 어느 한 Secret의 `JWT_SECRET`이 다른 것과 다르면 해당 서비스의 토큰 검증이 실패해 인증 장애가 발생한다. Secret rotation 시 4개를 동시에 갱신하지 않으면 부분 장애로 이어진다. |
| **권장 수정** | (1) `JWT_SECRET`을 단일 Secret(예: `brainx-shared-secret`)으로 통합하고 모든 서비스가 같은 Secret을 참조하도록 변경, (2) 또는 External Secrets Operator로 단일 소스에서 동기 주입, (3) rotation 절차를 문서화해 4개 Secret 동시 갱신을 보장 |
| **현재 상태** | `SETUP.md`에 "반드시 같은 값이어야 한다"는 안내가 있으나, 기술적 강제 수단은 없다. |
| **대상 파일** | `k8s/secrets/gateway-secret.example.yaml`, `workspace-secret.example.yaml`, `admin-service-secret.example.yaml`, `mcp-service-secret.example.yaml` |

---

### P0-04. host.docker.internal — 5개 서비스 매니페스트에 하드코딩

| 항목 | 내용 |
|---|---|
| **문제** | Gateway, User, Workspace, Admin, MCP 매니페스트에 `host.docker.internal`이 총 30건 이상 하드코딩되어 있다. 이 별칭은 Docker Desktop 전용이며 EC2 k3s, EKS, 일반 Linux 클러스터에서는 해석되지 않는다. |
| **영향** | Docker Desktop 외 환경에서 배포하면 Postgres, Redis, Neo4j, Kafka, 타 서비스 연결이 전부 실패한다. 운영 배포 자체가 불가능하다. |
| **권장 수정** | (1) 앱→앱 호출은 Kubernetes Service DNS(`http://<service>:<port>`)로 전환, (2) 앱→인프라는 관리형 서비스 엔드포인트 또는 in-cluster Service로 전환, (3) 환경별 값은 Helm values 또는 Kustomize overlay로 분리, (4) 전환 후 `grep host.docker.internal k8s/` 결과 0건 확인 |
| **현재 상태** | `PRODUCTION_CHECKLIST.md` 1번에 제거 대상 인벤토리가 정리되어 있다. 실제 전환은 미착수. |
| **대상 파일** | `gateway-service.yaml:46`, `user-service.yaml:37,59,67`, `workspace-service.yaml:13,21,26,30`, `admin-service.yaml:10,17,23-29`, `mcp-service-configmap.yaml:8,24,25` |

---

### P0-05. Ingress / TLS — 미설정

| 항목 | 내용 |
|---|---|
| **문제** | Ingress 리소스가 없다. 모든 Service가 `ClusterIP`이며 외부 접근은 `kubectl port-forward`만 가능하다. TLS 인증서 구성도 없다. |
| **영향** | 운영 환경에서 외부 트래픽을 받을 수 없다. 평문 HTTP 통신으로 인증 토큰, 사용자 데이터가 네트워크 경로에서 노출될 수 있다. |
| **권장 수정** | (1) Ingress Controller 배포(EKS: AWS LB Controller 또는 ingress-nginx, k3s: Traefik), (2) Gateway Service 앞에 Ingress 리소스 생성(외부→Gateway 단일 진입점), (3) cert-manager + Let's Encrypt 또는 ACM으로 TLS 인증서 자동화, (4) HTTP→HTTPS 리다이렉트 강제 |
| **현재 상태** | `PRODUCTION_CHECKLIST.md` 4번에 항목 있음. 미착수. |
| **대상 파일** | 전체 (`k8s/` 하위에 Ingress YAML 없음) |

---

### P0-06. 이미지 레지스트리 — `:local` 태그 + `IfNotPresent`

| 항목 | 내용 |
|---|---|
| **문제** | 모든 앱 이미지가 `brainx-<service>:local` 태그 + `imagePullPolicy: IfNotPresent`로 구성되어 있다. 로컬 Docker 엔진에 빌드된 이미지에 의존하는 구조다. |
| **영향** | 운영 노드(EC2/EKS)는 이 로컬 이미지를 보유하지 않으므로 `ImagePullBackOff`로 Pod가 시작되지 않는다. `:local` 태그는 불변성이 보장되지 않아 어떤 버전이 배포됐는지 추적할 수 없다. |
| **권장 수정** | (1) ECR 또는 Docker Hub(private) 레지스트리 구축, (2) 이미지 태그를 Git SHA 또는 semver 기반 불변 태그로 전환 (`:latest` 금지), (3) `imagePullPolicy`를 `Always` 또는 digest 고정으로 변경, (4) CI 파이프라인에서 build→push→deploy 자동화 |
| **현재 상태** | `PRODUCTION_CHECKLIST.md` 5번에 항목 있음. 미착수. |
| **대상 파일** | `discovery-service.yaml:20-21`, `gateway-service.yaml:20-21`, `user-service.yaml:28-29`, `workspace-service.yaml:69-70`, `admin-service.yaml:58-59`, `mcp-service.yaml:28-29` |

---

### P0-07. Resource Requests/Limits — 전 Deployment 미설정

| 항목 | 내용 |
|---|---|
| **문제** | 6개 앱 서비스 + Prometheus + Grafana, 총 8개 Deployment 모두 `resources.requests`와 `resources.limits`가 없다. |
| **영향** | (1) kube-scheduler가 노드 리소스를 정확히 판단할 수 없어 과밀 배치(overcommit)가 발생한다, (2) 단일 Pod의 메모리 폭주가 노드 전체의 OOMKiller를 트리거해 다른 Pod까지 죽일 수 있다, (3) HPA가 CPU/메모리 기반으로 동작하려면 requests가 필수인데 설정이 없어 HPA 도입이 불가능하다, (4) QoS class가 BestEffort가 되어 리소스 경합 시 가장 먼저 축출된다. |
| **권장 수정** | (1) 서비스별 부하 테스트 후 적정 requests/limits 산정, (2) Spring Boot 서비스는 JVM 힙을 고려해 `requests.memory >= Xmx + 200Mi`, `limits.memory >= requests.memory * 1.5` 수준 설정, (3) Prometheus/Grafana는 공식 권장값 참고, (4) LimitRange를 네임스페이스에 적용해 기본값 강제 |
| **현재 상태** | `PRODUCTION_CHECKLIST.md` 8번에 항목 있음. 미착수. |
| **대상 파일** | 모든 Deployment YAML (8개) |

---

### P0-08. RBAC — ServiceAccount 미분리, 최소 권한 미적용

| 항목 | 내용 |
|---|---|
| **문제** | 모든 Pod가 `default` ServiceAccount로 실행된다. 전용 ServiceAccount, Role, RoleBinding이 없다. `automountServiceAccountToken: false`도 미설정이므로 모든 Pod에 API 서버 토큰이 자동 마운트된다. |
| **영향** | Pod 내부에서 `kubectl` 또는 Kubernetes API를 직접 호출해 네임스페이스 내 다른 리소스(Secret 포함)를 읽거나 조작할 수 있다. 컨테이너 탈출 시 공격 표면이 넓어진다. |
| **권장 수정** | (1) 서비스별 전용 ServiceAccount 생성, (2) 최소 권한 Role/RoleBinding(필요 없으면 빈 Role), (3) `automountServiceAccountToken: false` 설정 (API 호출이 불필요한 서비스), (4) EKS 전환 시 IRSA로 AWS 리소스 접근도 최소 권한 부여 |
| **현재 상태** | `PRODUCTION_CHECKLIST.md` 8번에 항목 있음. 미착수. |
| **대상 파일** | 모든 Deployment YAML (8개) |

---

## P1 Findings

### P1-01. PVC — Prometheus/Grafana 데이터 소실

| 항목 | 내용 |
|---|---|
| **문제** | Prometheus TSDB(`prometheus.yaml:40`)와 Grafana 데이터(`grafana.yaml:57-58`)가 모두 `emptyDir`로 구성되어 있다. Grafana의 대시보드 provisioning 마운트(`grafana.yaml:54-55`)도 `emptyDir`다. |
| **영향** | Pod 재생성(rollout restart, 노드 드레인, OOM 재시작) 시 Prometheus의 메트릭 히스토리, Grafana의 사용자 설정/대시보드가 전부 소실된다. 장애 발생 후 사후 분석을 위한 과거 메트릭이 없어진다. |
| **권장 수정** | (1) StorageClass 확정(EKS: EBS CSI gp3, k3s: local-path/Longhorn), (2) Prometheus/Grafana에 PVC 적용(retention 기간 고려한 용량 산정), (3) Grafana 대시보드는 ConfigMap 또는 Git 관리 자산으로 provisioning 고정, (4) 볼륨 백업/스냅샷 정책 수립 |
| **현재 상태** | 매니페스트에 "Local verification only" 주석이 있다. `PRODUCTION_CHECKLIST.md` 6번에 항목 있음. 미착수. |
| **대상 파일** | `k8s/monitoring/prometheus.yaml:39-40`, `k8s/monitoring/grafana.yaml:53-58` |

---

### P1-02. NetworkPolicy — default-deny 미적용

| 항목 | 내용 |
|---|---|
| **문제** | `brainx` 네임스페이스에 NetworkPolicy가 없다. 모든 Pod가 네임스페이스 내외의 모든 Pod/서비스에 자유롭게 통신할 수 있다. |
| **영향** | 공격자가 한 Pod에 접근하면 DB, Redis, 모니터링 등 모든 내부 서비스에 lateral movement가 가능하다. Pod→외부 인터넷 통신도 제한 없이 가능해 데이터 유출 경로가 열려 있다. |
| **권장 수정** | (1) `brainx` 네임스페이스에 default-deny ingress/egress 정책 적용, (2) 필요한 통신만 화이트리스트: Ingress→Gateway, Gateway→각 서비스, 서비스→DB/Redis/Kafka, (3) CNI가 NetworkPolicy를 지원하는지 확인 (k3s 기본 flannel은 미지원, Calico 필요) |
| **현재 상태** | `PRODUCTION_CHECKLIST.md` 8번에 항목 있음. 미착수. |
| **대상 파일** | 없음 (NetworkPolicy YAML 자체가 미존재) |

---

### P1-03. ConfigMap — 서비스별 비일관적 분리

| 항목 | 내용 |
|---|---|
| **문제** | ConfigMap 적용 방식이 서비스마다 다르다: Discovery/Gateway/User는 inline env, Admin/Workspace는 동일 YAML 파일 내 ConfigMap, MCP는 별도 YAML 파일 ConfigMap. |
| **영향** | (1) 운영 환경별 값 오버라이드가 서비스마다 다른 방식으로 필요해 관리 복잡도 증가, (2) User-Service에 18개 이상의 env가 Deployment에 직접 나열되어 있어 변경 시 Deployment 자체를 재적용해야 하고, Deployment 재적용은 Pod 재생성을 유발한다(ConfigMap 분리 시에는 ConfigMap만 변경 후 rollout restart로 분리 가능), (3) Helm 전환 시 통일 작업이 추가로 필요하다. |
| **권장 수정** | (1) 전 서비스를 ConfigMap + `envFrom` 패턴으로 통일, (2) 비민감 값만 ConfigMap, 민감 값은 Secret으로 분리 원칙 확인, (3) 환경별 오버라이드 전략 확정(Helm values / Kustomize overlay) |
| **현재 상태** | `HELM_DESIGN.md`에서 통일 계획이 언급됨. `PRODUCTION_CHECKLIST.md` 2번에 항목 있음. Workspace/MCP만 적용 완료. |
| **대상 파일** | `discovery-service.yaml`, `gateway-service.yaml`, `user-service.yaml` (inline env 유지 중) |

---

### P1-04. HPA — 자동 스케일링 미설정

| 항목 | 내용 |
|---|---|
| **문제** | 모든 Deployment가 `replicas: 1` 고정이며 HorizontalPodAutoscaler가 없다. |
| **영향** | (1) 트래픽 급증 시 수동 개입 없이는 스케일아웃이 불가능하다, (2) 단일 Pod 장애가 곧 전체 서비스 장애다, (3) `replicas: 1`에서 rolling update 시 maxSurge=0 전략으로 인해 짧은 다운타임이 발생한다(TROUBLESHOOTING.md 9번 사례). |
| **권장 수정** | (1) resources.requests 설정 선행(P0-07), (2) 핵심 서비스(Gateway, User, Workspace)에 HPA 적용(CPU/메모리 기반), (3) 최소 replicas=2로 단일 장애점 제거, (4) Cluster Autoscaler/Karpenter와 연동 |
| **현재 상태** | `PRODUCTION_CHECKLIST.md` 9번에 항목 있음. resources 설정이 선행되어야 HPA 도입 가능. |
| **대상 파일** | 모든 Deployment YAML (8개) |

---

### P1-05. PDB — PodDisruptionBudget 미설정

| 항목 | 내용 |
|---|---|
| **문제** | PodDisruptionBudget이 없다. |
| **영향** | 클러스터 유지보수(노드 drain, 업그레이드) 시 해당 서비스의 모든 Pod가 동시에 축출될 수 있어 서비스 중단이 발생한다. 현재 `replicas: 1`이므로 drain 시 100% 중단이다. |
| **권장 수정** | (1) `replicas >= 2` 선행(P1-04), (2) 서비스별 PDB 생성(`minAvailable: 1` 또는 `maxUnavailable: 1`), (3) 모니터링(Prometheus/Grafana)에도 PDB 적용 검토 |
| **현재 상태** | `PRODUCTION_CHECKLIST.md` 9번에 항목 있음. replicas 증가와 함께 진행해야 의미가 있다. |
| **대상 파일** | 없음 (PDB YAML 자체가 미존재) |

---

### P1-06. Alertmanager — 알림 체계 미구축

| 항목 | 내용 |
|---|---|
| **문제** | Prometheus에 Alertmanager가 없고 alerting rules도 없다. `prometheus-configmap.yaml`에 `alerting` 섹션이 없다. |
| **영향** | Pod CrashLoop, readiness 실패, DB 연결 장애, 노드 리소스 임계, 인증서 만료 등 운영 이벤트가 발생해도 아무도 통보받지 못한다. 장애를 수동 모니터링에만 의존하게 된다. |
| **권장 수정** | (1) Alertmanager Deployment + Service 배포, (2) 알림 채널 구성(Slack/Email/PagerDuty), (3) 핵심 알림 규칙 정의: `KubePodCrashLooping`, `KubePodNotReady`, `PostgresDown`, `RedisDown`, `NodeMemoryHighUtilization`, `CertificateExpiringSoon`, (4) Prometheus `alerting` 섹션 + rule files 추가 |
| **현재 상태** | `PRODUCTION_CHECKLIST.md` 7번에 항목 있음. 미착수. |
| **대상 파일** | `k8s/monitoring/prometheus-configmap.yaml` (alerting 섹션 없음), 새 파일 필요 |

---

### P1-07. Discovery — Eureka + 정적 매핑 혼재

| 항목 | 내용 |
|---|---|
| **문제** | Gateway는 `EUREKA_CLIENT_ENABLED=false`로 Eureka를 비활성화하고 `SPRING_APPLICATION_JSON`으로 정적 discovery 인스턴스를 주입한다. 나머지 서비스(User, Admin, Workspace, MCP)는 Eureka를 활성화한다. 서비스 디스커버리 전략이 혼재한다. |
| **영향** | (1) K8s 내부 서비스가 추가/이동되어도 Gateway의 정적 매핑은 자동 갱신되지 않는다, (2) 정적 매핑의 `host.docker.internal` 주소가 운영에서 동작하지 않는다(P0-04 연계), (3) Eureka 서버 자체가 단일 장애점이다(`replicas: 1`, `EUREKA_SERVER_ENABLE_SELF_PRESERVATION=false`). |
| **권장 수정** | (1) 운영 전환 시 서비스 디스커버리 전략 통일(Eureka 유지 vs Kubernetes native DNS 전환), (2) Eureka 유지 시 `replicas >= 2` + peer replication, (3) Gateway의 정적 매핑을 제거하고 Eureka `lb://` 또는 K8s Service DNS 기반으로 전환, (4) `EUREKA_SERVER_ENABLE_SELF_PRESERVATION`을 운영에서는 `true`로 복원(현재 `false`는 로컬 검증 편의용) |
| **현재 상태** | README에 "완전한 Gateway 전환은 Compose 대상 서비스들의 Discovery 전략까지 함께 정리된 뒤에 진행하는 것이 안전하다"고 명시. |
| **대상 파일** | `discovery-service.yaml:29`, `gateway-service.yaml:38-46` |

---

### P1-08. Gateway — SPRING_APPLICATION_JSON 인라인 JSON 위험

| 항목 | 내용 |
|---|---|
| **문제** | Gateway의 `SPRING_APPLICATION_JSON`이 YAML 문자열 안에 중첩 JSON으로 7개 서비스 URI를 담고 있다. 이 JSON은 중괄호가 7단 중첩이며, 한 줄에 모든 내용이 있다(`gateway-service.yaml:46`). |
| **영향** | (1) `TROUBLESHOOTING.md` 1번에 기록된 대로, 중괄호 누락으로 `CrashLoopBackOff` 장애가 이미 발생한 이력이 있다, (2) 사람이 리뷰하기 어려운 한 줄 JSON이라 수정 시 오류 가능성이 높다, (3) 서비스 추가/제거 시 JSON 구조를 직접 편집해야 한다. |
| **권장 수정** | (1) `SPRING_APPLICATION_JSON`을 ConfigMap의 개별 key-value로 분리하거나, (2) Helm 전환 시 `tpl`/`toJson` helper로 렌더링해 중괄호 오류를 원천 차단, (3) 최소한 멀티라인 YAML 블록으로 가독성 확보 |
| **현재 상태** | TROUBLESHOOTING.md에 사례가 기록되어 있다. HELM_DESIGN.md에서 `toJson` helper 렌더링 계획이 언급됨. |
| **대상 파일** | `k8s/apps/gateway-service.yaml:44-46` |

---

### P1-09. Prometheus — scrape 대상 불완전

| 항목 | 내용 |
|---|---|
| **문제** | (1) `mcp-service`는 `/actuator/prometheus`를 노출하지 않아 scrape job이 주석 처리되어 있다, (2) `ingestion-service`, `commerce-service`, `intelligence-service`는 K8s Service 자체가 없어 scrape 대상에서 제외되어 있다, (3) `discovery-service`도 scrape 대상에 포함되어 있지 않다. |
| **영향** | 모니터링 사각지대가 존재한다. MCP 서비스의 성능/오류 메트릭을 수집할 수 없고, 아직 K8s로 전환되지 않은 3개 서비스는 Prometheus 관측 범위 밖이다. |
| **권장 수정** | (1) MCP-Service에 `micrometer-registry-prometheus` 의존성 추가 + SecurityConfig에서 `/actuator/prometheus` 허용, (2) 나머지 서비스 K8s 전환 시 scrape job 활성화, (3) Discovery-Service scrape 추가 검토, (4) 장기적으로 ServiceMonitor(Prometheus Operator) 기반 자동 scrape 전환 |
| **현재 상태** | `prometheus-configmap.yaml`에 주석과 함께 미래 대상이 정리되어 있다. |
| **대상 파일** | `k8s/monitoring/prometheus-configmap.yaml:56-93` |

---

### P1-10. Grafana — 대시보드 provisioning 미영속화

| 항목 | 내용 |
|---|---|
| **문제** | Grafana 대시보드 마운트 경로(`/etc/grafana/dashboards`)가 `emptyDir`다(`grafana.yaml:54-55`). Datasource/dashboard provider 설정은 ConfigMap으로 고정되어 있으나, 실제 대시보드 JSON 파일은 영속화되지 않는다. |
| **영향** | 운영팀이 만든 대시보드가 Pod 재생성 시 모두 소실된다. 장애 대응 중 대시보드가 없어지면 모니터링 공백이 발생한다. |
| **권장 수정** | (1) 대시보드 JSON을 ConfigMap 또는 Git 관리 자산으로 고정, (2) Grafana 데이터 볼륨을 PVC로 전환(P1-01 연계), (3) 대시보드 as-code 도구(Grafonnet, Terraform) 도입 검토 |
| **현재 상태** | README "후속 운영 보완 항목"에 "Grafana dashboard JSON/provisioning 자산을 ConfigMap 또는 파일 자산으로 분리" 명시. |
| **대상 파일** | `k8s/monitoring/grafana.yaml:53-55` |

---

## P2 Findings

### P2-01. Probe — 서비스별 비일관적 구성

| 항목 | 내용 |
|---|---|
| **문제** | probe 경로와 종류가 서비스마다 다르다: Discovery/Gateway는 `/actuator/health`, User/Admin/Workspace는 `/actuator/health/readiness`+`/liveness`, MCP는 `/actuator/health`. `startupProbe`는 User/MCP만 있고 나머지 4개는 없다. `initialDelaySeconds`도 20~80초로 서비스별로 다르다. |
| **영향** | (1) `startupProbe`가 없는 서비스(Discovery, Gateway, Admin, Workspace)는 기동이 느릴 경우 liveness probe가 먼저 실패해 불필요한 재시작이 발생할 수 있다, (2) 일관성 없는 probe 구성은 운영 중 문제 진단을 어렵게 한다. |
| **권장 수정** | (1) 모든 서비스에 `startupProbe` 추가(Spring Boot 서비스는 기동 시간이 긴 편), (2) readiness/liveness 경로를 `/actuator/health/readiness`, `/actuator/health/liveness`로 통일, (3) HELM_DESIGN.md에서 제안한 대로 probe 값을 values로 추출해 서비스별 적정값 관리 |
| **현재 상태** | HELM_DESIGN.md 2.2에서 "probe를 값으로 관리" 방침이 설계됨. |
| **대상 파일** | `discovery-service.yaml:30-45`, `gateway-service.yaml:47-62`, `admin-service.yaml:112-128`, `workspace-service.yaml:106-122` |

---

### P2-02. securityContext — 미설정

| 항목 | 내용 |
|---|---|
| **문제** | 모든 Deployment에 Pod/Container 수준 `securityContext`가 없다. `runAsNonRoot`, `readOnlyRootFilesystem`, `allowPrivilegeEscalation: false`, `capabilities.drop: [ALL]`이 모두 미적용이다. |
| **영향** | (1) 모든 컨테이너가 root로 실행될 수 있다, (2) 컨테이너 내에서 privilege escalation이 가능하다, (3) Pod Security Admission `restricted` 수준을 충족하지 못한다. |
| **권장 수정** | (1) 모든 Deployment에 `securityContext: { runAsNonRoot: true, readOnlyRootFilesystem: true, allowPrivilegeEscalation: false, capabilities: { drop: [ALL] } }` 적용, (2) 필요한 경우 `runAsUser`, `runAsGroup`, `fsGroup` 지정, (3) Dockerfile에서 non-root USER 사용 확인, (4) `brainx` 네임스페이스에 `pod-security.kubernetes.io/enforce: restricted` 라벨 적용 |
| **현재 상태** | `PRODUCTION_CHECKLIST.md` 8번에 항목 있음. |
| **대상 파일** | 모든 Deployment YAML (8개) |

---

### P2-03. Helm 전환 — 설계만 완료, 구현 미착수

| 항목 | 내용 |
|---|---|
| **문제** | `HELM_DESIGN.md`에 상세한 Helm Chart 설계가 완료되어 있으나 실제 Chart 파일(`Chart.yaml`, `values.yaml`, templates)은 생성되지 않았다. raw manifest와 Helm Chart가 병행 관리될 기간이 길어질수록 드리프트 위험이 커진다. |
| **영향** | (1) 환경별 값 오버라이드, 일괄 배포, 롤백이 불편하다, (2) 수동 `kubectl apply` 순서 관리로 인한 운영 실수 위험이 남아 있다, (3) 새 서비스 추가 시 매번 동일한 보일러플레이트 YAML을 복사해야 한다. |
| **권장 수정** | `HELM_DESIGN.md` Phase 1~7 순서대로 착수. Discovery 파일럿 → 확장 → 모니터링 편입 → 환경 오버라이드. |
| **현재 상태** | Phase 0(설계 확정) 완료. Phase 1 미착수. |
| **대상 파일** | `k8s/helm/HELM_DESIGN.md` |

---

## 종합 매트릭스

| # | 검토 항목 | 우선순위 | 관련 서비스 | Finding ID |
|---|---|---|---|---|
| 1 | Secret 평문 관리 | P0 | 전체 | P0-01 |
| 2 | Secret Git 이력 유출 | P0 | 전체 | P0-02 |
| 3 | JWT_SECRET 분산 저장 | P0 | Gateway, User, Workspace, Admin, MCP | P0-03 |
| 4 | host.docker.internal | P0 | Gateway, User, Workspace, Admin, MCP | P0-04 |
| 5 | Ingress / TLS | P0 | 전체 | P0-05 |
| 6 | 이미지 레지스트리 | P0 | 전체 앱 서비스 | P0-06 |
| 7 | Resource Requests/Limits | P0 | 전체 | P0-07 |
| 8 | RBAC | P0 | 전체 | P0-08 |
| 9 | PVC | P1 | Prometheus, Grafana | P1-01 |
| 10 | NetworkPolicy | P1 | 전체 | P1-02 |
| 11 | ConfigMap 비일관 | P1 | Discovery, Gateway, User | P1-03 |
| 12 | HPA | P1 | 전체 앱 서비스 | P1-04 |
| 13 | PDB | P1 | 전체 | P1-05 |
| 14 | Alertmanager | P1 | Monitoring | P1-06 |
| 15 | Discovery 전략 혼재 | P1 | Discovery, Gateway | P1-07 |
| 16 | Gateway JSON 위험 | P1 | Gateway | P1-08 |
| 17 | Prometheus scrape 불완전 | P1 | MCP, 미전환 서비스 | P1-09 |
| 18 | Grafana 대시보드 | P1 | Grafana | P1-10 |
| 19 | Probe 비일관 | P2 | Discovery, Gateway, Admin, Workspace | P2-01 |
| 20 | securityContext | P2 | 전체 | P2-02 |
| 21 | Helm 전환 미착수 | P2 | 전체 | P2-03 |

---

## 운영 전환 권장 순서

### Phase 1: P0 보안/기반 (운영 배포 전 필수)

1. Secret 외부화 + 운영 값 신규 발급 (P0-01, P0-02, P0-03)
2. host.docker.internal 전량 제거 (P0-04)
3. 이미지 레지스트리 + CI/CD 파이프라인 (P0-06)
4. Ingress + TLS (P0-05)
5. RBAC + ServiceAccount (P0-08)
6. Resource Requests/Limits (P0-07)

### Phase 2: P1 안정성/관측성 (운영 초기)

7. PVC 영속화 (P1-01)
8. NetworkPolicy (P1-02)
9. ConfigMap 표준화 (P1-03)
10. replicas >= 2 + PDB (P1-04, P1-05)
11. Alertmanager + 알림 규칙 (P1-06)
12. 서비스 디스커버리 전략 통일 (P1-07)
13. Gateway JSON 분리 (P1-08)
14. Prometheus scrape 확장 (P1-09)
15. Grafana 대시보드 고정 (P1-10)

### Phase 3: P2 안정화 이후

16. Probe 통일 (P2-01)
17. securityContext 적용 (P2-02)
18. Helm Chart 구현 (P2-03)
19. HPA 고도화 (커스텀 메트릭)
20. Canary/Blue-Green (Argo Rollouts)
21. GitOps (ArgoCD/Flux)

---

## 기존 문서와의 관계

| 기존 문서 | 이 리뷰와의 관계 |
|---|---|
| `PRODUCTION_CHECKLIST.md` | 운영 전환 체크리스트. 이 리뷰의 P0/P1 항목과 대부분 일치하며 이미 잘 정리되어 있다. 이 리뷰는 현재 매니페스트를 직접 분석해 구체적 파일/라인 단위 소견을 추가한다. |
| `HELM_DESIGN.md` | Helm Chart 설계 문서. ConfigMap 통일, host.docker.internal 변수화, Secret 외부 참조 등 이 리뷰의 권장 수정 방향과 정합한다. |
| `TROUBLESHOOTING.md` | 실제 장애 사례 모음. 이 리뷰의 P1-08(Gateway JSON), P0-07(리소스 미설정 → OOM)과 직접 관련된다. |
| `README.md` | 전환 메모와 주의사항. 이 리뷰의 근거 자료로 활용했다. |
| `SETUP.md` | 로컬 셋업 절차. 이 리뷰에서 지적한 Secret 관리 절차의 현재 상태 근거다. |

---

> 이 문서는 기존 코드/매니페스트를 수정하지 않으며, 운영 전환 관점의 리뷰 소견만 정리한다.

SSOT 계약에 맞게 구현 완료
