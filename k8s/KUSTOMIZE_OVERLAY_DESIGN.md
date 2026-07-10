# BrainX Kustomize Overlay 설계 (EC2/k3s 전환)

> **범위: 단기 EC2+k3s PoC 전용.** 이 문서의 Kustomize overlay 경로는 EC2/k3s PoC를 빠르게 띄우기 위한 단기 수단으로만 채택되었다. 장기 운영형 배포 표준화는 별도로 Helm 전환([`k8s/HELM_MIGRATION.md`](HELM_MIGRATION.md), [`k8s/helm/HELM_DESIGN.md`](helm/HELM_DESIGN.md))을 후보로 검토하며, 두 경로의 공존/정리 전략은 [`k8s/EC2_K3S_MIGRATION_PLAN.md`](EC2_K3S_MIGRATION_PLAN.md) "10. 배포 도구 전략" 장을 따른다.
>
> 작성일: 2026-07-09 (설계) / 갱신: 2026-07-10 (구현 완료 반영)
> 문서 성격: **설계 문서 + 구현 완료 기록**. 이 문서의 설계대로 실제 `k8s/base/`, `k8s/overlays/local/`, `k8s/overlays/dev/`(patches 8개 포함) 파일이 생성됐고, `kubectl kustomize` 렌더링 검증과 dev overlay `host.docker.internal` 0건 확인까지 끝났다. 기존 `k8s/apps/*.yaml`, `k8s/namespace.yaml`, `k8s/secrets/*`는 이 구현에서도 전혀 수정하지 않았다(참조만 함). dev overlay의 ECR registry/image tag, `<EC2_HOST>` 등 실제 값 채우기와 `kubectl apply -k` 실제 적용은 아직 하지 않았다 — 그 부분은 후속 작업이다.
> 전제: [`k8s/EC2_K3S_MIGRATION_PLAN.md`](EC2_K3S_MIGRATION_PLAN.md)의 4~5장(`host.docker.internal` 제거 대상, ConfigMap/Secret 변경 항목)을 그대로 입력값으로 삼는다. 이 문서는 그 목록을 "Kustomize로 어떻게 구조화할 것인가"에 집중한다.

---

## 0. 판단 요약

### 0-1. base로 무엇을 쓸 것인가 — **`k8s/apps`를 원본 그대로, `k8s/base`는 그 위의 얇은 조립 레이어**

`k8s/base/kustomization.yaml` 하나만 신규로 두고, 그 안의 `resources:`가 상대경로로 기존 `k8s/apps/*.yaml`, `k8s/namespace.yaml`을 **직접 참조**한다. 파일 내용을 복제하지 않는다. Kustomize는 `resources:`에 자기 디렉터리 밖의 상대경로를 허용하므로 이 구조가 가능하다.

이유:

- "기존 `k8s/apps` 원본은 유지" + "기존 YAML 수정 금지" 두 조건을 동시에 만족하는 유일한 방법이 복제가 아니라 참조다.
- 로컬 Docker Desktop에서 9개 서비스 `1/1 Running`이 검증된 원본을 다시 손으로 옮겨적으면 그 자체가 새로운 드리프트 원인이 된다.
- `k8s/apps`는 계속 "Docker Desktop 로컬 1차 소스(source of truth)"로 남고, `base`는 "여러 환경이 공유하는 조립 지점" 역할만 한다.

대안으로 검토했으나 기각한 것: `k8s/apps` 내용을 `k8s/base`로 물리 이동하고 `k8s/apps`를 삭제. — 사용자가 명시적으로 "기존 원본 유지"를 요구했고, 다른 문서(`k8s/README.md`, `k8s/HELM_MIGRATION.md`, `k8s/PRODUCTION_CHECKLIST.md`)가 모두 `k8s/apps/*.yaml` 경로를 인용하고 있어 이동은 참조 문서 전체를 깨뜨린다. 채택하지 않는다.

### 0-2. 기존 Helm 전환 계획과의 관계 — **결정됨: Kustomize=단기 PoC, Helm=장기 운영 후보**

