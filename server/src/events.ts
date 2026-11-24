import type { LeaderboardEntry } from './services/leaderboard.js';
import type { UnlockedAchievement } from './economy/achievements.js';

export interface UserUpdate {
  bones: number;
  achievements: UnlockedAchievement[];
}

/**
 * Lo que la API necesita avisar en tiempo real. Lo separo de socket.io para
 * poder testear las rutas sin levantar websockets.
 */
export interface GameEvents {
  leaderboardChanged(slug: string, entries: LeaderboardEntry[]): void;
  runFinished(info: { slug: string; username: string; score: number; personalBest: boolean }): void;
  /** solo para el propio jugador: saldo nuevo y logros que acaba de conseguir */
  userUpdate(userId: number, update: UserUpdate): void;
}

export const noopEvents: GameEvents = {
  leaderboardChanged() {},
  runFinished() {},
  userUpdate() {},
};
