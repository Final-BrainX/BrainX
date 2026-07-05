"use client";

import { useEffect, useRef, useState } from "react";
import { ExternalLink, FileText, Maximize2, Minimize2 } from "lucide-react";
import { isElectronDesktop } from "@/lib/desktop-bridge";
import { openDesktopVaultAsset } from "@/lib/desktop-vault";
import { getAssetFileUrl, isDesktopVaultAssetId } from "@/lib/ingestion-api";
import { cx } from "@/lib/utils";

interface Props {
  assetId: string;
  fileName: string;
}

export default function PdfViewerPanel({ assetId, fileName }: Props) {
  const url = getAssetFileUrl(assetId);
  const frameRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const onChange = () => setIsFullscreen(document.fullscreenElement === frameRef.current);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const toggleFullscreen = () => {
    if (document.fullscreenElement === frameRef.current) {
      void document.exitFullscreen();
    } else {
      void frameRef.current?.requestFullscreen();
    }
  };

  const openExternal = async () => {
    if (isElectronDesktop() && isDesktopVaultAssetId(assetId)) {
      await openDesktopVaultAsset(assetId);
      return;
    }
    window.open(url, "_blank", "noopener,noreferrer");
  };

  return (
    <div ref={frameRef} className="flex h-full flex-1 flex-col bg-surface">
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-line/40 bg-surface2/40 px-4 py-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <FileText size={15} className="shrink-0 text-txt3" />
          <span className="min-w-0 truncate text-[13px] font-medium text-txt2">{fileName}</span>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          {!isFullscreen && (
            <button
              type="button"
              onClick={() => void openExternal()}
              className="flex items-center gap-1 text-[12px] text-txt3 hover:text-txt"
            >
              Open externally
              <ExternalLink size={12} />
            </button>
          )}
          <button
            type="button"
            onClick={toggleFullscreen}
            className="flex items-center gap-1 text-[12px] text-txt3 hover:text-txt"
          >
            {isFullscreen ? "Exit fullscreen" : "Fullscreen"}
            {isFullscreen ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
          </button>
        </div>
      </div>
      <iframe src={url} title={fileName} className={cx("w-full flex-1 bg-surface")} />
    </div>
  );
}
