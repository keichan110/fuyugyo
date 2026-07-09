import { describe, expect, it } from 'vitest';

import {
  buildInviteUrl,
  findActiveInvitation,
  invitationStatusOf,
} from '../src/features/invitations/lib';
import type { Invitation } from '../src/features/invitations/schema';

/** テスト用の Invitation を組み立てる（未指定フィールドは有効な招待のデフォルト値） */
function makeInvitation(overrides: Partial<Invitation> = {}): Invitation {
  return {
    token: 'token-1',
    expiresAt: new Date('2026-07-17T00:00:00Z'),
    isActive: true,
    createdBy: 'user-1',
    maxUses: null,
    usedCount: 0,
    description: null,
    createdAt: new Date('2026-07-10T00:00:00Z'),
    updatedAt: new Date('2026-07-10T00:00:00Z'),
    ...overrides,
  };
}

const now = new Date('2026-07-10T12:00:00Z');

describe('invitationStatusOf', () => {
  it('期限切れなら isActive・maxUses に関わらず expired を返す', () => {
    const invitation = makeInvitation({
      expiresAt: new Date('2026-07-01T00:00:00Z'),
      isActive: true,
    });
    expect(invitationStatusOf(invitation, now)).toBe('expired');
  });

  it('期限切れかつ停止済みでも expired を優先する', () => {
    const invitation = makeInvitation({
      expiresAt: new Date('2026-07-01T00:00:00Z'),
      isActive: false,
    });
    expect(invitationStatusOf(invitation, now)).toBe('expired');
  });

  it('期限内で isActive=false なら deactivated を返す', () => {
    const invitation = makeInvitation({ isActive: false });
    expect(invitationStatusOf(invitation, now)).toBe('deactivated');
  });

  it('期限内・アクティブで使用上限に達していれば exhausted を返す', () => {
    const invitation = makeInvitation({ maxUses: 3, usedCount: 3 });
    expect(invitationStatusOf(invitation, now)).toBe('exhausted');
  });

  it('期限内・アクティブ・上限未到達なら active を返す', () => {
    const invitation = makeInvitation({ maxUses: 3, usedCount: 2 });
    expect(invitationStatusOf(invitation, now)).toBe('active');
  });

  it('maxUses=null（無制限）なら usedCount が多くても active を返す', () => {
    const invitation = makeInvitation({ maxUses: null, usedCount: 9999 });
    expect(invitationStatusOf(invitation, now)).toBe('active');
  });
});

describe('findActiveInvitation', () => {
  it('有効な1件を返す', () => {
    const active = makeInvitation({ token: 'active-token' });
    const deactivated = makeInvitation({ token: 'deactivated-token', isActive: false });
    const result = findActiveInvitation([deactivated, active], now);
    expect(result?.token).toBe('active-token');
  });

  it('有効な招待がなければ undefined を返す', () => {
    const expired = makeInvitation({
      token: 'expired-token',
      expiresAt: new Date('2026-07-01T00:00:00Z'),
    });
    const deactivated = makeInvitation({ token: 'deactivated-token', isActive: false });
    const result = findActiveInvitation([expired, deactivated], now);
    expect(result).toBeUndefined();
  });

  it('空配列なら undefined を返す', () => {
    expect(findActiveInvitation([], now)).toBeUndefined();
  });
});

describe('buildInviteUrl', () => {
  it('LINEログイン誘導URLを組み立てる', () => {
    const url = buildInviteUrl('https://example.com', 'abc-123');
    expect(url).toBe('https://example.com/api/auth/line/login?invite=abc-123&redirect=/');
  });
});
