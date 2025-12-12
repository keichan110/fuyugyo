/**
 * @jest-environment node
 */

import type { PrismaClient } from "@prisma/client";
import { NextRequest } from "next/server";

jest.mock("@/lib/auth/middleware", () => ({
  authenticateFromRequest: jest.fn(),
}));

// Prismaをモック化
const mockDepartmentFindUnique = jest.fn();
const mockPrismaClient = {
  department: {
    findUnique: mockDepartmentFindUnique,
  },
};

jest.mock("@/lib/db", () => ({
  getPrisma: jest.fn(async () => mockPrismaClient),
}));

import { authenticateFromRequest } from "@/lib/auth/middleware";
import { GET } from "./route";

const mockFindUnique = mockDepartmentFindUnique as jest.MockedFunction<
  PrismaClient["department"]["findUnique"]
>;
const mockAuthenticateFromRequest =
  authenticateFromRequest as jest.MockedFunction<
    typeof authenticateFromRequest
  >;

describe("/api/departments/[id] GET", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuthenticateFromRequest.mockResolvedValue({
      success: true,
      user: {
        id: "test-dept-1",
        lineUserId: "test-user",
        displayName: "Test User",
        role: "ADMIN",
        instructorId: null,
        pictureUrl: null,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });
  });

  it("認証に失敗した場合、401エラーを返す", async () => {
    mockAuthenticateFromRequest.mockResolvedValueOnce({
      success: false,
      error: "Authentication required",
    });

    const request = new NextRequest(
      "http://localhost:3000/api/departments/test-dept-1"
    );
    const response = await GET(request, {
      params: Promise.resolve({ id: "test-dept-1" }),
    });
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data).toEqual({
      success: false,
      data: null,
      message: null,
      error: "Authentication required",
    });
    expect(mockFindUnique).not.toHaveBeenCalled();
  });

  it("部門が存在する場合、部門詳細を返す", async () => {
    // テストデータを準備
    const mockDepartment = {
      id: "test-dept-1",
      code: "ski",
      name: "スキー",
      description: "スキー部門",
      isActive: true,
      createdAt: new Date("2024-01-01"),
      updatedAt: new Date("2024-01-01"),
    };

    mockFindUnique.mockResolvedValue(mockDepartment);

    // リクエストを作成
    const request = new NextRequest(
      "http://localhost:3000/api/departments/test-dept-1"
    );
    const response = await GET(request, {
      params: Promise.resolve({ id: "test-dept-1" }),
    });
    const data = await response.json();

    // レスポンスを検証
    expect(response.status).toBe(200);
    expect(data).toEqual({
      success: true,
      data: {
        id: "test-dept-1",
        code: "ski",
        name: "スキー",
        description: "スキー部門",
        isActive: true,
        createdAt: "2024-01-01T00:00:00.000Z",
        updatedAt: "2024-01-01T00:00:00.000Z",
      },
      message: null,
      error: null,
    });

    // Prismaクエリが正しく呼ばれたことを確認
    expect(mockFindUnique).toHaveBeenCalledWith({
      where: { id: "test-dept-1" },
    });
  });

  it("部門が存在しない場合、404エラーを返す", async () => {
    mockFindUnique.mockResolvedValue(null);

    const request = new NextRequest(
      "http://localhost:3000/api/departments/test-dept-nonexistent"
    );
    const response = await GET(request, {
      params: Promise.resolve({ id: "test-dept-nonexistent" }),
    });
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data).toEqual({
      success: false,
      data: null,
      message: null,
      error: "Resource not found",
    });
  });

  it("無効なIDパラメータの場合、404エラーを返す", async () => {
    const request = new NextRequest(
      "http://localhost:3000/api/departments/test-dept-invalid"
    );
    const response = await GET(request, {
      params: Promise.resolve({ id: "" }),
    });
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data).toEqual({
      success: false,
      data: null,
      message: null,
      error: "Resource not found",
    });

    // 無効なIDの場合はPrismaクエリが呼ばれないことを確認
    expect(mockFindUnique).not.toHaveBeenCalled();
  });

  it("データベースエラーが発生した場合、500エラーを返す", async () => {
    mockFindUnique.mockRejectedValue(new Error("Database error"));

    const request = new NextRequest(
      "http://localhost:3000/api/departments/test-dept-1"
    );
    const response = await GET(request, {
      params: Promise.resolve({ id: "test-dept-1" }),
    });
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data).toEqual({
      success: false,
      data: null,
      message: null,
      error: "Internal server error",
    });
  });
});
