import type { DuelEngine, Side } from './engine.js';

/**
 * Rival de práctica para cuando no hay nadie en la cola. Juega "como una persona":
 * tarda en reaccionar, a veces se le escapa un tornillo y no machaca los oxidados
 * a velocidad imposible. Si fuese perfecto no tendría gracia.
 */
export class DuelBot {
  // cuándo piensa tocar cada tornillo
  private plans = new Map<number, number>();
  private busyUntil = 0;

  constructor(
    private side: Side,
    private skill = 0.75, // 0..1
    private random: () => number = Math.random,
  ) {}

  act(engine: DuelEngine, now: number) {
    if (engine.phase !== 'playing' || now < this.busyUntil) return;

    for (const bolt of engine.bolts.values()) {
      if (!this.plans.has(bolt.id)) {
        // los que no le dan tiempo o "no ve" los descarta
        if (this.random() > 0.55 + this.skill * 0.4) {
          this.plans.set(bolt.id, Infinity);
          continue;
        }
        const reaction = 380 + (1 - this.skill) * 500 + this.random() * 400;
        this.plans.set(bolt.id, now + reaction);
      }
    }

    // el que antes tenía planeado y ya toca
    let target: { id: number; at: number } | null = null;
    for (const [id, at] of this.plans) {
      if (!engine.bolts.has(id)) {
        this.plans.delete(id);
        continue;
      }
      if (at <= now && (!target || at < target.at)) target = { id, at };
    }
    if (!target) return;

    const result = engine.hit(this.side, target.id, now);
    // entre toque y toque tarda un poco (más en los oxidados, que hay que hacer fuerza)
    this.busyUntil = now + 160 + this.random() * 140;
    if (result.ok && result.claimed) this.plans.delete(target.id);
  }
}
