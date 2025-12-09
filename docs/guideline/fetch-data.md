# データ取得ガイドライン

**方針サマリ**: 新規実装では **Server Component での直接データ取得** を標準とします。読み取りは Server Component で直接 DB/API にアクセスし、更新は Server Actions を使用します。外部からのリクエストは想定していないため、内部 API エンドポイントは基本的に不要です。

---

## 📋 クイックチェックリスト

新しい機能を実装する前に、このチェックリストで方針を確認してください。

- [ ] **読み取り (データ表示)** → Server Component で直接データ取得
- [ ] **検索/フィルタ/ソート** → URL searchParams を使用
- [ ] **作成/更新/削除** → Server Actions を使用
- [ ] **リアルタイム更新が必要** → Client Component + SWR/Polling を検討
- [ ] **外部 Webhook 受信** → Route Handlers (`app/api/*/route.ts`) を使用

---

## やりたいこと早見表

| やりたいこと | 使用する機能 | 実装場所 |
|------------|------------|---------|
| データ一覧を表示 | Server Component | `app/(dashboard)/*/page.tsx` |
| 検索/フィルタ/ソート | searchParams prop | `app/(dashboard)/*/page.tsx` |
| データを作成/更新/削除 | Server Actions | `features/*/actions.ts` |
| ユーザー操作で即座にフィルタリング | Client Component (useMemo) | `features/*/ui/*.tsx` |
| Webhook 受信 | Route Handlers | `app/api/webhooks/*/route.ts` |
| リアルタイム更新 | SWR/Polling | Client Component |

---

## 基本パターン

### パターン1: Server Component で直接データ取得 (推奨)

最もシンプルで効率的なパターンです。新規実装では基本的にこのパターンを使用してください。

```typescript
// app/(dashboard)/instructors/page.tsx
import { getPrisma } from '@/lib/db'
import { InstructorList } from '@/features/instructors/ui/instructor-list'

export default async function InstructorsPage() {
  // Server Component で直接データ取得
  const allInstructors = await (await getPrisma()).instructor.findMany({
    include: {
      certifications: {
        include: {
          certification: true,
        },
      },
    },
  })

  return (
    <div>
      <h1>インストラクター一覧</h1>
      <InstructorList instructors={allInstructors} />
    </div>
  )
}
```

**メリット:**
- シンプルで理解しやすい
- 追加の HTTP リクエスト不要
- DB/ORM へ直接アクセス可能
- 自動的にサーバーサイドで実行される
- 初学者でも理解しやすい

**使うべき場面:**
- 基本的な一覧表示
- 詳細ページの表示
- 外部からのリクエストを受けない内部ページ

---

### パターン2: searchParams で動的クエリ (フィルタ/検索/ソート)

URL パラメータに応じてデータ取得条件を変更するパターンです。

```typescript
// lib/utils/search-params.ts
/**
 * searchParams から文字列値を安全に取得するヘルパー関数
 * Next.js 15 では searchParams の値が string | string[] | undefined になるため、
 * 配列の場合は最初の要素を取得し、統一的に string | undefined として扱う
 */
export function getSearchParam(
  value: string | string[] | undefined
): string | undefined {
  if (Array.isArray(value)) {
    return value[0]
  }
  return value
}
```

