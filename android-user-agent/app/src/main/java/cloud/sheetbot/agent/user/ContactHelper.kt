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
     * 문자열이 실제 전화번호 규격인지 판별 (연락처 이름과 전화번호 구분)
     */
    fun isValidPhoneNumber(raw: String): Boolean {
        if (raw.isBlank()) return false
        val clean = raw.trim()
        // 한글이나 알파벳이 1글자라도 포함되어 있으면 전화번호가 아닌 연락처명으로 판정
        if (clean.any { it in '가'..'힣' || it in 'ㄱ'..'ㅎ' || it in 'a'..'z' || it in 'A'..'Z' }) {
            return false
        }
        val digitsOnly = clean.replace("[^0-9]".toRegex(), "")
        // 최소 7자리 이상 숫자여야 유효한 한국 전화번호
        if (digitsOnly.length < 7) return false

        // 대표번호(15xx, 16xx, 18xx) 8자리이거나, 0 또는 +82로 시작
        return clean.startsWith("0") || clean.startsWith("+") || clean.startsWith("82") || 
               (digitsOnly.length == 8 && (digitsOnly.startsWith("15") || digitsOnly.startsWith("16") || digitsOnly.startsWith("18")))
    }

    /**
     * 국가코드(82) 제거 및 한국 표준 전화번호 형식(010-XXXX-XXXX, 1599-XXXX 등)으로 변환
     */
    fun formatPhoneNumber(raw: String): String {
        if (raw.isBlank()) return raw
        val cleanText = raw.trim()

        // 💡 한글이나 영문이 포함된 연락처 이름(예: "차민서2")은 전화번호 변환을 건너뛰고 원본 반환
        if (cleanText.any { it in '가'..'힣' || it in 'ㄱ'..'ㅎ' || it in 'a'..'z' || it in 'A'..'Z' }) {
            return cleanText
        }

        var clean = cleanText.replace("[^0-9+]".toRegex(), "").trim()
        if (clean.length < 7) {
            // 7자리 미만의 짧은 숫자는 유효한 전화번호가 아니므로 0 접두어를 억지로 붙이지 않음
            return cleanText
        }

        if (clean.startsWith("+82")) {
            clean = clean.removePrefix("+82")
        } else if (clean.startsWith("82") && clean.length >= 10) {
            clean = clean.removePrefix("82")
        }

        val noZero = clean.replace("^0+".toRegex(), "")
        // 대표번호 (15xx, 16xx, 18xx) 8자리
        if (noZero.length == 8 && (noZero.startsWith("15") || noZero.startsWith("16") || noZero.startsWith("18"))) {
            return "${noZero.substring(0, 4)}-${noZero.substring(4)}"
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

    /**
     * 주소록에서 이름으로 저장된 전화번호 역조회
     */
    fun getPhoneNumberByName(context: Context, name: String): String? {
        if (name.isBlank()) return null
        val hasPermission = ContextCompat.checkSelfPermission(
            context,
            android.Manifest.permission.READ_CONTACTS
        ) == PackageManager.PERMISSION_GRANTED

        if (!hasPermission) return null

        var phoneNumber: String? = null
        try {
            val uri = ContactsContract.CommonDataKinds.Phone.CONTENT_URI
            val projection = arrayOf(ContactsContract.CommonDataKinds.Phone.NUMBER)
            val selection = "${ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME} = ? OR ${ContactsContract.Data.DISPLAY_NAME} = ?"
            val selectionArgs = arrayOf(name.trim(), name.trim())

            context.contentResolver.query(uri, projection, selection, selectionArgs, null)?.use { cursor ->
                if (cursor.moveToFirst()) {
                    val numIdx = cursor.getColumnIndex(ContactsContract.CommonDataKinds.Phone.NUMBER)
                    if (numIdx != -1) {
                        phoneNumber = cursor.getString(numIdx)
                    }
                }
            }
        } catch (_: Exception) {}

        return phoneNumber?.let { formatPhoneNumber(it) }?.takeIf { it.isNotBlank() }
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
