package cloud.sheetbot.agent.user

import android.content.Context
import android.database.Cursor
import android.provider.ContactsContract
import android.util.Log
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

data class ContactDto(
    val id: String,
    val name: String,
    val mobile: String = "",
    val extraPhone: String = "",
    val email: String = "",
    val company: String = "",
    val title: String = "",
    val note: String = "",
    val address: String = "",
    val updatedAt: String = ""
)

object ContactReader {
    private const val TAG = "SheetBotContactReader"

    /**
     * 스마트폰 내 전체 연락처를 고속 추출하여 List<ContactDto> 형태로 반환
     * ContactsContract.Data.CONTENT_URI를 단일 배치 쿼리하여 수천 건도 1초 내 수집
     */
    fun readAllContacts(context: Context): List<ContactDto> {
        val contactsMap = LinkedHashMap<String, MutableContact>()
        val timeFormat = SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.KOREA)
        val nowStr = timeFormat.format(Date())

        val projection = arrayOf(
            ContactsContract.Data.CONTACT_ID,
            ContactsContract.Data.RAW_CONTACT_ID,
            ContactsContract.Data.DISPLAY_NAME,
            ContactsContract.Data.MIMETYPE,
            ContactsContract.Data.DATA1,
            ContactsContract.Data.DATA2,
            ContactsContract.Data.DATA3,
            ContactsContract.Data.DATA4
        )

        val selection = "${ContactsContract.Data.MIMETYPE} IN (?, ?, ?, ?, ?)"
        val selectionArgs = arrayOf(
            ContactsContract.CommonDataKinds.Phone.CONTENT_ITEM_TYPE,
            ContactsContract.CommonDataKinds.Email.CONTENT_ITEM_TYPE,
            ContactsContract.CommonDataKinds.Organization.CONTENT_ITEM_TYPE,
            ContactsContract.CommonDataKinds.StructuredPostal.CONTENT_ITEM_TYPE,
            ContactsContract.CommonDataKinds.Note.CONTENT_ITEM_TYPE
        )

        var cursor: Cursor? = null
        try {
            cursor = context.contentResolver.query(
                ContactsContract.Data.CONTENT_URI,
                projection,
                selection,
                selectionArgs,
                "${ContactsContract.Data.CONTACT_ID} ASC"
            )

            if (cursor != null) {
                val colContactId = cursor.getColumnIndex(ContactsContract.Data.CONTACT_ID)
                val colDisplayName = cursor.getColumnIndex(ContactsContract.Data.DISPLAY_NAME)
                val colMimeType = cursor.getColumnIndex(ContactsContract.Data.MIMETYPE)
                val colData1 = cursor.getColumnIndex(ContactsContract.Data.DATA1)
                val colData2 = cursor.getColumnIndex(ContactsContract.Data.DATA2)
                val colData3 = cursor.getColumnIndex(ContactsContract.Data.DATA3)

                while (cursor.moveToNext()) {
                    val contactId = cursor.getString(colContactId) ?: continue
                    val rawDisplayName = cursor.getString(colDisplayName) ?: "이름 없음"
                    val mimeType = cursor.getString(colMimeType) ?: continue
                    val data1 = cursor.getString(colData1) ?: ""

                    val contact = contactsMap.getOrPut(contactId) {
                        val initName = if (rawDisplayName.contains("BEGIN:VCARD")) "이름 없음" else rawDisplayName
                        MutableContact(id = contactId, name = initName, updatedAt = nowStr).also {
                            if (rawDisplayName.contains("BEGIN:VCARD")) {
                                populateFromVCard(it, rawDisplayName)
                            }
                        }
                    }

                    // 이름이 비어있었다면 업데이트
                    if (contact.name == "이름 없음" && rawDisplayName.isNotBlank() && !rawDisplayName.contains("BEGIN:VCARD")) {
                        contact.name = rawDisplayName
                    }

                    when (mimeType) {
                        ContactsContract.CommonDataKinds.Phone.CONTENT_ITEM_TYPE -> {
                            val phoneType = if (colData2 >= 0) cursor.getInt(colData2) else -1
                            val phoneNum = ContactHelper.formatPhoneNumber(data1.trim())
                            if (phoneNum.isNotBlank()) {
                                if (contact.mobile.isBlank()) {
                                    contact.mobile = phoneNum
                                } else if (contact.extraPhone.isBlank() && contact.mobile != phoneNum) {
                                    contact.extraPhone = phoneNum
                                }
                            }
                        }
                        ContactsContract.CommonDataKinds.Email.CONTENT_ITEM_TYPE -> {
                            if (contact.email.isBlank() && data1.isNotBlank()) {
                                contact.email = data1.trim()
                            }
                        }
                        ContactsContract.CommonDataKinds.Organization.CONTENT_ITEM_TYPE -> {
                            val company = data1.trim()
                            val title = if (colData3 >= 0) (cursor.getString(colData3) ?: "").trim() else ""
                            if (contact.company.isBlank() && company.isNotBlank()) {
                                contact.company = company
                            }
                            if (contact.title.isBlank() && title.isNotBlank()) {
                                contact.title = title
                            }
                        }
                        ContactsContract.CommonDataKinds.StructuredPostal.CONTENT_ITEM_TYPE -> {
                            if (contact.address.isBlank() && data1.isNotBlank()) {
                                contact.address = data1.trim()
                            }
                        }
                        ContactsContract.CommonDataKinds.Note.CONTENT_ITEM_TYPE -> {
                            if (contact.note.isBlank() && data1.isNotBlank()) {
                                contact.note = data1.trim()
                            }
                        }
                    }
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "연락처 일괄 조회 실패: ${e.message}", e)
        } finally {
            cursor?.close()
        }

        val resultList = contactsMap.values.map { it.toDto() }
        Log.i(TAG, "📱 스마트폰 연락처 추출 완료: 총 ${resultList.size}건")
        return resultList
    }

