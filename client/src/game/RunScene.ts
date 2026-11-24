import Phaser from 'phaser';
import { createTextures, DOG_SCALE } from './textures';
import { sfx } from './sound';
import { availableObstacles, gapRange, PX_PER_METER, scoreOf, speedAt, type ObstacleKind } from './difficulty';

export const WIDTH = 960;
export const HEIGHT = 360;
const GROUND_Y = 300;

const GRAVITY = 2400;
const JUMP_VELOCITY = -820;
const DOUBLE_JUMP_VELOCITY = -700;
const JUMP_CUT_VELOCITY = -320; // al soltar antes de tiempo, el salto se corta aquí
const COYOTE_MS = 90; // margen para saltar justo después de salirse del borde
const JUMP_BUFFER_MS = 120; // si pulsas un poco antes de tocar el suelo, también cuenta

type State = 'ready' | 'running' | 'dead';

export interface RunResult {
  distance: number;
  coins: number;
  durationMs: number;
  score: number;
}

export class RunScene extends Phaser.Scene {
  private state: State = 'ready';
  private dog!: Phaser.Types.Physics.Arcade.SpriteWithDynamicBody;
  private ground!: Phaser.GameObjects.Zone;
  private obstacles!: Phaser.Physics.Arcade.Group;
  private bones!: Phaser.Physics.Arcade.Group;

  private floor!: Phaser.GameObjects.TileSprite;
  private wall!: Phaser.GameObjects.TileSprite;
  private shelves!: Phaser.GameObjects.TileSprite;

  private dust!: Phaser.GameObjects.Particles.ParticleEmitter;
  private sparks!: Phaser.GameObjects.Particles.ParticleEmitter;

  private hud!: { meters: Phaser.GameObjects.Text; bones: Phaser.GameObjects.Text; best: Phaser.GameObjects.Text };
  private banner!: Phaser.GameObjects.Text;
  private hint!: Phaser.GameObjects.Text;

  private elapsedMs = 0;
  private meters = 0;
  private coins = 0;
  private speed = 0;
  private nextObstacleIn = 0; // px que faltan para el siguiente obstáculo
  private nextBonesIn = 0;

  private lastGroundedAt = -Infinity;
  private jumpPressedAt = -Infinity;
  private usedDoubleJump = false;
  private wasOnGround = true;
  private runAnimTimer = 0;

  private bestScore = 0;
  private beatBest = false;
  private palette: Record<string, string> = {};

  constructor() {
    super('run');
  }

  init(data: { bestScore?: number; palette?: Record<string, string> }) {
    this.bestScore = data.bestScore ?? 0;
    this.palette = data.palette ?? {};
  }

