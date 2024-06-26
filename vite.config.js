import { defineConfig } from "vite";

export default defineConfig({
  base: "./", // This sets the base path to the current directory for all assets
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
