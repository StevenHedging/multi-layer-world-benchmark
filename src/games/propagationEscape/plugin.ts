import type { EntityState, EventFeedback, PublicActionSchema, TopologyGraph, WorldState } from "../../types/core";
import type { GameClassPlugin, PropagationEvent } from "../../types/plugin";
import { createEpisodeBase, createWorld } from "../shared/builders";
import { buildObservation } from "../shared/observation";
import { asEntityId, asNodeId, asWorldId } from "../../utils/ids";

const actionSchema: PublicActionSchema = {
  actions: [
    { type: "move_up", description: "Move north" },
    { type: "move_down", description: "Move south" },
    { type: "move_left", description: "Move west" },
    { type: "move_right", description: "Move east" },
    { type: "interact", description: "Toggle switches or enter an open exit" },
    { type: "switch_world", description: "Cycle to the next world" },
    { type: "wait", description: "Pause for one step" },
  ],
};

const switchEntity = (id: string, worldId: string, x: number, y: number): EntityState => ({
  id: asEntityId(id),
  kind: "switch",
  worldId: asWorldId(worldId),
  position: { x, y },
  tags: ["interactive", "trigger"],
  publicState: { active: false },
  hiddenState: { active: false, emits: `sig:${id}` },
});

const relayEntity = (id: string, worldId: string, x: number, y: number): EntityState => ({
  id: asEntityId(id),
  kind: "relay",
  worldId: asWorldId(worldId),
  position: { x, y },
  tags: ["status"],
  publicState: { powered: false },
  hiddenState: { powered: false },
});

const exitEntity = (id: string, worldId: string, x: number, y: number): EntityState => ({
  id: asEntityId(id),
  kind: "exit",
  worldId: asWorldId(worldId),
  position: { x, y },
  blocksMovement: false,
  tags: ["interactive", "goal"],
  publicState: { open: false },
  hiddenState: { open: false },
});

const baseTiles = [
  "#########",
  "#.......#",
  "#.......#",
  "#.......#",
  "#.......#",
  "#########",
];

const createChainEpisode = (seed: number) => {
  const topology: TopologyGraph = {
    nodes: [asNodeId("w1"), asNodeId("w2"), asNodeId("w3")],
    edges: [
      { from: asNodeId("w1"), to: asNodeId("w2"), channel: "chain" },
      { from: asNodeId("w2"), to: asNodeId("w3"), channel: "chain" },
    ],
  };
  const worlds = [
    createWorld({
      id: "w1",
      label: "World A",
      tiles: baseTiles,
      entities: [switchEntity("sw-a", "w1", 4, 2)],
    }),
    createWorld({
      id: "w2",
      label: "World B",
      tiles: baseTiles,
      entities: [relayEntity("relay-b", "w2", 4, 2)],
    }),
    createWorld({
      id: "w3",
      label: "World C",
      tiles: baseTiles,
      entities: [exitEntity("exit-c", "w3", 6, 3), relayEntity("relay-c", "w3", 4, 2)],
    }),
  ];
  return createEpisodeBase({
    episodeSeed: seed,
    gameClassId: "propagation_escape",
    levelFamilyId: "chain_basic",
    topology,
    hiddenFlags: { exitWorld: "w3", exitOpen: false, propagatedToW2: false, propagatedToW3: false },
    worlds,
    startWorldId: "w1",
  });
};

