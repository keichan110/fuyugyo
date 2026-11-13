> **旧スタックの資料（履歴保存用）**。現行実装の指針には使用しない。現行の構成は [README](../../README.md)、実装ガイドは `docs/guideline/overview.md`、リリース手順は `docs/settings/database-migration-deployment.md` を参照。

# Next.js 15 ベストプラクティス改善レポート

> **プロジェクト**: Fuyugyō
> **調査日**: 2025-10-23
> **対象バージョン**: Next.js 15
> **調査基準**: [Next.js 15 ベストプラクティスガイド](./nextjs_best_practices.md)

## エグゼクティブサマリー

このプロジェクトは全体的に良好な状態ですが、Next.js 15のベストプラクティスに完全に準拠するためには、いくつかの改善が必要です。

### 📊 現状評価

| カテゴリ | 状態 | 優先度 |
|---------|------|--------|
| 非同期API (cookies, headers) | ✅ 準拠 | - |
| 非同期API (params, searchParams) | ⚠️ 要確認 | 中 |
| セグメント設定 (dynamic) | ⚠️ 問題あり | 高 |
| loading.tsx | ⚠️ 非推奨パターン使用 | 中 |
| キャッシング戦略 ('use cache') | ❌ 未使用 | 低 |
| revalidateTag profile | ⚠️ 旧形式使用 | 低 |

---

## 🚨 優先度: 高（即座の対応が必要）

### 1. `export const dynamic = "force-dynamic"` の使用

#### 問題

以下のファイルで `export const dynamic = "force-dynamic"` が使用されています：

```typescript
// ❌ 現在の実装
app/page.tsx:4
app/(member)/layout.tsx:27
app/(member)/(manager)/layout.tsx:16
app/(member)/(manager)/(admin)/layout.tsx:16
app/(public)/logout/page.tsx:3
app/(public)/(auth)/signup/page.tsx:6
app/(public)/login/page.tsx:5
```

#### 影響

- **現時点では問題なし**: `next.config.js` で `experimental.cacheComponents: true` が有効化されていないため、現在はエラーにならない
- **将来の問題**: Cache Components を有効化する場合、すべてのファイルでビルドエラーが発生する
- Next.js 16 では Cache Components がデフォルトで有効になる可能性がある

#### 推奨対応

**Option A: 現状維持（推奨）**
```typescript
// Cache Components を使用しない場合は、現在の実装のまま
export const dynamic = "force-dynamic";
```

**Option B: noStore() への移行（将来の互換性重視）**
```typescript
// app/page.tsx
import { unstable_noStore as noStore } from "next/cache";

export default async function Page() {
  noStore(); // Cache Components 未使用でも動的レンダリングを明示
  const authResult = await authenticateFromCookies();
  // ...
}
```

**Option C: Cache Components有効化時の再設計（計画段階）**
- Cache Componentsをオンにする場合は、`authenticateFromCookies` を含む認証処理を `noStore()` で保護し、Suspense構成を再評価する
- `'use cache: private'` や `connection()` は Next.js 15.1.6 時点では利用できないため、将来のアップデートで正式対応後に再検討する

#### 推奨アクション

1. **短期**: 現状維持（変更なし）
2. **中期**: `noStore()` を用いた動的レンダリング移行を検討
3. **長期**: Cache Components有効化時に全面的な見直し（未サポートAPIに頼らない）

---

## ⚠️ 優先度: 中（計画的な対応が推奨）

### 2. loading.tsx の使用

#### 問題

以下のディレクトリに `loading.tsx` が存在します：

```
app/loading.tsx
app/(member)/shifts/loading.tsx
app/(member)/(manager)/shift-types/loading.tsx
app/(member)/(manager)/instructors/loading.tsx
app/(member)/(manager)/certifications/loading.tsx
app/(member)/(manager)/(admin)/users/loading.tsx
app/(member)/(manager)/(admin)/invitations/loading.tsx
```

#### 現状分析

```typescript
// app/(member)/shifts/page.tsx
// ✅ 良い点: すでにSuspenseを使用している
export default function ShiftsPage() {
  return (
    <Suspense fallback={<Loading />}>
      <PublicShiftsPageClient />
    </Suspense>
  );
}
```

このページは **既にSuspenseを使用している** ため、`loading.tsx` は実質的に使用されていない可能性があります。

#### 影響

- PPR（Partial Prerendering）では `loading.tsx` は非推奨
- ただし、現在のアーキテクチャでは大きな問題はない
- Suspenseを使用しているページでは `loading.tsx` は無視される

#### 推奨対応

**段階的な移行戦略**:

1. **Phase 1**: Suspenseを使用していないページを特定
2. **Phase 2**: Suspense境界を追加
3. **Phase 3**: `loading.tsx` を削除

**移行例**:

```typescript
// Before: loading.tsx に依存
export default async function Page() {
  const data = await fetchData();
  return <div>{data}</div>;
}

// After: Suspense境界を使用
export default function Page() {
  return (
    <Suspense fallback={<LoadingSkeleton />}>
      <DataContent />
    </Suspense>
  );
}

async function DataContent() {
  const data = await fetchData();
  return <div>{data}</div>;
}
```

