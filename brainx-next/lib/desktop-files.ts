"use client";

function base64ToUint8Array(base64: string) {
  const binary = window.atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function uint8ArrayToBase64(bytes: Uint8Array) {
  let binary = "";
  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index]);
  }
  return window.btoa(binary);
}

function parseAcceptExtensions(accept?: string) {
  if (!accept) return undefined;
  const extensions = accept
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value.startsWith("."))
    .map((value) => value.toLowerCase());
  return extensions.length > 0 ? extensions : undefined;
}

export async function pickFile(options?: { accept?: string; title?: string }) {
  if (typeof window === "undefined") return null;

  if (window.brainxDesktop?.openFile) {
    const selected = await window.brainxDesktop.openFile({
      title: options?.title,
      accept: parseAcceptExtensions(options?.accept),
    });
    if (!selected) return null;
    const bytes = base64ToUint8Array(selected.dataBase64);
    return new File([bytes], selected.name, { type: selected.mimeType });
  }

  return new Promise<File | null>((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    if (options?.accept) {
      input.accept = options.accept;
    }
    input.onchange = () => resolve(input.files?.[0] ?? null);
    input.click();
  });
}

export async function saveFile(options: { fileName: string; mimeType: string; data: Uint8Array; preferVaultExport?: boolean }) {
  if (typeof window === "undefined") return false;

  if (options.preferVaultExport && window.brainxDesktop?.saveVaultExport) {
    return window.brainxDesktop.saveVaultExport({
      fileName: options.fileName,
      mimeType: options.mimeType,
      dataBase64: uint8ArrayToBase64(options.data),
    }).then((result) => result.saved);
  }

  if (window.brainxDesktop?.saveFile) {
    return window.brainxDesktop.saveFile({
      fileName: options.fileName,
      mimeType: options.mimeType,
      dataBase64: uint8ArrayToBase64(options.data),
    });
  }

  const copiedBytes = new Uint8Array(options.data.byteLength);
  copiedBytes.set(options.data);
  const blob = new Blob([copiedBytes], { type: options.mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = options.fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
  return true;
}

export async function saveTextFile(fileName: string, content: string, mimeType: string, preferVaultExport = false) {
  const encoder = new TextEncoder();
  return saveFile({
    fileName,
    mimeType,
    data: encoder.encode(content),
    preferVaultExport,
  });
}
