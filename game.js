import { openingWaves } from './level.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const overlay = document.getElementById('overlay');
const startButton = document.getElementById('start');
const statusEl = document.getElementById('status');
const scoreEl = document.getElementById('score');
const hpEl = document.getElementById('hp');
const powerEl = document.getElementById('power');
const livesEl = document.getElementById('lives');
const timeEl = document.getElementById('time');

const W = canvas.width;
const H = canvas.height;
const ASSET_BASE = 'https://raw.githubusercontent.com/acezard/aceforceone/master/public/assets/images/';

const assetFiles = {
  player: 'player2.png',
  scout: 'scout.png',
  redBomber: 'enemy-xs-1.png',
  rogueLeader: 'rogueleader.png',
  purpleBullet: 'bigbullet.png',
  redBullet: 'bullet_red2.png',
  redRay: 'ray_red.png',
  nebula: 'nebula.png',
  smallStars: 'smallstars.png',
  bigStars: 'bigstars.png',
};

const enemyConfig = {
  scout: { image: 'scout', width: 50, height: 44, speed: 500, hp: 2, score: 50 },
  redBomber: { image: 'redBomber', width: 75, height: 53, speed: 100, hp: 10, score: 100, rof: 0.1 },
  rogueLeader: { image: 'rogueLeader', width: 200, height: 89, speed: 100, hp: 60, score: 300, rof: 0.5 },
};

const keys = new Set();
const images = {};

const state = {
  running: false,
  elapsed: 0,
  score: 0,
  lives: 3,
  waveIndex: 0,
  scheduledSpawns: [],
  enemies: [],
  bullets: [],
  enemyBullets: [],
  particles: [],
  lastTime: 0,
  lastPurpleFire: 0,
  player: {
    x: W / 2 - 37.5,
    y: H - 100,
    width: 75,
    height: 63,
    speed: 600,
    hp: 100,
    power: 0,
    invulnerableUntil: 0,
    targetX: W / 2,
    targetY: H - 70,
  },
  background: {
    nebulaY: -450,
    smallY1: 0,
    smallY2: -800,
    bigY1: 0,
    bigY2: -800,
  },
};

function preloadImages() {
  return Promise.all(Object.entries(assetFiles).map(([key, file]) => new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      images[key] = img;
      resolve();
    };
    img.onerror = () => reject(new Error(`Could not load ${file}`));
    img.src = `${ASSET_BASE}${file}`;
  })));
}

function resetGame() {
  state.running = true;
  state.elapsed = 0;
  state.score = 0;
  state.lives = 3;
  state.waveIndex = 0;
  state.scheduledSpawns = [];
  state.enemies = [];
  state.bullets = [];
  state.enemyBullets = [];
  state.particles = [];
  state.lastPurpleFire = 0;
  state.player.x = W / 2 - state.player.width / 2;
  state.player.y = H - 100;
  state.player.hp = 100;
  state.player.power = 0;
  state.player.invulnerableUntil = 0;
  state.player.targetX = W / 2;
  state.player.targetY = H - 70;
  state.background.nebulaY = -450;
  state.background.smallY1 = 0;
  state.background.smallY2 = -800;
  state.background.bigY1 = 0;
  state.background.bigY2 = -800;
  overlay.classList.add('hidden');
  statusEl.textContent = 'STAGE 1 · OPENING';
  syncHud();
}

function syncHud() {
  scoreEl.textContent = String(Math.max(0, Math.round(state.score))).padStart(6, '0');
  hpEl.textContent = Math.max(0, Math.round(state.player.hp));
  powerEl.textContent = `${Math.min(100, Math.round(state.player.power))}%`;
  livesEl.textContent = state.lives;
  timeEl.textContent = state.elapsed.toFixed(1);
}

function resolvePosition(position = [0, 0]) {
  const [rawX, rawY] = position;
  const x = rawX === 'right' ? W : Number(rawX || 0);
  const yValue = Number(rawY || 0);
  const y = Math.abs(yValue) <= 1 ? H * yValue : yValue;
  return [x, y];
}

function degreesToVector(angle, speed) {
  const radians = angle * Math.PI / 180;
  return { vx: Math.cos(radians) * speed, vy: Math.sin(radians) * speed };
}

