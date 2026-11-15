import Phaser from "phaser";

const W = 900, H = 540, WIN_SCORE = 7, PADDLE_H = 96;
type Paddle = { y: number; keys: Record<string, Phaser.Input.Keyboard.Key>; touch: number };

class NeonPong extends Phaser.Scene {
  private g!: Phaser.GameObjects.Graphics;
  private hud!: Phaser.GameObjects.Text;
  private soundLabel!: Phaser.GameObjects.Text;
  private paddles!: [Paddle, Paddle];
  private scores: [number, number] = [0, 0];
  private ball = { x: W / 2, y: H / 2, vx: 360, vy: 80, speed: 360 };
  private serveWait = 0;
  private ended = false;
  private muted = false;
  private audio?: AudioContext;
  private overlay?: Phaser.GameObjects.Container;
  private trail: { x: number; y: number; alpha: number }[] = [];

  constructor() { super("NeonPong"); }

  create(): void {
    this.g = this.add.graphics();
    this.hud = this.add.text(W / 2, 20, "", { fontFamily: "system-ui, sans-serif", fontSize: "24px", color: "#f1edff", fontStyle: "bold" }).setOrigin(.5, 0).setDepth(2);
    this.soundLabel = this.add.text(W - 22, 20, "♫ SOUND ON [M]", { fontFamily: "system-ui, sans-serif", fontSize: "12px", color: "#e0a8ff" }).setOrigin(1, 0).setDepth(2).setInteractive({ useHandCursor: true });
    this.soundLabel.on("pointerdown", () => this.toggleSound());
    const kb = this.input.keyboard!;
    this.paddles = [
      { y: H / 2, keys: kb.addKeys({ up: Phaser.Input.Keyboard.KeyCodes.W, down: Phaser.Input.Keyboard.KeyCodes.S }) as Record<string, Phaser.Input.Keyboard.Key>, touch: 0 },
      { y: H / 2, keys: kb.addKeys({ up: Phaser.Input.Keyboard.KeyCodes.UP, down: Phaser.Input.Keyboard.KeyCodes.DOWN }) as Record<string, Phaser.Input.Keyboard.Key>, touch: 0 },
    ];
    kb.addKey(Phaser.Input.Keyboard.KeyCodes.M).on("down", () => this.toggleSound());
    kb.addKey(Phaser.Input.Keyboard.KeyCodes.R).on("down", () => { if (this.ended) this.restart(); });
    kb.addCapture([Phaser.Input.Keyboard.KeyCodes.UP, Phaser.Input.Keyboard.KeyCodes.DOWN, Phaser.Input.Keyboard.KeyCodes.M]);
    kb.on("keydown", () => this.enableAudio());
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => { void this.audio?.close(); });
    this.input.on("pointerdown", () => { if (this.ended) this.restart(); else this.enableAudio(); });
    document.querySelectorAll<HTMLButtonElement>("[data-paddle]").forEach((button) => {
      const paddle = this.paddles[Number(button.dataset.paddle) - 1], dir = button.dataset.dir === "up" ? -1 : 1;
      button.addEventListener("pointerdown", (event) => { event.preventDefault(); paddle.touch = dir; });
      for (const event of ["pointerup", "pointercancel", "pointerleave"]) button.addEventListener(event, () => { paddle.touch = 0; });
    });
    this.resetBall(1);
    this.draw();
  }

  update(_time: number, delta: number): void {
    if (this.ended) return;
    const dt = Math.min(delta / 1000, .04);
    for (const paddle of this.paddles) {
      const direction = Number(paddle.keys.down.isDown) - Number(paddle.keys.up.isDown) || paddle.touch;
      paddle.y = Phaser.Math.Clamp(paddle.y + direction * 390 * dt, 80 + PADDLE_H / 2, H - 24 - PADDLE_H / 2);
    }
    if (this.serveWait > 0) this.serveWait -= delta;
    else {
      this.ball.x += this.ball.vx * dt;
      this.ball.y += this.ball.vy * dt;
      this.trail.unshift({ x: this.ball.x, y: this.ball.y, alpha: 1 });
      this.trail = this.trail.slice(0, 9).map((p, i) => ({ ...p, alpha: 1 - i / 10 }));
      if (this.ball.y < 72 || this.ball.y > H - 18) { this.ball.vy *= -1; this.ball.y = Phaser.Math.Clamp(this.ball.y, 72, H - 18); this.tone(270, .045, "sine", .025); }
      const paddleX = [44, W - 44];
      for (let i = 0; i < 2; i++) {
        const movingToward = i === 0 ? this.ball.vx < 0 : this.ball.vx > 0;
        if (movingToward && Math.abs(this.ball.x - paddleX[i]) < 17 && Math.abs(this.ball.y - this.paddles[i].y) < PADDLE_H / 2 + 8) {
          const offset = Phaser.Math.Clamp((this.ball.y - this.paddles[i].y) / (PADDLE_H / 2), -1, 1);
          const angle = offset * 1.03;
          this.ball.speed = Math.min(690, this.ball.speed + 18);
          this.ball.vx = (i === 0 ? 1 : -1) * this.ball.speed * Math.cos(angle);
          this.ball.vy = this.ball.speed * Math.sin(angle);
          this.ball.x = paddleX[i] + (i === 0 ? 17 : -17);
          this.tone(420 + Math.abs(offset) * 240, .08, "triangle", .04);
          break;
        }
      }
      if (this.ball.x < 0 || this.ball.x > W) this.point(this.ball.x > W ? 0 : 1);
    }
    this.hud.setText(`P1  ${this.scores[0]}     FIRST TO ${WIN_SCORE}     ${this.scores[1]}  P2`);
    this.draw();
  }

  private resetBall(direction: number): void {
    this.ball = { x: W / 2, y: H / 2, vx: direction * 360, vy: (Math.random() * 180 - 90), speed: 360 };
    this.serveWait = 850;
    this.trail = [];
  }

  private point(player: number): void {
    this.scores[player]++;
    this.tone(player ? 880 : 680, .16, "triangle", .055);
    this.tone(player ? 1175 : 980, .2, "triangle", .045, .12);
    if (this.scores[player] >= WIN_SCORE) {
      this.ended = true;
      this.overlay = this.add.container(0, 0, [
        this.add.rectangle(W / 2, H / 2, W, H, 0x080814, .82),
        this.add.text(W / 2, 218, `PLAYER ${player + 1} WINS!`, { fontSize: "38px", fontFamily: "system-ui, sans-serif", color: player ? "#ff9cf2" : "#84f3e3", fontStyle: "bold" }).setOrigin(.5),
        this.add.text(W / 2, 276, `${this.scores[0]}  —  ${this.scores[1]}`, { fontSize: "28px", fontFamily: "system-ui, sans-serif", color: "#f2edff" }).setOrigin(.5),
        this.add.text(W / 2, 338, "R 키 또는 화면을 눌러 다시 경기", { fontSize: "15px", fontFamily: "system-ui, sans-serif", color: "#b8b0ce" }).setOrigin(.5),
      ]).setDepth(5);
      [523, 659, 784, 1047].forEach((f, i) => this.tone(f, .22, "triangle", .05, i * .14));
    } else this.resetBall(player === 0 ? -1 : 1);
  }

  private restart(): void { this.overlay?.destroy(); this.overlay = undefined; this.scores = [0, 0]; this.paddles.forEach((p) => { p.y = H / 2; }); this.ended = false; this.resetBall(1); }

  private enableAudio(): void {
    if (this.muted) return;
    try { const C = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext; if (!C) return; this.audio ??= new C(); if (this.audio.state === "suspended") void this.audio.resume(); }
    catch { this.audio = undefined; }
  }

  private tone(frequency: number, duration: number, type: OscillatorType, volume: number, delay = 0): void {
    if (this.muted || !this.audio || this.audio.state === "closed") return;
    try { const t = this.audio.currentTime + delay, o = this.audio.createOscillator(), g = this.audio.createGain(); o.type = type; o.frequency.setValueAtTime(frequency, t); g.gain.setValueAtTime(volume, t); g.gain.exponentialRampToValueAtTime(.001, t + duration); o.connect(g).connect(this.audio.destination); o.start(t); o.stop(t + duration); }
    catch { /* Audio must not interrupt the match. */ }
  }

  private toggleSound(): void { this.muted = !this.muted; this.soundLabel.setText(this.muted ? "♫ SOUND OFF [M]" : "♫ SOUND ON [M]").setColor(this.muted ? "#9aa3bc" : "#e0a8ff"); if (!this.muted) { this.enableAudio(); this.tone(660, .12, "triangle", .04); } }

  private draw(): void {
    const g = this.g; g.clear().fillStyle(0x0b0b18).fillRect(0, 0, W, H);
    g.fillStyle(0xc0a1ff, .2);
    for (let y = 86; y < H; y += 34) for (let x = 20; x < W; x += 34) g.fillCircle(x, y, 1);
    g.lineStyle(2, 0xb18bdf, .24).strokeRoundedRect(14, 68, W - 28, H - 84, 14);
    g.lineStyle(2, 0xbba3df, .35);
    for (let y = 82; y < H - 24; y += 25) g.fillRect(W / 2 - 2, y, 4, 12);
    const colors = [0x83f2df, 0xf49be9], xs = [44, W - 44];
    this.paddles.forEach((p, i) => { g.fillStyle(colors[i], .16).fillRoundedRect(xs[i] - 14, p.y - PADDLE_H / 2 - 8, 28, PADDLE_H + 16, 14); g.fillStyle(colors[i]).fillRoundedRect(xs[i] - 6, p.y - PADDLE_H / 2, 12, PADDLE_H, 6); });
    for (const t of this.trail) g.fillStyle(0xcdb0ff, t.alpha * .17).fillCircle(t.x, t.y, 11 * t.alpha + 2);
    g.fillStyle(0xe4d5ff, .18).fillCircle(this.ball.x, this.ball.y, 22);
    g.fillStyle(0xffffff).fillCircle(this.ball.x, this.ball.y, 7);
    if (this.serveWait > 0) g.fillStyle(0xe6d4ff, .6).fillCircle(this.ball.x, this.ball.y, 4 + Math.sin(this.serveWait / 75) * 2);
  }
}

new Phaser.Game({ type: Phaser.AUTO, parent: "game", width: W, height: H, backgroundColor: "#0b0b18", scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH }, scene: [NeonPong] });
