import Phaser from 'phaser';
import { BONE, DOG_HURT, DOG_JUMP, DOG_RUN_A, DOG_RUN_B, paintSprite, spriteSize, withSkin } from './sprites';

export const DOG_SCALE = 4;

type Draw = (ctx: CanvasRenderingContext2D, w: number, h: number) => void;

function canvasTexture(scene: Phaser.Scene, key: string, w: number, h: number, draw: Draw) {
  if (scene.textures.exists(key)) return;
  const tex = scene.textures.createCanvas(key, w, h)!;
  const ctx = tex.getContext();
  ctx.imageSmoothingEnabled = false;
  draw(ctx, w, h);
  tex.refresh();
}

function spriteTexture(
  scene: Phaser.Scene,
  key: string,
  rows: string[],
  scale: number,
  palette?: Record<string, string>,
) {
  const { w, h } = spriteSize(rows);
  canvasTexture(scene, key, w * scale, h * scale, (ctx) => paintSprite(ctx, rows, scale, 0, 0, palette));
}

export function createTextures(scene: Phaser.Scene, skin: Record<string, string> = {}) {
  // el perrito se pinta con los colores de la skin equipada
  const palette = withSkin(skin);
  spriteTexture(scene, 'dog-a', DOG_RUN_A, DOG_SCALE, palette);
  spriteTexture(scene, 'dog-b', DOG_RUN_B, DOG_SCALE, palette);
  spriteTexture(scene, 'dog-jump', DOG_JUMP, DOG_SCALE, palette);
  spriteTexture(scene, 'dog-hurt', DOG_HURT, DOG_SCALE, palette);
  spriteTexture(scene, 'bone', BONE, 3);

  // neumático visto de lado
  canvasTexture(scene, 'tire', 44, 44, (ctx) => {
    ctx.fillStyle = '#151515';
    ctx.beginPath();
    ctx.arc(22, 22, 22, 0, Math.PI * 2);
    ctx.fill();
    // dibujo de la goma
    ctx.strokeStyle = '#2c2c2c';
    ctx.lineWidth = 3;
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(22 + Math.cos(a) * 15, 22 + Math.sin(a) * 15);
      ctx.lineTo(22 + Math.cos(a) * 21, 22 + Math.sin(a) * 21);
      ctx.stroke();
    }
    ctx.fillStyle = '#8b9096';
    ctx.beginPath();
    ctx.arc(22, 22, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#5c6066';
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      ctx.beginPath();
      ctx.arc(22 + Math.cos(a) * 6, 22 + Math.sin(a) * 6, 1.6, 0, Math.PI * 2);
      ctx.fill();
    }
  });

  // caja de herramientas
  canvasTexture(scene, 'toolbox', 56, 44, (ctx) => {
    ctx.fillStyle = '#3a3a3a';
    ctx.fillRect(18, 0, 20, 4);
    ctx.fillRect(16, 0, 4, 10);
    ctx.fillRect(36, 0, 4, 10);
    ctx.fillStyle = '#c62f25';
    ctx.fillRect(0, 10, 56, 34);
    ctx.fillStyle = '#9e2219';
    ctx.fillRect(0, 10, 56, 8);
    ctx.fillRect(0, 40, 56, 4);
    ctx.fillStyle = '#f2c230';
    ctx.fillRect(24, 16, 8, 6);
    ctx.fillStyle = '#e0544a';
    ctx.fillRect(4, 22, 48, 2);
  });

  // cono
  canvasTexture(scene, 'cone', 36, 52, (ctx) => {
    ctx.fillStyle = '#ff7a1a';
    ctx.beginPath();
    ctx.moveTo(18, 0);
    ctx.lineTo(31, 46);
    ctx.lineTo(5, 46);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#f4ede1';
    ctx.fillRect(10, 18, 16, 5);
    ctx.fillRect(7, 32, 22, 5);
    ctx.fillStyle = '#2a2a2a';
    ctx.fillRect(0, 46, 36, 6);
  });

  // lámpara de taller colgando del techo (hay que NO saltar, o saltar poco)
  canvasTexture(scene, 'lamp', 56, 236, (ctx) => {
    ctx.fillStyle = '#4a4f55';
    ctx.fillRect(27, 0, 2, 198);
    ctx.fillStyle = '#2d6a4f';
    ctx.beginPath();
    ctx.moveTo(2, 224);
    ctx.lineTo(16, 196);
    ctx.lineTo(40, 196);
    ctx.lineTo(54, 224);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#3f8f6b';
    ctx.fillRect(16, 196, 24, 4);
    ctx.fillStyle = '#fff3b0';
    ctx.fillRect(14, 224, 28, 8);
    ctx.fillStyle = 'rgba(255, 243, 176, 0.35)';
    ctx.fillRect(10, 232, 36, 4);
  });

  // suelo de hormigón con la línea amarilla y negra
  canvasTexture(scene, 'floor', 64, 64, (ctx) => {
    ctx.fillStyle = '#5d6168';
    ctx.fillRect(0, 0, 64, 64);
    for (let x = 0; x < 64; x += 16) {
      ctx.fillStyle = (x / 16) % 2 === 0 ? '#f2c230' : '#1c1a19';
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x + 16, 0);
      ctx.lineTo(x + 8, 8);
      ctx.lineTo(x - 8, 8);
      ctx.closePath();
      ctx.fill();
    }
    ctx.fillStyle = '#52565c';
    ctx.fillRect(0, 8, 64, 2);
    // manchas y grietas para que no se vea un patrón tan repetido
    ctx.fillStyle = '#676b72';
    ctx.fillRect(9, 24, 3, 2);
    ctx.fillRect(40, 41, 4, 2);
    ctx.fillRect(25, 54, 2, 2);
    ctx.fillStyle = '#4c5056';
    ctx.fillRect(50, 20, 6, 1);
    ctx.fillRect(55, 21, 1, 4);
  });

  // pared con panel perforado y herramientas colgadas
  canvasTexture(scene, 'wall', 320, 300, (ctx) => {
    ctx.fillStyle = '#2a3038';
    ctx.fillRect(0, 0, 320, 300);
    ctx.fillStyle = '#8a6b48';
    ctx.fillRect(20, 70, 200, 130);
    ctx.fillStyle = '#6f5538';
    for (let y = 80; y < 200; y += 12) {
      for (let x = 30; x < 220; x += 12) ctx.fillRect(x, y, 2, 2);
    }
    ctx.fillStyle = '#b7bcc2';
    // llave inglesa
    ctx.fillRect(48, 92, 6, 70);
    ctx.fillRect(42, 86, 18, 10);
    ctx.fillStyle = '#8a6b48';
    ctx.fillRect(48, 86, 6, 5);
    // martillo
    ctx.fillStyle = '#7a4a22';
    ctx.fillRect(92, 96, 6, 66);
    ctx.fillStyle = '#b7bcc2';
    ctx.fillRect(80, 88, 30, 12);
    // destornilladores
    const colors = ['#d63a2f', '#f2c230', '#3d7dd8'];
    colors.forEach((c, i) => {
      ctx.fillStyle = c;
      ctx.fillRect(132 + i * 22, 92, 8, 26);
      ctx.fillStyle = '#b7bcc2';
      ctx.fillRect(135 + i * 22, 118, 2, 34);
    });
    // enchufe y cable
    ctx.fillStyle = '#d9d9d9';
    ctx.fillRect(268, 210, 16, 22);
    ctx.fillStyle = '#1c1a19';
    ctx.fillRect(272, 216, 2, 5);
    ctx.fillRect(278, 216, 2, 5);
  });

  // estanterías al fondo
  canvasTexture(scene, 'shelves', 480, 300, (ctx) => {
    ctx.fillStyle = '#20252c';
    ctx.fillRect(0, 0, 480, 300);
    ctx.fillStyle = '#181c22';
    for (const y of [70, 150, 230]) ctx.fillRect(0, y, 480, 8);
    for (const x of [10, 240, 470]) ctx.fillRect(x, 20, 6, 280);
    const boxes = [
      [30, 40, 50, 30],
      [90, 50, 30, 20],
      [150, 35, 60, 35],
      [270, 45, 40, 25],
      [330, 30, 70, 40],
      [40, 120, 40, 30],
      [120, 110, 70, 40],
      [280, 125, 50, 25],
      [360, 115, 40, 35],
      [25, 200, 80, 30],
      [160, 205, 40, 25],
      [260, 195, 60, 35],
      [400, 200, 50, 30],
    ];
    ctx.fillStyle = '#262c34';
    for (const [x, y, w, h] of boxes) ctx.fillRect(x, y, w, h);
  });

  canvasTexture(scene, 'dust', 6, 6, (ctx) => {
    ctx.fillStyle = '#c9c4ba';
    ctx.fillRect(0, 0, 6, 6);
  });

  canvasTexture(scene, 'spark', 4, 4, (ctx) => {
    ctx.fillStyle = '#ffe27a';
    ctx.fillRect(0, 0, 4, 4);
  });
}
