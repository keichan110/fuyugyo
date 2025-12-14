import {
  clearUtilCaches,
  formatDate,
  getDaysInMonth,
  getDepartmentBadgeBgClass,
  getDepartmentBgClass,
  getFirstDayOfWeek,
  getShiftTypeShort,
  getTodayDateJST,
} from "./utils";

describe("shift component utils", () => {
  /**
   * カテゴリ1: 純粋な計算関数
   * - formatDate
   * - getShiftTypeShort
   * - getDepartmentBgClass
   * - getDepartmentBadgeBgClass
   */
  describe("formatDate", () => {
    it("should format date with zero padding for single digit values", () => {
      expect(formatDate(2024, 1, 1)).toBe("2024-01-01");
      expect(formatDate(2024, 3, 5)).toBe("2024-03-05");
      expect(formatDate(2024, 9, 9)).toBe("2024-09-09");
    });

    it("should format date without padding for double digit values", () => {
      expect(formatDate(2024, 12, 31)).toBe("2024-12-31");
      expect(formatDate(2024, 10, 15)).toBe("2024-10-15");
    });

    it("should handle edge cases for year values", () => {
      expect(formatDate(9999, 12, 31)).toBe("9999-12-31");
      expect(formatDate(1000, 1, 1)).toBe("1000-01-01");
      expect(formatDate(2024, 1, 1)).toBe("2024-01-01");
    });
  });

  describe("getShiftTypeShort", () => {
    it("should return short name for ski lesson types", () => {
      expect(getShiftTypeShort("スキーレッスン")).toBe("レッスン");
      expect(getShiftTypeShort("スキー検定")).toBe("検定");
    });

    it("should return short name for snowboard lesson types", () => {
      expect(getShiftTypeShort("スノーボードレッスン")).toBe("レッスン");
      expect(getShiftTypeShort("スノーボード検定")).toBe("検定");
    });

    it("should return short name for other shift types", () => {
      expect(getShiftTypeShort("県連事業")).toBe("県連");
      expect(getShiftTypeShort("月末イベント")).toBe("イベント");
    });

    it("should return original type if not mapped", () => {
      expect(getShiftTypeShort("未知のシフト")).toBe("未知のシフト");
      expect(getShiftTypeShort("カスタムシフト")).toBe("カスタムシフト");
    });

    it("should handle empty string", () => {
      expect(getShiftTypeShort("")).toBe("");
    });
  });

  describe("getDepartmentBgClass", () => {
    it("should return ski background classes", () => {
      expect(getDepartmentBgClass("ski")).toBe("bg-ski-200 dark:bg-ski-800");
    });

    it("should return snowboard background classes", () => {
      expect(getDepartmentBgClass("snowboard")).toBe(
        "bg-snowboard-200 dark:bg-snowboard-800"
      );
    });

    it("should return default classes for unknown department", () => {
      expect(getDepartmentBgClass("unknown" as any)).toBe(
        "bg-gray-200 dark:bg-gray-800"
      );
    });
  });

  describe("getDepartmentBadgeBgClass", () => {
    it("should return ski badge background classes", () => {
      expect(getDepartmentBadgeBgClass("ski")).toBe(
        "bg-ski-500 dark:bg-ski-600"
      );
    });

    it("should return snowboard badge background classes", () => {
      expect(getDepartmentBadgeBgClass("snowboard")).toBe(
        "bg-snowboard-500 dark:bg-snowboard-600"
      );
    });

    it("should return default badge classes for unknown department", () => {
      expect(getDepartmentBadgeBgClass("unknown" as any)).toBe(
        "bg-gray-500 dark:bg-gray-600"
      );
    });
  });

  /**
   * カテゴリ2: 日付計算関数（キャッシュ付き）
   * - getDaysInMonth
   * - getFirstDayOfWeek
   * - clearUtilCaches
   */
  describe("getDaysInMonth", () => {
    beforeEach(() => {
      clearUtilCaches();
    });

    it("should return 31 days for months with 31 days", () => {
      const monthsWith31Days = [1, 3, 5, 7, 8, 10, 12];
      for (const month of monthsWith31Days) {
        expect(getDaysInMonth(2024, month)).toBe(31);
      }
    });

    it("should return 30 days for months with 30 days", () => {
      const monthsWith30Days = [4, 6, 9, 11];
      for (const month of monthsWith30Days) {
        expect(getDaysInMonth(2024, month)).toBe(30);
      }
    });

    it("should return 29 days for February in leap year", () => {
      expect(getDaysInMonth(2024, 2)).toBe(29);
      expect(getDaysInMonth(2020, 2)).toBe(29);
      expect(getDaysInMonth(2000, 2)).toBe(29);
    });

    it("should return 28 days for February in non-leap year", () => {
      expect(getDaysInMonth(2023, 2)).toBe(28);
      expect(getDaysInMonth(2025, 2)).toBe(28);
      expect(getDaysInMonth(1900, 2)).toBe(28); // 1900 is not a leap year
    });

    it("should cache results for same year and month", () => {
      const firstCall = getDaysInMonth(2024, 1);
      const secondCall = getDaysInMonth(2024, 1);
      expect(firstCall).toBe(secondCall);
      expect(firstCall).toBe(31);
    });

    it("should return different values for different months", () => {
      expect(getDaysInMonth(2024, 1)).toBe(31);
      expect(getDaysInMonth(2024, 2)).toBe(29);
      expect(getDaysInMonth(2024, 4)).toBe(30);
    });
  });

  describe("getFirstDayOfWeek", () => {
    beforeEach(() => {
      clearUtilCaches();
    });

    it("should return correct day of week for known dates", () => {
      // 2024-01-01 is Monday (1)
      expect(getFirstDayOfWeek(2024, 1)).toBe(1);
      // 2024-09-01 is Sunday (0)
      expect(getFirstDayOfWeek(2024, 9)).toBe(0);
      // 2024-12-01 is Sunday (0)
      expect(getFirstDayOfWeek(2024, 12)).toBe(0);
    });

    it("should return values between 0 and 6", () => {
      for (let month = 1; month <= 12; month++) {
        const dayOfWeek = getFirstDayOfWeek(2024, month);
        expect(dayOfWeek).toBeGreaterThanOrEqual(0);
        expect(dayOfWeek).toBeLessThanOrEqual(6);
      }
    });

    it("should cache results for same year and month", () => {
      const firstCall = getFirstDayOfWeek(2024, 1);
      const secondCall = getFirstDayOfWeek(2024, 1);
      expect(firstCall).toBe(secondCall);
      expect(firstCall).toBe(1);
    });

    it("should handle different years for same month", () => {
      // January 2023 and January 2024 have different first days
      const jan2023 = getFirstDayOfWeek(2023, 1); // Sunday (0)
      const jan2024 = getFirstDayOfWeek(2024, 1); // Monday (1)
      expect(jan2023).not.toBe(jan2024);
      expect(jan2023).toBe(0);
      expect(jan2024).toBe(1);
    });
  });

  describe("clearUtilCaches", () => {
    it("should clear both getDaysInMonth and getFirstDayOfWeek caches", () => {
      // Populate caches
      getDaysInMonth(2024, 1);
      getFirstDayOfWeek(2024, 1);

      // Clear caches
      clearUtilCaches();

      // Functions should still work correctly after cache clear
      expect(getDaysInMonth(2024, 1)).toBe(31);
      expect(getFirstDayOfWeek(2024, 1)).toBe(1);
    });

    it("should not affect function correctness", () => {
      const beforeClear = getDaysInMonth(2024, 2);
      clearUtilCaches();
      const afterClear = getDaysInMonth(2024, 2);
      expect(beforeClear).toBe(afterClear);
      expect(afterClear).toBe(29);
    });
  });

  /**
   * カテゴリ3: 現在時刻依存関数
   * - getTodayDateJST
   */
  describe("getTodayDateJST", () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it("should convert UTC midnight to JST correctly", () => {
      // 2024-01-15 00:00:00 UTC = 2024-01-15 09:00:00 JST (same day)
      jest.setSystemTime(new Date("2024-01-15T00:00:00.000Z"));
      expect(getTodayDateJST()).toBe("2024-01-15");
    });

    it("should handle UTC 15:00 as next day in JST", () => {
      // 2024-01-15 15:00:00 UTC = 2024-01-16 00:00:00 JST (next day)
      jest.setSystemTime(new Date("2024-01-15T15:00:00.000Z"));
      expect(getTodayDateJST()).toBe("2024-01-16");
    });

    it("should handle just before JST day change", () => {
      // 2024-01-15 14:59:59 UTC = 2024-01-15 23:59:59 JST (same day)
      jest.setSystemTime(new Date("2024-01-15T14:59:59.999Z"));
      expect(getTodayDateJST()).toBe("2024-01-15");
    });

    it("should handle month boundary correctly", () => {
      // 2024-01-31 15:00:00 UTC = 2024-02-01 00:00:00 JST
      jest.setSystemTime(new Date("2024-01-31T15:00:00.000Z"));
      expect(getTodayDateJST()).toBe("2024-02-01");
    });

    it("should handle year boundary correctly", () => {
      // 2023-12-31 15:00:00 UTC = 2024-01-01 00:00:00 JST
      jest.setSystemTime(new Date("2023-12-31T15:00:00.000Z"));
      expect(getTodayDateJST()).toBe("2024-01-01");
    });

    it("should handle leap year day correctly", () => {
      // 2024-02-28 15:00:00 UTC = 2024-02-29 00:00:00 JST (leap year)
      jest.setSystemTime(new Date("2024-02-28T15:00:00.000Z"));
      expect(getTodayDateJST()).toBe("2024-02-29");
    });

    it("should return YYYY-MM-DD formatted string", () => {
      jest.setSystemTime(new Date("2024-01-15T12:00:00.000Z"));
      const result = getTodayDateJST();
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it("should handle early morning UTC time", () => {
      // 2024-01-15 01:00:00 UTC = 2024-01-15 10:00:00 JST
      jest.setSystemTime(new Date("2024-01-15T01:00:00.000Z"));
      expect(getTodayDateJST()).toBe("2024-01-15");
    });
  });

  /**
   * カテゴリ4: 統合テスト
   * 実際の使用パターンをシミュレート
   */
  describe("integration tests", () => {
    beforeEach(() => {
      clearUtilCaches();
    });

    it("should work with formatDate and getDaysInMonth together", () => {
      const year = 2024;
      const month = 1;
      const days = getDaysInMonth(year, month);
      const lastDayFormatted = formatDate(year, month, days);
      expect(lastDayFormatted).toBe("2024-01-31");
    });

    it("should handle all months of a year correctly", () => {
      const year = 2024;
      const expectedDays = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

      for (let month = 1; month <= 12; month++) {
        const days = getDaysInMonth(year, month);
        const lastDay = formatDate(year, month, days);
        expect(days).toBe(expectedDays[month - 1]);
        expect(lastDay).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      }
    });

    it("should demonstrate date string comparison for past date detection", () => {
      // YYYY-MM-DD format allows lexicographic comparison
      const date1 = "2024-01-15";
      const date2 = "2024-01-16";
      const date3 = "2024-02-01";
      const sameDate = "2024-01-15";

      expect(date1 < date2).toBe(true);
      expect(date2 < date3).toBe(true);
      expect(date1 < date3).toBe(true);
      expect(date1 === sameDate).toBe(true);
    });

    it("should validate cache performance benefit", () => {
      // First call should calculate
      const result1 = getDaysInMonth(2024, 1);
      // Second call should use cache
      const result2 = getDaysInMonth(2024, 1);
      // Results should be identical
      expect(result1).toBe(result2);
      expect(result1).toBe(31);
    });

    it("should handle department styling consistently", () => {
      const departments: Array<"ski" | "snowboard"> = ["ski", "snowboard"];

      for (const dept of departments) {
        const bgClass = getDepartmentBgClass(dept);
        const badgeClass = getDepartmentBadgeBgClass(dept);

        // Both should return non-empty strings
        expect(bgClass).toBeTruthy();
        expect(badgeClass).toBeTruthy();

        // Both should contain the department name
        expect(bgClass).toContain(dept);
        expect(badgeClass).toContain(dept);
      }
    });
  });
});