```typescript
// app/(dashboard)/instructors/page.tsx
import { getPrisma } from '@/lib/db'
import { InstructorList } from '@/features/instructors/ui/instructor-list'
import { InstructorFilters } from '@/features/instructors/ui/instructor-filters'
import { getSearchParam } from '@/lib/utils/search-params'

type InstructorsPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export default async function InstructorsPage({
  searchParams,
}: InstructorsPageProps) {
  // searchParams は Promise なので await する (Next.js 15+)
  const params = await searchParams

  // 配列を単一値に正規化
  const status = getSearchParam(params.status)
  const certification = getSearchParam(params.certification)
  const sort = getSearchParam(params.sort)
  const order = getSearchParam(params.order)
  const query = getSearchParam(params.q)

  // Prisma where 条件を動的に構築
  const where = {
    ...(status && { status }),
    ...(certification && {
      certifications: {
        some: {
          certification: {
            name: certification,
          },
        },
      },
    }),
    ...(query && {
      OR: [
        { lastName: { contains: query } },
        { firstName: { contains: query } },
      ],
    }),
  }

  // ソート条件
  const orderBy =
    sort === 'createdAt'
      ? { createdAt: order === 'desc' ? 'desc' : 'asc' }
      : { lastName: order === 'desc' ? 'desc' : 'asc' }

  // データ取得
  const filteredInstructors = await (await getPrisma()).instructor.findMany({
    where,
    orderBy,
    include: {
      certifications: {
        include: {
          certification: true,
        },
      },
    },
  })

  return (
    <div>
      <h1>インストラクター一覧</h1>
      {/* Client Component でフィルタ UI */}
      <InstructorFilters />
      <InstructorList instructors={filteredInstructors} />
    </div>
  )
}
```

```typescript
// features/instructors/ui/instructor-filters.tsx
'use client'

import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { useCallback } from 'react'

export function InstructorFilters() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const updateFilter = useCallback((key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString())

    if (value) {
      params.set(key, value)
    } else {
      params.delete(key)
    }

    // URL を更新 → Server Component が再レンダリングされる
    router.push(`${pathname}?${params.toString()}`)
  }, [router, pathname, searchParams])

  return (
    <div className="flex gap-4">
      <select
        value={searchParams.get('certification') || ''}
        onChange={(e) => updateFilter('certification', e.target.value)}
      >
        <option value="">すべての資格</option>
        <option value="SAJ スキー準指導員">SAJ スキー準指導員</option>
        <option value="SAJ スキー指導員">SAJ スキー指導員</option>
        <option value="SAJ スノーボード準指導員">SAJ スノーボード準指導員</option>
      </select>

      <select
        value={searchParams.get('status') || ''}
        onChange={(e) => updateFilter('status', e.target.value)}
      >
        <option value="">すべてのステータス</option>
        <option value="active">アクティブ</option>
        <option value="inactive">非アクティブ</option>
      </select>

      <input
        type="text"
        placeholder="名前で検索..."
        value={searchParams.get('q') || ''}
        onChange={(e) => updateFilter('q', e.target.value)}
      />
    </div>
  )
}
```

**動作の仕組み:**
1. ユーザーがフィルタを選択
2. Client Component が `router.push()` で URL を更新
3. **Server Component が自動的に再レンダリング**
4. **Layout は再利用される** (ページ全体のリロードなし)
5. 変更されたのは `page.tsx` の内容のみ

**メリット:**
- URL で状態管理されるため、ブックマーク可能
- ブラウザバック/フォワードが正常に動作
- Server Component でデータ取得するため効率的
- Next.js が自動的にプリフェッチとキャッシング

**使うべき場面:**
- 検索機能
- フィルタリング機能
- ソート機能
- ページネーション

---

### パターン3: Client Component でクライアントサイドフィルタリング

データ量が少なく、リアルタイムなフィルタリングが必要な場合のパターンです。

> **⚠️ セキュリティ警告:**
> このパターンでは全データをクライアントに送信するため、**センシティブな情報（メールアドレス、電話番号、個人情報など）を含めてはいけません**。
> クライアントに送信するのは**公開しても問題ないフィールドのみ**に制限してください。
> Prisma の `select` を使って必要最小限のフィールドのみを取得することを強く推奨します。

