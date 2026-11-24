import { useEffect } from 'react';
import { useAuth } from '../auth';
import { getSocket } from '../realtime';
import { useToast } from '../toasts';
import type { Achievement } from '../api';

/**
 * Escucha los avisos personales del servidor (saldo nuevo, logros) y los aplica
 * en cualquier página. Llegan a todas las pestañas abiertas del jugador.
 */
export function MeWatcher() {
  const { user, patchUser } = useAuth();
  const toast = useToast();

  useEffect(() => {
    if (!user) return;
    const socket = getSocket();
    const onUpdate = (u: { bones: number; achievements: Achievement[] }) => {
      patchUser({ bones: u.bones });
      for (const a of u.achievements) {
        toast({
          title: `Logro: ${a.name}`,
          body: a.reward ? `${a.description} · +${a.reward} huesos` : a.description,
          icon: '🏆',
        });
      }
    };
    socket.on('me:update', onUpdate);
    return () => {
      socket.off('me:update', onUpdate);
    };
  }, [user, patchUser, toast]);

  return null;
}
