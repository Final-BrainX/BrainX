# BrainX Helm Migration 실행 계획 (HELM_MIGRATION)

> 이 문서는 **실행 계획 문서**다. 설계 근거·스키마 상세는 [`k8s/helm/HELM_DESIGN.md`](helm/HELM_DESIGN.md)를 따른다.
> 이 문서는 그 설계를 실제로 옮기는 **작업 순서·명령·판정 기준**만 정의한다.
>
> 범위 제약(문서 작성 시점 기준):
> - 기존 `k8s/apps/*.yaml`, `k8s/monitoring/*.yaml`, `k8s/secrets/*.yaml`은 **수정·삭제하지 않는다**.
> - 이 문서 자체는 계획 문서이며, Chart 파일(`Chart.yaml`, `values.yaml`, `templates/*`) 생성은 이 계획을 실행하는 **후속 작업**에서 이뤄진다.
> - 모든 단계는 기존 raw manifest와 **병행 운영**하다가, 8장의 Cut-over 조건을 만족한 뒤에만 raw manifest 사용을 중단한다(삭제는 별도 승인 후).

---

## 0. 사전 조건

- `helm`, `kubectl` CLI 사용 가능 (Docker Desktop Kubernetes 로컬 클러스터 기준).
- `helm diff` 플러그인 설치: `helm plugin install https://github.com/databus23/helm-diff`.
- `namespace: brainx`가 이미 존재(`kubectl apply -f k8s/namespace.yaml`).
- `k8s/secrets/*.yaml`(실제 값 파일)이 로컬에 준비되어 있고 아직 apply 전이어도 무방(단계 3에서 apply).
- 작업 브랜치에서 진행하며, 각 Phase 완료 시점마다 커밋을 분리한다(`docs/git/AI_PROMPTS.md` 형식 준수는 커밋 시점에 별도 확인).

---

## 1. Chart 생성 순서

Chart 루트는 `k8s/helm/brainx/`. 생성 순서는 "구조 뼈대 → 공통 helper → 값 없는 서비스 → 값 있는 서비스 → 모니터링" 순으로, 매 단계마다 `helm lint`가 통과해야 다음으로 넘어간다.

| 순서 | 작업 | 산출물 |
|---|---|---|
| 1 | `helm create` 대신 수동 스캐폴딩(불필요한 기본 템플릿 방지) | `Chart.yaml`, `.helmignore`, 빈 `templates/` |
| 2 | `Chart.yaml` 작성 | `apiVersion: v2`, `name: brainx`, `type: application`, `version`/`appVersion` 초기값 `0.1.0` |
| 3 | `_helpers.tpl` 작성 | `brainx.fullname`, `brainx.labels`, `brainx.selectorLabels`, `brainx.downstreamUrl` |
| 4 | `values.yaml` 골격 작성(값 없이 키 구조만) | `global`, `secretRefs`, `services: {}`, `monitoring` |
| 5 | 최소 `helm lint` 통과 확인 | 빈 스캐폴드 lint 0 fail |

**순서 근거**: helper가 없으면 이후 모든 템플릿이 라벨/이름 규칙 없이 중복 작성되므로 helper를 최우선 확정한다. `values.yaml`은 이 시점엔 서비스 값을 채우지 않고 키 구조만 만들어 lint가 "구조 오류"만 잡게 한다.

---

## 2. values 분리 순서

`HELM_DESIGN.md` 3장 기준의 3파일 체계를 다음 순서로 채운다.

1. **`values.yaml`(공통 기준값)부터 완성**: `global`, `secretRefs`, `services.*`(env/config/secretEnv/probes), `monitoring.*`를 로컬 raw manifest 값 그대로 옮긴다. 이 시점의 `global.downstreamHost`는 로컬 값(`host.docker.internal`)을 기본값으로 둔다.
2. **`values-local.yaml` 생성**: `values.yaml`과의 차이만 남긴다. 초기에는 차이가 거의 없어야 정상(로컬이 기준값이므로). 명시적으로 `downstreamHost`, `imageRegistry: ""`, `tag: local`만 명시적으로 재확인 차원에서 적는다.
3. **`values-prod.yaml`은 뼈대만**: 키는 존재하되 실제 운영 값은 채우지 않는다(`TODO` 표시). 운영 전환은 이 계획의 범위 밖.
4. 서비스 값 채우기 순서는 4장의 "서비스별 전환 순서"와 동일하게 진행한다(한 번에 9개를 다 채우지 않고 서비스 단위로 채우고 검증).

