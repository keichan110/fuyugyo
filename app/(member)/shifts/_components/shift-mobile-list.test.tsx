import { render } from "@testing-library/react";
import "@testing-library/jest-dom";
import type { ShiftStats } from "../_lib/types";
import { ShiftMobileList } from "./shift-mobile-list";

// BaseShiftMobileListをモック化
jest.mock("./base-shift-mobile-list", () => ({
  BaseShiftMobileList: jest.fn(
    ({
      year,
      month,
      shiftStats,
      isHoliday,
      selectedDate,
      onDateSelect,
      variant,
    }) => (
      <div data-testid="base-shift-mobile-list">
        <div data-testid="year">{year}</div>
        <div data-testid="month">{month}</div>
        <div data-testid="selected-date">{selectedDate}</div>
        <div data-testid="variant">{variant}</div>
        <button
          data-testid="date-select"
          onClick={() => onDateSelect("2024-01-20")}
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

describe("ShiftMobileList", () => {
  const mockShiftStats: ShiftStats = {
    "2024-01-20": {
      shifts: [
        {
          type: "午前レッスン",
          department: "ski",
          count: 3,
          assignedInstructors: [
            {
              id: "cuid_instructor_1",
              lastName: "田中",
              firstName: "花子",
              displayName: "田中 花子",
            },
            {
              id: "cuid_instructor_2",
              lastName: "佐藤",
              firstName: "次郎",
              displayName: "佐藤 次郎",
            },
          ],
        },
        {
          type: "午後レッスン",
          department: "snowboard",
          count: 1,
          assignedInstructors: [
            {
              id: "cuid_instructor_3",
              lastName: "鈴木",
              firstName: "三郎",
              displayName: "鈴木 三郎",
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
    selectedDate: "2024-01-20",
    onDateSelect: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("基本的なレンダリング", () => {
    it("BaseShiftMobileListコンポーネントを正しくレンダリングする", () => {
      const { getByTestId } = render(<ShiftMobileList {...defaultProps} />);

      expect(getByTestId("base-shift-mobile-list")).toBeInTheDocument();
      expect(getByTestId("year")).toHaveTextContent("2024");
      expect(getByTestId("month")).toHaveTextContent("1");
      expect(getByTestId("selected-date")).toHaveTextContent("2024-01-20");
    });

    it("propsをBaseShiftMobileListに正しく渡す", () => {
      const { getByTestId } = render(<ShiftMobileList {...defaultProps} />);

      expect(getByTestId("is-holiday")).toHaveTextContent("holiday");
      expect(getByTestId("shift-stats")).toHaveTextContent(
        JSON.stringify(mockShiftStats)
      );
    });
  });

  describe("variantプロパティ", () => {
    it("admin variantを指定した場合にBaseShiftMobileListに渡される", () => {
      const { getByTestId } = render(
        <ShiftMobileList {...defaultProps} variant="admin" />
      );

      expect(getByTestId("base-shift-mobile-list")).toBeInTheDocument();
      expect(getByTestId("variant")).toHaveTextContent("admin");
    });

    it("public variantを指定した場合にBaseShiftMobileListに渡される", () => {
      const { getByTestId } = render(
        <ShiftMobileList {...defaultProps} variant="public" />
      );

      expect(getByTestId("base-shift-mobile-list")).toBeInTheDocument();
      expect(getByTestId("variant")).toHaveTextContent("public");
    });

    it("variantを指定しない場合はundefinedが渡される", () => {
      const { getByTestId } = render(<ShiftMobileList {...defaultProps} />);

      expect(getByTestId("base-shift-mobile-list")).toBeInTheDocument();
      expect(getByTestId("variant")).toBeEmptyDOMElement();
    });
  });

  describe("イベントハンドリング", () => {
    it("onDateSelectコールバックが正しく動作する", () => {
      const mockOnDateSelect = jest.fn();
      const { getByTestId } = render(
        <ShiftMobileList {...defaultProps} onDateSelect={mockOnDateSelect} />
      );

      const selectButton = getByTestId("date-select");
      selectButton.click();

      expect(mockOnDateSelect).toHaveBeenCalledWith("2024-01-20");
    });

    it("isHoliday関数が正しく動作する", () => {
      const mockIsHoliday = jest.fn((date: string) => date === "2024-01-01");
      const { getByTestId } = render(
        <ShiftMobileList {...defaultProps} isHoliday={mockIsHoliday} />
      );

      expect(getByTestId("is-holiday")).toHaveTextContent("holiday");
      expect(mockIsHoliday).toHaveBeenCalledWith("2024-01-01");
    });
  });

  describe("型安全性", () => {
    it("UnifiedShiftMobileListPropsの全てのプロパティが使用可能", () => {
      const fullProps = {
        ...defaultProps,
        variant: "public" as const,
      };

      const { getByTestId } = render(<ShiftMobileList {...fullProps} />);
      expect(getByTestId("base-shift-mobile-list")).toBeInTheDocument();
      expect(getByTestId("variant")).toHaveTextContent("public");
    });

    it("BaseShiftDisplayPropsを継承したプロパティが正しく動作する", () => {
      const propsWithNullDate = {
        ...defaultProps,
        selectedDate: null,
      };

      const { getByTestId } = render(
        <ShiftMobileList {...propsWithNullDate} />
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

      const { getByTestId } = render(<ShiftMobileList {...emptyStatsProps} />);
      expect(getByTestId("shift-stats")).toHaveTextContent("{}");
    });

    it("異なる年月でも正常に動作する", () => {
      const differentDateProps = {
        ...defaultProps,
        year: 2025,
        month: 12,
      };

      const { getByTestId } = render(
        <ShiftMobileList {...differentDateProps} />
      );
      expect(getByTestId("year")).toHaveTextContent("2025");
      expect(getByTestId("month")).toHaveTextContent("12");
    });

    it("複雑なシフト統計でも正常に動作する", () => {
      const complexShiftsStats: ShiftStats = {
        "2024-01-15": {
          shifts: [
            {
              type: "早朝レッスン",
              department: "ski",
              count: 1,
              assignedInstructors: [
                {
                  id: "cuid_instructor_1",
                  lastName: "山田",
                  firstName: "太郎",
                  displayName: "山田 太郎",
                },
              ],
            },
          ],
        },
        "2024-01-16": {
          shifts: [
            {
              type: "夕方レッスン",
              department: "snowboard",
              count: 2,
              assignedInstructors: [],
            },
          ],
        },
        "2024-01-17": {
          shifts: [
            {
              type: "午前レッスン",
              department: "ski",
              count: 1,
              assignedInstructors: [
                {
                  id: "cuid_instructor_2",
                  lastName: "佐藤",
                  firstName: "花子",
                  displayName: "佐藤 花子",
                },
              ],
            },
          ],
        },
      };

      const complexProps = {
        ...defaultProps,
        shiftStats: complexShiftsStats,
      };

      const { getByTestId } = render(<ShiftMobileList {...complexProps} />);
      expect(getByTestId("shift-stats")).toHaveTextContent(
        JSON.stringify(complexShiftsStats)
      );
    });

    it("週末・祝日の判定が正しく動作する", () => {
      const weekendHolidayProps = {
        ...defaultProps,
        isHoliday: (date: string) =>
          ["2024-01-01", "2024-01-07", "2024-01-14"].includes(date),
      };

      const { getByTestId } = render(
        <ShiftMobileList {...weekendHolidayProps} />
      );
      // isHoliday関数に'2024-01-01'でテストした結果が表示される
      expect(getByTestId("is-holiday")).toHaveTextContent("holiday");
    });
  });

  describe("統合テスト", () => {
    it("管理者向けvariantと複雑なデータの組み合わせが正常に動作する", () => {
      const adminComplexProps = {
        ...defaultProps,
        variant: "admin" as const,
        shiftStats: mockShiftStats,
        selectedDate: "2024-01-20",
      };

      const { getByTestId } = render(
        <ShiftMobileList {...adminComplexProps} />
      );

      expect(getByTestId("base-shift-mobile-list")).toBeInTheDocument();
      expect(getByTestId("variant")).toHaveTextContent("admin");
      expect(getByTestId("year")).toHaveTextContent("2024");
      expect(getByTestId("selected-date")).toHaveTextContent("2024-01-20");
    });

    it("公開向けvariantと基本データの組み合わせが正常に動作する", () => {
      const publicBasicProps = {
        year: 2024,
        month: 2,
        shiftStats: {},
        isHoliday: () => false,
        selectedDate: null,
        onDateSelect: jest.fn(),
        variant: "public" as const,
      };

      const { getByTestId } = render(<ShiftMobileList {...publicBasicProps} />);

      expect(getByTestId("base-shift-mobile-list")).toBeInTheDocument();
      expect(getByTestId("variant")).toHaveTextContent("public");
      expect(getByTestId("month")).toHaveTextContent("2");
      expect(getByTestId("selected-date")).toBeEmptyDOMElement();
    });
  });
});
