import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, ApiError, type Profile } from '../api';
import { date, duration, num, timeAgo } from '../format';
import { DogLogo } from '../components/DogLogo';

export function ProfilePage() {
  const { username = '' } = useParams();
  // guardo para qué usuario es la respuesta; si no coincide con la URL, aún está cargando
  const [result, setResult] = useState<{ for: string; profile?: Profile; error?: string } | null>(null);

  useEffect(() => {
    document.title = `${username} · Perrito Arcade`;
    api
      .profile(username)
      .then((profile) => setResult({ for: username, profile }))
      .catch((e: ApiError) =>
        setResult({ for: username, error: e.status === 404 ? 'Este jugador no existe.' : e.message }),
      );
  }, [username]);

  if (result?.for !== username) return <p className="muted narrow">Cargando…</p>;
  if (result.error || !result.profile) return <p className="error narrow">{result.error}</p>;
  const { profile } = result;

  const run = profile.games.find((g) => g.slug === 'perrito-run');

  return (
    <div className="narrow">
      <div className="page-head profile-head">
        <div className="avatar">
          <DogLogo size={96} palette={profile.palette} title={profile.username} />
        </div>
        <div>
          <h1>{profile.username}</h1>
          <p className="muted">Jugando desde el {date(profile.memberSince)}</p>
        </div>
      </div>

      <h3>
        Logros{' '}
        <span className="muted small">
          {profile.achievements.filter((a) => a.unlockedAt).length}/{profile.achievements.length}
        </span>
      </h3>
      <div className="achievements">
        {profile.achievements.map((a) => (
          <div key={a.slug} className={`achievement ${a.unlockedAt ? 'unlocked' : ''}`} title={a.description}>
            <span className="achievement-icon">{a.unlockedAt ? '🏆' : '🔒'}</span>
            <div>
              <b>{a.name}</b>
              <p className="muted small">{a.description}</p>
            </div>
          </div>
        ))}
      </div>

      {profile.duel && (
        <>
          <h3>Duelo de Llaves</h3>
          <div className="stats">
            <Stat label="ELO" value={String(profile.duel.rating)} />
            <Stat label="Puesto" value={`#${profile.duel.rank}`} />
            <Stat label="Victorias" value={num(profile.duel.wins)} />
            <Stat label="Derrotas" value={num(profile.duel.losses)} />
            {profile.duel.draws > 0 && <Stat label="Empates" value={num(profile.duel.draws)} />}
          </div>
        </>
      )}

      {run && <h3>Perrito Run</h3>}
      {!run ? (
        <div className="card">
          <p>Todavía no ha jugado a Perrito Run.</p>
          <Link to="/jugar/perrito-run">Jugar a Perrito Run →</Link>
        </div>
      ) : (
        <>
          <div className="stats">
            <Stat label="Mejor puntuación" value={num(run.best)} />
            <Stat label="Puesto" value={run.rank ? `#${run.rank}` : '—'} />
            <Stat label="Partidas" value={num(run.plays)} />
            <Stat label="Huesos" value={num(run.totalCoins)} />
            <Stat label="Tiempo jugado" value={duration(run.totalTimeMs)} />
          </div>

          <div className="card">
            <h3>Últimas partidas</h3>
            <ul className="recent">
              {profile.recent.map((r) => (
                <li key={r.playedAt}>
                  <span>Perrito Run</span>
                  <span className="muted">{timeAgo(r.playedAt)}</span>
                  <b className={r.score === run.best ? 'accent' : ''}>{num(r.score)}</b>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="stat">
      <span className="stat-value">{value}</span>
      <span className="stat-label">{label}</span>
    </div>
  );
}
