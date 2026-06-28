import { authenticateFromCookies } from "@/lib/auth/middleware";
import {
  assertRole,
  ensureRole,
  requireAdmin,
  requireAuth,
  requireManagerAuth,
} from "@/lib/auth/role-guard";

type MockedAuthenticateFromCookies = jest.MockedFunction<
  typeof authenticateFromCookies
>;

jest.mock("@/lib/auth/middleware", () => ({
  authenticateFromCookies: jest.fn(),
}));

describe("auth helpers", () => {
  const mockAuthenticateFromCookies =
    authenticateFromCookies as MockedAuthenticateFromCookies;

  const baseUser = {
    id: "user_1",
    lineUserId: "line_1",
    displayName: "Test User",
    pictureUrl: null,
    role: "MEMBER" as const,
    instructorId: null,
    isActive: true,
    createdAt: new Date("2024-01-01T00:00:00Z"),
    updatedAt: new Date("2024-01-01T00:00:00Z"),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("requireManagerAuth", () => {
    it("returns user information when role is MANAGER", async () => {
      mockAuthenticateFromCookies.mockResolvedValue({
        success: true,
        user: { ...baseUser, role: "MANAGER" },
      });

      const user = await requireManagerAuth();

      expect(user.role).toBe("MANAGER");
    });

    it("returns user information when role is ADMIN", async () => {
      mockAuthenticateFromCookies.mockResolvedValue({
        success: true,
        user: { ...baseUser, role: "ADMIN" },
      });

      const user = await requireManagerAuth();

      expect(user.role).toBe("ADMIN");
    });

    it("throws when user is MEMBER", async () => {
      mockAuthenticateFromCookies.mockResolvedValue({
        success: true,
        user: { ...baseUser, role: "MEMBER" },
      });

      await expect(requireManagerAuth()).rejects.toThrow(
        "Forbidden: insufficient role"
      );
    });

    it("throws when authentication fails", async () => {
      mockAuthenticateFromCookies.mockResolvedValue({ success: false });

      await expect(requireManagerAuth()).rejects.toThrow("Unauthorized");
    });
  });

  describe("requireAdmin", () => {
    it("returns user information when role is ADMIN", async () => {
      mockAuthenticateFromCookies.mockResolvedValue({
        success: true,
        user: { ...baseUser, role: "ADMIN" },
      });

      const user = await requireAdmin();

      expect(user.role).toBe("ADMIN");
    });

    it("throws when user is MANAGER", async () => {
      mockAuthenticateFromCookies.mockResolvedValue({
        success: true,
        user: { ...baseUser, role: "MANAGER" },
      });

      await expect(requireAdmin()).rejects.toThrow(
        "Forbidden: insufficient role"
      );
    });

    it("throws when authentication fails", async () => {
      mockAuthenticateFromCookies.mockResolvedValue({ success: false });

      await expect(requireAdmin()).rejects.toThrow("Unauthorized");
    });
  });

  describe("requireAuth", () => {
    it("returns user information for MEMBER", async () => {
      mockAuthenticateFromCookies.mockResolvedValue({
        success: true,
        user: { ...baseUser, role: "MEMBER" },
      });

      const user = await requireAuth();

      expect(user.role).toBe("MEMBER");
    });

    it("returns user information for MANAGER", async () => {
      mockAuthenticateFromCookies.mockResolvedValue({
        success: true,
        user: { ...baseUser, role: "MANAGER" },
      });

      const user = await requireAuth();

      expect(user.role).toBe("MANAGER");
    });

    it("returns user information for ADMIN", async () => {
      mockAuthenticateFromCookies.mockResolvedValue({
        success: true,
        user: { ...baseUser, role: "ADMIN" },
      });

      const user = await requireAuth();

      expect(user.role).toBe("ADMIN");
    });

    it("throws when authentication fails", async () => {
      mockAuthenticateFromCookies.mockResolvedValue({ success: false });

      await expect(requireAuth()).rejects.toThrow("Unauthorized");
    });
  });

  describe("ensureRole", () => {
    it("returns authorized status for ADMIN when atLeast is ADMIN", async () => {
      mockAuthenticateFromCookies.mockResolvedValue({
        success: true,
        user: { ...baseUser, role: "ADMIN" },
      });

      const result = await ensureRole({ atLeast: "ADMIN" });

      expect(result.status).toBe("authorized");
      if (result.status === "authorized") {
        expect(result.user.role).toBe("ADMIN");
      }
    });

    it("returns authorized status for ADMIN when atLeast is MANAGER", async () => {
      mockAuthenticateFromCookies.mockResolvedValue({
        success: true,
        user: { ...baseUser, role: "ADMIN" },
      });

      const result = await ensureRole({ atLeast: "MANAGER" });

      expect(result.status).toBe("authorized");
      if (result.status === "authorized") {
        expect(result.user.role).toBe("ADMIN");
      }
    });

    it("returns authorized status for MANAGER when atLeast is MANAGER", async () => {
      mockAuthenticateFromCookies.mockResolvedValue({
        success: true,
        user: { ...baseUser, role: "MANAGER" },
      });

      const result = await ensureRole({ atLeast: "MANAGER" });

      expect(result.status).toBe("authorized");
      if (result.status === "authorized") {
        expect(result.user.role).toBe("MANAGER");
      }
    });

    it("returns forbidden status for MEMBER when atLeast is MANAGER", async () => {
      mockAuthenticateFromCookies.mockResolvedValue({
        success: true,
        user: { ...baseUser, role: "MEMBER" },
      });

      const result = await ensureRole({ atLeast: "MANAGER" });

      expect(result.status).toBe("forbidden");
      if (result.status === "forbidden") {
        expect(result.user.role).toBe("MEMBER");
      }
    });

    it("returns unauthenticated status when authentication fails", async () => {
      mockAuthenticateFromCookies.mockResolvedValue({ success: false });

      const result = await ensureRole({ atLeast: "MEMBER" });

      expect(result.status).toBe("unauthenticated");
    });
  });

  describe("assertRole", () => {
    it("returns user for ADMIN when atLeast is ADMIN", async () => {
      mockAuthenticateFromCookies.mockResolvedValue({
        success: true,
        user: { ...baseUser, role: "ADMIN" },
      });

      const user = await assertRole({ atLeast: "ADMIN" });

      expect(user.role).toBe("ADMIN");
    });

    it("throws UnauthorizedError when authentication fails", async () => {
      mockAuthenticateFromCookies.mockResolvedValue({ success: false });

      await expect(assertRole({ atLeast: "MEMBER" })).rejects.toThrow(
        "Unauthorized"
      );
    });

    it("throws ForbiddenError when role is insufficient", async () => {
      mockAuthenticateFromCookies.mockResolvedValue({
        success: true,
        user: { ...baseUser, role: "MEMBER" },
      });

      await expect(assertRole({ atLeast: "ADMIN" })).rejects.toThrow(
        "Forbidden: insufficient role"
      );
    });
  });
});
