-- DropForeignKey
ALTER TABLE "services" DROP CONSTRAINT "services_owner_id_fkey";

-- AlterTable
ALTER TABLE "services" ALTER COLUMN "owner_id" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "services" ADD CONSTRAINT "services_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
