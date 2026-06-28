/**
 * Result パターンの実装
 * エラーハンドリングを型安全に行うための共通パターン
 */

/**
 * 成功またはエラーの結果を表現する型
 */
export type Result<T, E = Error> =
  | { readonly success: true; readonly data: T }
  | { readonly success: false; readonly error: E };

/**
 * 成功結果を作成
 */
export const success = <T>(data: T): Result<T, never> => ({
  success: true,
  data,
});

/**
 * エラー結果を作成
 */
export const failure = <E = Error>(error: E): Result<never, E> => ({
  success: false,
  error,
});

/**
 * Result の値を取得（成功時のみ）
 */
export const unwrap = <T, E>(result: Result<T, E>): T => {
  if (result.success) {
    return result.data;
  }
  throw new Error(`Cannot unwrap failed result: ${result.error}`);
};

/**
 * Result の値を取得（デフォルト値付き）
 */
export const unwrapOr = <T, E>(result: Result<T, E>, defaultValue: T): T =>
  result.success ? result.data : defaultValue;

/**
 * Result に関数を適用（map操作）
 */
export const map = <T, U, E>(
  result: Result<T, E>,
  fn: (value: T) => U
): Result<U, E> =>
  result.success ? success(fn(result.data)) : failure(result.error);

/**
 * Result に非同期関数を適用（flatMap操作）
 */
export const flatMap = <T, U, E>(
  result: Result<T, E>,
  fn: (value: T) => Result<U, E>
): Result<U, E> => (result.success ? fn(result.data) : failure(result.error));

/**
 * 複数の Result を結合
 */
export const combine = <T extends readonly unknown[], E>(
  results: {
    [K in keyof T]: Result<T[K], E>;
  }
): Result<T, E> => {
  const values: unknown[] = [];

  for (const result of results) {
    if (!result.success) {
      return failure(result.error);
    }
    values.push(result.data);
  }

  return success(values as unknown as T);
};

/**
 * Promise を Result に変換
 */
export const fromPromise = async <T>(
  promise: Promise<T>
): Promise<Result<T, Error>> => {
  try {
    const data = await promise;
    return success(data);
  } catch (error) {
    return failure(error instanceof Error ? error : new Error(String(error)));
  }
};

/**
 * Result を Promise に変換
 */
export const toPromise = <T, E>(result: Result<T, E>): Promise<T> =>
  result.success ? Promise.resolve(result.data) : Promise.reject(result.error);
