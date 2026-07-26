import Electrobun from "electrobun/bun";

console.log("VidBee Electrobun main process initialized successfully");

const win = new Electrobun.BrowserWindow({
  title: "VidBee Desktop (Electrobun)",
  frame: {
    x: 0,
    y: 0,
    width: 1200,
    height: 800
  },
  titleBarStyle: "hiddenInset",
  url: "http://localhost:5173"
});

win.on("close", () => {
  process.exit(0);
});