`k8s/HELM_MIGRATION.md` + `k8s/helm/HELM_DESIGN.md`가 이미 "raw manifest → Helm Chart" 전환 계획(`k8s/helm/brainx/`)을 갖고 있다. 이번 작업은 별도로 "raw manifest → Kustomize overlay" 경로를 추가하는 것이라, 같은 원본(`k8s/apps`)을 놓고 **두 개의 서로 다른 환경별 값 관리 방식**이 동시에 설계되는 상태가 된다.

- Helm 경로: `values.yaml` / `values-local.yaml` / `values-prod.yaml` 3파일 체계로 `host.docker.internal` 등을 관리.
- Kustomize 경로(이 문서): `overlays/local` / `overlays/dev`의 `patches`로 동일한 값을 관리.

두 경로가 최종까지 함께 유지되면 "새 EC2 접속 정보가 바뀔 때 Helm values와 Kustomize patch를 둘 다 고쳐야 하는" 이중 관리 비용이 생긴다. 이에 따라 다음과 같이 역할을 확정한다:

- **Kustomize overlay는 EC2/k3s PoC를 빠르게 띄우기 위한 단기 경로**로 범위를 한정한다(이번 목표와 일치).
- **Helm 전환은 장기 운영 표준화 후보 트랙**으로 별도 유지한다.
- 두 경로가 동시에 존재하는 동안에는 "값의 최종 출처(source of truth)는 실제로 사용 중인 경로 하나"라는 원칙으로 충돌을 방지한다 — 지금은 Kustomize overlay가 EC2/k3s PoC 값의 출처이고, Helm values 파일은 아직 실제 배포에 쓰이지 않는 설계 상태이므로 두 파일을 "같은 값을 두 번 적어야 하는 관계"로 취급하지 않는다. Helm이 실제 운영 배포 표준으로 승격되는 시점에 Kustomize overlay를 유지할지 폐기할지를 재결정한다. 자세한 단기/장기 전략 정리는 [`k8s/EC2_K3S_MIGRATION_PLAN.md`](EC2_K3S_MIGRATION_PLAN.md) "10. 배포 도구 전략" 장을 참고.

---

## 1. 추천 디렉터리 구조

```text
k8s/
├─ apps/                          # 기존 원본, 수정 금지 (그대로 유지)
├─ namespace.yaml                 # 기존 원본, 수정 금지
├─ base/                          # 신규: apps/*.yaml + namespace.yaml을 집계만 하는 레이어
│  └─ kustomization.yaml
└─ overlays/
   ├─ local/                      # 신규: 현재 Docker Desktop 동작을 그대로 재현하는 항등 오버레이
   │  └─ kustomization.yaml
   └─ dev/                        # 신규: EC2/k3s 대상, image/host/라우팅 patch
      ├─ kustomization.yaml
      └─ patches/
         ├─ gateway-service-routing.yaml       # Deployment env(SPRING_APPLICATION_JSON) patch
         ├─ user-service-hosts.yaml            # Deployment env(POSTGRES_HOST 등 inline) patch
         ├─ workspace-service-config.yaml      # ConfigMap data patch
         ├─ admin-service-config.yaml          # ConfigMap data patch
         ├─ ingestion-service-config.yaml      # ConfigMap data patch
         ├─ intelligence-service-config.yaml   # ConfigMap data patch
         ├─ mcp-service-config.yaml            # ConfigMap data patch
         └─ commerce-service-config.yaml       # ConfigMap data patch
```

- `monitoring/`(Prometheus/Grafana)은 이번 설계 범위에서 제외한다. 사용자가 지정한 "작업" 4개 항목(image/host.docker.internal/Kafka/DB·Redis·Neo4j·Qdrant/Gateway routing)이 모두 `apps/` 대상이기 때문이다. 필요해지면 `k8s/overlays/dev`에 `monitoring` 관련 patch를 후속으로 추가하는 구조로 확장 가능(같은 패턴 재사용).
- `discovery-service.yaml`은 `host.docker.internal` 의존이 없으므로 dev overlay에서 image 치환 외 별도 patch가 필요 없다.
- Secret(`k8s/secrets/*.yaml`)은 base/overlay `resources`에 **포함하지 않는다**. 현재도 Secret은 `kubectl apply -f k8s/secrets/<name>.yaml`로 별도 적용되는 구조이고(Deployment는 `secretKeyRef`로 이름만 참조), dev 환경 Secret은 `EC2_K3S_MIGRATION_PLAN.md` 5장 기준으로 **로컬 값을 재사용하지 않고 신규 발급**해야 하므로 Kustomize 자동화 대상에 넣지 않는 것이 안전하다(실수로 로컬 평문 값이 dev로 흘러들어가는 경로를 원천 차단).

