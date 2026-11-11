package cloud.sheetbot.agent.user

import android.app.ActivityOptions
import android.app.Notification
import android.app.PendingIntent
import android.app.RemoteInput
import android.content.ClipData
import android.content.ClipboardManager
import android.content.ComponentName
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
 * - TasksActivity(스마트 통합 할 일 허브) 및 FtsSheetViewerActivity에서 카톡/문자 과업 카드를 선택했을 때:
 *   1) 상단바 알림 세션이 있으면 해당 카카오톡 채팅방을 직접 열거나(openChatRoom)
 *   2) 앱을 벗어나지 않고 카카오톡/메시지 알림 RemoteInput으로 즉시 답장을 전송(sendDirectReply)할 수 있도록 지원합니다.
 *   3) 상단바 알림이 이미 지워진 과거 대화인 경우, 직전에 열려 있던 다른 사람의 대화창이 그대로 표시되지 않도록
 *      카카오톡 메인 채팅 목록으로 이동하면서 대상 대화방/상대방 이름을 클립보드에 자동 복사해 즉시 검색할 수 있도록 안내합니다.
 */
object KakaoReplySessionCache {
    private const val TAG = "KakaoReplyCache"

    private val IGNORED_GENERIC_KEYS = setOf(
        "단체채팅방",
        "채팅방",
        "오픈채팅방",
        "카톡",
        "카카오톡",
        "알림톡",
        "카톡상대",
        "카톡답장/확인",
        "카톡답장",
        "메시지",
        "새로운메시지",
        "알림톡도착",
        "메시지가도착했습니다",
        "파투카카오톡대화대장"
    )

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
        if (raw.isNullOrBlank()) return ""
        val cleaned = raw
            .replace(Regex("^\\[단체\\s*채팅방\\]\\s*"), "")
            .replace(Regex("^\\[카톡[^\\]]*\\]\\s*"), "")
            .replace(Regex("\\s+"), "")
            .lowercase()
            .trim()
        return if (cleaned in IGNORED_GENERIC_KEYS) "" else cleaned
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
            // '단체채팅방' 등 범용 키로는 저장하지 않아 다른 단톡방으로 오인 점프하는 현상을 100% 차단
            if (roomKey.isNotEmpty()) sessionMap[roomKey] = session
            if (senderKey.isNotEmpty()) sessionMap[senderKey] = session

