# テスト環境・設定ガイド

このドキュメントはFuyugyō - 運営管理システムのテスト環境設定と使用方法について説明します。

## 📋 概要

テスト環境は以下の構成で設計されています：

- **Jest 29.7**: テスト実行フレームワーク
- **React Testing Library**: Reactコンポーネントテスト
- **Prisma Client Mock**: データベース操作モック
- **TanStack Query**: 非同期データ管理テスト
- **Next.js App Router**: ルーティング・ナビゲーションテスト

## 🚀 テストコマンド

### 基本コマンド

```bash
# 全テスト実行
npm test

# ウォッチモード（開発時推奨）
npm run test:watch

# カバレッジレポート付き実行
npm run test:coverage

# CI用実行（カバレッジ + ウォッチ無効）
npm run test:ci

# デバッグモード（詳細出力 + ハンドル検出）
npm run test:debug
```

### カテゴリ別テスト

```bash
# 単体テスト
npm run test:unit

# 統合テスト
npm run test:integration

# E2Eテスト
npm run test:e2e
```

### 部分実行

```bash
# 特定ファイルのテスト
npm test -- shifts.test.ts

# パターンマッチング
npm test -- --testNamePattern="create"

# 変更ファイルのみ
npm test -- --onlyChanged

# 失敗したテストのみ
npm test -- --onlyFailures
```

## 📁 ディレクトリ構造

```
__tests__/
├── helpers/          # テストヘルパー関数
│   ├── index.ts      # エクスポート統合
│   ├── factories.ts  # データファクトリー
│   └── test-utils.tsx # レンダリング・ユーティリティ
├── mocks/            # モック設定
│   ├── prisma.ts     # Prismaクライアントモック
│   ├── next-router.ts # Next.jsルーターモック
│   └── api.ts        # APIモック
├── matchers/         # Jestカスタムマッチャー
│   └── index.ts      # プロジェクト固有のアサーション
├── types/            # テスト専用型定義
│   └── test.d.ts     # TypeScript型拡張
├── setup/            # テスト環境セットアップ
└── README.md         # このファイル
```

## 🛠️ 使用方法

### 1. 基本的なコンポーネントテスト

```typescript
import { renderWithProviders } from '__tests__/helpers/test-utils';
import { createDepartment } from '__tests__/helpers/factories';
import DepartmentCard from '@/components/DepartmentCard';

test('should render department information correctly', () => {
  const department = createDepartment({ name: 'スキー部門' });

  const { getByText } = renderWithProviders(
    <DepartmentCard department={department} />
  );

  expect(getByText('スキー部門')).toBeInTheDocument();
});
```

### 2. API連携テスト

```typescript
import { setupApiMocks, expectApiCall } from '__tests__/mocks/api';
import { renderWithProviders } from '__tests__/helpers/test-utils';
import DepartmentList from '@/components/DepartmentList';

test('should fetch and display departments', async () => {
  const mockDepartments = createDepartments(3);
  setupApiMocks.departments.list(mockDepartments);

  const { findByText } = renderWithProviders(<DepartmentList />);

  await findByText(mockDepartments[0].name);
  expectApiCall('GET', '/api/departments');
});
```

### 3. Prismaモックテスト

```typescript
import { setupMockData, resetMockDatabase } from '__tests__/mocks/prisma';
import { prismaService } from '@/lib/prisma';

beforeEach(() => {
  resetMockDatabase();
});

test('should create department successfully', async () => {
  const { department } = setupMockData();

  const result = await prismaService.department.create({
    data: { name: 'テスト部門', code: 'TEST' },
  });

  expect(result).toMatchObject({
    name: 'テスト部門',
    code: 'TEST',
  });
});
```

### 4. ルーター・ナビゲーションテスト

```typescript
import { setupPageMock, simulateNavigation, expectRouterMethodCall } from '__tests__/mocks/next-router';
import { renderWithProviders } from '__tests__/helpers/test-utils';
import Navigation from '@/components/Navigation';

test('should navigate to shifts page on click', async () => {
  setupPageMock.admin();

  const { getByText } = renderWithProviders(<Navigation />);
  const shiftsLink = getByText('シフト管理');

  await userEvent.click(shiftsLink);

  expectRouterMethodCall('push', ['/admin/shifts']);
});
```

### 5. カスタムマッチャー使用例

