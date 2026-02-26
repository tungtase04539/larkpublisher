import { describe, expect, it } from "vitest";

describe("Lark API credentials", () => {
  it("should obtain tenant_access_token with valid credentials", async () => {
    const appId = process.env.LARK_APP_ID;
    const appSecret = process.env.LARK_APP_SECRET;

    expect(appId).toBeTruthy();
    expect(appSecret).toBeTruthy();

    const response = await fetch(
      "https://open.larksuite.com/open-apis/auth/v3/tenant_access_token/internal",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ app_id: appId, app_secret: appSecret }),
      }
    );

    const data = await response.json();
    expect(data.code).toBe(0);
    expect(data.tenant_access_token).toBeTruthy();
    expect(data.msg).toBe("ok");
  });
});
