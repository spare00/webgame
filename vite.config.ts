import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  build: {
    rollupOptions: {
      input: [
        "index.html",
        "starfall.html",
        "block_breaker.html",
        "contra.html",
        "fortress.html",
        "galaga.html",
        "omok.html",
        "go.html",
        "tetris.html",
        "tetris_2p.html",
        "twin_cobra.html",
        "memory.html",
        "steak.html",
        "snake.html",
        "crystal_arena.html",
        "neon_duel.html",
        "neon_pong.html",
        "crystal_rescue.html",
        "sky_dash.html",
        "skyline_stack.html",
        "deep_sea.html",
        "minesweeper.html",
        "neon_2048.html",
        "lights_out.html",
      ],
    },
  },
});
