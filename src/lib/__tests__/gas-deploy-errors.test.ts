import { describe, expect, it } from "vitest";
import {
  formatGasCloudPushUserError,
  isAppsScriptManagementQuotaError,
} from "../gas-deploy-errors";

describe("gas-deploy-errors", () => {
  it("detects management quota messages", () => {
    const msg =
      "Failed to read Apps Script project abc: Quota exceeded for quota metric 'Management requests' and limit 'Management requests per minute per user' of service 'script.googleapis.com'";
    expect(isAppsScriptManagementQuotaError(msg)).toBe(true);
  });

  it("returns quota-specific user copy", () => {
    const text = formatGasCloudPushUserError([
      "write_or_push: Quota exceeded for Management requests script.googleapis.com",
    ]);
    expect(text).toContain("1~2분");
    expect(text).not.toContain("EGDesk 로그");
  });

  it("returns generic copy for other failures", () => {
    const text = formatGasCloudPushUserError(["write_or_push: permission_denied"]);
    expect(text).toContain("EGDesk 로그");
  });
});
