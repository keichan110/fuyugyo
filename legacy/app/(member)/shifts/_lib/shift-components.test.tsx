import { fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import {
  createDepartmentSection,
  type DepartmentSectionOptions,
  generateInstructorChips,
  getDepartmentIcon,
  renderDepartmentSections,
} from "./shift-components";
import type { AssignedInstructor, ShiftSummary } from "./types";

// テスト用のモックデータ
const mockAssignedInstructors: AssignedInstructor[] = [
  {
    id: "instructor-1",
    displayName: "山田太郎",
    firstName: "太郎",
    lastName: "山田",
  },
  {
    id: "instructor-2",
    displayName: "鈴木花子",
    firstName: "花子",
    lastName: "鈴木",
  },
];

const mockShifts: ShiftSummary[] = [
  {
    type: "初級レッスン",
    department: "ski",
    count: 2,
    assignedInstructors: mockAssignedInstructors,
  },
  {
    type: "中級レッスン",
    department: "snowboard",
    count: 1,
    assignedInstructors: mockAssignedInstructors.slice(0, 1),
  },
];

const mockEmptyShifts: ShiftSummary[] = [];

describe("shiftComponents", () => {
  describe("generateInstructorChips", () => {
    it("インストラクターチップを正しく生成する", () => {
      const result = generateInstructorChips(mockAssignedInstructors, "ski");

      render(<div data-testid="chips-container">{result}</div>);

      expect(screen.getByText("山田太郎")).toBeInTheDocument();
      expect(screen.getByText("鈴木花子")).toBeInTheDocument();
    });

    it("空の配列に対して空の結果を返す", () => {
      const result = generateInstructorChips([], "ski");
      expect(result).toHaveLength(0);
    });
  });

  describe("getDepartmentIcon", () => {
    it("スキー部門のアイコンを返す", () => {
      const icon = getDepartmentIcon("ski");
      render(<div data-testid="icon-container">{icon}</div>);

      // アイコンが存在することを確認
      const container = screen.getByTestId("icon-container");
      expect(container.firstChild).toBeTruthy();
    });

    it("スノーボード部門のアイコンを返す", () => {
      const icon = getDepartmentIcon("snowboard");
      render(<div data-testid="icon-container">{icon}</div>);

      const container = screen.getByTestId("icon-container");
      expect(container.firstChild).toBeTruthy();
    });

    it("カスタムクラス名を適用する", () => {
      const customClass = "custom-class";
      const icon = getDepartmentIcon("ski", customClass);
      render(<div data-testid="icon-container">{icon}</div>);

      const container = screen.getByTestId("icon-container");
      expect(container.firstChild).toHaveClass(customClass);
    });
  });

  describe("createDepartmentSection", () => {
    const mockIcon = <div data-testid="mock-icon">Icon</div>;

    it("表示専用モード（clickable: false）でセクションを生成する", () => {
      const options: DepartmentSectionOptions = { clickable: false };

      const section = createDepartmentSection(
        "ski",
        mockShifts,
        mockIcon,
        options
      );
      render(<div>{section}</div>);

      expect(screen.getByText("スキー")).toBeInTheDocument();
      expect(screen.getByText("初級レッスン")).toBeInTheDocument();
      expect(screen.getByText("山田太郎")).toBeInTheDocument();
      expect(screen.getByText("鈴木花子")).toBeInTheDocument();
      expect(screen.getByText("2名")).toBeInTheDocument();
    });

    it("クリック可能モード（clickable: true）でセクションを生成する", () => {
      const mockOnShiftClick = jest.fn();
      const options: DepartmentSectionOptions = {
        clickable: true,
        onShiftClick: mockOnShiftClick,
        isLoading: false,
      };

      const section = createDepartmentSection(
        "ski",
        mockShifts,
        mockIcon,
        options
      );
      render(<div>{section}</div>);

      const shiftElement = screen.getByText("初級レッスン").closest("button");
      expect(shiftElement).toBeInTheDocument();

      if (shiftElement) {
        fireEvent.click(shiftElement);
        expect(mockOnShiftClick).toHaveBeenCalledWith("初級レッスン", "ski");
      }
    });

    it("ローディング状態でボタンが無効化される", () => {
      const mockOnShiftClick = jest.fn();
      const options: DepartmentSectionOptions = {
        clickable: true,
        onShiftClick: mockOnShiftClick,
        isLoading: true,
      };

      const section = createDepartmentSection(
        "ski",
        mockShifts,
        mockIcon,
        options
      );
      render(<div>{section}</div>);

      const shiftElement = screen.getByText("初級レッスン").closest("button");
      expect(shiftElement).toBeDisabled();
    });

    it("インストラクターが未配置の場合にメッセージを表示する", () => {
      const shiftsWithoutInstructors: ShiftSummary[] = [
        {
          type: "初級レッスン",
          department: "ski",
          count: 2,
          assignedInstructors: [],
        },
      ];
      const section = createDepartmentSection(
        "ski",
        shiftsWithoutInstructors,
        mockIcon
      );
      render(<div>{section}</div>);

      expect(screen.getByText("インストラクター未配置")).toBeInTheDocument();
    });

    it("指定された部門のシフトのみを表示する", () => {
      const section = createDepartmentSection("ski", mockShifts, mockIcon);
      render(<div>{section}</div>);

      expect(screen.getByText("初級レッスン")).toBeInTheDocument();
      expect(screen.queryByText("中級レッスン")).not.toBeInTheDocument();
      expect(screen.queryByText("共通受付")).not.toBeInTheDocument();
    });
  });

  describe("renderDepartmentSections", () => {
    it("全部門のセクションを生成する", () => {
      const sections = renderDepartmentSections(mockShifts);
      render(<div>{sections}</div>);

      expect(screen.getByText("スキー")).toBeInTheDocument();
      expect(screen.getByText("スノーボード")).toBeInTheDocument();
    });

    it("シフトがない部門のセクションは生成されない", () => {
      const skiOnlyShifts = mockShifts.filter((s) => s.department === "ski");
      const sections = renderDepartmentSections(skiOnlyShifts);
      render(<div>{sections}</div>);

      expect(screen.getByText("スキー")).toBeInTheDocument();
      expect(screen.queryByText("スノーボード")).not.toBeInTheDocument();
      expect(screen.queryByText("共通")).not.toBeInTheDocument();
    });

    it("空のシフト配列で空の結果を返す", () => {
      const sections = renderDepartmentSections(mockEmptyShifts);
      render(<div data-testid="sections-container">{sections}</div>);

      const container = screen.getByTestId("sections-container");
      expect(container).toBeEmptyDOMElement();
    });

    it("オプションを各セクションに正しく渡す", () => {
      const mockOnShiftClick = jest.fn();
      const options: DepartmentSectionOptions = {
        clickable: true,
        onShiftClick: mockOnShiftClick,
      };

      const sections = renderDepartmentSections(mockShifts, options);
      render(<div>{sections}</div>);

      const shiftElement = screen.getByText("初級レッスン").closest("button");
      expect(shiftElement).toBeInTheDocument();

      if (shiftElement) {
        fireEvent.click(shiftElement);
        expect(mockOnShiftClick).toHaveBeenCalledWith("初級レッスン", "ski");
      }
    });
  });

  describe("DepartmentSectionOptions型安全性", () => {
    it("全てのオプションが指定可能", () => {
      const fullOptions: DepartmentSectionOptions = {
        clickable: true,
        onShiftClick: jest.fn(),
        showEditButtons: true,
        isLoading: false,
      };

      const section = createDepartmentSection(
        "ski",
        mockShifts,
        <div>Icon</div>,
        fullOptions
      );
      expect(section).toBeTruthy();
    });

    it("部分的なオプションが指定可能", () => {
      const partialOptions: DepartmentSectionOptions = {
        clickable: false,
      };

      const section = createDepartmentSection(
        "ski",
        mockShifts,
        <div>Icon</div>,
        partialOptions
      );
      expect(section).toBeTruthy();
    });

    it("オプションなしでも動作する", () => {
      const section = createDepartmentSection(
        "ski",
        mockShifts,
        <div>Icon</div>
      );
      expect(section).toBeTruthy();
    });
  });
});
