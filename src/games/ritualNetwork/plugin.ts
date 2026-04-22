import type { EntityState, PublicActionSchema, TopologyGraph, WorldState } from "../../types/core";
import type { GameClassPlugin, PropagationEvent } from "../../types/plugin";
import { createEpisodeBase, createWorld } from "../shared/builders";
import {
  cloneRoomTiles,
  discoverWorld,
  findEntityAtPlayer,
  seededPositions,
  setExplicitRules,
  setHiddenTasks,
  setHudHints,
  setMainTask,
  setPublicStats,
  setScoreBreakdown,
} from "../shared/helpers";
import { buildObservation } from "../shared/observation";
import { asEntityId, asNodeId, asWorldId } from "../../utils/ids";

const actionSchema: PublicActionSchema = {
  actions: [
    { type: "move_up", description: "Move north" },
    { type: "move_down", description: "Move south" },
    { type: "move_left", description: "Move west" },
    { type: "move_right", description: "Move east" },
    { type: "interact", description: "Ignite braziers, awaken runes, or consecrate altars" },
    { type: "switch_world", description: "Cycle to the next world" },
    { type: "wait", description: "Pause for one step" },
  ],
};

const altar = (id: string, worldId: string, x: number, y: number): EntityState => ({
  id: asEntityId(id),
  kind: "altar",
  worldId: asWorldId(worldId),
  position: { x, y },
  tags: ["interactive", "ritual"],
  publicState: { consecrated: false },
  hiddenState: { consecrated: false },
});

const runeStone = (id: string, worldId: string, x: number, y: number): EntityState => ({
  id: asEntityId(id),
  kind: "rune_stone",
  worldId: asWorldId(worldId),
  position: { x, y },
  tags: ["interactive", "ritual"],
  publicState: { awakened: false },
  hiddenState: { awakened: false },
});

const brazier = (id: string, worldId: string, x: number, y: number): EntityState => ({
  id: asEntityId(id),
  kind: "brazier",
  worldId: asWorldId(worldId),
  position: { x, y },
  tags: ["interactive", "ritual"],
  publicState: { lit: false },
  hiddenState: { lit: false },
});

const sealNode = (id: string, worldId: string, x: number, y: number): EntityState => ({
  id: asEntityId(id),
  kind: "seal_node",
  worldId: asWorldId(worldId),
  position: { x, y },
  tags: ["interactive", "ritual"],
  publicState: { manifest: false },
  hiddenState: { manifest: false },
});

const ritualCells = [
  { x: 3, y: 2 },
  { x: 4, y: 2 },
  { x: 5, y: 2 },
  { x: 3, y: 3 },
];

const syncRitualState = (episode: ReturnType<typeof createAltarChainEpisode>) => {
  const completed = Number(episode.hiddenState.hiddenFlags.completedStages ?? 0);
  setPublicStats(episode, {
    ritualStages: completed,
    localAttunement: Number(episode.worlds[episode.player.worldId].localFlags.attunement ?? 0),
  });
  setHudHints(episode, [
    "Ritual elements respond to hidden cross-world attunement.",
    "Some altars awaken only after distant braziers and runes align.",
  ]);
  if (Number(episode.worlds.w2?.localFlags.attunement ?? 0) > 0) discoverWorld(episode, "w2");
  if (Number(episode.worlds.w3?.localFlags.attunement ?? 0) > 0) discoverWorld(episode, "w3");
  if (Number(episode.worlds.w4?.localFlags.attunement ?? 0) > 0) discoverWorld(episode, "w4");
  setExplicitRules(episode, [
    "A main-world ritual objective anchors the episode.",
    "Discovered hidden ritual chambers can be possessed.",
    "Ritual echoes travel through hidden topology and alter remote attunement.",
    "You may submit a theory about the hidden ritual dependency with evidence.",
  ]);
  setMainTask(episode, {
    title: "Complete the hidden ritual network",
    description:
      episode.levelFamilyId === "dual_ritual_merge"
        ? "Merge separated rites and complete the final sanctum."
        : "Advance a chained rite until the silent altar completes.",
    completed: episode.hiddenState.hiddenFlags.ritualComplete === true,
  });
  const hiddenTasks =
    episode.levelFamilyId === "dual_ritual_merge"
      ? [
          {
            id: "sun-rite",
            title: "Ignite the sun rite",
            description: "Complete the sun-side ritual branch.",
            worldId: asWorldId("w1"),
            completed: episode.hiddenState.hiddenFlags.sunRite === true,
            discovered: true,
          },
          {
            id: "moon-rite",
            title: "Ignite the moon rite",
            description: "Complete the moon-side ritual branch.",
            worldId: asWorldId("w2"),
            completed: episode.hiddenState.hiddenFlags.moonRite === true,
            discovered: episode.publicState.discoveredWorldIds.includes(asWorldId("w2")),
          },
          {
            id: "final-sanctum",
            title: "Manifest the final sanctum",
            description: "Reveal and complete the final merged ritual site.",
            worldId: asWorldId("w4"),
            completed: episode.hiddenState.hiddenFlags.ritualComplete === true,
            discovered: episode.publicState.discoveredWorldIds.includes(asWorldId("w4")),
          },
        ]
      : [
          {
            id: "rune-cloister",
            title: "Awaken the rune cloister",
            description: "Carry ritual attunement into the rune world.",
            worldId: asWorldId("w2"),
            completed: episode.worlds.w2.entities.some((entity) => entity.kind === "rune_stone" && entity.hiddenState.awakened === true),
            discovered: episode.publicState.discoveredWorldIds.includes(asWorldId("w2")),
          },
          {
            id: "silent-altar",
            title: "Consecrate the silent altar",
            description: "Complete the final altar in the hidden world.",
            worldId: asWorldId("w3"),
            completed: episode.hiddenState.hiddenFlags.ritualComplete === true,
            discovered: episode.publicState.discoveredWorldIds.includes(asWorldId("w3")),
          },
        ];
  setHiddenTasks(episode, hiddenTasks);
  const completedHidden = hiddenTasks.filter((task) => task.completed).length;
  setScoreBreakdown(episode, {
    mainTaskScore: episode.hiddenState.hiddenFlags.ritualComplete === true ? 1 : 0,
    hiddenTaskScore: hiddenTasks.length > 0 ? completedHidden / hiddenTasks.length : 0,
    efficiencyScore: Math.max(0, 1 - episode.metrics.totalSteps / (episode.levelFamilyId === "dual_ritual_merge" ? 28 : 20)),
  });
};

