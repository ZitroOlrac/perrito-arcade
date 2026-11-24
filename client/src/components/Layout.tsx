import { Link, NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../auth';
import { useOnlineCount } from '../realtime';
import { DogLogo } from './DogLogo';
import { BoneIcon } from './BoneIcon';
import { MeWatcher } from './MeWatcher';
import { num } from '../format';

export function Layout() {
  const { user, logout } = useAuth();
  const online = useOnlineCount();

  return (
    <div className="app">
      <MeWatcher />
      <header className="topbar">
        <Link to="/" className="brand">
          <DogLogo size={36} />
          <span>
            Perrito <b>Arcade</b>
          </span>
        </Link>

        <nav className="nav">
          <NavLink to="/" end>
            Juegos
          </NavLink>
          <NavLink to="/duelo">Duelo</NavLink>
          <NavLink to="/ranking/perrito-run">Ranking</NavLink>
          <NavLink to="/tienda">Tienda</NavLink>
          {user?.role === 'admin' && <NavLink to="/admin">Panel</NavLink>}
        </nav>

        <div className="session">
          {online !== null && (
            <span className="online" title="Gente conectada ahora mismo">
              <i /> {online} online
            </span>
          )}
          {user ? (
            <>
              <Link to="/tienda" className="wallet" title="Tus huesos">
                <BoneIcon /> <span className="mono">{num(user.bones)}</span>
              </Link>
              <Link to={`/jugador/${user.username}`} className="me">
                <DogLogo size={26} palette={user.palette} title={user.username} />
                {user.username}
              </Link>
              <button className="btn-link" onClick={logout}>
                Salir
              </button>
            </>
          ) : (
            <Link to="/entrar" className="btn small">
              Entrar
            </Link>
          )}
        </div>
      </header>

      <main className="content">
        <Outlet />
      </main>

      <footer className="footer">
        Perrito Arcade · hecho con React, Phaser, Node y PostgreSQL ·{' '}
        <a href="https://github.com/ZitroOlrac/perrito-arcade" target="_blank" rel="noreferrer">
          código en GitHub
        </a>
      </footer>
    </div>
  );
}
