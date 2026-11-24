import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, type LeaderboardEntry } from '../api';
import { useAuth } from '../auth';
import { LeaderboardTable } from '../components/LeaderboardTable';
import { useLiveLeaderboard } from '../realtime';

export function LeaderboardPage() {
  const { slug = 'perrito-run' } = useParams();
  const { user } = useAuth();
  const [period, setPeriod] = useState<'all' | 'week'>('all');
  const [weekly, setWeekly] = useState<{ slug: string; entries: LeaderboardEntry[] } | null>(null);
  const [error, setError] = useState('');

  // el ranking general llega por websocket; el semanal lo pido por HTTP al cambiar de pestaña
  const live = useLiveLeaderboard(slug, period === 'all');

  useEffect(() => {
    document.title = 'Ranking · Perrito Arcade';
  }, []);

  useEffect(() => {
    if (period !== 'week') return;
    api
      .leaderboard(slug, 'week', 10)
      .then((r) => setWeekly({ slug, entries: r.entries }))
      .catch((e) => setError(e.message));
  }, [slug, period]);

  return (
    <div className="narrow">
      <div className="page-head">
        <h1>Ranking · Perrito Run</h1>
        <Link to={`/jugar/${slug}`} className="btn small">
          Jugar
        </Link>
      </div>

      <div className="tabs" role="tablist">
        <button role="tab" aria-selected={period === 'all'} onClick={() => setPeriod('all')}>
          De siempre
        </button>
        <button role="tab" aria-selected={period === 'week'} onClick={() => setPeriod('week')}>
          Esta semana
        </button>
      </div>

      <div className="card">
        {error && <p className="error">{error}</p>}
        <LeaderboardTable
          entries={period === 'all' ? live.entries : weekly?.slug === slug ? weekly.entries : null}
          highlight={user?.username}
          animate={period === 'all' && live.isLive}
        />
        {period === 'all' && (
          <p className="muted small live-note">
            <span className="live-dot" /> Se actualiza solo cuando alguien entra en el top
          </p>
        )}
      </div>
    </div>
  );
}
