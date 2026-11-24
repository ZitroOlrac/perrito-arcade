/**
 * Sprites dibujados a mano en texto: cada carácter es un píxel.
 * Así no dependo de ficheros de imagen y es fácil retocar al perrito.
 * '.' = transparente
 */

export const PALETTE: Record<string, string> = {
  B: '#c47f3e', // pelo
  D: '#7d4a1f', // sombra / orejas
  L: '#e3a867', // brillo
  K: '#1c1a19', // ojo y nariz
  W: '#f4ede1', // barriga
  P: '#e8687a', // lengua
  R: '#d63a2f', // collar
  Y: '#f2c230', // chapa del collar
};

const BODY_TOP = [
  '...............DD...',
  '..............DLBD..',
  '..............BBBBB.',
  '..............BKBBBK',
  'D.............BBBBBB',
  'BD...........RYBBP..',
  '.BLLLLLLLLLLLRBBB...',
  '.BBBBBBBBBBBBBBB....',
  '.BBBBWWWWWWBBBBB....',
  '..BBBWWWWWWBBBB.....',
];

export const DOG_RUN_A = [
  ...BODY_TOP,
  '..BB.........BB.....',
  '..BD..........BD....',
  '.BD............BD...',
  '.D..............D...',
];

export const DOG_RUN_B = [
  ...BODY_TOP,
  '...BB.......BB......',
  '...DB.......DB......',
  '...DB.......DB......',
  '...DD.......DD......',
];

export const DOG_JUMP = [
  ...BODY_TOP,
  '..BBD.......BBD.....',
  '...DD........DD.....',
  '....................',
  '....................',
];

export const DOG_HURT = [
  '...............DD...',
  '..............DLBD..',
  '..............BBBBB.',
  '..............BWBBBK',
  '..............BBBBBB',
  'DD...........RYBBB..',
  '.BLLLLLLLLLLLRBBB...',
  '.BBBBBBBBBBBBBBB....',
  '.BBBBWWWWWWBBBBB....',
  '..BBBWWWWWWBBBB.....',
  '..BB.........BB.....',
  '..DD.........DD.....',
  '....................',
  '....................',
];

export const BONE = [
  '.WW......WW.',
  'WWWW....WWWW',
  'WWWWWWWWWWWW',
  '.WWWWWWWWWW.',
  'WWWWWWWWWWWW',
  'WWWW....WWWW',
  '.WW......WW.',
];

/** paleta base con los cambios de una skin encima */
export function withSkin(overrides: Record<string, string> = {}) {
  return { ...PALETTE, ...overrides };
}

export function spriteSize(rows: string[]) {
  return { w: rows[0].length, h: rows.length };
}

/** Pinta un sprite en un canvas 2D (lo uso para las texturas de Phaser y para el logo). */
export function paintSprite(
  ctx: CanvasRenderingContext2D,
  rows: string[],
  scale: number,
  offsetX = 0,
  offsetY = 0,
  palette = PALETTE,
) {
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const color = palette[row[x]];
      if (!color) continue;
      ctx.fillStyle = color;
      ctx.fillRect(offsetX + x * scale, offsetY + y * scale, scale, scale);
    }
  });
}
