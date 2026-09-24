package cloud.sheetbot.agent

import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * 주요 금융사 앱 푸시 알림 파싱 및 표준화 엔진
 */
object BankPushParser {
    // 감지 대상 금융 앱 패키지 및 대표 금융사명 매핑
    val SUPPORTED_BANK_PACKAGES = mapOf(
        "com.kakaobank.channel" to "카카오뱅크",
        "viva.republica.toss" to "토스",
        "com.kbstar.kbbank" to "KB국민은행",
        "com.kbstar.starpush" to "KB국민은행",
        "com.shinhan.sbanking" to "신한은행",
        "com.shinhan.smartcaremgr" to "신한은행",
        "com.wooribank.smart.npib" to "우리은행",
        "com.wooribank.pib.smart" to "우리은행",
        "com.hanabank.ebk.channel.android.hananbank" to "하나은행",
        "com.ibk.neobanking" to "IBK기업은행",
        "nh.smart.banking" to "NH농협은행",
        "com.kbankwith.smartbank" to "케이뱅크"
    )

    // 출금/지출 알림 명확한 제외 키워드
    private val EXCLUDE_KEYWORDS = listOf(
        "출금", "결제", "체크승인", "체크 승인", "카드승인", "카드 승인", "이체완료", "이체 완료",
        "송금완료", "송금 완료", "자동이체", "출금알림", "승인취소"
    )

    // 입금 감지 키워드
    private val DEPOSIT_KEYWORDS = listOf(
        "입금", "보냈어요", "받았어요", "송금받음", "입금알림", "입금확인", "충전완료"
    )

    /**
     * 지원되는 금융사 앱 패키지인지 확인
     */
    fun isSupportedBank(packageName: String): Boolean {
        return SUPPORTED_BANK_PACKAGES.containsKey(packageName)
    }

    /**
     * 푸시 알림 내용이 유효한 입금 내역인지 판별
     */
    fun isDepositNotification(title: String?, text: String?): Boolean {
        val combined = "${title ?: ""} ${text ?: ""}".trim()
        if (combined.isBlank()) return false

        // 1. 출금/지출 키워드가 포함되어 있으면 즉시 배제
        if (EXCLUDE_KEYWORDS.any { combined.contains(it) }) {
            return false
        }

        // 2. 입금 키워드가 포함되어 있는지 확인
        val hasDepositKeyword = DEPOSIT_KEYWORDS.any { combined.contains(it) }
        val hasAmount = Regex("[0-9,]{3,}\\s*원").containsMatchIn(combined)

        return hasDepositKeyword && hasAmount
    }

    /**
     * 금융사 푸시 알림을 서버 웹훅에서 100% 매칭 가능한 표준 SMS 텍스트로 변환
     */
    fun convertToSimulatedSms(packageName: String, title: String?, text: String?): String {
        val bankName = SUPPORTED_BANK_PACKAGES[packageName] ?: (title ?: "은행")
        val content = text ?: ""
        val now = SimpleDateFormat("MM/dd HH:mm", Locale.KOREA).format(Date())

        // 1. 금액 추출 (예: 5,000원 -> 5,000원)
        val amountMatch = Regex("([0-9,]{3,})\\s*원").find(content)
        val amountStr = amountMatch?.groupValues?.get(1) ?: "0"

        // 2. 입금자명 추출 시도
        // 패턴 A: "홍길동님이 ... 보냈어요"
        // 패턴 B: "입금 5,000원 홍길동"
        // 패턴 C: "[입금] 5,000원 홍길동"
        var depositorName = ""
        val tossMatch = Regex("([가-힣a-zA-Z0-9]{2,10})님(?:이|께서)").find(content)
        if (tossMatch != null) {
            depositorName = tossMatch.groupValues[1]
        } else {
            val normalMatch = Regex("(?:입금|받음)\\s*[0-9,]+\\s*원?\\s+([가-힣a-zA-Z0-9]{2,10})").find(content)
            if (normalMatch != null) {
                depositorName = normalMatch.groupValues[1]
            }
        }

        // 서버 bank-webhook 파서가 이해하기 가장 좋은 표준 양식으로 조합
        return buildString {
            appendLine("[Web발신]")
            appendLine("[$bankName] 입금알림")
            appendLine("$now 입금 ${amountStr}원")
            if (depositorName.isNotBlank()) {
                appendLine(depositorName)
            } else {
                appendLine(content.take(30))
            }
            appendLine("잔액 99,999,999원")
        }
    }
}
