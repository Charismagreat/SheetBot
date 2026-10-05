# [SheetBot] 스마트폰 문자(SMS/RCS) 중복 등록 결함 해결 가이드

본 문서는 **스마트폰 단말기에서 문자 1건 수신 시 구글 스프레드시트에 서로 다른 정보(정상 번호 + 왜곡된 번호 '02')로 2건이 중복 기록되는 결함**의 근본 원인을 분석하고, 이를 완벽하게 해결하기 위한 클라이언트(안드로이드 에이전트) 및 백엔드(Next.js) 수정 방안을 정리한 가이드입니다.

---

## 1. 장애 현상 요약

스마트폰으로 단 1건의 문자가 수신되었으나 시트에 다음과 같이 2초 간격으로 2건이 기록되는 현상이 발생함:

| 수신 일시 | 구분 | 발신자명 | 발신 번호 | 내용 | 기록 디바이스 |
| :--- | :---: | :---: | :---: | :---: | :--- |
| **2026-10-05 22:41:00** | 수신 | **차민서2** | **010-7523-5071** | T | samsung SM-N976N (SheetBot Agent) |
| **2026-10-05 22:41:02** | 수신 | **미등록 연락처** | **02** | T | samsung SM-N976N (SheetBot Agent) |

---

## 2. 발생 메커니즘 분석 (Root Cause)

이 결함은 **이중 감시 구조**, **발신자 파싱 결함**, **중복 방어(Dedupe) 키 불일치**의 3가지 요소가 연쇄적으로 결합되어 발생했습니다.

```
[고객 문자 수신 ("T")]
       │
       ├─────────────────────────────────────────┐
       ▼ (즉시)                                   ▼ (1~2초 후)
[1] SmsReceiver                               [2] BankNotificationListener
- SMS_RECEIVED 브로드캐스트 수신                - 삼성 메시지(com.samsung.android.messaging) 알림 감지
- 발신 번호: "01075235071"                     - 알림 제목(EXTRA_TITLE): "차민서2"
- 주소록 역조회: "차민서2"                       - Dedupe 키: "INBOUND:차민서2:T" (키 불일치로 통과!)
- Dedupe 키: "INBOUND:01075235071:T"           - formatPhoneNumber("차민서2") 실행
- 정상 등록:                                      └─ 숫자 이외 제거: "2" 남음
  [010-7523-5071 | 차민서2 | T]                 └─ 0 접두어 추가: "02" 왜곡 발생!
                                               - "02" 번호로 주소록 조회 ➔ null (미등록 연락처)
                                               - 서버 전송: [02 | 미등록 연락처 | T]
                                                 └─ 서버 중복 키도 번호가 달라 통과되어 2번째 행 기록!
```

### 세부 결함 분석
1. **SMS 수신 이중 감시 (Duplicate Ingestion)**
   - `SmsReceiver.kt`: 통신사 망을 통한 표준 SMS 브로드캐스트(`SMS_RECEIVED`) 수신
   - `BankNotificationListener.kt`: RCS 및 메시지 앱 지원을 위해 상태바 알림(`NotificationListenerService`) 수신
   - 일반 SMS 수신 시 두 경로가 모두 트리거되어 동일한 메시지가 2회 인입됩니다.

2. **`ContactHelper.formatPhoneNumber`의 이름 내 숫자 오인식 결함**
   - 알림 서비스는 발신 번호가 아닌 알림 제목(`"차민서2"`)을 가져옵니다.
   - `formatPhoneNumber`는 `raw.replace("[^0-9+]".toRegex(), "")`를 통해 숫자만 남기므로, 한글 `"차민서"`가 지워지고 숫자 **`"2"`**만 남습니다.
   - 이어지는 `!clean.startsWith("0")` 로직에 의해 앞에 `0`이 붙어 최종 번호가 **`"02"`**로 왜곡됩니다.

3. **중복 감지 매니저(`SmsDedupeManager`) 및 서버 가드 무력화**
   - 첫 번째 이벤트: 키 = `INBOUND:01075235071:T`
   - 두 번째 이벤트: 키 = `INBOUND:차민서2:T` (또는 `02`)
   - 키가 서로 다르므로 단말기 캐시와 서버 캐시(`${email}:수신:${phone}:${body}`) 모두 중복으로 인지하지 못하고 통과시켰습니다.

---

## 3. 해결 방안 (3중 방어 아키텍처)

### [방안 1] 알림 리스너의 전화번호 및 연락처명 명확 분리 (클라이언트 1차 방어)
- 알림 제목(`rawTitle`)이 순수 전화번호 형식인지, 아니면 연락처 이름인지 사전에 검증합니다.
- 연락처 이름인 경우 `formatPhoneNumber`로 강제 변환하지 않고, 주소록에서 해당 이름으로 전화번호를 역조회하거나 실제 번호가 없을 경우 임의 번호 조작("02" 등)을 원천 차단합니다.
- 전화번호가 최소 7자리(지역번호+국번+번호) 미만인 경우 유효하지 않은 전화번호로 판단하여 폐기합니다.

