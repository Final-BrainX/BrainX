# BrainX EC2 + k3s 수동 검증 Runbook

> 작성일: 2026-07-09
> 문서 성격: **실행 절차서**. 사람이 위에서 아래로 그대로 따라 하며 새 EC2에 k3s를 올리고 BrainX 9개 앱을 검증한다.
> 전제 문서: [EC2_K3S_MIGRATION_PLAN.md](EC2_K3S_MIGRATION_PLAN.md)(의사결정/전략), [PRODUCTION_CHECKLIST.md](PRODUCTION_CHECKLIST.md), [RUNBOOK.md](RUNBOOK.md)(로컬 운영 절차)

## 이 문서가 하지 않는 것

- 실제 AWS 리소스를 생성하지 않는다(EC2/SG/EIP/IAM Role/ECR repo는 사람이 콘솔·CLI로 직접 만들고, 이 문서는 만든 뒤 무엇을 확인/실행할지만 다룬다).
- 실제 Secret 값을 적지 않는다(전부 `<CHANGE_ME>` placeholder).
- 기존 운영 EC2(`infra/aws-dev`) 관련 명령을 다루지 않는다.
- **GitHub Actions workflow(`brainx-k3s-deploy.yml`)는 이미 구현되어 있다** — `workflow_dispatch` 수동 트리거로 build/push → Kustomize 렌더 → S3 업로드 → SSM 배포 → rollout → Gateway smoke test까지 자동 수행한다([EC2_K3S_MIGRATION_PLAN.md](EC2_K3S_MIGRATION_PLAN.md) 7장 전략의 실제 구현). **이 문서는 그 workflow를 대체하지 않는다** — 역할이 다르다: workflow는 "정상 배포 경로"를, 이 문서는 (1) EC2/k3s/CoreDNS 최초 구성처럼 workflow가 다루지 않는 인프라 준비 단계, (2) workflow 실패 시 사람이 직접 원인을 좁혀가는 수동 검증/복구 절차를 다룬다. 7장(앱 배포)의 수동 절차는 workflow의 `prepare`/`deploy` job과 **같은 방식(임시 사본에서 placeholder 치환 후 apply)** 을 사람이 손으로 재현한 것이며, 세부 구현이 100% 동일하지는 않다(예: rollout 확인 순서 — 7-2절 참고).
- `host.docker.internal` 완전 제거는 다루지 않는다(후속 작업, [EC2_K3S_MIGRATION_PLAN.md](EC2_K3S_MIGRATION_PLAN.md) 4장 참고). **주의**: 이 항목은 `k8s/apps/*.yaml` 원본(로컬 Docker Desktop 검증용, `host.docker.internal` 사용)에 한정된다. `k8s/overlays/dev`(EC2/k3s 대상)는 이미 `host.docker.internal` 대신 `postgres.internal`/`redis.internal`/`kafka.internal`/`neo4j.internal`/`qdrant.internal` 5개 심볼릭 호스트명을 쓰도록 구현되어 있고, 이 문서는 그 5개 이름이 새 노드에서도 풀리도록 인프라 레벨에서만 임시 조치한다(5-3절).
- **Kustomize overlay는 구현 완료됐다.** 설계는 [KUSTOMIZE_OVERLAY_DESIGN.md](KUSTOMIZE_OVERLAY_DESIGN.md)에 정리돼 있고, `k8s/base/`, `k8s/overlays/local/`, `k8s/overlays/dev/`(patches 포함) 파일이 실제로 생성되어 `kubectl kustomize` 렌더링 검증까지 끝났다. **7장의 실제 배포 대상은 `k8s/overlays/dev` 원본이 아니라, 임시 디렉터리에 복사한 뒤 `<ECR_REGISTRY>`/`<IMAGE_TAG>` placeholder를 치환한 사본이다**(7-1절) — 원본을 그대로 `apply -k`하면 이 두 placeholder가 치환되지 않은 채 그대로 적용된다. `k8s/apps/*.yaml` 원본을 직접 `kubectl apply -f`로 적용하는 절차도 이 문서에서 다루지 않는다(원본은 `brainx-*:local`/`host.docker.internal`을 그대로 갖고 있는 로컬 Docker Desktop 전용 파일이다).
- **ECR 전환은 더 이상 "다루지 않는" 항목이 아니다.** 이 문서의 기본 이미지 경로는 ECR pull이다(5장). `docker build/save/scp/import`는 ECR 준비가 끝나기 전까지만 쓰는 보조/임시 경로로 격하한다(5-2절).

---

## 0. 배포 순서 요약

```
1. EC2 생성 전 체크리스트 확인 (사람이 콘솔/CLI로 EC2 생성)
2. 보안그룹 포트 오픈
3. k3s 설치
4. kubectl 확인 (로컬 → 원격 클러스터) + `brainx` namespace 생성(4-3절)
5. 이미지 준비 (ECR pull, 기본 경로) + `.internal` 인프라 호스트(postgres/redis/kafka/neo4j/qdrant.internal) 임시 조치(CoreDNS ConfigMap 직접 patch, 5-3절)
6. Secret 적용
7. 앱 배포 — 단일 블록으로 임시 디렉터리 복사 → `<ECR_REGISTRY>`/`<IMAGE_TAG>` 치환 → 렌더 검증 → `kubectl apply -k`(실패 시 검증된 렌더 파일로 `apply -f` fallback, 7-1) → rollout 확인(7-2)
8. health 확인
9. 실패 판단 → 폐기/재시도
```

---

## 1. EC2 생성 전 체크리스트

실제 생성은 이 문서 범위 밖. 아래 값을 **사람이 먼저 확정**한 뒤 EC2를 만든다.

- [ ] 인스턴스 타입: 기존 운영 EC2(`m8i.xlarge`, 16GiB) 이상 검토(k3s + containerd 오버헤드 감안)
- [ ] OS: Ubuntu 22.04/24.04 LTS 또는 Amazon Linux 2023 중 팀 표준
- [ ] Root EBS 용량: 이미지 레이어 + `local-path` PVC 공간 포함해 최소 30~50GiB 권장
- [ ] IAM Instance Profile: **신규 Role**(SSM Managed Instance Core 정도). 기존 EC2 Role과 공유 금지
- [ ] VPC/서브넷: 기존 운영 EC2와 같은 VPC를 쓰더라도 SG는 반드시 새로 만든다(2장)
- [ ] 태깅: `Name=brainx-k3s-poc`, `Project=brainx`, `Environment=k3s-poc` — 콘솔에서 기존 리소스와 시각적으로 구분되도록
- [ ] **필수 태그(워크플로 안전장치)**: `BrainXEnvironment=k3s-poc`, `BrainXDeploymentTarget=true` 두 태그를 **정확히 이 키/값**으로 반드시 붙인다. `brainx-k3s-deploy.yml`의 `deploy` job이 SSM `send-command` 실행 **직전**에 `aws ec2 describe-instances`로 `AWS_K3S_INSTANCE_ID` 대상 인스턴스가 `running` 상태이고 이 두 태그를 갖고 있는지 검증한다 — 태그가 없거나 값이 다르면(예: 실수로 기존 운영 EC2의 Instance ID를 넣은 경우) SSM 명령을 보내지 않고 즉시 실패한다. 이 검증에는 GitHub Actions OIDC Role에 `ec2:DescribeInstances` 권한이 추가로 필요하다(ECR/S3/SSM 권한에 더해).
- [ ] Elastic IP: 신규 EIP만 사용, 기존 도메인/레코드는 건드리지 않는다
- [ ] 이 EC2는 "휘발 가능"이 기본 전제다(9장) — 영구 보존이 필요한 데이터를 여기서 만들지 않는다

완료 후: `<EC2_PUBLIC_IP>`, `<EC2_PRIVATE_IP>` 두 값을 이후 절차에서 사용한다.

---

## 2. 보안그룹(SG) 포트

**신규 SG**를 만든다(기존 SG 재사용 금지). 최소 인바운드만 연다.

| 포트 | 프로토콜 | 소스 | 용도 | 비고 |
| --- | --- | --- | --- | --- |
| 22 | TCP | 관리자 IP만(`/32`) | SSH | SSM 사용 시 아예 열지 않아도 됨(권장) |
| 6443 | TCP | 관리자 IP만(`/32`) | k3s API(kubectl) | 절대 `0.0.0.0/0` 금지 |
| 30080 | TCP | 관리자 IP만(`/32`) | Gateway-Service NodePort(임시 노출, 7-4절) | 1차 검증엔 이 하나면 충분 |

