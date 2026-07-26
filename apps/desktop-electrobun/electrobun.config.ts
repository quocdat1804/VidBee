import { defineConfig } from "electrobun/config";

export default defineConfig({
  app: {
    name: "VidBee Electrobun",
    identifier: "com.vidbee.app.electrobun",
    version: "1.0.0"
  },
  browserViews: {
    main: {
      url: "http://localhost:5173"
    }
  }
});
