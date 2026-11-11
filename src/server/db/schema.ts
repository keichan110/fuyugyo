import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';

import { CONDITIONS } from '../../features/weather/daily';

/**
 * 全テーブル共通の作成・更新タイムスタンプ列。
 * SQLite には epoch 秒で格納し、更新時は `updatedAt` を自動更新する。
 */
const timestamps = {
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`),
  updatedAt: integer('updated_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`)
    .$onUpdate(() => new Date()),
};

/** 主キー列。ID は Workers 組込みの `crypto.randomUUID()` で採番する（cuid 廃止）。 */
const primaryId = () =>
  text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID());

/** 資格テーブル（インストラクター資格を管理） */
export const certifications = sqliteTable(
  'certifications',
  {
    id: primaryId(),
    departmentCode: text('department_code').notNull(),
    name: text('name').notNull(),
    shortName: text('short_name').notNull(),
    organization: text('organization').notNull(),
    description: text('description'),
    isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
    ...timestamps,
  },
  (t) => [
    index('idx_certifications_department_code').on(t.departmentCode),
    index('idx_certifications_active').on(t.isActive),
    index('idx_certifications_organization').on(t.organization),
  ],
);

/** インストラクターテーブル（インストラクター基本情報を管理） */
export const instructors = sqliteTable(
  'instructors',
  {
    id: primaryId(),
    lastName: text('last_name').notNull(),
    firstName: text('first_name').notNull(),
    lastNameKana: text('last_name_kana'),
    firstNameKana: text('first_name_kana'),
    status: text('status').notNull().default('ACTIVE'),
    notes: text('notes'),
    ...timestamps,
  },
  (t) => [
    index('idx_instructors_status').on(t.status),
    index('idx_instructors_name').on(t.lastName, t.firstName),
    index('idx_instructors_kana').on(t.lastNameKana, t.firstNameKana),
    index('idx_instructors_status_name').on(t.status, t.lastName, t.firstName),
    index('idx_instructors_status_kana').on(t.status, t.lastNameKana, t.firstNameKana),
  ],
);