---

## 2. `k8s/base/kustomization.yaml` 설계

```yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization

resources:
  - ../namespace.yaml
  - ../apps/discovery-service.yaml
  - ../apps/gateway-service.yaml
  - ../apps/user-service.yaml
  - ../apps/admin-service.yaml
  - ../apps/workspace-service.yaml
  - ../apps/ingestion-service-configmap.yaml
  - ../apps/ingestion-service.yaml
  - ../apps/commerce-service.yaml
  - ../apps/intelligence-service-configmap.yaml
  - ../apps/intelligence-service.yaml
  - ../apps/mcp-service-configmap.yaml
  - ../apps/mcp-service.yaml
```

- 리소스 나열 순서는 의미상 종속성(예: ConfigMap이 그걸 참조하는 Deployment보다 먼저)을 지키되, Kustomize는 어차피 apply 순서를 자체적으로 정렬하므로 필수는 아니다. 다만 사람이 읽을 때 `k8s/README.md`의 apply 순서(README 3~10번)와 시각적으로 맞춰두면 리뷰가 쉽다.
- `admin-service.yaml`, `workspace-service.yaml`, `commerce-service.yaml`은 ConfigMap+Deployment+Service가 한 파일에 들어있어 별도 `-configmap.yaml`이 없다(현재 구조 그대로).
- `namespace:` 필드는 base에서 지정하지 않는다. 각 원본 파일이 이미 `metadata.namespace: brainx`를 명시하고 있어 중복 지정은 불필요하다. (overlay에서 namespace를 분리하고 싶어지면 — 예: `EC2_K3S_MIGRATION_PLAN.md` 5장의 "namespace를 `brainx-k3s`로 분리" 옵션 — dev overlay의 `kustomization.yaml`에 `namespace: brainx-k3s` 한 줄만 추가하면 되는 구조로 남겨둔다.)

---

## 3. `k8s/overlays/local/kustomization.yaml` 설계 — 항등(identity) 오버레이

```yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization

resources:
  - ../../base

commonLabels:
  environment: local
```

- 패치가 사실상 없다 — 오늘의 Docker Desktop 로컬 검증 결과(`host.docker.internal`, `:local` 이미지)를 그대로 재현하는 것이 목적이기 때문이다.
- 존재 이유: (1) `kubectl apply -k k8s/overlays/local`이라는 명령 하나로 로컬 환경 전체를 재현 가능하게 해서 dev overlay와 대칭 구조를 만든다. (2) `commonLabels: environment: local`처럼 환경 식별 라벨을 붙여 이후 `kubectl get all -l environment=local` 같은 조회가 가능해진다. (3) 나중에 로컬 전용 미세 조정이 필요해지면(Grafana/Prometheus 리소스 제한 등) 이 자리에 patch를 추가할 수 있는 확장 지점을 미리 마련해둔다.
- `kubectl kustomize k8s/overlays/local`의 출력이 `kubectl kustomize k8s/base`의 출력과 라벨 한 줄 차이 외에는 동일해야 정상이다. 이 동등성 자체가 "base가 로컬 동작을 정확히 대표한다"는 검증 수단이 된다.

---

## 4. `k8s/overlays/dev/kustomization.yaml` 설계 — EC2/k3s 대상

```yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization

resources:
  - ../../base

commonLabels:
  environment: dev

images:
  - name: brainx-discovery-service
    newName: <ECR_REGISTRY>/brainx-discovery-service
    newTag: <IMAGE_TAG>
  - name: brainx-gateway-service
    newName: <ECR_REGISTRY>/brainx-gateway-service
    newTag: <IMAGE_TAG>
  - name: brainx-user-service
    newName: <ECR_REGISTRY>/brainx-user-service
    newTag: <IMAGE_TAG>
  - name: brainx-admin-service
    newName: <ECR_REGISTRY>/brainx-admin-service
    newTag: <IMAGE_TAG>
  - name: brainx-workspace-service
    newName: <ECR_REGISTRY>/brainx-workspace-service
    newTag: <IMAGE_TAG>
  - name: brainx-ingestion-service
    newName: <ECR_REGISTRY>/brainx-ingestion-service
    newTag: <IMAGE_TAG>
  - name: brainx-commerce-service
    newName: <ECR_REGISTRY>/brainx-commerce-service
    newTag: <IMAGE_TAG>
  - name: brainx-intelligence-service
    newName: <ECR_REGISTRY>/brainx-intelligence-service
    newTag: <IMAGE_TAG>
  - name: brainx-mcp-service
    newName: <ECR_REGISTRY>/brainx-mcp-service
    newTag: <IMAGE_TAG>

patches:
  - path: patches/gateway-service-routing.yaml
  - path: patches/user-service-hosts.yaml
  - path: patches/workspace-service-config.yaml
  - path: patches/admin-service-config.yaml
  - path: patches/ingestion-service-config.yaml
  - path: patches/intelligence-service-config.yaml
  - path: patches/mcp-service-config.yaml
  - path: patches/commerce-service-config.yaml
```

- `<ECR_REGISTRY>`는 `<aws-account-id>.dkr.ecr.<region>.amazonaws.com`, `<IMAGE_TAG>`는 git SHA 또는 `dev` 같은 태그 — 실제 값은 이번 문서 범위 밖(EC2/ECR 준비 이후 확정, `EC2_K3S_MIGRATION_PLAN.md` 3장과 연동).
- Kustomize `images:` 트랜스포머는 리포지토리 이름(`name:`)으로 매칭하고 태그를 덮어쓰므로, 원본이 `brainx-gateway-service:local`이어도 `imagePullPolicy` 등 다른 필드는 건드리지 않는다. 즉 이미지 치환에는 별도 patch 파일이 필요 없다.

---

## 5. dev overlay에서 바꿔야 할 값

### 5-1. 이미지 (9개 서비스 전부)

| 서비스 | base 값 | dev 값 |
| --- | --- | --- |
| discovery / gateway / user / admin / workspace / ingestion / commerce / intelligence / mcp | `brainx-<service>:local` | `<ECR_REGISTRY>/brainx-<service>:<IMAGE_TAG>` |

→ `images:` 트랜스포머 하나로 전부 처리(4장 참고).

### 5-2. `host.docker.internal` 및 인프라 접속 값

`EC2_K3S_MIGRATION_PLAN.md` 4장 옵션 A(앱만 k3s, 인프라는 같은 EC2에 Compose 유지)를 기준으로 삼는다. 실제 목적지는 EC2 프라이빗 IP(또는 옵션 B 채택 시 in-cluster Service명)이며, 이 문서에서는 자리표시자 `<EC2_HOST>`로만 표기한다.

