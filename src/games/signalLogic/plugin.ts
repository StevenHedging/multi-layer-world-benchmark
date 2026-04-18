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
    { type: "interact", description: "Toggle sources or calibrate local logic devices" },
    { type: "switch_world", description: "Cycle to the next world" },
    { type: "wait", description: "Pause for one step" },
  ],
};

const signalSource = (id: string, worldId: string, x: number, y: number, channel: string): EntityState => ({
  id: asEntityId(id),
  kind: "signal_source",
  worldId: asWorldId(worldId),
  position: { x, y },
  tags: ["interactive", "logic"],
  publicState: { active: false, channel },
  hiddenState: { active: false, channel },
});

const logicGate = (id: string, worldId: string, x: number, y: number, mode: string): EntityState => ({
  id: asEntityId(id),
  kind: "logic_gate",
  worldId: asWorldId(worldId),
  position: { x, y },
  tags: ["interactive", "logic"],
  publicState: { mode, output: false },
  hiddenState: { mode, output: false },
});

const receiver = (id: string, worldId: string, x: number, y: number): EntityState => ({
  id: asEntityId(id),
  kind: "receiver",
  worldId: asWorldId(worldId),
  position: { x, y },
  tags: ["status"],
  publicState: { output: false },
  hiddenState: { output: false },
});

const inverter = (id: string, worldId: string, x: number, y: number): EntityState => ({
  id: asEntityId(id),
  kind: "inverter",
  worldId: asWorldId(worldId),
  position: { x, y },
  tags: ["status"],
  publicState: { active: false },
  hiddenState: { active: false },
});

const logicCells = [
  { x: 3, y: 2 },
  { x: 4, y: 2 },
  { x: 5, y: 2 },
  { x: 4, y: 3 },
];

const syncLogicState = (episode: ReturnType<typeof createBasicLogicChain>) => {
  setPublicStats(episode, {
    localSignal: String(episode.worlds[episode.player.worldId].localFlags.signalState ?? "idle"),
    visibleOutput: String(episode.hiddenState.hiddenFlags.visibleOutput ?? "unknown"),
  });
  setHudHints(episode, [
    "Toggle signal sources and watch which gates or receivers change in other worlds.",
    "The hidden target is a logic pattern, not a destination tile.",
  ]);
};

const createBasicLogicChain = (seed: number) => {
  const [sourcePos, gatePos, receiverPos] = seededPositions(seed + 51, logicCells, 3);
  const episode = createEpisodeBase({
    episodeSeed: seed,
    gameClassId: "signal_logic",
    levelFamilyId: "basic_logic_chain",
    topology: {
      nodes: [asNodeId("w1"), asNodeId("w2"), asNodeId("w3")],
      edges: [
        { from: asNodeId("w1"), to: asNodeId("w2"), channel: "signal", weight: 1 },
        { from: asNodeId("w2"), to: asNodeId("w3"), channel: "signal", weight: 1 },
      ],
    } as TopologyGraph,
    hiddenFlags: { targetPattern: "inverted_on", visibleOutput: "idle", objectiveMet: false },
    worlds: [
      createWorld({
        id: "w1",
        label: "Emitter Room",
        tiles: cloneRoomTiles(),
        entities: [signalSource("src-a", "w1", sourcePos.x, sourcePos.y, "amber")],
        localFlags: { signalState: "low" },
      }),
      createWorld({
        id: "w2",
        label: "Gate Room",
        tiles: cloneRoomTiles(),
        entities: [logicGate("gate-b", "w2", gatePos.x, gatePos.y, "NOT"), inverter("inv-b", "w2", 6, 3)],
        localFlags: { signalState: "low" },
      }),
      createWorld({
        id: "w3",
        label: "Receiver Room",
        tiles: cloneRoomTiles(),
        entities: [receiver("recv-c", "w3", receiverPos.x, receiverPos.y)],
        localFlags: { signalState: "low" },
      }),
    ],
    startWorldId: "w1",
  });
  syncLogicState(episode);
  return episode;
};

