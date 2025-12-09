import { NextRequest, NextResponse } from "next/server";
import { authenticateFromRequest } from "@/lib/auth/middleware";
import { GET } from "./route";

type ShiftType = {
  id: number;
  name: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
};

// Prismaクライアントをモック化
const mockShiftTypeFindMany = jest.fn();
const mockShiftTypeCreate = jest.fn();
const mockPrismaClient = {
  shiftType: {
    findMany: mockShiftTypeFindMany,
    create: mockShiftTypeCreate,
  },
};

jest.mock("@/lib/db", () => ({
  getPrisma: jest.fn(async () => mockPrismaClient),
}));

// NextResponseとNextRequestをモック化
jest.mock("next/server", () => ({
  NextResponse: {
    json: jest.fn(),
  },
  NextRequest: jest.fn((url, init) => ({
    url,
    ...init,
    headers: new Headers(init?.headers),
    cookies: {
      get: jest.fn().mockReturnValue({ value: "test-token" }),
    },
    json: init?.body
      ? () => Promise.resolve(JSON.parse(init.body as string))
      : () => Promise.resolve({}),
    nextUrl: {
      searchParams: new URL(url as string).searchParams,
    },
  })),
}));

// 認証ミドルウェアをモック化
jest.mock("@/lib/auth/middleware", () => ({
  authenticateFromRequest: jest.fn(),
}));

const mockNextResponse = NextResponse as jest.Mocked<typeof NextResponse>;
const mockAuthenticateFromRequest =
  authenticateFromRequest as jest.MockedFunction<
    typeof authenticateFromRequest
  >;

describe("GET /api/shift-types", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // 認証成功をデフォルトでモック
    mockAuthenticateFromRequest.mockResolvedValue({
      success: true,
      user: {
        id: "1",
        lineUserId: "test-line-user",
        displayName: "Test User",
        pictureUrl: null,
        role: "ADMIN",
        instructorId: null,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });
    // NextResponse.jsonのデフォルトモック実装
    mockNextResponse.json.mockImplementation(
      (data, init) =>
        ({
          status: init?.status || 200,
          json: async () => data,
          cookies: {},
          headers: new Headers(),
          ok: true,
          redirected: false,
          statusText: "OK",
          type: "basic" as ResponseType,
          url: "",
          body: null,
          bodyUsed: false,
          clone: jest.fn(),
          arrayBuffer: jest.fn(),
          blob: jest.fn(),
          formData: jest.fn(),
          text: jest.fn(),
          [Symbol.for("NextResponse")]: true,
        }) as unknown as NextResponse
    );
  });

  describe("正常系", () => {
    it("シフト種類データが正しく返されること", async () => {
      // Arrange
      const mockShiftTypes: ShiftType[] = [
        {
          id: 1,
          name: "レッスン",
          isActive: true,
          createdAt: new Date("2024-01-01"),
          updatedAt: new Date("2024-01-01"),
        },
        {
          id: 2,
          name: "パトロール",
          isActive: true,
          createdAt: new Date("2024-01-01"),
          updatedAt: new Date("2024-01-01"),
        },
      ];

      mockShiftTypeFindMany.mockResolvedValue(mockShiftTypes);

      // Act
      await GET(new NextRequest("http://localhost"));

      // Assert
      expect(mockShiftTypeFindMany).toHaveBeenCalledWith({
        orderBy: {
          name: "asc",
        },
      });

      expect(mockNextResponse.json).toHaveBeenCalledWith({
        success: true,
        data: mockShiftTypes,
        count: 2,
        message: null,
        error: null,
      });
    });

    it("シフト種類データが空の場合でも正しく処理されること", async () => {
      // Arrange
      const mockShiftTypes: ShiftType[] = [];
      mockShiftTypeFindMany.mockResolvedValue(mockShiftTypes);

      // Act
      await GET(new NextRequest("http://localhost"));

      // Assert
      expect(mockShiftTypeFindMany).toHaveBeenCalledWith({
        orderBy: {
          name: "asc",
        },
      });

      expect(mockNextResponse.json).toHaveBeenCalledWith({
        success: true,
        data: [],
        count: 0,
        message: null,
        error: null,
      });
    });

    it("単一のシフト種類データが正しく返されること", async () => {
      // Arrange
      const mockShiftTypes: ShiftType[] = [
        {
          id: 1,
          name: "レッスン",
          isActive: true,
          createdAt: new Date("2024-01-01"),
          updatedAt: new Date("2024-01-01"),
        },
      ];

      mockShiftTypeFindMany.mockResolvedValue(mockShiftTypes);

      // Act
      await GET(new NextRequest("http://localhost"));

      // Assert
      expect(mockNextResponse.json).toHaveBeenCalledWith({
        success: true,
        data: mockShiftTypes,
        count: 1,
        message: null,
        error: null,
      });
    });
  });

  describe("異常系", () => {
    it("データベースエラーが発生した場合に500エラーが返されること", async () => {
      // Arrange
      const mockError = new Error("Database connection failed");
      mockShiftTypeFindMany.mockRejectedValue(mockError);

      // Act
      await GET(new NextRequest("http://localhost"));

      // Assert
      expect(mockShiftTypeFindMany).toHaveBeenCalledWith({
        orderBy: {
          name: "asc",
        },
      });

      expect(mockNextResponse.json).toHaveBeenCalledWith(
        {
          success: false,
          data: null,
          message: null,
          error: "Internal server error",
        },
        { status: 500 }
      );
    });

    it("Prismaの特定のエラーが発生した場合も適切に処理されること", async () => {
      // Arrange
      const mockError = new Error("P2002: Unique constraint failed");
      mockError.name = "PrismaClientKnownRequestError";
      mockShiftTypeFindMany.mockRejectedValue(mockError);

      // Act
      await GET(new NextRequest("http://localhost"));

      // Assert
      expect(mockNextResponse.json).toHaveBeenCalledWith(
        {
          success: false,
          data: null,
          message: null,
          error: "Internal server error",
        },
        { status: 500 }
      );
    });
  });

  describe("データベースクエリ", () => {
    it("シフト種類データが名前順（昇順）でソートされて取得されること", async () => {
      // Arrange
      const mockShiftTypes: Partial<ShiftType>[] = [
        { id: 2, name: "パトロール" },
        { id: 1, name: "レッスン" },
      ];
      mockShiftTypeFindMany.mockResolvedValue(mockShiftTypes as ShiftType[]);

      // Act
      await GET(new NextRequest("http://localhost"));

      // Assert
      expect(mockShiftTypeFindMany).toHaveBeenCalledWith({
        orderBy: {
          name: "asc",
        },
      });
    });

    it("findManyが1回だけ呼ばれること", async () => {
      // Arrange
      mockShiftTypeFindMany.mockResolvedValue([]);

      // Act
      await GET(new NextRequest("http://localhost"));

      // Assert
      expect(mockShiftTypeFindMany).toHaveBeenCalledTimes(1);
    });
  });
});