| 서비스 | 대상 파일(patch) | 변경 대상 키 | base 값 | dev 값(자리표시자) |
| --- | --- | --- | --- | --- |
| Gateway | `gateway-service-routing.yaml` | env `SPRING_APPLICATION_JSON` | `http://host.docker.internal:8080~8087` 7개 | `http://<EC2_HOST>:8080~8087` (또는 in-cluster `http://user-service:8080` 등 — 6장 라우팅 결정과 연동) |
| User | `user-service-hosts.yaml` | env `POSTGRES_HOST`, `REDIS_HOST`, `WORKSPACE_SERVICE_URL` | `host.docker.internal`, `host.docker.internal`, `http://host.docker.internal:8082` | `<EC2_HOST>`, `<EC2_HOST>`, `http://<EC2_HOST>:8082` |
| Workspace | `workspace-service-config.yaml` (ConfigMap `workspace-service-config`) | `POSTGRES_HOST`, `REDIS_HOST`, `NEO4J_URI`, `SPRING_KAFKA_BOOTSTRAP_SERVERS` | `host.docker.internal`, `host.docker.internal`, `bolt://host.docker.internal:7687`, `host.docker.internal:9093` | `<EC2_HOST>` 계열로 치환 |
| Admin | `admin-service-config.yaml` (ConfigMap `admin-service-config`) | `POSTGRES_HOST`, `SPRING_KAFKA_BOOTSTRAP_SERVERS`, `GATEWAY_SERVICE_URL`, `USER_SERVICE_URL`, `COMMERCE_SERVICE_URL`, `WORKSPACE_SERVICE_URL`, `INGESTION_SERVICE_URL`, `INTELLIGENCE_SERVICE_URL`, `MCP_SERVICE_URL` | 전부 `host.docker.internal[:port]` | `<EC2_HOST>` 계열로 치환(단, `WORKSPACE_SERVICE_URL`은 이미 in-cluster 전환된 서비스가 있으면 `http://workspace-service:8082`로 바꾸는 것도 검토 — 6장 참고) |
| Ingestion | `ingestion-service-config.yaml` (ConfigMap `ingestion-service-config`) | `POSTGRES_HOST`, `WORKSPACE_SERVICE_URL`, `SPRING_KAFKA_BOOTSTRAP_SERVERS` | `host.docker.internal` 계열 | `<EC2_HOST>` 계열로 치환 |
| Commerce | `commerce-service-config.yaml` (ConfigMap `commerce-service-config`) | `POSTGRES_HOST`, `SPRING_KAFKA_BOOTSTRAP_SERVERS` | `host.docker.internal` 계열 | `<EC2_HOST>` 계열로 치환 |
| Intelligence | `intelligence-service-config.yaml` (ConfigMap `intelligence-service-config`) | `SPRING_DATASOURCE_URL`, `REDIS_HOST`, `KAFKA_BOOTSTRAP_SERVERS`, `SPRING_KAFKA_BOOTSTRAP_SERVERS`, `QDRANT_HOST`, `BRAINX_COMMERCE_BASE_URL` | `host.docker.internal` 계열 | `<EC2_HOST>` 계열로 치환 |
| MCP | `mcp-service-config.yaml` (ConfigMap `mcp-service-config`) | `POSTGRES_HOST`, `WORKSPACE_SERVICE_URL`, `INTELLIGENCE_SERVICE_URL` | `host.docker.internal` 계열 | `<EC2_HOST>` 계열로 치환 |

추가로 MCP ConfigMap의 OAuth 공개 origin 4종(`PUBLIC_BASE_URL`, `BRAINX_OAUTH_ISSUER`, `BRAINX_MCP_RESOURCE`, `BRAINX_MCP_PROTECTED_RESOURCE_METADATA_URL`, 현재 `http://localhost:3000` 계열)도 `mcp-service-config.yaml` patch에서 같은 EC2 공개 origin으로 함께 바꿔야 한다(User-Service의 동일 값과도 일치 필요 — User-Service 쪽 값은 현재 Secret이 아니라 코드 기본값/미공개 환경변수이므로 이 문서의 patch 목록에는 없다는 점을 다음 구현 단계에서 재확인).

### 5-3. Gateway 라우팅

Gateway의 `SPRING_APPLICATION_JSON`은 정적 JSON 문자열이라 부분 치환이 아니라 **전체 교체**가 현실적이다. Kustomize 전략적 병합 패치는 `containers[].env[]`를 `name` 키로 병합하므로, 아래처럼 `name: SPRING_APPLICATION_JSON` 항목만 넣으면 다른 env는 그대로 유지된다.

