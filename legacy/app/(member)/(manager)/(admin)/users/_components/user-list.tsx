"use client";

import { Crown, EyeSlash, Star, User } from "@phosphor-icons/react";
import { format } from "date-fns";
import { ja } from "date-fns/locale";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { deleteUserAction, updateUserAction } from "../_lib/actions";
import { getRoleColor, getRoleDisplayName } from "../_lib/api";
import type { UserFormData, UserWithDetails } from "../_lib/types";
import UserModal from "./user-modal";

/** ユーザーID表示時のプレビュー文字数 */
const USER_ID_PREVIEW_LENGTH = 8;

type UserStatusStyles = {
  row: string;
  icon: string;
  text: string;
};

type UserStatusInfo = {
  styles: UserStatusStyles;
  Icon: typeof User | typeof Crown | typeof Star | typeof EyeSlash;
};

/**
 * ユーザーのステータス情報を取得する関数
 *
 * @description
 * ユーザーの権限ロールとアクティブ状態に基づいて、
 * 表示スタイル（行の背景色、アイコン色）とアイコンを返します。
 *
 * @param user - ステータス情報を取得するユーザー
 * @returns ステータス情報（スタイルとアイコン）
 */
function getUserStatusInfo(user: UserWithDetails): UserStatusInfo {
  if (!user.isActive) {
    return {
      styles: {
        row: "bg-gray-50/30 hover:bg-gray-50/50 dark:bg-gray-900/5 dark:hover:bg-gray-900/10",
        icon: "text-gray-600 dark:text-gray-400",
        text: "text-foreground",
      },
      Icon: EyeSlash,
    };
  }

  switch (user.role) {
    case "ADMIN":
      return {
        styles: {
          row: "bg-red-50/30 hover:bg-red-50/50 dark:bg-red-900/5 dark:hover:bg-red-900/10",
          icon: "text-red-600 dark:text-red-400",
          text: "text-foreground",
        },
        Icon: Crown,
      };
    case "MANAGER":
      return {
        styles: {
          row: "bg-blue-50/30 hover:bg-blue-50/50 dark:bg-blue-900/5 dark:hover:bg-blue-900/10",
          icon: "text-blue-600 dark:text-blue-400",
          text: "text-foreground",
        },
        Icon: Star,
      };
    default:
      return {
        styles: {
          row: "bg-green-50/30 hover:bg-green-50/50 dark:bg-green-900/5 dark:hover:bg-green-900/10",
          icon: "text-green-600 dark:text-green-400",
          text: "text-foreground",
        },
        Icon: User,
      };
  }
}

type UserRowProps = {
  user: UserWithDetails;
  onOpenModal: (user: UserWithDetails) => void;
};

/**
 * ユーザーテーブルの1行を表示するコンポーネント
 *
 * @description
 * ユーザー情報を権限ロール別に色分けされたテーブル行として表示します。
 * 行全体がクリッカブルで、クリックすると詳細・編集モーダルが開きます。
 * 非アクティブなユーザーは透明度を下げて表示されます。
 *
 * @component
 * @internal
 */
function UserRow({ user, onOpenModal }: UserRowProps) {
  const { styles: statusStyles, Icon: StatusIcon } = getUserStatusInfo(user);

  return (
    <TableRow
      className={`cursor-pointer transition-colors ${statusStyles.row} ${
        user.isActive ? "" : "opacity-60"
      }`}
      key={user.id}
      onClick={() => onOpenModal(user)}
    >
      <TableCell>
        <StatusIcon
          className={`h-5 w-5 ${statusStyles.icon}`}
          weight="regular"
        />
      </TableCell>
      <TableCell>
        <div>
          <p
            className={`font-medium ${statusStyles.text} ${
              user.isActive ? "" : "line-through"
            }`}
          >
            {user.displayName}
          </p>
          <p className="text-muted-foreground text-xs">
            ID: {user.id.substring(0, USER_ID_PREVIEW_LENGTH)}...
          </p>
        </div>
      </TableCell>
      <TableCell>
        <Badge
          className={`${getRoleColor(user.role)} font-medium`}
          variant="outline"
        >
          {getRoleDisplayName(user.role)}
        </Badge>
      </TableCell>
      <TableCell>
        <span
          className={`text-muted-foreground text-sm ${
            user.isActive ? "" : "line-through"
          }`}
        >
          {format(new Date(user.updatedAt), "MM/dd HH:mm", {
            locale: ja,
          })}
        </span>
      </TableCell>
      <TableCell>
        <span
          className={`text-muted-foreground text-sm ${
            user.isActive ? "" : "line-through"
          }`}
        >
          {format(new Date(user.createdAt), "MM/dd", {
            locale: ja,
          })}
        </span>
      </TableCell>
    </TableRow>
  );
}

