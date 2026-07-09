param(
    [Parameter(Position = 0)]
    [string]$Service
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$namespace = 'brainx'
$namespaceManifest = Join-Path $scriptDir 'k8s\namespace.yaml'

$serviceConfigs = [ordered]@{
    discovery = @{
        BuildContext = 'brainX_back\Discovery-Service'
        Image = 'brainx-discovery-service:local'
        Manifest = 'k8s\apps\discovery-service.yaml'
        Deployment = 'discovery-service'
        Label = 'discovery-service'
        Secrets = @()
        ConfigMaps = @()
    }
    gateway = @{
        BuildContext = 'brainX_back\Gateway-Service'
        Image = 'brainx-gateway-service:local'
        Manifest = 'k8s\apps\gateway-service.yaml'
        Deployment = 'gateway-service'
        Label = 'gateway-service'
        Secrets = @('gateway-secret')
        ConfigMaps = @()
    }
    user = @{
        BuildContext = 'brainX_back\User-Service'
        Image = 'brainx-user-service:local'
        Manifest = 'k8s\apps\user-service.yaml'
        Deployment = 'user-service'
        Label = 'user-service'
        Secrets = @('gateway-secret', 'postgres-secret')
        ConfigMaps = @()
    }
    workspace = @{
        BuildContext = 'brainX_back\Workspace-Service'
        Image = 'brainx-workspace-service:local'
        Manifest = 'k8s\apps\workspace-service.yaml'
        Deployment = 'workspace-service'
        Label = 'workspace-service'
        Secrets = @('gateway-secret', 'postgres-secret', 'workspace-secret')
        ConfigMaps = @()
    }
    admin = @{
        BuildContext = 'brainX_back\Admin-Service'
        Image = 'brainx-admin-service:local'
        Manifest = 'k8s\apps\admin-service.yaml'
        Deployment = 'admin-service'
        Label = 'admin-service'
        Secrets = @('gateway-secret', 'postgres-secret', 'admin-service-secret')
        ConfigMaps = @()
    }
    mcp = @{
        BuildContext = 'brainX_back\Mcp-Service'
        Image = 'brainx-mcp-service:local'
        Manifest = 'k8s\apps\mcp-service.yaml'
        Deployment = 'mcp-service'
        Label = 'mcp-service'
        Secrets = @('gateway-secret', 'postgres-secret', 'mcp-service-secret')
        ConfigMaps = @('k8s\apps\mcp-service-configmap.yaml')
    }
}

function Show-Usage {
    $supported = ($serviceConfigs.Keys -join ', ')
    Write-Host "Usage: .\k8s.ps1 <service>"
    Write-Host "Supported services: $supported"
}

function Assert-CommandExists {
    param(
        [Parameter(Mandatory = $true)]
        [string]$CommandName
    )

    if (-not (Get-Command $CommandName -ErrorAction SilentlyContinue)) {
        throw "Required command not found: $CommandName"
    }
}

function Invoke-ExternalCommand {
    param(
        [Parameter(Mandatory = $true)]
        [string]$FilePath,
        [Parameter(Mandatory = $true)]
        [string[]]$Arguments
    )

    Write-Host ("==> {0} {1}" -f $FilePath, ($Arguments -join ' '))
    & $FilePath @Arguments

    if ($LASTEXITCODE -ne 0) {
        throw "Command failed with exit code ${LASTEXITCODE}: $FilePath $($Arguments -join ' ')"
    }
}

function Test-KubernetesResourceExists {
    param(
        [Parameter(Mandatory = $true)]
        [string[]]$Arguments
    )

    & kubectl @Arguments *> $null
    return ($LASTEXITCODE -eq 0)
}

function Ensure-Namespace {
    if (Test-KubernetesResourceExists -Arguments @('get', 'namespace', $namespace)) {
        Write-Host "Namespace '$namespace' already exists."
        return
    }

    Write-Host "Namespace '$namespace' does not exist. Applying namespace manifest."
    Invoke-ExternalCommand -FilePath 'kubectl' -Arguments @('apply', '-f', $namespaceManifest)
}

function Assert-SecretsExist {
    param(
        [string[]]$SecretNames = @()
    )

    if (-not $SecretNames -or $SecretNames.Count -eq 0) {
        Write-Host "No required secrets for this service."
        return
    }

    foreach ($secretName in $SecretNames) {
        if (-not (Test-KubernetesResourceExists -Arguments @('get', 'secret', $secretName, '-n', $namespace))) {
            throw "Required secret '$secretName' was not found in namespace '$namespace'. Apply the real secret YAML before running this script."
        }
    }
}

if ([string]::IsNullOrWhiteSpace($Service)) {
    Show-Usage
    exit 1
}

$serviceKey = $Service.ToLowerInvariant()

if (-not $serviceConfigs.Contains($serviceKey)) {
    Show-Usage
    throw "Unsupported service: $Service"
}

$config = $serviceConfigs[$serviceKey]
$buildContext = Join-Path $scriptDir $config.BuildContext
$dockerfilePath = Join-Path $buildContext 'Dockerfile'
$manifestPath = Join-Path $scriptDir $config.Manifest

Assert-CommandExists -CommandName 'docker'
Assert-CommandExists -CommandName 'kubectl'

if (-not (Test-Path $namespaceManifest)) {
    throw "Namespace manifest not found: $namespaceManifest"
}

if (-not (Test-Path $buildContext)) {
    throw "Build context not found: $buildContext"
}

if (-not (Test-Path $dockerfilePath)) {
    throw "Dockerfile not found: $dockerfilePath"
}

if (-not (Test-Path $manifestPath)) {
    throw "Kubernetes manifest not found: $manifestPath"
}

$configMapPaths = @($config.ConfigMaps | ForEach-Object { Join-Path $scriptDir $_ })
foreach ($configMapPath in $configMapPaths) {
    if (-not (Test-Path $configMapPath)) {
        throw "ConfigMap manifest not found: $configMapPath"
    }
}

Ensure-Namespace
Assert-SecretsExist -SecretNames $config.Secrets

Invoke-ExternalCommand -FilePath 'docker' -Arguments @('build', '-t', $config.Image, $buildContext)
foreach ($configMapPath in $configMapPaths) {
    Invoke-ExternalCommand -FilePath 'kubectl' -Arguments @('apply', '-f', $configMapPath)
}
Invoke-ExternalCommand -FilePath 'kubectl' -Arguments @('apply', '-f', $manifestPath)
Invoke-ExternalCommand -FilePath 'kubectl' -Arguments @('rollout', 'restart', "deployment/$($config.Deployment)", '-n', $namespace)
Invoke-ExternalCommand -FilePath 'kubectl' -Arguments @('rollout', 'status', "deployment/$($config.Deployment)", '-n', $namespace)
Invoke-ExternalCommand -FilePath 'kubectl' -Arguments @('get', 'pods', '-n', $namespace, '-l', "app=$($config.Label)")
