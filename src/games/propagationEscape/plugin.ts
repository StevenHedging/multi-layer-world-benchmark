import type {
  EntityState,
  EpisodeInstance,
  EventFeedback,
  PublicActionSchema,
  TopologyGraph,
  WorldState,
} from "../../types/core";
import type { GameClassPlugin, PropagationEvent } from "../../types/plugin";
import { createEpisodeBase, createWorld } from "../shared/builders";
import {
  discoverWorld,
  setExplicitRules,
  setHiddenTasks,
  setHudHints,
  setImplicitRuleSignals,
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
    { type: "interact", description: "Toggle local devices or enter an open exit" },
    { type: "switch_world", description: "Cycle to the next discovered hidden world" },
    { type: "wait", description: "Pause for one step" },
  ],
};

const baseTiles = [
  "#########",
  "#.......#",
  "#.......#",
  "#.......#",
  "#.......#",
  "#########",
];

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

const routerEntity = (id: string, worldId: string, x: number, y: number): EntityState => ({
  id: asEntityId(id),
  kind: "router",
  worldId: asWorldId(worldId),
  position: { x, y },
  tags: ["interactive", "config"],
  publicState: { route: "north" },
  hiddenState: { route: "north" },
});

const lensEntity = (id: string, worldId: string, x: number, y: number): EntityState => ({
  id: asEntityId(id),
  kind: "lens",
  worldId: asWorldId(worldId),
  position: { x, y },
  tags: ["interactive", "config"],
  publicState: { phase: "direct" },
  hiddenState: { phase: "direct" },
});

const sensorEntity = (id: string, worldId: string, x: number, y: number): EntityState => ({
  id: asEntityId(id),
  kind: "sensor",
  worldId: asWorldId(worldId),
  position: { x, y },
  tags: ["status"],
  publicState: { readout: "idle" },
  hiddenState: { readout: "idle" },
});

const anchorEntity = (id: string, worldId: string, x: number, y: number): EntityState => ({
  id: asEntityId(id),
  kind: "anchor",
  worldId: asWorldId(worldId),
  position: { x, y },
  tags: ["interactive", "gate"],
  publicState: { aligned: false },
  hiddenState: { aligned: false },
});

const stabilizerEntity = (id: string, worldId: string, x: number, y: number): EntityState => ({
  id: asEntityId(id),
  kind: "stabilizer",
  worldId: asWorldId(worldId),
  position: { x, y },
  tags: ["interactive", "config"],
  publicState: { tuned: false, ready: false },
  hiddenState: { tuned: false, ready: false },
});

const findEntity = (world: WorldState, kind: string) => world.entities.find((entity) => entity.kind === kind);

const setRelayPowered = (world: WorldState, powered: boolean) => {
  const relay = findEntity(world, "relay");
  const stabilizer = findEntity(world, "stabilizer");
  if (relay) {
    relay.publicState.powered = powered;
    relay.hiddenState.powered = powered;
  }
  if (stabilizer) {
    stabilizer.publicState.ready = powered;
    stabilizer.hiddenState.ready = powered;
  }
};

const setExitOpen = (world: WorldState, open: boolean) => {
  const relay = findEntity(world, "relay");
  const exit = findEntity(world, "exit");
  if (relay) {
    relay.publicState.powered = open;
    relay.hiddenState.powered = open;
  }
  if (exit) {
    exit.publicState.open = open;
    exit.hiddenState.open = open;
  }
};

const updateMainWorldReadout = (episode: EpisodeInstance, readout: string) => {
  const sensor = findEntity(episode.worlds.w1, "sensor");
  const pulse = findEntity(episode.worlds.w1, "switch");
  const anchor = findEntity(episode.worlds.w1, "anchor");
  const router = findEntity(episode.worlds.w1, "router");
  const lens = findEntity(episode.worlds.w1, "lens");
  if (sensor) {
    sensor.publicState.readout = readout;
    sensor.hiddenState.readout = readout;
  }
  if (pulse) {
    pulse.publicState.active = true;
    pulse.hiddenState.active = true;
  }
  setPublicStats(episode, {
    anchorAligned: Boolean(anchor?.publicState.aligned ?? false),
    route: String(router?.publicState.route ?? "unknown"),
    phase: String(lens?.publicState.phase ?? "unknown"),
    sensor: readout,
  });
};

