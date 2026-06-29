import { Handle, Position, NodeProps } from '@xyflow/react';
import Tilt from 'react-parallax-tilt';
import { motion } from 'framer-motion';

export type PlanetNodeData = {
  label: string;
  color: string;
  radius: number;
  selected: boolean;
  bridgeSelected?: boolean;
  bridgeSelectionOrder?: number | null;
  dimmed: boolean;
  isDirect: boolean;
  layer: 'front' | 'middle' | 'back';
};

export function PlanetNode({ data }: NodeProps) {
  const { label, color, radius, selected, bridgeSelected, bridgeSelectionOrder, dimmed, isDirect, layer, theme } = data as PlanetNodeData & { theme?: '2d' | 'universe' };

  const is2D = theme === '2d';
  const r = radius;

  // visual adjustments based on layer
  const isDimmedBySelection = layer === 'back';
  const blur = is2D ? 'none' : (layer === 'back' ? 'blur(2px)' : 'none');
  const opacity = dimmed ? 0.15 : isDimmedBySelection ? (is2D ? 0.14 : 0.5) : 1;
  const grayscale = is2D && isDimmedBySelection ? 'grayscale(100%) brightness(60%)' : 'none';

  // Selected glow
  const glow = selected || isDirect
    ? `drop-shadow(0 0 ${selected ? 10 : 6}px rgb(${color})) drop-shadow(0 0 ${selected ? 20 : 10}px rgb(${color} / 0.5))`
    : 'none';
  const strokeWidth = selected ? 1.5 : isDirect ? 1.2 : 1;
  const filterStyle = is2D ? grayscale : `${blur} saturate(1.4) ${glow}`;

  return (
    <Tilt
      tiltEnable={!is2D}
      tiltMaxAngleX={18}
      tiltMaxAngleY={18}
      perspective={800}
      transitionSpeed={800}
      scale={1}
      className={`cursor-pointer ${dimmed ? 'pointer-events-none' : ''}`}
    >
      <motion.div
        animate={{ 
          width: r * 2, 
          height: r * 2, 
          opacity, 
          scale: selected ? 1.05 : 1 
        }}
        transition={{ type: "spring", stiffness: 400, damping: 30 }}
        style={{
          position: 'relative',
          '--node-color': color,
          '--stroke-width': `${strokeWidth}px`,
          '--glow-size': `${selected ? 14 : 6}px`,
        } as React.CSSProperties}
      >
        <motion.div
          animate={{ filter: filterStyle }}
          transition={{ type: "spring", stiffness: 400, damping: 30 }}
          style={{ position: 'absolute', inset: 0 }}
        >
          {bridgeSelected && (
            <div
              className="pointer-events-none absolute rounded-full border-2 border-accent"
              style={{
                inset: `-${Math.max(5, r * 0.45)}px`,
                boxShadow: "0 0 0 3px rgb(var(--accent) / 0.16), 0 0 18px rgb(var(--accent) / 0.35)",
              }}
            />
          )}

          {/* 2D: halo ring */}
          {is2D && (
            <div className="absolute inset-0 rounded-full planet-halo" />
          )}

          {/* Universe: 외곽 대기권 글로우 */}
          {!is2D && (
            <div
              className="absolute rounded-full pointer-events-none planet-atmosphere"
              style={{
                inset: `-${r * 0.45}px`,
                opacity: selected ? 1 : isDirect ? 0.85 : 0.55,
              }}
            />
          )}

          <div
            className={`absolute inset-0 rounded-full overflow-hidden ${is2D ? (selected || isDirect ? "planet-body-2d planet-body-2d-active" : "planet-body-2d") : "planet-body-universe"}`}
          />

          {/* Universe: 상단 광택 하이라이트 */}
          {!is2D && (
            <div className="absolute rounded-full pointer-events-none planet-highlight" />
          )}

          {/* Universe: 하단 반사 림 라이트 */}
          {!is2D && (
            <div className="absolute rounded-full pointer-events-none planet-rim-light" />
          )}
        </motion.div>

        {bridgeSelected && bridgeSelectionOrder ? (
          <div className="pointer-events-none absolute -right-3 -top-3 grid h-5 min-w-5 place-items-center rounded-full border border-bg bg-accent px-1 text-[10px] font-bold leading-none text-white shadow-sm">
            {bridgeSelectionOrder}
          </div>
        ) : null}

        {/* 노드 라벨 */}
        {layer !== 'back' && (
          <div
            className="absolute top-full mt-2 w-max -translate-x-1/2 left-1/2 text-center pointer-events-none"
            style={{
              // zoom 0.55 이하 → 완전 숨김, 0.85 이상 → 완전 표시, 그 사이 페이드
              opacity: 'clamp(0, calc((var(--rf-zoom, 1) - 0.55) / 0.3), 1)',
              transition: 'opacity 0.2s ease',
              transform: 'translateX(-50%)',
              left: '50%',
            }}
          >
            <span
              className={is2D ? "text-[9px] font-medium text-txt2" : "text-[9.5px] font-semibold text-white"}
              style={{
                display: 'block',
                WebkitFontSmoothing: 'antialiased',
                MozOsxFontSmoothing: 'grayscale',
                // 2D: text-shadow 다중값으로 배경색 아웃라인 효과 (SVG stroke 대체)
                // universe: 가독성을 위한 그림자
                textShadow: is2D
                  ? `-1px -1px 0 rgb(var(--bg)), 1px -1px 0 rgb(var(--bg)), -1px 1px 0 rgb(var(--bg)), 1px 1px 0 rgb(var(--bg))`
                  : "0px 1px 4px rgba(0,0,0,1), 0px 2px 10px rgba(0,0,0,0.9)",
              }}
            >
              {label.length > 12 ? label.slice(0, 11) + '…' : label}
            </span>
          </div>
        )}

        {/* Handles placed at center so edges connect from the exact center */}
        <Handle type="target" position={Position.Top} style={{ opacity: 0, width: 0, height: 0, minWidth: 0, minHeight: 0, border: 'none', left: '50%', top: '50%', transform: 'translate(-50%, -50%)' }} />
        <Handle type="source" position={Position.Bottom} style={{ opacity: 0, width: 0, height: 0, minWidth: 0, minHeight: 0, border: 'none', left: '50%', top: '50%', transform: 'translate(-50%, -50%)' }} />
      </motion.div>
    </Tilt>
  );
}
