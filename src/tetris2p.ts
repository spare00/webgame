import Phaser from "phaser";

const WIDTH = 1000;
const HEIGHT = 690;
const COLS = 10;
const ROWS = 24;
const CELL = 22;
const BOARD_WIDTH = COLS * CELL;
const BOARD_HEIGHT = ROWS * CELL;
const BOARD_X = [230, 550];
const BOARD_Y = 112;
const COLORS = [0x39d9f5, 0xf4dc55, 0xb58aff, 0x55df8a, 0x5b8dff, 0xffa34d, 0xff637d];
const SHAPES = [
  [[1, 1, 1, 1]],
  [[1, 1], [1, 1]],
  [[0, 1, 0], [1, 1, 1]],
  [[1, 0, 0], [1, 1, 1]],
  [[0, 0, 1], [1, 1, 1]],
  [[1, 1, 0], [0, 1, 1]],
  [[0, 1, 1], [1, 1, 0]],
];
type Piece = { shape: number[][]; type: number; x: number; y: number };
type Board = { grid: number[][]; piece: Piece; next: number; combo: number; gameOver: boolean };

class Tetris2PScene extends Phaser.Scene {
  private graphics!: Phaser.GameObjects.Graphics;
  private restartButton!: Phaser.GameObjects.Rectangle;
  private restartLabel!: Phaser.GameObjects.Text;
  private labels = new Map<string, Phaser.GameObjects.Text>();
  private boards!: [Board, Board];
  private levels: [number, number] = [1, 1];
  private totalLines = 0;
  private fallElapsed: [number, number] = [0, 0];
  private finished = false;
  private message = "";
  private audio?: AudioContext;
  private bgmTimer?: number;
  private bgmEnabled = true;
  private bgmStep = 0;

  constructor() { super("Tetris2P"); }

