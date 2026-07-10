export type GraphLayoutPoint = {
  x: number;
  y: number;
};

function stableSign(seed: string) {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % 2 === 0 ? 1 : -1;
}

/** 새 노드를 기존 연결 노드 근처에 놓아, 전체 그래프를 다시 가열하지 않아도 연결이 자연스럽게 시작되게 한다. */
export function initialGraphNodePosition(
  nodeId: string,
  linkedNodeIds: readonly string[],
  positions: Readonly<Record<string, GraphLayoutPoint>>,
  fallback: GraphLayoutPoint,
): GraphLayoutPoint {
  const linked = [...new Set(linkedNodeIds)]
    .map((id) => positions[id])
    .filter((position): position is GraphLayoutPoint => !!position);
  if (linked.length === 0) return fallback;
  if (linked.length === 1) {
    const offset = 90 * stableSign(nodeId);
    return { x: linked[0].x + offset, y: linked[0].y - offset };
  }

  const [first, second] = linked;
  const midpoint = { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 };
  const dx = second.x - first.x;
  const dy = second.y - first.y;
  const length = Math.hypot(dx, dy);
  if (length < 1) return { x: midpoint.x + 80, y: midpoint.y - 80 };

  const offset = Math.min(110, Math.max(45, length * 0.25)) * stableSign(nodeId);
  return {
    x: midpoint.x + (-dy / length) * offset,
    y: midpoint.y + (dx / length) * offset,
  };
}
