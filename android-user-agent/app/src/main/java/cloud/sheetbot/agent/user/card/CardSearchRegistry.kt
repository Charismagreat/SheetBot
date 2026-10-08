package cloud.sheetbot.agent.user.card

import cloud.sheetbot.agent.user.R

/**
 * 🔍 카드 자연어 · 초성 · 숫자번호 다중 검색 레지스트리
 *
 * 20종 카드의 번호(1~20), 한글 초성, 시나리오별 유의어(Synonyms) 사전을 보유하고
 * 0.001초 만에 최적의 카드를 찾아내는 초경량 검색 엔진입니다.
 */
object CardSearchRegistry {

    data class SearchableCard(
        val index: Int,
        val key: String,
        val title: String,
        val icon: String,
        val chosung: String,
        val keywords: List<String>,
        val cardResId: Int
    )

    // 한글 초성 추출용 자음 배열
    private val CHOSUNG_LIST = charArrayOf(
        'ㄱ', 'ㄲ', 'ㄴ', 'ㄷ', 'ㄸ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅃ', 'ㅅ',
        'ㅆ', 'ㅇ', 'ㅈ', 'ㅉ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'
    )

    /**
     * 임의의 한글 텍스트에서 초성만 추출하는 유니코드 계산 함수
     */
    fun extractChosung(text: String): String {
        val sb = StringBuilder()
        for (ch in text) {
            val code = ch.code
            if (code in 0xAC00..0xD7A3) {
                val chosungIndex = (code - 0xAC00) / (21 * 28)
                sb.append(CHOSUNG_LIST[chosungIndex])
            } else if (ch.isLetterOrDigit()) {
                sb.append(ch.lowercaseChar())
            }
        }
        return sb.toString()
    }

