$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

powershell -ExecutionPolicy Bypass `
  -File "$scriptDir\scripts\check-env.ps1"

if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
}

docker compose `
  -f "$scriptDir\brainX_back\docker-compose.yml" `
  --profile apps `
  up -d --build