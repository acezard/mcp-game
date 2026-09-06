const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const scoreEl = document.getElementById('score');
const bestEl = document.getElementById('best');
const levelEl = document.getElementById('level');
const overlay = document.getElementById('overlay');

const W = canvas.width;
const H = canvas.height;
const keys = new Set();
const bestKey = 'void-run-best';

let best = Number(localStorage.getItem(bestKey) || 0);
bestEl.textContent = best;

const state = {
  running: false,
  score: 0,
  level: 1,
  elapsed: 0,
  spawnTimer: 0,
  shardTimer: 0,
  slowUntil: 0,
  lastTime: 0,
  enemies: [],
  shards: [],
  particles: [],
  player: { x: W / 2, y: H / 2, r: 11, speed: 260 },
};

function resetGame() {
  state.running = true;
  state.score = 0;
  state.level = 1;
  state.elapsed = 0;
  state.spawnTimer = 0;
  state.shardTimer = 0;
  state.slowUntil = 0;
  state.enemies = [];
  state.shards = [];
  state.particles = [];
  state.player.x = W / 2;
  state.player.y = H / 2;
  overlay.classList.add('hidden');
  syncHud();
}

function syncHud() {
  scoreEl.textContent = Math.floor(state.score);
  levelEl.textContent = state.level;
  bestEl.textContent = best;
}

function spawnEnemy() {
  const edge = Math.floor(Math.random() * 4);
  let x;
  let y;

  if (edge === 0) { x = Math.random() * W; y = -20; }
  if (edge === 1) { x = W + 20; y = Math.random() * H; }
  if (edge === 2) { x = Math.random() * W; y = H + 20; }
  if (edge === 3) { x = -20; y = Math.random() * H; }

  state.enemies.push({
    x,
    y,
    r: 9 + Math.random() * 5,
    speed: 82 + state.level * 7 + Math.random() * 28,
  });
}

function spawnShard() {
  state.shards.push({
    x: 50 + Math.random() * (W - 100),
    y: 50 + Math.random() * (H - 100),
    r: 7,
    phase: Math.random() * Math.PI * 2,
  });
}

function burst(x, y, count = 14) {
  for (let i = 0; i < count; i += 1) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 55 + Math.random() * 130;
    state.particles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 0.45 + Math.random() * 0.35,
      maxLife: 0.8,
    });
  }
}

function update(dt, now) {
  if (!state.running) return;

  state.elapsed += dt;
  state.score += dt * 10;
  state.level = 1 + Math.floor(state.elapsed / 15);

  let dx = 0;
  let dy = 0;
  if (keys.has('ArrowLeft') || keys.has('a')) dx -= 1;
  if (keys.has('ArrowRight') || keys.has('d')) dx += 1;
  if (keys.has('ArrowUp') || keys.has('w')) dy -= 1;
  if (keys.has('ArrowDown') || keys.has('s')) dy += 1;

  if (dx || dy) {
    const len = Math.hypot(dx, dy);
    dx /= len;
    dy /= len;
    state.player.x += dx * state.player.speed * dt;
    state.player.y += dy * state.player.speed * dt;
  }

  state.player.x = Math.max(state.player.r, Math.min(W - state.player.r, state.player.x));
  state.player.y = Math.max(state.player.r, Math.min(H - state.player.r, state.player.y));

  state.spawnTimer -= dt;
  const spawnEvery = Math.max(0.22, 1.08 - state.level * 0.06);
  if (state.spawnTimer <= 0) {
    spawnEnemy();
    state.spawnTimer = spawnEvery;
  }

  state.shardTimer -= dt;
  if (state.shardTimer <= 0 && state.shards.length < 2) {
    spawnShard();
    state.shardTimer = 4.5 + Math.random() * 3;
  }

  const slowMultiplier = now < state.slowUntil ? 0.48 : 1;

  for (const enemy of state.enemies) {
    const ex = state.player.x - enemy.x;
    const ey = state.player.y - enemy.y;
    const len = Math.hypot(ex, ey) || 1;
    enemy.x += (ex / len) * enemy.speed * slowMultiplier * dt;
    enemy.y += (ey / len) * enemy.speed * slowMultiplier * dt;

    if (Math.hypot(enemy.x - state.player.x, enemy.y - state.player.y) < enemy.r + state.player.r) {
      endGame();
      return;
    }
  }

  state.shards = state.shards.filter((shard) => {
    if (Math.hypot(shard.x - state.player.x, shard.y - state.player.y) < shard.r + state.player.r + 3) {
      state.score += 100;
      state.slowUntil = now + 2200;
      burst(shard.x, shard.y, 20);
      return false;
    }
    return true;
  });

  state.particles = state.particles.filter((p) => {
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vx *= 0.97;
    p.vy *= 0.97;
    p.life -= dt;
    return p.life > 0;
  });

  syncHud();
}

