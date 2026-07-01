import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'coverage/**',
      'drizzle/**',
      'src/routeTree.gen.ts',
      'worker-configuration.d.ts',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      globals: { ...globals.browser, ...globals.node },
    },
    plugins: { 'react-hooks': reactHooks, 'react-refresh': reactRefresh },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      // TanStack Router の `export const Route` 等の定数 export は許可する
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],
    },
  },
  // routes/ は TanStack Router の配線専用、components/ui/ は shadcn プリミティブで
  // どちらも component と定数（Route / variants）の同居が前提のため Fast Refresh 検査を外す
  {
    files: ['src/routes/**/*.{ts,tsx}', 'src/components/ui/**/*.tsx'],
    rules: { 'react-refresh/only-export-components': 'off' },
  },
  // クライアントコードからサーバー専用モジュール（api.ts・server/・Worker エントリ）の
  // 値 import を禁止する。type import（`import type`）は RPC 型取得のため許可する（ADR 0002）。
  // feature 配下のクライアントファイルを広く対象にし、サーバー側の api.ts のみ除外する。
  // schema.ts は isomorphic（zod のみ依存）なので対象に含めても違反は生じない。
  {
    files: [
      'src/features/**/*.{ts,tsx}',
      'src/components/**/*.{ts,tsx}',
      'src/routes/**/*.{ts,tsx}',
      'src/lib/**/*.ts',
      'src/main.tsx',
    ],
    ignores: ['src/features/**/api.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/api', '**/api.ts', '**/server/**', '@/index'],
              allowTypeImports: true,
              message:
                'クライアントからサーバー専用モジュール（api.ts / server / Worker エントリ）の値 import は禁止です。type import（import type）のみ許可されます。',
            },
          ],
        },
      ],
    },
  },
  prettier,
);
