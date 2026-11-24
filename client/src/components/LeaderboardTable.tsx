import { Link } from 'react-router-dom';
import type { LeaderboardEntry } from '../api';
import { num, timeAgo } from '../format';
import { DogLogo } from './DogLogo';

interface Props {
  entries: LeaderboardEntry[] | null;
  highlight?: string;
  compact?: boolean;
  /** si es true, las filas nuevas o que mejoran se iluminan un momento */
  animate?: boolean;
}

const MEDALS = ['🥇', '🥈', '🥉'];

export function LeaderboardTable({ entries, highlight, compact, animate }: Props) {
  if (!entries)
    return (
      <div className="skeleton-list">
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} />
        ))}
      </div>
    );
  if (entries.length === 0) return <p className="muted">Nadie ha jugado todavía. ¡Puedes ser el primero!</p>;

  return (
    <ol className={`board ${compact ? 'compact' : ''} ${animate ? 'animate' : ''}`}>
      {entries.map((e) => (
        // la key incluye la puntuación: si alguien mejora, React monta la fila de nuevo
        // y la animación CSS de "flash" se dispara sola, sin timers ni estado
        <li
          key={`${e.username}-${e.score}`}
          className={e.username.toLowerCase() === highlight?.toLowerCase() ? 'me' : ''}
        >
          <span className="rank">{MEDALS[e.rank - 1] ?? e.rank}</span>
          <Link to={`/jugador/${e.username}`} className="name">
            <DogLogo size={22} palette={e.palette} title="" />
            {e.username}
          </Link>
          {!compact && <span className="when">{timeAgo(e.achievedAt)}</span>}
          <span className="score">{num(e.score)}</span>
        </li>
      ))}
    </ol>
  );
}
