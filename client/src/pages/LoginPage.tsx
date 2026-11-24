import { useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ApiError } from '../api';
import { useAuth } from '../auth';
import { DogLogo } from '../components/DogLogo';

export function LoginPage() {
  const { login, register } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [sending, setSending] = useState(false);

  // solo dejo volver a rutas internas, para que no se pueda usar como redirección abierta
  const back = params.get('volver')?.startsWith('/') ? params.get('volver')! : '/';

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setFieldErrors({});
    setSending(true);
    try {
      await (mode === 'login' ? login(username, password) : register(username, password));
      navigate(back, { replace: true });
    } catch (err) {
      if (err instanceof ApiError && err.details) {
        setFieldErrors(Object.fromEntries(err.details.map((d) => [d.field, d.message])));
      } else {
        setError((err as Error).message);
      }
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="auth-page">
      <form className="card auth-card" onSubmit={onSubmit} noValidate>
        <DogLogo size={70} />
        <h1>{mode === 'login' ? 'Entrar' : 'Crear cuenta'}</h1>

        <label>
          Nombre de jugador
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            maxLength={20}
            required
            autoFocus
          />
          {fieldErrors.username && <small className="error">{fieldErrors.username}</small>}
        </label>

        <label>
          Contraseña
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            required
          />
          {fieldErrors.password && <small className="error">{fieldErrors.password}</small>}
        </label>

        {error && <p className="error">{error}</p>}

        <button className="btn" disabled={sending}>
          {sending ? 'Un momento…' : mode === 'login' ? 'Entrar' : 'Crear cuenta'}
        </button>

        <button
          type="button"
          className="btn-link"
          onClick={() => {
            setMode(mode === 'login' ? 'register' : 'login');
            setError('');
            setFieldErrors({});
          }}
        >
          {mode === 'login' ? '¿No tienes cuenta? Créala aquí' : 'Ya tengo cuenta'}
        </button>
      </form>
    </div>
  );
}
