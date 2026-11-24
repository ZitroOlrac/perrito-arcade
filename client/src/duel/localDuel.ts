// Duelo contra Perrobot que corre entero en el navegador, para la demo sin servidor.
// Usa exactamente el mismo motor y el mismo bot que el servidor: el código es compartido.
import { DuelEngine } from '../../../server/src/duel/engine';
import { DuelBot } from '../../../server/src/duel/bot';
import type { DuelSnapshot, HitResult } from './types';

type Listener = (s: DuelSnapshot) => void;

export class LocalDuel {
  private engine = new DuelEngine(Date.now());
  private bot = new DuelBot('b', 0.6);
  private listeners = new Set<Listener>();
  private sentVersion = -1;
  private timer: ReturnType<typeof setInterval>;
  last: DuelSnapshot;

  constructor() {
    this.last = this.engine.snapshot(Date.now());
    // mismo bucle que el servidor: tick cada 50 ms y estado nuevo solo si ha cambiado algo
    this.timer = setInterval(() => this.tick(), 50);
  }

  private tick() {
    const now = Date.now();
    this.bot.act(this.engine, now);
    this.engine.tick(now);
    if (this.engine.version === this.sentVersion) return;
    this.sentVersion = this.engine.version;
    this.last = this.engine.snapshot(now);
    for (const l of this.listeners) l(this.last);
    if (this.engine.phase === 'finished') clearInterval(this.timer);
  }

  subscribe = (fn: Listener) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };

  hit = async (boltId: number): Promise<HitResult> => this.engine.hit('a', boltId, Date.now());

  surrender() {
    this.engine.forfeit('a');
  }

  stop() {
    clearInterval(this.timer);
  }
}
