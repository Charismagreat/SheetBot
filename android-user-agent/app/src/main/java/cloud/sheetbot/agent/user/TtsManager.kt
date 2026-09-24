package cloud.sheetbot.agent.user

import android.content.Context
import android.media.AudioAttributes
import android.media.Ringtone
import android.media.RingtoneManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.PowerManager
import android.speech.tts.TextToSpeech
import android.util.Log
import java.util.Locale

/**
 * 실시간 입금 감지 및 비상 경보용 TTS 매니저
 * - 화면 꺼짐 및 Doze 절전 모드에서도 WakeLock과 USAGE_ALARM 오디오 속성으로 강제 출력
 */
object TtsManager {
    private const val TAG = "TtsManager"
    private var tts: TextToSpeech? = null
    private var isInitialized = false

    private val alarmAudioAttributes = AudioAttributes.Builder()
        .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
        .setUsage(AudioAttributes.USAGE_ALARM)
        .setFlags(AudioAttributes.FLAG_AUDIBILITY_ENFORCED)
        .build()

    fun init(context: Context) {
        if (tts != null) return
        try {
            tts = TextToSpeech(context.applicationContext) { status ->
                if (status == TextToSpeech.SUCCESS) {
                    val result = tts?.setLanguage(Locale.KOREAN)
                    if (result == TextToSpeech.LANG_MISSING_DATA || result == TextToSpeech.LANG_NOT_SUPPORTED) {
                        Log.w(TAG, "한국어 TTS 데이터 미지원 또는 누락. 기본 언어로 폴백합니다.")
                        tts?.language = Locale.getDefault()
                    }
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                        tts?.setAudioAttributes(alarmAudioAttributes)
                    }
                    isInitialized = true
                    Log.i(TAG, "🔊 TTS 엔진 초기화 완료 (알람 오디오 스트림 설정)")
                } else {
                    Log.e(TAG, "TTS 초기화 실패 (status=$status)")
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "TTS 초기화 예외: ${e.message}")
        }
    }

    /**
     * 일반 입금 확인 안내 (화면 켜져 있을 때 또는 일반 알림용)
     */
    fun speak(context: Context, text: String) {
        val prefs = PreferencesManager(context)
        if (!prefs.isTtsEnabled) return

        ensureInitializedAndExecute(context) {
            speakInternal(text)
        }
    }

    /**
     * 서버 꺼짐 등 초비상 상황 전용 강력 경보
     * 1) 화면이 꺼져 있어도 CPU가 잠들지 않도록 WakeLock 8초 유지
     * 2) 무음/진동 모드에서도 시스템 알람 비프음을 1초간 선행 재생하여 오디오 하드웨어 강제 점등
     * 3) 알람 볼륨(USAGE_ALARM)으로 TTS 경고 발화
     */
    fun speakAlarm(context: Context, text: String) {
        val prefs = PreferencesManager(context)
        if (!prefs.isTtsEnabled) return

        // 1. CPU 잠듦 방지용 Partial WakeLock 8초 획득
        try {
            val pm = context.applicationContext.getSystemService(Context.POWER_SERVICE) as PowerManager
            val wl = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "SheetBot:TtsAlarmWakeLock")
            wl.acquire(8000L)
        } catch (e: Exception) {
            Log.w(TAG, "WakeLock 획득 실패: ${e.message}")
        }

        // 2. 알람 사이렌 1초 선행 재생 후 TTS 발화
        try {
            val alarmUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM)
                ?: RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION)
            val ringtone: Ringtone? = RingtoneManager.getRingtone(context.applicationContext, alarmUri)

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP && ringtone != null) {
                ringtone.audioAttributes = alarmAudioAttributes
            }

            ringtone?.play()

            // 1초 뒤 알람음 중지하고 TTS 발화
            Handler(Looper.getMainLooper()).postDelayed({
                try {
                    ringtone?.stop()
                } catch (_: Exception) {}

                ensureInitializedAndExecute(context) {
                    speakInternal(text)
                }
            }, 1000L)
        } catch (e: Exception) {
            Log.w(TAG, "알람음 선행 재생 예외: ${e.message}")
            ensureInitializedAndExecute(context) {
                speakInternal(text)
            }
        }
    }

    private fun ensureInitializedAndExecute(context: Context, action: () -> Unit) {
        if (tts == null || !isInitialized) {
            init(context)
            Handler(Looper.getMainLooper()).postDelayed({
                action()
            }, 800L)
            return
        }
        action()
    }

    private fun speakInternal(text: String) {
        try {
            tts?.speak(text, TextToSpeech.QUEUE_FLUSH, null, "sheetbot_alarm_${System.currentTimeMillis()}")
            Log.i(TAG, "🔊 TTS 발화 성공: $text")
        } catch (e: Exception) {
            Log.w(TAG, "TTS 발화 예외: ${e.message}")
        }
    }

    fun shutdown() {
        try {
            tts?.stop()
            tts?.shutdown()
            tts = null
            isInitialized = false
        } catch (_: Exception) {}
    }
}
