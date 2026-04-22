import type { EntityState, EventFeedback, PublicActionSchema, TopologyGraph, WorldState } from "../../types/core";
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
    { type: "interact", description: "Collect charge or route it through local interfaces" },
    { type: "switch_world", description: "Cycle to the next world" },
    { type: "wait", description: "Pause for one step" },
  ],
};

const energyOrb = (id: string, worldId: string, x: number, y: number, amount: number): EntityState => ({
  id: asEntityId(id),
  kind: "energy_orb",
  worldId: asWorldId(worldId),
  position: { x, y },
  tags: ["interactive", "collectible"],
  publicState: { charged: true, amount },
  hiddenState: { charged: true, amount },
});

const batterySlot = (id: string, worldId: string, x: number, y: number): EntityState => ({
  id: asEntityId(id),
  kind: "battery_slot",
  worldId: asWorldId(worldId),
  position: { x, y },
  tags: ["interactive", "injector"],
  publicState: { stored: 0 },
  hiddenState: { stored: 0 },
});

const chargeTower = (id: string, worldId: string, x: number, y: number): EntityState => ({
  id: asEntityId(id),
  kind: "charge_tower",
  worldId: asWorldId(worldId),
  position: { x, y },
  tags: ["status"],
  publicState: { active: false },
  hiddenState: { active: false },
});

const wireNode = (id: string, worldId: string, x: number, y: number): EntityState => ({
  id: asEntityId(id),
  kind: "wire_node",
  worldId: asWorldId(worldId),
  position: { x, y },
  tags: ["status"],
  publicState: { live: false },
  hiddenState: { live: false },
});

const regulator = (id: string, worldId: string, x: number, y: number): EntityState => ({
  id: asEntityId(id),
  kind: "regulator",
  worldId: asWorldId(worldId),
  position: { x, y },
  tags: ["interactive", "injector"],
  publicState: { tuned: false },
  hiddenState: { tuned: false },
});

const candidateCells = [
  { x: 3, y: 2 },
  { x: 4, y: 2 },
  { x: 5, y: 2 },
  { x: 3, y: 3 },
  { x: 5, y: 3 },
];

