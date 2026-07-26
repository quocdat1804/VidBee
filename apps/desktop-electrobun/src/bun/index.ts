import Electrobun from "electrobun/bun";
import { join } from "path";

console.log("VidBee Electrobun main process initialized");

// Path to built React 19 VidBee UI bundle
const rendererDir = join(import.meta.dir, "../../../desktop/out/renderer");

const polyfillScript = `<script>
  window.electron = window.electron || {
    ipcRenderer: {
      on: () => {},
      once: () => {},
      removeListener: () => {},
      removeAllListeners: () => {},
      send: () => {},
      invoke: async (channel) => {
        console.log('[Electrobun Bridge] invoke:', channel);
        if (channel === 'get-app-version') return '1.3.13-electrobun';
        if (channel === 'get-settings') return { theme: 'dark', language: 'en' };
        if (channel === 'get-download-history') return [];
        if (channel === 'get-subscriptions') return [];
        return null;
      }
    },
    process: { platform: 'darwin' }
  };
  window.api = window.api || window.electron.ipcRenderer;
</script>`;

// Start Bun local static file server for React 19 UI
const server = Bun.serve({
  port: 3333,
  async fetch(req) {
    const url = new URL(req.url);
    const relativePath = url.pathname === "/" ? "index.html" : url.pathname.replace(/^\//, "");
    const filePath = join(rendererDir, relativePath);
    
    const file = Bun.file(filePath);
    if (await file.exists()) {
      if (relativePath === "index.html") {
        let htmlText = await file.text();
        htmlText = htmlText.replace("</head>", `${polyfillScript}</head>`);
        return new Response(htmlText, { headers: { "Content-Type": "text/html" } });
      }
      return new Response(file);
    }

    // Fallback for SPA routing with polyfill injected
    const indexFile = Bun.file(join(rendererDir, "index.html"));
    let htmlText = await indexFile.text();
    htmlText = htmlText.replace("</head>", `${polyfillScript}</head>`);
    return new Response(htmlText, { headers: { "Content-Type": "text/html" } });
  }
});

console.log(`React 19 VidBee UI served at http://localhost:3333 with Electrobun Bridge`);

const win = new Electrobun.BrowserWindow({
  title: "VidBee Desktop (Electrobun)",
  width: 1200,
  height: 800,
  url: "http://localhost:3333"
});

win.on("close", () => {
  process.exit(0);
});
