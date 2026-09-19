// =====================================================
// Clean Sky - 스타터 게임 (1단계: 로컬에서 돌아가는 슈팅게임)
// 먼지 구름을 쏘아 하늘을 깨끗하게 지키는 오리지널 게임입니다.
// 그림은 전부 코드로 그려서 별도 이미지/음악 파일이 필요 없습니다.
// =====================================================

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const W = canvas.width;   // 480
const H = canvas.height;  // 720

// ---------- 1) 시드 난수 ----------
// 같은 시드를 넣으면 항상 같은 순서로 난수가 나옵니다.
// -> 나중에 "일일 챌린지"에서 모두가 같은 적 패턴으로 플레이하게 만드는 재료입니다.
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 오늘 날짜를 숫자로 (예: 2026-09-19 -> 20260919). 나중에는 서버가 날짜/시드를 정해줄 예정.
function todaySeed() {
  const d = new Date();
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + (d.getDate());
}

// ---------- 2) 입력 ----------
const keys = {};
let pointer = null; // 터치/마우스 드래그 위치

window.addEventListener('keydown', (e) => {
  keys[e.code] = true;
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) {
    e.preventDefault(); // 스페이스/방향키로 페이지가 스크롤되는 것을 막음
  }
  if ((e.code === 'Enter' || e.code === 'Space') && game.state === 'gameover' && game.overTicks > 40) {
    startGame();
  }
});
window.addEventListener('keyup', (e) => { keys[e.code] = false; });

function toCanvasPos(e) {
  const r = canvas.getBoundingClientRect();
  return { x: (e.clientX - r.left) * (W / r.width), y: (e.clientY - r.top) * (H / r.height) };
}
canvas.addEventListener('pointerdown', (e) => {
  canvas.setPointerCapture(e.pointerId);
  pointer = toCanvasPos(e);
  if (game.state === 'gameover' && game.overTicks > 40) startGame();
});
canvas.addEventListener('pointermove', (e) => { if (pointer) pointer = toCanvasPos(e); });
canvas.addEventListener('pointerup', () => { pointer = null; });
canvas.addEventListener('pointercancel', () => { pointer = null; });

// ---------- 3) 게임 상태 ----------
const game = {
  state: 'playing',   // 'playing' | 'gameover'
  seed: todaySeed(),
  rng: null,
  tick: 0,
  score: 0,
  best: 0,
  lives: 3,
  invuln: 0,          // 피격 후 무적 시간(틱)
  spawnTimer: 0,
  fireCooldown: 0,
  overTicks: 0,
  player: { x: W / 2, y: H - 90, r: 12 },
  bullets: [],
  enemies: [],
  particles: [],
};

try { game.best = Number(localStorage.getItem('cleansky.best')) || 0; } catch (e) { /* 저장소를 못 쓰는 환경이면 무시 */ }

function startGame() {
  game.state = 'playing';
  game.rng = mulberry32(game.seed);  // 게임 규칙에 영향을 주는 난수는 반드시 이 rng만 사용
  game.tick = 0;
  game.score = 0;
  game.lives = 3;
  game.invuln = 0;
  game.spawnTimer = 30;
  game.fireCooldown = 0;
  game.overTicks = 0;
  game.player.x = W / 2;
  game.player.y = H - 90;
  game.bullets = [];
  game.enemies = [];
  game.particles = [];
}

// ---------- 4) 업데이트 (1틱 = 1/60초, 고정 간격) ----------
const PLAYER_SPEED = 4.2;

