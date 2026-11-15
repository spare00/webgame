import Phaser from "phaser";

const WIDTH = 860;
const HEIGHT = 540;
type Actor = { x: number; y: number; hp: number; radius: number; speed: number; phase: number };
type Shot = { x: number; y: number; vx: number; vy: number; life: number };
type Particle = { x: number; y: number; vx: number; vy: number; life: number; color: number };

class CrystalArena extends Phaser.Scene {
  private graphics!: Phaser.GameObjects.Graphics;
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private hud!: Phaser.GameObjects.Text;
  private player = { x: WIDTH / 2, y: HEIGHT / 2, hp: 5, invulnerable: 0, dash: 0, dashCooldown: 0 };
  private enemies: Actor[] = [];
  private shots: Shot[] = [];
  private particles: Particle[] = [];
  private score = 0;
  private best = Number(localStorage.getItem("crystalArenaBest") || 0);
  private elapsed = 0;
  private spawnTimer = 0;
  private shotTimer = 0;
  private ended = false;
  private muted = false;
  private audio?: AudioContext;
  private soundLabel!: Phaser.GameObjects.Text;
  private overlay: Phaser.GameObjects.Container | undefined;
  private stars = Array.from({ length: 70 }, () => ({ x: Math.random() * WIDTH, y: Math.random() * HEIGHT, r: 0.5 + Math.random() * 1.5 }));

  constructor() { super("CrystalArena"); }

