#!/usr/bin/env python3
"""Detect BrainX services that need image rebuild/deploy."""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import PurePosixPath


ALL_SERVICES = [
    "discovery-service",
    "gateway-service",
    "user-service",
    "workspace-service",
    "ingestion-service",
    "commerce-service",
    "admin-service",
    "intelligence-service",
    "mcp-service",
    "frontend",
    "admin-frontend",
]

RDS_RUNTIME_SERVICES = [
    "user-service",
    "workspace-service",
    "ingestion-service",
    "commerce-service",
    "admin-service",
    "intelligence-service",
    "mcp-service",
]

PATH_RULES: list[tuple[str, set[str]]] = [
    ("brainX_back/Discovery-Service/", {"discovery-service"}),
    ("brainX_back/Gateway-Service/", {"gateway-service"}),
    ("brainX_back/User-Service/", {"user-service"}),
    ("brainX_back/Workspace-Service/", {"workspace-service"}),
    ("brainX_back/Ingestion-Service/", {"ingestion-service"}),
    ("brainX_back/Commerce-Service/", {"commerce-service"}),
    ("brainX_back/Admin-Service/", {"admin-service"}),
    ("brainX_back/Intelligence-Service/", {"intelligence-service"}),
    ("brainX_back/Mcp-Service/", {"mcp-service"}),
    ("brainx-electron/", {"frontend"}),
    ("brainx-next/", {"frontend"}),
    ("brainx-admin-next/", {"admin-frontend"}),
    ("contracts-v2/", {"intelligence-service", "mcp-service", "frontend"}),
    ("infra/aws-dev/dockerfiles/intelligence-service.Dockerfile", {"intelligence-service"}),
    ("infra/aws-dev/dockerfiles/brainx-next.Dockerfile", {"frontend"}),
    ("infra/aws-dev/dockerfiles/brainx-admin-next.Dockerfile", {"admin-frontend"}),
]

DEPLOY_CONFIG_PREFIXES = (
    "infra/aws-dev/deploy/",
    "infra/aws-dev/scripts/deploy_remote.sh",
    "infra/aws-dev/scripts/detect_changed_services.py",
    "infra/aws-dev/terraform/",
    ".github/workflows/brainx-dev-deploy.yml",
)


def git_changed_files(base: str, head: str) -> list[str]:
    if not base or set(base) == {"0"}:
        return []
    command = ["git", "diff", "--name-only", f"{base}...{head}"]
    result = subprocess.run(command, check=True, text=True, stdout=subprocess.PIPE)
    return [line.strip().replace("\\", "/") for line in result.stdout.splitlines() if line.strip()]


def normalize_service(value: str) -> str:
    service = value.strip()
    if not service:
        return ""
    if service not in ALL_SERVICES:
        raise ValueError(f"Unknown service '{service}'. Valid services: {', '.join(ALL_SERVICES)}")
    return service


def services_for_path(path: str) -> set[str]:
    normalized = str(PurePosixPath(path))
    services: set[str] = set()
    for prefix, mapped_services in PATH_RULES:
        if normalized.startswith(prefix):
            services.update(mapped_services)
    return services


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base", required=True)
    parser.add_argument("--head", required=True)
    parser.add_argument("--deploy-all", action="store_true")
    parser.add_argument("--force-runtime-refresh", action="store_true")
    parser.add_argument("--build-desktop-installer", action="store_true")
    parser.add_argument("--services", default="")
    args = parser.parse_args()

    try:
        requested = [normalize_service(part) for part in args.services.replace(",", " ").split()]
    except ValueError as error:
        print(str(error), file=sys.stderr)
        return 2
    requested = [service for service in requested if service]

    deploy_config_changed = False
    desktop_installer_changed = args.build_desktop_installer
    if args.deploy_all:
        services = list(ALL_SERVICES)
        changed_files: list[str] = []
    elif requested:
        services = requested
        changed_files = []
    else:
        changed_files = git_changed_files(args.base, args.head)
        detected: set[str] = set()
        for path in changed_files:
            detected.update(services_for_path(path))
            if path.startswith("brainx-electron/"):
                desktop_installer_changed = True
            if path.startswith(DEPLOY_CONFIG_PREFIXES):
                deploy_config_changed = True
        services = [service for service in ALL_SERVICES if service in detected]
        if deploy_config_changed and not services:
            services = list(ALL_SERVICES)

    result = {
        "services": services,
        "servicesJson": json.dumps(services, separators=(",", ":")),
        "servicesSpace": " ".join(services),
        "shouldDeploy": bool(services or deploy_config_changed or args.force_runtime_refresh),
        "deployConfigChanged": deploy_config_changed or args.deploy_all,
        "desktopInstallerChanged": desktop_installer_changed,
        "forceRuntimeRefresh": args.force_runtime_refresh,
        "runtimeRefreshServices": RDS_RUNTIME_SERVICES,
        "changedFiles": changed_files,
    }
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
