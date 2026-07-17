import { useEffect, useMemo, useRef, useState } from 'react';

import {
  ActionIcon,
  Button,
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
import {
  IconCertificate,
  IconGripVertical,
  IconListDetails,
  IconPlus,
  IconX,
} from '@tabler/icons-react';

import { ErrorAlert } from '@/components/AppAlert';
import { ListEmptyState } from '@/components/ListEmptyState';
import { ListHeader } from '@/components/ListHeader';
import { UnsavedChangesBar } from '@/components/UnsavedChangesBar';
import { useCertifications } from '@/features/certifications/queries';
import { useDepartmentShiftTypes } from '@/features/department-shift-types/queries';
import {
  DEPARTMENT_LABELS,
  departmentCodeSchema,
  type DepartmentCode,
} from '@/features/departments/schema';

import { useCertificationRequirements, useUpdateCertificationRequirements } from '../queries';
import {
  addCertification,
  addEmptyTier,
  countChangedRequirements,
  createTierBlocks,
  moveCertification,
  removeCertification,
  removeEmptyTier,
  serializeTierBlocks,
  type TierBlock,
} from '../tier-editor-state';

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

/** 選択枠の対象資格と資格レベルを編集し、枠単位で保存する。 */
export function CertificationRankEditor({
  departmentCode,
  shiftTypeId,
  onDirtyChange,
}: {
  departmentCode: DepartmentCode;
  shiftTypeId: string | null;
  onDirtyChange?: (dirty: boolean) => void;
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
  const [tierBlocks, setTierBlocks] = useState<TierBlock[]>([]);
  const [certificationToAdd, setCertificationToAdd] = useState<string | null>(null);
  const [draggedCertificationId, setDraggedCertificationId] = useState<string | null>(null);
  const dragSourceId = useRef<string | null>(null);
  const nextBlockId = useRef(0);
  const isHydratingRef = useRef(false);
  const update = useUpdateCertificationRequirements(departmentCode, shiftTypeId ?? '');

  const savedTierBlocks = useMemo(
    () => createTierBlocks(savedCertifications ?? []),
    [savedCertifications],
  );
  const savedRequirements = useMemo(() => serializeTierBlocks(savedTierBlocks), [savedTierBlocks]);
  const currentRequirements = useMemo(() => serializeTierBlocks(tierBlocks), [tierBlocks]);
  const isDirty =
    savedCertifications !== undefined &&
    JSON.stringify(currentRequirements) !== JSON.stringify(savedRequirements);
  const changedRequirementCount = countChangedRequirements(savedRequirements, currentRequirements);

  useEffect(() => {
    if (savedCertifications) {
      isHydratingRef.current = true;
      setTierBlocks(createTierBlocks(savedCertifications));
      onDirtyChange?.(false);
    }
  }, [onDirtyChange, savedCertifications]);

  useEffect(() => {
    if (savedCertifications === undefined) return;
    if (isHydratingRef.current) {
      isHydratingRef.current = false;
      return;
    }
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange, savedCertifications]);

  const selectedCertificationIds = useMemo(
    () => new Set(tierBlocks.flatMap((block) => block.certificationIds)),
    [tierBlocks],
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

  const createBlockId = () => `new-tier-${nextBlockId.current++}`;

  const dropAt = (tierId: string, index: number) => {
    const certificationId = dragSourceId.current;
    dragSourceId.current = null;
    setDraggedCertificationId(null);
    if (certificationId)
      setTierBlocks((current) => moveCertification(current, certificationId, tierId, index));
  };

  return (
    <Paper withBorder p="md">
      <Stack gap="md">
        <Stack gap={2}>
          <Text fw={600}>対象資格と資格レベル</Text>
          <Text c="dimmed" size="sm">
            資格をドラッグして並び替えたり、別のレベルへ移動できます。同じレベルの資格は、
            自動割当で同等として扱います。
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
              <Select
                label="対象資格を追加"
                placeholder="資格を選択"
                searchable
                clearable
                value={certificationToAdd}
                data={certifications
                  .filter((certification) => !selectedCertificationIds.has(certification.id))
                  .map((certification) => ({ value: certification.id, label: certification.name }))}
                nothingFoundMessage="追加できる資格がありません"
                onChange={(certificationId) => {
                  setCertificationToAdd(null);
                  if (certificationId)
                    setTierBlocks((current) =>
                      addCertification(current, certificationId, createBlockId()),
                    );
                }}
              />
              <Divider />
              {tierBlocks.length > 0 && (
                <Text c="dimmed" size="xs" fw={600}>
                  高
                </Text>
              )}
              {tierBlocks.map((block, tierIndex) => (
                <Paper
                  key={block.id}
                  withBorder
                  p="md"
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={() => dropAt(block.id, block.certificationIds.length)}
                >
                  <Stack gap="sm">
                    {block.certificationIds.length === 0 && (
                      <Group justify="space-between">
                        <Text c="dimmed" size="sm" ta="center" py="sm">
                          ここへ資格をドロップ
                        </Text>
                        <ActionIcon
                          color="red"
                          variant="subtle"
                          aria-label={`上から${tierIndex + 1}番目の空レベルを削除`}
                          onClick={() =>
                            setTierBlocks((current) => removeEmptyTier(current, block.id))
                          }
                        >
                          <IconX size={16} />
                        </ActionIcon>
                      </Group>
                    )}
                    {block.certificationIds.map((certificationId, itemIndex) => (
                      <Paper
                        key={certificationId}
                        withBorder
                        p="sm"
                        bg="white"
                        draggable
                        opacity={draggedCertificationId === certificationId ? 0.5 : 1}
                        style={{ cursor: 'grab' }}
                        onDragStart={(event) => {
                          event.stopPropagation();
                          dragSourceId.current = certificationId;
                          setDraggedCertificationId(certificationId);
                        }}
                        onDragEnd={() => {
                          dragSourceId.current = null;
                          setDraggedCertificationId(null);
                        }}
                        onDragOver={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                        }}
                        onDrop={(event) => {
                          event.stopPropagation();
                          dropAt(block.id, itemIndex);
                        }}
                      >
                        <Group justify="space-between" wrap="nowrap">
                          <Group gap="xs" wrap="nowrap">
                            <IconGripVertical
                              aria-hidden
                              size={18}
                              color="var(--mantine-color-dimmed)"
                            />
                            <Text size="sm" fw={500}>
                              {certificationNameById.get(certificationId) ?? certificationId}
                            </Text>
                          </Group>
                          <Group gap={4} wrap="nowrap">
                            <ActionIcon
                              color="red"
                              variant="subtle"
                              aria-label={`${certificationNameById.get(certificationId) ?? '資格'}を除外`}
                              onClick={() =>
                                setTierBlocks((current) =>
                                  removeCertification(current, certificationId),
                                )
                              }
                            >
                              <IconX size={16} />
                            </ActionIcon>
                          </Group>
                        </Group>
                      </Paper>
                    ))}
                  </Stack>
                </Paper>
              ))}
              {tierBlocks.length > 0 && (
                <Text c="dimmed" size="xs" fw={600}>
                  低
                </Text>
              )}
              <Button
                variant="outline"
                leftSection={<IconPlus size={16} />}
                onClick={() => setTierBlocks((current) => addEmptyTier(current, createBlockId()))}
              >
                レベルを追加
              </Button>
              {isDirty && (
                <UnsavedChangesBar
                  count={changedRequirementCount}
                  description="選択中のシフト種別に必要な資格を保存します"
                  loading={update.isPending}
                  onCancel={() => setTierBlocks(savedTierBlocks)}
                  onSave={() => {
                    update.mutate(
                      { certifications: currentRequirements },
                      {
                        onSuccess: () => {
                          onDirtyChange?.(false);
                          notifications.show({
                            color: 'green',
                            message: '必要資格を保存しました',
                          });
                        },
                      },
                    );
                  }}
                />
              )}
              {update.isError && <ErrorAlert>{update.error.message}</ErrorAlert>}
            </Stack>
          )}
      </Stack>
    </Paper>
  );
}
