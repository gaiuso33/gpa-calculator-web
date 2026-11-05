
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const ROOT_DIR = path.resolve(__dirname, "..");

const isPreview = process.argv.includes("--preview");
const SERVE_DIR = path.join(ROOT_DIR, isPreview ? "dist" : ".");
const PORT = isPreview ? 4173 : 5173;

const MIME_TYPES = {
  ".html": "text/html",
  ".css": "text/css",
  ".js": "text/javascript",
  ".json": "application/json",
  ".webmanifest": "application/manifest+json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".pdf": "application/pdf"
};

if (!fs.existsSync(SERVE_DIR)) {
  console.error(`Directory not found: ${SERVE_DIR}`);
  process.exit(1);
}

const server = http.createServer((req, res) => {
  const pathname = decodeURIComponent(
    new URL(req.url, "http://localhost").pathname
  );

  const requestedPath = path.resolve(
    SERVE_DIR,
    `.${pathname}`
  );

  if (
    requestedPath !== SERVE_DIR &&
    !requestedPath.startsWith(SERVE_DIR + path.sep)
  ) {
    res.writeHead(403);
    return res.end("Forbidden");
  }

  let filePath = requestedPath;

  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
    filePath = path.join(filePath, "index.html");
  }

  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    res.writeHead(404);
    return res.end("Not Found");
  }

  const contentType =
    MIME_TYPES[path.extname(filePath).toLowerCase()] ||
    "application/octet-stream";

  res.writeHead(200, {
    "Content-Type": contentType,
    "Cache-Control": "no-cache"
  });

  fs.createReadStream(filePath).pipe(res);
});

server.listen(PORT, () => {
  console.log(
    `GPA Calculator ${isPreview ? "Preview" : "Dev"} running at:`
  );
  console.log(`http://localhost:${PORT}`);
});
