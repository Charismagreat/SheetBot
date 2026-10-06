package cloud.sheetbot.agent.user

import android.annotation.SuppressLint
import android.content.Context
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
 * 수신 전화 시 화면 최상단에 구글 시트 고객 요약 카드를 플로팅 위젯으로 표출하는 매니저
 * - 다른 앱 위에 표시 (SYSTEM_ALERT_WINDOW) 활용
 * - 로컬 캐시 0.01초 즉각 표출 + 비동기 시트 실시간 업데이트
 * - 터치 드래그 위치 이동 및 접기/펼치기 지원
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
                // 이미 동일 번호로 띄워져 있다면 유지
                if (overlayView != null && currentPhone == cleanPhone) {
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
                    y = (110 * displayMetrics.density).toInt() // 상단 110dp 위치
                }

                val inflater = LayoutInflater.from(context)
                val view = inflater.inflate(R.layout.view_in_call_summary_card, null)
                overlayView = view

                // 뷰 컴포넌트 바인딩
                val llHeaderBar = view.findViewById<View>(R.id.llHeaderBar)
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

                tvCallerPhone.text = phoneNumber

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
                val cachedJsonStr = prefs.getCallSummaryCache(cleanPhone)
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
                    // 미리보기 모드용 더미 데이터
                    tvCustomerName.text = "홍길동 대표님"
                    tvCustomerBadge.visibility = View.VISIBLE
                    tvCustomerCompany.text = "(주)성진기업 | 대표이사"
                    tvLastCallTime.text = "2026-10-03 16:59"
                    tvLastCallSummary.text = "1. 부품 납품 단가 협의 진행\n2. 다음 주 수요일 자재 일정 확인 희망\n3. 견적서 이메일 발송 완료"
                    tvActionItems.visibility = View.VISIBLE
                    tvActionItems.text = "후속 조치: 수요일 오전 견적 재검토 후 연락"
                    tvCustomerMemo.text = "결제일 매월 25일 준수 요청 / VIP 우수 고객"
                    pbLoading.visibility = View.GONE
                }

                // 5. 윈도우에 뷰 등록
                wm.addView(view, params)
                Log.i(TAG, "🎉 [인콜 플로팅 카드 표출 완료] 대상 번호: $cleanPhone")

                // 6. 비동기로 시트봇 서버에서 최신 고객 정보 실시간 fetch (미리보기 모드 제외)
                if (!previewMode) {
                    val userEmail = prefs.userEmail
                    if (!userEmail.isNullOrBlank()) {
                        pbLoading.visibility = View.VISIBLE
                        fetchJob = CoroutineScope(Dispatchers.IO).launch {
                            val result = ApiClient.fetchCallSummary(userEmail, cleanPhone)
                            withContext(Dispatchers.Main) {
                                if (overlayView == view) {
                                    pbLoading.visibility = View.GONE
                                    if (result.success) {
                                        tvCustomerName.text = result.name.ifBlank { "고객" }
                                        tvCustomerBadge.visibility = if (result.found) View.VISIBLE else View.GONE
                                        val companyText = listOf(result.company, result.position).filter { it.isNotBlank() }.joinToString(" | ")
                                        tvCustomerCompany.text = companyText.ifBlank { if (result.found) "시트 등록 고객" else "미등록 신규 연락처" }

                                        if (result.lastCallSummary.isNotBlank()) {
                                            tvLastCallTime.text = result.lastCallTime.ifBlank { "최근 통화" }
                                            tvLastCallSummary.text = result.lastCallSummary
                                        } else {
                                            tvLastCallTime.text = "통화 기록 없음"
                                            tvLastCallSummary.text = "등록된 직전 통화 요약이 없습니다."
                                        }

                                        if (result.actionItems.isNotBlank()) {
                                            tvActionItems.text = "후속 조치: ${result.actionItems}"
                                            tvActionItems.visibility = View.VISIBLE
                                        } else {
                                            tvActionItems.visibility = View.GONE
                                        }

                                        tvCustomerMemo.text = result.memo.ifBlank { "등록된 특이사항 메모가 없습니다." }

                                        if (!result.rawJson.isNullOrBlank()) {
                                            prefs.saveCallSummaryCache(cleanPhone, result.rawJson)
                                        }
                                    } else {
                                        if (tvCustomerName.text.toString() == "고객 정보 확인 중...") {
                                            tvCustomerName.text = "신규 연락처"
                                            tvCustomerCompany.text = "시트 조회 실패"
                                        }
                                    }
                                }
                            }
                        }
                    } else {
                        pbLoading.visibility = View.GONE
                    }
                }
            } catch (e: Exception) {
                Log.e(TAG, "인콜 플로팅 카드 표출 실패", e)
            }
        }
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
        tvCustomerCompany.text = companyText.ifBlank { if (found) "시트 등록 고객" else "미등록 신규 연락처" }

        if (lastCallSummary.isNotBlank()) {
            tvLastCallTime.text = lastCallTime.ifBlank { "최근 통화" }
            tvLastCallSummary.text = lastCallSummary
        } else {
            tvLastCallTime.text = "통화 기록 없음"
            tvLastCallSummary.text = "등록된 직전 통화 요약이 없습니다."
        }

        if (actionItems.isNotBlank()) {
            tvActionItems.text = "후속 조치: $actionItems"
            tvActionItems.visibility = View.VISIBLE
        } else {
            tvActionItems.visibility = View.GONE
        }

        tvCustomerMemo.text = memo.ifBlank { "등록된 특이사항 메모가 없습니다." }
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
