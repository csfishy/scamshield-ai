import next from "next";
import { createServer } from "node:http";
const port = Number(process.argv[2]);
const app = next({ dev: false, hostname: "127.0.0.1", port });
await app.prepare();
const server = createServer(app.getRequestHandler());
await new Promise((r) => server.listen(port, "127.0.0.1", r));
process.send?.({ ready: true });
process.on("message", async (message) => {
  if (message !== "shutdown") return;
  server.closeAllConnections();
  server.close();
  await app.close();
  process.exit(0);
});
