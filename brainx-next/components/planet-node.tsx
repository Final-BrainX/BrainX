import { Handle, Position, NodeProps } from '@xyflow/react';
import Tilt from 'react-parallax-tilt';
import { motion } from 'framer-motion';

export type PlanetNodeData = {
  label: string;
  color: string;
  radius: number;
  selected: boolean;
  dimmed: boolean;
  isDirect: boolean;
  layer: 'front' | 'middle' | 'back';
};

export function PlanetNode({ data }: NodeProps) {
  const { label, color, radius, selected, dimmed, isDirect, layer, theme } = data as PlanetNodeData & { theme?: '2d' | 'universe' };

  const is2D = theme === '2d';
  const r = radius;

  // visual adjustments based on layer
  const isDimmedBySelection = layer === 'back';
  const blur = is2D ? 'none' : (layer === 'back' ? 'blur(2px)' : 'none');
  const opacity = dimmed ? 0.15 : isDimmedBySelection ? (is2D ? 0.14 : 0.5) : 1;
  const grayscale = is2D && isDimmedBySelection ? 'grayscale(100%) brightness(60%)' : 'none';

  // Selected glow
  const glow = selected || isDirect
    ? `drop-shadow(0 0 ${selected ? 20 : 12}px rgb(${color})) drop-shadow(0 0 ${selected ? 40 : 20}px rgb(${color} / 0.5))`
    : 'none';
  const strokeWidth = selected ? 2.5 : isDirect ? 2 : 1;
  const filterStyle = is2D ? grayscale : `${blur} saturate(1.4) ${glow}`;

  return (
    <Tilt
      tiltEnable={!is2D}
      tiltMaxAngleX={18}
      tiltMaxAngleY={18}
      perspective={800}
      transitionSpeed={800}
      scale={selected ? 1 : 1.08}
      className="cursor-pointer"
    >
      <motion.div
        animate={{ opacity, filter: filterStyle, scale: selected ? 1.2 : 1 }}
        transition={{ duration: 0.15 }}
        style={{
          width: r * 2,
          height: r * 2,
          position: 'relative',
          '--node-color': color,
          '--stroke-width': `${strokeWidth}px`,
          '--glow-size': `${selected ? 28 : 12}px`,
        } as React.CSSProperties}
      >
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

        {/* 노드 라벨 */}
        {layer !== 'back' && (
          <div className="absolute top-full mt-2 w-max -translate-x-1/2 left-1/2 text-center pointer-events-none">
            <span
              className={is2D ? "text-[12px] font-medium text-txt2" : "text-[12.5px] font-semibold text-white"}
              style={{
                textShadow: is2D ? "none" : "0px 1px 6px rgba(0,0,0,1), 0px 2px 14px rgba(0,0,0,0.9)",
                stroke: is2D ? "rgb(var(--bg))" : "none",
                strokeWidth: is2D ? 3 : 0,
                paintOrder: "stroke"
              }}
            >
              {label.length > 12 ? label.slice(0, 11) + '…' : label}
            </span>
          </div>
        )}

        {/* Handles placed at center so edges connect from the center */}
        <Handle type="target" position={Position.Top} style={{ opacity: 0, left: '50%', top: '50%', transform: 'translate(-50%, -50%)' }} />
        <Handle type="source" position={Position.Bottom} style={{ opacity: 0, left: '50%', top: '50%', transform: 'translate(-50%, -50%)' }} />
      </motion.div>
    </Tilt>
  );
}