function endGame() {
  state.running = false;
  const finalScore = Math.floor(state.score);
  if (finalScore > best) {
    best = finalScore;
    localStorage.setItem(bestKey, String(best));
  }
  syncHud();
  overlay.innerHTML = `
    <h1>RUN ENDED</h1>
    <p>Score ${finalScore} · Level ${state.level}</p>
    <p class="controls">PRESS SPACE TO RUN AGAIN</p>
  `;
  overlay.classList.remove('hidden');
}

function drawGrid() {
  ctx.save();
  ctx.strokeStyle = 'rgba(124,255,240,0.055)';
  ctx.lineWidth = 1;
  const step = 48;
  for (let x = 0; x <= W; x += step) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, H);
    ctx.stroke();
  }
  for (let y = 0; y <= H; y += step) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
    ctx.stroke();
  }
  ctx.restore();
}

function draw(now) {
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = '#070912';
  ctx.fillRect(0, 0, W, H);
  drawGrid();

  for (const shard of state.shards) {
    const pulse = 1 + Math.sin(now / 220 + shard.phase) * 0.18;
    ctx.save();
    ctx.translate(shard.x, shard.y);
    ctx.rotate(now / 800);
    ctx.shadowBlur = 18;
    ctx.shadowColor = '#7cfff0';
    ctx.fillStyle = '#7cfff0';
    ctx.beginPath();
    const r = shard.r * pulse;
    ctx.moveTo(0, -r * 1.4);
    ctx.lineTo(r, 0);
    ctx.lineTo(0, r * 1.4);
    ctx.lineTo(-r, 0);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  for (const enemy of state.enemies) {
    ctx.save();
    ctx.shadowBlur = 12;
    ctx.shadowColor = '#ff4d7d';
    ctx.fillStyle = '#ff4d7d';
    ctx.beginPath();
    ctx.arc(enemy.x, enemy.y, enemy.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  for (const p of state.particles) {
    ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
    ctx.fillStyle = '#7cfff0';
    ctx.fillRect(p.x - 2, p.y - 2, 4, 4);
  }
  ctx.globalAlpha = 1;

  const slowed = now < state.slowUntil;
  ctx.save();
  ctx.shadowBlur = slowed ? 28 : 18;
  ctx.shadowColor = slowed ? '#7cfff0' : '#ffffff';
  ctx.fillStyle = slowed ? '#7cfff0' : '#ffffff';
  ctx.beginPath();
  ctx.arc(state.player.x, state.player.y, state.player.r, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function loop(timestamp) {
  const dt = Math.min(0.033, (timestamp - state.lastTime) / 1000 || 0);
  state.lastTime = timestamp;
  update(dt, timestamp);
  draw(timestamp);
  requestAnimationFrame(loop);
}

window.addEventListener('keydown', (event) => {
  const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
  if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', ' '].includes(event.key)) {
    event.preventDefault();
  }
  if (event.code === 'Space' && !state.running) resetGame();
  keys.add(key);
});

window.addEventListener('keyup', (event) => {
  const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
  keys.delete(key);
});

requestAnimationFrame(loop);
