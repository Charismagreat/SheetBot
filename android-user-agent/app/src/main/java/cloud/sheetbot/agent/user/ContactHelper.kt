package cloud.sheetbot.agent.user

import android.content.Context
import android.content.pm.PackageManager
import android.net.Uri
import android.provider.ContactsContract
import androidx.core.content.ContextCompat

/**
 * 스마트폰 단말기 주소록(연락처) 조회 헬퍼
 * - 전화번호를 기반으로 저장된 상대방 이름을 실시간 매칭
 */
object ContactHelper {
    fun getContactName(context: Context, phoneNumber: String): String? {
        if (phoneNumber.isBlank()) return null

        val hasPermission = ContextCompat.checkSelfPermission(
            context,
            android.Manifest.permission.READ_CONTACTS
        ) == PackageManager.PERMISSION_GRANTED

        if (!hasPermission) return null

        var contactName: String? = null
        try {
            val uri = Uri.withAppendedPath(
                ContactsContract.PhoneLookup.CONTENT_FILTER_URI,
                Uri.encode(phoneNumber)
            )
            val projection = arrayOf(ContactsContract.PhoneLookup.DISPLAY_NAME)

            context.contentResolver.query(uri, projection, null, null, null)?.use { cursor ->
                if (cursor.moveToFirst()) {
                    val nameIdx = cursor.getColumnIndex(ContactsContract.PhoneLookup.DISPLAY_NAME)
                    if (nameIdx != -1) {
                        contactName = cursor.getString(nameIdx)
                    }
                }
            }
        } catch (_: Exception) {}

        return contactName?.takeIf { it.isNotBlank() }
    }
}
