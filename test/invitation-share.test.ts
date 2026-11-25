import { describe, expect, it } from 'vitest';

import {
  buildInviteUrl,
  buildLineShareUrl,
  buildShareMessage,
  formatDateTimeJst,
} from '../src/features/invitations/lib';

describe('招待リンクの共有', () => {
  const expiresAt = new Date('2026-12-01T15:30:00Z');

  it('期限は実行環境のタイムゾーンによらず日本時間で表示する', () => {
    // UTC 15:30 は日本時間では翌日 00:30
    expect(formatDateTimeJst(expiresAt)).toBe('2026/12/02 00:30');
  });

  it('共有文面に実際の期限（日本時間）を含める', () => {
    expect(buildShareMessage(expiresAt)).toContain('2026/12/02 00:30');
  });

  it('LINE 共有 URL に文面と招待 URL をエンコードして渡す', () => {
    const url = buildInviteUrl('https://example.com', 'tok-1');
    const shareUrl = buildLineShareUrl('文面', url);
    expect(shareUrl.startsWith('https://line.me/R/share?text=')).toBe(true);
    const text = new URL(shareUrl).searchParams.get('text');
    expect(text).toBe(`文面\n${url}`);
  });
});