const updateDynamicHints = (episode: EpisodeInstance) => {
  if (episode.levelFamilyId === "phase_router") {
    const anchorAligned = episode.hiddenState.hiddenFlags.anchorAligned === true;
    const route = String(findEntity(episode.worlds.w1, "router")?.publicState.route ?? "north");
    const phase = String(findEntity(episode.worlds.w1, "lens")?.publicState.phase ?? "direct");
    const oracleUses = Number(episode.hiddenState.hiddenFlags.oracleUses ?? 0);
    const currentWorld = String(episode.player.worldId);
    const northReady = episode.hiddenState.hiddenFlags.northReady === true;
    const southReady = episode.hiddenState.hiddenFlags.southReady === true;
    const northStabilized = episode.hiddenState.hiddenFlags.northStabilized === true;
    const southStabilized = episode.hiddenState.hiddenFlags.southStabilized === true;
    const exitOpen = episode.hiddenState.hiddenFlags.exitOpen === true;
    let phaseHint = anchorAligned
      ? "Advance the vault sequence by changing one device at a time before pulsing again."
      : "After aligning the anchor, test one local device change at a time to advance the main task.";

    if (currentWorld === "w1") {
      if (northReady && !northStabilized) {
        phaseHint = "The north branch is armed. Possess its discovered hidden world, complete its local stabilization, then return here.";
      } else if (northStabilized && !southReady) {
        phaseHint = "The north branch is complete. Return focus to the workshop and configure the next pulse for the south branch.";
      } else if (southReady && !southStabilized) {
        phaseHint = "The south branch is armed. Possess its discovered hidden world, complete its local stabilization, then return here.";
      } else if (northStabilized && southStabilized && !exitOpen) {
        phaseHint = "Both branch follow-up tasks are complete. Stay in the workshop, find the final pulse, and open the vault.";
      } else if (exitOpen) {
        phaseHint = "The vault is open in a deeper world. Submit the rule report if needed, then possess the vault world and escape.";
      }
    }

    if (currentWorld === "w2") {
      phaseHint = northStabilized
        ? "This branch follow-up is complete. Return to the workshop and continue the main task."
        : northReady
          ? "This hidden world matters because it contains the required north-branch follow-up. Stabilize it, then return to the workshop."
          : "Nothing essential can be completed here yet. Return to the workshop and advance the main task there.";
    }

    if (currentWorld === "w3") {
      phaseHint = southStabilized
        ? "This branch follow-up is complete. Return to the workshop and continue the main task."
        : southReady
          ? "This hidden world matters because it contains the required south-branch follow-up. Stabilize it, then return to the workshop."
          : "Nothing essential can be completed here yet. Return to the workshop and advance the main task there.";
    }

    if (currentWorld === "w4") {
      phaseHint = exitOpen
        ? "The main objective is now directly reachable here. If the rule report requirement is satisfied, go to the exit."
        : "The vault world is not ready yet. Return to the workshop and finish the main task sequence first.";
    }

    setHudHints(episode, [
      anchorAligned ? "Main-world devices can combine into different remote effects." : "The workshop is dormant until the anchor is aligned.",
      `Current router route: ${route}. Current lens phase: ${phase}.`,
      phaseHint,
      oracleUses > 0 ? `Oracle used ${oracleUses} time(s); each use lowers the final score.` : "Oracle is available if you are stuck, but it lowers the final score.",
    ]);
    return;
  }

  setHudHints(episode, [
    "Switches can trigger remote changes in hidden worlds.",
    "Inspect newly discovered worlds after a strong event.",
    "Submit a theory once you can explain the propagation pattern.",
  ]);
};

const phaseRouterMainTaskDescription =
  "Open the resonance vault as the primary objective. Do that by awakening the workshop, learning which visible configurations advance the vault sequence, entering any newly discovered hidden branch only when it is required to complete a local follow-up step, triggering final resonance, and then submitting the hidden rule report before escaping.";

const oracleHintForEpisode = (episode: EpisodeInstance) => {
  if (episode.levelFamilyId === "phase_router") {
    if (episode.hiddenState.hiddenFlags.anchorAligned !== true) {
      return { text: "Oracle: the workshop remains dormant until the visible anchor is aligned." };
    }
    if (episode.hiddenState.hiddenFlags.northReady !== true) {
      return { text: "Oracle: with the anchor awake, use the branch-arming phase on the current north route to reveal the first hidden branch." };
    }
    if (episode.hiddenState.hiddenFlags.northStabilized !== true) {
      return { text: "Oracle: arming the north branch is not enough; possess the discovered north world and tune its stabilizer." };
    }
    if (episode.hiddenState.hiddenFlags.southReady !== true) {
      return { text: "Oracle: one visible configuration change should send the same direct pulse to the other branch." };
    }
    if (episode.hiddenState.hiddenFlags.southStabilized !== true) {
      return { text: "Oracle: the south branch also has a local hidden-world follow-up task before resonance can work." };
    }
    if (episode.hiddenState.hiddenFlags.exitOpen !== true) {
      return { text: "Oracle: after both branches are armed and stabilized, the final workshop pulse requires the opposite phase." };
    }
    if (episode.publicState.scoreBreakdown.ruleDiscoveryScore < 0.8) {
      return {
        text: "Oracle: the required theory should mention the anchor gate, route and phase combination, hidden-world stabilization, and the final resonance pulse.",
      };
    }
    return { text: "Oracle: the vault is ready; finish the run by reaching the open exit." };
  }

  return { text: "Oracle: inspect the latest remote effect, then visit any newly discovered world before repeating the same trigger." };
};

