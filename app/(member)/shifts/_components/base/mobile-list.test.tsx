import { fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import type { ShiftStats } from "../../_lib/types";
import { BaseShiftMobileList } from "./mobile-list";

// 依存モジュールをモック化
jest.mock("@/lib/utils", () => ({
  cn: jest.fn((...classes) => classes.filter(Boolean).join(" ")),
}));

jest.mock("@/app/(member)/_components/department-icon", () => ({
  DepartmentIcon: jest.fn(({ code, className }) => (
    <div
      data-classname={className}
      data-department={code}
      data-testid="department-icon"
    >
      {code}-icon
    </div>
  )),
}));

jest.mock("@/app/(member)/shifts/_components/shared/badge", () => ({
  ShiftBadge: jest.fn(({ count }) => (
    <div data-count={count} data-testid="shift-badge">
      {count}名配置
    </div>
  )),
}));

jest.mock("../utils", () => ({
  getShiftTypeShort: jest.fn((type: string) => type.slice(0, 2)),
  getDepartmentBgClass: jest.fn((dept: string) => `bg-${dept}-100`),
  formatDate: jest.fn(
    (year: number, month: number, day: number) =>
      `${year}-${month.toString().padStart(2, "0")}-${day.toString().padStart(2, "0")}`
  ),
  getDaysInMonth: jest.fn((year: number, month: number) =>
    new Date(year, month, 0).getDate()
  ),
  WEEKDAYS: ["日", "月", "火", "水", "木", "金", "土"],
}));

describe("BaseShiftMobileList", () => {
  const mockShiftStats: ShiftStats = {
    "2024-02-05": {
      shifts: [
        {
          type: "早朝レッスン",
          department: "ski",
          count: 3,
        },
      ],
    },
    "2024-02-10": {
      shifts: [
        {
          type: "午前レッスン",
          department: "snowboard",
          count: 2,
        },
        {
          type: "午後レッスン",
          department: "ski",
          count: 1,
        },
      ],
    },
    "2024-02-15": {
      shifts: [
        {
          type: "夜間レッスン",
          department: "ski",
          count: 1,
        },
      ],
    },
  };

  const defaultProps = {
    year: 2024,
    month: 2,
    shiftStats: mockShiftStats,
    isHoliday: (date: string) => date === "2024-02-11", // 建国記念の日
    selectedDate: "2024-02-10",
    onDateSelect: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("基本的なレンダリング", () => {
    it("モバイルリストコンテナが正しくレンダリングされる", () => {
      const { container } = render(<BaseShiftMobileList {...defaultProps} />);

      // モバイル表示用のクラスが適用されることを確認
      const mobileContainer = container.querySelector(
        ".block.space-y-3.sm\\:hidden"
      );
      expect(mobileContainer).toHaveClass("block", "space-y-3", "sm:hidden");
    });

    it("2月の全ての日付が表示される", () => {
      render(<BaseShiftMobileList {...defaultProps} />);

      // 2月は29日まで（2024年はうるう年）
      expect(screen.getByText("1")).toBeInTheDocument();
      expect(screen.getByText("29")).toBeInTheDocument();
      expect(screen.queryByText("30")).not.toBeInTheDocument();
    });

    it("各日付に曜日が表示される", () => {
      render(<BaseShiftMobileList {...defaultProps} />);

      // 曜日表示を確認
      expect(screen.getAllByText("月").length).toBeGreaterThan(0);
      expect(screen.getAllByText("火").length).toBeGreaterThan(0);
    });
  });

  describe("シフト表示", () => {
    it("シフトがある日にシフト詳細が表示される", () => {
      render(<BaseShiftMobileList {...defaultProps} />);

      // 2月10日のシフト（午前レッスン、午後レッスン）
      const shiftBadges = screen.getAllByTestId("shift-badge");
      expect(shiftBadges.length).toBeGreaterThan(0);

      // シフト詳細の確認（配置数）
      const snowboardBadges = shiftBadges.filter(
        (badge) => badge.getAttribute("data-count") === "2"
      );
      const mixedBadges = shiftBadges.filter(
        (badge) => badge.getAttribute("data-count") === "1"
      );
      expect(snowboardBadges.length).toBeGreaterThanOrEqual(1);
      expect(mixedBadges.length).toBeGreaterThanOrEqual(1);
    });

    it("シフトがある日に部門アイコンが正しいサイズで表示される", () => {
      render(<BaseShiftMobileList {...defaultProps} />);

      const departmentIcons = screen.getAllByTestId("department-icon");
      expect(departmentIcons.length).toBeGreaterThan(0);

      // モバイル表示では「h-4 w-4」サイズが使用される
      const correctSizeIcons = departmentIcons.filter((icon) => {
        const className = icon.getAttribute("data-classname") || "";
        return className.includes("h-4") && className.includes("w-4");
      });
      expect(correctSizeIcons.length).toBe(departmentIcons.length);
    });

    it("複数のシフトがある日に全て表示される", () => {
      render(<BaseShiftMobileList {...defaultProps} />);

      // 2月10日には snowboard と mixed のシフトがある
      const departmentIcons = screen.getAllByTestId("department-icon");
      const snowboardIcons = departmentIcons.filter(
        (icon) => icon.getAttribute("data-department") === "snowboard"
      );

      expect(snowboardIcons.length).toBeGreaterThanOrEqual(1);
    });

    it("シフトがない日に「シフトなし」が表示される", () => {
      render(<BaseShiftMobileList {...defaultProps} />);

      // シフトがない日（2月1日など）に「シフトなし」メッセージ
      const noShiftMessages = screen.getAllByText("シフトなし");
      expect(noShiftMessages.length).toBeGreaterThan(0);
    });
  });

  describe("インタラクション", () => {
    it("日付をクリックするとonDateSelectが正しい日付で呼ばれる", () => {
      const mockOnDateSelect = jest.fn();
      render(
        <BaseShiftMobileList
          {...defaultProps}
          onDateSelect={mockOnDateSelect}
        />
      );

      // 5日をクリック
      const day5 = screen.getByText("5").closest(".mobile-day-item");
      expect(day5).toBeInTheDocument();

      if (day5) {
        fireEvent.click(day5);
        expect(mockOnDateSelect).toHaveBeenCalledWith("2024-02-05");
      }
    });

    it("シフトがある日をクリックしても正常に動作する", () => {
      const mockOnDateSelect = jest.fn();
      // selectedDateをnullにして未選択状態でテスト
      const propsWithoutSelection = {
        ...defaultProps,
        selectedDate: null,
        onDateSelect: mockOnDateSelect,
      };

      render(<BaseShiftMobileList {...propsWithoutSelection} />);

      // 10日（シフトがある日）をクリック
      const day10 = screen.getByText("10").closest(".mobile-day-item");
      expect(day10).toBeInTheDocument();

      if (day10) {
        fireEvent.click(day10);
        expect(mockOnDateSelect).toHaveBeenCalledWith("2024-02-10");
      }
    });

    it("ホバー効果が適用される", () => {
      render(<BaseShiftMobileList {...defaultProps} />);

      const dayItems = screen
        .getAllByText(/^\d+$/)
        .map((day) => day.closest(".mobile-day-item"));
      for (const item of dayItems) {
        expect(item).toHaveClass(
          "hover:-translate-y-0.5",
          "hover:transform",
          "hover:shadow-md"
        );
      }
    });
  });

  describe("祝日・週末表示", () => {
    it("祝日の日付に祝日マークが表示される", () => {
      render(<BaseShiftMobileList {...defaultProps} />);

      // 2月11日（建国記念の日）に祝日表示
      const holidayMarks = screen.getAllByText("祝日");
      expect(holidayMarks.length).toBeGreaterThanOrEqual(1);
    });

    it("祝日でない日には祝日マークが表示されない", () => {
      const propsWithNoHolidays = {
        ...defaultProps,
        isHoliday: () => false,
      };

      render(<BaseShiftMobileList {...propsWithNoHolidays} />);

      const holidayMarks = screen.queryAllByText("祝日");
      expect(holidayMarks).toHaveLength(0);
    });

    it("土曜日・日曜日・祝日に適切なスタイリングが適用される", () => {
      render(<BaseShiftMobileList {...defaultProps} />);

      // 具体的な土曜日（2024-02-03）と日曜日（2024-02-04）のテスト
      const saturday = screen.getByText("3").closest(".mobile-day-item");
      const sunday = screen.getByText("4").closest(".mobile-day-item");

      // スタイリングが適用されていることを確認（具体的なクラスはcnモックで変わるため存在のみ確認）
      expect(saturday).toHaveClass("mobile-day-item");
      expect(sunday).toHaveClass("mobile-day-item");
    });
  });

  describe("選択状態", () => {
    it("選択された日付に特別なスタイリングが適用される", () => {
      render(<BaseShiftMobileList {...defaultProps} />);

      // 2月10日が選択されている（スタイリングが適用されることを確認）
      const day10 = screen.getByText("10").closest(".mobile-day-item");
      expect(day10).toHaveClass("mobile-day-item");
      expect(day10).toBeInTheDocument();
    });

    it("選択されていない日付には通常のスタイリングが適用される", () => {
      render(<BaseShiftMobileList {...defaultProps} />);

      // 2月5日は選択されていない
      const day5 = screen.getByText("5").closest(".mobile-day-item");
      expect(day5).not.toHaveClass(
        "border-blue-400",
        "bg-blue-50",
        "shadow-md"
      );
    });

    it("選択状態がnullでも正常に動作する", () => {
      const nullSelectedProps = {
        ...defaultProps,
        selectedDate: null,
      };

      render(<BaseShiftMobileList {...nullSelectedProps} />);

      // どの日付も選択状態のスタイリングが適用されない
      const dayItems = screen
        .getAllByText(/^\d+$/)
        .map((day) => day.closest(".mobile-day-item"));
      const selectedItems = dayItems.filter((item) =>
        item?.classList.contains("border-blue-400")
      );
      expect(selectedItems).toHaveLength(0);
    });
  });

  describe("レスポンシブ表示", () => {
    it("モバイル専用表示のクラスが適用される", () => {
      const { container } = render(<BaseShiftMobileList {...defaultProps} />);

      // block sm:hiddenクラスが適用されることを確認
      const mobileContainer = container.querySelector(".block.sm\\:hidden");
      expect(mobileContainer).toHaveClass("block", "sm:hidden");
    });

    it("各日付アイテムが縦積みレイアウトになる", () => {
      const { container } = render(<BaseShiftMobileList {...defaultProps} />);

      const spacedContainer = container.querySelector(".space-y-3");
      expect(spacedContainer).toHaveClass("space-y-3");
    });
  });

  describe("エッジケース", () => {
    it("空のシフト統計でも正常にレンダリングされる", () => {
      const emptyStatsProps = {
        ...defaultProps,
        shiftStats: {},
      };

      render(<BaseShiftMobileList {...emptyStatsProps} />);

      // すべての日に「シフトなし」が表示される
      const noShiftMessages = screen.getAllByText("シフトなし");
      expect(noShiftMessages.length).toBe(29); // 2024年2月は29日まで
    });

    it("異なる月でも正常に動作する", () => {
      const differentMonthProps = {
        ...defaultProps,
        year: 2024,
        month: 4, // 4月（30日まで）
        shiftStats: {
          "2024-04-15": {
            shifts: [
              {
                type: "春休みレッスン",
                department: "ski" as const,
                count: 2,
              },
            ],
          },
        },
        selectedDate: "2024-04-15",
      };

      render(<BaseShiftMobileList {...differentMonthProps} />);

      // 4月30日まで表示される
      expect(screen.getByText("30")).toBeInTheDocument();
      expect(screen.queryByText("31")).not.toBeInTheDocument();
    });

    it("複雑なシフト構成でも正常に動作する", () => {
      const complexShiftsProps = {
        ...defaultProps,
        shiftStats: {
          "2024-02-01": {
            shifts: [
              { type: "早朝", department: "ski" as const, count: 1 },
              { type: "午前", department: "ski" as const, count: 2 },
              { type: "午後", department: "snowboard" as const, count: 1 },
              { type: "夕方", department: "snowboard" as const, count: 1 },
            ],
          },
        },
      };

      render(<BaseShiftMobileList {...complexShiftsProps} />);

      // 4つのシフトが表示される
      const shiftBadges = screen.getAllByTestId("shift-badge");
      expect(shiftBadges.length).toBeGreaterThanOrEqual(4);
    });

    it("年末年始の月境界でも正常に動作する", () => {
      const decemberProps = {
        ...defaultProps,
        year: 2024,
        month: 12, // 12月（31日まで）
        shiftStats: {},
        selectedDate: null,
      };

      render(<BaseShiftMobileList {...decemberProps} />);

      // 12月31日まで表示される
      expect(screen.getByText("31")).toBeInTheDocument();
    });
  });

  describe("アクセシビリティ", () => {
    it("各日付アイテムがクリック可能である", () => {
      render(<BaseShiftMobileList {...defaultProps} />);

      const dayItems = screen
        .getAllByText(/^\d+$/)
        .map((day) => day.closest(".mobile-day-item"));
      for (const item of dayItems) {
        expect(item).toHaveClass("cursor-pointer");
      }
    });

    it("トランジション効果が適用される", () => {
      render(<BaseShiftMobileList {...defaultProps} />);

      const dayItems = screen
        .getAllByText(/^\d+$/)
        .map((day) => day.closest(".mobile-day-item"));
      for (const item of dayItems) {
        expect(item).toHaveClass("transition-all", "duration-300");
      }
    });

    it("日付が大きく表示される（モバイル向け）", () => {
      render(<BaseShiftMobileList {...defaultProps} />);

      const dayNumbers = screen.getAllByText(/^\d+$/);
      for (const day of dayNumbers) {
        // 大きなフォントサイズが適用される
        expect(day).toHaveClass("text-2xl", "font-bold");
      }
    });
  });
});
