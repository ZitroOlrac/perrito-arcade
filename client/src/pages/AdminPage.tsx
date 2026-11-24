import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { api, type AdminStats, type SuspiciousSession } from '../api';
import { useAuth } from '../auth';
import { BarChart } from '../components/BarChart';
import { num, REJECT_REASONS, timeAgo } from '../format';

export function AdminPage() {
  const { user, loading } = useAuth();
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [suspicious, setSuspicious] = useState<SuspiciousSession[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    document.title = 'Panel · Perrito Arcade';
    if (user?.role !== 'admin') return;
    Promise.all([api.adminStats(), api.adminSuspicious()])
      .then(([s, sus]) => {
        setStats(s);
        setSuspicious(sus.sessions);
      })
      .catch((e) => setError(e.message));
  }, [user]);

  if (loading) return null;
  if (user?.role !== 'admin') return <Navigate to="/" replace />;
  if (error) return <p className="error">{error}</p>;
  if (!stats) return <p className="muted">Cargando…</p>;

  const rejectRate =
    stats.finished + stats.rejected > 0 ? (stats.rejected / (stats.finished + stats.rejected)) * 100 : 0;

  return (
    <div>
      <div className="page-head">
        <h1>Panel</h1>
      </div>

      <div className="stats">
        <div className="stat">
          <span className="stat-value">{num(stats.users)}</span>
          <span className="stat-label">Jugadores ({stats.newUsersWeek} nuevos esta semana)</span>
        </div>
        <div className="stat">
          <span className="stat-value">{num(stats.finished)}</span>
          <span className="stat-label">Partidas válidas</span>
        </div>
        <div className="stat">
          <span className="stat-value">{rejectRate.toFixed(1)}%</span>
          <span className="stat-label">Rechazadas ({num(stats.rejected)})</span>
        </div>
        <div className="stat">
          <span className="stat-value">{num(stats.abandoned)}</span>
          <span className="stat-label">Abandonadas</span>
        </div>
        <div className="stat">
          <span className="stat-value">{num(stats.duels)}</span>
          <span className="stat-label">Duelos ({num(stats.botDuels)} contra el bot)</span>
        </div>
      </div>

      <div className="admin-grid">
        <section className="card">
          <h3>Partidas por día (últimos 14)</h3>
          <BarChart
            data={stats.playsPerDay.map((d) => ({
              label: new Date(d.day).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }),
              value: d.plays,
            }))}
          />
        </section>

        <section className="card">
          <h3>Motivos de rechazo</h3>
          {stats.rejectReasons.length === 0 ? (
            <p className="muted">Ninguna partida rechazada.</p>
          ) : (
            <ul className="reasons">
              {stats.rejectReasons.map((r) => (
                <li key={r.reason}>
                  <span>{REJECT_REASONS[r.reason] ?? r.reason}</span>
                  <b>{num(r.count)}</b>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="card">
        <h3>Partidas sospechosas</h3>
        {suspicious.length === 0 ? (
          <p className="muted">Nada raro por ahora.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Jugador</th>
                  <th>Motivo</th>
                  <th>Distancia</th>
                  <th>Huesos</th>
                  <th>Duración</th>
                  <th>Cuándo</th>
                </tr>
              </thead>
              <tbody>
                {suspicious.map((s) => (
                  <tr key={s.id}>
                    <td>{s.username}</td>
                    <td>{REJECT_REASONS[s.reject_reason] ?? s.reject_reason}</td>
                    <td>{num(s.distance)} m</td>
                    <td>{num(s.coins)}</td>
                    <td>{(s.duration_ms / 1000).toFixed(1)} s</td>
                    <td>{timeAgo(s.ended_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
