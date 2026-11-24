import { useCallback, useEffect, useRef, useState } from 'react';
import { DogLogo } from '../components/DogLogo';
import { RunGame } from '../components/RunGame';
import { DuelBoard } from '../components/DuelBoard';
import { PlayerScore } from '../components/PlayerScore';
import { LocalDuel } from '../duel/localDuel';
import { other, type DuelSnapshot } from '../duel/types';
import { isMuted, setMuted, sfx } from '../game/sound';
import type { RunResult } from '../game/RunScene';
import { num } from '../format';

/**
 * Versión de la web que se puede publicar como página estática (GitHub Pages):
 * sin cuentas, sin base de datos y sin websockets. El récord se guarda en el navegador.
 */

const REPO = 'https://github.com/ZitroOlrac/perrito-arcade';
type Tab = 'run' | 'duel';

export function DemoApp() {
  const [tab, setTab] = useState<Tab>(() => (location.hash === '#duelo' ? 'duel' : 'run'));
  const [muted, setMutedState] = useState(isMuted());

  useEffect(() => {
    history.replaceState(null, '', tab === 'duel' ? '#duelo' : '#run');
  }, [tab]);

  return (
    <div className="app">
      <header className="topbar">
        <span className="brand">
          <DogLogo size={36} />
          <span>
            Perrito <b>Arcade</b>
          </span>
        </span>
        <nav className="nav" role="tablist">
          <a
            href="#run"
            role="tab"
            aria-selected={tab === 'run'}
            className={tab === 'run' ? 'active' : ''}
            onClick={() => setTab('run')}
          >
            Perrito Run
          </a>
          <a
            href="#duelo"
            role="tab"
            aria-selected={tab === 'duel'}
            className={tab === 'duel' ? 'active' : ''}
            onClick={() => setTab('duel')}
          >
            Duelo de Llaves
          </a>
        </nav>
        <div className="session">
          <button
            className="btn-link"
            onClick={() => {
              setMuted(!muted);
              setMutedState(!muted);
            }}
          >
            {muted ? '🔇' : '🔊'}
          </button>
          <a href={REPO} className="btn small secondary" target="_blank" rel="noreferrer">
            Código
          </a>
        </div>
      </header>

      <main className="content">
        {tab === 'run' ? <DemoRun /> : <DemoDuel />}

        <p className="notice demo-note">
          Esta es la versión de demostración, que funciona sin servidor. La versión completa tiene cuentas, ranking en
          directo, <b>duelos 1 contra 1 online</b> con ELO, tienda de skins y logros.{' '}
          <a href={REPO} target="_blank" rel="noreferrer">
            Ver el código y cómo funciona →
          </a>
        </p>
      </main>

      <footer className="footer">
        Hecho por{' '}
        <a href="https://zitroolrac.github.io/Portfolio/" target="_blank" rel="noreferrer">
          Carlo Prado
        </a>{' '}
        · React, Phaser, Node y PostgreSQL
      </footer>
    </div>
  );
}

// ---------------- Perrito Run ----------------

const BEST_KEY = 'pa:demo-best';

function DemoRun() {
  const [best, setBest] = useState(() => Number(localStorage.getItem(BEST_KEY) ?? 0));
  const [result, setResult] = useState<{ run: RunResult; record: boolean } | null>(null);
  const restartRef = useRef<() => void>(() => {});
  const endedAt = useRef(0);
  const bestRef = useRef(best);

  const onEnd = useCallback((run: RunResult) => {
    endedAt.current = Date.now();
    const record = run.score > bestRef.current;
    if (record) {
      bestRef.current = run.score;
      setBest(run.score);
      localStorage.setItem(BEST_KEY, String(run.score));
    }
    setResult({ run, record });
  }, []);

  const restart = useCallback(() => {
    if (Date.now() - endedAt.current < 400) return;
    setResult(null);
    restartRef.current();
  }, []);

  useEffect(() => {
    if (!result) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.code === 'Space' || e.code === 'Enter') && !e.repeat) restart();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [result, restart]);

  return (
    <section className="match">
      <div className="game-frame">
        <RunGame
          bestScore={best}
          onStart={() => setResult(null)}
          onEnd={onEnd}
          registerRestart={(fn) => (restartRef.current = fn)}
        />
        {result && (
          <div className="overlay" role="dialog" aria-label="Fin de la partida">
            <div className="overlay-box">
              <p className="overlay-title">¡Pumba!</p>
              <p className="big-score">{num(result.run.score)}</p>
              <p className="muted small">
                {num(result.run.distance)} m · {result.run.coins} huesos · {Math.round(result.run.durationMs / 1000)} s
              </p>
              <p>
                {result.record ? (
                  <span className="tag big">¡Nuevo récord!</span>
                ) : (
                  <span className="muted">Tu récord: {num(best)}</span>
                )}
              </p>
              <button className="btn" onClick={restart} autoFocus>
                Otra vez
              </button>
              <p className="muted small">o pulsa espacio</p>
            </div>
          </div>
        )}
      </div>
      <p className="muted small demo-help">
        <kbd>Espacio</kbd> o toca para saltar · mantén pulsado para saltar más alto · en el aire, otra vez para doble
        salto
      </p>
    </section>
  );
}

