import Phaser from "phaser";

const W = 900, H = 540, FLOOR = 450, BLOCK_H = 28;
type Block = { x: number; y: number; width: number; color: number };
type Fragment = { x: number; y: number; width: number; color: number; vx: number; vy: number; life: number };
const COLORS = [0xf4a66e, 0xf6cf75, 0x86d6d1, 0x9eafff, 0xd69cf3, 0x83c8f2];

class SkylineStack extends Phaser.Scene {
  private g!: Phaser.GameObjects.Graphics;
  private hud!: Phaser.GameObjects.Text;
  private hint!: Phaser.GameObjects.Text;
  private soundLabel!: Phaser.GameObjects.Text;
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private stack: Block[] = [];
  private fragments: Fragment[] = [];
  private active!: Block;
  private direction = 1;
  private speed = 265;
  private layers = 0;
  private combo = 0;
  private best = Number(localStorage.getItem("skylineStackBest") || 0);
  private newRecord = false;
  private ended = false;
  private muted = false;
  private audio?: AudioContext;
  private overlay?: Phaser.GameObjects.Container;
  private skyline = Array.from({ length: 22 }, (_, i) => ({ x: i * 44, width: 26 + Math.random() * 28, height: 55 + Math.random() * 135, seed: Math.random() }));

  constructor() { super("SkylineStack"); }