function update() {
  if (game.state === 'gameover') {
    game.overTicks++;
    updateParticles();
    return;
  }
  game.tick++;
  const p = game.player;

  // 이동
  let dx = 0, dy = 0;
  if (keys.ArrowLeft || keys.KeyA) dx -= 1;
  if (keys.ArrowRight || keys.KeyD) dx += 1;
  if (keys.ArrowUp || keys.KeyW) dy -= 1;
  if (keys.ArrowDown || keys.KeyS) dy += 1;
  if (dx || dy) {
    const len = Math.hypot(dx, dy);
    p.x += (dx / len) * PLAYER_SPEED;
    p.y += (dy / len) * PLAYER_SPEED;
  } else if (pointer) {
    // 손가락 위치(조금 위)로 부드럽게 이동
    const tx = pointer.x, ty = pointer.y - 50;
    const vx = tx - p.x, vy = ty - p.y;
    const dist = Math.hypot(vx, vy);
    if (dist > 1) {
      const step = Math.min(dist, PLAYER_SPEED * 1.6);
      p.x += (vx / dist) * step;
      p.y += (vy / dist) * step;
    }
  }
  p.x = Math.max(p.r, Math.min(W - p.r, p.x));
  p.y = Math.max(p.r + 40, Math.min(H - p.r, p.y));

  // 발사 (스페이스를 누르고 있거나 화면을 누르고 있으면 자동 발사)
  if (game.fireCooldown > 0) game.fireCooldown--;
  if ((keys.Space || pointer) && game.fireCooldown === 0) {
    game.bullets.push({ x: p.x, y: p.y - 18, vy: -9 });
    game.fireCooldown = 10;
  }

  // 적 생성: 시간이 지날수록 더 자주 나옴
  game.spawnTimer--;
  if (game.spawnTimer <= 0) {
    const rng = game.rng;
    const level = Math.floor(game.tick / 300);           // 5초마다 난이도 +1
    const r = 15 + rng() * 12;
    const baseX = 40 + rng() * (W - 80);
    game.enemies.push({
      baseX,
      x: baseX,
      y: -30,
      r,
      hp: r > 24 ? 3 : 1,
      maxHp: r > 24 ? 3 : 1,
      vy: 1.1 + rng() * 1.0 + Math.min(level * 0.12, 1.6),
      phase: rng() * Math.PI * 2,
      amp: rng() * 45,
    });
    game.spawnTimer = Math.max(16, 55 - level * 3);
  }

  // 총알 이동
  for (const b of game.bullets) b.y += b.vy;
  game.bullets = game.bullets.filter((b) => b.y > -20);

  // 적 이동
  for (const e of game.enemies) {
    e.y += e.vy;
    e.x = e.baseX + Math.sin(e.phase + e.y * 0.03) * e.amp;
  }

  // 총알 vs 적
  for (const b of game.bullets) {
    for (const e of game.enemies) {
      if (e.hp <= 0 || b.dead) continue;
      if (Math.hypot(b.x - e.x, b.y - e.y) < e.r + 4) {
        b.dead = true;
        e.hp--;
        if (e.hp <= 0) {
          game.score += e.maxHp > 1 ? 30 : 10;
          burst(e.x, e.y, 10);
        }
      }
    }
  }
  game.bullets = game.bullets.filter((b) => !b.dead);
  game.enemies = game.enemies.filter((e) => e.hp > 0);

  // 플레이어 vs 적
  if (game.invuln > 0) game.invuln--;
  for (const e of game.enemies) {
    if (game.invuln === 0 && Math.hypot(p.x - e.x, p.y - e.y) < e.r + p.r - 2) {
      e.hp = 0;
      game.lives--;
      game.invuln = 90;
      burst(p.x, p.y, 16);
      if (game.lives <= 0) endGame();
      break;
    }
  }
  game.enemies = game.enemies.filter((e) => e.hp > 0 && e.y < H + 50);

  updateParticles();
}

function endGame() {
  game.state = 'gameover';
  game.overTicks = 0;
  if (game.score > game.best) {
    game.best = game.score;
    try { localStorage.setItem('cleansky.best', String(game.best)); } catch (e) { /* 무시 */ }
  }
  // TODO(2단계): 여기서 서버로 점수를 보냅니다.  POST /api/scores
}

// 파티클은 눈에 보이는 효과일 뿐이라 Math.random을 써도 게임 결과에 영향이 없습니다.
function burst(x, y, n) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const s = 1 + Math.random() * 3;
    game.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 24 + Math.random() * 14 });
  }
}
function updateParticles() {
  for (const q of game.particles) { q.x += q.vx; q.y += q.vy; q.life--; }
  game.particles = game.particles.filter((q) => q.life > 0);
}

