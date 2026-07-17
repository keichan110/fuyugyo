import { useEffect, useMemo, useState } from 'react';

import {
  Alert,
  Badge,
  Button,
  Checkbox,
  Divider,
  Grid,
  Group,
  Paper,
  Select,
  Stack,
  Tabs,
  Text,
} from '@mantine/core';
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

import { useCertificationRequirements, useUpdateCertificationRequirements } from '../queries';
import type { CertificationRequirement } from '../schema';
import { normalizeTierRanks } from '../tier-ranks';

/** 部門・シフト種別枠ごとに必要資格を設定する画面。 */
export function CertificationRequirementSettings() {
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
      <ListHeader title="必要資格設定" />
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
  } = useCertificationRequirements(departmentCode, shiftTypeId);
  const [editedCertifications, setEditedCertifications] = useState<CertificationRequirement[]>([]);
  const update = useUpdateCertificationRequirements(departmentCode, shiftTypeId ?? '');

  useEffect(() => {
    if (savedCertifications) setEditedCertifications(normalizeTierRanks(savedCertifications));
  }, [savedCertifications]);

  const requirementByCertificationId = useMemo(
    () =>
      new Map(
        editedCertifications.map((certification) => [certification.certificationId, certification]),
      ),
    [editedCertifications],
  );
  const tierRanks = useMemo(
    () => [...new Set(editedCertifications.map(({ tierRank }) => tierRank))].sort((a, b) => a - b),
    [editedCertifications],
  );
  const certificationNameById = useMemo(
    () => new Map(certifications?.map((certification) => [certification.id, certification.name])),
    [certifications],
  );

  if (!shiftTypeId) {
    return (
      <Paper withBorder p="md">
        <Text c="dimmed">設定するシフト種別を選択してください。</Text>
      </Paper>
    );
  }

  const moveCertification = (certificationId: string, destination: string | null) => {
    if (!destination) return;
    const tierRank = destination === 'new' ? tierRanks.length + 1 : Number(destination);
    setEditedCertifications((current) =>
      normalizeTierRanks(
        current.map((certification) =>
          certification.certificationId === certificationId
            ? { ...certification, tierRank }
            : certification,
        ),
      ),
    );
  };

  const toggleCertification = (certificationId: string, checked: boolean) => {
    setEditedCertifications((current) => {
      if (!checked)
        return normalizeTierRanks(
          current.filter((certification) => certification.certificationId !== certificationId),
        );
      const lowestTierRank = Math.max(0, ...current.map(({ tierRank }) => tierRank)) + 1;
      return [...current, { certificationId, tierRank: lowestTierRank }];
    });
  };

  const swapTier = (tierRank: number, adjacentTierRank: number) => {
    setEditedCertifications((current) =>
      current.map((requirement) => {
        if (requirement.tierRank === tierRank)
          return { ...requirement, tierRank: adjacentTierRank };
        if (requirement.tierRank === adjacentTierRank) return { ...requirement, tierRank };
        return requirement;
      }),
    );
  };

  return (
    <Paper withBorder p="md">
      <Stack gap="md">
        <Stack gap={2}>
          <Text fw={600}>対象資格と資格段</Text>
          <Text c="dimmed" size="sm">
            上の段ほど上位の資格です。同じ段にまとめた資格は、自動割当で同等として扱います。
          </Text>
        </Stack>
        {isError && <ErrorAlert>必要資格の取得に失敗しました</ErrorAlert>}
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
              <Stack gap="xs">
                <Text fw={600} size="sm">
                  対象へ追加
                </Text>
                {certifications
                  .filter((certification) => !requirementByCertificationId.has(certification.id))
                  .map((certification) => (
                    <Checkbox
                      key={certification.id}
                      checked={false}
                      label={certification.name}
                      onChange={(event) =>
                        toggleCertification(certification.id, event.currentTarget.checked)
                      }
                    />
                  ))}
                {certifications.every((certification) =>
                  requirementByCertificationId.has(certification.id),
                ) && (
                  <Text c="dimmed" size="sm">
                    すべての資格が対象に追加されています。
                  </Text>
                )}
              </Stack>
              <Divider />
              {editedCertifications.length === 0 && (
                <Alert color="yellow" variant="light">
                  この枠の必要資格は未設定です。
                </Alert>
              )}
              {tierRanks.map((tierRank) => {
                const requirements = editedCertifications.filter(
                  (certification) => certification.tierRank === tierRank,
                );
                return (
                  <Paper
                    key={tierRank}
                    withBorder
                    p="md"
                    {...(tierRank === 1 ? { bg: 'blue.0' } : {})}
                  >
                    <Stack gap="sm">
                      <Group justify="space-between" align="flex-start">
                        <Group gap="xs">
                          <Text fw={700}>上から{tierRank}段目</Text>
                          {tierRank === 1 && <Badge variant="light">最上位</Badge>}
                        </Group>
                        <Stack gap={4} align="flex-end">
                          <Text c="dimmed" size="xs">
                            この段の資格は同等
                          </Text>
                          <Group gap="xs">
                            <Button
                              size="compact-xs"
                              variant="subtle"
                              disabled={tierRank === 1}
                              onClick={() => swapTier(tierRank, tierRank - 1)}
                            >
                              1段上へ
                            </Button>
                            <Button
                              size="compact-xs"
                              variant="subtle"
                              disabled={tierRank === tierRanks.length}
                              onClick={() => swapTier(tierRank, tierRank + 1)}
                            >
                              1段下へ
                            </Button>
                          </Group>
                        </Stack>
                      </Group>
                      {requirements.map((requirement) => (
                        <Paper key={requirement.certificationId} withBorder p="sm" bg="white">
                          <Group justify="space-between" align="flex-end" wrap="wrap">
                            <Checkbox
                              checked
                              label={
                                certificationNameById.get(requirement.certificationId) ??
                                requirement.certificationId
                              }
                              onChange={(event) =>
                                toggleCertification(
                                  requirement.certificationId,
                                  event.currentTarget.checked,
                                )
                              }
                            />
                            <Select
                              aria-label={`${certificationNameById.get(requirement.certificationId) ?? '資格'}の段`}
                              label="移動先"
                              size="xs"
                              w={190}
                              value={String(requirement.tierRank)}
                              data={[
                                ...tierRanks.map((rank) => ({
                                  value: String(rank),
                                  label: `上から${rank}段目${rank === requirement.tierRank ? '（現在）' : ''}`,
                                })),
                                {
                                  value: 'new',
                                  label: `新しい最下段（${tierRanks.length + 1}段目）`,
                                },
                              ]}
                              allowDeselect={false}
                              onChange={(value) =>
                                moveCertification(requirement.certificationId, value)
                              }
                            />
                          </Group>
                        </Paper>
                      ))}
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
                        notifications.show({ color: 'green', message: '必要資格を保存しました' }),
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
