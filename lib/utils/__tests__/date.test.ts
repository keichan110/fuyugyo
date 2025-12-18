/**
 * 日付ユーティリティ関数のテスト
 */

import {
  addDays,
  formatLocalDate,
  getMondayOfWeek,
  getMonthRange,
  getTodayLocalDate,
  getWeekRange,
  parseLocalDate,
  validateDateFormat,
} from "../date";

describe("validateDateFormat", () => {
  describe("正常系", () => {
    it("正しいYYYY-MM-DD形式の日付を受け入れる", () => {
      expect(validateDateFormat("2025-01-13")).toBeNull();
      expect(validateDateFormat("2024-12-31")).toBeNull();
      expect(validateDateFormat("2000-01-01")).toBeNull();
    });

    it("うるう年の2月29日を受け入れる", () => {
      expect(validateDateFormat("2024-02-29")).toBeNull();
    });
  });

  describe("異常系", () => {
    it("不正な形式を拒否する", () => {
      expect(validateDateFormat("2025-1-13")).not.toBeNull();
      expect(validateDateFormat("2025/01/13")).not.toBeNull();
      expect(validateDateFormat("01-13-2025")).not.toBeNull();
    });

    it("月の範囲外を拒否する", () => {
      expect(validateDateFormat("2025-00-13")).not.toBeNull();
      expect(validateDateFormat("2025-13-13")).not.toBeNull();
    });

    it("日の範囲外を拒否する", () => {
      expect(validateDateFormat("2025-01-00")).not.toBeNull();
      expect(validateDateFormat("2025-01-32")).not.toBeNull();
      expect(validateDateFormat("2025-02-30")).not.toBeNull();
    });

    it("うるう年でない2月29日を拒否する", () => {
      expect(validateDateFormat("2023-02-29")).not.toBeNull();
    });
  });
});

describe("parseLocalDate", () => {
  it("YYYY-MM-DD形式の文字列をDateオブジェクトに変換する", () => {
    const date = parseLocalDate("2025-01-13");
    expect(date.getFullYear()).toBe(2025);
    expect(date.getMonth()).toBe(0); // 0-indexed
    expect(date.getDate()).toBe(13);
  });

  it("ローカルタイムゾーンで深夜0時を指す", () => {
    const date = parseLocalDate("2025-01-13");
    expect(date.getHours()).toBe(0);
    expect(date.getMinutes()).toBe(0);
    expect(date.getSeconds()).toBe(0);
  });

  it("不正な日付形式でエラーをスローする", () => {
    expect(() => parseLocalDate("invalid")).toThrow();
    expect(() => parseLocalDate("2025-13-01")).toThrow();
  });
});

describe("formatLocalDate", () => {
  it("DateオブジェクトをYYYY-MM-DD形式に変換する", () => {
    const date = new Date(2025, 0, 13); // 2025-01-13
    expect(formatLocalDate(date)).toBe("2025-01-13");
  });

  it("1桁の月日をゼロパディングする", () => {
    const date = new Date(2025, 0, 5); // 2025-01-05
    expect(formatLocalDate(date)).toBe("2025-01-05");
  });
});

describe("getTodayLocalDate", () => {
  it("今日の日付をYYYY-MM-DD形式で返す", () => {
    const today = getTodayLocalDate();
    expect(today).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    // 実際の今日の日付と一致することを確認
    const now = new Date();
    const expected = formatLocalDate(now);
    expect(today).toBe(expected);
  });
});