#### 推奨アクション

1. **短期**: 現状維持（既にSuspenseを使用しているページが多い）
2. **中期**: Suspenseを使用していないページを特定して移行
3. **長期**: すべての `loading.tsx` を削除

---

### 3. params と searchParams の型定義

#### 問題

現在の調査では、`params` と `searchParams` が Promise 型として宣言されているか確認できませんでした。

#### Next.js 15 の要件

```typescript
// ❌ Next.js 14 スタイル
type PageProps = {
  params: { id: string }
  searchParams: { query?: string }
}

// ✅ Next.js 15 スタイル
type PageProps = {
  params: Promise<{ id: string }>
  searchParams: Promise<{ query?: string }>
}
```

#### 推奨対応

すべての動的ルートページで型定義を確認・更新：

```typescript
// app/products/[id]/page.tsx

type PageProps = {
  params: Promise<{ id: string }>
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}

export default async function ProductPage({
  params,
  searchParams
}: PageProps) {
  const { id } = await params
  const query = await searchParams

  // ...
}
```

#### 確認が必要なファイル

動的ルートを使用している可能性があるページ：
- `app/(member)/(manager)/shift-types/page.tsx`
- `app/(member)/(manager)/instructors/page.tsx`
- `app/(member)/(manager)/certifications/page.tsx`
- `app/(member)/(manager)/(admin)/users/page.tsx`
- 他の動的セグメントを含むルート

#### 推奨アクション

1. 全ページコンポーネントの型定義を確認
2. 動的ルートパラメータを使用しているページを特定
3. Promise型への移行とawaitの追加

---

## 📋 優先度: 低（将来的な改善）

### 4. キャッシング戦略の未実装

#### 現状

- `'use cache'` ディレクティブは一切使用されていない
- `cacheLife()` や `cacheTag()` も未使用
- `revalidateTag()` は使用されているが、新しい profile パラメータは使用されていない

#### 現在の実装

```typescript
// app/(member)/(manager)/instructors/_lib/actions.ts
import { revalidateTag } from "next/cache";

export async function createInstructorAction(input: CreateInstructorInput) {
  // ...
  revalidateTag("instructors.list");
  // ✅ 動作はするが、新しいprofileパラメータがない
}
```

#### 推奨される改善

```typescript
'use server'
import { revalidateTag } from "next/cache";

export async function createInstructorAction(input: CreateInstructorInput) {
  // ...

  // ✅ 新しい形式: stale-while-revalidate
  revalidateTag("instructors.list", "max");
}
```

#### Cache Components を有効化する場合の例

```typescript
// lib/data/instructors.ts
import { cacheLife, cacheTag } from "next/cache";

async function getInstructors() {
  'use cache'
  cacheLife('frequent') // 短命キャッシュ
  cacheTag('instructors.list')

  const instructors = await prisma.instructor.findMany({
    include: { certifications: true }
  });

  return instructors;
}
```

#### 影響

- **現時点では問題なし**: 現在のキャッシング戦略は正常に動作している
- **パフォーマンス向上の可能性**: `'use cache'` を使用することで、より細かいキャッシュ制御が可能
- **将来の互換性**: Next.js 16 で推奨される方向性

#### 推奨アクション

1. **短期**: `revalidateTag()` に profile パラメータを追加（オプショナル）
2. **中期**: データフェッチ関数に `'use cache'` を試験的に導入
3. **長期**: Cache Components を有効化して全面的にキャッシング戦略を見直し

---

## 🎯 段階的な改善ロードマップ

### Phase 1: 緊急対応（即時 〜 1週間）

- [ ] **なし**（現時点で緊急の問題はない）

### Phase 2: 短期改善（1週間 〜 1ヶ月）

1. **型定義の確認と更新**
   - [ ] 動的ルートを使用しているページを特定
   - [ ] `params` と `searchParams` の型を Promise 型に更新
   - [ ] `await` を追加して非同期的にアクセス

2. **revalidateTag の更新（オプショナル）**
   - [ ] すべての `revalidateTag()` 呼び出しに profile パラメータを追加
   - [ ] `"max"` プロファイルを使用して stale-while-revalidate を有効化

### Phase 3: 中期改善（1ヶ月 〜 3ヶ月）

1. **loading.tsx からの移行**
   - [ ] Suspense を使用していないページを特定
   - [ ] 段階的に Suspense 境界を追加
   - [ ] `loading.tsx` の削除（最後に実施）

2. **connection() API への移行検討**
   - [ ] `export const dynamic = "force-dynamic"` を使用しているファイルを確認
   - [ ] `connection()` API への移行の影響を評価
   - [ ] 段階的に移行（オプショナル）

### Phase 4: 長期改善（3ヶ月以降）