  create(): void {
    this.graphics = this.add.graphics();
    this.hud = this.add.text(24, 18, "", { fontFamily: "system-ui, sans-serif", fontSize: "15px", color: "#e9f5ff", fontStyle: "bold" }).setDepth(2);
    this.soundLabel = this.add.text(WIDTH - 24, 20, "♫ SOUND ON [M]", { fontFamily: "system-ui, sans-serif", fontSize: "12px", color: "#9bf4d8" }).setOrigin(1, 0).setDepth(2).setInteractive({ useHandCursor: true });
    this.soundLabel.on("pointerdown", () => this.toggleSound());
    this.keys = this.input.keyboard!.addKeys({
      up: Phaser.Input.Keyboard.KeyCodes.W, left: Phaser.Input.Keyboard.KeyCodes.A,
      down: Phaser.Input.Keyboard.KeyCodes.S, right: Phaser.Input.Keyboard.KeyCodes.D,
      fire: Phaser.Input.Keyboard.KeyCodes.SPACE, dash: Phaser.Input.Keyboard.KeyCodes.SHIFT,
      restart: Phaser.Input.Keyboard.KeyCodes.R, mute: Phaser.Input.Keyboard.KeyCodes.M,
    }) as Record<string, Phaser.Input.Keyboard.Key>;
    this.input.keyboard!.addCapture([Phaser.Input.Keyboard.KeyCodes.SPACE, Phaser.Input.Keyboard.KeyCodes.SHIFT, Phaser.Input.Keyboard.KeyCodes.M]);
    this.input.keyboard!.on("keydown", () => this.enableAudio());
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => { void this.audio?.close(); });
    this.input.on("pointerdown", () => { if (this.ended) this.restart(); else this.enableAudio(); });
    this.draw();
  }

  update(_time: number, delta: number): void {
    if (Phaser.Input.Keyboard.JustDown(this.keys.mute)) this.toggleSound();
    if (Phaser.Input.Keyboard.JustDown(this.keys.restart) && this.ended) { this.restart(); return; }
    if (this.ended) return;
    const dt = Math.min(delta / 1000, 0.05);
    this.elapsed += dt;
    this.spawnTimer += dt;
    this.shotTimer -= delta;
    this.player.invulnerable = Math.max(0, this.player.invulnerable - delta);
    this.player.dash = Math.max(0, this.player.dash - delta);
    this.player.dashCooldown = Math.max(0, this.player.dashCooldown - delta);

    let dx = Number(this.keys.right.isDown) - Number(this.keys.left.isDown);
    let dy = Number(this.keys.down.isDown) - Number(this.keys.up.isDown);
    const moving = dx !== 0 || dy !== 0;
    if (moving) {
      const length = Math.hypot(dx, dy);
      dx /= length; dy /= length;
    }
    if (Phaser.Input.Keyboard.JustDown(this.keys.dash) && moving && this.player.dashCooldown === 0) {
      this.player.dash = 170;
      this.player.dashCooldown = 1000;
      this.player.invulnerable = 220;
      this.playTone(180, 0.1, "sawtooth", 0.035);
      this.playTone(520, 0.12, "triangle", 0.025, 0.045);
      this.burst(this.player.x, this.player.y, 9, 0x76ffe0);
    }
    const speed = this.player.dash > 0 ? 630 : 230;
    this.player.x = Phaser.Math.Clamp(this.player.x + dx * speed * dt, 24, WIDTH - 24);
    this.player.y = Phaser.Math.Clamp(this.player.y + dy * speed * dt, 64, HEIGHT - 24);

    const pointer = this.input.activePointer;
    if ((this.keys.fire.isDown || pointer.isDown) && this.shotTimer <= 0) {
      this.shoot(pointer.worldX, pointer.worldY);
      this.shotTimer = 190;
    }
    const spawnDelay = Math.max(0.36, 1.25 - this.elapsed * 0.009);
    if (this.spawnTimer >= spawnDelay) { this.spawnTimer = 0; this.spawnEnemy(); }

    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const enemy = this.enemies[i];
      const angle = Math.atan2(this.player.y - enemy.y, this.player.x - enemy.x);
      enemy.x += Math.cos(angle) * enemy.speed * dt;
      enemy.y += Math.sin(angle) * enemy.speed * dt;
      enemy.phase += dt * 5;
      if (Phaser.Math.Distance.Between(enemy.x, enemy.y, this.player.x, this.player.y) < enemy.radius + 13 && this.player.invulnerable <= 0) {
        this.player.hp--;
        this.player.invulnerable = 850;
        this.playTone(105, 0.24, "sawtooth", 0.065);
        this.burst(this.player.x, this.player.y, 12, 0xff647d);
        if (this.player.hp <= 0) { this.endGame(); break; }
      }
    }
    for (let i = this.shots.length - 1; i >= 0; i--) {
      const shot = this.shots[i];
      shot.x += shot.vx * dt; shot.y += shot.vy * dt; shot.life -= dt;
      let hit = false;
      for (let j = this.enemies.length - 1; j >= 0; j--) {
        const enemy = this.enemies[j];
        if (Phaser.Math.Distance.Between(shot.x, shot.y, enemy.x, enemy.y) < enemy.radius + 5) {
          enemy.hp--; hit = true;
          this.burst(shot.x, shot.y, 4, 0x8fffe5);
          if (enemy.hp <= 0) { this.score += enemy.radius > 19 ? 30 : 10; this.playTone(enemy.radius > 19 ? 250 : 740, enemy.radius > 19 ? 0.16 : 0.075, "triangle", 0.04); this.burst(enemy.x, enemy.y, 13, enemy.radius > 19 ? 0xffa45e : 0x76ffe0); this.enemies.splice(j, 1); }
          break;
        }
      }
      if (hit || shot.life <= 0) this.shots.splice(i, 1);
    }
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i]; p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt;
      if (p.life <= 0) this.particles.splice(i, 1);
    }
    this.hud.setText(`💠 ${this.score}   BEST ${this.best}     ♥ ${"◆".repeat(this.player.hp)}${"◇".repeat(5 - this.player.hp)}     WAVE ${Math.floor(this.elapsed / 15) + 1}     DASH ${this.player.dashCooldown ? "…" : "READY"}`);
    this.draw();
  }

  private shoot(x: number, y: number): void {
    const angle = Math.atan2(y - this.player.y, x - this.player.x);
    this.shots.push({ x: this.player.x + Math.cos(angle) * 19, y: this.player.y + Math.sin(angle) * 19, vx: Math.cos(angle) * 540, vy: Math.sin(angle) * 540, life: 1.25 });
    this.playTone(460, 0.045, "square", 0.018);
  }

  private enableAudio(): void {
    if (this.muted) return;
    try {
      const AudioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextClass) return;
      this.audio ??= new AudioContextClass();
      if (this.audio.state === "suspended") void this.audio.resume();
    } catch { this.audio = undefined; }
  }

  private playTone(frequency: number, duration: number, type: OscillatorType, volume: number, delay = 0): void {
    if (this.muted || !this.audio || this.audio.state === "closed") return;
    try {
      const start = this.audio.currentTime + delay;
      const oscillator = this.audio.createOscillator();
      const gain = this.audio.createGain();
      oscillator.type = type;
      oscillator.frequency.setValueAtTime(frequency, start);
      gain.gain.setValueAtTime(volume, start);
      gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
      oscillator.connect(gain).connect(this.audio.destination);
      oscillator.start(start);
      oscillator.stop(start + duration);
    } catch { /* Audio must never interrupt gameplay. */ }
  }

  private toggleSound(): void {
    this.muted = !this.muted;
    this.soundLabel.setText(this.muted ? "♫ SOUND OFF [M]" : "♫ SOUND ON [M]").setColor(this.muted ? "#94a3b8" : "#9bf4d8");
    if (!this.muted) { this.enableAudio(); this.playTone(660, 0.12, "triangle", 0.04); }
  }

  private spawnEnemy(): void {
    const edge = Math.floor(Math.random() * 4);
    const x = edge === 0 ? -20 : edge === 1 ? WIDTH + 20 : Math.random() * WIDTH;
    const y = edge === 2 ? -20 : edge === 3 ? HEIGHT + 20 : 64 + Math.random() * (HEIGHT - 88);
    const brute = this.elapsed > 15 && Math.random() < 0.22;
    this.enemies.push({ x, y, hp: brute ? 3 : 1, radius: brute ? 21 : 14, speed: (brute ? 54 : 76) + Math.min(this.elapsed * 0.55, 45), phase: Math.random() * 6 });
  }

  private burst(x: number, y: number, count: number, color: number): void {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2, speed = 35 + Math.random() * 170;
      this.particles.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life: 0.25 + Math.random() * 0.35, color });
    }
  }

  private endGame(): void {
    this.ended = true;
    if (this.score > this.best) {
      this.best = this.score;
      localStorage.setItem("crystalArenaBest", String(this.best));
    }
    this.playTone(180, 0.45, "sawtooth", 0.05);
    this.overlay = this.add.container(0, 0, [
      this.add.rectangle(WIDTH / 2, HEIGHT / 2, WIDTH, HEIGHT, 0x070b17, 0.78),
      this.add.text(WIDTH / 2, 220, "ARENA OVER", { fontSize: "38px", fontFamily: "system-ui, sans-serif", color: "#f4fbff", fontStyle: "bold" }).setOrigin(0.5),
      this.add.text(WIDTH / 2, 270, `SCORE  ${this.score}`, { fontSize: "22px", fontFamily: "system-ui, sans-serif", color: "#8df4ca" }).setOrigin(0.5),
      this.add.text(WIDTH / 2, 308, `BEST  ${this.best}`, { fontSize: "16px", fontFamily: "system-ui, sans-serif", color: "#f0ca7a" }).setOrigin(0.5),
      this.add.text(WIDTH / 2, 346, "R 키 또는 화면을 눌러 다시 시작", { fontSize: "15px", fontFamily: "system-ui, sans-serif", color: "#b9c8e4" }).setOrigin(0.5),
    ]).setDepth(5);
  }

  private restart(): void {
    this.overlay?.destroy(); this.overlay = undefined;
    this.player = { x: WIDTH / 2, y: HEIGHT / 2, hp: 5, invulnerable: 0, dash: 0, dashCooldown: 0 };
    this.enemies = []; this.shots = []; this.particles = [];
    this.score = 0; this.elapsed = 0; this.spawnTimer = 0; this.shotTimer = 0; this.ended = false;
  }

  private draw(): void {
    const g = this.graphics;
    g.clear().fillStyle(0x0b1020).fillRect(0, 0, WIDTH, HEIGHT);
    g.fillStyle(0x9edbff, 0.28);
    for (const star of this.stars) g.fillCircle(star.x, star.y, star.r);
    g.lineStyle(1, 0x6f93c5, 0.08);
    for (let x = 0; x <= WIDTH; x += 40) g.lineBetween(x, 50, x, HEIGHT);
    for (let y = 50; y <= HEIGHT; y += 40) g.lineBetween(0, y, WIDTH, y);
    g.lineStyle(2, 0x83dfd2, 0.25).strokeRoundedRect(12, 58, WIDTH - 24, HEIGHT - 70, 16);
    for (const shot of this.shots) { g.fillStyle(0x9effe3, 0.2).fillCircle(shot.x, shot.y, 10); g.fillStyle(0xd8fff4).fillCircle(shot.x, shot.y, 3.5); }
    for (const enemy of this.enemies) {
      const r = enemy.radius + Math.sin(enemy.phase) * 1.5;
      g.fillStyle(enemy.radius > 19 ? 0xff815f : 0xcf5f90, 0.15).fillCircle(enemy.x, enemy.y, r + 8);
      g.fillStyle(enemy.radius > 19 ? 0xa83c4a : 0x873c73).fillCircle(enemy.x, enemy.y, r);
      g.lineStyle(2, enemy.radius > 19 ? 0xffb07b : 0xffa1c5, 0.9).strokeCircle(enemy.x, enemy.y, r);
      g.fillStyle(0xffe8cf).fillCircle(enemy.x - 4, enemy.y - 2, 2).fillCircle(enemy.x + 4, enemy.y - 2, 2);
      if (enemy.hp > 1) g.fillStyle(0xffd07a).fillRect(enemy.x - 12, enemy.y - r - 8, 24 * enemy.hp / 3, 3);
    }
    for (const p of this.particles) { g.fillStyle(p.color, Phaser.Math.Clamp(p.life * 2, 0, 1)).fillCircle(p.x, p.y, Math.max(1, p.life * 7)); }
    const pointer = this.input.activePointer, angle = Math.atan2(pointer.worldY - this.player.y, pointer.worldX - this.player.x);
    if (this.player.invulnerable <= 0 || Math.floor(this.player.invulnerable / 90) % 2 === 0) {
      g.fillStyle(0x57dbc6, 0.18).fillCircle(this.player.x, this.player.y, 22);
      g.fillStyle(0x9bf4d8).fillCircle(this.player.x, this.player.y, 13);
      g.fillStyle(0x2b8ca1).fillTriangle(this.player.x + Math.cos(angle) * 18, this.player.y + Math.sin(angle) * 18, this.player.x + Math.cos(angle + 2.35) * 11, this.player.y + Math.sin(angle + 2.35) * 11, this.player.x + Math.cos(angle - 2.35) * 11, this.player.y + Math.sin(angle - 2.35) * 11);
    }
    if (this.player.dashCooldown > 0) g.lineStyle(2, 0x85ffe0, 0.5).strokeCircle(this.player.x, this.player.y, 25);
  }
}

new Phaser.Game({
  type: Phaser.AUTO,
  parent: "game",
  width: WIDTH,
  height: HEIGHT,
  backgroundColor: "#0b1020",
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  scene: [CrystalArena],
});
