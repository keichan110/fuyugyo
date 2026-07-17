import { useCallback, useEffect, useState } from 'react';

import { Button, Drawer, Grid, Group, Modal, Paper, Stack, Tabs, Text } from '@mantine/core';
import { IconArrowLeft, IconDatabase } from '@tabler/icons-react';
import { useBlocker } from '@tanstack/react-router';

import { ListHeader } from '@/components/ListHeader';
import { CertificationRankEditor } from '@/features/certification-requirements';
import {
  DepartmentShiftTypeCatalog,
  DepartmentShiftTypeList,
  useDepartmentShiftTypes,
} from '@/features/department-shift-types';
import {
  DEPARTMENT_LABELS,
  departmentCodeSchema,
  type DepartmentCode,
} from '@/features/departments/schema';

import { ShiftTypeDrawerContent, type ShiftTypeDrawerState } from './ShiftTypeDrawer';
import classes from './ShiftTypeSettings.module.css';

/** 部門別シフト種別と必要資格を一続きで管理する画面。 */
export function ShiftTypeSettings() {
  const [departmentCode, setDepartmentCode] = useState<DepartmentCode>('ski');
  const [selectedShiftTypeId, setSelectedShiftTypeId] = useState<string | null>(null);
  const [catalogOpened, setCatalogOpened] = useState(false);
  const [masterView, setMasterView] = useState<ShiftTypeDrawerState | null>(null);
  const [isEditorDirty, setEditorDirty] = useState(false);
  const { data: shiftTypes } = useDepartmentShiftTypes(departmentCode);

  useEffect(() => {
    setSelectedShiftTypeId((current) =>
      shiftTypes?.some((item) => item.shiftTypeId === current)
        ? current
        : (shiftTypes?.[0]?.shiftTypeId ?? null),
    );
  }, [shiftTypes]);

  const blocker = useBlocker({
    shouldBlockFn: () => isEditorDirty,
    enableBeforeUnload: () => isEditorDirty,
    withResolver: true,
  });

  const confirmDiscard = useCallback(() => {
    return !isEditorDirty || window.confirm('保存していない必要資格の変更を破棄しますか？');
  }, [isEditorDirty]);

  const selectShiftType = (shiftTypeId: string) => {
    if (!confirmDiscard()) return;
    setEditorDirty(false);
    setSelectedShiftTypeId(shiftTypeId);
  };

  const changeDepartment = (value: string | null) => {
    const parsed = departmentCodeSchema.safeParse(value);
    if (!parsed.success || parsed.data === departmentCode || !confirmDiscard()) return;
    setEditorDirty(false);
    setDepartmentCode(parsed.data);
  };

  return (
    <Stack gap="lg">
      <ListHeader
        title="シフト種別設定"
        action={
          <Button
            variant="default"
            leftSection={<IconDatabase size={16} />}
            onClick={() => setCatalogOpened(true)}
          >
            シフト種別マスタを管理
          </Button>
        }
      />
      <Tabs value={departmentCode} onChange={changeDepartment}>
        <Tabs.List className={classes.departmentTabsList}>
          {departmentCodeSchema.options.map((code) => (
            <Tabs.Tab key={code} value={code}>
              {DEPARTMENT_LABELS[code]}
            </Tabs.Tab>
          ))}
        </Tabs.List>
      </Tabs>

      <Grid gap="lg" align="flex-start">
        <Grid.Col span={{ base: 12, md: 4 }}>
          <Paper withBorder p="md">
            <DepartmentShiftTypeList
              departmentCode={departmentCode}
              selectedShiftTypeId={selectedShiftTypeId}
              onSelect={selectShiftType}
              onAdd={() => setCatalogOpened(true)}
              canRemove={(shiftTypeId) => shiftTypeId !== selectedShiftTypeId || confirmDiscard()}
            />
          </Paper>
        </Grid.Col>
        <Grid.Col span={{ base: 12, md: 8 }}>
          <Stack gap="xs">
            {selectedShiftTypeId && (
              <Group justify="space-between">
                <Text fw={600}>
                  {shiftTypes?.find((item) => item.shiftTypeId === selectedShiftTypeId)?.name}
                </Text>
                {isEditorDirty && (
                  <Text c="orange" size="sm">
                    未保存の変更があります
                  </Text>
                )}
              </Group>
            )}
            <CertificationRankEditor
              key={`${departmentCode}:${selectedShiftTypeId ?? 'none'}`}
              departmentCode={departmentCode}
              shiftTypeId={selectedShiftTypeId}
              onDirtyChange={setEditorDirty}
            />
          </Stack>
        </Grid.Col>
      </Grid>

      <Drawer
        opened={catalogOpened}
        onClose={() => {
          setCatalogOpened(false);
          setMasterView(null);
        }}
        title={masterView ? 'シフト種別を登録・編集' : '共有シフト種別マスタ'}
        size="xl"
      >
        {masterView ? (
          <Stack gap="md">
            <Button
              variant="subtle"
              leftSection={<IconArrowLeft size={16} />}
              onClick={() => setMasterView(null)}
              style={{ alignSelf: 'flex-start' }}
            >
              一覧へ戻る
            </Button>
            <ShiftTypeDrawerContent state={masterView} onDone={() => setMasterView(null)} />
          </Stack>
        ) : (
          <DepartmentShiftTypeCatalog departmentCode={departmentCode} onOpenForm={setMasterView} />
        )}
      </Drawer>

      <Modal
        opened={blocker.status === 'blocked'}
        onClose={() => blocker.reset?.()}
        title="未保存の変更があります"
        centered
      >
        <Stack>
          <Text>このページを離れると、保存していない必要資格の変更は失われます。</Text>
          <Group justify="flex-end">
            <Button variant="default" onClick={() => blocker.reset?.()}>
              このページに残る
            </Button>
            <Button color="red" onClick={() => blocker.proceed?.()}>
              破棄して移動
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}
