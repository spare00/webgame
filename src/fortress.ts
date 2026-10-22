import Phaser from "phaser";

const WIDTH = 1040;
const HEIGHT = 620;
const GROUND_BASE = 430;
const TANK_HEIGHT = 8;
const MAX_MOVE = 40;
const MAX_CLIMB_PER_MOVE = 3;
const GRAVITY = 0.15;
const DAMAGE = 1.3;
const COLORS = [0xff6078, 0x68a6ff] as const;
type Player = { x: number; y: number; vy: number; angle: number; power: number; hp: number; alive: boolean; move: number };
type Projectile = { x: number; y: number; vx: number; vy: number; trail: { x: number; y: number }[] };
type Blast = { x: number; y: number; radius: number; life: number; maxLife: number };

class FortressScene extends Phaser.Scene {
  private backdrop!: Phaser.GameObjects.Graphics;
  private graphics!: Phaser.GameObjects.Graphics;
  private terrainTexture!: Phaser.Textures.CanvasTexture;
  private terrainSurface: number[] = [];
  private terrainSolid = new Uint8Array(WIDTH * HEIGHT);
  private players: [Player, Player] = [this.newPlayer(120, 45), this.newPlayer(920, 135)];
  private current = 0;
  private wind = 0;
  private projectile: Projectile | null = null;
  private blast: Blast | null = null;
  private gameOver = false;
  private gameOverPending = false;
  private winner = -1;
  private flightTimer?: Phaser.Time.TimerEvent;
  private endTimer?: Phaser.Time.TimerEvent;
  private stars: { x: number; y: number; alpha: number }[] = [];
  private hud: Phaser.GameObjects.Text[] = [];
  private restartButton!: Phaser.GameObjects.Rectangle;
  private restartLabel!: Phaser.GameObjects.Text;
  private gameOverTitle!: Phaser.GameObjects.Text;
  private gameOverSubtitle!: Phaser.GameObjects.Text;
  private audio?: AudioContext;

  constructor() { super("Fortress"); }

