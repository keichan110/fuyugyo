import { NextRequest, NextResponse } from "next/server";
import type { InstructorStatus } from "@/types/common";
import { GET } from "./route";

type InstructorWithCertifications = {
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
const mockInstructorFindUnique = jest.fn();
const mockInstructorUpdate = jest.fn();
const mockCertificationFindMany = jest.fn();
const mockInstructorCertificationDeleteMany = jest.fn();
const mockInstructorCertificationCreateMany = jest.fn();
const mockTransaction = jest.fn();
const mockPrismaClient = {
  instructor: {
    findUnique: mockInstructorFindUnique,
    update: mockInstructorUpdate,
  },
  certification: {
    findMany: mockCertificationFindMany,
  },
  instructorCertification: {
    deleteMany: mockInstructorCertificationDeleteMany,
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

describe("GET /api/instructors/[id]", () => {
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
    it("インストラクターの詳細情報が資格情報付きで正しく返されること", async () => {
      // Arrange
      const mockInstructor: InstructorWithCertifications = {
        id: "test-instructor-1",
        lastName: "山田",
        firstName: "太郎",
        lastNameKana: "ヤマダ",
        firstNameKana: "タロウ",
        status: "ACTIVE" as InstructorStatus,
        notes: "テストメモ",
        createdAt: new Date("2024-01-01T00:00:00.000Z"),
        updatedAt: new Date("2024-01-01T00:00:00.000Z"),
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
          {
            certification: {
              id: "test-certification-2",
              name: "スキー準指導員",
              shortName: "準指導員",
              organization: "SAJ",
              department: {
                id: "test-department-1",
                name: "スキー",
              },
            },
          },
        ],
      };

      mockInstructorFindUnique.mockResolvedValue(mockInstructor);

      const mockRequest = new NextRequest(
        "http://localhost:3000/api/instructors/test-instructor-1"
      );
      const context = { params: Promise.resolve({ id: "test-instructor-1" }) };

      // Act
      await GET(mockRequest, context);

      // Assert
      expect(mockInstructorFindUnique).toHaveBeenCalledWith({
        where: { id: "test-instructor-1" },
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
      });

      expect(mockNextResponse.json).toHaveBeenCalledWith({
        success: true,
        data: {
          id: "test-instructor-1",
          lastName: "山田",
          firstName: "太郎",
          lastNameKana: "ヤマダ",
          firstNameKana: "タロウ",
          status: "ACTIVE",
          notes: "テストメモ",
          createdAt: new Date("2024-01-01T00:00:00.000Z"),
          updatedAt: new Date("2024-01-01T00:00:00.000Z"),
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
            {
              id: "test-certification-2",
              name: "スキー準指導員",
              shortName: "準指導員",
              organization: "SAJ",
              department: {
                id: "test-department-1",
                name: "スキー",
              },
            },
          ],
        },
        message: "Instructor operation completed successfully",
        error: null,
      });
    });

    it("資格情報がないインストラクターでも正しく返されること", async () => {
      // Arrange
      const mockInstructor: InstructorWithCertifications = {
        id: "test-instructor-2",
        lastName: "佐藤",
        firstName: "花子",
        lastNameKana: null,
        firstNameKana: null,
        status: "INACTIVE" as InstructorStatus,
        notes: null,
        createdAt: new Date("2024-01-02T00:00:00.000Z"),
        updatedAt: new Date("2024-01-02T00:00:00.000Z"),
        certifications: [],
      };

      mockInstructorFindUnique.mockResolvedValue(mockInstructor);

      const mockRequest = new NextRequest(
        "http://localhost:3000/api/instructors/test-instructor-2"
      );
      const context = { params: Promise.resolve({ id: "test-instructor-2" }) };

      // Act
      await GET(mockRequest, context);

      // Assert
      expect(mockNextResponse.json).toHaveBeenCalledWith({
        success: true,
        data: {
          id: "test-instructor-2",
          lastName: "佐藤",
          firstName: "花子",
          lastNameKana: null,
          firstNameKana: null,
          status: "INACTIVE",
          notes: null,
          createdAt: new Date("2024-01-02T00:00:00.000Z"),
          updatedAt: new Date("2024-01-02T00:00:00.000Z"),
          certifications: [],
        },
        message: "Instructor operation completed successfully",
        error: null,
      });
    });

    it("文字列IDが正しく処理されること", async () => {
      // Arrange
      const mockInstructor: InstructorWithCertifications = {
        id: "test-instructor-3",
        lastName: "田中",
        firstName: "三郎",
        lastNameKana: "タナカ",
        firstNameKana: "サブロウ",
        status: "RETIRED" as InstructorStatus,
        notes: "退職済み",
        createdAt: new Date("2024-01-03T00:00:00.000Z"),
        updatedAt: new Date("2024-01-03T00:00:00.000Z"),
        certifications: [],
      };

      mockInstructorFindUnique.mockResolvedValue(mockInstructor);

      const mockRequest = new NextRequest(
        "http://localhost:3000/api/instructors/test-instructor-3"
      );
      const context = { params: Promise.resolve({ id: "test-instructor-3" }) };

      // Act
      await GET(mockRequest, context);

      // Assert
      expect(mockInstructorFindUnique).toHaveBeenCalledWith({
        where: { id: "test-instructor-3" },
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
      });
    });
  });

  describe("異常系", () => {
    it("存在しないIDが指定された場合に404エラーが返されること", async () => {
      // Arrange
      mockInstructorFindUnique.mockResolvedValue(null);

      const mockRequest = new NextRequest(
        "http://localhost:3000/api/instructors/test-instructor-nonexistent"
      );
      const context = {
        params: Promise.resolve({ id: "test-instructor-nonexistent" }),
      };

      // Act
      await GET(mockRequest, context);

      // Assert
      expect(mockInstructorFindUnique).toHaveBeenCalledWith({
        where: { id: "test-instructor-nonexistent" },
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

    it("データベースエラーが発生した場合に500エラーが返されること", async () => {
      // Arrange
      const mockError = new Error("Database connection failed");
      mockInstructorFindUnique.mockRejectedValue(mockError);

      const mockRequest = new NextRequest(
        "http://localhost:3000/api/instructors/test-instructor-1"
      );
      const context = { params: Promise.resolve({ id: "test-instructor-1" }) };

      // Act
      await GET(mockRequest, context);

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
    it("findUniqueが1回だけ呼ばれること", async () => {
      // Arrange
      const mockInstructor: InstructorWithCertifications = {
        id: "test-instructor-1",
        lastName: "山田",
        firstName: "太郎",
        lastNameKana: "ヤマダ",
        firstNameKana: "タロウ",
        status: "ACTIVE" as InstructorStatus,
        notes: null,
        createdAt: new Date("2024-01-01T00:00:00.000Z"),
        updatedAt: new Date("2024-01-01T00:00:00.000Z"),
        certifications: [],
      };

      mockInstructorFindUnique.mockResolvedValue(mockInstructor);

      const mockRequest = new NextRequest(
        "http://localhost:3000/api/instructors/test-instructor-1"
      );
      const context = { params: Promise.resolve({ id: "test-instructor-1" }) };

      // Act
      await GET(mockRequest, context);

      // Assert
      expect(mockInstructorFindUnique).toHaveBeenCalledTimes(1);
    });

    it("資格情報が適切にincludeされていること", async () => {
      // Arrange
      mockInstructorFindUnique.mockResolvedValue(null);

      const mockRequest = new NextRequest(
        "http://localhost:3000/api/instructors/test-instructor-1"
      );
      const context = { params: Promise.resolve({ id: "test-instructor-1" }) };

      // Act
      await GET(mockRequest, context);

      // Assert
      expect(mockInstructorFindUnique).toHaveBeenCalledWith(
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

    it("正しいwhere条件でクエリが実行されること", async () => {
      // Arrange
      mockInstructorFindUnique.mockResolvedValue(null);

      const mockRequest = new NextRequest(
        "http://localhost:3000/api/instructors/test-instructor-42"
      );
      const context = { params: Promise.resolve({ id: "test-instructor-42" }) };

      // Act
      await GET(mockRequest, context);

      // Assert
      expect(mockInstructorFindUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "test-instructor-42" },
        })
      );
    });
  });

  describe("レスポンス形式", () => {
    it("OpenAPI仕様に準拠したレスポンス形式で返されること", async () => {
      // Arrange
      const mockInstructor: InstructorWithCertifications = {
        id: "test-instructor-1",
        lastName: "山田",
        firstName: "太郎",
        lastNameKana: "ヤマダ",
        firstNameKana: "タロウ",
        status: "ACTIVE" as InstructorStatus,
        notes: null,
        createdAt: new Date("2024-01-01T00:00:00.000Z"),
        updatedAt: new Date("2024-01-01T00:00:00.000Z"),
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
      };

      mockInstructorFindUnique.mockResolvedValue(mockInstructor);

      const mockRequest = new NextRequest(
        "http://localhost:3000/api/instructors/test-instructor-1"
      );
      const context = { params: Promise.resolve({ id: "test-instructor-1" }) };

      // Act
      await GET(mockRequest, context);

      // Assert
      expect(mockNextResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: expect.any(Boolean),
          data: expect.objectContaining({
            id: expect.any(String),
            lastName: expect.any(String),
            firstName: expect.any(String),
            status: expect.stringMatching(/^(ACTIVE|INACTIVE|RETIRED)$/),
            certifications: expect.arrayContaining([
              expect.objectContaining({
                id: expect.any(String),
                name: expect.any(String),
                organization: expect.any(String),
                department: expect.objectContaining({
                  id: expect.any(String),
                  name: expect.any(String),
                }),
              }),
            ]),
          }),
          message: expect.any(String),
          error: null,
        })
      );
    });

    it("エラー時はOpenAPI仕様に準拠したエラーレスポンス形式で返されること", async () => {
      // Arrange
      mockInstructorFindUnique.mockResolvedValue(null);

      const mockRequest = new NextRequest(
        "http://localhost:3000/api/instructors/test-instructor-nonexistent"
      );
      const context = {
        params: Promise.resolve({ id: "test-instructor-nonexistent" }),
      };

      // Act
      await GET(mockRequest, context);

      // Assert
      expect(mockNextResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          data: null,
          message: null,
          error: expect.any(String),
        }),
        expect.objectContaining({
          status: expect.any(Number),
        })
      );
    });
  });
});
