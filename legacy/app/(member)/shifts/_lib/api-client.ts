// シフト作成API クライアント関数

import type {
  ExistingShiftData,
  NewShiftData,
} from "../_components/shared/duplicate-dialog";

// HTTP ステータスコード定数
const HTTP_STATUS_CONFLICT = 409;

// 統合API用の型定義
export type PrepareShiftResponse = {
  success: boolean;
  data?: {
    mode: "create" | "edit";
    shift: ExistingShiftData | null;
    formData: {
      date: string;
      departmentId: string;
      shiftTypeId: string;
      description: string;
      selectedInstructorIds: string[];
    };
  };
  error?: string;
};

// API レスポンスの型定義
export type ShiftApiResponse = {
  success: boolean;
  data?: unknown;
  message?: string;
  error?: string;
};

// 重複エラーレスポンスの型定義
export interface DuplicateShiftError extends ShiftApiResponse {
  success: false;
  error: "DUPLICATE_SHIFT";
  data: {
    existing: ExistingShiftData;
    canForce: boolean;
    options: string[];
  };
  message: string;
}

// シフト作成パラメータ
export type CreateShiftParams = {
  date: string;
  departmentId: string;
  shiftTypeId: string;
  description?: string | undefined;
  assignedInstructorIds: string[];
  force?: boolean;
};

// シフト作成API関数
export async function createShift(
  params: CreateShiftParams
): Promise<ShiftApiResponse> {
  try {
    const response = await fetch("/api/shifts", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(params),
    });

    const result = await response.json();

    // HTTPステータスが成功でない場合の処理
    if (!response.ok) {
      if (
        response.status === HTTP_STATUS_CONFLICT &&
        result.error === "DUPLICATE_SHIFT"
      ) {
        // 重複エラーの場合、そのまま返す
        return result as DuplicateShiftError;
      }

      // その他のエラーの場合
      return {
        success: false,
        error: result.error || `HTTP Error: ${response.status}`,
        message: result.message,
      };
    }

    return result;
  } catch (_error) {
    return {
      success: false,
      error: "ネットワークエラーが発生しました",
    };
  }
}

// 重複エラーかどうかを判定するヘルパー関数
export function isDuplicateShiftError(
  response: ShiftApiResponse
): response is DuplicateShiftError {
  return !response.success && response.error === "DUPLICATE_SHIFT";
}

// シフト置換処理のヘルパー関数
async function handleReplaceAction(
  shiftData: NewShiftData,
  onSuccess: (message: string) => void,
  onError: (error: string) => void
): Promise<void> {
  const forceResponse = await createShift({
    date: shiftData.date,
    departmentId: shiftData.departmentId,
    shiftTypeId: shiftData.shiftTypeId,
    description: shiftData.description,
    assignedInstructorIds: shiftData.assignedInstructorIds,
    force: true,
  });

  if (forceResponse.success) {
    onSuccess(forceResponse.message || "シフトが正常に更新されました");
  } else {
    onError(forceResponse.error || "シフトの更新に失敗しました");
  }
}

// シフトマージ処理のヘルパー関数
async function handleMergeAction(
  shiftData: NewShiftData,
  duplicateError: DuplicateShiftError,
  onSuccess: (message: string) => void,
  onError: (error: string) => void
): Promise<void> {
  const existingInstructorIds = duplicateError.data.existing.assignments.map(
    (assignment: { instructor: { id: string } }) => assignment.instructor.id
  );

  const mergedInstructorIds = [
    ...existingInstructorIds,
    ...shiftData.assignedInstructorIds.filter(
      (id: string) => !existingInstructorIds.includes(id)
    ),
  ];

  const mergeResponse = await createShift({
    date: shiftData.date,
    departmentId: shiftData.departmentId,
    shiftTypeId: shiftData.shiftTypeId,
    description:
      shiftData.description ||
      duplicateError.data.existing.description ||
      undefined,
    assignedInstructorIds: mergedInstructorIds,
    force: true,
  });

  if (mergeResponse.success) {
    onSuccess(mergeResponse.message || "シフトが正常にマージされました");
  } else {
    onError(mergeResponse.error || "シフトのマージに失敗しました");
  }
}

// 重複シフト処理のオプション型定義
type HandleDuplicateShiftOptions = {
  shiftData: NewShiftData;
  duplicateError: DuplicateShiftError;
  onDuplicateFound: (
    existingShift: ExistingShiftData,
    newShiftData: NewShiftData
  ) => Promise<"merge" | "replace" | "cancel">;
  onSuccess: (message: string) => void;
  onError: (error: string) => void;
};

// 重複シフト処理のヘルパー関数
async function handleDuplicateShift(
  options: HandleDuplicateShiftOptions
): Promise<void> {
  const { shiftData, duplicateError, onDuplicateFound, onSuccess, onError } =
    options;

  const userAction = await onDuplicateFound(
    duplicateError.data.existing,
    shiftData
  );

  if (userAction === "cancel") {
    return;
  }

  if (userAction === "replace") {
    await handleReplaceAction(shiftData, onSuccess, onError);
    return;
  }

  if (userAction === "merge") {
    await handleMergeAction(shiftData, duplicateError, onSuccess, onError);
  }
}

// シフト作成処理のメインロジック
export async function handleShiftCreation(
  shiftData: NewShiftData,
  onDuplicateFound: (
    existingShift: ExistingShiftData,
    newShiftData: NewShiftData
  ) => Promise<"merge" | "replace" | "cancel">,
  onSuccess: (message: string) => void,
  onError: (error: string) => void
): Promise<void> {
  try {
    const response = await createShift({
      date: shiftData.date,
      departmentId: shiftData.departmentId,
      shiftTypeId: shiftData.shiftTypeId,
      description: shiftData.description,
      assignedInstructorIds: shiftData.assignedInstructorIds,
      force: false,
    });

    if (response.success) {
      onSuccess(response.message || "シフトが正常に作成されました");
      return;
    }

    if (isDuplicateShiftError(response)) {
      await handleDuplicateShift({
        shiftData,
        duplicateError: response,
        onDuplicateFound,
        onSuccess,
        onError,
      });
      return;
    }

    onError(response.error || "シフトの作成に失敗しました");
  } catch (_error) {
    onError("予期しないエラーが発生しました");
  }
}

// 統合API: シフト準備（重複チェック・編集準備）
export async function prepareShift(params: {
  date: string;
  departmentId: number;
  shiftTypeId: number;
}): Promise<PrepareShiftResponse> {
  try {
    const response = await fetch(
      `/api/shifts/prepare?date=${encodeURIComponent(params.date)}&departmentId=${params.departmentId}&shiftTypeId=${params.shiftTypeId}`
    );

    const result = await response.json();

    // HTTPステータスが成功でない場合の処理
    if (!response.ok) {
      return {
        success: false,
        error: result.error || `HTTP Error: ${response.status}`,
      };
    }

    return result;
  } catch (_error) {
    return {
      success: false,
      error: "ネットワークエラーが発生しました",
    };
  }
}
