import { useEffect, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { tokenStore, type LeaderboardEntry } from './api';

export interface Activity {
  slug: string;
  username: string;
  score: number;
  personalBest: boolean;
  at: string;
  // solo en los duelos
  opponent?: string;
  opponentScore?: number;
}

// una sola conexión para toda la app
let socket: Socket | null = null;

export function getSocket() {
  if (!socket) {
    socket = io({ auth: (cb) => cb({ token: tokenStore.get() }) });
  }
  return socket;
}

export function useOnlineCount() {
  const [online, setOnline] = useState<number | null>(null);
  useEffect(() => {
    const s = getSocket();
    const onPresence = (p: { online: number }) => setOnline(p.online);
    s.on('presence', onPresence);
    return () => {
      s.off('presence', onPresence);
    };
  }, []);
  return online;
}

/** Top 10 de un juego que se actualiza solo cuando alguien entra en él. */
export function useLiveLeaderboard(slug: string, enabled = true) {
  const [entries, setEntries] = useState<LeaderboardEntry[] | null>(null);
  // la primera actualización es la carga inicial; a partir de la segunda son cambios en directo
  const [updates, setUpdates] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    const s = getSocket();
    const onUpdate = (p: { slug: string; entries: LeaderboardEntry[] }) => {
      if (p.slug !== slug) return;
      setEntries(p.entries);
      setUpdates((n) => n + 1);
    };
    const join = () => s.emit('leaderboard:join', slug);

    s.on('leaderboard:update', onUpdate);
    // si se cae la conexión y vuelve, hay que volver a unirse a la sala
    s.on('connect', join);
    if (s.connected) join();

    return () => {
      s.emit('leaderboard:leave', slug);
      s.off('leaderboard:update', onUpdate);
      s.off('connect', join);
    };
  }, [slug, enabled]);

  return { entries, isLive: updates > 1 };
}

export function useActivityFeed(max = 8) {
  const [items, setItems] = useState<Activity[]>([]);
  useEffect(() => {
    const s = getSocket();
    const onActivity = (a: Activity) => setItems((prev) => [a, ...prev].slice(0, max));
    s.on('activity', onActivity);
    return () => {
      s.off('activity', onActivity);
    };
  }, [max]);
  return items;
}

/** Cuando cambia el usuario hay que reconectar para que el servidor sepa quién es. */
export function reconnectSocket() {
  if (!socket) return;
  socket.disconnect().connect();
}
