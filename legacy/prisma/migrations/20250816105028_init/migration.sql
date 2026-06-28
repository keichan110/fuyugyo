-- CreateTable
CREATE TABLE "departments" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "certifications" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "department_id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "short_name" TEXT NOT NULL,
    "organization" TEXT NOT NULL,
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "certifications_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "instructors" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "last_name" TEXT NOT NULL,
    "first_name" TEXT NOT NULL,
    "last_name_kana" TEXT,
    "first_name_kana" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "notes" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "instructor_certifications" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "instructor_id" INTEGER NOT NULL,
    "certification_id" INTEGER NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "instructor_certifications_instructor_id_fkey" FOREIGN KEY ("instructor_id") REFERENCES "instructors" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "instructor_certifications_certification_id_fkey" FOREIGN KEY ("certification_id") REFERENCES "certifications" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "shift_types" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "shifts" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "date" DATETIME NOT NULL,
    "department_id" INTEGER NOT NULL,
    "shift_type_id" INTEGER NOT NULL,
    "description" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "shifts_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "shifts_shift_type_id_fkey" FOREIGN KEY ("shift_type_id") REFERENCES "shift_types" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "shift_assignments" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "shift_id" INTEGER NOT NULL,
    "instructor_id" INTEGER NOT NULL,
    "assigned_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "shift_assignments_shift_id_fkey" FOREIGN KEY ("shift_id") REFERENCES "shifts" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "shift_assignments_instructor_id_fkey" FOREIGN KEY ("instructor_id") REFERENCES "instructors" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "departments_code_key" ON "departments"("code");

-- CreateIndex
CREATE INDEX "idx_departments_active" ON "departments"("is_active");

-- CreateIndex
CREATE INDEX "idx_certifications_department_id" ON "certifications"("department_id");

-- CreateIndex
CREATE INDEX "idx_certifications_active" ON "certifications"("is_active");

-- CreateIndex
CREATE INDEX "idx_certifications_organization" ON "certifications"("organization");

-- CreateIndex
CREATE INDEX "idx_instructors_status" ON "instructors"("status");

-- CreateIndex
CREATE INDEX "idx_instructors_name" ON "instructors"("last_name", "first_name");

-- CreateIndex
CREATE INDEX "idx_instructors_kana" ON "instructors"("last_name_kana", "first_name_kana");

-- CreateIndex
CREATE INDEX "idx_instructors_status_name" ON "instructors"("status", "last_name", "first_name");

-- CreateIndex
CREATE INDEX "idx_instructors_status_kana" ON "instructors"("status", "last_name_kana", "first_name_kana");

-- CreateIndex
CREATE INDEX "idx_instructors_active_name" ON "instructors"("last_name", "first_name");

-- CreateIndex
CREATE INDEX "idx_instructor_cert_instructor_id" ON "instructor_certifications"("instructor_id");

-- CreateIndex
CREATE INDEX "idx_instructor_cert_certification_id" ON "instructor_certifications"("certification_id");

-- CreateIndex
CREATE UNIQUE INDEX "idx_instructor_cert_unique" ON "instructor_certifications"("instructor_id", "certification_id");

-- CreateIndex
CREATE INDEX "idx_shift_types_active" ON "shift_types"("is_active");

-- CreateIndex
CREATE INDEX "idx_shifts_department_id" ON "shifts"("department_id");

-- CreateIndex
CREATE INDEX "idx_shifts_shift_type_id" ON "shifts"("shift_type_id");

-- CreateIndex
CREATE INDEX "idx_shifts_date" ON "shifts"("date");

-- CreateIndex
CREATE INDEX "idx_shifts_date_department" ON "shifts"("date", "department_id");

-- CreateIndex
CREATE INDEX "idx_shifts_department_type_date" ON "shifts"("department_id", "shift_type_id", "date");

-- CreateIndex
CREATE INDEX "idx_shifts_date_type" ON "shifts"("date", "shift_type_id");

-- CreateIndex
CREATE INDEX "idx_shifts_covering" ON "shifts"("date", "department_id", "shift_type_id");

-- CreateIndex
CREATE UNIQUE INDEX "shifts_date_department_id_shift_type_id_key" ON "shifts"("date", "department_id", "shift_type_id");

-- CreateIndex
CREATE INDEX "idx_shift_assignments_shift_id" ON "shift_assignments"("shift_id");

-- CreateIndex
CREATE INDEX "idx_shift_assignments_instructor_id" ON "shift_assignments"("instructor_id");

-- CreateIndex
CREATE INDEX "idx_shift_assignments_assigned_at" ON "shift_assignments"("assigned_at");

-- CreateIndex
CREATE INDEX "idx_assignments_instructor_date" ON "shift_assignments"("instructor_id", "assigned_at");

-- CreateIndex
CREATE INDEX "idx_assignments_date_instructor" ON "shift_assignments"("assigned_at", "instructor_id");

-- CreateIndex
CREATE INDEX "idx_assignments_shift_covering" ON "shift_assignments"("shift_id", "instructor_id");

-- CreateIndex
CREATE UNIQUE INDEX "idx_shift_assignment_unique" ON "shift_assignments"("shift_id", "instructor_id");
