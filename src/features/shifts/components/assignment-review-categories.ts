import {
  IconAlertTriangle,
  IconCalendarExclamation,
  IconCertificate,
  IconUsers,
} from '@tabler/icons-react';

import type { ReviewKind } from './assignment-review';

export const REVIEW_CATEGORIES = [
  { kind: 'shortage', label: '人数不足', icon: IconUsers },
  { kind: 'availability', label: '勤務可否', icon: IconCalendarExclamation },
  { kind: 'streak', label: '4連勤以上', icon: IconAlertTriangle },
  { kind: 'qualification', label: '資格構成', icon: IconCertificate },
] satisfies { kind: ReviewKind; label: string; icon: typeof IconUsers }[];
