import { useEffect, useRef } from 'react';
import type Phaser from 'phaser';
import type { RunResult } from '../game/RunScene';

interface Props {
  bestScore: number;
  palette?: Record<string, string>;
  onStart: () => void;
  onEnd: (result: RunResult) => void;
  /** se pasa la función para reiniciar desde fuera (botón "otra vez") */
  registerRestart: (fn: () => void) => void;
}

/**
 * Envoltorio de React para el juego. Phaser se carga con import() para que
 * su ~1 MB no se descargue hasta que alguien entra a jugar.
 */
export function RunGame({ bestScore, palette, onStart, onEnd, registerRestart }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const gameRef = useRef<Phaser.Game | null>(null);

  // guardo los callbacks en refs para no recrear el juego cada vez que cambian
  const handlers = useRef({ onStart, onEnd });
  useEffect(() => {
    handlers.current = { onStart, onEnd };
  });

  useEffect(() => {
    let cancelled = false;

    import('../game/createGame').then(({ createRunGame }) => {
      if (cancelled || !container.current) return;
      const game = createRunGame(container.current, bestScore, palette);
      gameRef.current = game;
      game.events.on('run:start', () => handlers.current.onStart());
      game.events.on('run:end', (r: RunResult) => handlers.current.onEnd(r));
      registerRestart(() => game.events.emit('run:restart'));
    });

    return () => {
      cancelled = true;
      gameRef.current?.destroy(true);
      gameRef.current = null;
    };
    // el juego solo se crea una vez; el récord se actualiza con el efecto de abajo
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    gameRef.current?.events.emit('run:best', bestScore);
  }, [bestScore]);

  return <div ref={container} className="game-canvas" />;
}