    /**
     * vCard 텍스트(BEGIN:VCARD...END:VCARD)가 연락처 이름 등에 통째로 저장된 경우
     * 성명, 전화번호, 회사, 직함, 이메일, 주소 등을 지능형으로 분해하여 매핑
     */
    private fun populateFromVCard(contact: MutableContact, vcardText: String) {
        val lines = vcardText.split("\n", "\r")
        val extraNotes = mutableListOf<String>()

        for (line in lines) {
            val trimmed = line.trim()
            if (trimmed.isEmpty() || trimmed.startsWith("BEGIN:") || trimmed.startsWith("END:") || trimmed.startsWith("VERSION:")) {
                continue
            }
            val colonIdx = trimmed.indexOf(":")
            if (colonIdx == -1) continue

            val keyPart = trimmed.substring(0, colonIdx).uppercase()
            val valPart = trimmed.substring(colonIdx + 1).trim()

            if (keyPart == "FN") {
                contact.name = valPart
            } else if (keyPart.startsWith("N") && (contact.name.isBlank() || contact.name == "이름 없음")) {
                val parts = valPart.split(";").map { it.trim() }.filter { it.isNotBlank() }
                if (parts.isNotEmpty()) contact.name = parts.joinToString("")
            } else if (keyPart.startsWith("ORG") && contact.company.isBlank()) {
                contact.company = valPart.replace(";", " ").trim()
            } else if (keyPart.startsWith("TITLE") && contact.title.isBlank()) {
                contact.title = valPart
            } else if (keyPart.startsWith("TEL")) {
                val phone = ContactHelper.formatPhoneNumber(valPart.replace(";", "").trim())
                if (phone.isNotBlank()) {
                    if (contact.mobile.isBlank()) {
                        contact.mobile = phone
                    } else if (contact.extraPhone.isBlank() && contact.mobile != phone) {
                        contact.extraPhone = phone
                    } else if (contact.mobile != phone && contact.extraPhone != phone) {
                        extraNotes.add("기타번호: $phone")
                    }
                }
            } else if (keyPart.startsWith("EMAIL") && contact.email.isBlank()) {
                contact.email = valPart
            } else if (keyPart.startsWith("ADR") && contact.address.isBlank()) {
                val cleanAddr = valPart.split(";").map { it.trim() }.filter { it.isNotBlank() }.joinToString(" ")
                contact.address = cleanAddr
            } else if (keyPart.startsWith("URL")) {
                extraNotes.add("웹사이트: $valPart")
            } else if (keyPart.startsWith("NOTE")) {
                extraNotes.add(valPart)
            }
        }

        if (extraNotes.isNotEmpty()) {
            val combined = extraNotes.joinToString(", ")
            contact.note = if (contact.note.isBlank()) combined else "${contact.note} | $combined"
        }
    }

    private class MutableContact(
        val id: String,
        var name: String,
        var mobile: String = "",
        var extraPhone: String = "",
        var email: String = "",
        var company: String = "",
        var title: String = "",
        var note: String = "",
        var address: String = "",
        var updatedAt: String = ""
    ) {
        fun toDto() = ContactDto(
            id = id,
            name = name,
            mobile = mobile,
            extraPhone = extraPhone,
            email = email,
            company = company,
            title = title,
            note = note,
            address = address,
            updatedAt = updatedAt
        )
    }
}
