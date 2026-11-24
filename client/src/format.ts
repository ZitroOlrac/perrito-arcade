const nf = new Intl.NumberFormat('es-ES');
export const num = (n: number) => nf.format(n);

const rtf = new Intl.RelativeTimeFormat('es', { numeric: 'auto' });

export function timeAgo(iso: string) {
  const seconds = (new Date(iso).getTime() - Date.now()) / 1000;
  const abs = Math.abs(seconds);
  if (abs < 45) return 'ahora mismo';
  if (abs < 3600) return rtf.format(Math.round(seconds / 60), 'minute');
  if (abs < 86400) return rtf.format(Math.round(seconds / 3600), 'hour');
  return rtf.format(Math.round(seconds / 86400), 'day');
}

export function duration(ms: number) {
  const total = Math.round(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h) return `${h} h ${m} min`;
  if (m) return `${m} min ${s} s`;
  return `${s} s`;
}

export function date(iso: string) {
  return new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });
}

export const REJECT_REASONS: Record<string, string> = {
  DISTANCE_TOO_HIGH: 'Distancia imposible',
  TOO_MANY_COINS: 'Demasiados huesos',
  DURATION_MISMATCH: 'Duración falsa',
  SESSION_EXPIRED: 'Sesión caducada',
  ABANDONED: 'Abandonada',
};
