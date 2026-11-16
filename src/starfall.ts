type FallingObject = { x: number; y: number; speed: number; size: number; spin: number; phase: number };
type Particle = { x: number; y: number; vx: number; vy: number; life: number; color: string; size: number };
type Mode = "ready" | "playing" | "paused" | "over";

const canvas = document.querySelector<HTMLCanvasElement>("#game")!;
const ctx = canvas.getContext("2d")!;
const W = canvas.width, H = canvas.height;
const player = { x: W / 2, y: H - 68, targetX: W / 2, radius: 19 };
const keys = new Set<string>();
const gems: FallingObject[] = [], rocks: FallingObject[] = [], particles: Particle[] = [];
const backdrop = Array.from({ length: 105 }, () => ({ x: Math.random() * W, y: Math.random() * H, size: .5 + Math.random() * 1.5, blink: Math.random() * 7 }));
const bestKey = "starfallBest";
let mode: Mode = "ready", score = 0, best = Number(localStorage.getItem(bestKey) || 0), lives = 3, elapsed = 0, gemClock = .6, rockClock = 1.2, lastFrame = 0, muted = false;
let audio: AudioContext | undefined;

function sound(frequency: number, duration: number, type: OscillatorType = "sine", volume = .045, slide = 0): void {
  if (muted || !audio || audio.state === "closed") return;
  try {
    const oscillator = audio.createOscillator(), gain = audio.createGain(), now = audio.currentTime;
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, now);
    if (slide) oscillator.frequency.exponentialRampToValueAtTime(Math.max(30, frequency + slide), now + duration);
    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(.001, now + duration);
    oscillator.connect(gain).connect(audio.destination);
    oscillator.start(now); oscillator.stop(now + duration);
  } catch { /* Audio is optional; gameplay continues if the browser blocks it. */ }
}

function wakeAudio(): void {
  if (muted) return;
  try {
    const AudioContextClass = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;
    audio ??= new AudioContextClass();
    if (audio.state === "suspended") void audio.resume();
  } catch { /* Sound is optional. */ }
}

function reset(): void {
  score = 0; lives = 3; elapsed = 0; gemClock = .4; rockClock = 1.3;
  gems.length = 0; rocks.length = 0; particles.length = 0;
  player.x = W / 2; player.targetX = W / 2; mode = "playing";
  wakeAudio(); sound(520, .12, "triangle", .035, 220);
}

function burst(x: number, y: number, color: string, amount = 14): void {
  for (let i = 0; i < amount; i++) {
    const angle = Math.random() * Math.PI * 2, speed = 45 + Math.random() * 190;
    particles.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life: .35 + Math.random() * .4, color, size: 2 + Math.random() * 3 });
  }
}

function startOrResume(): void {
  wakeAudio();
  if (mode === "ready" || mode === "over") reset();
  else if (mode === "paused") mode = "playing";
}

function endGame(): void {
  mode = "over"; burst(player.x, player.y, "#ff7897", 26); sound(190, .38, "sawtooth", .055, -130);
  if (score > best) { best = score; localStorage.setItem(bestKey, String(best)); }
}

