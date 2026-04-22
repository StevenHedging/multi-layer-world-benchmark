import type {
  BenchmarkMetrics,
  EntityState,
  EpisodeInstance,
  GlobalHiddenState,
  PlayerState,
  PublicGameState,
  ScoreBreakdown,
  TaskState,
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
  explicitRules?: string[];
  mainTask?: Partial<TaskState>;
}): EpisodeInstance => {
  const episodeId = asEpisodeId(`${params.gameClassId}:${params.levelFamilyId}:${params.episodeSeed}`);
  const player: PlayerState = {
    worldId: asWorldId(params.startWorldId),
    position: { x: 1, y: 1 },
    inventory: [],
    energy: 0,
    hp: 3,
  };
  const defaultMainTask: TaskState = {
    id: "main-task",
    title: "Advance the main world objective",
    description: "Use hidden-world evidence to complete the benchmark objective.",
    worldId: player.worldId,
    completed: false,
    discovered: true,
  };
  const defaultScore: ScoreBreakdown = {
    mainTaskScore: 0,
    hiddenTaskScore: 0,
    ruleDiscoveryScore: 0,
    evidenceScore: 0,
    efficiencyScore: 1,
    totalScore: 1,
  };
  const publicState: PublicGameState = {
    episodeId,
    gameClassId: asGameClassId(params.gameClassId),
    levelFamilyId: asLevelFamilyId(params.levelFamilyId),
    turn: 0,
    currentWorldId: player.worldId,
    mainWorldId: player.worldId,
    discoveredWorldIds: [player.worldId],
    player: {
      inventory: [],
      energy: 0,
      hp: 3,
      status: {},
    },
    publicStats: {},
    hudHints: [],
    explicitRules: params.explicitRules ?? [
      "A main-world objective anchors the episode.",
      "Hidden worlds must be discovered before possession can target them.",
      "You may submit a rule theory with evidence at any time.",
    ],
    implicitRuleSignals: [],
    mainTask: {
      ...defaultMainTask,
      ...params.mainTask,
    },
    hiddenTasks: [],
    scoreBreakdown: defaultScore,
    lastSubmissionFeedback: "No theory submitted yet.",
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
    possessions: 0,
    interactionCount: 0,
    theorySubmissions: 0,
    oracleRequests: 0,
    hiddenWorldDiscoveries: 0,
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
