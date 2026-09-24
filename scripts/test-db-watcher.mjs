// scripts/test-db-watcher.mjs
// 이지데스크 DB 왓처(user-data SSE) 및 실시간 변경 감지 정밀 테스트

const BASE_URL = 'http://localhost:8080';
const API_KEY = 'a67ddc0f-7e2b-4997-9a0b-9667a74c89d0';

async function runTest() {
  console.log('========================================================');
  console.log('🚀 이지데스크 DB 왓처 실시간 변경 감지 테스트 시작');
  console.log('========================================================');

  const sseUrl = `${BASE_URL}/user-data/sse?key=${API_KEY}`;
  console.log(`\n[1단계] SSE 연결 수립: ${sseUrl}`);

  const controller = new AbortController();
  const res = await fetch(sseUrl, {
    signal: controller.signal,
    headers: { 'Accept': 'text/event-stream' }
  });

  if (!res.ok) {
    console.error(`❌ SSE 연결 실패: ${res.status} ${res.statusText}`);
    process.exit(1);
  }

  console.log(`✅ SSE 스트림 연결 성공 (Status: ${res.status})`);

  let receivedChangeEvents = [];
  const reader = res.body.getReader();
  const decoder = new TextDecoder();

  // 스트림 읽기 비동기 루프
  (async () => {
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const raw = decoder.decode(value, { stream: true });
        const lines = raw.split('\n');
        for (const line of lines) {
          if (line.startsWith('data:')) {
            const dataStr = line.slice(5).trim();
            if (dataStr) {
              try {
                const parsed = JSON.parse(dataStr);
                console.log(`\n📩 [SSE 이벤트 수신!]:`, JSON.stringify(parsed, null, 2));
                receivedChangeEvents.push(parsed);
              } catch {
                console.log(`\n📩 [SSE 원본 수신]:`, dataStr);
              }
            }
          }
        }
      }
    } catch (err) {
      if (err.name !== 'AbortError') {
        console.error('⚠️ 스트림 에러:', err.message);
      }
    }
  })();

  // 1.5초 대기 후 정식 /user-data/tools/call 로 테스트 레코드 삽입
  console.log('\n⏳ 1.5초 후 My DB에 테스트 레코드 삽입 요청을 전송합니다...');
  await new Promise(r => setTimeout(r, 1500));

  const testIdCode = '테' + Math.floor(1000 + Math.random() * 9000);
  console.log(`\n[2단계] user_data_insert_rows 호출 (식별코드: ${testIdCode})`);

  const callToolUrl = `${BASE_URL}/user-data/tools/call`;
  const insertPayload = {
    tool: 'user_data_insert_rows',
    arguments: {
      tableName: 'sheetbot_deposit_requests',
      rows: [{
        user_email: 'watcher-test@sheetbot.local',
        user_name: '왓처테스터',
        amount: 30000,
        tokens: 30000,
        status: 'PENDING',
        identification_code: testIdCode,
        memo: 'DB 왓처 실시간 감지 검증용'
      }]
    }
  };

  const insertStartTime = Date.now();
  const insertRes = await fetch(callToolUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Api-Key': API_KEY
    },
    body: JSON.stringify(insertPayload)
  });

  const insertResult = await insertRes.json().catch(() => ({}));
  console.log(`📝 삽입 결과 (${Date.now() - insertStartTime}ms 소요):`, JSON.stringify(insertResult, null, 2));

  // 5초 동안 실시간 SSE 이벤트 도착 여부 대기
  console.log('\n⏳ 5초 동안 실시간 DB 변경 이벤트 도착을 모니터링합니다...');
  await new Promise(r => setTimeout(r, 5000));

  console.log('\n========================================================');
  console.log('📊 테스트 결과 분석');
  console.log('========================================================');
  console.log(`총 수신된 이벤트 개수: ${receivedChangeEvents.length}`);

  const changeEvents = receivedChangeEvents.filter(e => 
    e.method === 'egdesk/user-data-changed' || 
    (e.topic === 'egdesk/user-data-changed' && e.params)
  );

  if (changeEvents.length > 0) {
    console.log(`🎉 [성공] DB 변경 이벤트(${changeEvents.length}건) 정상 수신!`);
    console.log('수신된 변경 이벤트 세부정보:', changeEvents);
  } else {
    console.log('⚠️ 연결 이벤트 외에 데이터 변경(insert) 알림 이벤트가 도착하지 않았습니다.');
    console.log('전체 수신된 내용:', receivedChangeEvents);
  }

  controller.abort();
  process.exit(0);
}

runTest().catch(err => {
  console.error('테스트 실패:', err);
  process.exit(1);
});
