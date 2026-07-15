import { useEffect, useMemo, useState } from 'react';

import { Alert, Button, Checkbox, Grid, Paper, Slider, Stack, Tabs, Text } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconCertificate, IconListDetails } from '@tabler/icons-react';

import { ErrorAlert } from '@/components/AppAlert';
import { ListEmptyState } from '@/components/ListEmptyState';
import { ListHeader } from '@/components/ListHeader';
import { useCertifications } from '@/features/certifications/queries';
import { useDepartmentShiftTypes } from '@/features/department-shift-types/queries';
import {
  DEPARTMENT_LABELS,
  departmentCodeSchema,
  type DepartmentCode,
} from '@/features/departments/schema';

import {
  useDepartmentShiftTypeCertifications,
  useUpdateDepartmentShiftTypeCertifications,
} from '../queries';
import type { DepartmentShiftTypeCertification } from '../schema';

/** 部門・シフト種別枠ごとに資格序列を設定する画面。 */
export function ShiftTypeCertificationSettings() {
  const [departmentCode, setDepartmentCode] = useState<DepartmentCode>('ski');
  const { data: shiftTypes, isLoading, isError } = useDepartmentShiftTypes(departmentCode);
  const [shiftTypeId, setShiftTypeId] = useState<string | null>(null);

  useEffect(() => {
    const firstShiftTypeId = shiftTypes?.[0]?.shiftTypeId ?? null;
    setShiftTypeId((current) =>
      shiftTypes?.some((shiftType) => shiftType.shiftTypeId === current)
        ? current
        : firstShiftTypeId,
    );
  }, [shiftTypes]);

  return (
    <Stack gap="lg">
      <ListHeader title="資格序列設定" />
      <Tabs
        value={departmentCode}
        onChange={(value) => {
          const parsed = departmentCodeSchema.safeParse(value);
          if (parsed.success) setDepartmentCode(parsed.data);
        }}
      >
        <Tabs.List>
          {departmentCodeSchema.options.map((code) => (
            <Tabs.Tab key={code} value={code}>
              {DEPARTMENT_LABELS[code]}
            </Tabs.Tab>
          ))}
        </Tabs.List>
      </Tabs>
      <Grid gap="lg">
        <Grid.Col span={{ base: 12, md: 4 }}>
          <Paper withBorder p="md">
            <Stack gap="xs">
              <Text fw={600}>シフト種別</Text>
              {isError && <ErrorAlert>シフト種別の取得に失敗しました</ErrorAlert>}
              {isLoading && <Text c="dimmed">読み込み中...</Text>}
              {!isLoading && !isError && shiftTypes?.length === 0 && (
                <ListEmptyState
                  icon={<IconListDetails size={32} stroke={1.5} />}
                  title="シフト種別がありません"
                  description="先にシフト種別設定で、この部門にシフト種別を追加してください。"
                />
              )}
              {shiftTypes?.map((shiftType) => (
                <Button
                  key={shiftType.shiftTypeId}
                  variant={shiftTypeId === shiftType.shiftTypeId ? 'light' : 'subtle'}
                  justify="flex-start"
                  onClick={() => setShiftTypeId(shiftType.shiftTypeId)}
                >
                  {shiftType.name}
                </Button>
              ))}
            </Stack>
          </Paper>
        </Grid.Col>
        <Grid.Col span={{ base: 12, md: 8 }}>
          <CertificationRankEditor
            key={`${departmentCode}:${shiftTypeId ?? 'none'}`}
            departmentCode={departmentCode}
            shiftTypeId={shiftTypeId}
          />
        </Grid.Col>
      </Grid>
    </Stack>
  );
}