const syncEnergyPublicState = (episode: ReturnType<typeof createSingleSourceEpisode>) => {
  const goalStored = Number(episode.hiddenState.hiddenFlags.goalStored ?? 0);
  const threshold = Number(episode.hiddenState.hiddenFlags.goalThreshold ?? 0);
  setPublicStats(episode, {
    carriedCharge: episode.player.energy,
    localCharge: Number(episode.worlds[episode.player.worldId].localFlags.chargeLevel ?? 0),
    visibleTerminalCharge: Math.min(goalStored, threshold),
  });
  setHudHints(episode, [
    "Collect energy orbs, then inject charge into slots or regulators.",
    "Charge travels through hidden network links and may awaken remote towers.",
  ]);
  if (episode.worlds.w2 && Number(episode.worlds.w2.localFlags.chargeLevel ?? 0) > 0) {
    discoverWorld(episode, "w2");
  }
  if (episode.worlds.w3 && Number(episode.worlds.w3.localFlags.chargeLevel ?? 0) > 0) {
    discoverWorld(episode, "w3");
  }
  if (episode.worlds.w4 && Number(episode.worlds.w4.localFlags.chargeLevel ?? 0) > 0) {
    discoverWorld(episode, "w4");
  }
  setExplicitRules(episode, [
    "A main-world objective anchors the episode.",
    "Only discovered hidden worlds can be possessed.",
    "Hidden energy conduits move charge across worlds according to latent topology.",
    "You may submit a theory about routing, thresholds, or merge logic with evidence.",
  ]);
  setMainTask(episode, {
    title: "Stabilize the remote energy objective",
    description:
      episode.levelFamilyId === "dual_source_merge"
        ? "Route and merge hidden energy from multiple worlds until the concealed core stabilizes."
        : "Route enough hidden energy to satisfy the distant terminal threshold.",
    completed: episode.hiddenState.hiddenFlags.targetSatisfied === true,
  });
  const hiddenTasks =
    episode.levelFamilyId === "dual_source_merge"
      ? [
          {
            id: "alpha-source",
            title: "Activate the alpha source",
            description: "Collect and route charge from the alpha source world.",
            worldId: asWorldId("w1"),
            completed: episode.hiddenState.hiddenFlags.alphaReady === true,
            discovered: true,
          },
          {
            id: "beta-source",
            title: "Activate the beta source",
            description: "Collect and route charge from the beta source world.",
            worldId: asWorldId("w2"),
            completed: episode.hiddenState.hiddenFlags.betaReady === true,
            discovered: episode.publicState.discoveredWorldIds.includes(asWorldId("w2")),
          },
          {
            id: "merge-core",
            title: "Reveal the merge core",
            description: "Expose and charge the hidden merge core world.",
            worldId: asWorldId("w4"),
            completed: Number(episode.hiddenState.hiddenFlags.goalStored ?? 0) >= Number(episode.hiddenState.hiddenFlags.goalThreshold ?? 0),
            discovered: episode.publicState.discoveredWorldIds.includes(asWorldId("w4")),
          },
        ]
      : [
          {
            id: "relay-gallery",
            title: "Charge the relay gallery",
            description: "Cause the intermediate hidden world to carry visible charge.",
            worldId: asWorldId("w2"),
            completed: Number(episode.worlds.w2.localFlags.chargeLevel ?? 0) > 0,
            discovered: episode.publicState.discoveredWorldIds.includes(asWorldId("w2")),
          },
          {
            id: "terminal-spire",
            title: "Charge the terminal spire",
            description: "Route enough energy to the hidden terminal world.",
            worldId: asWorldId("w3"),
            completed: Number(episode.hiddenState.hiddenFlags.goalStored ?? 0) >= threshold,
            discovered: episode.publicState.discoveredWorldIds.includes(asWorldId("w3")),
          },
        ];
  setHiddenTasks(episode, hiddenTasks);
  const completedHidden = hiddenTasks.filter((task) => task.completed).length;
  setScoreBreakdown(episode, {
    mainTaskScore: episode.hiddenState.hiddenFlags.targetSatisfied === true ? 1 : 0,
    hiddenTaskScore: hiddenTasks.length > 0 ? completedHidden / hiddenTasks.length : 0,
    efficiencyScore: Math.max(0, 1 - episode.metrics.totalSteps / (episode.levelFamilyId === "dual_source_merge" ? 28 : 20)),
  });
};

const createSingleSourceEpisode = (seed: number) => {
  const [orbPos, slotPos, towerPos] = seededPositions(seed, candidateCells, 3);
  const threshold = 3 + (seed % 2);
  const worlds = [
    createWorld({
      id: "w1",
      label: "Source Basin",
      tiles: cloneRoomTiles(),
      entities: [
        energyOrb("orb-source", "w1", orbPos.x, orbPos.y, threshold),
        wireNode("wire-a", "w1", 6, 2),
      ],
      localFlags: { chargeLevel: 0 },
    }),
    createWorld({
      id: "w2",
      label: "Relay Gallery",
      tiles: cloneRoomTiles(),
      entities: [
        batterySlot("slot-mid", "w2", slotPos.x, slotPos.y),
        wireNode("wire-b", "w2", 5, 2),
        chargeTower("tower-mid", "w2", 2, 2),
      ],
      localFlags: { chargeLevel: 0 },
    }),
    createWorld({
      id: "w3",
      label: "Terminal Spire",
      tiles: cloneRoomTiles(),
      entities: [
        regulator("reg-final", "w3", 3, 2),
        chargeTower("tower-final", "w3", towerPos.x, towerPos.y),
        wireNode("wire-c", "w3", 6, 2),
      ],
      localFlags: { chargeLevel: 0 },
    }),
  ];
  const episode = createEpisodeBase({
    episodeSeed: seed,
    gameClassId: "energy_network",
    levelFamilyId: "single_source_threshold",
    topology: {
      nodes: [asNodeId("w1"), asNodeId("w2"), asNodeId("w3")],
      edges: [
        { from: asNodeId("w2"), to: asNodeId("w3"), channel: "energy", weight: 1 },
        { from: asNodeId("w1"), to: asNodeId("w2"), channel: "energy", weight: 1 },
      ],
    } as TopologyGraph,
    hiddenFlags: {
      goalStored: 0,
      goalThreshold: threshold,
      targetSatisfied: false,
    },
    worlds,
    startWorldId: "w1",
  });
  syncEnergyPublicState(episode);
  return episode;
};

