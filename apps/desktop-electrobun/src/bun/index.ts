import Electrobun from "electrobun/bun";

console.log("VidBee Electrobun main process initialized successfully");

const win = new Electrobun.BrowserWindow({
  title: "VidBee Desktop (Electrobun)",
  width: 1200,
  height: 800,
  url: "about:blank"
});

win.on("close", () => {
  process.exit(0);
});
