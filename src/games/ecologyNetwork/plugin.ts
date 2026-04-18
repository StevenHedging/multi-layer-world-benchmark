import type { EntityState, PublicActionSchema, TopologyGraph, WorldState } from "../../types/core";
import type { GameClassPlugin, PropagationEvent } from "../../types/plugin";
import { createEpisodeBase, createWorld } from "../shared/builders";
import { cloneRoomTiles, findEntityAtPlayer, seededPositions, setHudHints, setPublicStats } from "../shared/helpers";
import { buildObservation } from "../shared/observation";
import { asEntityId, asNodeId, asWorldId } from "../../utils/ids";

const actionSchema: PublicActionSchema = {
  actions: [
    { type: "move_up", description: "Move north" },
    { type: "move_down", description: "Move south" },
    { type: "move_left", description: "Move west" },
    { type: "move_right", description: "Move east" },
    { type: "interact", description: "Plant seeds, activate purifiers, or inspect ecological nodes" },
    { type: "switch_world", description: "Cycle to the next world" },
    { type: "wait", description: "Pause for one step" },
  ],
};

const pollutionSource = (id: string, worldId: string, x: number, y: number, amount: number): EntityState => ({
  id: asEntityId(id),
  kind: "pollution_source",
  worldId: asWorldId(worldId),
  position: { x, y },
  tags: ["interactive", "ecology"],
  publicState: { active: false, amount },
  hiddenState: { active: false, amount },
});

const purifier = (id: string, worldId: string, x: number, y: number): EntityState => ({
  id: asEntityId(id),
  kind: "purifier",
  worldId: asWorldId(worldId),
  position: { x, y },
  tags: ["interactive", "ecology"],
  publicState: { active: false },
  hiddenState: { active: false },
});

const seedPod = (id: string, worldId: string, x: number, y: number): EntityState => ({
  id: asEntityId(id),
  kind: "seed_pod",
  worldId: asWorldId(worldId),
  position: { x, y },
  tags: ["interactive", "ecology"],
  publicState: { collected: false },
  hiddenState: { collected: false },
});

const waterPool = (id: string, worldId: string, x: number, y: number): EntityState => ({
  id: asEntityId(id),
  kind: "water_pool",
  worldId: asWorldId(worldId),
  position: { x, y },
  tags: ["interactive", "ecology"],
  publicState: { fertile: false },
  hiddenState: { fertile: false },
});

const lifeTree = (id: string, worldId: string, x: number, y: number): EntityState => ({
  id: asEntityId(id),
  kind: "life_tree",
  worldId: asWorldId(worldId),
  position: { x, y },
  tags: ["status"],
  publicState: { growth: 0 },
  hiddenState: { growth: 0 },
});

const ecoCells = [
  { x: 3, y: 2 },
  { x: 4, y: 2 },
  { x: 5, y: 2 },
  { x: 4, y: 3 },
];

const syncEcologyState = (episode: ReturnType<typeof createPurifyChain>) => {
  setPublicStats(episode, {
    carriedSeeds: episode.player.inventory.filter((item) => item === "seed").length,
    localPollution: Number(episode.worlds[episode.player.worldId].localFlags.pollution ?? 0),
    localGrowth: Number(episode.worlds[episode.player.worldId].localFlags.growth ?? 0),
  });
  setHudHints(episode, [
    "Purification and pollution both travel through hidden links.",
    "A healthy ecosystem requires both low pollution and sufficient growth.",
  ]);
};