  create(): void {
    this.backdrop = this.add.graphics();
    this.graphics = this.add.graphics();
    if (this.textures.exists("fortress-ground")) this.textures.remove("fortress-ground");
    this.terrainTexture = this.textures.createCanvas("fortress-ground", WIDTH, HEIGHT)!;
    this.add.image(0, 0, "fortress-ground").setOrigin(0).setDepth(1);
    this.graphics.setDepth(2);
    this.stars = Array.from({ length: 55 }, () => ({ x: Math.random() * WIDTH, y: 125 + Math.random() * 240, alpha: 0.25 + Math.random() * 0.5 }));
    this.hud = [
      this.add.text(40, 34, "", this.textStyle(17, "#ff6078")),
      this.add.text(40, 64, "", this.textStyle(12, "#e4ebf8")),
      this.add.text(WIDTH - 40, 34, "", this.textStyle(17, "#68a6ff")).setOrigin(1, 0),
      this.add.text(WIDTH - 40, 64, "", this.textStyle(12, "#e4ebf8")).setOrigin(1, 0),
      this.add.text(WIDTH / 2, 40, "", this.textStyle(16, "#dbe8ff")).setOrigin(0.5, 0),
      this.add.text(WIDTH / 2, 70, "", this.textStyle(12, "#9eb0cf")).setOrigin(0.5, 0),
    ];
    this.restartButton = this.add.rectangle(WIDTH / 2, 386, 220, 48, 0x24416a)
      .setStrokeStyle(1, 0x8ba9d6).setInteractive({ useHandCursor: true }).setDepth(4).setVisible(false);
    this.restartLabel = this.add.text(WIDTH / 2, 386, "PLAY AGAIN", this.textStyle(14, "#f2f6ff"))
      .setOrigin(0.5).setDepth(5).setVisible(false);
    this.gameOverTitle = this.add.text(WIDTH / 2, 280, "", this.textStyle(28, "#f2f6ff"))
      .setOrigin(0.5).setDepth(3).setVisible(false);
    this.gameOverSubtitle = this.add.text(WIDTH / 2, 326, "FORTRESS DESTROYED", this.textStyle(13, "#9db0d3"))
      .setOrigin(0.5).setDepth(3).setVisible(false);
    this.restartButton.on("pointerover", () => this.restartButton.setFillStyle(0x315787));
    this.restartButton.on("pointerout", () => this.restartButton.setFillStyle(0x24416a));
    this.restartButton.on("pointerdown", () => this.scene.restart());

    this.input.keyboard?.addCapture(["UP", "DOWN", "LEFT", "RIGHT", "A", "D", "SPACE", "R"]);
    this.input.keyboard?.on("keydown", this.onKeyDown, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.input.keyboard?.off("keydown", this.onKeyDown, this);
      this.flightTimer?.remove();
      this.endTimer?.remove();
      void this.audio?.close();
      this.audio = undefined;
    });
    this.resetGame();
  }

  update(_time: number, delta: number): void {
    if (this.projectile && !this.gameOverPending) {
      const scale = delta / 16.667;
      for (let i = 0; i < scale; i++) {
        const shot = this.projectile;
        shot.x += shot.vx + this.wind;
        shot.y += shot.vy;
        shot.vy += GRAVITY;
        shot.trail.push({ x: shot.x, y: shot.y });
        if (shot.trail.length > 12) shot.trail.shift();
        if (shot.x < 0 || shot.x >= WIDTH || this.isSolid(shot.x, shot.y)) {
          this.explode(shot.x, Math.min(HEIGHT - 24, shot.y));
          break;
        }
      }
    }
    if (this.blast) {
      this.blast.life -= delta;
      if (this.blast.life <= 0) this.blast = null;
    }
    this.updateTanks(delta);
    this.draw();
  }

  private newPlayer(x: number, angle: number): Player {
    return { x, y: 0, vy: 0, angle, power: 9, hp: 100, alive: true, move: MAX_MOVE };
  }

  private resetGame(): void {
    this.flightTimer?.remove();
    this.endTimer?.remove();
    this.current = 0;
    this.gameOver = false;
    this.gameOverPending = false;
    this.winner = -1;
    this.restartButton.setVisible(false);
    this.restartLabel.setVisible(false);
    this.gameOverTitle.setVisible(false);
    this.gameOverSubtitle.setVisible(false);
    this.projectile = null;
    this.blast = null;
    this.players = [this.newPlayer(120, 45), this.newPlayer(WIDTH - 120, 135)];
    this.terrainSurface = Array.from({ length: WIDTH }, (_, x) => Math.floor(GROUND_BASE + Math.sin(x * 0.009) * 32 + Math.sin(x * 0.023) * 12));
    this.terrainSolid.fill(0);
    this.terrainSurface.forEach((surface, x) => {
      for (let y = surface; y < HEIGHT; y++) this.terrainSolid[y * WIDTH + x] = 1;
    });
    this.paintTerrain();
    this.players.forEach((player) => { player.y = this.tankFloorAt(player.x); });
    this.newTurn();
  }

  private newTurn(): void {
    this.wind = Number((Math.random() * 2 - 1).toFixed(2));
    this.players[this.current].move = MAX_MOVE;
    this.projectile = null;
  }

  private onKeyDown(event: KeyboardEvent): void {
    const key = event.key.toLowerCase();
    if (key === "r") { if (!event.repeat) this.scene.restart(); return; }
    if (this.gameOver || this.gameOverPending || this.projectile) return;
    const player = this.players[this.current];
    if (!player.alive) return;
    this.startAudio();
    const angleDirection = this.current === 0 ? 1 : -1;
    switch (key) {
      case "arrowup": player.angle = Phaser.Math.Clamp(player.angle + 2 * angleDirection, 0, 180); break;
      case "arrowdown": player.angle = Phaser.Math.Clamp(player.angle - 2 * angleDirection, 0, 180); break;
      case "arrowright": player.power = Phaser.Math.Clamp(player.power + (this.current === 0 ? 0.5 : -0.5), 2, 15); break;
      case "arrowleft": player.power = Phaser.Math.Clamp(player.power + (this.current === 0 ? -0.5 : 0.5), 2, 15); break;
      case "a": this.movePlayer(-2); break;
      case "d": this.movePlayer(2); break;
      case " ": this.fire(); break;
      default: return;
    }
    event.preventDefault();
  }

  private movePlayer(dx: number): void {
    const player = this.players[this.current];
    if (player.move <= 0) return;
    const nextX = Phaser.Math.Clamp(player.x + dx, 20, WIDTH - 20);
    const other = this.players[1 - this.current];
    if (other.alive && Math.abs(nextX - other.x) < 36) return;
    let nextY = player.y;
    while (nextY > player.y - MAX_CLIMB_PER_MOVE && !this.tankFits(nextX, nextY)) nextY--;
    if (!this.tankFits(nextX, nextY)) return;
    player.x = nextX;
    player.y = nextY;
    player.vy = 0;
    player.move -= Math.abs(dx);
  }

  private fire(): void {
    const player = this.players[this.current];
    const radians = player.angle * Math.PI / 180;
    const muzzleX = player.x + Math.cos(radians) * 24;
    const muzzleY = player.y - TANK_HEIGHT - Math.sin(radians) * 24;
    this.projectile = {
      x: muzzleX,
      y: muzzleY,
      vx: Math.cos(radians) * player.power,
      vy: -Math.sin(radians) * player.power,
      trail: [],
    };
    this.playTone(600, 0.15, 0.09);
  }

  private explode(x: number, y: number): void {
    const blastRadius = 28;
    this.playTone(110, 0.4, 0.13);
    this.blast = { x, y, radius: blastRadius, life: 320, maxLife: 320 };
    this.clearSoil(x, y, blastRadius);
    this.players.forEach((player, index) => {
      if (!player.alive) return;
      const distance = Phaser.Math.Distance.Between(player.x, player.y, x, y);
      if (distance < blastRadius) player.hp = Math.max(0, player.hp - Math.floor((blastRadius - distance) * 2 * DAMAGE));
      if (player.hp === 0) this.killPlayer(index);
    });
    this.projectile = null;
    if (!this.gameOverPending) {
      this.current = 1 - this.current;
      this.flightTimer = this.time.delayedCall(480, () => this.newTurn());
    }
  }

  private killPlayer(index: number): void {
    const player = this.players[index];
    player.alive = false;
    this.gameOverPending = true;
    this.winner = 1 - index;
    this.blast = { x: player.x, y: player.y - 8, radius: 1, life: 900, maxLife: 900 };
    this.playTone(60, 1.2, 0.2);
    this.endTimer = this.time.delayedCall(900, () => {
      this.gameOver = true;
      this.restartButton.setVisible(true);
      this.restartLabel.setVisible(true);
      this.gameOverTitle.setText(`PLAYER ${this.winner + 1} WINS`).setVisible(true);
      this.gameOverSubtitle.setVisible(true);
      [440, 554, 659, 880].forEach((frequency, note) => this.playTone(frequency, 0.25, 0.12, note * 180));
    });
  }

  private groundAt(x: number): number { return this.terrainSurface[Phaser.Math.Clamp(Math.floor(x), 0, WIDTH - 1)] ?? GROUND_BASE; }

  private tankFloorAt(x: number): number {
    let floor = HEIGHT;
    for (let tx = Math.max(0, Math.floor(x - 17)); tx <= Math.min(WIDTH - 1, Math.ceil(x + 17)); tx++) {
      floor = Math.min(floor, this.groundAt(tx));
    }
    return floor;
  }

  private tankFits(x: number, feet: number): boolean {
    const left = Math.floor(x - 17);
    const right = Math.ceil(x + 17);
    const top = Math.floor(feet - 15);
    const bottom = Math.floor(feet - 1);
    for (let y = top; y <= bottom; y++) {
      for (let tx = left; tx <= right; tx++) {
        if (this.isSolid(tx, y)) return false;
      }
    }
    return !this.isSolid(right, bottom) && !this.isSolid(left, bottom);
  }

  private updateTanks(delta: number): void {
    const frames = delta / 16.667;
    for (const player of this.players) {
      if (!player.alive) continue;
      player.vy = Math.min(8, player.vy + 0.34 * frames);
      let remaining = player.vy * frames;
      while (remaining > 0) {
        const step = Math.min(1, remaining);
        if (!this.tankFits(player.x, player.y + step)) {
          player.vy = 0;
          break;
        }
        player.y += step;
        remaining -= step;
      }
      if (player.y > HEIGHT + 20) {
        player.alive = false;
        player.hp = 0;
        this.winner = this.players.indexOf(player) === 0 ? 1 : 0;
        this.gameOverPending = true;
        this.endTimer = this.time.delayedCall(650, () => {
          this.gameOver = true;
          this.restartButton.setVisible(true);
          this.restartLabel.setVisible(true);
          this.gameOverTitle.setText(`PLAYER ${this.winner + 1} WINS`).setVisible(true);
          this.gameOverSubtitle.setVisible(true);
        });
      }
    }
  }

  private isSolid(x: number, y: number): boolean {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    return ix >= 0 && ix < WIDTH && (iy >= HEIGHT || (iy >= 0 && this.terrainSolid[iy * WIDTH + ix] === 1));
  }

  private clearSoil(x: number, y: number, radius: number): void {
    const left = Math.max(0, Math.floor(x - radius));
    const right = Math.min(WIDTH - 1, Math.ceil(x + radius));
    const top = Math.max(0, Math.floor(y - radius));
    const bottom = Math.min(HEIGHT - 1, Math.ceil(y + radius));
    for (let py = top; py <= bottom; py++) {
      for (let px = left; px <= right; px++) {
        if ((px - x) ** 2 + (py - y) ** 2 <= radius ** 2) this.terrainSolid[py * WIDTH + px] = 0;
      }
    }
    for (let px = left; px <= right; px++) {
      for (let py = 0; py < HEIGHT; py++) {
        if (this.terrainSolid[py * WIDTH + px]) { this.terrainSurface[px] = py; break; }
      }
    }
    const context = this.terrainTexture.context;
    context.save();
    context.globalCompositeOperation = "destination-out";
    context.beginPath();
    context.arc(x, y, radius, 0, Math.PI * 2);
    context.fill();
    context.restore();
    this.terrainTexture.refresh();
  }

  private paintTerrain(): void {
    const context = this.terrainTexture.context;
    context.clearRect(0, 0, WIDTH, HEIGHT);
    context.beginPath();
    context.moveTo(0, HEIGHT);
    this.terrainSurface.forEach((surface, x) => context.lineTo(x, surface));
    context.lineTo(WIDTH, HEIGHT);
    context.closePath();
    const fill = context.createLinearGradient(0, GROUND_BASE - 50, 0, HEIGHT);
    fill.addColorStop(0, "#315e48");
    fill.addColorStop(0.14, "#294a3e");
    fill.addColorStop(1, "#172b2c");
    context.fillStyle = fill;
    context.fill();
    this.terrainTexture.refresh();
  }

  private draw(): void {
    const backdrop = this.backdrop;
    const g = this.graphics;
    backdrop.clear();
    g.clear();
    backdrop.fillStyle(0x0c1728).fillRect(0, 0, WIDTH, HEIGHT);
    backdrop.fillStyle(0x111f33).fillRoundedRect(16, 16, WIDTH - 32, HEIGHT - 32, 10);
    this.stars.forEach((star) => backdrop.fillStyle(0xb6d3ff, star.alpha).fillCircle(star.x, star.y, 1.4));

    // Muted dashed center guide separates the two player positions.
    for (let y = 145; y < HEIGHT - 55; y += 15) backdrop.fillStyle(0x8ca1c0, 0.23).fillCircle(WIDTH / 2, y, 1.4);
    backdrop.fillStyle(0x192a41).fillRect(24, 112, WIDTH - 48, 1);

    this.drawTrajectory();
    this.players.forEach((player, index) => this.drawTank(player, index));
    if (this.projectile) {
      this.projectile.trail.forEach((point, index) => g.fillStyle(0xffe5a0, (index + 1) / this.projectile!.trail.length * 0.5).fillCircle(point.x, point.y, 2));
      g.fillStyle(0xfff4c2).fillCircle(this.projectile.x, this.projectile.y, 4);
    }
    this.drawBlast();
    this.drawHud();
    if (this.gameOver) this.drawGameOver();
  }

  private drawTank(player: Player, index: number): void {
    if (!player.alive) return;
    const g = this.graphics;
    const color = COLORS[index];
    g.fillStyle(0x0a111d, 0.5).fillEllipse(player.x, player.y + 2, 36, 7);
    g.fillStyle(color).fillRoundedRect(player.x - 17, player.y - 9, 34, 8, 3);
    g.fillStyle(0x1a2638).fillRoundedRect(player.x - 13, player.y - 14, 26, 6, 3);
    g.fillStyle(color, 0.9).fillCircle(player.x, player.y - 12, 5);
    const radians = player.angle * Math.PI / 180;
    g.lineStyle(4, color, 1).lineBetween(player.x, player.y - 12, player.x + Math.cos(radians) * 21, player.y - 12 - Math.sin(radians) * 21);
    g.fillStyle(0xffffff, 0.7).fillCircle(player.x, player.y - 12, 1.5);
  }

  private drawTrajectory(): void {
    if (this.projectile || this.gameOver || this.gameOverPending) return;
    const player = this.players[this.current];
    const radians = player.angle * Math.PI / 180;
    let x = player.x + Math.cos(radians) * 24;
    let y = player.y - TANK_HEIGHT - Math.sin(radians) * 24;
    let vy = -Math.sin(radians) * player.power;
    const vx = Math.cos(radians) * player.power;
    for (let i = 0; i < 34; i++) {
      x += vx + this.wind;
      y += vy;
      vy += GRAVITY;
      if (i % 2 === 0) this.graphics.fillStyle(COLORS[this.current], 0.15 + 0.25 * (1 - i / 34)).fillCircle(x, y, 2);
      if (x < 0 || x >= WIDTH || this.isSolid(x, y)) break;
    }
  }

  private drawBlast(): void {
    if (!this.blast) return;
    const blast = this.blast;
    const progress = 1 - blast.life / blast.maxLife;
    const radius = blast.maxLife > 400 ? blast.radius + progress * 58 : blast.radius * (0.45 + Math.sin(progress * Math.PI) * 0.8);
    this.graphics.fillStyle(0xffd270, 0.24 * (1 - progress)).fillCircle(blast.x, blast.y, radius);
    this.graphics.lineStyle(3, 0xffd270, 0.8 * (1 - progress)).strokeCircle(blast.x, blast.y, radius);
    this.graphics.fillStyle(0xfff0b0, 0.7 * (1 - progress)).fillCircle(blast.x, blast.y, radius * 0.34);
  }

  private drawHud(): void {
    const active = this.players[this.current];
    const displayAngle = this.current === 0 ? active.angle : 180 - active.angle;
    const state = this.gameOver ? `PLAYER ${this.winner + 1} WINS` : this.gameOverPending ? "DIRECT HIT!" : this.projectile ? "INCOMING!" : `PLAYER ${this.current + 1} TURN`;
    this.hud[0].setText(`PLAYER 1  ·  ${this.players[0].alive ? "ACTIVE" : "DESTROYED"}`);
    this.hud[1].setText(`HP ${this.players[0].hp}    MOVE ${this.players[0].move}`);
    this.hud[2].setText(`PLAYER 2  ·  ${this.players[1].alive ? "ACTIVE" : "DESTROYED"}`);
    this.hud[3].setText(`HP ${this.players[1].hp}    MOVE ${this.players[1].move}`);
    this.hud[4].setText(state).setColor(this.gameOver ? "#ffe08a" : this.current === 0 ? "#ff8292" : "#83b8ff");
    this.hud[5].setText(this.projectile ? `WIND ${this.wind > 0 ? "+" : ""}${this.wind}` : `ANGLE ${displayAngle.toFixed(0)}°   POWER ${active.power.toFixed(1)}   WIND ${this.wind > 0 ? "+" : ""}${this.wind}`);

    const g = this.graphics;
    this.players.forEach((player, index) => {
      const x = index === 0 ? 40 : WIDTH - 160;
      const color = COLORS[index];
      g.fillStyle(0x24334a).fillRoundedRect(x, 92, 120, 7, 3);
      g.fillStyle(color).fillRoundedRect(x, 92, 120 * player.hp / 100, 7, 3);
    });
    // Small wind marker points with the current drift.
    const center = WIDTH / 2;
    g.lineStyle(2, 0x6fd9ee, 0.7).lineBetween(center - 33, 100, center + 33, 100);
    const tip = center + this.wind * 30;
    g.fillStyle(0x6fd9ee, 0.9).fillTriangle(tip, 96, tip, 104, tip + Math.sign(this.wind || 1) * 7, 100);
  }

  private drawGameOver(): void {
    this.graphics.fillStyle(0x050914, 0.74).fillRoundedRect(280, 245, 480, 190, 12);
  }

  private textStyle(size: number, color: string): Phaser.Types.GameObjects.Text.TextStyle {
    return { fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: `${size}px`, color, letterSpacing: size > 15 ? 1 : 0 };
  }

  private startAudio(): void {
    try {
      if (!this.audio) this.audio = new window.AudioContext();
      if (this.audio.state === "suspended") void this.audio.resume().catch(() => undefined);
    } catch { this.audio = undefined; }
  }

  private playTone(frequency: number, duration: number, volume: number, delay = 0): void {
    if (!this.audio) return;
    try {
      const start = this.audio.currentTime + delay / 1000;
      const oscillator = this.audio.createOscillator();
      const gain = this.audio.createGain();
      oscillator.type = "square";
      oscillator.frequency.setValueAtTime(frequency, start);
      gain.gain.setValueAtTime(volume, start);
      gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
      oscillator.connect(gain).connect(this.audio.destination);
      oscillator.start(start);
      oscillator.stop(start + duration);
    } catch { /* Audio availability must not affect the game. */ }
  }
}

new Phaser.Game({
  type: Phaser.AUTO,
  parent: "game",
  width: WIDTH,
  height: HEIGHT,
  backgroundColor: "#0c1728",
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  scene: [FortressScene],
});
