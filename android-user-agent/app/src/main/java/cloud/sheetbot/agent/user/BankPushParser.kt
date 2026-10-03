package cloud.sheetbot.agent.user

import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * 주요 금융사(은행 및 카드사) 앱 푸시 알림 파싱 및 표준화 엔진
 */
object BankPushParser {
    // 감지 대상 금융 및 카드사 앱 패키지 매핑
    val SUPPORTED_BANK_PACKAGES = mapOf(
        // 인터넷 및 시중은행
        "com.kakaobank.channel" to "카카오뱅크",
        "com.kakaopay.app" to "카카오페이",
        "viva.republica.toss" to "토스",
        "com.kbankwith.smartbank" to "케이뱅크",
        "com.kbstar.kbbank" to "KB국민은행",
        "com.kbstar.starpush" to "KB국민은행",
        "com.shinhan.sbanking" to "신한은행",
        "com.shinhan.smartcaremgr" to "신한은행",
        "com.wooribank.smart.npib" to "우리은행",
        "com.wooribank.pib.smart" to "우리은행",
        "com.hanabank.ebk.channel.android.hananbank" to "하나은행",
        "com.ibk.neobanking" to "IBK기업은행",
        "nh.smart.banking" to "NH농협은행",
        "com.sc.standardcharteredbank" to "SC제일은행",
        "com.epost.psns.ui" to "우체국",
        "kr.go.epost.smart" to "우체국",
        "kr.co.kfcc.mobilebank" to "새마을금고",
        "com.smg.spbs" to "새마을금고",
        "kr.co.cu.smartbank" to "신협",

        // 주요 신용/체크 카드사
        "com.kbcard.cxh.appcard" to "KB국민카드",
        "com.kbcard.kbkookmincard" to "KB국민카드",
        "com.shcard.smartpay" to "신한카드",
        "com.shinhan.smartcards" to "신한카드",
        "com.hyundaicard.appcard" to "현대카드",
        "kr.co.samsungcard.mpocket" to "삼성카드",
        "com.lotte.lottesmartpay" to "롯데카드",
        "com.bccard.mobilecard" to "BC카드",
        "com.hanaskcard.paycla" to "하나카드",
        "kr.co.bccard.wooricard" to "우리카드",
        "nh.smart.nhallonepay" to "NH농협카드",

        // 매장 POS 및 배달앱
        "com.payhere.pos" to "페이히어",
        "team.freeapp.pos" to "토스플레이스",
        "com.woowahan.baemin" to "배민사장님",
        "com.kicc.pos" to "이지포스"
    )

    // 스팸/광고/대출 등 무관한 푸시 제외 키워드
    private val SPAM_EXCLUDE_KEYWORDS = listOf(
        "광고", "대출", "금리인하", "한도조회", "이벤트", "마케팅동의", "인증번호"
    )

    // 입금 감지 키워드
    private val DEPOSIT_KEYWORDS = listOf(
        "입금", "보냈어요", "받았어요", "송금받음", "송금받았어요", "입금알림", "입금확인", "충전완료", "머니충전", "페이머니 충전"
    )

    // 출금 및 카드 결제 승인 감지 키워드
    private val WITHDRAW_KEYWORDS = listOf(
        "출금", "결제", "체크승인", "체크 승인", "카드승인", "카드 승인", "승인", "출금완료",
        "이체완료", "송금완료", "송금", "보냈어요", "일시불", "간편결제", "매장결제", "온라인결제", "페이머니 결제"
    )

    /**
     * 지원되는 금융사 앱 패키지인지 확인
     */
    fun isSupportedBank(packageName: String): Boolean {
        return SUPPORTED_BANK_PACKAGES.containsKey(packageName)
    }

    /**
     * 푸시 알림 내용이 유효한 금융(입금 또는 출금/결제) 내역인지 판별
     * - BankNotificationListener와의 완벽한 하위 호환성 유지
     */
    fun isDepositNotification(title: String?, text: String?): Boolean {
        return isFinancialNotification(title, text)
    }