            Log.d(
                TAG,
                "캐시 저장 완료: 방='$chatRoomName'($roomKey), 발신자='$senderName'($senderKey), 직접답장=${session.canDirectReply}, 방열기=${session.canOpenChatRoom}"
            )
        } catch (e: Exception) {
            Log.w(TAG, "captureFromNotification 오류: ${e.message}")
        }
    }

    private fun addCandidateVariants(targetList: MutableList<String>, raw: String?) {
        if (raw.isNullOrBlank()) return
        val stripped = raw
            .replace(Regex("^\\[단체\\s*채팅방\\]\\s*"), "")
            .replace(Regex("^\\[카톡[^\\]]*\\]\\s*"), "")
            .trim()
        if (stripped.isEmpty()) return

        targetList.add(stripped)
        val beforeParen = stripped.substringBefore("(").trim()
        if (beforeParen.isNotEmpty()) targetList.add(beforeParen)

        // "채팅방명 / 발신자명" 형태 분리
        if (stripped.contains("/")) {
            stripped.split("/").map { it.trim() }.filter { it.isNotEmpty() }.forEach { part ->
                targetList.add(part)
                val bp = part.substringBefore("(").trim()
                if (bp.isNotEmpty()) targetList.add(bp)
            }
        }
    }

    /**
     * 고객명, 채팅방명, 또는 할 일 제목에서 매칭되는 카카오톡/메시지 세션 탐색
     */
    fun findSession(contactName: String?, title: String?): ReplySession? {
        // 탐색 직전 상단 알림바의 현재 활성 카카오톡 알림을 실시간 스캔하여 캐시 최신화
        BankNotificationListener.refreshKakaoSessionCacheNow()

        val candidates = mutableListOf<String>()
        addCandidateVariants(candidates, contactName)

        if (!title.isNullOrBlank()) {
            // "[[단체 채팅방] 상아기획 주문담당자] ..." 형태 및 일반 "[상대방명] ..." 형태 모두 추출
            val cleanedTitle = title.trim().replace(Regex("^\\[\\[단체\\s*채팅방\\]\\s*([^\\]]+)\\]"), "[$1]")
            val bracketMatches = Regex("\\[([^\\]]+)\\]").findAll(cleanedTitle)
            for (m in bracketMatches) {
                val inside = m.groupValues[1].trim()
                if (normalizeKey(inside).isNotEmpty()) {
                    addCandidateVariants(candidates, inside)
                }
            }
        }

        // 1차: 정규화 키 완전 일치 탐색
        for (cand in candidates) {
            val key = normalizeKey(cand)
            if (key.isEmpty()) continue
            sessionMap[key]?.let { return it }
        }

        // 2차: 2글자 이상 고유 이름 부분 일치 탐색 (범용 키워드 제외)
        for (cand in candidates) {
            val key = normalizeKey(cand)
            if (key.length < 2) continue
            for ((k, v) in sessionMap.entries) {
                if (k.length >= 2 && (k.contains(key) || key.contains(k))) {
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
    fun openChatRoom(session: ReplySession, context: Context? = null): Boolean {
        val pi = session.contentIntent ?: return false
        return try {
            val fillIn = Intent().apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
            }
            if (Build.VERSION.SDK_INT >= 34) {
                val options = ActivityOptions.makeBasic()
                    .setPendingIntentBackgroundActivityStartMode(
                        ActivityOptions.MODE_BACKGROUND_ACTIVITY_START_ALLOWED
                    )
                    .toBundle()
                try {
                    pi.send(context, 0, fillIn, null, null, null, options)
                } catch (_: Exception) {
                    pi.send(null, 0, null, null, null, null, options)
                }
            } else {
                try {
                    pi.send(context, 0, fillIn)
                } catch (_: Exception) {
                    pi.send()
                }
            }
            if (context != null) {
                val displayRoom = session.chatRoomName
                    .takeIf { it.isNotBlank() && it != "단체 채팅방" }
                    ?: session.senderName
                val isEmailPkg = BankNotificationListener.SUPPORTED_EMAIL_PACKAGES.containsKey(session.packageName)
                val toastMsg = if (isEmailPkg) {
                    "📧 '$displayRoom' 메일 화면으로 바로 이동합니다."
                } else {
                    "💛 '$displayRoom' 카톡 대화방으로 바로 이동합니다."
                }
                Toast.makeText(context, toastMsg, Toast.LENGTH_SHORT).show()
            }
            true
        } catch (e: Exception) {
            Log.w(TAG, "채팅방 PendingIntent 실행 실패 (만료됨): ${e.message}")
            // 만료된 세션은 캐시에서 제거하여 재시도 시 혼선 방지
            val rKey = normalizeKey(session.chatRoomName)
            val sKey = normalizeKey(session.senderName)
            if (rKey.isNotEmpty()) sessionMap.remove(rKey)
            if (sKey.isNotEmpty()) sessionMap.remove(sKey)
            false
        }
    }

    private fun extractCleanTargetName(rawName: String?, rawTitle: String?): String? {
        val candidate = rawName?.takeIf { it.isNotBlank() && !it.equals("null", true) }
            ?: rawTitle?.let {
                val cleaned = it.trim().replace(Regex("^\\[\\[단체\\s*채팅방\\]\\s*([^\\]]+)\\]"), "[$1]")
                Regex("^\\[([^\\]]+)\\]").find(cleaned)?.groupValues?.getOrNull(1)
            }
            ?: return null

        val cleaned = candidate
            .replace(Regex("^\\[단체\\s*채팅방\\]\\s*"), "")
            .replace(Regex("^\\[카톡[^\\]]*\\]\\s*"), "")
            .substringBefore("(")
            .substringAfterLast("/")
            .trim()
        return cleaned.takeIf { it.isNotEmpty() && normalizeKey(it).isNotEmpty() }
    }

    /**
     * 다중 폴백으로 카카오톡 해당 채팅방 또는 카카오톡 메인 목록을 안전하게 실행합니다.
     * - 1단계: 상단바 알림 세션(PendingIntent)이 유효하면 해당 채팅방으로 즉시 점프합니다.
     * - 2단계(알림이 지워진 과거 대화): 이전에 열려 있던 다른 사람의 채팅방이 그대로 뜨는 혼선을 막기 위해
     *   상대방 이름을 클립보드에 자동 복사하고 카카오톡 메인 목록으로 이동하며 안내 토스트를 표시합니다.
     */
    fun launchKakaoTalkOrRoom(
        context: Context,
        session: ReplySession? = null,
        targetName: String? = null,
        taskTitle: String? = null
    ): Boolean {
        val resolvedSession = session ?: findSession(targetName, taskTitle)
        if (resolvedSession != null && resolvedSession.canOpenChatRoom) {
            if (openChatRoom(resolvedSession, context)) {
                return true
            }
        }

        // 상단바 알림이 이미 지워진 과거 대화인 경우: 대상 대화방/상대방 이름을 클립보드에 자동 복사
        val cleanTarget = extractCleanTargetName(targetName, taskTitle)
        if (!cleanTarget.isNullOrBlank()) {
            try {
                val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as? ClipboardManager
                clipboard?.setPrimaryClip(ClipData.newPlainText("카카오톡 대화상대", cleanTarget))
            } catch (_: Exception) {}
        }

        var launched = false

        // 직전에 열려 있던 다른 대화창(ChatRoomActivity) 위에 머무르지 않고 카카오톡 메인 화면으로 진입하도록 CLEAR_TOP 적용
        try {
            val mainSchemeIntent = Intent(Intent.ACTION_VIEW, Uri.parse("kakaotalk://main")).apply {
                setPackage("com.kakao.talk")
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP)
            }
            context.startActivity(mainSchemeIntent)
            launched = true
        } catch (_: Exception) {}

        if (!launched) {
            try {
                val mainActivityIntent = Intent().apply {
                    component = ComponentName("com.kakao.talk", "com.kakao.talk.activity.main.MainActivity")
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP)
                }
                context.startActivity(mainActivityIntent)
                launched = true
            } catch (_: Exception) {}
        }

        if (!launched) {
            try {
                val launchIntent = context.packageManager.getLaunchIntentForPackage("com.kakao.talk")?.apply {
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_RESET_TASK_IF_NEEDED)
                }
                if (launchIntent != null) {
                    context.startActivity(launchIntent)
                    launched = true
                }
            } catch (e: Exception) {
                Log.w(TAG, "getLaunchIntentForPackage 카카오톡 실행 실패: ${e.message}")
            }
        }

        if (!launched) {
            try {
                val schemeIntent = Intent(Intent.ACTION_VIEW, Uri.parse("kakaotalk://launch")).apply {
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
                }
                context.startActivity(schemeIntent)
                launched = true
            } catch (e: Exception) {
                Log.w(TAG, "kakaotalk:// 스킴 실행 실패: ${e.message}")
            }
        }

        if (launched) {
            if (!cleanTarget.isNullOrBlank()) {
                Toast.makeText(
                    context,
                    "💬 상단바 알림이 지워진 과거 대화입니다.\n'$cleanTarget' 이름이 복사되었으니 카톡 검색(🔍)에 붙여넣어 여세요.",
                    Toast.LENGTH_LONG
                ).show()
            }
            return true
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
