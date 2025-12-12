import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { InstructorBasicInfo } from "@/types/actions";
import { InstructorLinkageButton } from "./instructor-linkage-button";

const mockInstructors: InstructorBasicInfo[] = [
  {
    id: "test-instructor-1",
    firstName: "太郎",
    lastName: "山田",
    firstNameKana: "タロウ",
    lastNameKana: "ヤマダ",
    status: "ACTIVE",
  },
  {
    id: "test-instructor-2",
    firstName: "花子",
    lastName: "佐藤",
    firstNameKana: "ハナコ",
    lastNameKana: "サトウ",
    status: "ACTIVE",
  },
];

describe("InstructorLinkageButton", () => {
  const mockOnSuccess = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("Rendering", () => {
    it("「設定」ボタンが表示される", () => {
      render(
        <InstructorLinkageButton
          instructors={mockInstructors}
          onSuccessAction={mockOnSuccess}
        />
      );

      expect(screen.getByRole("button", { name: "設定" })).toBeInTheDocument();
    });

    it("初期状態ではモーダルが非表示", () => {
      render(
        <InstructorLinkageButton
          instructors={mockInstructors}
          onSuccessAction={mockOnSuccess}
        />
      );

      expect(
        screen.queryByText("インストラクター情報の設定")
      ).not.toBeInTheDocument();
    });
  });

  describe("Interactions", () => {
    it("ボタンをクリックするとモーダルが開く", async () => {
      const user = userEvent.setup();

      render(
        <InstructorLinkageButton
          instructors={mockInstructors}
          onSuccessAction={mockOnSuccess}
        />
      );

      await user.click(screen.getByRole("button", { name: "設定" }));

      expect(
        screen.getByText("インストラクター情報の設定")
      ).toBeInTheDocument();
    });

    it("モーダルを閉じると再度非表示になる", async () => {
      const user = userEvent.setup();

      render(
        <InstructorLinkageButton
          instructors={mockInstructors}
          onSuccessAction={mockOnSuccess}
        />
      );

      // モーダルを開く
      await user.click(screen.getByRole("button", { name: "設定" }));
      expect(
        screen.getByText("インストラクター情報の設定")
      ).toBeInTheDocument();

      // キャンセルボタンでモーダルを閉じる
      await user.click(screen.getByRole("button", { name: "キャンセル" }));

      expect(
        screen.queryByText("インストラクター情報の設定")
      ).not.toBeInTheDocument();
    });
  });

  describe("Props Propagation", () => {
    it("instructors propがモーダルに正しく渡される", async () => {
      const user = userEvent.setup();

      render(
        <InstructorLinkageButton
          instructors={mockInstructors}
          onSuccessAction={mockOnSuccess}
        />
      );

      await user.click(screen.getByRole("button", { name: "設定" }));

      // モーダルが開いていることを確認
      expect(
        screen.getByText("インストラクター情報の設定")
      ).toBeInTheDocument();

      // Selectコンポーネントが表示されていることを確認
      expect(screen.getByRole("combobox")).toBeInTheDocument();
    });
  });

  describe("Accessibility", () => {
    it("ボタンがキーボードでアクセス可能", () => {
      render(
        <InstructorLinkageButton
          instructors={mockInstructors}
          onSuccessAction={mockOnSuccess}
        />
      );

      const button = screen.getByRole("button", { name: "設定" });
      // shadcn/uiのButtonコンポーネントはデフォルトでtype="button"を持つ
      expect(button).toBeInTheDocument();
      expect(button.tagName).toBe("BUTTON");
    });
  });
});
