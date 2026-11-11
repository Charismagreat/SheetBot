package cloud.sheetbot.agent.user

import android.app.ActivityOptions
import android.app.Notification
import android.app.PendingIntent
import android.app.RemoteInput
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.service.notification.StatusBarNotification
import android.util.Log
import android.widget.Toast
import java.util.concurrent.ConcurrentHashMap

/**
 * 💬 카카오톡 및 메시지 알림의 채팅방 바로가기(contentIntent) 및 직접 답장(RemoteInput) 세션 캐시
 *
 * - BankNotificationListener에서 카카오톡/메시지 알림 수신 시 해당 대화방의 PendingIntent와 RemoteInput을 메모리에 캐싱합니다.
 * - TasksActivity(스마트 통합 할 일 허브)에서 카톡/문자 과업 카드를 선택했을 때:
 *   1) 해당 카카오톡 채팅방을 직접 열거나(openChatRoom)
 *   2) 앱을 벗어나지 않고 카카오톡/메시지 알림 RemoteInput으로 즉시 답장을 전송(sendDirectReply)할 수 있도록 지원합니다.
 */
object KakaoReplySessionCache {
    private const val TAG = "KakaoReplyCache"

    data class ReplySession(
        val packageName: String,
        val chatRoomName: String,
        val senderName: String,
        val contentIntent: PendingIntent?,
        val replyActionIntent: PendingIntent?,
        val remoteInputs: Array<RemoteInput>?,
        val capturedAtMs: Long = System.currentTimeMillis()
    ) {
        val canDirectReply: Boolean
            get() = replyActionIntent != null && !remoteInputs.isNullOrEmpty()

        val canOpenChatRoom: Boolean
            get() = contentIntent != null
    }

    // 정규화된 이름(공백 제거 소문자) -> ReplySession
    private val sessionMap = ConcurrentHashMap<String, ReplySession>()

    private fun normalizeKey(raw: String?): String {
        return raw?.replace("\\s+".toRegex(), "")?.lowercase()?.trim().orEmpty()
    }

    /**
     * StatusBarNotification에서 contentIntent와 RemoteInput이 포함된 Action을 추출하여 캐싱
     */
    fun captureFromNotification(
        sbn: StatusBarNotification,
        chatRoomName: String,
        senderName: String
    ) {
        try {
            val notification = sbn.notification ?: return
            val contentIntent = notification.contentIntent

            var replyPendingIntent: PendingIntent? = null
            var foundRemoteInputs: Array<RemoteInput>? = null

            val actions = notification.actions
            if (!actions.isNullOrEmpty()) {
                for (action in actions) {
                    val inputs = action.remoteInputs
                    if (!inputs.isNullOrEmpty() && action.actionIntent != null) {
                        replyPendingIntent = action.actionIntent
                        foundRemoteInputs = inputs
                        break
                    }
                }
            }

            // wearableExtender 내 액션까지 보조 탐색
            if (replyPendingIntent == null) {
                try {
                    val wearableExtender = Notification.WearableExtender(notification)
                    for (action in wearableExtender.actions) {
                        val inputs = action.remoteInputs
                        if (!inputs.isNullOrEmpty() && action.actionIntent != null) {
                            replyPendingIntent = action.actionIntent
                            foundRemoteInputs = inputs
                            break
                        }
                    }
                } catch (_: Exception) {}
            }

            if (contentIntent == null && replyPendingIntent == null) return

            val session = ReplySession(
                packageName = sbn.packageName ?: "com.kakao.talk",
                chatRoomName = chatRoomName.trim(),
                senderName = senderName.trim(),
                contentIntent = contentIntent,
                replyActionIntent = replyPendingIntent,
                remoteInputs = foundRemoteInputs
            )

            val roomKey = normalizeKey(chatRoomName)
            val senderKey = normalizeKey(senderName)
            if (roomKey.isNotEmpty()) sessionMap[roomKey] = session
            if (senderKey.isNotEmpty()) sessionMap[senderKey] = session

            Log.d(
                TAG,
                "캐시 저장 완료: 방='$chatRoomName', 발신자='$senderName', 직접답장=${session.canDirectReply}, 방열기=${session.canOpenChatRoom}"
            )
        } catch (e: Exception) {
            Log.w(TAG, "captureFromNotification 오류: ${e.message}")
        }
    }

    /**
     * 고객명, 채팅방명, 또는 할 일 제목에서 매칭되는 카카오톡/메시지 세션 탐색
     */
    fun findSession(contactName: String?, title: String?): ReplySession? {
        val candidates = mutableListOf<String>()
        if (!contactName.isNullOrBlank()) {
            candidates.add(contactName.trim())
            // 괄호 앞 이름 추출: 예 "홍길동 (010-1234-5678)" -> "홍길동"
            val beforeParen = contactName.substringBefore("(").trim()
            if (beforeParen.isNotBlank()) candidates.add(beforeParen)
        }
        if (!title.isNullOrBlank()) {
            val bracketMatch = Regex("^\\[([^\\]]+)\\]").find(title.trim())
            if (bracketMatch != null) {
                val inside = bracketMatch.groupValues[1].trim()
                candidates.add(inside)
                val beforeParen = inside.substringBefore("(").trim()
                if (beforeParen.isNotBlank()) candidates.add(beforeParen)
            }
        }

        for (cand in candidates) {
            val key = normalizeKey(cand)
            if (key.isEmpty()) continue
            sessionMap[key]?.let { return it }
        }

        // 부분 일치 탐색
        for (cand in candidates) {
            val key = normalizeKey(cand)
            if (key.length < 2) continue
            for ((k, v) in sessionMap.entries) {
                if (k.contains(key) || key.contains(k)) {
                    return v
                }
            }
        }
        return null
    }

