-- AlterTable
ALTER TABLE "services" ADD COLUMN "provisioning" TEXT[] NOT NULL DEFAULT ARRAY['github','terraform','vault']::TEXT[];

-- CreateTable
CREATE TABLE "service_dependencies" (
    "id" UUID NOT NULL,
    "source_service_id" UUID NOT NULL,
    "target_service_id" UUID NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'api',
    "label" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "service_dependencies_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "service_dependencies" ADD CONSTRAINT "service_dependencies_source_service_id_fkey" FOREIGN KEY ("source_service_id") REFERENCES "services"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_dependencies" ADD CONSTRAINT "service_dependencies_target_service_id_fkey" FOREIGN KEY ("target_service_id") REFERENCES "services"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
