# BrainX EC2 + k3s 전환 계획

> 작성일: 2026-07-09
> 문서 성격: **계획/의사결정 문서**. 이 문서 자체는 AWS 리소스를 만들지 않고, workflow 파일을 만들지 않고, 기존 `k8s/` YAML을 고치지 않고, Secret 실제 값을 적지 않는다.
> 목적: **기존 운영 EC2(`infra/aws-dev`)를 건드리지 않고**, 새 EC2에 k3s를 올려 현재 로컬(Docker Desktop Kubernetes) 검증 구성을 옮기기 위한 단계별 계획을 정리한다.

---

## 0. 출발점 요약

| 항목 | 현재 상태 |
| --- | --- |
| 로컬 검증 | Docker Desktop Kubernetes, `namespace/brainx`, 9개 앱 서비스(discovery/gateway/user/workspace/admin/mcp/ingestion/intelligence/commerce) `1/1 Running` 확인 완료 |
| 연결 방식 | 다수 매니페스트가 `host.docker.internal` 경유(Postgres/Redis/Neo4j/Kafka/Qdrant 및 앱 간 호출) |
| 기존 운영 EC2 | `infra/aws-dev/` — Terraform + GitHub Actions(`brainx-dev-deploy.yml`) + ECR + SSM + **Docker Compose**(k8s 아님) 기반. 단일 EC2(`m8i.xlarge`, 16GiB RAM), RDS PostgreSQL, S3, Caddy 리버스 프록시. **이 문서의 전제상 절대 변경 대상이 아니다.** |
| 기존 문서 | `k8s/PRODUCTION_CHECKLIST.md`, `k8s/PRODUCTION_REVIEW.md`에 운영 전환 공통 체크리스트가 이미 상세히 정리되어 있음. 이 문서는 그 내용을 **"새 EC2 + k3s"라는 구체적 경로**에 맞춰 실행 순서로 재구성한 것이다. |

이 문서는 기존 두 체크리스트/리뷰 문서와 중복 설명을 피하고, 필요한 부분은 참조만 한다.

---

## 1. 새 EC2 준비 항목

기존 `infra/aws-dev`의 단일 EC2(m8i.xlarge, 16GiB RAM + 8GiB swap)가 9개 백엔드 + 프론트 2종 + 모니터링 + Redis/Neo4j/Qdrant/Kafka를 Compose로 전부 수용하고 있다는 점을 기준선으로 삼는다. k3s는 여기에 control plane(containerd, k3s server, local-path-provisioner 등) 오버헤드가 추가로 붙는다.

체크리스트 (실제 생성은 하지 않음, 준비 항목만 정리):

- [ ] **인스턴스 사이징**: 기존과 동급 이상(예: `m8i.xlarge` 또는 `m8i.2xlarge`) 검토. k3s + containerd 오버헤드(수백 MB~1GiB)를 감안.
- [ ] **OS**: k3s 공식 지원 대상(Ubuntu 22.04/24.04 LTS 또는 Amazon Linux 2023) 중 팀 표준에 맞춰 선택.
- [ ] **스토리지**: root EBS(gp3) 용량 산정 — ECR에서 받는 이미지 레이어 + `local-path-provisioner` 기반 PVC(Prometheus/Grafana 등) 공간 포함.
- [ ] **네트워킹**: 기존과 **완전히 분리된 새 Security Group** 생성 대상으로 지정(기존 SG 재사용 금지). 필요한 인바운드만 최소로 열 계획(6443은 관리 목적 IP 제한, 80/443은 Ingress 선택 시에만, SSH 22는 SSM 사용 시 불필요).
- [ ] **IAM**: 새 인스턴스 전용 Instance Profile/Role — ECR pull, SSM Managed Instance Core 정도로 최소 권한. **기존 EC2 Role과 절대 공유하지 않음**(8장 안전장치와 직결).
- [ ] **네트워크 위치**: 기존과 같은 VPC를 쓸지, 별도 VPC/서브넷을 쓸지 결정. 같은 VPC라면 기존 SG와의 상호 인바운드를 열지 않는 것을 기본값으로 한다.
- [ ] **Elastic IP / DNS**: 기존 `<public-domain>`, `admin.<public-domain>`과 무관한 새 EIP·새 서브도메인(예: `k3s-poc.<domain>`) 후보만 검토. 기존 DNS 레코드는 변경하지 않는다.
- [ ] **태깅/네이밍**: `Name=brainx-k3s-poc`, `Project=brainx`, `Environment=k3s-poc` 등으로 기존 리소스와 시각적으로 확실히 구분.
- [ ] **swap**: 메모리 사이징 결과에 따라 필요 여부 결정(기존 EC2는 8GiB swap 사용 중).

---

## 2. k3s 설치 절차 정리

(실행하지 않고 절차만 정리 — 실제 EC2가 준비된 이후 별도 작업에서 수행)

1. k3s 설치: `curl -sfL https://get.k3s.io | sh -` (단일 노드, control-plane + worker 겸용).
2. 기본 Ingress(Traefik) 유지 여부 결정 — PoC 초기에는 기본값 유지 권장(6장 참고), 이후 `--disable traefik`로 nginx-ingress 등으로 교체할 수 있음을 인지만 해둔다.
3. 설치 확인:
   - `systemctl status k3s`
   - `k3s kubectl get nodes` (노드 `Ready` 확인)
4. kubeconfig 반출: `/etc/rancher/k3s/k3s.yaml`을 로컬로 복사 후 `server:` 주소를 EC2 공인/사설 IP로 치환하여 로컬 `kubectl` 접근 구성.
5. 컨테이너 런타임 확인: k3s는 기본적으로 containerd를 사용(Docker 아님) — ECR private repo 이미지를 받으려면 `imagePullSecrets` 또는 노드 레벨 `containerd` registry 인증 설정이 필요함을 미리 인지.
6. 기본 StorageClass 확인: `local-path`가 기본 제공되므로 Prometheus/Grafana PVC 등에 우선 활용 가능(6번 항목, `PRODUCTION_CHECKLIST.md` 6장과 연결).
7. `namespace/brainx` 생성은 기존 `k8s/namespace.yaml`을 그대로 재사용(내용 변경 없음).

