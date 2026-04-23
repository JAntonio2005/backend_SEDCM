import http, { IncomingMessage, Server, ServerResponse } from "node:http";

function healthcheck(_req: IncomingMessage, res: ServerResponse): void {
  res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify({ status: "ok", service: "backend-sedcm-ingesta" }));
}

export async function startHttpServer(port: number): Promise<Server> {
  const server = http.createServer((req, res) => {
    if (req.method === "GET" && req.url === "/health") {
      healthcheck(req, res);
      return;
    }

    res.writeHead(404, { "content-type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ error: "not_found" }));
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, () => resolve());
  });

  return server;
}
