import { NextRequest, NextResponse } from "next/server";
import { authenticateFromRequest } from "@/lib/auth/middleware";
import type { InstructorStatus } from "@/types/common";
import { GET } from "./route";

type Instructor = {
  id: string;
  lastName: string;
  firstName: string;
  lastNameKana: string | null;
  firstNameKana: string | null;
  status: InstructorStatus;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
  certifications: {
    certification: {
      id: string;
      name: string;
      shortName: string | null;
      organization: string;
      department: {
        id: string;
        name: string;
      };
    };
  }[];
};

// Prismaクライアントをモック化
const mockInstructorFindMany = jest.fn();
const mockInstructorCreate = jest.fn();
const mockInstructorFindUnique = jest.fn();
const mockCertificationFindMany = jest.fn();
const mockInstructorCertificationCreateMany = jest.fn();
const mockTransaction = jest.fn();
const mockPrismaClient = {
  instructor: {
    findMany: mockInstructorFindMany,
    create: mockInstructorCreate,
    findUnique: mockInstructorFindUnique,
  },
  certification: {
    findMany: mockCertificationFindMany,
  },
  instructorCertification: {
    createMany: mockInstructorCertificationCreateMany,
  },
  $transaction: mockTransaction,
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

describe("GET /api/instructors", () => {
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
    it("インストラクターデータが資格情報付きで正しく返されること", async () => {
      // Arrange
      const mockInstructors: Instructor[] = [
        {
          id: "test-instructor-1",
          lastName: "山田",
          firstName: "太郎",
          lastNameKana: "ヤマダ",
          firstNameKana: "タロウ",
          status: "ACTIVE" as InstructorStatus,
          notes: null,
          createdAt: new Date("2024-01-01"),
          updatedAt: new Date("2024-01-01"),
          certifications: [
            {
              certification: {
                id: "test-certification-1",
                name: "スキー指導員",
                shortName: "指導員",
                organization: "SAJ",
                department: {
                  id: "test-department-1",
                  name: "スキー",
                },
              },
            },
          ],
        },
        {
          id: "test-instructor-2",
          lastName: "佐藤",
          firstName: "花子",
          lastNameKana: "サトウ",
          firstNameKana: "ハナコ",
          status: "INACTIVE" as InstructorStatus,
          notes: "テストメモ",
          createdAt: new Date("2024-01-02"),
          updatedAt: new Date("2024-01-02"),
          certifications: [
            {
              certification: {
                id: "test-certification-2",
                name: "スノーボード指導員",
                shortName: "指導員",
                organization: "JSBA",
                department: {
                  id: "test-department-2",
                  name: "スノーボード",
                },
              },
            },
          ],
        },
      ];

      mockInstructorFindMany.mockResolvedValue(mockInstructors);

      const mockRequest = new NextRequest(
        "http://localhost:3000/api/instructors"
      );

      // Act
      await GET(mockRequest);

      // Assert
      expect(mockInstructorFindMany).toHaveBeenCalledWith({
        where: {},
        include: {
          certifications: {
            include: {
              certification: {
                include: {
                  department: {
                    select: {
                      id: true,
                      name: true,
                    },
                  },
                },
              },
            },
          },
        },
        orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      });

      expect(mockNextResponse.json).toHaveBeenCalledWith(
        {
          success: true,
          data: [
            {
              id: "test-instructor-1",
              lastName: "山田",
              firstName: "太郎",
              lastNameKana: "ヤマダ",
              firstNameKana: "タロウ",
              status: "ACTIVE",
              notes: null,
              createdAt: new Date("2024-01-01"),
              updatedAt: new Date("2024-01-01"),
              certifications: [
                {
                  id: "test-certification-1",
                  name: "スキー指導員",
                  shortName: "指導員",
                  organization: "SAJ",
                  department: {
                    id: "test-department-1",
                    name: "スキー",
                  },
                },
              ],
            },
            {
              id: "test-instructor-2",
              lastName: "佐藤",
              firstName: "花子",
              lastNameKana: "サトウ",
              firstNameKana: "ハナコ",
              status: "INACTIVE",
              notes: "テストメモ",
              createdAt: new Date("2024-01-02"),
              updatedAt: new Date("2024-01-02"),
              certifications: [
                {
                  id: "test-certification-2",
                  name: "スノーボード指導員",
                  shortName: "指導員",
                  organization: "JSBA",
                  department: {
                    id: "test-department-2",
                    name: "スノーボード",
                  },
                },
              ],
            },
          ],
          count: 2,
          message: null,
          error: null,
        },
        { status: 200 }
      );
    });

    it("statusパラメータでフィルタリングされること", async () => {
      // Arrange
      const mockInstructors: Instructor[] = [
        {
          id: "test-instructor-1",
          lastName: "山田",
          firstName: "太郎",
          lastNameKana: "ヤマダ",
          firstNameKana: "タロウ",
          status: "ACTIVE" as InstructorStatus,
          notes: null,
          createdAt: new Date("2024-01-01"),
          updatedAt: new Date("2024-01-01"),
          certifications: [],
        },
      ];

      mockInstructorFindMany.mockResolvedValue(mockInstructors);

      const mockRequest = new NextRequest(
        "http://localhost:3000/api/instructors?status=ACTIVE"
      );

      // Act
      await GET(mockRequest);

      // Assert
      expect(mockInstructorFindMany).toHaveBeenCalledWith({
        where: { status: "ACTIVE" },
        include: {
          certifications: {
            include: {
              certification: {
                include: {
                  department: {
                    select: {
                      id: true,
                      name: true,
                    },
                  },
                },
              },
            },
          },
        },
        orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      });
    });

    it("インストラクターデータが空の場合でも正しく処理されること", async () => {
      // Arrange
      const mockInstructors: Instructor[] = [];
      mockInstructorFindMany.mockResolvedValue(mockInstructors);

      const mockRequest = new NextRequest(
        "http://localhost:3000/api/instructors"
      );

      // Act
      await GET(mockRequest);

      // Assert
      expect(mockNextResponse.json).toHaveBeenCalledWith(
        {
          success: true,
          data: [],
          count: 0,
          message: null,
          error: null,
        },
        { status: 200 }
      );
    });
  });

  describe("異常系", () => {
    it("無効なstatusパラメータでバリデーションエラーが返されること", async () => {
      // Arrange
      const mockRequest = new NextRequest(
        "http://localhost:3000/api/instructors?status=INVALID"
      );

      // Act
      await GET(mockRequest);

      // Assert
      expect(mockInstructorFindMany).not.toHaveBeenCalled();
      expect(mockNextResponse.json).toHaveBeenCalledWith(
        {
          success: false,
          data: null,
          message: null,
          error:
            "Validation failed: status must be one of: ACTIVE, INACTIVE, RETIRED",
        },
        { status: 400 }
      );
    });

    it("データベースエラーが発生した場合に500エラーが返されること", async () => {
      // Arrange
      const mockError = new Error("Database connection failed");
      mockInstructorFindMany.mockRejectedValue(mockError);

      const mockRequest = new NextRequest(
        "http://localhost:3000/api/instructors"
      );

      // Act
      await GET(mockRequest);

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
    it("インストラクターデータが姓名順（昇順）でソートされて取得されること", async () => {
      // Arrange
      mockInstructorFindMany.mockResolvedValue([]);
      const mockRequest = new NextRequest(
        "http://localhost:3000/api/instructors"
      );

      // Act
      await GET(mockRequest);

      // Assert
      expect(mockInstructorFindMany).toHaveBeenCalledWith({
        where: {},
        include: {
          certifications: {
            include: {
              certification: {
                include: {
                  department: {
                    select: {
                      id: true,
                      name: true,
                    },
                  },
                },
              },
            },
          },
        },
        orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      });
    });

    it("findManyが1回だけ呼ばれること", async () => {
      // Arrange
      mockInstructorFindMany.mockResolvedValue([]);
      const mockRequest = new NextRequest(
        "http://localhost:3000/api/instructors"
      );

      // Act
      await GET(mockRequest);

      // Assert
      expect(mockInstructorFindMany).toHaveBeenCalledTimes(1);
    });

    it("資格情報が適切にincludeされていること", async () => {
      // Arrange
      mockInstructorFindMany.mockResolvedValue([]);
      const mockRequest = new NextRequest(
        "http://localhost:3000/api/instructors"
      );

      // Act
      await GET(mockRequest);

      // Assert
      expect(mockInstructorFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          include: {
            certifications: {
              include: {
                certification: {
                  include: {
                    department: {
                      select: {
                        id: true,
                        name: true,
                      },
                    },
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