const createPurifyChain = (seed: number) => {
  const [purifierPos, sourcePos, treePos] = seededPositions(seed + 91, ecoCells, 3);
  const episode = createEpisodeBase({
    episodeSeed: seed,
    gameClassId: "ecology_network",
    levelFamilyId: "purify_chain",
    topology: {
      nodes: [asNodeId("w1"), asNodeId("w2"), asNodeId("w3")],
      edges: [
        { from: asNodeId("w1"), to: asNodeId("w2"), channel: "purify", weight: 1 },
        { from: asNodeId("w2"), to: asNodeId("w3"), channel: "purify", weight: 1 },
      ],
    } as TopologyGraph,
    hiddenFlags: { worldsPurified: 0, treeGrown: false, objectiveMet: false },
    worlds: [
      createWorld({
        id: "w1",
        label: "Upstream Spring",
        tiles: cloneRoomTiles(),
        entities: [purifier("purifier-a", "w1", purifierPos.x, purifierPos.y)],
        localFlags: { pollution: 2, growth: 0 },
      }),
      createWorld({
        id: "w2",
        label: "Silt Wetland",
        tiles: cloneRoomTiles(),
        entities: [waterPool("pool-b", "w2", 4, 2)],
        localFlags: { pollution: 2, growth: 0 },
      }),
      createWorld({
        id: "w3",
        label: "Life Grove",
        tiles: cloneRoomTiles(),
        entities: [lifeTree("tree-c", "w3", treePos.x, treePos.y), pollutionSource("smog-c", "w3", sourcePos.x, sourcePos.y, 1)],
        localFlags: { pollution: 2, growth: 0 },
      }),
    ],
    startWorldId: "w1",
  });
  syncEcologyState(episode);
  return episode;
};

const createPollutionVsGrowth = (seed: number) => {
  const [sourcePos, seedPos, treePos] = seededPositions(seed + 113, ecoCells, 3);
  const episode = createEpisodeBase({
    episodeSeed: seed,
    gameClassId: "ecology_network",
    levelFamilyId: "pollution_vs_growth",
    topology: {
      nodes: [asNodeId("w1"), asNodeId("w2"), asNodeId("w3"), asNodeId("w4")],
      edges: [
        { from: asNodeId("w1"), to: asNodeId("w4"), channel: "pollute", weight: 1 },
        { from: asNodeId("w2"), to: asNodeId("w4"), channel: "purify", weight: 1 },
        { from: asNodeId("w3"), to: asNodeId("w4"), channel: "grow", weight: 1 },
      ],
    } as TopologyGraph,
    hiddenFlags: { objectiveMet: false, treeGrown: false },
    worlds: [
      createWorld({
        id: "w1",
        label: "Smog Source",
        tiles: cloneRoomTiles(),
        entities: [pollutionSource("smog-a", "w1", sourcePos.x, sourcePos.y, 2)],
        localFlags: { pollution: 1, growth: 0 },
      }),
      createWorld({
        id: "w2",
        label: "Purifier Bank",
        tiles: cloneRoomTiles(),
        entities: [purifier("purifier-b", "w2", 4, 2)],
        localFlags: { pollution: 1, growth: 0 },
      }),
      createWorld({
        id: "w3",
        label: "Seed Nursery",
        tiles: cloneRoomTiles(),
        entities: [seedPod("seed-c", "w3", seedPos.x, seedPos.y), waterPool("pool-c", "w3", 4, 3)],
        localFlags: { pollution: 0, growth: 0 },
      }),
      createWorld({
        id: "w4",
        label: "Heart Canopy",
        tiles: cloneRoomTiles(),
        entities: [lifeTree("tree-d", "w4", treePos.x, treePos.y), waterPool("pool-d", "w4", 6, 3)],
        localFlags: { pollution: 2, growth: 0 },
      }),
    ],
    startWorldId: "w1",
  });
  syncEcologyState(episode);
  return episode;
};