    fun isFinancialNotification(title: String?, text: String?): Boolean {
        val combined = "${title ?: ""} ${text ?: ""}".trim()
        if (combined.isBlank()) return false

        // 1. 거래와 무관한 단순 광고/대출안내 즉시 배제
        if (SPAM_EXCLUDE_KEYWORDS.any { combined.contains(it) }) {
            return false
        }

        // 2. 금액 패턴 확인 (예: 1,000원 이상)
        val hasAmount = Regex("[0-9,]{3,}\\s*원").containsMatchIn(combined)
        if (!hasAmount) return false

        // 3. 입금 또는 출금/결제 키워드 포함 여부 확인
        val hasDeposit = DEPOSIT_KEYWORDS.any { combined.contains(it) }
        val hasWithdraw = WITHDRAW_KEYWORDS.any { combined.contains(it) }

        return hasDeposit || hasWithdraw
    }

    /**
     * 금융사 푸시 알림을 서버 웹훅에서 100% 매칭 가능한 표준 텍스트로 변환
     */
    fun convertToSimulatedSms(packageName: String, title: String?, text: String?): String {
        val bankName = SUPPORTED_BANK_PACKAGES[packageName] ?: (title?.takeIf { it.isNotBlank() } ?: "금융사")
        val combined = "${title ?: ""} ${text ?: ""}".trim()
        val now = SimpleDateFormat("MM/dd HH:mm", Locale.KOREA).format(Date())

        // 1. 거래 구분 판별 (POS 매장 매출인지, 은행 출금/카드 지출인지, 계좌 입금인지)
        val isPosApp = packageName in listOf("com.payhere.pos", "team.freeapp.pos", "com.woowahan.baemin", "com.kicc.pos")
        val isWithdraw = !isPosApp && WITHDRAW_KEYWORDS.any { combined.contains(it) } && (!combined.contains("입금") && !combined.contains("받았어요") && !combined.contains("송금받"))
        val actionType = if (isPosApp) "결제" else (if (isWithdraw) "출금" else "입금")

        // 2. 금액 추출 (예: 5,000원 -> 5,000원) - 제목이나 본문 어디서든 추출
        val amountMatch = Regex("([0-9,]{3,})\\s*원").find(combined)
        val amountStr = amountMatch?.groupValues?.get(1) ?: "0"

        // 3. 입금자/가맹점명 추출 시도
        var partyName = ""
        val tossMatch = Regex("([가-힣a-zA-Z0-9]{2,10})님(?:이|께서)").find(combined)
        val kakaoTransferMatch = Regex("([가-힣a-zA-Z0-9]{2,10})님에게\\s*(?:송금|보냈어요)").find(combined)
        if (tossMatch != null) {
            partyName = tossMatch.groupValues[1]
        } else if (kakaoTransferMatch != null) {
            partyName = kakaoTransferMatch.groupValues[1]
        } else {
            val parenMatch = Regex("\\(([가-힣a-zA-Z0-9]{2,10})\\)").find(combined)
            if (parenMatch != null && !parenMatch.groupValues[1].contains("잔액")) {
                partyName = parenMatch.groupValues[1]
            } else {
                val normalMatch = Regex("(?:입금|출금|승인|결제|송금|받음)\\s*[0-9,]+\\s*원?\\s+([가-힣a-zA-Z0-9]{2,10})").find(combined)
                if (normalMatch != null) {
                    partyName = normalMatch.groupValues[1]
                }
            }
        }

        // 서버 bank-sms-parser가 100% 매칭 가능한 표준 양식으로 조합
        return buildString {
            appendLine("[Web발신]")
            appendLine("[$bankName] ${actionType}알림")
            appendLine("$now $actionType ${amountStr}원")
            if (partyName.isNotBlank()) {
                appendLine(partyName)
            } else {
                appendLine((text ?: title ?: "").take(30))
            }
            appendLine("잔액 99,999,999원")
        }
    }
}
