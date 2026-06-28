"use client";

import { User } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useAuth } from "@/app/_providers/auth";
import { InstructorSelectModal } from "@/app/(member)/_components/instructor-select-modal";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type {
  AuthenticatedUser,
  InstructorBasicInfo,
  UserInstructorProfile,
} from "@/types/actions";

/**
 * ユーザードロップダウンコンポーネント
 * 認証済みユーザーのアバターとメニューを表示
 *
 * インストラクター情報の更新は router.refresh() で行われる。
 * ユーザー情報のみクライアント側のAuthContext(displayName変更、logout等)を優先する。
 */
type HeaderUserDropdownProps = {
  /** サーバー側で取得済みのユーザー情報(フォールバック用) */
  user: AuthenticatedUser;
  /** 紐づけられたインストラクター情報 */
  instructorProfile: UserInstructorProfile | null;
  /** 利用可能なインストラクター一覧 */
  availableInstructors: InstructorBasicInfo[];
};

export function HeaderUserDropdown({
  user: serverUser,
  instructorProfile,
  availableInstructors,
}: HeaderUserDropdownProps) {
  // クライアント側の最新認証状態を購読
  const { user: clientUser } = useAuth();
  const router = useRouter();

  // モーダル表示状態
  const [modalOpen, setModalOpen] = useState(false);

  // クライアント状態が利用可能ならそちらを優先、なければサーバーデータを使用
  const user = (clientUser ?? serverUser) as AuthenticatedUser;

  // インストラクター紐付け成功時の処理
  const handleSuccess = () => {
    router.refresh();
  };
  // 権限に応じた日本語表示
  const getRoleLabel = (role: string): string => {
    switch (role) {
      case "ADMIN":
        return "管理者";
      case "MANAGER":
        return "マネージャー";
      default:
        return "メンバー";
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button className="h-8 w-8 p-0" size="sm" variant="ghost">
          <Avatar className="h-8 w-8 cursor-pointer transition-all hover:ring-2 hover:ring-primary/20">
            <AvatarImage alt={user.displayName} src={user.pictureUrl || ""} />
            <AvatarFallback className="bg-gradient-to-br from-blue-100 via-blue-300 to-indigo-400 font-semibold text-sm text-white">
              {user.displayName.charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[280px] p-4">
        <div className="space-y-4">
          {/* ユーザー情報 */}
          <div className="flex items-center space-x-3">
            <Avatar className="h-12 w-12">
              <AvatarImage alt={user.displayName} src={user.pictureUrl || ""} />
              <AvatarFallback className="bg-gradient-to-br from-blue-100 via-blue-300 to-indigo-400 font-semibold text-white">
                {user.displayName.charAt(0).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1">
              <p className="font-medium text-sm">{user.displayName}</p>
              <p className="text-muted-foreground text-xs">
                {getRoleLabel(user.role)}
              </p>
            </div>
          </div>

          {/* インストラクター情報 */}
          <div className="border-t pt-3">
            <div className="mb-2 text-muted-foreground text-xs">
              インストラクター情報
            </div>
            {instructorProfile ? (
              <Button
                className="h-auto w-full justify-start text-left"
                onClick={() => setModalOpen(true)}
                variant="ghost"
              >
                <div className="flex flex-col gap-0.5">
                  <p className="font-medium text-sm">
                    {instructorProfile.lastName} {instructorProfile.firstName}
                  </p>
                  {instructorProfile.lastNameKana && (
                    <p className="text-muted-foreground text-xs">
                      {instructorProfile.lastNameKana}{" "}
                      {instructorProfile.firstNameKana}
                    </p>
                  )}
                </div>
              </Button>
            ) : (
              <Button
                className="h-8 w-full justify-start text-muted-foreground text-sm"
                onClick={() => setModalOpen(true)}
                variant="ghost"
              >
                未設定
              </Button>
            )}
          </div>

          {/* ログアウトボタン */}
          <div className="border-t pt-2">
            <DropdownMenuItem asChild>
              <Button
                className="h-8 w-full justify-start text-muted-foreground text-sm hover:text-foreground"
                onClick={() => {
                  // 専用ログアウトページにリダイレクト
                  // これにより保護されたページでの状態競合を回避
                  window.location.href = "/logout";
                }}
                variant="ghost"
              >
                <User className="mr-2 h-4 w-4" />
                ログアウト
              </Button>
            </DropdownMenuItem>
          </div>
        </div>
      </DropdownMenuContent>

      {/* インストラクター選択モーダル */}
      <InstructorSelectModal
        currentInstructorId={instructorProfile?.id ?? null}
        instructors={availableInstructors}
        onOpenChange={setModalOpen}
        onSuccess={handleSuccess}
        open={modalOpen}
      />
    </DropdownMenu>
  );
}