  create(): void {
    this.levels = [1, 1];
    this.totalLines = 0;
    this.fallElapsed = [0, 0];
    this.finished = false;
    this.message = "";
    this.labels.clear();
    this.graphics = this.add.graphics();
    this.restartButton = this.add.rectangle(WIDTH / 2, 382, 220, 46, 0x24416a)
      .setStrokeStyle(1, 0x8ba9d6)
      .setInteractive({ useHandCursor: true })
      .setDepth(2)
      .setVisible(false);
    this.restartLabel = this.add.text(WIDTH / 2, 382, "PLAY AGAIN", {
      fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
      fontSize: "14px",
      color: "#f2f6ff",
      letterSpacing: 1,
    }).setOrigin(0.5).setDepth(3).setVisible(false);
    this.restartButton.on("pointerover", () => this.restartButton.setFillStyle(0x315787));
    this.restartButton.on("pointerout", () => this.restartButton.setFillStyle(0x24416a));
    this.restartButton.on("pointerdown", () => this.scene.restart());
    this.boards = [this.newBoard(), this.newBoard()];
    this.input.keyboard?.addCapture(["W", "A", "S", "D", "Q", "I", "J", "K", "L", "U", "R", "M"]);
    this.input.keyboard?.on("keydown", this.onKeyDown, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.input.keyboard?.off("keydown", this.onKeyDown, this);
      this.stopBgm();
      void this.audio?.close();
      this.audio = undefined;
    });
    this.draw();
  }

  update(_time: number, delta: number): void {
    if (!this.finished) {
      this.boards.forEach((board, player) => {
        if (board.gameOver) return;
        this.fallElapsed[player] += delta;
        const delay = Math.max(100, 600 - this.levels[player] * 60);
        if (this.fallElapsed[player] >= delay) {
          this.fallElapsed[player] %= delay;
          this.step(player as 0 | 1, 1);
        }
      });
      if (this.boards.some((board) => board.gameOver)) this.endGame();
    }
    this.draw();
  }

  private newBoard(): Board {
    const board: Board = {
      grid: Array.from({ length: ROWS }, () => Array<number>(COLS).fill(0)),
      piece: { shape: [[1]], type: 0, x: 3, y: 0 },
      next: this.randomType(),
      combo: 0,
      gameOver: false,
    };
    this.spawn(board);
    return board;
  }

  private randomType(): number { return Math.floor(Math.random() * SHAPES.length); }

  private spawn(board: Board): void {
    const type = board.next;
    board.piece = { shape: SHAPES[type].map((row) => [...row]), type, x: Math.floor((COLS - SHAPES[type][0].length) / 2), y: 0 };
    board.next = this.randomType();
    if (this.collides(board, board.piece.x, board.piece.y, board.piece.shape)) board.gameOver = true;
  }

  private collides(board: Board, px: number, py: number, shape: number[][]): boolean {
    return shape.some((row, y) => row.some((cell, x) => {
      if (!cell) return false;
      const bx = px + x;
      const by = py + y;
      return bx < 0 || bx >= COLS || by >= ROWS || (by >= 0 && board.grid[by][bx] !== 0);
    }));
  }

  private step(player: 0 | 1, amount: number): void {
    const board = this.boards[player];
    if (board.gameOver) return;
    if (!this.collides(board, board.piece.x, board.piece.y + amount, board.piece.shape)) {
      board.piece.y += amount;
      return;
    }
    this.lock(player);
  }

  private lock(player: 0 | 1): void {
    const board = this.boards[player];
    const { piece } = board;
    piece.shape.forEach((row, y) => row.forEach((cell, x) => {
      if (cell && piece.y + y >= 0) board.grid[piece.y + y][piece.x + x] = piece.type + 1;
    }));
    let cleared = 0;
    for (let y = ROWS - 1; y >= 0; y--) {
      if (board.grid[y].every(Boolean)) {
        board.grid.splice(y, 1);
        board.grid.unshift(Array<number>(COLS).fill(0));
        cleared++;
        y++;
      }
    }
    if (cleared) {
      this.playTone(cleared >= 2 ? 880 : 660, 0.14, "triangle", 0.06);
      this.totalLines += cleared;
      const level = Math.floor(this.totalLines / 10) + 1;
      this.levels = [level, level];
      if (cleared >= 2) {
        board.combo++;
        this.playTone(190, 0.22, "square", 0.045);
        this.addGarbage((1 - player) as 0 | 1, Math.min(cleared - 1 + board.combo, 4));
      } else board.combo = 0;
    } else board.combo = 0;
    this.playTone(125, 0.08, "square", 0.04);
    this.spawn(board);
  }

  private addGarbage(player: 0 | 1, count: number): void {
    const board = this.boards[player];
    for (let i = 0; i < count; i++) {
      if (board.grid.shift()?.some(Boolean)) board.gameOver = true;
      const row = Array<number>(COLS).fill(8);
      row[Math.floor(Math.random() * COLS)] = 0;
      board.grid.push(row);
    }
  }

  private move(player: 0 | 1, dx: number): void {
    const board = this.boards[player];
    if (!board.gameOver && !this.collides(board, board.piece.x + dx, board.piece.y, board.piece.shape)) {
      board.piece.x += dx;
      this.playTone(300, 0.035, "square", 0.018);
    }
  }

  private rotate(player: 0 | 1): void {
    const board = this.boards[player];
    if (board.gameOver) return;
    const rotated = board.piece.shape[0].map((_, x) => board.piece.shape.map((row) => row[row.length - 1 - x]));
    for (const kick of [0, -1, 1, -2, 2]) {
      if (!this.collides(board, board.piece.x + kick, board.piece.y, rotated)) {
        board.piece.x += kick;
        board.piece.shape = rotated;
        this.playTone(600, 0.06, "triangle", 0.035);
        return;
      }
    }
  }

  private hardDrop(player: 0 | 1): void {
    const board = this.boards[player];
    if (board.gameOver) return;
    while (!this.collides(board, board.piece.x, board.piece.y + 1, board.piece.shape)) board.piece.y++;
    this.playTone(110, 0.12, "square", 0.055);
    this.lock(player);
  }

  private onKeyDown(event: KeyboardEvent): void {
    const key = event.key.toLowerCase();
    try { this.startAudio(); } catch { /* Audio must never block gameplay input. */ }
    if (key === "m") {
      if (event.repeat) return;
      this.bgmEnabled = !this.bgmEnabled;
      if (this.bgmEnabled) this.startBgm(); else this.stopBgm();
      return;
    }
    if (key === "r") { if (!event.repeat) this.scene.restart(); return; }
    if (this.finished) return;
    switch (key) {
      case "a": this.move(0, -1); break;
      case "d": this.move(0, 1); break;
      case "w": this.rotate(0); break;
      case "s": this.step(0, 1); break;
      case "q": this.hardDrop(0); break;
      case "j": this.move(1, -1); break;
      case "l": this.move(1, 1); break;
      case "i": this.rotate(1); break;
      case "k": this.step(1, 1); break;
      case "u": this.hardDrop(1); break;
      default: return;
    }
    event.preventDefault();
  }

  private endGame(): void {
    this.finished = true;
    this.stopBgm();
    this.restartButton.setVisible(true);
    this.restartLabel.setVisible(true);
    this.message = this.boards[0].gameOver && this.boards[1].gameOver ? "DRAW" : this.boards[0].gameOver ? "PLAYER 2 WINS" : "PLAYER 1 WINS";
    [523, 659, 784].forEach((frequency, index) => this.playTone(frequency, 0.2, "triangle", 0.06, index * 170));
  }

  private startAudio(): void {
    try {
      if (!this.audio) {
        const AudioContextClass = window.AudioContext;
        if (!AudioContextClass) return;
        this.audio = new AudioContextClass();
      }
      if (this.audio.state === "suspended") void this.audio.resume().catch(() => undefined);
      if (this.bgmEnabled) this.startBgm();
    } catch {
      this.stopBgm();
      this.audio = undefined;
    }
  }

  private playTone(frequency: number, duration: number, type: OscillatorType, volume: number, delay = 0): void {
    if (!this.audio || this.audio.state === "closed") return;
    try {
      const start = this.audio.currentTime + delay / 1000;
      const oscillator = this.audio.createOscillator();
      const gain = this.audio.createGain();
      oscillator.type = type;
      oscillator.frequency.setValueAtTime(frequency, start);
      gain.gain.setValueAtTime(volume, start);
      gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
      oscillator.connect(gain).connect(this.audio.destination);
      oscillator.start(start);
      oscillator.stop(start + duration);
    } catch {
      // Ignore unavailable or suspended audio devices; game input stays active.
    }
  }

  private startBgm(): void {
    if (this.bgmTimer !== undefined || !this.audio) return;
    const melody = [220, 262, 330, 294, 196, 247, 294, 262, 165, 220, 262, 247, 196, 247, 330, 294];
    this.bgmTimer = window.setInterval(() => {
      if (!this.bgmEnabled || !this.audio || this.audio.state !== "running") return;
      const note = melody[this.bgmStep++ % melody.length];
      this.playTone(note, 0.16, "square", 0.012);
      if (this.bgmStep % 4 === 0) this.playTone(note / 2, 0.19, "triangle", 0.018);
    }, 180);
  }

  private stopBgm(): void {
    if (this.bgmTimer !== undefined) window.clearInterval(this.bgmTimer);
    this.bgmTimer = undefined;
  }

  private drawBlock(x: number, y: number, color: number, size = CELL): void {
    const g = this.graphics;
    const pad = size > 12 ? 2 : 1;
    g.fillStyle(color, 1).fillRoundedRect(x + pad, y + pad, size - pad * 2, size - pad * 2, 3);
    g.fillStyle(0xffffff, 0.22).fillRect(x + pad + 2, y + pad + 1, size - pad * 2 - 4, 2);
    g.lineStyle(1, 0x080d18, 0.6).strokeRoundedRect(x + pad, y + pad, size - pad * 2, size - pad * 2, 3);
  }

  private draw(): void {
    const g = this.graphics;
    this.labels.forEach((label) => label.setVisible(false));
    g.clear();
    g.fillStyle(0x0c1424).fillRect(0, 0, WIDTH, HEIGHT);
    g.fillStyle(0x101b2e).fillRoundedRect(18, 18, 964, 654, 10);
    this.text(42, 36, "PLAYER 1", 18, "#55d6ed");
    this.text(42, 62, "A D MOVE   W ROTATE   S DOWN   Q DROP", 10, "#8294b6");
    this.text(958, 36, "PLAYER 2", 18, "#ff9f66", "right");
    this.text(958, 62, "J L MOVE   I ROTATE   K DOWN   U DROP", 10, "#8294b6", "right");

    // Quiet center guide keeps each player's board easy to read at a glance.
    g.lineStyle(1, 0x7384a3, 0.34);
    for (let y = BOARD_Y + 4; y < BOARD_Y + BOARD_HEIGHT; y += 12) g.fillStyle(0x7384a3, 0.34).fillCircle(WIDTH / 2, y, 1.5);
    this.text(WIDTH / 2, 78, "VS", 11, "#8090ad", "center");

    this.boards.forEach((board, player) => {
      const x = BOARD_X[player];
      const accent = player === 0 ? 0x55d6ed : 0xff9f66;
      g.fillStyle(0x080e19).fillRoundedRect(x - 3, BOARD_Y - 3, BOARD_WIDTH + 6, BOARD_HEIGHT + 6, 5);
      g.lineStyle(2, accent, 0.8).strokeRoundedRect(x - 3, BOARD_Y - 3, BOARD_WIDTH + 6, BOARD_HEIGHT + 6, 5);
      g.fillStyle(0x0a1220).fillRect(x, BOARD_Y, BOARD_WIDTH, BOARD_HEIGHT);
      g.lineStyle(1, 0x26344a, 0.62);
      for (let col = 1; col < COLS; col++) g.lineBetween(x + col * CELL, BOARD_Y, x + col * CELL, BOARD_Y + BOARD_HEIGHT);
      for (let row = 1; row < ROWS; row++) g.lineBetween(x, BOARD_Y + row * CELL, x + BOARD_WIDTH, BOARD_Y + row * CELL);

      board.grid.forEach((row, y) => row.forEach((value, col) => {
        if (value) this.drawBlock(x + col * CELL, BOARD_Y + y * CELL, value === 8 ? 0xff526a : COLORS[value - 1]);
      }));
      const { piece } = board;
      let ghostY = piece.y;
      while (!this.collides(board, piece.x, ghostY + 1, piece.shape)) ghostY++;
      piece.shape.forEach((row, py) => row.forEach((cell, px) => {
        if (!cell) return;
        const gx = x + (piece.x + px) * CELL;
        const gy = BOARD_Y + (ghostY + py) * CELL;
        if (ghostY !== piece.y) {
          g.lineStyle(1, COLORS[piece.type], 0.45).strokeRoundedRect(gx + 4, gy + 4, CELL - 8, CELL - 8, 3);
        }
        this.drawBlock(x + (piece.x + px) * CELL, BOARD_Y + (piece.y + py) * CELL, COLORS[piece.type]);
      }));

      this.text(x + BOARD_WIDTH / 2, 657, `LEVEL ${this.levels[player]}     LINES ${this.totalLines}`, 12, "#c7d4ed", "center");
      const previewX = player === 0 ? 96 : 832;
      this.text(previewX + 36, 155, "NEXT", 12, "#92a2bf", "center");
      g.fillStyle(0x0a1220).fillRoundedRect(previewX, 176, 72, 72, 6);
      g.lineStyle(1, 0x34435f, 1).strokeRoundedRect(previewX, 176, 72, 72, 6);
      const nextShape = SHAPES[board.next];
      const cell = 16;
      const ox = previewX + (72 - nextShape[0].length * cell) / 2;
      const oy = 176 + (72 - nextShape.length * cell) / 2;
      nextShape.forEach((row, y) => row.forEach((value, x2) => {
        if (value) this.drawBlock(ox + x2 * cell, oy + y * cell, COLORS[board.next], cell);
      }));
      if (board.combo > 0) this.text(previewX + 36, 271, `COMBO ×${board.combo}`, 11, "#ffd56a", "center");
    });

    if (this.finished) {
      g.fillStyle(0x050914, 0.78).fillRoundedRect(206, 260, 588, 150, 12);
      this.text(WIDTH / 2, 294, this.message, 30, "#f2f6ff", "center");
      this.text(WIDTH / 2, 344, "PRESS R OR CLICK BELOW", 12, "#9db0d3", "center");
    }
  }

  private text(x: number, y: number, value: string, size: number, color: string, align: "left" | "center" | "right" = "left"): void {
    const key = `${x}:${y}:${size}:${align}`;
    let label = this.labels.get(key);
    if (!label) {
      label = this.add.text(x, y, value, { fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: `${size}px`, color, align, letterSpacing: size > 14 ? 1.5 : 0 }).setOrigin(align === "left" ? 0 : align === "right" ? 1 : 0.5).setDepth(1);
      this.labels.set(key, label);
    }
    label.setText(value).setColor(color).setVisible(true);
  }
}

new Phaser.Game({
  type: Phaser.AUTO,
  parent: "game",
  width: WIDTH,
  height: HEIGHT,
  backgroundColor: "#0c1424",
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  scene: [Tetris2PScene],
});
