// Cliente de la API. Todo pasa por aquí para tener un solo sitio
// donde se añade el token y se traducen los errores.

export type Palette = Record<string, string>;

export interface User {
  id: number;
  username: string;
  role: 'player' | 'admin';
  createdAt: string;
  bones: number;
  skin: string;
  palette: Palette;
}

export interface Achievement {
  slug: string;
  name: string;
  description: string;
  reward: number;
}

export interface Skin {
  slug: string;
  name: string;
  price: number;
  palette: Palette;
  owned: boolean;
}

export interface WalletTx {
  amount: number;
  reason: 'run' | 'duel' | 'achievement' | 'purchase' | 'backfill';
  ref: string | null;
  at: string;
}

export interface Game {
  slug: string;
  name: string;
  description: string;
  mode: 'solo' | 'duel';
  plays: number;
  players: number;
}

export interface LeaderboardEntry {
  rank: number;
  username: string;
  palette: Palette;
  score: number;
  achievedAt: string;
}

export type FinishResult =
  | {
      status: 'finished';
      score: number;
      personalBest: boolean;
      previousBest: number | null;
      rank: number | null;
      bonesEarned: number;
      bones: number;
      achievements: Achievement[];
    }
  | { status: 'rejected'; reason: string };

export interface Profile {
  username: string;
  memberSince: string;
  skin: string;
  palette: Palette;
  achievements: (Achievement & { unlockedAt: string | null })[];
  games: {
    slug: string;
    name: string;
    plays: number;
    best: number;
    totalCoins: number;
    totalTimeMs: number;
    rank: number | null;
  }[];
  recent: { slug: string; score: number; playedAt: string }[];
  duel: { rating: number; wins: number; losses: number; draws: number; rank: number } | null;
}

export interface DuelRankingEntry {
  rank: number;
  username: string;
  palette: Palette;
  rating: number;
  wins: number;
  losses: number;
  draws: number;
}

export interface RecentDuel {
  id: string;
  a: string;
  b: string;
  scores: { a: number; b: number };
  result: 'a' | 'b' | 'draw';
  reason: 'score' | 'time' | 'forfeit';
  ratingChange: number;
  endedAt: string;
}

export interface AdminStats {
  users: number;
  newUsersWeek: number;
  finished: number;
  rejected: number;
  abandoned: number;
  duels: number;
  botDuels: number;
  playsPerDay: { day: string; plays: number }[];
  rejectReasons: { reason: string; count: number }[];
}

export interface SuspiciousSession {
  id: string;
  username: string;
  game_slug: string;
  distance: number;
  coins: number;
  duration_ms: number;
  reject_reason: string;
  ended_at: string;
}

export class ApiError extends Error {
  status: number;
  code?: string;
  details?: { field: string; message: string }[];

  constructor(status: number, message: string, code?: string, details?: { field: string; message: string }[]) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

const TOKEN_KEY = 'pa:token';
export const tokenStore = {
  get: () => localStorage.getItem(TOKEN_KEY),
  set: (t: string) => localStorage.setItem(TOKEN_KEY, t),
  clear: () => localStorage.removeItem(TOKEN_KEY),
};

async function request<T>(path: string, options: { method?: string; body?: unknown } = {}): Promise<T> {
  const headers: Record<string, string> = {};
  const token = tokenStore.get();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';

  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method: options.method ?? 'GET',
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'No hay conexión con el servidor');
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(res.status, data.error ?? `Error ${res.status}`, data.code, data.details);
  }
  return data as T;
}

export const api = {
  register: (username: string, password: string) =>
    request<{ token: string; user: User }>('/auth/register', { method: 'POST', body: { username, password } }),
  login: (username: string, password: string) =>
    request<{ token: string; user: User }>('/auth/login', { method: 'POST', body: { username, password } }),
  me: () => request<{ user: User }>('/auth/me'),

  games: () => request<{ games: Game[] }>('/games'),
  leaderboard: (slug: string, period: 'all' | 'week' = 'all', limit = 10) =>
    request<{ entries: LeaderboardEntry[] }>(`/games/${slug}/leaderboard?period=${period}&limit=${limit}`),

  startSession: (slug: string) =>
    request<{ sessionId: string; startedAt: string }>(`/games/${slug}/sessions`, { method: 'POST' }),
  finishSession: (id: string, run: { distance: number; coins: number; durationMs: number }) =>
    request<FinishResult>(`/sessions/${id}/finish`, { method: 'POST', body: run }),

  profile: (username: string) => request<Profile>(`/users/${encodeURIComponent(username)}`),

  duelLeaderboard: () => request<{ entries: DuelRankingEntry[] }>('/duels/leaderboard'),
  recentDuels: () => request<{ duels: RecentDuel[] }>('/duels/recent'),

  shop: () => request<{ skins: Skin[]; me: { bones: number; equipped: string } | null }>('/shop'),
  buySkin: (slug: string) =>
    request<{ bones: number; equipped: string; achievements: Achievement[] }>(`/shop/${slug}/buy`, { method: 'POST' }),
  equipSkin: (slug: string) =>
    request<{ equipped: string; palette: Palette }>(`/shop/${slug}/equip`, { method: 'POST' }),
  wallet: () => request<{ bones: number; transactions: WalletTx[] }>('/me/wallet'),

  adminStats: () => request<AdminStats>('/admin/stats'),
  adminSuspicious: () => request<{ sessions: SuspiciousSession[] }>('/admin/suspicious'),
};
