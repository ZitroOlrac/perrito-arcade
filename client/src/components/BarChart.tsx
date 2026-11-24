interface Props {
  data: { label: string; value: number }[];
  height?: number;
}

// Gráfica de barras sencilla en SVG; para esto no hacía falta una librería
export function BarChart({ data, height = 180 }: Props) {
  const max = Math.max(1, ...data.map((d) => d.value));
  const barW = 100 / data.length;

  return (
    <div className="barchart" style={{ height }}>
      <svg viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" aria-hidden>
        {data.map((d, i) => {
          const h = (d.value / max) * (height - 24);
          return (
            <rect key={d.label} x={i * barW + barW * 0.15} y={height - 20 - h} width={barW * 0.7} height={h} rx={0.6}>
              <title>{`${d.label}: ${d.value}`}</title>
            </rect>
          );
        })}
      </svg>
      <div className="barchart-labels">
        {data.map((d, i) => (
          <span key={d.label}>{i % 2 === 0 ? d.label : ''}</span>
        ))}
      </div>
    </div>
  );
}
