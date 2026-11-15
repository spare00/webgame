import Phaser from "phaser";

const W = 900, H = 540, GOAL = 18, ROUND_MS = 90_000;
type Player = { x: number; y: number; invuln: number; keys: Record<string, Phaser.Input.Keyboard.Key>; touch: { x: number; y: number } };
type Wisp = { x: number; y: number; vx: number; vy: number; phase: number };
type Gem = { x: number; y: number; phase: number };
type Spark = { x: number; y: number; vx: number; vy: number; life: number; color: number };

class CrystalRescue extends Phaser.Scene {
  private g!: Phaser.GameObjects.Graphics;
  private hud!: Phaser.GameObjects.Text;
  private soundLabel!: Phaser.GameObjects.Text;
  private players!: [Player, Player];
  private wisps: Wisp[] = [];
  private gems: Gem[] = [];
  private sparks: Spark[] = [];
  private score = 0;
  private lives = 4;
  private elapsed = 0;
  private ended = false;
  private muted = false;
  private audio?: AudioContext;
  private overlay?: Phaser.GameObjects.Container;

  constructor() { super("CrystalRescue"); }

  create(): void {
    this.g = this.add.graphics();
    this.hud = this.add.text(22, 16, "", { fontFamily: "system-ui, sans-serif", fontSize: "16px", color: "#eaffff", fontStyle: "bold" }).setDepth(2);
    this.soundLabel = this.add.text(W - 20, 20, "♫ SOUND ON [M]", { fontFamily: "system-ui, sans-serif", fontSize: "12px", color: "#9de8ff" }).setOrigin(1, 0).setDepth(2).setInteractive({ useHandCursor: true });
    this.soundLabel.on("pointerdown", () => this.toggleSound());
    const kb = this.input.keyboard!;
    this.players = [this.player(90, H / 2, { up: Phaser.Input.Keyboard.KeyCodes.W, left: Phaser.Input.Keyboard.KeyCodes.A, down: Phaser.Input.Keyboard.KeyCodes.S, right: Phaser.Input.Keyboard.KeyCodes.D }),
      this.player(W - 90, H / 2, { up: Phaser.Input.Keyboard.KeyCodes.UP, left: Phaser.Input.Keyboard.KeyCodes.LEFT, down: Phaser.Input.Keyboard.KeyCodes.DOWN, right: Phaser.Input.Keyboard.KeyCodes.RIGHT })];
    kb.addKey(Phaser.Input.Keyboard.KeyCodes.M).on("down", () => this.toggleSound());
    kb.addKey(Phaser.Input.Keyboard.KeyCodes.R).on("down", () => { if (this.ended) this.restart(); });
    kb.addCapture([Phaser.Input.Keyboard.KeyCodes.UP, Phaser.Input.Keyboard.KeyCodes.DOWN, Phaser.Input.Keyboard.KeyCodes.M]);
    kb.on("keydown", () => this.enableAudio());
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => { void this.audio?.close(); });
    this.input.on("pointerdown", () => { if (this.ended) this.restart(); else this.enableAudio(); });
    document.querySelectorAll<HTMLButtonElement>("[data-player][data-dir]").forEach((button) => {
      const player = this.players[Number(button.dataset.player) - 1];
      const dir = ({ up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] } as Record<string, [number, number]>)[button.dataset.dir!];
      button.addEventListener("pointerdown", (event) => { event.preventDefault(); player.touch.x = dir[0]; player.touch.y = dir[1]; });
      for (const name of ["pointerup", "pointercancel", "pointerleave"]) button.addEventListener(name, () => { player.touch.x = 0; player.touch.y = 0; });
    });
    this.restartState();
    this.draw();
  }

  private player(x: number, y: number, mapping: Record<string, number>): Player {
    return { x, y, invuln: 0, keys: this.input.keyboard!.addKeys(mapping) as Record<string, Phaser.Input.Keyboard.Key>, touch: { x: 0, y: 0 } };
  }

  update(_time: number, delta: number): void {
    if (this.ended) return;
    const dt = Math.min(delta / 1000, .04);
    this.elapsed += delta;
    if (this.elapsed >= ROUND_MS) { this.end(false); return; }
    for (const p of this.players) {
      const x = Number(p.keys.right.isDown) - Number(p.keys.left.isDown) + p.touch.x;
      const y = Number(p.keys.down.isDown) - Number(p.keys.up.isDown) + p.touch.y;
      if (x || y) { const n = Math.hypot(x, y); p.x = Phaser.Math.Clamp(p.x + x / n * 245 * dt, 28, W - 28); p.y = Phaser.Math.Clamp(p.y + y / n * 245 * dt, 78, H - 28); }
      p.invuln = Math.max(0, p.invuln - delta);
    }
    for (const w of this.wisps) {
      w.x += w.vx * dt; w.y += w.vy * dt; w.phase += dt * 4;
      if (w.x < 32 || w.x > W - 32) w.vx *= -1;
      if (w.y < 82 || w.y > H - 32) w.vy *= -1;
      for (const p of this.players) if (!p.invuln && Phaser.Math.Distance.Between(p.x, p.y, w.x, w.y) < 29) {
        p.invuln = 1300; this.lives--; this.tone(105, .32, "sawtooth", .06); this.burst(p.x, p.y, 14, 0xff7895);
        if (!this.lives) { this.end(false); return; }
      }
    }
    for (const p of this.players) for (let i = this.gems.length - 1; i >= 0; i--) {
      const gem = this.gems[i];
      if (Phaser.Math.Distance.Between(p.x, p.y, gem.x, gem.y) < 25) {
        this.gems.splice(i, 1); this.score++; this.tone(660 + (this.score % 5) * 90, .15, "triangle", .045); this.tone(990 + (this.score % 5) * 60, .18, "sine", .035, .08); this.burst(gem.x, gem.y, 12, 0x8ff9ff);
        if (this.score >= GOAL) { this.end(true); return; }
        this.gems.push(this.makeGem());
      }
    }
    for (let i = this.sparks.length - 1; i >= 0; i--) { const s = this.sparks[i]; s.x += s.vx * dt; s.y += s.vy * dt; s.life -= dt; if (s.life <= 0) this.sparks.splice(i, 1); }
    const seconds = Math.ceil((ROUND_MS - this.elapsed) / 1000);
    this.hud.setText(`CRYSTALS  ${String(this.score).padStart(2, "0")} / ${GOAL}        TEAM ♥ ${"◆".repeat(this.lives)}${"◇".repeat(4 - this.lives)}        TIME  ${String(seconds).padStart(2, "0")}`);
    this.draw();
  }

  private makeGem(): Gem { return { x: 55 + Math.random() * (W - 110), y: 100 + Math.random() * (H - 145), phase: Math.random() * 6 }; }
  private burst(x: number, y: number, count: number, color: number): void { for (let i = 0; i < count; i++) { const a = Math.random() * Math.PI * 2, v = 35 + Math.random() * 155; this.sparks.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: .25 + Math.random() * .35, color }); } }

  private end(won: boolean): void {
    this.ended = true;
    if (won) { [523, 659, 784, 1047].forEach((f, i) => this.tone(f, .24, "triangle", .05, i * .14)); }
    else { this.tone(150, .5, "sawtooth", .06); }
    this.overlay = this.add.container(0, 0, [
      this.add.rectangle(W / 2, H / 2, W, H, 0x06121c, .84),
      this.add.text(W / 2, 220, won ? "TEAM RESCUED!" : "MISSION FAILED", { fontSize: "38px", fontFamily: "system-ui, sans-serif", color: won ? "#a0fff1" : "#ff9eae", fontStyle: "bold" }).setOrigin(.5),
      this.add.text(W / 2, 278, `CRYSTALS  ${this.score} / ${GOAL}`, { fontSize: "22px", fontFamily: "system-ui, sans-serif", color: "#effaff" }).setOrigin(.5),
      this.add.text(W / 2, 338, "R 키 또는 화면을 눌러 다시 출발", { fontSize: "15px", fontFamily: "system-ui, sans-serif", color: "#aec5d1" }).setOrigin(.5),
    ]).setDepth(5);
  }

  private restartState(): void {
    this.players[0].x = 90; this.players[0].y = H / 2; this.players[0].invuln = 0;
    this.players[1].x = W - 90; this.players[1].y = H / 2; this.players[1].invuln = 0;
    this.score = 0; this.lives = 4; this.elapsed = 0; this.ended = false; this.sparks = [];
    this.wisps = Array.from({ length: 3 }, (_, i) => ({ x: 260 + i * 190, y: 150 + i * 95, vx: (i % 2 ? -1 : 1) * (75 + i * 12), vy: i % 2 ? 68 : -82, phase: i }));
    this.gems = Array.from({ length: 3 }, () => this.makeGem());
  }
  private restart(): void { this.overlay?.destroy(); this.overlay = undefined; this.restartState(); }

  private enableAudio(): void { if (this.muted) return; try { const C = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext; if (!C) return; this.audio ??= new C(); if (this.audio.state === "suspended") void this.audio.resume(); } catch { this.audio = undefined; } }
  private tone(frequency: number, duration: number, type: OscillatorType, volume: number, delay = 0): void {
    if (this.muted || !this.audio || this.audio.state === "closed") return;
    try { const t = this.audio.currentTime + delay, o = this.audio.createOscillator(), g = this.audio.createGain(); o.type = type; o.frequency.setValueAtTime(frequency, t); g.gain.setValueAtTime(volume, t); g.gain.exponentialRampToValueAtTime(.001, t + duration); o.connect(g).connect(this.audio.destination); o.start(t); o.stop(t + duration); } catch { /* Audio must not interrupt the game. */ }
  }
  private toggleSound(): void { this.muted = !this.muted; this.soundLabel.setText(this.muted ? "♫ SOUND OFF [M]" : "♫ SOUND ON [M]").setColor(this.muted ? "#9aa3bc" : "#9de8ff"); if (!this.muted) { this.enableAudio(); this.tone(660, .12, "triangle", .04); } }

  private draw(): void {
    const g = this.g; g.clear().fillStyle(0x08131f).fillRect(0, 0, W, H);
    g.fillStyle(0x8bd9f1, .2); for (let y = 85; y < H; y += 34) for (let x = 18; x < W; x += 34) g.fillCircle(x, y, 1);
    g.lineStyle(2, 0x79cbe2, .26).strokeRoundedRect(13, 68, W - 26, H - 82, 14);
    for (const gem of this.gems) { gem.phase += .025; const pulse = 1 + Math.sin(gem.phase) * .12, r = 12 * pulse; g.fillStyle(0x63efff, .18).fillCircle(gem.x, gem.y, r + 12); g.fillStyle(0x77eaff).fillTriangle(gem.x, gem.y - r, gem.x + r * .75, gem.y, gem.x, gem.y + r); g.fillStyle(0xd8ffff).fillTriangle(gem.x, gem.y - r, gem.x, gem.y + r, gem.x - r * .75, gem.y); }
    for (const w of this.wisps) { const r = 14 + Math.sin(w.phase) * 2; g.fillStyle(0xff587f, .16).fillCircle(w.x, w.y, r + 11); g.fillStyle(0x9e426f).fillCircle(w.x, w.y, r); g.lineStyle(2, 0xff9bb4, .9).strokeCircle(w.x, w.y, r); g.fillStyle(0xffe6e8).fillCircle(w.x - 4, w.y - 2, 2).fillCircle(w.x + 4, w.y - 2, 2); }
    for (const s of this.sparks) g.fillStyle(s.color, Phaser.Math.Clamp(s.life * 2, 0, 1)).fillCircle(s.x, s.y, Math.max(1, s.life * 7));
    this.players.forEach((p, i) => { const color = i ? 0x82baff : 0x65efd9; if (p.invuln && Math.floor(p.invuln / 90) % 2) return; g.fillStyle(color, .18).fillCircle(p.x, p.y, 26); g.fillStyle(color).fillCircle(p.x, p.y, 16); g.fillStyle(0xeaffff).fillCircle(p.x - 4, p.y - 3, 3).fillCircle(p.x + 4, p.y - 3, 3); g.fillStyle(0x123042).fillCircle(p.x, p.y + 4, 5); });
  }
}

new Phaser.Game({ type: Phaser.AUTO, parent: "game", width: W, height: H, backgroundColor: "#08131f", scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH }, scene: [CrystalRescue] });
