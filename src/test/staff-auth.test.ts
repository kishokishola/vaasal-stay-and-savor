import { describe, expect, it } from "vitest";
import { staffAuthErrorMessage, staffPasswordResetActionSettings } from "@/lib/staff-auth";

describe("staff authentication helpers", () => {
  it("returns the right password-reset continuation URL on GitHub Pages", () => {
    expect(
      staffPasswordResetActionSettings("https://kishokishola.github.io", "/vaasal-stay-and-savor/"),
    ).toEqual({
      url: "https://kishokishola.github.io/vaasal-stay-and-savor/auth?passwordReset=complete",
    });
  });

  it("explains how administrators provision legacy staff accounts", () => {
    expect(
      staffAuthErrorMessage({ code: "auth/invalid-credential" }, "kishokishola.github.io"),
    ).toContain("create your Firebase staff account");
  });

  it("identifies the exact site domain that needs Firebase authorization", () => {
    expect(
      staffAuthErrorMessage({ code: "auth/unauthorized-domain" }, "kishokishola.github.io"),
    ).toContain("kishokishola.github.io");
  });
});
