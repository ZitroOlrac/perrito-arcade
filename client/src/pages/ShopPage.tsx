import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError, type Skin, type WalletTx } from '../api';
import { useAuth } from '../auth';
import { useToast } from '../toasts';
import { DogLogo } from '../components/DogLogo';
import { BoneIcon } from '../components/BoneIcon';
import { num, timeAgo } from '../format';

const REASONS: Record<WalletTx['reason'], string> = {
  run: 'Perrito Run',
  duel: 'Duelo ganado',
  achievement: 'Logro',
  purchase: 'Compra',
  backfill: 'Partidas anteriores',
};

export function ShopPage() {
  const { user, patchUser } = useAuth();
  const toast = useToast();
  const [skins, setSkins] = useState<Skin[] | null>(null);
  const [equipped, setEquipped] = useState<string | null>(null);
  const [wallet, setWallet] = useState<WalletTx[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);

  useEffect(() => {
    document.title = 'Tienda · Perrito Arcade';
    api
      .shop()
      .then((r) => {
        setSkins(r.skins);
        setEquipped(r.me?.equipped ?? null);
      })
      .catch((e) => setError(e.message));
    if (user)
      api
        .wallet()
        .then((w) => setWallet(w.transactions))
        .catch(() => {});
    // el saldo cambia cuando juegas en otra pestaña; recargo el historial si cambia
  }, [user?.username, user?.bones, reload]); // eslint-disable-line react-hooks/exhaustive-deps

  async function buy(skin: Skin) {
    setBusy(skin.slug);
    setError('');
    try {
      const r = await api.buySkin(skin.slug);
      patchUser({ bones: r.bones, skin: skin.slug, palette: skin.palette });
      toast({ title: `¡Skin ${skin.name}!`, body: 'Ya la llevas puesta en Perrito Run', icon: '🐶' });
      setReload((n) => n + 1);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo comprar');
    } finally {
      setBusy(null);
    }
  }

  async function equip(skin: Skin) {
    setBusy(skin.slug);
    try {
      const r = await api.equipSkin(skin.slug);
      patchUser({ skin: r.equipped, palette: r.palette });
      setEquipped(r.equipped);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Tienda</h1>
          <p className="muted">
            Los huesos que recoges en Perrito Run, los duelos que ganas y los logros se cambian aquí por skins para tu
            perrito.
          </p>
        </div>
        {user && (
          <div className="balance">
            <BoneIcon size={28} />
            <span className="mono">{num(user.bones)}</span>
          </div>
        )}
      </div>

      {!user && (
        <p className="notice">
          <Link to="/entrar?volver=/tienda">Entra</Link> para comprar skins con tus huesos.
        </p>
      )}
      {error && <p className="notice error-notice">{error}</p>}

      <div className="skins">
        {skins?.map((skin) => {
          const isEquipped = user && (equipped ?? user.skin) === skin.slug;
          const affordable = (user?.bones ?? 0) >= skin.price;
          return (
            <div key={skin.slug} className={`skin-card ${isEquipped ? 'equipped' : ''}`}>
              <div className="skin-preview">
                <DogLogo size={120} palette={skin.palette} title={skin.name} />
              </div>
              <h3>{skin.name}</h3>
              {skin.owned ? (
                <p className="muted small">{skin.price === 0 ? 'Gratis' : 'Es tuya'}</p>
              ) : (
                <p className="price">
                  <BoneIcon size={16} /> {num(skin.price)}
                </p>
              )}
              {user &&
                (isEquipped ? (
                  <span className="tag">Puesta</span>
                ) : skin.owned ? (
                  <button className="btn secondary small" disabled={busy === skin.slug} onClick={() => equip(skin)}>
                    Ponérsela
                  </button>
                ) : (
                  <button
                    className="btn small"
                    disabled={!affordable || busy === skin.slug}
                    title={affordable ? undefined : `Te faltan ${skin.price - (user?.bones ?? 0)} huesos`}
                    onClick={() => buy(skin)}
                  >
                    {affordable ? 'Comprar' : `Faltan ${num(skin.price - user.bones)}`}
                  </button>
                ))}
            </div>
          );
        })}
      </div>

      {user && wallet.length > 0 && (
        <section className="card wallet-history">
          <h3>Movimientos</h3>
          <ul className="recent">
            {wallet.map((t, i) => (
              <li key={i}>
                <span>{REASONS[t.reason]}</span>
                <span className="muted">{timeAgo(t.at)}</span>
                <b className={t.amount > 0 ? 'delta up' : 'delta down'}>
                  {t.amount > 0 ? '+' : ''}
                  {num(t.amount)}
                </b>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
