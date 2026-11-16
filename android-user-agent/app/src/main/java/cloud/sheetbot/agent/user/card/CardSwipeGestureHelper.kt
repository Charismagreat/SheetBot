package cloud.sheetbot.agent.user.card

import android.annotation.SuppressLint
import android.content.Context
import android.view.HapticFeedbackConstants
import android.view.MotionEvent
import android.view.View
import android.view.ViewConfiguration
import kotlin.math.abs
import kotlin.math.max
import kotlin.math.min

/**
 * 🌟 카드 제스처 인터랙션 헬퍼 (Card Swipe Gesture Helper)
 *
 * 공간적 멘탈 모델 (Spatial Mental Model) 기반의 직관적 제스처:
 * 1. [홈 화면] 카드를 좌→우(➡️)로 스와이프: 우측 보관함 서랍 속으로 쏙 밀어 넣기 (Hide/Archive) + 세련된 팝업창
 * 2. [홈 화면] 화면 우측 엣지에서 우→좌(⬅️)로 스와이프: 우측 보관함 서랍을 화면 안으로 당겨 열기 (Open Drawer)
 * 3. [보관함 화면] 보관된 카드 행을 우→좌(⬅️)로 스와이프: 보관함에서 꺼내어 홈 화면으로 던져 넣기 (Restore/Unhide)
 */
object CardSwipeGestureHelper {

