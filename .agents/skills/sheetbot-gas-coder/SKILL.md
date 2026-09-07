---
name: sheetbot-gas-coder
description: Google 스프레드시트 분석 및 Google Apps Script(GAS) 자동 코드 주입, 이지데스크 터널 연동, 대화형 반복 수정 전용 스킬
---

# SheetBot GAS Coder Skill

사용자가 구글 스프레드시트 URL 또는 시트봇 에이전트 브릿지 URL(`https://.../api/agent/gas-bridge?token=...`)을 제공했을 때, 시트의 구조(10행 헤더, 다중 탭)를 분석하고 완성형 Apps Script 코드를 자동 주입/수정하는 전문 가이드입니다.

---

## 1. 워크플로우

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
5. **표준 UI 및 진입점**:
   - `onOpen()` 함수에서 `🚀 SheetBot 자동화` 메뉴를 등록합니다.
   - 웹 설문/신청서 요구 시 `doGet(e)` + Tailwind CSS 기반 모바일 반응형 독립 웹페이지 폼을 제공합니다.

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