const createForkJoinEpisode = (seed: number) => {
  const topology: TopologyGraph = {
    nodes: [asNodeId("w1"), asNodeId("w2"), asNodeId("w3"), asNodeId("w4")],
    edges: [
      { from: asNodeId("w1"), to: asNodeId("w2"), channel: "fork" },
      { from: asNodeId("w1"), to: asNodeId("w3"), channel: "fork" },
      { from: asNodeId("w2"), to: asNodeId("w4"), channel: "join" },
      { from: asNodeId("w3"), to: asNodeId("w4"), channel: "join" },
    ],
  };
  const worlds = [
    createWorld({
      id: "w1",
      label: "Hub",
      tiles: baseTiles,
      entities: [switchEntity("hub-switch", "w1", 4, 2)],
    }),
    createWorld({
      id: "w2",
      label: "Branch North",
      tiles: baseTiles,
      entities: [switchEntity("north-switch", "w2", 3, 2), relayEntity("north-relay", "w2", 5, 2)],
    }),
    createWorld({
      id: "w3",
      label: "Branch South",
      tiles: baseTiles,
      entities: [switchEntity("south-switch", "w3", 5, 2), relayEntity("south-relay", "w3", 3, 2)],
    }),
    createWorld({
      id: "w4",
      label: "Convergence",
      tiles: baseTiles,
      entities: [relayEntity("final-relay", "w4", 4, 2), exitEntity("exit-d", "w4", 6, 3)],
    }),
  ];
  return createEpisodeBase({
    episodeSeed: seed,
    gameClassId: "propagation_escape",
    levelFamilyId: "fork_join_basic",
    topology,
    hiddenFlags: { exitWorld: "w4", exitOpen: false, northReady: false, southReady: false, hubTriggered: false },
    worlds,
    startWorldId: "w1",
  });
};

const emitPropagation = (episode: ReturnType<typeof createChainEpisode>, event: PropagationEvent, events: EventFeedback[]) => {
  if (episode.levelFamilyId === "chain_basic") {
    if (event.sourceWorldId === "w1") {
      const middleRelay = episode.worlds.w2.entities.find((entity) => entity.kind === "relay");
      const finalRelay = episode.worlds.w3.entities.find((entity) => entity.kind === "relay");
      const exit = episode.worlds.w3.entities.find((entity) => entity.kind === "exit");
      if (middleRelay) {
        middleRelay.publicState.powered = true;
        middleRelay.hiddenState.powered = true;
        episode.hiddenState.hiddenFlags.propagatedToW2 = true;
        events.push({ turn: episode.metrics.totalSteps + 1, text: "A distant mechanism hums somewhere else." });
      }
      if (finalRelay && exit) {
        finalRelay.publicState.powered = true;
        finalRelay.hiddenState.powered = true;
        exit.publicState.open = true;
        exit.hiddenState.open = true;
        episode.hiddenState.hiddenFlags.exitOpen = true;
        episode.hiddenState.hiddenFlags.propagatedToW3 = true;
        events.push({ turn: episode.metrics.totalSteps + 1, text: "Something unlocks in a deeper layer.", tone: "good" });
      }
    } else if (event.sourceWorldId === "w2") {
      const relay = episode.worlds.w3.entities.find((entity) => entity.kind === "relay");
      const exit = episode.worlds.w3.entities.find((entity) => entity.kind === "exit");
      if (relay && exit) {
        relay.publicState.powered = true;
        relay.hiddenState.powered = true;
        exit.publicState.open = true;
        exit.hiddenState.open = true;
        episode.hiddenState.hiddenFlags.exitOpen = true;
        episode.hiddenState.hiddenFlags.propagatedToW3 = true;
        events.push({ turn: episode.metrics.totalSteps + 1, text: "Something unlocks in a deeper layer.", tone: "good" });
      }
    }
    return;
  }

  if (event.sourceWorldId === "w1") {
    episode.hiddenState.hiddenFlags.hubTriggered = true;
    events.push({ turn: episode.metrics.totalSteps + 1, text: "Two remote branches seem primed." });
    return;
  }
  if (event.sourceWorldId === "w2") {
    episode.hiddenState.hiddenFlags.northReady = true;
  }
  if (event.sourceWorldId === "w3") {
    episode.hiddenState.hiddenFlags.southReady = true;
  }
  if (
    episode.hiddenState.hiddenFlags.hubTriggered === true &&
    episode.hiddenState.hiddenFlags.northReady === true &&
    episode.hiddenState.hiddenFlags.southReady === true
  ) {
    const exit = episode.worlds.w4.entities.find((entity) => entity.kind === "exit");
    const relay = episode.worlds.w4.entities.find((entity) => entity.kind === "relay");
    if (exit && relay) {
      relay.publicState.powered = true;
      exit.publicState.open = true;
      exit.hiddenState.open = true;
      episode.hiddenState.hiddenFlags.exitOpen = true;
      events.push({ turn: episode.metrics.totalSteps + 1, text: "A convergence gate opens somewhere ahead.", tone: "good" });
    }
  }
};

