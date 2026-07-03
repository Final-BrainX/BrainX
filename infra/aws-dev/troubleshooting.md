# AWS Dev Troubleshooting

이 문서는 AWS dev 배포 실패를 조사할 때 쓰는 표준 runbook이다. 운영자가 먼저 GitHub Actions run, EC2/SSM 상태, public endpoint를 같은 순서로 확인하도록 정리한다.

## GitHub Actions Deploy Overlap

### Incident

2026-07-02에 `main`으로 거의 동시에 merge된 PR 두 개가 같은 EC2 Docker Compose stack을 병렬로 배포하면서 public endpoint 검증이 실패했다.

- PR #114: `feat: BrainX 모니터링 스캐폴드 추가`, merge commit `3ca5338e`, deploy run `28568905696`
- PR #113: `[codex] add AI cluster graph flow`, merge commit `1061e370`, deploy run `28568916395`
- 두 run 모두 `BrainX Dev Deploy` workflow의 `main` push deploy였다.
- 실패 지점은 `Deploy changed services` job의 `Verify public endpoints` step이었다.
- GitHub 로그 증상은 `curl: (7) Failed to connect to brainx.p-e.kr port 443`와 HTTP `000` 반복이었다.

### Impact

- AWS dev public frontend, admin frontend, API HTTPS endpoint가 일시적으로 응답하지 않았다.
- build/ECR push 자체가 아니라 EC2의 shared Docker Compose runtime이 중간 상태로 남은 배포 장애였다.
- 단일 EC2의 `/opt/brainx/current`, 같은 compose project, Caddy, Docker daemon을 여러 workflow가 동시에 변경하면 재현될 수 있다.

### Detection Signals

먼저 GitHub Actions에서 같은 workflow의 `main` run이 겹쳤는지 확인한다.

```powershell
gh run list --workflow "BrainX Dev Deploy" --branch main --limit 10 `
  --json databaseId,displayTitle,headSha,status,conclusion,createdAt,updatedAt,url
```

실패 run의 job 상태를 확인한다.

```powershell
gh run view RUN_ID --json attempt,status,conclusion,headSha,displayTitle,jobs,url
```

겹침 장애일 때 흔한 신호:

- build/push job은 성공하고 deploy verification만 실패한다.
- 실패 시간이 서로 몇 초에서 몇 분 안에 붙어 있다.
- EC2에서 `brainx-caddy` 또는 `brainx-gateway-service`가 `Exited` 상태다.
- EC2에서 `80`/`443` listener가 없거나 Caddy container가 떠 있지 않다.
- public `curl`은 timeout보다 `connection refused` 또는 HTTP `000`을 보인다.

### EC2 Diagnosis Through SSM

SSM은 짧고 낮은 출력의 명령으로 시작한다. full log dump부터 하지 않는다.

```powershell
$instanceId = "i-xxxxxxxxxxxxxxxxx"
$commands = @(
  'set -eu',
  'echo === containers ===',
  'docker ps -a --format ''table {{.Names}}\t{{.Status}}\t{{.Ports}}''',
  'echo === listeners ===',
  'ss -ltnp | grep -E '':(80|443)\s'' || true',
  'echo === compose ps ===',
  'cd /opt/brainx/current && docker compose --env-file /opt/brainx/env/runtime.env -f docker-compose.yml ps --format table',
  'echo === local smoke ===',
  'curl -sS -o /dev/null -w ''frontend %{http_code}\n'' --max-time 5 -H ''Host: brainx.p-e.kr'' http://127.0.0.1/ || true',
  'curl -sS -o /dev/null -w ''admin %{http_code}\n'' --max-time 5 -H ''Host: admin.brainx.p-e.kr'' http://127.0.0.1/ || true'
)
$params = @{ commands = $commands; executionTimeout = @("120") } | ConvertTo-Json -Compress
$cmdId = aws ssm send-command `
  --region ap-northeast-2 `
  --instance-ids $instanceId `
  --document-name AWS-RunShellScript `
  --parameters $params `
  --query 'Command.CommandId' `
  --output text
