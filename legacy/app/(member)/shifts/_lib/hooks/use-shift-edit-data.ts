import { useQuery } from "@tanstack/react-query";
import type { ShiftEditDataResponse } from "@/app/api/usecases/types/responses";
import { SHIFT_CACHE_CONFIG } from "@/lib/api/cache-config";

/**
 * シフト編集データ取得パラメータ
 */
type UseShiftEditDataParams = {
  /** 日付（YYYY-MM-DD形式） */
  date: string;
  /** 部門ID */
  departmentId: number;
  /** シフト種別ID */
  shiftTypeId: number;
  /** クエリを有効化するかどうか（デフォルト: true） */
  enabled?: boolean;
};

/**
 * シフト編集データを取得するReact Queryフック
 *
 * @description
 * `/api/usecases/shifts/edit-data`エンドポイントから、シフト編集に必要な全データを取得します。
 * - 既存シフト情報（編集モード時）
 * - 利用可能なインストラクター一覧（アサイン状態・競合情報付き）
 * - 同日の他シフトとの競合情報
 * - フォーム初期値
 *
 * React Queryによる自動キャッシュ・リフレッシュ機能を提供します。
 *
 * @param params - クエリパラメータ
 * @param params.date - 対象日付（YYYY-MM-DD形式）
 * @param params.departmentId - 部門ID
 * @param params.shiftTypeId - シフト種別ID
 * @param params.enabled - クエリの有効/無効を制御（モーダルの開閉に連動）
 *
 * @returns {UseQueryResult} React Queryの結果オブジェクト
 * @returns {ShiftEditDataResponse['data']} data - 取得したシフト編集データ
 * @returns {boolean} isLoading - ローディング状態
 * @returns {Error | null} error - エラー情報
 *
 * @example
 * ```tsx
 * function ShiftEditModal({ isOpen, date, departmentId, shiftTypeId }) {
 *   const { data, isLoading, error } = useShiftEditData({
 *     date,
 *     departmentId,
 *     shiftTypeId,
 *     enabled: isOpen, // モーダルが開いている時のみデータ取得
 *   });
 *
 *   if (isLoading) return <div>読み込み中...</div>;
 *   if (error) return <div>エラー: {error.message}</div>;
 *
 *   return (
 *     <div>
 *       <h2>{data.mode === 'edit' ? 'シフト編集' : 'シフト作成'}</h2>
 *       {data.availableInstructors.map(instructor => (
 *         <InstructorItem key={instructor.id} {...instructor} />
 *       ))}
 *     </div>
 *   );
 * }
 * ```
 *
 * @see {@link ShiftEditDataResponse} レスポンス型定義
 */
export function useShiftEditData(params: UseShiftEditDataParams) {
  return useQuery({
    queryKey: [
      "shift-edit-data",
      params.date,
      params.departmentId,
      params.shiftTypeId,
    ],
    queryFn: async () => {
      const searchParams = new URLSearchParams({
        date: params.date,
        departmentId: params.departmentId.toString(),
        shiftTypeId: params.shiftTypeId.toString(),
      });

      const response = await fetch(
        `/api/usecases/shifts/edit-data?${searchParams.toString()}`
      );

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data: ShiftEditDataResponse = await response.json();

      if (!data.success) {
        throw new Error(data.error);
      }

      return data.data;
    },
    enabled: params.enabled !== false,
    staleTime: 0,
    gcTime: SHIFT_CACHE_CONFIG.GC_TIME_MS,
  });
}
