import { useCallback, useEffect, useState } from 'react';

import { Drawer, Grid, Group, Modal, Paper, Stack, Tabs, Text } from '@mantine/core';
import { IconArrowLeft, IconDatabase } from '@tabler/icons-react';
import { useBlocker } from '@tanstack/react-router';

import { AppButton } from '@/components/AppButton';
import { ListHeader } from '@/components/ListHeader';
import { CertificationRankEditor } from '@/features/certification-requirements';
import {
  CreateDepartmentShiftTypeDialog,
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
  const [createDialogOpened, setCreateDialogOpened] = useState(false);
  const [catalogOpened, setCatalogOpened] = useState(false);
  const [masterView, setMasterView] = useState<ShiftTypeDrawerState | null>(null);
  const [isEditorDirty, setEditorDirty] = useState(false);
  const [isShiftTypeListDirty, setShiftTypeListDirty] = useState(false);
  const { data: shiftTypes } = useDepartmentShiftTypes(departmentCode);

  useEffect(() => {
    setSelectedShiftTypeId((current) =>
      shiftTypes?.some((item) => item.shiftTypeId === current)
        ? current
        : (shiftTypes?.[0]?.shiftTypeId ?? null),
    );
  }, [shiftTypes]);

  const blocker = useBlocker({
    shouldBlockFn: () => isEditorDirty || isShiftTypeListDirty,
    enableBeforeUnload: () => isEditorDirty || isShiftTypeListDirty,
    withResolver: true,
  });

  const confirmDiscardEditor = useCallback(() => {
    return !isEditorDirty || window.confirm('保存していない必要資格の変更を破棄しますか？');
  }, [isEditorDirty]);

  const confirmDiscard = useCallback(() => {
    return (
      (!isEditorDirty && !isShiftTypeListDirty) ||
      window.confirm('保存していないシフト種別設定の変更を破棄しますか？')
    );
  }, [isEditorDirty, isShiftTypeListDirty]);

  const selectShiftType = (shiftTypeId: string) => {
    if (!confirmDiscardEditor()) return;
    setEditorDirty(false);
    setSelectedShiftTypeId(shiftTypeId);
  };

  const changeDepartment = (value: string | null) => {
    const parsed = departmentCodeSchema.safeParse(value);
    if (!parsed.success || parsed.data === departmentCode || !confirmDiscard()) return;
    setEditorDirty(false);
    setShiftTypeListDirty(false);
    setDepartmentCode(parsed.data);
  };

  return (
    <Stack gap="lg">
      <ListHeader
        title="シフト種別設定"
        action={
          <AppButton
            intent="secondary"
            leftSection={<IconDatabase size={16} />}
            disabled={isShiftTypeListDirty}
            onClick={() => setCatalogOpened(true)}
          >
            シフト種別マスタを管理
          </AppButton>
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
              key={departmentCode}
              departmentCode={departmentCode}
              selectedShiftTypeId={selectedShiftTypeId}
              onSelect={selectShiftType}
              canAssign={confirmDiscardEditor}
              canRemove={(shiftTypeId) =>
                shiftTypeId !== selectedShiftTypeId || confirmDiscardEditor()
              }
              onRemoved={(nextSelectedShiftTypeId) => {
                setEditorDirty(false);
                setSelectedShiftTypeId(nextSelectedShiftTypeId);
              }}
              onDirtyChange={setShiftTypeListDirty}
            />
          </Paper>
        </Grid.Col>
        <Grid.Col span={{ base: 12, md: 8 }}>
          <Stack gap="xs">
            {selectedShiftTypeId && (
              <Text fw={600}>
                {shiftTypes?.find((item) => item.shiftTypeId === selectedShiftTypeId)?.name}
              </Text>
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
            <AppButton
              intent="tertiary"
              leftSection={<IconArrowLeft size={16} />}
              onClick={() => setMasterView(null)}
              style={{ alignSelf: 'flex-start' }}
            >
              一覧へ戻る
            </AppButton>
            <ShiftTypeDrawerContent state={masterView} onDone={() => setMasterView(null)} />
          </Stack>
        ) : (
          <DepartmentShiftTypeCatalog
            onOpenForm={(state) => {
              if (state.mode === 'create') {
                setCreateDialogOpened(true);
                return;
              }
              setMasterView(state);
            }}
          />
        )}
      </Drawer>

      <CreateDepartmentShiftTypeDialog
        opened={createDialogOpened}
        departmentCode={departmentCode}
        onClose={() => setCreateDialogOpened(false)}
        onCreated={(shiftTypeId) => {
          setCreateDialogOpened(false);
          selectShiftType(shiftTypeId);
        }}
      />

      <Modal
        opened={blocker.status === 'blocked'}
        onClose={() => blocker.reset?.()}
        title="未保存の変更があります"
        centered
      >
        <Stack>
          <Text>このページを離れると、保存していないシフト種別設定の変更は失われます。</Text>
          <Group justify="flex-end">
            <AppButton intent="secondary" onClick={() => blocker.reset?.()}>
              このページに残る
            </AppButton>
            <AppButton intent="danger" emphasis="high" onClick={() => blocker.proceed?.()}>
              破棄して移動
            </AppButton>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}
