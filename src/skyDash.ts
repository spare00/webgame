import Phaser from "phaser";

const W = 900, H = 520, GROUND = 420;
type Obstacle = { x: number; width: number; height: number; style: number };
type Star = { x: number; y: number; phase: number };
type Spark = { x: number; y: number; vx: number; vy: number; life: number; color: number };

class SkyDash extends Phaser.Scene {
  private g!: Phaser.GameObjects.Graphics;
  private hud!: Phaser.GameObjects.Text;
  private soundLabel!: Phaser.GameObjects.Text;
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private px = 165;
  private py = GROUND - 23;
  private vy = 0;
  private jumps = 0;
  private elapsed = 0;
  private spawnTime = 1.1;
  private score = 0;
  private starsCollected = 0;
  private best = Number(localStorage.getItem("skyDashBest") || 0);
  private obstacles: Obstacle[] = [];
  private stars: Star[] = [];
  private sparks: Spark[] = [];
  private ended = false;
  private muted = false;
  private audio?: AudioContext;
  private overlay?: Phaser.GameObjects.Container;
  private skyStars = Array.from({ length: 90 }, () => ({ x: Math.random() * W, y: Math.random() * (GROUND - 45), r: .5 + Math.random() * 1.5 }));

  constructor() { super("SkyDash"); }

