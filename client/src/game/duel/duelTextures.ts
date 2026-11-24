import Phaser from 'phaser';

export const BOLT_SIZE = 72;

function canvas(scene: Phaser.Scene, key: string, w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void) {
  if (scene.textures.exists(key)) return;
  const tex = scene.textures.createCanvas(key, w, h)!;
  draw(tex.getContext());
  tex.refresh();
}

function hexagon(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number) {
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 3) * i + Math.PI / 6;
    const x = cx + Math.cos(a) * r;
    const y = cy + Math.sin(a) * r;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

/** Cabeza de tornillo hexagonal vista desde arriba, con su arandela. */
function bolt(
  ctx: CanvasRenderingContext2D,
  colors: { washer: string; light: string; mid: string; dark: string; slot: string },
  extra?: (ctx: CanvasRenderingContext2D, c: number) => void,
) {
  const c = BOLT_SIZE / 2;
  // sombra
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath();
  ctx.arc(c + 3, c + 4, c - 4, 0, Math.PI * 2);
  ctx.fill();
  // arandela
  ctx.fillStyle = colors.washer;
  ctx.beginPath();
  ctx.arc(c, c, c - 5, 0, Math.PI * 2);
  ctx.fill();
  // cabeza: degradado para que parezca metal
  const g = ctx.createLinearGradient(c - 24, c - 24, c + 24, c + 24);
  g.addColorStop(0, colors.light);
  g.addColorStop(0.5, colors.mid);
  g.addColorStop(1, colors.dark);
  ctx.fillStyle = g;
  hexagon(ctx, c, c, 25);
  ctx.fill();
  ctx.strokeStyle = colors.dark;
  ctx.lineWidth = 2;
  ctx.stroke();
  // biseles de la cara superior
  ctx.strokeStyle = 'rgba(255,255,255,0.25)';
  ctx.lineWidth = 1;
  hexagon(ctx, c, c, 18);
  ctx.stroke();
  // ranura en cruz
  ctx.fillStyle = colors.slot;
  ctx.fillRect(c - 10, c - 2, 20, 4);
  ctx.fillRect(c - 2, c - 10, 4, 20);
  extra?.(ctx, c);
}

export function createDuelTextures(scene: Phaser.Scene) {
  canvas(scene, 'bolt-normal', BOLT_SIZE, BOLT_SIZE, (ctx) =>
    bolt(ctx, { washer: '#8d949c', light: '#eef1f4', mid: '#b9c0c7', dark: '#6b737b', slot: '#4a5158' }),
  );

  canvas(scene, 'bolt-rusty', BOLT_SIZE, BOLT_SIZE, (ctx) =>
    bolt(ctx, { washer: '#6e4a2f', light: '#c98a52', mid: '#9a5b2e', dark: '#5a3418', slot: '#3b220f' }, (ctx, c) => {
      // manchas de óxido
      const spots = [
        [-12, -8, 4],
        [9, 11, 5],
        [14, -6, 3],
        [-7, 13, 3],
        [3, -15, 2],
      ];
      ctx.fillStyle = '#d4682a';
      for (const [x, y, r] of spots) {
        ctx.beginPath();
        ctx.arc(c + x, c + y, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }),
  );

  canvas(scene, 'bolt-gold', BOLT_SIZE, BOLT_SIZE, (ctx) =>
    bolt(ctx, { washer: '#b08a1e', light: '#fff4b8', mid: '#f2c230', dark: '#a37c10', slot: '#7a5a05' }, (ctx, c) => {
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      ctx.fillRect(c - 14, c - 16, 6, 3);
      ctx.fillRect(c - 16, c - 14, 3, 6);
    }),
  );

  // chapa lagrimada de suelo de taller
  canvas(scene, 'plate', 64, 64, (ctx) => {
    ctx.fillStyle = '#3b4148';
    ctx.fillRect(0, 0, 64, 64);
    const drop = (x: number, y: number, angle: number) => {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(angle);
      ctx.fillStyle = '#4b525a';
      ctx.fillRect(-9, -2, 18, 4);
      ctx.fillStyle = '#2f343a';
      ctx.fillRect(-9, 2, 18, 1);
      ctx.restore();
    };
    drop(16, 16, Math.PI / 4);
    drop(48, 16, -Math.PI / 4);
    drop(16, 48, -Math.PI / 4);
    drop(48, 48, Math.PI / 4);
  });

  canvas(scene, 'rivet', 14, 14, (ctx) => {
    const g = ctx.createRadialGradient(5, 5, 1, 7, 7, 7);
    g.addColorStop(0, '#d5dade');
    g.addColorStop(1, '#5f666d');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(7, 7, 6, 0, Math.PI * 2);
    ctx.fill();
  });

  // llave fija que sigue al ratón
  canvas(scene, 'wrench', 90, 30, (ctx) => {
    ctx.fillStyle = '#c3c9cf';
    ctx.fillRect(22, 11, 60, 8);
    ctx.beginPath();
    ctx.arc(16, 15, 14, 0, Math.PI * 2);
    ctx.fill();
    ctx.clearRect(8, 9, 12, 12);
    ctx.fillStyle = '#d63a2f';
    ctx.fillRect(52, 10, 34, 10);
    ctx.fillStyle = '#8f969c';
    ctx.fillRect(22, 18, 30, 1);
  });

  canvas(scene, 'spark', 4, 4, (ctx) => {
    ctx.fillStyle = '#ffe27a';
    ctx.fillRect(0, 0, 4, 4);
  });
}
