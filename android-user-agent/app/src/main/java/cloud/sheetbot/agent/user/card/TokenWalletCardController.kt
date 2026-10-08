package cloud.sheetbot.agent.user.card

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.net.Uri
import android.view.View
import android.widget.Button
import android.widget.EditText
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import cloud.sheetbot.agent.user.ApiClient
import cloud.sheetbot.agent.user.AppPreferences
import cloud.sheetbot.agent.user.R
import cloud.sheetbot.agent.user.databinding.ActivityMainBinding
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/**
 * 🪙 AI 토큰 지갑 및 추천인 리워드 카드 제어 컨트롤러
 *
 * - AI 토큰 잔액 실시간 조회 및 자동 갱신
 * - 스타터/스탠다드/프로 무통장 즉시 충전 모달 (토스 딥링크 송금 및 계좌번호 복사)
 * - 친구 초대 다이얼로그 (내 추천인 코드 복사 및 카카오톡/문자 공유)
 * - 추천인 코드 등록 다이얼로그 (양방향 30토큰 보너스 즉시 적립)
 * - AI 토큰 안내 아코디언 상세 접기/펼치기
 * - 카드 펼침/접힘 상태 관리
 */
class TokenWalletCardController(
    private val activity: AppCompatActivity,
    private val binding: ActivityMainBinding,
    private val prefs: AppPreferences,
    private val scope: CoroutineScope,
    private val updateCardCollapseState: (layout: View, button: View, isHidden: Boolean) -> Unit
) {

    fun setup() {
        // AI 토큰 안내 상세 접기/펼치기 및 확인 버튼 (v2.0.5)
        updateTokenNoticeVisibility(prefs.isTokenNoticeDismissed)
        binding.btnConfirmTokenNotice.setOnClickListener {
            prefs.isTokenNoticeDismissed = true
            updateTokenNoticeVisibility(true)
            Toast.makeText(activity, "토큰 안내가 접혔습니다. 언제든 '자세히 보기'를 누르면 다시 확인하실 수 있습니다.", Toast.LENGTH_SHORT).show()
        }
        binding.btnToggleTokenNotice.setOnClickListener {
            val nextState = !prefs.isTokenNoticeDismissed
            prefs.isTokenNoticeDismissed = nextState
            updateTokenNoticeVisibility(nextState)
        }

        // 토큰 지갑 새로고침 및 즉시 충전 버튼 (v1.9.0)
        binding.btnRefreshWallet.setOnClickListener {
            val email = prefs.userEmail
            if (!email.isNullOrBlank()) {
                loadWalletBalance(email, isManualRefresh = true)
            }
        }
        binding.btnRechargeToken.setOnClickListener {
            showRechargeDialog()
        }

        // 친구 초대 및 추천인 코드 등록 버튼 (v2.0.0)
        binding.btnInviteFriend.setOnClickListener {
            showReferralInviteDialog()
        }
        binding.btnEnterReferralCode.setOnClickListener {
            showReferralClaimDialog()
        }
    }

    fun updateTokenNoticeVisibility(dismissed: Boolean) {
        binding.layoutTokenNoticeDetails.visibility = if (dismissed) View.GONE else View.VISIBLE
        binding.btnToggleTokenNotice.text = if (dismissed) "자세히 보기" else "접기"
    }

    fun refreshCollapseState() {
        updateCardCollapseState(
            binding.layoutWalletDetails,
            binding.btnToggleWalletDetails,
            prefs.isWalletDetailsHidden
        )
    }

    fun toggleCollapse() {
        prefs.isWalletDetailsHidden = !prefs.isWalletDetailsHidden
        refreshCollapseState()
    }

    fun loadWalletBalance(userEmail: String, isManualRefresh: Boolean = false) {
        // 로컬 캐시 잔액이 있으면 네트워크 지연 없이 0초 만에 즉시 표시 (0원 노출 방지)
        if (prefs.lastBalanceTokens >= 0L) {
            binding.tvWalletBalance.text = NumberFormat.getNumberInstance().format(prefs.lastBalanceTokens)
            binding.tvWalletTier.text = prefs.lastTier
        }
        if (isManualRefresh) {
            binding.tvWalletBalance.text = "..."
        }
        scope.launch {
            val result = ApiClient.fetchWalletBalance(userEmail)
            if (result.success) {
                prefs.lastBalanceTokens = result.balanceTokens
                prefs.lastTier = result.tier

                val formattedBalance = NumberFormat.getNumberInstance().format(result.balanceTokens)
                binding.tvWalletBalance.text = formattedBalance
                binding.tvWalletTier.text = result.tier
                if (isManualRefresh) {
                    Toast.makeText(activity, "토큰 잔액이 갱신되었습니다.", Toast.LENGTH_SHORT).show()
                }
            } else {
                if (isManualRefresh) {
                    Toast.makeText(activity, "잔액 조회 실패: ${result.error}", Toast.LENGTH_SHORT).show()
                }
            }
        }
    }

    /**
     * 📋 스마트 통합 할 일 허브 실시간 미완료 과업 뱃지 갱신 (옵션 B)
     */

    fun showRechargeDialog() {
        val email = prefs.userEmail
        if (email.isNullOrBlank()) {
            Toast.makeText(activity, "먼저 시트봇 계정을 연동해 주세요.", Toast.LENGTH_SHORT).show()
            return
        }

        val dialogView = activity.layoutInflater.inflate(R.layout.dialog_recharge_token, null)
        val dialog = AlertDialog.Builder(activity)
            .setView(dialogView)
            .create()

        var selectedPkgId = "pkg_standard"

        val btnStarter = dialogView.findViewById<Button>(R.id.btnPkgStarter)
        val btnStandard = dialogView.findViewById<Button>(R.id.btnPkgStandard)
        val btnPro = dialogView.findViewById<Button>(R.id.btnPkgPro)
        val etDepositorName = dialogView.findViewById<EditText>(R.id.etDepositorName)
        val btnRequestDeposit = dialogView.findViewById<Button>(R.id.btnRequestDeposit)

        val layoutResult = dialogView.findViewById<View>(R.id.layoutDepositResult)
        val tvFinalAmount = dialogView.findViewById<TextView>(R.id.tvFinalAmount)
        val tvAccountInfo = dialogView.findViewById<TextView>(R.id.tvAccountInfo)
        val btnOpenToss = dialogView.findViewById<Button>(R.id.btnOpenToss)
        val btnCopyAccount = dialogView.findViewById<Button>(R.id.btnCopyAccount)
        val btnClose = dialogView.findViewById<Button>(R.id.btnCloseDialog)

        // 초기 송금자명 세팅 (이메일 앞자리)
        val defaultName = email.substringBefore("@")
        etDepositorName.setText(defaultName)

        fun updatePkgSelection(pkgId: String) {
            selectedPkgId = pkgId
            val activeColor = ColorStateList.valueOf(Color.parseColor("#4338CA"))
            val inactiveColor = ColorStateList.valueOf(Color.parseColor("#1E293B"))
            btnStarter.backgroundTintList = if (pkgId == "pkg_starter") activeColor else inactiveColor
            btnStandard.backgroundTintList = if (pkgId == "pkg_standard") activeColor else inactiveColor
            btnPro.backgroundTintList = if (pkgId == "pkg_pro") activeColor else inactiveColor
        }

        btnStarter.setOnClickListener { updatePkgSelection("pkg_starter") }
        btnStandard.setOnClickListener { updatePkgSelection("pkg_standard") }
        btnPro.setOnClickListener { updatePkgSelection("pkg_pro") }

        var currentTossUrl = ""
        var currentAccountFull = ""

        btnRequestDeposit.setOnClickListener {
            val depositorName = etDepositorName.text.toString().trim()
            if (depositorName.length < 2) {
                Toast.makeText(activity, "송금자 실명을 2글자 이상 입력해 주세요.", Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }

            btnRequestDeposit.isEnabled = false
            btnRequestDeposit.text = "계좌 발급 중..."

            scope.launch {
                val res = ApiClient.requestDirectDeposit(
                    userEmail = email,
                    userName = depositorName,
                    packageId = selectedPkgId,
                    depositorName = depositorName
                )

                btnRequestDeposit.isEnabled = true
                btnRequestDeposit.text = "🚀 계좌 발급 & 토스 1초 송금 준비"

                if (res.success) {
                    layoutResult.visibility = View.VISIBLE
                    val formattedPrice = NumberFormat.getNumberInstance().format(res.amountKrw)
                    val discountMsg = if (res.discountKrw > 0) " (${res.discountKrw}원 즉시 할인)" else ""
                    tvFinalAmount.text = "최종 입금액: ${formattedPrice}원${discountMsg}"
                    currentAccountFull = "${res.bankName} ${res.accountNumber} (${res.accountHolder})"
                    tvAccountInfo.text = currentAccountFull
                    currentTossUrl = res.tossUrl

                    if (currentTossUrl.isNotBlank()) {
                        btnOpenToss.visibility = View.VISIBLE
                    } else {
                        btnOpenToss.visibility = View.GONE
                    }
                    Toast.makeText(activity, "입금 계좌가 발급되었습니다. 토스로 송금해 주세요.", Toast.LENGTH_SHORT).show()
                } else {
                    Toast.makeText(activity, "계좌 발급 실패: ${res.error}", Toast.LENGTH_LONG).show()
                }
            }
        }

        btnOpenToss.setOnClickListener {
            if (currentTossUrl.isNotBlank()) {
                try {
                    val tossIntent = Intent(Intent.ACTION_VIEW, Uri.parse(currentTossUrl))
                    startActivity(tossIntent)
                } catch (e: Exception) {
                    Toast.makeText(activity, "토스 앱을 열 수 없어 웹 브라우저로 연결합니다.", Toast.LENGTH_SHORT).show()
                    try {
                        val webIntent = Intent(Intent.ACTION_VIEW, Uri.parse(currentTossUrl))
                        startActivity(webIntent)
                    } catch (_: Exception) {}
                }
            }
        }

        btnCopyAccount.setOnClickListener {
            if (currentAccountFull.isNotBlank()) {
                val clipboard = activity.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
                val clip = ClipData.newPlainText("SheetBot 입금 계좌", currentAccountFull)
                clipboard.setPrimaryClip(clip)
                Toast.makeText(activity, "계좌 정보가 복사되었습니다.", Toast.LENGTH_SHORT).show()
            }
        }

        btnClose.setOnClickListener {
            dialog.dismiss()
            // 닫을 때 최신 잔액 다시 확인
            loadWalletBalance(email)
        }

        dialog.show()
    }

    /**
     * 친구/동료 초대 다이얼로그 (v2.0.0)
     * 내 추천 코드 확인 및 카카오톡/문자 원터치 공유 지원
     */
    fun showReferralInviteDialog() {
        val email = prefs.userEmail
        if (email.isNullOrBlank()) {
            Toast.makeText(activity, "먼저 시트봇 계정을 연동해 주세요.", Toast.LENGTH_SHORT).show()
            return
        }

        val dialogView = activity.layoutInflater.inflate(R.layout.dialog_referral_invite, null)
        val dialog = AlertDialog.Builder(activity)
            .setView(dialogView)
            .create()

        val tvMyCode = dialogView.findViewById<TextView>(R.id.tvDialogMyCode)
        val btnCopyCode = dialogView.findViewById<Button>(R.id.btnCopyMyCode)
        val btnShare = dialogView.findViewById<Button>(R.id.btnShareInvite)
        val tvStats = dialogView.findViewById<TextView>(R.id.tvReferralStats)
        val btnClose = dialogView.findViewById<Button>(R.id.btnCloseInviteDialog)

        var sharePayload = ""
        var myCodeText = ""

        scope.launch {
            val info = ApiClient.fetchReferralInfo(email)
            if (info.success) {
                myCodeText = info.myCode
                tvMyCode.text = myCodeText
                sharePayload = info.shareText
                val count = info.inviteCount
                val earned = NumberFormat.getNumberInstance().format(info.earnedTokens.toLong())
                tvStats.text = "현재 ${count}명 초대 완료 (누적 ${earned} 토큰 획득 🎉)"
            } else {
                tvMyCode.text = email.substringBefore("@").uppercase()
                myCodeText = tvMyCode.text.toString()
                tvStats.text = "추천 정보를 불러오는 중입니다..."
            }
        }

        btnCopyCode.setOnClickListener {
            if (myCodeText.isNotBlank()) {
                val clipboard = activity.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
                val clip = ClipData.newPlainText("SheetBot 추천 코드", myCodeText)
                clipboard.setPrimaryClip(clip)
                Toast.makeText(activity, "추천인 코드(${myCodeText})가 복사되었습니다.", Toast.LENGTH_SHORT).show()
            }
        }

        btnShare.setOnClickListener {
            val textToSend = if (sharePayload.isNotBlank()) sharePayload else {
                "🚀 Google 스프레드시트 1초 AI 자동화 [SheetBot]\n" +
                "초대 링크로 앱을 설치하시면 가입 즉시 10,000 보너스 토큰이 선물됩니다 🎁\n\n" +
                "• 추천인 코드: $myCodeText\n" +
                "• 다운로드: https://sheetbot.cloud/downloads/SheetBotAgent.apk"
            }
            val sendIntent = Intent().apply {
                action = Intent.ACTION_SEND
                putExtra(Intent.EXTRA_TEXT, textToSend)
                type = "text/plain"
            }
            startActivity(Intent.createChooser(sendIntent, "친구/동료에게 시트봇 초대장 보내기"))
        }

        btnClose.setOnClickListener {
            dialog.dismiss()
        }

        dialog.show()
    }

    /**
     * 추천인 코드 등록 다이얼로그 (v2.0.0)
     * 코드 등록 시 양측 지갑에 10,000 토큰 즉시 적립
     */
    fun showReferralClaimDialog() {
        val email = prefs.userEmail
        if (email.isNullOrBlank()) {
            Toast.makeText(activity, "먼저 시트봇 계정을 연동해 주세요.", Toast.LENGTH_SHORT).show()
            return
        }

        val dialogView = activity.layoutInflater.inflate(R.layout.dialog_referral_claim, null)
        val dialog = AlertDialog.Builder(activity)
            .setView(dialogView)
            .create()

        val etCode = dialogView.findViewById<EditText>(R.id.etReferralCodeInput)
        val btnSubmit = dialogView.findViewById<Button>(R.id.btnSubmitReferralCode)
        val btnClose = dialogView.findViewById<Button>(R.id.btnCloseClaimDialog)

        btnSubmit.setOnClickListener {
            val code = etCode.text.toString().trim()
            if (code.length < 2) {
                Toast.makeText(activity, "추천인 코드 또는 이메일을 입력해 주세요.", Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }

            btnSubmit.isEnabled = false
            btnSubmit.text = "보너스 수령 확인 중..."

            scope.launch {
                val res = ApiClient.claimReferralReward(email, code)
                btnSubmit.isEnabled = true
                btnSubmit.text = "🎉 10,000 토큰 즉시 수령하기"

                if (res.success) {
                    dialog.dismiss()
                    AlertDialog.Builder(activity)
                        .setTitle("🎉 10,000 토큰 지급 완료!")
                        .setMessage(res.message)
                        .setPositiveButton("확인", null)
                        .show()
                    loadWalletBalance(email)
                } else {
                    Toast.makeText(activity, res.message.ifBlank { "등록 실패: ${res.error}" }, Toast.LENGTH_LONG).show()
                }
            }
        }

        btnClose.setOnClickListener {
            dialog.dismiss()
        }

        dialog.show()
    }



}