  create(): void {
    this.g = this.add.graphics();
    this.hud = this.add.text(22, 18, "", { fontFamily: "system-ui, sans-serif", fontSize: "16px", color: "#f2f6ff", fontStyle: "bold" }).setDepth(2);
    this.soundLabel = this.add.text(W - 20, 20, "♫ SOUND ON [M]", { fontFamily: "system-ui, sans-serif", fontSize: "12px", color: "#a1e5ff" }).setOrigin(1, 0).setDepth(2).setInteractive({ useHandCursor: true });
    this.soundLabel.on("pointerdown", () => this.toggleSound());
    const kb = this.input.keyboard!;
    this.keys = kb.addKeys({ jump: Phaser.Input.Keyboard.KeyCodes.SPACE, up: Phaser.Input.Keyboard.KeyCodes.UP, w: Phaser.Input.Keyboard.KeyCodes.W, mute: Phaser.Input.Keyboard.KeyCodes.M, restart: Phaser.Input.Keyboard.KeyCodes.R }) as Record<string, Phaser.Input.Keyboard.Key>;
    kb.addCapture([Phaser.Input.Keyboard.KeyCodes.SPACE, Phaser.Input.Keyboard.KeyCodes.UP, Phaser.Input.Keyboard.KeyCodes.M]);
    kb.on("keydown", () => this.enableAudio());
    this.keys.mute.on("down", () => this.toggleSound());
    this.keys.restart.on("down", () => { if (this.ended) this.restart(); });
    this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => { if (this.ended) { this.restart(); return; } this.enableAudio(); if (pointer.y > 70) this.jump(); });
    document.getElementById("jump")?.addEventListener("pointerdown", (event) => { event.preventDefault(); this.enableAudio(); this.jump(); });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => { void this.audio?.close(); });
    this.draw();
  }

  update(_time: number, delta: number): void {
    if (this.ended) return;
    const dt = Math.min(delta / 1000, .04);
    if (Phaser.Input.Keyboard.JustDown(this.keys.jump) || Phaser.Input.Keyboard.JustDown(this.keys.up) || Phaser.Input.Keyboard.JustDown(this.keys.w)) this.jump();
    this.elapsed += dt;
    const speed = Math.min(300 + this.elapsed * 4.2, 570);
    this.score = Math.floor(this.elapsed * 10) + this.starsCollected * 50;
    this.vy += 1540 * dt;
    this.py += this.vy * dt;
    if (this.py >= GROUND - 23) { this.py = GROUND - 23; this.vy = 0; this.jumps = 0; }
    this.spawnTime -= dt;
    if (this.spawnTime <= 0) {
      const height = 28 + Math.random() * 54, width = 24 + Math.random() * 25;
      this.obstacles.push({ x: W + 20, width, height, style: Math.floor(Math.random() * 3) });
      this.spawnTime = Math.max(1.05, 1.6 - this.elapsed * .006) + Math.random() * .35;
      if (Math.random() < .68) this.stars.push({ x: W + 170 + Math.random() * 150, y: GROUND - 65 - Math.random() * 140, phase: Math.random() * 6 });
    }
    for (let i = this.obstacles.length - 1; i >= 0; i--) {
      const o = this.obstacles[i]; o.x -= speed * dt;
      const px1 = this.px - 15, px2 = this.px + 15, py1 = this.py - 23, py2 = this.py + 20, oy = GROUND - o.height;
      if (px2 > o.x + 2 && px1 < o.x + o.width - 2 && py2 > oy + 3 && py1 < GROUND) { this.end(); return; }
      if (o.x + o.width < -8) this.obstacles.splice(i, 1);
    }
    for (let i = this.stars.length - 1; i >= 0; i--) {
      const star = this.stars[i]; star.x -= speed * dt; star.phase += dt * 5;
      if (Phaser.Math.Distance.Between(this.px, this.py - 4, star.x, star.y) < 27) {
        this.stars.splice(i, 1); this.starsCollected++; this.tone(700 + this.starsCollected % 5 * 75, .13, "triangle", .045); this.tone(1020, .15, "sine", .035, .08); this.burst(star.x, star.y, 9, 0xffe18a);
      } else if (star.x < -20) this.stars.splice(i, 1);
    }
    for (let i = this.sparks.length - 1; i >= 0; i--) { const s = this.sparks[i]; s.x += s.vx * dt; s.y += s.vy * dt; s.life -= dt; if (s.life <= 0) this.sparks.splice(i, 1); }
    this.hud.setText(`SCORE  ${this.score}     BEST  ${this.best}     ⭐ ${this.starsCollected}     SPEED  ${Math.floor(speed / 3)}%`);
    this.draw();
  }

  private jump(): void {
    if (this.ended || this.jumps >= 2) return;
    this.vy = this.jumps === 0 ? -600 : -510;
    this.jumps++;
    this.tone(this.jumps === 1 ? 390 : 560, .1, "triangle", .035);
    this.burst(this.px - 8, this.py + 13, 5, 0xa6edff);
  }

  private burst(x: number, y: number, count: number, color: number): void { for (let i = 0; i < count; i++) { const a = Math.random() * Math.PI * 2, v = 25 + Math.random() * 105; this.sparks.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: .2 + Math.random() * .28, color }); } }

  private end(): void {
    this.ended = true;
    const record = this.score > this.best;
    if (record) { this.best = this.score; localStorage.setItem("skyDashBest", String(this.best)); }
    this.tone(130, .38, "sawtooth", .055);
    this.overlay = this.add.container(0, 0, [
      this.add.rectangle(W / 2, H / 2, W, H, 0x10152e, .82),
      this.add.text(W / 2, 208, "FLIGHT OVER", { fontSize: "38px", fontFamily: "system-ui, sans-serif", color: "#f4f7ff", fontStyle: "bold" }).setOrigin(.5),
      this.add.text(W / 2, 264, `SCORE  ${this.score}`, { fontSize: "24px", fontFamily: "system-ui, sans-serif", color: "#9ee4ff" }).setOrigin(.5),
      this.add.text(W / 2, 302, `BEST  ${this.best}${record ? "  · NEW RECORD!" : ""}`, { fontSize: "16px", fontFamily: "system-ui, sans-serif", color: "#ffdd93" }).setOrigin(.5),
      this.add.text(W / 2, 354, "R 키 또는 화면을 눌러 다시 달리기", { fontSize: "15px", fontFamily: "system-ui, sans-serif", color: "#b3bfdc" }).setOrigin(.5),
    ]).setDepth(5);
  }

  private restart(): void {
    this.overlay?.destroy(); this.overlay = undefined;
    this.px = 165; this.py = GROUND - 23; this.vy = 0; this.jumps = 0; this.elapsed = 0; this.spawnTime = .9; this.score = 0; this.starsCollected = 0; this.obstacles = []; this.stars = []; this.sparks = []; this.ended = false;
  }

  private enableAudio(): void { if (this.muted) return; try { const C = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext; if (!C) return; this.audio ??= new C(); if (this.audio.state === "suspended") void this.audio.resume(); } catch { this.audio = undefined; } }
  private tone(frequency: number, duration: number, type: OscillatorType, volume: number, delay = 0): void {
    if (this.muted || !this.audio || this.audio.state === "closed") return;
    try { const t = this.audio.currentTime + delay, o = this.audio.createOscillator(), g = this.audio.createGain(); o.type = type; o.frequency.setValueAtTime(frequency, t); g.gain.setValueAtTime(volume, t); g.gain.exponentialRampToValueAtTime(.001, t + duration); o.connect(g).connect(this.audio.destination); o.start(t); o.stop(t + duration); } catch { /* Audio must not interrupt play. */ }
  }
  private toggleSound(): void { this.muted = !this.muted; this.soundLabel.setText(this.muted ? "♫ SOUND OFF [M]" : "♫ SOUND ON [M]").setColor(this.muted ? "#9aa3bc" : "#a1e5ff"); if (!this.muted) { this.enableAudio(); this.tone(660, .12, "triangle", .04); } }

  private draw(): void {
    const g = this.g; g.clear().fillStyle(0x10152e).fillRect(0, 0, W, H);
    g.fillStyle(0xa8dfff, .32); for (const s of this.skyStars) g.fillCircle(s.x, s.y, s.r);
    const shift = (this.elapsed * 16) % 190;
    for (let i = -1; i < 6; i++) { const x = i * 190 - shift; g.fillStyle(0x314774, .38).fillEllipse(x + 60, GROUND - 25, 170, 80); }
    g.fillStyle(0x1f3151).fillRect(0, GROUND, W, H - GROUND);
    g.fillStyle(0x83c7e7, .42).fillRect(0, GROUND, W, 3);
    g.lineStyle(1, 0xa1c9e4, .16); for (let x = -((this.elapsed * 140) % 48); x < W; x += 48) g.lineBetween(x, GROUND + 15, x - 18, H);
    for (const o of this.obstacles) { const y = GROUND - o.height, c = [0xff9f8f, 0xffd477, 0xd49bff][o.style]; g.fillStyle(c, .16).fillRoundedRect(o.x - 6, y - 7, o.width + 12, o.height + 14, 9); g.fillStyle([0x9e5469, 0x987843, 0x6c5b9f][o.style]).fillRoundedRect(o.x, y, o.width, o.height, 6); g.lineStyle(2, c, .9).strokeRoundedRect(o.x, y, o.width, o.height, 6); g.fillStyle(c, .8).fillRect(o.x + 5, y + 6, o.width - 10, 3); }
    for (const star of this.stars) { const r = 11 + Math.sin(star.phase) * 1.5; g.fillStyle(0xffdd81, .17).fillCircle(star.x, star.y, r + 9); g.fillStyle(0xffd86f).fillTriangle(star.x, star.y - r, star.x + r * .32, star.y - r * .32, star.x + r, star.y); g.fillTriangle(star.x + r, star.y, star.x + r * .32, star.y + r * .32, star.x, star.y + r); g.fillTriangle(star.x, star.y + r, star.x - r * .32, star.y + r * .32, star.x - r, star.y); g.fillTriangle(star.x - r, star.y, star.x - r * .32, star.y - r * .32, star.x, star.y - r); }
    for (const s of this.sparks) g.fillStyle(s.color, Phaser.Math.Clamp(s.life * 3, 0, 1)).fillCircle(s.x, s.y, Math.max(1, s.life * 6));
    g.fillStyle(0x78e0f5, .2).fillCircle(this.px, this.py, 28);
    g.fillStyle(0x5ccbe7).fillRoundedRect(this.px - 13, this.py - 17, 26, 33, 8);
    g.fillStyle(0xbdf8ff).fillCircle(this.px, this.py - 23, 12);
    g.fillStyle(0x173044).fillRoundedRect(this.px - 6, this.py - 27, 13, 5, 2);
    g.fillStyle(0xffd77c).fillTriangle(this.px + 2, this.py - 7, this.px + 20, this.py - 2, this.px + 3, this.py + 4);
    g.fillStyle(0x283d65).fillRoundedRect(this.px - 12, this.py + 11, 9, 14 + Math.sin(this.elapsed * 20) * 3, 3).fillRoundedRect(this.px + 3, this.py + 11, 9, 14 - Math.sin(this.elapsed * 20) * 3, 3);
  }
}

new Phaser.Game({ type: Phaser.AUTO, parent: "game", width: W, height: H, backgroundColor: "#10152e", scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH }, scene: [SkyDash] });