function makeEnemy(type, x, y, angle = 90, rotation = 180) {
  const config = enemyConfig[type];
  const vector = degreesToVector(angle, config.speed);
  return {
    type,
    x,
    y,
    width: config.width,
    height: config.height,
    vx: vector.vx,
    vy: vector.vy,
    rotation,
    hp: config.hp,
    maxHp: config.hp,
    score: config.score,
    active: true,
    lastFire: 0,
    burstLeft: type === 'redBomber' ? 3 : 0,
    burstCooldownUntil: 0,
  };
}

function queueWave(wave) {
  if (wave.type === 'squadron') {
    const config = enemyConfig[wave.enemyType];
    const size = wave.enemyNumbers;
    const half = Math.floor(size / 2);
    const step = config.width + (W - size * config.width) / size;
    let x = ((W - size * config.width) / size) / 2;
    let y = (-35 * size) - config.height;

    for (let i = 0; i < size; i += 1) {
      if (i <= half) y += 35;
      if (i > half) y -= 35;
      const isLeader = i === half && wave.leader;
      const type = isLeader ? wave.leader : wave.enemyType;
      const leaderOffset = isLeader ? -50 : 0;
      state.scheduledSpawns.push({
        at: state.elapsed,
        type,
        x: x + leaderOffset,
        y,
        angle: wave.angle || 90,
        rotation: wave.rotation ?? 180,
      });
      x += step;
    }
    return;
  }

  if (wave.type === 'line') {
    const [x, y] = resolvePosition(wave.position);
    for (let i = 0; i < wave.enemyNumbers; i += 1) {
      state.scheduledSpawns.push({
        at: state.elapsed + i * (wave.delay || 0) / 1000,
        type: wave.enemyType,
        x,
        y,
        angle: wave.angle || 90,
        rotation: wave.rotation ?? ((wave.angle || 90) + 90),
      });
    }
  }
}

function processLevel() {
  while (state.waveIndex < openingWaves.length && state.elapsed >= openingWaves[state.waveIndex].spawnTime) {
    queueWave(openingWaves[state.waveIndex]);
    state.waveIndex += 1;
  }

  for (const spawn of state.scheduledSpawns) {
    if (!spawn.done && state.elapsed >= spawn.at) {
      state.enemies.push(makeEnemy(spawn.type, spawn.x, spawn.y, spawn.angle, spawn.rotation));
      spawn.done = true;
    }
  }
  state.scheduledSpawns = state.scheduledSpawns.filter((spawn) => !spawn.done);
}

function spawnPlayerBullet(angle = 270, radial = false) {
  const speed = radial ? 720 : 1000;
  const vector = degreesToVector(angle, speed);
  state.bullets.push({
    x: state.player.x + state.player.width / 2 - 10,
    y: state.player.y + state.player.height / 2 - 19,
    width: 20,
    height: 38,
    vx: vector.vx,
    vy: vector.vy,
    damage: 5,
    active: true,
    radial,
  });
}

function shootUltimate() {
  if (!state.running || state.player.power < 100) return;
  state.player.power = 0;
  state.enemyBullets = [];
  for (let i = 0; i < 180; i += 1) {
    spawnPlayerBullet(i * 2, true);
  }
  burst(state.player.x + state.player.width / 2, state.player.y + state.player.height / 2, 55, '#98cfff');
}

function enemyShoot(enemy) {
  if (enemy.y < 0) return;

  if (enemy.type === 'redBomber') {
    if (state.elapsed < enemy.burstCooldownUntil) return;
    if (state.elapsed - enemy.lastFire >= 0.1 && enemy.burstLeft > 0) {
      for (const angle of [80, 90, 100]) {
        spawnEnemyBullet(enemy, angle, 'redBullet', 200, 12, 11, 20);
      }
      enemy.burstLeft -= 1;
      enemy.lastFire = state.elapsed;
      if (enemy.burstLeft === 0) enemy.burstCooldownUntil = state.elapsed + 1;
      return;
    }
    if (enemy.burstLeft === 0 && state.elapsed >= enemy.burstCooldownUntil) enemy.burstLeft = 3;
  }

  if (enemy.type === 'rogueLeader' && state.elapsed - enemy.lastFire >= 0.5) {
    const angle = enemy.rotation - 90;
    spawnEnemyBullet(enemy, angle, 'redRay', 500, 5, 61, 20, 0.3);
    spawnEnemyBullet(enemy, angle, 'redRay', 500, 5, 61, 20, 0.7);
    enemy.lastFire = state.elapsed;
  }
}

