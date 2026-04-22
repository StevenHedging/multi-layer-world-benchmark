import type { EpisodeInstance, Observation, WorldState } from "../../types/core";
import type { ActionType } from "../../types/core";
import type { GameClassPlugin } from "../../types/plugin";

const defaultActions: ActionType[] = [
  "move_up",
  "move_down",
  "move_left",
  "move_right",
  "interact",
  "switch_world",
  "return_main",
  "submit_theory",
  "request_oracle",
  "wait",
];

export const buildObservation = (episode: EpisodeInstance, plugin: GameClassPlugin, world: WorldState): Observation => ({
  episodeId: episode.episodeId,
  gameClassId: episode.gameClassId,
  levelFamilyId: episode.levelFamilyId,
  worldId: world.id,
  worldRole: world.id === episode.publicState.mainWorldId ? "main" : "hidden",
  turn: episode.metrics.totalSteps,
  grid: world.tiles.map((row) => [...row]),
  visibleEntities: plugin.getVisibleEntities(world),
  playerPosition: { ...episode.player.position },
  player: {
    inventory: [...episode.player.inventory],
    energy: episode.player.energy,
    hp: episode.player.hp,
    status: { ...episode.publicState.player.status },
  },
  publicStats: { ...episode.publicState.publicStats },
  hudHints: [...episode.publicState.hudHints],
  explicitRules: [...episode.publicState.explicitRules],
  implicitRuleSignals: [...episode.publicState.implicitRuleSignals],
  mainTask: { ...episode.publicState.mainTask },
  hiddenTasks: episode.publicState.hiddenTasks.map((task) => ({ ...task })),
  discoveredWorlds: [...episode.publicState.discoveredWorldIds],
  scoreBreakdown: { ...episode.publicState.scoreBreakdown },
  lastSubmissionFeedback: episode.publicState.lastSubmissionFeedback,
  recentEvents: [...episode.eventLog].slice(-4),
  actionMask: {
    allowed: defaultActions,
  },
});
