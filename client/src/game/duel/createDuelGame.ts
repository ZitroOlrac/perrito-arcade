import Phaser from 'phaser';
import { DUEL_HEIGHT, DUEL_WIDTH, DuelScene, type DuelSceneData } from './DuelScene';

export function createDuelGame(parent: HTMLElement, data: DuelSceneData) {
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    width: DUEL_WIDTH,
    height: DUEL_HEIGHT,
    backgroundColor: '#2a2f35',
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_HORIZONTALLY },
    banner: false,
    input: { activePointers: 3 }, // varios dedos a la vez en móvil
  });
  game.scene.add('duel', DuelScene, true, data);
  if (import.meta.env.DEV) (window as unknown as { __duelGame: Phaser.Game }).__duelGame = game;
  return game;
}
