import { NextResponse } from "next/server";

export type SheetbotErrorCode =
  | "LOGIN_REQUIRED"
  | "NOT_WRAPPED"
  | "INSUFFICIENT_BALANCE"
  | "SPEND_CAP_EXCEEDED"
  | "RATE_LIMITED"
  | "MANIFEST_VIOLATION"
  | "CONFLICT"
  | "INVALID_RUNTIME_AUTH"
  | "WRAP_IN_PROGRESS"
  | "IDEMPOTENCY_KEY_MISMATCH"
  | "PENDING_SETTLEMENT"
  | `WRAP_${string}`
  | "INTERNAL_ERROR";

export type SheetbotApiError = {
  code: SheetbotErrorCode;
  message: string;
  httpStatus: number;
  details?: {
    balance?: number;
    required?: number;
    rechargeUrl?: string;
    retryAfterSeconds?: number;
    spendCap?: { window: "daily" | "monthly"; used: number; limit: number };
    service?: string;
    tool?: string;
    manifestVersion?: string;
    conflictReason?: "wrap_in_progress" | "idempotency_mismatch" | "already_wrapped";
    settlementId?: string;
  };
};

export type SheetbotErrorResponse = { success: false; error: SheetbotApiError };

export class SheetbotServiceError extends Error {
  readonly apiError: SheetbotApiError;

  constructor(apiError: SheetbotApiError) {
    super(apiError.message);
    this.name = "SheetbotServiceError";
    this.apiError = apiError;
  }
}

export function sheetbotErrorResponse(err: SheetbotApiError): NextResponse {
  const headers: Record<string, string> = {};
  if (err.details?.retryAfterSeconds) {
    headers["Retry-After"] = String(err.details.retryAfterSeconds);
  }
  return NextResponse.json(
    { success: false, error: err },
    { status: err.httpStatus, headers },
  );
}

export function notWrappedError(message = "프로젝트가 아직 래핑되지 않았습니다. 먼저 wrap을 실행해 주세요."): SheetbotServiceError {
  return new SheetbotServiceError({
    code: "NOT_WRAPPED",
    message,
    httpStatus: 409,
  });
}

export function wrapInProgressError(retryAfterSeconds = 15): SheetbotServiceError {
  return new SheetbotServiceError({
    code: "WRAP_IN_PROGRESS",
    message: "동일 시트에 대한 래핑이 진행 중입니다. 잠시 후 다시 시도해 주세요.",
    httpStatus: 409,
    details: { conflictReason: "wrap_in_progress", retryAfterSeconds },
  });
}

export function insufficientBalanceError(balance: number, required: number): SheetbotServiceError {
  return new SheetbotServiceError({
    code: "INSUFFICIENT_BALANCE",
    message: `잔여 토큰이 부족합니다. (현재: ${balance.toLocaleString()} / 필요: ${required.toLocaleString()})`,
    httpStatus: 402,
    details: { balance, required, rechargeUrl: "https://sheetbot.cloud/dashboard/wallet" },
  });
}
