import type { EntityState, EpisodeInstance, Position, WorldState } from "../../types/core";
import { createSeededRng } from "../../utils/random";

export const ROOM_TEMPLATE = [
  "#########",
  "#.......#",
  "#.......#",
  "#.......#",
  "#.......#",
  "#########",
];

export const cloneRoomTiles = () => [...ROOM_TEMPLATE];

export const seededChoice = <T>(seed: number, items: T[]): T => {
  const rng = createSeededRng(seed);
  return items[Math.floor(rng() * items.length)];
};

export const seededPositions = (seed: number, options: Position[], count: number): Position[] => {
  const rng = createSeededRng(seed);
  const pool = [...options];
  const selected: Position[] = [];
  while (pool.length > 0 && selected.length < count) {
    const index = Math.floor(rng() * pool.length);
    selected.push(pool.splice(index, 1)[0]);
  }
  return selected;
};

export const findEntityAtPlayer = (episode: EpisodeInstance, predicate?: (entity: EntityState) => boolean) => {
  const world = episode.worlds[episode.player.worldId];
  return world.entities.find(
    (candidate) =>
      candidate.position.x === episode.player.position.x &&
      candidate.position.y === episode.player.position.y &&
      (predicate ? predicate(candidate) : true),
  );
};

export const setHudHints = (episode: EpisodeInstance, hints: string[]) => {
  episode.publicState.hudHints = hints;
};

export const setPublicStats = (episode: EpisodeInstance, stats: Record<string, boolean | number | string>) => {
  episode.publicState.publicStats = stats;
};

export const worldList = (episode: EpisodeInstance): WorldState[] => Object.values(episode.worlds);
