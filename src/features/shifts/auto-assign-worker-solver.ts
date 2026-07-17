import type { AutoAssignSolveResult } from './auto-assign-solver';
import type { AutoAssignSolver } from './auto-assign-solver-port';

/**
 * Web Worker 上でローカルソルバーを実行する {@link AutoAssignSolver} 実装。
 * variant を再現可能な乱択シードへ変換し、Worker の postMessage/イベントを Promise へ包む。
 * 呼び出しごとに Worker を生成し、解決・失敗時に必ず terminate する。
 */
export function createWorkerSolver(): AutoAssignSolver {
  return ({ context, params, variant = 0 }) =>
    new Promise<AutoAssignSolveResult>((resolve, reject) => {
      const worker = new Worker(new URL('./auto-assign.worker.ts', import.meta.url), {
        type: 'module',
      });
      worker.addEventListener('message', (event: MessageEvent<AutoAssignSolveResult>) => {
        resolve(event.data);
        worker.terminate();
      });
      worker.addEventListener('error', (event) => {
        reject(
          event.error instanceof Error ? event.error : new Error('自動割当の計算に失敗しました'),
        );
        worker.terminate();
      });
      // 同じ variant なら同じ提案になるよう、そのままシードとして渡す。
      worker.postMessage({ context, params, seed: variant });
    });
}
