import { cache } from "react";
import { getPrisma } from "@/lib/db";
import type { ShiftType } from "./types";

/**
 * シフト種別一覧を取得（Server Component用）
 * React.cacheでメモ化され、同一リクエスト内での重複クエリを防止
 */
export const getShiftTypes = cache(async (): Promise<ShiftType[]> => {
  const shiftTypes = await (await getPrisma()).shiftType.findMany({
    orderBy: [{ isActive: "desc" }, { name: "asc" }],
  });

  return shiftTypes;
});
