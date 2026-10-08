package cloud.sheetbot.agent.user.card

import android.content.Intent
import android.net.Uri
import android.view.View
import android.widget.Toast
import androidx.lifecycle.lifecycleScope
import cloud.sheetbot.agent.user.ApiClient
import cloud.sheetbot.agent.user.MainActivity
import cloud.sheetbot.agent.user.PreferencesManager
import cloud.sheetbot.agent.user.databinding.ActivityMainBinding
import kotlinx.coroutines.launch

/**
 * 🔍 AI 원클릭 기업 리서치 카드 전담 컨트롤러
 * - UI 바인딩, 접기/펼치기 토글, 기업명/도메인 유효성 검사, 공공데이터/AI 심층 리서치 API 호출 및 결과 UI 연동 캡슐화
 */
class CompanyResearchCardController(
    private val activity: MainActivity,
    private val binding: ActivityMainBinding,
    private val prefs: PreferencesManager,
    private val onOpenSheetChooser: (sheetType: String, defaultTitle: String) -> Unit
) {
    /**
     * 카드 초기화 및 모든 UI 이벤트 바인딩
     */
    fun setup() {
        val toggleCollapse = {
            val isHidden = binding.layoutCompanyResearchSettings.visibility != View.VISIBLE
            activity.updateCardCollapseState(
                binding.layoutCompanyResearchSettings,
                binding.btnToggleCompanyResearchDetails,
                !isHidden
            )
        }

        binding.layoutCompanyResearchHeader.setOnClickListener { toggleCollapse() }
        binding.btnToggleCompanyResearchDetails.setOnClickListener { toggleCollapse() }

        binding.btnStartCompanyResearch.setOnClickListener {
            startCompanyResearch()
        }

        binding.btnOpenResearchSheetAlways.setOnClickListener {
            onOpenSheetChooser("COMPANY_RESEARCH", "[SheetBot] 기업 리서치 관리 대장")
        }
    }

    /**
     * AI 기업 리서치 요청 및 결과 UI 갱신
     */
    private fun startCompanyResearch() {
        val companyName = binding.etResearchCompanyName.text.toString().trim()
        val domain = binding.etResearchDomain.text.toString().trim()
        val userEmail = prefs.userEmail

        if (companyName.isBlank() && domain.isBlank()) {
            Toast.makeText(activity, "회사명 또는 홈페이지 주소 중 1개 이상을 입력해 주세요.", Toast.LENGTH_SHORT).show()
            return
        }
        if (!prefs.isPaired || userEmail.isNullOrBlank()) {
            Toast.makeText(activity, "시트봇 계정 연동 후 조사가 가능합니다.", Toast.LENGTH_SHORT).show()
            return
        }

        binding.pbResearchLoading.visibility = View.VISIBLE
        binding.tvResearchStatus.visibility = View.VISIBLE
        binding.tvResearchStatus.text = "🔍 국민연금·국세청·나라장터 실시간 분석 및 Google Docs 리서치 보고서 생성 중..."
        binding.btnStartCompanyResearch.isEnabled = false
        binding.layoutResearchResultContainer.visibility = View.GONE

        activity.lifecycleScope.launch {
            try {
                val result = ApiClient.requestCompanyResearch(companyName, domain, userEmail)
                binding.pbResearchLoading.visibility = View.GONE
                binding.tvResearchStatus.visibility = View.GONE
                binding.btnStartCompanyResearch.isEnabled = true

                if (result.success) {
                    binding.layoutResearchResultContainer.visibility = View.VISIBLE
                    binding.tvResultCompanyTitle.text = result.companyName
                    binding.tvResultTaxBadge.text = result.taxStatus
                    binding.tvResultMetrics.text = "고용: ${result.employeeCount} | 급여: ${result.avgSalary} | 계약: ${result.contractSummary}"
                    binding.tvResultAiSummary.text = result.summary

                    if (result.docUrl.isNotBlank()) {
                        binding.btnOpenResearchDoc.visibility = View.VISIBLE
                        binding.btnOpenResearchDoc.setOnClickListener {
                            try {
                                val intent = Intent(Intent.ACTION_VIEW, Uri.parse(result.docUrl))
                                activity.startActivity(intent)
                            } catch (e: Exception) {
                                Toast.makeText(activity, "문서 링크 열기 실패: ${e.message}", Toast.LENGTH_SHORT).show()
                            }
                        }
                    } else {
                        binding.btnOpenResearchDoc.visibility = View.GONE
                    }

                    if (result.sheetUrl.isNotBlank()) {
                        binding.btnOpenResearchSheet.visibility = View.VISIBLE
                        binding.btnOpenResearchSheet.setOnClickListener {
                            try {
                                val intent = Intent(Intent.ACTION_VIEW, Uri.parse(result.sheetUrl))
                                activity.startActivity(intent)
                            } catch (e: Exception) {
                                Toast.makeText(activity, "시트 열기 실패: ${e.message}", Toast.LENGTH_SHORT).show()
                            }
                        }
                    } else {
                        binding.btnOpenResearchSheet.visibility = View.GONE
                    }

                    Toast.makeText(activity, "🎉 ${result.companyName} 기업 리서치 보고서가 생성되었습니다!", Toast.LENGTH_LONG).show()
                } else {
                    Toast.makeText(activity, "기업 리서치 실패: ${result.error ?: "오류 발생"}", Toast.LENGTH_LONG).show()
                }
            } catch (e: Exception) {
                binding.pbResearchLoading.visibility = View.GONE
                binding.tvResearchStatus.visibility = View.GONE
                binding.btnStartCompanyResearch.isEnabled = true
                Toast.makeText(activity, "조사 중 오류: ${e.message}", Toast.LENGTH_LONG).show()
            }
        }
    }
}
