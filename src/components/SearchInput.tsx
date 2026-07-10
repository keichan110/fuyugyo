import { TextInput, type TextInputProps } from '@mantine/core';
import { IconSearch } from '@tabler/icons-react';

/**
 * 一覧画面の検索欄として使う TextInput。
 * 検索アイコン(leftSection)と伸縮スタイル(flex: 1, minWidth: 240)を内蔵し、
 * その他の props は TextInput にそのまま透過する。
 */
export function SearchInput(props: TextInputProps) {
  return <TextInput leftSection={<IconSearch size={16} />} flex={1} miw={240} {...props} />;
}
