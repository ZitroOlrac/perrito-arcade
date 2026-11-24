import { DOG_RUN_A, withSkin } from '../game/sprites';

interface Props {
  size?: number;
  title?: string;
  /** colores de la skin; sin esto sale el perrito clásico */
  palette?: Record<string, string>;
}

// El mismo perrito del juego pero en SVG, para que se vea nítido a cualquier tamaño
export function DogLogo({ size = 40, title = 'Perrito Arcade', palette }: Props) {
  const PALETTE = withSkin(palette);
  const rows = DOG_RUN_A;
  const w = rows[0].length;
  const h = rows.length;
  const rects = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const color = PALETTE[rows[y][x]];
      if (color) rects.push(<rect key={`${x}-${y}`} x={x} y={y} width={1.02} height={1.02} fill={color} />);
    }
  }
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      width={size}
      height={(size * h) / w}
      shapeRendering="crispEdges"
      role="img"
      aria-label={title}
    >
      {rects}
    </svg>
  );
}