const createForkLogicMerge = (seed: number) => {
  const [sourceA, sourceB, mergeGate] = seededPositions(seed + 73, logicCells, 3);
  const episode = createEpisodeBase({
    episodeSeed: seed,
    gameClassId: "signal_logic",
    levelFamilyId: "fork_logic_merge",
    topology: {
      nodes: [asNodeId("w1"), asNodeId("w2"), asNodeId("w3"), asNodeId("w4")],
      edges: [
        { from: asNodeId("w1"), to: asNodeId("w4"), channel: "signal", weight: 1 },
        { from: asNodeId("w2"), to: asNodeId("w4"), channel: "signal", weight: 1 },
        { from: asNodeId("w3"), to: asNodeId("w4"), channel: "signal", weight: 1 },
      ],
    } as TopologyGraph,
    hiddenFlags: { alphaSignal: false, betaSignal: false, visibleOutput: "idle", objectiveMet: false },
    worlds: [
      createWorld({
        id: "w1",
        label: "Alpha Source",
        tiles: cloneRoomTiles(),
        entities: [signalSource("src-alpha", "w1", sourceA.x, sourceA.y, "alpha")],
        localFlags: { signalState: "low" },
      }),
      createWorld({
        id: "w2",
        label: "Beta Source",
        tiles: cloneRoomTiles(),
        entities: [signalSource("src-beta", "w2", sourceB.x, sourceB.y, "beta")],
        localFlags: { signalState: "low" },
      }),
      createWorld({
        id: "w3",
        label: "Phase Inverter",
        tiles: cloneRoomTiles(),
        entities: [inverter("inv-bridge", "w3", 4, 2)],
        localFlags: { signalState: "low" },
      }),
      createWorld({
        id: "w4",
        label: "Merge Receiver",
        tiles: cloneRoomTiles(),
        entities: [logicGate("gate-merge", "w4", mergeGate.x, mergeGate.y, "AND"), receiver("recv-merge", "w4", 6, 3)],
        localFlags: { signalState: "low" },
      }),
    ],
    startWorldId: "w1",
  });
  syncLogicState(episode);
  return episode;
};

const propagateSignal = (episode: ReturnType<typeof createBasicLogicChain>, event: PropagationEvent, events: { turn: number; text: string; tone?: "neutral" | "good" | "warn" }[]) => {
  const isActive = event.payload.active === true;
  if (episode.levelFamilyId === "basic_logic_chain") {
    const gateWorld = episode.worlds.w2;
    const receiverWorld = episode.worlds.w3;
    gateWorld.localFlags.signalState = isActive ? "high" : "low";
    receiverWorld.localFlags.signalState = isActive ? "inverted_low" : "inverted_high";
    const gate = gateWorld.entities.find((entity) => entity.kind === "logic_gate");
    const inverterNode = gateWorld.entities.find((entity) => entity.kind === "inverter");
    const recv = receiverWorld.entities.find((entity) => entity.kind === "receiver");
    const output = !isActive;
    if (gate) {
      gate.publicState.output = output;
      gate.hiddenState.output = output;
    }
    if (inverterNode) {
      inverterNode.publicState.active = isActive;
      inverterNode.hiddenState.active = isActive;
    }
    if (recv) {
      recv.publicState.output = output;
      recv.hiddenState.output = output;
    }
    episode.hiddenState.hiddenFlags.visibleOutput = output ? "inverted_on" : "inverted_off";
    episode.hiddenState.hiddenFlags.objectiveMet = output === true;
    events.push({ turn: episode.metrics.totalSteps + 1, text: "A remote receiver flips to a new logic state." });
  } else {
    const sourceTag = String(event.payload.sourceTag ?? "");
    if (sourceTag === "alpha") episode.hiddenState.hiddenFlags.alphaSignal = isActive;
    if (sourceTag === "beta") episode.hiddenState.hiddenFlags.betaSignal = isActive;
    const output = episode.hiddenState.hiddenFlags.alphaSignal === true && episode.hiddenState.hiddenFlags.betaSignal === true;
    const mergeWorld = episode.worlds.w4;
    mergeWorld.localFlags.signalState = output ? "and_true" : "and_false";
    const gate = mergeWorld.entities.find((entity) => entity.kind === "logic_gate");
    const recv = mergeWorld.entities.find((entity) => entity.kind === "receiver");
    if (gate) {
      gate.publicState.output = output;
      gate.hiddenState.output = output;
    }
    if (recv) {
      recv.publicState.output = output;
      recv.hiddenState.output = output;
    }
    episode.hiddenState.hiddenFlags.visibleOutput = output ? "and_true" : "and_false";
    episode.hiddenState.hiddenFlags.objectiveMet = output;
    events.push({ turn: episode.metrics.totalSteps + 1, text: "Signals merge in a distant logic chamber." });
  }
  syncLogicState(episode);
};

