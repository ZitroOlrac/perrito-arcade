import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Link, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './auth';
import { ToastProvider } from './toasts';
import { ShopPage } from './pages/ShopPage';
import { Layout } from './components/Layout';
import { HomePage } from './pages/HomePage';
import { PlayPage } from './pages/PlayPage';
import { LeaderboardPage } from './pages/LeaderboardPage';
import { ProfilePage } from './pages/ProfilePage';
import { LoginPage } from './pages/LoginPage';
import { AdminPage } from './pages/AdminPage';
import { DuelPage } from './pages/DuelPage';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          <Routes>
            <Route element={<Layout />}>
              <Route index element={<HomePage />} />
              <Route path="jugar/perrito-run" element={<PlayPage />} />
              <Route path="duelo" element={<DuelPage />} />
              <Route path="tienda" element={<ShopPage />} />
              <Route path="ranking/:slug" element={<LeaderboardPage />} />
              <Route path="jugador/:username" element={<ProfilePage />} />
              <Route path="entrar" element={<LoginPage />} />
              <Route path="admin" element={<AdminPage />} />
              <Route
                path="*"
                element={
                  <div className="narrow">
                    <h1>404</h1>
                    <p>
                      Aquí no hay nada. <Link to="/">Volver al inicio</Link>
                    </p>
                  </div>
                }
              />
            </Route>
          </Routes>
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
);
