import { describe, expect, it } from 'vitest';
import { availableObstacles, gapRange, MAX_SPEED, scoreOf, speedAt, START_SPEED } from '../difficulty';

describe('dificultad', () => {
  it('la velocidad sube con el tiempo pero tiene tope', () => {
    expect(speedAt(0)).toBe(START_SPEED);
    expect(speedAt(10)).toBeGreaterThan(START_SPEED);
    expect(speedAt(10_000)).toBe(MAX_SPEED);
  });

  it('el hueco mínimo siempre deja aterrizar después de un salto completo', () => {
    // salto completo ≈ 0.68 s en el aire; el hueco tiene que ser mayor que lo que avanzas en ese tiempo
    for (let speed = START_SPEED; speed <= MAX_SPEED; speed += 50) {
      const { min, max } = gapRange(speed);
      expect(min).toBeGreaterThan(speed * 0.68);
      expect(max).toBeGreaterThan(min);
    }
  });

  it('los obstáculos difíciles salen más tarde', () => {
    expect(availableObstacles(0)).toEqual(['tire', 'toolbox']);
    expect(availableObstacles(300)).toContain('lamp');
    expect(availableObstacles(300)).not.toContain('double-tire');
    expect(availableObstacles(1000)).toContain('double-tire');
  });

  it('la puntuación coincide con la del servidor', () => {
    // misma fórmula que server/src/services/scoreValidation.ts
    expect(scoreOf(123.9, 4)).toBe(163);
  });
});
