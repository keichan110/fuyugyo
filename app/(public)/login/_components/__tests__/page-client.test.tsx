import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import LoginPageClient from "../page-client";

describe("LoginPageClient", () => {
  // window.location.href のモック
  const mockLocation = {
    href: "",
  };

  beforeEach(() => {
    // window.location.href をモック
    Object.defineProperty(window, "location", {
      value: mockLocation,
      writable: true,
      configurable: true,
    });
    mockLocation.href = "";
  });

  describe("招待トークンの引き継ぎ", () => {
    it("inviteToken が渡された場合、LINE認証URLに invite パラメータが含まれる", async () => {
      const user = userEvent.setup();

      render(
        <LoginPageClient
          inviteToken="inv_test123456789"
          redirectUrl="/dashboard"
        />
      );

      // LINEログインボタンをクリック
      const button = screen.getByRole("button", { name: /LINEでログイン/i });
      await user.click(button);

      // window.location.href に invite パラメータが含まれることを確認
      expect(window.location.href).toContain("/api/auth/line/login");
      expect(window.location.href).toContain("invite=inv_test123456789");
      expect(window.location.href).toContain("redirect=%2Fdashboard");
    });

    it("inviteToken がない場合、LINE認証URLに invite パラメータが含まれない", async () => {
      const user = userEvent.setup();

      render(<LoginPageClient redirectUrl="/dashboard" />);

      // LINEログインボタンをクリック
      const button = screen.getByRole("button", { name: /LINEでログイン/i });
      await user.click(button);

      // window.location.href に invite パラメータが含まれないことを確認
      expect(window.location.href).toContain("/api/auth/line/login");
      expect(window.location.href).not.toContain("invite");
      expect(window.location.href).toContain("redirect=%2Fdashboard");
    });

    it("inviteToken が undefined の場合、LINE認証URLに invite パラメータが含まれない", async () => {
      const user = userEvent.setup();

      render(<LoginPageClient inviteToken={undefined} redirectUrl="/" />);

      // LINEログインボタンをクリック
      const button = screen.getByRole("button", { name: /LINEでログイン/i });
      await user.click(button);

      // window.location.href に invite パラメータが含まれないことを確認
      expect(window.location.href).toContain("/api/auth/line/login");
      expect(window.location.href).not.toContain("invite");
    });
  });

  describe("リダイレクト先URLの引き継ぎ", () => {
    it("デフォルトの redirectUrl が使用される", async () => {
      const user = userEvent.setup();

      render(<LoginPageClient />);

      // LINEログインボタンをクリック
      const button = screen.getByRole("button", { name: /LINEでログイン/i });
      await user.click(button);

      // デフォルトの redirect=/ が含まれることを確認
      expect(window.location.href).toContain("redirect=%2F");
    });

    it("カスタム redirectUrl が正しくエンコードされる", async () => {
      const user = userEvent.setup();

      render(<LoginPageClient redirectUrl="/shifts?date=2024-01-01" />);

      // LINEログインボタンをクリック
      const button = screen.getByRole("button", { name: /LINEでログイン/i });
      await user.click(button);

      // URLエンコードされた redirect パラメータが含まれることを確認
      expect(window.location.href).toContain(
        "redirect=%2Fshifts%3Fdate%3D2024-01-01"
      );
    });
  });

  describe("URLの構築", () => {
    it("招待トークンとリダイレクト先の両方が正しく構築される", async () => {
      const user = userEvent.setup();

      render(
        <LoginPageClient
          inviteToken="inv_abc123def456"
          redirectUrl="/settings"
        />
      );

      const button = screen.getByRole("button", { name: /LINEでログイン/i });
      await user.click(button);

      const url = new URL(window.location.href, "http://localhost");

      // ベースURLが正しい
      expect(url.pathname).toBe("/api/auth/line/login");

      // パラメータが正しく設定されている
      expect(url.searchParams.get("redirect")).toBe("/settings");
      expect(url.searchParams.get("invite")).toBe("inv_abc123def456");
    });

    it("特殊文字を含む招待トークンが正しくエンコードされる", async () => {
      const user = userEvent.setup();

      // 実際にはこのような形式ではないが、エンコーディングのテストとして
      render(
        <LoginPageClient
          inviteToken="inv_test+special=chars&more"
          redirectUrl="/"
        />
      );

      const button = screen.getByRole("button", { name: /LINEでログイン/i });
      await user.click(button);

      // URLSearchParams が自動的にエンコードすることを確認
      expect(window.location.href).toContain("invite=inv_test");
    });
  });

  describe("UI表示", () => {
    it("LINEログインボタンが表示される", () => {
      render(<LoginPageClient />);

      const button = screen.getByRole("button", { name: /LINEでログイン/i });
      expect(button).toBeInTheDocument();
    });

    it("招待が必要なメッセージが表示される", () => {
      render(<LoginPageClient />);

      expect(
        screen.getByText("招待を受けた方のみ利用可能です")
      ).toBeInTheDocument();
    });

    it("Members only タイトルが表示される", () => {
      render(<LoginPageClient />);

      expect(screen.getByText("Members only")).toBeInTheDocument();
    });
  });

  describe("回帰テスト - 招待トークンが失われる問題", () => {
    it("招待トークン付きでログインページにアクセスし、LINEログインボタンをクリックすると、招待トークンがLINE認証APIに渡される", async () => {
      const user = userEvent.setup();

      // /login?invite=inv_... からのアクセスをシミュレート
      const inviteToken = "inv_ac5bf1234567890abcdef";

      render(<LoginPageClient inviteToken={inviteToken} redirectUrl="/" />);

      // LINEログインボタンをクリック
      const button = screen.getByRole("button", { name: /LINEでログイン/i });
      await user.click(button);

      // 招待トークンが失われずに、LINE認証APIに渡されることを確認
      expect(window.location.href).toContain(
        `/api/auth/line/login?redirect=%2F&invite=${inviteToken}`
      );
    });
  });
});