"COMMAND_ID=$cmdId"
aws ssm wait command-executed --region ap-northeast-2 --command-id $cmdId --instance-id $instanceId
aws ssm get-command-invocation `
  --region ap-northeast-2 `
  --command-id $cmdId `
  --instance-id $instanceId `
  --query '{Status:Status,ResponseCode:ResponseCode,Stdout:StandardOutputContent,Stderr:StandardErrorContent}' `
  --output json
```

해석 기준:

- `connection refused`: security group보다 listener/container 상태를 먼저 본다.
- `docker ps`만 보지 않는다. 종료된 container 확인을 위해 `docker ps -a`와 `docker inspect --format`을 사용한다.
- compose 상태 확인은 항상 배포와 같은 `--env-file /opt/brainx/env/runtime.env -f docker-compose.yml` 조합으로 실행한다.
- 로그가 필요하면 `docker logs --tail 100 --since ...`처럼 좁히고, 인증 header나 cookie가 찍힐 수 있는 proxy log는 그대로 공유하지 않는다.

### Recovery

1. 진행 중인 `BrainX Dev Deploy` run이 없는지 확인한다.

```powershell
gh run list --workflow "BrainX Dev Deploy" --branch main --status in_progress --limit 10
gh run list --workflow "BrainX Dev Deploy" --branch main --status queued --limit 10
```

2. 여러 merge run이 실패했으면 오래된 run을 다시 돌리지 않는다. 최신 `origin/main` commit의 deploy run만 rerun한다.

```powershell
git fetch origin main
git log --oneline --decorate --first-parent -5 origin/main
gh run rerun LATEST_MAIN_RUN_ID
```

3. 긴급 복구가 필요하고 최신 run을 기다릴 수 없을 때만 EC2에서 현재 bundle 기준 compose를 정상화한다.

```bash
cd /opt/brainx/current
docker compose --env-file /opt/brainx/env/runtime.env -f docker-compose.yml config --quiet
docker compose --env-file /opt/brainx/env/runtime.env -f docker-compose.yml up -d --remove-orphans
docker compose --env-file /opt/brainx/env/runtime.env -f docker-compose.yml ps
ss -ltnp | grep -E ':(80|443)\s'
```

4. GitHub Actions가 성공으로 끝난 뒤 외부 endpoint를 확인한다.

```powershell
curl.exe -sS -o NUL -w "frontend %{http_code} %{time_total}\n" --max-time 15 https://brainx.p-e.kr/
curl.exe -sS -o NUL -w "admin %{http_code} %{time_total}\n" --max-time 15 https://admin.brainx.p-e.kr/
curl.exe -sS -o NUL -w "plans %{http_code} %{time_total}\n" --max-time 15 https://brainx.p-e.kr/api/v1/plans
```

Expected:

- frontend/admin: `200`
- public read API: `200` when unauthenticated access is expected
- authenticated API: `401` can be normal if the endpoint requires login

### Prevention

`BrainX Dev Deploy` must keep workflow-level concurrency because every run mutates the same EC2 Docker Compose runtime.

```yaml
concurrency:
  group: brainx-dev-deploy
  cancel-in-progress: false
```

Rationale:

- `group: brainx-dev-deploy` serializes all AWS dev deploy runs for this workflow.
- `cancel-in-progress: false` prevents GitHub from killing an already-running deployment after it may have stopped or recreated containers.
- Newer runs wait instead of interleaving remote `docker compose up`, bundle upload, Caddy reload, and endpoint verification.
- Keep this at workflow level, not just a single job, so build/deploy sequencing stays predictable for the whole deploy run.

Do not set `cancel-in-progress: true` for this environment unless the deploy script becomes explicitly cancellation-safe and rollback-safe.

### Postmortem Checklist

- Record the failed run URL, latest successful rerun URL, affected commit SHA, and endpoint smoke result in `infra/worklogs/YYYY-MM.md`.
- If the root cause is a workflow or deploy script behavior, update this troubleshooting document in the same PR.
- If public endpoints are restored manually before rerun, still rerun the latest `main` deploy so GitHub Actions reflects the real deployed state.