- 아웃바운드는 기본(전체 허용) 유지 — ECR/이미지 pull 등 아웃바운드 트래픽이 필요하다.
- 80/443(Ingress)은 이번 PoC 범위에서 열지 않는다([EC2_K3S_MIGRATION_PLAN.md](EC2_K3S_MIGRATION_PLAN.md) 6장 — NodePort 우선).
- 10250(kubelet)은 단일 노드 구성이라 외부에 열 필요 없음.

---

## 3. k3s 설치 명령

EC2에 SSH(또는 SSM Session Manager)로 접속한 뒤 실행한다.

```bash
curl -sfL https://get.k3s.io | sh -
```

설치 스크립트가 끝나면:

```bash
sudo systemctl status k3s
```

`active (running)`인지 확인한다.

---

## 4. kubectl 확인

### 4-1. EC2 로컬에서 1차 확인

```bash
sudo k3s kubectl get nodes
```

`Ready` 상태의 노드 1개가 보여야 한다.

### 4-2. 로컬 PC에서 원격 kubectl 구성

EC2에서 kubeconfig를 가져온다.

```bash
sudo cat /etc/rancher/k3s/k3s.yaml
```

로컬 PC에 별도 kubeconfig 파일로 저장(기존 Docker Desktop kubeconfig와 섞이지 않도록 새 파일 사용 권장):

```powershell
# 로컬 PC (PowerShell)
notepad $env:USERPROFILE\.kube\brainx-k3s-poc.yaml
# 위에서 출력된 내용을 붙여넣고, server: 값을 https://<EC2_PUBLIC_IP>:6443 으로 치환 후 저장
```

확인:

```powershell
$env:KUBECONFIG = "$env:USERPROFILE\.kube\brainx-k3s-poc.yaml"
kubectl get nodes
kubectl config current-context
```

이후 모든 `kubectl` 명령은 이 세션에서 `$env:KUBECONFIG`가 `brainx-k3s-poc.yaml`을 가리키는 상태로 실행한다. 기존 로컬 Docker Desktop 클러스터를 동시에 쓰던 세션과 혼동하지 않도록 새 PowerShell 창을 쓰는 것을 권장한다.

### 4-3. `brainx` namespace 생성

5장 이하의 CoreDNS 구성/인프라 기동/DNS·TCP·Kafka 검증 절차가 전부 `-n brainx`로 임시 Pod를 띄운다. namespace가 없으면 그 시점에 실패하므로, **여기서 먼저** 만들어 둔다. 반복 실행해도 안전한 멱등 명령을 쓴다(이미 있으면 그대로 통과):

```powershell
kubectl create namespace brainx --dry-run=client -o yaml | kubectl apply -f -
```

이후 6장(Secret)과 7장(dev overlay 배포, `k8s/base/kustomization.yaml`을 통해 `../namespace.yaml`도 함께 적용됨)에서 같은 namespace를 다시 apply해도 이미 존재하는 리소스에 대한 멱등 적용이라 충돌하지 않는다 — 이 문서에서 namespace를 생성하는 지점은 여기 한 곳으로 통일한다(6장의 중복 생성 라인은 제거했다).

---

## 5. 이미지 pull 준비

**기본 경로는 ECR pull이다**(5-1절) — 기존 `infra/aws-dev` 파이프라인이 이미 쓰고 있는 ECR 레지스트리를 새 EC2/k3s에서도 그대로 재사용한다([EC2_K3S_MIGRATION_PLAN.md](EC2_K3S_MIGRATION_PLAN.md) 3장 결정). `docker build → save → scp → import`(5-2절)는 ECR 준비가 아직 안 됐거나 이미지 하나만 빠르게 로컬 검증하고 싶을 때만 쓰는 **보조/임시 경로**다 — 9개 서비스를 상시 이 방식으로 배포하지 않는다.

### 5-1. ECR pull 확인 (기본 경로)

빌드/푸시(이미지를 ECR에 올리는 작업) 자체는 이 문서 범위가 아니다 — 기존 GitHub Actions 파이프라인 또는 [EC2_K3S_MIGRATION_PLAN.md](EC2_K3S_MIGRATION_PLAN.md) 7.2절 기준으로 이미 ECR에 push돼 있다는 전제로, 여기서는 **새 EC2/k3s 노드가 그 이미지를 정상적으로 pull하는지**만 확인한다.

**사람이 먼저 준비해야 하는 것** (실제 생성/부여는 이 문서 범위 밖):

- [ ] **EC2 IAM Role**: 1장 IAM 항목대로 새 EC2 전용 Instance Profile/Role을 새로 만들고, 아래 ECR pull 최소 권한만 붙인다(기존 EC2 Role과 공유 금지). 신규 Role ARN/정책 문서 값은 이 문서에 적지 않는다.
  - `ecr:GetAuthorizationToken`
  - `ecr:BatchGetImage`
  - `ecr:GetDownloadUrlForLayer`
- [ ] **image tag 정책**: [EC2_K3S_MIGRATION_PLAN.md](EC2_K3S_MIGRATION_PLAN.md) 7.2절 기준으로 재배포에 쓸 태그(`git sha` 또는 `k3s-poc-latest`)를 먼저 정한다. `image:` 필드는 `k8s/apps/*.yaml` 원본을 직접 고치는 것이 아니라, `k8s/overlays/dev/kustomization.yaml`의 `images:` 트랜스포머(`<ECR_REGISTRY>`/`<IMAGE_TAG>` placeholder)를 통해 렌더링 시점에 `<ECR_REGISTRY>/brainx-<service>:<tag>`로 치환된다(7장 참고). Docker Desktop 로컬 빌드용 `:local` 태그는 원본에 그대로 남아 있어도 되며, dev overlay를 거치면 자동으로 대체된다.
- [ ] **imagePullPolicy**: 무버블 태그(`k3s-poc-latest` 등)를 쓸 경우 `Always`를 권장(태그가 바뀌어도 재배포 시 최신 이미지를 받도록). 고정 sha 태그만 쓸 경우 `IfNotPresent`도 무방하다. 적용 전 현재 값 확인:
  ```powershell
  kubectl -n brainx get deploy <name> -o yaml | findstr imagePullPolicy
  ```

**pull 확인**:

```bash
# EC2에서 — 노드가 실제로 ECR에서 이미지를 받아오는지 1회 수동 확인
sudo k3s kubectl -n brainx run ecr-pull-test --rm -it --restart=Never \
  --image=<ECR_REGISTRY>/brainx-discovery-service:<tag> -- echo ok
```

정상 배포에서는 각 Deployment가 apply되는 시점에 kubelet이 자동으로 pull하므로, 위 명령은 "노드에 권한이 살아있는지"를 미리 확인하는 용도다. 9개 서비스 전부 같은 방식으로 apply 시점에 자동 pull되며, 5-2절처럼 서비스별로 별도 import 작업을 반복할 필요가 없다.

`ImagePullBackOff`가 나면 다음 순서로 확인한다:

1. EC2 IAM Role에 ECR pull 권한이 실제로 붙어 있는지
2. 매니페스트 `image:` 값이 ECR registry URI + 올바른 태그인지
3. `imagePullPolicy`가 의도한 값인지
4. 해당 태그가 실제로 ECR repo에 존재하는지(`aws ecr describe-images --repository-name <repo> --image-ids imageTag=<tag>`)

### 5-2. (보조/임시) docker build → save → scp → import

ECR가 아직 준비되지 않았거나 ECR 접근 없이 이미지 하나만 빠르게 확인하고 싶을 때만 쓴다. **정상 배포 경로가 아니므로 9개 서비스 전체를 이 방식으로 상시 운영하지 않는다.**

#### 로컬에서 이미지 빌드 (Docker Desktop 기준)

