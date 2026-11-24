import { Link } from 'react-router-dom';
import { useActivityFeed } from '../realtime';
import { num } from '../format';

export function ActivityFeed() {
  const items = useActivityFeed();

  return (
    <section className="card feed">
      <h3>
        <span className="live-dot" /> En directo
      </h3>
      {items.length === 0 ? (
        <p className="muted small">Aquí aparecen las partidas según terminan. Deja la pestaña abierta un rato.</p>
      ) : (
        <ul>
          {items.map((a) => (
            <li key={a.at + a.username}>
              {a.opponent ? (
                <>
                  <Link to={`/jugador/${a.username}`}>{a.username}</Link> ha ganado un duelo a {a.opponent}{' '}
                  <b>
                    {a.score}-{a.opponentScore}
                  </b>
                </>
              ) : (
                <>
                  <Link to={`/jugador/${a.username}`}>{a.username}</Link> ha hecho <b>{num(a.score)}</b> pts
                  {a.personalBest && <span className="tag">récord</span>}
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
