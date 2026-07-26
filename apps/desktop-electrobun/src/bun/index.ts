import Electrobun from "electrobun/bun";
import { join } from "path";

console.log("VidBee Electrobun main process initialized");

// Path to built React 19 VidBee UI bundle
const rendererDir = join(import.meta.dir, "../../../desktop/out/renderer");

// Start Bun local static file server for React 19 UI using Bun.file
const server = Bun.serve({
  port: 3333,
  async fetch(req) {
    const url = new URL(req.url);
    const relativePath = url.pathname === "/" ? "index.html" : url.pathname.replace(/^\//, "");
    const filePath = join(rendererDir, relativePath);
    
    const file = Bun.file(filePath);
    if (await file.exists()) {
      return new Response(file);
    }

    // Fallback for SPA routing
    return new Response(Bun.file(join(rendererDir, "index.html")));
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
