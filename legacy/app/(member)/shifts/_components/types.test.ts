import type { ShiftStats } from "../_lib/types";
import type {
  BaseShiftDisplayProps,
  ShiftCalendarGridProps,
  ShiftMobileListProps,
} from "./types";

describe("shift component types", () => {
  // テスト用のモックデータ
  const mockShiftStats: ShiftStats = {
    "2024-01-01": {
      shifts: [
        {
          type: "morning",
          department: "ski",
          count: 2,
          assignedInstructors: [
            {
              id: "instructor-1",
              lastName: "山田",
              firstName: "太郎",
              displayName: "山田 太郎",
            },
          ],
        },
      ],
    },
  };

  const mockBaseShiftDisplayProps: BaseShiftDisplayProps = {
    year: 2024,
    month: 1,
    shiftStats: mockShiftStats,
    isHoliday: (date: string) => date === "2024-01-01",
    selectedDate: "2024-01-01",
    onDateSelect: () => {
      // no-op: テスト用ダミー関数
    },
  };

  describe("BaseShiftDisplayProps", () => {
    test("should accept valid props", () => {
      const props: BaseShiftDisplayProps = mockBaseShiftDisplayProps;

      expect(props.year).toBe(2024);
      expect(props.month).toBe(1);
      expect(props.shiftStats).toBeDefined();
      expect(props.isHoliday).toBeDefined();
      expect(props.selectedDate).toBe("2024-01-01");
      expect(props.onDateSelect).toBeDefined();
    });

    test("should allow null selectedDate", () => {
      const props: BaseShiftDisplayProps = {
        ...mockBaseShiftDisplayProps,
        selectedDate: null,
      };

      expect(props.selectedDate).toBeNull();
    });

    test("isHoliday function should work correctly", () => {
      const { isHoliday } = mockBaseShiftDisplayProps;

      expect(isHoliday("2024-01-01")).toBe(true);
      expect(isHoliday("2024-01-02")).toBe(false);
    });
  });

  describe("ShiftCalendarGridProps", () => {
    test("should extend BaseShiftDisplayProps", () => {
      const props: ShiftCalendarGridProps = mockBaseShiftDisplayProps;

      // BaseShiftDisplayPropsのすべてのプロパティが利用可能であることを確認
      expect(props.year).toBe(2024);
      expect(props.month).toBe(1);
      expect(props.shiftStats).toBeDefined();
      expect(props.isHoliday).toBeDefined();
      expect(props.selectedDate).toBe("2024-01-01");
      expect(props.onDateSelect).toBeDefined();
    });

    test("should be assignable to BaseShiftDisplayProps", () => {
      const calendarProps: ShiftCalendarGridProps = mockBaseShiftDisplayProps;
      const baseProps: BaseShiftDisplayProps = calendarProps;

      expect(baseProps).toEqual(calendarProps);
    });
  });

  describe("ShiftMobileListProps", () => {
    test("should extend BaseShiftDisplayProps", () => {
      const props: ShiftMobileListProps = mockBaseShiftDisplayProps;

      // BaseShiftDisplayPropsのすべてのプロパティが利用可能であることを確認
      expect(props.year).toBe(2024);
      expect(props.month).toBe(1);
      expect(props.shiftStats).toBeDefined();
      expect(props.isHoliday).toBeDefined();
      expect(props.selectedDate).toBe("2024-01-01");
      expect(props.onDateSelect).toBeDefined();
    });

    test("should be assignable to BaseShiftDisplayProps", () => {
      const mobileProps: ShiftMobileListProps = mockBaseShiftDisplayProps;
      const baseProps: BaseShiftDisplayProps = mobileProps;

      expect(baseProps).toEqual(mobileProps);
    });
  });

  describe("Type compatibility", () => {
    test("ShiftCalendarGridProps and ShiftMobileListProps should have same structure", () => {
      const calendarProps: ShiftCalendarGridProps = mockBaseShiftDisplayProps;
      const mobileProps: ShiftMobileListProps = mockBaseShiftDisplayProps;

      // 両方とも同じ基底型なので、構造的に同じであることを確認
      expect(Object.keys(calendarProps).sort()).toEqual(
        Object.keys(mobileProps).sort()
      );
    });

    test("should work with different ShiftStats structures", () => {
      const emptyStats: ShiftStats = {};
      const multiDayStats: ShiftStats = {
        "2024-01-01": { shifts: [] },
        "2024-01-02": {
          shifts: [
            {
              type: "afternoon",
              department: "snowboard",
              count: 1,
              assignedInstructors: [],
            },
          ],
        },
      };

      const propsWithEmpty: BaseShiftDisplayProps = {
        ...mockBaseShiftDisplayProps,
        shiftStats: emptyStats,
      };

      const propsWithMultiDay: BaseShiftDisplayProps = {
        ...mockBaseShiftDisplayProps,
        shiftStats: multiDayStats,
      };

      expect(propsWithEmpty.shiftStats).toEqual({});
      expect(Object.keys(propsWithMultiDay.shiftStats)).toHaveLength(2);
    });
  });

  describe("Error cases", () => {
    test("should handle edge cases in props", () => {
      // 境界値のテスト
      const edgeCaseProps: BaseShiftDisplayProps = {
        year: 1900, // 最小年
        month: 0, // 最小月（通常は1-12だが、型的には制限なし）
        shiftStats: {},
        isHoliday: () => false,
        selectedDate: "",
        onDateSelect: () => {
          // no-op: テスト用ダミー関数
        },
      };

      expect(edgeCaseProps.year).toBe(1900);
      expect(edgeCaseProps.month).toBe(0);
      expect(edgeCaseProps.shiftStats).toEqual({});
      expect(edgeCaseProps.selectedDate).toBe("");
    });
  });
});