---

## 3. 이미지 레지스트리 전략 — ECR vs Docker Hub

| 기준 | ECR | Docker Hub(Private) |
| --- | --- | --- |
| 기존 저장소와의 연계 | `infra/aws-dev`가 이미 ECR + GitHub OIDC + Buildx 캐시 파이프라인을 갖추고 있어 재사용 용이 | 별도 계정/토큰 관리 필요, 기존 파이프라인과 이원화 |
| 인증 | IAM Role 기반(OIDC), 새 EC2에는 **읽기 전용 새 Role**만 추가하면 됨 | Docker Hub PAT/Secret 별도 관리, GitHub Secrets에 추가 저장 필요 |
| 비용/제한 | 저장 용량 과금, private repo 무제한 | 무료 티어 pull rate limit 존재(운영 트래픽엔 부담) |
| 격리 수준 | 같은 레지스트리를 "읽기"만 하므로 기존 EC2에 영향 없음(빌드/푸시는 그대로 기존 파이프라인 유지 가능) | 완전히 별도 시스템이라 격리는 확실하지만 관리 포인트가 늘어남 |

**권장**: 기존 ECR 레지스트리를 그대로 재사용한다. 이미지 **pull은 읽기 전용 동작**이라 기존 EC2/파이프라인에 영향이 없다. 새 EC2용 IAM Role에는 `ecr:GetAuthorizationToken`, `ecr:BatchGetImage`, `ecr:GetDownloadUrlForLayer` 정도의 **읽기 전용 권한만** 부여하고, 기존 GitHub Actions push 권한(Role)과는 절대 겸용하지 않는다. 완전한 분리를 원한다면 `brainx-k3s-<service>` 네이밍의 신규 ECR repo를 별도로 두는 방안도 대안으로 남겨둔다.

### 3-1. ECR 사용을 전제로 사람이 준비해야 할 것 (요약)

| 항목 | 내용 |
| --- | --- |
| EC2 IAM Role | 새 EC2 전용 Instance Profile/Role 신규 생성. 기존 EC2 Role과 공유 금지(1장 IAM 항목과 동일 원칙) |
| ECR pull 권한 | 위 Role에 `ecr:GetAuthorizationToken` / `ecr:BatchGetImage` / `ecr:GetDownloadUrlForLayer` 읽기 전용만 부여. push 권한(GitHub Actions Role)과 절대 겸용하지 않음 |
| image tag | 7.2절 태그 정책(`git sha` 또는 `k3s-poc-latest`)에 맞춰 매니페스트 `image:` 필드를 `<ECR_REGISTRY>/brainx-<service>:<tag>`로 지정. `:local`(Docker Desktop 로컬 빌드용) 태그는 EC2 대상 매니페스트에 남기지 않음 |
| imagePullPolicy | 무버블 태그(`k3s-poc-latest`) 사용 시 `Always` 권장, 고정 sha 태그면 `IfNotPresent`도 무방 |

실제 확인/적용 절차(명령어 단위)는 [EC2_K3S_RUNBOOK.md](EC2_K3S_RUNBOOK.md) 5-1절에 정리돼 있다. `docker save/scp/import`(EC2_K3S_RUNBOOK.md 5-2절)는 ECR 준비 전 임시 검증용 보조 경로일 뿐, 정상 배포 경로가 아니다.

---

## 4. host.docker.internal 제거 대상 목록

`k8s/PRODUCTION_CHECKLIST.md` 1장(P0-04)과 `k8s/PRODUCTION_REVIEW.md` P0-04에 이미 파일/라인 단위 인벤토리가 정리되어 있다. 이 절에서는 그 목록을 그대로 인용하고, "EC2 k3s PoC"라는 구체적 목적지 기준으로 치환 방향만 추가한다.

### 제거 대상 (기존 리뷰 인용)

- `k8s/apps/gateway-service.yaml` — `SPRING_APPLICATION_JSON` 정적 discovery 인스턴스 7개 (`http://host.docker.internal:8080~8087`)
- `k8s/apps/workspace-service.yaml`(ConfigMap 인라인) — `POSTGRES_HOST`, `REDIS_HOST`, `NEO4J_URI(bolt://host.docker.internal:7687)`, `SPRING_KAFKA_BOOTSTRAP_SERVERS(host.docker.internal:9093)`
- `k8s/apps/user-service.yaml` — Postgres/Redis/Workspace-Service 경로
- `k8s/apps/admin-service.yaml` — Postgres/Kafka/Gateway/다른 앱 서비스 경로
- `k8s/apps/ingestion-service-configmap.yaml` — Postgres/Workspace-Service/Kafka 경로
- `k8s/apps/commerce-service.yaml` — Postgres/Kafka 경로
- `k8s/apps/intelligence-service-configmap.yaml` — Postgres/Redis/Kafka/Qdrant/Commerce 경로(Workspace만 in-cluster `http://workspace-service:8082` 사용 중)
- `k8s/apps/mcp-service-configmap.yaml` — Postgres/Workspace/Intelligence 경로 + OAuth 공개 URL(`http://localhost:3000` 계열) 4종

> 참고: 현재 작업 브랜치(`infra/k8s-migration`)에 `k8s/apps/commerce-service.yaml`, `k8s/apps/ingestion-service.yaml`의 미커밋 변경이 이미 존재한다. 이 문서 작성 중에는 해당 파일을 읽지도, 손대지도 않았다 — 기존 진행 중인 작업으로 간주하고 그대로 둔다.

### EC2 k3s 목적지 기준 치환 방향 (결정 필요, 이번 문서 범위는 "옵션 제시"까지)