  create() {
    createTextures(this, this.palette);
    this.physics.world.gravity.y = GRAVITY;

    this.shelves = this.add.tileSprite(0, 0, WIDTH, GROUND_Y, 'shelves').setOrigin(0);
    this.wall = this.add.tileSprite(0, 0, WIDTH, GROUND_Y, 'wall').setOrigin(0).setAlpha(0.9);
    this.floor = this.add.tileSprite(0, GROUND_Y, WIDTH, HEIGHT - GROUND_Y, 'floor').setOrigin(0);

    this.ground = this.add.zone(WIDTH / 2, GROUND_Y + 30, WIDTH * 2, 60);
    this.physics.add.existing(this.ground, true);

    this.dog = this.physics.add.sprite(150, GROUND_Y, 'dog-a').setOrigin(0.5, 1);
    // hitbox un poco más pequeña que el dibujo: que te mate algo que
    // "no ha tocado" es lo que más rabia da en este tipo de juegos
    this.dog.body.setSize(14 * DOG_SCALE, 12 * DOG_SCALE).setOffset(3 * DOG_SCALE, 2 * DOG_SCALE);
    this.dog.body.reset(150, GROUND_Y);
    this.physics.add.collider(this.dog, this.ground);

    this.obstacles = this.physics.add.group({ allowGravity: false, immovable: true });
    this.bones = this.physics.add.group({ allowGravity: false });

    this.physics.add.overlap(this.dog, this.obstacles, () => this.crash());
    this.physics.add.overlap(this.dog, this.bones, (_dog, bone) =>
      this.collectBone(bone as Phaser.Physics.Arcade.Image),
    );

    this.dust = this.add.particles(0, 0, 'dust', {
      speed: { min: 30, max: 120 },
      angle: { min: 180, max: 260 },
      lifespan: 350,
      scale: { start: 1, end: 0 },
      alpha: { start: 0.8, end: 0 },
      gravityY: 300,
      emitting: false,
    });
    this.sparks = this.add.particles(0, 0, 'spark', {
      speed: { min: 80, max: 260 },
      lifespan: 450,
      scale: { start: 1.2, end: 0 },
      gravityY: 500,
      emitting: false,
    });

    this.createHud();
    this.setupInput();
    this.toReady();

    this.game.events.on('run:restart', this.restart, this);
    this.game.events.on('run:best', (best: number) => {
      this.bestScore = best;
      this.updateBestText();
    });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.game.events.off('run:restart', this.restart, this);
      this.game.events.off('run:best');
    });
  }

  // ---------- estados ----------

  private toReady() {
    this.state = 'ready';
    this.banner.setText('PERRITO RUN').setVisible(true);
    this.hint.setText('Espacio / toca la pantalla para empezar').setVisible(true);
    this.tweens.add({ targets: this.hint, alpha: 0.3, duration: 700, yoyo: true, repeat: -1 });
    this.physics.pause();
  }

  private startRun() {
    this.state = 'running';
    this.elapsedMs = 0;
    this.meters = 0;
    this.coins = 0;
    this.beatBest = false;
    this.speed = speedAt(0);
    this.nextObstacleIn = 500;
    this.nextBonesIn = 300;
    this.usedDoubleJump = false;

    this.tweens.killTweensOf(this.hint);
    this.hint.setAlpha(1).setVisible(false);
    this.banner.setVisible(false);
    this.physics.resume();
    this.game.events.emit('run:start');
  }

  private crash() {
    if (this.state !== 'running') return;
    this.state = 'dead';
    sfx.crash();

    this.physics.pause();
    this.dog.setTexture('dog-hurt');
    this.cameras.main.shake(220, 0.012);
    this.sparks.explode(18, this.dog.x + 30, this.dog.y - 30);

    const result: RunResult = {
      distance: Math.floor(this.meters),
      coins: this.coins,
      durationMs: Math.round(this.elapsedMs),
      score: scoreOf(this.meters, this.coins),
    };
    this.game.events.emit('run:end', result);
  }

  private restart() {
    this.obstacles.clear(true, true);
    this.bones.clear(true, true);
    this.dog.setTexture('dog-a').setAngle(0);
    this.dog.body.reset(150, GROUND_Y);
    this.updateHud();
    this.startRun();
  }

  // ---------- input ----------

  private setupInput() {
    const press = () => {
      if (this.state === 'ready') return this.startRun();
      if (this.state === 'running') {
        this.jumpPressedAt = this.time.now;
        this.tryJump();
      }
    };
    const release = () => {
      if (this.dog.body.velocity.y < JUMP_CUT_VELOCITY) this.dog.setVelocityY(JUMP_CUT_VELOCITY);
    };

    const kb = this.input.keyboard!;
    for (const key of ['SPACE', 'UP', 'W']) {
      kb.on(`keydown-${key}`, (e: KeyboardEvent) => {
        if (!e.repeat) press();
      });
      kb.on(`keyup-${key}`, release);
    }
    // que la barra espaciadora no haga scroll en la página
    kb.addCapture(['SPACE', 'UP']);

    this.input.on('pointerdown', press);
    this.input.on('pointerup', release);
  }

  private tryJump() {
    const now = this.time.now;
    const canGroundJump = this.dog.body.blocked.down || now - this.lastGroundedAt < COYOTE_MS;

    if (canGroundJump) {
      this.dog.setVelocityY(JUMP_VELOCITY);
      this.lastGroundedAt = -Infinity; // evita que el coyote time dé dos saltos seguidos
      this.jumpPressedAt = -Infinity;
      sfx.jump();
      this.dust.explode(6, this.dog.x - 10, GROUND_Y);
    } else if (!this.usedDoubleJump) {
      this.usedDoubleJump = true;
      this.dog.setVelocityY(DOUBLE_JUMP_VELOCITY);
      this.jumpPressedAt = -Infinity;
      sfx.doubleJump();
      this.dust.explode(4, this.dog.x - 10, this.dog.y - 10);
    }
  }

  // ---------- bucle ----------

  update(time: number, delta: number) {
    if (this.state !== 'running') return;
    // si la pestaña se queda en segundo plano llega un delta enorme; lo limito
    const dt = Math.min(delta, 50) / 1000;

    this.elapsedMs += dt * 1000;
    this.speed = speedAt(this.elapsedMs / 1000);
    const dx = this.speed * dt;
    this.meters += dx / PX_PER_METER;

    this.floor.tilePositionX += dx;
    this.wall.tilePositionX += dx * 0.35;
    this.shelves.tilePositionX += dx * 0.12;

    this.updateDog(time, dt);
    this.spawn(dx);
    this.moveObjects();
    this.updateHud();
  }

  private updateDog(time: number, dt: number) {
    const onGround = this.dog.body.blocked.down;

    if (onGround) {
      this.lastGroundedAt = time;
      this.usedDoubleJump = false;
      if (!this.wasOnGround) {
        this.dust.explode(5, this.dog.x, GROUND_Y);
        // salto guardado: se pulsó justo antes de aterrizar
        if (time - this.jumpPressedAt < JUMP_BUFFER_MS) this.tryJump();
      }
    }
    this.wasOnGround = onGround;

    if (!onGround) {
      this.dog.setTexture('dog-jump');
      this.dog.setAngle(Phaser.Math.Clamp(this.dog.body.velocity.y / 60, -12, 12));
    } else {
      this.dog.setAngle(0);
      // la animación de correr va más rápido cuanto más rápido vamos
      this.runAnimTimer += dt * (this.speed / 30);
      this.dog.setTexture(Math.floor(this.runAnimTimer) % 2 === 0 ? 'dog-a' : 'dog-b');
    }
  }

  private spawn(dx: number) {
    this.nextObstacleIn -= dx;
    this.nextBonesIn -= dx;

    if (this.nextObstacleIn <= 0) {
      const kinds = availableObstacles(this.meters);
      const kind = Phaser.Utils.Array.GetRandom(kinds);
      this.spawnObstacle(kind);

      const { min, max } = gapRange(this.speed);
      // la lámpara pide un hueco extra: hay que cambiar de "saltar" a "no saltar"
      this.nextObstacleIn = Phaser.Math.Between(min, max) + (kind === 'lamp' ? 160 : 0);

      // a veces pongo huesos en arco justo encima del obstáculo, como premio por saltar bien
      if (kind !== 'lamp' && Math.random() < 0.35) this.spawnBoneArc(WIDTH + 40);
    }

    if (this.nextBonesIn <= 0) {
      // los huesos sueltos nunca deben caer encima de un obstáculo
      if (this.nextObstacleIn > 180) this.spawnBoneLine(WIDTH + 40);
      this.nextBonesIn = Phaser.Math.Between(500, 900);
    }
  }

  private spawnObstacle(kind: ObstacleKind) {
    const x = WIDTH + 60;
    const created: Phaser.Physics.Arcade.Image[] = [];
    const add = (key: string, y: number, originY = 1) => {
      const o = this.obstacles.create(x, y, key) as Phaser.Physics.Arcade.Image;
      o.setOrigin(0.5, originY);
      o.setData('kind', kind);
      created.push(o);
      return o;
    };

    switch (kind) {
      case 'tire': {
        const t = add('tire', GROUND_Y);
        (t.body as Phaser.Physics.Arcade.Body).setCircle(19, 3, 3);
        t.setData('extraSpeed', 60); // rueda hacia ti
        break;
      }
      case 'double-tire': {
        const a = add('tire', GROUND_Y);
        const b = add('tire', GROUND_Y);
        b.x += 44;
        for (const t of [a, b]) (t.body as Phaser.Physics.Arcade.Body).setCircle(19, 3, 3);
        break;
      }
      case 'toolbox': {
        const t = add('toolbox', GROUND_Y);
        (t.body as Phaser.Physics.Arcade.Body).setSize(50, 34).setOffset(3, 10);
        break;
      }
      case 'cone': {
        const c = add('cone', GROUND_Y);
        (c.body as Phaser.Physics.Arcade.Body).setSize(18, 44).setOffset(9, 8);
        break;
      }
      case 'lamp': {
        const l = add('lamp', 0, 0);
        (l.body as Phaser.Physics.Arcade.Body).setSize(44, 34).setOffset(6, 198);
        l.setData('swing', Math.random() * Math.PI * 2);
        break;
      }
    }

    // Al cambiar el origin después de crear el cuerpo, Arcade cree que el sprite se ha
    // movido y en el primer frame lo desplaza media altura hacia arriba (las cajas
    // "flotaban" y te mataban sin tocarlas). reset() recoloca el cuerpo sin ese salto.
    for (const o of created) (o.body as Phaser.Physics.Arcade.Body).reset(o.x, o.y);
  }

  private addBone(x: number, y: number) {
    const bone = this.bones.create(x, y, 'bone') as Phaser.Physics.Arcade.Image;
    this.tweens.add({ targets: bone, y: y - 6, duration: 450, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
  }

  private spawnBoneLine(x: number) {
    const high = Math.random() < 0.4;
    const y = high ? GROUND_Y - 130 : GROUND_Y - 30;
    const n = Phaser.Math.Between(3, 5);
    for (let i = 0; i < n; i++) this.addBone(x + i * 44, y);
  }

  private spawnBoneArc(x: number) {
    for (let i = 0; i < 5; i++) {
      const t = i / 4;
      this.addBone(x - 80 + t * 160, GROUND_Y - 80 - Math.sin(t * Math.PI) * 70);
    }
  }

  private moveObjects() {
    for (const o of this.obstacles.getChildren() as Phaser.Physics.Arcade.Image[]) {
      const extra = (o.getData('extraSpeed') as number) ?? 0;
      o.setVelocityX(-(this.speed + extra));
      if (o.texture.key === 'tire' && extra) o.rotation -= ((this.speed + extra) / 22) * (1 / 60);
      if (o.getData('kind') === 'lamp') {
        const phase = (o.getData('swing') as number) + this.elapsedMs / 400;
        o.setAngle(Math.sin(phase) * 4);
      }
      if (o.x < -100) o.destroy();
    }
    for (const b of this.bones.getChildren() as Phaser.Physics.Arcade.Image[]) {
      b.setVelocityX(-this.speed);
      if (b.x < -50) b.destroy();
    }
  }

  private collectBone(bone: Phaser.Physics.Arcade.Image) {
    if (!bone.active) return;
    this.coins++;
    sfx.bone();
    this.sparks.explode(5, bone.x, bone.y);
    this.tweens.killTweensOf(bone);
    bone.destroy();
  }

  // ---------- HUD ----------

  private createHud() {
    const style = { fontFamily: '"Courier New", monospace', fontSize: '20px', color: '#f4ede1', fontStyle: 'bold' };
    this.hud = {
      meters: this.add.text(20, 16, '0 m', style).setDepth(10),
      bones: this.add.text(20, 42, '', style).setDepth(10),
      best: this.add
        .text(WIDTH - 20, 16, '', { ...style, color: '#f2c230' })
        .setOrigin(1, 0)
        .setDepth(10),
    };
    this.add.image(28, 54, 'bone').setScale(0.6).setDepth(10);
    this.hud.bones.setX(46);

    this.banner = this.add
      .text(WIDTH / 2, 120, '', { ...style, fontSize: '44px', color: '#ff8a3d', stroke: '#1c1a19', strokeThickness: 6 })
      .setOrigin(0.5)
      .setDepth(10);
    this.hint = this.add
      .text(WIDTH / 2, 175, '', { ...style, fontSize: '18px' })
      .setOrigin(0.5)
      .setDepth(10);

    this.updateHud();
    this.updateBestText();
  }

  private updateBestText() {
    this.hud.best.setText(this.bestScore > 0 ? `RÉCORD ${this.bestScore}` : '');
  }

  private updateHud() {
    const score = scoreOf(this.meters, this.coins);
    this.hud.meters.setText(`${Math.floor(this.meters)} m   ${score} pts`);
    this.hud.bones.setText(`x ${this.coins}`);

    if (!this.beatBest && this.bestScore > 0 && score > this.bestScore && this.state === 'running') {
      this.beatBest = true;
      sfx.record();
      this.banner.setText('¡NUEVO RÉCORD!').setVisible(true).setScale(0.5).setAlpha(1);
      this.tweens.add({ targets: this.banner, scale: 1, duration: 250, ease: 'Back.out' });
      this.tweens.add({ targets: this.banner, alpha: 0, delay: 1200, duration: 400 });
    }
  }
}
