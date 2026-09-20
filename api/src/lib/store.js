// 점수를 저장하고 꺼내는 코드 (Azure Table Storage)
//
// Table Storage는 "파티션 키 + 행 키"로 데이터를 정렬해서 저장합니다. (행 키는 글자 순서로 오름차순 정렬)
// 그래서 행 키를 "(9999999 - 점수)"로 만들면 점수가 높은 사람이 맨 앞에 옵니다.
//   - 파티션 키 'd20260920' : 그날의 일일 챌린지 랭킹
//   - 파티션 키 'all'       : 전체 랭킹
// 한 번 점수를 등록하면 두 파티션에 각각 한 줄씩 저장합니다.
const { TableClient, odata } = require('@azure/data-tables');

const TABLE_NAME = 'scores';
let clientPromise;

function getClient() {
  if (!clientPromise) {
    clientPromise = (async () => {
      // 연결 문자열은 코드에 적지 않고 Function App의 "환경 변수"에서 읽어옵니다. (비밀번호 같은 값이라서요)
      const conn = process.env.STORAGE_CONNECTION_STRING;
      if (!conn) throw new Error('STORAGE_CONNECTION_STRING 환경 변수가 설정되지 않았어요.');
      const client = TableClient.fromConnectionString(conn, TABLE_NAME, {
        allowInsecureConnection: conn.includes('UseDevelopmentStorage') || conn.includes('127.0.0.1'),
      });
      try {
        await client.createTable(); // 표가 없으면 만들기
      } catch (err) {
        if (err.statusCode !== 409) throw err; // 409 = 이미 있음(정상)
      }
      return client;
    })().catch((err) => {
      clientPromise = undefined; // 실패하면 다음 요청에서 다시 시도
      throw err;
    });
  }
  return clientPromise;
}

function makeRowKey(score) {
  const rank = String(9999999 - score).padStart(7, '0');       // 점수가 높을수록 작은 값
  const time = String(Date.now()).padStart(13, '0');            // 같은 점수면 먼저 등록한 사람이 위
  const rand = Math.random().toString(36).slice(2, 6);          // 동시에 등록해도 겹치지 않게
  return `${rank}_${time}_${rand}`;
}

function dailyPartition(seed) {
  return 'd' + seed;
}

async function addScore({ nickname, score, playSeconds, seed }) {
  const client = await getClient();
  const base = { nickname, score, playSeconds, seed, createdAt: new Date().toISOString() };
  const rowKey = makeRowKey(score);
  await Promise.all([
    client.createEntity({ partitionKey: dailyPartition(seed), rowKey, ...base }),
    client.createEntity({ partitionKey: 'all', rowKey, ...base }),
  ]);
}

async function topScores(partitionKey, limit = 10) {
  const client = await getClient();
  const entries = [];
  const iter = client.listEntities({ queryOptions: { filter: odata`PartitionKey eq ${partitionKey}` } });
  for await (const e of iter) {
    entries.push({ rank: entries.length + 1, nickname: e.nickname, score: e.score, playSeconds: e.playSeconds });
    if (entries.length >= limit) break;
  }
  return entries;
}

module.exports = { addScore, topScores, dailyPartition };
