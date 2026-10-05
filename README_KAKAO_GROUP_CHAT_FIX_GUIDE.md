# [SheetBot] 카카오톡 단체 채팅방 1:1 오분류 결함 해결 가이드

본 문서는 **스마트폰 단말기에서 3인 이상 참여 중인 카카오톡 단체 채팅방 메시지 수신 시, 구글 스프레드시트에 '1:1 채팅'으로 오분류되고 방 이름이 발신자명으로 잘못 기록되는 결함**의 원인을 분석하고, 이를 완벽하게 해결하기 위한 수정 방안을 정리한 가이드입니다.

---

## 1. 장애 현상 요약

3명이 참여 중인 단체 채팅방에서 메시지가 수신되었으나 시트에 다음과 같이 개별 발신자명과 함께 **'1:1 채팅'**으로 기록됨:

| 수신 일시 | 구분 | 채팅방명 | 발신자 | 내용 | 기록 디바이스 |
| :--- | :---: | :---: | :---: | :---: | :--- |
| **2026-10-05 23:03:20** | **1:1 채팅** | **차민서2** | **차민서2** | 테스트 입니다 | samsung SM-N976N (SheetBot Agent) |
| **2026-10-05 23:05:02** | **1:1 채팅** | **조현화** | **조현화** | 까꿍 | samsung SM-N976N (SheetBot Agent) |

- **문제점 1**: 3인 단체방임에도 구분이 **`1:1 채팅`**으로 오분류됨 (기대값: `단체 단톡방`)
- **문제점 2**: 실제 채팅방 이름이 아닌 **개별 발신자명**(`차민서2`, `조현화`)이 채팅방명 컬럼에 기록됨

---

## 2. 발생 메커니즘 분석 (Root Cause)

이 결함은 **최신 안드로이드 카카오톡 알림 규격(`Notification.MessagingStyle`)과 에이전트 앱의 구형 파싱 조건 간의 불일치**로 인해 발생했습니다.

### 2.1. 기존 에이전트(`BankNotificationListener.kt`)의 단체방 판별 로직
기존 코드는 다음 2가지 레거시 조건에만 의존하여 단체방 여부를 판단했습니다:

```kotlin
var chatRoomName = rawTitle.trim()
var sender = rawTitle.trim()
var message = rawText.trim()
var isGroupChat = false // 기본값은 1:1 채팅

// [조건 1] 서브텍스트(rawSubText)가 있는 경우
if (rawSubText.isNotBlank()) {
    chatRoomName = rawSubText.trim()
    sender = rawTitle.trim()
    isGroupChat = true
} 
// [조건 2] 본문에 '발신자: 내용' 형태로 들어오는 경우 (예: "차민서2: 테스트 입니다")
else if (rawText.contains(": ")) {
    val parts = rawText.split(": ", limit = 2)
    if (parts.size == 2 && parts[0].length <= 20) {
        sender = parts[0].trim()
        message = parts[1].trim()
        chatRoomName = rawTitle.trim()
        isGroupChat = true
    }
}
```

### 2.2. 최신 카카오톡 알림 규격과의 불일치
최신 안드로이드(Android 9 Pie 이상)의 카카오톡은 표준 대화형 알림인 **`Notification.MessagingStyle`**을 사용합니다:

| 알림 속성 Key | 1:1 개인 채팅방 | 3인 이상 단체 채팅방 | 기존 코드의 참조 여부 |
| :--- | :--- | :--- | :---: |
| `EXTRA_TITLE` | 상대방 이름 (예: `"차민서2"`) | 발신자 이름 (예: `"차민서2"`) | 참조함 (`rawTitle`) |
| `EXTRA_TEXT` | 메시지 본문 (예: `"테스트 입니다"`) | 메시지 본문 (예: `"테스트 입니다"`) | 참조함 (`rawText`) |
| `EXTRA_SUB_TEXT` | 비어있음 (`null` 또는 `""`) | **비어있음 (`null` 또는 `""`)** | 참조함 (`rawSubText`) |
| **`EXTRA_CONVERSATION_TITLE`** | 비어있음 (`null`) | **단체방 이름 (예: `"차민서2, 조현화"` 또는 설정된 방 이름)** | **미참조 (누락!)** |
| **`EXTRA_IS_GROUP_CONVERSATION`** | `false` | **`true`** | **미참조 (누락!)** |

1. 최신 카카오톡 단체방 알림은 본문(`EXTRA_TEXT`)에 `발신자: ` 접두어를 붙이지 않고 순수 본문만 전달하므로 **[조건 2]가 무력화**됩니다.
2. 단체방 이름은 `EXTRA_SUB_TEXT`가 아닌 **`EXTRA_CONVERSATION_TITLE`**에 실려 오므로 **[조건 1]도 무력화**됩니다.
3. 결국 두 조건 모두 `false`가 되어 기본값인 **`isGroupChat = false` (1:1 채팅)**로 처리되고, 방 이름도 알림 제목인 발신자명으로 기록되었습니다.

---

## 3. 해결 방안 (정밀 다중 속성 파싱)

안드로이드 `Notification.MessagingStyle` 표준 명세에 정의된 공식 속성들을 우선순위대로 점검하도록 파싱 로직을 전면 보강합니다.