const syncPropagationBenchmarkState = (episode: EpisodeInstance) => {
  if (episode.levelFamilyId === "phase_router") {
    const anchorAligned = episode.hiddenState.hiddenFlags.anchorAligned === true;
    const implicitRuleSignals = [
      anchorAligned ? "The anchor awakens the workshop; before that, pulses do not enter the hidden network." : "",
      episode.hiddenState.hiddenFlags.northReady === true ? "With route=north and phase=direct, the pulse arms the north branch." : "",
      episode.hiddenState.hiddenFlags.southReady === true ? "With route=south and phase=direct, the pulse arms the south branch." : "",
      episode.hiddenState.hiddenFlags.northStabilized === true ? "The armed north branch still required local hidden-world stabilization." : "",
      episode.hiddenState.hiddenFlags.southStabilized === true ? "The armed south branch still required local hidden-world stabilization." : "",
      episode.hiddenState.hiddenFlags.resonanceReady === true
        ? "After both branches are armed and stabilized, an inverted pulse triggers resonance and opens the remote vault."
        : "",
      episode.hiddenState.hiddenFlags.lastReadout === "interference"
        ? "Some visible configurations only cause interference, not propagation."
        : "",
    ].filter(Boolean);

    if (episode.hiddenState.hiddenFlags.northReady === true) discoverWorld(episode, "w2");
    if (episode.hiddenState.hiddenFlags.southReady === true) discoverWorld(episode, "w3");
    if (episode.hiddenState.hiddenFlags.exitOpen === true) discoverWorld(episode, "w4");

    setExplicitRules(episode, [
      "A visible main-world objective anchors the episode.",
      "Hidden worlds must be discovered before possession can target them.",
      "Some mechanisms remain dormant until the visible workshop anchor is aligned.",
      "Main-world devices can interact: router route and lens phase change what the pulse switch does.",
      "The same local pulse can create different remote effects under different visible configurations.",
      "Escaping the vault also requires submitting a sufficiently correct hidden-rule theory with evidence.",
      "You may request an oracle hint, but each request lowers the final score.",
    ]);
    setImplicitRuleSignals(episode, implicitRuleSignals);
    setMainTask(episode, {
      title: "Open the resonance vault",
      description: phaseRouterMainTaskDescription,
      completed: episode.hiddenState.hiddenFlags.playerEscaped === true,
    });

    const hiddenTasks = [
      {
        id: "anchor-alignment",
        title: "Align the workshop anchor",
        description: "Wake the main-world mechanism that unlocks hidden propagation.",
        worldId: asWorldId("w1"),
        completed: anchorAligned,
        discovered: true,
      },
      {
        id: "north-branch",
        title: "Arm the north branch",
        description: "Discover and energize the north hidden branch through the correct local device configuration.",
        worldId: asWorldId("w2"),
        completed: episode.hiddenState.hiddenFlags.northReady === true,
        discovered: episode.publicState.discoveredWorldIds.includes(asWorldId("w2")),
      },
      {
        id: "north-stabilizer",
        title: "Stabilize the north branch",
        description: "Possess the north hidden world and tune its stabilizer after the branch is armed.",
        worldId: asWorldId("w2"),
        completed: episode.hiddenState.hiddenFlags.northStabilized === true,
        discovered: episode.publicState.discoveredWorldIds.includes(asWorldId("w2")),
      },
      {
        id: "south-branch",
        title: "Arm the south branch",
        description: "Discover and energize the south hidden branch through the correct local device configuration.",
        worldId: asWorldId("w3"),
        completed: episode.hiddenState.hiddenFlags.southReady === true,
        discovered: episode.publicState.discoveredWorldIds.includes(asWorldId("w3")),
      },
      {
        id: "south-stabilizer",
        title: "Stabilize the south branch",
        description: "Possess the south hidden world and tune its stabilizer after the branch is armed.",
        worldId: asWorldId("w3"),
        completed: episode.hiddenState.hiddenFlags.southStabilized === true,
        discovered: episode.publicState.discoveredWorldIds.includes(asWorldId("w3")),
      },
      {
        id: "resonance-vault",
        title: "Trigger resonance",
        description: "After both branches are armed and stabilized, find the configuration that opens the remote vault.",
        worldId: asWorldId("w4"),
        completed: episode.hiddenState.hiddenFlags.exitOpen === true,
        discovered: episode.publicState.discoveredWorldIds.includes(asWorldId("w4")),
      },
      {
        id: "rule-report",
        title: "Submit the hidden rule",
        description: "Before escaping, submit a theory that explains the gate, routing, hidden-world stabilization, and final resonance.",
        worldId: asWorldId("w1"),
        completed: episode.publicState.scoreBreakdown.ruleDiscoveryScore >= 0.8,
        discovered: true,
      },
    ];
    setHiddenTasks(episode, hiddenTasks);

    const completedHidden = hiddenTasks.filter((task) => task.completed).length;
    const hiddenTaskScore = completedHidden / hiddenTasks.length;
    const oracleUses = Number(episode.hiddenState.hiddenFlags.oracleUses ?? 0);
    const efficiencyScore = Math.max(0, 1 - episode.metrics.totalSteps / 56 - oracleUses * 0.08);
    const nextObjective =
      !anchorAligned
        ? "Align the workshop anchor."
        : !episode.hiddenState.hiddenFlags.northReady
          ? "Use the workshop to arm the north branch."
          : !episode.hiddenState.hiddenFlags.northStabilized
            ? "Possess the north hidden world and stabilize its branch."
            : !episode.hiddenState.hiddenFlags.southReady
              ? "Return to the workshop and arm the south branch."
              : !episode.hiddenState.hiddenFlags.southStabilized
                ? "Possess the south hidden world and stabilize its branch."
                : !episode.hiddenState.hiddenFlags.exitOpen
                  ? "Return to the workshop and trigger the final resonance pulse."
                  : episode.publicState.scoreBreakdown.ruleDiscoveryScore < 0.8
                    ? "Submit the required rule report before escaping."
                    : "Possess the vault world and escape.";
    setPublicStats(episode, {
      ...episode.publicState.publicStats,
      oracleUses,
      nextObjective,
    });
    setScoreBreakdown(episode, {
      mainTaskScore:
        episode.hiddenState.hiddenFlags.playerEscaped === true && episode.publicState.scoreBreakdown.ruleDiscoveryScore >= 0.8 ? 1 : 0,
      hiddenTaskScore,
      efficiencyScore,
    });
    updateDynamicHints(episode);
    return;
  }

  if (episode.hiddenState.hiddenFlags.propagatedToW2 === true) {
    discoverWorld(episode, "w2");
  }
  if (episode.hiddenState.hiddenFlags.propagatedToW3 === true || episode.hiddenState.hiddenFlags.exitOpen === true) {
    discoverWorld(episode, episode.levelFamilyId === "fork_join_basic" ? "w4" : "w3");
  }
  if (episode.levelFamilyId === "fork_join_basic") {
    if (episode.hiddenState.hiddenFlags.northReady === true) discoverWorld(episode, "w2");
    if (episode.hiddenState.hiddenFlags.southReady === true) discoverWorld(episode, "w3");
    if (episode.hiddenState.hiddenFlags.exitOpen === true) discoverWorld(episode, "w4");
  }

  setExplicitRules(episode, [
    "A visible main-world objective anchors the episode.",
    "Hidden worlds must be discovered before possession can target them.",
    "Switches propagate through hidden topology and may unlock distant exits.",
    "You may submit a theory about the hidden propagation rule with evidence.",
  ]);
  setMainTask(episode, {
    title: "Escape from the benchmark network",
    description:
      episode.levelFamilyId === "fork_join_basic"
        ? "Discover enough of the hidden branch structure to open the convergence exit."
        : "Discover how local switches unlock the distant exit and escape.",
    completed: episode.hiddenState.hiddenFlags.playerEscaped === true,
  });

  const hiddenTasks =
    episode.levelFamilyId === "fork_join_basic"
      ? [
          {
            id: "north-branch",
            title: "Prime the north branch",
            description: "Discover and energize the north branch relay path.",
            worldId: asWorldId("w2"),
            completed: episode.hiddenState.hiddenFlags.northReady === true,
            discovered: episode.publicState.discoveredWorldIds.includes(asWorldId("w2")),
          },
          {
            id: "south-branch",
            title: "Prime the south branch",
            description: "Discover and energize the south branch relay path.",
            worldId: asWorldId("w3"),
            completed: episode.hiddenState.hiddenFlags.southReady === true,
            discovered: episode.publicState.discoveredWorldIds.includes(asWorldId("w3")),
          },
          {
            id: "convergence-exit",
            title: "Open the convergence exit",
            description: "Unlock the remote exit in the convergence world.",
            worldId: asWorldId("w4"),
            completed: episode.hiddenState.hiddenFlags.exitOpen === true,
            discovered: episode.publicState.discoveredWorldIds.includes(asWorldId("w4")),
          },
        ]
      : [
          {
            id: "relay-middle",
            title: "Discover the middle relay",
            description: "Cause a remote mechanism to respond in the intermediate hidden world.",
            worldId: asWorldId("w2"),
            completed: episode.hiddenState.hiddenFlags.propagatedToW2 === true,
            discovered: episode.publicState.discoveredWorldIds.includes(asWorldId("w2")),
          },
          {
            id: "unlock-exit",
            title: "Unlock the distant exit",
            description: "Propagate enough information to open the exit in the deepest hidden world.",
            worldId: asWorldId("w3"),
            completed: episode.hiddenState.hiddenFlags.exitOpen === true,
            discovered: episode.publicState.discoveredWorldIds.includes(asWorldId("w3")),
          },
        ];
  setHiddenTasks(episode, hiddenTasks);

  const completedHidden = hiddenTasks.filter((task) => task.completed).length;
  const hiddenTaskScore = hiddenTasks.length > 0 ? completedHidden / hiddenTasks.length : 0;
  const oracleUses = Number(episode.hiddenState.hiddenFlags.oracleUses ?? 0);
  const efficiencyScore = Math.max(
    0,
    1 - episode.metrics.totalSteps / (episode.levelFamilyId === "fork_join_basic" ? 24 : 18) - oracleUses * 0.08,
  );
  setPublicStats(episode, {
    ...episode.publicState.publicStats,
    oracleUses,
  });
  setScoreBreakdown(episode, {
    mainTaskScore: episode.hiddenState.hiddenFlags.playerEscaped === true ? 1 : 0,
    hiddenTaskScore,
    efficiencyScore,
  });
  updateDynamicHints(episode);
};

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
    mainTask: {
      title: "Escape from the network",
      description: "Use hidden propagation to open the remote exit.",
    },
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
    mainTask: {
      title: "Escape from the convergence network",
      description: "Uncover both hidden branches and open the final convergence exit.",
    },
  });
};

