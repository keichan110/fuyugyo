import { describe, expect, it } from 'vitest';

import {
  addCertification,
  addEmptyTier,
  createTierBlocks,
  moveCertification,
  removeCertification,
  removeEmptyTier,
  serializeTierBlocks,
} from '../src/features/certification-requirements/tier-editor-state';

describe('tier editor state', () => {
  it('保存済み要件を段ごとにまとめる', () => {
    expect(
      createTierBlocks([
        { certificationId: 'a', tierRank: 10 },
        { certificationId: 'b', tierRank: 10 },
        { certificationId: 'c', tierRank: 30 },
      ]).map(({ certificationIds }) => certificationIds),
    ).toEqual([['a', 'b'], ['c']]);
  });

  it('最初の資格で1段を作り、以後は最下段へ追加する', () => {
    const first = addCertification([], 'a', 'tier-1');
    expect(addCertification(first, 'b', 'unused')[0]?.certificationIds).toEqual(['a', 'b']);
  });

  it('明示的な空段を保持し、資格のドロップ先にできる', () => {
    const blocks = addEmptyTier(addCertification([], 'a', 'tier-1'), 'tier-2');
    expect(moveCertification(blocks, 'a', 'tier-2', 0)).toEqual([
      { id: 'tier-2', certificationIds: ['a'], preserveWhenEmpty: false },
    ]);
  });

  it('空段へ資格を追加した後は通常段として扱う', () => {
    const blocks = addEmptyTier(addCertification([], 'a', 'tier-1'), 'tier-2');
    const populated = addCertification(blocks, 'b', 'unused');

    expect(populated[1]).toEqual({
      id: 'tier-2',
      certificationIds: ['b'],
      preserveWhenEmpty: false,
    });
    expect(removeCertification(populated, 'b')).toHaveLength(1);
  });

  it('空段だけを取り消せる', () => {
    const blocks = addEmptyTier(addCertification([], 'a', 'tier-1'), 'tier-2');

    expect(removeEmptyTier(blocks, 'tier-2')).toHaveLength(1);
    expect(removeEmptyTier(blocks, 'tier-1')).toBe(blocks);
  });

  it('段内と段間で指定位置へ資格を挿入する', () => {
    const blocks = [
      { id: 'tier-1', certificationIds: ['a', 'b'], preserveWhenEmpty: false },
      { id: 'tier-2', certificationIds: ['c'], preserveWhenEmpty: false },
    ];
    expect(
      moveCertification(blocks, 'a', 'tier-2', 0).map((block) => block.certificationIds),
    ).toEqual([['b'], ['a', 'c']]);
    expect(moveCertification(blocks, 'a', 'tier-1', 2)[0]?.certificationIds).toEqual(['b', 'a']);
  });

  it('資格除外で空になった通常段を除去する', () => {
    expect(
      removeCertification(
        [{ id: 'tier-1', certificationIds: ['a'], preserveWhenEmpty: false }],
        'a',
      ),
    ).toEqual([]);
  });

  it('空段を除外して連番の保存形式へ変換する', () => {
    expect(
      serializeTierBlocks([
        { id: 'tier-1', certificationIds: ['a'], preserveWhenEmpty: false },
        { id: 'tier-2', certificationIds: [], preserveWhenEmpty: true },
        { id: 'tier-3', certificationIds: ['b', 'c'], preserveWhenEmpty: false },
      ]),
    ).toEqual([
      { certificationId: 'a', tierRank: 1 },
      { certificationId: 'b', tierRank: 2 },
      { certificationId: 'c', tierRank: 2 },
    ]);
  });
});
