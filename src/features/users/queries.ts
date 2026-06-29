import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { client } from '@/lib/rpc';
import {
  type ChangeRoleInput,
  type LinkInstructorInput,
  type User,
  userListSchema,
  userSchema,
} from './schema';

/** API エラーレスポンスのスキーマ（型アサーションを避けるためランタイム検証する） */
const apiErrorSchema = z.object({ message: z.string().optional() });

/** User 関連クエリキー */
export const USERS_QUERY_KEY = ['users'] as const;

/** ユーザー一覧を取得する（ADMIN のみ）。 */
export function useUsers() {
  return useQuery<User[]>({
    queryKey: USERS_QUERY_KEY,
    queryFn: async () => {
      const res = await client.api.users.$get();
      if (!res.ok) {
        throw new Error('ユーザー一覧の取得に失敗しました');
      }
      return userListSchema.parse(await res.json());
    },
  });
}

/**
 * ユーザーのロールを変更するミューテーション。
 * 成功後は一覧キャッシュを無効化する。
 */
export function useChangeRole(id: string) {
  const queryClient = useQueryClient();
  return useMutation<User, Error, ChangeRoleInput>({
    mutationFn: async (input) => {
      const res = await client.api.users[':id']['change-role'].$post({
        param: { id },
        json: input,
      });
      if (!res.ok) {
        const body = apiErrorSchema.parse(await res.json());
        throw new Error(body.message ?? 'ロールの変更に失敗しました');
      }
      return userSchema.parse(await res.json());
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: USERS_QUERY_KEY });
    },
  });
}

/**
 * ユーザーを無効化するミューテーション。
 * 成功後は一覧キャッシュを無効化する。
 */
export function useDeactivateUser(id: string) {
  const queryClient = useQueryClient();
  return useMutation<User, Error, void>({
    mutationFn: async () => {
      const res = await client.api.users[':id'].deactivate.$post({ param: { id } });
      if (!res.ok) {
        const body = apiErrorSchema.parse(await res.json());
        throw new Error(body.message ?? 'ユーザーの無効化に失敗しました');
      }
      return userSchema.parse(await res.json());
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: USERS_QUERY_KEY });
    },
  });
}

/**
 * ユーザーをアクティブ化するミューテーション。
 * 成功後は一覧キャッシュを無効化する。
 */
export function useActivateUser(id: string) {
  const queryClient = useQueryClient();
  return useMutation<User, Error, void>({
    mutationFn: async () => {
      const res = await client.api.users[':id'].activate.$post({ param: { id } });
      if (!res.ok) {
        const body = apiErrorSchema.parse(await res.json());
        throw new Error(body.message ?? 'ユーザーのアクティブ化に失敗しました');
      }
      return userSchema.parse(await res.json());
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: USERS_QUERY_KEY });
    },
  });
}

/**
 * User を Instructor にリンクするミューテーション。
 * 成功後は一覧キャッシュを無効化する。
 */
export function useLinkInstructor(id: string) {
  const queryClient = useQueryClient();
  return useMutation<User, Error, LinkInstructorInput>({
    mutationFn: async (input) => {
      const res = await client.api.users[':id']['link-instructor'].$post({
        param: { id },
        json: input,
      });
      if (!res.ok) {
        const body = apiErrorSchema.parse(await res.json());
        throw new Error(body.message ?? 'インストラクターのリンクに失敗しました');
      }
      return userSchema.parse(await res.json());
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: USERS_QUERY_KEY });
    },
  });
}

/**
 * User から Instructor リンクを解除するミューテーション。
 * 成功後は一覧キャッシュを無効化する。
 */
export function useUnlinkInstructor(id: string) {
  const queryClient = useQueryClient();
  return useMutation<User, Error, void>({
    mutationFn: async () => {
      const res = await client.api.users[':id']['link-instructor'].$delete({ param: { id } });
      if (!res.ok) {
        const body = apiErrorSchema.parse(await res.json());
        throw new Error(body.message ?? 'インストラクターのリンク解除に失敗しました');
      }
      return userSchema.parse(await res.json());
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: USERS_QUERY_KEY });
    },
  });
}