function spawnEnemyBullet(enemy, angle, image, speed, width, height, damage, xFactor = 0.5) {
  const vector = degreesToVector(angle, speed);
  state.enemyBullets.push({
    x: enemy.x + enemy.width * xFactor - width / 2,
    y: enemy.y + enemy.height * 0.6,
    width,
    height,
    vx: vector.vx,
    vy: vector.vy,
    damage,
    image,
    rotation: angle - 90,
    active: true,
  });
}

function rectsOverlap(a, b) {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

function playerHitbox() {
  return {
    x: state.player.x + state.player.width * 0.375,
    y: state.player.y + state.player.height * 0.375,
    width: state.player.width / 4,
    height: state.player.height / 4,
  };
}

function damagePlayer(amount) {
  if (performance.now() < state.player.invulnerableUntil) return;
  state.player.hp -= amount;
  state.score = Math.max(0, state.score - 1000);
  state.player.invulnerableUntil = performance.now() + 2000;
  burst(state.player.x + state.player.width / 2, state.player.y + state.player.height / 2, 28, '#ff6a77');

  if (state.player.hp <= 0) {
    state.lives -= 1;
    if (state.lives <= 0) {
      endGame();
      return;
    }
    state.player.hp = 100;
    state.player.x = W / 2 - state.player.width / 2;
    state.player.y = H - 100;
  }
}

function destroyEnemy(enemy) {
  enemy.active = false;
  state.score += enemy.score;
  state.player.power = Math.min(100, state.player.power + enemy.score * 0.02);
  burst(enemy.x + enemy.width / 2, enemy.y + enemy.height / 2, Math.min(40, 14 + enemy.width / 8), '#9ed8ff');
}

function burst(x, y, count, color) {
  for (let i = 0; i < count; i += 1) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 45 + Math.random() * 210;
    state.particles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 0.3 + Math.random() * 0.55,
      maxLife: 0.85,
      size: 1 + Math.random() * 3,
      color,
    });
  }
}

function updatePlayer(dt, nowMs) {
  let keyboardX = 0;
  let keyboardY = 0;
  if (keys.has('ArrowLeft') || keys.has('a')) keyboardX -= 1;
  if (keys.has('ArrowRight') || keys.has('d')) keyboardX += 1;
  if (keys.has('ArrowUp') || keys.has('w')) keyboardY -= 1;
  if (keys.has('ArrowDown') || keys.has('s')) keyboardY += 1;

  if (keyboardX || keyboardY) {
    const length = Math.hypot(keyboardX, keyboardY);
    state.player.x += keyboardX / length * state.player.speed * dt;
    state.player.y += keyboardY / length * state.player.speed * dt;
    state.player.targetX = state.player.x + state.player.width / 2;
    state.player.targetY = state.player.y + state.player.height / 2;
  } else {
    const centerX = state.player.x + state.player.width / 2;
    const centerY = state.player.y + state.player.height / 2;
    const dx = state.player.targetX - centerX;
    const dy = state.player.targetY - centerY;
    const distance = Math.hypot(dx, dy);
    const maxStep = state.player.speed * dt;
    if (distance > 1) {
      const step = Math.min(distance, maxStep);
      state.player.x += dx / distance * step;
      state.player.y += dy / distance * step;
    }
  }

  state.player.x = Math.max(0, Math.min(W - state.player.width, state.player.x));
  state.player.y = Math.max(0, Math.min(H - state.player.height, state.player.y));

  if (state.elapsed - state.lastPurpleFire >= 0.5) {
    spawnPlayerBullet(270);
    state.lastPurpleFire = state.elapsed;
  }

  if (nowMs < state.player.invulnerableUntil) statusEl.textContent = 'INVULNERABLE';
  else if (state.player.power >= 100) statusEl.textContent = 'ULTIMATE READY · CLICK';
  else statusEl.textContent = state.elapsed <= 30 ? 'STAGE 1 · OPENING' : 'END OF REBUILT SLICE';
}

