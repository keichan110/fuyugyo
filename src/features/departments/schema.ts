import { z } from 'zod';

/**
 * Department feature の境界スキーマ（isomorphic）。
 * サーバー（`api.ts`）の入出力検証とクライアント（`queries.ts`）の表示で共有する。
 */

/**
 * 部門コードの固定分類語彙（ADR 0011）。
 * 視覚的アイデンティティ（色・アイコン・ラベル）はこの enum をキーにした
 * 全域マップ（`appearance.ts`）で表現する。
 */
export const departmentCodeSchema = z.enum(['ski', 'snowboard']);

export type DepartmentCode = z.infer<typeof departmentCodeSchema>;

/** 部門コードの表示ラベル。サーバーとクライアントで共有する。 */
export const DEPARTMENT_LABELS: Record<DepartmentCode, string> = {
  ski: 'スキー',
  snowboard: 'スノーボード',
};
