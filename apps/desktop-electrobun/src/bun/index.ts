import Electrobun from "electrobun/bun";

console.log("VidBee Electrobun main process initialized");

const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>VidBee Electrobun</title>
    <style>
      body {
        margin: 0;
        font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
        background: #0f172a;
        color: #f8fafc;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        height: 100vh;
      }
      .card {
        background: #1e293b;
        padding: 2.5rem;
        border-radius: 1rem;
        box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5);
        text-align: center;
        border: 1px solid #334155;
        max-width: 480px;
      }
      h1 {
        margin-top: 0;
        color: #38bdf8;
        font-size: 2rem;
      }
      p {
        color: #94a3b8;
        line-height: 1.6;
      }
      .badge {
        display: inline-block;
        background: #0284c7;
        color: #fff;
        padding: 0.4rem 0.8rem;
        border-radius: 9999px;
        font-size: 0.875rem;
        font-weight: 600;
        margin-top: 1rem;
      }
    </style>
  </head>
  <body>
    <div class="card">
      <h1>🐝 VidBee Electrobun</h1>
      <p>Hệ thống đang chạy trên nền tảng <strong>Bun + Native WKWebView</strong> siêu nhẹ (~15MB RAM).</p>
      <div class="badge">Status: Connected</div>
    </div>
  </body>
</html>`;

const win = new Electrobun.BrowserWindow({
  title: "VidBee Electrobun",
  width: 1024,
  height: 720,
  html: html
});

win.on("close", () => {
  process.exit(0);
});
