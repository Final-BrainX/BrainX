$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

# EC2+k3s 과도기 구조 전용 스크립트.
# PostgreSQL/Redis/Kafka/Neo4j/Qdrant 인프라만 Docker Compose로 띄운다.
# 9개 애플리케이션 서비스는 여기서 다루지 않는다 — k3s Pod로 배포한다
# (k8s/EC2_K3S_RUNBOOK.md 5장 이하 참고).
#
# 로컬에서 앱까지 포함한 전체 Compose 스택이 필요하면 run.ps1(--profile apps)을
# 그대로 사용한다 — 이 스크립트는 run.ps1을 대체하거나 호출하지 않는다.

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$backendDir = Join-Path $scriptDir 'brainX_back'
$composeFile = Join-Path $backendDir 'docker-compose.yml'
$infraServices = @('postgres', 'redis', 'kafka', 'neo4j', 'qdrant')

function Assert-CommandExists {
    param(
        [Parameter(Mandatory = $true)]
        [string]$CommandName
    )

    if (-not (Get-Command $CommandName -ErrorAction SilentlyContinue)) {
        throw "Required command not found: $CommandName"
    }
}

if (-not (Test-Path $composeFile)) {
    throw "Compose file not found: $composeFile"
}

Assert-CommandExists -CommandName 'docker'

Write-Host "==> Checking Docker daemon availability" -ForegroundColor Cyan
docker info *> $null
if ($LASTEXITCODE -ne 0) {
    throw "Docker daemon is not reachable. Is Docker running on this host?"
}

Write-Host "==> Checking 'docker compose' availability" -ForegroundColor Cyan
docker compose version *> $null
if ($LASTEXITCODE -ne 0) {
    throw "'docker compose' is not available. Install/enable the Docker Compose CLI plugin."
}

# k3s Pod는 CoreDNS를 통해 kafka.internal을 이 EC2의 사설 IP로 해석하도록 구성되어
# 있다(k8s/EC2_K3S_RUNBOOK.md 5-3절). Kafka의 K8S advertised listener도 반드시
# kafka.internal이어야 Producer/Consumer 재접속이 성공한다 — 실행자가 실수로 로컬
# 기본값(host.docker.internal)인 채 이 스크립트를 쓰지 않도록 여기서 명시적으로
# 강제한다. 이 프로세스와 그 하위 docker compose 호출에만 적용되며, 스크립트 종료
# 시 원래 값(있었다면)으로 복원한다 — 사용자 셸의 영구 환경변수는 건드리지 않는다.
$kafkaEnvVarName = 'KAFKA_K8S_ADVERTISED_HOST'
$previousKafkaHost = [System.Environment]::GetEnvironmentVariable($kafkaEnvVarName, 'Process')
$hadPreviousKafkaHost = $null -ne $previousKafkaHost

try {
    $env:KAFKA_K8S_ADVERTISED_HOST = 'kafka.internal'
    Write-Host "==> KAFKA_K8S_ADVERTISED_HOST=kafka.internal (이 프로세스 범위에서만 적용)" -ForegroundColor Cyan

    Write-Host ("==> Starting infra-only services: {0}" -f ($infraServices -join ', ')) -ForegroundColor Cyan
    docker compose -f $composeFile up -d @infraServices

    if ($LASTEXITCODE -ne 0) {
        throw "docker compose up failed with exit code ${LASTEXITCODE}."
    }

    Write-Host "==> Current status" -ForegroundColor Cyan
    docker compose -f $composeFile ps
    if ($LASTEXITCODE -ne 0) {
        throw "docker compose ps failed with exit code ${LASTEXITCODE}."
    }
}
finally {
    if ($hadPreviousKafkaHost) {
        $env:KAFKA_K8S_ADVERTISED_HOST = $previousKafkaHost
    }
    else {
        Remove-Item Env:\KAFKA_K8S_ADVERTISED_HOST -ErrorAction SilentlyContinue
    }
}