function updateBackground(dt) {
  const bg = state.background;
  bg.nebulaY += 90 * dt;
  bg.smallY1 += 220 * dt;
  bg.smallY2 += 220 * dt;
  bg.bigY1 += 330 * dt;
  bg.bigY2 += 330 * dt;

  if (bg.nebulaY > H) bg.nebulaY = -Math.max(images.nebula?.naturalHeight || 500, H);
  if (bg.smallY1 > H) bg.smallY1 = bg.smallY2 - H;
  if (bg.smallY2 > H) bg.smallY2 = bg.smallY1 - H;
  if (bg.bigY1 > H) bg.bigY1 = bg.bigY2 - H;
  if (bg.bigY2 > H) bg.bigY2 = bg.bigY1 - H;
}

function update(dt, nowMs) {
  if (!state.running) return;

  state.elapsed += dt;
  updateBackground(dt);
  processLevel();
  updatePlayer(dt, nowMs);

  for (const bullet of state.bullets) {
    bullet.x += bullet.vx * dt;
    bullet.y += bullet.vy * dt;
    if (bullet.x < -80 || bullet.x > W + 80 || bullet.y < -80 || bullet.y > H + 80) bullet.active = false;
  }

  for (const bullet of state.enemyBullets) {
    bullet.x += bullet.vx * dt;
    bullet.y += bullet.vy * dt;
    if (bullet.x < -100 || bullet.x > W + 100 || bullet.y < -100 || bullet.y > H + 100) bullet.active = false;
  }

  for (const enemy of state.enemies) {
    enemy.x += enemy.vx * dt;
    enemy.y += enemy.vy * dt;
    enemyShoot(enemy);
    if (enemy.y > H + 260 || enemy.y + enemy.height < -260 || enemy.x > W + 260 || enemy.x + enemy.width < -260) enemy.active = false;
  }

  for (const enemy of state.enemies) {
    if (!enemy.active) continue;
    for (const bullet of state.bullets) {
      if (!bullet.active) continue;
      if (rectsOverlap(enemy, bullet)) {
        enemy.hp -= bullet.damage;
        bullet.active = false;
        state.score += enemy.score / (2 * enemy.maxHp) * bullet.damage;
        if (enemy.hp <= 0) destroyEnemy(enemy);
      }
    }
  }

  const hitbox = playerHitbox();
  for (const bullet of state.enemyBullets) {
    if (bullet.active && rectsOverlap(hitbox, bullet)) {
      bullet.active = false;
      damagePlayer(bullet.damage);
    }
  }

  for (const enemy of state.enemies) {
    if (enemy.active && rectsOverlap(hitbox, enemy)) damagePlayer(20);
  }

  for (const particle of state.particles) {
    particle.x += particle.vx * dt;
    particle.y += particle.vy * dt;
    particle.vx *= 0.97;
    particle.vy *= 0.97;
    particle.life -= dt;
  }

  state.enemies = state.enemies.filter((enemy) => enemy.active);
  state.bullets = state.bullets.filter((bullet) => bullet.active);
  state.enemyBullets = state.enemyBullets.filter((bullet) => bullet.active);
  state.particles = state.particles.filter((particle) => particle.life > 0);
  syncHud();
}

function drawTiled(image, y1, y2, alpha = 1) {
  if (!image) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.drawImage(image, 0, y1, W, H);
  ctx.drawImage(image, 0, y2, W, H);
  ctx.restore();
}

function drawBackground() {
  ctx.fillStyle = '#00030a';
  ctx.fillRect(0, 0, W, H);
  if (images.nebula) {
    ctx.save();
    ctx.globalAlpha = 0.65;
    ctx.drawImage(images.nebula, 0, state.background.nebulaY, W, Math.max(500, images.nebula.naturalHeight));
    ctx.restore();
  }
  drawTiled(images.smallStars, state.background.smallY1, state.background.smallY2, 0.75);
  drawTiled(images.bigStars, state.background.bigY1, state.background.bigY2, 0.9);
}