/** インストラクター資格関連テーブル（多対多の中間テーブル） */
export const instructorCertifications = sqliteTable(
  'instructor_certifications',
  {
    id: primaryId(),
    instructorId: text('instructor_id')
      .notNull()
      .references(() => instructors.id, { onDelete: 'cascade' }),
    certificationId: text('certification_id')
      .notNull()
      .references(() => certifications.id, { onDelete: 'cascade' }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('idx_instructor_cert_unique').on(t.instructorId, t.certificationId),
    index('idx_instructor_cert_instructor_id').on(t.instructorId),
    index('idx_instructor_cert_certification_id').on(t.certificationId),
  ],
);

/** シフト種類テーブル（シフトの種類を管理するマスタ） */
export const shiftTypes = sqliteTable(
  'shift_types',
  {
    id: primaryId(),
    name: text('name').notNull(),
    isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
    ...timestamps,
  },
  (t) => [index('idx_shift_types_active').on(t.isActive)],
);

/** 部門別シフト種別テーブル（部門ごとの可用性と表示順を管理） */
export const departmentShiftTypes = sqliteTable(
  'department_shift_types',
  {
    id: primaryId(),
    departmentCode: text('department_code').notNull(),
    shiftTypeId: text('shift_type_id')
      .notNull()
      .references(() => shiftTypes.id, { onDelete: 'cascade' }),
    sortOrder: integer('sort_order').notNull(),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('idx_department_shift_types_unique').on(t.departmentCode, t.shiftTypeId),
    index('idx_department_shift_types_department_code').on(t.departmentCode),
  ],
);

/** 部門別シフト種別ごとの必要資格と、枠内での資格レベルを管理する中間テーブル */
export const certificationRequirements = sqliteTable(
  'certification_requirements',
  {
    id: primaryId(),
    departmentShiftTypeId: text('department_shift_type_id')
      .notNull()
      .references(() => departmentShiftTypes.id, { onDelete: 'cascade' }),
    certificationId: text('certification_id')
      .notNull()
      .references(() => certifications.id, { onDelete: 'cascade' }),
    tierRank: integer('tier_rank').notNull(),
    ...timestamps,
  },
  (t) => [
    check('certification_requirements_tier_rank_positive', sql`${t.tierRank} > 0`),
    uniqueIndex('idx_certification_requirements_unique').on(
      t.departmentShiftTypeId,
      t.certificationId,
    ),
    index('idx_certification_requirements_frame').on(t.departmentShiftTypeId),
    index('idx_certification_requirements_certification').on(t.certificationId),
  ],
);

/** シフトテーブル（シフト枠を管理） */
export const shifts = sqliteTable(
  'shifts',
  {
    id: primaryId(),
    date: integer('date', { mode: 'timestamp' }).notNull(),
    departmentCode: text('department_code').notNull(),
    shiftTypeId: text('shift_type_id')
      .notNull()
      .references(() => shiftTypes.id),
    description: text('description'),
    requiredCount: integer('required_count'),
    status: text('status', { enum: ['DRAFT', 'PUBLISHED'] })
      .notNull()
      .default('DRAFT'),
    revision: integer('revision').notNull().default(0),
    ...timestamps,
  },
  (t) => [
    check(
      'shifts_required_count_non_negative',
      sql`${t.requiredCount} IS NULL OR ${t.requiredCount} >= 0`,
    ),
    check('shifts_revision_non_negative', sql`${t.revision} >= 0`),
    check('shifts_status_valid', sql`${t.status} IN ('DRAFT', 'PUBLISHED')`),
    // (日付 × 部門 × シフト種別) の重複枠を DB レベルで禁止する
    uniqueIndex('unique_shift_per_day').on(t.date, t.departmentCode, t.shiftTypeId),
    index('idx_shifts_department_code').on(t.departmentCode),
    index('idx_shifts_shift_type_id').on(t.shiftTypeId),
    index('idx_shifts_date').on(t.date),
    index('idx_shifts_date_department').on(t.date, t.departmentCode),
    index('idx_shifts_department_type_date').on(t.departmentCode, t.shiftTypeId, t.date),
    index('idx_shifts_date_type').on(t.date, t.shiftTypeId),
  ],
);

/** シフト割り当てテーブル（シフトとインストラクターの多対多関係を管理） */
export const shiftAssignments = sqliteTable(
  'shift_assignments',
  {
    id: primaryId(),
    shiftId: text('shift_id')
      .notNull()
      .references(() => shifts.id, { onDelete: 'cascade' }),
    instructorId: text('instructor_id')
      .notNull()
      .references(() => instructors.id, { onDelete: 'cascade' }),
    assignedAt: integer('assigned_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (t) => [
    uniqueIndex('idx_shift_assignment_unique').on(t.shiftId, t.instructorId),
    index('idx_shift_assignments_shift_id').on(t.shiftId),
    index('idx_shift_assignments_instructor_id').on(t.instructorId),
    index('idx_shift_assignments_assigned_at').on(t.assignedAt),
    index('idx_assignments_instructor_date').on(t.instructorId, t.assignedAt),
    index('idx_assignments_date_instructor').on(t.assignedAt, t.instructorId),
  ],
);

/** インストラクター本人が申告する日別の勤務可否（部門・シフト種別には紐づけない） */
export const instructorAvailabilities = sqliteTable(
  'instructor_availabilities',
  {
    id: primaryId(),
    instructorId: text('instructor_id')
      .notNull()
      .references(() => instructors.id, { onDelete: 'cascade' }),
    date: integer('date', { mode: 'timestamp' }).notNull(),
    type: text('type', { enum: ['AVAILABLE', 'UNAVAILABLE', 'AVOID'] }).notNull(),
    note: text('note'),
  },
  (t) => [
    uniqueIndex('idx_instructor_availabilities_unique').on(t.instructorId, t.date),
    index('idx_instructor_availabilities_date').on(t.date),
  ],
);

/** ユーザー認証・権限管理テーブル */
export const users = sqliteTable(
  'users',
  {
    id: primaryId(),
    lineUserId: text('line_user_id').notNull().unique(),
    displayName: text('display_name').notNull(),
    pictureUrl: text('picture_url'),
    role: text('role').notNull().default('MEMBER'),
    isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
    // User ↔ Instructor は 1:1（リンク時）。UNIQUE 制約で DB レベルに強制する。
    // SQLite では NULL は重複可のため、未リンクの User は複数存在できる。
    instructorId: text('instructor_id').references(() => instructors.id, {
      onDelete: 'set null',
    }),
    ...timestamps,
  },
  (t) => [
    index('idx_users_role').on(t.role),
    index('idx_users_active').on(t.isActive),
    index('idx_users_role_active').on(t.role, t.isActive),
    uniqueIndex('idx_users_instructor_id').on(t.instructorId),
  ],
);

/** 招待 URL 管理テーブル */
export const invitationTokens = sqliteTable(
  'invitation_tokens',
  {
    token: text('token').primaryKey(),
    expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
    isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
    createdBy: text('created_by')
      .notNull()
      .references(() => users.id),
    maxUses: integer('max_uses'),
    usedCount: integer('used_count').notNull().default(0),
    description: text('description'),
    ...timestamps,
  },
  (t) => [
    index('idx_invitation_tokens_expires_at').on(t.expiresAt),
    index('idx_invitation_tokens_active').on(t.isActive),
    index('idx_invitation_tokens_created_by').on(t.createdBy),
    index('idx_invitation_tokens_active_expires').on(t.isActive, t.expiresAt),
  ],
);

/** 天気の予報地点。シーズン中の代表地点を1行だけ持つ（単一行の制約は API 側で担保する） */
export const weatherPoints = sqliteTable('weather_points', {
  id: primaryId(),
  name: text('name').notNull(),
  /** 小数点以下4桁に切り捨てた緯度 */
  latitude: real('latitude').notNull(),
  /** 小数点以下4桁に切り捨てた経度 */
  longitude: real('longitude').notNull(),
  /** 標高（m・整数）。MET Norway の altitude パラメータに渡す */
  elevationM: integer('elevation_m').notNull(),
  ...timestamps,
});

/**
 * 天気予報の時系列。(地点, データ源, 開始時刻) で upsert する。
 * 過去の行は実測値ではなく「その時点の最後の予報値」。
 */
export const weatherSteps = sqliteTable(
  'weather_steps',
  {
    pointId: text('point_id')
      .notNull()
      .references(() => weatherPoints.id, { onDelete: 'cascade' }),
    source: text('source').notNull(),
    /** ステップの開始時刻 */
    time: integer('time', { mode: 'timestamp' }).notNull(),
    /** そのステップが表す時間数（1 または 6） */
    stepHours: integer('step_hours').notNull(),
    temperatureC: real('temperature_c'),
    precipitationMm: real('precipitation_mm'),
    windSpeedMs: real('wind_speed_ms'),
    windDirectionDeg: integer('wind_direction_deg'),
    cloudCoverPct: integer('cloud_cover_pct'),
    /** 取得時に5種類へまとめた天気 */
    condition: text('condition', { enum: CONDITIONS }),
    /** 元の symbol_code */
    rawSymbol: text('raw_symbol'),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.pointId, t.source, t.time] }),
    index('idx_weather_steps_time').on(t.time),
  ],
);

