---
name: sheetbot-gas-coder
description: Google 스프레드시트 분석 및 Google Apps Script(GAS) 자동 코드 주입, 이지데스크 터널 연동, 대화형 반복 수정 전용 스킬
---

# SheetBot GAS Coder Skill

사용자가 구글 스프레드시트 URL 또는 시트봇 에이전트 브릿지 URL(`https://.../api/agent/gas-bridge?token=...`)을 제공했을 때, 시트의 구조(10행 헤더, 다중 탭)를 분석하고 완성형 Apps Script 코드를 자동 주입/수정하는 전문 가이드입니다.

---

## 1. 워크플로우

### Step 0. Google OAuth 사전 점검 (Pre-flight Token Check, 필수 선행)
코드 작성이나 시트 생성에 착수하기 전, 반드시 먼저 Google Workspace OAuth 토큰 상태를 점검합니다:
1. `call_mcp_tool('egdesk-drive', 'drive_auth_status')` 및 `call_mcp_tool('egdesk-apps-script', 'apps_script_auth_status')` 호출.
2. 만약 `connected: false`이거나 토큰이 만료된 경우:
   - 코드 작성을 시작하지 말고, `drive_auth_login` 결과의 인증 동의 URL(`https://cbptgzaubhcclkmvkiua.supabase.co/auth/v1/authorize...`)을 사용자에게 먼저 제시.
   - "구글 시트 및 스크립트 직접 자동 주입을 위해 먼저 계정 연동을 완료해 주세요"라고 사용자에게 승인 요청.
3. 사용자가 인증을 완료하여 `connected: true`가 확인되면 다음 Step으로 진행.

### Step 1. 브릿지 URL 수신 시 (GET 요청)
사용자가 `.../api/agent/gas-bridge?token=...` 형태의 웹 주소를 제공한 경우:
1. `read_url_content` 도구 또는 HTTP GET 요청을 통해 해당 URL의 데이터를 읽어옵니다.
2. 반환되는 JSON 데이터에서 다음 핵심 정보를 파악합니다:
   - `spreadsheetAnalysis.tabs`: 각 탭의 이름, 행/열 크기, `suggestedHeaderRow`(예: 10행), `headers`(A열부터의 컬럼명)
   - `existingCode`: 현재 배포되어 있는 기존 `Code.gs` 및 `appsscript.json`
   - `codingInstructions.postEndpoint`: 완성된 코드를 제출할 엔드포인트 URL

### Step 2. 직접 구글 시트 URL 수신 시 (MCP 도구 사용)
사용자가 구글 시트 URL(`https://docs.google.com/spreadsheets/d/{id}/edit`)을 직접 제공한 경우:
1. URL에서 `spreadsheetId`를 추출합니다.
2. `sheets_get_full_context(spreadsheetId, sampleRows=30)`를 호출하여 상위 30행을 스캔하고, 10행 헤더 등 실제 헤더 시작 위치(`headerRow`)와 데이터 시작 행(`dataStartRow`)을 판별합니다.

---

## 2. Apps Script 코딩 5대 철칙 (절대 준수)

1. **개인 API 키 요구 절대 금지**:
   - 사용자에게 Gemini API 키나 OpenAI API 키 등 개인 API 키 입력을 요구하는 UI/팝업을 만들지 않습니다.
   - 사전에 주입된 터널 클라이언트 함수 `egdeskToolsCall('ai-caller', 'ai_caller_call', { ... })`를 호출하여 중앙 AI Caller를 경유합니다.
2. **헤더 위치 준수 (10행 헤더 대응)**:
   - 1행이 아닌 10행 등에 헤더가 있는 경우, 신규 행 삽입 시 `sheet.insertRowsBefore(11, N)` 및 `sheet.getRange(11, 1, N, cols).setValues(rows)`로 처리하여 상단 서식을 훼손하지 않습니다.
3. **1:1 컬럼 무손실 매핑**:
   - 시트에 감지된 실제 컬럼(A열~Z열)의 순서와 개수를 1:1로 엄격히 맞추어 배열을 구성합니다.
4. **다중 품목 분리 삽입**:
   - 발주서, 견적서, 거래명세서 등 품목이 여러 개인 문서는 1행으로 뭉뚱그리지 않고 품목당 1행씩(총 N개 행) 분리 삽입합니다.
