import Electrobun from "electrobun/bun";
import { existsSync, readFileSync } from "fs";
import { join, extname } from "path";

console.log("VidBee Electrobun main process initialized");

// Path to built React 19 VidBee UI bundle
const rendererDir = join(import.meta.dir, "../../../desktop/out/renderer");

const mimeTypes: Record<string, string> = {
  ".html": "text/html",
  ".js": "application/javascript",
  ".css": "text/css",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".json": "application/json",
  ".woff2": "font/woff2"
};

// Start Bun local static file server for React 19 UI
const server = Bun.serve({
  port: 3333,
  fetch(req) {
    const url = new URL(req.url);
    let filePath = join(rendererDir, url.pathname === "/" ? "index.html" : url.pathname);

    if (!existsSync(filePath)) {
      filePath = join(rendererDir, "index.html");
    }

    const ext = extname(filePath);
    const contentType = mimeTypes[ext] || "application/octet-stream";
    const fileContent = readFileSync(filePath);

    return new Response(fileContent, {
      headers: { "Content-Type": contentType }
    });
  }
});

console.log(`React 19 VidBee UI served at http://localhost:3333`);

const win = new Electrobun.BrowserWindow({
  title: "VidBee Desktop (Electrobun)",
  width: 1200,
  height: 800,
  url: "http://localhost:3333"
});

win.on("close", () => {
  process.exit(0);
});
