package cloud.sheetbot.agent.user

import android.annotation.SuppressLint
import android.content.Context
import android.content.Intent
import android.graphics.PixelFormat
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import android.util.Log
import android.view.Gravity
import android.view.LayoutInflater
import android.view.MotionEvent
import android.view.View
import android.view.WindowManager
import android.widget.ProgressBar
import android.widget.TextView
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONObject

/**
 * 수신/발신 전화 시 화면 최상단에 파투(FileToSheet) 전 시트 & 구글 시트 고객 요약 카드를 플로팅 위젯으로 표출하는 매니저
 * - 다른 앱 위에 표시 (SYSTEM_ALERT_WINDOW) 활용
 * - 단말기 주소록 + 로컬 캐시 0.01초 즉각 표출
 * - 파투(FileToSheet) 내 모든 프로젝트·시트(통화녹음대장, 통합할일대장, 명함관리, 문자/카톡/이메일/일반시트) 실시간 통합 브리핑
 * - 터치 드래그 위치 이동, 접기/펼치기, 파투 시트 내역 원터치 열기 지원
 */
object InCallOverlayManager {
    private const val TAG = "InCallOverlayManager"

    @Volatile
    private var overlayView: View? = null
    @Volatile
    private var currentPhone: String? = null
    private var windowManager: WindowManager? = null
    private var fetchJob: Job? = null
    private val mainHandler = Handler(Looper.getMainLooper())