/**
 * ユーザー一覧コンポーネントのプロパティ
 */
type UserListProps = {
  /** 表示するユーザーの配列 */
  users: UserWithDetails[];
};

/**
 * ユーザー一覧テーブルコンポーネント
 *
 * @description
 * ユーザー情報をテーブル形式で表示し、編集・無効化機能を提供するClient Componentです。
 * Server Componentから渡されたデータを表示し、モーダルの開閉状態を管理します。
 * 各行をクリックすることで詳細・編集モーダルが開き、ユーザー情報を更新できます。
 *
 * 主な機能:
 * - ユーザー一覧のテーブル表示（権限ロール別色分け）
 * - 行クリックでの詳細・編集モーダル表示
 * - ユーザー情報の更新（表示名、権限ロール、アクティブ状態）
 * - ユーザーの無効化（ADMIN以外のアクティブユーザー）
 * - Server Actionsによる更新・無効化
 * - ページリフレッシュ（router.refresh）による最新データ取得
 * - 空状態の表示
 *
 * @component
 * @example
 * ```tsx
 * <UserList users={filteredUsers} />
 * ```
 */
export function UserList({ users }: UserListProps) {
  const router = useRouter();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserWithDetails | null>(null);

  const handleOpenModal = useCallback((user?: UserWithDetails) => {
    setEditingUser(user ?? null);
    setIsModalOpen(true);
  }, []);

  const handleCloseModal = useCallback(() => {
    setIsModalOpen(false);
    setEditingUser(null);
  }, []);

  const handleSave = useCallback(
    async (formData: UserFormData) => {
      if (!editingUser) {
        throw new Error("編集対象のユーザーが設定されていません");
      }

      const result = await updateUserAction(editingUser.id, {
        displayName: formData.displayName,
        role: formData.role,
        isActive: formData.isActive,
      });

      if (!result.success) {
        throw new Error(result.error || "Failed to update user");
      }

      // ★重要★ Server Componentを再実行してサーバーから最新データを取得
      router.refresh();
      handleCloseModal();
    },
    [editingUser, router, handleCloseModal]
  );

  const handleDeactivate = useCallback(
    async (user: UserWithDetails) => {
      const result = await deleteUserAction(user.id);

      if (!result.success) {
        throw new Error(result.error || "Failed to deactivate user");
      }

      // ★重要★ Server Componentを再実行してサーバーから最新データを取得
      router.refresh();
    },
    [router]
  );

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow className="bg-white dark:bg-gray-900">
            <TableHead className="w-12" />
            <TableHead className="min-w-[120px]">ユーザー名</TableHead>
            <TableHead className="min-w-[100px]">権限</TableHead>
            <TableHead className="min-w-[120px]">最終更新</TableHead>
            <TableHead className="min-w-[120px]">登録日</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {users.length === 0 ? (
            <TableRow>
              <TableCell
                className="py-8 text-center text-muted-foreground"
                colSpan={5}
              >
                フィルター条件に一致するユーザーがいません
              </TableCell>
            </TableRow>
          ) : (
            users.map((user) => (
              <UserRow
                key={user.id}
                onOpenModal={handleOpenModal}
                user={user}
              />
            ))
          )}
        </TableBody>
      </Table>

      <UserModal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        onDeactivate={handleDeactivate}
        onSave={handleSave}
        user={editingUser}
      />
    </>
  );
}
