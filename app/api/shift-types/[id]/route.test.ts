import { NextRequest, NextResponse } from "next/server";
import { GET } from "./route";

type ShiftType = {
  id: number;
  name: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
};

// Prismaクライアントをモック化
const mockShiftTypeFindUnique = jest.fn();
const mockShiftTypeUpdate = jest.fn();
const mockPrismaClient = {
  shiftType: {
    findUnique: mockShiftTypeFindUnique,
    update: mockShiftTypeUpdate,
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

describe("GET /api/shift-types/[id]", () => {
  beforeEach(() => {
    jest.clearAllMocks();
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
    it("シフト種類詳細データが正しく返されること", async () => {
      // Arrange
      const mockShiftType: ShiftType = {
        id: 1,
        name: "レッスン",
        isActive: true,
        createdAt: new Date("2024-01-01"),
        updatedAt: new Date("2024-01-01"),
      };

      mockShiftTypeFindUnique.mockResolvedValue(mockShiftType);

      const mockContext = {
        params: Promise.resolve({ id: "1" }),
      };

      // Act
      await GET(new NextRequest("http://localhost"), mockContext);

      // Assert
      expect(mockShiftTypeFindUnique).toHaveBeenCalledWith({
        where: { id: 1 },
      });

      expect(mockNextResponse.json).toHaveBeenCalledWith(mockShiftType);
    });

    it("非アクティブなシフト種類でも正しく返されること", async () => {
      // Arrange
      const mockShiftType: ShiftType = {
        id: 2,
        name: "廃止されたレッスン",
        isActive: false,
        createdAt: new Date("2024-01-01"),
        updatedAt: new Date("2024-01-01"),
      };

      mockShiftTypeFindUnique.mockResolvedValue(mockShiftType);

      const mockContext = {
        params: Promise.resolve({ id: "2" }),
      };

      // Act
      await GET(new NextRequest("http://localhost"), mockContext);

      // Assert
      expect(mockNextResponse.json).toHaveBeenCalledWith(mockShiftType);
    });
  });

  describe("異常系", () => {
    it("存在しないシフト種類IDの場合は404エラーが返されること", async () => {
      // Arrange
      mockShiftTypeFindUnique.mockResolvedValue(null);

      const mockContext = {
        params: Promise.resolve({ id: "999" }),
      };

      // Act
      await GET(new NextRequest("http://localhost"), mockContext);

      // Assert
      expect(mockShiftTypeFindUnique).toHaveBeenCalledWith({
        where: { id: 999 },
      });

      expect(mockNextResponse.json).toHaveBeenCalledWith(
        {
          success: false,
          data: null,
          message: null,
          error: "Resource not found",
        },
        { status: 404 }
      );
    });

    it("不正なIDパラメータの場合は404エラーが返されること", async () => {
      // Arrange
      const mockContext = {
        params: Promise.resolve({ id: "invalid" }),
      };

      // Act
      await GET(new NextRequest("http://localhost"), mockContext);

      // Assert
      expect(mockShiftTypeFindUnique).not.toHaveBeenCalled();

      expect(mockNextResponse.json).toHaveBeenCalledWith(
        {
          success: false,
          data: null,
          message: null,
          error: "Resource not found",
        },
        { status: 404 }
      );
    });

    it("データベースエラーが発生した場合に500エラーが返されること", async () => {
      // Arrange
      const mockError = new Error("Database connection failed");
      mockShiftTypeFindUnique.mockRejectedValue(mockError);

      const mockContext = {
        params: Promise.resolve({ id: "1" }),
      };

      // Act
      await GET(new NextRequest("http://localhost"), mockContext);

      // Assert
      expect(mockShiftTypeFindUnique).toHaveBeenCalledWith({
        where: { id: 1 },
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
  });

  describe("データベースクエリ", () => {
    it("findUniqueが正しいパラメータで呼ばれること", async () => {
      // Arrange
      const mockShiftType: ShiftType = {
        id: 1,
        name: "テストシフト種類",
        isActive: true,
        createdAt: new Date("2024-01-01"),
        updatedAt: new Date("2024-01-01"),
      };
      mockShiftTypeFindUnique.mockResolvedValue(mockShiftType);

      const mockContext = {
        params: Promise.resolve({ id: "1" }),
      };

      // Act
      await GET(new NextRequest("http://localhost"), mockContext);

      // Assert
      expect(mockShiftTypeFindUnique).toHaveBeenCalledWith({
        where: { id: 1 },
      });
    });

    it("findUniqueが1回だけ呼ばれること", async () => {
      // Arrange
      mockShiftTypeFindUnique.mockResolvedValue(null);

      const mockContext = {
        params: Promise.resolve({ id: "1" }),
      };

      // Act
      await GET(new NextRequest("http://localhost"), mockContext);

      // Assert
      expect(mockShiftTypeFindUnique).toHaveBeenCalledTimes(1);
    });
  });
});