5. **상단 메뉴 슬림화 및 코파일럿 단일 제어 센터 원칙 (절대 준수)**:
   - `onOpen()` 함수에서 반드시 `🚀 SheetBot 메뉴`를 등록합니다.
   - 업무 기능 등록 후 구분선(`.addSeparator()`) 아래에는 오직 **단 1개의 제어 센터**만 배치합니다:
     - `🤖 SheetBot AI 코파일럿` (`showAiCopilotSidebar`)
   - ⚠️ **[상단 메뉴 등록 엄격 금지]**: '토큰 잔액 확인 및 즉시 충전', 'SheetBot 사용법 및 활용사례' 등 시스템/관리 메뉴를 상단 메뉴 바에 개별 항목으로 절대 추가하지 마십시오.
   - 이 모든 기능은 '🤖 SheetBot AI 코파일럿' 사이드바 내부 4단 제어 센터로 100% 일원화되어야 합니다. (단, 사이드바 내부 연동을 위해 `openTokenRechargeModal`, `openSheetBotGuide` 함수 정의는 `Code.gs` 하단에 안전하게 보존)
   - 웹 설문/신청서 요구 시 `doGet(e)` + Tailwind CSS 기반 모바일 반응형 독립 웹페이지 폼을 제공합니다.
6. **SMS 문자 발송 표준 프로세스 (절대 원칙)**:
   - 가짜 성공(Mock) 절대 금지: `egdeskToolsCall('phone', 'phone_send', ...)`를 통한 실제 발송 구현.
   - 발송 전 `checkActiveSmsDevice()` 실시간 점검 필수: 회원 계정(`SHEETBOT_USER_EMAIL`)에 매핑된 기기를 1순위 매칭.
   - 기기 미연결 시: 즉시 발송을 차단하고 2가지 대안 모달(`showSmsDeviceNoticeModal`) 표출.
   - 정상 연결 시: 기기명, 무료 연동 상태, 발송 건수가 명시된 [점검 완료 및 발송 확인] 일체형 알림창을 띄워 사용자 최종 승인 후 발송.
   - 투명한 결과 피드백: 시트의 결과메시지 열(`스마트폰(기기명) 실제 전송 완료`) 및 SQLite 대장에 투명 기록.
7. **빈 시트 기본 탭 무손실 단일화 (Sheet1 Rename)**:
   - 신규 빈 시트에서 시작할 때, `insertSheet(targetName)`으로 새 탭을 추가하지 않고, 반드시 기존 기본 탭(`Sheet1` 또는 `시트1`)의 이름을 `sheets[0].setName(targetName)`으로 변경하여 단 1개의 메인 탭으로 운영합니다.
8. **임의 시트 매핑 절대 금지 (Strict No-Arbitrary Mapping)**:
   - 브릿지 URL에 `spreadsheetId`가 없거나 새 시트 자동 생성이 불가능할 때, 사용자의 확인 없이 드라이브에 있는 과거 기존 시트 ID를 임의로 탐색하여 연결하거나 덮어씌워 배포하지 않습니다. 반드시 사용자에게 시트 생성을 요청하거나 시트 주소를 확인받아야 합니다.

---

## 3. 코드 주입 및 배포 (POST 요청)

코드가 완성되면 `codingInstructions.postEndpoint`로 다음 규격의 JSON 페이로드를 POST 전송합니다:

```json
{
  "scriptCode": "/* 완성된 Code.gs 소스코드 전체 */",
  "comment": "발주서 OCR 및 10행 기준 데이터 기입 기능 주입"
}
```

배포 완료 응답(`{ success: true, deployment: { scriptUrl, webAppUrl } }`)을 수신하면 사용자에게:
- 주입이 완료되었음을 알리고
- 구글 시트를 새로고침하여 메뉴를 실행할 수 있도록 친절히 안내합니다.

---

## 4. 대화형 반복 수정 (Iterative Feedback)

사용자가 추가 요청("버튼 색 바꿔줘", "D열 비고란 추가해줘", "에러 해결해줘")을 하면:
1. 기존에 작성한 코드 맥락을 바탕으로 변경된 요구사항만 정밀 반영합니다.
2. 동일한 브릿지 URL로 다시 POST 요청을 보내 클라우드 코드를 실시간 업데이트합니다.
