/**
 * ドメイン共通型定義
 *
 * @description
 * API契約とUIコンポーネントの両方で使用する型を定義します。
 * Clean Architectureの依存方向を守るため、API層とUI層の共通基盤として配置。
 *
 * 依存関係:
 * - UI層 (app/(member)) → この層 ← 正しい
 * - API層 (app/api) → この層 ← 正しい
 * - この層 → UI層 ← 誤り（発生させない）
 */

/**
 * 部門の最小限の型定義
 *
 * @description
 * APIレスポンスとUIコンポーネントで共通利用する部門型。
 * 必要最小限のプロパティのみを定義。
 */
export type DepartmentMinimal = {
  /** 部門ID */
  id: string;
  /** 部門名 */
  name: string;
  /** 部門コード（例: "SKI", "SNOWBOARD"） */
  code: string;
};

/**
 * シフト種別の最小限の型定義
 *
 * @description
 * APIレスポンスとUIコンポーネントで共通利用するシフト種別型。
 * 必要最小限のプロパティのみを定義。
 */
export type ShiftTypeMinimal = {
  /** シフト種別ID */
  id: string;
  /** シフト種別名（例: "午前", "午後"） */
  name: string;
  /** 有効/無効フラグ */
  isActive: boolean;
};