```powershell
docker build -t brainx-discovery-service:local .\brainX_back\Discovery-Service
docker build -t brainx-gateway-service:local .\brainX_back\Gateway-Service
docker build -t brainx-user-service:local .\brainX_back\User-Service
docker build -t brainx-admin-service:local .\brainX_back\Admin-Service
docker build -t brainx-ingestion-service:local .\brainX_back\Ingestion-Service
docker build -t brainx-commerce-service:local .\brainX_back\Commerce-Service
docker build -t brainx-intelligence-service:local .\brainX_back\Intelligence-Service
docker build -t brainx-mcp-service:local .\brainX_back\Mcp-Service
docker build -t brainx-workspace-service:local .\brainX_back\Workspace-Service
```

#### tar로 저장 후 EC2로 전송, containerd에 import

각 서비스마다 반복(서비스명만 바꿔서):

```powershell
docker save brainx-discovery-service:local -o discovery.tar
scp discovery.tar <user>@<EC2_PUBLIC_IP>:/tmp/discovery.tar
```

EC2에서:

```bash
sudo k3s ctr images import /tmp/discovery.tar
sudo k3s ctr images ls | grep brainx-discovery-service
rm /tmp/discovery.tar
```

9개 서비스 전부 같은 방식으로 반복한다. `ImagePullBackOff`가 나면 가장 먼저 `sudo k3s ctr images ls`로 해당 이미지가 실제로 import됐는지 확인한다(9-3절 참고 패턴, [RUNBOOK.md 9-3](RUNBOOK.md#9-3-imagepullbackoff)와 원인은 동일하나 조치만 로컬 재빌드 대신 재-import로 바뀐다).

> 이 경로로 배포한 매니페스트의 `imagePullPolicy`는 `Never` 또는 `IfNotPresent`여야 한다(`Always`면 로컬 import 이미지를 무시하고 외부 레지스트리에서 다시 받으려다 실패한다). ECR 경로(5-1절)로 돌아갈 때는 반드시 이 값을 다시 `IfNotPresent`/`Always`(태그 정책에 맞게)로 되돌린다.

### 5-3. `.internal` 인프라 호스트 DNS 조치 (매니페스트는 건드리지 않음)

> ⚠️ **대상 EC2 한정 경고**: 아래 사설 IP는 반드시 **이번에 새로 만든 k3s PoC EC2**의 사설 IP여야 한다. 기존 운영 EC2(`infra/aws-dev`)의 IP/Instance ID를 여기 쓰면 안 된다 — 목적이 다른 두 EC2를 혼동하면 운영 인프라에 원치 않는 트래픽이 흘러갈 수 있다.
>
> **로컬(`k8s/overlays/local`, `k8s/apps/*.yaml` 직접 apply) 검증은 이 절차의 대상이 아니다.** 로컬은 Docker Desktop이 `host.docker.internal`을 자동으로 풀어주므로 그대로 둔다(변경 금지).

`k8s/overlays/dev`(EC2/k3s 대상 Kustomize overlay)는 `host.docker.internal`을 쓰지 않는다. 대신 `k8s/overlays/dev/patches/*.yaml`이 Postgres/Redis/Kafka/Neo4j/Qdrant 접근값을 아래 5개 심볼릭 호스트명으로 이미 치환해 두었다([KUSTOMIZE_OVERLAY_DESIGN.md](KUSTOMIZE_OVERLAY_DESIGN.md) 참고, 호스트명 자체는 변경하지 않는다):

| 호스트명 | 대상 인프라 | 포트 |
| --- | --- | --- |
| `postgres.internal` | PostgreSQL | 5432 |
| `redis.internal` | Redis | 6379 |
| `kafka.internal` | Kafka(`K8S` 리스너) | 9093 |
| `neo4j.internal` | Neo4j Bolt | 7687 |
| `qdrant.internal` | Qdrant gRPC | 6334 |

현재 구조(과도기, [EC2_K3S_MIGRATION_PLAN.md](EC2_K3S_MIGRATION_PLAN.md) 4장 옵션 A)에서는 이 인프라 5종이 k3s Pod가 아니라 **같은 EC2 위 Docker Compose**에서 돈다. 따라서 5개 이름 전부를 **같은 사설 IP(그 EC2 자기 자신)** 로 풀어주면 된다 — Pod 입장에서 "다른 서버"가 아니라 "자기가 떠 있는 노드"를 가리키는 것뿐이다.

#### 5-3-1. Compose 인프라 기동

> ⚠️ **`run.ps1`을 쓰지 않는다.** 저장소 루트의 `run.ps1`은 `docker compose ... --profile apps up -d --build`로 9개 앱 서비스 컨테이너까지 전부 띄우는 **로컬 전체 Compose 실행용** 스크립트다. 이 EC2에서는 9개 앱이 이미 k3s Pod로 뜨므로, `run.ps1`을 그대로 실행하면 **같은 서비스가 Compose 컨테이너와 k3s Pod로 중복 기동**된다(포트 바인딩 충돌, 이중 리소스 사용, 어느 쪽이 실제로 응답하는지 혼동 등). `run.ps1` 자체는 로컬 전체 스택 검증용으로 계속 유효하며 이번 변경에서 손대지 않았다.
>
> 대신 인프라(Postgres/Redis/Kafka/Neo4j/Qdrant)만 띄우는 **`run-infra.ps1`**(EC2+k3s 과도기 구조 전용, 이번에 추가)을 사용한다. `--profile apps` 없이 저 5개 서비스만 시작하고, 이미지 빌드도 하지 않는다.

```bash
# EC2에서 인프라만 기동 (앱 9개는 이미 k3s Pod로 배포되므로 여기서 띄우지 않는다)
git clone <repository-url> ~/BrainX && cd ~/BrainX && git checkout <branch-name>
pwsh ./run-infra.ps1   # PowerShell(pwsh)이 EC2에 없다면 스크립트 내용을 참고해 동등한 셸 명령으로 대체
```

`run-infra.ps1`은 실행 과정에서 `KAFKA_K8S_ADVERTISED_HOST=kafka.internal`을 **이 프로세스(및 그 하위 `docker compose` 호출) 범위에서만** 자동으로 강제 설정한다 — 셸의 영구 환경변수를 바꾸지 않으며, 스크립트가 끝나면 원래 값(있었다면)으로 복원된다. 실행자가 이 값을 직접 설정할 필요가 없고, 실수로 로컬 기본값(`host.docker.internal`)인 채 EC2 인프라를 띄우는 상황 자체가 방지된다. 자세한 배경은 5-3-6절 참고.

#### 5-3-2. EC2 사설 IP 안전하게 확인

**EC2 인스턴스 자기 자신에서** IMDSv2(토큰 기반)로 조회한다. 외부 서비스나 콘솔의 값을 그대로 베껴 쓰지 말고, 실제로 이 노드가 인식하는 사설 IP인지 이 명령으로 확인한다.

```bash
TOKEN=$(curl -sX PUT "http://169.254.169.254/latest/api/token" \
  -H "X-aws-ec2-metadata-token-ttl-seconds: 21600")
curl -sH "X-aws-ec2-metadata-token: $TOKEN" \
  http://169.254.169.254/latest/meta-data/local-ipv4
```

출력된 값을 아래 절차의 `<EC2_PRIVATE_IP>`로 사용한다. **기존 운영 EC2가 아니라 지금 이 명령을 실행 중인, 이번에 새로 만든 k3s PoC EC2에서 나온 값인지 다시 한 번 확인한다.**

> ⚠️ **`/etc/coredns/customhosts` 파일 방식은 쓰지 않는다.** 그 경로는 EC2 호스트의 로컬 파일시스템일 뿐, CoreDNS Pod 컨테이너 안에 자동으로 마운트되지 않는다(k3s 기본 설치는 이 경로를 볼륨으로 연결하지 않는다) — 파일을 만들어도 CoreDNS는 그 내용을 전혀 읽지 못해 실제로 동작하지 않는다. 아래는 CoreDNS의 `coredns` ConfigMap 자체(`Corefile`)에 5개 이름을 **직접 인라인으로** 기록하는, k3s 기본 구성에서 실제로 동작하는 방식이다.

#### 5-3-3. CoreDNS 백업 + `hosts` 블록 삽입/교체 (아래 블록 전체를 한 번에 실행)

마커는 `# BEGIN BRAINX INTERNAL HOSTS` / `# END BRAINX INTERNAL HOSTS` 한 쌍으로 고정한다. k3s 기본 `Corefile`은 `.:53 {` 로 시작해 `errors`/`health`/`kubernetes ...`/`forward ...`/`cache 30` 등의 플러그인이 이어지는 구조이며, 아래 절차는 이 여는 줄 바로 다음에 `hosts { ... }` 블록을 삽입(또는 재실행 시 교체)하고 **`data.Corefile` 키 하나만** 건드린다.

> **아래 블록 전체를 한 번에(하나의 셸 세션에서 처음부터 끝까지) 실행한다.** 중간에 끊어서 여러 셸에 나눠 실행하면 `EC2_PRIVATE_IP`/`MODE`/`BEGIN_COUNT` 같은 변수와 `trap`이 유실되어 안전장치가 무력화된다. `set -euo pipefail`이 걸려 있어 중간 실패 시 즉시 멈추고, 실패 시에는 `trap`이 `mktemp` 작업 디렉터리를 정리한다. **성공 시에는 대화형 셸에서 EXIT trap이 셸 종료까지 지연될 수 있으므로, 블록 마지막에서 `rm -rf`로 즉시 정리하고 `trap - EXIT`로 trap을 해제한다**(성공/실패 양쪽 모두 임시 디렉터리가 남지 않는다). 고정된 `/tmp/Corefile.*` 경로는 쓰지 않는다(이전 실행 잔여물 재사용 방지). `EC2_PRIVATE_IP`는 ConfigMap을 읽거나 patch하기 전에 IPv4 형식·옥텟 범위·RFC1918 사설 대역인지 강제 검증한다(0단계).

```bash
set -euo pipefail

# 사람이 먼저 채워야 하는 값 (5-3-2절에서 확인한 EC2 사설 IP로 치환)
EC2_PRIVATE_IP="<EC2_PRIVATE_IP>"

WORKDIR="$(mktemp -d /tmp/brainx-coredns.XXXXXX)"
trap 'rm -rf "$WORKDIR"' EXIT
echo "임시 작업 디렉터리: $WORKDIR"

# 0) EC2_PRIVATE_IP 사전 검증 — ConfigMap을 읽거나 patch하기 전에 반드시 통과해야 한다.
#    placeholder 미치환 / 빈 값 / IPv4 형식 아님 / octet 범위 초과 / RFC1918 사설 대역 아님을 각각 차단한다.
if [ -z "${EC2_PRIVATE_IP:-}" ] || [ "$EC2_PRIVATE_IP" = "<EC2_PRIVATE_IP>" ]; then
  echo "FAIL: EC2_PRIVATE_IP 값을 실제 EC2 사설 IP로 채우지 않았습니다(현재 값: '${EC2_PRIVATE_IP:-<empty>}'). 5-3-2절에서 확인한 값으로 치환하세요." >&2
  exit 1
fi

IPV4_OCTET='(25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9]?[0-9])'
if ! [[ "$EC2_PRIVATE_IP" =~ ^${IPV4_OCTET}\.${IPV4_OCTET}\.${IPV4_OCTET}\.${IPV4_OCTET}$ ]]; then
  echo "FAIL: EC2_PRIVATE_IP('$EC2_PRIVATE_IP')가 유효한 IPv4 형식이 아닙니다(예: 10.0.1.23, 각 옥텟 0~255, 앞자리 0 없이)." >&2
  exit 1
fi
OCT1="${BASH_REMATCH[1]}"
OCT2="${BASH_REMATCH[2]}"

IS_PRIVATE=0
if [ "$OCT1" = "10" ]; then
  IS_PRIVATE=1
elif [ "$OCT1" = "172" ] && [ "$OCT2" -ge 16 ] && [ "$OCT2" -le 31 ]; then
  IS_PRIVATE=1
elif [ "$OCT1" = "192" ] && [ "$OCT2" = "168" ]; then
  IS_PRIVATE=1
fi

if [ "$IS_PRIVATE" -ne 1 ]; then
  echo "FAIL: EC2_PRIVATE_IP('$EC2_PRIVATE_IP')가 RFC1918 사설 IPv4 대역(10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16)에 속하지 않습니다." >&2
  echo "EC2 사설 IP가 맞는지 5-3-2절 IMDSv2 조회 결과를 다시 확인하세요(공인 IP나 오탈자를 넣지 않았는지 포함)." >&2
  exit 1
fi
echo "OK: EC2_PRIVATE_IP=$EC2_PRIVATE_IP (RFC1918 사설 IPv4 형식 확인 완료)"

# 1) 적용 전 백업 + 현재 Corefile 확인 (백업은 재해복구용이라 WORKDIR 밖, $HOME에 남긴다)
BACKUP_FILE="$HOME/coredns-configmap.backup.$(date +%Y%m%d-%H%M%S).yaml"
sudo k3s kubectl -n kube-system get configmap coredns -o yaml > "$BACKUP_FILE"
echo "백업 저장: $BACKUP_FILE"

sudo k3s kubectl -n kube-system get configmap coredns -o jsonpath='{.data.Corefile}' > "$WORKDIR/Corefile.current"
echo "=== 현재 Corefile ==="
cat "$WORKDIR/Corefile.current"

# 2) 마커 개수로 삽입/교체/실패를 결정한다
BEGIN_COUNT=$(grep -c '# BEGIN BRAINX INTERNAL HOSTS' "$WORKDIR/Corefile.current" || true)
END_COUNT=$(grep -c '# END BRAINX INTERNAL HOSTS' "$WORKDIR/Corefile.current" || true)

if [ "$BEGIN_COUNT" != "$END_COUNT" ] || [ "$BEGIN_COUNT" -gt 1 ]; then
  echo "FAIL: BEGIN/END BRAINX INTERNAL HOSTS 마커 개수가 맞지 않습니다(BEGIN=$BEGIN_COUNT, END=$END_COUNT)." >&2
  echo "Corefile이 손상되었을 수 있습니다 — $BACKUP_FILE 로 원복을 검토한 뒤 다시 실행하세요." >&2
  exit 1
fi

if [ "$BEGIN_COUNT" = "0" ]; then
  MODE="insert"       # 처음 적용
else
  MODE="replace"       # 재실행(IP가 바뀐 경우 포함) — 기존 블록을 통째로 교체
fi
echo "Mode: $MODE (BEGIN=$BEGIN_COUNT, END=$END_COUNT)"

# 3) insert 모드 — root server block(.:53 { ... })을 못 찾으면 임의 위치에 넣지 않고 실패한다.
#    들여쓰기/공백 차이(.:53 {, .:53{, 앞쪽 공백 등)는 허용한다.
if [ "$MODE" = "insert" ]; then
  if ! grep -Eq '^[[:space:]]*\.:53[[:space:]]*\{[[:space:]]*$' "$WORKDIR/Corefile.current"; then
    echo "FAIL: root server block(.:53 { 형태)을 Corefile에서 찾지 못했습니다. 임의 위치에 삽입하지 않고 중단합니다." >&2
    exit 1
  fi

  awk -v ip="$EC2_PRIVATE_IP" '
    /^[[:space:]]*\.:53[[:space:]]*\{[[:space:]]*$/ && !inserted {
      print;
      print "    # BEGIN BRAINX INTERNAL HOSTS (k8s/EC2_K3S_RUNBOOK.md 5-3-3)";
      print "    hosts {";
      print "        " ip " postgres.internal";
      print "        " ip " redis.internal";
      print "        " ip " kafka.internal";
      print "        " ip " neo4j.internal";
      print "        " ip " qdrant.internal";
      print "        fallthrough";
      print "    }";
      print "    # END BRAINX INTERNAL HOSTS";
      inserted = 1;
      next
    }
    { print }
  ' "$WORKDIR/Corefile.current" > "$WORKDIR/Corefile.new"
fi

# 4) replace 모드 — 기존 BEGIN~END 구간(마커 포함)을 통째로 지우고 새 블록(새 IP 반영)으로 바꾼다.
if [ "$MODE" = "replace" ]; then
  awk -v ip="$EC2_PRIVATE_IP" '
    /# BEGIN BRAINX INTERNAL HOSTS/ {
      print "    # BEGIN BRAINX INTERNAL HOSTS (k8s/EC2_K3S_RUNBOOK.md 5-3-3)";
      print "    hosts {";
      print "        " ip " postgres.internal";
      print "        " ip " redis.internal";
      print "        " ip " kafka.internal";
      print "        " ip " neo4j.internal";
      print "        " ip " qdrant.internal";
      print "        fallthrough";
      print "    }";
      print "    # END BRAINX INTERNAL HOSTS";
      skipping = 1;
      next
    }
    /# END BRAINX INTERNAL HOSTS/ && skipping { skipping = 0; next }
    skipping { next }
    { print }
  ' "$WORKDIR/Corefile.current" > "$WORKDIR/Corefile.new"
fi

# 5) patch 전 검증 — 마커 정확히 1쌍, 5개 internal 호스트명 각각 정확히 1번. 실패하면 patch를 실행하지 않는다.
NEW_BEGIN_COUNT=$(grep -c '# BEGIN BRAINX INTERNAL HOSTS' "$WORKDIR/Corefile.new" || true)
NEW_END_COUNT=$(grep -c '# END BRAINX INTERNAL HOSTS' "$WORKDIR/Corefile.new" || true)
if [ "$NEW_BEGIN_COUNT" != "1" ] || [ "$NEW_END_COUNT" != "1" ]; then
  echo "FAIL: 새 Corefile에 BEGIN/END 마커가 정확히 1개씩 있어야 하는데 BEGIN=$NEW_BEGIN_COUNT END=$NEW_END_COUNT 입니다. patch를 실행하지 않습니다." >&2
  exit 1
fi

for h in postgres.internal redis.internal kafka.internal neo4j.internal qdrant.internal; do
  COUNT=$(grep -c "$h" "$WORKDIR/Corefile.new" || true)
  if [ "$COUNT" != "1" ]; then
    echo "FAIL: $h 이(가) 새 Corefile에 정확히 1번 있어야 하는데 ${COUNT}번 발견됐습니다. patch를 실행하지 않습니다." >&2
    exit 1
  fi
done

echo "OK: BEGIN/END 마커 각 1개, 5개 internal 호스트명 각 1개 확인 완료."
diff "$WORKDIR/Corefile.current" "$WORKDIR/Corefile.new" || true   # 삽입/교체된 블록만 바뀌었는지 눈으로 확인

# 6) patch 적용 — 위 검증을 통과한 경우에만 실행. data.Corefile 키만 병합(merge)하는 patch 파일을 써서
#    kubectl edit(비대화형 재현이 안 됨) 없이, ConfigMap의 다른 키가 있어도 그대로 보존한다.
{
  echo "data:"
  echo "  Corefile: |"
  sed 's/^/    /' "$WORKDIR/Corefile.new"
} > "$WORKDIR/coredns-patch.yaml"

sudo k3s kubectl -n kube-system patch configmap coredns \
  --type merge \
  --patch-file="$WORKDIR/coredns-patch.yaml"

# 7) patch 후 검증 — 실제 ConfigMap에서도 마커가 정확히 1쌍인지 재확인한 뒤에만 재시작한다.
LIVE_COREFILE="$(sudo k3s kubectl -n kube-system get configmap coredns -o jsonpath='{.data.Corefile}')"
LIVE_BEGIN_COUNT=$(echo "$LIVE_COREFILE" | grep -c '# BEGIN BRAINX INTERNAL HOSTS' || true)
LIVE_END_COUNT=$(echo "$LIVE_COREFILE" | grep -c '# END BRAINX INTERNAL HOSTS' || true)

if [ "$LIVE_BEGIN_COUNT" != "1" ] || [ "$LIVE_END_COUNT" != "1" ]; then
  echo "FAIL: patch 후 ConfigMap의 마커 개수가 예상과 다릅니다(BEGIN=$LIVE_BEGIN_COUNT, END=$LIVE_END_COUNT). $BACKUP_FILE 로 원복을 검토하세요." >&2
  exit 1
fi
echo "OK: patch 후 ConfigMap에도 BEGIN/END 마커가 정확히 1쌍입니다."

sudo k3s kubectl -n kube-system rollout restart deployment/coredns
sudo k3s kubectl -n kube-system rollout status deployment/coredns

# 8) 성공 경로에서는 여기서 즉시 정리한다(대화형 셸에 이 블록만 붙여넣고 셸을 계속 쓰는 경우,
#    EXIT trap은 셸 자체가 종료될 때까지 지연될 수 있어 임시 디렉터리가 그때까지 남아있을 수 있다).
#    실패 시(위의 각 exit 1)에는 이 줄까지 도달하지 못하므로 EXIT trap이 그대로 정리를 맡는다.
rm -rf "$WORKDIR"
trap - EXIT
echo "정리 완료: $WORKDIR 삭제됨."
echo "완료. 백업: $BACKUP_FILE"
```

#### 5-3-5. 검증 (DNS 조회 성공 ≠ 실제 서비스 접속 성공)

> **주의**: 아래 1)이 통과해도 2)가 실패할 수 있다. DNS는 이름을 IP로 바꿔줄 뿐, 그 IP:포트에서 실제로 서비스가 응답하는지는 별도로 확인해야 한다(방화벽, Compose 컨테이너의 listen/bind 설정, 서비스 자체 다운 등으로 2)만 실패하는 경우가 흔하다).

