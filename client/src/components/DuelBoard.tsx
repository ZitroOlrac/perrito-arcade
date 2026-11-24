import { useEffect, useRef } from 'react';
import type Phaser from 'phaser';
import { getSocket } from '../realtime';
import type { DuelSnapshot, HitResult, Side } from '../duel/types';

interface Props {
  you: Side;
  /** último estado conocido al montar (si se ha recargado a mitad de partida) */
  initial: DuelSnapshot | null;
  serverNow: () => number;
  onHit: (boltId: number) => Promise<HitResult>;
}

/**
 * Envoltorio de React para la escena del duelo. Se monta una vez por partida.
 *
 * Los estados del servidor se pasan a Phaser directamente desde el socket y no
 * a través del estado de React: llegan cada 50 ms y React agrupa los cambios,
 * así que si dos estados caían en el mismo render se perdían los eventos del
 * primero (un tornillo ganado se veía como caducado).
 */
export function DuelBoard({ you, initial, serverNow, onHit }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const props = useRef({ serverNow, onHit });

  useEffect(() => {
    props.current = { serverNow, onHit };
  });

  useEffect(() => {
    let cancelled = false;
    let game: Phaser.Game | null = null;
    let ready = false;
    const pending: DuelSnapshot[] = initial ? [{ ...initial, events: [] }] : [];
    const socket = getSocket();

    const onState = (s: DuelSnapshot) => {
      if (ready && game) game.events.emit('duel:state', s);
      else pending.push(s);
    };
    socket.on('duel:state', onState);

    import('../game/duel/createDuelGame').then(({ createDuelGame }) => {
      if (cancelled || !container.current) return;
      game = createDuelGame(container.current, { you, serverNow: () => props.current.serverNow() });

      game.events.once('duel:scene-ready', () => {
        ready = true;
        for (const s of pending.splice(0)) game!.events.emit('duel:state', s);
      });

      game.events.on('duel:hit', (boltId: number) => {
        props.current
          .onHit(boltId)
          .then((result) => game?.events.emit('duel:hit-result', { boltId, result }))
          .catch(() => {});
      });
    });

    return () => {
      cancelled = true;
      socket.off('duel:state', onState);
      game?.destroy(true);
    };
    // la key del componente cambia con cada partida: `you` e `initial` no cambian en su vida
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div ref={container} className="game-canvas" />;
}