### [방안 2] `SmsDedupeManager`의 지능형 교차 중복 매칭 (클라이언트 2차 방어)
- 동일한 본문(`body`)과 방향(`INBOUND`)에 대해, 최근 15초 이내에 동일한 본문이 처리되었다면 발신 번호/이름 관계(주소록 매칭 관계)를 교차 대조하여 중복으로 판정하고 차단합니다.
- 특히 `SmsReceiver`에서 이미 처리된 표준 SMS 건은 메시지 앱 알림에서 다시 들어왔을 때 즉시 무시합니다.

### [방안 3] 서버 엔드포인트(`route.ts`) 2차 안전망 강화 (서버 3차 방어)
- 서버단 수신 가드에서 전화번호가 다르더라도 **동일 사용자 + 동일 본문 + 10초 이내 인입 건**에 대해, 한쪽이 정상 휴대폰 번호(010 등)이고 다른 쪽이 비정상 번호(예: 02, 2자리, 4자리 미만)인 경우 **중복 수신으로 간주하여 시트 쓰기를 건너뜁니다.**

---

## 4. 구체적인 코드 수정 가이드

### 4.1. `ContactHelper.kt` 전화번호 유효성 검사 강화
`android-user-agent/app/src/main/java/cloud/sheetbot/agent/user/ContactHelper.kt`

```kotlin
/**
 * 전화번호 문자열 여부 정밀 확인 (최소 7자리 이상의 숫자와 허용 기호만 포함)
 */
fun isValidPhoneNumber(raw: String): Boolean {
    if (raw.isBlank()) return false
    val digitsOnly = raw.replace("[^0-9]".toRegex(), "")
    // 한국 전화번호는 최소 7자리 (지역번호 제외 시) 또는 8자리(대표번호), 통상 9~11자리
    return digitsOnly.length >= 7 && (raw.startsWith("0") || raw.startsWith("+82") || digitsOnly.length == 8)
}

fun formatPhoneNumber(raw: String): String {
    if (raw.isBlank()) return raw
    // 💡 순수 전화번호가 아닌 일반 텍스트(예: "차민서2")는 번호로 변환하지 않고 원본 유지
    val digitsOnly = raw.replace("[^0-9]".toRegex(), "")
    if (digitsOnly.length < 7) {
        return raw.trim()
    }
    
    var clean = raw.replace("[^0-9+]".toRegex(), "").trim()
    if (clean.startsWith("+82")) {
        clean = clean.removePrefix("+82")
    } else if (clean.startsWith("82") && clean.length >= 10) {
        clean = clean.removePrefix("82")
    }

    val noZero = clean.replace("^0+".toRegex(), "")
    if (noZero.length == 8 && (noZero.startsWith("15") || noZero.startsWith("16") || noZero.startsWith("18"))) {
        return "${noZero.substring(0, 4)}-${noZero.substring(4)}"
    }

    if (!clean.startsWith("0")) {
        clean = "0$clean"
    }

    return when (clean.length) {
        11 -> "${clean.substring(0, 3)}-${clean.substring(3, 7)}-${clean.substring(7)}"
        10 -> {
            if (clean.startsWith("02")) {
                "${clean.substring(0, 2)}-${clean.substring(2, 6)}-${clean.substring(6)}"
            } else {
                "${clean.substring(0, 3)}-${clean.substring(3, 6)}-${clean.substring(6)}"
            }
        }
        9 -> {
            if (clean.startsWith("02")) {
                "${clean.substring(0, 2)}-${clean.substring(2, 5)}-${clean.substring(5)}"
            } else clean
        }
        else -> clean
    }
}
```

---

### 4.2. `BankNotificationListener.kt` 메시지 알림 처리 개선
`android-user-agent/app/src/main/java/cloud/sheetbot/agent/user/BankNotificationListener.kt`

