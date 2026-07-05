"use client";

import { isElectronDesktop } from "@/lib/desktop-bridge";

type DesktopApiJsonResponse<T> = {
  ok: boolean;
  status: number;
  statusText: string;
  payload: T | null;
};

function normalizeHeaders(headers?: HeadersInit) {
  if (!headers) return {};
  if (headers instanceof Headers) {
    return Object.fromEntries(headers.entries());
  }
  if (Array.isArray(headers)) {
    return Object.fromEntries(headers);
  }
  return headers;
}

export function canUseDesktopApiRequest(init?: RequestInit) {
  if (typeof window === "undefined") return false;
  if (!isElectronDesktop() || !window.brainxDesktop?.requestApi) return false;
  return init?.body == null || typeof init.body === "string";
}

export async function requestDesktopApiJson<T>(path: string, init?: RequestInit): Promise<DesktopApiJsonResponse<T> | null> {
  if (!canUseDesktopApiRequest(init)) {
    return null;
  }

  const requestApi = window.brainxDesktop?.requestApi;
  if (!requestApi) {
    return null;
  }

  const response = await requestApi({
    path,
    method: init?.method,
    headers: normalizeHeaders(init?.headers),
    body: typeof init?.body === "string" ? init.body : undefined,
  });

  let payload: T | null = null;
  if (response.bodyText) {
    try {
      payload = JSON.parse(response.bodyText) as T;
    } catch {
      payload = null;
    }
  }

  return {
    ok: response.ok,
    status: response.status,
    statusText: response.statusText,
    payload,
  };
}
