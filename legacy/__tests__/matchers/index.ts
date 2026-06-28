/**
 * Jest カスタムマッチャー
 *
 * プロジェクト固有のアサーション機能を提供するJestカスタムマッチャーです。
 */

import { expect } from "@jest/globals";
import type { TestApiResponse } from "../types/test";

/**
 * APIレスポンスが成功形式かをチェックするマッチャー
 */
function toBeSuccessApiResponse(received: TestApiResponse) {
  const pass =
    typeof received === "object" &&
    received !== null &&
    received.success === true &&
    "data" in received &&
    !("error" in received);

  return {
    pass,
    message: () =>
      pass
        ? "Expected API response not to be success format"
        : `Expected API response to be success format (with success: true and data property).\nReceived: ${JSON.stringify(received, null, 2)}`,
  };
}

/**
 * APIレスポンスがエラー形式かをチェックするマッチャー
 */
function toBeErrorApiResponse(
  received: TestApiResponse,
  expectedError?: string
) {
  const isErrorFormat =
    typeof received === "object" &&
    received !== null &&
    received.success === false &&
    "error" in received &&
    typeof received.error === "string";

  const errorMatches = expectedError ? received.error === expectedError : true;
  const pass = isErrorFormat && errorMatches;

  return {
    pass,
    message: () => {
      if (!isErrorFormat) {
        return `Expected API response to be error format (with success: false and error property).\nReceived: ${JSON.stringify(received, null, 2)}`;
      }
      if (!errorMatches) {
        return `Expected API error to be "${expectedError}", but received "${received.error}"`;
      }
      return "Expected API response not to be error format";
    },
  };
}

/**
 * 日付が指定範囲内かをチェックするマッチャー
 */
function toBeDateWithinRange(received: Date, startDate: Date, endDate: Date) {
  const receivedTime = received.getTime();
  const startTime = startDate.getTime();
  const endTime = endDate.getTime();

  const pass = receivedTime >= startTime && receivedTime <= endTime;

  return {
    pass,
    message: () =>
      pass
        ? `Expected date ${received.toISOString()} not to be within range ${startDate.toISOString()} - ${endDate.toISOString()}`
        : `Expected date ${received.toISOString()} to be within range ${startDate.toISOString()} - ${endDate.toISOString()}`,
  };
}

/**
 * 配列が指定されたプロパティでソートされているかをチェックするマッチャー
 */
function toBeSortedBy(
  received: any[],
  property: string,
  order: "asc" | "desc" = "asc"
) {
  if (!Array.isArray(received)) {
    return {
      pass: false,
      message: () =>
        `Expected value to be an array, but received ${typeof received}`,
    };
  }

  if (received.length <= 1) {
    return {
      pass: true,
      message: () =>
        `Array with ${received.length} elements is considered sorted`,
    };
  }

  let isSorted = true;
  let violationIndex = -1;

  for (let i = 1; i < received.length; i++) {
    const current = received[i][property];
    const previous = received[i - 1][property];

    if (order === "asc") {
      if (current < previous) {
        isSorted = false;
        violationIndex = i;
        break;
      }
    } else if (current > previous) {
      isSorted = false;
      violationIndex = i;
      break;
    }
  }

  return {
    pass: isSorted,
    message: () => {
      if (isSorted) {
        return `Expected array not to be sorted by "${property}" in ${order} order`;
      }
      const violation = received[violationIndex];
      const previous = received[violationIndex - 1];
      return `Expected array to be sorted by "${property}" in ${order} order.\nViolation at index ${violationIndex}: ${JSON.stringify(previous)} should come ${order === "asc" ? "before" : "after"} ${JSON.stringify(violation)}`;
    },
  };
}

/**
 * 日本の祝日かをチェックするマッチャー
 */
function toBeJapaneseHoliday(received: Date) {
  // japanese-holidays ライブラリを使用
  let isHoliday = false;
  let holidayName = "";

  try {
    const japaneseHolidays = require("japanese-holidays");
    const holiday = japaneseHolidays.isHoliday(received);
    isHoliday = !!holiday;
    holidayName = holiday ? holiday.name : "";
  } catch (_error) {
    // ライブラリが利用できない場合はスキップ
    return {
      pass: false,
      message: () =>
        "Could not check Japanese holidays: japanese-holidays library not available",
    };
  }

  return {
    pass: isHoliday,
    message: () =>
      isHoliday
        ? `Expected ${received.toDateString()} not to be a Japanese holiday (${holidayName})`
        : `Expected ${received.toDateString()} to be a Japanese holiday`,
  };
}

/**
 * 週末（土日）かをチェックするマッチャー
 */
function toBeWeekend(received: Date) {
  const dayOfWeek = received.getDay();
  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6; // 0 = Sunday, 6 = Saturday

  return {
    pass: isWeekend,
    message: () =>
      isWeekend
        ? `Expected ${received.toDateString()} not to be a weekend`
        : `Expected ${received.toDateString()} to be a weekend (Saturday or Sunday)`,
  };
}

/**
 * 配列に重複がないかをチェックするマッチャー
 */
function toHaveUniqueElements(
  received: any[],
  keyExtractor?: (item: any) => any
) {
  if (!Array.isArray(received)) {
    return {
      pass: false,
      message: () =>
        `Expected value to be an array, but received ${typeof received}`,
    };
  }

  const values = keyExtractor ? received.map(keyExtractor) : received;

  const uniqueValues = new Set(values);
  const hasUniqueElements = uniqueValues.size === values.length;

  if (!hasUniqueElements) {
    const duplicates = values.filter(
      (value, index) => values.indexOf(value) !== index
    );
    const uniqueDuplicates = [...new Set(duplicates)];

    return {
      pass: false,
      message: () =>
        `Expected array to have unique elements, but found duplicates: ${JSON.stringify(uniqueDuplicates)}`,
    };
  }

  return {
    pass: true,
    message: () => "Expected array not to have unique elements",
  };
}

/**
 * Promiseが指定時間内に解決されるかをチェックするマッチャー
 */
async function toResolveWithin(received: Promise<any>, timeoutMs: number) {
  const startTime = Date.now();

  try {
    const _result = await Promise.race([
      received,
      new Promise((_, reject) =>
        setTimeout(
          () => reject(new Error(`Timeout after ${timeoutMs}ms`)),
          timeoutMs
        )
      ),
    ]);

    const duration = Date.now() - startTime;

    return {
      pass: duration <= timeoutMs,
      message: () =>
        `Promise resolved in ${duration}ms, expected within ${timeoutMs}ms`,
    };
  } catch (error) {
    if (error instanceof Error && error.message.includes("Timeout")) {
      return {
        pass: false,
        message: () => `Promise did not resolve within ${timeoutMs}ms`,
      };
    }

    throw error; // 他のエラーは再スロー
  }
}

// カスタムマッチャーを Jest に登録
expect.extend({
  toBeSuccessApiResponse,
  toBeErrorApiResponse,
  toBeDateWithinRange,
  toBeSortedBy,
  toBeJapaneseHoliday,
  toBeWeekend,
  toHaveUniqueElements,
  toResolveWithin,
});

// TypeScript 型定義のエクスポート（テストファイルで使用）
export {
  toBeSuccessApiResponse,
  toBeErrorApiResponse,
  toBeDateWithinRange,
  toBeSortedBy,
  toBeJapaneseHoliday,
  toBeWeekend,
  toHaveUniqueElements,
  toResolveWithin,
};