| 옵션 | 설명 | 장단점 |
| --- | --- | --- |
| **A. 앱만 k3s, 인프라는 같은 EC2에 Compose 유지** | Postgres/Redis/Neo4j/Kafka/Qdrant는 기존 `infra/aws-dev` 패턴처럼 같은 EC2에서 Docker Compose로 띄우고, k3s Pod는 `host.docker.internal` 대신 **해당 EC2의 사설 IP** 또는 **Docker bridge gateway IP**로 접근 | 인프라 이전 작업이 거의 없어 1차 PoC에 빠름. 다만 "EC2 하나에 Compose+k3s 혼재"라 `PRODUCTION_CHECKLIST.md` 3장의 "관리형 vs in-cluster" 결정을 그대로 미루는 셈 |
| **B. 인프라까지 k3s in-cluster로 전환** | Postgres/Redis/Neo4j/Kafka/Qdrant를 k3s StatefulSet + PVC(local-path)로 이전 | `PRODUCTION_CHECKLIST.md` 3장 방향과 정합하지만, 이번 PoC 범위를 넘는 추가 작업(StatefulSet 설계, 백업 등)이 필요 |

**권장**: 1차 PoC는 **옵션 A**로 시작해 "앱이 k3s 위에서 정상 기동하는지"만 먼저 검증하고, 옵션 B는 `PRODUCTION_CHECKLIST.md` 3장 스케줄에 맞춰 후속 단계로 분리한다. 두 옵션 모두 공통으로 `grep host.docker.internal k8s/apps/ k8s/monitoring/` 결과가 0건이 되는 것이 최종 목표다(현재는 30건 이상).

---

## 5. EC2용 ConfigMap/Secret 변경 항목 정리

(실제 값 작성/적용 없이, "무엇을 바꿔야 하는가" 목록만 정리)

### ConfigMap 쪽

- [ ] 4장에서 나열한 `host.docker.internal:<port>` 값 전체를 옵션 A/B 결정에 따라 실제 도달 가능한 호스트로 교체해야 하는 항목으로 표시
- [ ] `mcp-service-configmap.yaml`의 OAuth 공개 URL 4종(`PUBLIC_BASE_URL`, `BRAINX_OAUTH_ISSUER`, `BRAINX_MCP_RESOURCE`, `BRAINX_MCP_PROTECTED_RESOURCE_METADATA_URL`)을 새 EC2의 공개 origin(도메인 또는 IP:port)으로 통일 — `user-service`의 동일 설정과도 일치해야 함
- [ ] Gateway `SPRING_APPLICATION_JSON` 정적 매핑 7개를 새 목적지로 변경(P1-08의 "JSON 위험" 이슈는 이번 전환에서 같이 개선할지 별도 결정 필요)

### Secret 쪽

- [ ] 로컬 검증에 쓰던 임시 값(현재 `k8s/secrets/*.yaml` 실제 파일에 들어간 값)을 **그대로 재사용하지 않는다** — 새 EC2용 값은 신규 발급 대상(`PRODUCTION_CHECKLIST.md` P0-02/P0-03과 동일한 원칙)
- [ ] 신규 발급이 필요한 키 목록(값은 이번 문서에서 작성하지 않음):
  - `gateway-secret`: `SERVICE_TOKEN`, `JWT_SECRET`
  - `postgres-secret`: `POSTGRES_USER`, `POSTGRES_PASSWORD`
  - `workspace-secret`: `JWT_SECRET`(gateway와 동일 값), `NEO4J_PASSWORD`
  - `admin-service-secret`: `JWT_SECRET`, `MAIL_USERNAME`, `MAIL_PASSWORD`, `SEED_ADMIN_LOGIN_ID`, `SEED_ADMIN_PASSWORD`, `SEED_ADMIN_NAME`
  - `mcp-service-secret`: `JWT_SECRET`
  - `ingestion-service-secret`: `NOTION_CLIENT_ID`, `NOTION_CLIENT_SECRET`
  - `commerce-service-secret`: `JWT_SECRET`, `TOSS_CLIENT_KEY`, `TOSS_SECRET_KEY`
  - `intelligence-service-secret`: `OPENAI_API_KEY`, `QDRANT_API_KEY`, `VOYAGE_API_KEY`
  - `grafana-secret`: `GF_SECURITY_ADMIN_USER`, `GF_SECURITY_ADMIN_PASSWORD`
- [ ] `JWT_SECRET`이 `gateway-secret`/`workspace-secret`/`admin-service-secret`/`mcp-service-secret` 4곳에 동일하게 들어가야 한다는 기존 규칙(P0-03) 유지 — 새 값 발급 시에도 4곳 동시 반영 필요
- [ ] 기존 `.gitignore` 규칙(`k8s/secrets/*.yaml`, `!k8s/secrets/*.example.yaml`)을 새 EC2 배포 절차에서도 동일하게 적용 — 실제 Secret은 여전히 Git에 올리지 않는다
- [ ] namespace는 기존 `brainx`를 재사용할지, 구분을 위해 `brainx-k3s`로 분리할지 결정 필요(선택 사항, 필수 아님)

### ConfigMap/Secret 적용 방식 — Kustomize overlay 상태 (구현 완료, 값 채우기 후속)

위 ConfigMap/Secret 변경 항목(호스트 값 교체, 이미지 태그 등)을 환경별로 어떻게 구조화해 적용할지는 `k8s/KUSTOMIZE_OVERLAY_DESIGN.md`에 설계가 정리돼 있고, 그 설계가 그대로 구현됐다: `k8s/base`(기존 `k8s/apps/*.yaml`을 상대경로로만 참조, 복제 없음) + `k8s/overlays/local`(항등 오버레이) + `k8s/overlays/dev`(ECR 이미지 치환 + `host.docker.internal` 값 patch).

**현재 상태: `k8s/base/`, `k8s/overlays/local/`, `k8s/overlays/dev/`(patches 8개 포함) 파일 생성 완료, `kubectl kustomize` 렌더링 검증 완료, dev overlay `host.docker.internal` 0건 확인 완료.** dev overlay의 ECR registry/image tag, `<EC2_HOST>` 등은 여전히 placeholder이며 실제 EC2 값 채우기와 실제 `kubectl apply -k` 실행은 아직 하지 않았다. 참고: dev overlay는 `LoadRestrictionsNone` 옵션(`--load-restrictor LoadRestrictionsNone`) 없이는 렌더링/적용이 되지 않으므로, [EC2_K3S_RUNBOOK.md](EC2_K3S_RUNBOOK.md) 7장 명령에는 이 옵션이 포함되어야 한다. 값 채우기 전까지는 [EC2_K3S_RUNBOOK.md](EC2_K3S_RUNBOOK.md) 7장 기준으로 `kubectl apply -f`를 파일 단위로 직접 실행하는 절차도 함께 유효하다.

