import { expect, it } from 'vitest';

import { captureEditVersion } from '../src/features/shifts/components/edit-version';

it('空枠からの編集開始後に他者の枠を取得しても、枠なしの初期状態を保持する', () => {
  const pending = captureEditVersion(undefined, undefined);
  expect(captureEditVersion(pending, { id: 'someone-else', revision: 0 })).toEqual({
    expectedRevision: null,
    expectedShiftId: null,
  });
});

it('編集中に再取得しても編集開始時のIDと更新世代を保持する', () => {
  const pending = captureEditVersion(undefined, { id: 'original', revision: 2 });
  expect(captureEditVersion(pending, { id: 'recreated', revision: 0 })).toEqual({
    expectedRevision: 2,
    expectedShiftId: 'original',
  });
});