```yaml
# k8s/overlays/dev/patches/gateway-service-routing.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: gateway-service
  namespace: brainx
spec:
  template:
    spec:
      containers:
        - name: gateway-service
          env:
            - name: SPRING_APPLICATION_JSON
              value: >-
                {"spring":{"cloud":{"discovery":{"client":{"simple":{"instances":{"User-Service":[{"uri":"http://<EC2_HOST>:8080"}],"Workspace-Service":[{"uri":"http://<EC2_HOST>:8082"}],"ingestion-service":[{"uri":"http://<EC2_HOST>:8083"}],"Commerce-Service":[{"uri":"http://<EC2_HOST>:8084"}],"Admin-Service":[{"uri":"http://<EC2_HOST>:8085"}],"intelligence-service":[{"uri":"http://<EC2_HOST>:8086"}],"mcp-service":[{"uri":"http://<EC2_HOST>:8087"}]}}}}}}}
```

같은 파일에서 실제 구현 시점에는 이미 in-cluster로 전환된 서비스(예: `workspace-service:8082`)가 있으면 해당 항목만 `http://workspace-service:8082`처럼 Kubernetes Service DNS로 바꿔, 옵션 A(Compose 인프라 유지)와 "일부 서비스만 먼저 in-cluster 전환" 두 가지를 같은 patch 파일 안에서 서비스 단위로 섞어 쓸 수 있다 — `k8s/README.md`의 "후속 전환 순서"(Discovery→Gateway→User→...→Workspace)와 동일한 점진적 전환 원칙을 그대로 Kustomize patch에 반영하는 지점이다.

### 5-4. DB / Redis / Neo4j / Qdrant / Kafka — 공통 원칙

- 포트 번호는 변경하지 않는다(5432/6379/7687/9093/Qdrant 포트). 호스트만 `host.docker.internal` → `<EC2_HOST>`로 바뀐다.
- Kafka는 반드시 `:9093`(k8s Pod 전용 K8S 리스너) 값을 유지한다. `:9092`(EXTERNAL 리스너)로 바꾸면 advertised address가 `localhost:9092`로 돌아와 Pod가 자기 자신에 재접속을 시도해 실패한다는 점이 `k8s/README.md`에 이미 경고돼 있다 — dev patch 작성 시에도 이 규칙을 그대로 지켜야 한다.
- Postgres/Redis/Neo4j 자격증명(계정, 비밀번호)은 patch 대상이 아니다 — 이미 `secretKeyRef`로 분리돼 있고, dev 환경 값은 Secret 쪽(`EC2_K3S_MIGRATION_PLAN.md` 5장)에서 별도로 신규 발급해 처리한다.

### 5-5. 값 치환 방식에 대한 참고 — Kustomize의 한계

Kustomize는 Helm처럼 `${VAR}` 템플릿 치환을 지원하지 않는다. 즉 위 표의 `<EC2_HOST>`는 실제 구현 시점에 patch YAML 안에 **리터럴 값**으로 박아 넣어야 한다(EC2 프라이빗 IP 또는 DNS). 두 가지 방식을 고려할 수 있다:

1. **리터럴 직접 기입(권장, 1차 PoC)**: patch 파일에 실제 IP를 그대로 적는다. 가장 단순하지만 EC2를 재생성해 IP가 바뀌면 patch 파일들을 다시 고쳐야 한다.
2. **ConfigMap generator + envs 파일(후속 강화)**: `k8s/overlays/dev/dev.env`(gitignore 대상, `k8s/secrets/*.yaml`과 같은 패턴)에 `EC2_HOST=...`를 두고 `configMapGenerator`로 별도 ConfigMap을 만들어 `envFrom`에 추가하는 방식. 다만 `envFrom` 리스트는 전략적 병합에서 병합 키가 없어 patch 시 전체를 다시 써야 하는 제약이 있어, 1차 PoC 범위에서는 과설계로 보고 채택하지 않는다.

1차 PoC는 방식 1로 시작하고, EC2 IP 변경 빈도가 문제가 되면 방식 2로 넘어가는 것을 권장한다.

---

## 6. `kubectl` 사용 예시 (렌더링 검증 완료, 실제 apply는 아직 안 함)