// ---------- 5) 그리기 ----------
function draw() {
  // 하늘 배경
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#1d4b7a');
  g.addColorStop(1, '#4b8fbf');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  // 아래로 흐르는 구름 줄무늬 (배경 연출)
  ctx.fillStyle = 'rgba(255,255,255,0.07)';
  for (let i = 0; i < 6; i++) {
    const y = ((game.tick * (0.6 + i * 0.25) + i * 140) % (H + 60)) - 30;
    const x = (i * 97) % W;
    ctx.beginPath();
    ctx.ellipse(x, y, 90, 16, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // 총알
  ctx.fillStyle = '#ffe27a';
  for (const b of game.bullets) {
    ctx.fillRect(b.x - 2, b.y - 8, 4, 12);
  }

  // 적: 먼지 구름
  for (const e of game.enemies) drawDust(e);

  // 플레이어 (무적 중에는 깜빡임)
  if (game.state === 'playing' && !(game.invuln > 0 && Math.floor(game.invuln / 5) % 2 === 0)) {
    drawPlane(game.player.x, game.player.y);
  }

  // 파티클
  for (const q of game.particles) {
    ctx.globalAlpha = Math.max(0, q.life / 38);
    ctx.fillStyle = '#f3f6ff';
    ctx.fillRect(q.x - 2, q.y - 2, 4, 4);
  }
  ctx.globalAlpha = 1;

  drawHud();
  if (game.state === 'gameover') drawGameOver();
}

function drawPlane(x, y) {
  ctx.save();
  ctx.translate(x, y);
  // 날개
  ctx.fillStyle = '#e9eef7';
  ctx.beginPath();
  ctx.moveTo(0, -18);
  ctx.lineTo(22, 10);
  ctx.lineTo(8, 8);
  ctx.lineTo(0, 16);
  ctx.lineTo(-8, 8);
  ctx.lineTo(-22, 10);
  ctx.closePath();
  ctx.fill();
  // 동체
  ctx.fillStyle = '#e04f5f';
  ctx.beginPath();
  ctx.ellipse(0, 0, 5, 16, 0, 0, Math.PI * 2);
  ctx.fill();
  // 조종석
  ctx.fillStyle = '#9fd8ff';
  ctx.beginPath();
  ctx.ellipse(0, -5, 3, 5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawDust(e) {
  ctx.save();
  ctx.translate(e.x, e.y);
  const shade = e.maxHp > 1 ? '#5b5348' : '#7d7466';
  ctx.fillStyle = shade;
  // 원을 여러 개 그릴 때는 moveTo로 시작점을 옮겨줘야 원끼리 이상한 선이 생기지 않습니다.
  const circles = [
    [0, 0, e.r],
    [-e.r * 0.7, e.r * 0.25, e.r * 0.6],
    [e.r * 0.7, e.r * 0.25, e.r * 0.6],
  ];
  ctx.beginPath();
  for (const [cx, cy, cr] of circles) {
    ctx.moveTo(cx + cr, cy);
    ctx.arc(cx, cy, cr, 0, Math.PI * 2);
  }
  ctx.fill();
  // 눈
  ctx.fillStyle = '#f4efe6';
  ctx.beginPath();
  for (const ex of [-e.r * 0.3, e.r * 0.3]) {
    const er = e.r * 0.17;
    ctx.moveTo(ex + er, -e.r * 0.1);
    ctx.arc(ex, -e.r * 0.1, er, 0, Math.PI * 2);
  }
  ctx.fill();
  ctx.restore();
}

function drawHud() {
  ctx.fillStyle = 'rgba(8, 16, 30, 0.55)';
  ctx.fillRect(0, 0, W, 34);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 18px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('점수 ' + game.score, 12, 23);
  ctx.textAlign = 'center';
  ctx.fillText('최고 ' + game.best, W / 2, 23);
  ctx.textAlign = 'right';
  ctx.fillStyle = '#ff7b8a';
  ctx.fillText('♥'.repeat(Math.max(0, game.lives)), W - 12, 23);
}

function drawGameOver() {
  ctx.fillStyle = 'rgba(6, 12, 24, 0.7)';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.font = 'bold 44px system-ui, sans-serif';
  ctx.fillText('GAME OVER', W / 2, H / 2 - 30);
  ctx.font = '22px system-ui, sans-serif';
  ctx.fillText('점수 ' + game.score, W / 2, H / 2 + 12);
  ctx.font = '16px system-ui, sans-serif';
  ctx.fillStyle = '#c9d6ee';
  ctx.fillText('Enter / 스페이스 / 화면 터치로 다시 시작', W / 2, H / 2 + 52);
}

// ---------- 6) 메인 루프 (고정 시간 간격) ----------
const STEP = 1000 / 60;
let lastTime = performance.now();
let acc = 0;
function frame(now) {
  acc += Math.min(now - lastTime, 100);
  lastTime = now;
  while (acc >= STEP) { update(); acc -= STEP; }
  draw();
  requestAnimationFrame(frame);
}

// ---------- 7) 서버(API) 연결 확인 ----------
// Azure에 배포되면 /api/hello 가 응답합니다. 내 컴퓨터에서 파일만 열었을 때는 "로컬 모드"로 표시됩니다.
// API 주소는 config.js 의 window.API_BASE 에서 가져옵니다.
const API_BASE = String(window.API_BASE || '').replace(/\/+$/, '');

async function checkServer() {
  const el = document.getElementById('status');
  try {
    const res = await fetch(API_BASE + '/api/hello');
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    el.textContent = '서버: 연결됨 ✓  (' + data.message + ')';
    el.className = 'ok';
  } catch (err) {
    el.textContent = '서버: 연결 안 됨 (로컬 모드)';
    el.className = 'local';
  }
}

// 디버깅용: 브라우저 콘솔에서 __game 을 입력하면 현재 상태를 볼 수 있습니다.
window.__game = game;

startGame();
checkServer();
requestAnimationFrame(frame);
