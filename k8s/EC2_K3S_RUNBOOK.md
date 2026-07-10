# BrainX EC2 + k3s 수동 검증 Runbook

> 작성일: 2026-07-09
> 문서 성격: **실행 절차서**. 사람이 위에서 아래로 그대로 따라 하며 새 EC2에 k3s를 올리고 BrainX 9개 앱을 검증한다.
> 전제 문서: [EC2_K3S_MIGRATION_PLAN.md](EC2_K3S_MIGRATION_PLAN.md)(의사결정/전략), [PRODUCTION_CHECKLIST.md](PRODUCTION_CHECKLIST.md), [RUNBOOK.md](RUNBOOK.md)(로컬 운영 절차)

## 이 문서가 하지 않는 것

- 실제 AWS 리소스를 생성하지 않는다(EC2/SG/EIP/IAM Role/ECR repo는 사람이 콘솔·CLI로 직접 만들고, 이 문서는 만든 뒤 무엇을 확인/실행할지만 다룬다).
- 실제 Secret 값을 적지 않는다(전부 `<CHANGE_ME>` placeholder).
- 기존 운영 EC2(`infra/aws-dev`) 관련 명령을 다루지 않는다.
- GitHub Actions workflow 파일을 만들지 않는다. 최종 결정상 정상 운영 배포는 `workflow_dispatch` 수동 트리거가 기본 전략([EC2_K3S_MIGRATION_PLAN.md](EC2_K3S_MIGRATION_PLAN.md) 7장)이지만, 그 workflow 파일이 실제로 만들어지기 전까지 이 문서는 **사람이 직접 `kubectl`/SSM으로 실행하는 절차**만 다룬다. workflow가 구현된 이후에는 7장 이하 apply 절차 상당 부분이 그 workflow 내부 스크립트로 대체될 예정이다.
- `host.docker.internal` 완전 제거는 다루지 않는다(후속 작업, [EC2_K3S_MIGRATION_PLAN.md](EC2_K3S_MIGRATION_PLAN.md) 4장 참고). 이 문서는 기존 매니페스트를 그대로 두고, `host.docker.internal`이 새 노드에서도 풀리도록 인프라 레벨에서만 임시 조치한다(5-3절).
- **Kustomize overlay는 구현 완료됐다.** 설계는 [KUSTOMIZE_OVERLAY_DESIGN.md](KUSTOMIZE_OVERLAY_DESIGN.md)에 정리돼 있고, `k8s/base/`, `k8s/overlays/local/`, `k8s/overlays/dev/`(patches 포함) 파일이 실제로 생성되어 `kubectl kustomize` 렌더링 검증까지 끝났다. dev overlay는 ECR image tag와 `<EC2_HOST>` 등 인프라 값을 여전히 placeholder로 두고 있어, 실제 EC2 값 채우기와 `kubectl apply -k` 실행은 아직 하지 않았다. 이 문서(7장)는 그 값 채우기 전까지, 그리고 값 채우기 이후에도 필요 시 기존 `k8s/apps/*.yaml`을 `kubectl apply -f`로 직접 적용하는 절차를 다룬다.
- **ECR 전환은 더 이상 "다루지 않는" 항목이 아니다.** 이 문서의 기본 이미지 경로는 ECR pull이다(5장). `docker build/save/scp/import`는 ECR 준비가 끝나기 전까지만 쓰는 보조/임시 경로로 격하한다(5-2절).

---

## 0. 배포 순서 요약