function drawShip(x: number, y: number): void {
  ctx.save(); ctx.translate(x, y);
  ctx.shadowColor = "#58dcff"; ctx.shadowBlur = 22;
  ctx.fillStyle = "#7ce7ff"; ctx.beginPath(); ctx.moveTo(0, -25); ctx.lineTo(19, 19); ctx.lineTo(0, 12); ctx.lineTo(-19, 19); ctx.closePath(); ctx.fill();
  ctx.shadowBlur = 0; ctx.fillStyle = "#f5fcff"; ctx.beginPath(); ctx.ellipse(0, -4, 6, 10, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#ffb968"; ctx.globalAlpha = .65 + Math.random() * .3; ctx.beginPath(); ctx.moveTo(-7, 16); ctx.lineTo(0, 29 + Math.random() * 8); ctx.lineTo(7, 16); ctx.fill();
  ctx.restore();
}

function drawGem(item: FallingObject): void {
  ctx.save(); ctx.translate(item.x, item.y); ctx.rotate(item.spin); ctx.shadowColor = "#ffe680"; ctx.shadowBlur = 18;
  ctx.fillStyle = "#ffe783"; ctx.beginPath(); ctx.moveTo(0, -item.size); ctx.lineTo(item.size * .75, 0); ctx.lineTo(0, item.size); ctx.lineTo(-item.size * .75, 0); ctx.closePath(); ctx.fill();
  ctx.shadowBlur = 0; ctx.fillStyle = "#fff6c4"; ctx.beginPath(); ctx.moveTo(0, -item.size * .65); ctx.lineTo(item.size * .3, 0); ctx.lineTo(0, item.size * .55); ctx.lineTo(-item.size * .3, 0); ctx.fill(); ctx.restore();
}

function drawRock(item: FallingObject): void {
  ctx.save(); ctx.translate(item.x, item.y); ctx.rotate(item.spin); ctx.shadowColor = "#ff668f"; ctx.shadowBlur = 13;
  ctx.fillStyle = "#ad526e"; ctx.strokeStyle = "#ff9bac"; ctx.lineWidth = 2;
  ctx.beginPath();
  for (let i = 0; i < 9; i++) { const angle = i * Math.PI * 2 / 9, radius = item.size * (.78 + Math.sin(i * 8 + item.phase) * .16); const x = Math.cos(angle) * radius, y = Math.sin(angle) * radius; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
  ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.shadowBlur = 0;
  ctx.fillStyle = "#733f5a"; ctx.beginPath(); ctx.arc(-item.size * .2, -item.size * .12, item.size * .18, 0, Math.PI * 2); ctx.fill(); ctx.restore();
}

function drawOverlay(title: string, lines: string[]): void {
  ctx.fillStyle = "rgba(6, 9, 24, .76)"; ctx.fillRect(0, 0, W, H);
  ctx.textAlign = "center"; ctx.shadowColor = "#55cfff"; ctx.shadowBlur = 24;
  ctx.fillStyle = "#f5f7ff"; ctx.font = "800 48px system-ui, sans-serif"; ctx.fillText(title, W / 2, 204);
  ctx.shadowBlur = 0;
  lines.forEach((line, index) => { ctx.fillStyle = index === lines.length - 1 ? "#ffe18a" : "#bac7e5"; ctx.font = `${index === lines.length - 1 ? 700 : 500} ${index === 0 ? 20 : 16}px system-ui, sans-serif`; ctx.fillText(line, W / 2, 258 + index * 34); });
}

function render(dt: number): void {
  ctx.fillStyle = "#080c1c"; ctx.fillRect(0, 0, W, H);
  const gradient = ctx.createRadialGradient(W * .5, H * .18, 10, W * .5, H * .4, H * .9);
  gradient.addColorStop(0, "#17254a"); gradient.addColorStop(1, "#080c1c"); ctx.fillStyle = gradient; ctx.fillRect(0, 0, W, H);
  backdrop.forEach(star => { star.blink += dt; ctx.globalAlpha = .35 + (Math.sin(star.blink * 2) + 1) * .3; ctx.fillStyle = "#d6e8ff"; ctx.fillRect(star.x, star.y, star.size, star.size); }); ctx.globalAlpha = 1;
  ctx.strokeStyle = "rgba(116, 157, 223, .08)"; ctx.lineWidth = 1;
  for (let i = 0; i < 8; i++) { const y = (i * 86 + (elapsed * 35) % 86); ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
  gems.forEach(drawGem); rocks.forEach(drawRock); particles.forEach(p => { ctx.globalAlpha = Math.max(0, p.life * 2); ctx.fillStyle = p.color; ctx.fillRect(p.x, p.y, p.size, p.size); }); ctx.globalAlpha = 1;
  drawShip(player.x, player.y);

  ctx.textAlign = "left"; ctx.fillStyle = "#f4f7ff"; ctx.font = "700 18px system-ui, sans-serif"; ctx.fillText(`SCORE  ${score}`, 24, 34);
  ctx.fillStyle = "#ffe18a"; ctx.fillText(`BEST  ${best}`, 24, 61);
  ctx.textAlign = "right"; ctx.fillStyle = "#ff8ca5"; ctx.fillText("♥ ".repeat(lives).trim(), W - 24, 36);
  ctx.fillStyle = muted ? "#7b87a8" : "#b4e9ff"; ctx.font = "13px system-ui, sans-serif"; ctx.fillText(`♫ ${muted ? "OFF" : "ON"}  [M]`, W - 24, 61);

  if (mode === "ready") drawOverlay("STARFALL", ["별빛 수정을 모으고 운석을 피하세요", "← → 또는 A / D 로 우주선을 조종하세요", "클릭하거나 SPACE를 눌러 시작"]);
  if (mode === "paused") drawOverlay("PAUSED", ["잠깐 숨을 고르세요", "P 키 또는 화면을 눌러 계속"]);
  if (mode === "over") drawOverlay("GAME OVER", [`최종 점수  ${score}     ·     최고 기록  ${best}`, "R 키 또는 화면을 눌러 다시 도전", "클릭해서 시작"]);
}

function frame(now: number): void {
  const dt = Math.min((now - lastFrame) / 1000 || 0, .04); lastFrame = now;
  if (mode === "playing") {
    elapsed += dt;
    const speedScale = 1 + Math.min(elapsed / 65, 1.2);
    if (keys.has("arrowleft") || keys.has("a")) player.targetX -= 390 * dt;
    if (keys.has("arrowright") || keys.has("d")) player.targetX += 390 * dt;
    player.targetX = Math.max(26, Math.min(W - 26, player.targetX));
    player.x += (player.targetX - player.x) * Math.min(1, dt * 13);

    gemClock -= dt; rockClock -= dt;
    if (gemClock <= 0) { gems.push({ x: 32 + Math.random() * (W - 64), y: -20, speed: (145 + Math.random() * 85) * speedScale, size: 12 + Math.random() * 4, spin: 0, phase: 0 }); gemClock = .48 + Math.random() * .48; }
    if (rockClock <= 0) { rocks.push({ x: 32 + Math.random() * (W - 64), y: -30, speed: (185 + Math.random() * 110) * speedScale, size: 15 + Math.random() * 12, spin: 0, phase: Math.random() * 8 }); rockClock = Math.max(.34, .95 + Math.random() * .65 - elapsed * .007); }

    for (let i = gems.length - 1; i >= 0; i--) { const item = gems[i]; item.y += item.speed * dt; item.spin += dt * 2.5; if (Math.hypot(item.x - player.x, item.y - player.y) < item.size + player.radius) { gems.splice(i, 1); score += 10; burst(item.x, item.y, "#ffe783", 10); sound(760, .11, "triangle", .045, 300); sound(1060, .14, "sine", .026, 120); } else if (item.y > H + 30) gems.splice(i, 1); }
    for (let i = rocks.length - 1; i >= 0; i--) { const item = rocks[i]; item.y += item.speed * dt; item.spin += dt * (item.phase % 2 ? 1.5 : -1.4); if (Math.hypot(item.x - player.x, item.y - player.y) < item.size + player.radius - 4) { rocks.splice(i, 1); lives--; burst(player.x, player.y, "#ff7897", 18); sound(165, .24, "sawtooth", .055, -85); if (lives <= 0) endGame(); } else if (item.y > H + 40) rocks.splice(i, 1); }
  }
  for (let i = particles.length - 1; i >= 0; i--) { const p = particles[i]; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 90 * dt; p.life -= dt; if (p.life <= 0) particles.splice(i, 1); }
  render(dt); requestAnimationFrame(frame);
}

window.addEventListener("keydown", event => {
  const key = event.key.toLowerCase();
  if (["arrowleft", "arrowright", " "].includes(key)) event.preventDefault();
  keys.add(key);
  if (key === " " && (mode === "ready" || mode === "over")) startOrResume();
  if (key === "r") reset();
  if (key === "p") { if (mode === "playing") mode = "paused"; else if (mode === "paused") startOrResume(); }
  if (key === "m") { muted = !muted; if (!muted) { wakeAudio(); sound(660, .12, "triangle", .035); } }
});
window.addEventListener("keyup", event => keys.delete(event.key.toLowerCase()));
canvas.addEventListener("pointerdown", event => {
  wakeAudio();
  if (mode !== "playing") { startOrResume(); return; }
  const rect = canvas.getBoundingClientRect();
  player.targetX = (event.clientX - rect.left) / rect.width * W;
});
canvas.addEventListener("pointermove", event => {
  if (mode !== "playing" || event.buttons === 0 || matchMedia("(pointer: coarse)").matches) return;
  const rect = canvas.getBoundingClientRect(); player.targetX = (event.clientX - rect.left) / rect.width * W;
});
for (const [id, direction] of [["left", -1], ["right", 1]] as const) {
  const button = document.getElementById(id)!;
  button.addEventListener("pointerdown", event => { event.preventDefault(); if (mode !== "playing") startOrResume(); keys.add(direction < 0 ? "arrowleft" : "arrowright"); });
  for (const eventName of ["pointerup", "pointerleave", "pointercancel"] as const) button.addEventListener(eventName, () => keys.delete(direction < 0 ? "arrowleft" : "arrowright"));
}

requestAnimationFrame(frame);
