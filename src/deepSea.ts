import Phaser from "phaser";

const W = 900, H = 540, GOAL = 12, AIR = 75_000;
type Pearl = { x: number; y: number; phase: number };
type Mine = { x: number; y: number; vx: number; vy: number; phase: number };
type Bubble = { x: number; y: number; r: number; speed: number; drift: number };
type Spark = { x: number; y: number; vx: number; vy: number; life: number; color: number };

class DeepSea extends Phaser.Scene {
  private g!: Phaser.GameObjects.Graphics;
  private hud!: Phaser.GameObjects.Text;
  private soundLabel!: Phaser.GameObjects.Text;
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private player = { x: W / 2, y: H / 2, invuln: 0 };
  private pearls: Pearl[] = [];
  private mines: Mine[] = [];
  private bubbles: Bubble[] = [];
  private sparks: Spark[] = [];
  private collected = 0;
  private hull = 3;
  private elapsed = 0;
  private ended = false;
  private muted = false;
  private audio?: AudioContext;
  private overlay?: Phaser.GameObjects.Container;

  constructor() { super("DeepSea"); }

  create(): void {
    this.g = this.add.graphics();
    this.hud = this.add.text(22, 17, "", { fontFamily: "system-ui, sans-serif", fontSize: "15px", color: "#e8fbff", fontStyle: "bold" }).setDepth(2);
    this.soundLabel = this.add.text(W - 20, 20, "♫ SOUND ON [M]", { fontFamily: "system-ui, sans-serif", fontSize: "12px", color: "#8be6f0" }).setOrigin(1, 0).setDepth(2).setInteractive({ useHandCursor: true });
    this.soundLabel.on("pointerdown", () => this.toggleSound());
    const kb = this.input.keyboard!;
    this.keys = kb.addKeys({ up: Phaser.Input.Keyboard.KeyCodes.UP, w: Phaser.Input.Keyboard.KeyCodes.W, down: Phaser.Input.Keyboard.KeyCodes.DOWN, s: Phaser.Input.Keyboard.KeyCodes.S, left: Phaser.Input.Keyboard.KeyCodes.LEFT, a: Phaser.Input.Keyboard.KeyCodes.A, right: Phaser.Input.Keyboard.KeyCodes.RIGHT, d: Phaser.Input.Keyboard.KeyCodes.D, mute: Phaser.Input.Keyboard.KeyCodes.M, restart: Phaser.Input.Keyboard.KeyCodes.R }) as Record<string, Phaser.Input.Keyboard.Key>;
    kb.addCapture([Phaser.Input.Keyboard.KeyCodes.UP, Phaser.Input.Keyboard.KeyCodes.DOWN, Phaser.Input.Keyboard.KeyCodes.M]);
    kb.on("keydown", () => this.enableAudio());
    this.keys.mute.on("down", () => this.toggleSound());
    this.keys.restart.on("down", () => { if (this.ended) this.restart(); });
    this.input.on("pointerdown", () => { if (this.ended) this.restart(); else this.enableAudio(); });
    document.querySelectorAll<HTMLButtonElement>("[data-dir]").forEach((button) => {
      const direction = ({ up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] } as Record<string, [number, number]>)[button.dataset.dir!];
      button.addEventListener("pointerdown", (event) => { event.preventDefault(); this.touch.x = direction[0]; this.touch.y = direction[1]; });
      for (const name of ["pointerup", "pointercancel", "pointerleave"]) button.addEventListener(name, () => { this.touch.x = 0; this.touch.y = 0; });
    });
    this.resetState(); this.draw();
  }

  private touch = { x: 0, y: 0 };

  update(_time: number, delta: number): void {
    if (this.ended) return;
    const dt = Math.min(delta / 1000, .04);
    this.elapsed += delta;
    if (this.elapsed >= AIR) { this.end(false); return; }
    const x = Number(this.keys.right.isDown || this.keys.d.isDown) - Number(this.keys.left.isDown || this.keys.a.isDown) + this.touch.x;
    const y = Number(this.keys.down.isDown || this.keys.s.isDown) - Number(this.keys.up.isDown || this.keys.w.isDown) + this.touch.y;
    if (x || y) { const n = Math.hypot(x, y); this.player.x = Phaser.Math.Clamp(this.player.x + x / n * 230 * dt, 36, W - 36); this.player.y = Phaser.Math.Clamp(this.player.y + y / n * 230 * dt, 78, H - 42); }
    this.player.invuln = Math.max(0, this.player.invuln - delta);
    for (const mine of this.mines) {
      mine.x += mine.vx * dt; mine.y += mine.vy * dt; mine.phase += dt * 3;
      if (mine.x < 38 || mine.x > W - 38) mine.vx *= -1;
      if (mine.y < 82 || mine.y > H - 56) mine.vy *= -1;
      if (!this.player.invuln && Phaser.Math.Distance.Between(this.player.x, this.player.y, mine.x, mine.y) < 29) {
        this.hull--; this.player.invuln = 1400; this.tone(110, .3, "sawtooth", .065); this.burst(this.player.x, this.player.y, 16, 0xff7b70);
        if (!this.hull) { this.end(false); return; }
      }
    }
    for (let i = this.pearls.length - 1; i >= 0; i--) {
      const pearl = this.pearls[i]; pearl.phase += dt * 4;
      if (Phaser.Math.Distance.Between(this.player.x, this.player.y, pearl.x, pearl.y) < 28) {
        this.pearls.splice(i, 1); this.collected++; this.tone(740 + this.collected % 5 * 80, .13, "triangle", .05); this.tone(1120, .18, "sine", .035, .09); this.burst(pearl.x, pearl.y, 12, 0xc6fbff);
        if (this.collected >= GOAL) { this.end(true); return; }
        this.pearls.push(this.newPearl());
      }
    }
    for (const bubble of this.bubbles) { bubble.y -= bubble.speed * dt; bubble.x += Math.sin(this.elapsed / 1300 + bubble.drift) * 12 * dt; if (bubble.y < 65) { bubble.y = H + Math.random() * 70; bubble.x = Math.random() * W; } }
    for (let i = this.sparks.length - 1; i >= 0; i--) { const s = this.sparks[i]; s.x += s.vx * dt; s.y += s.vy * dt; s.life -= dt; if (s.life <= 0) this.sparks.splice(i, 1); }
    const seconds = Math.ceil((AIR - this.elapsed) / 1000);
    this.hud.setText(`PEARLS  ${String(this.collected).padStart(2, "0")} / ${GOAL}       HULL  ${"◆".repeat(this.hull)}${"◇".repeat(3 - this.hull)}       O₂  ${seconds}s`);
    this.draw();
  }

  private newPearl(): Pearl { let p: Pearl, tries = 0; do { p = { x: 55 + Math.random() * (W - 110), y: 95 + Math.random() * (H - 160), phase: Math.random() * 6 }; tries++; } while (tries < 30 && (Phaser.Math.Distance.Between(p.x, p.y, this.player.x, this.player.y) < 100 || this.mines.some((m) => Phaser.Math.Distance.Between(p.x, p.y, m.x, m.y) < 65))); return p; }
  private burst(x: number, y: number, n: number, color: number): void { for (let i = 0; i < n; i++) { const a = Math.random() * Math.PI * 2, v = 35 + Math.random() * 130; this.sparks.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: .25 + Math.random() * .35, color }); } }

  private end(won: boolean): void {
    this.ended = true;
    if (won) [523, 659, 784, 1047].forEach((f, i) => this.tone(f, .22, "triangle", .05, i * .14));
    else this.tone(140, .46, "sawtooth", .06);
    this.overlay = this.add.container(0, 0, [
      this.add.rectangle(W / 2, H / 2, W, H, 0x051321, .83),
      this.add.text(W / 2, 220, won ? "SALVAGE SUCCESS!" : "SUB LOST", { fontSize: "35px", fontFamily: "system-ui, sans-serif", color: won ? "#a6fff3" : "#ffa394", fontStyle: "bold" }).setOrigin(.5),
      this.add.text(W / 2, 278, `PEARLS  ${this.collected} / ${GOAL}`, { fontSize: "22px", fontFamily: "system-ui, sans-serif", color: "#eafaff" }).setOrigin(.5),
      this.add.text(W / 2, 338, "R 키 또는 화면을 눌러 다시 잠수", { fontSize: "15px", fontFamily: "system-ui, sans-serif", color: "#a8bfcc" }).setOrigin(.5),
    ]).setDepth(5);
  }

  private resetState(): void {
    this.player = { x: W / 2, y: H / 2, invuln: 0 }; this.collected = 0; this.hull = 3; this.elapsed = 0; this.ended = false; this.sparks = [];
    this.mines = [{ x: 220, y: 190, vx: 87, vy: 68, phase: 0 }, { x: 660, y: 340, vx: -95, vy: -74, phase: 2 }];
    this.pearls = Array.from({ length: 3 }, () => this.newPearl());
    this.bubbles = Array.from({ length: 32 }, () => ({ x: Math.random() * W, y: Math.random() * H, r: 1 + Math.random() * 3, speed: 12 + Math.random() * 26, drift: Math.random() * 6 }));
  }
  private restart(): void { this.overlay?.destroy(); this.overlay = undefined; this.resetState(); }

  private enableAudio(): void { if (this.muted) return; try { const C = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext; if (!C) return; this.audio ??= new C(); if (this.audio.state === "suspended") void this.audio.resume(); } catch { this.audio = undefined; } }
  private tone(frequency: number, duration: number, type: OscillatorType, volume: number, delay = 0): void { if (this.muted || !this.audio || this.audio.state === "closed") return; try { const t = this.audio.currentTime + delay, o = this.audio.createOscillator(), g = this.audio.createGain(); o.type = type; o.frequency.setValueAtTime(frequency, t); g.gain.setValueAtTime(volume, t); g.gain.exponentialRampToValueAtTime(.001, t + duration); o.connect(g).connect(this.audio.destination); o.start(t); o.stop(t + duration); } catch { /* Audio must not interrupt play. */ } }
  private toggleSound(): void { this.muted = !this.muted; this.soundLabel.setText(this.muted ? "♫ SOUND OFF [M]" : "♫ SOUND ON [M]").setColor(this.muted ? "#9aa3bc" : "#8be6f0"); if (!this.muted) { this.enableAudio(); this.tone(660, .12, "triangle", .04); } }

  private draw(): void {
    const g = this.g; g.clear().fillStyle(0x061a2b).fillRect(0, 0, W, H);
    for (let i = 0; i < 5; i++) { g.fillStyle([0x0a2940, 0x0b3048, 0x0c3850, 0x10465a][Math.min(i, 3)], .12); g.fillRect(0, 90 + i * 82, W, 82); }
    g.fillStyle(0x91e7fb, .42); for (const b of this.bubbles) g.fillCircle(b.x, b.y, b.r);
    g.fillStyle(0x0b2531).fillRect(0, H - 34, W, 34); g.fillStyle(0x1d5960, .7).fillRect(0, H - 36, W, 3);
    for (let x = 14; x < W; x += 38) { const h = 12 + (Math.sin(x * .08) + 1) * 12; g.fillStyle(0x15565a, .7).fillEllipse(x, H - 37 - h / 2, 12, h); g.fillStyle(0x5bb77e, .7).fillEllipse(x + 9, H - 37 - h * .65, 9, h * .68); }
    for (const p of this.pearls) { const r = 8 + Math.sin(p.phase) * 1.2; g.fillStyle(0xc3faff, .17).fillCircle(p.x, p.y, 20); g.fillStyle(0xe8ffff).fillCircle(p.x, p.y, r); g.fillStyle(0xffffff, .8).fillCircle(p.x - 2, p.y - 3, 2); }
    for (const m of this.mines) { const r = 15 + Math.sin(m.phase) * 1.5; g.fillStyle(0xff626b, .16).fillCircle(m.x, m.y, r + 11); g.fillStyle(0x9f394e).fillCircle(m.x, m.y, r); g.lineStyle(2, 0xff9b8b, .9).strokeCircle(m.x, m.y, r); for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; g.lineStyle(3, 0xd45a60).lineBetween(m.x + Math.cos(a) * r, m.y + Math.sin(a) * r, m.x + Math.cos(a) * (r + 6), m.y + Math.sin(a) * (r + 6)); } g.fillStyle(0xffe09c).fillCircle(m.x, m.y, 3); }
    for (const s of this.sparks) g.fillStyle(s.color, Phaser.Math.Clamp(s.life * 2, 0, 1)).fillCircle(s.x, s.y, Math.max(1, s.life * 6));
    if (!this.player.invuln || Math.floor(this.player.invuln / 100) % 2 === 0) {
      const { x, y } = this.player; g.fillStyle(0x5bd9f5, .16).fillEllipse(x, y, 76, 43); g.fillStyle(0x42a8c7).fillEllipse(x, y, 58, 31); g.lineStyle(2, 0xa7f2ff).strokeEllipse(x, y, 58, 31); g.fillStyle(0x9be9f6).fillCircle(x + 2, y - 5, 10); g.fillStyle(0x16394c).fillCircle(x + 4, y - 6, 4); g.fillStyle(0xe3ffff).fillTriangle(x + 28, y, x + 41, y - 5, x + 41, y + 5); g.lineStyle(2, 0x96d7e8).lineBetween(x - 13, y + 13, x - 18, y + 22); g.lineBetween(x + 14, y + 13, x + 18, y + 22);
    }
  }
}

new Phaser.Game({ type: Phaser.AUTO, parent: "game", width: W, height: H, backgroundColor: "#061a2b", scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH }, scene: [DeepSea] });
