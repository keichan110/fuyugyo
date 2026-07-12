import { useState } from 'react';

import { Grid, Paper, Stack, Tabs, Text } from '@mantine/core';

import { ListHeader } from '@/components/ListHeader';
import { DepartmentShiftTypeCatalog } from '@/features/department-shift-types/components/DepartmentShiftTypeCatalog';
import { DepartmentShiftTypeList } from '@/features/department-shift-types/components/DepartmentShiftTypeList';
import {
  DEPARTMENT_LABELS,
  departmentCodeSchema,
  type DepartmentCode,
} from '@/features/departments/schema';

/** 選択部門の利用設定と共有シフト種別マスタを並べて管理する画面。 */
export function ShiftTypeSettings() {
  const [departmentCode, setDepartmentCode] = useState<DepartmentCode>('ski');

  return (
    <Stack gap="lg">
      <ListHeader title="シフト種別設定" />
      <Grid gap="lg">
        <Grid.Col span={{ base: 12, md: 6 }}>
          <Paper withBorder p="md">
            <Stack gap="md">
              <Stack gap="sm">
                <Text fw={600}>部門別の利用設定</Text>
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
              </Stack>
              <DepartmentShiftTypeList departmentCode={departmentCode} />
            </Stack>
          </Paper>
        </Grid.Col>
        <Grid.Col span={{ base: 12, md: 6 }}>
          <Paper withBorder p="md">
            <DepartmentShiftTypeCatalog departmentCode={departmentCode} />
          </Paper>
        </Grid.Col>
      </Grid>
    </Stack>
  );
}
