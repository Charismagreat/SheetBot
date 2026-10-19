"use client";

import React, { useEffect, useState } from "react";
import QRCode from "qrcode";

interface QrCodeImageProps {
  /** QR에 인코딩할 문자열 */
  value: string;
  size?: number;
  alt?: string;
  className?: string;
}

/**
 * 브라우저 안에서 QR을 생성하는 컴포넌트 (외부 QR 서비스로 값이 전송되지 않음).
 * 페어링 토큰처럼 비밀 값을 담는 QR에 사용하세요. 자세한 내용은 QR_README.md 참고.
 */
export default function QrCodeImage({ value, size = 220, alt = "QR code", className }: QrCodeImageProps) {
  const [src, setSrc] = useState("");

  useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL(value, { width: size, margin: 2, errorCorrectionLevel: "M" })
      .then((url) => {
        if (!cancelled) setSrc(url);
      })
      .catch(() => {
        if (!cancelled) setSrc("");
      });
    return () => {
      cancelled = true;
    };
  }, [value, size]);

  if (!src) {
    return <div style={{ width: size, height: size }} className={className} aria-label={alt} />;
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={alt} width={size} height={size} className={className} />;
}