const updateEcologyWin = (episode: ReturnType<typeof createPurifyChain>) => {
  const targetWorld = episode.levelFamilyId === "purify_chain" ? episode.worlds.w3 : episode.worlds.w4;
  const pollution = Number(targetWorld.localFlags.pollution ?? 0);
  const growth = Number(targetWorld.localFlags.growth ?? 0);
  if (pollution <= 0 && growth >= 2) {
    episode.hiddenState.hiddenFlags.treeGrown = true;
    episode.hiddenState.hiddenFlags.objectiveMet = true;
  }
  const tree = targetWorld.entities.find((entity) => entity.kind === "life_tree");
  if (tree) {
    tree.publicState.growth = growth;
    tree.hiddenState.growth = growth;
  }
  syncEcologyState(episode);
};

const propagateEcology = (episode: ReturnType<typeof createPurifyChain>, event: PropagationEvent, events: { turn: number; text: string; tone?: "neutral" | "good" | "warn" }[]) => {
  const edges = episode.hiddenState.topology.edges.filter(
    (edge) => edge.channel === event.channel && String(edge.from) === event.sourceWorldId,
  );
  for (const edge of edges) {
    const world = episode.worlds[String(edge.to)];
    if (!world) {
      continue;
    }
    if (event.channel === "pollute") {
      world.localFlags.pollution = Number(world.localFlags.pollution ?? 0) + Number(edge.weight ?? 1);
      events.push({ turn: episode.metrics.totalSteps + 1, text: `${world.label} darkens under remote pollution.`, tone: "warn" });
    }
    if (event.channel === "purify") {
      world.localFlags.pollution = Math.max(0, Number(world.localFlags.pollution ?? 0) - Number(edge.weight ?? 1));
      events.push({ turn: episode.metrics.totalSteps + 1, text: `${world.label} clears as distant waters steady.`, tone: "good" });
    }
    if (event.channel === "grow") {
      world.localFlags.growth = Number(world.localFlags.growth ?? 0) + Number(edge.weight ?? 1);
      events.push({ turn: episode.metrics.totalSteps + 1, text: `${world.label} shows signs of new growth.`, tone: "good" });
    }
  }
  updateEcologyWin(episode);
};

