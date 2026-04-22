import type { EntityState, EpisodeInstance, Position, ScoreBreakdown, TaskState, WorldId, WorldState } from "../../types/core";
import { normalizeScoreBreakdown } from "../../core/scoring";
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

export const discoverWorld = (episode: EpisodeInstance, worldId: string) => {
  const normalized = worldId as WorldId;
  if (!episode.publicState.discoveredWorldIds.includes(normalized)) {
    episode.publicState.discoveredWorldIds = [...episode.publicState.discoveredWorldIds, normalized];
    episode.metrics.hiddenWorldDiscoveries += 1;
  }
};

export const setMainTask = (episode: EpisodeInstance, task: Partial<TaskState>) => {
  episode.publicState.mainTask = {
    ...episode.publicState.mainTask,
    ...task,
  };
};

export const setHiddenTasks = (episode: EpisodeInstance, tasks: TaskState[]) => {
  episode.publicState.hiddenTasks = tasks;
};

export const setExplicitRules = (episode: EpisodeInstance, explicitRules: string[]) => {
  episode.publicState.explicitRules = explicitRules;
};

export const setImplicitRuleSignals = (episode: EpisodeInstance, implicitRuleSignals: string[]) => {
  episode.publicState.implicitRuleSignals = implicitRuleSignals;
};

export const setScoreBreakdown = (episode: EpisodeInstance, score: Partial<ScoreBreakdown>) => {
  const next = normalizeScoreBreakdown({
    ...episode.publicState.scoreBreakdown,
    ...score,
  });
  episode.publicState.scoreBreakdown = next;
};