// ---------------- Duelo contra Perrobot ----------------

function DemoDuel() {
  const [duel, setDuel] = useState<LocalDuel | null>(null);
  const [snap, setSnap] = useState<DuelSnapshot | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const start = useCallback(() => {
    setDuel((prev) => {
      prev?.stop();
      const d = new LocalDuel();
      setSnap(d.last);
      return d;
    });
  }, []);

  useEffect(() => {
    if (!duel) return;
    return duel.subscribe(setSnap);
  }, [duel]);

  useEffect(() => () => duel?.stop(), [duel]);

  // reloj del marcador
  const running = snap !== null && snap.phase !== 'finished';
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(t);
  }, [running]);

  const countdown = snap?.phase === 'countdown' ? Math.ceil((snap.startsAt - now) / 1000) : null;
  useEffect(() => {
    if (countdown !== null && countdown > 0 && countdown <= 3) sfx.beep(false);
  }, [countdown]);
  useEffect(() => {
    if (snap?.phase === 'playing') sfx.beep(true);
  }, [snap?.phase]);
  useEffect(() => {
    const w = snap?.result?.winner;
    if (w === 'a') sfx.record();
    else if (w === 'b') sfx.lose();
  }, [snap?.result?.winner]);

  if (!duel || !snap) {
    return (
      <section className="duel-hero">
        <div>
          <h1>Duelo de Llaves</h1>
          <p className="lead">
            Van saliendo tornillos y el primero que los aprieta se los lleva. Gana quien llegue antes a <b>15 puntos</b>{' '}
            o vaya por delante a los 45 segundos.
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
          <p className="muted small">
            En la versión completa juegas contra otra persona en tiempo real. Aquí, contra <b>Perrobot</b>.
          </p>
          <button className="btn big" onClick={start}>
            Jugar contra Perrobot
          </button>
        </div>
      </section>
    );
  }

  const timeLeft = Math.max(0, snap.endsAt - Math.max(now, snap.startsAt));
  const finished = snap.phase === 'finished';
  const winner = snap.result?.winner;

  return (
    <section className="match">
      <div className="duel-hud">
        <PlayerScore name="Tú" rating={0} score={snap.scores.a} target={snap.target} side="me" label="" />
        <div className="duel-timer">
          <span className={`mono ${timeLeft < 10_000 && !finished ? 'danger' : ''}`}>{Math.ceil(timeLeft / 1000)}</span>
          <small className="muted" />
        </div>
        <PlayerScore
          name="Perrobot"
          rating={0}
          score={snap.scores.b}
          target={snap.target}
          side="rival"
          bot
          label="bot"
        />
      </div>

      <div className="game-frame duel-frame">
        <DuelBoard
          key={snap.startsAt}
          you="a"
          initial={snap}
          serverNow={Date.now}
          onHit={duel.hit}
          subscribe={duel.subscribe}
        />
        {countdown !== null && countdown > 0 && (
          <div className="overlay countdown">
            <span key={countdown}>{countdown}</span>
          </div>
        )}
        {finished && (
          <div className="overlay">
            <div className="overlay-box">
              <p className={`overlay-title ${winner === 'a' ? 'win' : ''}`}>
                {winner === 'draw' ? 'Empate' : winner === 'a' ? '¡Has ganado!' : 'Has perdido'}
              </p>
              <p className="big-score">
                {snap.scores.a} <span className="muted">-</span> {snap.scores[other('a')]}
              </p>
              <div className="overlay-actions">
                <button className="btn" onClick={start} autoFocus>
                  Revancha
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {!finished && (
        <div className="game-toolbar">
          <span className="muted small">Pincha o toca los tornillos. Los oxidados necesitan 3 toques.</span>
          <button className="btn-link" onClick={() => duel.surrender()}>
            Rendirse
          </button>
        </div>
      )}
      <p className="rotate-hint">Gira el móvil para ver el tablero más grande 📱↻</p>
    </section>
  );
}
