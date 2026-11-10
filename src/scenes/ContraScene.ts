import Phaser from "phaser";

const WIDTH = 800;
const STAGE_DURATION = 30_000;
const SHOOT_INTERVAL = 400;

export class ContraScene extends Phaser.Scene {
  private player!: Phaser.GameObjects.Image;
  private ground!: Phaser.GameObjects.Rectangle;
  private bullets!: Phaser.Physics.Arcade.Group;
  private enemies!: Phaser.Physics.Arcade.Group;
  private lifePickups!: Phaser.Physics.Arcade.Group;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private shootKey!: Phaser.Input.Keyboard.Key;
  private scoreText!: Phaser.GameObjects.Text;
  private highScoreText!: Phaser.GameObjects.Text;
  private stageText!: Phaser.GameObjects.Text;
  private lifeText!: Phaser.GameObjects.Text;
  private gameOverObjects: Phaser.GameObjects.GameObject[] = [];
  private trees: Phaser.GameObjects.Image[] = [];
  private score = 0;
  private highScore = Number(localStorage.getItem("contraHighScore") || 0);
  private life = 3;
  private stage = 1;
  private gameTime = 0;
  private shootCooldown = 0;
  private invulnerabilityRemaining = 0;
  private blinkElapsed = 0;
  private gameOver = false;
  private audioContext?: AudioContext;
  private bgmTimer?: number;
  private bgmNote = 0;

  constructor() {
    super("ContraScene");
  }

  create(): void {
    this.physics.world.setBounds(0, 0, WIDTH, 400);
    this.add.rectangle(WIDTH / 2, 150, WIDTH, 300, 0x14283a);
    this.ground = this.add.rectangle(WIDTH / 2, 359, WIDTH, 82, 0x333333);
    this.physics.add.existing(this.ground, true);

    this.createEnvironmentTextures();
    for (let i = 0; i < 8; i++) {
      const tree = Math.random() < 0.5 ? "contra-pine" : "contra-broadleaf";
      this.trees.push(this.add.image(Math.random() * WIDTH, 300, tree).setOrigin(0.5, 1).setScale(0.75 + Math.random() * 0.55));
    }

    this.createCarTexture();
    this.player = this.add.image(364, 298, "contra-car");
    this.physics.add.existing(this.player);
    const playerBody = this.player.body as Phaser.Physics.Arcade.Body;
    playerBody.setSize(50, 20).setOffset(3, 15).setCollideWorldBounds(true);
    this.physics.add.collider(this.player, this.ground);

    this.bullets = this.physics.add.group();
    this.enemies = this.physics.add.group();
    this.lifePickups = this.physics.add.group();
    this.physics.add.overlap(this.bullets, this.enemies, this.onBulletHit);
    this.physics.add.overlap(this.player, this.enemies, this.onPlayerHit);
    this.physics.add.overlap(this.player, this.lifePickups, this.onLifePickup);
    this.physics.add.collider(this.lifePickups, this.ground);

    this.cursors = this.input.keyboard!.createCursorKeys();
    this.shootKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
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
      if (Phaser.Input.Keyboard.JustDown(this.shootKey)) this.restartGame();
      return;
    }

    if (this.invulnerabilityRemaining > 0) {
      this.invulnerabilityRemaining = Math.max(0, this.invulnerabilityRemaining - delta);
      this.blinkElapsed += delta;
      this.player.setVisible(this.invulnerabilityRemaining === 0 || Math.floor(this.blinkElapsed / 70) % 2 === 0);
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
      const image = enemy as Phaser.GameObjects.Image;
      const enemyBody = image.body as Phaser.Physics.Arcade.Body;
      enemyBody.setVelocityX(-(180 + stageSpeed * 60));
      if (image.x < -40) image.destroy();
    }
    for (const bullet of this.bullets.getChildren()) {
      const rectangle = bullet as Phaser.GameObjects.Rectangle;
      if (rectangle.x > WIDTH + 10 || rectangle.y < -10) rectangle.destroy();
    }
    for (const tree of this.trees) {
      tree.x -= 3;
      if (tree.x < -50) tree.setX(WIDTH + Math.random() * 120);
    }

