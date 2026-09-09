-- AlterTable
ALTER TABLE "deployments" ADD COLUMN     "finished_at" TIMESTAMP(3),
ADD COLUMN     "message" TEXT;

-- AlterTable
ALTER TABLE "services" ADD COLUMN     "health_detail" TEXT,
ADD COLUMN     "health_latency_ms" INTEGER,
ADD COLUMN     "health_status" TEXT NOT NULL DEFAULT 'unknown',
ADD COLUMN     "health_url" TEXT,
ADD COLUMN     "last_health_check_at" TIMESTAMP(3);