**검증 규칙**: `values.yaml` 단독으로는 `helm template`이 완전한 형태로 나오지 않아도 되지만(오버라이드 없이 렌더 안 될 수 있음), `values.yaml + values-local.yaml` 조합은 항상 렌더 가능해야 한다.

---

## 3. Secret 관리 순서

`HELM_DESIGN.md` 4장 원칙(Chart는 Secret을 생성하지 않고 이름으로만 참조)을 그대로 실행한다.

1. Chart 작업 시작 전, `templates/`에 `kind: Secret`을 넣지 않는다는 것을 **가장 먼저 리뷰 체크리스트에 고정**한다(코드 리뷰 시 최우선 확인 항목).
2. `values.yaml`의 `secretRefs`에 Secret **이름만** 채운다(값 아님): `postgres-secret`, `gateway-secret`, `workspace-secret`, `admin-service-secret`, `mcp-service-secret`, `ingestion-service-secret`, `commerce-service-secret`, `intelligence-service-secret`, `grafana-secret`.
3. 실제 Secret은 기존 절차 그대로 로컬에서 먼저 apply한다. **공유 Secret이 앱 Secret보다 먼저**:
   ```powershell
   kubectl apply -f .\k8s\secrets\postgres-secret.yaml
   kubectl apply -f .\k8s\secrets\gateway-secret.yaml
   kubectl apply -f .\k8s\secrets\workspace-secret.yaml
   kubectl apply -f .\k8s\secrets\admin-service-secret.yaml
   kubectl apply -f .\k8s\secrets\mcp-service-secret.yaml
   kubectl apply -f .\k8s\secrets\ingestion-service-secret.yaml
   kubectl apply -f .\k8s\secrets\commerce-service-secret.yaml
   kubectl apply -f .\k8s\secrets\intelligence-service-secret.yaml
   kubectl apply -f .\k8s\secrets\grafana-secret.yaml
   # user-service-oauth-secret 은 선택(optional: true 키만 존재)
   ```
4. `JWT_SECRET` 동일성 재확인: `gateway-secret`, `workspace-secret`, `admin-service-secret`, `mcp-service-secret`에 들어간 `JWT_SECRET` 값이 모두 같은지 apply 전에 diff/육안 확인한다. `ingestion-service-secret`/`commerce-service-secret`/`intelligence-service-secret`은 별도 `JWT_SECRET` 키가 없고 `gateway-secret`을 그대로 참조하므로 이 동일성 확인 대상에서 제외된다. Helm은 이 동일성을 강제하지 않으므로 사람이 확인한다.
5. Deployment 템플릿에서 `secretEnv[].secret` → `secretRefs` lookup → `secretKeyRef.name` 매핑이 서비스별로 기존 파일과 정확히 같은 이름을 참조하는지 5장(Template 작성) 단계에서 diff로 재확인한다.
6. **금지 재확인**: `values-*.yaml` 어디에도 실제 Secret 값 작성 금지, `helm template` 출력에 Secret 리소스나 평문 값이 나타나지 않아야 함(7.2 검증에서 게이트).

---

## 4. ConfigMap 관리 순서

1. `services.<name>.config`가 **비어있는 서비스**(Discovery, Gateway, User)는 ConfigMap을 만들지 않고 `env`(inline)만 사용 — 기존 동작 그대로 보존.
2. `services.<name>.config`가 **채워진 서비스**(Admin, Workspace, MCP)만 `app-configmap.yaml` 템플릿에서 `<name>-service-config` 이름으로 렌더한다.
3. MCP는 기존에 ConfigMap이 별도 파일(`mcp-service-configmap.yaml`)이었다는 점만 다르고, Helm에서는 다른 ConfigMap 서비스와 동일하게 공통 템플릿에 통합한다. 파일 위치만 바뀌고 렌더 결과(키/값)는 기존과 동일해야 한다.
4. ConfigMap 렌더 → Deployment `envFrom.configMapRef` 연결까지 확인한 뒤에만 해당 서비스를 "전환 완료"로 표시한다(4개 항목 모두 확인: ConfigMap 존재, 키 목록 일치, `envFrom` 연결, Deployment 내 재정의 env와 충돌 없음).
5. Admin/Workspace/MCP는 ConfigMap 검증을 **서비스별로 개별** 진행한다(한 번에 3개 몰아서 하지 않음) — 5장 순서와 연동.

