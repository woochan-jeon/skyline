// 서버로 들어온 값이 믿을 만한지 검사하는 함수들 (저장소와 상관없는 순수 함수라서 테스트하기 쉬워요)
//
// 중요한 개념: 게임은 사용자의 브라우저에서 돌아가므로, 서버는 브라우저가 보낸 점수를 그대로 믿으면 안 됩니다.
// 여기서는 "말이 안 되는 값"을 걸러내는 기본 검사만 합니다. (완벽한 부정행위 방지는 아니에요)

// 한글/영문/숫자/밑줄/하이픈/공백, 1~12자
const NICK_RE = /^[\p{L}\p{N}_ -]{1,12}$/u;

// 1초에 얻을 수 있는 점수의 이론상 최댓값 (적이 16틱마다 나오고 전부 30점짜리라고 가정해도 초당 약 112점)
const MAX_SCORE_PER_SECOND = 150;

function fail(error) {
  return { ok: false, error };
}

// 날짜를 YYYYMMDD 숫자로 (UTC 기준)
function seedFromDate(d) {
  return d.getUTCFullYear() * 10000 + (d.getUTCMonth() + 1) * 100 + d.getUTCDate();
}

// 시차 때문에 사용자의 "오늘"과 서버의 "오늘"이 하루 어긋날 수 있어서 어제/오늘/내일까지 허용
function allowedSeeds(now) {
  return [-1, 0, 1].map((off) => seedFromDate(new Date(now.getTime() + off * 86400000)));
}

function validateScore(body, now = new Date()) {
  if (!body || typeof body !== 'object') return fail('요청 내용이 비어 있어요.');

  const nickname = typeof body.nickname === 'string' ? body.nickname.trim().replace(/\s+/g, ' ') : '';
  if (!NICK_RE.test(nickname)) {
    return fail('닉네임은 한글·영문·숫자·_·- 와 공백으로 1~12자여야 해요.');
  }

  const { score, playSeconds, seed } = body;
  if (!Number.isInteger(score) || score < 10 || score > 1000000) {
    return fail('점수는 10점 이상의 정수여야 해요.');
  }
  if (!Number.isInteger(playSeconds) || playSeconds < 1 || playSeconds > 3600) {
    return fail('플레이 시간이 올바르지 않아요.');
  }
  if (score > MAX_SCORE_PER_SECOND * playSeconds + 100) {
    return fail('플레이 시간에 비해 점수가 너무 높아요.');
  }
  if (!Number.isInteger(seed) || !allowedSeeds(now).includes(seed)) {
    return fail('오늘의 챌린지 날짜가 올바르지 않아요.');
  }

  return { ok: true, value: { nickname, score, playSeconds, seed } };
}

function validateSeedParam(raw, now = new Date()) {
  const seed = Number(raw);
  if (!Number.isInteger(seed) || !allowedSeeds(now).includes(seed)) return null;
  return seed;
}

module.exports = { validateScore, validateSeedParam, allowedSeeds, seedFromDate };
