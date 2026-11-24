import { BONE, PALETTE } from '../game/sprites';

// el mismo hueso del juego, en SVG
export function BoneIcon({ size = 18 }: { size?: number }) {
  const w = BONE[0].length;
  const h = BONE.length;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width={size} height={(size * h) / w} shapeRendering="crispEdges" aria-hidden>
      {BONE.flatMap((row, y) =>
        [...row].map((c, x) =>
          c === '.' ? null : <rect key={`${x}-${y}`} x={x} y={y} width={1.02} height={1.02} fill={PALETTE[c]} />,
        ),
      )}
    </svg>
  );
}