1. **Cache Components の評価と導入**
   - [ ] `next.config.js` で `experimental.cacheComponents: true` を有効化（テスト環境）
   - [ ] ビルドエラーを確認し、必要な修正を特定
   - [ ] `'use cache'` ディレクティブを導入
   - [ ] キャッシング戦略の全面的な見直し

---

## 📝 詳細な改善提案

### 提案 1: 型定義の厳格化

**目的**: Next.js 15 の型安全性要件に準拠

**実装例**:

```typescript
// types/next.ts (新規作成)
export type PageProps<
  TParams extends Record<string, string> = Record<string, never>,
  TSearchParams = Record<string, string | string[] | undefined>
> = {
  params: Promise<TParams>
  searchParams: Promise<TSearchParams>
}

// app/products/[id]/page.tsx
import type { PageProps } from "@/types/next";

export default async function ProductPage({
  params,
  searchParams
}: PageProps<{ id: string }>) {
  const { id } = await params;
  const query = await searchParams;
  // ...
}
```

**メリット**:
- 型安全性の向上
- Next.js 15 の要件に完全準拠
- 将来的な互換性の確保

**デメリット**:
- すべてのページコンポーネントの修正が必要
- テストコードの更新も必要

---

### 提案 2: 段階的な Suspense 移行

**目的**: PPR（Partial Prerendering）への準備

**移行パターン**:

```typescript
// Step 1: 動的コンテンツを分離
async function DynamicContent() {
  const data = await fetchData();
  return <div>{data}</div>;
}

// Step 2: Suspense 境界を追加
export default function Page() {
  return (
    <div>
      <StaticHeader />
      <Suspense fallback={<LoadingSkeleton />}>
        <DynamicContent />
      </Suspense>
      <StaticFooter />
    </div>
  );
}

// Step 3: loading.tsx を削除
```

**メリット**:
- PPR による パフォーマンス向上
- ローディング状態の細かい制御
- 静的コンテンツの即座の表示

**デメリット**:
- コンポーネント構造の変更が必要
- テストケースの更新が必要

---

### 提案 3: キャッシング戦略の最適化（将来的）

**目的**: パフォーマンスの最大化

**実装例**:

```typescript
// lib/data/shifts.ts
import { cacheLife, cacheTag } from "next/cache";

// 頻繁に更新されるデータ
export async function getRecentShifts() {
  'use cache'
  cacheLife('frequent') // 短命キャッシュ
  cacheTag('shifts.recent')

  return await prisma.shift.findMany({
    where: { startDate: { gte: new Date() } },
    take: 10
  });
}

// 更新頻度の低いデータ
export async function getInstructors() {
  'use cache'
  cacheLife('max') // 長期キャッシュ
  cacheTag('instructors.list')

  return await prisma.instructor.findMany();
}

// Server Action での無効化
'use server'
export async function createShift(data: ShiftInput) {
  await prisma.shift.create({ data });
  revalidateTag('shifts.recent', 'max');
}
```

**メリット**:
- データベースクエリの削減
- ページレンダリング速度の向上
- サーバー負荷の軽減

**デメリット**:
- Cache Components の有効化が必要
- キャッシュ戦略の設計が必要
- デバッグが複雑になる可能性

---

## ✅ 良好な実装パターン

以下のパターンは既に適切に実装されています：

### 1. cookies() と headers() の非同期使用

```typescript
// ✅ lib/auth/middleware.ts
const cookieStore = await cookies();

// ✅ lib/auth/auth-redirect.ts
const headersList = await headers();
```

### 2. Suspense 境界の使用

```typescript
// ✅ app/(member)/shifts/page.tsx
export default function ShiftsPage() {
  return (
    <Suspense fallback={<Loading />}>
      <PublicShiftsPageClient />
    </Suspense>
  );
}
```

### 3. キャッシュタグの使用

```typescript
// ✅ app/(member)/(manager)/instructors/_lib/actions.ts
revalidateTag("instructors.list");
revalidateTag(`instructors.detail.${id}`);
```

---

## 🔍 さらなる調査が必要な項目

1. **動的ルートの完全なリスト**
   - すべての `[param]` を含むディレクトリを特定
   - 各ページでの params 使用状況を確認

2. **searchParams の使用状況**
   - フィルタリングや検索機能を持つページを特定
   - Promise 型への対応状況を確認

3. **外部API呼び出しのキャッシング**
   - fetch() を使用している箇所を特定
   - キャッシュオプションの確認

4. **generateStaticParams の使用状況**
   - 静的生成を使用しているページを特定
   - PPR との互換性を評価

---

## 📚 参考資料

- [Next.js 15 ベストプラクティスガイド](./nextjs_best_practices.md)
- [Next.js 15 公式ドキュメント](https://nextjs.org/docs)
- [Partial Prerendering (PPR)](https://nextjs.org/docs/app/building-your-application/rendering/partial-prerendering)
- [Cache Components RFC](https://nextjs.org/docs/app/api-reference/config/next-config-js/cacheComponents)

---

**最終更新**: 2025-10-23
**次回レビュー予定**: Phase 2 完了時