```powershell
# 로컬 (기존과 동일해야 함 — 회귀 검증용)
kubectl kustomize k8s/overlays/local | kubectl apply -f -

# dev (EC2/k3s, kubeconfig가 이미 새 클러스터를 가리키고 있다는 전제)
kubectl kustomize k8s/overlays/dev --load-restrictor LoadRestrictionsNone
kubectl apply -k k8s/overlays/dev --load-restrictor LoadRestrictionsNone
```

`k8s/base`가 `k8s/apps/*.yaml`을 자기 디렉터리 밖 상대경로로 참조하는 구조라, `dev` overlay에서 `../../base`를 다시 참조할 때 Kustomize 기본 `LoadRestrictions`(`rootOnly`)에 걸린다. 렌더링/적용 시 `--load-restrictor LoadRestrictionsNone`이 필요하다는 점이 구현 단계에서 확인됐다.

검증 기준(구현 완료, 실제 결과):

- `kubectl kustomize k8s/overlays/dev --load-restrictor LoadRestrictionsNone | Select-String host.docker.internal`의 결과 **0건 확인 완료** — `EC2_K3S_MIGRATION_PLAN.md` 4장 마지막 문단의 목표와 동일한 게이트.
- `kubectl kustomize k8s/overlays/local`과 `kubectl kustomize k8s/base`의 diff가 `commonLabels` 외에는 없음을 확인 완료(base가 로컬 동작을 정확히 대표함을 검증).

아직 남은 것: dev overlay의 `<ECR_REGISTRY>`/`<IMAGE_TAG>`/`<EC2_HOST>` placeholder를 실제 값으로 채우는 작업과, `kubectl apply -k k8s/overlays/dev` 실제 적용은 이번 구현 범위에 포함되지 않았다.

---

## 7. 생성된 파일 목록 (구현 완료)

| 파일 | 내용 |
| --- | --- |
| `k8s/base/kustomization.yaml` | 2장 |
| `k8s/overlays/local/kustomization.yaml` | 3장 |
| `k8s/overlays/dev/kustomization.yaml` | 4장 |
| `k8s/overlays/dev/patches/gateway-service-routing.yaml` | 5-3장 |
| `k8s/overlays/dev/patches/user-service-hosts.yaml` | 5-2장 User 행 |
| `k8s/overlays/dev/patches/workspace-service-config.yaml` | 5-2장 Workspace 행 |
| `k8s/overlays/dev/patches/admin-service-config.yaml` | 5-2장 Admin 행 |
| `k8s/overlays/dev/patches/ingestion-service-config.yaml` | 5-2장 Ingestion 행 |
| `k8s/overlays/dev/patches/intelligence-service-config.yaml` | 5-2장 Intelligence 행 |
| `k8s/overlays/dev/patches/mcp-service-config.yaml` | 5-2장 MCP 행 + OAuth origin |
| `k8s/overlays/dev/patches/commerce-service-config.yaml` | 5-2장 Commerce 행 |

총 신규 파일 10개, 기존 파일 수정 0개.

**위 10개 파일 모두 생성 완료됐고, 기존 `k8s/apps/*.yaml`, `k8s/namespace.yaml`, `k8s/secrets/*`는 수정 0건으로 유지됐다.** `kubectl kustomize` 렌더링 검증(6장)도 함께 끝났다. ECR registry/image tag, `<EC2_HOST>` 등 실제 값 채우기와 `kubectl apply -k` 실제 적용은 아직 하지 않았다(EC2 프로비저닝 이후 후속 작업).

---

## 8. 구현 프롬프트 (사용 완료 — 실행 이력)