function drawRotatedImage(image, entity) {
  if (!image) return;
  ctx.save();
  ctx.translate(entity.x + entity.width / 2, entity.y + entity.height / 2);
  ctx.rotate((entity.rotation || 0) * Math.PI / 180);
  ctx.drawImage(image, -entity.width / 2, -entity.height / 2, entity.width, entity.height);
  ctx.restore();
}

function draw(nowMs) {
  drawBackground();

  for (const enemy of state.enemies) drawRotatedImage(images[enemyConfig[enemy.type].image], enemy);

  for (const bullet of state.bullets) {
    ctx.save();
    ctx.translate(bullet.x + bullet.width / 2, bullet.y + bullet.height / 2);
    ctx.rotate(Math.atan2(bullet.vy, bullet.vx) + Math.PI / 2);
    ctx.drawImage(images.purpleBullet, -bullet.width / 2, -bullet.height / 2, bullet.width, bullet.height);
    ctx.restore();
  }

  for (const bullet of state.enemyBullets) {
    ctx.save();
    ctx.translate(bullet.x + bullet.width / 2, bullet.y + bullet.height / 2);
    ctx.rotate((bullet.rotation || 0) * Math.PI / 180);
    ctx.drawImage(images[bullet.image], -bullet.width / 2, -bullet.height / 2, bullet.width, bullet.height);
    ctx.restore();
  }

  for (const particle of state.particles) {
    ctx.save();
    ctx.globalAlpha = Math.max(0, particle.life / particle.maxLife);
    ctx.fillStyle = particle.color;
    ctx.fillRect(particle.x, particle.y, particle.size, particle.size);
    ctx.restore();
  }

  const blinking = nowMs < state.player.invulnerableUntil && Math.floor(nowMs / 90) % 2 === 0;
  if (!blinking) ctx.drawImage(images.player, state.player.x, state.player.y, state.player.width, state.player.height);

  ctx.save();
  ctx.strokeStyle = state.player.power >= 100 ? 'rgba(142, 221, 255, .9)' : 'rgba(255, 88, 96, .75)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(state.player.targetX, state.player.targetY, 5, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function endGame() {
  state.running = false;
  statusEl.textContent = 'GAME OVER';
  overlay.innerHTML = `
    <div class="panel">
      <p class="eyebrow">RUN TERMINATED</p>
      <h2>GAME OVER</h2>
      <p>Score ${Math.round(state.score)} · survived ${state.elapsed.toFixed(1)} seconds.</p>
      <button id="restart" type="button">RESTART</button>
    </div>`;
  overlay.classList.remove('hidden');
  document.getElementById('restart').addEventListener('click', resetGame, { once: true });
}

function pointerToCanvas(event) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: (event.clientX - rect.left) * W / rect.width,
    y: (event.clientY - rect.top) * H / rect.height,
  };
}

canvas.addEventListener('pointermove', (event) => {
  const point = pointerToCanvas(event);
  state.player.targetX = Math.max(0, Math.min(W, point.x));
  state.player.targetY = Math.max(0, Math.min(H, point.y));
});

canvas.addEventListener('pointerdown', (event) => {
  const point = pointerToCanvas(event);
  state.player.targetX = point.x;
  state.player.targetY = point.y;
  shootUltimate();
});

window.addEventListener('keydown', (event) => {
  const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
  if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) event.preventDefault();
  keys.add(key);
});

window.addEventListener('keyup', (event) => {
  const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
  keys.delete(key);
});

function loop(timestamp) {
  const dt = Math.min(0.033, (timestamp - state.lastTime) / 1000 || 0);
  state.lastTime = timestamp;
  update(dt, timestamp);
  draw(timestamp);
  requestAnimationFrame(loop);
}

preloadImages()
  .then(() => {
    startButton.disabled = false;
    startButton.textContent = 'START STAGE';
    statusEl.textContent = 'READY';
    startButton.addEventListener('click', resetGame);
  })
  .catch((error) => {
    statusEl.textContent = 'ASSET LOAD ERROR';
    startButton.textContent = 'ASSETS FAILED';
    console.error(error);
  });

syncHud();
requestAnimationFrame(loop);
