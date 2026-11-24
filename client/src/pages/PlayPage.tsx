import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, type FinishResult } from '../api';
import { useAuth } from '../auth';
import { RunGame } from '../components/RunGame';
import { LeaderboardTable } from '../components/LeaderboardTable';
import { useLiveLeaderboard } from '../realtime';
import { isMuted, setMuted } from '../game/sound';
import type { RunResult } from '../game/RunScene';
import { num, REJECT_REASONS } from '../format';

const SLUG = 'perrito-run';

type Outcome =
  | { kind: 'saving'; run: RunResult }
  | { kind: 'saved'; run: RunResult; result: FinishResult }
  | { kind: 'guest'; run: RunResult }
  | { kind: 'error'; run: RunResult; message: string };

export function PlayPage() {
  const { user, loading } = useAuth();
  const { entries, isLive } = useLiveLeaderboard(SLUG);
  const [best, setBest] = useState(0);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [muted, setMutedState] = useState(isMuted());

  const restartRef = useRef<() => void>(() => {});
  // promesa de la sesión: si la partida acaba antes de que responda el servidor, espero
  const sessionRef = useRef<Promise<string | null> | null>(null);
  const endedAt = useRef(0);

  useEffect(() => {
    document.title = 'Perrito Run · Perrito Arcade';
    if (!user) return;
    api
      .profile(user.username)
      .then((p) => setBest(p.games.find((g) => g.slug === SLUG)?.best ?? 0))
      .catch(() => {});
  }, [user]);

  const handleStart = useCallback(() => {
    setOutcome(null);
    sessionRef.current = user
      ? api
          .startSession(SLUG)
          .then((s) => s.sessionId)
          .catch(() => null)
      : null;
  }, [user]);

  const handleEnd = useCallback(
    async (run: RunResult) => {
      endedAt.current = Date.now();
      if (!user || !sessionRef.current) return setOutcome({ kind: 'guest', run });

      setOutcome({ kind: 'saving', run });
      const sessionId = await sessionRef.current;
      if (!sessionId) return setOutcome({ kind: 'error', run, message: 'No se pudo abrir la partida en el servidor' });

      try {
        const result = await api.finishSession(sessionId, {
          distance: run.distance,
          coins: run.coins,
          durationMs: run.durationMs,
        });
        if (result.status === 'finished' && result.personalBest) setBest(result.score);
        setOutcome({ kind: 'saved', run, result });
      } catch (err) {
        setOutcome({ kind: 'error', run, message: (err as Error).message });
      }
    },
    [user],
  );

  const restart = useCallback(() => {
    // si mueres con el espacio pulsado no quiero que empiece otra al instante
    if (Date.now() - endedAt.current < 400) return;
    setOutcome(null);
    restartRef.current();
  }, []);

  useEffect(() => {
    if (!outcome) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.code === 'Space' || e.code === 'Enter') && !e.repeat) restart();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [outcome, restart]);

  const toggleMute = () => {
    setMuted(!muted);
    setMutedState(!muted);
  };

  return (
    <div className="play-layout">
      <section className="play-main">
        <div className="game-frame">
          {/* espero a saber quién es antes de crear el juego: si no, el perrito salía
              con la skin clásica al recargar aunque tuvieras otra puesta */}
          {!loading && (
            <RunGame
              key={user?.skin ?? 'invitado'}
              bestScore={user ? best : 0}
              palette={user?.palette}
              onStart={handleStart}
              onEnd={handleEnd}
              registerRestart={(fn) => (restartRef.current = fn)}
            />
          )}
          {outcome && <ResultOverlay outcome={outcome} onRestart={restart} />}
        </div>

        <div className="game-toolbar">
          <span className="muted small">
            <kbd>Espacio</kbd> o toca para saltar · mantén pulsado para saltar más alto · en el aire, otra vez para
            doble salto
          </span>
          <button className="btn-link" onClick={toggleMute}>
            {muted ? '🔇 Sonido apagado' : '🔊 Sonido'}
          </button>
        </div>

        {!user && (
          <p className="notice">
            Estás jugando como invitado. <Link to="/entrar?volver=/jugar/perrito-run">Entra o crea una cuenta</Link>{' '}
            para que tus partidas cuenten en el ranking.
          </p>
        )}
      </section>

      <aside className="card play-side">
        <h3>Top 10</h3>
        <LeaderboardTable entries={entries} highlight={user?.username} compact animate={isLive} />
        <Link to={`/ranking/${SLUG}`} className="small">
          Ver ranking completo →
        </Link>
      </aside>
    </div>
  );
}

function ResultOverlay({ outcome, onRestart }: { outcome: Outcome; onRestart: () => void }) {
  const { run } = outcome;

  return (
    <div className="overlay" role="dialog" aria-label="Fin de la partida">
      <div className="overlay-box">
        <p className="overlay-title">¡Pumba!</p>
        <p className="big-score">{num(run.score)}</p>
        <p className="muted small">
          {num(run.distance)} m · {run.coins} huesos · {Math.round(run.durationMs / 1000)} s
        </p>

        {outcome.kind === 'saving' && <p className="muted">Guardando…</p>}
        {outcome.kind === 'guest' && (
          <p>
            <Link to="/entrar?volver=/jugar/perrito-run">Entra</Link> para guardar tus puntuaciones.
          </p>
        )}
        {outcome.kind === 'error' && <p className="error">{outcome.message}</p>}
        {outcome.kind === 'saved' &&
          (outcome.result.status === 'rejected' ? (
            <p className="error">
              El servidor no ha aceptado esta partida ({REJECT_REASONS[outcome.result.reason] ?? outcome.result.reason}
              ).
            </p>
          ) : (
            <p>
              {outcome.result.personalBest ? (
                <span className="tag big">¡Nuevo récord personal!</span>
              ) : (
                <span className="muted">Tu récord: {num(outcome.result.previousBest ?? 0)}</span>
              )}
              {outcome.result.rank && <span className="rank-line">Vas #{outcome.result.rank} en el ranking</span>}
              {outcome.result.bonesEarned > 0 && (
                <span className="rank-line">+{outcome.result.bonesEarned} huesos para la tienda</span>
              )}
            </p>
          ))}

        <button className="btn" onClick={onRestart} autoFocus>
          Otra vez
        </button>
        <p className="muted small">o pulsa espacio</p>
      </div>
    </div>
  );
}