describe("getMondayOfWeek", () => {
  describe("基本動作", () => {
    it("月曜日を指定した場合は同じ日付を返す", () => {
      // 2025-01-13 は月曜日
      expect(getMondayOfWeek("2025-01-13")).toBe("2025-01-13");
    });

    it("火曜日を指定した場合は前日の月曜日を返す", () => {
      // 2025-01-14 は火曜日
      expect(getMondayOfWeek("2025-01-14")).toBe("2025-01-13");
    });

    it("水曜日を指定した場合は2日前の月曜日を返す", () => {
      // 2025-01-15 は水曜日
      expect(getMondayOfWeek("2025-01-15")).toBe("2025-01-13");
    });

    it("木曜日を指定した場合は3日前の月曜日を返す", () => {
      // 2025-01-16 は木曜日
      expect(getMondayOfWeek("2025-01-16")).toBe("2025-01-13");
    });

    it("金曜日を指定した場合は4日前の月曜日を返す", () => {
      // 2025-01-17 は金曜日
      expect(getMondayOfWeek("2025-01-17")).toBe("2025-01-13");
    });

    it("土曜日を指定した場合は5日前の月曜日を返す", () => {
      // 2025-01-18 は土曜日
      expect(getMondayOfWeek("2025-01-18")).toBe("2025-01-13");
    });

    it("日曜日を指定した場合は6日前の月曜日を返す", () => {
      // 2025-01-19 は日曜日
      expect(getMondayOfWeek("2025-01-19")).toBe("2025-01-13");
    });
  });

  describe("月跨ぎ", () => {
    it("月初の火曜日でも正しく前月の月曜日を返す", () => {
      // 2025-01-07 は火曜日
      expect(getMondayOfWeek("2025-01-07")).toBe("2025-01-06");
    });

    it("月初の日曜日でも正しく前月の月曜日を返す", () => {
      // 2025-02-02 は日曜日
      expect(getMondayOfWeek("2025-02-02")).toBe("2025-01-27");
    });
  });

  describe("年跨ぎ", () => {
    it("年初の日曜日でも正しく前年の月曜日を返す", () => {
      // 2025-01-05 は日曜日
      expect(getMondayOfWeek("2025-01-05")).toBe("2024-12-30");
    });
  });
});

describe("addDays", () => {
  it("指定日数後の日付を返す", () => {
    expect(addDays("2025-01-13", 1)).toBe("2025-01-14");
    expect(addDays("2025-01-13", 7)).toBe("2025-01-20");
  });

  it("負の日数で過去の日付を返す", () => {
    expect(addDays("2025-01-13", -1)).toBe("2025-01-12");
    expect(addDays("2025-01-13", -7)).toBe("2025-01-06");
  });

  it("月を跨ぐ計算を正しく行う", () => {
    expect(addDays("2025-01-31", 1)).toBe("2025-02-01");
    expect(addDays("2025-02-01", -1)).toBe("2025-01-31");
  });

  it("年を跨ぐ計算を正しく行う", () => {
    expect(addDays("2024-12-31", 1)).toBe("2025-01-01");
    expect(addDays("2025-01-01", -1)).toBe("2024-12-31");
  });
});

describe("getMonthRange", () => {
  it("月の開始日と終了日を返す", () => {
    const { start, end } = getMonthRange(2025, 1);
    expect(start).toBe("2025-01-01");
    expect(end).toBe("2025-01-31");
  });

  it("2月の日数を正しく計算する", () => {
    const { start, end } = getMonthRange(2025, 2);
    expect(start).toBe("2025-02-01");
    expect(end).toBe("2025-02-28");
  });

  it("うるう年の2月を正しく計算する", () => {
    const { start, end } = getMonthRange(2024, 2);
    expect(start).toBe("2024-02-01");
    expect(end).toBe("2024-02-29");
  });

  it("30日の月を正しく計算する", () => {
    const { start, end } = getMonthRange(2025, 4);
    expect(start).toBe("2025-04-01");
    expect(end).toBe("2025-04-30");
  });
});

describe("getWeekRange", () => {
  it("指定日から7日間の範囲を返す", () => {
    const { start, end } = getWeekRange("2025-01-13");
    expect(start).toBe("2025-01-13");
    expect(end).toBe("2025-01-19");
  });

  it("カスタム週長を指定できる", () => {
    const { start, end } = getWeekRange("2025-01-13", 5);
    expect(start).toBe("2025-01-13");
    expect(end).toBe("2025-01-17");
  });

  it("月を跨ぐ週を正しく計算する", () => {
    const { start, end } = getWeekRange("2025-01-27");
    expect(start).toBe("2025-01-27");
    expect(end).toBe("2025-02-02");
  });

  it("年を跨ぐ週を正しく計算する", () => {
    const { start, end } = getWeekRange("2024-12-30");
    expect(start).toBe("2024-12-30");
    expect(end).toBe("2025-01-05");
  });
});

describe("統合テスト", () => {
  it("parseLocalDate と formatLocalDate が逆変換できる", () => {
    const original = "2025-01-13";
    const parsed = parseLocalDate(original);
    const formatted = formatLocalDate(parsed);
    expect(formatted).toBe(original);
  });

  it("getMondayOfWeek と getWeekRange で月曜始まりの週を取得できる", () => {
    // 木曜日を指定
    const thursday = "2025-01-16";
    const monday = getMondayOfWeek(thursday);
    const { start, end } = getWeekRange(monday);

    // 月曜日から日曜日までの7日間
    expect(start).toBe("2025-01-13"); // 月曜日
    expect(end).toBe("2025-01-19"); // 日曜日
  });
});
