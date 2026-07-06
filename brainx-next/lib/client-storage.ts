"use client";

type StorageArea = "local" | "session";

function canUseDesktopStorage() {
  return typeof window !== "undefined" && !!window.brainxDesktop?.getStoredValue;
}

function readWebStorage(area: StorageArea) {
  return area === "local" ? window.localStorage : window.sessionStorage;
}

export function getStoredValue(area: StorageArea, key: string) {
  if (typeof window === "undefined") return null;
  if (canUseDesktopStorage()) {
    const getter = window.brainxDesktop?.getStoredValue;
    return getter ? getter(area, key) : null;
  }
  return readWebStorage(area).getItem(key);
}

export function setStoredValue(area: StorageArea, key: string, value: string) {
  if (typeof window === "undefined") return;
  if (canUseDesktopStorage()) {
    const setter = window.brainxDesktop?.setStoredValue;
    if (setter) {
      setter(area, key, value);
    }
    return;
  }
  readWebStorage(area).setItem(key, value);
}

export function removeStoredValue(area: StorageArea, key: string) {
  if (typeof window === "undefined") return;
  if (canUseDesktopStorage()) {
    const remover = window.brainxDesktop?.removeStoredValue;
    if (remover) {
      remover(area, key);
    }
    return;
  }
  readWebStorage(area).removeItem(key);
}

export function getLocalStoredValue(key: string) {
  return getStoredValue("local", key);
}

export function setLocalStoredValue(key: string, value: string) {
  setStoredValue("local", key, value);
}

export function removeLocalStoredValue(key: string) {
  removeStoredValue("local", key);
}

export function getSessionStoredValue(key: string) {
  return getStoredValue("session", key);
}

export function setSessionStoredValue(key: string, value: string) {
  setStoredValue("session", key, value);
}

export function removeSessionStoredValue(key: string) {
  removeStoredValue("session", key);
}