const createPhaseRouterEpisode = (seed: number) => {
  const topology: TopologyGraph = {
    nodes: [asNodeId("w1"), asNodeId("w2"), asNodeId("w3"), asNodeId("w4")],
    edges: [
      { from: asNodeId("w1"), to: asNodeId("w2"), channel: "north-path" },
      { from: asNodeId("w1"), to: asNodeId("w3"), channel: "south-path" },
      { from: asNodeId("w2"), to: asNodeId("w4"), channel: "resonance" },
      { from: asNodeId("w3"), to: asNodeId("w4"), channel: "resonance" },
      { from: asNodeId("w1"), to: asNodeId("w4"), channel: "phase-gate" },
    ],
  };
  const worlds = [
    createWorld({
      id: "w1",
      label: "Signal Workshop",
      tiles: baseTiles,
      entities: [
        switchEntity("pulse-switch", "w1", 2, 2),
        anchorEntity("workshop-anchor", "w1", 2, 3),
        routerEntity("signal-router", "w1", 4, 2),
        lensEntity("phase-lens", "w1", 6, 2),
        sensorEntity("readout", "w1", 4, 3),
      ],
      localFlags: { route: "north", phase: "direct", anchorAligned: false },
    }),
    createWorld({
      id: "w2",
      label: "North Branch",
      tiles: baseTiles,
      entities: [relayEntity("north-relay", "w2", 4, 2), stabilizerEntity("north-stabilizer", "w2", 5, 3)],
    }),
    createWorld({
      id: "w3",
      label: "South Branch",
      tiles: baseTiles,
      entities: [relayEntity("south-relay", "w3", 4, 2), stabilizerEntity("south-stabilizer", "w3", 3, 3)],
    }),
    createWorld({
      id: "w4",
      label: "Resonance Vault",
      tiles: baseTiles,
      entities: [relayEntity("vault-relay", "w4", 4, 2), exitEntity("vault-exit", "w4", 6, 3)],
    }),
  ];
  return createEpisodeBase({
    episodeSeed: seed,
    gameClassId: "propagation_escape",
    levelFamilyId: "phase_router",
    topology,
    hiddenFlags: {
      exitWorld: "w4",
      anchorAligned: false,
      exitOpen: false,
      northReady: false,
      southReady: false,
      northStabilized: false,
      southStabilized: false,
      resonanceReady: false,
      lastReadout: "idle",
      oracleUses: 0,
    },
    worlds,
    startWorldId: "w1",
    explicitRules: [
      "The visible workshop contains multiple configurable devices.",
      "The anchor must be aligned before hidden propagation fully wakes up.",
      "Changing one visible device may alter what a later pulse does.",
      "Armed hidden branches may still require local stabilization inside the hidden worlds.",
      "Remote worlds must still be discovered before possession can target them.",
    ],
    mainTask: {
      title: "Open the resonance vault",
      description: phaseRouterMainTaskDescription,
    },
  });
};