---

## 5. Template 작성 순서

파일 단위 작성 순서는 "의존성이 적은 것 → 많은 것" 원칙을 따른다.

1. `_helpers.tpl` (1장에서 이미 작성)
2. `app-service.yaml` — Deployment보다 단순(env/probe 없음)하므로 먼저 작성해 `range` 순회 패턴을 검증.
3. `app-deployment.yaml` — env 조립 순서(2.1 설계 §5.2)를 그대로 구현:
   1. `config` → `envFrom.configMapRef`
   2. `env`(inline) → `env` 리스트
   3. `downstreamHost` 조합 env → helper
   4. `secretEnv` → `secretKeyRef`
   5. probe(`readiness`/`liveness` 항상, `startup`은 존재 시만)
4. `app-configmap.yaml` — `config`가 있는 서비스만 조건부 렌더.
5. `templates/monitoring/*.yaml` — 앱 템플릿과 패턴이 달라 마지막에 별도 작성(Prometheus 3파일 → Grafana 3파일 순).
6. `NOTES.txt` — 전체 서비스 템플릿이 안정된 뒤 마지막에 작성(설치 후 안내 문구가 서비스 목록에 의존).

각 템플릿 파일 작성 직후 반드시 `helm lint` → `helm template --show-only`로 해당 파일만 렌더해 문법 오류를 그 자리에서 잡는다(파일을 다 쓴 뒤 몰아서 디버깅하지 않는다).

---

## 6. 서비스별 전환 순서

`HELM_DESIGN.md` 6장 Phase 2~4와 동일한 순서를 유지하되, 이 문서에서는 서비스 단위 체크리스트로 구체화한다. 순서 기준: **의존성 없음 → Secret 1개 → Secret 여러 개 → ConfigMap+Secret**.

| 순서 | 서비스 | 왜 이 순서인가 | 전환 시 확인 항목 |
|---|---|---|---|
| 1 | Discovery | Secret/ConfigMap 없음, 가장 단순 | inline env, probe(`readiness`/`liveness`만) |
| 2 | Gateway | Secret 1개(`gateway-secret`), `SPRING_APPLICATION_JSON` helper 검증 필요 | `secretEnv` 2건, JSON 유효성(중괄호), downstreamHost 조합 |
| 3 | User | Secret 2개 공유(`postgres`+`gateway`) + `startupProbe` + optional Secret(`user-service-oauth-secret`) | `startupProbe` 분기 렌더, optional 키 누락 시 env 자체 생략되는지 |
| 4 | Admin | 첫 ConfigMap 서비스 + Secret 3개(`postgres`/`gateway`/`admin`) | ConfigMap 키 목록, Kafka bootstrap 등 downstream 조합 |
| 5 | Ingestion | 분리 파일 ConfigMap + Secret 3개(`postgres`/`gateway`/`ingestion`) | ConfigMap 통합 결과 동일성, Kafka bootstrap이 `downstreamHost:9093`인지(9092 아님) |
| 6 | Commerce | ConfigMap + Secret 3개(`postgres`/`gateway`/`commerce`) | Kafka bootstrap `downstreamHost:9093`, Prometheus 활성 scrape target(commerce는 이미 활성)과의 정합성 |
| 7 | Intelligence | 분리 파일 ConfigMap + Secret 3개(`postgres`/`gateway`/`intelligence`) + `startupProbe` + AI/임베딩 설정 | `SPRING_AI_MODEL_CHAT=openai`, `BRAINX_AI_EMBEDDING_PROVIDER=voyage` 렌더 여부, `VOYAGE_API_KEY`/`OPENAI_API_KEY`/`QDRANT_API_KEY` secretKeyRef, Kafka bootstrap `downstreamHost:9093` |
| 8 | Workspace | ConfigMap + Secret 3개(`postgres`/`gateway`/`workspace`) + Neo4j 백필 플래그 | `NEO4J_BACKFILL_ON_STARTUP` 등 config 값, readiness=db+redis 지연값 일치 |
| 9 | MCP | ConfigMap + Secret 3개(`postgres`/`gateway`/`mcp`) + OAuth origin 4종(환경별 강제 교체 대상) + `startupProbe` | 분리 파일이던 ConfigMap 통합 결과 동일성, OAuth 4개 값이 `values-local`에서 로컬 origin으로 렌더되는지 |
| 10 | Monitoring(Prometheus→Grafana) | 앱 9개 전환 완료 후 마지막(구조가 다름) | scrape target 목록 동일(현재 활성: user/gateway/admin/workspace/commerce, ingestion/intelligence는 주석 처리 상태 유지), `grafana-secret` 참조, `persistence.enabled=false` |

