package cloud.sheetbot.agent.user.card

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Color
import android.net.Uri
import android.provider.ContactsContract
import android.widget.Button
import android.widget.EditText
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import cloud.sheetbot.agent.user.ContactHelper
import cloud.sheetbot.agent.user.databinding.ActivityMainBinding

/**
 * 🎯 기록 대상(타겟) 필터 대장 및 연락처 피커/관리 다이얼로그 전담 컨트롤러
 *
 * - SMS, 통화녹음, 카카오톡 기록 대상 번호/키워드 필터링
 * - 스마트폰 시스템 주소록(Contacts Picker) 연동 및 권한 확인
 * - 선택된 연락처(이름, 010 번호 정규화) 필터 자동 추가
 * - 대상 건수 실시간 집계 및 상단 뱃지 텍스트 갱신 (전체 기록 vs N건 지정)
 * - 현재 기록 대상 목록 조회, 개별 삭제(제외), 전체 해제 다이얼로그 팝업 (v2.1.1)
 */
class TargetFilterController(
    private val activity: AppCompatActivity,
    private val binding: ActivityMainBinding,
    private val launchContactPickerIntent: (Intent) -> Unit,
    private val requestContactPermission: () -> Unit,
    private val isSmsSyncControllerInitialized: () -> Boolean,
    private val getSmsSyncController: () -> SmsSyncCardController
) {
    private var pendingContactTargetType: String? = null // "SMS" or "RECORDING"

    /**
     * 연락처 권한 확인 후 주소록 선택창 실행 (v2.1.1)
     */
    fun checkAndLaunchContactPicker(targetType: String) {
        pendingContactTargetType = targetType
        if (ContextCompat.checkSelfPermission(activity, Manifest.permission.READ_CONTACTS) == PackageManager.PERMISSION_GRANTED) {
            launchContactPicker(targetType)
        } else {
            requestContactPermission()
        }
    }

    fun launchContactPicker(targetType: String) {
        pendingContactTargetType = targetType
        try {
            val intent = Intent(Intent.ACTION_PICK, ContactsContract.CommonDataKinds.Phone.CONTENT_URI)
            launchContactPickerIntent(intent)
        } catch (e: Exception) {
            Toast.makeText(activity, "주소록을 열 수 없습니다: ${e.message}", Toast.LENGTH_SHORT).show()
        }
    }

    fun onPermissionResult(isGranted: Boolean) {
        if (isGranted) {
            val type = pendingContactTargetType
            if (type != null) {
                launchContactPicker(type)
            }
        } else {
            Toast.makeText(activity, "연락처 조회 권한이 거부되어 주소록을 열 수 없습니다.", Toast.LENGTH_SHORT).show()
        }
    }

    /**
     * 선택된 연락처에서 전화번호 및 이름 추출 후 기록 대상 필터에 추가
     */
    fun handlePickedContact(contactUri: Uri) {
        val targetType = pendingContactTargetType
        try {
            val cursor = activity.contentResolver.query(
                contactUri,
                arrayOf(
                    ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME,
                    ContactsContract.CommonDataKinds.Phone.NUMBER
                ),
                null,
                null,
                null
            )
            cursor?.use {
                if (it.moveToFirst()) {
                    val name = it.getString(0)?.trim() ?: ""
                    val number = it.getString(1)?.trim() ?: ""
                    val cleanNumber = number.replace("[^0-9+]".toRegex(), "")
                    val formattedNumber = when {
                        cleanNumber.startsWith("010") && cleanNumber.length == 11 ->
                            "${cleanNumber.substring(0, 3)}-${cleanNumber.substring(3, 7)}-${cleanNumber.substring(7)}"
                        cleanNumber.startsWith("+8210") && cleanNumber.length == 13 ->
                            "010-${cleanNumber.substring(5, 9)}-${cleanNumber.substring(9)}"
                        cleanNumber.startsWith("8210") && cleanNumber.length == 12 ->
                            "010-${cleanNumber.substring(4, 8)}-${cleanNumber.substring(8)}"
                        else -> number
                    }

                    val itemToAdd = if (formattedNumber.isNotBlank()) formattedNumber else name
                    val displayName = if (name.isNotBlank() && name != formattedNumber) "$name ($formattedNumber)" else formattedNumber

                    when (targetType) {
                        "SMS" -> addTargetToFilter(binding.etSmsTargetFilter, itemToAdd, displayName)
                        "RECORDING" -> addTargetToFilter(binding.etRecordingTargetFilter, itemToAdd, displayName)
                    }
                }
            }
        } catch (e: Exception) {
            Toast.makeText(activity, "연락처 정보를 가져오는 중 오류: ${e.message}", Toast.LENGTH_SHORT).show()
        }
    }

    /**
     * 지정된 EditText 필터 목록에 중복 없이 항목 추가
     */
    fun addTargetToFilter(editText: EditText, item: String, displayName: String) {
        val currentText = editText.text.toString().trim()
        val currentList = currentText.split(",", ";")
            .map { it.trim() }
            .filter { it.isNotBlank() }
            .toMutableList()

        val cleanItem = item.replace("-", "").replace(" ", "").lowercase()
        val isAlreadyExist = currentList.any {
            it.replace("-", "").replace(" ", "").lowercase() == cleanItem
        }

        if (isAlreadyExist) {
            Toast.makeText(activity, "이미 대상 목록에 등록되어 있습니다: $displayName", Toast.LENGTH_SHORT).show()
            return
        }

        currentList.add(item)
        val newText = currentList.joinToString(", ")
        editText.setText(newText)
        updateTargetBadges()
        Toast.makeText(activity, "🎯 기록 대상 추가: $displayName", Toast.LENGTH_SHORT).show()
    }

    /**
     * 필터 등록 건수에 따라 상태 뱃지 및 관리 버튼 텍스트 실시간 갱신
     */
    fun updateTargetBadges() {
        // SMS 대상
        if (isSmsSyncControllerInitialized()) {
            getSmsSyncController().updateTargetBadge()
        } else {
            val smsList = binding.etSmsTargetFilter.text.toString().split(",", ";")
                .map { it.trim() }.filter { it.isNotBlank() }
            if (smsList.isEmpty()) {
                binding.tvSmsTargetCountBadge.text = "전체 기록"
                binding.tvSmsTargetCountBadge.setTextColor(Color.parseColor("#38BDF8"))
                binding.btnManageSmsTargets.text = "📋 등록 대상 확인 / 제외"
            } else {
                binding.tvSmsTargetCountBadge.text = "${smsList.size}건 지정"
                binding.tvSmsTargetCountBadge.setTextColor(Color.parseColor("#34D399"))
                binding.btnManageSmsTargets.text = "📋 등록 대상 확인 / 제외 (${smsList.size}건)"
            }
        }

        // 통화 녹음 대상
        val recList = binding.etRecordingTargetFilter.text.toString().split(",", ";")
            .map { it.trim() }.filter { it.isNotBlank() }
        if (recList.isEmpty()) {
            binding.tvRecordingTargetCountBadge.text = "전체 저장"
            binding.tvRecordingTargetCountBadge.setTextColor(Color.parseColor("#38BDF8"))
            binding.btnManageRecordingTargets.text = "📋 등록 대상 확인 / 제외"
        } else {
            binding.tvRecordingTargetCountBadge.text = "${recList.size}건 지정"
            binding.tvRecordingTargetCountBadge.setTextColor(Color.parseColor("#34D399"))
            binding.btnManageRecordingTargets.text = "📋 등록 대상 확인 / 제외 (${recList.size}건)"
        }

        // 카카오톡 대상
        val kakaoList = binding.etKakaoTargetFilter.text.toString().split(",", ";")
            .map { it.trim() }.filter { it.isNotBlank() }
        if (kakaoList.isEmpty()) {
            binding.tvKakaoTargetCountBadge.text = "전체 기록"
            binding.tvKakaoTargetCountBadge.setTextColor(Color.parseColor("#38BDF8"))
            binding.btnManageKakaoTargets.text = "📋 등록 대상 확인 / 제외"
        } else {
            binding.tvKakaoTargetCountBadge.text = "${kakaoList.size}건 지정"
            binding.tvKakaoTargetCountBadge.setTextColor(Color.parseColor("#34D399"))
            binding.btnManageKakaoTargets.text = "📋 등록 대상 확인 / 제외 (${kakaoList.size}건)"
        }
    }

    /**
     * 현재 기록 대상 목록 팝업 및 원클릭 제외(삭제) 관리 다이얼로그 (v2.1.1)
     */
    fun showTargetManageDialog(dialogTitle: String, editText: EditText, targetType: String) {
        val currentText = editText.text.toString().trim()
        val currentList = currentText.split(",", ";")
            .map { it.trim() }
            .filter { it.isNotBlank() }
            .toMutableList()

        val context = activity
        val dialogView = android.widget.LinearLayout(context).apply {
            orientation = android.widget.LinearLayout.VERTICAL
            setPadding(40, 30, 40, 20)
            setBackgroundColor(Color.parseColor("#0F172A"))
        }

        val tvDesc = TextView(context).apply {
            textSize = 12f
            setTextColor(Color.parseColor("#94A3B8"))
            setLineSpacing(4f, 1f)
            setPadding(0, 0, 0, 20)
        }
        dialogView.addView(tvDesc)

        val scrollView = android.widget.ScrollView(context).apply {
            layoutParams = android.widget.LinearLayout.LayoutParams(
                android.widget.LinearLayout.LayoutParams.MATCH_PARENT,
                (280 * context.resources.displayMetrics.density).toInt()
            )
        }
        val itemsContainer = android.widget.LinearLayout(context).apply {
            orientation = android.widget.LinearLayout.VERTICAL
        }
        scrollView.addView(itemsContainer)
        dialogView.addView(scrollView)

        fun refreshList() {
            itemsContainer.removeAllViews()
            if (currentList.isEmpty()) {
                tvDesc.text = "💡 현재 개별 등록된 대상이 없습니다.\n모든 수신 내용이 구글 시트에 '전체 자동 기록'됩니다."
                val emptyTv = TextView(context).apply {
                    text = "등록된 대상 없음 (전체 기록 모드)"
                    textSize = 13f
                    setTextColor(Color.parseColor("#64748B"))
                    gravity = android.view.Gravity.CENTER
                    setPadding(0, 60, 0, 60)
                }
                itemsContainer.addView(emptyTv)
            } else {
                tvDesc.text = "💡 현재 총 ${currentList.size}건의 대상만 선별 기록됩니다.\n목록에서 제외하려면 우측의 [❌ 제외] 버튼을 누르세요."
                for (item in currentList.toList()) {
                    val row = android.widget.LinearLayout(context).apply {
                        orientation = android.widget.LinearLayout.HORIZONTAL
                        gravity = android.view.Gravity.CENTER_VERTICAL
                        setPadding(16, 14, 16, 14)
                        setBackgroundColor(Color.parseColor("#1E293B"))
                        val params = android.widget.LinearLayout.LayoutParams(
                            android.widget.LinearLayout.LayoutParams.MATCH_PARENT,
                            android.widget.LinearLayout.LayoutParams.WRAP_CONTENT
                        ).apply { setMargins(0, 0, 0, 12) }
                        layoutParams = params
                    }

                    val resolvedName = if (targetType != "KAKAO") ContactHelper.getContactName(context, item) else null
                    val itemLabel = if (!resolvedName.isNullOrBlank()) "👤 $resolvedName\n    ($item)" else "🎯 $item"

                    val tvItem = TextView(context).apply {
                        text = itemLabel
                        textSize = 12.5f
                        setTextColor(Color.parseColor("#F1F5F9"))
                        layoutParams = android.widget.LinearLayout.LayoutParams(0, android.widget.LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
                    }
                    val btnDelete = Button(context).apply {
                        text = "❌ 제외"
                        textSize = 11.5f
                        setTextColor(Color.parseColor("#EF4444"))
                        setBackgroundColor(Color.parseColor("#334155"))
                        layoutParams = android.widget.LinearLayout.LayoutParams(
                            android.widget.LinearLayout.LayoutParams.WRAP_CONTENT,
                            (36 * context.resources.displayMetrics.density).toInt()
                        )
                        setOnClickListener {
                            currentList.remove(item)
                            val newText = currentList.joinToString(", ")
                            editText.setText(newText)
                            updateTargetBadges()
                            Toast.makeText(context, "'${item}' 대상이 제외되었습니다.", Toast.LENGTH_SHORT).show()
                            refreshList()
                        }
                    }
                    row.addView(tvItem)
                    row.addView(btnDelete)
                    itemsContainer.addView(row)
                }
            }
        }

        refreshList()

        val builder = AlertDialog.Builder(context)
            .setTitle(dialogTitle)
            .setView(dialogView)
            .setNegativeButton("닫기", null)

        if (targetType == "SMS" || targetType == "RECORDING") {
            builder.setPositiveButton("👥 연락처에서 추가") { _, _ ->
                checkAndLaunchContactPicker(targetType)
            }
        }

        builder.setNeutralButton("🗑️ 전체 해제 (모두 기록)") { _, _ ->
            currentList.clear()
            editText.setText("")
            updateTargetBadges()
            Toast.makeText(context, "모든 대상이 해제되어 '전체 기록 모드'로 전환되었습니다.", Toast.LENGTH_LONG).show()
        }

        builder.show()
    }
}
