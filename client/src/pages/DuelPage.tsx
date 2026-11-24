import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, type DuelRankingEntry, type RecentDuel } from '../api';
import { useAuth } from '../auth';
import { getSocket } from '../realtime';
import { useDuel, useServerClock, type DuelState } from '../duel/useDuel';
import { other, type EndPayload, type MatchInfo } from '../duel/types';
import { DuelBoard } from '../components/DuelBoard';
import { DogLogo } from '../components/DogLogo';
import { sfx } from '../game/sound';
import { timeAgo } from '../format';

export function DuelPage() {
  const { user, loading } = useAuth();
  const { state, stateRef, actions } = useDuel(Boolean(user));
  const clock = useServerClock();
  const [params, setParams] = useSearchParams();
  const roomFromUrl = params.get('sala');

  useEffect(() => {
    document.title = 'Duelo de Llaves · Perrito Arcade';
  }, []);

  // enlace de invitación: /duelo?sala=ABCDE (una sola vez por código)
  const joinedCode = useRef<string | null>(null);
  useEffect(() => {
    if (!user || !roomFromUrl || joinedCode.current === roomFromUrl) return;
    const socket = getSocket();
    const join = () => {
      joinedCode.current = roomFromUrl;
      actions.joinRoom(roomFromUrl);
      setParams({}, { replace: true });
    };
    if (socket.connected) join();
    else socket.once('connect', join);
    return () => {
      socket.off('connect', join);
    };
  }, [user, roomFromUrl, actions, setParams]);

  // al salir de la página no me quedo en la cola ni dejo la partida colgada
  useEffect(
    () => () => {
      const s = stateRef.current;
      if (s.status === 'queue' || s.status === 'room') actions.cancel();
      if (s.status === 'match' && s.snapshot?.phase !== 'finished') actions.leave();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  if (loading) return null;
  if (!user) {
    const back = roomFromUrl ? `/duelo?sala=${roomFromUrl}` : '/duelo';
    return (
      <div className="narrow card center">
        <h1>Duelo de Llaves</h1>
        <p>Para jugar contra otra persona necesitas una cuenta (así el ranking sabe quién es quién).</p>
        <Link to={`/entrar?volver=${encodeURIComponent(back)}`} className="btn">
          Entrar o crear cuenta
        </Link>
      </div>
    );
  }

  const serverNow = () => Date.now() + clock.offset;

  return (
    <div className="duel-page">
      {state.error && (
        <p className="notice error-notice" role="alert">
          {state.error}{' '}
          <button className="btn-link" onClick={actions.clearError}>
            cerrar
          </button>
        </p>
      )}

      {state.status === 'idle' && <Lobby actions={actions} />}
      {(state.status === 'queue' || state.status === 'room') && <Waiting state={state} actions={actions} />}
      {state.status === 'match' && state.match && (
        <MatchView
          key={state.match.matchId}
          state={state}
          match={state.match}
          serverNow={serverNow}
          rtt={clock.rtt}
          actions={actions}
        />
      )}
    </div>
  );
}

type Actions = ReturnType<typeof useDuel>['actions'];

// ---------------- lobby ----------------

function Lobby({ actions }: { actions: Actions }) {
  const { user } = useAuth();
  const [code, setCode] = useState('');
  const [ranking, setRanking] = useState<DuelRankingEntry[] | null>(null);
  const [recent, setRecent] = useState<RecentDuel[]>([]);
  const [myRating, setMyRating] = useState<number | null>(null);

  useEffect(() => {
    api
      .duelLeaderboard()
      .then((r) => setRanking(r.entries))
      .catch(() => setRanking([]));
    api
      .recentDuels()
      .then((r) => setRecent(r.duels))
      .catch(() => {});
    if (user)
      api
        .profile(user.username)
        .then((p) => setMyRating(p.duel?.rating ?? 1000))
        .catch(() => {});
  }, [user]);

  const join = (e: FormEvent) => {
    e.preventDefault();
    if (code.trim()) actions.joinRoom(code.trim());
  };

  return (
    <>
      <section className="duel-hero">
        <div>
          <h1>Duelo de Llaves</h1>
          <p className="lead">
            Uno contra uno, en tiempo real. Van saliendo tornillos y el primero que los aprieta se los lleva. Gana quien
            llegue antes a <b>15 puntos</b> o vaya por delante a los 45 segundos.
          </p>
          <ul className="bolt-legend">
            <li>
              <i className="b-normal" /> Normal: 1 toque, 1 punto
            </li>
            <li>
              <i className="b-rusty" /> Oxidado: 3 toques, 2 puntos
            </li>
            <li>
              <i className="b-gold" /> Dorado: 1 toque, 3 puntos (vuela)
            </li>
          </ul>
        </div>
        <div className="card duel-actions">
          {myRating !== null && (
            <p className="muted small">
              Tu ELO: <b className="accent mono">{myRating}</b>
            </p>
          )}
          <button className="btn big" onClick={actions.queue}>
            Buscar rival
          </button>
          <button className="btn secondary" onClick={actions.createRoom}>
            Crear sala para un amigo
          </button>
          <form onSubmit={join} className="join-form">
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="Código de sala"
              maxLength={5}
              aria-label="Código de sala"
            />
            <button className="btn secondary" disabled={code.trim().length !== 5}>
              Unirse
            </button>
          </form>
          <button className="btn-link small" onClick={actions.playBot}>
            Practicar contra Perrobot (no cuenta para el ELO)
          </button>
        </div>
      </section>

      <div className="home-grid">
        <section className="card">
          <h3>Ranking ELO</h3>
          {ranking === null ? (
            <p className="muted">Cargando…</p>
          ) : ranking.length === 0 ? (
            <p className="muted">Todavía no hay duelos. El primero que gane se pone arriba.</p>
          ) : (
            <ol className="board">
              {ranking.map((r) => (
                <li key={r.username} className={r.username === user?.username ? 'me' : ''}>
                  <span className="rank">{r.rank}</span>
                  <Link to={`/jugador/${r.username}`} className="name">
                    <DogLogo size={22} palette={r.palette} title="" />
                    {r.username}
                  </Link>
                  <span className="when">
                    {r.wins}V · {r.losses}D{r.draws ? ` · ${r.draws}E` : ''}
                  </span>
                  <span className="score">{r.rating}</span>
                </li>
              ))}
            </ol>
          )}
        </section>

        <section className="card feed">
          <h3>Últimos duelos</h3>
          {recent.length === 0 ? (
            <p className="muted small">Aún no se ha jugado ninguno.</p>
          ) : (
            <ul>
              {recent.map((d) => (
                <li key={d.id}>
                  <DuelLine duel={d} />
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}

function DuelLine({ duel }: { duel: RecentDuel }) {
  const winner = duel.result === 'a' ? duel.a : duel.result === 'b' ? duel.b : null;
  const loser = duel.result === 'a' ? duel.b : duel.a;
  const [ws, ls] = duel.result === 'b' ? [duel.scores.b, duel.scores.a] : [duel.scores.a, duel.scores.b];
  return (
    <>
      {winner ? (
        <>
          <b>{winner}</b> ganó a {loser}{' '}
          <span className="mono">
            {ws}-{ls}
          </span>
          {duel.reason === 'forfeit' && <span className="muted"> (abandono)</span>}
        </>
      ) : (
        <>
          {duel.a} y {duel.b} empataron{' '}
          <span className="mono">
            {duel.scores.a}-{duel.scores.b}
          </span>
        </>
      )}
      <span className="muted small"> · {timeAgo(duel.endedAt)}</span>
    </>
  );
}

// ---------------- esperando ----------------

function Waiting({ state, actions }: { state: DuelState; actions: Actions }) {
  const [now, setNow] = useState(() => Date.now());
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, []);

  const seconds = state.queuedAt ? Math.floor((now - state.queuedAt) / 1000) : 0;
  const link = state.roomCode ? `${location.origin}/duelo?sala=${state.roomCode}` : '';

  const copy = async () => {
    await navigator.clipboard?.writeText(link).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="narrow card center waiting">
      <div className="spinner-bolt" aria-hidden />
      {state.status === 'room' ? (
        <>
          <h2>Esperando a tu amigo</h2>
          <p>Pásale este código o el enlace:</p>
          <p className="room-code">{state.roomCode}</p>
          <button className="btn secondary small" onClick={copy}>
            {copied ? '¡Copiado!' : 'Copiar enlace'}
          </button>
        </>
      ) : (
        <>
          <h2>Buscando rival…</h2>
          <p className="muted">{seconds} s</p>
          {seconds >= 8 && (
            <p>
              No hay nadie más ahora mismo.{' '}
              <button className="btn-link accent" onClick={actions.playBot}>
                Juega contra Perrobot
              </button>{' '}
              mientras tanto.
            </p>
          )}
        </>
      )}
      <button className="btn-link" onClick={actions.cancel}>
        Cancelar
      </button>
    </div>
  );
}

// ---------------- partida ----------------

interface MatchProps {
  state: DuelState;
  match: MatchInfo;
  serverNow: () => number;
  rtt: number | null;
  actions: Actions;
}

function useTicker(active: boolean, ms = 100) {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setTick((n) => n + 1), ms);
    return () => clearInterval(t);
  }, [active, ms]);
}

function MatchView({ state, match, serverNow, rtt, actions }: MatchProps) {
  const snap = state.snapshot;
  const you = match.you;
  const finished = snap?.phase === 'finished';
  useTicker(!finished);

  const now = serverNow();
  const scores = snap?.scores ?? { a: 0, b: 0 };
  const target = snap?.target ?? 15;
  const timeLeft = snap ? Math.max(0, snap.endsAt - Math.max(now, snap.startsAt)) : 0;
  const countdown = snap && snap.phase === 'countdown' ? Math.ceil((snap.startsAt - now) / 1000) : null;

  // pitidos de la cuenta atrás
  useEffect(() => {
    if (countdown === null) return;
    if (countdown > 0 && countdown <= 3) sfx.beep(false);
  }, [countdown]);
  useEffect(() => {
    if (snap?.phase === 'playing') sfx.beep(true);
  }, [snap?.phase]);

  useEffect(() => {
    if (!state.end) return;
    const w = state.end.result.winner;
    if (w === you) sfx.record();
    else if (w !== 'draw') sfx.lose();
  }, [state.end, you]);

  const hit = useCallback((id: number) => actions.hit(id), [actions]);

  // si se pulsó "buscar" con la página bajada, que el marcador quede a la vista
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, []);

  return (
    <div className="match">
      <div className="duel-hud">
        <PlayerScore name={match.me.username} rating={match.me.rating} score={scores[you]} target={target} side="me" />
        <div className="duel-timer">
          <span className={`mono ${timeLeft < 10_000 && !finished ? 'danger' : ''}`}>{Math.ceil(timeLeft / 1000)}</span>
          <small className="muted">{rtt !== null ? `${rtt} ms` : ''}</small>
        </div>
        <PlayerScore
          name={match.opponent.username}
          rating={match.opponent.rating}
          score={scores[other(you)]}
          target={target}
          side="rival"
          bot={match.opponent.isBot}
        />
      </div>

      <div className="game-frame duel-frame">
        <DuelBoard you={you} initial={snap} serverNow={serverNow} onHit={hit} />

        {countdown !== null && countdown > 0 && (
          <div className="overlay countdown" aria-live="assertive">
            <span key={countdown}>{countdown}</span>
          </div>
        )}

        {state.opponent === 'away' && !finished && (
          <div className="duel-banner">Tu rival se ha desconectado. Si no vuelve en unos segundos, ganas.</div>
        )}

        {finished && (
          <ResultOverlay
            end={state.end}
            fallbackWinner={snap?.result?.winner}
            match={match}
            state={state}
            actions={actions}
          />
        )}
      </div>

      <p className="rotate-hint">Gira el móvil para ver el tablero más grande 📱↻</p>

      {!finished && (
        <div className="game-toolbar">
          <span className="muted small">Pincha o toca los tornillos. Los oxidados necesitan 3 toques.</span>
          <button className="btn-link" onClick={actions.surrender}>
            Rendirse
          </button>
        </div>
      )}
    </div>
  );
}

function PlayerScore(props: {
  name: string;
  rating: number;
  score: number;
  target: number;
  side: 'me' | 'rival';
  bot?: boolean;
}) {
  const pct = Math.min(100, (props.score / props.target) * 100);
  return (
    <div className={`player-score ${props.side}`}>
      <div className="player-line">
        <span className="player-name">
          {props.name}
          {props.bot ? ' 🤖' : ''}
        </span>
        <span className="muted small">{props.bot ? 'práctica' : `ELO ${props.rating}`}</span>
      </div>
      <div className="player-bar">
        <i style={{ width: `${pct}%` }} />
      </div>
      <span className="player-points mono">{props.score}</span>
    </div>
  );
}

function ResultOverlay({
  end,
  fallbackWinner,
  match,
  state,
  actions,
}: {
  end: EndPayload | null;
  fallbackWinner?: string;
  match: MatchInfo;
  state: DuelState;
  actions: Actions;
}) {
  const you = match.you;
  const winner = end?.result.winner ?? fallbackWinner;
  const title = winner === 'draw' ? 'Empate' : winner === you ? '¡Has ganado!' : 'Has perdido';
  const reason = end?.result.reason;
  const mine = end?.ratings[you] ?? null;
  const rivalLeft = state.opponent === 'left';

  return (
    <div className="overlay">
      <div className="overlay-box">
        <p className={`overlay-title ${winner === you ? 'win' : ''}`}>{title}</p>
        {end && (
          <p className="big-score">
            {end.result.scores[you]} <span className="muted">-</span> {end.result.scores[other(you)]}
          </p>
        )}
        {reason === 'forfeit' && (
          <p className="muted small">{winner === you ? 'Tu rival se ha rendido o se ha ido' : 'Te has rendido'}</p>
        )}

        {!end ? (
          <p className="muted">Guardando…</p>
        ) : end.rated && mine ? (
          <p>
            ELO {mine.before} → <b>{mine.after}</b>{' '}
            <span className={mine.delta >= 0 ? 'delta up' : 'delta down'}>
              ({mine.delta >= 0 ? '+' : ''}
              {mine.delta})
            </span>
          </p>
        ) : (
          <p className="muted small">Partida de práctica, no cuenta para el ELO</p>
        )}

        {end && end.winnerBones > 0 && winner === you && (
          <p className="small">+{end.winnerBones} huesos para la tienda</p>
        )}

        {state.rematchOffered && !state.rematchSent && (
          <p className="tag big">{match.opponent.username} quiere la revancha</p>
        )}

        <div className="overlay-actions">
          <button className="btn" onClick={actions.rematch} disabled={!end || state.rematchSent || rivalLeft} autoFocus>
            {rivalLeft ? 'Tu rival se ha ido' : state.rematchSent ? 'Esperando al rival…' : 'Revancha'}
          </button>
          <button className="btn secondary" onClick={actions.queue}>
            Buscar otro rival
          </button>
        </div>
        <button className="btn-link small" onClick={actions.leave}>
          Volver
        </button>
      </div>
    </div>
  );
}