const emitPhaseRouterPropagation = (episode: EpisodeInstance, event: PropagationEvent, events: EventFeedback[]) => {
  const route = String(event.payload.route ?? "north");
  const phase = String(event.payload.phase ?? "direct");

  if (phase === "direct" && route === "north") {
    episode.hiddenState.hiddenFlags.northReady = true;
    setRelayPowered(episode.worlds.w2, true);
    updateMainWorldReadout(episode, "north-armed");
    episode.hiddenState.hiddenFlags.lastReadout = "north-armed";
    events.push({ turn: episode.metrics.totalSteps + 1, text: "The north branch answers the pulse." });
    return;
  }

  if (phase === "direct" && route === "south") {
    episode.hiddenState.hiddenFlags.southReady = true;
    setRelayPowered(episode.worlds.w3, true);
    updateMainWorldReadout(episode, "south-armed");
    episode.hiddenState.hiddenFlags.lastReadout = "south-armed";
    events.push({ turn: episode.metrics.totalSteps + 1, text: "The south branch answers the pulse." });
    return;
  }

  if (
    phase === "inverted" &&
    episode.hiddenState.hiddenFlags.northReady === true &&
    episode.hiddenState.hiddenFlags.southReady === true &&
    episode.hiddenState.hiddenFlags.northStabilized === true &&
    episode.hiddenState.hiddenFlags.southStabilized === true
  ) {
    episode.hiddenState.hiddenFlags.resonanceReady = true;
    episode.hiddenState.hiddenFlags.exitOpen = true;
    setExitOpen(episode.worlds.w4, true);
    updateMainWorldReadout(episode, "resonance");
    episode.hiddenState.hiddenFlags.lastReadout = "resonance";
    events.push({ turn: episode.metrics.totalSteps + 1, text: "A resonant vault opens in a deeper world.", tone: "good" });
    return;
  }

  updateMainWorldReadout(episode, "interference");
  episode.hiddenState.hiddenFlags.lastReadout = "interference";
  events.push({
    turn: episode.metrics.totalSteps + 1,
    text: "The pulse scatters. The workshop readout flashes interference.",
    tone: "warn",
  });
};

