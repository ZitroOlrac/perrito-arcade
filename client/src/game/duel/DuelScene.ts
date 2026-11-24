import Phaser from 'phaser';
import { createDuelTextures, BOLT_SIZE } from './duelTextures';
import { sfx } from '../sound';
import type { Bolt, DuelSnapshot, HitResult, Side } from '../../duel/types';

export const DUEL_WIDTH = 960;
export const DUEL_HEIGHT = 540;
const MARGIN = 56;

export const ME_COLOR = 0xff8a3d;
export const RIVAL_COLOR = 0x4da3ff;

interface BoltView {
  data: Bolt;
  container: Phaser.GameObjects.Container;
  head: Phaser.GameObjects.Image;
  rings: Phaser.GameObjects.Graphics;
  leaving: boolean;
}

export interface DuelSceneData {
  you: Side;
  serverNow: () => number;
}

/**
 * Solo pinta. Todo lo que pasa (qué tornillos hay, quién se los lleva) lo dice
 * el servidor con cada duel:state. Lo único que se hace "por adelantado" es la
 * respuesta inmediata al toque (giro, chispas, sonido) para que no se note la
 * latencia; si el servidor luego dice que llegaste tarde, se avisa.
 */
export class DuelScene extends Phaser.Scene {
  private you: Side = 'a';
  private serverNow: () => number = Date.now;
  private views = new Map<number, BoltView>();
  private lastPositions = new Map<number, { x: number; y: number }>();
  private sparks!: Phaser.GameObjects.Particles.ParticleEmitter;
  private wrench?: Phaser.GameObjects.Image;
  private phase: DuelSnapshot['phase'] = 'countdown';

  constructor() {
    super('duel');
  }

  init(data: DuelSceneData) {
    this.you = data.you;
    this.serverNow = data.serverNow;
    this.views.clear();
    this.lastPositions.clear();
  }

