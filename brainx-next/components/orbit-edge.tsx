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
  const isSelected = data?.isSelected as boolean | undefined;
  const isDimmed = data?.isDimmed as boolean | undefined;
  const theme = data?.theme as '2d' | 'universe' | undefined;
  const is2D = theme === '2d';

  const strokeColor = isBridge ? "rgb(var(--primary) / 0.35)" : "rgb(var(--border) / 0.6)";
  const selectedStroke = "rgb(var(--primary))"; // primary accent color
  
  const uniStrokeColor = isBridge ? "rgb(34 211 238 / 0.35)" : "rgb(148 163 184 / 0.18)";
  const uniSelectedStroke = "rgb(165 126 255 / 0.8)";

  const strokeW = isSelected ? 2 : (isBridge ? 1.6 : 1);
  const color = isSelected ? (is2D ? selectedStroke : uniSelectedStroke) : (is2D ? strokeColor : uniStrokeColor);

  return (
    <>
      <BaseEdge 
        path={edgePath} 
        style={{
          ...style,
          stroke: color,
          strokeWidth: strokeW,
          strokeDasharray: isBridge || isSelected ? '4 4' : 'none',
          transition: "stroke 0.15s, stroke-width 0.15s, opacity 0.15s",
          opacity: isDimmed ? (is2D ? 0.15 : 0.2) : 1,
          filter: isSelected && !is2D ? `drop-shadow(0 0 8px ${color})` : 'none',
        }} 
      />
      {isSelected && !is2D && (
        <circle r="2.5" fill="#fff" style={{ filter: `drop-shadow(0 0 4px #fff)` }}>
          <animateMotion dur="2.5s" repeatCount="indefinite" path={edgePath} />
        </circle>
      )}
    </>
  );
}
