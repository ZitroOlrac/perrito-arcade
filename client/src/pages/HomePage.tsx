import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, type Game } from '../api';
import { DogLogo } from '../components/DogLogo';
import { ActivityFeed } from '../components/ActivityFeed';
import { num } from '../format';

// juegos que aún no están hechos; los dejo visibles como hoja de ruta
const UPCOMING = [{ name: 'Aparca el Coche', text: 'Puzle de físicas: mete los coches en el taller sin rozar nada.' }];

const pathFor = (g: Game) => (g.mode === 'duel' ? '/duelo' : `/jugar/${g.slug}`);

export function HomePage() {
  const [games, setGames] = useState<Game[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    document.title = 'Perrito Arcade';
    api
      .games()
      .then((r) => setGames(r.games))
      .catch((e) => setError(e.message));
  }, []);

  return (
    <div className="home">
      <section className="hero">
        <div>
          <h1>
            Minijuegos rápidos,
            <br />
            <span className="accent">ranking en directo.</span>
          </h1>
          <p className="lead">
            Juega desde el navegador, sin instalar nada. Cada partida se valida en el servidor y el ranking se actualiza
            al momento para todos.
          </p>
          <Link to="/jugar/perrito-run" className="btn big">
            Jugar a Perrito Run
          </Link>
        </div>
        <div className="hero-dog" aria-hidden>
          <DogLogo size={220} />
        </div>
      </section>

      <div className="home-grid">
        <section>
          <h2>Juegos</h2>
          {error && <p className="error">{error}</p>}
          <div className="games">
            {games?.map((g) => (
              <Link key={g.slug} to={pathFor(g)} className="game-card">
                {g.mode === 'duel' ? (
                  <div className="game-thumb duel-thumb">
                    <i className="b-normal" />
                    <i className="b-gold" />
                    <i className="b-rusty" />
                    <span className="vs">1 vs 1</span>
                  </div>
                ) : (
                  <div className="game-thumb run-thumb">
                    <DogLogo size={90} />
                  </div>
                )}
                <div className="game-info">
                  <h3>{g.name}</h3>
                  <p>{g.description}</p>
                  <p className="muted small">
                    {num(g.plays)} {g.mode === 'duel' ? 'duelos' : 'partidas'} · {num(g.players)} jugadores
                    {g.mode === 'duel' && <span className="tag">multijugador</span>}
                  </p>
                </div>
              </Link>
            ))}
            {UPCOMING.map((g) => (
              <div key={g.name} className="game-card soon">
                <div className="game-thumb">?</div>
                <div className="game-info">
                  <h3>
                    {g.name} <span className="tag muted-tag">próximamente</span>
                  </h3>
                  <p>{g.text}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <ActivityFeed />
      </div>
    </div>
  );
}
