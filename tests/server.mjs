import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, resolve, sep } from "node:path";

const root = resolve(import.meta.dirname, "..");
const portArgumentIndex = process.argv.indexOf("--port");
const requestedPort =
  portArgumentIndex >= 0 ? Number(process.argv[portArgumentIndex + 1]) : NaN;
const port = Number.isInteger(requestedPort) ? requestedPort : 4174;
const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".woff2": "font/woff2",
};

createServer(async (request, response) => {
  const pathname = new URL(request.url, `http://${request.headers.host}`)
    .pathname;
  const requestedPath = pathname === "/" ? "/index.html" : pathname;
  const filePath = resolve(root, `.${decodeURIComponent(requestedPath)}`);

  if (filePath !== root && !filePath.startsWith(`${root}${sep}`)) {
    response.writeHead(403).end("Forbidden");
    return;
  }

  try {
    const fileStat = await stat(filePath);
    if (!fileStat.isFile()) {
      throw new Error("Not a file");
    }
    response.writeHead(200, {
      "Cache-Control": "no-store",
      "Content-Type":
        contentTypes[extname(filePath)] || "application/octet-stream",
    });
    createReadStream(filePath).pipe(response);
  } catch (error) {
    response.writeHead(404).end("Not found");
  }
}).listen(port, "127.0.0.1");
