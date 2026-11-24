// Ajustes de dificultad separados de la escena para poder probarlos y tocarlos sin miedo.

export const START_SPEED = 300; // px/s
export const MAX_SPEED = 750;
export const ACCELERATION = 7; // px/s que se ganan por cada segundo jugado
export const PX_PER_METER = 30;

export function speedAt(seconds: number) {
  return Math.min(MAX_SPEED, START_SPEED + ACCELERATION * seconds);
}

/**
 * Hueco entre obstáculos. Crece con la velocidad porque a más velocidad
 * el salto recorre más distancia y hace falta más sitio para aterrizar.
 */
export function gapRange(speed: number) {
  const min = speed * 0.7 + 140;
  return { min, max: min + 320 - (speed - START_SPEED) * 0.25 };
}

export type ObstacleKind = 'tire' | 'toolbox' | 'cone' | 'double-tire' | 'lamp';

/** Qué obstáculos pueden salir según la distancia recorrida (en metros). */
export function availableObstacles(meters: number): ObstacleKind[] {
  const kinds: ObstacleKind[] = ['tire', 'toolbox'];
  if (meters > 120) kinds.push('cone');
  if (meters > 250) kinds.push('lamp');
  if (meters > 400) kinds.push('double-tire');
  return kinds;
}

export function scoreOf(meters: number, bones: number) {
  return Math.floor(meters) + bones * 10;
}