    /**
     * 다른 앱 위에 표시 권한 허용 여부 확인
     */
    fun canDrawOverlays(context: Context): Boolean {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            Settings.canDrawOverlays(context)
        } else {
            true
        }
    }

    /**
     * 현재 인콜 오버레이가 표시 중인지 확인
     */
    fun isShowing(): Boolean = overlayView != null

    /**
     * 인콜 플로팅 요약 카드 표출
     */
    @SuppressLint("ClickableViewAccessibility")
    fun show(context: Context, phoneNumber: String, previewMode: Boolean = false) {
        val prefs = PreferencesManager(context)
        if (!previewMode && !prefs.isInCallSummaryEnabled) {
            Log.d(TAG, "인콜 시트 요약 기능이 설정에서 비활성화되어 있습니다.")
            return
        }

        if (!canDrawOverlays(context)) {
            Log.w(TAG, "다른 앱 위에 그리기(SYSTEM_ALERT_WINDOW) 권한이 없어 인콜 카드를 띄울 수 없습니다.")
            return
        }

        val cleanPhone = phoneNumber.replace(Regex("[^0-9+]"), "").trim()
        if (cleanPhone.isBlank()) return

        mainHandler.post {
            try {
                // 이미 동일 번호로 띄워져 있다면 유지 (단, 미리보기 모드는 재실행 허용)
                if (!previewMode && overlayView != null && currentPhone == cleanPhone) {
                    return@post
                }

                // 기존 뷰 정리
                dismiss(context)

                val wm = context.getSystemService(Context.WINDOW_SERVICE) as? WindowManager ?: return@post
                windowManager = wm
                currentPhone = cleanPhone

                val displayMetrics = context.resources.displayMetrics
                val cardWidth = (displayMetrics.widthPixels * 0.94).toInt()

                val layoutType = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
                } else {
                    @Suppress("DEPRECATION")
                    WindowManager.LayoutParams.TYPE_PHONE
                }

                val flags = (WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE
                        or WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN
                        or WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED
                        or WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON
                        or WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)

                val params = WindowManager.LayoutParams(
                    cardWidth,
                    WindowManager.LayoutParams.WRAP_CONTENT,
                    layoutType,
                    flags,
                    PixelFormat.TRANSLUCENT
                ).apply {
                    gravity = Gravity.TOP or Gravity.CENTER_HORIZONTAL
                    x = 0
                    y = (105 * displayMetrics.density).toInt() // 상단 105dp 위치
                }

                val inflater = LayoutInflater.from(context)
                val view = inflater.inflate(R.layout.view_in_call_summary_card, null)
                overlayView = view

                // 뷰 컴포넌트 바인딩
                val llHeaderBar = view.findViewById<View>(R.id.llHeaderBar)
                val tvHeaderTitle = view.findViewById<TextView>(R.id.tvHeaderTitle)
                val tvCustomerName = view.findViewById<TextView>(R.id.tvCustomerName)
                val tvCustomerBadge = view.findViewById<TextView>(R.id.tvCustomerBadge)
                val tvCustomerCompany = view.findViewById<TextView>(R.id.tvCustomerCompany)
                val tvCallerPhone = view.findViewById<TextView>(R.id.tvCallerPhone)
                val pbLoading = view.findViewById<ProgressBar>(R.id.pbLoading)
                val llDetailContainer = view.findViewById<View>(R.id.llDetailContainer)
                val btnToggleExpand = view.findViewById<TextView>(R.id.btnToggleExpand)
                val btnCloseFloating = view.findViewById<TextView>(R.id.btnCloseFloating)
                val tvLastCallTime = view.findViewById<TextView>(R.id.tvLastCallTime)
                val tvLastCallSummary = view.findViewById<TextView>(R.id.tvLastCallSummary)
                val tvActionItems = view.findViewById<TextView>(R.id.tvActionItems)
                val tvCustomerMemo = view.findViewById<TextView>(R.id.tvCustomerMemo)
                val btnOpenFtsFromOverlay = view.findViewById<TextView>(R.id.btnOpenFtsFromOverlay)

                val formattedPhone = ContactHelper.formatPhoneNumber(phoneNumber)
                tvCallerPhone.text = formattedPhone

                // 단말기 연락처 이름 0ms 즉시 조회
                val deviceContactName = if (!previewMode) {
                    ContactHelper.getContactName(context, cleanPhone)
                } else null

                if (!deviceContactName.isNullOrBlank()) {
                    tvCustomerName.text = deviceContactName
                    tvCustomerCompany.text = "파투·시트 대장 통합 스캔 중..."
                }

                // 1. 접기/펼치기 초기 상태 적용
                var isExpanded = prefs.isInCallSummaryExpanded
                val updateExpandState = {
                    llDetailContainer.visibility = if (isExpanded) View.VISIBLE else View.GONE
                    btnToggleExpand.text = if (isExpanded) "▲" else "▼"
                    prefs.isInCallSummaryExpanded = isExpanded
                }
                updateExpandState()

                btnToggleExpand.setOnClickListener {
                    isExpanded = !isExpanded
                    updateExpandState()
                }

                // 2. 닫기 버튼
                btnCloseFloating.setOnClickListener {
                    dismiss(context)
                }

                // 2-B. 파투 시트 전체 내역 열기 버튼
                btnOpenFtsFromOverlay?.setOnClickListener {
                    val targetQuery = currentPhone?.let { ContactHelper.formatPhoneNumber(it) } ?: formattedPhone
                    val ftsPhone = prefs.ftsPhoneNumber?.takeIf { it.isNotBlank() } ?: prefs.devicePhoneNumber ?: ""
                    val intent = Intent(context, FtsSheetViewerActivity::class.java).apply {
                        putExtra(FtsSheetViewerActivity.EXTRA_PHONE, ftsPhone)
                        putExtra(FtsSheetViewerActivity.EXTRA_PROJECT_ID, prefs.ftsProjectId ?: "")
                        putExtra(FtsSheetViewerActivity.EXTRA_INITIAL_SEARCH_QUERY, targetQuery)
                        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
                    }
                    try {
                        context.startActivity(intent)
                        dismiss(context)
                    } catch (e: Exception) {
                        Log.e(TAG, "인콜 오버레이에서 파투 뷰어 실행 실패", e)
                    }
                }

                // 3. 헤더 터치 드래그 위치 이동
                var initialX = 0
                var initialY = 0
                var initialTouchX = 0f
                var initialTouchY = 0f

                llHeaderBar.setOnTouchListener { _, event ->
                    when (event.action) {
                        MotionEvent.ACTION_DOWN -> {
                            initialX = params.x
                            initialY = params.y
                            initialTouchX = event.rawX
                            initialTouchY = event.rawY
                            true
                        }
                        MotionEvent.ACTION_MOVE -> {
                            params.x = initialX + (event.rawX - initialTouchX).toInt()
                            params.y = initialY + (event.rawY - initialTouchY).toInt()
                            try {
                                wm.updateViewLayout(view, params)
                            } catch (_: Exception) {}
                            true
                        }
                        else -> false
                    }
                }

                // 4. 로컬 캐시 확인 및 0.01초 즉시 렌더링
                val cachedJsonStr = if (!previewMode) prefs.getCallSummaryCache(cleanPhone) else null
                if (!cachedJsonStr.isNullOrBlank()) {
                    try {
                        val json = JSONObject(cachedJsonStr)
                        renderSummaryData(
                            json = json,
                            tvCustomerName = tvCustomerName,
                            tvCustomerBadge = tvCustomerBadge,
                            tvCustomerCompany = tvCustomerCompany,
                            tvLastCallTime = tvLastCallTime,
                            tvLastCallSummary = tvLastCallSummary,
                            tvActionItems = tvActionItems,
                            tvCustomerMemo = tvCustomerMemo
                        )
                    } catch (_: Exception) {}
                } else if (previewMode) {
                    // 미리보기 기본 샘플 표시 (연동된 파투 데이터가 있으면 즉시 실제 최근 발신자 데이터로 갱신)
                    tvHeaderTitle.text = "SheetBot 인콜 파투 브리핑 (미리보기)"
                    tvCustomerName.text = "홍길동 대표님"
                    tvCustomerBadge.text = "파투·시트 고객"
                    tvCustomerBadge.visibility = View.VISIBLE
                    tvCustomerCompany.text = "(주)성진기업 | 대표이사 · 파투 통합연동"
                    tvLastCallTime.text = "최근 통화"
                    tvLastCallSummary.text = "1. 부품 납품 단가 협의 및 분납 일정 조율\n2. 다음 주 수요일 자재 일정 확인 희망\n3. 전자고지 및 견적서 발송 안내 완료"
                    tvActionItems.visibility = View.VISIBLE
                    tvActionItems.text = "📌 [통화 후속조치] 수요일 오전 견적서 재검토 후 연락 (내일까지)"
                    tvCustomerMemo.text = "• [문자 11/11] 분할납부 신청 안내 완료\n• [카톡 11/11] 가상계좌 발송 및 확인 완료\n• [명함] 결제일 매월 25일 준수 요청"
                    pbLoading.visibility = View.GONE
                }

                // 5. 윈도우에 뷰 등록
                wm.addView(view, params)
                Log.i(TAG, "🎉 [인콜 플로팅 카드 표출 완료] 대상 번호: $cleanPhone (preview=$previewMode)")

                val ftsOwnerPhone = prefs.ftsPhoneNumber?.takeIf { it.isNotBlank() }
                    ?: prefs.devicePhoneNumber?.takeIf { it.isNotBlank() }
                    ?: ""
                val hasFts = ftsOwnerPhone.isNotBlank() || !prefs.ftsProjectId.isNullOrBlank()

                // 6-A. 미리보기 모드일 때도 파투가 연동되어 있다면 실제 최근 통화 고객 데이터를 찾아 생생하게 표출
                if (previewMode && hasFts) {
                    pbLoading.visibility = View.VISIBLE
                    fetchJob = CoroutineScope(Dispatchers.IO).launch {
                        try {
                            val recentPhone = FileToSheetClient.findMostRecentCallerPhoneInWorkspace(
                                ownerPhone = ftsOwnerPhone,
                                projectIdHint = prefs.ftsProjectId
                            )
                            if (!recentPhone.isNullOrBlank()) {
                                val contactName = ContactHelper.getContactName(context, recentPhone)
                                val realBriefing = FileToSheetClient.fetchInCallBriefingFromWorkspace(
                                    ownerPhone = ftsOwnerPhone,
                                    callerPhone = recentPhone,
                                    projectIdHint = prefs.ftsProjectId,
                                    deviceContactName = contactName
                                )
                                withContext(Dispatchers.Main) {
                                    if (overlayView == view) {
                                        pbLoading.visibility = View.GONE
                                        if (realBriefing.found) {
                                            currentPhone = recentPhone
                                            tvHeaderTitle.text = "SheetBot 인콜 파투 브리핑 (실데이터)"
                                            tvCallerPhone.text = ContactHelper.formatPhoneNumber(recentPhone)
                                            applyResultToViews(
                                                result = realBriefing,
                                                isParuSource = true,
                                                tvCustomerName = tvCustomerName,
                                                tvCustomerBadge = tvCustomerBadge,
                                                tvCustomerCompany = tvCustomerCompany,
                                                tvLastCallTime = tvLastCallTime,
                                                tvLastCallSummary = tvLastCallSummary,
                                                tvActionItems = tvActionItems,
                                                tvCustomerMemo = tvCustomerMemo
                                            )
                                        }
                                    }
                                }
                            } else {
                                withContext(Dispatchers.Main) {
                                    if (overlayView == view) pbLoading.visibility = View.GONE
                                }
                            }
                        } catch (e: Exception) {
                            withContext(Dispatchers.Main) {
                                if (overlayView == view) pbLoading.visibility = View.GONE
                            }
                        }
                    }
                    return@post
                }

                // 6-B. 실제 수신/발신 통화 시: 파투 전 프로젝트·시트 우선 스캔 + 시트봇 서버 병합 조회
                if (!previewMode) {
                    val userEmail = prefs.userEmail
                    if (hasFts || !userEmail.isNullOrBlank()) {
                        pbLoading.visibility = View.VISIBLE
                        fetchJob = CoroutineScope(Dispatchers.IO).launch {
                            var finalResult: CallSummaryResult? = null
                            var isFromParu = false

                            // 1순위: 파투(FileToSheet) 내 모든 프로젝트 & 시트 통합 스캔
                            if (hasFts) {
                                try {
                                    val ftsResult = FileToSheetClient.fetchInCallBriefingFromWorkspace(
                                        ownerPhone = ftsOwnerPhone,
                                        callerPhone = cleanPhone,
                                        projectIdHint = prefs.ftsProjectId,
                                        deviceContactName = deviceContactName
                                    )
                                    if (ftsResult.found) {
                                        finalResult = ftsResult
                                        isFromParu = true
                                    } else {
                                        finalResult = ftsResult
                                    }
                                } catch (e: Exception) {
                                    Log.w(TAG, "파투 인콜 브리핑 스캔 중 예외: ${e.message}")
                                }
                            }

                            // 2순위: 파투에서 못 찾았거나 보강이 필요한 경우 시트봇 서버 API 호출
                            if ((finalResult == null || !finalResult.found) && !userEmail.isNullOrBlank()) {
                                try {
                                    val apiResult = ApiClient.fetchCallSummary(userEmail, cleanPhone)
                                    if (apiResult.success && apiResult.found) {
                                        finalResult = apiResult
                                        isFromParu = false
                                    } else if (finalResult == null) {
                                        finalResult = apiResult
                                    }
                                } catch (e: Exception) {
                                    Log.w(TAG, "서버 인콜 요약 API 호출 중 예외: ${e.message}")
                                }
                            }

                            withContext(Dispatchers.Main) {
                                if (overlayView == view) {
                                    pbLoading.visibility = View.GONE
                                    if (finalResult != null && finalResult.success) {
                                        applyResultToViews(
                                            result = finalResult,
                                            isParuSource = isFromParu,
                                            tvCustomerName = tvCustomerName,
                                            tvCustomerBadge = tvCustomerBadge,
                                            tvCustomerCompany = tvCustomerCompany,
                                            tvLastCallTime = tvLastCallTime,
                                            tvLastCallSummary = tvLastCallSummary,
                                            tvActionItems = tvActionItems,
                                            tvCustomerMemo = tvCustomerMemo
                                        )
                                        if (!finalResult.rawJson.isNullOrBlank() && finalResult.found) {
                                            prefs.saveCallSummaryCache(cleanPhone, finalResult.rawJson)
                                        }
                                    } else {
                                        if (tvCustomerName.text.toString() == "고객 정보 확인 중...") {
                                            tvCustomerName.text = deviceContactName ?: "신규 연락처"
                                            tvCustomerCompany.text = "파투·시트 등록 이력 없음"
                                        }
                                    }
                                }
                            }
                        }
                    } else {
                        pbLoading.visibility = View.GONE
                        tvCustomerName.text = deviceContactName ?: "신규 연락처"
                        tvCustomerCompany.text = "파투 또는 시트 연동 후 브리핑이 제공됩니다."
                    }
                }
            } catch (e: Exception) {
                Log.e(TAG, "인콜 플로팅 카드 표출 실패", e)
            }
        }
    }

    private fun applyResultToViews(
        result: CallSummaryResult,
        isParuSource: Boolean,
        tvCustomerName: TextView,
        tvCustomerBadge: TextView,
        tvCustomerCompany: TextView,
        tvLastCallTime: TextView,
        tvLastCallSummary: TextView,
        tvActionItems: TextView,
        tvCustomerMemo: TextView
    ) {
        tvCustomerName.text = result.name.ifBlank { "고객" }
        if (result.found) {
            tvCustomerBadge.text = if (isParuSource) "파투 고객" else "시트 고객"
            tvCustomerBadge.visibility = View.VISIBLE
        } else {
            tvCustomerBadge.visibility = View.GONE
        }

        val companyText = listOf(result.company, result.position).filter { it.isNotBlank() }.joinToString(" | ")
        tvCustomerCompany.text = companyText.ifBlank {
            if (result.found) "파투·시트 등록 고객" else "파투·시트 이력 없음 (신규 통화)"
        }

        if (result.lastCallSummary.isNotBlank()) {
            tvLastCallTime.text = result.lastCallTime.ifBlank { "최근 통화" }
            tvLastCallSummary.text = result.lastCallSummary
        } else {
            tvLastCallTime.text = "이전 통화 요약 없음"
            tvLastCallSummary.text = "등록된 직전 통화 녹음 요약이 없습니다."
        }

        if (result.actionItems.isNotBlank()) {
            val prefix = if (result.actionItems.startsWith("📌")) "" else "후속 조치: "
            tvActionItems.text = "$prefix${result.actionItems}"
            tvActionItems.visibility = View.VISIBLE
        } else {
            tvActionItems.visibility = View.GONE
        }

        tvCustomerMemo.text = result.memo.ifBlank { "등록된 최근 문자·카톡·파투 시트 내역이 없습니다." }
    }

    private fun renderSummaryData(
        json: JSONObject,
        tvCustomerName: TextView,
        tvCustomerBadge: TextView,
        tvCustomerCompany: TextView,
        tvLastCallTime: TextView,
        tvLastCallSummary: TextView,
        tvActionItems: TextView,
        tvCustomerMemo: TextView
    ) {
        val name = json.optString("name", "고객")
        val company = json.optString("company", "")
        val position = json.optString("position", "")
        val memo = json.optString("memo", "")
        val lastCallTime = json.optString("lastCallTime", "")
        val lastCallSummary = json.optString("lastCallSummary", "")
        val actionItems = json.optString("actionItems", "")
        val found = json.optBoolean("found", false)

        tvCustomerName.text = name.ifBlank { "고객" }
        tvCustomerBadge.visibility = if (found) View.VISIBLE else View.GONE
        val companyText = listOf(company, position).filter { it.isNotBlank() }.joinToString(" | ")
        tvCustomerCompany.text = companyText.ifBlank { if (found) "파투·시트 등록 고객" else "미등록 신규 연락처" }

        if (lastCallSummary.isNotBlank()) {
            tvLastCallTime.text = lastCallTime.ifBlank { "최근 통화" }
            tvLastCallSummary.text = lastCallSummary
        } else {
            tvLastCallTime.text = "통화 기록 없음"
            tvLastCallSummary.text = "등록된 직전 통화 요약이 없습니다."
        }

        if (actionItems.isNotBlank()) {
            val prefix = if (actionItems.startsWith("📌")) "" else "후속 조치: "
            tvActionItems.text = "$prefix$actionItems"
            tvActionItems.visibility = View.VISIBLE
        } else {
            tvActionItems.visibility = View.GONE
        }

        tvCustomerMemo.text = memo.ifBlank { "등록된 최근 문자·카톡·파투 시트 내역이 없습니다." }
    }

    /**
     * 플로팅 요약 카드 제거
     */
    fun dismiss(context: Context? = null) {
        mainHandler.post {
            try {
                fetchJob?.cancel()
                fetchJob = null

                overlayView?.let { view ->
                    windowManager?.removeView(view)
                }
            } catch (_: Exception) {
            } finally {
                overlayView = null
                currentPhone = null
                windowManager = null
            }
        }
    }
}
