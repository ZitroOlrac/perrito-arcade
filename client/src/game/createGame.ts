import Phaser from 'phaser';
import { HEIGHT, RunScene, WIDTH } from './RunScene';

export function createRunGame(parent: HTMLElement, bestScore: number, palette: Record<string, string> = {}) {
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    width: WIDTH,
    height: HEIGHT,
    backgroundColor: '#1b1f24',
    pixelArt: true,
    physics: { default: 'arcade', arcade: { debug: false } },
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_HORIZONTALLY },
    banner: false,
  });
  game.scene.add('run', RunScene, true, { bestScore, palette });
  // en desarrollo dejo el juego accesible desde la consola para depurar (y para el bot de pruebas)
  if (import.meta.env.DEV) (window as unknown as { __perritoGame: Phaser.Game }).__perritoGame = game;
  return game;
}
