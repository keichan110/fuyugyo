import { Suspense } from "react";
import { getPrisma } from "@/lib/db";
import { UserList } from "./_components/user-list";
import { UserStats } from "./_components/user-stats";
import { UserTableHeader } from "./_components/user-table-header";
import Loading from "./loading";

/**
 * searchParams から文字列値を安全に取得するヘルパー関数
 *
 * @remarks
 * Next.js 15 では searchParams の値が string | string[] | undefined になるため、
 * 配列の場合は最初の要素を取得し、統一的に string | undefined として扱います。
 *
 * @param value - 取得する searchParams の値
 * @returns 正規化された文字列値または undefined
 */
function getSearchParam(
  value: string | string[] | undefined
): string | undefined {
  if (Array.isArray(value)) {
    return value[0];
  }
  return value;
}

/**
 * ユーザー管理ページのプロパティ
 */
type UsersPageProps = {
  /** URL検索パラメータ（Next.js 15+では Promise 型） */
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/**
 * ユーザー管理ページのコンテンツコンポーネント（Server Component）
 *
 * @remarks
 * このコンポーネントは Server Component として実装され、以下の処理を行います：
 *
 * 処理フロー:
 * 1. URL パラメータから権限フィルターとステータスフィルターを取得
 * 2. Prisma を使用してサーバーサイドでデータを取得（フィルタリング・ソート済み）
 * 3. 統計データを計算（フィルター済みデータの集計）
 * 4. Client Components にデータを渡して表示
 *
 * フィルタリング:
 * - `role`: "all" | "ADMIN" | "MANAGER" | "MEMBER"（デフォルト: "all"）
 * - `status`: "all" | "active" | "inactive"（デフォルト: "active"）
 *
 * データ取得の最適化:
 * - フィルタリングとソートは Prisma クエリで実行
 * - Date型を適切にシリアライズ
 *
 * @param props - ページプロパティ
 * @returns ユーザー管理ページコンテンツ
 */
async function UsersPageContent({ searchParams }: UsersPageProps) {
  // searchParams は Promise なので await する (Next.js 15+)
  const params = await searchParams;

  // URLパラメータ取得・正規化
  const roleParam = getSearchParam(params.role) as
    | "all"
    | "ADMIN"
    | "MANAGER"
    | "MEMBER"
    | undefined;
  const role = roleParam || "all";
  const statusParam = getSearchParam(params.status) as
    | "all"
    | "active"
    | "inactive"
    | undefined;
  const status = statusParam || "active";

  // Prisma where 条件を動的に構築
  const where: {
    role?: "ADMIN" | "MANAGER" | "MEMBER";
    isActive?: boolean;
  } = {};

  // 権限フィルター
  if (role !== "all") {
    where.role = role;
  }

  // ステータスフィルター
  if (status === "active") {
    where.isActive = true;
  } else if (status === "inactive") {
    where.isActive = false;
  }
  // status === "all" の場合は条件を追加しない

  // サーバーサイドでデータ取得
  const users = await (await getPrisma()).user.findMany({
    where,
    select: {
      id: true,
      lineUserId: true,
      displayName: true,
      role: true,
      isActive: true,
      createdAt: true,
      updatedAt: true,
    },
    orderBy: [
      { role: "asc" }, // 権限順（ADMIN -> MANAGER -> MEMBER）
      { displayName: "asc" }, // 表示名順
    ],
  });

  // Date型をISO 8601文字列に変換してシリアライズ可能にする
  const serializedUsers = users.map((user) => ({
    id: user.id,
    lineUserId: user.lineUserId,
    displayName: user.displayName,
    role: user.role as "ADMIN" | "MANAGER" | "MEMBER",
    isActive: user.isActive,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  }));

  // 統計計算（フィルター済みデータで計算）
  const stats = {
    total: serializedUsers.length,
    active: serializedUsers.filter((user) => user.isActive).length,
    admins: serializedUsers.filter((user) => user.role === "ADMIN").length,
    managers: serializedUsers.filter((user) => user.role === "MANAGER").length,
    members: serializedUsers.filter((user) => user.role === "MEMBER").length,
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6 md:py-8 lg:px-8">
      <div className="mb-6 md:mb-8">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="mb-2 font-bold text-2xl text-foreground md:text-3xl">
              ユーザー管理
            </h1>
            <p className="text-muted-foreground text-sm md:text-base">
              システムユーザーの権限・状態管理を行います
            </p>
          </div>
        </div>
      </div>

      <UserStats stats={stats} />

      <div className="overflow-x-auto rounded-lg border bg-white shadow-lg dark:bg-gray-900">
        <UserTableHeader />

        <UserList users={serializedUsers} />
      </div>
    </div>
  );
}

/**
 * ユーザー管理ページ（エントリーポイント）
 *
 * @remarks
 * ADMIN権限が必要です（親レイアウトで認証済み）。
 * Suspense でラップすることで、データ取得中に loading.tsx を表示します。
 *
 * ベストプラクティス準拠:
 * - Server Component で直接 Prisma クエリ
 * - searchParams による URL ベースのフィルタリング
 * - Server Actions による書き込み操作
 * - 適切なコンポーネント分割（Server/Client）
 *
 * @param props - ページプロパティ
 * @returns ユーザー管理ページ
 */
export default function UsersPage(props: UsersPageProps) {
  return (
    <Suspense fallback={<Loading />}>
      <UsersPageContent {...props} />
    </Suspense>
  );
}
