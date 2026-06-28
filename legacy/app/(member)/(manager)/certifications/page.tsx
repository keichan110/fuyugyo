import { Suspense } from "react";
import { getPrisma } from "@/lib/db";
import { CertificationList } from "./_components/certification-list";
import { CertificationStats } from "./_components/certification-stats";
import { CertificationTableHeader } from "./_components/certification-table-header";
import {
  createCertificationAction,
  updateCertificationAction,
} from "./_lib/actions";
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
 * 資格管理ページのプロパティ
 */
type CertificationsPageProps = {
  /** URL検索パラメータ（Next.js 15+では Promise 型） */
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/**
 * 資格管理ページのコンテンツコンポーネント（Server Component）
 *
 * @remarks
 * このコンポーネントは Server Component として実装され、以下の処理を行います：
 *
 * 処理フロー:
 * 1. URL パラメータから部門フィルターとアクティブフィルターを取得
 * 2. Prisma を使用してサーバーサイドでデータを取得（フィルタリング・ソート済み）
 * 3. 統計データを計算（フィルター済みデータの集計）
 * 4. Client Components にデータを渡して表示
 *
 * フィルタリング:
 * - `department`: "all" | "ski" | "snowboard"（デフォルト: "all"）
 * - `active`: "true" | "false"（デフォルト: "true"）
 *
 * データ取得の最適化:
 * - フィルタリングとソートは Prisma クエリで実行
 *
 * @param props - ページプロパティ
 * @returns 資格管理ページコンテンツ
 */
async function CertificationsPageContent({
  searchParams,
}: CertificationsPageProps) {
  // searchParams は Promise なので await する (Next.js 15+)
  const params = await searchParams;

  // URLパラメータ取得・正規化
  const departmentParam = getSearchParam(params.department) as
    | "all"
    | "ski"
    | "snowboard"
    | undefined;
  const department = departmentParam || "all";
  const showActiveOnly = getSearchParam(params.active) !== "false";

  // Prisma where 条件を動的に構築
  const where: {
    isActive?: boolean;
    department?: {
      code?: {
        equals: string;
        mode: "insensitive";
      };
    };
  } = {};

  // アクティブフィルター
  if (showActiveOnly) {
    where.isActive = true;
  }

  // 部門フィルター
  if (department !== "all") {
    where.department = {
      code: {
        equals: department === "ski" ? "SKI" : "SNOWBOARD",
        mode: "insensitive",
      },
    };
  }

  // サーバーサイドでデータ取得
  const certifications = await (await getPrisma()).certification.findMany({
    where,
    include: {
      department: {
        select: {
          id: true,
          code: true,
          name: true,
        },
      },
    },
    orderBy: [
      { isActive: "desc" }, // アクティブ優先
      { department: { name: "asc" } },
      { name: "asc" },
    ],
  });

  // 統計計算（フィルター済みデータで計算）
  const stats = {
    total: certifications.length,
    active: certifications.filter((c) => c.isActive).length,
    ski: certifications.filter((c) => c.department.code.toLowerCase() === "ski")
      .length,
    snowboard: certifications.filter(
      (c) => c.department.code.toLowerCase() === "snowboard"
    ).length,
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6 md:py-8 lg:px-8">
      <div className="mb-6 md:mb-8">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="mb-2 font-bold text-2xl text-foreground md:text-3xl">
              資格管理
            </h1>
            <p className="text-muted-foreground text-sm md:text-base">
              スキー・スノーボード資格の登録・管理を行います
            </p>
          </div>
        </div>
      </div>

      <CertificationStats stats={stats} />

      <div className="overflow-x-auto rounded-lg border bg-white shadow-lg dark:bg-gray-900">
        <CertificationTableHeader />

        <CertificationList
          certifications={certifications}
          onCreateCertification={createCertificationAction}
          onUpdateCertification={updateCertificationAction}
        />
      </div>
    </div>
  );
}

/**
 * 資格管理ページ（エントリーポイント）
 *
 * @remarks
 * MANAGER以上の権限が必要です（親レイアウトで認証済み）。
 * Suspense でラップすることで、データ取得中に loading.tsx を表示します。
 *
 * ベストプラクティス準拠:
 * - Server Component で直接 Prisma クエリ
 * - searchParams による URL ベースのフィルタリング
 * - Server Actions による書き込み操作
 * - 適切なコンポーネント分割（Server/Client）
 *
 * @param props - ページプロパティ
 * @returns 資格管理ページ
 */
export default function CertificationsPage(props: CertificationsPageProps) {
  return (
    <Suspense fallback={<Loading />}>
      <CertificationsPageContent {...props} />
    </Suspense>
  );
}
