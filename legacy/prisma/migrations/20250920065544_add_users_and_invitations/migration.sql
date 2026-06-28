-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "line_user_id" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "profile_image_url" TEXT,
    "role" TEXT NOT NULL DEFAULT 'MEMBER',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "invitation_tokens" (
    "token" TEXT NOT NULL PRIMARY KEY,
    "expires_at" DATETIME NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_by" TEXT NOT NULL,
    "max_uses" INTEGER,
    "used_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    "description" TEXT,
    CONSTRAINT "invitation_tokens_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "users_line_user_id_key" ON "users"("line_user_id");

-- CreateIndex
CREATE INDEX "idx_users_line_user_id" ON "users"("line_user_id");

-- CreateIndex
CREATE INDEX "idx_users_role" ON "users"("role");

-- CreateIndex
CREATE INDEX "idx_users_active" ON "users"("is_active");

-- CreateIndex
CREATE INDEX "idx_users_role_active" ON "users"("role", "is_active");

-- CreateIndex
CREATE INDEX "idx_invitation_tokens_expires_at" ON "invitation_tokens"("expires_at");

-- CreateIndex
CREATE INDEX "idx_invitation_tokens_active" ON "invitation_tokens"("is_active");

-- CreateIndex
CREATE INDEX "idx_invitation_tokens_created_by" ON "invitation_tokens"("created_by");

-- CreateIndex
CREATE INDEX "idx_invitation_tokens_active_expires" ON "invitation_tokens"("is_active", "expires_at");
