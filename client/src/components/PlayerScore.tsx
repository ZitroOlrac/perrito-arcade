export function PlayerScore(props: {
  name: string;
  rating: number;
  score: number;
  target: number;
  side: 'me' | 'rival';
  bot?: boolean;
  /** texto bajo el nombre; por defecto el ELO (o "práctica" si es el bot) */
  label?: string;
}) {
  const pct = Math.min(100, (props.score / props.target) * 100);
  return (
    <div className={`player-score ${props.side}`}>
      <div className="player-line">
        <span className="player-name">
          {props.name}
          {props.bot ? ' 🤖' : ''}
        </span>
        <span className="muted small">{props.label ?? (props.bot ? 'práctica' : `ELO ${props.rating}`)}</span>
      </div>
      <div className="player-bar">
        <i style={{ width: `${pct}%` }} />
      </div>
      <span className="player-points mono">{props.score}</span>
    </div>
  );
}
