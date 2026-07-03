"use client";

import React from "react";
import { cx } from "@/lib/utils";

interface BrandLogoProps {
  /** 
   * 로고 아이콘의 기준 크기(px). BI 가이드의 variants: 80, 56, 46, 40, 30, 28, 20, 16 
   */
  size?: number;
  
  /** 워드마크(BrainX 텍스트) 표시 여부 */
  showWordmark?: boolean;
  
  /** 서브 타이틀(AI Knowledge Graph) 표시 여부 (큰 사이즈일 때 주로 사용) */
  showSubtitle?: boolean;
  
  className?: string;
  
  /** 그림자 효과 적용 여부 */
  shadow?: boolean;
}

export function BrandLogo({ 
  size = 40, 
  showWordmark = false, 
  showSubtitle = false,
  className, 
  shadow = false 
}: BrandLogoProps) {
  // BI 가이드에 따라 일정 사이즈 이상일 때 보조선 등 디테일을 추가
  const isLarge = size >= 46;
  const isSmall = size <= 20;
  
  const bgStyle = {
    width: `${size}px`,
    height: `${size}px`,
    borderRadius: `calc(${size}px * 0.245)`,
    background: 'linear-gradient(135deg, rgb(var(--primary)) 0%, rgb(var(--accent)) 48%, rgb(var(--cyan)) 100%)',
    boxShadow: shadow ? '0 12px 32px rgb(var(--accent) / 0.32)' : 'none',
  };

  // 내부 SVG 크기는 컨테이너의 약 60% 정도를 차지함 (BI 참고)
  const svgSize = size * 0.6; 
  
  // 라인 두께 조절
  const strokeWidth = isSmall ? 2.8 : (isLarge ? 1.8 : 2.2);

  return (
    <div className={cx("flex items-center gap-3.5", className)}>
      <div 
        className="flex shrink-0 items-center justify-center relative overflow-hidden"
        style={bgStyle}
      >
        <svg width={svgSize} height={svgSize} viewBox="0 0 56 56" fill="none" xmlns="http://www.w3.org/2000/svg">
          <line x1="13" y1="13" x2="43" y2="43" stroke="white" strokeOpacity="0.45" strokeWidth={strokeWidth}/>
          <line x1="43" y1="13" x2="13" y2="43" stroke="white" strokeOpacity="0.45" strokeWidth={strokeWidth}/>
          
          {/* 보조선(뇌 주름 암시) - 큰 사이즈에서만 */}
          {isLarge && (
            <>
              <path d="M13 13 Q8 8 5 11" stroke="white" strokeOpacity="0.28" strokeWidth="1.4" strokeLinecap="round" fill="none"/>
              <path d="M43 43 Q48 48 51 45" stroke="white" strokeOpacity="0.22" strokeWidth="1.4" strokeLinecap="round" fill="none"/>
            </>
          )}
          
          {/* 주요 노드 */}
          <circle cx="13" cy="13" r={isSmall ? 8 : 7.2} fill="white"/>
          {!isSmall && <circle cx="13" cy="13" r="3.6" fill="white" fillOpacity="0.38"/>}
          
          <circle cx="43" cy="43" r={isSmall ? 7.5 : 6.8} fill="white" fillOpacity="0.9"/>
          {isLarge && <circle cx="43" cy="43" r="3.2" fill="white" fillOpacity="0.35"/>}
          
          <circle cx="43" cy="13" r={isSmall ? 5 : 4.4} fill="white" fillOpacity="0.88"/>
          <circle cx="13" cy="43" r={isSmall ? 4.4 : 3.8} fill="white" fillOpacity="0.74"/>
        </svg>
      </div>
      
      {showWordmark && (
        <div className="flex flex-col justify-center">
          <span 
            className="font-bold tracking-tight leading-none"
            style={{ 
              fontSize: Math.max(16, size * 0.65) + 'px', 
              letterSpacing: '-0.03em',
              background: 'linear-gradient(135deg, rgb(var(--primary)), rgb(var(--accent)), rgb(var(--cyan)))',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text'
            }}
          >
            BrainX
          </span>
          {showSubtitle && (
            <span className="text-[12px] text-txt3 tracking-[0.04em] mt-1.5 ml-0.5 leading-none">
              AI Knowledge Graph
            </span>
          )}
        </div>
      )}
    </div>
  );
}