```typescript
// app/(dashboard)/instructors/page.tsx
import { getPrisma } from '@/lib/db'
import { InstructorSearch } from '@/features/instructors/ui/instructor-search'

export default async function InstructorsPage() {
  // ⚠️ 重要: センシティブな情報を除外し、公開可能なフィールドのみを取得
  const allInstructors = await (await getPrisma()).instructor.findMany({
    select: {
      id: true,
      lastName: true,
      firstName: true,
      status: true,
      // ❌ メールアドレスや電話番号などの個人情報は含めない
      certifications: {
        select: {
          certification: {
            select: {
              name: true,
              shortName: true,
            },
          },
        },
      },
    },
  })

  return (
    <div>
      <h1>インストラクター一覧</h1>
      {/* Client Component で即座にフィルタリング */}
      <InstructorSearch initialInstructors={allInstructors} />
    </div>
  )
}
```

```typescript
// features/instructors/ui/instructor-search.tsx
'use client'

import { useState, useMemo } from 'react'
import { InstructorList } from './instructor-list'

// Prisma の select 結果に対応する型定義
type InstructorForSearch = {
  id: number
  lastName: string
  firstName: string
  status: string
  certifications: {
    certification: {
      name: string
      shortName: string
    }
  }[]
}

interface Props {
  initialInstructors: InstructorForSearch[]
}

export function InstructorSearch({ initialInstructors }: Props) {
  const [searchQuery, setSearchQuery] = useState('')
  const [certificationFilter, setCertificationFilter] = useState('all')

  // クライアントサイドでフィルタリング
  const filteredInstructors = useMemo(() => {
    return initialInstructors.filter(instructor => {
      // 名前検索
      const fullName = `${instructor.lastName} ${instructor.firstName}`
      const matchesSearch = fullName
        .toLowerCase()
        .includes(searchQuery.toLowerCase())

      // 資格フィルタ
      const matchesCertification =
        certificationFilter === 'all' ||
        instructor.certifications.some(
          cert => cert.certification.name === certificationFilter
        )

      return matchesSearch && matchesCertification
    })
  }, [initialInstructors, searchQuery, certificationFilter])

  return (
    <div>
      <div className="flex gap-4 mb-4">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="名前で検索..."
          className="px-4 py-2 border rounded"
        />

        <select
          value={certificationFilter}
          onChange={(e) => setCertificationFilter(e.target.value)}
          className="px-4 py-2 border rounded"
        >
          <option value="all">すべての資格</option>
          <option value="SAJ スキー準指導員">SAJ スキー準指導員</option>
          <option value="SAJ スキー指導員">SAJ スキー指導員</option>
        </select>
      </div>

      <InstructorList instructors={filteredInstructors} />
    </div>
  )
}
```

**メリット:**
- 即座にフィルタリング結果が表示される
- ネットワークリクエスト不要
- ユーザー体験が非常に良い

**デメリット:**
- 全データをクライアントに送信 (データ量が多い場合は不向き)
- URL に状態が反映されない (ブックマーク不可)

**使うべき場面:**
- データ量が少ない (< 1000件程度)
- 入力ごとにリアルタイムフィルタリングしたい
- URL での状態管理が不要
- **公開しても問題ないデータのみを扱う場合**

**使うべきでない場面:**
- データ量が多い (> 1000件)
- ブックマーク/共有機能が必要
- SEO が重要
- **センシティブな情報（個人情報、メールアドレス、電話番号など）を含む場合** ← 重要

---

### パターン4: Server Actions でデータ更新

作成/更新/削除は Server Actions を使用します。

