import type { ReactNode } from 'react';

import { EmptyState } from '@mantine/core';
import { IconSearch } from '@tabler/icons-react';

type ListEmptyStateProps = {
  /** 空表示に使うアイコン */
  icon: ReactNode;
  /** 空表示のタイトル */
  title: string;
  /** 空表示の補足説明 */
  description?: string;
  /** 作成ボタンなど、空表示に付随する操作 */
  action?: ReactNode;
};

type ListNoResultsStateProps = {
  /** 検索・絞り込み結果が空のときのタイトル */
  title: string;
  /** 検索・絞り込み結果が空のときの補足説明 */
  description?: string;
};

/**
 * 一覧画面で使う初期空表示。
 * Mantine の EmptyState.Actions を含む構造を一覧標準としてまとめる。
 */
export function ListEmptyState({ icon, title, description, action }: ListEmptyStateProps) {
  return (
    <EmptyState icon={icon} title={title} description={description}>
      {action && <EmptyState.Actions>{action}</EmptyState.Actions>}
    </EmptyState>
  );
}

/**
 * 一覧画面で検索・絞り込み条件に一致しないときの空表示。
 */
export function ListNoResultsState({
  title,
  description = '検索キーワードや絞り込み条件を変更してみてください。',
}: ListNoResultsStateProps) {
  return (
    <ListEmptyState
      icon={<IconSearch size={32} stroke={1.5} />}
      title={title}
      description={description}
    />
  );
}