```
[카카오톡 알림 인입]
       │
       ▼
1. Notification.EXTRA_CONVERSATION_TITLE 확인
   ├─ 값이 존재함 ➔ 단체 단톡방 확정 (isGroupChat = true, chatRoomName = title)
   └─ 비어있음 ➔ 2단계 검사 진행
       ▼
2. Notification.EXTRA_IS_GROUP_CONVERSATION 플래그 확인
   ├─ true ➔ 단체 단톡방 확정 (isGroupChat = true)
   └─ false / 없음 ➔ 3단계 검사 진행
       ▼
3. NotificationCompat.isGroupConversation(notification) 검사
   ├─ true ➔ 단체 단톡방 확정
   └─ false ➔ 4단계 검사 진행
       ▼
4. 레거시 호환 검사 (rawSubText 존재 여부 및 rawText 내 "발신자: 내용" 구조)
   ├─ 일치 ➔ 단체 단톡방 확정
   └─ 불일치 ➔ 최종 1:1 채팅 확정
```

---

## 4. 구체적인 코드 수정 명세서

### 4.1. `BankNotificationListener.kt` - 카카오톡 알림 파싱 전면 개선
파일: `android-user-agent/app/src/main/java/cloud/sheetbot/agent/user/BankNotificationListener.kt`

```kotlin
    /**
     * 카카오톡 수신 알림 정밀 파싱 및 구글 시트 동기화
     */
    private fun handleKakaoNotification(sbn: StatusBarNotification) {
        if (!prefs.isPaired) return
        val userEmail = prefs.userEmail ?: return

        try {
            val notification = sbn.notification ?: return
            val extras = notification.extras ?: return
            val rawTitle = extras.getString(Notification.EXTRA_TITLE)
                ?: extras.getCharSequence(Notification.EXTRA_TITLE)?.toString() ?: ""
            val rawText = extras.getString(Notification.EXTRA_TEXT)
                ?: extras.getCharSequence(Notification.EXTRA_TEXT)?.toString()
                ?: extras.getCharSequence(Notification.EXTRA_BIG_TEXT)?.toString() ?: ""
            val rawSubText = extras.getString(Notification.EXTRA_SUB_TEXT)
                ?: extras.getCharSequence(Notification.EXTRA_SUB_TEXT)?.toString() ?: ""

            if (rawText.isBlank()) return

            // 1. 안드로이드 최신 MessagingStyle 표준 속성 추출
            val conversationTitle = extras.getCharSequence(Notification.EXTRA_CONVERSATION_TITLE)?.toString()?.trim()
            val isGroupConversationExtra = extras.getBoolean(Notification.EXTRA_IS_GROUP_CONVERSATION, false)
            val isCompatGroup = try {
                NotificationCompat.isGroupConversation(notification)
            } catch (_: Exception) {
                false
            }

            var chatRoomName = rawTitle.trim()
            var sender = rawTitle.trim()
            var message = rawText.trim()
            var isGroupChat = false

            // [우선순위 1] 최신 MessagingStyle의 대화방 타이틀이 명시된 경우 (가장 정확한 단체방 감지)
            if (!conversationTitle.isNullOrBlank()) {
                chatRoomName = conversationTitle
                sender = rawTitle.trim()
                isGroupChat = true
            }
            // [우선순위 2] 안드로이드 시스템 표준 그룹 대화 플래그가 true인 경우
            else if (isGroupConversationExtra || isCompatGroup) {
                isGroupChat = true
                if (rawSubText.isNotBlank()) {
                    chatRoomName = rawSubText.trim()
                    sender = rawTitle.trim()
                } else {
                    chatRoomName = "단체 채팅방"
                    sender = rawTitle.trim()
                }
            }
            // [우선순위 3] 서브텍스트에 대화방 이름이 실려오는 구형 방식
            else if (rawSubText.isNotBlank()) {
                chatRoomName = rawSubText.trim()
                sender = rawTitle.trim()
                isGroupChat = true
            }
            // [우선순위 4] 본문에 '발신자: 내용' 형태로 들어오는 구형 단톡방 방식
            else if (rawText.contains(": ")) {
                val parts = rawText.split(": ", limit = 2)
                if (parts.size == 2 && parts[0].length <= 25) {
                    sender = parts[0].trim()
                    message = parts[1].trim()
                    chatRoomName = rawTitle.trim()
                    isGroupChat = true
                }
            }
            // 그 외: 1:1 개인 채팅방 (isGroupChat = false, chatRoomName = sender)
```

---

## 5. 기대 효과 및 변경 비교

| 구분 | 수정 전 | 수정 후 |
| :--- | :--- | :--- |
| **3인 단톡방 (방 제목 미지정)** | `1:1 채팅` / 방: `차민서2` | **`단체 단톡방` / 방: `차민서2, 조현화`** |
| **3인 단톡방 (방 제목 지정: "시트봇 프로젝트")** | `1:1 채팅` / 방: `조현화` | **`단체 단톡방` / 방: `시트봇 프로젝트`** |
| **1:1 개인톡** | `1:1 채팅` / 방: `홍길동` | **`1:1 채팅` / 방: `홍길동`** (정상 유지) |
| **카카오페이/카카오뱅크 알림톡** | 금융 결제 대장 정상 분류 | 금융 결제 대장 정상 분류 (변함없이 유지) |

---

## 6. 검증 시나리오

1. **테스트 1: 3인 단체 채팅방 메시지 수신**
   - 3인이 참여한 카카오톡 대화방에서 메시지 발송
   - **기대 결과**: 시트의 B열 구분에 **`단체 단톡방`**, C열 채팅방명에 참여자 목록(또는 방 이름)이 정확히 기록됨.
2. **테스트 2: 1:1 개인 채팅방 메시지 수신**
   - 1:1 카톡방에서 메시지 발송
   - **기대 결과**: 시트의 B열 구분에 **`1:1 채팅`**, C열 채팅방명에 상대방 이름이 정상 기록됨.
3. **테스트 3: 카카오페이/카카오뱅크 금융 알림톡 수신**
   - 송금/결제 알림톡 수신 시 기존과 동일하게 매장 결제 대장으로 정상 직행하는지 확인.
