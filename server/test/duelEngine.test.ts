import { describe, expect, it } from 'vitest';
import { boltDistance, DuelEngine, RULES } from '../src/duel/engine.js';
import { DuelBot } from '../src/duel/bot.js';
import { eloChange, expectedScore } from '../src/duel/elo.js';

// generador pseudoaleatorio con semilla para que los tests den siempre lo mismo
function seeded(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}

function startedEngine(seed = 1) {
  const engine = new DuelEngine(0, seeded(seed));
  engine.tick(RULES.countdownMs); // fin de la cuenta atrás: sale el primer tornillo
  return engine;
}

const firstBolt = (e: DuelEngine) => [...e.bolts.values()][0];

describe('DuelEngine', () => {
  it('empieza con cuenta atrás y no deja tocar nada', () => {
    const engine = new DuelEngine(0, seeded(1));
    expect(engine.phase).toBe('countdown');
    expect(engine.hit('a', 1, 500)).toEqual({ ok: false, reason: 'NOT_PLAYING' });
  });

  it('al acabar la cuenta atrás empieza y sale un tornillo', () => {
    const engine = startedEngine();
    expect(engine.phase).toBe('playing');
    expect(engine.bolts.size).toBe(1);
  });

  it('nunca hay más tornillos de la cuenta y no se pisan', () => {
    const engine = startedEngine(7);
    for (let t = RULES.countdownMs; t < RULES.countdownMs + 20_000; t += 50) {
      engine.tick(t);
      const bolts = [...engine.bolts.values()];
      expect(bolts.length).toBeLessThanOrEqual(RULES.maxBolts);
      for (const a of bolts)
        for (const b of bolts) if (a !== b) expect(boltDistance(a, b)).toBeGreaterThanOrEqual(RULES.minDistance);
    }
  });

  it('un toque en un tornillo normal da 1 punto y lo quita del tablero', () => {
    const engine = startedEngine();
    const bolt = firstBolt(engine);
    bolt.kind = 'normal';
    bolt.needed = 1;

    const res = engine.hit('a', bolt.id, RULES.countdownMs + 300);
    expect(res).toEqual({ ok: true, claimed: true, turns: 1, points: 1 });
    expect(engine.scores).toEqual({ a: 1, b: 0 });
    expect(engine.bolts.has(bolt.id)).toBe(false);
    expect(engine.snapshot(0).events).toEqual([{ type: 'claim', boltId: bolt.id, by: 'a', points: 1 }]);
  });

  it('si los dos tocan el mismo tornillo, se lo lleva el primero que llega al servidor', () => {
    const engine = startedEngine();
    const bolt = firstBolt(engine);
    bolt.kind = 'normal';
    bolt.needed = 1;

    expect(engine.hit('b', bolt.id, RULES.countdownMs + 300)).toMatchObject({ ok: true, claimed: true });
    expect(engine.hit('a', bolt.id, RULES.countdownMs + 301)).toEqual({ ok: false, reason: 'NO_BOLT' });
  });

  it('el oxidado necesita 3 toques y cada jugador lleva su cuenta', () => {
    const engine = startedEngine();
    const bolt = firstBolt(engine);
    bolt.kind = 'rusty';
    bolt.needed = 3;
    const t = RULES.countdownMs + 300;

    engine.hit('a', bolt.id, t);
    engine.hit('a', bolt.id, t + 100);
    engine.hit('b', bolt.id, t + 150);
    expect(bolt.turns).toEqual({ a: 2, b: 1 });

    expect(engine.hit('a', bolt.id, t + 200)).toEqual({ ok: true, claimed: true, turns: 3, points: 2 });
    expect(engine.scores.a).toBe(2);
  });

  it('rechaza toques imposibles de rápidos', () => {
    const engine = startedEngine();
    const bolt = firstBolt(engine);
    expect(engine.hit('a', bolt.id, RULES.countdownMs + 20)).toEqual({ ok: false, reason: 'TOO_FAST' });
  });

  it('limita los toques por segundo (autoclickers)', () => {
    const engine = startedEngine();
    const t = RULES.countdownMs + 500;
    for (let i = 0; i < RULES.maxHitsPerSecond; i++) engine.hit('a', 9999, t + i);
    expect(engine.hit('a', 9999, t + 20)).toEqual({ ok: false, reason: 'RATE_LIMIT' });
    // el rival no se ve afectado
    expect(engine.hit('b', 9999, t + 20)).toEqual({ ok: false, reason: 'NO_BOLT' });
  });

  it('los tornillos caducan', () => {
    const engine = startedEngine();
    const bolt = firstBolt(engine);
    engine.tick(bolt.expiresAt);
    expect(engine.bolts.has(bolt.id)).toBe(false);
    expect(engine.snapshot(0).events).toContainEqual({ type: 'expire', boltId: bolt.id });
  });

  it('gana el primero que llega a la puntuación objetivo', () => {
    const engine = startedEngine();
    engine.scores.a = RULES.targetScore - 1;
    const bolt = firstBolt(engine);
    bolt.needed = 1;
    bolt.kind = 'normal';
    engine.hit('a', bolt.id, RULES.countdownMs + 300);

    expect(engine.phase).toBe('finished');
    expect(engine.result).toEqual({ winner: 'a', reason: 'score', scores: { a: RULES.targetScore, b: 0 } });
  });

  it('si se acaba el tiempo gana el que va por delante, o empate', () => {
    const e1 = startedEngine();
    e1.scores = { a: 4, b: 6 };
    e1.tick(e1.endsAt);
    expect(e1.result).toMatchObject({ winner: 'b', reason: 'time' });

    const e2 = startedEngine();
    e2.scores = { a: 5, b: 5 };
    e2.tick(e2.endsAt);
    expect(e2.result?.winner).toBe('draw');
  });

  it('abandonar da la victoria al otro', () => {
    const engine = startedEngine();
    engine.forfeit('a');
    expect(engine.result).toMatchObject({ winner: 'b', reason: 'forfeit' });
  });
});

describe('DuelBot', () => {
  it('juega una partida entera sin romper las reglas y suma puntos', () => {
    const engine = new DuelEngine(0, seeded(3));
    const bot = new DuelBot('b', 0.75, seeded(9));
    for (let t = 0; t <= engine.endsAt && engine.phase !== 'finished'; t += 50) {
      engine.tick(t);
      bot.act(engine, t);
    }
    expect(engine.phase).toBe('finished');
    expect(engine.scores.b).toBeGreaterThan(5);
    expect(engine.scores.a).toBe(0);
  });
});

describe('ELO', () => {
  it('entre iguales, ganar da 16 puntos', () => {
    expect(expectedScore(1000, 1000)).toBe(0.5);
    expect(eloChange(1000, 1000, 1)).toEqual({ a: 16, b: -16 });
  });

  it('ganar al favorito da más que ganar al flojo', () => {
    expect(eloChange(1000, 1400, 1).a).toBeGreaterThan(eloChange(1400, 1000, 1).a);
  });

  it('un empate contra alguien mejor sube un poco', () => {
    const { a, b } = eloChange(1000, 1200, 0.5);
    expect(a).toBeGreaterThan(0);
    expect(a + b).toBe(0);
  });
});