각 서비스는 "템플릿 작성 → `helm lint` → `helm template --show-only`로 해당 서비스만 렌더 → 기존 raw manifest와 diff(7.2) → 다음 서비스"의 사이클을 반복한다. **한 서비스가 diff 동등성을 통과하기 전에는 다음 서비스로 넘어가지 않는다.**

README 상 서비스 기동 의존 순서(Discovery→Gateway→User→Admin→Ingestion→Commerce→Intelligence→MCP→Workspace)는 **런타임 기동 순서**이고, 위 표는 **Helm 전환/검증 순서**다. 둘은 목적이 달라 순서가 다를 수 있음을 인지하고 혼동하지 않는다(Helm은 한 릴리스로 전체를 배포하므로 검증 순서가 곧 apply 순서를 의미하지 않는다).

---

## 7. 검증: `helm lint` / `helm template` / `helm diff`

### 7.1 `helm lint` — 매 서비스 전환 직후 실행

```powershell
helm lint .\k8s\helm\brainx -f .\k8s\helm\brainx\values-local.yaml
```
판정 기준: `0 chart(s) failed`. 실패 시 다음 서비스로 진행 금지.

### 7.2 `helm template` — 기존 raw manifest와 동등성 diff

```powershell
# 서비스 단위 렌더
helm template brainx .\k8s\helm\brainx -f .\k8s\helm\brainx\values-local.yaml `
  --show-only templates/app-deployment.yaml > .\k8s\helm\_rendered-deployment.yaml

# 기존 파일과 비교 (예: discovery)
# 공백/키 순서는 무시, 아래 항목만 의미 비교
```

동등성 체크리스트(서비스별로 반복):
- `env`/`envFrom` 키·값 (특히 `host.docker.internal` 조합, Gateway `SPRING_APPLICATION_JSON`)
- `secretKeyRef.name`/`key`가 기존 파일과 정확히 동일
- probe path/delay/threshold, `startupProbe` 유무
- Service `port`/`targetPort`, namespace, `app: <svc>` 셀렉터 라벨 불변
- **Secret 리소스 자체가 렌더 목록에 없는지**(3장 원칙 재확인)

### 7.3 `helm diff` — 이미 설치된 릴리스 대비 변경분 확인

전환 중기 이후(일부 서비스가 이미 `helm install`로 떠 있는 상태)부터는 다음 서비스를 추가/변경할 때마다 실제 클러스터 상태와의 차이를 `helm diff`로 먼저 확인한다.

```powershell
helm diff upgrade brainx .\k8s\helm\brainx -f .\k8s\helm\brainx\values-local.yaml `
  --namespace brainx
```

판정 기준:
- 의도한 서비스 외에 **다른 서비스의 Deployment/Service가 diff에 나타나면 중단**하고 원인 파악(values 구조 실수 가능성).
- Secret이 diff 대상에 등장하면 안 됨(애초에 chart가 관리 안 하므로 등장 자체가 이상 신호).
- `replicas`, `selector` 등 재생성을 유발하는 필드 변경이 의도치 않게 나오면 중단.

### 7.4 dry-run (server) — 클러스터 스키마 최종 검증