    /**
     * [제스처 1: 홈 화면 카드 좌→우(➡️) 스와이프 보관]
     *
     * @param touchTargetView 제스처를 감지할 터치 대상 뷰 (카드 헤더 또는 카드 본체)
     * @param animatedView 실제 우측으로 이동/페이드 애니메이션을 수행할 전체 카드 뷰
     * @param cardTitle 알림용 카드 제목
     * @param onArchiveThresholdMet 임계치(26% 이상) 스와이프 후 손을 뗐을 때 실행할 보관 콜백
     */
    @SuppressLint("ClickableViewAccessibility")
    fun attachCardSwipeToArchive(
        touchTargetView: View,
        animatedView: View,
        cardTitle: String,
        onArchiveThresholdMet: () -> Unit
    ) {
        val context = touchTargetView.context
        val vc = ViewConfiguration.get(context)
        val touchSlop = vc.scaledTouchSlop

        var startX = 0f
        var startY = 0f
        var isHorizontalDragging = false
        var isDisallowRequested = false

        touchTargetView.setOnTouchListener { view, event ->
            when (event.actionMasked) {
                MotionEvent.ACTION_DOWN -> {
                    startX = event.rawX
                    startY = event.rawY
                    isHorizontalDragging = false
                    isDisallowRequested = false
                    // 🌟 [핵심 수정] 반드시 true를 반환해야 후속 ACTION_MOVE/UP 이벤트를 온전히 수신함
                    true
                }

                MotionEvent.ACTION_MOVE -> {
                    val dx = event.rawX - startX
                    val dy = event.rawY - startY

                    if (!isHorizontalDragging) {
                        // 오직 '좌 -> 우(➡️)' 방향의 수평 이동일 때만 (수평 우세)
                        if (dx > touchSlop && dx > abs(dy) * 1.15f) {
                            isHorizontalDragging = true
                            if (!isDisallowRequested) {
                                view.parent?.requestDisallowInterceptTouchEvent(true)
                                isDisallowRequested = true
                            }
                            try {
                                view.performHapticFeedback(HapticFeedbackConstants.KEYBOARD_TAP)
                            } catch (_: Throwable) {}
                        } else if (abs(dy) > touchSlop && abs(dy) > dx) {
                            // 세로 스크롤 동작이므로 상위 ScrollView에 터치 양도
                            if (isDisallowRequested) {
                                view.parent?.requestDisallowInterceptTouchEvent(false)
                                isDisallowRequested = false
                            }
                            return@setOnTouchListener false
                        }
                    }

                    if (isHorizontalDragging) {
                        // 우측으로만 이동 허용 (좌측 역방향은 0으로 방어)
                        val dragX = max(0f, dx)
                        animatedView.translationX = dragX

                        // 서서히 투명해지는 페이드 효과 (최대 70% 투명도)
                        val width = animatedView.width.toFloat().coerceAtLeast(1f)
                        val alphaProgress = (dragX / (width * 0.85f)).coerceIn(0f, 0.70f)
                        animatedView.alpha = 1f - alphaProgress
                        true
                    } else {
                        false
                    }
                }

                MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
                    if (isDisallowRequested) {
                        view.parent?.requestDisallowInterceptTouchEvent(false)
                        isDisallowRequested = false
                    }

                    if (isHorizontalDragging) {
                        isHorizontalDragging = false
                        val currentTranslation = animatedView.translationX
                        val width = animatedView.width.toFloat().coerceAtLeast(1f)
                        val threshold = width * 0.25f // 너비의 25% 이상 밀었을 때 발동

                        if (currentTranslation >= threshold && event.actionMasked == MotionEvent.ACTION_UP) {
                            // 임계치 돌파: 우측 밖으로 슝 날아가며 페이드아웃 후 보관 처리
                            animatedView.animate()
                                .translationX(width)
                                .alpha(0f)
                                .setDuration(220)
                                .withEndAction {
                                    animatedView.translationX = 0f
                                    animatedView.alpha = 1f
                                    onArchiveThresholdMet()
                                }
                                .start()
                        } else {
                            // 임계치 미달: 원래 위치로 부드럽게 복귀 (스프링 효과)
                            animatedView.animate()
                                .translationX(0f)
                                .alpha(1f)
                                .setDuration(180)
                                .start()
                        }
                        true
                    } else {
                        // 단순 클릭(탭)일 경우 원래 뷰의 클릭 이벤트 보장
                        if (event.actionMasked == MotionEvent.ACTION_UP) {
                            val dist = abs(event.rawX - startX) + abs(event.rawY - startY)
                            if (dist < touchSlop * 1.5f) {
                                view.performClick()
                            }
                        }
                        false
                    }
                }

                else -> false
            }
        }
    }

    /**
     * [제스처 2-A: 액티비티 터치 디스패치 레벨 우측 엣지 스와이프 감지기]
     * 화면 오른쪽 모서리(우측 22% 영역)에서 우→좌(⬅️)로 밀었을 때 하위 뷰에 구애받지 않고 보관함 오픈
     */
    fun createRightEdgeSwipeDetector(
        context: Context,
        onOpenDrawer: () -> Unit
    ): (MotionEvent) -> Boolean {
        val vc = ViewConfiguration.get(context)
        val touchSlop = vc.scaledTouchSlop
        val displayMetrics = context.resources.displayMetrics
        val screenWidth = displayMetrics.widthPixels

        var startX = 0f
        var startY = 0f
        var isFromRightEdge = false
        var isEdgeSwiping = false

        return { event ->
            when (event.actionMasked) {
                MotionEvent.ACTION_DOWN -> {
                    startX = event.rawX
                    startY = event.rawY
                    // 화면 우측 22% 이내 영역에서 시작된 터치인지 검사
                    isFromRightEdge = startX >= (screenWidth * 0.78f)
                    isEdgeSwiping = false
                    false // ACTION_DOWN은 다른 뷰(버튼, 스크롤 등)가 정상 감지할 수 있도록 흘려보냄
                }

                MotionEvent.ACTION_MOVE -> {
                    if (isFromRightEdge) {
                        val dx = event.rawX - startX
                        val dy = event.rawY - startY

                        if (!isEdgeSwiping) {
                            // 우측에서 좌측으로 확실하게 당기는 동작 (dx < 0)
                            if (dx < -touchSlop * 1.5f && abs(dx) > abs(dy) * 1.5f) {
                                isEdgeSwiping = true
                            } else if (abs(dy) > touchSlop * 1.8f) {
                                // 세로 스크롤 동작이므로 엣지 스와이프 취소
                                isFromRightEdge = false
                            }
                        }
                    }
                    isEdgeSwiping // 스와이프 시작 시 터치 이벤트를 소비하여 스크롤/버튼 오동작 차단
                }

                MotionEvent.ACTION_UP -> {
                    if (isEdgeSwiping) {
                        isEdgeSwiping = false
                        isFromRightEdge = false
                        val totalDx = event.rawX - startX
                        val triggerDp = 60 * displayMetrics.density
                        if (totalDx < -triggerDp) {
                            onOpenDrawer()
                            true
                        } else {
                            false
                        }
                    } else {
                        false
                    }
                }

                MotionEvent.ACTION_CANCEL -> {
                    isFromRightEdge = false
                    isEdgeSwiping = false
                    false
                }

                else -> false
            }
        }
    }

    /**
     * [제스처 2: 홈 화면 우측 엣지에서 우→좌(⬅️) 스와이프 시 보관함 바텀시트 열기]
     *
     * @param containerView 홈 화면 최외곽 스크롤뷰 또는 메인 컨테이너
     * @param onOpenDrawer 보관함 오픈 콜백
     */
    @SuppressLint("ClickableViewAccessibility")
    fun attachRightEdgeSwipeToOpenDrawer(
        containerView: View,
        onOpenDrawer: () -> Unit
    ) {
        val context = containerView.context
        val vc = ViewConfiguration.get(context)
        val touchSlop = vc.scaledTouchSlop
        val displayMetrics = context.resources.displayMetrics
        val screenWidth = displayMetrics.widthPixels

        var startX = 0f
        var startY = 0f
        var isFromRightEdge = false
        var isEdgeSwiping = false

        containerView.setOnTouchListener { view, event ->
            when (event.actionMasked) {
                MotionEvent.ACTION_DOWN -> {
                    startX = event.rawX
                    startY = event.rawY
                    // 화면 우측 22% 이내 영역에서 시작된 터치만 엣지 제스처 후보로 인정
                    isFromRightEdge = startX >= (screenWidth * 0.78f)
                    isEdgeSwiping = false
                    false
                }

                MotionEvent.ACTION_MOVE -> {
                    if (!isFromRightEdge) return@setOnTouchListener false

                    val dx = event.rawX - startX
                    val dy = event.rawY - startY

                    if (!isEdgeSwiping) {
                        // 우측 엣지에서 '우 -> 좌(⬅️)'로 명확히 당길 때 (dx < 0)
                        if (dx < -touchSlop * 1.5f && abs(dx) > abs(dy) * 1.6f) {
                            isEdgeSwiping = true
                            view.parent?.requestDisallowInterceptTouchEvent(true)
                        } else if (abs(dy) > touchSlop) {
                            isFromRightEdge = false
                            return@setOnTouchListener false
                        }
                    }

                    isEdgeSwiping
                }

                MotionEvent.ACTION_UP -> {
                    if (isEdgeSwiping) {
                        view.parent?.requestDisallowInterceptTouchEvent(false)
                        val totalDx = event.rawX - startX
                        // 65dp 이상 좌측으로 밀었을 때 보관함 바텀시트 발동
                        val triggerDp = 65 * displayMetrics.density
                        if (totalDx < -triggerDp) {
                            onOpenDrawer()
                            return@setOnTouchListener true
                        }
                    }
                    false
                }

                MotionEvent.ACTION_CANCEL -> {
                    isFromRightEdge = false
                    isEdgeSwiping = false
                    false
                }

                else -> false
            }
        }
    }

    /**
     * [제스처 3: 보관함 바텀시트 내 카드 행 우→좌(⬅️) 스와이프 시 홈으로 꺼내기]
     *
     * @param rowView 보관함 목록의 카드 행 뷰
     * @param cardTitle 알림용 카드 제목
     * @param onRestoreThresholdMet 임계치(25% 이상) 스와이프 후 손을 뗐을 때 실행할 꺼내기 콜백
     */
    @SuppressLint("ClickableViewAccessibility")
    fun attachCardSwipeToRestore(
        rowView: View,
        cardTitle: String,
        onRestoreThresholdMet: () -> Unit
    ) {
        val context = rowView.context
        val vc = ViewConfiguration.get(context)
        val touchSlop = vc.scaledTouchSlop

        var startX = 0f
        var startY = 0f
        var isHorizontalDragging = false
        var isDisallowRequested = false

        rowView.setOnTouchListener { view, event ->
            when (event.actionMasked) {
                MotionEvent.ACTION_DOWN -> {
                    startX = event.rawX
                    startY = event.rawY
                    isHorizontalDragging = false
                    isDisallowRequested = false
                    // 🌟 [핵심 수정] 반드시 true를 반환해야 후속 좌측 스와이프 이벤트를 수신함
                    true
                }

                MotionEvent.ACTION_MOVE -> {
                    val dx = event.rawX - startX
                    val dy = event.rawY - startY

                    if (!isHorizontalDragging) {
                        // 오직 '우 -> 좌(⬅️)' 방향의 수평 이동일 때만 (홈 방향으로 던지기)
                        if (dx < -touchSlop && abs(dx) > abs(dy) * 1.15f) {
                            isHorizontalDragging = true
                            if (!isDisallowRequested) {
                                view.parent?.requestDisallowInterceptTouchEvent(true)
                                isDisallowRequested = true
                            }
                            try {
                                view.performHapticFeedback(HapticFeedbackConstants.KEYBOARD_TAP)
                            } catch (_: Throwable) {}
                        } else if (abs(dy) > touchSlop && abs(dy) > abs(dx)) {
                            // 바텀시트 내 세로 스크롤 동작이므로 양도
                            if (isDisallowRequested) {
                                view.parent?.requestDisallowInterceptTouchEvent(false)
                                isDisallowRequested = false
                            }
                            return@setOnTouchListener false
                        }
                    }

                    if (isHorizontalDragging) {
                        // 좌측으로만 이동 허용 (우측 역방향은 0으로 방어)
                        val dragX = min(0f, dx)
                        rowView.translationX = dragX

                        val width = rowView.width.toFloat().coerceAtLeast(1f)
                        val alphaProgress = (abs(dragX) / (width * 0.85f)).coerceIn(0f, 0.70f)
                        rowView.alpha = 1f - alphaProgress
                        true
                    } else {
                        false
                    }
                }

                MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
                    if (isDisallowRequested) {
                        view.parent?.requestDisallowInterceptTouchEvent(false)
                        isDisallowRequested = false
                    }

                    if (isHorizontalDragging) {
                        isHorizontalDragging = false
                        val currentTranslation = abs(rowView.translationX)
                        val width = rowView.width.toFloat().coerceAtLeast(1f)
                        val threshold = width * 0.25f

                        if (currentTranslation >= threshold && event.actionMasked == MotionEvent.ACTION_UP) {
                            // 임계치 돌파: 좌측 홈 방향으로 날아가며 홈에 추가
                            rowView.animate()
                                .translationX(-width)
                                .alpha(0f)
                                .setDuration(200)
                                .withEndAction {
                                    rowView.translationX = 0f
                                    rowView.alpha = 1f
                                    onRestoreThresholdMet()
                                }
                                .start()
                        } else {
                            // 복귀
                            rowView.animate()
                                .translationX(0f)
                                .alpha(1f)
                                .setDuration(180)
                                .start()
                        }
                        true
                    } else {
                        // 단순 탭 시 클릭 이벤트 실행
                        if (event.actionMasked == MotionEvent.ACTION_UP) {
                            val dist = abs(event.rawX - startX) + abs(event.rawY - startY)
                            if (dist < touchSlop * 1.5f) {
                                view.performClick()
                            }
                        }
                        false
                    }
                }

                else -> false
            }
        }
    }
}
