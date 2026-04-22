import type { Observation } from "../types/core";
import type { RendererSkin } from "../types/plugin";

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const drawShape = (
  context: CanvasRenderingContext2D,
  shape: "square" | "circle" | "diamond" | "hex",
  x: number,
  y: number,
  size: number,
) => {
  const half = size / 2;
  context.beginPath();
  if (shape === "circle") {
    context.arc(x, y, half, 0, Math.PI * 2);
  } else if (shape === "diamond") {
    context.moveTo(x, y - half);
    context.lineTo(x + half, y);
    context.lineTo(x, y + half);
    context.lineTo(x - half, y);
    context.closePath();
  } else if (shape === "hex") {
    for (let index = 0; index < 6; index += 1) {
      const angle = (Math.PI / 3) * index - Math.PI / 6;
      const px = x + Math.cos(angle) * half;
      const py = y + Math.sin(angle) * half;
      if (index === 0) {
        context.moveTo(px, py);
      } else {
        context.lineTo(px, py);
      }
    }
    context.closePath();
  } else {
    context.rect(x - half, y - half, size, size);
  }
};

const drawRoundedRect = (
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) => {
  const r = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.moveTo(x + r, y);
  context.arcTo(x + width, y, x + width, y + height, r);
  context.arcTo(x + width, y + height, x, y + height, r);
  context.arcTo(x, y + height, x, y, r);
  context.arcTo(x, y, x + width, y, r);
  context.closePath();
};