---

## 6. NodePort 또는 Ingress 선택 기준

| 기준 | NodePort | Ingress(Traefik 기본 내장 또는 nginx) |
| --- | --- | --- |
| 구성 난이도 | 낮음 — Service만 `type: NodePort`로 바꾸면 됨 | Ingress 리소스 + 컨트롤러 설정 필요 |
| TLS | 기본 없음(별도 처리 필요) | cert-manager 등과 연계해 TLS 종료 가능 |
| 진입점 | 서비스마다 다른 포트(30000~32767) 노출 | 도메인/경로 기반 단일 진입점(Gateway로 통합 가능) |
| 운영 성숙도 | PoC/스모크 테스트에 적합 | 실제 운영 후보에 가까움(`PRODUCTION_CHECKLIST.md` P0-05와 정합) |
| 확장성 | 서비스가 늘수록 포트 관리가 번거로움 | 호스트/경로 라우팅으로 확장에 유리 |

**권장 기준**:

- "Pod가 k3s 위에서 정상 기동하고 Gateway를 통해 API가 응답하는지"만 먼저 확인하려면 → **NodePort로 Gateway-Service 하나만** 임시 노출(가장 빠르고 노출 표면도 최소).
- 도메인/TLS를 붙여 실사용 후보로 검증하려면 → **Ingress + TLS**로 전환(이 경우 `PRODUCTION_CHECKLIST.md` 4장 항목을 함께 진행).
- 이번 PoC 1차 목표는 전자(NodePort)로 잡고, 후자는 검증 통과 이후 별도 단계로 분리하는 것을 권장한다.

---

## 7. GitHub Actions에서 새 EC2로 수동 배포하는 workflow 전략 (파일 생성 없이 전략만)

기존 `.github/workflows/brainx-dev-deploy.yml`은 OIDC 인증 + ECR + SSM `AWS-RunShellScript` + Docker Compose 재기동 패턴을 이미 갖추고 있다(`preflight` → `detect` → `build`(matrix) → `deploy` 4단계, `concurrency: brainx-dev-deploy`). 새 workflow(가칭 `brainx-k3s-deploy.yml`, **이번 단계에서는 파일을 만들지 않는다**)는 이 구조를 재사용하되 **기존 workflow와 완전히 분리된 별도 파일·별도 트리거·별도 IAM Role·별도 Variables**로 설계한다.

### 7.1 workflow_dispatch 기반 수동 실행 전략

- **트리거**: `workflow_dispatch`만 사용. `push` 트리거는 두지 않는다(자동 배포 경로 자체를 없애 오발동 가능성을 구조적으로 제거).
- **입력값 설계**:
  | 입력 | 타입 | 기본값 | 용도 |
  | --- | --- | --- | --- |
  | `confirm_target` | string, required | (없음) | 정확히 `DEPLOY-K3S-POC` 같은 고정 리터럴을 입력해야만 통과. 오탈자/오발동 방지용 1차 관문(기존 workflow에는 없는 안전장치, 새로 도입) |
  | `services` | string | `""`(전체 9개 + frontend) | 배포 대상 서비스 목록. 기존 `services` 입력과 동일한 공백/콤마 구분 |
  | `image_tag` | string | `${{ github.sha }}` | 이미 ECR에 push된 과거 태그를 지정하면 재빌드 없이 그 태그로 재배포(9-1 롤백 절차와 연결) |
  | `skip_build` | boolean | `false` | true면 build job 전체를 skip하고 `image_tag`로 바로 deploy job만 실행 |
  | `dry_run` | boolean | `false` | true면 원격 스크립트가 `kubectl apply --dry-run=server` / `kubectl diff`만 수행하고 실제 적용은 하지 않음 |
- **preflight 강화**: 기존 `preflight` job의 "필수 Variables 존재 확인" 패턴을 그대로 재사용하되, `confirm_target != 'DEPLOY-K3S-POC'`이면 즉시 실패하는 체크를 추가한다.
- **GitHub Environment 게이트**: repo에 `k3s-poc`라는 Environment를 새로 만들고 **Required reviewers**를 지정한다. workflow의 `deploy` job에 `environment: k3s-poc`를 지정하면, `confirm_target` 입력값과는 별개로 GitHub 자체 승인 절차(사람이 Run을 누른 뒤 별도 리뷰어가 한 번 더 승인)가 강제된다. 이 Environment 안에 Section 7.4의 Secrets/Variables를 스코프하면, `k3s-poc` environment를 참조하지 않는 기존 워크플로/job은 애초에 이 값들을 읽을 수 없다.

### 7.2 ECR build/push matrix 전략

- 기존 `build` job의 `strategy.matrix.service` + 서비스별 `CONTEXT`/`DOCKERFILE` 매핑(`case "$SERVICE" in ...`)을 **그대로 재사용**한다. 이 매핑 로직 자체는 서비스 소스 경로에 대한 사실이라 k3s 배포라고 달라지지 않는다.
- 변경 감지(`detect_changed_services.py`)는 재사용하지 않는다(4장/9장에서 이미 언급) — manual dispatch이므로 `services` 입력이 비어 있으면 9개 서비스 + `frontend` 전체를 매트릭스로 돌리고, 값이 있으면 그 목록만 돌린다. 즉 "변경 감지"가 아니라 "입력 기반 선택"으로 단순화한다.
- `fail-fast: false`는 유지(한 서비스 빌드 실패가 나머지 서비스 빌드를 막지 않도록). 다만 `deploy` job은 기존과 동일하게 `needs.build.result == 'success' || needs.build.result == 'skipped'` 조건으로 막아, 매트릭스 중 하나라도 실패하면 배포 단계 자체가 진행되지 않게 한다.
- **태그 정책**: `$IMAGE_TAG`(sha)에 더해 기존 `dev-latest`와 이름이 겹치지 않는 `k3s-poc-latest` 같은 별도 무버블 태그를 사용한다. 같은 ECR repo(`brainx-dev-<service>`)를 재사용하더라도(3장 결정) **push는 새 태그만 추가하는 동작**이라 기존 `dev-latest`를 가리키는 기존 EC2 Compose 배포에는 영향이 없다 — 기존 EC2는 태그를 pull-on-deploy 방식으로만 갱신하지, ECR push 자체를 구독하지 않기 때문이다.
- **레지스트리 인증 차이**: 기존 EC2(Docker)는 push 권한이 필요하지만, 새 EC2(k3s/containerd)는 **pull 전용**이면 된다. 즉 GitHub Actions 러너가 push하는 Role(7.1 인증)과 k3s 노드가 이미지를 당겨오는 Role(containerd `registry` 인증 또는 `imagePullSecrets`)은 서로 다른 자격증명 경로이며, 후자는 1장 IAM 항목에서 이미 "읽기 전용 새 Role"로 분리하기로 했다.