```typescript
// features/instructors/actions.ts
'use server'

import { getPrisma } from '@/lib/db'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

// 入力スキーマ
const createInstructorSchema = z.object({
  lastName: z.string().min(1, '姓は必須です'),
  firstName: z.string().min(1, '名は必須です'),
  lastNameKana: z.string().optional(),
  firstNameKana: z.string().optional(),
  status: z.enum(['ACTIVE', 'INACTIVE']).default('ACTIVE'),
})

export async function createInstructor(formData: FormData) {
  // 1. 入力検証
  const rawData = {
    lastName: formData.get('lastName'),
    firstName: formData.get('firstName'),
    lastNameKana: formData.get('lastNameKana'),
    firstNameKana: formData.get('firstNameKana'),
    status: formData.get('status'),
  }

  const result = createInstructorSchema.safeParse(rawData)

  if (!result.success) {
    return {
      success: false,
      error: result.error.flatten().fieldErrors,
    }
  }

  // 2. DB 操作
  try {
    await (await getPrisma()).instructor.create({
      data: result.data,
    })

    // 3. キャッシュを再検証
    revalidatePath('/instructors')

    return { success: true }
  } catch (error) {
    console.error('Failed to create instructor:', error)
    return {
      success: false,
      error: { _form: ['インストラクターの作成に失敗しました'] },
    }
  }
}

export async function updateInstructor(id: number, formData: FormData) {
  const rawData = {
    lastName: formData.get('lastName'),
    firstName: formData.get('firstName'),
    lastNameKana: formData.get('lastNameKana'),
    firstNameKana: formData.get('firstNameKana'),
    status: formData.get('status'),
  }

  const result = createInstructorSchema.safeParse(rawData)

  if (!result.success) {
    return {
      success: false,
      error: result.error.flatten().fieldErrors,
    }
  }

  try {
    await (await getPrisma()).instructor.update({
      where: { id },
      data: result.data,
    })

    revalidatePath('/instructors')
    revalidatePath(`/instructors/${id}`)

    return { success: true }
  } catch (error) {
    console.error('Failed to update instructor:', error)
    return {
      success: false,
      error: { _form: ['インストラクターの更新に失敗しました'] },
    }
  }
}

export async function deleteInstructor(id: number) {
  try {
    await (await getPrisma()).instructor.delete({
      where: { id },
    })

    revalidatePath('/instructors')

    return { success: true }
  } catch (error) {
    console.error('Failed to delete instructor:', error)
    return {
      success: false,
      error: 'インストラクターの削除に失敗しました',
    }
  }
}
```

```typescript
// features/instructors/ui/create-instructor-form.tsx
'use client'

import { useActionState } from 'react'
import { createInstructor } from '../actions'

export function CreateInstructorForm() {
  const [state, formAction, isPending] = useActionState(createInstructor, null)

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <label htmlFor="name">名前</label>
        <input
          type="text"
          id="name"
          name="name"
          required
          className="w-full px-4 py-2 border rounded"
        />
        {state?.error?.name && (
          <p className="text-red-500 text-sm">{state.error.name[0]}</p>
        )}
      </div>

      <div>
        <label htmlFor="email">メールアドレス</label>
        <input
          type="email"
          id="email"
          name="email"
          required
          className="w-full px-4 py-2 border rounded"
        />
        {state?.error?.email && (
          <p className="text-red-500 text-sm">{state.error.email[0]}</p>
        )}
      </div>

      <div>
        <label htmlFor="certification">資格</label>
        <select
          id="certification"
          name="certification"
          required
          className="w-full px-4 py-2 border rounded"
        >
          <option value="">選択してください</option>
          <option value="SAJ1">SAJ1級</option>
          <option value="SAJ2">SAJ2級</option>
          <option value="SAJ3">SAJ3級</option>
        </select>
        {state?.error?.certification && (
          <p className="text-red-500 text-sm">{state.error.certification[0]}</p>
        )}
      </div>

      {state?.error?._form && (
        <p className="text-red-500">{state.error._form[0]}</p>
      )}

      <button
        type="submit"
        disabled={isPending}
        className="px-4 py-2 bg-blue-500 text-white rounded disabled:opacity-50"
      >
        {isPending ? '作成中...' : '作成'}
      </button>
    </form>
  )
}
```

**Server Actions の重要ポイント:**
- ファイル先頭に `'use server'` を必ず記述
- Zod で入力検証を必ず実行
- 成功後は `revalidatePath()` でキャッシュを再検証
- エラーハンドリングを適切に行う

**使うべき場面:**
- データの作成/更新/削除
- フォーム送信
- 外部 API への POST/PUT/DELETE リクエスト

---

## ローディング状態とエラーハンドリング

### loading.tsx でローディング UI を表示

