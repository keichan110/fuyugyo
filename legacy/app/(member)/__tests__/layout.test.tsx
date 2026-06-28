import type { PrismaClient } from "@prisma/client";
import { redirect } from "next/navigation";
import MemberLayout from "@/app/(member)/layout";
import {
  ACCESS_DENIED_REDIRECT,
  buildLoginRedirectUrl,
} from "@/lib/auth/auth-redirect";
import { ensureRole } from "@/lib/auth/role-guard";
import {
  getAvailableInstructors,
  getInstructorProfile,
} from "@/lib/data/instructor";

// Mock dependencies
jest.mock("next/navigation", () => ({
  redirect: jest.fn(),
}));

jest.mock("@/lib/auth/role-guard", () => ({
  ensureRole: jest.fn(),
}));

jest.mock("@/lib/auth/auth-redirect", () => ({
  ACCESS_DENIED_REDIRECT: "/",
  buildLoginRedirectUrl: jest.fn(),
}));

jest.mock("@/app/_providers/auth", () => ({
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock("@/app/_components/header/header-authenticated", () => ({
  HeaderAuthenticated: () => null,
}));

const mockPrismaClient = {
  instructor: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
  },
};

jest.mock("@/lib/db", () => ({
  getPrisma: jest.fn().mockResolvedValue(mockPrismaClient),
}));

jest.mock("@/lib/data/instructor", () => ({
  getInstructorProfile: jest.fn(),
  getAvailableInstructors: jest.fn(),
}));

type MockedEnsureRole = jest.MockedFunction<typeof ensureRole>;
type MockedRedirect = jest.MockedFunction<typeof redirect>;
type MockedBuildLoginRedirectUrl = jest.MockedFunction<
  typeof buildLoginRedirectUrl
>;
type MockedGetInstructorProfile = jest.MockedFunction<
  typeof getInstructorProfile
>;
type MockedGetAvailableInstructors = jest.MockedFunction<
  typeof getAvailableInstructors
>;
type MockedPrismaInstructorFindUnique = jest.MockedFunction<
  PrismaClient["instructor"]["findUnique"]
>;
type MockedPrismaInstructorFindMany = jest.MockedFunction<
  PrismaClient["instructor"]["findMany"]
>;

describe("MemberLayout", () => {
  const mockEnsureRole = ensureRole as MockedEnsureRole;
  const mockRedirect = redirect as MockedRedirect;
  const mockBuildLoginRedirectUrl =
    buildLoginRedirectUrl as MockedBuildLoginRedirectUrl;
  const mockGetInstructorProfile =
    getInstructorProfile as MockedGetInstructorProfile;
  const mockGetAvailableInstructors =
    getAvailableInstructors as MockedGetAvailableInstructors;
  const mockPrismaInstructorFindUnique = mockPrismaClient.instructor
    .findUnique as unknown as MockedPrismaInstructorFindUnique;
  const mockPrismaInstructorFindMany = mockPrismaClient.instructor
    .findMany as unknown as MockedPrismaInstructorFindMany;

  const mockUser = {
    id: "user_1",
    lineUserId: "line_1",
    displayName: "Test User",
    pictureUrl: null,
    role: "MEMBER" as const,
    instructorId: null,
    isActive: true,
    createdAt: new Date("2024-01-01"),
    updatedAt: new Date("2024-01-01"),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    // デフォルトのモック戻り値を設定
    mockGetInstructorProfile.mockResolvedValue(null);
    mockGetAvailableInstructors.mockResolvedValue([]);
    mockPrismaInstructorFindUnique.mockResolvedValue(null);
    mockPrismaInstructorFindMany.mockResolvedValue([]);
  });

  it("renders children when user has MEMBER role", async () => {
    mockEnsureRole.mockResolvedValue({
      status: "authorized",
      user: mockUser,
    });

    const result = await MemberLayout({
      children: <div>Test Content</div>,
    });

    expect(mockEnsureRole).toHaveBeenCalledWith({ atLeast: "MEMBER" });
    expect(mockRedirect).not.toHaveBeenCalled();
    expect(result).toBeTruthy();
  });

  it("renders children when user has MANAGER role", async () => {
    mockEnsureRole.mockResolvedValue({
      status: "authorized",
      user: { ...mockUser, role: "MANAGER" },
    });

    const result = await MemberLayout({
      children: <div>Test Content</div>,
    });

    expect(mockEnsureRole).toHaveBeenCalledWith({ atLeast: "MEMBER" });
    expect(mockRedirect).not.toHaveBeenCalled();
    expect(result).toBeTruthy();
  });

  it("renders children when user has ADMIN role", async () => {
    mockEnsureRole.mockResolvedValue({
      status: "authorized",
      user: { ...mockUser, role: "ADMIN" },
    });

    const result = await MemberLayout({
      children: <div>Test Content</div>,
    });

    expect(mockEnsureRole).toHaveBeenCalledWith({ atLeast: "MEMBER" });
    expect(mockRedirect).not.toHaveBeenCalled();
    expect(result).toBeTruthy();
  });

  it("redirects to login when user is unauthenticated", async () => {
    mockEnsureRole.mockResolvedValue({
      status: "unauthenticated",
    });
    mockBuildLoginRedirectUrl.mockResolvedValue("/login?redirect=%2F");
    mockRedirect.mockImplementation(() => {
      throw new Error("NEXT_REDIRECT");
    });

    await expect(
      MemberLayout({
        children: <div>Test Content</div>,
      })
    ).rejects.toThrow("NEXT_REDIRECT");

    expect(mockEnsureRole).toHaveBeenCalledWith({ atLeast: "MEMBER" });
    expect(mockBuildLoginRedirectUrl).toHaveBeenCalled();
    expect(mockRedirect).toHaveBeenCalledWith("/login?redirect=%2F");
  });

  it("redirects to access denied when user is forbidden", async () => {
    mockEnsureRole.mockResolvedValue({
      status: "forbidden",
      user: mockUser,
    });
    mockRedirect.mockImplementation(() => {
      throw new Error("NEXT_REDIRECT");
    });

    await expect(
      MemberLayout({
        children: <div>Test Content</div>,
      })
    ).rejects.toThrow("NEXT_REDIRECT");

    expect(mockEnsureRole).toHaveBeenCalledWith({ atLeast: "MEMBER" });
    expect(mockRedirect).toHaveBeenCalledWith(ACCESS_DENIED_REDIRECT);
  });
});