```typescript
import '__tests__/matchers'; // カスタムマッチャーをインポート

test('should return valid API response', async () => {
  const response = await apiCall('/api/departments');

  expect(response).toBeSuccessApiResponse();
  expect(response.data).toHaveLength(3);
});

test('should sort departments by name', () => {
  const departments = [{ name: 'A部門' }, { name: 'B部門' }, { name: 'C部門' }];

  expect(departments).toBeSortedBy('name', 'asc');
});
```

## ⚙️ 設定ファイル詳細

### Jest設定 (`jest.config.js`)

- **カバレッジ**: 70%閾値、HTMLレポート出力
- **パフォーマンス**: 50%ワーカー、10秒タイムアウト
- **モジュールマッピング**: `@/*` エイリアス、Prismaクライアント
- **変換無視**: ES modules対応（TanStack Query等）

### Jest Setup (`jest.setup.js`)

- **環境変数**: テスト用設定の自動ロード
- **グローバルモック**: Next.js navigation, Browser APIs
- **日本語環境**: タイムゾーン・ロケール設定
- **コンソール**: テスト時の出力最適化

### 環境変数 (`.env.test`)

```env
NODE_ENV=test
TZ=Asia/Tokyo
DATABASE_URL=file:./test.db
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_TEST_MODE=true
```

## 🎯 テスト戦略

### テストピラミッド

1. **単体テスト** (70%): ユーティリティ関数、カスタムフック、単一コンポーネント
2. **統合テスト** (20%): API連携、データフロー、複数コンポーネント
3. **E2Eテスト** (10%): ユーザーワークフロー、クリティカルパス

### 品質基準

- **カバレッジ**: 70%以上 (branches, functions, lines, statements)
- **パフォーマンス**: テスト実行時間 <2分
- **信頼性**: テスト成功率 >95%

### テストデータ管理

- **ファクトリーパターン**: 一貫したテストデータ生成
- **モックDB**: インメモリ操作でテスト間独立性
- **リセット機能**: テスト間でのクリーンアップ

## 🐛 トラブルシューティング

### よくある問題

#### 1. テストがタイムアウトする

```bash
# デバッグモードで実行
npm run test:debug

# 特定テストのタイムアウトを延長
test('long running test', async () => {
  // ...
}, 15000); // 15秒タイムアウト
```

#### 2. モックが効かない

```typescript
// モックのリセットを確認
beforeEach(() => {
  jest.clearAllMocks();
  resetMockDatabase();
  resetRouterMock();
});
```

#### 3. 非同期処理待機

```typescript
// waitForを使用
await waitFor(() => {
  expect(getByText('Loading...')).not.toBeInTheDocument();
});

// カスタムマッチャーを活用
await expect(promise).toResolveWithin(5000);
```

### デバッグ方法

```typescript
// console.log でのデバッグ
import { screen } from '@testing-library/react';
screen.debug(); // DOM状態を出力

// 非同期操作の待機
await screen.findByText('期待するテキスト');

// API呼び出し履歴の確認
import { getApiCallHistory } from '__tests__/mocks/api';
console.log('API Calls:', getApiCallHistory());
```

## 📊 カバレッジレポート

```bash
# カバレッジレポート生成
npm run test:coverage

# HTMLレポートを確認
open coverage/lcov-report/index.html
```

カバレッジレポートは `coverage/` ディレクトリに出力され、以下の情報を提供します：

- **Lines**: 実行された行の割合
- **Functions**: 実行された関数の割合
- **Branches**: 実行された分岐の割合
- **Statements**: 実行されたステートメントの割合

## 🚀 CI/CD統合

```yaml
# GitHub Actions example
- name: Run tests
  run: npm run test:ci

- name: Upload coverage
  uses: codecov/codecov-action@v3
```

CI環境では `test:ci` コマンドを使用することで、以下が実行されます：

- ウォッチモード無効化
- カバレッジレポート生成
- テストが存在しなくてもPASS扱い
- CI最適化された設定

## 📝 追加リソース

- [Jest Documentation](https://jestjs.io/docs/getting-started)
- [React Testing Library](https://testing-library.com/docs/react-testing-library/intro/)
- [Next.js Testing](https://nextjs.org/docs/testing)
- [Prisma Testing](https://www.prisma.io/docs/guides/testing/unit-testing)