    /**
     * 캐싱된 알림의 contentIntent를 실행하여 해당 카카오톡 채팅방(또는 메시지 대화창)을 즉시 엽니다.
     * Android 14+ (API 34+)에서는 PendingIntent.send()의 백그라운드 Activity 시작 차단(BAL)을 허용하는 옵션을 함께 전달합니다.
     */
    fun openChatRoom(session: ReplySession): Boolean {
        val pi = session.contentIntent ?: return false
        return try {
            if (Build.VERSION.SDK_INT >= 34) {
                val options = ActivityOptions.makeBasic()
                    .setPendingIntentBackgroundActivityStartMode(
                        ActivityOptions.MODE_BACKGROUND_ACTIVITY_START_ALLOWED
                    )
                    .toBundle()
                pi.send(null, 0, null, null, null, null, options)
            } else {
                pi.send()
            }
            true
        } catch (e: Exception) {
            Log.w(TAG, "채팅방 PendingIntent 실행 실패 (만료됨): ${e.message}")
            false
        }
    }

    /**
     * 4단계 다중 폴백으로 카카오톡 채팅방 또는 카카오톡 앱을 안전하게 실행합니다.
     * 1단계: 캐싱된 알림 세션(PendingIntent)으로 해당 채팅방 직접 열기
     * 2단계: PackageManager.getLaunchIntentForPackage("com.kakao.talk") 실행 (<queries> 선언 기반)
     * 3단계: 명시적 패키지/런처 카테고리 인텐트(ACTION_MAIN + CATEGORY_LAUNCHER) 실행
     * 4단계: 카카오톡 커스텀 스킴(kakaotalk://launch) 실행
     */
    fun launchKakaoTalkOrRoom(context: Context, session: ReplySession? = null): Boolean {
        if (session != null && session.canOpenChatRoom) {
            if (openChatRoom(session)) {
                return true
            }
        }

        // 2단계: getLaunchIntentForPackage
        try {
            val launchIntent = context.packageManager.getLaunchIntentForPackage("com.kakao.talk")?.apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
            }
            if (launchIntent != null) {
                context.startActivity(launchIntent)
                return true
            }
        } catch (e: Exception) {
            Log.w(TAG, "getLaunchIntentForPackage 카카오톡 실행 실패: ${e.message}")
        }

        // 3단계: ACTION_MAIN + setPackage("com.kakao.talk")
        try {
            val explicitMain = Intent(Intent.ACTION_MAIN).apply {
                addCategory(Intent.CATEGORY_LAUNCHER)
                setPackage("com.kakao.talk")
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
            }
            context.startActivity(explicitMain)
            return true
        } catch (e: Exception) {
            Log.w(TAG, "ACTION_MAIN 카카오톡 실행 실패: ${e.message}")
        }

        // 4단계: kakaotalk://launch URI 스킴
        try {
            val schemeIntent = Intent(Intent.ACTION_VIEW, Uri.parse("kakaotalk://launch")).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            context.startActivity(schemeIntent)
            return true
        } catch (e: Exception) {
            Log.w(TAG, "kakaotalk:// 스킴 실행 실패: ${e.message}")
        }

        Toast.makeText(context, "카카오톡 앱을 열 수 없습니다.", Toast.LENGTH_SHORT).show()
        return false
    }

    /**
     * 캐싱된 알림의 RemoteInput을 통해 앱 내에서 즉시 카카오톡 답장을 전송합니다.
     */
    fun sendDirectReply(context: Context, session: ReplySession, replyText: String): Boolean {
        val actionIntent = session.replyActionIntent ?: return false
        val inputs = session.remoteInputs ?: return false
        if (inputs.isEmpty() || replyText.isBlank()) return false

        return try {
            val fillInIntent = Intent()
            val resultsBundle = Bundle()
            for (input in inputs) {
                resultsBundle.putCharSequence(input.resultKey, replyText.trim())
            }
            RemoteInput.addResultsToIntent(inputs, fillInIntent, resultsBundle)
            actionIntent.send(context, 0, fillInIntent)
            Log.i(TAG, "✅ [카카오톡 RemoteInput 답장 전송 성공] 대상: ${session.chatRoomName} / 내용: $replyText")
            true
        } catch (e: Exception) {
            Log.w(TAG, "❌ [카카오톡 RemoteInput 답장 전송 실패] ${e.message}")
            false
        }
    }
}
