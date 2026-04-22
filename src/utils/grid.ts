import type { Position, WorldState } from "../types/core";

export const isWithinBounds = (world: WorldState, position: Position): boolean =>
  position.x >= 0 &&
  position.y >= 0 &&
  position.x < world.width &&
  position.y < world.height;

export const getTile = (world: WorldState, position: Position): string =>
  world.tiles[position.y]?.[position.x] ?? "#";

export const isWalkableTile = (tile: string): boolean => tile !== "#";

export const positionsEqual = (a: Position, b: Position): boolean => a.x === b.x && a.y === b.y;