const createDualSourceEpisode = (seed: number) => {
  const [alphaPos, betaPos, mergePos] = seededPositions(seed + 11, candidateCells, 3);
  const worlds = [
    createWorld({
      id: "w1",
      label: "Alpha Source",
      tiles: cloneRoomTiles(),
      entities: [
        energyOrb("orb-alpha", "w1", alphaPos.x, alphaPos.y, 1),
        chargeTower("tower-alpha", "w1", 6, 2),
      ],
      localFlags: { chargeLevel: 0 },
    }),
    createWorld({
      id: "w2",
      label: "Beta Source",
      tiles: cloneRoomTiles(),
      entities: [
        energyOrb("orb-beta", "w2", betaPos.x, betaPos.y, 1),
        chargeTower("tower-beta", "w2", 2, 2),
      ],
      localFlags: { chargeLevel: 0 },
    }),
    createWorld({
      id: "w3",
      label: "Conduit Field",
      tiles: cloneRoomTiles(),
      entities: [
        wireNode("wire-merge-a", "w3", 3, 2),
        wireNode("wire-merge-b", "w3", 5, 2),
        chargeTower("tower-buffer", "w3", 4, 3),
      ],
      localFlags: { chargeLevel: 0 },
    }),
    createWorld({
      id: "w4",
      label: "Merge Core",
      tiles: cloneRoomTiles(),
      entities: [
        batterySlot("merge-slot", "w4", mergePos.x, mergePos.y),
        regulator("merge-reg", "w4", 6, 3),
        wireNode("wire-terminal", "w4", 2, 2),
      ],
      localFlags: { chargeLevel: 0 },
    }),
  ];
  const episode = createEpisodeBase({
    episodeSeed: seed,
    gameClassId: "energy_network",
    levelFamilyId: "dual_source_merge",
    topology: {
      nodes: [asNodeId("w1"), asNodeId("w2"), asNodeId("w3"), asNodeId("w4")],
      edges: [
        { from: asNodeId("w1"), to: asNodeId("w3"), channel: "energy", weight: 1 },
        { from: asNodeId("w2"), to: asNodeId("w3"), channel: "energy", weight: 1 },
        { from: asNodeId("w3"), to: asNodeId("w4"), channel: "energy", weight: 1 },
      ],
    } as TopologyGraph,
    hiddenFlags: {
      alphaReady: false,
      betaReady: false,
      goalStored: 0,
      goalThreshold: 2,
      targetSatisfied: false,
    },
    worlds,
    startWorldId: "w1",
  });
  syncEnergyPublicState(episode);
  return episode;
};

