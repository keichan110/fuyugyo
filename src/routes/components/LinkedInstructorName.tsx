import { Text } from '@mantine/core';

import { useInstructor } from '@/features/instructors/queries';

type LinkedInstructorNameProps = {
  /** ログインユーザーに紐付けられた Instructor ID（未紐付けなら null） */
  instructorId: string | null;
};

/**
 * アカウント表示で LINE 表示名の下に添える、紐付け先インストラクター名の薄いテキスト。
 * 未紐付けなら「未紐付け」と表示する。
 */
export function LinkedInstructorName({ instructorId }: LinkedInstructorNameProps) {
  if (!instructorId) {
    return (
      <Text size="xs" c="dimmed">
        未紐付け
      </Text>
    );
  }
  return <LinkedInstructorFullName instructorId={instructorId} />;
}

/**
 * 紐付け先 Instructor を取得して氏名を表示する（フックを条件付きで呼ばないよう分離）。
 * 取得に失敗した場合は「読み込み中」のまま残さず、取得できなかったことを示す。
 */
function LinkedInstructorFullName({ instructorId }: { instructorId: string }) {
  const { data: instructor, isError } = useInstructor(instructorId);

  let label = '読み込み中';
  if (instructor) label = `${instructor.lastName} ${instructor.firstName}`;
  else if (isError) label = '取得できませんでした';

  return (
    <Text size="xs" c="dimmed" truncate>
      {label}
    </Text>
  );
}
