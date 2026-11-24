import { describe, expect, it } from 'vitest';
import { calculateScore, validateRun } from '../src/services/scoreValidation.js';

const limits = { maxPointsPerSec: 40, maxCoinsPerSec: 3 };
const HALF_HOUR = 30 * 60 * 1000;

describe('validateRun', () => {
  it('acepta una partida normal y calcula los puntos', () => {
    const result = validateRun({ distance: 600, coins: 12, durationMs: 30_000 }, 30_500, limits, HALF_HOUR);
    expect(result).toEqual({ ok: true, score: 720 });
  });

  it('rechaza si dice que ha jugado más tiempo del que ha pasado', () => {
    const result = validateRun({ distance: 100, coins: 0, durationMs: 60_000 }, 10_000, limits, HALF_HOUR);
    expect(result).toEqual({ ok: false, reason: 'DURATION_MISMATCH' });
  });

  it('deja pasar un pequeño desfase por la latencia', () => {
    const result = validateRun({ distance: 100, coins: 0, durationMs: 12_000 }, 10_000, limits, HALF_HOUR);
    expect(result.ok).toBe(true);
  });

  it('rechaza distancias imposibles para el tiempo jugado', () => {
    const result = validateRun({ distance: 99_999, coins: 0, durationMs: 10_000 }, 10_000, limits, HALF_HOUR);
    expect(result).toEqual({ ok: false, reason: 'DISTANCE_TOO_HIGH' });
  });

  it('rechaza demasiados huesos', () => {
    const result = validateRun({ distance: 100, coins: 500, durationMs: 10_000 }, 10_000, limits, HALF_HOUR);
    expect(result).toEqual({ ok: false, reason: 'TOO_MANY_COINS' });
  });

  it('rechaza sesiones que llevan demasiado tiempo abiertas', () => {
    const result = validateRun({ distance: 10, coins: 0, durationMs: 1000 }, HALF_HOUR + 1, limits, HALF_HOUR);
    expect(result).toEqual({ ok: false, reason: 'SESSION_EXPIRED' });
  });

  it('una partida de 0 segundos con 0 puntos es válida (morir nada más empezar)', () => {
    expect(validateRun({ distance: 0, coins: 0, durationMs: 0 }, 200, limits, HALF_HOUR).ok).toBe(true);
  });
});

describe('calculateScore', () => {
  it('cada hueso vale 10 y la distancia se redondea hacia abajo', () => {
    expect(calculateScore(123.9, 4)).toBe(163);
  });
});