```
1. EC2 생성 전 체크리스트 확인 (사람이 콘솔/CLI로 EC2 생성)
2. 보안그룹 포트 오픈
3. k3s 설치
4. kubectl 확인 (로컬 → 원격 클러스터)
5. 이미지 준비 (ECR pull, 기본 경로) + host.docker.internal 임시 조치
6. Secret 적용
7. 앱 배포 (Discovery → Gateway → User → Admin → Ingestion → Commerce → Intelligence → MCP → Workspace)
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
- [ ] **image tag 정책**: [EC2_K3S_MIGRATION_PLAN.md](EC2_K3S_MIGRATION_PLAN.md) 7.2절 기준으로 재배포에 쓸 태그(`git sha` 또는 `k3s-poc-latest`)를 먼저 정하고, 매니페스트 `image:` 필드를 `<ECR_REGISTRY>/brainx-<service>:<tag>` 형태로 맞춘다. Docker Desktop 로컬 빌드용 `:local` 태그는 EC2/k3s 대상 매니페스트에 남기지 않는다.
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

### 5-3. host.docker.internal 임시 조치 (매니페스트는 건드리지 않음)

현재 앱 매니페스트 다수가 `host.docker.internal`로 인프라(Postgres/Redis/Neo4j/Kafka)에 접근한다([EC2_K3S_MIGRATION_PLAN.md](EC2_K3S_MIGRATION_PLAN.md) 4장 옵션 A 채택 전제). EC2 Linux + k3s에는 Docker Desktop 같은 자동 별칭이 없으므로, **같은 EC2 위에 인프라를 Docker Compose로 띄우는 옵션 A**를 그대로 따른다면 아래 중 하나로 해석 가능하게 만든다.

```bash
# EC2에서 Compose 인프라를 먼저 기동
git clone <repository-url> ~/BrainX && cd ~/BrainX && git checkout <branch-name>
./run.ps1   # 또는 리포지토리의 Linux 대응 실행 스크립트 확인 후 사용
```

CoreDNS에 `host.docker.internal` → EC2 자기 자신(사설 IP)으로 풀리도록 hosts 항목만 추가한다(앱 YAML은 무수정):

```bash
sudo k3s kubectl -n kube-system edit configmap coredns
```

`Corefile` 안 `.:53 { ... }` 블록에 아래를 추가:

```
hosts /etc/coredns/customhosts {
    <EC2_PRIVATE_IP> host.docker.internal
    fallthrough
}
```

그리고 실제 파일을 만든다:

```bash
sudo mkdir -p /var/lib/rancher/k3s/server/manifests
echo "<EC2_PRIVATE_IP> host.docker.internal" | sudo tee /etc/coredns/customhosts
sudo k3s kubectl -n kube-system rollout restart deployment/coredns
```

확인:

```bash
sudo k3s kubectl -n brainx run dns-test --rm -it --image=busybox --restart=Never -- nslookup host.docker.internal
```

이 조치는 임시방편이며, `host.docker.internal` 자체를 제거하는 것은 [EC2_K3S_MIGRATION_PLAN.md](EC2_K3S_MIGRATION_PLAN.md) 4장 범위의 후속 작업이다.

---

## 6. Secret 적용 순서

로컬 [RUNBOOK.md 2장](RUNBOOK.md#2-secret-생성-순서)과 동일한 파일·순서를 쓰되, **로컬 검증에 쓰던 값을 그대로 재사용하지 않는다**([EC2_K3S_MIGRATION_PLAN.md](EC2_K3S_MIGRATION_PLAN.md) 5장 원칙). 이 문서에는 실제 값을 적지 않는다 — `<CHANGE_ME>`는 신규 발급 값으로 채운다는 뜻이다.

```powershell
kubectl apply -f .\k8s\namespace.yaml

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

---

## 7. 앱 배포 순서

[README.md](README.md)/[RUNBOOK.md](RUNBOOK.md) 기준 순서를 그대로 따른다: **Discovery → Gateway → User → Admin → Ingestion → Commerce → Intelligence → MCP → Workspace**.

> **Kustomize overlay는 구현 완료됐지만, 이 절차는 여전히 파일 단위 `kubectl apply -f` 기준이다.** [KUSTOMIZE_OVERLAY_DESIGN.md](KUSTOMIZE_OVERLAY_DESIGN.md) 설계(`k8s/base` + `k8s/overlays/dev`)대로 실제 파일이 생성되어 렌더링 검증까지 끝났으나, dev overlay는 아직 ECR image tag·`<EC2_HOST>` placeholder 상태라 실제 EC2 값이 채워지기 전까지는 `kubectl apply -k k8s/overlays/dev` 실행이 의미가 없다. 값이 채워진 뒤에는 `kubectl apply -k k8s/overlays/dev --load-restrictor LoadRestrictionsNone` 한 줄로 이 절차를 대체할 수 있다 — 그 전까지는 이 문서의 파일 단위 절차가 유효하다.

### 7-1. ConfigMap 먼저 apply (해당 서비스만)

```powershell
kubectl apply -f .\k8s\apps\ingestion-service-configmap.yaml
kubectl apply -f .\k8s\apps\intelligence-service-configmap.yaml
kubectl apply -f .\k8s\apps\mcp-service-configmap.yaml
```

### 7-2. Deployment 순서대로 apply

```powershell
kubectl apply -f .\k8s\apps\discovery-service.yaml
kubectl apply -f .\k8s\apps\gateway-service.yaml
kubectl apply -f .\k8s\apps\user-service.yaml
kubectl apply -f .\k8s\apps\admin-service.yaml
kubectl apply -f .\k8s\apps\ingestion-service.yaml
kubectl apply -f .\k8s\apps\commerce-service.yaml
kubectl apply -f .\k8s\apps\intelligence-service.yaml
kubectl apply -f .\k8s\apps\mcp-service.yaml
kubectl apply -f .\k8s\apps\workspace-service.yaml
```

각 apply 후 확인:

```powershell
kubectl -n brainx rollout status deployment/<service-name>
kubectl -n brainx get pods
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
- host.docker.internal 조치 실패 → 5-3절 CoreDNS 설정 재확인, 안 되면 옵션 B([EC2_K3S_MIGRATION_PLAN.md](EC2_K3S_MIGRATION_PLAN.md) 4장) 전환을 팀과 논의
- Secret/JWT 불일치 → 6장 재확인

---

SSOT 계약에 맞게 구현 완료