export const renderObservation = (
  canvas: HTMLCanvasElement,
  observation: Observation,
  skin: RendererSkin,
  transitionAlpha: number,
) => {
  const context = canvas.getContext("2d");
  if (!context) {
    return;
  }
  const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
  const width = canvas.clientWidth || canvas.width / dpr;
  const height = canvas.clientHeight || canvas.height / dpr;
  const rows = observation.grid.length;
  const cols = observation.grid[0]?.length ?? 1;
  const padding = Math.max(28, Math.min(width, height) * 0.06);
  const boardWidth = width - padding * 2;
  const boardHeight = height - padding * 2;
  const cell = Math.floor(Math.min(boardWidth / cols, boardHeight / rows));
  const offsetX = Math.floor((width - cols * cell) / 2);
  const offsetY = Math.floor((height - rows * cell) / 2);
  const boardPixelWidth = cols * cell;
  const boardPixelHeight = rows * cell;

  context.clearRect(0, 0, width, height);
  const backgroundGradient = context.createLinearGradient(0, 0, width, height);
  backgroundGradient.addColorStop(0, skin.palette.background);
  backgroundGradient.addColorStop(0.6, skin.palette.panel);
  backgroundGradient.addColorStop(1, "#071017");
  context.fillStyle = backgroundGradient;
  context.fillRect(0, 0, width, height);

  context.save();
  context.globalAlpha = 0.22;
  for (let index = 0; index < 14; index += 1) {
    const sweep = ((index + 1) / 14) * width;
    context.strokeStyle = skin.palette.gridLine;
    context.lineWidth = 1;
    context.beginPath();
    context.moveTo(sweep, 0);
    context.lineTo(sweep - height * 0.25, height);
    context.stroke();
  }
  context.restore();

  context.save();
  drawRoundedRect(context, offsetX - 16, offsetY - 16, boardPixelWidth + 32, boardPixelHeight + 32, 28);
  const boardGradient = context.createLinearGradient(offsetX, offsetY, offsetX, offsetY + boardPixelHeight);
  boardGradient.addColorStop(0, "rgba(255,255,255,0.04)");
  boardGradient.addColorStop(1, "rgba(0,0,0,0.18)");
  context.fillStyle = boardGradient;
  context.fill();
  context.strokeStyle = "rgba(255,255,255,0.08)";
  context.lineWidth = 2;
  context.stroke();
  context.restore();

  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < cols; x += 1) {
      const tile = observation.grid[y][x];
      const appearance = skin.tileAppearance[tile];
      const px = offsetX + x * cell;
      const py = offsetY + y * cell;
      drawRoundedRect(context, px + 1, py + 1, cell - 2, cell - 2, Math.max(6, cell * 0.14));
      const tileGradient = context.createLinearGradient(px, py, px, py + cell);
      tileGradient.addColorStop(0, appearance?.fill ?? skin.palette.tileFloor);
      tileGradient.addColorStop(1, tile === "#" ? "rgba(0,0,0,0.3)" : "rgba(255,255,255,0.02)");
      context.fillStyle = tileGradient;
      context.fill();
      context.strokeStyle = appearance?.stroke ?? skin.palette.gridLine;
      context.lineWidth = 1;
      context.stroke();

      if (tile !== "#") {
        context.save();
        context.strokeStyle = "rgba(255,255,255,0.03)";
        context.beginPath();
        context.moveTo(px + cell * 0.18, py + cell * 0.28);
        context.lineTo(px + cell * 0.82, py + cell * 0.28);
        context.stroke();
        context.restore();
      }
    }
  }

  for (const entity of observation.visibleEntities) {
    const appearance = skin.entityAppearance[entity.kind];
    if (!appearance) {
      continue;
    }
    const cx = offsetX + entity.position.x * cell + cell / 2;
    const cy = offsetY + entity.position.y * cell + cell / 2;
    const active = Object.values(entity.state).some((value) => value === true || (typeof value === "number" && value > 0));

    context.save();
    context.shadowColor = active ? skin.palette.glow : "rgba(0,0,0,0.28)";
    context.shadowBlur = active ? 18 : 10;
    context.fillStyle = appearance.fill;
    context.strokeStyle = appearance.stroke;
    context.lineWidth = 2;
    drawShape(context, appearance.shape, cx, cy, cell * 0.5);
    context.fill();
    context.stroke();
    if (appearance.label) {
      context.fillStyle = "#f8fbff";
      context.font = `600 ${Math.floor(cell * 0.22)}px "Segoe UI", sans-serif`;
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.fillText(appearance.label, cx, cy + 1);
    }
    context.restore();

    if (active) {
      context.save();
      context.fillStyle = appearance.stroke;
      context.beginPath();
      context.arc(cx + cell * 0.22, cy - cell * 0.22, Math.max(3, cell * 0.07), 0, Math.PI * 2);
      context.fill();
      context.restore();
    }
  }

  const playerX = offsetX + observation.playerPosition.x * cell + cell / 2;
  const playerY = offsetY + observation.playerPosition.y * cell + cell / 2;
  context.save();
  context.shadowColor = skin.palette.glow;
  context.shadowBlur = 24;
  context.beginPath();
  context.arc(playerX, playerY, cell * 0.3, 0, Math.PI * 2);
  context.fillStyle = skin.palette.player;
  context.fill();
  context.lineWidth = 2;
  context.strokeStyle = "rgba(255,255,255,0.75)";
  context.stroke();
  context.beginPath();
  context.moveTo(playerX, playerY - cell * 0.18);
  context.lineTo(playerX + cell * 0.12, playerY + cell * 0.08);
  context.lineTo(playerX - cell * 0.12, playerY + cell * 0.08);
  context.closePath();
  context.fillStyle = "rgba(12,18,24,0.9)";
  context.fill();
  context.restore();

  context.save();
  context.globalAlpha = 0.9;
  context.fillStyle = "rgba(7, 16, 23, 0.62)";
  drawRoundedRect(context, offsetX - 8, offsetY + boardPixelHeight + 10, clamp(boardPixelWidth * 0.52, 160, 280), 28, 14);
  context.fill();
  context.fillStyle = "rgba(255,255,255,0.88)";
  context.font = `600 ${Math.max(12, Math.floor(cell * 0.22))}px "Segoe UI", sans-serif`;
  context.textAlign = "left";
  context.textBaseline = "middle";
  context.fillText(`World ${String(observation.worldId)}   Turn ${observation.turn}`, offsetX + 10, offsetY + boardPixelHeight + 24);
  context.restore();

  const vignette = context.createRadialGradient(width / 2, height / 2, Math.min(width, height) * 0.25, width / 2, height / 2, Math.max(width, height) * 0.7);
  vignette.addColorStop(0, "rgba(0,0,0,0)");
  vignette.addColorStop(1, "rgba(0,0,0,0.32)");
  context.fillStyle = vignette;
  context.fillRect(0, 0, width, height);

  if (transitionAlpha > 0) {
    context.fillStyle = `rgba(255,255,255,${transitionAlpha * 0.1})`;
    context.fillRect(0, 0, width, height);
    context.strokeStyle = `rgba(142,202,230,${transitionAlpha * 0.45})`;
    context.lineWidth = 4;
    context.strokeRect(10, 10, width - 20, height - 20);
  }
};