```powershell
helm install brainx .\k8s\helm\brainx -f .\k8s\helm\brainx\values-local.yaml `
  --namespace brainx --dry-run=server
```
Secret은 3장 절차대로 사전에 apply되어 있어야 한다.

### 7.5 검증 게이트 요약

| 단계 | 명령 | 실행 시점 | 통과 기준 |
|---|---|---|---|
| 정적 | `helm lint` | 서비스/템플릿 변경마다 | 실패 chart 0 |
| 렌더 동등성 | `helm template` + diff | 서비스 전환 완료마다 | raw manifest와 의미 일치, Secret 미렌더 |
| 릴리스 대비 변경분 | `helm diff upgrade` | 이미 설치된 릴리스에 서비스 추가/변경 시 | 의도한 리소스만 diff, 재생성 유발 필드 없음 |
| 서버 스키마 | `--dry-run=server` | Phase 종료 시 | 에러 없음 |
| 실제 설치/업그레이드 | `helm install` / `helm upgrade` | 8장 Cut-over 조건 충족 후 | 아래 8장 |

---

## 8. Rollback 절차

Helm 전환 과정에서 문제가 발생했을 때의 대응을 **미리 정의**한다(실제 발생 시 즉시 적용 가능하도록).

### 8.1 롤백 트리거 조건

- `helm upgrade` 이후 서비스 `readiness`가 기존 raw manifest 대비 지속 실패.
- `helm diff`에서 예상 못한 리소스 변경/삭제가 실제 `helm upgrade`로 반영된 경우.
- 공유 Secret(`postgres-secret`, `gateway-secret`) 참조 오류로 다수 서비스가 동시에 CrashLoopBackOff.

### 8.2 즉시 롤백 (Helm 릴리스 되돌리기)

```powershell
helm history brainx --namespace brainx
helm rollback brainx <이전_REVISION> --namespace brainx
```
- `helm rollback`은 이전 리비전의 values/manifest로 되돌린다. Secret은 Helm이 관리하지 않으므로 롤백 대상에서 제외됨을 인지한다(Secret 자체 문제면 `kubectl apply`로 별도 복구).

### 8.3 완전 후퇴 (raw manifest로 복귀)

병행 운영 원칙(문서 상단)에 따라 raw manifest는 항상 최신 상태로 유지되므로, Helm 릴리스가 심각하게 문제되면:

```powershell
helm uninstall brainx --namespace brainx
kubectl apply -f .\k8s\namespace.yaml
kubectl apply -f .\k8s\apps\discovery-service.yaml
kubectl apply -f .\k8s\apps\gateway-service.yaml
kubectl apply -f .\k8s\apps\user-service.yaml
kubectl apply -f .\k8s\apps\admin-service.yaml
kubectl apply -f .\k8s\apps\ingestion-service-configmap.yaml
kubectl apply -f .\k8s\apps\ingestion-service.yaml
kubectl apply -f .\k8s\apps\commerce-service.yaml
kubectl apply -f .\k8s\apps\intelligence-service-configmap.yaml
kubectl apply -f .\k8s\apps\intelligence-service.yaml
kubectl apply -f .\k8s\apps\workspace-service.yaml
kubectl apply -f .\k8s\apps\mcp-service-configmap.yaml
kubectl apply -f .\k8s\apps\mcp-service.yaml
kubectl apply -f .\k8s\monitoring\
```
- Secret은 이미 apply되어 있으므로 재사용 가능(이름이 동일하면 그대로 참조됨).
- 이 경로는 **Cut-over 이전 단계에서만** 안전하다. Cut-over 이후(raw manifest 사용 중단 후)에는 raw manifest 파일이 최신값과 어긋날 수 있으므로, 8.4의 재검증 절차를 먼저 거친다.

### 8.4 롤백 후 재검증

1. 롤백 직후 `kubectl get pods -n brainx`로 전체 서비스 `Running`/`Ready` 확인.
2. 문제가 된 서비스의 로그(`kubectl logs`)로 원인 특정.
3. 원인이 Chart 템플릿/values 실수면 해당 서비스만 다시 6장 사이클(작성→lint→template diff→diff upgrade)로 재전환.
4. 원인이 Secret 불일치(`JWT_SECRET` 등)면 3장 4단계 동일성 재확인 절차 재실행.

---

## 9. 최종 Cut-over

Cut-over는 "Helm 릴리스를 유일한 배포 경로로 확정하고 raw manifest 사용을 중단"하는 단계. **아래 조건을 모두 만족해야** 진행한다.

### 9.1 Cut-over 선행 조건 (전부 충족)

- [ ] 6장의 앱 서비스 9개 + 모니터링 2개 전체가 서비스별 diff 동등성(7.2)을 통과했다.
- [ ] `values-local.yaml` 기준 `helm template` 전체 렌더 결과가 기존 `k8s/apps/*.yaml` + `k8s/monitoring/*.yaml` 전체와 의미상 100% 일치한다(포트/probe/secretKeyRef/env 누락 없음).
- [ ] `helm install --dry-run=server` 통과(7.4).
- [ ] 실제 `helm install brainx`로 로컬 클러스터에 설치 후, raw manifest로 띄웠을 때와 **동일한 방식으로 기능 검증**(포트포워딩 후 각 서비스 `/actuator/health`, Gateway를 통한 라우팅, Admin 시드 계정 로그인 등)을 통과했다.
- [ ] 최소 1회 이상 `helm upgrade`(임의의 무해한 값 변경, 예: replica 유지한 채 라벨 값 조정)로 업그레이드 경로도 검증했다.
- [ ] 8장 Rollback 절차를 실제로 1회 리허설(`helm rollback`)해 정상 동작을 확인했다.
- [ ] `k8s/README.md`, `k8s/SETUP.md`, 루트 `README.md`에 Helm 설치/운영 절차가 반영됐다(raw manifest 절차는 "레거시/백업 경로"로 표시로 격하).

### 9.2 Cut-over 실행 순서

1. Secret 사전 apply 최종 확인(3장 순서 그대로).
2. `helm install brainx .\k8s\helm\brainx -f .\k8s\helm\brainx\values-local.yaml --namespace brainx` 실제 설치(dry-run 아님).
3. 기존 raw manifest로 떠 있던 리소스가 있다면(이름이 동일하므로) 충돌 여부 확인 후, raw manifest로 만든 리소스를 `kubectl delete -f k8s/apps/... -f k8s/monitoring/...`로 정리(Helm 설치 리소스와 이름 충돌 시에만, 순서: Helm 설치 성공 확인 후 raw 삭제 — 역순 금지).
4. 전체 서비스 헬스체크 재확인.
5. 운영 문서(README 3종) 갱신 커밋.
6. `k8s/apps/*.yaml`, `k8s/monitoring/*.yaml` 원본 파일은 **이 시점에도 삭제하지 않는다**. 최소 1개 릴리스 주기(팀 합의 기간) 동안 "레거시 참고용"으로 보관 후, 별도 승인을 받아 제거 여부를 결정한다.

### 9.3 Cut-over 이후

- 이후 모든 K8s 변경은 `k8s/helm/brainx/values-*.yaml` 및 `templates/*` 수정으로만 이뤄진다. `k8s/apps/*.yaml` 직접 수정은 금지(드리프트 방지).
- `values-prod.yaml`은 이 문서 범위 밖(운영/EC2 전환)이며, 별도 계획 문서에서 다룬다.

---

## 부록. Phase ↔ 본 문서 장(章) 매핑

| `HELM_DESIGN.md` Phase | 본 문서 해당 장 |
|---|---|
| Phase 0 (설계 확정) | 완료됨(`HELM_DESIGN.md`) |
| Phase 1 (스캐폴딩) | 1장 |
| Phase 2 (Discovery 파일럿) | 5장, 6장(순서 1) |
| Phase 3 (Secret 서비스 확장) | 3장, 6장(순서 2~3) |
| Phase 4 (ConfigMap 서비스 확장) | 4장, 6장(순서 4~6) |
| Phase 5 (모니터링 편입) | 6장(순서 7) |
| Phase 6 (환경 오버라이드 정리) | 2장 |
| Phase 7 (병행 검증 → 컷오버) | 7장, 8장, 9장 |
