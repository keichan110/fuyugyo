import { render } from "@testing-library/react";
import "@testing-library/jest-dom";
import type { ShiftStats } from "../../_lib/types";
import { ShiftCalendarGrid } from "./calendar-grid";

// BaseShiftCalendarをモック化
jest.mock("../base/calendar", () => ({
  BaseShiftCalendar: jest.fn(
    ({ year, month, shiftStats, isHoliday, selectedDate, onDateSelect }) => (
      <div data-testid="base-shift-calendar">
        <div data-testid="year">{year}</div>
        <div data-testid="month">{month}</div>
        <div data-testid="selected-date">{selectedDate}</div>
        <button
          data-testid="date-select"
          onClick={() => onDateSelect("2024-01-15")}
          type="button"
        >
          Select Date
        </button>
        <div data-testid="is-holiday">
          {isHoliday("2024-01-01") ? "holiday" : "not-holiday"}
        </div>
        <div data-testid="shift-stats">{JSON.stringify(shiftStats)}</div>
      </div>
    )
  ),
}));

// 動的インポートをモック化
jest.mock("next/dynamic", () => {
  return jest.fn(() => {
    // BaseShiftCalendarを直接返す
    function MockComponent(props: Record<string, unknown>) {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { BaseShiftCalendar } = require("../base/calendar");
      return <BaseShiftCalendar {...props} />;
    }
    MockComponent.displayName = "MockDynamicComponent";
    return MockComponent;
  });
});

// ShiftCalendarSkeletonをモック化
jest.mock("../ui/calendar-skeleton", () => ({
  ShiftCalendarSkeleton: () => (
    <div data-testid="calendar-skeleton">Loading...</div>
  ),
}));

describe("ShiftCalendarGrid", () => {
  const mockShiftStats: ShiftStats = {
    "2024-01-15": {
      shifts: [
        {
          type: "午前レッスン",
          department: "ski",
          count: 2,
          assignedInstructors: [
            {
              id: "test-instructor-1",
              lastName: "山田",
              firstName: "太郎",
              displayName: "山田 太郎",
            },
          ],
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
    it("BaseShiftCalendarコンポーネントを正しくレンダリングする", () => {
      const { getByTestId } = render(<ShiftCalendarGrid {...defaultProps} />);

      expect(getByTestId("base-shift-calendar")).toBeInTheDocument();
      expect(getByTestId("year")).toHaveTextContent("2024");
      expect(getByTestId("month")).toHaveTextContent("1");
      expect(getByTestId("selected-date")).toHaveTextContent("2024-01-15");
    });

    it("propsをBaseShiftCalendarに正しく渡す", () => {
      const { getByTestId } = render(<ShiftCalendarGrid {...defaultProps} />);

      expect(getByTestId("is-holiday")).toHaveTextContent("holiday");
      expect(getByTestId("shift-stats")).toHaveTextContent(
        JSON.stringify(mockShiftStats)
      );
    });
  });

  describe("variantプロパティ", () => {
    it("admin variantを指定してもBaseShiftCalendarに影響しない", () => {
      const { getByTestId } = render(
        <ShiftCalendarGrid {...defaultProps} variant="admin" />
      );

      // variantは内部で使用されずBaseShiftCalendarに渡されないことを確認
      expect(getByTestId("base-shift-calendar")).toBeInTheDocument();
      expect(getByTestId("year")).toHaveTextContent("2024");
    });

    it("public variantを指定してもBaseShiftCalendarに影響しない", () => {
      const { getByTestId } = render(
        <ShiftCalendarGrid {...defaultProps} variant="public" />
      );

      expect(getByTestId("base-shift-calendar")).toBeInTheDocument();
      expect(getByTestId("month")).toHaveTextContent("1");
    });

    it("variantを指定しなくても正常に動作する", () => {
      const { getByTestId } = render(<ShiftCalendarGrid {...defaultProps} />);

      expect(getByTestId("base-shift-calendar")).toBeInTheDocument();
    });
  });

  describe("イベントハンドリング", () => {
    it("onDateSelectコールバックが正しく動作する", () => {
      const mockOnDateSelect = jest.fn();
      const { getByTestId } = render(
        <ShiftCalendarGrid {...defaultProps} onDateSelect={mockOnDateSelect} />
      );

      const selectButton = getByTestId("date-select");
      selectButton.click();

      expect(mockOnDateSelect).toHaveBeenCalledWith("2024-01-15");
    });

    it("isHoliday関数が正しく動作する", () => {
      const mockIsHoliday = jest.fn((date: string) => date === "2024-01-01");
      const { getByTestId } = render(
        <ShiftCalendarGrid {...defaultProps} isHoliday={mockIsHoliday} />
      );

      expect(getByTestId("is-holiday")).toHaveTextContent("holiday");
      expect(mockIsHoliday).toHaveBeenCalledWith("2024-01-01");
    });
  });

  describe("型安全性", () => {
    it("UnifiedShiftCalendarGridPropsの全てのプロパティが使用可能", () => {
      const fullProps = {
        ...defaultProps,
        variant: "admin" as const,
      };

      const { getByTestId } = render(<ShiftCalendarGrid {...fullProps} />);
      expect(getByTestId("base-shift-calendar")).toBeInTheDocument();
    });

    it("BaseShiftDisplayPropsを継承したプロパティが正しく動作する", () => {
      const propsWithNullDate = {
        ...defaultProps,
        selectedDate: null,
      };

      const { getByTestId } = render(
        <ShiftCalendarGrid {...propsWithNullDate} />
      );
      expect(getByTestId("selected-date")).toBeEmptyDOMElement();
    });
  });

  describe("エッジケース", () => {
    it("空のシフト統計でも正常に動作する", () => {
      const emptyStatsProps = {
        ...defaultProps,
        shiftStats: {},
      };

      const { getByTestId } = render(
        <ShiftCalendarGrid {...emptyStatsProps} />
      );
      expect(getByTestId("shift-stats")).toHaveTextContent("{}");
    });

    it("異なる年月でも正常に動作する", () => {
      const differentDateProps = {
        ...defaultProps,
        year: 2025,
        month: 12,
      };

      const { getByTestId } = render(
        <ShiftCalendarGrid {...differentDateProps} />
      );
      expect(getByTestId("year")).toHaveTextContent("2025");
      expect(getByTestId("month")).toHaveTextContent("12");
    });

    it("複数のシフト統計でも正常に動作する", () => {
      const multipleShiftsStats: ShiftStats = {
        "2024-01-15": {
          shifts: [
            {
              type: "午前レッスン",
              department: "ski",
              count: 2,
              assignedInstructors: [],
            },
          ],
        },
        "2024-01-16": {
          shifts: [
            {
              type: "午後レッスン",
              department: "snowboard",
              count: 1,
              assignedInstructors: [],
            },
          ],
        },
      };

      const multipleShiftsProps = {
        ...defaultProps,
        shiftStats: multipleShiftsStats,
      };

      const { getByTestId } = render(
        <ShiftCalendarGrid {...multipleShiftsProps} />
      );
      expect(getByTestId("shift-stats")).toHaveTextContent(
        JSON.stringify(multipleShiftsStats)
      );
    });
  });
});
