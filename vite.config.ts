import { defineConfig } from "vite";

// Relative asset URLs, so the build works from any path. The site is
// served at the root of https://3d20.app, where this is harmless.
export default defineConfig({
  base: "./",
});
