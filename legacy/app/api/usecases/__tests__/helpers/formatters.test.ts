import {
  formatCertificationSummary,
  formatDateString,
  formatInstructorDisplayName,
  formatInstructorDisplayNameKana,
} from "../../helpers/formatters";

describe("formatInstructorDisplayName", () => {
  it("should format instructor name correctly", () => {
    const instructor = {
      lastName: "山田",
      firstName: "太郎",
    };

    const result = formatInstructorDisplayName(instructor);

    expect(result).toBe("山田 太郎");
  });

  it("should handle single-character names", () => {
    const instructor = {
      lastName: "李",
      firstName: "明",
    };

    const result = formatInstructorDisplayName(instructor);

    expect(result).toBe("李 明");
  });
});

describe("formatInstructorDisplayNameKana", () => {
  it("should format kana name when both fields exist", () => {
    const instructor = {
      lastName: "山田",
      firstName: "太郎",
      lastNameKana: "ヤマダ",
      firstNameKana: "タロウ",
    };

    const result = formatInstructorDisplayNameKana(instructor);

    expect(result).toBe("ヤマダ タロウ");
  });

  it("should fallback to kanji name when lastNameKana is null", () => {
    const instructor = {
      lastName: "山田",
      firstName: "太郎",
      lastNameKana: null,
      firstNameKana: "タロウ",
    };

    const result = formatInstructorDisplayNameKana(instructor);

    expect(result).toBe("山田 太郎");
  });

  it("should fallback to kanji name when firstNameKana is null", () => {
    const instructor = {
      lastName: "山田",
      firstName: "太郎",
      lastNameKana: "ヤマダ",
      firstNameKana: null,
    };

    const result = formatInstructorDisplayNameKana(instructor);

    expect(result).toBe("山田 太郎");
  });

  it("should fallback to kanji name when both kana fields are null", () => {
    const instructor = {
      lastName: "山田",
      firstName: "太郎",
      lastNameKana: null,
      firstNameKana: null,
    };

    const result = formatInstructorDisplayNameKana(instructor);

    expect(result).toBe("山田 太郎");
  });
});

describe("formatCertificationSummary", () => {
  it("should return 'なし' for empty array", () => {
    const result = formatCertificationSummary([]);

    expect(result).toBe("なし");
  });

  it("should format single certification", () => {
    const certifications = [
      {
        certification: {
          shortName: "SAJ1級",
        },
      },
    ];

    const result = formatCertificationSummary(certifications);

    expect(result).toBe("SAJ1級");
  });

  it("should format multiple certifications with comma separator", () => {
    const certifications = [
      {
        certification: {
          shortName: "SAJ1級",
        },
      },
      {
        certification: {
          shortName: "SAJ2級",
        },
      },
      {
        certification: {
          shortName: "JSBA A級",
        },
      },
    ];

    const result = formatCertificationSummary(certifications);

    expect(result).toBe("SAJ1級, SAJ2級, JSBA A級");
  });
});

describe("formatDateString", () => {
  it("should format date to YYYY-MM-DD using local timezone", () => {
    // Use constructor that creates date in local timezone
    const date = new Date(2025, 2, 15); // March 15, 2025

    const result = formatDateString(date);

    expect(result).toBe("2025-03-15");
  });

  it("should handle single-digit month and day with padding", () => {
    const date = new Date(2025, 0, 5); // January 5, 2025

    const result = formatDateString(date);

    expect(result).toBe("2025-01-05");
  });

  it("should handle year-end date", () => {
    const date = new Date(2024, 11, 31); // December 31, 2024

    const result = formatDateString(date);

    expect(result).toBe("2024-12-31");
  });

  it("should preserve local date without UTC conversion", () => {
    // Create a date at midnight local time
    const date = new Date(2025, 0, 1, 0, 0, 0); // January 1, 2025 00:00:00 local

    const result = formatDateString(date);

    // Should always be 2025-01-01 regardless of timezone
    expect(result).toBe("2025-01-01");
  });

  it("should handle dates from Prisma (with timezone offset)", () => {
    // Simulate Prisma returning a date with offset
    // e.g., "2025-01-01T00:00:00+09:00" parsed in JST
    const date = new Date(2025, 0, 1); // Local date

    const result = formatDateString(date);

    // Must return local calendar date, not UTC-converted date
    expect(result).toBe("2025-01-01");
  });
});