### 7.3 새 EC2 접속 방식 비교 — SSH vs SSM vs Self-hosted runner

| 기준 | SSH | SSM (`AWS-RunShellScript`) | Self-hosted runner |
| --- | --- | --- | --- |
| 인바운드 포트 | 22 개방 필요(관리 IP로 제한 가능하지만 노출 자체는 발생) | 불필요 — SSM Agent가 아웃바운드로만 통신, 1장에서 이미 "22는 SSM 사용 시 불필요"로 전제 | 불필요하지만 러너 프로세스가 GitHub로 상시 아웃바운드 폴링 필요 |
| 인증 방식 | SSH 키페어 — private key를 GitHub Secret으로 보관·순환해야 함 | IAM Role(OIDC) — 장기 자격증명 없음, 8장의 "새 인스턴스 ARN 조건부 허용" 패턴과 자연스럽게 결합 | Runner 등록 토큰 + 러너가 repo 코드/시크릿에 직접 접근 |
| 감사 로그 | EC2 sshd 로그만 남고 GitHub Actions 쪽에는 상세 기록이 없음 | CloudTrail + SSM Run Command 히스토리가 콘솔에서 커맨드 단위로 자동 기록됨(기존 workflow가 이미 이 이력에 의존) | GitHub Actions 로그 + 러너 자체 로그 |
| Blast radius | 키 유출 시 EC2 전체 쉘 접근 가능 | IAM 정책으로 "이 인스턴스에 이 문서(`AWS-RunShellScript`)만" 수준까지 세밀하게 scope 가능 | 러너가 EC2 위에서 상시 대기하며 임의 GitHub Actions job을 실행할 수 있어 세 방식 중 공격 표면이 가장 넓음 |
| 기존 파이프라인과의 정합성 | 기존 workflow에 없는 새로운 패턴 도입 | 기존 `brainx-dev-deploy.yml`이 이미 검증된 형태로 사용 중 — 코드/운영 노하우 재사용 가능 | 기존에 없음 — 러너 설치·헬스체크·업데이트라는 신규 운영 부담 발생 |
| PoC 규모 적합성 | 과함(불필요한 포트 노출) | 적합 | 과함(1회성 수동 배포에 상시 러너는 오버킬) |

**권장: SSM.** 기존 파이프라인이 이미 이 패턴(`aws ssm send-command` → polling → `get-command-invocation`)을 검증된 형태로 갖고 있어 새 workflow가 코드/로직을 거의 그대로 재사용할 수 있고, 8장의 IAM 격리(새 인스턴스 ARN 조건부 허용)가 SSM 기반에서 가장 자연스럽게 성립한다. SSH는 포트 노출·키 순환 부담이, self-hosted runner는 상시 attack surface와 운영 부담이 이 단계 규모에 비해 과하다.

### 7.4 필요한 GitHub Secrets/Variables 목록

기존 workflow가 장기 AWS 자격증명 대신 OIDC + Variables 조합을 쓰는 패턴을 그대로 따른다. 실제 애플리케이션 시크릿(JWT_SECRET, DB 비밀번호 등)은 **GitHub Secrets에 평문으로 넣지 않고**, 기존과 같이 AWS Secrets Manager/SSM Parameter Store에 미리 등록해두고 원격 스크립트가 그 경로를 참조하게 한다(5장에서 이미 "실제 값은 이 문서에서 다루지 않는다"로 정한 원칙과 동일선상).

**Repository Variables (신규, `AWS_DEV_*`와 절대 겹치지 않는 네이밍)**

| 이름 | 설명 |
| --- | --- |
| `AWS_K3S_ROLE_TO_ASSUME` | 새 workflow 전용 OIDC IAM Role ARN (기존 `AWS_ROLE_TO_ASSUME`과 다른 Role) |
| `AWS_K3S_INSTANCE_ID` | 새 EC2 인스턴스 ID |
| `AWS_ECR_REGISTRY` | 기존 값 재사용 가능(3장 결정 — pull 전용이라 공유해도 무해) |
| `AWS_K3S_ARTIFACT_BUCKET` | 배포 번들 업로드용 — 기존 버킷을 쓰더라도 반드시 별도 prefix(`deploy-k3s/`) 사용, IAM 정책도 그 prefix로 scope |
| `AWS_K3S_SSM_PARAMETER_PREFIX` | 새 EC2용 SSM Parameter Store 경로 prefix(예: `/brainx/k3s-poc/`) — 기존 `AWS_DEV_SSM_PARAMETER_PREFIX`와 다른 값 |
| `AWS_K3S_NAMESPACE` | k3s namespace(`brainx` 재사용 or `brainx-k3s` 분리, 5장 결정 사항과 연동) |
| `AWS_K3S_PUBLIC_BASE_URL` | 스모크 테스트 및 frontend 빌드 인자용 새 PoC 서브도메인/IP |
| `AWS_REGION` | 기존 값 재사용 가능(리전 자체는 민감 정보 아님) |

