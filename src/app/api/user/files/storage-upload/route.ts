export const dynamic = "force-dynamic";
export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserEmail } from "@/lib/auth";
import { saveUserFileToStorage, FileCategory } from "@/lib/user-file-storage";

/**
 * POST /api/user/files/storage-upload
 * 모바일 앱 또는 웹에서 전달받은 파일을 이지데스크 영구 스토리지에 저장하고 고유 영구 URL 발급
 */
export async function POST(req: NextRequest) {
  try {
    const contentType = req.headers.get("content-type") || "";

    let userEmail = "";
    let category: FileCategory = "general";
    let originalName = "upload.bin";
    let buffer: Buffer | null = null;
    let mimeType = "application/octet-stream";

    // 세션에서 이메일 자동 추출
    try {
      const sessionEmail = await getCurrentUserEmail();
      if (sessionEmail) userEmail = sessionEmail;
    } catch (_) {}

    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      const fileEntry = formData.get("file");
      const emailField = formData.get("userEmail") || formData.get("email");
      const categoryField = formData.get("category");

      if (emailField && typeof emailField === "string") {
        userEmail = emailField.trim();
      }
      if (categoryField && typeof categoryField === "string") {
        category = categoryField.trim().toLowerCase() as FileCategory;
      }

      if (!fileEntry || !(fileEntry instanceof Blob)) {
        return NextResponse.json(
          { success: false, error: "file binary is required in multipart form data" },
          { status: 400 }
        );
      }

      originalName = (fileEntry as any).name || "upload.bin";
      mimeType = fileEntry.type || "application/octet-stream";
      const arrayBuf = await fileEntry.arrayBuffer();
      buffer = Buffer.from(arrayBuf);
    } else {
      // JSON Base64 업로드 지원
      const body = await req.json();
      if (body.userEmail) userEmail = body.userEmail.trim();
      if (body.category) category = body.category.trim().toLowerCase() as FileCategory;
      if (body.fileName) originalName = body.fileName.trim();
      if (body.mimeType) mimeType = body.mimeType;

      if (!body.data && !body.base64) {
        return NextResponse.json(
          { success: false, error: "data or base64 field is required" },
          { status: 400 }
        );
      }

      let rawBase64 = body.data || body.base64;
      if (rawBase64.includes(";base64,")) {
        rawBase64 = rawBase64.split(";base64,")[1];
      }
      buffer = Buffer.from(rawBase64, "base64");
    }

    if (!buffer || buffer.length === 0) {
      return NextResponse.json(
        { success: false, error: "Empty file content" },
        { status: 400 }
      );
    }

    if (!userEmail) {
      userEmail = "chachogreat@gmail.com";
    }

    const storedResult = await saveUserFileToStorage({
      userEmail,
      category,
      fileName: originalName,
      buffer,
      mimeType,
    });

    return NextResponse.json({
      success: true,
      fileId: storedResult.id,
      storedFileName: storedResult.storedFileName,
      publicUrl: storedResult.publicUrl,
      fileSize: storedResult.fileSize,
      mimeType: storedResult.mimeType,
      category: storedResult.category,
      message: "이지데스크 전용 스토리지에 안전하게 영구 저장되었습니다.",
    });
  } catch (err: any) {
    console.error("[StorageUpload] Error:", err);
    return NextResponse.json(
      { success: false, error: "Upload failed", details: err.message },
      { status: 500 }
    );
  }
}
