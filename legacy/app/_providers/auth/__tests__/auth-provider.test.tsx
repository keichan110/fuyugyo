import { render, screen, waitFor } from "@testing-library/react";
import { AuthProvider, type User, useAuth } from "@/app/_providers/auth";

// Save original fetch implementation
const originalFetch = global.fetch;

// Mock fetch globally
const mockFetch = jest.fn();

describe("AuthProvider", () => {
  beforeAll(() => {
    global.fetch = mockFetch;
  });

  afterAll(() => {
    // Restore original fetch implementation
    global.fetch = originalFetch;
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  const mockUser: User = {
    id: "user_1",
    lineUserId: "line_1",
    displayName: "Test User",
    pictureUrl: null,
    role: "MEMBER",
    instructorId: null,
    isActive: true,
    createdAt: new Date("2024-01-01T00:00:00Z"),
    updatedAt: new Date("2024-01-01T00:00:00Z"),
  };

  const TestConsumer = () => {
    const { user, status } = useAuth();
    return (
      <div>
        <div data-testid="status">{status}</div>
        <div data-testid="user-name">{user?.displayName ?? "null"}</div>
        <div data-testid="user-role">{user?.role ?? "null"}</div>
      </div>
    );
  };

  describe("with initialUser and initialStatus", () => {
    it("initializes with provided user without additional fetch", async () => {
      render(
        <AuthProvider initialStatus="authenticated" initialUser={mockUser}>
          <TestConsumer />
        </AuthProvider>
      );

      // Should immediately show authenticated state
      expect(screen.getByTestId("status")).toHaveTextContent("authenticated");
      expect(screen.getByTestId("user-name")).toHaveTextContent("Test User");
      expect(screen.getByTestId("user-role")).toHaveTextContent("MEMBER");

      // No additional fetch should happen
      await waitFor(() => {
        expect(mockFetch).not.toHaveBeenCalled();
      });
    });

    it("initializes with unauthenticated status without fetch", async () => {
      render(
        <AuthProvider initialStatus="unauthenticated" initialUser={null}>
          <TestConsumer />
        </AuthProvider>
      );

      expect(screen.getByTestId("status")).toHaveTextContent("unauthenticated");
      expect(screen.getByTestId("user-name")).toHaveTextContent("null");

      await waitFor(() => {
        expect(mockFetch).not.toHaveBeenCalled();
      });
    });

    it("converts InitialUser (minimal user) to User type", async () => {
      const initialUser = {
        id: "user_2",
        lineUserId: "line_2",
        displayName: "Minimal User",
        pictureUrl: null,
        role: "ADMIN" as const,
      };

      render(
        <AuthProvider initialStatus="authenticated" initialUser={initialUser}>
          <TestConsumer />
        </AuthProvider>
      );

      expect(screen.getByTestId("status")).toHaveTextContent("authenticated");
      expect(screen.getByTestId("user-name")).toHaveTextContent("Minimal User");
      expect(screen.getByTestId("user-role")).toHaveTextContent("ADMIN");

      await waitFor(() => {
        expect(mockFetch).not.toHaveBeenCalled();
      });
    });
  });

  describe("without initialUser", () => {
    it("fetches user info on mount when initialUser is not provided", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          user: mockUser,
        }),
      });

      render(
        <AuthProvider>
          <TestConsumer />
        </AuthProvider>
      );

      // Should start with loading
      expect(screen.getByTestId("status")).toHaveTextContent("loading");

      // Should fetch user info
      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith("/api/auth/me", {
          method: "GET",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
          },
        });
      });

      // Should update to authenticated
      await waitFor(() => {
        expect(screen.getByTestId("status")).toHaveTextContent("authenticated");
        expect(screen.getByTestId("user-name")).toHaveTextContent("Test User");
      });
    });

    it("sets unauthenticated status when fetch returns null", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: "Unauthorized",
        json: async () => ({}),
      });

      render(
        <AuthProvider>
          <TestConsumer />
        </AuthProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId("status")).toHaveTextContent(
          "unauthenticated"
        );
        expect(screen.getByTestId("user-name")).toHaveTextContent("null");
      });
    });
  });

  describe("with initialUser but no initialStatus", () => {
    it("infers authenticated status from initialUser presence", async () => {
      render(
        <AuthProvider initialUser={mockUser}>
          <TestConsumer />
        </AuthProvider>
      );

      expect(screen.getByTestId("status")).toHaveTextContent("authenticated");
      expect(screen.getByTestId("user-name")).toHaveTextContent("Test User");

      // Should not fetch when user is provided
      await waitFor(() => {
        expect(mockFetch).not.toHaveBeenCalled();
      });
    });
  });

  describe("with initialStatus but no initialUser", () => {
    it("fetches user when only initialStatus is loading", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          user: mockUser,
        }),
      });

      render(
        <AuthProvider initialStatus="loading">
          <TestConsumer />
        </AuthProvider>
      );

      expect(screen.getByTestId("status")).toHaveTextContent("loading");

      // Should still fetch because initialUser is not provided
      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalled();
      });
    });
  });
});
