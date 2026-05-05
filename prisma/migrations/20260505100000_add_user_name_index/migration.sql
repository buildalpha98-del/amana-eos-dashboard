-- Add btree index on User.name to keep `/api/employees` search performant.
-- The new Teams tab list page does case-insensitive substring matching
-- across name + email; email already has @unique (auto btree), name didn't.

CREATE INDEX "User_name_idx" ON "User"("name");
