// POST /api/scores       -> 게임이 끝났을 때 점수를 등록
// GET  /api/leaderboard  -> 랭킹 조회  (?period=daily&seed=20260920  또는  ?period=all)
const { app } = require('@azure/functions');
const store = require('../lib/store');
const { validateScore, validateSeedParam } = require('../lib/validate');

const NO_CACHE = { 'Cache-Control': 'no-store' };

app.http('submitScore', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'scores',
  handler: async (request, context) => {
    let body;
    try {
      body = await request.json();
    } catch (err) {
      return { status: 400, jsonBody: { ok: false, error: '요청이 JSON 형식이 아니에요.' } };
    }

    const checked = validateScore(body);
    if (!checked.ok) {
      return { status: 400, jsonBody: { ok: false, error: checked.error } };
    }

    try {
      await store.addScore(checked.value);
    } catch (err) {
      context.error('점수 저장 실패', err);
      return { status: 500, jsonBody: { ok: false, error: '서버 저장소에 문제가 있어요.' } };
    }
    return { status: 201, jsonBody: { ok: true } };
  },
});

app.http('leaderboard', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'leaderboard',
  handler: async (request, context) => {
    const period = request.query.get('period') || 'all';
    let partitionKey;
    let seed = null;

    if (period === 'daily') {
      seed = validateSeedParam(request.query.get('seed'));
      if (seed === null) {
        return { status: 400, jsonBody: { ok: false, error: 'seed 값이 올바르지 않아요.' } };
      }
      partitionKey = store.dailyPartition(seed);
    } else if (period === 'all') {
      partitionKey = 'all';
    } else {
      return { status: 400, jsonBody: { ok: false, error: 'period는 daily 또는 all 이어야 해요.' } };
    }

    try {
      const entries = await store.topScores(partitionKey, 10);
      return { status: 200, headers: NO_CACHE, jsonBody: { ok: true, period, seed, entries } };
    } catch (err) {
      context.error('랭킹 조회 실패', err);
      return { status: 500, jsonBody: { ok: false, error: '서버 저장소에 문제가 있어요.' } };
    }
  },
});