**Secrets — 원칙적으로 신규 추가 없음.** 인증이 OIDC 기반이라 장기 액세스 키가 필요 없고, 애플리케이션 시크릿은 AWS 쪽(Secrets Manager/Parameter Store)에서 원격 스크립트가 직접 읽어온다(기존 `AWS_DEV_RDS_SECRET_ARN` 패턴과 동일). 이 원칙을 지키면 GitHub Secrets 표면 자체가 늘지 않아 유출 리스크가 구조적으로 낮아진다. 만약 팀 판단으로 이 원칙을 깨고 GitHub Secrets에 직접 넣어야 하는 값이 생기면, 반드시 **Section 7.1의 `k3s-poc` Environment 안에 scope된 Environment secret**로만 등록하고(Repository secret 아님), 기존 workflow에서는 참조 자체가 불가능하게 한다.

### 7.5 기존 EC2 보호 장치 (CI 관점 — 8장과 연결)

8장의 IAM/네트워크/DNS/데이터 격리에 더해, **workflow 설계 자체**에서 추가할 수 있는 장치:

- OIDC Role의 trust policy 조건을 `job_workflow_ref`(호출하는 workflow 파일 경로) 기준으로 새 workflow 파일 하나로 고정한다 — 누군가 기존 `brainx-dev-deploy.yml`을 수정해 이 Role을 assume하려 해도 trust policy 조건 불일치로 거부된다.
- 새 workflow는 `AWS_DEV_*`로 시작하는 어떤 Variable/Secret도 참조하지 않는다(코드 리뷰 체크리스트 항목화 가능 — grep으로 `AWS_DEV_` 참조 여부를 preflight에서 자동 검증하는 것도 가능).
- `concurrency: group: brainx-k3s-deploy`(기존 `brainx-dev-deploy`와 다른 그룹) — 두 파이프라인이 큐/취소 동작에서 서로 간섭하지 않는다.
- `push` 트리거가 없으므로 커밋만으로는 이 workflow가 절대 실행되지 않는다 — 실행에는 항상 사람이 Actions 탭에서 명시적으로 버튼을 눌러야 한다.

### 7.6 실패 시 중단/롤백 전략 (CI 관점 — 9장과 연결)

- **중단 기준**: `build` matrix는 `fail-fast: false`로 개별 실패를 모두 드러내되, `deploy` job은 "모든 matrix 결과가 success 또는 skipped"일 때만 진행(기존 workflow와 동일 가드) — 일부 이미지만 성공한 상태로 부분 배포되는 상황을 원천 차단한다.
- **SSM 명령 실패**: 기존과 동일하게 `send-command` → polling(최대 시도×간격) → 최종 상태 확인 구조를 재사용하되, 실패 시 어떤 자동 정리 동작도 하지 않고 **workflow를 실패로 종료**만 한다(9장의 "PoC는 자동 롤백보다 폐기가 기본"이라는 원칙과 일치 — CI가 스스로 `terraform destroy`나 인스턴스 종료를 실행하지 않는다).
- **배포 후 검증 job**: 기존 "Verify public endpoints" 패턴을 재사용해 `AWS_K3S_PUBLIC_BASE_URL` 기준 NodePort/Ingress 엔드포인트에 스모크 테스트를 수행한다. 이 job이 실패해도 자동 롤백은 하지 않고 workflow를 실패 상태로 남겨, 사람이 9장 기준(재배포 3회 초과 시 `CrashLoopBackOff` 등)에 따라 다음 행동(재배포 vs 폐기)을 판단하게 한다.
- **명시적 롤백 경로**: `image_tag` 입력(7.1)에 과거 sha를 지정해 재실행하면 재빌드 없이 이전 이미지로 재배포되므로, 이것이 사실상의 "롤백 workflow" 역할을 한다. 여기에 더해 `action: deploy|rollback` 같은 입력을 추가하고 `rollback`이면 build/push를 완전히 건너뛰고 원격 스크립트가 `kubectl -n <ns> rollout undo deployment/<service>`(9-1절, `RUNBOOK.md` 9장)만 실행하는 경로를 별도로 설계할 수 있다.
- **동시 실행 방지**: `concurrency` 그룹(7.5)이 롤백 실행 중 새 배포가 끼어드는 것도 함께 막는다.

### 7.7 범위

이번 단계에서는 실제 workflow YAML 파일은 만들지 않는다. 위 7.1~7.6은 다음 단계(파일 생성 승인 이후)를 위한 설계로만 남긴다.

---

## 8. 기존 EC2를 보호하기 위한 안전장치

| 계층 | 조치 |
| --- | --- |
| IAM | 새 EC2/새 workflow 전용 Role을 신규로 만들고, `ssm:SendCommand` 등 위험 동작은 **새 인스턴스 ARN에만** 조건부 허용. 기존 EC2 Role/Policy는 조회만 하고 수정하지 않는다. |
| 네트워크 | 새 Security Group 생성(기존 SG 재사용 금지). 같은 VPC를 쓰더라도 기존 SG ↔ 새 SG 간 인바운드를 기본적으로 열지 않는다. |
| DNS | 새 서브도메인/새 레코드만 추가 검토. `<public-domain>`, `admin.<public-domain>` 등 기존 레코드는 절대 수정하지 않는다. |
| 데이터 | 기존 RDS를 재사용하지 않는 것을 기본값으로 한다(비용 절감이 꼭 필요하면 완전히 별도 스키마/계정으로 분리하고 prod 데이터베이스에 쓰기 권한을 주지 않는다). PoC 단계에서는 새 EC2 내 임시 Postgres(Compose 또는 in-cluster) 사용을 권장. |
| CI/CD | 별도 workflow 파일, 별도 concurrency 그룹, 별도 repo variables, **수동 트리거만** 허용(7장 참고). 기존 `brainx-dev-deploy.yml`은 이번 작업에서 읽기만 하고 수정하지 않는다. |
| 가시성 | 새 리소스는 `brainx-k3s-poc` 계열 이름/태그로 통일해 운영자가 대시보드/콘솔에서 기존 리소스와 즉시 구분 가능하게 한다. |
| Terraform(향후 IaC화 시) | 기존 `infra/aws-dev/terraform` state와 **별도의 state/workspace**를 사용한다. 같은 state에 새 리소스를 추가하지 않는다. |