```text
k8s/KUSTOMIZE_OVERLAY_DESIGN.md 설계를 그대로 구현해줘.

작업:
1. k8s/base/kustomization.yaml 생성 (2장 예시 그대로, resources는 ../apps/*.yaml 상대경로 참조, 복제 금지)
2. k8s/overlays/local/kustomization.yaml 생성 (3장 예시 그대로, base 참조 + commonLabels만)
3. k8s/overlays/dev/kustomization.yaml 생성 (4장 예시 기준, images 트랜스포머 9개 서비스 전부, <ECR_REGISTRY>/<IMAGE_TAG>는 TODO 플레이스홀더로 남김)
4. k8s/overlays/dev/patches/*.yaml 8개 파일 생성 (5장 표 기준, host.docker.internal 값은 <EC2_HOST> 플레이스홀더로 남김 — 실제 IP는 EC2 프로비저닝 후 별도 커밋에서 채움)
5. 기존 k8s/apps/*.yaml, k8s/namespace.yaml, k8s/secrets/* 는 절대 수정하지 않는다
6. kubectl kustomize k8s/base, kubectl kustomize k8s/overlays/local, kubectl kustomize k8s/overlays/dev 세 명령이 각각 에러 없이 렌더링되는지 로컬에서 확인하고 결과를 보고한다
7. k8s/overlays/dev 렌더링 결과에 host.docker.internal 문자열이 몇 건 남아있는지(플레이스홀더 적용 전이므로 0건이 아닐 수 있음 — 남은 건수와 위치를 목록으로 보고)
```

---

## 요약 — 완료 보고 (설계 + 구현)

- **추천 구조(구현 완료)**: `k8s/apps`는 원본 그대로 두고, `k8s/base`가 상대경로 참조로만 그것들을 조립(복제 없음). `k8s/overlays/local`은 base와 사실상 동일한 항등 오버레이, `k8s/overlays/dev`는 `images` 트랜스포머로 9개 서비스 이미지를 ECR로 치환하고 8개 patch 파일로 `host.docker.internal` 계열 값과 Gateway 정적 라우팅을 EC2 대상으로 치환.
- **생성된 파일 목록**: 신규 10개(`k8s/base/kustomization.yaml` 1, `k8s/overlays/local/kustomization.yaml` 1, `k8s/overlays/dev/kustomization.yaml` 1, `k8s/overlays/dev/patches/*.yaml` 8) 전부 생성 완료 — 7장 표 참고. 기존 파일 수정 0건.
- **렌더링 검증**: `kubectl kustomize k8s/base`, `k8s/overlays/local`, `k8s/overlays/dev`(`--load-restrictor LoadRestrictionsNone` 필요) 세 명령 모두 에러 없이 렌더링 확인 완료. dev overlay 렌더링 결과에서 `host.docker.internal` 0건 확인 완료.
- **dev overlay에서 바꾼 값(placeholder 상태)**: (1) 9개 서비스 이미지 `brainx-<svc>:local` → `<ECR_REGISTRY>/brainx-<svc>:<IMAGE_TAG>`, (2) Gateway `SPRING_APPLICATION_JSON` 7개 라우트 대상, (3) User/Workspace/Admin/Ingestion/Commerce/Intelligence/MCP ConfigMap(또는 inline env)의 `POSTGRES_HOST`/`REDIS_HOST`/`NEO4J_URI`/`SPRING_KAFKA_BOOTSTRAP_SERVERS`/`QDRANT_HOST`/서비스 간 URL 전부(포트는 유지, 호스트만 `host.docker.internal` → EC2 대상으로), (4) MCP OAuth 공개 origin 4종. 실제 EC2 IP·ECR registry·이미지 태그 값은 아직 채우지 않고 placeholder로 남아 있다(EC2/ECR 준비 이후 후속 작업).
- **아직 안 한 것**: 실제 EC2 값 채우기, `kubectl apply -k` 실제 적용, `workflow_dispatch` 기반 GitHub Actions workflow(모두 후속 작업).
- **Helm 계획과의 충돌 방지(설계 중 발견, 이후 확정)**: `k8s/HELM_MIGRATION.md`가 이미 별도의 Helm 기반 환경별 값 관리 계획을 갖고 있어, 이번 Kustomize overlay와 목적이 겹칠 수 있었다(0-2장). **단기 EC2/k3s PoC는 이 Kustomize overlay를, 장기 운영 표준화는 Helm 전환 후보를 각각 담당하는 것으로 역할을 확정**했다(`k8s/EC2_K3S_MIGRATION_PLAN.md` 10장). 두 경로를 동시에 유지하는 동안에는 "현재 실제로 쓰이는 경로만 값의 출처"라는 원칙으로 이중 관리를 방지한다.

SSOT 계약에 맞게 구현 완료
