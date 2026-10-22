import Phaser from "phaser";

const WIDTH = 800;
const STAGE_DURATION = 30_000;
const SHOOT_INTERVAL = 400;

export class ContraScene extends Phaser.Scene {
  private player!: Phaser.GameObjects.Rectangle;
  private ground!: Phaser.GameObjects.Rectangle;
  private bullets!: Phaser.Physics.Arcade.Group;
  private enemies!: Phaser.Physics.Arcade.Group;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private shootKey!: Phaser.Input.Keyboard.Key;
  private restartKey!: Phaser.Input.Keyboard.Key;
  private scoreText!: Phaser.GameObjects.Text;
  private highScoreText!: Phaser.GameObjects.Text;
  private stageText!: Phaser.GameObjects.Text;
  private lifeText!: Phaser.GameObjects.Text;
  private gameOverObjects: Phaser.GameObjects.GameObject[] = [];
  private trees: Phaser.GameObjects.Rectangle[] = [];
  private score = 0;
  private highScore = Number(localStorage.getItem("contraHighScore") || 0);
  private life = 3;
  private stage = 1;
  private gameTime = 0;
  private shootCooldown = 0;
  private gameOver = false;
  private audioContext?: AudioContext;
  private bgmTimer?: number;
  private bgmNote = 0;

  constructor() {
    super("ContraScene");
  }

  create(): void {
    this.add.rectangle(WIDTH / 2, 150, WIDTH, 300, 0x111111);
    this.ground = this.add.rectangle(WIDTH / 2, 359, WIDTH, 82, 0x333333);
    this.physics.add.existing(this.ground, true);

    for (let i = 0; i < 8; i++) {
      const height = 40 + Math.random() * 30;
      this.trees.push(this.add.rectangle(Math.random() * WIDTH, 300 - height / 2, 12, height, 0x00aa00));
    }

    this.player = this.add.rectangle(364, 309, 28, 18, 0x00ff00);
    this.physics.add.existing(this.player);
    const playerBody = this.player.body as Phaser.Physics.Arcade.Body;
    playerBody.setCollideWorldBounds(true);
    this.physics.add.collider(this.player, this.ground);

    this.bullets = this.physics.add.group();
    this.enemies = this.physics.add.group();
    this.physics.add.overlap(this.bullets, this.enemies, this.onBulletHit);
    this.physics.add.overlap(this.player, this.enemies, this.onPlayerHit);

    this.cursors = this.input.keyboard!.createCursorKeys();
    this.shootKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    this.restartKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.R);
    this.input.keyboard!.addCapture([Phaser.Input.Keyboard.KeyCodes.SPACE, Phaser.Input.Keyboard.KeyCodes.UP]);

    this.scoreText = this.add.text(10, 8, "", { color: "#ffffff", fontFamily: "monospace", fontSize: "14px" });
    this.highScoreText = this.add.text(300, 8, "", { color: "#ffffff", fontFamily: "monospace", fontSize: "14px" });
    this.stageText = this.add.text(600, 8, "", { color: "#ffffff", fontFamily: "monospace", fontSize: "14px" });
    this.lifeText = this.add.text(10, 28, "", { color: "#ffffff", fontFamily: "monospace", fontSize: "14px" });
    this.updateHud();

