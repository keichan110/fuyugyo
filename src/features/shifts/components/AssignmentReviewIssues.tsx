import { Group, Stack, Text } from '@mantine/core';

import type { AssignmentReviewDay, ReviewKind } from './assignment-review';
import { REVIEW_CATEGORIES } from './assignment-review-categories';
import classes from './assignment-review.module.css';

type Props = {
  issues: AssignmentReviewDay['issues'];
  filter?: ReviewKind | null;
};

/** 月全体と選択枠で、同じ現在案の要確認事項を同じ分類・内容で表示する。 */
export function AssignmentReviewIssues({ issues, filter }: Props) {
  return (
    <Stack gap={4}>
      {REVIEW_CATEGORIES.map(({ kind, label, icon: Icon }) => {
        const matching = issues.filter((issue) => issue.kind === kind);
        if (!matching.length || (filter && filter !== kind)) {
          return null;
        }
        return (
          <Group key={kind} gap={6} align="flex-start" wrap="nowrap">
            <Icon size={16} className={classes.issueIcon} aria-hidden="true" />
            <Text size="sm" className={classes.issueText}>
              <Text component="span" fw={600}>
                {label}：
              </Text>
              {matching.map((issue) => issue.text).join(' / ')}
            </Text>
          </Group>
        );
      })}
    </Stack>
  );
}