```typescript
// app/(dashboard)/instructors/loading.tsx
export default function Loading() {
  return (
    <div className="space-y-4">
      <div className="h-8 w-48 bg-gray-200 animate-pulse rounded" />
      <div className="space-y-2">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="h-16 bg-gray-200 animate-pulse rounded" />
        ))}
      </div>
    </div>
  )
}
```

### error.tsx でエラー UI を表示

```typescript
// app/(dashboard)/instructors/error.tsx
'use client'

import { useEffect } from 'react'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('Error:', error)
  }, [error])

  return (
    <div className="flex flex-col items-center justify-center min-h-[400px]">
      <h2 className="text-2xl font-bold mb-4">エラーが発生しました</h2>
      <p className="text-gray-600 mb-4">データの取得に失敗しました</p>
      <button
        onClick={reset}
        className="px-4 py-2 bg-blue-500 text-white rounded"
      >
        再試行
      </button>
    </div>
  )
}
```

### Suspense で部分的なローディング

```typescript
// app/(dashboard)/instructors/page.tsx
import { Suspense } from 'react'
import { getPrisma } from '@/lib/db'
import { InstructorList } from '@/features/instructors/ui/instructor-list'
import { InstructorListSkeleton } from '@/features/instructors/ui/instructor-list-skeleton'

export default function InstructorsPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">インストラクター一覧</h1>

      {/* この部分だけローディング表示 */}
      <Suspense fallback={<InstructorListSkeleton />}>
        <InstructorListAsync />
      </Suspense>
    </div>
  )
}

async function InstructorListAsync() {
  const instructors = await (await getPrisma()).instructor.findMany({
    include: {
      certifications: {
        include: {
          certification: true,
        },
      },
    },
  })
  return <InstructorList instructors={instructors} />
}
```

---

## パフォーマンス最適化

### 並列データ取得

複数のデータを並列で取得する場合は `Promise.all` を使用します。

```typescript
// app/(dashboard)/dashboard/page.tsx
import { getPrisma } from '@/lib/db'

export default async function DashboardPage() {
  // 並列で取得
  const [instructorCount, shiftCount, userCount] = await Promise.all([
    prisma.instructor.count(),
    prisma.shift.count(),
    prisma.user.count(),
  ])

  return (
    <div className="grid grid-cols-3 gap-4">
      <StatCard title="インストラクター" count={instructorCount} />
      <StatCard title="シフト" count={shiftCount} />
      <StatCard title="ユーザー" count={userCount} />
    </div>
  )
}
```

### React cache でリクエスト内の重複排除

同じデータを複数箇所で使う場合は、React の `cache` 関数でメモ化します。

```typescript
// features/instructors/queries/get-instructor.ts
import { cache } from 'react'
import 'server-only'
import { getPrisma } from '@/lib/db'

export const getInstructor = cache(async (id: number) => {
  const instructor = await (await getPrisma()).instructor.findUnique({
    where: { id },
    include: {
      certifications: {
        include: {
          certification: true,
        },
      },
    },
  })

  return instructor
})
```

```typescript
// app/(dashboard)/instructors/[id]/page.tsx
import { notFound } from 'next/navigation'
import { getInstructor } from '@/features/instructors/queries/get-instructor'

type InstructorDetailPageProps = {
  params: Promise<{ id: string }>
}

export default async function InstructorDetailPage({
  params,
}: InstructorDetailPageProps) {
  const { id } = await params
  // 同じリクエスト内で複数回呼んでも、実行は1回だけ
  const instructor = await getInstructor(Number.parseInt(id))

  if (!instructor) {
    notFound()
  }

  return (
    <div>
      <h1>{instructor.lastName} {instructor.firstName}</h1>
      {/* ... */}
    </div>
  )
}
```

**`cache` の重要ポイント:**
- 同一リクエスト内での重複排除のみ (リクエストをまたいでのキャッシュではない)
- `server-only` パッケージでサーバー専用を保証
- DB クエリや外部 API 呼び出しに使用

---

