import { NextRequest } from "next/server";
import { GET } from "../route";

// NextRequestをモック化
jest.mock("next/server", () => ({
  NextRequest: jest.fn((url, init) => ({
    url,
    ...init,
    headers: new Headers(init?.headers),
    cookies: {
      get: jest.fn().mockReturnValue({ value: "test-token" }),
    },
    nextUrl: {
      searchParams: new URL(url as string).searchParams,
    },
  })),
  NextResponse: {
    json: jest.fn((data, init) => ({
      status: init?.status ?? 200,
      json: async () => data,
    })),
  },
}));

// モック
jest.mock("@/lib/auth/middleware", () => ({
  withAuth: jest.fn(async () => ({
    result: { user: { id: 1, role: "MANAGER" } },
    errorResponse: null,
  })),
}));

jest.mock("@/lib/db", () => ({
  getPrisma: jest.fn(async () => ({
    shift: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
    },
    instructor: {
      findMany: jest.fn(),
    },
  })),
}));

describe("GET /api/usecases/shifts/edit-data", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should return 400 for missing required parameters", async () => {
    const request = new NextRequest(
      "http://localhost/api/usecases/shifts/edit-data?date=2025-01-15"
    );
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.success).toBe(false);
    expect(data.error).toContain("Missing required parameters");
  });

  it("should return 400 for invalid date format", async () => {
    const request = new NextRequest(
      "http://localhost/api/usecases/shifts/edit-data?date=invalid&departmentId=test-dept-1&shiftTypeId=test-shift-type-1"
    );
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.success).toBe(false);
  });

  // 注: 実際のデータベース操作を伴うテストは、統合テストまたはE2Eテストで実施することを推奨
  // このファイルではバリデーションロジックのテストに焦点を当てています
});