이 표의 각 조치는 "실수해도 구조적으로 기존 EC2에 도달할 수 없게 만드는 것"을 목표로 한다 — 즉 사람의 주의력이 아니라 IAM/네트워크 경계로 격리를 강제한다.

---

## 9. 실패 시 롤백/폐기 전략

### 9-1. 애플리케이션 레벨 롤백 (k3s 내부)

- 기존 `k8s/RUNBOOK.md` 9장에 정리된 절차를 그대로 재사용 가능: `kubectl -n brainx rollout undo deployment/<service-name>`, `kubectl -n brainx rollout history deployment/<service-name>`.
- Helm 도입 이후(`k8s/HELM_MIGRATION.md` 8장)라면 `helm rollback brainx <REVISION>`.

### 9-2. 인스턴스 레벨 폐기 (PoC 특성상 "롤백"보다 "폐기"가 기본값)

- 이 EC2는 8장의 격리 조치로 인해 기존 EC2/RDS/DNS와 구조적으로 분리되어 있으므로, 문제가 생기면 **새 EC2 자체를 정지/종료**하는 것이 가장 빠르고 안전한 대응이다.
- 절차(신규 리소스만 대상): 인스턴스 정지 또는 종료 → 신규 EIP 반납 → 신규 Security Group 삭제 → (DNS 레코드를 만들었다면) 해당 레코드만 삭제. 기존 `<public-domain>` 계열 레코드는 손대지 않는다.
- Terraform으로 관리하게 된다면 **k3s 전용 state/workspace**에서만 `terraform destroy`를 실행한다 — 기존 `infra/aws-dev/terraform` state에는 절대 `destroy`를 실행하지 않는다.

### 9-3. 데이터 손실 관점

- 1차 PoC(옵션 A, 4장)에서는 상태 저장소가 같은 EC2 위 Compose 컨테이너 볼륨 또는 k3s `local-path` PVC로, 모두 **해당 노드 로컬 디스크**에 있다. 인스턴스를 폐기하면 데이터도 함께 사라진다는 점을 사전에 명확히 한다(= 처음부터 "휘발 가능한 환경"으로 취급).

### 9-4. 폐기/재시도 판단 기준

다음 중 하나라도 해당하면 "디버깅 연장"이 아니라 **EC2 폐기 후 재검토**를 기본 대응으로 한다:

- 동일 서비스가 재배포 3회 이상 시도 후에도 `CrashLoopBackOff` 반복
- k3s control plane 자체가 안정화되지 않음(노드가 계속 `NotReady`)
- 예상 시간/비용 예산 초과

### 9-5. "PoC 유지" 승격 조건

`k8s/PRODUCTION_CHECKLIST.md`의 P0 항목(호스트 별칭 제거, 이미지 레지스트리 전환, Ingress/TLS, RBAC, 리소스 requests/limits, Secret 외부화)이 모두 충족된 뒤에만 이 환경을 "임시 PoC"에서 "지속 운영 후보"로 승격하는 것을 권장한다. 그 전까지 기본 태도는 "실패하면 버리고 새로 만든다"이다.

---

## 10. 배포 도구 전략 — Kustomize(단기) vs Helm(장기)

`k8s/KUSTOMIZE_OVERLAY_DESIGN.md`(EC2/k3s PoC용 Kustomize overlay 설계)와 `k8s/HELM_MIGRATION.md` + `k8s/helm/HELM_DESIGN.md`(Helm 기반 운영 전환 계획)는 둘 다 "환경별 값 관리(host.docker.internal 등 다운스트림 주소, 이미지 태그, replica 등)"를 다룬다는 점에서 목적이 겹친다. 이 장은 두 문서의 역할을 명확히 나누어 충돌을 방지한다.

### 10-1. 최종 결정

| 구분 | 담당 경로 | 문서 |
| --- | --- | --- |
| **단기 — EC2+k3s PoC** | Kustomize overlay | [`k8s/KUSTOMIZE_OVERLAY_DESIGN.md`](KUSTOMIZE_OVERLAY_DESIGN.md) |
| **장기 — 운영형 배포 표준화(후보)** | Helm 전환 | [`k8s/HELM_MIGRATION.md`](HELM_MIGRATION.md), [`k8s/helm/HELM_DESIGN.md`](helm/HELM_DESIGN.md) |

### 10-2. 왜 이렇게 나누는가

- **속도**: Kustomize overlay는 기존 `k8s/apps/*.yaml`을 복제 없이 상대경로로 참조만 하므로, 이번 PoC 목표인 "EC2/k3s에서 앱이 정상 기동하는지 빠르게 검증"에 적합하다. Helm Chart는 스캐폴딩·values 스키마·템플릿 작성·서비스별 렌더 동등성 검증까지 거쳐야 해 PoC 일정에 비해 무겁다.
- **위험 분리**: PoC는 9장(실패 시 폐기 전략)에 따라 언제든 버려질 수 있는 휘발성 환경이다. 그 환경의 값 관리 방식(Kustomize patch)에 장기 운영 표준(Helm Chart)을 얽어매면, PoC 폐기 시 Helm 설계까지 함께 흔들릴 위험이 생긴다.
- **표준화는 별도 트랙**: Helm 전환은 `HELM_MIGRATION.md` 9장(Cut-over 조건)에 정의된 대로 별도의 선행 조건(diff 동등성, dry-run, rollback 리허설 등)을 모두 충족해야 채택 가능한 "후보"이며, 이번 EC2/k3s PoC 일정과 독립적으로 진행된다.

### 10-3. 충돌 방지 원칙

