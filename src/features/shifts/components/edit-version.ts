type PendingVersion = {
  expectedRevision?: number | null;
  expectedShiftId?: string | null;
};

type SavedVersion = { id: string; revision: number };

/** 編集開始時の枠と更新世代を保持する。枠なしを表すnullも再取得で置き換えない。 */
export function captureEditVersion(
  pending: PendingVersion | undefined,
  saved: SavedVersion | undefined,
) {
  return pending
    ? {
        expectedRevision: pending.expectedRevision ?? null,
        expectedShiftId: pending.expectedShiftId ?? null,
      }
    : { expectedRevision: saved?.revision ?? null, expectedShiftId: saved?.id ?? null };
}

/** ステージ済みの変更へ編集開始時の版を付与し、元のMapを変更せずに返す。 */
export function preserveStagedVersions<T extends PendingVersion>(
  next: ReadonlyMap<string, T>,
  previous: ReadonlyMap<string, T>,
  saved: ReadonlyMap<string, SavedVersion>,
): Map<string, T> {
  return new Map(
    Array.from(next, ([key, value]) => [
      key,
      {
        ...value,
        ...captureEditVersion(previous.get(key), saved.get(key)),
      },
    ]),
  );
}

/** 一枠の編集を初回の版とともにステージし、他の枠の編集を保持する。 */
export function stageAssignment<T extends PendingVersion>(
  previous: ReadonlyMap<string, T>,
  key: string,
  value: T,
  saved: ReadonlyMap<string, SavedVersion>,
): Map<string, T> {
  const next = new Map(previous);
  next.set(key, { ...value, ...captureEditVersion(previous.get(key), saved.get(key)) });
  return next;
}
