import Electrobun from "electrobun/bun";

console.log("VidBee Electrobun main process initialized");

const win = new Electrobun.BrowserWindow({
  title: "VidBee Electrobun",
  width: 1024,
  height: 720,
  url: "http://localhost:5173"
});

win.on("close", () => {
  process.exit(0);
});