const createAltarChainEpisode = (seed: number) => {
  const [brazierPos, runePos, altarPos] = seededPositions(seed + 21, ritualCells, 3);
  const episode = createEpisodeBase({
    episodeSeed: seed,
    gameClassId: "ritual_network",
    levelFamilyId: "altar_chain",
    topology: {
      nodes: [asNodeId("w1"), asNodeId("w2"), asNodeId("w3")],
      edges: [
        { from: asNodeId("w1"), to: asNodeId("w2"), channel: "ritual", weight: 1 },
        { from: asNodeId("w2"), to: asNodeId("w3"), channel: "ritual", weight: 1 },
      ],
    } as TopologyGraph,
    hiddenFlags: { completedStages: 0, ritualComplete: false },
    worlds: [
      createWorld({
        id: "w1",
        label: "Ash Court",
        tiles: cloneRoomTiles(),
        entities: [brazier("brazier-a", "w1", brazierPos.x, brazierPos.y)],
        localFlags: { attunement: 0 },
      }),
      createWorld({
        id: "w2",
        label: "Rune Cloister",
        tiles: cloneRoomTiles(),
        entities: [runeStone("rune-b", "w2", runePos.x, runePos.y)],
        localFlags: { attunement: 0 },
      }),
      createWorld({
        id: "w3",
        label: "Silent Altar",
        tiles: cloneRoomTiles(),
        entities: [altar("altar-c", "w3", altarPos.x, altarPos.y), sealNode("seal-c", "w3", 6, 3)],
        localFlags: { attunement: 0 },
      }),
    ],
    startWorldId: "w1",
  });
  syncRitualState(episode);
  return episode;
};

const createDualRitualMergeEpisode = (seed: number) => {
  const [altarA, altarB, sealPos] = seededPositions(seed + 34, ritualCells, 3);
  const episode = createEpisodeBase({
    episodeSeed: seed,
    gameClassId: "ritual_network",
    levelFamilyId: "dual_ritual_merge",
    topology: {
      nodes: [asNodeId("w1"), asNodeId("w2"), asNodeId("w3"), asNodeId("w4")],
      edges: [
        { from: asNodeId("w1"), to: asNodeId("w4"), channel: "ritual", weight: 1 },
        { from: asNodeId("w2"), to: asNodeId("w4"), channel: "ritual", weight: 1 },
        { from: asNodeId("w3"), to: asNodeId("w4"), channel: "ritual", weight: 1 },
      ],
    } as TopologyGraph,
    hiddenFlags: { sunRite: false, moonRite: false, completedStages: 0, ritualComplete: false },
    worlds: [
      createWorld({
        id: "w1",
        label: "Sun Chapel",
        tiles: cloneRoomTiles(),
        entities: [brazier("sun-fire", "w1", 4, 2), altar("sun-altar", "w1", altarA.x, altarA.y)],
        localFlags: { attunement: 0 },
      }),
      createWorld({
        id: "w2",
        label: "Moon Chapel",
        tiles: cloneRoomTiles(),
        entities: [brazier("moon-fire", "w2", 4, 2), altar("moon-altar", "w2", altarB.x, altarB.y)],
        localFlags: { attunement: 0 },
      }),
      createWorld({
        id: "w3",
        label: "Rune Bridge",
        tiles: cloneRoomTiles(),
        entities: [runeStone("merge-rune", "w3", 4, 2)],
        localFlags: { attunement: 0 },
      }),
      createWorld({
        id: "w4",
        label: "Final Sanctum",
        tiles: cloneRoomTiles(),
        entities: [sealNode("merge-seal", "w4", sealPos.x, sealPos.y)],
        localFlags: { attunement: 0 },
      }),
    ],
    startWorldId: "w1",
  });
  syncRitualState(episode);
  return episode;
};

