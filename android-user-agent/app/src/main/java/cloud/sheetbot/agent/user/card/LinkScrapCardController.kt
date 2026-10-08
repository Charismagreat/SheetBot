package cloud.sheetbot.agent.user.card

import android.view.View
import android.widget.Toast
import androidx.lifecycle.lifecycleScope
import cloud.sheetbot.agent.user.ApiClient
import cloud.sheetbot.agent.user.MainActivity
import cloud.sheetbot.agent.user.PreferencesManager
import cloud.sheetbot.agent.user.TtsManager
import cloud.sheetbot.agent.user.databinding.ActivityMainBinding
import kotlinx.coroutines.launch

/**
 * 🌐 웹 링크 & 유튜브 영상 AI 자동 스크랩 카드 전담 컨트롤러
 * - 스크랩 ON/OFF 스위치, 접기/펼치기 토글, 구글 시트 연동 및 외부 공유 인텐트(Share) 수신 시 실시간 AI 3줄 요약 스크랩 캡슐화
 */
class LinkScrapCardController(
    private val activity: MainActivity,
    private val binding: ActivityMainBinding,
    private val prefs: PreferencesManager,
    private val onOpenSheetChooser: (sheetType: String, defaultTitle: String) -> Unit,
    private val onProvisionSheet: (sheetType: String, defaultTitle: String) -> Unit,
    private val onAddLogItem: (title: String, detail: String, success: Boolean) -> Unit
) {
    /**
     * 카드 초기화 및 모든 UI 이벤트 바인딩
     */
    fun setup() {
        binding.switchLinkScrap.isChecked = prefs.isLinkScrapEnabled

        // 접기/펼치기 헤더 및 버튼 리스너 바인딩
        val toggleLinkScrap = {
            prefs.isLinkScrapDetailsHidden = !prefs.isLinkScrapDetailsHidden
            activity.updateCardCollapseState(
                binding.layoutLinkScrapSettings,
                binding.btnToggleLinkScrapDetails,
                prefs.isLinkScrapDetailsHidden
            )
        }
        binding.layoutLinkScrapHeader.setOnClickListener { toggleLinkScrap() }
        binding.btnToggleLinkScrapDetails.setOnClickListener { toggleLinkScrap() }

        binding.switchLinkScrap.setOnCheckedChangeListener { _, isChecked ->
            prefs.isLinkScrapEnabled = isChecked
            prefs.isLinkScrapDetailsHidden = !isChecked
            activity.updateCardCollapseState(
                binding.layoutLinkScrapSettings,
                binding.btnToggleLinkScrapDetails,
                !isChecked
            )
            val msg = if (isChecked) "웹 링크 & 유튜브 AI 자동 스크랩이 켜졌습니다." else "웹 링크 & 유튜브 자동 스크랩이 꺼졌습니다."
            Toast.makeText(activity, msg, Toast.LENGTH_SHORT).show()
            if (isChecked) {
                onProvisionSheet("LINK_BOOKMARK", prefs.linkScrapDriveSheetTitle)
            }
        }

        binding.btnOpenLinkScrapSheet.setOnClickListener {
            onOpenSheetChooser("LINK_BOOKMARK", prefs.linkScrapDriveSheetTitle)
        }
    }

    /**
     * 외부 앱에서 공유된 웹 링크 또는 유튜브 링크를 구글 스프레드시트에 자동 스크랩 및 AI 3줄 요약 기록
     */
    fun bookmarkSharedUrl(url: String, rawText: String?) {
        if (!prefs.isPaired) {
            Toast.makeText(activity, "⚠️ 시트봇 계정 연동 후 링크를 스크랩할 수 있습니다.", Toast.LENGTH_LONG).show()
            return
        }

        if (!prefs.isLinkScrapEnabled) {
            Toast.makeText(activity, "⚠️ 웹 링크 & 유튜브 AI 스크랩 기능이 꺼져 있습니다. 앱 설정에서 켜주세요.", Toast.LENGTH_LONG).show()
            return
        }

        val userEmail = prefs.userEmail
        if (userEmail.isNullOrBlank()) {
            Toast.makeText(activity, "⚠️ 연동된 계정 이메일이 없습니다.", Toast.LENGTH_LONG).show()
            return
        }

        val isYouTube = url.contains("youtube.com", ignoreCase = true) || url.contains("youtu.be", ignoreCase = true)
        val tagMsg = if (isYouTube) "🔴 유튜브 영상" else "🌐 웹 링크"

        binding.progressBar.visibility = View.VISIBLE
        Toast.makeText(activity, "🚀 $tagMsg 정보를 분석하여 구글 시트에 스크랩합니다...", Toast.LENGTH_SHORT).show()

        activity.lifecycleScope.launch {
            try {
                val result = ApiClient.bookmarkLink(
                    userEmail = userEmail,
                    url = url,
                    rawText = rawText,
                    memo = "스마트폰 공유하기(Share) 스크랩"
                )
                binding.progressBar.visibility = View.GONE

                if (result.success) {
                    val title = result.title ?: url
                    val cat = result.category
                    Toast.makeText(
                        activity,
                        "🎉 [$cat] $title\n구글 스프레드시트에 안전하게 스크랩되었습니다!",
                        Toast.LENGTH_LONG
                    ).show()

                    onAddLogItem("링크 스크랩", "$cat $title -> 스크랩 대장", true)

                    if (prefs.isTtsEnabled) {
                        val voiceMsg = if (isYouTube) "유튜브 영상이 스크랩 대장에 기록되었습니다." else "웹사이트 링크가 스크랩 대장에 기록되었습니다."
                        TtsManager.speak(activity, voiceMsg)
                    }
                } else {
                    val err = result.error ?: "스크랩 실패"
                    Toast.makeText(activity, "⚠️ 링크 스크랩 실패: $err", Toast.LENGTH_LONG).show()
                    onAddLogItem("스크랩 실패", err, false)
                }
            } catch (e: Exception) {
                binding.progressBar.visibility = View.GONE
                Toast.makeText(activity, "링크 스크랩 예외: ${e.message}", Toast.LENGTH_SHORT).show()
            }
        }
    }

    /**
     * 카드 접기/펼치기 상태 복원
     */
    fun refreshCollapseState() {
        activity.updateCardCollapseState(
            binding.layoutLinkScrapSettings,
            binding.btnToggleLinkScrapDetails,
            prefs.isLinkScrapDetailsHidden
        )
    }
}
