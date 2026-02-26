import { describe, expect, it } from "vitest";
import { parseWikiUrl, getTenantAccessToken, getWikiNodeInfo } from "./larkApi";

describe("larkApi", () => {
  describe("parseWikiUrl", () => {
    it("should parse larksuite wiki URL", () => {
      const result = parseWikiUrl(
        "https://congdongagi.sg.larksuite.com/wiki/F3vowG5L5iXVLdk6bhCl89h0gdh"
      );
      expect(result.nodeToken).toBe("F3vowG5L5iXVLdk6bhCl89h0gdh");
    });

    it("should parse feishu wiki URL", () => {
      const result = parseWikiUrl(
        "https://example.feishu.cn/wiki/ABC123DEF456"
      );
      expect(result.nodeToken).toBe("ABC123DEF456");
    });

    it("should throw on invalid URL", () => {
      expect(() => parseWikiUrl("https://example.com/not-a-wiki")).toThrow(
        "Invalid Wiki URL format"
      );
    });

    it("should throw on empty string", () => {
      expect(() => parseWikiUrl("")).toThrow("Invalid Wiki URL format");
    });
  });

  describe("getTenantAccessToken", () => {
    it("should obtain a valid token", async () => {
      const token = await getTenantAccessToken();
      expect(token).toBeTruthy();
      expect(typeof token).toBe("string");
      expect(token.length).toBeGreaterThan(10);
    });
  });

  describe("getWikiNodeInfo", () => {
    it("should get node info for a valid node token", async () => {
      const nodeInfo = await getWikiNodeInfo("F3vowG5L5iXVLdk6bhCl89h0gdh");
      expect(nodeInfo).toBeDefined();
      expect(nodeInfo.space_id).toBeTruthy();
      expect(nodeInfo.obj_token).toBeTruthy();
      expect(nodeInfo.title).toBeTruthy();
    });
  });
});