const applyEnergyAlongGraph = (
  episode: ReturnType<typeof createSingleSourceEpisode>,
  event: PropagationEvent,
  events: EventFeedback[],
) => {
  const amount = Number(event.payload.amount ?? 0);
  if (amount <= 0) {
    return;
  }

  const queue = [{ worldId: event.sourceWorldId, amount }];
  const visited = new Set<string>();

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (visited.has(current.worldId)) {
      continue;
    }
    visited.add(current.worldId);

    const outgoing = episode.hiddenState.topology.edges.filter(
      (edge) => String(edge.from) === current.worldId && edge.channel === event.channel,
    );

    for (const edge of outgoing) {
      const nextWorld = episode.worlds[String(edge.to)];
      if (!nextWorld) {
        continue;
      }
      const nextAmount = current.amount * Number(edge.weight ?? 1);
      nextWorld.localFlags.chargeLevel = Number(nextWorld.localFlags.chargeLevel ?? 0) + nextAmount;
      for (const entity of nextWorld.entities) {
        if (entity.kind === "wire_node") {
          entity.publicState.live = true;
          entity.hiddenState.live = true;
        }
        if (entity.kind === "charge_tower") {
          entity.publicState.active = true;
          entity.hiddenState.active = true;
        }
      }
      if (String(edge.to) === "w4" || (episode.levelFamilyId === "single_source_threshold" && String(edge.to) === "w3")) {
        episode.hiddenState.hiddenFlags.goalStored = Number(episode.hiddenState.hiddenFlags.goalStored ?? 0) + nextAmount;
      }
      queue.push({ worldId: String(edge.to), amount: nextAmount });
    }
  }

  if (episode.levelFamilyId === "dual_source_merge") {
    const sourceTag = String(event.payload.sourceTag ?? "");
    if (sourceTag === "alpha") {
      episode.hiddenState.hiddenFlags.alphaReady = true;
    }
    if (sourceTag === "beta") {
      episode.hiddenState.hiddenFlags.betaReady = true;
    }
    if (
      episode.hiddenState.hiddenFlags.alphaReady === true &&
      episode.hiddenState.hiddenFlags.betaReady === true &&
      Number(episode.hiddenState.hiddenFlags.goalStored ?? 0) >= Number(episode.hiddenState.hiddenFlags.goalThreshold ?? 0)
    ) {
      episode.hiddenState.hiddenFlags.targetSatisfied = true;
      events.push({ turn: episode.metrics.totalSteps + 1, text: "Separated charges resonate into a stable core.", tone: "good" });
    }
  } else if (
    Number(episode.hiddenState.hiddenFlags.goalStored ?? 0) >= Number(episode.hiddenState.hiddenFlags.goalThreshold ?? 0)
  ) {
    episode.hiddenState.hiddenFlags.targetSatisfied = true;
    events.push({ turn: episode.metrics.totalSteps + 1, text: "A distant terminal reaches its charge threshold.", tone: "good" });
  }

  syncEnergyPublicState(episode);
};