**1) DNS 조회 확인** — 5개 이름 전부 `<EC2_PRIVATE_IP>`로 풀리는지 확인:

```bash
sudo k3s kubectl -n brainx run dns-test --rm -it --image=busybox --restart=Never -- sh -c '
  for h in postgres.internal redis.internal kafka.internal neo4j.internal qdrant.internal; do
    echo "== $h =="; nslookup "$h"
  done'
```

**2) 실제 포트 접속 확인** — 이름이 풀리는 것과 별개로, 그 IP:포트가 실제로 열려 있고 응답하는지 확인:

```bash
sudo k3s kubectl -n brainx run tcp-test --rm -it --image=busybox --restart=Never -- sh -c '
  for target in postgres.internal:5432 redis.internal:6379 kafka.internal:9093 neo4j.internal:7687 qdrant.internal:6334; do
    host="${target%:*}"; port="${target#*:}"
    echo "== $target =="; nc -zv -w 3 "$host" "$port"
  done'
```

**3) 애플리케이션 Pod 상태 확인** — DNS/TCP가 정상이어도 앱 레벨에서 인증 실패 등이 날 수 있으므로, 실제로 이 5개 호스트를 참조하는 서비스(Workspace/Admin/Ingestion/Commerce/Intelligence/User/MCP)의 rollout과 로그를 함께 확인한다:

```bash
kubectl -n brainx rollout status deployment/workspace-service
kubectl -n brainx logs deployment/workspace-service --tail=100
# 나머지 서비스도 동일하게 반복
```

**4) Kafka advertised 주소 확인(Metadata 라운드트립) — 1)/2)로는 못 잡는 문제**

> DNS 조회(1)와 단순 TCP 접속(2)은 **최초 bootstrap 연결**만 확인한다. Kafka 클라이언트는 그 다음 Metadata 응답에 담긴 **advertised 주소로 재접속**해 실제 produce/consume를 수행하므로, bootstrap 성공과 실제 통신 성공은 별개다(5-3-6절 참고). 아래 명령으로 그 재접속 단계까지 실제로 확인한다.

Kafka CLI가 포함된 이미지(Compose가 쓰는 것과 동일한 `apache/kafka:3.8.0`)로 임시 Pod를 띄워 확인한다. 정확한 스크립트 경로는 이미지 버전에 따라 다를 수 있으므로, 먼저 Compose 컨테이너에서 경로를 확인한다:

```bash
docker exec -it brainx-kafka ls /opt/kafka/bin | grep -E 'broker-api-versions|console-producer|console-consumer'
```

**4-1) Broker API 조회** — bootstrap(`kafka.internal:9093`) 접속 후 Metadata가 돌려준 advertised 주소로 실제 재접속해 응답이 오는지 확인(재접속 대상이 `host.docker.internal` 등으로 잘못 나오면 이 단계에서 그대로 실패/타임아웃한다):

```bash
kubectl -n brainx run kafka-cli-test --rm -it --image=apache/kafka:3.8.0 --restart=Never -- \
  /opt/kafka/bin/kafka-broker-api-versions.sh --bootstrap-server kafka.internal:9093
```

**4-2) Producer/Consumer 라운드트립** — 실제 메시지를 써서 다시 읽어와 완전한 통신을 확인:

```bash
kubectl -n brainx run kafka-cli-test --rm -it --image=apache/kafka:3.8.0 --restart=Never -- bash -c '
  echo "brainx-k3s-poc-smoke-test" | /opt/kafka/bin/kafka-console-producer.sh \
    --bootstrap-server kafka.internal:9093 --topic brainx-k3s-poc-smoke-test &&
  /opt/kafka/bin/kafka-console-consumer.sh \
    --bootstrap-server kafka.internal:9093 --topic brainx-k3s-poc-smoke-test \
    --from-beginning --max-messages 1 --timeout-ms 10000
'
```

4-1)과 4-2) 모두 통과해야 "Kafka가 실제로 쓸 수 있는 상태"로 판단한다. 4-1)만 통과하고 4-2)가 실패한다면 advertised 주소는 맞지만 다른 원인(토픽 자동 생성, ACL, 방화벽 등)을 의심한다.

#### 5-3-6. 주의사항 — Compose 인프라 쪽 listen/bind/advertised 설정

CoreDNS가 이름을 풀어줘도, Compose 컨테이너가 **localhost/loopback에만 bind**하고 있으면 k3s Pod(다른 네트워크 네임스페이스)에서는 연결이 거부되거나 타임아웃난다. EC2로 옮기면서 아래를 함께 점검한다.

- **PostgreSQL**: `listen_addresses`가 `localhost`로 제한되어 있지 않은지, Compose가 호스트 인터페이스에 포트를 바인딩하는지 확인.
- **Redis**: `bind` 설정이 `127.0.0.1`만 허용하지 않는지 확인(필요 시 `protected-mode`/인증 설정과 함께 검토).
- **Neo4j**: Bolt 리스너가 `0.0.0.0:7687`로 바인딩되어 있는지 확인.
- **Qdrant**: gRPC 포트(6334)가 컨테이너 외부(호스트)로 노출되어 있는지 확인.
- **Kafka(★ 가장 흔한 실패 지점)**: `KAFKA_ADVERTISED_LISTENERS`의 `K8S` 리스너 값이 **`kafka.internal:9093`과 정확히 일치**해야 한다. `brainX_back/docker-compose.yml`은 이 호스트명을 `KAFKA_K8S_ADVERTISED_HOST` 환경변수로 분리해 두었다(`K8S://${KAFKA_K8S_ADVERTISED_HOST:-host.docker.internal}:9093`, 기본값은 로컬용 `host.docker.internal`). 5-3-1절의 `run-infra.ps1`이 이 값을 `kafka.internal`로 자동 강제 설정하므로, **`run-infra.ps1`로 인프라를 띄웠다면** advertised 주소는 이미 맞게 렌더링된다. 반대로 이 EC2에서 `run-infra.ps1` 대신 `run.ps1`이나 수동 `docker compose up`을 `KAFKA_K8S_ADVERTISED_HOST` 지정 없이 실행하면 advertised 주소가 다시 `host.docker.internal`로 돌아가 Pod가 최초 연결(9093 포트)에는 성공해도 Kafka가 메타데이터 응답으로 돌려주는 주소를 재해석하지 못해 실패한다 — DNS/TCP 1차 확인(5-3-5절 1·2)만으로는 이 문제를 못 잡으므로, Kafka를 쓰는 서비스(Admin/Workspace/Ingestion/Commerce/Intelligence)는 반드시 5-3-5절 4)의 Kafka CLI 라운드트립 또는 실제 Consumer/Producer 로그까지 확인한다. `:9092`(EXTERNAL 리스너)로 바꾸지 않는다(README.md에 이미 경고된 advertised address 루프백 이슈와 동일 원인).

이 조치는 임시방편이며(같은 EC2 위 Compose 인프라를 전제로 한 옵션 A), 인프라까지 k3s in-cluster로 옮기는 옵션 B 전환이나 `host.docker.internal`/`.internal` 계열 자체를 완전히 없애는 작업은 [EC2_K3S_MIGRATION_PLAN.md](EC2_K3S_MIGRATION_PLAN.md) 4장 범위의 후속 작업이다.

---

## 6. Secret 적용 순서

