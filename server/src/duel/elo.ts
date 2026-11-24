// ELO de toda la vida. K = 32 es lo típico para jugadores con pocas partidas.
const K = 32;

export function expectedScore(rating: number, opponent: number) {
  return 1 / (1 + 10 ** ((opponent - rating) / 400));
}

/** result: 1 si gana A, 0 si gana B, 0.5 empate. Devuelve cuánto cambia cada uno. */
export function eloChange(ratingA: number, ratingB: number, result: 1 | 0 | 0.5) {
  const deltaA = Math.round(K * (result - expectedScore(ratingA, ratingB)));
  // lo que gana uno lo pierde el otro, así la media no se infla con el tiempo
  return { a: deltaA, b: -deltaA };
}