    const timeScale = delta / 16.67;
    if (Math.random() < Math.min(0.02 + (this.stage - 1) * 0.005, 0.08) * timeScale) this.spawnEnemy(false);
    if (Math.random() < Math.min(0.015 + (this.stage - 1) * 0.004, 0.06) * timeScale) this.spawnEnemy(true);
  }

  private shoot(): void {
    this.playTone(880, 0.07, "square", 0.04);
    const x = this.player.x + 28;
    const y = this.player.y + 8;
    for (const [dx, dy] of [[360, 0], [0, -360]]) {
      const bullet = this.add.rectangle(x, y, 4, 4, 0xffff00);
      this.bullets.add(bullet);
      const body = bullet.body as Phaser.Physics.Arcade.Body;
      body.setAllowGravity(false);
      body.setVelocity(dx, dy);
    }
  }

  private spawnEnemy(air: boolean): void {
    const armored = !air && Math.random() < 0.15;
    const enemy = this.add.image(
      WIDTH + Math.random() * 200,
      air ? 80 + Math.random() * 80 : 309,
      air ? "contra-airship" : armored ? "contra-armored-tank" : "contra-tank",
    );
    enemy.setData("score", air ? 200 : 100);
    enemy.setData("armored", armored);
    enemy.setData("air", air);
    this.enemies.add(enemy);
    const body = enemy.body as Phaser.Physics.Arcade.Body;
    body.setAllowGravity(false);
    body.setSize(air ? 60 : 48, air ? 22 : 16).setOffset(air ? 6 : 2, air ? 9 : 7);
    body.setVelocityX(-(180 + Math.min(this.stage - 1, 5) * 60));
  }

  private onBulletHit: Phaser.Types.Physics.Arcade.ArcadePhysicsCallback = (bulletObject, enemyObject): void => {
    const bullet = bulletObject as unknown as Phaser.GameObjects.Rectangle;
    const enemy = enemyObject as unknown as Phaser.GameObjects.Image;
    if (!bullet.active || !enemy.active) return;
    if (enemy.getData("armored")) {
      bullet.destroy();
      const spark = this.add.circle(bullet.x, bullet.y, 4, 0xa8f4ff).setDepth(3);
      this.tweens.add({ targets: spark, scale: 2.4, alpha: 0, duration: 160, onComplete: () => spark.destroy() });
      return;
    }
    this.maybeDropLife(enemy);
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
    const enemy = enemyObject as unknown as Phaser.GameObjects.Image;
    if (!enemy.active || this.gameOver || this.invulnerabilityRemaining > 0) return;
    if (!enemy.getData("armored")) {
      this.maybeDropLife(enemy);
      enemy.destroy();
    }
    this.life--;
    this.invulnerabilityRemaining = 500;
    this.blinkElapsed = 0;
    this.player.setVisible(true);
    this.playExplosion();
    this.updateHud();
    if (this.life <= 0) this.showGameOver();
  }

  private maybeDropLife(enemy: Phaser.GameObjects.Image): void {
    if (enemy.getData("air") || Math.random() >= 0.04) return;
    const pickup = this.add.image(enemy.x, enemy.y, "contra-life").setDepth(2);
    this.lifePickups.add(pickup);
    const body = pickup.body as Phaser.Physics.Arcade.Body;
    body.setAllowGravity(false);
    body.setVelocity(-(180 + Math.min(this.stage - 1, 5) * 60), 105);
    this.tweens.add({ targets: pickup, angle: 360, duration: 1200, repeat: -1 });
  }

  private onLifePickup: Phaser.Types.Physics.Arcade.ArcadePhysicsCallback = (_player, pickupObject): void => {
    const pickup = pickupObject as unknown as Phaser.GameObjects.Image;
    if (!pickup.active) return;
    pickup.destroy();
    this.life++;
    this.updateHud();
    this.playTone(988, 0.18, "triangle", 0.06);
  }

  private updateHud(): void {
    this.scoreText?.setText(`SCORE: ${String(this.score).padStart(6, "0")}`);
    this.highScoreText?.setText(`HI: ${String(this.highScore).padStart(6, "0")}`);
    this.stageText?.setText(`STAGE: ${this.stage}`);
    this.lifeText?.setText(`LIFE: ${this.life}`);
  }

  private showGameOver(): void {
    this.gameOver = true;
    this.explodePlayer();
    this.stopBgm();
    this.gameOverObjects.push(
      this.add.text(WIDTH / 2, 180, "GAME OVER", { color: "#ffffff", fontFamily: "monospace", fontSize: "30px" }).setOrigin(0.5),
      this.add.text(WIDTH / 2, 214, `FINAL SCORE: ${this.score}`, { color: "#ffffff", fontFamily: "monospace", fontSize: "18px" }).setOrigin(0.5),
    );
    const button = this.add.rectangle(WIDTH / 2, 266, 170, 42, 0x00aa00).setInteractive();
    const label = this.add.text(WIDTH / 2, 266, "RESTART (SPACE)", { color: "#ffffff", fontFamily: "monospace", fontSize: "18px" }).setOrigin(0.5);
    button.on("pointerdown", () => this.restartGame());
    this.gameOverObjects.push(button, label);
  }

  private explodePlayer(): void {
    const { x, y } = this.player;
    this.player.setVisible(false);
    const flash = this.add.circle(x, y, 7, 0xfff2a1).setDepth(4);
    this.tweens.add({ targets: flash, scale: 5, alpha: 0, duration: 260, onComplete: () => flash.destroy() });
    const ring = this.add.circle(x, y, 10).setStrokeStyle(3, 0xffa43b).setDepth(4);
    this.tweens.add({ targets: ring, scale: 4, alpha: 0, duration: 420, onComplete: () => ring.destroy() });
    for (let i = 0; i < 12; i++) {
      const angle = (Math.PI * 2 * i) / 12;
      const distance = 28 + Math.random() * 30;
      const spark = this.add.rectangle(x, y, 4, 4, i % 3 === 0 ? 0xfff2a1 : 0xff7043).setDepth(4);
      this.tweens.add({
        targets: spark,
        x: x + Math.cos(angle) * distance,
        y: y + Math.sin(angle) * distance,
        angle: 180 + Math.random() * 360,
        scale: 0,
        alpha: 0,
        duration: 380 + Math.random() * 160,
        ease: "Cubic.easeOut",
        onComplete: () => spark.destroy(),
      });
    }
  }

  private restartGame(): void {
    this.gameOverObjects.forEach((object) => object.destroy());
    this.gameOverObjects = [];
    this.enemies.clear(true, true);
    this.bullets.clear(true, true);
    this.lifePickups.clear(true, true);
    this.player.setPosition(364, 298);
    const body = this.player.body as Phaser.Physics.Arcade.Body;
    body.setVelocity(0, 0);
    this.score = 0;
    this.life = 3;
    this.stage = 1;
    this.gameTime = 0;
    this.shootCooldown = 0;
    this.invulnerabilityRemaining = 0;
    this.blinkElapsed = 0;
    this.player.setVisible(true);
    this.gameOver = false;
    this.updateHud();
    this.startAudio();
    this.startBgm();
  }

  private createCarTexture(): void {
    const art = this.make.graphics({ x: 0, y: 0 });
    // Ground shadow and chunky off-road wheels.
    art.fillStyle(0x071014).fillRect(5, 31, 48, 3);
    art.fillStyle(0x101820).fillRect(9, 22, 14, 12).fillRect(36, 22, 14, 12);
    art.fillStyle(0x53636a).fillRect(12, 25, 8, 7).fillRect(39, 25, 8, 7);
    art.fillStyle(0xc1d1c8).fillRect(14, 27, 4, 3).fillRect(41, 27, 4, 3);
    art.fillStyle(0xffc857).fillRect(15, 26, 2, 2).fillRect(42, 26, 2, 2);

    // Layered green body, raised hood, and armored bumpers.
    art.fillStyle(0x14552c).fillRect(5, 17, 47, 10);
    art.fillStyle(0x21a447).fillRect(8, 13, 34, 12);
    art.fillStyle(0x39d65b).fillRect(12, 14, 26, 3);
    art.fillStyle(0x16843a).fillRect(37, 17, 14, 6);
    art.fillStyle(0x8bff75).fillRect(39, 15, 10, 2);
    art.fillStyle(0x34424a).fillRect(2, 22, 7, 4).fillRect(49, 22, 7, 4);
    art.fillStyle(0xc8d4c5).fillRect(50, 18, 4, 3);
    art.fillStyle(0xf8df72).fillRect(51, 18, 3, 2);

    // Cabin glass, roll bars, roof light, and roof-mounted gun.
    art.fillStyle(0x12442c).fillRect(16, 7, 23, 10);
    art.fillStyle(0x85e6d2).fillRect(19, 9, 7, 6).fillRect(29, 9, 7, 6);
    art.fillStyle(0x267b55).fillRect(27, 8, 2, 8);
    art.fillStyle(0xb4ffd4).fillRect(20, 10, 3, 1).fillRect(30, 10, 3, 1);
    art.fillStyle(0xe9f4bc).fillRect(21, 5, 14, 3);
    art.fillStyle(0x25343b).fillRect(24, 3, 9, 3);
    art.fillStyle(0x56666b).fillRect(27, 1, 8, 3);
    art.fillStyle(0xe9bd57).fillRect(34, 2, 11, 2);
    art.fillStyle(0x25343b).fillRect(43, 1, 5, 4);
    art.fillStyle(0xffdf70).fillRect(26, 4, 5, 1);

    // Door seam and bright side stripe give the silhouette a little depth.
    art.fillStyle(0x0d3828).fillRect(27, 17, 1, 7);
    art.fillStyle(0x9dff55).fillRect(10, 20, 13, 2);
    art.fillStyle(0xefff9a).fillRect(11, 20, 7, 1);
    art.generateTexture("contra-car", 56, 36);
    art.destroy();
  }

  private createEnvironmentTextures(): void {
    const art = this.make.graphics({ x: 0, y: 0 });

    // Layered pine tree.
    art.fillStyle(0x563a27).fillRect(17, 39, 10, 33);
    art.fillStyle(0x153c2b).fillRect(12, 13, 20, 12).fillRect(7, 24, 30, 13).fillRect(2, 36, 40, 14).fillRect(0, 49, 44, 12);
    art.fillStyle(0x247246).fillRect(15, 8, 14, 10).fillRect(10, 20, 24, 10).fillRect(5, 32, 34, 10).fillRect(4, 45, 36, 9);
    art.fillStyle(0x58a65a).fillRect(17, 10, 8, 3).fillRect(12, 22, 10, 3).fillRect(7, 34, 12, 3).fillRect(7, 47, 12, 3);
    art.fillStyle(0x9bc66a).fillRect(18, 10, 4, 1).fillRect(13, 22, 5, 1).fillRect(8, 34, 5, 1);
    art.generateTexture("contra-pine", 44, 72);
    art.clear();

    // Broadleaf tree with a few bright leaf clusters.
    art.fillStyle(0x503824).fillRect(17, 33, 9, 39).fillRect(10, 45, 10, 5).fillRect(22, 39, 11, 5);
    art.fillStyle(0x17452e).fillRect(12, 17, 20, 24).fillRect(4, 23, 18, 22).fillRect(22, 21, 19, 23).fillRect(0, 32, 44, 17);
    art.fillStyle(0x2b7c45).fillRect(13, 15, 15, 15).fillRect(6, 22, 17, 13).fillRect(23, 19, 15, 15).fillRect(3, 31, 37, 11);
    art.fillStyle(0x68ac50).fillRect(14, 17, 7, 4).fillRect(8, 24, 8, 4).fillRect(26, 21, 7, 4).fillRect(8, 34, 10, 3).fillRect(27, 34, 8, 3);
    art.fillStyle(0xb3ce68).fillRect(15, 17, 3, 1).fillRect(9, 24, 4, 1).fillRect(27, 21, 3, 1);
    art.generateTexture("contra-broadleaf", 44, 72);
    art.clear();

    // Enemy airship: segmented hull, gondola, fins, windows, and propeller.
    art.fillStyle(0x142735).fillRect(10, 27, 53, 8).fillRect(28, 34, 18, 4);
    art.fillStyle(0x267a91).fillRect(10, 13, 51, 17).fillRect(5, 17, 12, 10).fillRect(57, 10, 9, 9).fillRect(57, 24, 9, 9);
    art.fillStyle(0x49c7c2).fillRect(14, 10, 38, 19).fillRect(7, 16, 10, 11).fillRect(19, 7, 27, 5);
    art.fillStyle(0x8ce9d1).fillRect(20, 9, 22, 3).fillRect(10, 17, 5, 4).fillRect(22, 13, 6, 6).fillRect(32, 13, 6, 6).fillRect(42, 13, 6, 6);
    art.fillStyle(0xe8f5d0).fillRect(23, 14, 2, 2).fillRect(33, 14, 2, 2).fillRect(43, 14, 2, 2);
    art.fillStyle(0xf6bd56).fillRect(26, 30, 17, 5).fillRect(29, 35, 11, 2);
    art.fillStyle(0x5a7380).fillRect(62, 18, 3, 6).fillRect(60, 20, 7, 2);
    art.generateTexture("contra-airship", 72, 40);
    art.clear();

    // Armored crawler coming from ahead, with tracks, turret, and warning lights.
    art.fillStyle(0x171b1c).fillRect(3, 21, 48, 10);
    art.fillStyle(0x58605a).fillRect(7, 23, 39, 6);
    art.fillStyle(0xa3a78a).fillRect(10, 24, 5, 4).fillRect(21, 24, 5, 4).fillRect(33, 24, 5, 4).fillRect(42, 24, 4, 4);
    art.fillStyle(0x5b3026).fillRect(3, 15, 48, 10);
    art.fillStyle(0xa54832).fillRect(9, 12, 38, 12);
    art.fillStyle(0xd16b42).fillRect(14, 13, 26, 4).fillRect(7, 17, 39, 3);
    art.fillStyle(0x6a3828).fillRect(20, 7, 22, 8);
    art.fillStyle(0xc15c37).fillRect(23, 7, 17, 5);
    art.fillStyle(0x44332d).fillRect(7, 9, 20, 3).fillRect(4, 10, 9, 2);
    art.fillStyle(0x252b2b).fillRect(2, 8, 5, 5);
    art.fillStyle(0xf6c75e).fillRect(6, 18, 4, 3).fillRect(44, 18, 4, 3);
    art.fillStyle(0xe9a54d).fillRect(7, 19, 2, 1).fillRect(45, 19, 2, 1);
    art.fillStyle(0x292d2d).fillRect(49, 15, 5, 10);
    art.generateTexture("contra-tank", 56, 32);
    art.clear();

    // Heavy armored tank: broad plated hull, angular turret, and shield insignia.
    art.fillStyle(0x09141f).fillRect(2, 21, 52, 10);
    art.fillStyle(0x334c60).fillRect(6, 23, 44, 6);
    art.fillStyle(0x91c6d5).fillRect(10, 24, 6, 4).fillRect(23, 24, 7, 4).fillRect(39, 24, 6, 4);
    art.fillStyle(0x16384d).fillRect(4, 14, 48, 11);
    art.fillStyle(0x247a95).fillRect(8, 11, 39, 13);
    art.fillStyle(0x5de2e8).fillRect(12, 12, 29, 4);
    art.fillStyle(0x164c66).fillRect(17, 6, 23, 9);
    art.fillStyle(0x55bed0).fillRect(20, 7, 16, 5);
    art.fillStyle(0xb5faff).fillRect(24, 7, 8, 2);
    art.fillStyle(0x102d3d).fillRect(34, 8, 18, 3);
    art.fillStyle(0x9fffff).fillRect(48, 7, 6, 5);
    art.fillStyle(0xffd46b).fillRect(7, 17, 5, 3).fillRect(44, 17, 5, 3);
    art.fillStyle(0xe8fbff).fillRect(24, 17, 8, 2);
    art.fillStyle(0x36bdd0).fillRect(26, 18, 4, 4);
    art.generateTexture("contra-armored-tank", 56, 32);
    art.destroy();

    const pickup = this.make.graphics({ x: 0, y: 0 });
    pickup.fillStyle(0x063627).fillCircle(12, 12, 11);
    pickup.fillStyle(0x28d987).fillCircle(12, 12, 9);
    pickup.lineStyle(1, 0xc6ffe4).strokeCircle(12, 12, 8);
    pickup.fillStyle(0xf1fff7).fillRoundedRect(10, 5, 4, 14, 1).fillRoundedRect(5, 10, 14, 4, 1);
    pickup.generateTexture("contra-life", 24, 24);
    pickup.destroy();
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