## アンチパターン (やってはいけないこと)

### ❌ Client Component から直接 DB にアクセス

```typescript
// ❌ BAD: Client Component で DB アクセス
'use client'

import { getPrisma } from '@/lib/db' // エラー: クライアントでは動作しない

export function BadComponent() {
  const data = await (await getPrisma()).user.findMany() // エラー
  return <div>{data}</div>
}
```

### ❌ 不要な Route Handlers の作成

```typescript
// ❌ BAD: 内部だけで使うのに Route Handler を作成
// app/api/instructors/route.ts
export async function GET() {
  const instructors = await (await getPrisma()).instructor.findMany()
  return Response.json(instructors)
}

// app/(dashboard)/instructors/page.tsx
export default async function Page() {
  const res = await fetch('/api/instructors') // 不要な HTTP リクエスト
  const instructors = await res.json()
  return <List instructors={instructors} />
}
```

```typescript
// ✅ GOOD: Server Component で直接取得
export default async function Page() {
  const instructors = await (await getPrisma()).instructor.findMany()
  return <List instructors={instructors} />
}
```

### ❌ searchParams を使わずに useState で URL パラメータ管理

```typescript
// ❌ BAD: useState で管理
'use client'

export default function BadPage() {
  const [filter, setFilter] = useState('')
  // URL に反映されない → ブックマーク不可
  return <FilterUI filter={filter} setFilter={setFilter} />
}
```

```typescript
// ✅ GOOD: searchParams で管理
export default async function GoodPage({ searchParams }) {
  const params = await searchParams
  // URL に反映される → ブックマーク可能
  return <FilterUI />
}
```

### ❌ revalidatePath を忘れる

```typescript
// ❌ BAD: revalidatePath を呼ばない
'use server'

import { getPrisma } from '@/lib/db'

export async function createInstructor(data: InstructorData) {
  await (await getPrisma()).instructor.create({
    data,
  })
  // revalidatePath を呼ばないと、古いデータが表示され続ける
  return { success: true }
}
```

```typescript
// ✅ GOOD: revalidatePath を呼ぶ
'use server'

import { getPrisma } from '@/lib/db'
import { revalidatePath } from 'next/cache'

export async function createInstructor(data: InstructorData) {
  await (await getPrisma()).instructor.create({
    data,
  })
  revalidatePath('/instructors') // キャッシュを再検証
  return { success: true }
}
```

---

## 実装チェックリスト

新機能を実装する際は、以下のチェックリストを確認してください。

### データ取得 (Read)

- [ ] Server Component で直接データ取得している
- [ ] 不要な Route Handlers を作成していない
- [ ] 検索/フィルタは searchParams を使用している
- [ ] 複数データの取得は `Promise.all` で並列化している
- [ ] 同じデータを複数箇所で使う場合は `cache` でメモ化している
- [ ] `loading.tsx` または `<Suspense>` でローディング UI を実装している
- [ ] `error.tsx` でエラーハンドリングを実装している

### データ更新 (Write)

- [ ] Server Actions を使用している
- [ ] ファイル先頭に `'use server'` を記述している
- [ ] Zod で入力検証を実装している
- [ ] 成功後に `revalidatePath()` を呼んでいる
- [ ] エラーハンドリングを適切に実装している
- [ ] フォームは `useActionState` を使用している
- [ ] ローディング状態 (`isPending`) を UI に反映している

### パフォーマンス

- [ ] 不要な Client Component 化を避けている
- [ ] 大量データの場合はサーバーサイドフィルタリングを使用している
- [ ] `server-only` パッケージで境界を明示している
- [ ] searchParams の変更時に Layout が再利用されることを確認している

### セキュリティ

- [ ] 環境変数は `NEXT_PUBLIC_` プレフィックスなしではクライアントに露出しない
- [ ] センシティブなデータは Server Component/Server Actions でのみ扱っている
- [ ] クライアントにデータを送信する場合は、Prisma の `select` で公開可能なフィールドのみに制限している
- [ ] パターン3（クライアントサイドフィルタリング）を使う場合、センシティブな情報を除外している
- [ ] 入力検証を必ず実装している
- [ ] SQL インジェクション対策として ORM (Prisma) を使用している

