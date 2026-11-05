import { defineConfig } from "vite";

// Relative asset URLs, so the build works when served from a sub-path
// such as GitHub Pages' https://<user>.github.io/dice/.
export default defineConfig({
  base: "./",
});
