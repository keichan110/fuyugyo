"use client";

import {
  CalendarDots,
  Certificate,
  House,
  type Icon,
  LinkSimple,
  List,
  Tag,
  UserGear,
  UsersThree,
} from "@phosphor-icons/react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback } from "react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { useShiftsLink } from "@/lib/hooks/use-shifts-link";
import type { AuthenticatedUser } from "@/types/actions";

type UserRole = "ADMIN" | "MANAGER" | "MEMBER";

type MenuItem = {
  href: string;
  icon: Icon;
  label: string;
  description: string;
  requiredRole: UserRole;
};

/**
 * 管理メニューDrawerコンポーネント
 * 全ての認証済みユーザーに表示され、権限に応じてメニュー項目がフィルタリングされる
 */
type HeaderMenuDrawerProps = {
  user: AuthenticatedUser;
};

export function HeaderMenuDrawer({ user }: HeaderMenuDrawerProps) {
  const pathname = usePathname();
  const router = useRouter();
  const shiftsLink = useShiftsLink();

  const handlePrefetch = useCallback(
    (href: string) => {
      if (!href) {
        return;
      }
      router.prefetch(href);
    },
    [router]
  );

  const allMenuItems: MenuItem[] = [
    {
      href: "/",
      icon: House,
      label: "ダッシュボード",
      description: "システムの概要とお知らせを確認",
      requiredRole: "MEMBER",
    },
    {
      href: shiftsLink,
      icon: CalendarDots,
      label: "シフト",
      description: "シフトの確認・管理",
      requiredRole: "MEMBER",
    },
    {
      href: "/instructors",
      icon: UsersThree,
      label: "インストラクター",
      description: "スタッフ情報の管理",
      requiredRole: "MANAGER",
    },
    {
      href: "/shift-types",
      icon: Tag,
      label: "シフト種別",
      description: "シフト種別の管理",
      requiredRole: "MANAGER",
    },
    {
      href: "/certifications",
      icon: Certificate,
      label: "資格",
      description: "資格の管理",
      requiredRole: "MANAGER",
    },
    {
      href: "/invitations",
      icon: LinkSimple,
      label: "招待",
      description: "招待リンクの管理",
      requiredRole: "ADMIN",
    },
    {
      href: "/users",
      icon: UserGear,
      label: "ユーザー管理",
      description: "登録ユーザーの管理",
      requiredRole: "ADMIN",
    },
  ];

  // 権限チェック関数
  const hasPermission = (requiredRole: UserRole): boolean => {
    const roleHierarchy: Record<UserRole, number> = {
      ADMIN: 3,
      MANAGER: 2,
      MEMBER: 1,
    };

    const userRoleLevel = roleHierarchy[user.role];
    const requiredRoleLevel = roleHierarchy[requiredRole];

    return userRoleLevel >= requiredRoleLevel;
  };

  // ユーザーの権限に基づいてメニューアイテムをフィルタリング
  const visibleMenuItems = allMenuItems.filter((item) =>
    hasPermission(item.requiredRole)
  );

  // メニュー項目がない場合は何も表示しない
  if (visibleMenuItems.length === 0) {
    return null;
  }

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button className="h-8 w-8 p-0" size="sm" variant="ghost">
          <List className="h-5 w-5" weight="regular" />
        </Button>
      </SheetTrigger>
      <SheetContent
        className="w-[400px] max-w-[calc(100vw-2rem)] p-0"
        side="left"
      >
        <div className="p-6">
          <SheetTitle className="mb-4 font-bold text-lg">メニュー</SheetTitle>
          <div className="grid gap-3">
            {visibleMenuItems.map((item) => {
              const IconComponent = item.icon;
              const isActive = pathname === item.href;

              return (
                <SheetClose asChild key={item.href}>
                  <Link
                    className={`flex items-start space-x-4 rounded-lg p-3 transition-all duration-200 hover:bg-accent/50 ${
                      isActive
                        ? "bg-primary/10 text-primary"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                    href={item.href}
                    onFocus={() => handlePrefetch(item.href)}
                    onMouseEnter={() => handlePrefetch(item.href)}
                    prefetch
                  >
                    <IconComponent
                      className="h-6 w-6 shrink-0"
                      weight={isActive ? "fill" : "regular"}
                    />
                    <div className="space-y-1">
                      <h3 className="font-medium text-sm leading-none">
                        {item.label}
                      </h3>
                      <p className="line-clamp-2 text-muted-foreground text-sm leading-snug">
                        {item.description}
                      </p>
                    </div>
                  </Link>
                </SheetClose>
              );
            })}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