export const energyNetworkPlugin: GameClassPlugin = {
  id: "energy_network",
  title: "Energy Network",
  description: "Collect, route, and merge charge through hidden multi-world conduits.",
  publicActionSchema: actionSchema,
  vocabulary: {
    entityKinds: ["energy_orb", "battery_slot", "charge_tower", "wire_node", "regulator"],
    tileKinds: [".", "#"],
  },
  levelFamilies: [
    {
      id: "single_source_threshold",
      title: "Single Source Threshold",
      description: "One world holds enough charge, but only hidden routing reveals where it must be delivered.",
    },
    {
      id: "dual_source_merge",
      title: "Dual Source Merge",
      description: "Separate sources must both contribute before the concealed merge core stabilizes.",
    },
  ],
  instanceGenerator: {
    generate: (seed, familyId) => (familyId === "dual_source_merge" ? createDualSourceEpisode(seed) : createSingleSourceEpisode(seed)),
  },
  interactionRules: [
    {
      id: "interact-energy-network",
      apply: ({ episode, emit, markKeyEvent, queuePropagation }) => {
        const entity = findEntityAtPlayer(episode, (candidate) => candidate.tags.includes("interactive"));
        if (!entity) {
          emit({ turn: episode.metrics.totalSteps + 1, text: "No energy interface responds here." });
          return;
        }

        if (entity.kind === "energy_orb" && entity.hiddenState.charged === true) {
          const amount = Number(entity.hiddenState.amount ?? 0);
          entity.hiddenState.charged = false;
          entity.publicState.charged = false;
          episode.player.energy += amount;
          markKeyEvent();
          syncEnergyPublicState(episode as ReturnType<typeof createSingleSourceEpisode>);
          emit({ turn: episode.metrics.totalSteps + 1, text: `You capture ${amount} unit(s) of free charge.`, tone: "good" });
          return;
        }

        if ((entity.kind === "battery_slot" || entity.kind === "regulator") && episode.player.energy > 0) {
          const carried = episode.player.energy;
          entity.publicState.stored = Number(entity.publicState.stored ?? 0) + carried;
          entity.hiddenState.stored = Number(entity.hiddenState.stored ?? 0) + carried;
          if (entity.kind === "regulator") {
            entity.publicState.tuned = true;
            entity.hiddenState.tuned = true;
          }
          const sourceTag =
            String(episode.player.worldId) === "w1" ? "alpha" : String(episode.player.worldId) === "w2" ? "beta" : "merged";
          queuePropagation({
            channel: "energy",
            payload: { amount: carried, sourceTag },
            sourceWorldId: String(episode.player.worldId),
          });
          episode.player.energy = 0;
          markKeyEvent();
          syncEnergyPublicState(episode as ReturnType<typeof createSingleSourceEpisode>);
          emit({ turn: episode.metrics.totalSteps + 1, text: "Stored charge disappears into unseen conductors.", tone: "good" });
          return;
        }

        emit({ turn: episode.metrics.totalSteps + 1, text: "The fixture hums, but nothing changes yet.", tone: "warn" });
      },
    },
  ],
  propagationRules: [
    {
      id: "propagate-energy-flow",
      propagate: (episode, event, events) => applyEnergyAlongGraph(episode as ReturnType<typeof createSingleSourceEpisode>, event, events),
    },
  ],
  winCondition: {
    evaluate: (episode) => ({
      done: episode.hiddenState.hiddenFlags.targetSatisfied === true,
      reward: episode.hiddenState.hiddenFlags.targetSatisfied === true ? 1 : 0,
      event:
        episode.hiddenState.hiddenFlags.targetSatisfied === true
          ? { turn: episode.metrics.totalSteps, text: "Energy network objective satisfied.", tone: "good" }
          : undefined,
    }),
  },
  observationAdapter: {
    toObservation: (episode) => buildObservation(episode, energyNetworkPlugin, episode.worlds[episode.player.worldId]),
  },
  rendererSkin: {
    palette: {
      background: "#10161a",
      panel: "#16252a",
      accent: "#7ed6a5",
      gridLine: "rgba(255,255,255,0.06)",
      tileFloor: "#26363f",
      tileWall: "#071116",
      player: "#f8d66d",
      glow: "rgba(126,214,165,0.32)",
    },
    entityAppearance: {
      energy_orb: { fill: "#ffb703", stroke: "#ffe08a", shape: "circle", label: "O" },
      battery_slot: { fill: "#6ee7b7", stroke: "#d1fae5", shape: "square", label: "B" },
      charge_tower: { fill: "#34d399", stroke: "#a7f3d0", shape: "hex", label: "T" },
      wire_node: { fill: "#38bdf8", stroke: "#bae6fd", shape: "diamond", label: "W" },
      regulator: { fill: "#fb7185", stroke: "#fecdd3", shape: "square", label: "R" },
    },
    tileAppearance: {
      ".": { fill: "#26363f", stroke: "rgba(255,255,255,0.04)" },
      "#": { fill: "#071116", stroke: "rgba(255,255,255,0.02)" },
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
    charge: episode.player.energy,
  }),
  syncBenchmarkState: (episode) => syncEnergyPublicState(episode as ReturnType<typeof createSingleSourceEpisode>),
  evaluateTheorySubmission: (episode, submission) => {
    const text = `${submission.hypothesizedRule} ${submission.evidence}`.toLowerCase();
    const mentionsEnergy = text.includes("energy") || text.includes("charge");
    const mentionsRouting = text.includes("route") || text.includes("hidden") || text.includes("network");
    const mentionsThreshold = text.includes("threshold") || text.includes("merge") || text.includes("source");
    return {
      ruleDiscoveryScore: mentionsEnergy && mentionsRouting && mentionsThreshold ? 1 : mentionsEnergy && mentionsRouting ? 0.6 : 0,
      evidenceScore: submission.evidence.trim() ? 0.8 : 0.25,
      feedback:
        mentionsEnergy && mentionsRouting && mentionsThreshold
          ? "Theory accepted: the hidden energy topology routes charge toward a thresholded or merged remote objective."
          : "Theory noted, but it does not yet capture enough of the hidden routing rule.",
    };
  },
};
