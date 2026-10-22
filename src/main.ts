import Phaser from "phaser";
import { ContraScene } from "./scenes/ContraScene";

new Phaser.Game({
  type: Phaser.AUTO,
  parent: "game",
  width: 800,
  height: 400,
  backgroundColor: "#111111",
  pixelArt: true,
  physics: {
    default: "arcade",
    arcade: { gravity: { x: 0, y: 700 } },
  },
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  scene: [ContraScene],
});
