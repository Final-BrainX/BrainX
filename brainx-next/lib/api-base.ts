"use client";

import { isElectronDesktop } from "@/lib/desktop-bridge";

function shouldUseSameOriginDesktopProxy() {
  return typeof window !== "undefined" && isElectronDesktop();
}

export function getPublicApiBaseUrl() {
  if (shouldUseSameOriginDesktopProxy()) {
    return "";
  }
  return process.env.NEXT_PUBLIC_API_BASE_URL ?? "";
}

export function getWorkspaceApiBaseUrl() {
  if (shouldUseSameOriginDesktopProxy()) {
    return "";
  }
  return process.env.NEXT_PUBLIC_WORKSPACE_API_BASE_URL ?? process.env.NEXT_PUBLIC_API_BASE_URL ?? "";
}

export function getIngestionApiBaseUrl() {
  if (shouldUseSameOriginDesktopProxy()) {
    return "";
  }
  return process.env.NEXT_PUBLIC_INGESTION_API_BASE_URL ?? process.env.NEXT_PUBLIC_API_BASE_URL ?? "";
}