  create() {
    createDuelTextures(this);

    this.add.tileSprite(0, 0, DUEL_WIDTH, DUEL_HEIGHT, 'plate').setOrigin(0);
    const frame = this.add.graphics();
    frame.lineStyle(10, 0x2a2f35).strokeRect(5, 5, DUEL_WIDTH - 10, DUEL_HEIGHT - 10);
    frame.lineStyle(2, 0x52595f).strokeRect(12, 12, DUEL_WIDTH - 24, DUEL_HEIGHT - 24);
    for (const [x, y] of [
      [24, 24],
      [DUEL_WIDTH - 24, 24],
      [24, DUEL_HEIGHT - 24],
      [DUEL_WIDTH - 24, DUEL_HEIGHT - 24],
    ]) {
      this.add.image(x, y, 'rivet');
    }

    this.sparks = this.add.particles(0, 0, 'spark', {
      speed: { min: 60, max: 220 },
      lifespan: 380,
      scale: { start: 1.3, end: 0 },
      gravityY: 400,
      emitting: false,
    });
    this.sparks.setDepth(20);

    // en táctil no tiene sentido una llave siguiendo a un ratón que no existe
    if (!this.sys.game.device.input.touch) {
      this.wrench = this.add.image(-100, -100, 'wrench').setOrigin(0.18, 0.5).setDepth(30).setAngle(-35);
      this.input.setDefaultCursor('none');
      this.input.on('pointermove', (p: Phaser.Input.Pointer) => this.wrench!.setPosition(p.x, p.y));
      this.input.on('gameout', () => this.wrench!.setVisible(false));
      this.input.on('gameover', () => this.wrench!.setVisible(true));
    }
    this.input.on('pointerdown', () => {
      if (!this.wrench) return;
      this.tweens.add({ targets: this.wrench, angle: -75, duration: 60, yoyo: true });
    });

    const onState = (s: DuelSnapshot) => this.applySnapshot(s);
    const onHitResult = (r: { boltId: number; result: HitResult }) => this.onHitResult(r.boltId, r.result);
    this.game.events.on('duel:state', onState);
    this.game.events.on('duel:hit-result', onHitResult);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.game.events.off('duel:state', onState);
      this.game.events.off('duel:hit-result', onHitResult);
    });

    this.game.events.emit('duel:scene-ready');
  }

  // ---------- estado del servidor ----------

  private applySnapshot(s: DuelSnapshot) {
    const wasPlaying = this.phase === 'playing';
    this.phase = s.phase;

    for (const ev of s.events) {
      const view = this.views.get(ev.boltId);
      if (!view) continue;
      if (ev.type === 'claim') this.animateClaim(view, ev.by, ev.points);
      else this.animateExpire(view);
    }

    const alive = new Set(s.bolts.map((b) => b.id));
    for (const bolt of s.bolts) {
      const view = this.views.get(bolt.id);
      if (view) view.data = bolt;
      else this.spawnBolt(bolt);
    }

    // los que ya no están y no se han ido con animación (fin de partida, reconexión...)
    for (const view of this.views.values()) {
      if (!alive.has(view.data.id) && !view.leaving) this.animateExpire(view);
    }

    if (wasPlaying && s.phase === 'finished') this.cameras.main.flash(250, 255, 255, 255, false);
  }

  private toScreen(b: { x: number; y: number }) {
    return {
      x: MARGIN + b.x * (DUEL_WIDTH - MARGIN * 2),
      y: MARGIN + b.y * (DUEL_HEIGHT - MARGIN * 2),
    };
  }

  private spawnBolt(bolt: Bolt) {
    const { x, y } = this.toScreen(bolt);
    const rings = this.add.graphics();
    const head = this.add.image(0, 0, `bolt-${bolt.kind}`);
    const container = this.add.container(x, y, [rings, head]).setSize(BOLT_SIZE, BOLT_SIZE).setScale(0);

    // la zona para pinchar es algo más grande que el tornillo: en móvil se agradece
    container.setInteractive(
      new Phaser.Geom.Circle(BOLT_SIZE / 2, BOLT_SIZE / 2, BOLT_SIZE * 0.62),
      Phaser.Geom.Circle.Contains,
    );
    container.on('pointerdown', () => this.tap(bolt.id));

    this.tweens.add({ targets: container, scale: 1, duration: 180, ease: 'Back.out' });
    if (bolt.kind === 'gold') {
      this.tweens.add({ targets: head, scale: 1.08, duration: 260, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
    }

    this.views.set(bolt.id, { data: bolt, container, head, rings, leaving: false });
    this.lastPositions.set(bolt.id, { x, y });
  }

  // ---------- toques ----------

  private tap(boltId: number) {
    const view = this.views.get(boltId);
    if (!view || view.leaving || this.phase !== 'playing') return;

    // respuesta inmediata, sin esperar al servidor
    sfx.clank();
    this.tweens.add({ targets: view.head, angle: view.head.angle + 60, duration: 90, ease: 'Quad.out' });
    this.sparks.explode(5, view.container.x, view.container.y);
    this.game.events.emit('duel:hit', boltId);
  }

  private onHitResult(boltId: number, result: HitResult) {
    if (result.ok) return; // lo bueno ya llega en el siguiente duel:state
    if (result.reason === 'NO_BOLT') {
      const pos = this.lastPositions.get(boltId);
      if (pos) this.floatingText(pos.x, pos.y - 30, '¡Tarde!', '#9198a1', 18);
      sfx.late();
    }
  }

  // ---------- animaciones ----------

  private animateClaim(view: BoltView, by: Side, points: number) {
    view.leaving = true;
    view.rings.clear();
    view.container.disableInteractive();
    this.views.delete(view.data.id);
    const mine = by === this.you;
    const color = mine ? ME_COLOR : RIVAL_COLOR;
    const { x, y } = view.container;

    if (mine) sfx.claim();
    else sfx.stolen();

    view.head.setTint(color);
    this.sparks.explode(mine ? 14 : 6, x, y);
    this.floatingText(x, y - 20, `+${points}`, mine ? '#ff8a3d' : '#4da3ff', 30);

    // sale volando hacia el marcador de quien se lo ha llevado (yo a la izquierda, el rival a la derecha)
    this.tweens.add({
      targets: view.container,
      x: mine ? 90 : DUEL_WIDTH - 90,
      y: -40,
      scale: 0.4,
      angle: mine ? -240 : 240,
      duration: 420,
      ease: 'Quad.in',
      onComplete: () => view.container.destroy(),
    });
  }

  private animateExpire(view: BoltView) {
    view.leaving = true;
    view.rings.clear();
    view.container.disableInteractive();
    this.views.delete(view.data.id);
    this.tweens.add({
      targets: view.container,
      scale: 0,
      alpha: 0,
      duration: 220,
      onComplete: () => view.container.destroy(),
    });
  }

  private floatingText(x: number, y: number, text: string, color: string, size: number) {
    const t = this.add
      .text(x, y, text, {
        fontFamily: '"Courier New", monospace',
        fontSize: `${size}px`,
        fontStyle: 'bold',
        color,
        stroke: '#15181c',
        strokeThickness: 5,
      })
      .setOrigin(0.5)
      .setDepth(25);
    this.tweens.add({
      targets: t,
      y: y - 40,
      alpha: 0,
      duration: 750,
      ease: 'Quad.out',
      onComplete: () => t.destroy(),
    });
  }

  // ---------- anillos: tiempo que le queda y progreso de los oxidados ----------

  update() {
    const now = this.serverNow();
    const other: Side = this.you === 'a' ? 'b' : 'a';

    for (const view of this.views.values()) {
      const { data, rings } = view;
      rings.clear();
      const r = BOLT_SIZE / 2 + 2;

      // tiempo de vida: arco gris que se va comiendo (rojo al final)
      const life = Phaser.Math.Clamp((data.expiresAt - now) / lifeFor(data.kind), 0, 1);
      rings.lineStyle(4, life < 0.3 ? 0xe5544a : 0x9198a1, 0.9);
      rings.beginPath();
      rings.arc(0, 0, r, -Math.PI / 2, -Math.PI / 2 + life * Math.PI * 2);
      rings.strokePath();

      if (data.needed > 1) {
        // puntitos: los míos naranjas arriba, los del rival azules abajo
        for (let i = 0; i < data.needed; i++) {
          const dx = (i - (data.needed - 1) / 2) * 14;
          rings.fillStyle(i < data.turns[this.you] ? ME_COLOR : 0x2a2f35, 1);
          rings.fillCircle(dx, -r - 12, 5);
          rings.fillStyle(i < data.turns[other] ? RIVAL_COLOR : 0x2a2f35, 1);
          rings.fillCircle(dx, r + 12, 5);
        }
      }
    }
  }
}

// misma duración que en el servidor (RULES.kinds), solo se usa para dibujar el anillo
function lifeFor(kind: Bolt['kind']) {
  return kind === 'gold' ? 1500 : kind === 'rusty' ? 5000 : 4000;
}
