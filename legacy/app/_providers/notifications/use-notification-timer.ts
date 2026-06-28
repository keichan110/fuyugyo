import { useCallback, useEffect, useRef, useState } from "react";

// 定数（notification-item.tsxから共有）
const PROGRESS_UPDATE_INTERVAL_MS = 50;
const PROGRESS_PERCENT_BASE = 100;

type UseNotificationTimerProps = {
  duration: number | undefined;
  persistent: boolean | undefined;
  onComplete: () => void;
  isPaused: boolean;
  isExiting: boolean;
};

/**
 * 通知のタイマーとプログレス管理を担当するカスタムフック
 */
export function useNotificationTimer({
  duration,
  persistent,
  onComplete,
  isPaused,
  isExiting,
}: UseNotificationTimerProps) {
  const [progress, setProgress] = useState(0);
  const progressIntervalRef = useRef<NodeJS.Timeout>();
  const isPausedRef = useRef(isPaused);
  const isExitingRef = useRef(isExiting);

  // refs を最新の値で更新
  isPausedRef.current = isPaused;
  isExitingRef.current = isExiting;

  // 完了処理
  const handleComplete = useCallback(() => {
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current);
    }
    onComplete();
  }, [onComplete]);

  // タイマー管理
  useEffect(() => {
    // 無効な条件の場合は早期リターン
    if (!duration || duration <= 0 || persistent) {
      return;
    }

    const startTime = Date.now();
    let pausedAt = 0;
    let totalPausedTime = 0;

    // 一時停止時の処理
    const handlePause = () => {
      if (pausedAt === 0) {
        pausedAt = Date.now();
      }
    };

    // 一時停止解除時の処理
    const resumeFromPause = () => {
      if (pausedAt > 0) {
        totalPausedTime += Date.now() - pausedAt;
        pausedAt = 0;
      }
    };

    // プログレス計算
    const calculateProgress = (): number => {
      const elapsed = Date.now() - startTime - totalPausedTime;
      return Math.min(
        (elapsed / duration) * PROGRESS_PERCENT_BASE,
        PROGRESS_PERCENT_BASE
      );
    };

    // プログレス更新処理
    const updateProgress = () => {
      // 一時停止中の処理
      if (isPausedRef.current) {
        handlePause();
        return;
      }

      // 一時停止から復帰
      resumeFromPause();

      // 退出中でなければプログレスを更新
      if (!isExitingRef.current) {
        const progressPercent = calculateProgress();
        setProgress(progressPercent);

        // 完了時の処理
        if (progressPercent >= PROGRESS_PERCENT_BASE) {
          handleComplete();
        }
      }
    };

    // タイマー開始
    const intervalId = setInterval(updateProgress, PROGRESS_UPDATE_INTERVAL_MS);
    progressIntervalRef.current = intervalId;

    // クリーンアップ
    return () => {
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [duration, persistent, handleComplete]);

  return { progress };
}
