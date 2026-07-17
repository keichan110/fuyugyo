import type { AutoAssignSolveResult } from './auto-assign-solver';
import type { AutoAssignContext, AutoAssignExecutionParams } from './schema';

/**
 * 自動割当の生成要求。transport 非依存で、ローカル計算・将来のサーバー AI 双方が満たす。
 */
export type AutoAssignRequest = {
  context: AutoAssignContext;
  params: AutoAssignExecutionParams;
  /**
   * 別案の識別子（0 起点）。値を変えると異なる提案を得る。
   * ローカルソルバーは乱択シードへ、AI は再生成指示へ、と各実装が変換する。
   */
  variant?: number;
};

/**
 * 自動割当ソルバーのポート。呼び出し側は生成手段（Web Worker / サーバー AI 等）を
 * 意識せず、要求を渡して提案を受け取る。実装の差し替えはこの型を満たすことだけで済む。
 */
export type AutoAssignSolver = (request: AutoAssignRequest) => Promise<AutoAssignSolveResult>;