```kotlin
private fun handleMessageNotification(sbn: StatusBarNotification) {
    if (!prefs.isPaired || !prefs.isSmsSheetSyncEnabled) return
    val userEmail = prefs.userEmail ?: return

    try {
        val extras = sbn.notification.extras ?: return
        val rawTitle = extras.getString(Notification.EXTRA_TITLE)
            ?: extras.getCharSequence(Notification.EXTRA_TITLE)?.toString() ?: ""
        val rawText = extras.getString(Notification.EXTRA_TEXT)
            ?: extras.getCharSequence(Notification.EXTRA_TEXT)?.toString()
            ?: extras.getCharSequence(Notification.EXTRA_BIG_TEXT)?.toString() ?: ""

        if (rawText.isBlank()) return

        val rawSender = rawTitle.trim()
        val message = rawText.trim()

        // 1. 발신자 식별 (전화번호 vs 이름 분기)
        val isPhone = ContactHelper.isValidPhoneNumber(rawSender)
        val senderPhone: String
        val contactName: String?

        if (isPhone) {
            senderPhone = ContactHelper.formatPhoneNumber(rawSender)
            contactName = ContactHelper.getContactName(this, senderPhone)
        } else {
            // 알림 제목이 이름(예: "차민서2")인 경우 주소록에서 전화번호 역조회
            contactName = rawSender
            senderPhone = ContactHelper.getPhoneNumberByName(this, rawSender) ?: ""
        }

        // 2. 15초 이중 중복 방어 (이름, 번호, 본문 기반 교차 점검)
        val effectiveIdentifier = senderPhone.ifBlank { contactName }
        if (!SmsDedupeManager.shouldProcessMessage("INBOUND", effectiveIdentifier, message)) {
            Log.d(TAG, "15초 이내 동일한 수신 메시지(알림) 중복 감지 - 무시합니다: $effectiveIdentifier")
            return
        }

        // 전화번호도 없고 이름도 없는 유령 알림은 제외
        if (effectiveIdentifier.isBlank()) return

        // 3. 필터 검사 및 서버 동기화
        val filter = prefs.smsTargetFilter.trim()
        if (!matchesSmsFilter(senderPhone, contactName, filter)) {
            return
        }

        serviceScope.launch {
            try {
                ApiClient.sendSmsSync(
                    userEmail = userEmail,
                    direction = "INBOUND",
                    phoneNumber = senderPhone.ifBlank { "알림:$contactName" },
                    contactName = contactName,
                    message = message,
                    sheetTitle = prefs.smsDriveSheetTitle
                )
            } catch (e: Exception) {
                Log.e(TAG, "메시지 알림 동기화 실패", e)
            }
        }
    } catch (e: Exception) {
        Log.e(TAG, "handleMessageNotification 파싱 오류", e)
    }
}
```

---

### 4.3. `route.ts` 서버 측 2차 중복 방어선 탑재
`src/app/api/user/messages/sms/route.ts`

```typescript
// 최근 15초 이내 본문 기준 중복 수신 방어 (단말기 이중 전송 오작동 완벽 차단)
const recentBodyCache = new Map<string, { time: number; phone: string }>();

// 내부 검사 로직
const bodyKey = `${cleanEmail}:${directionLabel}:${message.trim()}`;
const lastBodyRecord = recentBodyCache.get(bodyKey);

if (lastBodyRecord && (now - lastBodyRecord.time < 15000)) {
  // 동일한 본문이 15초 내에 이미 들어왔는데, 현재 번호가 비정상적인 경우(길이 5 미만 등) 무조건 무시
  const currentDigits = phoneNumber.replace(/[^0-9]/g, "");
  const prevDigits = lastBodyRecord.phone.replace(/[^0-9]/g, "");
  
  if (currentDigits.length < 7 || (prevDigits.length >= 10 && currentDigits.length < prevDigits.length)) {
    console.warn(`[SMS API] 비정상 중복 인입 감지 차단: 이전번호=${lastBodyRecord.phone}, 현재번호=${phoneNumber}, 본문=${message}`);
    return NextResponse.json({
      success: true,
      message: "중복 전송 건으로 안전하게 병합 처리되었습니다 (기록 스킵).",
      deduped: true
    });
  }
}
recentBodyCache.set(bodyKey, { time: now, phone: phoneNumber });
```

---

## 5. 검증 및 테스트 절차

1. **테스트 1: 이름 끝에 숫자가 포함된 연락처로 SMS 수신**
   - 연락처에 `차민서2` (전화번호: 010-XXXX-XXXX) 등록
   - 해당 번호에서 스마트폰으로 `T` 문자 1건 발송
   - **기대 결과**:
     - 구글 시트에 `차민서2 | 010-XXXX-XXXX | T` 단 **1행만 기록**됨.
     - `미등록 연락처 | 02 | T` 행이 생성되지 않음.

2. **테스트 2: RCS(채팅+) 메시지 수신 테스트**
   - RCS 대화방에서 메시지 수신 시 알림 리스너를 통해 정상 번호 또는 이름이 매칭되어 1건만 기록되는지 확인.

3. **테스트 3: 일반 금융 알림 및 카카오톡과의 충돌 여부 확인**
   - 은행 입금 푸시 알림 및 카카오톡 메시지가 기존과 동일하게 정상 감지되는지 확인.

---

## 6. 배포 가이드
1. 안드로이드 클라이언트 코드 반영 후 `SheetBotAgent.apk` 빌드
2. `public/downloads/SheetBotAgent.apk` 및 `~/.egdesk/deployments/SheetBot/...` 동기화
3. 이지데스크 SSL 서버를 통해 백엔드 변경 사항 자동 배포 및 테스트
