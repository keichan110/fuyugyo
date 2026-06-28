import type { NextRequest } from "next/server";
import { getClientIp } from "../request";

describe("getClientIp", () => {
  const createRequest = (
    options: {
      headers?: Record<string, string>;
      ip?: string | null;
      cfConnectingIp?: string | null;
    } = {}
  ): NextRequest => {
    const headerEntries = new Map<string, string>();
    for (const [key, value] of Object.entries(options.headers ?? {})) {
      headerEntries.set(key.toLowerCase(), value);
    }

    const headers = {
      get(name: string) {
        return headerEntries.get(name.toLowerCase()) ?? null;
      },
    } as unknown as Headers;

    const requestStub: Partial<NextRequest> & {
      headers: Headers;
      ip?: string | null;
      cf?: { connectingIP?: string | null } | null;
    } = {
      headers,
      ip: options.ip ?? null,
      cf: options.cfConnectingIp
        ? { connectingIP: options.cfConnectingIp }
        : null,
    };

    return requestStub as NextRequest;
  };

  it("prefers Cloudflare connecting IP header when available", () => {
    const request = createRequest({
      headers: {
        "cf-connecting-ip": "203.0.113.10",
        "x-forwarded-for": "198.51.100.20, 10.0.0.1",
      },
    });

    expect(getClientIp(request)).toBe("203.0.113.10");
  });

  it("uses Cloudflare runtime connectingIP when provided", () => {
    const request = createRequest({
      cfConnectingIp: "198.51.100.5",
    });

    expect(getClientIp(request)).toBe("198.51.100.5");
  });

  it("falls back to NextRequest.ip when proxy headers are absent", () => {
    const request = createRequest({
      ip: "192.0.2.15",
    });

    expect(getClientIp(request)).toBe("192.0.2.15");
  });

  it("falls back to first X-Forwarded-For entry as a last resort", () => {
    const request = createRequest({
      headers: {
        "x-forwarded-for": "198.51.100.20, 203.0.113.1",
      },
    });

    expect(getClientIp(request)).toBe("198.51.100.20");
  });

  it("ignores spoofed or malformed IP values", () => {
    const request = createRequest({
      headers: {
        "cf-connecting-ip": "bad\nvalue",
        "x-forwarded-for": "malicious\\value, 203.0.113.50",
      },
    });

    expect(getClientIp(request)).toBe("203.0.113.50");
  });

  it("handles IPv6 addresses with bracketed port notation", () => {
    const request = createRequest({
      headers: {
        "x-forwarded-for": "[2001:db8::1]:443, [2001:db8::2]",
      },
    });

    expect(getClientIp(request)).toBe("2001:db8::1");
  });

  it("accepts IPv4-mapped IPv6 addresses", () => {
    const request = createRequest({
      headers: {
        "x-forwarded-for": "::ffff:203.0.113.5",
      },
    });

    expect(getClientIp(request)).toBe("::ffff:203.0.113.5");
  });

  it("skips malformed IPv4-mapped IPv6 entries", () => {
    const request = createRequest({
      headers: {
        "x-forwarded-for": ":1.2.3.4, ::ffff:203.0.113.5",
      },
    });

    expect(getClientIp(request)).toBe("::ffff:203.0.113.5");
  });

  it("returns loopback IP when no headers are present", () => {
    const request = createRequest();

    expect(getClientIp(request)).toBe("127.0.0.1");
  });
});
