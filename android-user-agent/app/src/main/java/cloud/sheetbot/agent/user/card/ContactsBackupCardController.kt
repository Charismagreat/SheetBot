package cloud.sheetbot.agent.user.card

import android.Manifest
import android.content.pm.PackageManager
import android.graphics.Color
import android.view.View
import android.widget.Toast
import androidx.core.content.ContextCompat
import androidx.lifecycle.lifecycleScope
import cloud.sheetbot.agent.user.ApiClient
import cloud.sheetbot.agent.user.ContactReader
import cloud.sheetbot.agent.user.MainActivity
import cloud.sheetbot.agent.user.PreferencesManager
import cloud.sheetbot.agent.user.databinding.ActivityMainBinding
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * 📇 스마트폰 연락처 구글 시트 자동 동기화 카드 전담 컨트롤러
 * - 동기화 스위치, READ_CONTACTS 권한 점검, 전체 연락처 주소록 읽기/구글 시트 전송, 상태 UI 캡슐화
 */
class ContactsBackupCardController(
    private val activity: MainActivity,
    private val binding: ActivityMainBinding,
    private val prefs: PreferencesManager,
    private val onOpenSheetChooser: (sheetType: String, defaultTitle: String) -> Unit,
    private val onProvisionSheet: (sheetType: String, defaultTitle: String) -> Unit,
    private val onRequestPermission: (permission: String, requestCode: Int) -> Unit
) {
    /**
     * 카드 초기화 및 모든 UI 이벤트 바인딩
     */
    fun setup() {
        binding.switchContactsSync.isChecked = prefs.isContactsSyncEnabled
        updateContactsSyncStatusText()

        // 접기/펼치기 헤더 및 버튼 리스너 바인딩
        val toggleContacts = {
            prefs.isContactsDetailsHidden = !prefs.isContactsDetailsHidden
            activity.updateCardCollapseState(
                binding.layoutContactsDetails,
                binding.btnToggleContactsDetails,
                prefs.isContactsDetailsHidden
            )
        }
        binding.layoutContactsHeader.setOnClickListener { toggleContacts() }
        binding.btnToggleContactsDetails.setOnClickListener { toggleContacts() }

        binding.switchContactsSync.setOnCheckedChangeListener { _, isChecked ->
            prefs.isContactsSyncEnabled = isChecked
            prefs.isContactsDetailsHidden = !isChecked
            activity.updateCardCollapseState(
                binding.layoutContactsDetails,
                binding.btnToggleContactsDetails,
                !isChecked
            )
            val msg = if (isChecked) "스마트폰 연락처 구글 시트 자동 백업이 켜졌습니다." else "연락처 자동 백업이 꺼졌습니다."
            Toast.makeText(activity, msg, Toast.LENGTH_SHORT).show()
            updateContactsSyncStatusText()

            if (isChecked) {
                if (ContextCompat.checkSelfPermission(activity, Manifest.permission.READ_CONTACTS) != PackageManager.PERMISSION_GRANTED) {
                    onRequestPermission(Manifest.permission.READ_CONTACTS, 1010)
                }
                onProvisionSheet("CONTACTS", "[SheetBot] 스마트폰 연락처 대장")
            }
        }

        binding.btnSyncContactsNow.setOnClickListener {
            if (!prefs.isPaired) {
                Toast.makeText(activity, "먼저 시트봇 워크스페이스와 연동해 주세요.", Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }
            if (ContextCompat.checkSelfPermission(activity, Manifest.permission.READ_CONTACTS) != PackageManager.PERMISSION_GRANTED) {
                onRequestPermission(Manifest.permission.READ_CONTACTS, 1010)
                Toast.makeText(activity, "연락처 접근 권한을 허용해 주세요.", Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }
            syncContactsImmediate()
        }

        binding.btnOpenContactsSheet.setOnClickListener {
            onOpenSheetChooser("CONTACTS", "[SheetBot] 스마트폰 연락처 대장")
        }
    }

    /**
     * 마지막 연락처 동기화 일시 및 건수 텍스트 갱신
     */
    fun updateContactsSyncStatusText() {
        try {
            val lastTime = prefs.lastContactsSyncTime
            val lastCount = prefs.lastContactsSyncCount
            if (lastTime <= 0L) {
                binding.tvContactsSyncStatus.text = "마지막 동기화: 동기화 이력 없음"
                binding.tvContactsSyncStatus.setTextColor(Color.parseColor("#94A3B8"))
            } else {
                val format = SimpleDateFormat("yyyy-MM-dd HH:mm", Locale.KOREA)
                val timeStr = format.format(Date(lastTime))
                binding.tvContactsSyncStatus.text = "마지막 동기화: ${lastCount}건 ($timeStr)"
                binding.tvContactsSyncStatus.setTextColor(Color.parseColor("#38BDF8"))
            }
        } catch (_: Exception) {}
    }

    /**
     * 지금 즉시 스마트폰 전체 연락처 주소록을 읽어 구글 시트로 백업 동기화
     */
    fun syncContactsImmediate() {
        binding.btnSyncContactsNow.isEnabled = false
        binding.btnSyncContactsNow.text = "⏳ 연락처 읽는 중..."

        activity.lifecycleScope.launch {
            try {
                val contacts = withContext(Dispatchers.IO) {
                    ContactReader.readAllContacts(activity)
                }

                if (contacts.isEmpty()) {
                    withContext(Dispatchers.Main) {
                        Toast.makeText(activity, "스마트폰에 저장된 연락처가 없습니다.", Toast.LENGTH_SHORT).show()
                        binding.btnSyncContactsNow.isEnabled = true
                        binding.btnSyncContactsNow.text = "📇 지금 즉시 전체 동기화"
                    }
                    return@launch
                }

                withContext(Dispatchers.Main) {
                    binding.btnSyncContactsNow.text = "⏳ 구글 시트 전송 중 (${contacts.size}건)..."
                }

                val email = prefs.userEmail ?: ""
                val result = withContext(Dispatchers.IO) {
                    ApiClient.syncContacts(
                        userEmail = email,
                        contacts = contacts,
                        isFullSync = true
                    )
                }

                withContext(Dispatchers.Main) {
                    binding.btnSyncContactsNow.isEnabled = true
                    binding.btnSyncContactsNow.text = "📇 지금 즉시 전체 동기화"

                    if (result.success) {
                        prefs.lastContactsSyncTime = System.currentTimeMillis()
                        prefs.lastContactsSyncCount = result.totalCount
                        if (result.spreadsheetUrl.isNotBlank()) {
                            prefs.setSheetUrl("CONTACTS", result.spreadsheetUrl)
                        }
                        updateContactsSyncStatusText()
                        Toast.makeText(
                            activity,
                            "🎉 연락처 ${result.totalCount}건 동기화 완료!",
                            Toast.LENGTH_LONG
                        ).show()
                    } else {
                        Toast.makeText(
                            activity,
                            "동기화 실패: ${result.error ?: "통신 오류"}",
                            Toast.LENGTH_SHORT
                        ).show()
                    }
                }
            } catch (e: Exception) {
                withContext(Dispatchers.Main) {
                    binding.btnSyncContactsNow.isEnabled = true
                    binding.btnSyncContactsNow.text = "📇 지금 즉시 전체 동기화"
                    Toast.makeText(activity, "오류 발생: ${e.message}", Toast.LENGTH_SHORT).show()
                }
            }
        }
    }

    /**
     * 카드 접기/펼치기 상태 복원
     */
    fun refreshCollapseState() {
        activity.updateCardCollapseState(
            binding.layoutContactsDetails,
            binding.btnToggleContactsDetails,
            prefs.isContactsDetailsHidden
        )
    }
}
