import { describe, expect, it } from "vitest";
import {
  isBridgeGetAllowed,
  isProjectWrapped,
  isWrapLockActive,
  WRAP_LOCK_TTL_MS,
} from "../wrapping/project-wrapped";

describe("project-wrapped", () => {
  it("treats wrapped_at as wrapped", () => {
    expect(isProjectWrapped({ wrapped_at: "2026-01-01T00:00:00.000Z" })).toBe(true);
  });

  it("migration: gas_project_id without wrapped_at counts as wrapped", () => {
    expect(isProjectWrapped({ gas_project_id: "abc123" })).toBe(true);
    expect(isProjectWrapped({})).toBe(false);
  });

  it("allows bridge GET when spreadsheet is registered (pre-wrap quick-wrap)", () => {
    expect(isBridgeGetAllowed({ spreadsheet_id: "sheet123" })).toBe(true);
    expect(isBridgeGetAllowed({})).toBe(false);
  });

  it("detects active wrap lock within TTL", () => {
    const now = Date.now();
    expect(
      isWrapLockActive({ wrap_started_at: new Date(now - 1000).toISOString() }, now),
    ).toBe(true);
    expect(
      isWrapLockActive(
        { wrap_started_at: new Date(now - WRAP_LOCK_TTL_MS - 1000).toISOString() },
        now,
      ),
    ).toBe(false);
    expect(
      isWrapLockActive({
        wrap_started_at: new Date(now - 1000).toISOString(),
        wrapped_at: new Date(now).toISOString(),
      }, now),
    ).toBe(false);
  });
});
