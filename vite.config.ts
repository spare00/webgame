import { defineConfig } from "vite";

export default defineConfig({
  build: {
    rollupOptions: {
      input: [
        "index.html",
        "block_breaker.html",
        "contra.html",
        "fortress.html",
        "galaga.html",
        "omok.html",
        "tetris.html",
        "tetris_2p.html",
      ],
    },
  },
});
