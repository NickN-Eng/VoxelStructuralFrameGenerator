import { defineConfig } from "vite";

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: "index.html",
        rcframe: "RCFrame.html",
        timberframe: "TimberFrame.html",
        concrete: "Concrete.html",
      },
    },
  },
});
