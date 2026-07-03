"use client";

import { memo, useMemo } from "react";

import { Icon } from "@/components/brainx-ui";
import { cx } from "@/lib/utils";
import { BrandLogo } from "@/components/brand-logo";

type LoadingSkeletonProps = {
  title?: string;
  description?: string;
  messages?: string[];
  className?: string;
  compact?: boolean;
};

const DEFAULT_MESSAGES = [
  "노트 목록을 불러오는 중이에요",
  "AI 연결 관계를 분석하는 중이에요",
  "인사이트를 정리하는 중이에요"
];

const LoadingSkeleton = memo(function LoadingSkeleton({
  title = "불러오는 중",
  description = "BrainX가 지식 그래프를 구성하고 있어요",
  messages = DEFAULT_MESSAGES,
  className,
  compact = false
}: LoadingSkeletonProps) {
  const safeMessages = useMemo(() => (messages.length > 0 ? messages : DEFAULT_MESSAGES), [messages]);

  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label={title}
      className={cx("w-full", className)}
    >
      <div className="mx-auto flex w-full max-w-md flex-col items-center gap-8 text-center">
        <div className="relative">
          <div className="relative animate-pulse mb-2">
            <BrandLogo size={compact ? 56 : 64} shadow />
          </div>
        </div>

        <div className="msg-block w-full">
          <div className="flex items-center gap-2.5">
            <div className="msg-label">
              <div className="msg-inner" aria-hidden="true">
                {safeMessages.map((message) => (
                  <span key={message}>{message}</span>
                ))}
              </div>
            </div>
            <div className="dots" aria-hidden="true">
              <div className="dot" />
              <div className="dot" />
              <div className="dot" />
            </div>
          </div>

          <div className="progress-wrap">
            <div className="progress-fill" />
          </div>

          <div className="hint">{description}</div>
        </div>
      </div>
    </div>
  );
});

export default LoadingSkeleton;