로컬 [RUNBOOK.md 2장](RUNBOOK.md#2-secret-생성-순서)과 동일한 파일·순서를 쓰되, **로컬 검증에 쓰던 값을 그대로 재사용하지 않는다**([EC2_K3S_MIGRATION_PLAN.md](EC2_K3S_MIGRATION_PLAN.md) 5장 원칙). 이 문서에는 실제 값을 적지 않는다 — `<CHANGE_ME>`는 신규 발급 값으로 채운다는 뜻이다. namespace는 4-3절에서 이미 생성했으므로 여기서 다시 만들지 않는다.

```powershell
# 1) 공용 Secret
kubectl apply -f .\k8s\secrets\gateway-secret.yaml       # SERVICE_TOKEN, JWT_SECRET: 신규 발급
kubectl apply -f .\k8s\secrets\postgres-secret.yaml       # POSTGRES_USER/PASSWORD: 신규 발급

# 2) 서비스 전용 Secret (JWT_SECRET은 gateway-secret과 반드시 동일 값)
kubectl apply -f .\k8s\secrets\workspace-secret.yaml
kubectl apply -f .\k8s\secrets\mcp-service-secret.yaml
kubectl apply -f .\k8s\secrets\admin-service-secret.yaml
kubectl apply -f .\k8s\secrets\ingestion-service-secret.yaml
kubectl apply -f .\k8s\secrets\commerce-service-secret.yaml
kubectl apply -f .\k8s\secrets\intelligence-service-secret.yaml
```

적용 확인:

```powershell
kubectl -n brainx get secrets
```

`JWT_SECRET` 일치 확인은 [RUNBOOK.md 2-2절](RUNBOOK.md#2-2-jwt_secret-공유-규칙-가장-자주-틀리는-부분) 명령을 그대로 쓴다(대상: `gateway-secret`, `workspace-secret`, `mcp-service-secret`, `admin-service-secret`).

Monitoring까지 검증할 경우:

```powershell
kubectl apply -f .\k8s\secrets\grafana-secret.yaml
```

### 6-1. (선택) `user-service-oauth-secret` — 소셜 로그인 테스트 시에만

위 필수 Secret 목록에 없다. `k8s/apps/user-service.yaml`이 이 Secret의 8개 키(`GOOGLE_CLIENT_ID`/`SECRET`/`REDIRECT_URI`, `KAKAO_*`, `NAVER_*`)를 전부 `secretKeyRef.optional: true`로 참조하므로, 이 Secret이 없어도 `user-service` Pod는 정상 기동한다 — 없으면 `AuthService.authorizeOAuth()`가 `application.yml`의 placeholder 기본값으로 동작해 실제 소셜 로그인 콜백만 실패한다. 기본 PoC 배포와 8장 health 확인에는 필요 없다.

Google/Kakao/Naver 로그인까지 실제로 검증하고 싶을 때만 `k8s/secrets/user-service-oauth-secret.example.yaml`을 복사해 신규 값으로 채워 적용한다. 이때 각 `*_REDIRECT_URI` 값은 반드시 **이 새 EC2의 공개 주소**를 가리켜야 하며, 각 OAuth 제공자 콘솔의 redirect URI 허용 목록에도 동일 주소를 등록해야 한다(둘 다 저장소 밖 작업).

`brainx-k3s-deploy.yml`의 Secret preflight도 이 원칙에 맞춰 `user-service-oauth-secret`을 필수 목록에서 제외했다(선택 항목이므로).

---

## 7. 앱 배포 순서

**dev overlay(`k8s/overlays/dev`)가 EC2/k3s PoC의 SSOT다.** `k8s/apps/*.yaml` 원본은 `brainx-*:local` 이미지와 `host.docker.internal`을 그대로 갖고 있는 **로컬 Docker Desktop 전용** 파일이며, 이 EC2에 직접 `kubectl apply -f`로 적용하지 않는다 — ECR 이미지도, `.internal` 주소도 반영되지 않은 채 배포되어 5-3절에서 애써 맞춘 DNS 구성이 무의미해진다.

> ⚠️ **원본 `k8s/overlays/dev`를 직접 렌더링/apply하지 않는다.** `k8s/overlays/dev/kustomization.yaml`의 `images:` 트랜스포머는 `<ECR_REGISTRY>`/`<IMAGE_TAG>` placeholder를 그대로 갖고 있다 — 원본을 그대로 `kubectl kustomize`/`apply -k` 하면 이 placeholder 문자열이 그대로 이미지 이름에 박혀 `ImagePullBackOff`가 난다. GitHub Actions(`brainx-k3s-deploy.yml`)의 `prepare` job은 이 문제를 **저장소 사본(bundle)** 을 만들어 그 사본에서만 치환하는 방식으로 피한다(원본 `k8s/` 디렉터리는 절대 수정하지 않음). 아래 7-1절은 그 방식을 사람이 손으로 재현한 것이다 — **임시 작업 디렉터리에 필요한 파일만 복사하고, 그 복사본에서만 placeholder를 치환하며, 이후 모든 `kustomize`/`apply`는 그 복사본을 대상으로 한다.**

### 7-1. 임시 디렉터리 준비 → placeholder 치환 → 렌더 검증 → apply(+fallback) (아래 블록 전체를 한 번에 실행)

> **아래 블록 전체를 한 번에(하나의 셸 세션에서 처음부터 끝까지) 실행한다.** 중간에 끊어서 여러 셸에 나눠 실행하면 `BUNDLE_DIR`/`ECR_REGISTRY`/`IMAGE_TAG`/`RENDERED_FILE` 같은 변수와 `trap`이 유실된다. `set -euo pipefail`이 걸려 있어 `kubectl kustomize` 렌더링 실패가 뒤따르는 파이프/조건문에 의해 감춰지지 않고 즉시 중단되며, 렌더 결과는 먼저 파일로 저장해 검증한 뒤에만 apply에 쓴다. `apply -k`가 실패하면 **재렌더링하지 않고 이미 검증을 통과한 그 파일**을 `kubectl apply -f`로 적용한다(GitHub Actions `deploy_remote.sh`의 라이브 재-kustomize 파이프 대신, 검증 대상과 적용 대상이 항상 같은 파일이 되도록 더 안전하게 구성 — 배포 결과는 동일하다). 실패 시에는 `trap`이 임시 디렉터리를 정리하고, 성공 시에는 블록 마지막에서 `rm -rf` + `trap - EXIT`로 즉시 정리한다(대화형 셸에서 EXIT trap이 셸 종료까지 지연되는 것을 방지).

```bash
set -euo pipefail

# 사람이 먼저 채워야 하는 값(실제 계정 번호/레지스트리 값을 이 문서에 적지 않는다 — 실제 실행 시점에 본인 값으로 치환)
ECR_REGISTRY="<ECR_REGISTRY>"   # 예: <AWS_ACCOUNT_ID>.dkr.ecr.<REGION>.amazonaws.com
IMAGE_TAG="<IMAGE_TAG>"         # 예: git SHA 또는 k3s-poc-latest

REPO_ROOT="$(pwd)"
if [ ! -d "$REPO_ROOT/k8s" ]; then
  echo "FAIL: 저장소 루트(k8s/ 디렉터리가 보이는 위치)에서 실행하세요." >&2
  exit 1
fi

BUNDLE_DIR="$(mktemp -d /tmp/brainx-k3s-bundle.XXXXXX)"
trap 'rm -rf "$BUNDLE_DIR"' EXIT
echo "임시 작업 디렉터리: $BUNDLE_DIR"

# 1) k8s/base·k8s/overlays/dev가 의존하는 상대경로 구조(base는 ../namespace.yaml/../apps/*.yaml 참조,
#    dev는 ../../base 참조)를 그대로 유지하며 복사만 한다(CI prepare job과 동일 레이아웃, 원본 k8s/는 무수정).
cp "$REPO_ROOT/k8s/namespace.yaml" "$BUNDLE_DIR/namespace.yaml"
cp -r "$REPO_ROOT/k8s/apps" "$BUNDLE_DIR/apps"
cp -r "$REPO_ROOT/k8s/base" "$BUNDLE_DIR/base"
mkdir -p "$BUNDLE_DIR/overlays"
cp -r "$REPO_ROOT/k8s/overlays/dev" "$BUNDLE_DIR/overlays/dev"

# 2) 복사본의 dev overlay 안에서만 placeholder 치환(원본 k8s/overlays/dev는 무수정)
grep -rl -e '<ECR_REGISTRY>' -e '<IMAGE_TAG>' "$BUNDLE_DIR/overlays/dev" | while read -r f; do
  sed -i "s#<ECR_REGISTRY>#$ECR_REGISTRY#g; s#<IMAGE_TAG>#$IMAGE_TAG#g" "$f"
done

# 3) 치환 후에도 placeholder가 남아있으면 강제로 즉시 중단(값을 안 채웠거나 sed가 일부만 치환된 경우)
if grep -rl -e '<ECR_REGISTRY>' -e '<IMAGE_TAG>' "$BUNDLE_DIR/overlays/dev" >/dev/null 2>&1; then
  echo "FAIL: 치환 후에도 <ECR_REGISTRY>/<IMAGE_TAG> placeholder가 남아 있습니다. ECR_REGISTRY/IMAGE_TAG 값을 확인하세요." >&2
  grep -rn -e '<ECR_REGISTRY>' -e '<IMAGE_TAG>' "$BUNDLE_DIR/overlays/dev" >&2
  exit 1
fi
echo "OK: $BUNDLE_DIR/overlays/dev 에 <ECR_REGISTRY>/<IMAGE_TAG> placeholder 없음."

# 4) 렌더링 — 임시 파일에 먼저 저장한다. kustomize 자체가 실패하면 set -e가 여기서 즉시 중단시킨다
#    (파이프가 아니라 단순 리다이렉션이므로 실패가 뒤에서 감춰지지 않는다).
RENDERED_FILE="$BUNDLE_DIR/rendered.yaml"
kubectl kustomize "$BUNDLE_DIR/overlays/dev" --load-restrictor LoadRestrictionsNone > "$RENDERED_FILE"
if [ ! -s "$RENDERED_FILE" ]; then
  echo "FAIL: 렌더 결과 파일이 비어 있습니다($RENDERED_FILE). apply로 진행하지 않습니다." >&2
  exit 1
fi
echo "OK: 렌더 완료 -> $RENDERED_FILE"

# 5) 렌더 결과 검증 — 금지 토큰이 남아있으면 apply하지 않는다
if grep -E 'brainx-[a-z-]+:local|host\.docker\.internal|<ECR_REGISTRY>|<IMAGE_TAG>' "$RENDERED_FILE"; then
  echo "FAIL: forbidden token found in rendered manifest" >&2
  exit 1
fi
echo "OK: no local image / host.docker.internal / unresolved placeholder in rendered manifest"

# dev overlay가 실제로 5개 .internal 이름을 쓰는지 확인(정보 출력)
grep -E 'postgres\.internal|redis\.internal|kafka\.internal:9093|neo4j\.internal|qdrant\.internal' "$RENDERED_FILE"

# 6) apply -k 시도 → 실패하면 위에서 이미 검증을 통과한 동일 $RENDERED_FILE을 apply -f로 적용(재-kustomize하지 않음)
if kubectl apply -k "$BUNDLE_DIR/overlays/dev" --load-restrictor LoadRestrictionsNone; then
  echo "Deployed via: kubectl apply -k --load-restrictor LoadRestrictionsNone"
else
  echo "kubectl apply -k --load-restrictor unsupported/failed; falling back to 'kubectl apply -f' on the already-validated $RENDERED_FILE." >&2
  if kubectl apply -f "$RENDERED_FILE"; then
    echo "Deployed via: kubectl apply -f <validated rendered.yaml> (fallback)"
  else
    echo "FAIL: both 'kubectl apply -k' and the 'kubectl apply -f <rendered.yaml>' fallback failed." >&2
    exit 1
  fi
fi

# 7) 성공 경로에서는 여기서 즉시 정리한다(대화형 셸에 이 블록만 붙여넣고 셸을 계속 쓰는 경우,
#    EXIT trap은 셸 자체가 종료될 때까지 지연될 수 있어 임시 디렉터리가 그때까지 남아있을 수 있다).
#    실패 시(위의 각 exit 1)에는 이 줄까지 도달하지 못하므로 EXIT trap이 그대로 정리를 맡는다.
rm -rf "$BUNDLE_DIR"
trap - EXIT
echo "정리 완료: $BUNDLE_DIR 삭제됨."
echo "완료."
```

`k8s/base/kustomization.yaml`이 `../namespace.yaml`과 `../apps/*.yaml` 9개 서비스를 전부 포함하므로, 이 한 번의 apply로 namespace(4-3절에서 이미 만들어져 있어 멱등하게 통과)와 9개 서비스 전체가 함께 생성/갱신된다. 개별 파일을 서비스별로 나눠 apply하지 않는다.

### 7-2. Rollout 순서 확인

한 번에 apply되지만, 확인은 서비스별로 순차 진행한다. **정확히 동일한 순서는 아니다** — `brainx-k3s-deploy.yml`의 `deploy_remote.sh`는 discovery → gateway → user → **workspace** → admin → **mcp** → **ingestion** → commerce → intelligence 순으로 `rollout status`를 호출하는 반면, 아래는 기존 README/RUNBOOK 순서(Discovery → Gateway → User → Admin → Ingestion → Commerce → Intelligence → MCP → Workspace)를 그대로 썼다. **확인해야 할 Deployment 9개는 workflow와 완전히 같으며, 점검 순서만 workflow 로그 순서와 다를 수 있다** — 순서 자체가 rollout 성공/실패 판정에 영향을 주지는 않는다.

```bash
kubectl -n brainx rollout status deployment/discovery-service
kubectl -n brainx rollout status deployment/gateway-service
kubectl -n brainx rollout status deployment/user-service
kubectl -n brainx rollout status deployment/admin-service
kubectl -n brainx rollout status deployment/ingestion-service
kubectl -n brainx rollout status deployment/commerce-service
kubectl -n brainx rollout status deployment/intelligence-service
kubectl -n brainx rollout status deployment/mcp-service
kubectl -n brainx rollout status deployment/workspace-service
```

### 7-3. Pod 상태 전체 확인

```powershell
kubectl -n brainx get pods
kubectl -n brainx get deployments
kubectl -n brainx get services
```

9개 전부 `1/1 Running`인지 확인한다(로컬 기준선: [EC2_K3S_MIGRATION_PLAN.md](EC2_K3S_MIGRATION_PLAN.md) 0장 — 로컬에서 이미 9개 확인됨).

### 7-4. Gateway만 NodePort로 임시 노출 (1차 검증)

```powershell
kubectl -n brainx patch svc gateway-service -p "{\"spec\":{\"type\":\"NodePort\"}}"
kubectl -n brainx get svc gateway-service
```

출력된 NodePort 값이 2장에서 SG에 연 `30080`과 일치하도록 필요 시 다음으로 고정한다:

```powershell
kubectl -n brainx patch svc gateway-service -p "{\"spec\":{\"ports\":[{\"port\":8088,\"targetPort\":8088,\"nodePort\":30080}]}}"
```

이 패치는 **실행 후 검증이 끝나면 되돌린다**(`type: ClusterIP`로 원복) — Ingress 전환 전까지 서비스를 상시 공개 노출 상태로 두지 않는다.

---

## 8. health 확인

### 8-1. port-forward 기반 (권장 — SG를 추가로 열지 않아도 됨)

로컬 PC에서 원격 kubeconfig(`$env:KUBECONFIG`)를 그대로 사용:

```powershell
kubectl -n brainx port-forward svc/discovery-service 18761:8761
kubectl -n brainx port-forward svc/gateway-service 18088:8088
kubectl -n brainx port-forward svc/user-service 18080:8080
kubectl -n brainx port-forward svc/admin-service 18085:8085
kubectl -n brainx port-forward svc/workspace-service 18082:8082
kubectl -n brainx port-forward svc/mcp-service 18087:8087
kubectl -n brainx port-forward svc/ingestion-service 18083:8083
kubectl -n brainx port-forward svc/commerce-service 18084:8084
kubectl -n brainx port-forward svc/intelligence-service 18086:8086
```

각 포트마다 새 터미널에서:

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
curl.exe http://localhost:18083/actuator/health
curl.exe http://localhost:18084/actuator/health
curl.exe http://localhost:18086/actuator/health/readiness
curl.exe http://localhost:18086/actuator/health/liveness
```

전부 `200`이어야 한다(엔드포인트별 기준은 [RUNBOOK.md 6장](RUNBOOK.md#6-health-확인) 표와 동일).

### 8-2. NodePort 기반 (7-4절 노출 시에만, Gateway 하나만)

```powershell
curl.exe http://<EC2_PUBLIC_IP>:30080/actuator/health
```

### 8-3. 최종 체크리스트

- [ ] `kubectl -n brainx get pods` — 9개 전부 `READY 1/1`, `STATUS Running`
- [ ] `kubectl -n brainx get pods`의 `RESTARTS`가 관찰 시간 동안 증가하지 않음
- [ ] 8-1절 curl 전부 `200`
- [ ] `sudo k3s kubectl get nodes`가 계속 `Ready` 유지(관찰 중 `NotReady` 전환 없음)
- [ ] JWT_SECRET 4곳 일치([RUNBOOK.md 2-2](RUNBOOK.md#2-2-jwt_secret-공유-규칙-가장-자주-틀리는-부분))
- [ ] `git status`, `git status --ignored`로 실제 Secret 파일이 이 EC2/로컬 어디에도 커밋 추적되지 않음

---

## 9. 실패 시 전체 폐기/재시도 기준

`k8s` 애플리케이션 레벨 문제는 기존 절차를 그대로 쓴다: `kubectl -n brainx rollout undo deployment/<service-name>`([RUNBOOK.md 9장](RUNBOOK.md#9-rollout-실패-시-복구)의 증상별 표를 그대로 참고).

**다음 중 하나라도 해당하면 디버깅을 연장하지 않고 EC2 자체를 폐기 후 재시도한다**([EC2_K3S_MIGRATION_PLAN.md](EC2_K3S_MIGRATION_PLAN.md) 9-4절과 동일 기준):

- 동일 서비스가 재배포 3회 이상 시도 후에도 `CrashLoopBackOff` 반복
- `sudo k3s kubectl get nodes`가 계속 `NotReady`로 안정화되지 않음
- 이미지 import(5장)가 반복 실패하거나 디스크 공간(`df -h`) 부족이 원인으로 확인됨
- 8-3절 체크리스트가 반나절 이상 작업해도 전부 통과하지 못함(예산 초과)

### 9-1. 폐기 절차 (신규 리소스만 대상)

1. 로컬 port-forward/NodePort 패치 원복(7-4절)
2. EC2 인스턴스 정지 또는 종료
3. 신규 EIP 반납
4. 신규 Security Group 삭제
5. (DNS 레코드를 만들었다면) 해당 레코드만 삭제 — 기존 `<public-domain>` 계열은 손대지 않는다

### 9-2. 데이터 손실 전제

이번 구성(옵션 A)의 상태 저장소는 전부 EC2 로컬 디스크(Compose 볼륨 또는 k3s `local-path` PVC)에 있다. 인스턴스를 폐기하면 데이터도 함께 사라진다 — 애초에 "휘발 가능한 환경"으로 취급하고, 검증 결과(로그·스크린샷·curl 응답)만 별도로 남긴다.

### 9-3. 재시도 시 확인할 것

폐기 후 재시도할 때는 1장부터 다시 시작하되, 직전 실패 원인을 아래 항목 중 어디에 해당하는지 먼저 기록한다.

- EC2 사이징 문제(메모리/CPU 부족) → 1장 인스턴스 타입부터 재검토
- 이미지 import 문제 → 5장 절차 자체를 점검(디스크 용량, 파일 전송 무결성)
- `.internal` 호스트(postgres/redis/kafka/neo4j/qdrant.internal) 조치 실패 → 5-3절 CoreDNS 설정 재확인, 안 되면 옵션 B([EC2_K3S_MIGRATION_PLAN.md](EC2_K3S_MIGRATION_PLAN.md) 4장) 전환을 팀과 논의
- Secret/JWT 불일치 → 6장 재확인

---

> 이 문서는 Codex 재리뷰를 반복하며 발견된 P0/P1을 그때그때 반영 중이다. 최종 Codex 리뷰에서 P0/P1 없음 및 배포 가능(YES) 판정을 받기 전까지는 "구현 완료"로 간주하지 않는다.