/** 地点・データ源ごとの取得状態（Expires / Last-Modified による取得制御用） */
export const weatherFetchState = sqliteTable(
  'weather_fetch_state',
  {
    pointId: text('point_id')
      .notNull()
      .references(() => weatherPoints.id, { onDelete: 'cascade' }),
    source: text('source').notNull(),
    /** レスポンスの Last-Modified をそのまま保持（If-Modified-Since に使う） */
    lastModified: text('last_modified'),
    /** レスポンスの Expires。この時刻までは再取得しない */
    expiresAt: integer('expires_at', { mode: 'timestamp' }),
    lastFetchedAt: integer('last_fetched_at', { mode: 'timestamp' }),
  },
  (t) => [primaryKey({ columns: [t.pointId, t.source] })],
);

/** 天気取得ログ。最終更新時刻の表示と失敗検知に使う */
export const weatherFetchLogs = sqliteTable(
  'weather_fetch_logs',
  {
    id: primaryId(),
    pointId: text('point_id')
      .notNull()
      .references(() => weatherPoints.id, { onDelete: 'cascade' }),
    source: text('source').notNull(),
    fetchedAt: integer('fetched_at', { mode: 'timestamp' }).notNull(),
    ok: integer('ok', { mode: 'boolean' }).notNull(),
    /** 304 もここに入る */
    httpStatus: integer('http_status'),
    rowsUpserted: integer('rows_upserted'),
    error: text('error'),
  },
  (t) => [index('idx_weather_fetch_logs_point_time').on(t.pointId, t.fetchedAt)],
);