const propagateRitual = (episode: ReturnType<typeof createAltarChainEpisode>, event: PropagationEvent, events: { turn: number; text: string; tone?: "neutral" | "good" | "warn" }[]) => {
  const targets = episode.hiddenState.topology.edges.filter(
    (edge) => edge.channel === "ritual" && String(edge.from) === event.sourceWorldId,
  );
  for (const edge of targets) {
    const world = episode.worlds[String(edge.to)];
    if (!world) {
      continue;
    }
    world.localFlags.attunement = Number(world.localFlags.attunement ?? 0) + 1;
    events.push({ turn: episode.metrics.totalSteps + 1, text: `A ritual echo stirs within ${world.label}.` });
    for (const entity of world.entities) {
      if (entity.kind === "seal_node" && episode.levelFamilyId === "dual_ritual_merge") {
        entity.publicState.manifest = episode.hiddenState.hiddenFlags.sunRite === true && episode.hiddenState.hiddenFlags.moonRite === true;
        entity.hiddenState.manifest = entity.publicState.manifest;
      }
    }
  }
  syncRitualState(episode);
};

export const ritualNetworkPlugin: GameClassPlugin = {
  id: "ritual_network",
  title: "Ritual Network",
  description: "Consecrate distant altars by aligning ritual states across hidden world topology.",
  publicActionSchema: actionSchema,
  vocabulary: {
    entityKinds: ["altar", "rune_stone", "brazier", "seal_node"],
    tileKinds: [".", "#"],
  },
  levelFamilies: [
    { id: "altar_chain", title: "Altar Chain", description: "One rite awakens the next, culminating in a hidden altar state." },
    { id: "dual_ritual_merge", title: "Dual Ritual Merge", description: "Two parallel rites must converge before the final seal manifests." },
  ],
  instanceGenerator: {
    generate: (seed, familyId) => (familyId === "dual_ritual_merge" ? createDualRitualMergeEpisode(seed) : createAltarChainEpisode(seed)),
  },
  interactionRules: [
    {
      id: "interact-ritual-network",
      apply: ({ episode, emit, markKeyEvent, queuePropagation }) => {
        const entity = findEntityAtPlayer(episode, (candidate) => candidate.tags.includes("ritual"));
        if (!entity) {
          emit({ turn: episode.metrics.totalSteps + 1, text: "The chamber remains ritually dormant." });
          return;
        }

        if (entity.kind === "brazier" && entity.hiddenState.lit !== true) {
          entity.publicState.lit = true;
          entity.hiddenState.lit = true;
          markKeyEvent();
          if (episode.levelFamilyId === "dual_ritual_merge") {
            if (String(episode.player.worldId) === "w1") episode.hiddenState.hiddenFlags.sunRite = true;
            if (String(episode.player.worldId) === "w2") episode.hiddenState.hiddenFlags.moonRite = true;
          }
          episode.hiddenState.hiddenFlags.completedStages = Number(episode.hiddenState.hiddenFlags.completedStages ?? 0) + 1;
          queuePropagation({ channel: "ritual", payload: { phase: "flame" }, sourceWorldId: String(episode.player.worldId) });
          syncRitualState(episode as ReturnType<typeof createAltarChainEpisode>);
          emit({ turn: episode.metrics.totalSteps + 1, text: "Sacred fire catches and sends a distant echo.", tone: "good" });
          return;
        }

        if (entity.kind === "rune_stone" && Number(episode.worlds[episode.player.worldId].localFlags.attunement ?? 0) > 0) {
          entity.publicState.awakened = true;
          entity.hiddenState.awakened = true;
          episode.hiddenState.hiddenFlags.completedStages = Number(episode.hiddenState.hiddenFlags.completedStages ?? 0) + 1;
          markKeyEvent();
          queuePropagation({ channel: "ritual", payload: { phase: "rune" }, sourceWorldId: String(episode.player.worldId) });
          syncRitualState(episode as ReturnType<typeof createAltarChainEpisode>);
          emit({ turn: episode.metrics.totalSteps + 1, text: "The rune stone answers with a low chant.", tone: "good" });
          return;
        }

        if (entity.kind === "altar") {
          const attunement = Number(episode.worlds[episode.player.worldId].localFlags.attunement ?? 0);
          const ready =
            episode.levelFamilyId === "altar_chain"
              ? attunement > 0
              : (String(episode.player.worldId) === "w1" && episode.hiddenState.hiddenFlags.sunRite === true) ||
                (String(episode.player.worldId) === "w2" && episode.hiddenState.hiddenFlags.moonRite === true);
          if (ready) {
            entity.publicState.consecrated = true;
            entity.hiddenState.consecrated = true;
            episode.hiddenState.hiddenFlags.completedStages = Number(episode.hiddenState.hiddenFlags.completedStages ?? 0) + 1;
            markKeyEvent();
            queuePropagation({ channel: "ritual", payload: { phase: "altar" }, sourceWorldId: String(episode.player.worldId) });
            if (episode.levelFamilyId === "altar_chain" && String(episode.player.worldId) === "w3") {
              episode.hiddenState.hiddenFlags.ritualComplete = true;
            }
            syncRitualState(episode as ReturnType<typeof createAltarChainEpisode>);
            emit({ turn: episode.metrics.totalSteps + 1, text: "The altar is consecrated under a hidden alignment.", tone: "good" });
            return;
          }
        }

        if (entity.kind === "seal_node" && episode.levelFamilyId === "dual_ritual_merge" && entity.hiddenState.manifest === true) {
          episode.hiddenState.hiddenFlags.ritualComplete = true;
          markKeyEvent();
          emit({ turn: episode.metrics.totalSteps + 1, text: "The final sanctum accepts the merged rite.", tone: "good" });
          return;
        }

        emit({ turn: episode.metrics.totalSteps + 1, text: "The rite is incomplete here.", tone: "warn" });
      },
    },
  ],
  propagationRules: [
    {
      id: "propagate-ritual-echo",
      propagate: (episode, event, events) => propagateRitual(episode as ReturnType<typeof createAltarChainEpisode>, event, events),
    },
  ],
  winCondition: {
    evaluate: (episode) => ({
      done: episode.hiddenState.hiddenFlags.ritualComplete === true,
      reward: episode.hiddenState.hiddenFlags.ritualComplete === true ? 1 : 0,
      event:
        episode.hiddenState.hiddenFlags.ritualComplete === true
          ? { turn: episode.metrics.totalSteps, text: "Ritual network completed.", tone: "good" }
          : undefined,
    }),
  },
  observationAdapter: {
    toObservation: (episode) => buildObservation(episode, ritualNetworkPlugin, episode.worlds[episode.player.worldId]),
  },
  rendererSkin: {
    palette: {
      background: "#1a1214",
      panel: "#2a1b20",
      accent: "#f2a65a",
      gridLine: "rgba(255,255,255,0.06)",
      tileFloor: "#38262d",
      tileWall: "#120a0d",
      player: "#f9e2af",
      glow: "rgba(242,166,90,0.3)",
    },
    entityAppearance: {
      altar: { fill: "#c084fc", stroke: "#e9d5ff", shape: "square", label: "A" },
      rune_stone: { fill: "#60a5fa", stroke: "#dbeafe", shape: "diamond", label: "R" },
      brazier: { fill: "#fb7185", stroke: "#fecdd3", shape: "circle", label: "F" },
      seal_node: { fill: "#f59e0b", stroke: "#fde68a", shape: "hex", label: "S" },
    },
    tileAppearance: {
      ".": { fill: "#38262d", stroke: "rgba(255,255,255,0.04)" },
      "#": { fill: "#120a0d", stroke: "rgba(255,255,255,0.02)" },
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
  getPublicPlayerStatus: () => ({
    focus: "ritual",
  }),
  syncBenchmarkState: (episode) => syncRitualState(episode as ReturnType<typeof createAltarChainEpisode>),
  evaluateTheorySubmission: (_episode, submission) => {
    const text = `${submission.hypothesizedRule} ${submission.evidence}`.toLowerCase();
    const mentionsRitual = text.includes("ritual") || text.includes("altar") || text.includes("rune") || text.includes("brazier");
    const mentionsDependency = text.includes("attune") || text.includes("echo") || text.includes("chain") || text.includes("merge");
    return {
      ruleDiscoveryScore: mentionsRitual && mentionsDependency ? 1 : mentionsRitual ? 0.5 : 0,
      evidenceScore: submission.evidence.trim() ? 0.8 : 0.25,
      feedback:
        mentionsRitual && mentionsDependency
          ? "Theory accepted: ritual progress depends on hidden attunement and cross-world rite dependencies."
          : "Theory noted, but it does not yet explain the hidden ritual dependency structure.",
    };
  },
};