export const signalLogicPlugin: GameClassPlugin = {
  id: "signal_logic",
  title: "Signal Logic",
  description: "Manipulate hidden cross-world logic until a distant receiver matches its target pattern.",
  publicActionSchema: actionSchema,
  vocabulary: {
    entityKinds: ["signal_source", "logic_gate", "receiver", "inverter"],
    tileKinds: [".", "#"],
  },
  levelFamilies: [
    { id: "basic_logic_chain", title: "Basic Logic Chain", description: "A source feeds a hidden inversion chain ending at a receiver." },
    { id: "fork_logic_merge", title: "Fork Logic Merge", description: "Two remote sources must align to satisfy a merged logic gate." },
  ],
  instanceGenerator: {
    generate: (seed, familyId) => (familyId === "fork_logic_merge" ? createForkLogicMerge(seed) : createBasicLogicChain(seed)),
  },
  interactionRules: [
    {
      id: "interact-signal-logic",
      apply: ({ episode, emit, markKeyEvent, queuePropagation }) => {
        const entity = findEntityAtPlayer(episode, (candidate) => candidate.tags.includes("logic"));
        if (!entity) {
          emit({ turn: episode.metrics.totalSteps + 1, text: "No nearby logic interface responds." });
          return;
        }

        if (entity.kind === "signal_source") {
          const nextState = entity.hiddenState.active !== true;
          entity.hiddenState.active = nextState;
          entity.publicState.active = nextState;
          episode.worlds[episode.player.worldId].localFlags.signalState = nextState ? "high" : "low";
          const sourceTag = String(entity.hiddenState.channel ?? entity.publicState.channel ?? "amber");
          queuePropagation({ channel: "signal", payload: { active: nextState, sourceTag }, sourceWorldId: String(episode.player.worldId) });
          markKeyEvent();
          syncLogicState(episode as ReturnType<typeof createBasicLogicChain>);
          emit({ turn: episode.metrics.totalSteps + 1, text: `Signal source toggled ${nextState ? "on" : "off"}.`, tone: "good" });
          return;
        }

        if (entity.kind === "logic_gate") {
          emit({ turn: episode.metrics.totalSteps + 1, text: `The ${String(entity.publicState.mode)} gate shows ${entity.publicState.output ? "high" : "low"} output.` });
          return;
        }

        emit({ turn: episode.metrics.totalSteps + 1, text: "The device does not accept direct calibration.", tone: "warn" });
      },
    },
  ],
  propagationRules: [
    {
      id: "propagate-logic-state",
      propagate: (episode, event, events) => propagateSignal(episode as ReturnType<typeof createBasicLogicChain>, event, events),
    },
  ],
  winCondition: {
    evaluate: (episode) => ({
      done: episode.hiddenState.hiddenFlags.objectiveMet === true,
      reward: episode.hiddenState.hiddenFlags.objectiveMet === true ? 1 : 0,
      event:
        episode.hiddenState.hiddenFlags.objectiveMet === true
          ? { turn: episode.metrics.totalSteps, text: "Signal pattern matched the hidden receiver target.", tone: "good" }
          : undefined,
    }),
  },
  observationAdapter: {
    toObservation: (episode) => buildObservation(episode, signalLogicPlugin, episode.worlds[episode.player.worldId]),
  },
  rendererSkin: {
    palette: {
      background: "#10131e",
      panel: "#1a2033",
      accent: "#93c5fd",
      gridLine: "rgba(255,255,255,0.06)",
      tileFloor: "#2b3550",
      tileWall: "#0a0f19",
      player: "#f8d66d",
      glow: "rgba(147,197,253,0.28)",
    },
    entityAppearance: {
      signal_source: { fill: "#60a5fa", stroke: "#dbeafe", shape: "circle", label: "S" },
      logic_gate: { fill: "#818cf8", stroke: "#e0e7ff", shape: "square", label: "G" },
      receiver: { fill: "#34d399", stroke: "#d1fae5", shape: "hex", label: "R" },
      inverter: { fill: "#f472b6", stroke: "#fce7f3", shape: "diamond", label: "N" },
    },
    tileAppearance: {
      ".": { fill: "#2b3550", stroke: "rgba(255,255,255,0.04)" },
      "#": { fill: "#0a0f19", stroke: "rgba(255,255,255,0.02)" },
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
    focus: "logic",
  }),
};
