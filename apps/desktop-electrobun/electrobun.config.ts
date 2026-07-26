import { defineConfig } from "electrobun/config";

export default defineConfig({
  app: {
    name: "VidBee Electrobun",
    identifier: "com.vidbee.app.electrobun",
    version: "1.0.0"
  },
  browserViews: {
    main: {
      url: process.env.NODE_ENV === "development" ? "http://localhost:5173" : "views/main/index.html"
    }
  }
});
