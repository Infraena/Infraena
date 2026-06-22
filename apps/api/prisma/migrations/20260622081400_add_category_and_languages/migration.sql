-- DropColumn
ALTER TABLE "services" DROP COLUMN "stack";

-- AlterTable
ALTER TABLE "services" ADD COLUMN "category" TEXT NOT NULL DEFAULT 'backend',
                     ADD COLUMN "language"  TEXT[] DEFAULT ARRAY[]::TEXT[];
