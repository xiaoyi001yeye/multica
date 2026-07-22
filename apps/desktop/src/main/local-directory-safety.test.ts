import { describe, expect, it } from "vitest";
import { isUnsafeLocalDirectoryPath } from "./local-directory-safety";

describe("isUnsafeLocalDirectoryPath", () => {
  it.each([
    "/",
    "/Users",
    "/Users/Shared",
    "/home",
    "/root",
    "/etc",
    "/tmp",
    "/private/tmp",
    "/var",
    "/usr",
    "/opt",
  ])(
    "rejects protected root %s",
    (path) => expect(isUnsafeLocalDirectoryPath(path, "/Users/me")).toBe(true),
  );

  it("rejects the current home but permits a project below it", () => {
    expect(isUnsafeLocalDirectoryPath("/Users/me", "/Users/me")).toBe(true);
    expect(isUnsafeLocalDirectoryPath("/Users/me/code/project", "/Users/me")).toBe(false);
  });
});
