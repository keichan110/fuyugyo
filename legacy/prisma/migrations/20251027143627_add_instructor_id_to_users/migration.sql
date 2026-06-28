/*
  Warnings:

  - You are about to drop the column `profile_image_url` on the `users` table. All the data in the column will be lost.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_users" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "line_user_id" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "picture_url" TEXT,
    "role" TEXT NOT NULL DEFAULT 'MEMBER',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "instructor_id" INTEGER,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "users_instructor_id_fkey" FOREIGN KEY ("instructor_id") REFERENCES "instructors" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_users" ("created_at", "display_name", "id", "is_active", "line_user_id", "picture_url", "role", "updated_at") SELECT "created_at", "display_name", "id", "is_active", "line_user_id", "profile_image_url", "role", "updated_at" FROM "users";
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
