import { composeInstructorMonthWork, type DetailedCellAssignment } from '../workload';

/** 対象メンバーの当月勤務を全部門で集計し、重複を除いた勤務日数の多い順に並べる。 */
export function monthlyPlacementData({
  people,
  savedAssignments,
  stagedAssignments,
}: {
  people: readonly { id: string; name: string }[];
  savedAssignments: DetailedCellAssignment[];
  stagedAssignments: DetailedCellAssignment[];
}) {
  return people
    .map((person) => {
      const work = composeInstructorMonthWork(savedAssignments, stagedAssignments, person.id);
      return {
        ...person,
        total: work.size,
      };
    })
    .sort(
      (a, b) => b.total - a.total || a.name.localeCompare(b.name, 'ja') || a.id.localeCompare(b.id),
    );
}

/** 勤務日数ごとの人数分布と中央値を求める。0日と途中の空の階級も含め、各人は1階級にだけ数える。 */
export function monthlyPlacementDistribution(
  people: readonly { id: string; name: string; total: number }[],
) {
  if (people.length === 0) return { bins: [], median: null };
  const sorted = people.map((person) => person.total).sort((a, b) => a - b);
  const max = sorted[sorted.length - 1] ?? 0;
  const middle = Math.floor(sorted.length / 2);
  const median =
    sorted.length % 2 === 0
      ? ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2
      : (sorted[middle] ?? 0);
  const bins = Array.from({ length: max + 1 }, (_, days) => {
    const members = people.filter((person) => person.total === days);
    return { days, count: members.length, members };
  });
  return { bins, median };
}
