import { app } from "./app.js";
import { env } from "./lib/env.js";
import { createSocketServer } from "./lib/socket.js";
import { startWorkers } from "./workers/index.js";

try {
  await app.listen({ port: env.API_PORT, host: "0.0.0.0" });

  const httpServer = app.server;
  createSocketServer(httpServer);

  await startWorkers();

  console.log(`Infraena API running on http://localhost:${env.API_PORT}`);
  console.log(`WebSocket server attached`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