    this.input.keyboard!.on("keydown", () => {
      if (!this.gameOver) this.startAudio();
    });
    this.input.on("pointerdown", () => {
      if (!this.gameOver) this.startAudio();
    });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.stopAudio, this);
  }

  update(_time: number, delta: number): void {
    if (this.gameOver) {
      if (Phaser.Input.Keyboard.JustDown(this.restartKey)) this.restartGame();
      return;
    }

    this.gameTime += delta;
    const nextStage = Math.floor(this.gameTime / STAGE_DURATION) + 1;
    if (nextStage !== this.stage) {
      this.stage = nextStage;
      this.updateHud();
    }

    const body = this.player.body as Phaser.Physics.Arcade.Body;
    body.setVelocityX(this.cursors.left.isDown ? -240 : this.cursors.right.isDown ? 240 : 0);
    if (Phaser.Input.Keyboard.JustDown(this.cursors.up) && body.blocked.down) body.setVelocityY(-390);

    this.shootCooldown -= delta;
    if (this.shootKey.isDown && this.shootCooldown <= 0) {
      this.shoot();
      this.shootCooldown = SHOOT_INTERVAL;
    }

    const stageSpeed = Math.min(this.stage - 1, 5);
    for (const enemy of this.enemies.getChildren()) {
      const rectangle = enemy as Phaser.GameObjects.Rectangle;
      const enemyBody = rectangle.body as Phaser.Physics.Arcade.Body;
      enemyBody.setVelocityX(-(180 + stageSpeed * 60));
      if (rectangle.x < -30) rectangle.destroy();
    }
    for (const bullet of this.bullets.getChildren()) {
      const rectangle = bullet as Phaser.GameObjects.Rectangle;
      if (rectangle.x > WIDTH + 10 || rectangle.y < -10) rectangle.destroy();
    }
    for (const tree of this.trees) {
      tree.x -= 3;
      if (tree.x < -10) {
        const height = 40 + Math.random() * 30;
        tree.setPosition(WIDTH + Math.random() * 100, 300 - height / 2).setSize(12, height);
      }
    }

    const timeScale = delta / 16.67;
    if (Math.random() < Math.min(0.02 + (this.stage - 1) * 0.005, 0.08) * timeScale) this.spawnEnemy(false);
    if (Math.random() < Math.min(0.015 + (this.stage - 1) * 0.004, 0.06) * timeScale) this.spawnEnemy(true);
  }

  private shoot(): void {
    this.playTone(880, 0.07, "square", 0.04);
    const x = this.player.x + 18;
    const y = this.player.y;
    for (const [dx, dy] of [[360, 0], [0, -360]]) {
      const bullet = this.add.rectangle(x, y, 4, 4, 0xffff00);
      this.bullets.add(bullet);
      const body = bullet.body as Phaser.Physics.Arcade.Body;
      body.setAllowGravity(false);
      body.setVelocity(dx, dy);
    }
  }

  private spawnEnemy(air: boolean): void {
    const enemy = this.add.rectangle(
      WIDTH + Math.random() * 200,
      air ? 80 + Math.random() * 80 : 309,
      air ? 24 : 26,
      air ? 14 : 16,
      air ? 0x00ffff : 0xff0000,
    );
    enemy.setData("score", air ? 200 : 100);
    this.enemies.add(enemy);
    const body = enemy.body as Phaser.Physics.Arcade.Body;
    body.setAllowGravity(false);
    body.setVelocityX(-(180 + Math.min(this.stage - 1, 5) * 60));
  }

  private onBulletHit: Phaser.Types.Physics.Arcade.ArcadePhysicsCallback = (bulletObject, enemyObject): void => {
    const bullet = bulletObject as unknown as Phaser.GameObjects.Rectangle;
    const enemy = enemyObject as unknown as Phaser.GameObjects.Rectangle;
    if (!bullet.active || !enemy.active) return;
    this.score += enemy.getData("score") as number;
    bullet.destroy();
    enemy.destroy();
    this.playExplosion();
    if (this.score > this.highScore) {
      this.highScore = this.score;
      localStorage.setItem("contraHighScore", String(this.highScore));
    }
    this.updateHud();
  }

  private onPlayerHit: Phaser.Types.Physics.Arcade.ArcadePhysicsCallback = (_player, enemyObject): void => {
    const enemy = enemyObject as unknown as Phaser.GameObjects.Rectangle;
    if (!enemy.active || this.gameOver) return;
    enemy.destroy();
    this.life--;
    this.playExplosion();
    this.updateHud();
    if (this.life <= 0) this.showGameOver();
  }

  private updateHud(): void {
    this.scoreText?.setText(`SCORE: ${String(this.score).padStart(6, "0")}`);
    this.highScoreText?.setText(`HI: ${String(this.highScore).padStart(6, "0")}`);
    this.stageText?.setText(`STAGE: ${this.stage}`);
    this.lifeText?.setText(`LIFE: ${this.life}`);
  }

  private showGameOver(): void {
    this.gameOver = true;
    this.stopBgm();
    this.gameOverObjects.push(
      this.add.text(WIDTH / 2, 180, "GAME OVER", { color: "#ffffff", fontFamily: "monospace", fontSize: "30px" }).setOrigin(0.5),
      this.add.text(WIDTH / 2, 214, `FINAL SCORE: ${this.score}`, { color: "#ffffff", fontFamily: "monospace", fontSize: "18px" }).setOrigin(0.5),
    );
    const button = this.add.rectangle(WIDTH / 2, 266, 170, 42, 0x00aa00).setInteractive();
    const label = this.add.text(WIDTH / 2, 266, "RESTART (R)", { color: "#ffffff", fontFamily: "monospace", fontSize: "18px" }).setOrigin(0.5);
    button.on("pointerdown", () => this.restartGame());
    this.gameOverObjects.push(button, label);
  }

  private restartGame(): void {
    this.gameOverObjects.forEach((object) => object.destroy());
    this.gameOverObjects = [];
    this.enemies.clear(true, true);
    this.bullets.clear(true, true);
    this.player.setPosition(364, 309);
    const body = this.player.body as Phaser.Physics.Arcade.Body;
    body.setVelocity(0, 0);
    this.score = 0;
    this.life = 3;
    this.stage = 1;
    this.gameTime = 0;
    this.shootCooldown = 0;
    this.gameOver = false;
    this.updateHud();
    this.startAudio();
    this.startBgm();
  }

  private startAudio(): void {
    if (this.audioContext) return;
    const Context = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Context) return;
    this.audioContext = new Context();
    this.startBgm();
  }

  private startBgm(): void {
    if (!this.audioContext || this.bgmTimer !== undefined) return;
    const melody = [392, 0, 523, 0, 659, 523, 440, 0, 392, 0, 330, 0, 440, 523, 392, 0];
    const playNextNote = (): void => {
      this.playTone(melody[this.bgmNote], 0.18, "square", 0.025);
      this.bgmNote = (this.bgmNote + 1) % melody.length;
    };
    playNextNote();
    this.bgmTimer = window.setInterval(playNextNote, 220);
  }

  private stopBgm(): void {
    if (this.bgmTimer !== undefined) window.clearInterval(this.bgmTimer);
    this.bgmTimer = undefined;
  }

  private stopAudio(): void {
    this.stopBgm();
    void this.audioContext?.close();
  }

  private playTone(frequency: number, duration: number, type: OscillatorType, volume: number): void {
    if (!this.audioContext || !frequency) return;
    const oscillator = this.audioContext.createOscillator();
    const gain = this.audioContext.createGain();
    const now = this.audioContext.currentTime;
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, now);
    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
    oscillator.connect(gain).connect(this.audioContext.destination);
    oscillator.start(now);
    oscillator.stop(now + duration);
  }

  private playExplosion(): void {
    if (!this.audioContext) return;
    const oscillator = this.audioContext.createOscillator();
    const gain = this.audioContext.createGain();
    const now = this.audioContext.currentTime;
    oscillator.type = "sawtooth";
    oscillator.frequency.setValueAtTime(160, now);
    oscillator.frequency.exponentialRampToValueAtTime(35, now + 0.22);
    gain.gain.setValueAtTime(0.07, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
    oscillator.connect(gain).connect(this.audioContext.destination);
    oscillator.start(now);
    oscillator.stop(now + 0.22);
  }
}