export const ecologyNetworkPlugin: GameClassPlugin = {
  id: "ecology_network",
  title: "Ecology Network",
  description: "Balance purification, pollution, and growth across hidden ecological links.",
  publicActionSchema: actionSchema,
  vocabulary: {
    entityKinds: ["pollution_source", "purifier", "seed_pod", "water_pool", "life_tree"],
    tileKinds: [".", "#"],
  },
  levelFamilies: [
    { id: "purify_chain", title: "Purify Chain", description: "Upstream purification must ripple far enough for a distant life grove to recover." },
    { id: "pollution_vs_growth", title: "Pollution vs Growth", description: "Competing positive and negative propagation decide whether the heart canopy survives." },
  ],
  instanceGenerator: {
    generate: (seed, familyId) => (familyId === "pollution_vs_growth" ? createPollutionVsGrowth(seed) : createPurifyChain(seed)),
  },
  interactionRules: [
    {
      id: "interact-ecology-network",
      apply: ({ episode, emit, markKeyEvent, queuePropagation }) => {
        const entity = findEntityAtPlayer(episode, (candidate) => candidate.tags.includes("ecology"));
        if (!entity) {
          emit({ turn: episode.metrics.totalSteps + 1, text: "Only still air answers here." });
          return;
        }

        if (entity.kind === "pollution_source") {
          entity.publicState.active = true;
          entity.hiddenState.active = true;
          queuePropagation({ channel: "pollute", payload: { amount: entity.hiddenState.amount }, sourceWorldId: String(episode.player.worldId) });
          markKeyEvent();
          updateEcologyWin(episode as ReturnType<typeof createPurifyChain>);
          emit({ turn: episode.metrics.totalSteps + 1, text: "A contamination pulse spreads into unseen habitats.", tone: "warn" });
          return;
        }

        if (entity.kind === "purifier") {
          entity.publicState.active = true;
          entity.hiddenState.active = true;
          queuePropagation({ channel: "purify", payload: { amount: 1 }, sourceWorldId: String(episode.player.worldId) });
          markKeyEvent();
          updateEcologyWin(episode as ReturnType<typeof createPurifyChain>);
          emit({ turn: episode.metrics.totalSteps + 1, text: "Clean water pressure rises through the network.", tone: "good" });
          return;
        }

        if (entity.kind === "seed_pod" && entity.hiddenState.collected !== true) {
          entity.hiddenState.collected = true;
          entity.publicState.collected = true;
          episode.player.inventory.push("seed");
          markKeyEvent();
          syncEcologyState(episode as ReturnType<typeof createPurifyChain>);
          emit({ turn: episode.metrics.totalSteps + 1, text: "You collect a dormant seed pod.", tone: "good" });
          return;
        }

        if (entity.kind === "water_pool") {
          if (episode.player.inventory.includes("seed")) {
            const seedIndex = episode.player.inventory.indexOf("seed");
            episode.player.inventory.splice(seedIndex, 1);
            entity.publicState.fertile = true;
            entity.hiddenState.fertile = true;
            queuePropagation({ channel: "grow", payload: { amount: 2 }, sourceWorldId: String(episode.player.worldId) });
            markKeyEvent();
            updateEcologyWin(episode as ReturnType<typeof createPurifyChain>);
            emit({ turn: episode.metrics.totalSteps + 1, text: "The water pool nourishes a hidden chain of growth.", tone: "good" });
            return;
          }
        }

        emit({ turn: episode.metrics.totalSteps + 1, text: "This ecosystem node is not ready yet.", tone: "warn" });
      },
    },
  ],
  propagationRules: [
    {
      id: "propagate-ecology-state",
      propagate: (episode, event, events) => propagateEcology(episode as ReturnType<typeof createPurifyChain>, event, events),
    },
  ],
  winCondition: {
    evaluate: (episode) => ({
      done: episode.hiddenState.hiddenFlags.objectiveMet === true,
      reward: episode.hiddenState.hiddenFlags.objectiveMet === true ? 1 : 0,
      event:
        episode.hiddenState.hiddenFlags.objectiveMet === true
          ? { turn: episode.metrics.totalSteps, text: "Ecology network stabilized.", tone: "good" }
          : undefined,
    }),
  },
  observationAdapter: {
    toObservation: (episode) => buildObservation(episode, ecologyNetworkPlugin, episode.worlds[episode.player.worldId]),
  },
  rendererSkin: {
    palette: {
      background: "#0f1711",
      panel: "#18271a",
      accent: "#86efac",
      gridLine: "rgba(255,255,255,0.06)",
      tileFloor: "#294032",
      tileWall: "#08120b",
      player: "#fde68a",
      glow: "rgba(134,239,172,0.26)",
    },
    entityAppearance: {
      pollution_source: { fill: "#ef4444", stroke: "#fecaca", shape: "hex", label: "P" },
      purifier: { fill: "#38bdf8", stroke: "#bae6fd", shape: "square", label: "U" },
      seed_pod: { fill: "#fbbf24", stroke: "#fef3c7", shape: "diamond", label: "S" },
      water_pool: { fill: "#60a5fa", stroke: "#dbeafe", shape: "circle", label: "W" },
      life_tree: { fill: "#4ade80", stroke: "#dcfce7", shape: "hex", label: "T" },
    },
    tileAppearance: {
      ".": { fill: "#294032", stroke: "rgba(255,255,255,0.04)" },
      "#": { fill: "#08120b", stroke: "rgba(255,255,255,0.02)" },
    },
  },
  getVisibleEntities: (world: WorldState) =>
    world.entities.map((entity) => ({
      entityId: entity.id,
      kind: entity.kind,
      position: entity.position,
      state: entity.publicState,
    })),
  getPlayerSpawn: () => ({ x: 1, y: 1 }),
  getPublicPlayerStatus: (episode) => ({
    seeds: episode.player.inventory.filter((item) => item === "seed").length,
  }),
};