  create(): void {
    this.g = this.add.graphics();
    this.hud = this.add.text(22, 18, "", { fontFamily: "system-ui, sans-serif", fontSize: "16px", color: "#fff4e3", fontStyle: "bold" }).setDepth(2);
    this.hint = this.add.text(W / 2, H - 22, "PRESS SPACE OR CLICK TO STACK", { fontFamily: "system-ui, sans-serif", fontSize: "12px", color: "#c6bddb", letterSpacing: 2 }).setOrigin(.5).setDepth(2);
    this.soundLabel = this.add.text(W - 20, 20, "♫ SOUND ON [M]", { fontFamily: "system-ui, sans-serif", fontSize: "12px", color: "#ffd293" }).setOrigin(1, 0).setDepth(2).setInteractive({ useHandCursor: true });
    this.soundLabel.on("pointerdown", () => this.toggleSound());
    const kb = this.input.keyboard!;
    this.keys = kb.addKeys({ drop: Phaser.Input.Keyboard.KeyCodes.SPACE, mute: Phaser.Input.Keyboard.KeyCodes.M, restart: Phaser.Input.Keyboard.KeyCodes.R }) as Record<string, Phaser.Input.Keyboard.Key>;
    kb.addCapture([Phaser.Input.Keyboard.KeyCodes.SPACE, Phaser.Input.Keyboard.KeyCodes.M]);
    kb.on("keydown", () => this.enableAudio());
    this.keys.mute.on("down", () => this.toggleSound());
    this.keys.restart.on("down", () => { if (this.ended) this.restart(); });
    this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => { if (this.ended) this.restart(); else { this.enableAudio(); if (pointer.y > 60) this.drop(); } });
    document.getElementById("drop")?.addEventListener("pointerdown", (event) => { event.preventDefault(); this.enableAudio(); this.drop(); });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => { void this.audio?.close(); });
    this.resetState(); this.draw();
  }

  update(_time: number, delta: number): void {
    if (this.ended) return;
    if (Phaser.Input.Keyboard.JustDown(this.keys.drop)) { this.enableAudio(); this.drop(); }
    const dt = Math.min(delta / 1000, .04);
    this.active.x += this.direction * this.speed * dt;
    const minX = 70, maxX = W - 70 - this.active.width;
    if (this.active.x <= minX || this.active.x >= maxX) { this.active.x = Phaser.Math.Clamp(this.active.x, minX, maxX); this.direction *= -1; }
    for (let i = this.fragments.length - 1; i >= 0; i--) {
      const f = this.fragments[i]; f.x += f.vx * dt; f.y += f.vy * dt; f.vy += 680 * dt; f.life -= dt;
      if (f.life <= 0 || f.y > H + 20) this.fragments.splice(i, 1);
    }
    this.hud.setText(`FLOORS  ${this.layers}     BEST  ${this.best}     PERFECT  ${this.combo ? `×${this.combo}` : "—"}`);
    this.draw();
  }

  private drop(): void {
    if (this.ended) return;
    const below = this.stack[this.stack.length - 1];
    const left = Math.max(this.active.x, below.x), right = Math.min(this.active.x + this.active.width, below.x + below.width), overlap = right - left;
    if (overlap <= 2) { this.fragments.push({ x: this.active.x, y: this.active.y, width: this.active.width, color: this.active.color, vx: this.direction * 100, vy: -45, life: 1.3 }); this.tone(120, .34, "sawtooth", .06); this.finish(); return; }
    const lost = this.active.width - overlap, perfect = lost <= 5 && Math.abs(this.active.x - below.x) <= 5;
    if (lost > 0 && !perfect) {
      const cutX = this.active.x < below.x ? this.active.x : right;
      this.fragments.push({ x: cutX, y: this.active.y, width: lost, color: this.active.color, vx: cutX < below.x ? -80 : 80, vy: -30, life: 1.05 });
      this.combo = 0; this.tone(340, .1, "triangle", .035);
    } else if (perfect) { this.combo++; this.tone(750 + Math.min(this.combo, 5) * 55, .13, "triangle", .05); this.tone(1050, .16, "sine", .035, .09); }
    else { this.tone(490, .08, "triangle", .035); }
    const x = perfect ? below.x : left, width = perfect ? below.width : overlap;
    this.stack.push({ x, y: this.active.y, width, color: this.active.color });
    this.layers++;
    if (this.layers > this.best) { this.best = this.layers; this.newRecord = true; localStorage.setItem("skylineStackBest", String(this.best)); }
    this.speed = Math.min(265 + this.layers * 13, 620);
    this.direction *= -1;
    const nextX = this.direction > 0 ? 70 : W - 70 - width;
    this.active = { x: nextX, y: FLOOR - (this.stack.length + 1) * BLOCK_H, width, color: COLORS[this.layers % COLORS.length] };
    if (this.layers >= 15) this.hint.setText("THE SKY IS THE LIMIT!");
  }

  private finish(): void {
    this.ended = true;
    this.overlay = this.add.container(0, 0, [
      this.add.rectangle(W / 2, H / 2, W, H, 0x11132b, .82),
      this.add.text(W / 2, 208, "BUILD COMPLETE", { fontSize: "36px", fontFamily: "system-ui, sans-serif", color: "#fff4e4", fontStyle: "bold" }).setOrigin(.5),
      this.add.text(W / 2, 264, `${this.layers} FLOORS`, { fontSize: "25px", fontFamily: "system-ui, sans-serif", color: "#ffd293" }).setOrigin(.5),
      this.add.text(W / 2, 304, `BEST  ${this.best}${this.newRecord ? "  · NEW RECORD!" : ""}`, { fontSize: "16px", fontFamily: "system-ui, sans-serif", color: "#d9d4ed" }).setOrigin(.5),
      this.add.text(W / 2, 356, "R 키 또는 화면을 눌러 다시 쌓기", { fontSize: "15px", fontFamily: "system-ui, sans-serif", color: "#b7bfd7" }).setOrigin(.5),
    ]).setDepth(5);
  }

  private resetState(): void {
    this.layers = 0; this.combo = 0; this.speed = 265; this.ended = false; this.newRecord = false; this.fragments = [];
    this.stack = [{ x: W / 2 - 140, y: FLOOR - BLOCK_H, width: 280, color: 0x7861a8 }];
    this.direction = 1;
    this.active = { x: 70, y: FLOOR - BLOCK_H * 2, width: 280, color: COLORS[0] };
    this.hint.setText("PRESS SPACE OR CLICK TO STACK");
  }
  private restart(): void { this.overlay?.destroy(); this.overlay = undefined; this.resetState(); }

  private enableAudio(): void { if (this.muted) return; try { const C = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext; if (!C) return; this.audio ??= new C(); if (this.audio.state === "suspended") void this.audio.resume(); } catch { this.audio = undefined; } }
  private tone(frequency: number, duration: number, type: OscillatorType, volume: number, delay = 0): void {
    if (this.muted || !this.audio || this.audio.state === "closed") return;
    try { const t = this.audio.currentTime + delay, o = this.audio.createOscillator(), g = this.audio.createGain(); o.type = type; o.frequency.setValueAtTime(frequency, t); g.gain.setValueAtTime(volume, t); g.gain.exponentialRampToValueAtTime(.001, t + duration); o.connect(g).connect(this.audio.destination); o.start(t); o.stop(t + duration); } catch { /* Audio must not interrupt play. */ }
  }
  private toggleSound(): void { this.muted = !this.muted; this.soundLabel.setText(this.muted ? "♫ SOUND OFF [M]" : "♫ SOUND ON [M]").setColor(this.muted ? "#9aa3bc" : "#ffd293"); if (!this.muted) { this.enableAudio(); this.tone(660, .12, "triangle", .04); } }

  private draw(): void {
    const g = this.g; g.clear().fillStyle(0x12142b).fillRect(0, 0, W, H);
    g.fillStyle(0xf5d98c, .33); for (let i = 0; i < 70; i++) g.fillCircle((i * 137) % W, 50 + (i * 71) % 270, i % 4 === 0 ? 1.6 : .8);
    for (const b of this.skyline) { const y = FLOOR - b.height; g.fillStyle(0x201f42, .68).fillRect(b.x, y, b.width, b.height); g.fillStyle(0xf5c878, .38); for (let wy = y + 10; wy < FLOOR - 8; wy += 17) for (let wx = b.x + 6; wx < b.x + b.width - 4; wx += 12) if ((Math.floor(wx + wy) + b.seed * 10) % 3 < 1.5) g.fillRect(wx, wy, 4, 6); }
    g.fillStyle(0x282446).fillRect(0, FLOOR, W, H - FLOOR); g.fillStyle(0xffd58b, .75).fillRect(0, FLOOR, W, 3);
    const camera = Math.max(0, 172 - this.active.y);
    for (const b of this.stack) this.drawBlock(b, camera);
    this.drawBlock(this.active, camera);
    for (const f of this.fragments) { g.fillStyle(f.color, Phaser.Math.Clamp(f.life, 0, 1)).fillRoundedRect(f.x, f.y + camera, f.width, BLOCK_H, 4); }
    g.fillStyle(0xffedcc, .35).fillCircle(this.active.x + this.active.width / 2, this.active.y + camera - 11, 3);
  }
  private drawBlock(b: Block, camera: number): void {
    const g = this.g, y = b.y + camera;
    g.fillStyle(b.color, .17).fillRoundedRect(b.x - 7, y - 7, b.width + 14, BLOCK_H + 14, 7);
    g.fillStyle(b.color).fillRoundedRect(b.x, y, b.width, BLOCK_H - 2, 4);
    g.fillStyle(0xffffff, .24).fillRoundedRect(b.x + 4, y + 4, Math.max(0, b.width - 8), 4, 2);
    g.fillStyle(0x302746, .34); for (let x = b.x + 12; x < b.x + b.width - 8; x += 20) g.fillRoundedRect(x, y + 13, 7, 8, 2);
  }
}

new Phaser.Game({ type: Phaser.AUTO, parent: "game", width: W, height: H, backgroundColor: "#12142b", scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH }, scene: [SkylineStack] });