    // 20종 업무 카드의 상세 검색 메타데이터 사전
    val CARDS = listOf(
        SearchableCard(
            index = 1,
            key = "cardCallRecording",
            title = "통화 녹음 자동 분석",
            icon = "🎙️",
            chosung = "ㅌㅎㄴㅇㅈㄷㅂㅅ",
            keywords = listOf("통화", "녹음", "전화", "음성", "녹취", "콜", "stt", "요약", "드라이브백업", "통화내용"),
            cardResId = R.id.cardCallRecording
        ),
        SearchableCard(
            index = 2,
            key = "cardInCallSummary",
            title = "수신 통화 시 고객 요약 팝업",
            icon = "📞",
            chosung = "ㅅㅅㅌㅎㅅㄱㄱㅇㅇㅍㅇ",
            keywords = listOf("인콜", "수신", "팝업", "고객정보", "플로팅", "전화올때", "고객시트", "미리보기"),
            cardResId = R.id.cardInCallSummary
        ),
        SearchableCard(
            index = 3,
            key = "cardMissedCall",
            title = "부재중 전화 자동 답장",
            icon = "📞",
            chosung = "ㅂㅈㅇㅈㅎㅈㄷㄷㅈ",
            keywords = listOf("부재중", "부재", "답장", "자동답장", "문자회신", "놓친전화", "안받은전화"),
            cardResId = R.id.cardMissedCall
        ),
        SearchableCard(
            index = 4,
            key = "cardCallEnded",
            title = "통화 종료 후 명함 원터치 발송",
            icon = "🪪",
            chosung = "ㅌㅎㅈㄹㅎㅁㅎㅇㅌㅊㅂㅅ",
            keywords = listOf("명함", "명함발송", "통화종료", "전화끊고", "모바일명함", "소개"),
            cardResId = R.id.cardCallEnded
        ),
        SearchableCard(
            index = 5,
            key = "cardSmsSync",
            title = "스마트폰 문자 시트 동기화",
            icon = "💬",
            chosung = "ㅅㅁㅌㅍㅁㅈㅅㅌㄷㄱㅎ",
            keywords = listOf("문자", "sms", "lms", "문자내역", "문자기록", "시트기록", "고객문자"),
            cardResId = R.id.cardSmsSync
        ),
        SearchableCard(
            index = 6,
            key = "cardKakaoSync",
            title = "카카오톡 대화 자동 기록",
            icon = "🟡",
            chosung = "ㅋㅋㅇㅌㄷㅎㅈㄷㄱㄹ",
            keywords = listOf("카톡", "카카오톡", "채팅", "대화", "카톡시트", "주문방", "단톡방", "메시지"),
            cardResId = R.id.cardKakaoSync
        ),
        SearchableCard(
            index = 7,
            key = "cardPaymentReceipt",
            title = "매장 결제 확인 & 영수증 문자",
            icon = "🧾",
            chosung = "ㅁㅈㄱㅈㅎㅇㅇㅅㅈㅁㅈ",
            keywords = listOf("결제", "영수증", "매장결제", "카드결제", "입금확인", "영수증문자", "승인", "매출", "돈"),
            cardResId = R.id.cardPaymentReceipt
        ),
        SearchableCard(
            index = 8,
            key = "cardQuoteSync",
            title = "간편 주문 접수 기록",
            icon = "📑",
            chosung = "ㄱㅍㅈㅁㅈㅅㄱㄹ",
            keywords = listOf("주문", "단가표", "가격표", "메뉴판", "주문서", "웹앱", "상품목록", "주문접수"),
            cardResId = R.id.cardQuoteSync
        ),
        SearchableCard(
            index = 9,
            key = "cardEstimateSync",
            title = "간편 견적서 발행 대장",
            icon = "📑",
            chosung = "ㄱㅍㄱㅈㅅㅂㅎㄷㅈ",
            keywords = listOf("견적", "견적서", "공인견적", "전자견적", "단가대장", "견적발행", "승인요청"),
            cardResId = R.id.cardEstimateSync
        ),
        SearchableCard(
            index = 10,
            key = "cardFileUpload",
            title = "사진 & 문서 드라이브 보관",
            icon = "📁",
            chosung = "ㅅㅈㅁㅅㄷㄹㅇㅂㅂㄱ",
            keywords = listOf("사진", "문서", "파일", "드라이브", "업로드", "영수증사진", "명함사진", "백업"),
            cardResId = R.id.cardFileUpload
        ),
        SearchableCard(
            index = 11,
            key = "cardLinkScrap",
            title = "웹 링크 & 유튜브 요약 스크랩",
            icon = "🔗",
            chosung = "ㅇㄹㅋㅇㅌㅂㅇㅇㅅㅋㄹ",
            keywords = listOf("링크", "유튜브", "스크랩", "웹링크", "3줄요약", "기사", "동영상", "북마크"),
            cardResId = R.id.cardLinkScrap
        ),
        SearchableCard(
            index = 12,
            key = "cardMeetingRecording",
            title = "회의 녹음 자동 회의록",
            icon = "🎙️",
            chosung = "ㅎㅇㄴㅇㅈㄷㅎㅇㄹ",
            keywords = listOf("회의", "회의록", "녹음기", "보이스레코더", "화자분리", "회의내용", "미팅"),
            cardResId = R.id.cardMeetingRecording
        ),
        SearchableCard(
            index = 13,
            key = "cardLawAdvisory",
            title = "AI 법률/계약서 팩트체크",
            icon = "⚖️",
            chosung = "ㅂㄹㄱㅇㅅㅍㅌㅊㅋ",
            keywords = listOf("법률", "계약서", "내용증명", "소송", "법제처", "판례", "변호사", "자문", "노동청"),
            cardResId = R.id.cardLawAdvisory
        ),
        SearchableCard(
            index = 14,
            key = "cardBlog",
            title = "AI 네이버 블로그 자동 포스팅",
            icon = "✍️",
            chosung = "ㄴㅇㅂㅂㄹㄱㅈㄷㅍㅅㅌ",
            keywords = listOf("블로그", "네이버", "포스팅", "원고", "글쓰기", "마케팅", "홍보", "네이버블로그"),
            cardResId = R.id.cardBlog
        ),
        SearchableCard(
            index = 15,
            key = "cardInsta",
            title = "AI 인스타그램 피드 자동 발행",
            icon = "📸",
            chosung = "ㅇㅅㅌㄱㄹㅍㄷㅈㄷㅂㅎ",
            keywords = listOf("인스타", "인스타그램", "피드", "카드뉴스", "릴스", "sns", "사진게시"),
            cardResId = R.id.cardInsta
        ),
        SearchableCard(
            index = 16,
            key = "cardSite",
            title = "AI 모바일 홈페이지 제작",
            icon = "🌐",
            chosung = "ㅁㅂㅇㅎㅍㅇㅈㅈㅈ",
            keywords = listOf("홈페이지", "모바일홈", "사이트", "랜딩페이지", "회사소개", "웹사이트", "쇼핑몰"),
            cardResId = R.id.cardSite
        ),
        SearchableCard(
            index = 17,
            key = "cardCompanyResearch",
            title = "원클릭 기업 심층 리서치",
            icon = "🏢",
            chosung = "ㅇㅋㄹㄱㅇㅅㅊㄹㅅㅊ",
            keywords = listOf("기업", "리서치", "회사조사", "기업분석", "재무", "거래처", "신용", "대표자"),
            cardResId = R.id.cardCompanyResearch
        ),
        SearchableCard(
            index = 18,
            key = "cardWebsiteMonitor",
            title = "웹사이트 실시간 장애 감시",
            icon = "🚨",
            chosung = "ㅇㅅㅇㅌㅅㅅㄱㅈㅇㄱㅅ",
            keywords = listOf("모니터링", "장애", "서버다운", "다운타임", "점검", "사이트감시", "경보", "사이렌"),
            cardResId = R.id.cardWebsiteMonitor
        ),
        SearchableCard(
            index = 19,
            key = "cardContactsBackup",
            title = "스마트폰 연락처 백업",
            icon = "📇",
            chosung = "ㅅㅁㅌㅍㅇㄹㅊㅂㅇ",
            keywords = listOf("연락처", "전화번호", "주소록", "고객명단", "백업", "동기화", "폰번호"),
            cardResId = R.id.cardContactsBackup
        ),
        SearchableCard(
            index = 20,
            key = "cardUtility",
            title = "업데이트 확인 & 번인 방지",
            icon = "🔄",
            chosung = "ㅇㄷㅇㅌㅎㅇㅂㅇㅂㅈ",
            keywords = listOf("업데이트", "버전", "aod", "올웨이즈", "블랙모드", "번인", "최신버전"),
            cardResId = R.id.cardUtility
        )
    )

