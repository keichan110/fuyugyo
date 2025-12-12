/**
 * Prisma クライアントモック
 *
 * テストでPrismaクライアントをモック化するための設定です。
 * 実際のデータベース操作を行わずに、テストデータを使用してCRUD操作をシミュレートします。
 */

import { jest } from "@jest/globals";
import type { PrismaClient } from "@prisma/client";
import {
  createCertification,
  createDepartment,
  createInstructor,
  createShift,
  createShiftAssignment,
  createShiftType,
} from "../helpers/factories";

// Prismaクライアントのモック型定義
type MockPrismaClient = {
  [K in keyof PrismaClient]: jest.Mocked<PrismaClient[K]>;
};

// モックデータストレージ
const mockDatabase = {
  departments: [] as any[],
  instructors: [] as any[],
  certifications: [] as any[],
  shifts: [] as any[],
  shiftTypes: [] as any[],
  shiftAssignments: [] as any[],
  instructorCertifications: [] as any[],
};

// ID生成用カウンター
let idCounter = 1;
const generateId = () => `test-id-${idCounter++}`;

// 基本的なCRUD操作のモック関数
const createMockCrudOperations = (tableName: keyof typeof mockDatabase) => ({
  findMany: jest.fn().mockImplementation((args: any = {}) => {
    let data = [...mockDatabase[tableName]];

    // where条件の簡単な実装
    if (args.where) {
      data = data.filter((item) => {
        return Object.entries(args.where).every(
          ([key, value]: [string, any]) => {
            if (
              typeof value === "object" &&
              value !== null &&
              !Array.isArray(value)
            ) {
              // 複雑な条件（equals, gt, lt等）は簡単に実装
              if ("equals" in value) {
                return item[key] === value.equals;
              }
              if ("in" in value) {
                return (value.in as any).includes(item[key]);
              }
              if ("contains" in value) {
                return String(item[key]).includes(String(value.contains));
              }
              // サポートされていない条件はfalseを返す（フィルタリングを確実に行う）
              return false;
            }
            return item[key] === value;
          }
        );
      });
    }

    // orderBy の簡単な実装
    if (args.orderBy) {
      const orderByArray = Array.isArray(args.orderBy)
        ? args.orderBy
        : [args.orderBy];
      data.sort((a, b) => {
        for (const order of orderByArray) {
          const [field, direction] = Object.entries(order)[0] as [string, any];
          const aVal = a[field];
          const bVal = b[field];
          if (aVal !== bVal) {
            const result = aVal < bVal ? -1 : 1;
            return direction === "desc" ? -result : result;
          }
        }
        return 0;
      });
    }

    // take/skip の実装
    if (args.skip) {
      data = data.slice(args.skip);
    }
    if (args.take) {
      data = data.slice(0, args.take);
    }

    return Promise.resolve(data);
  }),

  findUnique: jest.fn().mockImplementation((args: any) => {
    const data = mockDatabase[tableName].find((item) => {
      if (args.where.id) {
        return item.id === args.where.id;
      }
      // その他の unique フィールドに対する検索
      return Object.entries(args.where).every(
        ([key, value]) => item[key] === value
      );
    });
    return Promise.resolve(data || null);
  }),

  findFirst: jest.fn().mockImplementation((args: any = {}) => {
    let data = [...mockDatabase[tableName]];

    if (args.where) {
      data = data.filter((item) =>
        Object.entries(args.where).every(([key, value]) => item[key] === value)
      );
    }

    if (args.orderBy) {
      const orderByArray = Array.isArray(args.orderBy)
        ? args.orderBy
        : [args.orderBy];
      data.sort((a, b) => {
        for (const order of orderByArray) {
          const [field, direction] = Object.entries(order)[0] as [string, any];
          const aVal = a[field];
          const bVal = b[field];
          if (aVal !== bVal) {
            const result = aVal < bVal ? -1 : 1;
            return direction === "desc" ? -result : result;
          }
        }
        return 0;
      });
    }

    return Promise.resolve(data[0] || null);
  }),

  create: jest.fn().mockImplementation((args: any) => {
    const newItem = {
      id: generateId(),
      ...args.data,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    mockDatabase[tableName].push(newItem);
    return Promise.resolve(newItem);
  }),

  update: jest.fn().mockImplementation((args: any) => {
    const index = mockDatabase[tableName].findIndex((item) => {
      if (args.where.id) {
        return item.id === args.where.id;
      }
      return Object.entries(args.where).every(
        ([key, value]) => item[key] === value
      );
    });

    if (index === -1) {
      throw new Error("Record not found");
    }

    const updatedItem = {
      ...mockDatabase[tableName][index],
      ...args.data,
      updatedAt: new Date(),
    };

    mockDatabase[tableName][index] = updatedItem;
    return Promise.resolve(updatedItem);
  }),

  delete: jest.fn().mockImplementation((args: any) => {
    const index = mockDatabase[tableName].findIndex((item) => {
      if (args.where.id) {
        return item.id === args.where.id;
      }
      return Object.entries(args.where).every(
        ([key, value]) => item[key] === value
      );
    });

    if (index === -1) {
      throw new Error("Record not found");
    }

    const deletedItem = mockDatabase[tableName][index];
    mockDatabase[tableName].splice(index, 1);
    return Promise.resolve(deletedItem);
  }),

  count: jest.fn().mockImplementation((args: any = {}) => {
    let data = [...mockDatabase[tableName]];

    if (args.where) {
      data = data.filter((item) =>
        Object.entries(args.where).every(([key, value]) => item[key] === value)
      );
    }

    return Promise.resolve(data.length);
  }),

  upsert: jest.fn().mockImplementation((args: any) => {
    const existingIndex = mockDatabase[tableName].findIndex((item) =>
      Object.entries(args.where).every(([key, value]) => item[key] === value)
    );

    if (existingIndex >= 0) {
      // Update existing record
      const updatedItem = {
        ...mockDatabase[tableName][existingIndex],
        ...args.update,
        updatedAt: new Date(),
      };
      mockDatabase[tableName][existingIndex] = updatedItem;
      return Promise.resolve(updatedItem);
    }
    // Create new record
    const newItem = {
      id: generateId(),
      ...args.create,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    mockDatabase[tableName].push(newItem);
    return Promise.resolve(newItem);
  }),
});

// モックPrismaクライアントの作成
export const createMockPrismaClient = (): MockPrismaClient => {
  const mockPrisma = {
    // 各テーブルのCRUD操作
    department: createMockCrudOperations("departments"),
    instructor: createMockCrudOperations("instructors"),
    certification: createMockCrudOperations("certifications"),
    shift: createMockCrudOperations("shifts"),
    shiftType: createMockCrudOperations("shiftTypes"),
    shiftAssignment: createMockCrudOperations("shiftAssignments"),
    instructorCertification: createMockCrudOperations(
      "instructorCertifications"
    ),

    // トランザクション関連
    $transaction: jest.fn().mockImplementation(async (...args: any[]) => {
      const [operations] = args as [any[]];
      // 簡単なトランザクションシミュレーション
      const results: any[] = [];
      for (const operation of operations) {
        if (typeof operation === "function") {
          results.push(await operation(mockPrisma));
        } else {
          results.push(await operation);
        }
      }
      return results;
    }),

    // 接続関連
    $connect: jest.fn(() => Promise.resolve()) as any,
    $disconnect: jest.fn(() => Promise.resolve()) as any,

    // その他のPrismaメソッド
    $executeRaw: jest.fn(() => Promise.resolve(0)) as any,
    $executeRawUnsafe: jest.fn(() => Promise.resolve(0)) as any,
    $queryRaw: jest.fn(() => Promise.resolve([])) as any,
    $queryRawUnsafe: jest.fn(() => Promise.resolve([])) as any,
  } as any;

  return mockPrisma;
};

// テストデータのセットアップ用ヘルパー関数
export const setupMockData = () => {
  // データベースをクリア
  resetMockDatabase();

  // 基本データをセットアップ
  const department = createDepartment({ id: "test-dept-1" });
  const shiftType = createShiftType({ id: "test-shift-type-1" });
  const certification = createCertification({
    id: "test-cert-1",
    departmentId: "test-dept-1",
  });
  const instructor = createInstructor({ id: "test-instructor-1" });
  const shift = createShift({
    id: "test-shift-1",
    departmentId: "test-dept-1",
    shiftTypeId: "test-shift-type-1",
  });
  const assignment = createShiftAssignment({
    id: "test-assignment-1",
    shiftId: "test-shift-1",
    instructorId: "test-instructor-1",
  });

  mockDatabase.departments.push(department);
  mockDatabase.shiftTypes.push(shiftType);
  mockDatabase.certifications.push(certification);
  mockDatabase.instructors.push(instructor);
  mockDatabase.shifts.push(shift);
  mockDatabase.shiftAssignments.push(assignment);

  return {
    department,
    shiftType,
    certification,
    instructor,
    shift,
    assignment,
  };
};

// モックデータベースのリセット
export const resetMockDatabase = () => {
  for (const key of Object.keys(mockDatabase)) {
    mockDatabase[key as keyof typeof mockDatabase] = [];
  }
  idCounter = 1;
};

// デフォルトのPrismaモック（jest.mock用）
export const prismaClientMock = createMockPrismaClient();

// グローバルモックの設定（必要に応じてテストで有効化）
export const mockPrismaClient = () => {
  jest.mock("@prisma/client", () => ({
    PrismaClient: jest.fn().mockImplementation(() => prismaClientMock),
  }));
};