- 두 경로가 동시에 문서로 존재하는 동안, **값의 최종 출처(source of truth)는 실제로 채택되어 사용 중인 경로 하나**로 한정한다. 현재는 Kustomize overlay(EC2/k3s PoC)만 실제 배포에 쓰이고, Helm values 파일은 아직 실행되지 않는 설계 상태이므로 "같은 값을 두 곳에 동시에 유지해야 하는" 이중 관리 상태가 실제로는 발생하지 않는다.
- 새 EC2 접속 정보(`<EC2_HOST>` 등)가 바뀌면 **Kustomize overlay의 patch 파일만** 갱신한다. Helm `values-prod.yaml`은 이 시점에서 갱신 대상이 아니다(아직 뼈대만 존재하고 운영 전환 시점에 채워짐 — `HELM_DESIGN.md` 3.3).
- Helm이 장기 운영 표준으로 실제 승격되는 시점(= `HELM_MIGRATION.md` 9.1 Cut-over 조건 충족 시)에, 그 시점까지 살아있는 Kustomize overlay(EC2/k3s PoC)를 계속 유지할지 폐기할지를 별도로 재결정한다. 이 문서는 그 결정을 미리 내리지 않는다.
- 실제 Kubernetes YAML, Helm Chart 파일, Kustomize 파일 생성은 이 장의 범위 밖이며, 각 문서(`KUSTOMIZE_OVERLAY_DESIGN.md` 8장, `HELM_MIGRATION.md`)에 정의된 승인 절차를 따로 거친다.

---

## 요약 — 완료 보고

- **생성/수정 파일**: 이 문서 `k8s/EC2_K3S_MIGRATION_PLAN.md`(7장 확장 후 10장 신규 추가), `k8s/KUSTOMIZE_OVERLAY_DESIGN.md`(단기 PoC 범위 명시), `k8s/HELM_MIGRATION.md`·`k8s/helm/HELM_DESIGN.md`(장기 운영 표준화 후보 범위 명시). 기존 `k8s/*.yaml`, `.github/workflows/*`, `infra/**`, 실제 Kubernetes/Helm/Kustomize 파일은 전혀 생성·수정하지 않음.
- **배포 도구 전략(신규, 10장)**: 단기 EC2+k3s PoC는 Kustomize overlay(`KUSTOMIZE_OVERLAY_DESIGN.md`), 장기 운영 표준화는 Helm 전환 후보(`HELM_MIGRATION.md`, `helm/HELM_DESIGN.md`)로 역할을 분리. 값의 출처를 "현재 실제로 쓰이는 경로 하나"로 한정해 이중 관리를 방지.
- **EC2 전환 단계**: (1) 새 EC2 준비 → (2) k3s 설치 → (3) ECR 재사용 결정 → (4) `host.docker.internal` 제거 대상 확정(옵션 A 우선) → (5) ConfigMap/Secret 신규 값 발급 계획 → (6) NodePort로 1차 검증 → (7) 전용 GitHub Actions workflow 상세 설계(7.1~7.6) → (8) 기존 EC2 격리 조치 적용 → (9) 실패 시 폐기 기준에 따라 대응.
- **GitHub Actions 추천 방식**: `workflow_dispatch` 전용 신규 workflow + `confirm_target` 리터럴 확인 + `k3s-poc` Environment 승인 게이트(7.1), 접속은 **SSM**(7.3 — SSH/self-hosted runner 대비 기존 파이프라인 재사용성과 IAM 격리 용이성에서 우위), ECR push는 기존 repo 재사용하되 `k3s-poc-latest` 전용 태그로 분리(7.2).
- **필요한 Secrets/Variables**: `AWS_K3S_ROLE_TO_ASSUME`/`AWS_K3S_INSTANCE_ID`/`AWS_K3S_ARTIFACT_BUCKET`/`AWS_K3S_SSM_PARAMETER_PREFIX`/`AWS_K3S_NAMESPACE`/`AWS_K3S_PUBLIC_BASE_URL` 등 신규 Variables(7.4). GitHub Secrets는 원칙적으로 추가 없음 — 앱 시크릿은 AWS Secrets Manager/Parameter Store에서 원격 스크립트가 직접 읽는 기존 패턴을 유지.
- **기존 EC2 보호 전략**: 별도 IAM Role(리소스 조건으로 새 인스턴스 ARN만 허용, trust policy는 `job_workflow_ref`로 새 workflow 파일에 고정), 별도 Security Group/DNS/RDS, 별도 GitHub Actions workflow·변수·동시성 그룹(`brainx-k3s-deploy`), 수동 트리거 + Environment 승인 이중 게이트 — "실수해도 도달 불가능한 구조"가 핵심(7.5/8장).
- **실패 시 대응**: matrix는 `fail-fast: false`, deploy는 전체 build 성공 시에만 진행, SSM/스모크 테스트 실패 시 자동 롤백 없이 workflow 실패로 남기고 사람이 판단(7.6/9장). 롤백은 `image_tag` 재지정 재실행 또는 `kubectl rollout undo` 경로로 명시적으로 수행.
- **다음 구현 프롬프트(팀 승인 후 사용)**:
  > "`k8s/EC2_K3S_MIGRATION_PLAN.md` 7장 설계(7.1~7.6)를 기준으로 `.github/workflows/brainx-k3s-deploy.yml`을 새로 생성해줘. 트리거는 `workflow_dispatch`만, 인증은 신규 `AWS_K3S_ROLE_TO_ASSUME` OIDC Role, 배포 대상 접속은 SSM `AWS-RunShellScript`. 기존 `brainx-dev-deploy.yml`은 절대 수정하지 마."
- **예상 소요 시간**(구성원 1명, 병렬 작업 없다는 가정의 대략적 추정치):
  - EC2 준비 + k3s 설치: 0.5~1일
  - host.docker.internal 제거(옵션 A, ConfigMap/Secret 값 교체 포함): 1~2일
  - NodePort 기준 9개 서비스 순차 배포/검증(README 순서: Discovery→Gateway→User→Admin→Ingestion→Commerce→Intelligence→MCP→Workspace): 1~2일
  - GitHub Actions 수동 배포 workflow 실제 구현·검증(후속 승인 이후): 1일
  - 총 3~6일 규모(트러블슈팅 발생 시 늘어날 수 있음, 기존 `k8s/TROUBLESHOOTING.md` 사례 패턴 재사용 가능)
- **가장 먼저 해야 할 작업**: 1장의 "새 EC2 준비 항목"을 팀과 확정(인스턴스 사이징/네트워킹/IAM 범위)하는 것 — 이후 모든 단계(2~9장)가 이 결정에 의존한다.

SSOT 계약에 맞게 구현 완료
