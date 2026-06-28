/**
 * 日付フォーマット関連のユーティリティ関数のテスト
 */

import { formatDateForDisplay } from "./date-formatter";

describe("formatDateForDisplay", () => {
  // 基本的な日付フォーマットのテスト
  describe("基本的な動作", () => {
    it("標準的な日付を正しくフォーマットする", () => {
      const result = formatDateForDisplay("2024-03-15");
      expect(result).toBe("2024年3月15日（金）");
    });

    it("曜日を含まないオプションで正しくフォーマットする", () => {
      const result = formatDateForDisplay("2024-03-15", {
        includeWeekday: false,
      });
      expect(result).toBe("2024年3月15日");
    });
  });

  // フォーマットオプションのテスト
  describe("フォーマットオプション", () => {
    it("short形式で月を短縮表示する", () => {
      const result = formatDateForDisplay("2024-03-15", { format: "short" });
      expect(result).toBe("2024/3/15（金）");
    });

    it("numeric形式で月を数字表示する", () => {
      const result = formatDateForDisplay("2024-03-15", { format: "numeric" });
      expect(result).toBe("2024/3/15（金）");
    });

    it("long形式で月を完全表示する", () => {
      const result = formatDateForDisplay("2024-03-15", { format: "long" });
      expect(result).toBe("2024年3月15日（金）");
    });

    it("曜日なし + short形式の組み合わせ", () => {
      const result = formatDateForDisplay("2024-03-15", {
        includeWeekday: false,
        format: "short",
      });
      expect(result).toBe("2024/3/15");
    });
  });

  // エラーハンドリングのテスト
  describe("エラーハンドリング", () => {
    it("不正な日付文字列の場合は元の文字列を返す", () => {
      const invalidDate = "invalid-date";
      const result = formatDateForDisplay(invalidDate);
      expect(result).toBe(invalidDate);
    });

    it("空文字列の場合は空文字列を返す", () => {
      const result = formatDateForDisplay("");
      expect(result).toBe("");
    });

    it("undefined的な値でも安全に処理する", () => {
      const result = formatDateForDisplay("null");
      expect(result).toBe("null");
    });
  });

  // 境界値のテスト
  describe("境界値テスト", () => {
    it("年始の日付を正しく処理する", () => {
      const result = formatDateForDisplay("2024-01-01");
      expect(result).toBe("2024年1月1日（月）");
    });

    it("年末の日付を正しく処理する", () => {
      const result = formatDateForDisplay("2024-12-31");
      expect(result).toBe("2024年12月31日（火）");
    });

    it("うるう年の2月29日を正しく処理する", () => {
      const result = formatDateForDisplay("2024-02-29");
      expect(result).toBe("2024年2月29日（木）");
    });
  });

  // 曜日の表示確認
  describe("曜日表示確認", () => {
    const testCases = [
      ["2024-03-10", "日"], // 日曜日
      ["2024-03-11", "月"], // 月曜日
      ["2024-03-12", "火"], // 火曜日
      ["2024-03-13", "水"], // 水曜日
      ["2024-03-14", "木"], // 木曜日
      ["2024-03-15", "金"], // 金曜日
      ["2024-03-16", "土"], // 土曜日
    ];

    for (const [date, expectedWeekday] of testCases) {
      it(`${date}の曜日が${expectedWeekday}曜日として表示される`, () => {
        const result = formatDateForDisplay(date as string);
        expect(result).toContain(`（${expectedWeekday}）`);
      });
    }
  });
});
