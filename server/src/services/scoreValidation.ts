/**
 * El cliente nunca manda la puntuación final: manda lo que pasó en la partida
 * (distancia, huesos, duración) y el servidor calcula los puntos y comprueba
 * que todo encaja con el tiempo real que ha pasado desde que se abrió la sesión.
 *
 * No es un anti-trampas perfecto (alguien puede mandar datos "creíbles"),
 * pero corta lo típico: editar la petición y poner 999999.
 */

export interface RunReport {
  distance: number;
  coins: number;
  durationMs: number;
}

export interface GameLimits {
  maxPointsPerSec: number;
  maxCoinsPerSec: number;
}

export type ValidationResult = { ok: true; score: number } | { ok: false; reason: RejectReason };

export type RejectReason = 'SESSION_EXPIRED' | 'DURATION_MISMATCH' | 'DISTANCE_TOO_HIGH' | 'TOO_MANY_COINS';

export const COIN_VALUE = 10;

// margen por la latencia de red y porque el reloj del navegador no es exacto
const DURATION_TOLERANCE_MS = 2500;
const DISTANCE_SLACK = 25;
const COIN_SLACK = 2;

export function calculateScore(distance: number, coins: number) {
  return Math.floor(distance) + coins * COIN_VALUE;
}

export function validateRun(
  report: RunReport,
  serverElapsedMs: number,
  limits: GameLimits,
  maxSessionMs: number,
): ValidationResult {
  if (serverElapsedMs > maxSessionMs) {
    return { ok: false, reason: 'SESSION_EXPIRED' };
  }

  // la partida no puede haber durado más que el tiempo que lleva abierta la sesión
  if (report.durationMs > serverElapsedMs + DURATION_TOLERANCE_MS) {
    return { ok: false, reason: 'DURATION_MISMATCH' };
  }

  const seconds = report.durationMs / 1000;

  if (report.distance > limits.maxPointsPerSec * seconds + DISTANCE_SLACK) {
    return { ok: false, reason: 'DISTANCE_TOO_HIGH' };
  }

  if (report.coins > limits.maxCoinsPerSec * seconds + COIN_SLACK) {
    return { ok: false, reason: 'TOO_MANY_COINS' };
  }

  return { ok: true, score: calculateScore(report.distance, report.coins) };
}