export const propagationEscapePlugin: GameClassPlugin = {
  id: "propagation_escape",
  title: "Propagation Escape",
  description: "Hidden cross-world propagation unlocks a distant exit.",
  publicActionSchema: actionSchema,
  vocabulary: {
    entityKinds: ["switch", "relay", "exit"],
    tileKinds: [".", "#"],
  },
  levelFamilies: [
    {
      id: "chain_basic",
      title: "Chain Basic",
      description: "Upstream actions ripple through a hidden chain of worlds.",
    },
    {
      id: "fork_join_basic",
      title: "Fork Join Basic",
      description: "Separate branches must both complete before the exit unlocks.",
    },
  ],
  instanceGenerator: {
    generate: (seed, familyId) => (familyId === "fork_join_basic" ? createForkJoinEpisode(seed) : createChainEpisode(seed)),
  },
  interactionRules: [
    {
      id: "interact-propagation-escape",
      apply: ({ episode, emit, markKeyEvent }) => {
        const world = episode.worlds[episode.player.worldId];
        const entity = world.entities.find(
          (candidate) =>
            candidate.tags.includes("interactive") &&
            candidate.position.x === episode.player.position.x &&
            candidate.position.y === episode.player.position.y,
        );
        if (!entity) {
          emit({ turn: episode.metrics.totalSteps + 1, text: "Nothing here responds." });
          return;
        }
        if (entity.kind === "switch") {
          entity.publicState.active = true;
          entity.hiddenState.active = true;
          markKeyEvent();
          emit({ turn: episode.metrics.totalSteps + 1, text: "The switch latches with a metallic click.", tone: "good" });
          emitPropagation(
            episode as ReturnType<typeof createChainEpisode>,
            {
              channel: "signal",
              payload: { active: true },
              sourceWorldId: `${episode.player.worldId}`,
            },
            episode.eventLog,
          );
          return;
        }
        if (entity.kind === "exit") {
          if (entity.hiddenState.open === true) {
            episode.hiddenState.hiddenFlags.playerEscaped = true;
            emit({ turn: episode.metrics.totalSteps + 1, text: "You step through the opened exit.", tone: "good" });
          } else {
            emit({ turn: episode.metrics.totalSteps + 1, text: "The exit remains sealed.", tone: "warn" });
          }
        }
      },
    },
  ],
  propagationRules: [
    {
      id: "default-propagation-escape",
      propagate: (episode, event, events) => emitPropagation(episode as ReturnType<typeof createChainEpisode>, event, events),
    },
  ],
  winCondition: {
    evaluate: (episode) => ({
      done: episode.hiddenState.hiddenFlags.playerEscaped === true,
      reward: episode.hiddenState.hiddenFlags.playerEscaped === true ? 1 : 0,
      event:
        episode.hiddenState.hiddenFlags.playerEscaped === true
          ? { turn: episode.metrics.totalSteps, text: "Escape complete.", tone: "good" }
          : undefined,
    }),
  },
  observationAdapter: {
    toObservation: (episode) => buildObservation(episode, propagationEscapePlugin, episode.worlds[episode.player.worldId]),
  },
  rendererSkin: {
    palette: {
      background: "#0f1722",
      panel: "#162133",
      accent: "#8ecae6",
      gridLine: "rgba(255,255,255,0.08)",
      tileFloor: "#263449",
      tileWall: "#09101c",
      player: "#ffdd88",
      glow: "rgba(142,202,230,0.35)",
    },
    entityAppearance: {
      switch: { fill: "#ffb703", stroke: "#ffd166", shape: "diamond", label: "S" },
      relay: { fill: "#219ebc", stroke: "#8ecae6", shape: "hex", label: "R" },
      exit: { fill: "#7bd389", stroke: "#d9f99d", shape: "square", label: "E" },
    },
    tileAppearance: {
      ".": { fill: "#263449", stroke: "rgba(255,255,255,0.04)" },
      "#": { fill: "#09101c", stroke: "rgba(255,255,255,0.03)" },
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
};
