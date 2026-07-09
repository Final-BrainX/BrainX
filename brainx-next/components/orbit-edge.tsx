import { BaseEdge, EdgeProps, getStraightPath } from '@xyflow/react';

export function OrbitEdge({
  sourceX,
  sourceY,
  targetX,
  targetY,
  style,
  data,
}: EdgeProps) {
  const [edgePath] = getStraightPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
  });

  const isBridge = data?.isBridge as boolean | undefined;
  const isBridgeHighlight = data?.isBridgeHighlight as boolean | undefined;
  const isSelected = data?.isSelected as boolean | undefined;
  const isDimmed = data?.isDimmed as boolean | undefined;
  const theme = data?.theme as '2d' | 'universe' | undefined;
  const sourceColor = data?.sourceColor as string | null | undefined;
  const activeColor = data?.activeColor as string | null | undefined;
  const timeFadeOpacity = data?.timeFadeOpacity as number | undefined;
  const safeTimeFadeOpacity = Math.min(1, Math.max(0.2, timeFadeOpacity ?? 1));
  const is2D = theme === '2d';

  // 2D 라이트: border가 너무 밝아 잘 안 보이므로 더 진한 중간 회색 사용
  // 다크모드에서는 border(58 76 110)가 배경과 적당히 구분되므로 opacity 높임
  const strokeColor = isBridge
    ? "rgb(var(--primary) / 0.8)"
    : "rgb(100 116 139 / 0.4)";  // slate-500 계열 고정색 (라이트/다크 모두 잘 보임)
  // 선택/호버 시: 활성 노드 색상 사용, 없으면 기존 primary fallback
  const selectedStroke = activeColor ? `rgb(${activeColor})` : "rgb(var(--primary))";
  
  const uniStrokeColor = isBridge ? "rgb(34 211 238 / 0.45)" : "rgb(148 163 184 / 0.35)";
  const uniSelectedStroke = activeColor ? `rgb(${activeColor} / 0.9)` : "rgb(165 126 255 / 0.8)";

  // 징검다리 강조 모드: 소스 노드 색상 사용 (없으면 fallback)
  const bridgeHighlightColor = sourceColor
    ? `rgb(${sourceColor})`
    : "rgb(165 126 255)";

  // 선택 시 굵기 1px 줄임: 2 -> 1 / 기본 굵기: 1 -> 0.5 / bridge: 1.6 -> 0.6
  const strokeW = isSelected ? 1 : (isBridge ? 0.8 : 0.5);
  const color = isSelected ? (is2D ? selectedStroke : uniSelectedStroke) : (is2D ? strokeColor : uniStrokeColor);

  // 강조 모드일 때 덮어씀 (굵기 1px 줄임: 2 -> 1)
  const finalColor = isBridgeHighlight ? bridgeHighlightColor : color;
  const finalStrokeW = isBridgeHighlight ? 1 : strokeW;
  const finalDash = isBridgeHighlight ? '4 4' : (isBridge || isSelected ? '4 4' : 'none');
  const finalFilter = isBridgeHighlight
    ? 'none'
    : (isSelected && !is2D ? `drop-shadow(0 0 8px ${color})` : 'none');
  const baseOpacity = isDimmed
    ? (isBridgeHighlight ? 0.4 : (is2D ? 0.22 : 0.3))
    : 1;
  const finalOpacity = isDimmed ? baseOpacity : baseOpacity * safeTimeFadeOpacity;

  return (
    <>
      <BaseEdge 
        path={edgePath} 
        style={{
          ...style,
          stroke: finalColor,
          strokeWidth: finalStrokeW,
          strokeDasharray: finalDash,
          transition: "stroke 0.15s, stroke-width 0.15s, opacity 0.15s",
          opacity: finalOpacity,
          filter: finalFilter,
        }} 
      />
      {/* 우주모드 선택 시 흰 점 애니메이션 */}
      {isSelected && !is2D && (
        <circle r="2.5" fill="#fff" style={{ filter: `drop-shadow(0 0 4px #fff)` }}>
          <animateMotion dur="2.5s" repeatCount="indefinite" path={edgePath} />
        </circle>
      )}
      {/* 징검다리 강조 시 흰 점 애니메이션 (우주모드 선택과 동일) */}
      {isBridgeHighlight && (
        <circle r="2.5" fill="#fff">
          <animateMotion dur="2.5s" repeatCount="indefinite" path={edgePath} />
        </circle>
      )}
    </>
  );
}
