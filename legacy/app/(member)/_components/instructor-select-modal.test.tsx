import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  linkMyInstructor,
  unlinkMyInstructor,
} from "@/app/(member)/_actions/instructor-linkage";
import type { InstructorBasicInfo } from "@/types/actions";
import { InstructorSelectModal } from "./instructor-select-modal";

// Server Actionsをモック
jest.mock("@/app/(member)/_actions/instructor-linkage", () => ({
  linkMyInstructor: jest.fn(),
  unlinkMyInstructor: jest.fn(),
}));

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

describe("InstructorSelectModal", () => {
  const mockOnSuccess = jest.fn();
  const mockOnOpenChange = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("Modal Display", () => {
    it("open=trueの場合、モーダルが表示される", () => {
      render(
        <InstructorSelectModal
          instructors={mockInstructors}
          onOpenChange={mockOnOpenChange}
          onSuccess={mockOnSuccess}
          open={true}
        />
      );

      expect(
        screen.getByText("インストラクター情報の設定")
      ).toBeInTheDocument();
    });

    it("open=falseの場合、モーダルが非表示", () => {
      render(
        <InstructorSelectModal
          instructors={mockInstructors}
          onOpenChange={mockOnOpenChange}
          onSuccess={mockOnSuccess}
          open={false}
        />
      );

      expect(
        screen.queryByText("インストラクター情報の設定")
      ).not.toBeInTheDocument();
    });

    it("タイトルが正しく表示される", () => {
      render(
        <InstructorSelectModal
          instructors={mockInstructors}
          onOpenChange={mockOnOpenChange}
          onSuccess={mockOnSuccess}
          open={true}
        />
      );

      expect(
        screen.getByText("インストラクター情報の設定")
      ).toBeInTheDocument();
    });
  });

  describe("Form Elements", () => {
    it("Selectコンポーネントが表示される", () => {
      render(
        <InstructorSelectModal
          instructors={mockInstructors}
          onOpenChange={mockOnOpenChange}
          onSuccess={mockOnSuccess}
          open={true}
        />
      );

      expect(screen.getByRole("combobox")).toBeInTheDocument();
      expect(screen.getByText("インストラクターを選択")).toBeInTheDocument();
    });

    it("currentInstructorIdがある場合、初期値として設定される", () => {
      render(
        <InstructorSelectModal
          currentInstructorId="test-instructor-1"
          instructors={mockInstructors}
          onOpenChange={mockOnOpenChange}
          onSuccess={mockOnSuccess}
          open={true}
        />
      );

      // currentInstructorIdが設定されている場合、comboboxに初期値が設定される
      const selectTrigger = screen.getByRole("combobox");
      expect(selectTrigger).toHaveTextContent("山田 太郎");
    });
  });

  describe("Link Action - Button State", () => {
    it("選択なしの場合、保存ボタンが無効化される", () => {
      render(
        <InstructorSelectModal
          instructors={mockInstructors}
          onOpenChange={mockOnOpenChange}
          onSuccess={mockOnSuccess}
          open={true}
        />
      );

      const saveButton = screen.getByRole("button", { name: "保存" });
      expect(saveButton).toBeDisabled();
    });

    it("currentInstructorIdがある場合、保存ボタンが有効化される", () => {
      render(
        <InstructorSelectModal
          currentInstructorId="test-instructor-1"
          instructors={mockInstructors}
          onOpenChange={mockOnOpenChange}
          onSuccess={mockOnSuccess}
          open={true}
        />
      );

      // 初期値が設定されているため保存ボタンが有効
      const saveButton = screen.getByRole("button", { name: "保存" });
      expect(saveButton).not.toBeDisabled();
    });
  });

  describe("Link Action - API Call", () => {
    it("保存ボタンをクリックするとlinkMyInstructorが呼ばれる", async () => {
      const user = userEvent.setup();
      (linkMyInstructor as jest.Mock).mockResolvedValue({ success: true });

      render(
        <InstructorSelectModal
          currentInstructorId="test-instructor-1"
          instructors={mockInstructors}
          onOpenChange={mockOnOpenChange}
          onSuccess={mockOnSuccess}
          open={true}
        />
      );

      const saveButton = screen.getByRole("button", { name: "保存" });
      await user.click(saveButton);

      await waitFor(() => {
        expect(linkMyInstructor).toHaveBeenCalledWith("test-instructor-1");
      });
    });

    it("成功時、onSuccessが呼ばれる", async () => {
      const user = userEvent.setup();
      (linkMyInstructor as jest.Mock).mockResolvedValue({ success: true });

      render(
        <InstructorSelectModal
          currentInstructorId="test-instructor-1"
          instructors={mockInstructors}
          onOpenChange={mockOnOpenChange}
          onSuccess={mockOnSuccess}
          open={true}
        />
      );

      const saveButton = screen.getByRole("button", { name: "保存" });
      await user.click(saveButton);

      await waitFor(() => {
        expect(mockOnSuccess).toHaveBeenCalledTimes(1);
      });
    });

    it("成功時、モーダルが閉じられる", async () => {
      const user = userEvent.setup();
      (linkMyInstructor as jest.Mock).mockResolvedValue({ success: true });

      render(
        <InstructorSelectModal
          currentInstructorId="test-instructor-1"
          instructors={mockInstructors}
          onOpenChange={mockOnOpenChange}
          onSuccess={mockOnSuccess}
          open={true}
        />
      );

      const saveButton = screen.getByRole("button", { name: "保存" });
      await user.click(saveButton);

      await waitFor(() => {
        expect(mockOnOpenChange).toHaveBeenCalledWith(false);
      });
    });
  });

  describe("Link Action - Error", () => {
    it("エラー時、エラーメッセージが表示される", async () => {
      const user = userEvent.setup();
      (linkMyInstructor as jest.Mock).mockResolvedValue({
        success: false,
        error: "データベースエラーが発生しました",
      });

      render(
        <InstructorSelectModal
          currentInstructorId="test-instructor-1"
          instructors={mockInstructors}
          onOpenChange={mockOnOpenChange}
          onSuccess={mockOnSuccess}
          open={true}
        />
      );

      const saveButton = screen.getByRole("button", { name: "保存" });
      await user.click(saveButton);

      await waitFor(() => {
        expect(
          screen.getByText("データベースエラーが発生しました")
        ).toBeInTheDocument();
      });
    });

    it("エラー時、モーダルは閉じられない", async () => {
      const user = userEvent.setup();
      (linkMyInstructor as jest.Mock).mockResolvedValue({
        success: false,
        error: "エラー",
      });

      render(
        <InstructorSelectModal
          currentInstructorId="test-instructor-1"
          instructors={mockInstructors}
          onOpenChange={mockOnOpenChange}
          onSuccess={mockOnSuccess}
          open={true}
        />
      );

      const saveButton = screen.getByRole("button", { name: "保存" });
      await user.click(saveButton);

      await waitFor(() => {
        expect(screen.getByText("エラー")).toBeInTheDocument();
      });

      // onOpenChangeがfalseで呼ばれていないことを確認
      expect(mockOnOpenChange).not.toHaveBeenCalledWith(false);
    });
  });

  describe("Unlink Action", () => {
    it("currentInstructorIdがない場合、解除ボタンが表示されない", () => {
      render(
        <InstructorSelectModal
          instructors={mockInstructors}
          onOpenChange={mockOnOpenChange}
          onSuccess={mockOnSuccess}
          open={true}
        />
      );

      expect(
        screen.queryByRole("button", { name: "紐付けを解除" })
      ).not.toBeInTheDocument();
    });

    it("currentInstructorIdがある場合、解除ボタンが表示される", () => {
      render(
        <InstructorSelectModal
          currentInstructorId="test-instructor-1"
          instructors={mockInstructors}
          onOpenChange={mockOnOpenChange}
          onSuccess={mockOnSuccess}
          open={true}
        />
      );

      expect(
        screen.getByRole("button", { name: "紐付けを解除" })
      ).toBeInTheDocument();
    });

    it("解除ボタンをクリックするとunlinkMyInstructorが呼ばれる", async () => {
      const user = userEvent.setup();
      (unlinkMyInstructor as jest.Mock).mockResolvedValue({ success: true });

      render(
        <InstructorSelectModal
          currentInstructorId="test-instructor-1"
          instructors={mockInstructors}
          onOpenChange={mockOnOpenChange}
          onSuccess={mockOnSuccess}
          open={true}
        />
      );

      await user.click(screen.getByRole("button", { name: "紐付けを解除" }));

      await waitFor(() => {
        expect(unlinkMyInstructor).toHaveBeenCalledTimes(1);
      });
    });

    it("解除成功時、onSuccessが呼ばれる", async () => {
      const user = userEvent.setup();
      (unlinkMyInstructor as jest.Mock).mockResolvedValue({ success: true });

      render(
        <InstructorSelectModal
          currentInstructorId="test-instructor-1"
          instructors={mockInstructors}
          onOpenChange={mockOnOpenChange}
          onSuccess={mockOnSuccess}
          open={true}
        />
      );

      await user.click(screen.getByRole("button", { name: "紐付けを解除" }));

      await waitFor(() => {
        expect(mockOnSuccess).toHaveBeenCalledTimes(1);
      });
    });

    it("解除成功時、モーダルが閉じられる", async () => {
      const user = userEvent.setup();
      (unlinkMyInstructor as jest.Mock).mockResolvedValue({ success: true });

      render(
        <InstructorSelectModal
          currentInstructorId="test-instructor-1"
          instructors={mockInstructors}
          onOpenChange={mockOnOpenChange}
          onSuccess={mockOnSuccess}
          open={true}
        />
      );

      await user.click(screen.getByRole("button", { name: "紐付けを解除" }));

      await waitFor(() => {
        expect(mockOnOpenChange).toHaveBeenCalledWith(false);
      });
    });
  });

  describe("Cancel Action", () => {
    it("キャンセルボタンをクリックするとモーダルが閉じられる", async () => {
      const user = userEvent.setup();

      render(
        <InstructorSelectModal
          instructors={mockInstructors}
          onOpenChange={mockOnOpenChange}
          onSuccess={mockOnSuccess}
          open={true}
        />
      );

      await user.click(screen.getByRole("button", { name: "キャンセル" }));

      expect(mockOnOpenChange).toHaveBeenCalledWith(false);
    });
  });

  describe("Accessibility", () => {
    it("Selectにid属性が設定されている", () => {
      render(
        <InstructorSelectModal
          instructors={mockInstructors}
          onOpenChange={mockOnOpenChange}
          onSuccess={mockOnSuccess}
          open={true}
        />
      );

      expect(screen.getByRole("combobox")).toHaveAttribute(
        "id",
        "instructor-select"
      );
    });

    it("ラベルとSelectが正しく関連付けられている", () => {
      render(
        <InstructorSelectModal
          instructors={mockInstructors}
          onOpenChange={mockOnOpenChange}
          onSuccess={mockOnSuccess}
          open={true}
        />
      );

      const label = screen.getByText("インストラクターを選択");
      expect(label).toHaveAttribute("for", "instructor-select");
    });

    it("ボタンがbutton要素として表示される", () => {
      render(
        <InstructorSelectModal
          currentInstructorId="test-instructor-1"
          instructors={mockInstructors}
          onOpenChange={mockOnOpenChange}
          onSuccess={mockOnSuccess}
          open={true}
        />
      );

      const buttons = screen.getAllByRole("button");
      // 少なくとも保存、キャンセル、解除ボタンが存在することを確認
      expect(buttons.length).toBeGreaterThanOrEqual(3);
      for (const button of buttons) {
        expect(button.tagName).toBe("BUTTON");
      }
    });
  });
});
