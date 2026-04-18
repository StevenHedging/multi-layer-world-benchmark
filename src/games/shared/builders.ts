import type {
  BenchmarkMetrics,
  EntityState,
  EpisodeInstance,
  GlobalHiddenState,
  PlayerState,
  PublicGameState,
  TopologyGraph,
  WorldState,
} from "../../types/core";
import { asEpisodeId, asGameClassId, asLevelFamilyId, asWorldId } from "../../utils/ids";

export const createWorld = (params: {
  id: string;
  label: string;
  tiles: string[];
  entities?: EntityState[];
  localFlags?: Record<string, boolean | number | string>;
}): WorldState => ({
  id: asWorldId(params.id),
  label: params.label,
  width: params.tiles[0].length,
  height: params.tiles.length,
  tiles: params.tiles.map((row) => row.split("")),
  entities: params.entities ?? [],
  localFlags: params.localFlags ?? {},
});

export const createEpisodeBase = (params: {
  episodeSeed: number;
  gameClassId: string;
  levelFamilyId: string;
  topology: TopologyGraph;
  hiddenFlags: Record<string, boolean | number | string>;
  worlds: WorldState[];
  startWorldId: string;
}): EpisodeInstance => {
  const episodeId = asEpisodeId(`${params.gameClassId}:${params.levelFamilyId}:${params.episodeSeed}`);
  const player: PlayerState = {
    worldId: asWorldId(params.startWorldId),
    position: { x: 1, y: 1 },
    inventory: [],
    energy: 0,
    hp: 3,
  };
  const publicState: PublicGameState = {
    episodeId,
    gameClassId: asGameClassId(params.gameClassId),
    levelFamilyId: asLevelFamilyId(params.levelFamilyId),
    turn: 0,
    currentWorldId: player.worldId,
    player: {
      inventory: [],
      energy: 0,
      hp: 3,
      status: {},
    },
    publicStats: {},
    hudHints: [],
  };
  const hiddenState: GlobalHiddenState = {
    topology: params.topology,
    hiddenFlags: params.hiddenFlags,
  };
  const metrics: BenchmarkMetrics = {
    episodeId,
    episodeSeed: params.episodeSeed,
    gameClassId: asGameClassId(params.gameClassId),
    levelFamilyId: asLevelFamilyId(params.levelFamilyId),
    totalSteps: 0,
    worldSwitches: 0,
    interactionCount: 0,
    firstKeyEventStep: null,
    success: false,
    successStep: null,
  };
  return {
    episodeId,
    episodeSeed: params.episodeSeed,
    gameClassId: asGameClassId(params.gameClassId),
    levelFamilyId: asLevelFamilyId(params.levelFamilyId),
    publicState,
    hiddenState,
    worlds: Object.fromEntries(params.worlds.map((world) => [world.id, world])),
    player,
    metrics,
    eventLog: [],
  };
};
