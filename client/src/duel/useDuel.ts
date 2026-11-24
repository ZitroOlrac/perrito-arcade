import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { getSocket } from '../realtime';
import type { DuelSnapshot, EndPayload, HitResult, MatchInfo } from './types';

/**
 * Todo el estado del duelo en el cliente. La página solo pinta lo que hay aquí
 * y llama a las acciones; los sockets se quedan dentro.
 */

export type DuelStatus = 'idle' | 'queue' | 'room' | 'match';

export interface DuelState {
  status: DuelStatus;
  roomCode: string | null;
  queuedAt: number | null;
  match: MatchInfo | null;
  snapshot: DuelSnapshot | null;
  end: EndPayload | null;
  opponent: 'here' | 'away' | 'left';
  opponentAwaySince: number | null;
  rematchOffered: boolean; // el rival la ha pedido
  rematchSent: boolean; // yo la he pedido
  error: string | null;
}

type Action =
  | { type: 'queued'; mode: 'queue' | 'room'; code?: string }
  | { type: 'match'; info: MatchInfo }
  | { type: 'state'; snapshot: DuelSnapshot }
  | { type: 'end'; payload: EndPayload }
  | { type: 'opponent'; status: 'away' | 'back' | 'left' }
  | { type: 'rematch-offered' }
  | { type: 'rematch-sent' }
  | { type: 'idle' }
  | { type: 'error'; message: string | null };

const initial: DuelState = {
  status: 'idle',
  roomCode: null,
  queuedAt: null,
  match: null,
  snapshot: null,
  end: null,
  opponent: 'here',
  opponentAwaySince: null,
  rematchOffered: false,
  rematchSent: false,
  error: null,
};

function reducer(state: DuelState, action: Action): DuelState {
  switch (action.type) {
    case 'queued':
      return {
        ...initial,
        status: action.mode,
        roomCode: action.code ?? null,
        queuedAt: state.status === action.mode ? state.queuedAt : Date.now(),
      };
    case 'match':
      // una partida nueva (o la misma tras reconectar)
      return state.match?.matchId === action.info.matchId
        ? { ...state, status: 'match', match: action.info }
        : { ...initial, status: 'match', match: action.info };
    case 'state':
      return { ...state, snapshot: action.snapshot };
    case 'end':
      return { ...state, end: action.payload };
    case 'opponent':
      if (action.status === 'away') return { ...state, opponent: 'away', opponentAwaySince: Date.now() };
      if (action.status === 'back') return { ...state, opponent: 'here', opponentAwaySince: null };
      return { ...state, opponent: 'left', rematchOffered: false };
    case 'rematch-offered':
      return { ...state, rematchOffered: true };
    case 'rematch-sent':
      return { ...state, rematchSent: true };
    case 'idle':
      return { ...initial };
    case 'error':
      return { ...state, error: action.message };
  }
}

type AckResponse = { ok?: boolean; error?: string; code?: string };

function emitWithAck<T = AckResponse>(event: string, ...args: unknown[]): Promise<T> {
  const socket = getSocket();
  return new Promise((resolve, reject) => {
    if (!socket.connected) return reject(new Error('Sin conexión con el servidor'));
    socket.timeout(5000).emit(event, ...args, (err: Error | null, res: T) => (err ? reject(err) : resolve(res)));
  });
}

/**
 * Diferencia entre el reloj del servidor y el nuestro. Las horas de la partida
 * (cuándo empieza, cuándo caduca un tornillo) vienen en hora del servidor.
 * Se mide como en NTP: me quedo con la muestra de menor ida y vuelta.
 */
export function useServerClock() {
  const [clock, setClock] = useState({ offset: 0, rtt: null as number | null });

  useEffect(() => {
    const socket = getSocket();
    let cancelled = false;

    const measure = async () => {
      let best: { offset: number; rtt: number } | null = null;
      for (let i = 0; i < 4; i++) {
        const t0 = Date.now();
        try {
          const { serverNow } = await emitWithAck<{ serverNow: number }>('duel:ping');
          const t1 = Date.now();
          const rtt = t1 - t0;
          if (!best || rtt < best.rtt) best = { rtt, offset: serverNow - (t0 + rtt / 2) };
        } catch {
          return;
        }
      }
      if (!cancelled && best) setClock(best);
    };

    if (socket.connected) void measure();
    socket.on('connect', measure);
    const interval = setInterval(measure, 10_000);
    return () => {
      cancelled = true;
      socket.off('connect', measure);
      clearInterval(interval);
    };
  }, []);

  return clock;
}

export function useDuel(enabled: boolean) {
  const [state, dispatch] = useReducer(reducer, initial);
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  });

  useEffect(() => {
    if (!enabled) return;
    const socket = getSocket();

    const on: Record<string, (data: any) => void> = {
      'duel:queued': (d) => dispatch({ type: 'queued', mode: d.mode, code: d.code }),
      'duel:match': (info) => dispatch({ type: 'match', info }),
      'duel:state': (snapshot) => dispatch({ type: 'state', snapshot }),
      'duel:end': (payload) => dispatch({ type: 'end', payload }),
      'duel:opponent': (d) => dispatch({ type: 'opponent', status: d.status }),
      'duel:rematch-request': () => dispatch({ type: 'rematch-offered' }),
    };
    for (const [event, fn] of Object.entries(on)) socket.on(event, fn);

    // por si ya estaba en cola o en partida (recarga, otra pestaña, conexión anterior)
    const sync = () =>
      emitWithAck<{ status: DuelStatus; code?: string }>('duel:sync')
        .then((r) => {
          if (r.status === 'queue' || r.status === 'room') dispatch({ type: 'queued', mode: r.status, code: r.code });
        })
        .catch(() => {});
    if (socket.connected) sync();
    socket.on('connect', sync);

    return () => {
      for (const [event, fn] of Object.entries(on)) socket.off(event, fn);
      socket.off('connect', sync);
    };
  }, [enabled]);

  const run = useCallback(async (event: string, ...args: unknown[]) => {
    dispatch({ type: 'error', message: null });
    try {
      const res = await emitWithAck(event, ...args);
      if (res.error) dispatch({ type: 'error', message: res.error });
      return res;
    } catch (err) {
      dispatch({ type: 'error', message: (err as Error).message });
      return { error: (err as Error).message };
    }
  }, []);

  // un solo objeto estable: si se crea en cada render, cualquier efecto que dependa
  // de él se vuelve a ejecutar en bucle (me pasó con el enlace de invitación)
  const actions = useMemo(
    () => ({
      queue: () => run('duel:queue'),
      playBot: () => run('duel:bot'),
      createRoom: () => run('duel:room:create'),
      joinRoom: (code: string) => run('duel:room:join', code),
      cancel: async () => {
        await run('duel:cancel');
        dispatch({ type: 'idle' });
      },
      leave: async () => {
        await run('duel:leave');
        dispatch({ type: 'idle' });
      },
      // rendirse: la partida acaba pero me quedo para ver el resultado
      surrender: () => run('duel:leave'),
      rematch: async () => {
        const res = await run('duel:rematch');
        if (res.ok) dispatch({ type: 'rematch-sent' });
      },
      hit: (boltId: number) => emitWithAck<HitResult>('duel:hit', { boltId }),
      clearError: () => dispatch({ type: 'error', message: null }),
    }),
    [run],
  );

  return { state, stateRef, actions };
}
