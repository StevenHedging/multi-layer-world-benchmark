import { EnvironmentKernel } from "../src/core/kernel";
import { createDefaultRegistry } from "../src/games";
import type { Action, EpisodeInstance } from "../src/types/core";

const registry = createDefaultRegistry();
const plugin = registry.get("propagation_escape");

const acceptedTheory: Action = {
  type: "submit_theory",
  hypothesizedRule:
    "After the anchor is aligned, router and lens settings arm hidden branches; each armed branch must be stabilized in its hidden world before an inverted pulse opens the vault.",
  evidence:
    "I observed that pulses were dormant before anchor alignment, that direct north and direct south pulses armed different branches, that each branch still required local hidden-world stabilization, and that an inverted pulse opened the vault only after both branches were stabilized.",
  confidence: 0.95,
};

const candidateActions: Action[] = [
  { type: "move_up" },
  { type: "move_down" },
  { type: "move_left" },
  { type: "move_right" },
  { type: "interact" },
  { type: "switch_world" },
  { type: "return_main" },
  acceptedTheory,
];

const cloneEpisode = (episode: EpisodeInstance): EpisodeInstance =>
  JSON.parse(JSON.stringify(episode)) as EpisodeInstance;

const summarizeEpisode = (episode: EpisodeInstance) => {
  const worlds = Object.fromEntries(
    Object.entries(episode.worlds).map(([worldId, world]) => [
      worldId,
      {
        localFlags: world.localFlags,
        entities: world.entities.map((entity) => ({
          kind: entity.kind,
          position: entity.position,
          publicState: entity.publicState,
          hiddenState: entity.hiddenState,
        })),
      },
    ]),
  );

  return JSON.stringify({
    player: episode.player,
    discovered: episode.publicState.discoveredWorldIds,
    hiddenFlags: episode.hiddenState.hiddenFlags,
    score: {
      ruleDiscoveryScore: episode.publicState.scoreBreakdown.ruleDiscoveryScore,
      evidenceScore: episode.publicState.scoreBreakdown.evidenceScore,
      mainTaskScore: episode.publicState.scoreBreakdown.mainTaskScore,
    },
    worlds,
  });
};

const stepEpisode = (episode: EpisodeInstance, action: Action) => {
  const dummy = plugin.instanceGenerator.generate(episode.episodeSeed, String(episode.levelFamilyId));
  const kernel = new EnvironmentKernel(plugin, dummy);
  (kernel as unknown as { episode: EpisodeInstance }).episode = cloneEpisode(episode);
  const result = kernel.step(action);
  return {
    result,
    episode: cloneEpisode(kernel.getEpisode()),
  };
};

const actionLabel = (action: Action) =>
  action.type === "submit_theory" ? "submit_theory(accepted_template)" : action.type;

const main = () => {
  const seed = 7;
  const family = "phase_router";
  const initialKernel = new EnvironmentKernel(plugin, plugin.instanceGenerator.generate(seed, family));
  const initialEpisode = cloneEpisode(initialKernel.getEpisode());

  const queue: Array<{ episode: EpisodeInstance; path: Action[] }> = [{ episode: initialEpisode, path: [] }];
  const visited = new Set<string>([summarizeEpisode(initialEpisode)]);
  let explored = 0;
  const maxDepth = 80;

  while (queue.length > 0) {
    const current = queue.shift()!;
    explored += 1;
    if (current.path.length >= maxDepth) {
      continue;
    }

    for (const action of candidateActions) {
      const next = stepEpisode(current.episode, action);
      const nextPath = [...current.path, action];
      if (next.result.done) {
        console.log(
          JSON.stringify(
            {
              seed,
              family,
              minSteps: nextPath.length,
              exploredStates: explored,
              path: nextPath.map((step, index) => ({
                step: index + 1,
                action: actionLabel(step),
              })),
              finalScore: next.result.observation.scoreBreakdown,
              oracleRequests: next.result.info.metrics.oracleRequests,
            },
            null,
            2,
          ),
        );
        return;
      }

      const key = summarizeEpisode(next.episode);
      if (visited.has(key)) {
        continue;
      }
      visited.add(key);
      queue.push({ episode: next.episode, path: nextPath });
    }
  }

  throw new Error(`No successful path found within depth ${maxDepth}.`);
};

main();
