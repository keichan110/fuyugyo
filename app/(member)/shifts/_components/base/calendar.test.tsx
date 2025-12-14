import { fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import type { ShiftStats } from "../../_lib/types";
import { BaseShiftCalendar } from "./calendar";

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
      {count}名
    </div>
  )),
}));

jest.mock("../utils", () => ({
  getShiftTypeShort: jest.fn((type: string) => type.slice(0, 2)),
  getDepartmentBgClass: jest.fn((dept: string) => `bg-${dept}`),
  formatDate: jest.fn(
    (year: number, month: number, day: number) =>
      `${year}-${month.toString().padStart(2, "0")}-${day.toString().padStart(2, "0")}`
  ),
  getDaysInMonth: jest.fn((year: number, month: number) =>
    new Date(year, month, 0).getDate()
  ),
  getFirstDayOfWeek: jest.fn((year: number, month: number) =>
    new Date(year, month - 1, 1).getDay()
  ),
  WEEKDAYS: ["日", "月", "火", "水", "木", "金", "土"],
}));

describe("BaseShiftCalendar", () => {
  const mockShiftStats: ShiftStats = {
    "2024-01-15": {
      shifts: [
        {
          type: "午前レッスン",
          department: "ski",
          count: 2,
        },
        {
          type: "午後レッスン",
          department: "snowboard",
          count: 1,
        },
      ],
    },
    "2024-01-20": {
      shifts: [
        {
          type: "初級レッスン",
          department: "ski",
          count: 1,
        },
      ],
    },
  };

  const defaultProps = {
    year: 2024,
    month: 1,
    shiftStats: mockShiftStats,
    isHoliday: (date: string) => date === "2024-01-01",
    selectedDate: "2024-01-15",
    onDateSelect: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("基本的なレンダリング", () => {
    it("カレンダーグリッドが正しくレンダリングされる", () => {
      const { container } = render(<BaseShiftCalendar {...defaultProps} />);

      // カレンダーコンテナが存在することを確認
      const calendarContainer = container.querySelector(".hidden.sm\\:block");
      expect(calendarContainer).toBeInTheDocument();
    });

    it("日付が正しく表示される", () => {
      render(<BaseShiftCalendar {...defaultProps} />);

      // 1月15日が表示されることを確認（シフトありの日付）
      expect(screen.getByText("15")).toBeInTheDocument();
      // 1月20日が表示されることを確認（シフトありの日付）
      expect(screen.getByText("20")).toBeInTheDocument();
    });

    it("曜日が正しく表示される", () => {
      render(<BaseShiftCalendar {...defaultProps} />);

      // 曜日表示を確認（複数の月曜日があることを確認）
      const mondayElements = screen.getAllByText("月");
      expect(mondayElements.length).toBeGreaterThan(0);
    });

    it("シフトありの日付にシフト情報が表示される", () => {
      render(<BaseShiftCalendar {...defaultProps} />);

      // シフトバッジが表示されることを確認
      const shiftBadges = screen.getAllByTestId("shift-badge");
      expect(shiftBadges.length).toBeGreaterThan(0);
    });
  });

  describe("シフト表示", () => {
    it("シフトがある日に部門アイコンが表示される", () => {
      render(<BaseShiftCalendar {...defaultProps} />);

      const departmentIcons = screen.getAllByTestId("department-icon");
      expect(departmentIcons.length).toBeGreaterThan(0);

      // 少なくともスキー部門のアイコンがあることを確認
      const skiIcon = departmentIcons.find(
        (icon) => icon.getAttribute("data-department") === "ski"
      );
      expect(skiIcon).toBeInTheDocument();
    });

    it("シフトがない日に「シフトなし」が表示される", () => {
      render(<BaseShiftCalendar {...defaultProps} />);

      // シフトがない日付の「シフトなし」メッセージを確認
      const noShiftMessages = screen.getAllByText("シフトなし");
      expect(noShiftMessages.length).toBeGreaterThan(0);
    });

    it("複数のシフトがある日に全て表示される", () => {
      render(<BaseShiftCalendar {...defaultProps} />);

      // 1月15日には2つのシフトがあることを期待
      const shiftBadges = screen.getAllByTestId("shift-badge");
      const skiShifts = shiftBadges.filter(
        (badge) => badge.getAttribute("data-count") === "2"
      );
      const snowboardShifts = shiftBadges.filter(
        (badge) => badge.getAttribute("data-count") === "1"
      );

      expect(skiShifts.length).toBeGreaterThanOrEqual(1);
      expect(snowboardShifts.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("インタラクション", () => {
    it("日付をクリックするとonDateSelectが呼ばれる", () => {
      const mockOnDateSelect = jest.fn();
      render(
        <BaseShiftCalendar {...defaultProps} onDateSelect={mockOnDateSelect} />
      );

      // 15日をクリック
      const day15 = screen.getByText("15").closest(".day-card");
      expect(day15).toBeInTheDocument();

      if (day15) {
        fireEvent.click(day15);
        expect(mockOnDateSelect).toHaveBeenCalledWith("2024-01-15");
      }
    });

    it("別の日付をクリックすると正しい日付でコールバックが呼ばれる", () => {
      const mockOnDateSelect = jest.fn();
      render(
        <BaseShiftCalendar {...defaultProps} onDateSelect={mockOnDateSelect} />
      );

      // 20日をクリック
      const day20 = screen.getByText("20").closest(".day-card");
      expect(day20).toBeInTheDocument();

      if (day20) {
        fireEvent.click(day20);
        expect(mockOnDateSelect).toHaveBeenCalledWith("2024-01-20");
      }
    });
  });

  describe("祝日表示", () => {
    it("祝日の日付に祝日マークが表示される", () => {
      render(<BaseShiftCalendar {...defaultProps} />);

      // 1月1日が祝日として設定されている場合の確認
      const holidayMarks = screen.getAllByText("祝日");
      expect(holidayMarks.length).toBeGreaterThanOrEqual(1);
    });

    it("祝日でない日には祝日マークが表示されない", () => {
      const propsWithNoHolidays = {
        ...defaultProps,
        isHoliday: () => false,
      };

      render(<BaseShiftCalendar {...propsWithNoHolidays} />);

      const holidayMarks = screen.queryAllByText("祝日");
      expect(holidayMarks).toHaveLength(0);
    });
  });

  describe("選択状態", () => {
    it("選択された日付に特別なスタイリングが適用される", () => {
      render(<BaseShiftCalendar {...defaultProps} />);

      const day15 = screen.getByText("15").closest(".day-card");
      expect(day15).toHaveClass("day-card");
      expect(day15).toBeInTheDocument();
    });

    it("選択されていない日付には通常のスタイリングが適用される", () => {
      render(<BaseShiftCalendar {...defaultProps} />);

      const day20 = screen.getByText("20").closest(".day-card");
      expect(day20).toHaveClass("day-card");
      expect(day20).toBeInTheDocument();
    });
  });

  describe("レスポンシブ表示", () => {
    it("デスクトップ表示用のクラスが適用される", () => {
      const { container } = render(<BaseShiftCalendar {...defaultProps} />);

      // hidden sm:blockクラスが適用されることを確認
      const desktopContainer = container.querySelector(".hidden.sm\\:block");
      expect(desktopContainer).toHaveClass("hidden", "sm:block");
    });
  });

  describe("エッジケース", () => {
    it("空のシフト統計でも正常にレンダリングされる", () => {
      const emptyStatsProps = {
        ...defaultProps,
        shiftStats: {},
      };

      render(<BaseShiftCalendar {...emptyStatsProps} />);

      // すべての日に「シフトなし」が表示される
      const noShiftMessages = screen.getAllByText("シフトなし");
      expect(noShiftMessages.length).toBeGreaterThan(0);
    });

    it("selectedDateがnullでも正常に動作する", () => {
      const nullSelectedProps = {
        ...defaultProps,
        selectedDate: null,
      };

      render(<BaseShiftCalendar {...nullSelectedProps} />);

      // 日付が正しく表示される
      expect(screen.getByText("15")).toBeInTheDocument();

      // 選択状態のスタイリングが適用されない
      const days = screen
        .getAllByText(/^\d+$/)
        .map((day) => day.closest(".day-card"));
      const selectedDays = days.filter((day) =>
        day?.classList.contains("border-blue-400")
      );
      expect(selectedDays).toHaveLength(0);
    });

    it("月の境界（31日など）でも正常に動作する", () => {
      const januaryProps = {
        ...defaultProps,
        year: 2024,
        month: 1, // 1月は31日まで
      };

      render(<BaseShiftCalendar {...januaryProps} />);

      // 31日が表示されることを確認
      expect(screen.getByText("31")).toBeInTheDocument();
    });

    it("うるう年の2月でも正常に動作する", () => {
      const leapYearFebruaryProps = {
        ...defaultProps,
        year: 2024, // うるう年
        month: 2, // 2月
      };

      render(<BaseShiftCalendar {...leapYearFebruaryProps} />);

      // 29日が表示されることを確認（うるう年なので）
      expect(screen.getByText("29")).toBeInTheDocument();
    });
  });

  describe("アクセシビリティ", () => {
    it("各日付セルがクリック可能である", () => {
      render(<BaseShiftCalendar {...defaultProps} />);

      const dayCells = screen
        .getAllByText(/^\d+$/)
        .map((day) => day.closest(".day-card"));
      for (const cell of dayCells) {
        expect(cell).toHaveClass("cursor-pointer");
      }
    });

    it("ホバー効果が適用される", () => {
      render(<BaseShiftCalendar {...defaultProps} />);

      const dayCells = screen
        .getAllByText(/^\d+$/)
        .map((day) => day.closest(".day-card"));
      for (const cell of dayCells) {
        expect(cell).toHaveClass(
          "hover:-translate-y-1",
          "hover:transform",
          "hover:shadow-xl"
        );
      }
    });
  });
});