---

## よくある質問 (FAQ)

### Q1: TanStack Query との違いは？

**A:** このプロジェクトでは新規実装に Server Component 方式を採用しています。

| 項目 | Server Component | TanStack Query |
|------|-----------------|----------------|
| 学習コスト | 低い | 高い |
| データ取得 | Server で直接 | Client で fetch |
| キャッシュ | Next.js が自動 | 手動管理 |
| ローディング | `loading.tsx` | `isLoading` |
| エラー | `error.tsx` | `isError` |
| 初学者向き | ✅ | ❌ |

### Q2: いつ Client Component を使うべき？

**A:** 以下の場合のみ Client Component を使用してください:

- ユーザー操作が必要 (onClick, onChange など)
- ブラウザ API が必要 (localStorage, window など)
- React Hooks が必要 (useState, useEffect など)
- リアルタイム更新が必要 (SWR, Polling など)

データ取得だけなら Server Component で十分です。

### Q3: searchParams と useState の使い分けは？

**A:**

- **searchParams**: ブックマーク/共有が必要、SEO が重要、永続的な状態
- **useState**: 一時的な UI 状態 (モーダルの開閉、アコーディオンの開閉など)

検索/フィルタ/ソートは基本的に searchParams を使用してください。

### Q4: Route Handlers はいつ使う？

**A:** 以下の場合**のみ**使用してください:

- 外部 Webhook の受信 (`app/api/webhooks/*/route.ts`)
- OAuth コールバック (`app/api/auth/*/callback/route.ts`)
- 外部 API の公開 (このプロジェクトでは基本的に不要)

内部だけで使うデータ取得には Server Component を使用してください。

### Q5: revalidatePath と revalidateTag の違いは？

**A:**

- **revalidatePath**: パスベースで再検証 (例: `/instructors`)
  - シンプル、直感的
  - 新規実装ではこちらを推奨

- **revalidateTag**: タグベースで再検証 (例: `instructors.list`)
  - 細かい制御が可能
  - 複雑な依存関係がある場合に使用

基本的には `revalidatePath` を使用してください。

### Q6: データ量が多い場合はどうする？

**A:** パターン2 (searchParams) を使用してサーバーサイドでフィルタリング/ページネーションを実装してください。

```typescript
import { getSearchParam } from '@/lib/utils/search-params'

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export default async function Page({ searchParams }: PageProps) {
  const params = await searchParams
  const pageParam = getSearchParam(params.page)
  const page = Number.parseInt(pageParam || '1')
  const perPage = 20

  const instructors = await (await getPrisma()).instructor.findMany({
    take: perPage,
    skip: (page - 1) * perPage,
    orderBy: { lastName: 'asc' },
  })

  const totalCount = await (await getPrisma()).instructor.count()

  return (
    <div>
      <InstructorList instructors={instructors} />
      <Pagination currentPage={page} totalPages={Math.ceil(totalCount / perPage)} />
    </div>
  )
}
```

---

## まとめ

新規実装では以下のパターンを基準にしてください:

1. **読み取り**: Server Component で直接データ取得
2. **検索/フィルタ/ソート**: searchParams を使用
3. **更新**: Server Actions を使用
4. **ローディング**: `loading.tsx` または `<Suspense>`
5. **エラー**: `error.tsx`

このガイドラインに従うことで、シンプルで保守性の高いコードを書くことができます。

---

## 参考リンク

- [Next.js 公式ドキュメント: Data Fetching](https://nextjs.org/docs/app/building-your-application/data-fetching)
- [Next.js 公式ドキュメント: Server Actions](https://nextjs.org/docs/app/building-your-application/data-fetching/server-actions-and-mutations)
- [React 公式ドキュメント: Server Components](https://react.dev/reference/rsc/server-components)
