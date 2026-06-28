/**
 * Rate Limiting Test
 */

import {
  checkRateLimit,
  clearRateLimitStore,
  getRateLimitStatus,
} from "../rate-limiting";

describe("Rate Limiting", () => {
  beforeEach(() => {
    clearRateLimitStore();
  });

  it("should allow requests within general API limit", () => {
    const ip = "127.0.0.1";
    const pathname = "/api/health";

    const result1 = checkRateLimit(ip, pathname);
    expect(result1.allowed).toBe(true);
    expect(result1.remaining).toBe(99);
    expect(result1.limit).toBe(100);
    expect(result1.ruleId).toBe("api-general");

    const result2 = checkRateLimit(ip, pathname);
    expect(result2.allowed).toBe(true);
    expect(result2.remaining).toBe(98);
    expect(result2.ruleId).toBe("api-general");
  });

  it("should block requests when general limit exceeded", () => {
    const ip = "127.0.0.1";
    const pathname = "/api/health";

    for (let i = 0; i < 100; i++) {
      const result = checkRateLimit(ip, pathname);
      expect(result.allowed).toBe(true);
      expect(result.ruleId).toBe("api-general");
    }

    const exceeded = checkRateLimit(ip, pathname);
    expect(exceeded.allowed).toBe(false);
    expect(exceeded.remaining).toBe(0);
    expect(exceeded.ruleId).toBe("api-general");
  });

  it("should apply different limits for auth APIs", () => {
    const ip = "127.0.0.1";
    const authPath = "/api/auth/login";

    for (let i = 0; i < 10; i++) {
      const result = checkRateLimit(ip, authPath);
      expect(result.allowed).toBe(true);
      expect(result.ruleId).toBe("auth-general");
    }

    const exceeded = checkRateLimit(ip, authPath);
    expect(exceeded.allowed).toBe(false);
    expect(exceeded.limit).toBe(10);
    expect(exceeded.ruleId).toBe("auth-general");
  });

  it("should enforce stricter limit for invitation verification", () => {
    const ip = "127.0.0.1";
    const verifyPath = "/api/auth/invitations/demo-token/verify";

    for (let i = 0; i < 5; i++) {
      const result = checkRateLimit(ip, verifyPath);
      expect(result.allowed).toBe(true);
      expect(result.limit).toBe(5);
      expect(result.ruleId).toBe("auth-invitation-verify");
    }

    const exceeded = checkRateLimit(ip, verifyPath);
    expect(exceeded.allowed).toBe(false);
    expect(exceeded.remaining).toBe(0);
    expect(exceeded.ruleId).toBe("auth-invitation-verify");
  });

  it("should enforce stricter limit for LINE login endpoint", () => {
    const ip = "127.0.0.1";
    const loginPath = "/api/auth/line/login";

    for (let i = 0; i < 5; i++) {
      const result = checkRateLimit(ip, loginPath);
      expect(result.allowed).toBe(true);
      expect(result.limit).toBe(5);
      expect(result.ruleId).toBe("auth-line-login");
    }

    const exceeded = checkRateLimit(ip, loginPath);
    expect(exceeded.allowed).toBe(false);
    expect(exceeded.remaining).toBe(0);
    expect(exceeded.ruleId).toBe("auth-line-login");
  });

  it("should track different IPs separately", () => {
    const pathname = "/api/health";

    for (let i = 0; i < 100; i++) {
      checkRateLimit("192.168.1.1", pathname);
    }
    const result1 = checkRateLimit("192.168.1.1", pathname);
    expect(result1.allowed).toBe(false);
    expect(result1.ruleId).toBe("api-general");

    const result2 = checkRateLimit("192.168.1.2", pathname);
    expect(result2.allowed).toBe(true);
    expect(result2.remaining).toBe(99);
    expect(result2.ruleId).toBe("api-general");
  });

  it("should provide rate limit status grouped by bucket", () => {
    checkRateLimit("127.0.0.1", "/api/health");
    checkRateLimit("127.0.0.1", "/api/auth/login");
    checkRateLimit("127.0.0.1", "/api/auth/line/login");

    const status = getRateLimitStatus();
    expect(status.totalEntries).toBe(3);
    expect(status.buckets["api-general"]).toBe(1);
    expect(status.buckets["auth-general"]).toBe(1);
    expect(status.buckets["auth-line-login"]).toBe(1);
  });
});
