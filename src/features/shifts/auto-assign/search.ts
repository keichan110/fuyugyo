import { compareCost, type Cost } from './criteria';
import type { AssignmentFrame } from './problem';

const MAX_RESTARTS = 20;
const MAX_IMPROVEMENT_EVALUATIONS = 20_000;

/** 割当案全体の評価値を返す関数。探索は評価の中身を知らない。 */
export type EvaluatePlan = (frames: readonly AssignmentFrame[]) => Cost;

/**
 * 評価値が最も良くなる割当案を探す。
 * 日付順の貪欲法で初期案を複数作り、最良の案を枠内の置換と日付間の交換で改善する。
 * 同一シードで再現でき、探索は回数上限を持つため最適解の保証はしない。
 */
export function searchAssignments(
  frames: readonly AssignmentFrame[],
  evaluate: EvaluatePlan,
  seed: number,
): AssignmentFrame[] {
  let best: AssignmentFrame[] = frames.map((frame) => ({ ...frame, selected: [] }));
  let bestCost: Cost | undefined;
  for (let restart = 0; restart < MAX_RESTARTS; restart += 1) {
    const random = createRandom(seed + restart);
    const candidate = frames.map((frame): AssignmentFrame => ({ ...frame, selected: [] }));
    for (const frame of candidate) {
      while (
        frame.selected.length < frame.required &&
        frame.selected.length < frame.candidates.size
      ) {
        let chosen: string | undefined;
        let chosenCost: Cost | undefined;
        for (const id of shuffled([...frame.candidates], random)) {
          if (frame.selected.includes(id)) continue;
          frame.selected.push(id);
          const cost = evaluate(candidate);
          frame.selected.pop();
          if (!chosenCost || compareCost(cost, chosenCost) < 0) {
            chosen = id;
            chosenCost = cost;
          }
        }
        if (chosen === undefined) break;
        frame.selected.push(chosen);
      }
    }
    const cost = evaluate(candidate);
    if (!bestCost || compareCost(cost, bestCost) < 0) {
      best = candidate;
      bestCost = cost;
    }
  }
  improve(best, evaluate);
  return best;
}

// 1枠内の置換に加えて日付間の交換も行い、貪欲法だけでは解けない偏りを改善する。
function improve(frames: AssignmentFrame[], evaluate: EvaluatePlan): void {
  let cost = evaluate(frames);
  let evaluations = 0;
  let changed = true;
  while (changed && evaluations < MAX_IMPROVEMENT_EVALUATIONS) {
    changed = false;
    for (const frame of frames) {
      for (let index = 0; index < frame.selected.length; index += 1) {
        const original = frame.selected[index];
        if (original === undefined) continue;
        for (const id of frame.candidates) {
          if (frame.selected.includes(id)) continue;
          frame.selected[index] = id;
          const next = evaluate(frames);
          evaluations += 1;
          if (compareCost(next, cost) < 0) {
            cost = next;
            changed = true;
            break;
          }
          frame.selected[index] = original;
          if (evaluations >= MAX_IMPROVEMENT_EVALUATIONS) return;
        }
        if (evaluations >= MAX_IMPROVEMENT_EVALUATIONS) return;
      }
    }
    for (let leftIndex = 0; leftIndex < frames.length; leftIndex += 1) {
      const left = frames[leftIndex];
      if (!left) continue;
      for (const right of frames.slice(leftIndex + 1)) {
        const leftSelected = new Set(left.selected);
        const rightSelected = new Set(right.selected);
        for (let a = 0; a < left.selected.length; a += 1) {
          for (let b = 0; b < right.selected.length; b += 1) {
            const leftId = left.selected[a];
            const rightId = right.selected[b];
            if (
              !leftId ||
              !rightId ||
              leftSelected.has(rightId) ||
              rightSelected.has(leftId) ||
              !left.candidates.has(rightId) ||
              !right.candidates.has(leftId)
            )
              continue;
            left.selected[a] = rightId;
            right.selected[b] = leftId;
            const next = evaluate(frames);
            evaluations += 1;
            if (compareCost(next, cost) < 0) {
              cost = next;
              changed = true;
              leftSelected.delete(leftId);
              leftSelected.add(rightId);
              rightSelected.delete(rightId);
              rightSelected.add(leftId);
            } else {
              left.selected[a] = leftId;
              right.selected[b] = rightId;
            }
            if (evaluations >= MAX_IMPROVEMENT_EVALUATIONS) return;
          }
        }
      }
    }
  }
}

function shuffled<T>(items: T[], random: () => number): T[] {
  for (let index = items.length - 1; index > 0; index -= 1) {
    const replacement = Math.floor(random() * (index + 1));
    const current = items[index];
    const selected = items[replacement];
    if (current !== undefined && selected !== undefined) {
      [items[index], items[replacement]] = [selected, current];
    }
  }
  return items;
}

function createRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}