const emitPropagation = (episode: EpisodeInstance, event: PropagationEvent, events: EventFeedback[]) => {
  if (episode.levelFamilyId === "phase_router") {
    emitPhaseRouterPropagation(episode, event, events);
    return;
  }

  if (episode.levelFamilyId === "chain_basic") {
    if (event.sourceWorldId === "w1") {
      setRelayPowered(episode.worlds.w2, true);
      episode.hiddenState.hiddenFlags.propagatedToW2 = true;
      events.push({ turn: episode.metrics.totalSteps + 1, text: "A distant mechanism hums somewhere else." });

      setRelayPowered(episode.worlds.w3, true);
      setExitOpen(episode.worlds.w3, true);
      episode.hiddenState.hiddenFlags.exitOpen = true;
      episode.hiddenState.hiddenFlags.propagatedToW3 = true;
      events.push({ turn: episode.metrics.totalSteps + 1, text: "Something unlocks in a deeper layer.", tone: "good" });
      return;
    }

    if (event.sourceWorldId === "w2") {
      setRelayPowered(episode.worlds.w3, true);
      setExitOpen(episode.worlds.w3, true);
      episode.hiddenState.hiddenFlags.exitOpen = true;
      episode.hiddenState.hiddenFlags.propagatedToW3 = true;
      events.push({ turn: episode.metrics.totalSteps + 1, text: "Something unlocks in a deeper layer.", tone: "good" });
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
    setExitOpen(episode.worlds.w4, true);
    episode.hiddenState.hiddenFlags.exitOpen = true;
    events.push({ turn: episode.metrics.totalSteps + 1, text: "A convergence gate opens somewhere ahead.", tone: "good" });
  }
};

const buildTheoryEvaluation = (episode: EpisodeInstance, submission: { hypothesizedRule: string; evidence: string }) => {
  const text = `${submission.hypothesizedRule} ${submission.evidence}`.toLowerCase();
  const hasEvidence = submission.evidence.trim().length > 0;

  if (episode.levelFamilyId === "phase_router") {
    const mentionsAnchor = text.includes("anchor") || text.includes("align") || text.includes("dormant");
    const mentionsRoute = text.includes("router") || text.includes("north") || text.includes("south");
    const mentionsPhase = text.includes("phase") || text.includes("lens") || text.includes("invert");
    const mentionsStabilize = text.includes("stabil") || text.includes("hidden world") || text.includes("possess");
    const mentionsCombination = text.includes("both") || text.includes("resonance") || text.includes("configuration");
    const accepted = mentionsAnchor && mentionsRoute && mentionsPhase && mentionsStabilize && mentionsCombination;
    return {
      ruleDiscoveryScore:
        accepted ? 1 : mentionsRoute && mentionsPhase && mentionsAnchor && mentionsStabilize ? 0.8 : mentionsRoute || mentionsPhase || mentionsAnchor ? 0.35 : 0,
      evidenceScore: hasEvidence ? 0.85 : 0.2,
      feedback: accepted
        ? "Theory accepted: the anchor awakens the workshop, local router and lens states arm hidden branches, those branches must be stabilized in their hidden worlds, and only then can an inverted pulse open the vault."
        : "Theory noted, but it should explain the anchor gate, the local device combinations, the hidden-world stabilization step, and how resonance opens the vault.",
    };
  }

  const mentionsPropagation = text.includes("propagat") || text.includes("chain") || text.includes("fork") || text.includes("branch");
  const mentionsRemoteExit = text.includes("exit") || text.includes("unlock");
  const mentionsBothBranches = text.includes("north") || text.includes("south") || text.includes("both");
  if (episode.levelFamilyId === "fork_join_basic") {
    return {
      ruleDiscoveryScore: mentionsPropagation && mentionsRemoteExit && mentionsBothBranches ? 1 : mentionsPropagation ? 0.5 : 0,
      evidenceScore: hasEvidence ? 0.75 : 0.25,
      feedback:
        mentionsPropagation && mentionsRemoteExit && mentionsBothBranches
          ? "Theory accepted: the convergence exit depends on hidden branch propagation."
          : "Theory noted, but it does not yet explain how both hidden branches contribute.",
    };
  }
  return {
    ruleDiscoveryScore: mentionsPropagation && mentionsRemoteExit ? 1 : mentionsPropagation ? 0.5 : 0,
    evidenceScore: hasEvidence ? 0.75 : 0.25,
    feedback:
      mentionsPropagation && mentionsRemoteExit
        ? "Theory accepted: local switches propagate through hidden worlds to unlock a distant exit."
        : "Theory noted, but it does not yet capture the hidden propagation-to-exit rule.",
  };
};

export const propagationEscapePlugin: GameClassPlugin = {
  id: "propagation_escape",
  title: "Propagation Escape",
  description: "Hidden cross-world propagation unlocks distant exits, with richer local rule composition in advanced families.",
  publicActionSchema: actionSchema,
  vocabulary: {
    entityKinds: ["switch", "relay", "exit", "router", "lens", "sensor", "anchor", "stabilizer"],
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
    {
      id: "phase_router",
      title: "Phase Router",
      description: "Visible local devices interact so the same pulse can arm different branches or trigger final resonance.",
    },
  ],
  instanceGenerator: {
    generate: (seed, familyId) => {
      if (familyId === "fork_join_basic") return createForkJoinEpisode(seed);
      if (familyId === "phase_router") return createPhaseRouterEpisode(seed);
      return createChainEpisode(seed);
    },
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

        if (entity.kind === "router") {
          const nextRoute = entity.publicState.route === "north" ? "south" : "north";
          entity.publicState.route = nextRoute;
          entity.hiddenState.route = nextRoute;
          world.localFlags.route = nextRoute;
          updateMainWorldReadout(episode, String(findEntity(episode.worlds.w1, "sensor")?.publicState.readout ?? "idle"));
          emit({ turn: episode.metrics.totalSteps + 1, text: `The router clicks toward the ${nextRoute} branch.` });
          return;
        }

        if (entity.kind === "anchor") {
          const nextAligned = entity.publicState.aligned !== true;
          entity.publicState.aligned = nextAligned;
          entity.hiddenState.aligned = nextAligned;
          world.localFlags.anchorAligned = nextAligned;
          episode.hiddenState.hiddenFlags.anchorAligned = nextAligned;
          updateMainWorldReadout(episode, nextAligned ? "awake" : "idle");
          emit({
            turn: episode.metrics.totalSteps + 1,
            text: nextAligned
              ? "The workshop anchor aligns. Dormant channels begin to hum."
              : "The workshop anchor falls out of alignment.",
            tone: nextAligned ? "good" : "warn",
          });
          return;
        }

        if (entity.kind === "lens") {
          const nextPhase = entity.publicState.phase === "direct" ? "inverted" : "direct";
          entity.publicState.phase = nextPhase;
          entity.hiddenState.phase = nextPhase;
          world.localFlags.phase = nextPhase;
          updateMainWorldReadout(episode, String(findEntity(episode.worlds.w1, "sensor")?.publicState.readout ?? "idle"));
          emit({ turn: episode.metrics.totalSteps + 1, text: `The lens shifts into ${nextPhase} phase.` });
          return;
        }

        if (entity.kind === "stabilizer") {
          const branchReady = entity.publicState.ready === true;
          if (!branchReady) {
            emit({
              turn: episode.metrics.totalSteps + 1,
              text: "The stabilizer is inert. This branch has not been armed from the main world yet.",
              tone: "warn",
            });
            return;
          }
          entity.publicState.tuned = true;
          entity.hiddenState.tuned = true;
          if (episode.player.worldId === "w2") {
            episode.hiddenState.hiddenFlags.northStabilized = true;
            emit({ turn: episode.metrics.totalSteps + 1, text: "The north branch stabilizer locks into phase.", tone: "good" });
          } else if (episode.player.worldId === "w3") {
            episode.hiddenState.hiddenFlags.southStabilized = true;
            emit({ turn: episode.metrics.totalSteps + 1, text: "The south branch stabilizer locks into phase.", tone: "good" });
          }
          return;
        }

        if (entity.kind === "switch") {
          markKeyEvent();
          emit({ turn: episode.metrics.totalSteps + 1, text: "The switch latches with a metallic click.", tone: "good" });
          if (episode.levelFamilyId === "phase_router" && episode.hiddenState.hiddenFlags.anchorAligned !== true) {
            updateMainWorldReadout(episode, "dormant");
            episode.hiddenState.hiddenFlags.lastReadout = "dormant";
            emit({
              turn: episode.metrics.totalSteps + 1,
              text: "The pulse dissipates. The anchor is not aligned, so the hidden network stays dormant.",
              tone: "warn",
            });
            return;
          }
          const router = findEntity(episode.worlds.w1, "router");
          const lens = findEntity(episode.worlds.w1, "lens");
          emitPropagation(
            episode,
            {
              channel: "signal",
              payload: {
                active: true,
                route: router?.publicState.route ?? "north",
                phase: lens?.publicState.phase ?? "direct",
              },
              sourceWorldId: `${episode.player.worldId}`,
            },
            episode.eventLog,
          );
          return;
        }

        if (entity.kind === "exit") {
          if (entity.hiddenState.open === true) {
            if (episode.levelFamilyId === "phase_router" && episode.publicState.scoreBreakdown.ruleDiscoveryScore < 0.8) {
              emit({
                turn: episode.metrics.totalSteps + 1,
                text: "The vault is open, but the benchmark requires a rule report before escape is accepted.",
                tone: "warn",
              });
              return;
            }
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
      propagate: (episode, event, events) => emitPropagation(episode, event, events),
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
      router: { fill: "#f28482", stroke: "#fec5bb", shape: "hex", label: "T" },
      lens: { fill: "#84a59d", stroke: "#b7d3cc", shape: "diamond", label: "L" },
      sensor: { fill: "#cdb4db", stroke: "#efe1ff", shape: "square", label: "O" },
      anchor: { fill: "#e76f51", stroke: "#f4a261", shape: "circle", label: "A" },
      stabilizer: { fill: "#90be6d", stroke: "#d9ed92", shape: "hex", label: "Z" },
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
  syncBenchmarkState: (episode) => syncPropagationBenchmarkState(episode),
  evaluateTheorySubmission: (episode, submission) => buildTheoryEvaluation(episode, submission),
  requestOracleHint: (episode) => oracleHintForEpisode(episode),
};
