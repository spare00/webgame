import Phaser from "phaser";

const W = 900, H = 560, TARGET = 5, SPEED = 230;
type Fighter = { x: number; y: number; dx: number; dy: number; score: number; cooldown: number; keys: Record<string, Phaser.Input.Keyboard.Key>; touch: { x: number; y: number; fire: boolean } };
type Bolt = { x: number; y: number; vx: number; vy: number; owner: number; life: number };
type Explosion = { x: number; y: number; life: number };
const WALLS = [new Phaser.Geom.Rectangle(423, 175, 54, 70), new Phaser.Geom.Rectangle(423, 315, 54, 70), new Phaser.Geom.Rectangle(280, 263, 75, 34), new Phaser.Geom.Rectangle(545, 263, 75, 34)];

class NeonDuel extends Phaser.Scene {
  private g!: Phaser.GameObjects.Graphics;
  private hud!: Phaser.GameObjects.Text;
  private soundLabel!: Phaser.GameObjects.Text;
  private p!: [Fighter, Fighter];
  private bolts: Bolt[] = [];
  private explosions: Explosion[] = [];
  private ended = false;
  private muted = false;
  private audio?: AudioContext;
  private overlay?: Phaser.GameObjects.Container;

  constructor() { super("NeonDuel"); }

  create(): void {
    this.g = this.add.graphics();
    this.hud = this.add.text(W / 2, 16, "", { fontFamily: "system-ui, sans-serif", fontSize: "20px", color: "#f2f5ff", fontStyle: "bold" }).setOrigin(0.5, 0).setDepth(2);
    this.soundLabel = this.add.text(W - 20, 20, "♫ SOUND ON [M]", { fontFamily: "system-ui, sans-serif", fontSize: "12px", color: "#9ce8d8" }).setOrigin(1, 0).setDepth(2).setInteractive({ useHandCursor: true });
    this.soundLabel.on("pointerdown", () => this.toggleSound());
    const kb = this.input.keyboard!;
    this.p = [this.fighter(140, H / 2, { up: Phaser.Input.Keyboard.KeyCodes.W, left: Phaser.Input.Keyboard.KeyCodes.A, down: Phaser.Input.Keyboard.KeyCodes.S, right: Phaser.Input.Keyboard.KeyCodes.D, fire: Phaser.Input.Keyboard.KeyCodes.F }),
      this.fighter(W - 140, H / 2, { up: Phaser.Input.Keyboard.KeyCodes.UP, left: Phaser.Input.Keyboard.KeyCodes.LEFT, down: Phaser.Input.Keyboard.KeyCodes.DOWN, right: Phaser.Input.Keyboard.KeyCodes.RIGHT, fire: Phaser.Input.Keyboard.KeyCodes.ENTER })];
    kb.addKey(Phaser.Input.Keyboard.KeyCodes.M).on("down", () => this.toggleSound());
    kb.addKey(Phaser.Input.Keyboard.KeyCodes.R).on("down", () => { if (this.ended) this.restart(); });
    kb.addCapture([Phaser.Input.Keyboard.KeyCodes.F, Phaser.Input.Keyboard.KeyCodes.ENTER, Phaser.Input.Keyboard.KeyCodes.M]);
    kb.on("keydown", () => this.enableAudio());
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => { void this.audio?.close(); });
    document.querySelectorAll<HTMLButtonElement>("[data-player][data-dir]").forEach((button) => {
      const p = this.p[Number(button.dataset.player) - 1];
      const vec = ({ up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] } as Record<string, [number, number]>)[button.dataset.dir!];
      button.addEventListener("pointerdown", (e) => { e.preventDefault(); p.touch.x = vec[0]; p.touch.y = vec[1]; });
      for (const event of ["pointerup", "pointercancel", "pointerleave"]) button.addEventListener(event, () => { p.touch.x = 0; p.touch.y = 0; });
    });
    document.querySelectorAll<HTMLButtonElement>("[data-fire]").forEach((button) => {
      const p = this.p[Number(button.dataset.fire) - 1];
      button.addEventListener("pointerdown", (e) => { e.preventDefault(); p.touch.fire = true; this.enableAudio(); });
      for (const event of ["pointerup", "pointercancel", "pointerleave"]) button.addEventListener(event, () => { p.touch.fire = false; });
    });
    this.draw();
  }

  private fighter(x: number, y: number, mapping: Record<string, number>): Fighter {
    const keys = this.input.keyboard!.addKeys(mapping) as Record<string, Phaser.Input.Keyboard.Key>;
    return { x, y, dx: x < W / 2 ? 1 : -1, dy: 0, score: 0, cooldown: 0, keys, touch: { x: 0, y: 0, fire: false } };
  }

  update(_time: number, delta: number): void {
    const dt = Math.min(delta / 1000, 0.04);
    this.explosions = this.explosions.filter((e) => (e.life -= dt) > 0);
    if (this.ended) { this.draw(); return; }
    for (const [i, p] of this.p.entries()) {
      p.cooldown = Math.max(0, p.cooldown - delta);
      let dx = Number(p.keys.right.isDown) - Number(p.keys.left.isDown) + p.touch.x;
      let dy = Number(p.keys.down.isDown) - Number(p.keys.up.isDown) + p.touch.y;
      if (dx || dy) {
        const mag = Math.hypot(dx, dy); dx /= mag; dy /= mag;
        const nx = Phaser.Math.Clamp(p.x + dx * SPEED * dt, 31, W - 31), ny = Phaser.Math.Clamp(p.y + dy * SPEED * dt, 82, H - 28);
        if (!this.blocked(nx, p.y)) p.x = nx;
        if (!this.blocked(p.x, ny)) p.y = ny;
        p.dx = dx; p.dy = dy;
      }
      if ((p.keys.fire.isDown || p.touch.fire) && p.cooldown <= 0) {
        this.bolts.push({ x: p.x + p.dx * 22, y: p.y + p.dy * 22, vx: p.dx * 430, vy: p.dy * 430, owner: i, life: 1.6 });
        p.cooldown = 320;
        this.tone(500, .05, "square", .025);
      }
    }
    for (let i = this.bolts.length - 1; i >= 0; i--) {
      const b = this.bolts[i]; b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
      const target = this.p[1 - b.owner];
      if (Phaser.Math.Distance.Between(b.x, b.y, target.x, target.y) < 19) {
        this.bolts.splice(i, 1);
        this.explosions.push({ x: target.x, y: target.y, life: .55 });
        this.p[b.owner].score++;
        this.tone(880, .12, "triangle", .05); this.tone(1175, .18, "triangle", .045, .1);
        this.bolts = [];
        if (this.p[b.owner].score >= TARGET) this.end(b.owner);
        else this.resetRound();
        break;
      }
      if (b.life <= 0 || b.x < 18 || b.x > W - 18 || b.y < 68 || b.y > H - 18 || this.blocked(b.x, b.y)) this.bolts.splice(i, 1);
    }
    this.hud.setText(`P1  ${this.p[0].score}     FIRST TO ${TARGET}     ${this.p[1].score}  P2`);
    this.draw();
  }

  private blocked(x: number, y: number): boolean { return WALLS.some((w) => Phaser.Geom.Rectangle.Contains(w, x, y)); }
  private resetRound(): void { this.p[0].x = 140; this.p[0].y = H / 2; this.p[0].dx = 1; this.p[0].dy = 0; this.p[1].x = W - 140; this.p[1].y = H / 2; this.p[1].dx = -1; this.p[1].dy = 0; }

  private end(winner: number): void {
    this.ended = true;
    this.overlay = this.add.container(0, 0, [
      this.add.rectangle(W / 2, H / 2, W, H, 0x070914, .82),
      this.add.text(W / 2, 220, `PLAYER ${winner + 1} WINS!`, { fontSize: "38px", fontFamily: "system-ui, sans-serif", color: winner ? "#ffad98" : "#8cf4df", fontStyle: "bold" }).setOrigin(.5),
      this.add.text(W / 2, 280, `${this.p[0].score}  —  ${this.p[1].score}`, { fontSize: "28px", fontFamily: "system-ui, sans-serif", color: "#f4f5ff" }).setOrigin(.5),
      this.add.text(W / 2, 340, "R 키 또는 화면을 눌러 다시 대전", { fontSize: "15px", fontFamily: "system-ui, sans-serif", color: "#bbc6e2" }).setOrigin(.5),
    ]).setDepth(5);
    [523, 659, 784, 1047].forEach((f, i) => this.tone(f, .22, "triangle", .05, i * .14));
  }

  private restart(): void { this.overlay?.destroy(); this.overlay = undefined; this.p[0].score = this.p[1].score = 0; this.bolts = []; this.ended = false; this.resetRound(); }

  private enableAudio(): void {
    if (this.muted) return;
    try { const C = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext; if (!C) return; this.audio ??= new C(); if (this.audio.state === "suspended") void this.audio.resume(); }
    catch { this.audio = undefined; }
  }

  private tone(frequency: number, duration: number, type: OscillatorType, volume: number, delay = 0): void {
    if (this.muted || !this.audio || this.audio.state === "closed") return;
    try { const t = this.audio.currentTime + delay, o = this.audio.createOscillator(), g = this.audio.createGain(); o.type = type; o.frequency.setValueAtTime(frequency, t); g.gain.setValueAtTime(volume, t); g.gain.exponentialRampToValueAtTime(.001, t + duration); o.connect(g).connect(this.audio.destination); o.start(t); o.stop(t + duration); }
    catch { /* Audio must not block the match. */ }
  }

  private toggleSound(): void { this.muted = !this.muted; this.soundLabel.setText(this.muted ? "♫ SOUND OFF [M]" : "♫ SOUND ON [M]").setColor(this.muted ? "#9aa3bc" : "#9ce8d8"); if (!this.muted) { this.enableAudio(); this.tone(660, .12, "triangle", .04); } }

  private draw(): void {
    const g = this.g; g.clear().fillStyle(0x0b1020).fillRect(0, 0, W, H);
    g.fillStyle(0x8cc8ff, .22);
    for (let y = 70; y < H; y += 32) for (let x = 20; x < W; x += 32) g.fillCircle(x, y, 1);
    g.lineStyle(2, 0x8093c6, .32).strokeRoundedRect(15, 66, W - 30, H - 82, 14);
    g.lineStyle(1, 0x7c86bb, .18).lineBetween(W / 2, 80, W / 2, H - 24);
    for (let i = 0; i < WALLS.length; i++) { const w = WALLS[i], c = i % 2 ? 0xff977e : 0x76ead8; g.fillStyle(c, .1).fillRoundedRect(w.x - 7, w.y - 7, w.width + 14, w.height + 14, 9); g.fillStyle(0x202b48).fillRoundedRect(w.x, w.y, w.width, w.height, 6); g.lineStyle(1, c, .8).strokeRoundedRect(w.x, w.y, w.width, w.height, 6); }
    for (const b of this.bolts) { const c = b.owner ? 0xff987f : 0x81f4dc; g.fillStyle(c, .2).fillCircle(b.x, b.y, 12); g.fillStyle(c).fillCircle(b.x, b.y, 4); }
    for (const e of this.explosions) {
      const progress = 1 - e.life / .55, alpha = e.life / .55;
      const radius = 8 + progress * 42;
      g.lineStyle(3 * alpha, 0xfff2bd, alpha).strokeCircle(e.x, e.y, radius);
      g.lineStyle(2 * alpha, 0xff987f, alpha * .8).strokeCircle(e.x, e.y, radius * .62);
      g.fillStyle(0xffd59a, alpha * .75).fillCircle(e.x, e.y, Math.max(2, 11 * (1 - progress)));
      for (let i = 0; i < 8; i++) {
        const angle = i * Math.PI / 4 + progress * .35, distance = 10 + progress * 40;
        const x = e.x + Math.cos(angle) * distance, y = e.y + Math.sin(angle) * distance;
        g.fillStyle(i % 2 ? 0xff987f : 0xfff2bd, alpha).fillCircle(x, y, Math.max(1, 3 * alpha));
      }
    }
    this.p.forEach((p, i) => { const c = i ? 0xff987f : 0x81f4dc; g.fillStyle(c, .16).fillCircle(p.x, p.y, 27); g.fillStyle(i ? 0xffb6a2 : 0xaaffec).fillCircle(p.x, p.y, 17); g.lineStyle(3, c).strokeCircle(p.x, p.y, 17); g.fillStyle(0x152037).fillTriangle(p.x + p.dx * 22, p.y + p.dy * 22, p.x + Math.cos(Math.atan2(p.dy, p.dx) + 2.3) * 13, p.y + Math.sin(Math.atan2(p.dy, p.dx) + 2.3) * 13, p.x + Math.cos(Math.atan2(p.dy, p.dx) - 2.3) * 13, p.y + Math.sin(Math.atan2(p.dy, p.dx) - 2.3) * 13); });
  }
}

new Phaser.Game({ type: Phaser.AUTO, parent: "game", width: W, height: H, backgroundColor: "#0b1020", scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH }, scene: [NeonDuel] });
