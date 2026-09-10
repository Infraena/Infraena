ALTER TABLE "services" ADD COLUMN "repo_url" TEXT;
ALTER TABLE "services" ADD COLUMN "repo_provider" TEXT;
UPDATE "services" SET "repo_url" = "github_repo_url", "repo_provider" = 'github' WHERE "github_repo_url" IS NOT NULL;
ALTER TABLE "services" DROP COLUMN "github_repo_url";
CREATE INDEX "services_repo_provider_idx" ON "services"("repo_provider");
