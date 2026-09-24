package cloud.sheetbot.agent

import android.content.Context
import android.os.Handler
import android.os.Looper
import android.speech.tts.TextToSpeech
import android.util.Log
import java.util.Locale

/**
 * 실시간 입금 감지 시 한국어 음성(TTS) 안내 매니저
 */
object TtsManager {
    private const val TAG = "TtsManager"
    private var tts: TextToSpeech? = null
    private var isInitialized = false

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
                    isInitialized = true
                    Log.i(TAG, "🔊 TTS 엔진 초기화 완료")
                } else {
                    Log.e(TAG, "TTS 초기화 실패 (status=$status)")
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "TTS 초기화 예외: ${e.message}")
        }
    }

    fun speak(context: Context, text: String) {
        val prefs = PreferencesManager(context)
        if (!prefs.isTtsEnabled) {
            Log.d(TAG, "TTS 설정이 꺼져 있어 발화를 건너뜁니다.")
            return
        }

        if (tts == null || !isInitialized) {
            init(context)
            Handler(Looper.getMainLooper()).postDelayed({
                speakInternal(text)
            }, 800)
            return
        }

        speakInternal(text)
    }

    private fun speakInternal(text: String) {
        try {
            tts?.speak(text, TextToSpeech.QUEUE_FLUSH, null, "sheetbot_deposit_${System.currentTimeMillis()}")
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