/** 選択枠の対象資格と段を編集し、枠単位で保存する。 */
function CertificationRankEditor({
  departmentCode,
  shiftTypeId,
}: {
  departmentCode: DepartmentCode;
  shiftTypeId: string | null;
}) {
  const { data: certifications, isLoading: isCertificationsLoading } = useCertifications(
    true,
    departmentCode,
  );
  const {
    data: savedCertifications,
    isLoading: isRanksLoading,
    isError,
  } = useDepartmentShiftTypeCertifications(departmentCode, shiftTypeId);
  const [editedCertifications, setEditedCertifications] = useState<
    DepartmentShiftTypeCertification[]
  >([]);
  const update = useUpdateDepartmentShiftTypeCertifications(departmentCode, shiftTypeId ?? '');

  useEffect(() => {
    if (savedCertifications) setEditedCertifications(savedCertifications);
  }, [savedCertifications]);

  const rankByCertificationId = useMemo(
    () =>
      new Map(
        editedCertifications.map((certification) => [
          certification.certificationId,
          certification.level,
        ]),
      ),
    [editedCertifications],
  );
  const levels = useMemo(
    () =>
      [...new Set(editedCertifications.map((certification) => certification.level))].sort(
        (a, b) => b - a,
      ),
    [editedCertifications],
  );
  const maximumRank = Math.max(levels.length, 1);

  if (!shiftTypeId) {
    return (
      <Paper withBorder p="md">
        <Text c="dimmed">設定するシフト種別を選択してください。</Text>
      </Paper>
    );
  }

  const updateRank = (certificationId: string, rank: number) => {
    const level = levels[rank - 1] ?? (levels.at(-1) ?? 0) - 10;
    setEditedCertifications((current) =>
      current.map((certification) =>
        certification.certificationId === certificationId
          ? { ...certification, level }
          : certification,
      ),
    );
  };

  const toggleCertification = (certificationId: string, checked: boolean) => {
    setEditedCertifications((current) => {
      if (!checked)
        return current.filter((certification) => certification.certificationId !== certificationId);
      const lowestLevel =
        current.length === 0 ? 10 : Math.min(...current.map((item) => item.level)) - 10;
      return [...current, { certificationId, level: lowestLevel }];
    });
  };

  return (
    <Paper withBorder p="md">
      <Stack gap="md">
        <Stack gap={2}>
          <Text fw={600}>対象資格と優先段</Text>
          <Text c="dimmed" size="sm">
            対象資格にチェックを入れ、上から何段目かを設定します。同じ段の資格は同着です。
          </Text>
        </Stack>
        {isError && <ErrorAlert>資格序列の取得に失敗しました</ErrorAlert>}
        {(isCertificationsLoading || isRanksLoading) && <Text c="dimmed">読み込み中...</Text>}
        {!isCertificationsLoading && !isRanksLoading && certifications?.length === 0 && (
          <ListEmptyState
            icon={<IconCertificate size={32} stroke={1.5} />}
            title="有効な資格がありません"
            description="先に資格マスタで資格を登録してください。"
          />
        )}
        {!isCertificationsLoading &&
          !isRanksLoading &&
          certifications &&
          certifications.length > 0 && (
            <Stack gap="sm">
              {editedCertifications.length === 0 && (
                <Alert color="yellow" variant="light">
                  この枠の資格序列は未設定です。
                </Alert>
              )}
              {certifications.map((certification) => {
                const level = rankByCertificationId.get(certification.id);
                const rank = level === undefined ? maximumRank : levels.indexOf(level) + 1;
                const isSelected = level !== undefined;
                return (
                  <Paper key={certification.id} withBorder p="sm">
                    <Stack gap="xs">
                      <Checkbox
                        checked={isSelected}
                        label={certification.name}
                        onChange={(event) =>
                          toggleCertification(certification.id, event.currentTarget.checked)
                        }
                      />
                      {isSelected && (
                        <Stack gap={2} pl={28}>
                          <Text size="sm">上から{rank}段目</Text>
                          <Slider
                            min={1}
                            max={maximumRank}
                            step={1}
                            value={rank}
                            marks={Array.from({ length: maximumRank }, (_, index) => ({
                              value: index + 1,
                              label: `上から${index + 1}段目`,
                            }))}
                            label={null}
                            onChange={(value) => updateRank(certification.id, value)}
                          />
                        </Stack>
                      )}
                    </Stack>
                  </Paper>
                );
              })}
              <Button
                loading={update.isPending}
                onClick={() => {
                  update.mutate(
                    { certifications: editedCertifications },
                    {
                      onSuccess: () =>
                        notifications.show({ color: 'green', message: '資格序列を保存しました' }),
                    },
                  );
                }}
              >
                保存
              </Button>
              {update.isError && <ErrorAlert>{update.error.message}</ErrorAlert>}
            </Stack>
          )}
      </Stack>
    </Paper>
  );
}
