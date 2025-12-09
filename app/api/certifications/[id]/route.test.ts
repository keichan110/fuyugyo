import { NextRequest, NextResponse } from "next/server";
import { authenticateFromRequest } from "@/lib/auth/middleware";
import { GET } from "./route";

// Prismaクライアントをモック化
const mockCertificationFindUnique = jest.fn();
const mockCertificationUpdate = jest.fn();
const mockPrismaClient = {
  certification: {
    findUnique: mockCertificationFindUnique,
    update: mockCertificationUpdate,
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

describe("GET /api/certifications/[id]", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // 認証成功をデフォルトでモック
    mockAuthenticateFromRequest.mockResolvedValue({
      success: true,
      user: {
        id: "1",
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
    it("資格詳細データがインストラクター情報付きで正しく返されること", async () => {
      // Arrange
      const mockCertificationFromDb = {
        id: 1,
        departmentId: 1,
        name: "スキー指導員",
        shortName: "指導員",
        organization: "SAJ",
        description: "スキー指導員資格",
        isActive: true,
        createdAt: new Date("2024-01-01"),
        updatedAt: new Date("2024-01-01"),
        department: {
          id: 1,
          name: "スキー",
        },
        instructorCertifications: [
          {
            instructor: {
              id: 1,
              lastName: "山田",
              firstName: "太郎",
              status: "ACTIVE",
            },
          },
          {
            instructor: {
              id: 2,
              lastName: "鈴木",
              firstName: "花子",
              status: "ACTIVE",
            },
          },
        ],
      };

      const expectedResponse = {
        id: 1,
        departmentId: 1,
        name: "スキー指導員",
        shortName: "指導員",
        organization: "SAJ",
        description: "スキー指導員資格",
        isActive: true,
        createdAt: new Date("2024-01-01"),
        updatedAt: new Date("2024-01-01"),
        department: {
          id: 1,
          name: "スキー",
        },
        instructors: [
          {
            id: 1,
            lastName: "山田",
            firstName: "太郎",
            status: "ACTIVE",
          },
          {
            id: 2,
            lastName: "鈴木",
            firstName: "花子",
            status: "ACTIVE",
          },
        ],
      };

      mockCertificationFindUnique.mockResolvedValue(mockCertificationFromDb);

      // ルートパラメータを模擬
      const mockContext = {
        params: Promise.resolve({ id: "1" }),
      };

      // Act
      await GET(new NextRequest("http://localhost"), mockContext);

      // Assert
      expect(mockCertificationFindUnique).toHaveBeenCalledWith({
        where: { id: 1 },
        include: {
          department: {
            select: {
              id: true,
              name: true,
            },
          },
          instructorCertifications: {
            include: {
              instructor: {
                select: {
                  id: true,
                  lastName: true,
                  firstName: true,
                  status: true,
                },
              },
            },
          },
        },
      });

      expect(mockNextResponse.json).toHaveBeenCalledWith({
        success: true,
        data: expectedResponse,
        message: null,
        error: null,
      });
    });

    it("インストラクターが関連付けられていない資格でも正しく返されること", async () => {
      // Arrange
      const mockCertificationFromDb = {
        id: 2,
        departmentId: 2,
        name: "スノーボード指導員",
        shortName: "指導員",
        organization: "JSBA",
        description: null,
        isActive: true,
        createdAt: new Date("2024-01-01"),
        updatedAt: new Date("2024-01-01"),
        department: {
          id: 2,
          name: "スノーボード",
        },
        instructorCertifications: [],
      };

      const expectedResponse = {
        id: 2,
        departmentId: 2,
        name: "スノーボード指導員",
        shortName: "指導員",
        organization: "JSBA",
        description: null,
        isActive: true,
        createdAt: new Date("2024-01-01"),
        updatedAt: new Date("2024-01-01"),
        department: {
          id: 2,
          name: "スノーボード",
        },
        instructors: [],
      };

      mockCertificationFindUnique.mockResolvedValue(mockCertificationFromDb);

      const mockContext = {
        params: Promise.resolve({ id: "2" }),
      };

      // Act
      await GET(new NextRequest("http://localhost"), mockContext);

      // Assert
      expect(mockNextResponse.json).toHaveBeenCalledWith({
        success: true,
        data: expectedResponse,
        message: null,
        error: null,
      });
    });
  });

  describe("異常系", () => {
    it("存在しない資格IDの場合は404エラーが返されること", async () => {
      // Arrange
      mockCertificationFindUnique.mockResolvedValue(null);

      const mockContext = {
        params: Promise.resolve({ id: "999" }),
      };

      // Act
      await GET(new NextRequest("http://localhost"), mockContext);

      // Assert
      expect(mockCertificationFindUnique).toHaveBeenCalledWith({
        where: { id: 999 },
        include: {
          department: {
            select: {
              id: true,
              name: true,
            },
          },
          instructorCertifications: {
            include: {
              instructor: {
                select: {
                  id: true,
                  lastName: true,
                  firstName: true,
                  status: true,
                },
              },
            },
          },
        },
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
      expect(mockCertificationFindUnique).not.toHaveBeenCalled();

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
      mockCertificationFindUnique.mockRejectedValue(mockError);

      const mockContext = {
        params: Promise.resolve({ id: "1" }),
      };

      // Act
      await GET(new NextRequest("http://localhost"), mockContext);

      // Assert
      expect(mockCertificationFindUnique).toHaveBeenCalledWith({
        where: { id: 1 },
        include: {
          department: {
            select: {
              id: true,
              name: true,
            },
          },
          instructorCertifications: {
            include: {
              instructor: {
                select: {
                  id: true,
                  lastName: true,
                  firstName: true,
                  status: true,
                },
              },
            },
          },
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
  });

  describe("データベースクエリ", () => {
    it("findUniqueが正しいパラメータで呼ばれること", async () => {
      // Arrange
      const mockCertificationFromDb = {
        id: 1,
        departmentId: 1,
        name: "Test Certification",
        shortName: "テスト",
        organization: "Test Org",
        description: null,
        isActive: true,
        createdAt: new Date("2024-01-01"),
        updatedAt: new Date("2024-01-01"),
        department: { id: 1, name: "Test Dept" },
        instructorCertifications: [],
      };
      mockCertificationFindUnique.mockResolvedValue(mockCertificationFromDb);

      const mockContext = {
        params: Promise.resolve({ id: "1" }),
      };

      // Act
      await GET(new NextRequest("http://localhost"), mockContext);

      // Assert
      expect(mockCertificationFindUnique).toHaveBeenCalledWith({
        where: { id: 1 },
        include: {
          department: {
            select: {
              id: true,
              name: true,
            },
          },
          instructorCertifications: {
            include: {
              instructor: {
                select: {
                  id: true,
                  lastName: true,
                  firstName: true,
                  status: true,
                },
              },
            },
          },
        },
      });
    });

    it("findUniqueが1回だけ呼ばれること", async () => {
      // Arrange
      mockCertificationFindUnique.mockResolvedValue(null);

      const mockContext = {
        params: Promise.resolve({ id: "1" }),
      };

      // Act
      await GET(new NextRequest("http://localhost"), mockContext);

      // Assert
      expect(mockCertificationFindUnique).toHaveBeenCalledTimes(1);
    });

    it("部門情報とインストラクター情報が適切にincludeされていること", async () => {
      // Arrange
      mockCertificationFindUnique.mockResolvedValue(null);

      const mockContext = {
        params: Promise.resolve({ id: "1" }),
      };

      // Act
      await GET(new NextRequest("http://localhost"), mockContext);

      // Assert
      expect(mockCertificationFindUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          include: {
            department: {
              select: {
                id: true,
                name: true,
              },
            },
            instructorCertifications: {
              include: {
                instructor: {
                  select: {
                    id: true,
                    lastName: true,
                    firstName: true,
                    status: true,
                  },
                },
              },
            },
          },
        })
      );
    });
  });
});
