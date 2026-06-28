"use client";

import { useAuth } from "@/app/_providers/auth";
import type {
  AuthenticatedUser,
  InstructorBasicInfo,
  UserInstructorProfile,
} from "@/types/actions";
import { HeaderMenuDrawer } from "./header-menu-drawer";
import { HeaderShell } from "./header-shell";
import { HeaderUserDropdown } from "./header-user-dropdown";

/**
 * 認証済みルート用Headerコンポーネント
 *
 * MEMBER以上の権限を持つユーザー向けに、権限に応じた機能を表示。
 * - 全ユーザー: ロゴ + 管理メニューDrawer + ユーザードロップダウン
 * - メニューDrawer内のアイテムは権限に応じてフィルタリングされる
 *
 * インストラクター情報はサーバーから渡され、router.refresh()で更新される。
 * ユーザー情報のみクライアント側のAuthContext(displayName変更、logout等)を優先する。
 */
type HeaderAuthenticatedProps = {
  /** サーバー側で取得済みのユーザー情報(フォールバック用) */
  user: AuthenticatedUser;
  /** サーバー側で取得済みのインストラクタープロファイル */
  instructorProfile: UserInstructorProfile | null;
  /** サーバー側で取得済みの利用可能インストラクター一覧 */
  availableInstructors: InstructorBasicInfo[];
};

export function HeaderAuthenticated({
  user: serverUser,
  instructorProfile,
  availableInstructors,
}: HeaderAuthenticatedProps) {
  // クライアント側の最新認証状態を購読
  const { user: clientUser } = useAuth();

  // クライアント状態が利用可能ならそちらを優先、なければサーバーデータを使用
  const currentUser = (clientUser ?? serverUser) as AuthenticatedUser;

  return (
    <HeaderShell
      leftSlot={<HeaderMenuDrawer user={currentUser} />}
      rightSlot={
        <HeaderUserDropdown
          availableInstructors={availableInstructors}
          instructorProfile={instructorProfile}
          user={currentUser}
        />
      }
    />
  );
}