    /**
     * 다중 검색 엔진 (자연어, 한글 초성, 숫자 번호 매칭)
     */
    fun search(rawQuery: String): List<SearchableCard> {
        val query = rawQuery.trim().lowercase()
        if (query.isEmpty()) return CARDS

        // 1. 숫자 번호 검색 (예: "1", "7", "13")
        val number = query.toIntOrNull()
        if (number != null) {
            val matchedByNumber = CARDS.filter {
                it.index == number || it.index.toString().startsWith(query)
            }
            if (matchedByNumber.isNotEmpty()) return matchedByNumber
        }

        // 2. 한글 초성 검색 (예: "ㅌㅎ", "ㅂㅈㅇ", "ㄱㅈㅅ")
        val isChosungQuery = query.all { it in CHOSUNG_LIST }
        if (isChosungQuery) {
            val matchedByChosung = CARDS.filter {
                it.chosung.contains(query) || extractChosung(it.title).contains(query)
            }
            if (matchedByChosung.isNotEmpty()) return matchedByChosung
        }

        // 3. 자연어 및 키워드 / 유의어 검색
        val queryChosung = extractChosung(query)
        return CARDS.filter { card ->
            // 제목 일치
            card.title.lowercase().contains(query) ||
            // 유의어 키워드 일치
            card.keywords.any { keyword ->
                keyword.contains(query) || query.contains(keyword)
            } ||
            // 쿼리의 초성과 카드의 초성 매칭
            (queryChosung.isNotEmpty() && card.chosung.contains(queryChosung))
        }
    }
}
