/*
  Warnings:

  - The primary key for the `certifications` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The primary key for the `departments` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The primary key for the `instructor_certifications` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The primary key for the `instructors` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The primary key for the `shift_assignments` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The primary key for the `shift_types` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The primary key for the `shifts` table will be changed. If it partially fails, the table could be left without primary key constraint.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_certifications" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "department_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "short_name" TEXT NOT NULL,
    "organization" TEXT NOT NULL,
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "certifications_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_certifications" ("created_at", "department_id", "description", "id", "is_active", "name", "organization", "short_name", "updated_at") SELECT "created_at", "department_id", "description", "id", "is_active", "name", "organization", "short_name", "updated_at" FROM "certifications";
DROP TABLE "certifications";
ALTER TABLE "new_certifications" RENAME TO "certifications";
CREATE INDEX "idx_certifications_department_id" ON "certifications"("department_id");
CREATE INDEX "idx_certifications_active" ON "certifications"("is_active");
CREATE INDEX "idx_certifications_organization" ON "certifications"("organization");
CREATE TABLE "new_departments" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);
INSERT INTO "new_departments" ("code", "created_at", "description", "id", "is_active", "name", "updated_at") SELECT "code", "created_at", "description", "id", "is_active", "name", "updated_at" FROM "departments";
DROP TABLE "departments";
ALTER TABLE "new_departments" RENAME TO "departments";
CREATE UNIQUE INDEX "departments_code_key" ON "departments"("code");
CREATE INDEX "idx_departments_active" ON "departments"("is_active");
CREATE TABLE "new_instructor_certifications" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "instructor_id" TEXT NOT NULL,
    "certification_id" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "instructor_certifications_certification_id_fkey" FOREIGN KEY ("certification_id") REFERENCES "certifications" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "instructor_certifications_instructor_id_fkey" FOREIGN KEY ("instructor_id") REFERENCES "instructors" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_instructor_certifications" ("certification_id", "created_at", "id", "instructor_id", "updated_at") SELECT "certification_id", "created_at", "id", "instructor_id", "updated_at" FROM "instructor_certifications";
DROP TABLE "instructor_certifications";
ALTER TABLE "new_instructor_certifications" RENAME TO "instructor_certifications";
CREATE INDEX "idx_instructor_cert_instructor_id" ON "instructor_certifications"("instructor_id");
CREATE INDEX "idx_instructor_cert_certification_id" ON "instructor_certifications"("certification_id");
CREATE UNIQUE INDEX "idx_instructor_cert_unique" ON "instructor_certifications"("instructor_id", "certification_id");
CREATE TABLE "new_instructors" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "last_name" TEXT NOT NULL,
    "first_name" TEXT NOT NULL,
    "last_name_kana" TEXT,
    "first_name_kana" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "notes" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);
INSERT INTO "new_instructors" ("created_at", "first_name", "first_name_kana", "id", "last_name", "last_name_kana", "notes", "status", "updated_at") SELECT "created_at", "first_name", "first_name_kana", "id", "last_name", "last_name_kana", "notes", "status", "updated_at" FROM "instructors";
DROP TABLE "instructors";
ALTER TABLE "new_instructors" RENAME TO "instructors";
CREATE INDEX "idx_instructors_status" ON "instructors"("status");
CREATE INDEX "idx_instructors_name" ON "instructors"("last_name", "first_name");
CREATE INDEX "idx_instructors_kana" ON "instructors"("last_name_kana", "first_name_kana");
CREATE INDEX "idx_instructors_status_name" ON "instructors"("status", "last_name", "first_name");
CREATE INDEX "idx_instructors_status_kana" ON "instructors"("status", "last_name_kana", "first_name_kana");
CREATE INDEX "idx_instructors_active_name" ON "instructors"("last_name", "first_name");
CREATE TABLE "new_shift_assignments" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shift_id" TEXT NOT NULL,
    "instructor_id" TEXT NOT NULL,
    "assigned_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "shift_assignments_instructor_id_fkey" FOREIGN KEY ("instructor_id") REFERENCES "instructors" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "shift_assignments_shift_id_fkey" FOREIGN KEY ("shift_id") REFERENCES "shifts" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_shift_assignments" ("assigned_at", "id", "instructor_id", "shift_id") SELECT "assigned_at", "id", "instructor_id", "shift_id" FROM "shift_assignments";
DROP TABLE "shift_assignments";
ALTER TABLE "new_shift_assignments" RENAME TO "shift_assignments";
CREATE INDEX "idx_shift_assignments_shift_id" ON "shift_assignments"("shift_id");
CREATE INDEX "idx_shift_assignments_instructor_id" ON "shift_assignments"("instructor_id");
CREATE INDEX "idx_shift_assignments_assigned_at" ON "shift_assignments"("assigned_at");
CREATE INDEX "idx_assignments_instructor_date" ON "shift_assignments"("instructor_id", "assigned_at");
CREATE INDEX "idx_assignments_date_instructor" ON "shift_assignments"("assigned_at", "instructor_id");
CREATE INDEX "idx_assignments_shift_covering" ON "shift_assignments"("shift_id", "instructor_id");
CREATE UNIQUE INDEX "idx_shift_assignment_unique" ON "shift_assignments"("shift_id", "instructor_id");
CREATE TABLE "new_shift_types" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);
INSERT INTO "new_shift_types" ("created_at", "id", "is_active", "name", "updated_at") SELECT "created_at", "id", "is_active", "name", "updated_at" FROM "shift_types";
DROP TABLE "shift_types";
ALTER TABLE "new_shift_types" RENAME TO "shift_types";
CREATE INDEX "idx_shift_types_active" ON "shift_types"("is_active");
CREATE TABLE "new_shifts" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "date" DATETIME NOT NULL,
    "department_id" TEXT NOT NULL,
    "shift_type_id" TEXT NOT NULL,
    "description" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "shifts_shift_type_id_fkey" FOREIGN KEY ("shift_type_id") REFERENCES "shift_types" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "shifts_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_shifts" ("created_at", "date", "department_id", "description", "id", "shift_type_id", "updated_at") SELECT "created_at", "date", "department_id", "description", "id", "shift_type_id", "updated_at" FROM "shifts";
DROP TABLE "shifts";
ALTER TABLE "new_shifts" RENAME TO "shifts";
CREATE INDEX "idx_shifts_department_id" ON "shifts"("department_id");
CREATE INDEX "idx_shifts_shift_type_id" ON "shifts"("shift_type_id");
CREATE INDEX "idx_shifts_date" ON "shifts"("date");
CREATE INDEX "idx_shifts_date_department" ON "shifts"("date", "department_id");
CREATE INDEX "idx_shifts_department_type_date" ON "shifts"("department_id", "shift_type_id", "date");
CREATE INDEX "idx_shifts_date_type" ON "shifts"("date", "shift_type_id");
CREATE INDEX "idx_shifts_covering" ON "shifts"("date", "department_id", "shift_type_id");
CREATE UNIQUE INDEX "shifts_date_department_id_shift_type_id_key" ON "shifts"("date", "department_id", "shift_type_id");
CREATE TABLE "new_users" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "line_user_id" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "picture_url" TEXT,
    "role" TEXT NOT NULL DEFAULT 'MEMBER',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "instructor_id" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "users_instructor_id_fkey" FOREIGN KEY ("instructor_id") REFERENCES "instructors" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_users" ("created_at", "display_name", "id", "instructor_id", "is_active", "line_user_id", "picture_url", "role", "updated_at") SELECT "created_at", "display_name", "id", "instructor_id", "is_active", "line_user_id", "picture_url", "role", "updated_at" FROM "users";
DROP TABLE "users";
ALTER TABLE "new_users" RENAME TO "users";
CREATE UNIQUE INDEX "users_line_user_id_key" ON "users"("line_user_id");
CREATE INDEX "idx_users_line_user_id" ON "users"("line_user_id");
CREATE INDEX "idx_users_role" ON "users"("role");
CREATE INDEX "idx_users_active" ON "users"("is_active");
CREATE INDEX "idx_users_role_active" ON "users"("role", "is_active");
CREATE INDEX "idx_users_instructor_id" ON "users"("instructor_id");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
