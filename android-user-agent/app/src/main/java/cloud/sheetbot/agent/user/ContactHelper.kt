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
    /**
     * 국가코드(82) 제거 및 한국 표준 전화번호 형식(010-XXXX-XXXX, 1599-XXXX 등)으로 변환
     */
    fun formatPhoneNumber(raw: String): String {
        if (raw.isBlank()) return raw
        var clean = raw.replace("[^0-9+]".toRegex(), "").trim()
        if (clean.startsWith("+82")) {
            clean = clean.removePrefix("+82")
        } else if (clean.startsWith("82") && clean.length >= 10) {
            clean = clean.removePrefix("82")
        }

        // 대표번호 (15xx, 16xx, 18xx) 8자리
        if (clean.length == 8 && (clean.startsWith("15") || clean.startsWith("16") || clean.startsWith("18"))) {
            return "${clean.substring(0, 4)}-${clean.substring(4)}"
        }

        if (!clean.startsWith("0")) {
            clean = "0$clean"
        }

        return when (clean.length) {
            11 -> "${clean.substring(0, 3)}-${clean.substring(3, 7)}-${clean.substring(7)}"
            10 -> {
                if (clean.startsWith("02")) {
                    "${clean.substring(0, 2)}-${clean.substring(2, 6)}-${clean.substring(6)}"
                } else {
                    "${clean.substring(0, 3)}-${clean.substring(3, 6)}-${clean.substring(6)}"
                }
            }
            9 -> {
                if (clean.startsWith("02")) {
                    "${clean.substring(0, 2)}-${clean.substring(2, 5)}-${clean.substring(5)}"
                } else clean
            }
            else -> clean
        }
    }

    fun getContactName(context: Context, phoneNumber: String): String? {
        if (phoneNumber.isBlank()) return null
        val normalized = formatPhoneNumber(phoneNumber)

        val hasPermission = ContextCompat.checkSelfPermission(
            context,
            android.Manifest.permission.READ_CONTACTS
        ) == PackageManager.PERMISSION_GRANTED

        if (!hasPermission) return null

        var contactName: String? = null
        try {
            val uri = Uri.withAppendedPath(
                ContactsContract.PhoneLookup.CONTENT_FILTER_URI,
                Uri.encode(normalized)
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

    fun isContactExists(context: Context, phoneNumber: String): Boolean {
        return getContactName(context, phoneNumber) != null
    }

    /**
     * 주소록에서 기존에 사용 중인 기본 계정(Google, Samsung 등) 감지
     * 계정 연동 시 해당 계정으로 저장되어 주소록 필터에서 숨겨지는 현상을 원천 방지
     */
    private fun getDefaultAccount(context: Context): Pair<String?, String?> {
        try {
            val projection = arrayOf(
                ContactsContract.RawContacts.ACCOUNT_NAME,
                ContactsContract.RawContacts.ACCOUNT_TYPE
            )
            val uri = ContactsContract.RawContacts.CONTENT_URI
            context.contentResolver.query(
                uri,
                projection,
                "${ContactsContract.RawContacts.ACCOUNT_NAME} IS NOT NULL",
                null,
                null
            )?.use { cursor ->
                if (cursor.moveToFirst()) {
                    val nameIdx = cursor.getColumnIndex(ContactsContract.RawContacts.ACCOUNT_NAME)
                    val typeIdx = cursor.getColumnIndex(ContactsContract.RawContacts.ACCOUNT_TYPE)
                    if (nameIdx != -1 && typeIdx != -1) {
                        val accName = cursor.getString(nameIdx)
                        val accType = cursor.getString(typeIdx)
                        if (!accName.isNullOrBlank() && !accType.isNullOrBlank()) {
                            return Pair(accName, accType)
                        }
                    }
                }
            }
        } catch (_: Exception) {}
        return Pair(null, null)
    }

    /**
     * 명함 OCR 분석 정보를 스마트폰 연락처(주소록)에 자동 등록
     */
    fun insertContact(
        context: Context,
        name: String,
        mobile: String,
        company: String? = null,
        title: String? = null,
        email: String? = null,
        address: String? = null,
        memo: String? = null
    ): Boolean {
        if (name.isBlank() && mobile.isBlank()) return false

        val hasPermission = ContextCompat.checkSelfPermission(
            context,
            android.Manifest.permission.WRITE_CONTACTS
        ) == PackageManager.PERMISSION_GRANTED

        if (!hasPermission) {
            android.util.Log.w("ContactHelper", "WRITE_CONTACTS 권한 없음 -> 주소록 저장 건너뜀")
            return false
        }

        try {
            val (accountName, accountType) = getDefaultAccount(context)
            val ops = ArrayList<android.content.ContentProviderOperation>()
            val rawContactInsertIndex = ops.size

            // 1. RawContact 생성 (기본 계정 바인딩)
            ops.add(
                android.content.ContentProviderOperation.newInsert(ContactsContract.RawContacts.CONTENT_URI)
                    .withValue(ContactsContract.RawContacts.ACCOUNT_TYPE, accountType)
                    .withValue(ContactsContract.RawContacts.ACCOUNT_NAME, accountName)
                    .build()
            )

            // 2. 성함 (Display Name)
            if (name.isNotBlank()) {
                ops.add(
                    android.content.ContentProviderOperation.newInsert(ContactsContract.Data.CONTENT_URI)
                        .withValueBackReference(ContactsContract.Data.RAW_CONTACT_ID, rawContactInsertIndex)
                        .withValue(ContactsContract.Data.MIMETYPE, ContactsContract.CommonDataKinds.StructuredName.CONTENT_ITEM_TYPE)
                        .withValue(ContactsContract.CommonDataKinds.StructuredName.DISPLAY_NAME, name.trim())
                        .build()
                )
            }

            // 3. 휴대전화번호
            if (mobile.isNotBlank()) {
                ops.add(
                    android.content.ContentProviderOperation.newInsert(ContactsContract.Data.CONTENT_URI)
                        .withValueBackReference(ContactsContract.Data.RAW_CONTACT_ID, rawContactInsertIndex)
                        .withValue(ContactsContract.Data.MIMETYPE, ContactsContract.CommonDataKinds.Phone.CONTENT_ITEM_TYPE)
                        .withValue(ContactsContract.CommonDataKinds.Phone.NUMBER, mobile.trim())
                        .withValue(ContactsContract.CommonDataKinds.Phone.TYPE, ContactsContract.CommonDataKinds.Phone.TYPE_MOBILE)
                        .build()
                )
            }

            // 4. 회사명 및 직함
            if (!company.isNullOrBlank() || !title.isNullOrBlank()) {
                val orgOp = android.content.ContentProviderOperation.newInsert(ContactsContract.Data.CONTENT_URI)
                    .withValueBackReference(ContactsContract.Data.RAW_CONTACT_ID, rawContactInsertIndex)
                    .withValue(ContactsContract.Data.MIMETYPE, ContactsContract.CommonDataKinds.Organization.CONTENT_ITEM_TYPE)
                if (!company.isNullOrBlank()) {
                    orgOp.withValue(ContactsContract.CommonDataKinds.Organization.COMPANY, company.trim())
                }
                if (!title.isNullOrBlank()) {
                    orgOp.withValue(ContactsContract.CommonDataKinds.Organization.TITLE, title.trim())
                }
                ops.add(orgOp.build())
            }

            // 5. 이메일
            if (!email.isNullOrBlank() && email.contains("@")) {
                ops.add(
                    android.content.ContentProviderOperation.newInsert(ContactsContract.Data.CONTENT_URI)
                        .withValueBackReference(ContactsContract.Data.RAW_CONTACT_ID, rawContactInsertIndex)
                        .withValue(ContactsContract.Data.MIMETYPE, ContactsContract.CommonDataKinds.Email.CONTENT_ITEM_TYPE)
                        .withValue(ContactsContract.CommonDataKinds.Email.DATA, email.trim())
                        .withValue(ContactsContract.CommonDataKinds.Email.TYPE, ContactsContract.CommonDataKinds.Email.TYPE_WORK)
                        .build()
                )
            }

            // 6. 회사 주소
            if (!address.isNullOrBlank() && address != "미기재") {
                ops.add(
                    android.content.ContentProviderOperation.newInsert(ContactsContract.Data.CONTENT_URI)
                        .withValueBackReference(ContactsContract.Data.RAW_CONTACT_ID, rawContactInsertIndex)
                        .withValue(ContactsContract.Data.MIMETYPE, ContactsContract.CommonDataKinds.StructuredPostal.CONTENT_ITEM_TYPE)
                        .withValue(ContactsContract.CommonDataKinds.StructuredPostal.FORMATTED_ADDRESS, address.trim())
                        .withValue(ContactsContract.CommonDataKinds.StructuredPostal.TYPE, ContactsContract.CommonDataKinds.StructuredPostal.TYPE_WORK)
                        .build()
                )
            }

            // 7. 메모 (출처 표기)
            val noteText = buildString {
                append("[SheetBot 스마트 명함 대장 등록]")
                if (!memo.isNullOrBlank()) append("\n$memo")
            }
            ops.add(
                android.content.ContentProviderOperation.newInsert(ContactsContract.Data.CONTENT_URI)
                    .withValueBackReference(ContactsContract.Data.RAW_CONTACT_ID, rawContactInsertIndex)
                    .withValue(ContactsContract.Data.MIMETYPE, ContactsContract.CommonDataKinds.Note.CONTENT_ITEM_TYPE)
                    .withValue(ContactsContract.CommonDataKinds.Note.NOTE, noteText)
                    .build()
            )

            context.contentResolver.applyBatch(ContactsContract.AUTHORITY, ops)
            android.util.Log.i("ContactHelper", "🎉 [주소록 저장 성공] $name ($mobile) -> account: $accountName")
            return true
        } catch (e: Exception) {
            android.util.Log.e("ContactHelper", "❌ [주소록 저장 예외] ${e.message}", e)
            return false
        }
    }
}
