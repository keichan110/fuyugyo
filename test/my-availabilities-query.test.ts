import { describe, expect, it } from 'vitest';

import {
  MY_AVAILABILITIES_QUERY_KEY,
  myAvailabilitiesQueryKey,
} from '../src/features/availabilities/queries';

describe('myAvailabilitiesQueryKey', () => {
  it('認証主体ごとに異なるクエリキーを組み立てる', () => {
    expect(myAvailabilitiesQueryKey('userA', '2026-01')).not.toEqual(
      myAvailabilitiesQueryKey('userB', '2026-01'),
    );
  });

  it('同じ認証主体でも対象月ごとに異なるクエリキーを組み立てる', () => {
    expect(myAvailabilitiesQueryKey('userA', '2026-01')).not.toEqual(
      myAvailabilitiesQueryKey('userA', '2026-02'),
    );
  });

  it('本人可用性キーをプレフィックスとして維持する', () => {
    expect(myAvailabilitiesQueryKey('userA', '2026-01')).toEqual([
      ...MY_AVAILABILITIES_QUERY_KEY,
      'userA',
      '2026-01',
    ]);
  });
});
