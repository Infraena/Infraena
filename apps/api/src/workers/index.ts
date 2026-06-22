import { buildGitHubWorker } from "./github.worker.js";
import { buildTerraformWorker } from "./terraform.worker.js";
import { buildVaultWorker } from "./vault.worker.js";

export async function startWorkers() {
  await buildGitHubWorker();
  await buildTerraformWorker();
  await buildVaultWorker();
  console.log("All workers started");
}
