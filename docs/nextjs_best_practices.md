# Next.js 15 ベストプラクティスガイド

> **情報源**: Next.js 16 E2Eテストスイート（125以上のフィクスチャ）から抽出された実証済みパターン
> **最終更新**: 2025年1月
> **対象バージョン**: Next.js 15.6+ / 16.0.0+

## 目次

1. [非同期API（Async Request APIs）](#1-非同期apiasync-request-apis)
2. [データフェッチとキャッシング戦略](#2-データフェッチとキャッシング戦略)
3. [Suspenseベースのローディング処理](#3-suspenseベースのローディング処理)
4. [禁止されたセグメント設定](#4-禁止されたセグメント設定cache-components有効時)
5. [generateStaticParamsとの統合](#5-generatestaticparamsとの統合)
6. [メタデータとビューポート生成](#6-メタデータとビューポート生成)
7. [エラーハンドリング](#7-エラーハンドリングのベストプラクティス)
8. [パフォーマンス最適化](#8-パフォーマンス最適化)
9. [TypeScript型安全性](#9-typescript型安全性)
10. [アクセシビリティ要件](#10-アクセシビリティ要件)
11. [移行チェックリスト](#移行チェックリスト)

---

## 1. 非同期API（Async Request APIs）

Next.js 15では、リクエスト関連のAPIが**非同期化**されました。必ず`await`を使用してください。

### 必須対応事項

```typescript
// ❌ Next.js 14以前（同期的アクセス）
export default function Page({ params, searchParams }) {
  const id = params.id
  const query = searchParams.query
}

// ✅ Next.js 15以降（必ず await が必要）
export default async function Page({
  params,
  searchParams
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ query?: string }>
}) {
  const { id } = await params
  const { query } = await searchParams
}
```

### 非同期化されたAPI

| API | 説明 | 使用例 |
|-----|------|--------|
| `params` | 動的ルートパラメータ | `const { id } = await params` |
| `searchParams` | URLクエリパラメータ | `const { query } = await searchParams` |
| `cookies()` | Cookie操作 | `const session = (await cookies()).get('session')` |
| `headers()` | リクエストヘッダー | `const auth = (await headers()).get('authorization')` |
| `draftMode()` | ドラフトモード | `const { isEnabled } = await draftMode()` |

### generateStaticParamsとの連携

```typescript
export async function generateStaticParams() {
  return [
    { id: '1' },
    { id: '2' },
    { id: '3' }
  ]
}

export default async function Page({
  params
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  // generateStaticParamsに含まれる値 → ビルド時にプリレンダリング
  // 含まれない値 → 動的レンダリング（PPRの動的ホール）

  return <div>ID: {id}</div>
}
```

---

## 2. データフェッチとキャッシング戦略

### `'use cache'` ディレクティブ

Next.js 15では、`'use cache'`ディレクティブを使用して、細かいキャッシュ制御が可能です。

#### パブリックキャッシュ（全ユーザー共通）

```typescript
import { cacheLife, cacheTag } from 'next/cache'

async function getCachedData() {
  'use cache'
  cacheLife('frequent') // または 'default', 'max'
  cacheTag('products') // キャッシュタグ

  const data = await fetch('https://api.example.com/products')
  return data.json()
}

export default async function Page() {
  const products = await getCachedData()
  return <div>{products.map(p => <div key={p.id}>{p.name}</div>)}</div>
}
```

#### プライベートデータの扱い（ユーザー固有）

```typescript
import { cookies } from 'next/headers'
import { unstable_noStore as noStore } from 'next/cache'

async function UserProfile() {
  noStore() // 個別ユーザーデータはサーバーキャッシュを無効化
  const session = (await cookies()).get('session')

  return <div>User: {session?.value}</div>
}

// ⚠️ 重要: 動的データはSuspense境界で扱ってUXを確保
export default function Page() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <UserProfile />
    </Suspense>
  )
}
```

### cacheLifeプロファイル

```typescript
import { cacheLife } from 'next/cache'

async function getData() {
  'use cache'

  // プリセットプロファイル
  cacheLife('frequent')  // 短命キャッシュ（高頻度更新）
  cacheLife('default')   // 標準キャッシュ
  cacheLife('max')       // 長期キャッシュ

  return await fetchData()
}

// カスタム設定
async function getCustomCachedData() {
  'use cache'
  cacheLife({
    stale: 300,      // 5分間は fresh
    revalidate: 900, // 15分後に再検証
    expire: 3600     // 1時間で完全に期限切れ
  })

  return await fetchData()
}
```

### キャッシュ無効化

```typescript
'use server'

import { revalidateTag, updateTag } from 'next/cache'

// ✅ 推奨：profileパラメータ付き（stale-while-revalidate）
export async function updateProducts() {
  await db.products.update(...)
  revalidateTag('products') // cacheLife('max') と併用してSWr挙動を実現
}

// ✅ 即座に無効化（Read-Your-Own-Writes パターン）
export async function immediateUpdate() {
  await db.update(...)
  updateTag('data') // 即座にキャッシュ無効化
}

// ❌ 非推奨（profileなし、レガシー動作）
export async function oldPattern() {
  revalidateTag('products')
}
```

### キャッシュキー生成ルール

```typescript
async function getCachedRandom(x: number, children: React.ReactNode) {
  'use cache'
  return {
    x,
    y: Math.random(),
    z: <ClientComponent />,
    r: children,
  }
}

export default async function Page({
  searchParams
}: {
  searchParams: Promise<{ n: string }>
}) {
  const n = Number((await searchParams).n)
  const values = await getCachedRandom(
    n,
    <p>rnd{Math.random()}</p>
  )

  return (
    <>
      <p id="x">{values.x}</p>
      <p id="y">{values.y}</p>
      <p id="z">{values.z}</p>
      {values.r}
    </>
  )
}
```

**キャッシュキーの法則**:
```
Cache Key = hash(
  buildId +
  functionId +
  serializableArgs  // シリアライズ可能な引数のみ
)

非シリアライズ可能な引数（children、JSX、関数）:
- 不透明な参照として扱われる
- キャッシュキーの一部ではない
- 毎回再評価される
- 変更してもキャッシュは無効化されない
```

---

## 3. Suspenseベースのローディング処理

### ❌ 非推奨：loading.tsx

```typescript
// loading.tsx は PPR（Partial Prerendering）では非推奨
// 代わりにSuspense境界を使用
```

### ✅ 推奨：Suspense境界

```typescript
import { Suspense } from 'react'
import { cookies } from 'next/headers'
import { unstable_noStore as noStore } from 'next/cache'

export default function Page() {
  return (
    <div>
      <h1>静的コンテンツ</h1>

      {/* 動的コンテンツごとにSuspense境界を設定 */}
      <Suspense fallback={<ProductsSkeleton />}>
        <ProductList />
      </Suspense>

      <Suspense fallback={<div>Loading user data...</div>}>
        <UserProfile />
      </Suspense>
    </div>
  )
}

async function ProductList() {
  'use cache'
  const products = await fetchProducts()
  return <div>{products.map(renderProduct)}</div>
}

async function UserProfile() {
  noStore() // ユーザー固有データはキャッシュさせない
  const session = (await cookies()).get('session')
  const user = await fetchUser(session?.value)
  return <div>{user.name}</div>
}
```

### 必須ルール

- ✅ `noStore()` を使う場合は**必ず**Suspense境界が必要
- ✅ 動的データと静的データを明確に分離
- ✅ Suspenseフォールバックは意味のあるスケルトンUIを提供

```typescript
// ❌ エラー: noStore() を使用する動的データをSuspenseなしで描画
export default function Page() {
  return <UserProfile /> // ビルドエラー！
}

async function UserProfile() {
  noStore()
  return <div>Profile</div>
}

// ✅ 正しい実装
export default function Page() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <UserProfile />
    </Suspense>
  )
}
```

---

## 4. 禁止されたセグメント設定（Cache Components有効時）

`experimental.cacheComponents: true` を有効にしている場合、以下の設定は**使用できません**。

### ❌ 禁止されている設定

```typescript
// すべてビルドエラーになります
export const dynamic = 'force-static'      // ❌ エラー
export const dynamic = 'force-dynamic'     // ❌ エラー
export const dynamicParams = false         // ❌ エラー
export const fetchCache = 'force-cache'    // ❌ エラー
export const revalidate = 60               // ❌ エラー
```

### ✅ 許可される設定

```typescript
export const runtime = 'edge'               // ✅ OK（互換性がある場合）
export const preferredRegion = 'us-east-1'  // ✅ OK
export const maxDuration = 60               // ✅ OK
export const experimental_ppr = true        // ✅ OK

export const unstable_prefetch = {          // ✅ OK
  mode: 'runtime',
  samples: [
    { searchParams: { category: 'electronics' } }
  ]
}
```

### 代替手段

```typescript
// ❌ 古い方法
export const revalidate = 3600

// ✅ 新しい方法
async function getData() {
  'use cache'
  cacheLife({
    stale: 3600,
    revalidate: 7200,
    expire: 86400
  })
  return await fetch('...')
}
```

---

## 5. generateStaticParamsとの統合

### 基本パターン

```typescript
// app/products/[id]/page.tsx

export async function generateStaticParams() {
  const products = await db.product.findMany({
    select: { id: true },
    take: 100 // 最初の100件のみビルド時生成
  })

  return products.map((product) => ({
    id: product.id,
  }))
}

export default async function ProductPage({
  params
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const product = await getProduct(id)

  return <div>{product.name}</div>
}
```

### PPR（Partial Prerendering）の挙動

```typescript
// Layout with Suspense for dynamic params
export default function ProductLayout({
  children
}: {
  children: React.ReactNode
}) {
  return (
    <div>
      <nav>Static Navigation</nav>
      <Suspense fallback={<div>Loading product...</div>}>
        {children}
      </Suspense>
    </div>
  )
}

// Production behavior:
// - /products/1 (in generateStaticParams) → 完全に静的生成
// - /products/999 (NOT in generateStaticParams) → 静的シェル + 動的ホール
//   - Navigation: ビルド時レンダリング ✅
//   - Suspense fallback: 表示される ✅
//   - Product content: ランタイムレンダリング ✅
```

---

## 6. メタデータとビューポート生成

### ✅ 推奨：キャッシュを共有するパターン

```typescript
import { cacheLife } from 'next/cache'

async function getCachedData() {
  'use cache'
  cacheLife('default')

  const data = await fetch('https://api.example.com/data')
  return data.json()
}

export async function generateMetadata() {
  const data = await getCachedData()
  return {
    title: data.title,
    description: data.description,
  }
}

export default async function Page() {
  const data = await getCachedData()
  return <div>{data.content}</div>
}
```

### ❌ エラーパターン：メタデータだけが動的

```typescript
// ❌ ビルドエラー
export async function generateMetadata() {
  const session = (await cookies()).get('session')
  return { title: `Welcome ${session?.value}` }
}

export default async function Page() {
  return <div>Static content</div> // エラー！
}

// Error: "Route has a `generateMetadata` that depends on Request data
// (cookies(), etc.) when the rest of the route does not."
```

### ✅ 修正：ページも動的にする

```typescript
export async function generateMetadata() {
  const session = (await cookies()).get('session')
  return { title: `Welcome ${session?.value}` }
}

export default async function Page() {
  const session = (await cookies()).get('session')
  return <div>Hello {session?.value}</div>
}

// または connection() を使用
import { connection } from 'next/server'

export async function generateMetadata() {
  const session = (await cookies()).get('session')
  return { title: `Welcome ${session?.value}` }
}

export default async function Page() {
  await connection() // ページを動的にマーク
  return <div>Dynamic page</div>
}
```

---

## 7. エラーハンドリングのベストプラクティス

### error.tsx（クライアントコンポーネント）

```typescript
// app/error.tsx
'use client'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // エラーログサービスに送信
    console.error('Error:', error)
  }, [error])

  return (
    <div className="error-container">
      <h2>エラーが発生しました</h2>
      <p>{error.message}</p>
      {error.digest && <p>Error ID: {error.digest}</p>}
      <button onClick={reset}>再試行</button>
    </div>
  )
}
```

### global-error.tsx（ルートレイアウトエラー）

```typescript
// app/global-error.tsx
'use client'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <html lang="ja">
      <body>
        <h2>アプリケーションエラー</h2>
        <p>{error.message}</p>
        <button onClick={reset}>再読み込み</button>
      </body>
    </html>
  )
}
```

### not-found.tsx

```typescript
// app/not-found.tsx
import Link from 'next/link'

export default function NotFound() {
  return (
    <div>
      <h2>ページが見つかりません</h2>
      <p>お探しのページは存在しません。</p>
      <Link href="/">ホームに戻る</Link>
    </div>
  )
}
```

---

## 8. パフォーマンス最適化

### Linkコンポーネントのプリフェッチ

```typescript
import Link from 'next/link'

export default function Navigation() {
  return (
    <nav>
      {/* デフォルトでプリフェッチ有効 */}
      <Link href="/dashboard">Dashboard</Link>

      {/* 重いページはプリフェッチ無効化 */}
      <Link href="/reports" prefetch={false}>
        Reports
      </Link>

      {/* 動的ルート */}
      <Link href={`/products/${productId}`}>
        Product Details
      </Link>
    </nav>
  )
}
```

### Runtime Prefetch設定

```typescript
// app/products/page.tsx

export const unstable_prefetch = {
  mode: 'runtime',
  samples: [
    { searchParams: { category: 'electronics' } },
    { searchParams: { category: 'books' } },
    { searchParams: { category: 'clothing' } }
  ]
}

export default async function ProductsPage({
  searchParams
}: {
  searchParams: Promise<{ category?: string }>
}) {
  const { category } = await searchParams
  const products = await getProductsByCategory(category)

  return <ProductList products={products} />
}
```

### 画像最適化

```typescript
import Image from 'next/image'

export default function ProductImage({ src, alt }: { src: string; alt: string }) {
  return (
    <Image
      src={src}
      alt={alt}
      width={800}
      height={600}
      sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
      priority={false} // Above the fold の画像のみ true
      placeholder="blur"
      blurDataURL="data:image/jpeg;base64,..."
    />
  )
}
```

### フォント最適化

```typescript
// app/layout.tsx
import { Inter, Noto_Sans_JP } from 'next/font/google'

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
})

const notoSansJP = Noto_Sans_JP({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-noto-sans-jp',
})

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="ja" className={`${inter.variable} ${notoSansJP.variable}`}>
      <body>{children}</body>
    </html>
  )
}
```

---

## 9. TypeScript型安全性

### ページコンポーネントの厳密な型定義

```typescript
type PageProps = {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}

export default async function Page({
  params,
  searchParams
}: PageProps) {
  const { slug } = await params
  const query = await searchParams

  return <div>Slug: {slug}</div>
}
```

### レイアウトコンポーネント

```typescript
type LayoutProps = {
  children: React.ReactNode
  params: Promise<{ locale: string }>
}

export default async function Layout({
  children,
  params
}: LayoutProps) {
  const { locale } = await params

  return (
    <div lang={locale}>
      {children}
    </div>
  )
}
```

### generateMetadataの型

```typescript
import type { Metadata } from 'next'

type MetadataProps = {
  params: Promise<{ id: string }>
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}

export async function generateMetadata({
  params
}: MetadataProps): Promise<Metadata> {
  const { id } = await params
  const product = await getProduct(id)

  return {
    title: product.name,
    description: product.description,
    openGraph: {
      title: product.name,
      description: product.description,
      images: [product.imageUrl],
    },
  }
}
```

### Server Actionsの型

```typescript
'use server'

import { z } from 'zod'

const formSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
})

type FormState = {
  success: boolean
  message: string
  errors?: Record<string, string[]>
}

export async function submitForm(
  prevState: FormState,
  formData: FormData
): Promise<FormState> {
  const validatedFields = formSchema.safeParse({
    name: formData.get('name'),
    email: formData.get('email'),
  })

  if (!validatedFields.success) {
    return {
      success: false,
      message: 'Validation failed',
      errors: validatedFields.error.flatten().fieldErrors,
    }
  }

  // Process form...

  return {
    success: true,
    message: 'Form submitted successfully',
  }
}
```

---

## 10. アクセシビリティ要件

このプロジェクトでは、Ultraciteの厳格なa11yルールに従う必要があります。

### ボタン要素

```typescript
// ✅ 正しい実装
<button
  type="button"
  onClick={handleClick}
  onKeyDown={handleKeyDown}
  aria-label="メニューを開く"
>
  メニュー
</button>

// ❌ 間違い
<button onClick={handleClick}>メニュー</button> // type属性なし
<button type="button" onClick={handleClick}>メニュー</button> // onKeyDownなし
```

### 画像の代替テキスト

```typescript
// ✅ 正しい実装
<Image
  src="/logo.png"
  alt="Fuyugyō ロゴ"
  width={200}
  height={50}
/>

// ❌ 間違い:不要な単語を含む
<Image
  src="/logo.png"
  alt="Logo image of Fuyugyō"
  width={200}
  height={50}
/>
```

### フォーム要素

```typescript
// ✅ 正しい実装
<form>
  <label htmlFor="email">
    メールアドレス
    <input
      id="email"
      type="email"
      name="email"
      required
      aria-required="true"
      aria-describedby="email-error"
    />
  </label>
  {error && (
    <span id="email-error" role="alert">
      {error}
    </span>
  )}
</form>

// ❌ 間違い：labelとinputが関連付けられていない
<form>
  <label>メールアドレス</label>
  <input type="email" name="email" />
</form>
```

### インタラクティブ要素

```typescript
// ✅ 正しい実装
<div
  role="button"
  tabIndex={0}
  onClick={handleClick}
  onKeyDown={(e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      handleClick()
    }
  }}
  aria-label="アイテムを追加"
>
  追加
</div>

// ✅ さらに良い実装：意味のある要素を使う
<button
  type="button"
  onClick={handleClick}
  aria-label="アイテムを追加"
>
  追加
</button>
```

---

## 移行チェックリスト

### Next.js 15への移行

- [ ] **非同期API対応**
  - [ ] `params`を`await params`に変更
  - [ ] `searchParams`を`await searchParams`に変更
  - [ ] `cookies()`を`await cookies()`に変更
  - [ ] `headers()`を`await headers()`に変更
  - [ ] `draftMode()`を`await draftMode()`に変更

- [ ] **キャッシング戦略の更新**
  - [ ] `'use cache'`ディレクティブを追加
  - [ ] `cacheLife()`でキャッシュ期間を設定
  - [ ] `cacheTag()`でキャッシュタグを付与
  - [ ] `revalidateTag()`にprofileパラメータを追加

- [ ] **ローディング処理の変更**
  - [ ] `loading.tsx`を削除
  - [ ] Suspense境界を追加
  - [ ] 動的コンテンツごとにSuspense境界を設定

- [ ] **セグメント設定の削除**
  - [ ] `export const dynamic`を削除
  - [ ] `export const dynamicParams`を削除
  - [ ] `export const fetchCache`を削除
  - [ ] `export const revalidate`を削除

- [ ] **型定義の更新**
  - [ ] ページプロパティをPromise型に変更
  - [ ] generateMetadataの型を更新
  - [ ] Server Actionsの型を定義

- [ ] **PPR対応**
  - [ ] generateStaticParamsを実装
  - [ ] Suspense境界を戦略的に配置
  - [ ] 静的シェルと動的ホールを分離

- [ ] **メタデータ生成の一貫性**
  - [ ] generateMetadataとページの動的API使用を統一
  - [ ] キャッシュ関数を共有

- [ ] **アクセシビリティ要件の遵守**
  - [ ] ボタンに`type`属性を追加
  - [ ] 画像の`alt`テキストを適切に設定
  - [ ] インタラクティブ要素にキーボード操作を追加
  - [ ] フォーム要素にラベルを関連付け

- [ ] **パフォーマンス最適化**
  - [ ] Link prefetchを適切に設定
  - [ ] Runtime prefetchサンプルを追加
  - [ ] 画像最適化を実装
  - [ ] フォント最適化を実装

---

## 参考リンク

- [Next.js 15 公式ドキュメント](https://nextjs.org/docs)
- [Next.js 16 Canary版](https://nextjs.org/blog/next-16)
- [Cache Components RFC](https://nextjs.org/docs/app/api-reference/config/next-config-js/cacheComponents)
- [Partial Prerendering (PPR)](https://nextjs.org/docs/app/building-your-application/rendering/partial-prerendering)

---

**最終更新**: 2025-10-23
**メンテナ**: Fuyugyō チーム
