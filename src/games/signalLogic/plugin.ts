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

const concealHiddenGateMode = (episode: ReturnType<typeof createBasicLogicChain>) => {
  if (episode.levelFamilyId !== "overlay_logic_stack") return;
  for (const worldId of ["w2", "w3"] as const) {
    const gate = episode.worlds[worldId].entities.find((entity) => entity.kind === "logic_gate");
    if (gate) {
      gate.publicState.mode = "unknown_overlay";
    }
  }
};

const receiver = (id: string, worldId: string, x: number, y: number, interactive = false): EntityState => ({
  id: asEntityId(id),
  kind: "receiver",
  worldId: asWorldId(worldId),
  position: { x, y },
  tags: interactive ? ["status", "logic", "interactive"] : ["status"],
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
  if (episode.levelFamilyId === "overlay_logic_stack") {
    const alphaActive = episode.hiddenState.hiddenFlags.alphaActive === true;
    const betaActive = episode.hiddenState.hiddenFlags.betaActive === true;
    const alphaOverlaySuppressed = episode.hiddenState.hiddenFlags.alphaOverlaySuppressed === true;
    const betaOverlaySuppressed = episode.hiddenState.hiddenFlags.betaOverlaySuppressed === true;
    const expected = alphaActive || betaActive;
    const overlayAlpha = alphaActive && !alphaOverlaySuppressed;
    const overlayBeta = betaActive && !betaOverlaySuppressed;
    const overlayCount = Number(overlayAlpha) + Number(overlayBeta);
    const observed = Boolean(expected !== overlayAlpha !== overlayBeta);
    const anomalyDetected = observed !== expected;
    const overlayTags = [
      overlayAlpha ? "alpha-side-interference" : "",
      overlayBeta ? "beta-side-interference" : "",
    ].filter(Boolean);
    const mainWorld = episode.worlds.w1;
    const baselineGate = mainWorld.entities.find((entity) => entity.kind === "logic_gate");
    const mainReceiver = mainWorld.entities.find((entity) => entity.kind === "receiver");
    const alphaChamberGate = episode.worlds.w2.entities.find((entity) => entity.kind === "logic_gate");
    const betaChamberGate = episode.worlds.w3.entities.find((entity) => entity.kind === "logic_gate");

    if (baselineGate) {
      baselineGate.publicState.output = expected;
      baselineGate.hiddenState.output = expected;
    }
    if (mainReceiver) {
      mainReceiver.publicState.output = observed;
      mainReceiver.hiddenState.output = observed;
      mainReceiver.publicState.expected = expected ? "high" : "low";
      mainReceiver.hiddenState.expected = expected ? "high" : "low";
      mainReceiver.publicState.anomaly = anomalyDetected;
      mainReceiver.hiddenState.anomaly = anomalyDetected;
    }
    if (alphaChamberGate) {
      alphaChamberGate.publicState.mode = "unknown_overlay";
      alphaChamberGate.publicState.output = overlayAlpha;
      alphaChamberGate.hiddenState.output = overlayAlpha;
      alphaChamberGate.publicState.calibrated = alphaOverlaySuppressed ? "bypassed" : "engaged";
      alphaChamberGate.hiddenState.calibrated = alphaOverlaySuppressed ? "bypassed" : "engaged";
    }
    if (betaChamberGate) {
      betaChamberGate.publicState.mode = "unknown_overlay";
      betaChamberGate.publicState.output = overlayBeta;
      betaChamberGate.hiddenState.output = overlayBeta;
      betaChamberGate.publicState.calibrated = betaOverlaySuppressed ? "bypassed" : "engaged";
      betaChamberGate.hiddenState.calibrated = betaOverlaySuppressed ? "bypassed" : "engaged";
    }

    episode.hiddenState.hiddenFlags.expectedVisibleOutput = expected ? "high" : "low";
    episode.hiddenState.hiddenFlags.visibleOutput = observed ? "high" : "low";
    episode.hiddenState.hiddenFlags.anomalyDetected = anomalyDetected;
    episode.hiddenState.hiddenFlags.activeOverlayCount = overlayCount;
    const alphaOnlyAnomaly = alphaActive && !betaActive && anomalyDetected;
    const betaOnlyAnomaly = betaActive && !alphaActive && anomalyDetected;
    if (alphaOnlyAnomaly) episode.hiddenState.hiddenFlags.alphaAnomalyObserved = true;
    if (betaOnlyAnomaly) episode.hiddenState.hiddenFlags.betaAnomalyObserved = true;
    episode.hiddenState.hiddenFlags.alphaTraceReady = alphaOnlyAnomaly;
    episode.hiddenState.hiddenFlags.betaTraceReady = betaOnlyAnomaly;
    const stackedStable = observed === true && anomalyDetected === false && alphaActive && betaActive;
    episode.hiddenState.hiddenFlags.objectiveMet = stackedStable;

    const inspectedAlpha = episode.hiddenState.hiddenFlags.overlayAlphaInspected === true;
    const inspectedBeta = episode.hiddenState.hiddenFlags.overlayBetaInspected === true;
    const currentWorldId = String(episode.player.worldId);
    const reportAccepted = episode.hiddenState.hiddenFlags.reportAccepted === true;
    const discoveredAlpha = episode.publicState.discoveredWorldIds.includes(asWorldId("w2"));
    const discoveredBeta = episode.publicState.discoveredWorldIds.includes(asWorldId("w3"));
    const worldCompleteness = [discoveredAlpha, discoveredBeta, inspectedAlpha, inspectedBeta].filter(Boolean).length / 4;
    const nextObjective =
      alphaOnlyAnomaly && !discoveredAlpha
          ? "An alpha-side anomaly is visible. Inspect the main receiver to trace where the mismatch is coming from."
          : alphaOnlyAnomaly && discoveredAlpha && !inspectedAlpha
            ? "The alpha-side chamber has been traced. Possess it and inspect the hidden device for clues."
          : betaOnlyAnomaly && !discoveredBeta
              ? "A beta-side anomaly is visible. Inspect the main receiver to trace the new mismatch into its hidden chamber."
              : betaOnlyAnomaly && discoveredBeta && !inspectedBeta
                ? "The beta-side chamber has been traced. Possess it and inspect the hidden device for clues."
                : !alphaActive
                  ? "Toggle the alpha source and compare the expected OR output with the observed receiver output."
                  : !betaActive
                    ? "Return to the main world, toggle the beta source, and compare expected versus observed output again."
                : !stackedStable
                  ? "Use both visible sources together so stacked hidden overlays act on the same main receiver."
                  : !reportAccepted
                  ? "You have enough evidence. Submit a report that states the hidden world count and the concrete overlay rules."
                  : "The report has been accepted.";

    setPublicStats(episode, {
      baselineRule: "visible_or",
      expectedVisibleOutput: expected ? "high" : "low",
      observedMainOutput: observed ? "high" : "low",
      anomalyDetected,
      traceableAnomaly: alphaOnlyAnomaly ? "alpha" : betaOnlyAnomaly ? "beta" : "none",
      activeOverlayCount: overlayCount,
      activeOverlays: overlayTags.join(", ") || "none",
      alphaOverlayState: alphaOverlaySuppressed ? "bypassed" : alphaActive ? "engaged" : "idle",
      betaOverlayState: betaOverlaySuppressed ? "bypassed" : betaActive ? "engaged" : "idle",
      hiddenWorldCountTarget: 2,
      hiddenWorldCompleteness: Number(worldCompleteness.toFixed(2)),
      reportAccepted,
      nextObjective,
    });

    const anomalyHint =
      currentWorldId === "w1"
        ? anomalyDetected
          ? "The main receiver violates the visible OR rule. Interact with the receiver itself to trace the anomaly before any hidden chamber becomes accessible."
          : alphaActive || betaActive
            ? "No anomaly is visible right now. Change the visible source pattern and compare expected versus observed output."
            : "The visible console should follow a simple OR rule until a hidden overlay bleeds into it."
        : currentWorldId === "w2"
          ? inspectedAlpha
            ? "The alpha chamber can now be toggled between engaged and bypassed. Watch how that changes the main receiver."
            : "This hidden chamber explains the alpha-side anomaly. Interact with its gate and watch the main receiver change."
          : inspectedBeta
            ? "The beta chamber can now be toggled between engaged and bypassed. Watch how that changes the main receiver."
            : "This hidden chamber explains the beta-side anomaly. Interact with its gate and watch the main receiver change.";

    setHudHints(episode, [
      "The visible console advertises a simple OR rule for the main receiver.",
      "If the observed output disagrees with that OR rule, a hidden overlay is currently modifying the main world.",
      anomalyHint,
    ]);
    setExplicitRules(episode, [
      "The visible main-world rule is OR: if either source is on, the main receiver should be high.",
      "Observed disagreement between expected and actual main output indicates that a hidden-world overlay rule is active.",
      "A hidden chamber is not revealed immediately; you must first trace an observed anomaly from the main receiver.",
      "Interacting with a hidden chamber gate can engage or bypass that overlay, which changes the main receiver output.",
      "Multiple hidden overlays can stack on the same main-world receiver.",
      "You may submit a theory about how hidden overlays modify the visible rule.",
    ]);
    setMainTask(episode, {
      title: "Submit a complete hidden overlay report",
      description:
        "Use the visible OR console as your main task surface. Detect anomalies, inspect the hidden chambers that explain them, verify how multiple overlays stack on the same main receiver, and then submit a report that states how many hidden worlds are involved and what each hidden rule does.",
      completed: reportAccepted,
    });
    const hiddenTasks = [
      {
        id: "inspect-alpha-overlay",
        title: "Inspect the alpha anomaly chamber",
        description: "First trace the alpha anomaly from the main receiver, then inspect the hidden chamber it reveals.",
        worldId: asWorldId("w2"),
        completed: inspectedAlpha,
        discovered: episode.publicState.discoveredWorldIds.includes(asWorldId("w2")),
      },
      {
        id: "inspect-beta-overlay",
        title: "Inspect the beta anomaly chamber",
        description: "First trace the beta anomaly from the main receiver, then inspect the hidden chamber it reveals.",
        worldId: asWorldId("w3"),
        completed: inspectedBeta,
        discovered: episode.publicState.discoveredWorldIds.includes(asWorldId("w3")),
      },
      {
        id: "verify-stacked-overlays",
        title: "Verify stacked overlay interaction",
        description: "Show in the main world that multiple hidden overlays can stack on the same receiver and restore a stable output.",
        worldId: asWorldId("w1"),
        completed: stackedStable,
        discovered: true,
      },
      {
        id: "submit-overlay-report",
        title: "Submit the hidden overlay report",
        description: "Report the hidden world count and the concrete overlay rules governing the anomalies.",
        worldId: asWorldId("w1"),
        completed: reportAccepted,
        discovered: true,
      },
    ];
    setHiddenTasks(episode, hiddenTasks);
    const completedHidden = hiddenTasks.filter((task) => task.completed).length;
    setScoreBreakdown(episode, {
      mainTaskScore: reportAccepted ? 1 : 0,
      hiddenTaskScore: hiddenTasks.length > 0 ? completedHidden / hiddenTasks.length : 0,
      efficiencyScore: Math.max(0, 1 - episode.metrics.totalSteps / 24),
    });
    return;
  }

  setPublicStats(episode, {
    localSignal: String(episode.worlds[episode.player.worldId].localFlags.signalState ?? "idle"),
    visibleOutput: String(episode.hiddenState.hiddenFlags.visibleOutput ?? "unknown"),
  });
  setHudHints(episode, [
    "Toggle signal sources and watch which gates or receivers change in other worlds.",
    "The hidden target is a logic pattern, not a destination tile.",
  ]);
  if (String(episode.hiddenState.hiddenFlags.visibleOutput ?? "idle") !== "idle") {
    if (episode.worlds.w2) discoverWorld(episode, "w2");
    if (episode.worlds.w3) discoverWorld(episode, "w3");
    if (episode.worlds.w4) discoverWorld(episode, "w4");
  }
  setExplicitRules(episode, [
    "A main-world logic objective anchors the episode.",
    "Discovered hidden logic chambers can be possessed.",
    "Logic states propagate through hidden signal links and transform remotely.",
    "You may submit a theory about the hidden logic rule with evidence.",
  ]);
  setMainTask(episode, {
    title: "Match the hidden logic target",
    description:
      episode.levelFamilyId === "fork_logic_merge"
        ? "Align multiple hidden signal branches until the merge receiver reaches its target state."
        : "Infer the hidden logic chain and drive the remote receiver into the target pattern.",
    completed: episode.hiddenState.hiddenFlags.objectiveMet === true,
  });
  const hiddenTasks =
    episode.levelFamilyId === "fork_logic_merge"
      ? [
          {
            id: "alpha-signal",
            title: "Activate alpha signal",
            description: "Drive the alpha branch into an active state.",
            worldId: asWorldId("w1"),
            completed: episode.hiddenState.hiddenFlags.alphaSignal === true,
            discovered: true,
          },
          {
            id: "beta-signal",
            title: "Activate beta signal",
            description: "Drive the beta branch into an active state.",
            worldId: asWorldId("w2"),
            completed: episode.hiddenState.hiddenFlags.betaSignal === true,
            discovered: episode.publicState.discoveredWorldIds.includes(asWorldId("w2")),
          },
          {
            id: "merge-receiver",
            title: "Satisfy the merge receiver",
            description: "Drive the final merged receiver to the target output.",
            worldId: asWorldId("w4"),
            completed: episode.hiddenState.hiddenFlags.objectiveMet === true,
            discovered: episode.publicState.discoveredWorldIds.includes(asWorldId("w4")),
          },
        ]
      : [
          {
            id: "gate-room",
            title: "Reveal the hidden gate room",
            description: "Observe and infer the remote transformation world.",
            worldId: asWorldId("w2"),
            completed: episode.worlds.w2.entities.some((entity) => entity.kind === "logic_gate" && entity.hiddenState.output === true),
            discovered: episode.publicState.discoveredWorldIds.includes(asWorldId("w2")),
          },
          {
            id: "receiver-room",
            title: "Match the receiver room",
            description: "Drive the hidden receiver into the target state.",
            worldId: asWorldId("w3"),
            completed: episode.hiddenState.hiddenFlags.objectiveMet === true,
            discovered: episode.publicState.discoveredWorldIds.includes(asWorldId("w3")),
          },
        ];
  setHiddenTasks(episode, hiddenTasks);
  const completedHidden = hiddenTasks.filter((task) => task.completed).length;
  setScoreBreakdown(episode, {
    mainTaskScore: episode.hiddenState.hiddenFlags.objectiveMet === true ? 1 : 0,
    hiddenTaskScore: hiddenTasks.length > 0 ? completedHidden / hiddenTasks.length : 0,
    efficiencyScore: Math.max(0, 1 - episode.metrics.totalSteps / (episode.levelFamilyId === "fork_logic_merge" ? 26 : 18)),
  });
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
  concealHiddenGateMode(episode);
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

const createOverlayLogicStack = (seed: number) => {
  const [alphaPos, betaPos, baselineGatePos, receiverPos] = seededPositions(seed + 91, logicCells, 4);
  const episode = createEpisodeBase({
    episodeSeed: seed,
    gameClassId: "signal_logic",
    levelFamilyId: "overlay_logic_stack",
    topology: {
      nodes: [asNodeId("w1"), asNodeId("w2"), asNodeId("w3")],
      edges: [
        { from: asNodeId("w2"), to: asNodeId("w1"), channel: "overlay", weight: 1 },
        { from: asNodeId("w3"), to: asNodeId("w1"), channel: "overlay", weight: 1 },
      ],
    } as TopologyGraph,
    hiddenFlags: {
      alphaActive: false,
      betaActive: false,
      alphaOverlaySuppressed: false,
      betaOverlaySuppressed: false,
      visibleOutput: "low",
      expectedVisibleOutput: "low",
      anomalyDetected: false,
      alphaAnomalyObserved: false,
      betaAnomalyObserved: false,
      alphaTraceReady: false,
      betaTraceReady: false,
      activeOverlayCount: 0,
      overlayAlphaInspected: false,
      overlayBetaInspected: false,
      objectiveMet: false,
      reportAccepted: false,
      reportedWorldCountCorrect: false,
      reportedRuleCoverage: 0,
    },
    worlds: [
      createWorld({
        id: "w1",
        label: "Visible Console",
        tiles: cloneRoomTiles(),
        entities: [
          signalSource("src-alpha-main", "w1", alphaPos.x, alphaPos.y, "alpha"),
          signalSource("src-beta-main", "w1", betaPos.x, betaPos.y, "beta"),
          logicGate("gate-main-or", "w1", baselineGatePos.x, baselineGatePos.y, "OR"),
          receiver("recv-main", "w1", receiverPos.x, receiverPos.y, true),
        ],
        localFlags: { signalState: "idle" },
      }),
      createWorld({
        id: "w2",
        label: "Alpha Shadow Chamber",
        tiles: cloneRoomTiles(),
        entities: [logicGate("gate-alpha-overlay", "w2", 4, 2, "XOR(alpha)"), inverter("inv-alpha", "w2", 5, 3)],
        localFlags: { signalState: "idle" },
      }),
      createWorld({
        id: "w3",
        label: "Beta Shadow Chamber",
        tiles: cloneRoomTiles(),
        entities: [logicGate("gate-beta-overlay", "w3", 4, 2, "XOR(beta)"), inverter("inv-beta", "w3", 3, 3)],
        localFlags: { signalState: "idle" },
      }),
    ],
    startWorldId: "w1",
  });
  syncLogicState(episode);
  return episode;
};

const propagateSignal = (episode: ReturnType<typeof createBasicLogicChain>, event: PropagationEvent, events: { turn: number; text: string; tone?: "neutral" | "good" | "warn" }[]) => {
  if (episode.levelFamilyId === "overlay_logic_stack") {
    const sourceTag = String(event.payload.sourceTag ?? "");
    const isActive = event.payload.active === true;
    if (sourceTag === "alpha") {
      episode.hiddenState.hiddenFlags.alphaActive = isActive;
      episode.worlds.w2.localFlags.signalState = isActive ? "overlay_armed" : "idle";
    }
    if (sourceTag === "beta") {
      episode.hiddenState.hiddenFlags.betaActive = isActive;
      episode.worlds.w3.localFlags.signalState = isActive ? "overlay_armed" : "idle";
    }
    syncLogicState(episode);
    const anomalyDetected = episode.hiddenState.hiddenFlags.anomalyDetected === true;
    const activeOverlayCount = Number(episode.hiddenState.hiddenFlags.activeOverlayCount ?? 0);
    if (anomalyDetected) {
      events.push({
        turn: episode.metrics.totalSteps + 1,
        text: `Observed output diverges from the visible OR rule. The mismatch can be traced from the main receiver, but its source is not yet visible.`,
        tone: "warn",
      });
    } else if (activeOverlayCount > 1 && episode.hiddenState.hiddenFlags.objectiveMet === true) {
      events.push({
        turn: episode.metrics.totalSteps + 1,
        text: "Combined activation restores consistency at the main receiver, suggesting that multiple hidden effects can compose on the same target.",
        tone: "good",
      });
    } else {
      events.push({
        turn: episode.metrics.totalSteps + 1,
        text: "The main receiver currently matches the visible OR rule.",
      });
    }
    return;
  }

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
    {
      id: "overlay_logic_stack",
      title: "Overlay Logic Stack",
      description: "The visible main-world rule is correct until hidden overlay chambers stack extra rules onto the same receiver.",
    },
  ],
  instanceGenerator: {
    generate: (seed, familyId) =>
      familyId === "fork_logic_merge"
        ? createForkLogicMerge(seed)
        : familyId === "overlay_logic_stack"
          ? createOverlayLogicStack(seed)
          : createBasicLogicChain(seed),
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

        if (entity.kind === "receiver" && episode.levelFamilyId === "overlay_logic_stack" && episode.player.worldId === "w1") {
          const alphaTraceReady = episode.hiddenState.hiddenFlags.alphaTraceReady === true;
          const betaTraceReady = episode.hiddenState.hiddenFlags.betaTraceReady === true;
          const discoveredAlpha = episode.publicState.discoveredWorldIds.includes(asWorldId("w2"));
          const discoveredBeta = episode.publicState.discoveredWorldIds.includes(asWorldId("w3"));

          if (alphaTraceReady && !discoveredAlpha) {
            discoverWorld(episode, "w2");
            emit({
              turn: episode.metrics.totalSteps + 1,
              text: "The receiver exposes a faint alpha-side side-channel. A previously hidden chamber can now be reached for investigation.",
              tone: "good",
            });
            return;
          }
          if (betaTraceReady && !discoveredBeta) {
            discoverWorld(episode, "w3");
            emit({
              turn: episode.metrics.totalSteps + 1,
              text: "The receiver isolates a beta-side interference path. A hidden chamber becomes reachable, but its rule is still unknown.",
              tone: "good",
            });
            return;
          }
          emit({
            turn: episode.metrics.totalSteps + 1,
            text:
              episode.hiddenState.hiddenFlags.anomalyDetected === true
                ? "The receiver confirms a mismatch, but you have already traced the currently visible anomaly."
                : "The receiver currently matches the visible rule, so there is no anomaly to trace.",
          });
          return;
        }

        if (entity.kind === "logic_gate") {
          if (episode.levelFamilyId === "overlay_logic_stack" && episode.player.worldId === "w2") {
            episode.hiddenState.hiddenFlags.overlayAlphaInspected = true;
            const nextSuppressed = episode.hiddenState.hiddenFlags.alphaOverlaySuppressed !== true;
            episode.hiddenState.hiddenFlags.alphaOverlaySuppressed = nextSuppressed;
            syncLogicState(episode as ReturnType<typeof createBasicLogicChain>);
            emit({
              turn: episode.metrics.totalSteps + 1,
              text: nextSuppressed
                ? "You bypass the alpha-side overlay. The main receiver should now lose one layer of hidden interference, giving you a direct intervention test."
                : "You re-engage the alpha-side overlay. The main receiver regains that hidden layer, so compare the visible output again.",
              tone: "good",
            });
            return;
          }
          if (episode.levelFamilyId === "overlay_logic_stack" && episode.player.worldId === "w3") {
            episode.hiddenState.hiddenFlags.overlayBetaInspected = true;
            const nextSuppressed = episode.hiddenState.hiddenFlags.betaOverlaySuppressed !== true;
            episode.hiddenState.hiddenFlags.betaOverlaySuppressed = nextSuppressed;
            syncLogicState(episode as ReturnType<typeof createBasicLogicChain>);
            emit({
              turn: episode.metrics.totalSteps + 1,
              text: nextSuppressed
                ? "You bypass the beta-side overlay. The main receiver should immediately drop one hidden layer, so use that change as evidence."
                : "You re-engage the beta-side overlay. The main receiver regains that hidden layer, so compare the public output once more.",
              tone: "good",
            });
            return;
          }
          emit({
            turn: episode.metrics.totalSteps + 1,
            text:
              entity.publicState.mode === "unknown_overlay"
                ? `The hidden gate is active=${entity.publicState.output ? "true" : "false"}, but its transformation rule is not labeled. You need to infer it from how main-world expectation and observed output diverge.`
                : `The ${String(entity.publicState.mode)} gate shows ${entity.publicState.output ? "high" : "low"} output.`,
          });
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
    evaluate: (episode) => {
      if (String(episode.levelFamilyId) === "overlay_logic_stack") {
        const accepted = episode.hiddenState.hiddenFlags.reportAccepted === true;
        return {
          done: accepted,
          reward: accepted ? Math.max(0, episode.publicState.scoreBreakdown.totalScore) : 0,
          event: accepted
            ? {
                turn: episode.metrics.totalSteps,
                text: "Overlay report accepted. Final reward is derived from report quality, world completeness, and efficiency.",
                tone: "good",
              }
            : undefined,
        };
      }
      return {
        done: episode.hiddenState.hiddenFlags.objectiveMet === true,
        reward: episode.hiddenState.hiddenFlags.objectiveMet === true ? 1 : 0,
        event:
          episode.hiddenState.hiddenFlags.objectiveMet === true
            ? { turn: episode.metrics.totalSteps, text: "Signal pattern matched the hidden receiver target.", tone: "good" }
            : undefined,
      };
    },
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
  getPlayerSpawn: (episode) => {
    if (String(episode.levelFamilyId) === "overlay_logic_stack") {
      if (String(episode.player.worldId) === "w2" || String(episode.player.worldId) === "w3") {
        return { x: 4, y: 2 };
      }
    }
    return { x: 1, y: 1 };
  },
  getPublicPlayerStatus: () => ({
    focus: "logic",
  }),
  syncBenchmarkState: (episode) => syncLogicState(episode as ReturnType<typeof createBasicLogicChain>),
  evaluateTheorySubmission: (_episode, submission) => {
    const text = `${submission.hypothesizedRule} ${submission.evidence}`.toLowerCase();
    if (String(_episode.levelFamilyId) === "overlay_logic_stack") {
      const mentionsVisibleRule = text.includes("or") || text.includes("visible rule") || text.includes("main rule");
      const mentionsOverlay = text.includes("overlay") || text.includes("hidden chamber") || text.includes("hidden rule");
      const mentionsStack = text.includes("stack") || text.includes("same receiver") || text.includes("together") || text.includes("cancel");
      const mentionsFlip = text.includes("xor") || text.includes("flip") || text.includes("invert");
      const mentionsAlpha = text.includes("alpha") || text.includes("w2");
      const mentionsBeta = text.includes("beta") || text.includes("w3");
      const mentionsTwoWorlds =
        text.includes("2 hidden") ||
        text.includes("two hidden") ||
        text.includes("2 overlay") ||
        text.includes("two overlay") ||
        text.includes("two chambers") ||
        text.includes("2 chambers") ||
        (mentionsAlpha && mentionsBeta);
      const discoveredAlpha = _episode.publicState.discoveredWorldIds.includes(asWorldId("w2"));
      const discoveredBeta = _episode.publicState.discoveredWorldIds.includes(asWorldId("w3"));
      const inspectedAlpha = _episode.hiddenState.hiddenFlags.overlayAlphaInspected === true;
      const inspectedBeta = _episode.hiddenState.hiddenFlags.overlayBetaInspected === true;
      const worldCompleteness =
        [discoveredAlpha, discoveredBeta, inspectedAlpha, inspectedBeta].filter(Boolean).length / 4;
      const ruleCoverage =
        [mentionsVisibleRule, mentionsOverlay, mentionsStack, mentionsFlip, mentionsAlpha, mentionsBeta, mentionsTwoWorlds].filter(Boolean)
          .length / 7;
      const reportAccepted = worldCompleteness >= 0.75 && ruleCoverage >= 0.85;
      _episode.hiddenState.hiddenFlags.reportAccepted = reportAccepted;
      _episode.hiddenState.hiddenFlags.reportedWorldCountCorrect = mentionsTwoWorlds;
      _episode.hiddenState.hiddenFlags.reportRuleCoverage = ruleCoverage;
      return {
        ruleDiscoveryScore: reportAccepted ? 1 : Math.max(0.2, Number(ruleCoverage.toFixed(2))),
        evidenceScore: Math.max(0.2, Number(worldCompleteness.toFixed(2))),
        feedback:
          reportAccepted
            ? "Report accepted: you identified that the visible world follows OR, that there are two relevant hidden overlay chambers, that each chamber contributes an XOR-like flip, and that stacked overlays can cancel on the same main receiver."
            : "Report noted, but it should state the hidden world count and explain the visible OR rule, the alpha and beta overlay chambers, and how their XOR-like overlays stack on the same main receiver.",
      };
    }
    const mentionsSignal = text.includes("signal") || text.includes("logic") || text.includes("receiver") || text.includes("gate");
    const mentionsTransform = text.includes("invert") || text.includes("and") || text.includes("merge") || text.includes("pattern");
    return {
      ruleDiscoveryScore: mentionsSignal && mentionsTransform ? 1 : mentionsSignal ? 0.5 : 0,
      evidenceScore: submission.evidence.trim() ? 0.8 : 0.25,
      feedback:
        mentionsSignal && mentionsTransform
          ? "Theory accepted: hidden signal transformations determine the remote receiver pattern."
          : "Theory noted, but it does not yet capture the hidden logic transformation rule.",
    };
  },
};
