import { describe, expect, it } from "vitest";
import { hashRuntimeToken, scriptIdMatchesProject } from "../runtime/runtime-token-persist";

describe("runtime-token-persist", () => {
  it("hashes tokens consistently", () => {
    expect(hashRuntimeToken("rt_abc")).toBe(hashRuntimeToken("rt_abc"));
    expect(hashRuntimeToken("rt_abc")).not.toBe(hashRuntimeToken("rt_xyz"));
  });

  it("matches scriptId to gas_project_id or script_id", () => {
    expect(scriptIdMatchesProject({ gas_project_id: "sid1" }, "sid1")).toBe(true);
    expect(scriptIdMatchesProject({ script_id: "sid2" }, "sid2")).toBe(true);
    expect(scriptIdMatchesProject({ gas_project_id: "a" }, "b")).toBe(false);
  });
});
