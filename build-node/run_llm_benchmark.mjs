// src/core/registry.ts
var GameRegistry = class {
  plugins = /* @__PURE__ */ new Map();
  register(plugin) {
    this.plugins.set(plugin.id, plugin);
  }
  get(gameClassId) {
    const plugin = this.plugins.get(gameClassId);
    if (!plugin) {
      throw new Error(`Unknown game class: ${gameClassId}`);
    }
    return plugin;
  }
  list() {
    return [...this.plugins.values()];
  }
};

// src/utils/ids.ts
var asGameClassId = (value) => value;
var asLevelFamilyId = (value) => value;
var asEpisodeId = (value) => value;
var asWorldId = (value) => value;
var asNodeId = (value) => value;
var asEntityId = (value) => value;

// src/games/shared/builders.ts
var createWorld = (params) => ({
  id: asWorldId(params.id),
  label: params.label,
  width: params.tiles[0].length,
  height: params.tiles.length,
  tiles: params.tiles.map((row) => row.split("")),
  entities: params.entities ?? [],
  localFlags: params.localFlags ?? {}
});
var createEpisodeBase = (params) => {
  const episodeId = asEpisodeId(`${params.gameClassId}:${params.levelFamilyId}:${params.episodeSeed}`);
  const player = {
    worldId: asWorldId(params.startWorldId),
    position: { x: 1, y: 1 },
    inventory: [],
    energy: 0,
    hp: 3
  };
  const defaultMainTask = {
    id: "main-task",
    title: "Advance the main world objective",
    description: "Use hidden-world evidence to complete the benchmark objective.",
    worldId: player.worldId,
    completed: false,
    discovered: true
  };
  const defaultScore = {
    mainTaskScore: 0,
    hiddenTaskScore: 0,
    ruleDiscoveryScore: 0,
    evidenceScore: 0,
    efficiencyScore: 1,
    totalScore: 1
  };
  const publicState = {
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
      status: {}
    },
    publicStats: {},
    hudHints: [],
    explicitRules: params.explicitRules ?? [
      "A main-world objective anchors the episode.",
      "Hidden worlds must be discovered before possession can target them.",
      "You may submit a rule theory with evidence at any time."
    ],
    implicitRuleSignals: [],
    mainTask: {
      ...defaultMainTask,
      ...params.mainTask
    },
    hiddenTasks: [],
    scoreBreakdown: defaultScore,
    lastSubmissionFeedback: "No theory submitted yet."
  };
  const hiddenState = {
    topology: params.topology,
    hiddenFlags: params.hiddenFlags
  };
  const metrics = {
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
    successStep: null
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
    eventLog: []
  };
};

// src/core/scoring.ts
var SCORE_WEIGHTS = {
  mainTaskScore: 0.4,
  hiddenTaskScore: 0.2,
  ruleDiscoveryScore: 0.2,
  evidenceScore: 0.15,
  efficiencyScore: 0.05
};
var clampUnit = (value) => {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
};
var computeTotalScore = (score) => {
  const normalized = {
    mainTaskScore: clampUnit(score.mainTaskScore),
    hiddenTaskScore: clampUnit(score.hiddenTaskScore),
    ruleDiscoveryScore: clampUnit(score.ruleDiscoveryScore),
    evidenceScore: clampUnit(score.evidenceScore),
    efficiencyScore: clampUnit(score.efficiencyScore)
  };
  const total = normalized.mainTaskScore * SCORE_WEIGHTS.mainTaskScore + normalized.hiddenTaskScore * SCORE_WEIGHTS.hiddenTaskScore + normalized.ruleDiscoveryScore * SCORE_WEIGHTS.ruleDiscoveryScore + normalized.evidenceScore * SCORE_WEIGHTS.evidenceScore + normalized.efficiencyScore * SCORE_WEIGHTS.efficiencyScore;
  return clampUnit(total);
};
var normalizeScoreBreakdown = (score) => {
  const normalized = {
    mainTaskScore: clampUnit(score.mainTaskScore ?? 0),
    hiddenTaskScore: clampUnit(score.hiddenTaskScore ?? 0),
    ruleDiscoveryScore: clampUnit(score.ruleDiscoveryScore ?? 0),
    evidenceScore: clampUnit(score.evidenceScore ?? 0),
    efficiencyScore: clampUnit(score.efficiencyScore ?? 0)
  };
  return {
    ...normalized,
    totalScore: computeTotalScore(normalized)
  };
};

// src/utils/random.ts
var createSeededRng = (seed) => {
  let value = seed >>> 0;
  return () => {
    value = value * 1664525 + 1013904223 >>> 0;
    return value / 4294967295;
  };
};

// src/games/shared/helpers.ts
var ROOM_TEMPLATE = [
  "#########",
  "#.......#",
  "#.......#",
  "#.......#",
  "#.......#",
  "#########"
];
var cloneRoomTiles = () => [...ROOM_TEMPLATE];
var seededPositions = (seed, options, count) => {
  const rng = createSeededRng(seed);
  const pool = [...options];
  const selected = [];
  while (pool.length > 0 && selected.length < count) {
    const index = Math.floor(rng() * pool.length);
    selected.push(pool.splice(index, 1)[0]);
  }
  return selected;
};
var findEntityAtPlayer = (episode, predicate) => {
  const world = episode.worlds[episode.player.worldId];
  return world.entities.find(
    (candidate) => candidate.position.x === episode.player.position.x && candidate.position.y === episode.player.position.y && (predicate ? predicate(candidate) : true)
  );
};
var setHudHints = (episode, hints) => {
  episode.publicState.hudHints = hints;
};
var setPublicStats = (episode, stats) => {
  episode.publicState.publicStats = stats;
};
var discoverWorld = (episode, worldId) => {
  const normalized = worldId;
  if (!episode.publicState.discoveredWorldIds.includes(normalized)) {
    episode.publicState.discoveredWorldIds = [...episode.publicState.discoveredWorldIds, normalized];
    episode.metrics.hiddenWorldDiscoveries += 1;
  }
};
var setMainTask = (episode, task) => {
  episode.publicState.mainTask = {
    ...episode.publicState.mainTask,
    ...task
  };
};
var setHiddenTasks = (episode, tasks) => {
  episode.publicState.hiddenTasks = tasks;
};
var setExplicitRules = (episode, explicitRules) => {
  episode.publicState.explicitRules = explicitRules;
};
var setImplicitRuleSignals = (episode, implicitRuleSignals) => {
  episode.publicState.implicitRuleSignals = implicitRuleSignals;
};
var setScoreBreakdown = (episode, score) => {
  const next = normalizeScoreBreakdown({
    ...episode.publicState.scoreBreakdown,
    ...score
  });
  episode.publicState.scoreBreakdown = next;
};

// src/games/shared/observation.ts
var defaultActions = [
  "move_up",
  "move_down",
  "move_left",
  "move_right",
  "interact",
  "switch_world",
  "return_main",
  "submit_theory",
  "request_oracle",
  "wait"
];
var buildObservation = (episode, plugin, world) => ({
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
    status: { ...episode.publicState.player.status }
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
    allowed: defaultActions
  }
});

// src/games/ecologyNetwork/plugin.ts
var actionSchema = {
  actions: [
    { type: "move_up", description: "Move north" },
    { type: "move_down", description: "Move south" },
    { type: "move_left", description: "Move west" },
    { type: "move_right", description: "Move east" },
    { type: "interact", description: "Plant seeds, activate purifiers, or inspect ecological nodes" },
    { type: "switch_world", description: "Cycle to the next world" },
    { type: "wait", description: "Pause for one step" }
  ]
};
var pollutionSource = (id, worldId, x, y, amount) => ({
  id: asEntityId(id),
  kind: "pollution_source",
  worldId: asWorldId(worldId),
  position: { x, y },
  tags: ["interactive", "ecology"],
  publicState: { active: false, amount },
  hiddenState: { active: false, amount }
});
var purifier = (id, worldId, x, y) => ({
  id: asEntityId(id),
  kind: "purifier",
  worldId: asWorldId(worldId),
  position: { x, y },
  tags: ["interactive", "ecology"],
  publicState: { active: false },
  hiddenState: { active: false }
});
var seedPod = (id, worldId, x, y) => ({
  id: asEntityId(id),
  kind: "seed_pod",
  worldId: asWorldId(worldId),
  position: { x, y },
  tags: ["interactive", "ecology"],
  publicState: { collected: false },
  hiddenState: { collected: false }
});
var waterPool = (id, worldId, x, y) => ({
  id: asEntityId(id),
  kind: "water_pool",
  worldId: asWorldId(worldId),
  position: { x, y },
  tags: ["interactive", "ecology"],
  publicState: { fertile: false },
  hiddenState: { fertile: false }
});
var lifeTree = (id, worldId, x, y) => ({
  id: asEntityId(id),
  kind: "life_tree",
  worldId: asWorldId(worldId),
  position: { x, y },
  tags: ["status"],
  publicState: { growth: 0 },
  hiddenState: { growth: 0 }
});
var ecoCells = [
  { x: 3, y: 2 },
  { x: 4, y: 2 },
  { x: 5, y: 2 },
  { x: 4, y: 3 }
];
var syncEcologyState = (episode) => {
  setPublicStats(episode, {
    carriedSeeds: episode.player.inventory.filter((item) => item === "seed").length,
    localPollution: Number(episode.worlds[episode.player.worldId].localFlags.pollution ?? 0),
    localGrowth: Number(episode.worlds[episode.player.worldId].localFlags.growth ?? 0)
  });
  setHudHints(episode, [
    "Purification and pollution both travel through hidden links.",
    "A healthy ecosystem requires both low pollution and sufficient growth."
  ]);
  if (Number(episode.worlds.w2?.localFlags.pollution ?? 0) !== 0 || Number(episode.worlds.w2?.localFlags.growth ?? 0) !== 0) {
    discoverWorld(episode, "w2");
  }
  if (Number(episode.worlds.w3?.localFlags.pollution ?? 0) !== 0 || Number(episode.worlds.w3?.localFlags.growth ?? 0) !== 0) {
    discoverWorld(episode, "w3");
  }
  if (Number(episode.worlds.w4?.localFlags.pollution ?? 0) !== 0 || Number(episode.worlds.w4?.localFlags.growth ?? 0) !== 0) {
    discoverWorld(episode, "w4");
  }
  setExplicitRules(episode, [
    "A main-world ecology objective anchors the episode.",
    "Discovered hidden habitats can be possessed.",
    "Pollution, purification, and growth propagate through hidden ecological links.",
    "You may submit a theory about the hidden ecology rule with evidence."
  ]);
  setMainTask(episode, {
    title: "Stabilize the hidden ecosystem",
    description: episode.levelFamilyId === "pollution_vs_growth" ? "Balance opposed hidden ecological forces until the heart canopy survives." : "Purify the chain strongly enough for the distant life grove to recover.",
    completed: episode.hiddenState.hiddenFlags.objectiveMet === true
  });
  const hiddenTasks = episode.levelFamilyId === "pollution_vs_growth" ? [
    {
      id: "smog-source",
      title: "Understand the smog source",
      description: "Discover how pollution pressure reaches the hidden target world.",
      worldId: asWorldId("w1"),
      completed: episode.worlds.w4 ? Number(episode.worlds.w4.localFlags.pollution ?? 0) > 2 : false,
      discovered: true
    },
    {
      id: "purifier-bank",
      title: "Activate the purifier bank",
      description: "Counteract remote pollution by driving purification into the hidden canopy.",
      worldId: asWorldId("w2"),
      completed: episode.worlds.w4 ? Number(episode.worlds.w4.localFlags.pollution ?? 0) < 2 : false,
      discovered: episode.publicState.discoveredWorldIds.includes(asWorldId("w2"))
    },
    {
      id: "heart-canopy",
      title: "Restore the heart canopy",
      description: "Achieve both low pollution and sufficient growth in the target habitat.",
      worldId: asWorldId("w4"),
      completed: episode.hiddenState.hiddenFlags.objectiveMet === true,
      discovered: episode.publicState.discoveredWorldIds.includes(asWorldId("w4"))
    }
  ] : [
    {
      id: "wetland-purify",
      title: "Purify the wetland",
      description: "Send purification into the intermediate hidden wetland.",
      worldId: asWorldId("w2"),
      completed: Number(episode.worlds.w2.localFlags.pollution ?? 0) < 2,
      discovered: episode.publicState.discoveredWorldIds.includes(asWorldId("w2"))
    },
    {
      id: "life-grove",
      title: "Recover the life grove",
      description: "Restore the distant grove by reducing pollution and increasing growth.",
      worldId: asWorldId("w3"),
      completed: episode.hiddenState.hiddenFlags.objectiveMet === true,
      discovered: episode.publicState.discoveredWorldIds.includes(asWorldId("w3"))
    }
  ];
  setHiddenTasks(episode, hiddenTasks);
  const completedHidden = hiddenTasks.filter((task) => task.completed).length;
  setScoreBreakdown(episode, {
    mainTaskScore: episode.hiddenState.hiddenFlags.objectiveMet === true ? 1 : 0,
    hiddenTaskScore: hiddenTasks.length > 0 ? completedHidden / hiddenTasks.length : 0,
    efficiencyScore: Math.max(0, 1 - episode.metrics.totalSteps / (episode.levelFamilyId === "pollution_vs_growth" ? 28 : 20))
  });
};
var createPurifyChain = (seed) => {
  const [purifierPos, sourcePos, treePos] = seededPositions(seed + 91, ecoCells, 3);
  const episode = createEpisodeBase({
    episodeSeed: seed,
    gameClassId: "ecology_network",
    levelFamilyId: "purify_chain",
    topology: {
      nodes: [asNodeId("w1"), asNodeId("w2"), asNodeId("w3")],
      edges: [
        { from: asNodeId("w1"), to: asNodeId("w2"), channel: "purify", weight: 1 },
        { from: asNodeId("w2"), to: asNodeId("w3"), channel: "purify", weight: 1 }
      ]
    },
    hiddenFlags: { worldsPurified: 0, treeGrown: false, objectiveMet: false },
    worlds: [
      createWorld({
        id: "w1",
        label: "Upstream Spring",
        tiles: cloneRoomTiles(),
        entities: [purifier("purifier-a", "w1", purifierPos.x, purifierPos.y)],
        localFlags: { pollution: 2, growth: 0 }
      }),
      createWorld({
        id: "w2",
        label: "Silt Wetland",
        tiles: cloneRoomTiles(),
        entities: [waterPool("pool-b", "w2", 4, 2)],
        localFlags: { pollution: 2, growth: 0 }
      }),
      createWorld({
        id: "w3",
        label: "Life Grove",
        tiles: cloneRoomTiles(),
        entities: [lifeTree("tree-c", "w3", treePos.x, treePos.y), pollutionSource("smog-c", "w3", sourcePos.x, sourcePos.y, 1)],
        localFlags: { pollution: 2, growth: 0 }
      })
    ],
    startWorldId: "w1"
  });
  syncEcologyState(episode);
  return episode;
};
var createPollutionVsGrowth = (seed) => {
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
        { from: asNodeId("w3"), to: asNodeId("w4"), channel: "grow", weight: 1 }
      ]
    },
    hiddenFlags: { objectiveMet: false, treeGrown: false },
    worlds: [
      createWorld({
        id: "w1",
        label: "Smog Source",
        tiles: cloneRoomTiles(),
        entities: [pollutionSource("smog-a", "w1", sourcePos.x, sourcePos.y, 2)],
        localFlags: { pollution: 1, growth: 0 }
      }),
      createWorld({
        id: "w2",
        label: "Purifier Bank",
        tiles: cloneRoomTiles(),
        entities: [purifier("purifier-b", "w2", 4, 2)],
        localFlags: { pollution: 1, growth: 0 }
      }),
      createWorld({
        id: "w3",
        label: "Seed Nursery",
        tiles: cloneRoomTiles(),
        entities: [seedPod("seed-c", "w3", seedPos.x, seedPos.y), waterPool("pool-c", "w3", 4, 3)],
        localFlags: { pollution: 0, growth: 0 }
      }),
      createWorld({
        id: "w4",
        label: "Heart Canopy",
        tiles: cloneRoomTiles(),
        entities: [lifeTree("tree-d", "w4", treePos.x, treePos.y), waterPool("pool-d", "w4", 6, 3)],
        localFlags: { pollution: 2, growth: 0 }
      })
    ],
    startWorldId: "w1"
  });
  syncEcologyState(episode);
  return episode;
};
var updateEcologyWin = (episode) => {
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
var propagateEcology = (episode, event, events) => {
  const edges = episode.hiddenState.topology.edges.filter(
    (edge) => edge.channel === event.channel && String(edge.from) === event.sourceWorldId
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
var ecologyNetworkPlugin = {
  id: "ecology_network",
  title: "Ecology Network",
  description: "Balance purification, pollution, and growth across hidden ecological links.",
  publicActionSchema: actionSchema,
  vocabulary: {
    entityKinds: ["pollution_source", "purifier", "seed_pod", "water_pool", "life_tree"],
    tileKinds: [".", "#"]
  },
  levelFamilies: [
    { id: "purify_chain", title: "Purify Chain", description: "Upstream purification must ripple far enough for a distant life grove to recover." },
    { id: "pollution_vs_growth", title: "Pollution vs Growth", description: "Competing positive and negative propagation decide whether the heart canopy survives." }
  ],
  instanceGenerator: {
    generate: (seed, familyId) => familyId === "pollution_vs_growth" ? createPollutionVsGrowth(seed) : createPurifyChain(seed)
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
          updateEcologyWin(episode);
          emit({ turn: episode.metrics.totalSteps + 1, text: "A contamination pulse spreads into unseen habitats.", tone: "warn" });
          return;
        }
        if (entity.kind === "purifier") {
          entity.publicState.active = true;
          entity.hiddenState.active = true;
          queuePropagation({ channel: "purify", payload: { amount: 1 }, sourceWorldId: String(episode.player.worldId) });
          markKeyEvent();
          updateEcologyWin(episode);
          emit({ turn: episode.metrics.totalSteps + 1, text: "Clean water pressure rises through the network.", tone: "good" });
          return;
        }
        if (entity.kind === "seed_pod" && entity.hiddenState.collected !== true) {
          entity.hiddenState.collected = true;
          entity.publicState.collected = true;
          episode.player.inventory.push("seed");
          markKeyEvent();
          syncEcologyState(episode);
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
            updateEcologyWin(episode);
            emit({ turn: episode.metrics.totalSteps + 1, text: "The water pool nourishes a hidden chain of growth.", tone: "good" });
            return;
          }
        }
        emit({ turn: episode.metrics.totalSteps + 1, text: "This ecosystem node is not ready yet.", tone: "warn" });
      }
    }
  ],
  propagationRules: [
    {
      id: "propagate-ecology-state",
      propagate: (episode, event, events) => propagateEcology(episode, event, events)
    }
  ],
  winCondition: {
    evaluate: (episode) => ({
      done: episode.hiddenState.hiddenFlags.objectiveMet === true,
      reward: episode.hiddenState.hiddenFlags.objectiveMet === true ? 1 : 0,
      event: episode.hiddenState.hiddenFlags.objectiveMet === true ? { turn: episode.metrics.totalSteps, text: "Ecology network stabilized.", tone: "good" } : void 0
    })
  },
  observationAdapter: {
    toObservation: (episode) => buildObservation(episode, ecologyNetworkPlugin, episode.worlds[episode.player.worldId])
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
      glow: "rgba(134,239,172,0.26)"
    },
    entityAppearance: {
      pollution_source: { fill: "#ef4444", stroke: "#fecaca", shape: "hex", label: "P" },
      purifier: { fill: "#38bdf8", stroke: "#bae6fd", shape: "square", label: "U" },
      seed_pod: { fill: "#fbbf24", stroke: "#fef3c7", shape: "diamond", label: "S" },
      water_pool: { fill: "#60a5fa", stroke: "#dbeafe", shape: "circle", label: "W" },
      life_tree: { fill: "#4ade80", stroke: "#dcfce7", shape: "hex", label: "T" }
    },
    tileAppearance: {
      ".": { fill: "#294032", stroke: "rgba(255,255,255,0.04)" },
      "#": { fill: "#08120b", stroke: "rgba(255,255,255,0.02)" }
    }
  },
  getVisibleEntities: (world) => world.entities.map((entity) => ({
    entityId: entity.id,
    kind: entity.kind,
    position: entity.position,
    state: entity.publicState
  })),
  getPlayerSpawn: () => ({ x: 1, y: 1 }),
  getPublicPlayerStatus: (episode) => ({
    seeds: episode.player.inventory.filter((item) => item === "seed").length
  }),
  syncBenchmarkState: (episode) => syncEcologyState(episode),
  evaluateTheorySubmission: (_episode, submission) => {
    const text = `${submission.hypothesizedRule} ${submission.evidence}`.toLowerCase();
    const mentionsEcology = text.includes("pollution") || text.includes("purify") || text.includes("growth") || text.includes("ecosystem");
    const mentionsInteraction = text.includes("trade") || text.includes("balance") || text.includes("hidden") || text.includes("chain");
    return {
      ruleDiscoveryScore: mentionsEcology && mentionsInteraction ? 1 : mentionsEcology ? 0.5 : 0,
      evidenceScore: submission.evidence.trim() ? 0.8 : 0.25,
      feedback: mentionsEcology && mentionsInteraction ? "Theory accepted: hidden ecological links balance pollution, purification, and growth across worlds." : "Theory noted, but it does not yet explain the hidden ecology interaction rule."
    };
  }
};

// src/games/energyNetwork/plugin.ts
var actionSchema2 = {
  actions: [
    { type: "move_up", description: "Move north" },
    { type: "move_down", description: "Move south" },
    { type: "move_left", description: "Move west" },
    { type: "move_right", description: "Move east" },
    { type: "interact", description: "Collect charge or route it through local interfaces" },
    { type: "switch_world", description: "Cycle to the next world" },
    { type: "wait", description: "Pause for one step" }
  ]
};
var energyOrb = (id, worldId, x, y, amount) => ({
  id: asEntityId(id),
  kind: "energy_orb",
  worldId: asWorldId(worldId),
  position: { x, y },
  tags: ["interactive", "collectible"],
  publicState: { charged: true, amount },
  hiddenState: { charged: true, amount }
});
var batterySlot = (id, worldId, x, y) => ({
  id: asEntityId(id),
  kind: "battery_slot",
  worldId: asWorldId(worldId),
  position: { x, y },
  tags: ["interactive", "injector"],
  publicState: { stored: 0 },
  hiddenState: { stored: 0 }
});
var chargeTower = (id, worldId, x, y) => ({
  id: asEntityId(id),
  kind: "charge_tower",
  worldId: asWorldId(worldId),
  position: { x, y },
  tags: ["status"],
  publicState: { active: false },
  hiddenState: { active: false }
});
var wireNode = (id, worldId, x, y) => ({
  id: asEntityId(id),
  kind: "wire_node",
  worldId: asWorldId(worldId),
  position: { x, y },
  tags: ["status"],
  publicState: { live: false },
  hiddenState: { live: false }
});
var regulator = (id, worldId, x, y) => ({
  id: asEntityId(id),
  kind: "regulator",
  worldId: asWorldId(worldId),
  position: { x, y },
  tags: ["interactive", "injector"],
  publicState: { tuned: false },
  hiddenState: { tuned: false }
});
var candidateCells = [
  { x: 3, y: 2 },
  { x: 4, y: 2 },
  { x: 5, y: 2 },
  { x: 3, y: 3 },
  { x: 5, y: 3 }
];
var syncEnergyPublicState = (episode) => {
  const goalStored = Number(episode.hiddenState.hiddenFlags.goalStored ?? 0);
  const threshold = Number(episode.hiddenState.hiddenFlags.goalThreshold ?? 0);
  setPublicStats(episode, {
    carriedCharge: episode.player.energy,
    localCharge: Number(episode.worlds[episode.player.worldId].localFlags.chargeLevel ?? 0),
    visibleTerminalCharge: Math.min(goalStored, threshold)
  });
  setHudHints(episode, [
    "Collect energy orbs, then inject charge into slots or regulators.",
    "Charge travels through hidden network links and may awaken remote towers."
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
    "You may submit a theory about routing, thresholds, or merge logic with evidence."
  ]);
  setMainTask(episode, {
    title: "Stabilize the remote energy objective",
    description: episode.levelFamilyId === "dual_source_merge" ? "Route and merge hidden energy from multiple worlds until the concealed core stabilizes." : "Route enough hidden energy to satisfy the distant terminal threshold.",
    completed: episode.hiddenState.hiddenFlags.targetSatisfied === true
  });
  const hiddenTasks = episode.levelFamilyId === "dual_source_merge" ? [
    {
      id: "alpha-source",
      title: "Activate the alpha source",
      description: "Collect and route charge from the alpha source world.",
      worldId: asWorldId("w1"),
      completed: episode.hiddenState.hiddenFlags.alphaReady === true,
      discovered: true
    },
    {
      id: "beta-source",
      title: "Activate the beta source",
      description: "Collect and route charge from the beta source world.",
      worldId: asWorldId("w2"),
      completed: episode.hiddenState.hiddenFlags.betaReady === true,
      discovered: episode.publicState.discoveredWorldIds.includes(asWorldId("w2"))
    },
    {
      id: "merge-core",
      title: "Reveal the merge core",
      description: "Expose and charge the hidden merge core world.",
      worldId: asWorldId("w4"),
      completed: Number(episode.hiddenState.hiddenFlags.goalStored ?? 0) >= Number(episode.hiddenState.hiddenFlags.goalThreshold ?? 0),
      discovered: episode.publicState.discoveredWorldIds.includes(asWorldId("w4"))
    }
  ] : [
    {
      id: "relay-gallery",
      title: "Charge the relay gallery",
      description: "Cause the intermediate hidden world to carry visible charge.",
      worldId: asWorldId("w2"),
      completed: Number(episode.worlds.w2.localFlags.chargeLevel ?? 0) > 0,
      discovered: episode.publicState.discoveredWorldIds.includes(asWorldId("w2"))
    },
    {
      id: "terminal-spire",
      title: "Charge the terminal spire",
      description: "Route enough energy to the hidden terminal world.",
      worldId: asWorldId("w3"),
      completed: Number(episode.hiddenState.hiddenFlags.goalStored ?? 0) >= threshold,
      discovered: episode.publicState.discoveredWorldIds.includes(asWorldId("w3"))
    }
  ];
  setHiddenTasks(episode, hiddenTasks);
  const completedHidden = hiddenTasks.filter((task) => task.completed).length;
  setScoreBreakdown(episode, {
    mainTaskScore: episode.hiddenState.hiddenFlags.targetSatisfied === true ? 1 : 0,
    hiddenTaskScore: hiddenTasks.length > 0 ? completedHidden / hiddenTasks.length : 0,
    efficiencyScore: Math.max(0, 1 - episode.metrics.totalSteps / (episode.levelFamilyId === "dual_source_merge" ? 28 : 20))
  });
};
var createSingleSourceEpisode = (seed) => {
  const [orbPos, slotPos, towerPos] = seededPositions(seed, candidateCells, 3);
  const threshold = 3 + seed % 2;
  const worlds = [
    createWorld({
      id: "w1",
      label: "Source Basin",
      tiles: cloneRoomTiles(),
      entities: [
        energyOrb("orb-source", "w1", orbPos.x, orbPos.y, threshold),
        wireNode("wire-a", "w1", 6, 2)
      ],
      localFlags: { chargeLevel: 0 }
    }),
    createWorld({
      id: "w2",
      label: "Relay Gallery",
      tiles: cloneRoomTiles(),
      entities: [
        batterySlot("slot-mid", "w2", slotPos.x, slotPos.y),
        wireNode("wire-b", "w2", 5, 2),
        chargeTower("tower-mid", "w2", 2, 2)
      ],
      localFlags: { chargeLevel: 0 }
    }),
    createWorld({
      id: "w3",
      label: "Terminal Spire",
      tiles: cloneRoomTiles(),
      entities: [
        regulator("reg-final", "w3", 3, 2),
        chargeTower("tower-final", "w3", towerPos.x, towerPos.y),
        wireNode("wire-c", "w3", 6, 2)
      ],
      localFlags: { chargeLevel: 0 }
    })
  ];
  const episode = createEpisodeBase({
    episodeSeed: seed,
    gameClassId: "energy_network",
    levelFamilyId: "single_source_threshold",
    topology: {
      nodes: [asNodeId("w1"), asNodeId("w2"), asNodeId("w3")],
      edges: [
        { from: asNodeId("w2"), to: asNodeId("w3"), channel: "energy", weight: 1 },
        { from: asNodeId("w1"), to: asNodeId("w2"), channel: "energy", weight: 1 }
      ]
    },
    hiddenFlags: {
      goalStored: 0,
      goalThreshold: threshold,
      targetSatisfied: false
    },
    worlds,
    startWorldId: "w1"
  });
  syncEnergyPublicState(episode);
  return episode;
};
var createDualSourceEpisode = (seed) => {
  const [alphaPos, betaPos, mergePos] = seededPositions(seed + 11, candidateCells, 3);
  const worlds = [
    createWorld({
      id: "w1",
      label: "Alpha Source",
      tiles: cloneRoomTiles(),
      entities: [
        energyOrb("orb-alpha", "w1", alphaPos.x, alphaPos.y, 1),
        chargeTower("tower-alpha", "w1", 6, 2)
      ],
      localFlags: { chargeLevel: 0 }
    }),
    createWorld({
      id: "w2",
      label: "Beta Source",
      tiles: cloneRoomTiles(),
      entities: [
        energyOrb("orb-beta", "w2", betaPos.x, betaPos.y, 1),
        chargeTower("tower-beta", "w2", 2, 2)
      ],
      localFlags: { chargeLevel: 0 }
    }),
    createWorld({
      id: "w3",
      label: "Conduit Field",
      tiles: cloneRoomTiles(),
      entities: [
        wireNode("wire-merge-a", "w3", 3, 2),
        wireNode("wire-merge-b", "w3", 5, 2),
        chargeTower("tower-buffer", "w3", 4, 3)
      ],
      localFlags: { chargeLevel: 0 }
    }),
    createWorld({
      id: "w4",
      label: "Merge Core",
      tiles: cloneRoomTiles(),
      entities: [
        batterySlot("merge-slot", "w4", mergePos.x, mergePos.y),
        regulator("merge-reg", "w4", 6, 3),
        wireNode("wire-terminal", "w4", 2, 2)
      ],
      localFlags: { chargeLevel: 0 }
    })
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
        { from: asNodeId("w3"), to: asNodeId("w4"), channel: "energy", weight: 1 }
      ]
    },
    hiddenFlags: {
      alphaReady: false,
      betaReady: false,
      goalStored: 0,
      goalThreshold: 2,
      targetSatisfied: false
    },
    worlds,
    startWorldId: "w1"
  });
  syncEnergyPublicState(episode);
  return episode;
};
var applyEnergyAlongGraph = (episode, event, events) => {
  const amount = Number(event.payload.amount ?? 0);
  if (amount <= 0) {
    return;
  }
  const queue = [{ worldId: event.sourceWorldId, amount }];
  const visited = /* @__PURE__ */ new Set();
  while (queue.length > 0) {
    const current = queue.shift();
    if (visited.has(current.worldId)) {
      continue;
    }
    visited.add(current.worldId);
    const outgoing = episode.hiddenState.topology.edges.filter(
      (edge) => String(edge.from) === current.worldId && edge.channel === event.channel
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
      if (String(edge.to) === "w4" || episode.levelFamilyId === "single_source_threshold" && String(edge.to) === "w3") {
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
    if (episode.hiddenState.hiddenFlags.alphaReady === true && episode.hiddenState.hiddenFlags.betaReady === true && Number(episode.hiddenState.hiddenFlags.goalStored ?? 0) >= Number(episode.hiddenState.hiddenFlags.goalThreshold ?? 0)) {
      episode.hiddenState.hiddenFlags.targetSatisfied = true;
      events.push({ turn: episode.metrics.totalSteps + 1, text: "Separated charges resonate into a stable core.", tone: "good" });
    }
  } else if (Number(episode.hiddenState.hiddenFlags.goalStored ?? 0) >= Number(episode.hiddenState.hiddenFlags.goalThreshold ?? 0)) {
    episode.hiddenState.hiddenFlags.targetSatisfied = true;
    events.push({ turn: episode.metrics.totalSteps + 1, text: "A distant terminal reaches its charge threshold.", tone: "good" });
  }
  syncEnergyPublicState(episode);
};
var energyNetworkPlugin = {
  id: "energy_network",
  title: "Energy Network",
  description: "Collect, route, and merge charge through hidden multi-world conduits.",
  publicActionSchema: actionSchema2,
  vocabulary: {
    entityKinds: ["energy_orb", "battery_slot", "charge_tower", "wire_node", "regulator"],
    tileKinds: [".", "#"]
  },
  levelFamilies: [
    {
      id: "single_source_threshold",
      title: "Single Source Threshold",
      description: "One world holds enough charge, but only hidden routing reveals where it must be delivered."
    },
    {
      id: "dual_source_merge",
      title: "Dual Source Merge",
      description: "Separate sources must both contribute before the concealed merge core stabilizes."
    }
  ],
  instanceGenerator: {
    generate: (seed, familyId) => familyId === "dual_source_merge" ? createDualSourceEpisode(seed) : createSingleSourceEpisode(seed)
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
          syncEnergyPublicState(episode);
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
          const sourceTag = String(episode.player.worldId) === "w1" ? "alpha" : String(episode.player.worldId) === "w2" ? "beta" : "merged";
          queuePropagation({
            channel: "energy",
            payload: { amount: carried, sourceTag },
            sourceWorldId: String(episode.player.worldId)
          });
          episode.player.energy = 0;
          markKeyEvent();
          syncEnergyPublicState(episode);
          emit({ turn: episode.metrics.totalSteps + 1, text: "Stored charge disappears into unseen conductors.", tone: "good" });
          return;
        }
        emit({ turn: episode.metrics.totalSteps + 1, text: "The fixture hums, but nothing changes yet.", tone: "warn" });
      }
    }
  ],
  propagationRules: [
    {
      id: "propagate-energy-flow",
      propagate: (episode, event, events) => applyEnergyAlongGraph(episode, event, events)
    }
  ],
  winCondition: {
    evaluate: (episode) => ({
      done: episode.hiddenState.hiddenFlags.targetSatisfied === true,
      reward: episode.hiddenState.hiddenFlags.targetSatisfied === true ? 1 : 0,
      event: episode.hiddenState.hiddenFlags.targetSatisfied === true ? { turn: episode.metrics.totalSteps, text: "Energy network objective satisfied.", tone: "good" } : void 0
    })
  },
  observationAdapter: {
    toObservation: (episode) => buildObservation(episode, energyNetworkPlugin, episode.worlds[episode.player.worldId])
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
      glow: "rgba(126,214,165,0.32)"
    },
    entityAppearance: {
      energy_orb: { fill: "#ffb703", stroke: "#ffe08a", shape: "circle", label: "O" },
      battery_slot: { fill: "#6ee7b7", stroke: "#d1fae5", shape: "square", label: "B" },
      charge_tower: { fill: "#34d399", stroke: "#a7f3d0", shape: "hex", label: "T" },
      wire_node: { fill: "#38bdf8", stroke: "#bae6fd", shape: "diamond", label: "W" },
      regulator: { fill: "#fb7185", stroke: "#fecdd3", shape: "square", label: "R" }
    },
    tileAppearance: {
      ".": { fill: "#26363f", stroke: "rgba(255,255,255,0.04)" },
      "#": { fill: "#071116", stroke: "rgba(255,255,255,0.02)" }
    }
  },
  getVisibleEntities: (world) => world.entities.map((entity) => ({
    entityId: entity.id,
    kind: entity.kind,
    position: entity.position,
    state: entity.publicState
  })),
  getPlayerSpawn: () => ({ x: 1, y: 1 }),
  getPublicPlayerStatus: (episode) => ({
    charge: episode.player.energy
  }),
  syncBenchmarkState: (episode) => syncEnergyPublicState(episode),
  evaluateTheorySubmission: (episode, submission) => {
    const text = `${submission.hypothesizedRule} ${submission.evidence}`.toLowerCase();
    const mentionsEnergy = text.includes("energy") || text.includes("charge");
    const mentionsRouting = text.includes("route") || text.includes("hidden") || text.includes("network");
    const mentionsThreshold = text.includes("threshold") || text.includes("merge") || text.includes("source");
    return {
      ruleDiscoveryScore: mentionsEnergy && mentionsRouting && mentionsThreshold ? 1 : mentionsEnergy && mentionsRouting ? 0.6 : 0,
      evidenceScore: submission.evidence.trim() ? 0.8 : 0.25,
      feedback: mentionsEnergy && mentionsRouting && mentionsThreshold ? "Theory accepted: the hidden energy topology routes charge toward a thresholded or merged remote objective." : "Theory noted, but it does not yet capture enough of the hidden routing rule."
    };
  }
};

// src/games/propagationEscape/plugin.ts
var actionSchema3 = {
  actions: [
    { type: "move_up", description: "Move north" },
    { type: "move_down", description: "Move south" },
    { type: "move_left", description: "Move west" },
    { type: "move_right", description: "Move east" },
    { type: "interact", description: "Toggle local devices or enter an open exit" },
    { type: "switch_world", description: "Cycle to the next discovered hidden world" },
    { type: "wait", description: "Pause for one step" }
  ]
};
var baseTiles = [
  "#########",
  "#.......#",
  "#.......#",
  "#.......#",
  "#.......#",
  "#########"
];
var switchEntity = (id, worldId, x, y) => ({
  id: asEntityId(id),
  kind: "switch",
  worldId: asWorldId(worldId),
  position: { x, y },
  tags: ["interactive", "trigger"],
  publicState: { active: false },
  hiddenState: { active: false, emits: `sig:${id}` }
});
var relayEntity = (id, worldId, x, y) => ({
  id: asEntityId(id),
  kind: "relay",
  worldId: asWorldId(worldId),
  position: { x, y },
  tags: ["status"],
  publicState: { powered: false },
  hiddenState: { powered: false }
});
var exitEntity = (id, worldId, x, y) => ({
  id: asEntityId(id),
  kind: "exit",
  worldId: asWorldId(worldId),
  position: { x, y },
  blocksMovement: false,
  tags: ["interactive", "goal"],
  publicState: { open: false },
  hiddenState: { open: false }
});
var routerEntity = (id, worldId, x, y) => ({
  id: asEntityId(id),
  kind: "router",
  worldId: asWorldId(worldId),
  position: { x, y },
  tags: ["interactive", "config"],
  publicState: { route: "north" },
  hiddenState: { route: "north" }
});
var lensEntity = (id, worldId, x, y) => ({
  id: asEntityId(id),
  kind: "lens",
  worldId: asWorldId(worldId),
  position: { x, y },
  tags: ["interactive", "config"],
  publicState: { phase: "direct" },
  hiddenState: { phase: "direct" }
});
var sensorEntity = (id, worldId, x, y) => ({
  id: asEntityId(id),
  kind: "sensor",
  worldId: asWorldId(worldId),
  position: { x, y },
  tags: ["status"],
  publicState: { readout: "idle" },
  hiddenState: { readout: "idle" }
});
var anchorEntity = (id, worldId, x, y) => ({
  id: asEntityId(id),
  kind: "anchor",
  worldId: asWorldId(worldId),
  position: { x, y },
  tags: ["interactive", "gate"],
  publicState: { aligned: false },
  hiddenState: { aligned: false }
});
var stabilizerEntity = (id, worldId, x, y) => ({
  id: asEntityId(id),
  kind: "stabilizer",
  worldId: asWorldId(worldId),
  position: { x, y },
  tags: ["interactive", "config"],
  publicState: { tuned: false, ready: false },
  hiddenState: { tuned: false, ready: false }
});
var findEntity = (world, kind) => world.entities.find((entity) => entity.kind === kind);
var setRelayPowered = (world, powered) => {
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
var setExitOpen = (world, open) => {
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
var updateMainWorldReadout = (episode, readout) => {
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
    sensor: readout
  });
};
var updateDynamicHints = (episode) => {
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
    let phaseHint = anchorAligned ? "Advance the vault sequence by changing one device at a time before pulsing again." : "After aligning the anchor, test one local device change at a time to advance the main task.";
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
      phaseHint = northStabilized ? "This branch follow-up is complete. Return to the workshop and continue the main task." : northReady ? "This hidden world matters because it contains the required north-branch follow-up. Stabilize it, then return to the workshop." : "Nothing essential can be completed here yet. Return to the workshop and advance the main task there.";
    }
    if (currentWorld === "w3") {
      phaseHint = southStabilized ? "This branch follow-up is complete. Return to the workshop and continue the main task." : southReady ? "This hidden world matters because it contains the required south-branch follow-up. Stabilize it, then return to the workshop." : "Nothing essential can be completed here yet. Return to the workshop and advance the main task there.";
    }
    if (currentWorld === "w4") {
      phaseHint = exitOpen ? "The main objective is now directly reachable here. If the rule report requirement is satisfied, go to the exit." : "The vault world is not ready yet. Return to the workshop and finish the main task sequence first.";
    }
    setHudHints(episode, [
      anchorAligned ? "Main-world devices can combine into different remote effects." : "The workshop is dormant until the anchor is aligned.",
      `Current router route: ${route}. Current lens phase: ${phase}.`,
      phaseHint,
      oracleUses > 0 ? `Oracle used ${oracleUses} time(s); each use lowers the final score.` : "Oracle is available if you are stuck, but it lowers the final score."
    ]);
    return;
  }
  setHudHints(episode, [
    "Switches can trigger remote changes in hidden worlds.",
    "Inspect newly discovered worlds after a strong event.",
    "Submit a theory once you can explain the propagation pattern."
  ]);
};
var phaseRouterMainTaskDescription = "Open the resonance vault as the primary objective. Do that by awakening the workshop, learning which visible configurations advance the vault sequence, entering any newly discovered hidden branch only when it is required to complete a local follow-up step, triggering final resonance, and then submitting the hidden rule report before escaping.";
var oracleHintForEpisode = (episode) => {
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
        text: "Oracle: the required theory should mention the anchor gate, route and phase combination, hidden-world stabilization, and the final resonance pulse."
      };
    }
    return { text: "Oracle: the vault is ready; finish the run by reaching the open exit." };
  }
  return { text: "Oracle: inspect the latest remote effect, then visit any newly discovered world before repeating the same trigger." };
};
var syncPropagationBenchmarkState = (episode) => {
  if (episode.levelFamilyId === "phase_router") {
    const anchorAligned = episode.hiddenState.hiddenFlags.anchorAligned === true;
    const implicitRuleSignals = [
      anchorAligned ? "The anchor awakens the workshop; before that, pulses do not enter the hidden network." : "",
      episode.hiddenState.hiddenFlags.northReady === true ? "With route=north and phase=direct, the pulse arms the north branch." : "",
      episode.hiddenState.hiddenFlags.southReady === true ? "With route=south and phase=direct, the pulse arms the south branch." : "",
      episode.hiddenState.hiddenFlags.northStabilized === true ? "The armed north branch still required local hidden-world stabilization." : "",
      episode.hiddenState.hiddenFlags.southStabilized === true ? "The armed south branch still required local hidden-world stabilization." : "",
      episode.hiddenState.hiddenFlags.resonanceReady === true ? "After both branches are armed and stabilized, an inverted pulse triggers resonance and opens the remote vault." : "",
      episode.hiddenState.hiddenFlags.lastReadout === "interference" ? "Some visible configurations only cause interference, not propagation." : ""
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
      "You may request an oracle hint, but each request lowers the final score."
    ]);
    setImplicitRuleSignals(episode, implicitRuleSignals);
    setMainTask(episode, {
      title: "Open the resonance vault",
      description: phaseRouterMainTaskDescription,
      completed: episode.hiddenState.hiddenFlags.playerEscaped === true
    });
    const hiddenTasks2 = [
      {
        id: "anchor-alignment",
        title: "Align the workshop anchor",
        description: "Wake the main-world mechanism that unlocks hidden propagation.",
        worldId: asWorldId("w1"),
        completed: anchorAligned,
        discovered: true
      },
      {
        id: "north-branch",
        title: "Arm the north branch",
        description: "Discover and energize the north hidden branch through the correct local device configuration.",
        worldId: asWorldId("w2"),
        completed: episode.hiddenState.hiddenFlags.northReady === true,
        discovered: episode.publicState.discoveredWorldIds.includes(asWorldId("w2"))
      },
      {
        id: "north-stabilizer",
        title: "Stabilize the north branch",
        description: "Possess the north hidden world and tune its stabilizer after the branch is armed.",
        worldId: asWorldId("w2"),
        completed: episode.hiddenState.hiddenFlags.northStabilized === true,
        discovered: episode.publicState.discoveredWorldIds.includes(asWorldId("w2"))
      },
      {
        id: "south-branch",
        title: "Arm the south branch",
        description: "Discover and energize the south hidden branch through the correct local device configuration.",
        worldId: asWorldId("w3"),
        completed: episode.hiddenState.hiddenFlags.southReady === true,
        discovered: episode.publicState.discoveredWorldIds.includes(asWorldId("w3"))
      },
      {
        id: "south-stabilizer",
        title: "Stabilize the south branch",
        description: "Possess the south hidden world and tune its stabilizer after the branch is armed.",
        worldId: asWorldId("w3"),
        completed: episode.hiddenState.hiddenFlags.southStabilized === true,
        discovered: episode.publicState.discoveredWorldIds.includes(asWorldId("w3"))
      },
      {
        id: "resonance-vault",
        title: "Trigger resonance",
        description: "After both branches are armed and stabilized, find the configuration that opens the remote vault.",
        worldId: asWorldId("w4"),
        completed: episode.hiddenState.hiddenFlags.exitOpen === true,
        discovered: episode.publicState.discoveredWorldIds.includes(asWorldId("w4"))
      },
      {
        id: "rule-report",
        title: "Submit the hidden rule",
        description: "Before escaping, submit a theory that explains the gate, routing, hidden-world stabilization, and final resonance.",
        worldId: asWorldId("w1"),
        completed: episode.publicState.scoreBreakdown.ruleDiscoveryScore >= 0.8,
        discovered: true
      }
    ];
    setHiddenTasks(episode, hiddenTasks2);
    const completedHidden2 = hiddenTasks2.filter((task) => task.completed).length;
    const hiddenTaskScore2 = completedHidden2 / hiddenTasks2.length;
    const oracleUses2 = Number(episode.hiddenState.hiddenFlags.oracleUses ?? 0);
    const efficiencyScore2 = Math.max(0, 1 - episode.metrics.totalSteps / 56 - oracleUses2 * 0.08);
    const nextObjective = !anchorAligned ? "Align the workshop anchor." : !episode.hiddenState.hiddenFlags.northReady ? "Use the workshop to arm the north branch." : !episode.hiddenState.hiddenFlags.northStabilized ? "Possess the north hidden world and stabilize its branch." : !episode.hiddenState.hiddenFlags.southReady ? "Return to the workshop and arm the south branch." : !episode.hiddenState.hiddenFlags.southStabilized ? "Possess the south hidden world and stabilize its branch." : !episode.hiddenState.hiddenFlags.exitOpen ? "Return to the workshop and trigger the final resonance pulse." : episode.publicState.scoreBreakdown.ruleDiscoveryScore < 0.8 ? "Submit the required rule report before escaping." : "Possess the vault world and escape.";
    setPublicStats(episode, {
      ...episode.publicState.publicStats,
      oracleUses: oracleUses2,
      nextObjective
    });
    setScoreBreakdown(episode, {
      mainTaskScore: episode.hiddenState.hiddenFlags.playerEscaped === true && episode.publicState.scoreBreakdown.ruleDiscoveryScore >= 0.8 ? 1 : 0,
      hiddenTaskScore: hiddenTaskScore2,
      efficiencyScore: efficiencyScore2
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
    "You may submit a theory about the hidden propagation rule with evidence."
  ]);
  setMainTask(episode, {
    title: "Escape from the benchmark network",
    description: episode.levelFamilyId === "fork_join_basic" ? "Discover enough of the hidden branch structure to open the convergence exit." : "Discover how local switches unlock the distant exit and escape.",
    completed: episode.hiddenState.hiddenFlags.playerEscaped === true
  });
  const hiddenTasks = episode.levelFamilyId === "fork_join_basic" ? [
    {
      id: "north-branch",
      title: "Prime the north branch",
      description: "Discover and energize the north branch relay path.",
      worldId: asWorldId("w2"),
      completed: episode.hiddenState.hiddenFlags.northReady === true,
      discovered: episode.publicState.discoveredWorldIds.includes(asWorldId("w2"))
    },
    {
      id: "south-branch",
      title: "Prime the south branch",
      description: "Discover and energize the south branch relay path.",
      worldId: asWorldId("w3"),
      completed: episode.hiddenState.hiddenFlags.southReady === true,
      discovered: episode.publicState.discoveredWorldIds.includes(asWorldId("w3"))
    },
    {
      id: "convergence-exit",
      title: "Open the convergence exit",
      description: "Unlock the remote exit in the convergence world.",
      worldId: asWorldId("w4"),
      completed: episode.hiddenState.hiddenFlags.exitOpen === true,
      discovered: episode.publicState.discoveredWorldIds.includes(asWorldId("w4"))
    }
  ] : [
    {
      id: "relay-middle",
      title: "Discover the middle relay",
      description: "Cause a remote mechanism to respond in the intermediate hidden world.",
      worldId: asWorldId("w2"),
      completed: episode.hiddenState.hiddenFlags.propagatedToW2 === true,
      discovered: episode.publicState.discoveredWorldIds.includes(asWorldId("w2"))
    },
    {
      id: "unlock-exit",
      title: "Unlock the distant exit",
      description: "Propagate enough information to open the exit in the deepest hidden world.",
      worldId: asWorldId("w3"),
      completed: episode.hiddenState.hiddenFlags.exitOpen === true,
      discovered: episode.publicState.discoveredWorldIds.includes(asWorldId("w3"))
    }
  ];
  setHiddenTasks(episode, hiddenTasks);
  const completedHidden = hiddenTasks.filter((task) => task.completed).length;
  const hiddenTaskScore = hiddenTasks.length > 0 ? completedHidden / hiddenTasks.length : 0;
  const oracleUses = Number(episode.hiddenState.hiddenFlags.oracleUses ?? 0);
  const efficiencyScore = Math.max(
    0,
    1 - episode.metrics.totalSteps / (episode.levelFamilyId === "fork_join_basic" ? 24 : 18) - oracleUses * 0.08
  );
  setPublicStats(episode, {
    ...episode.publicState.publicStats,
    oracleUses
  });
  setScoreBreakdown(episode, {
    mainTaskScore: episode.hiddenState.hiddenFlags.playerEscaped === true ? 1 : 0,
    hiddenTaskScore,
    efficiencyScore
  });
  updateDynamicHints(episode);
};
var createChainEpisode = (seed) => {
  const topology = {
    nodes: [asNodeId("w1"), asNodeId("w2"), asNodeId("w3")],
    edges: [
      { from: asNodeId("w1"), to: asNodeId("w2"), channel: "chain" },
      { from: asNodeId("w2"), to: asNodeId("w3"), channel: "chain" }
    ]
  };
  const worlds = [
    createWorld({
      id: "w1",
      label: "World A",
      tiles: baseTiles,
      entities: [switchEntity("sw-a", "w1", 4, 2)]
    }),
    createWorld({
      id: "w2",
      label: "World B",
      tiles: baseTiles,
      entities: [relayEntity("relay-b", "w2", 4, 2)]
    }),
    createWorld({
      id: "w3",
      label: "World C",
      tiles: baseTiles,
      entities: [exitEntity("exit-c", "w3", 6, 3), relayEntity("relay-c", "w3", 4, 2)]
    })
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
      description: "Use hidden propagation to open the remote exit."
    }
  });
};
var createForkJoinEpisode = (seed) => {
  const topology = {
    nodes: [asNodeId("w1"), asNodeId("w2"), asNodeId("w3"), asNodeId("w4")],
    edges: [
      { from: asNodeId("w1"), to: asNodeId("w2"), channel: "fork" },
      { from: asNodeId("w1"), to: asNodeId("w3"), channel: "fork" },
      { from: asNodeId("w2"), to: asNodeId("w4"), channel: "join" },
      { from: asNodeId("w3"), to: asNodeId("w4"), channel: "join" }
    ]
  };
  const worlds = [
    createWorld({
      id: "w1",
      label: "Hub",
      tiles: baseTiles,
      entities: [switchEntity("hub-switch", "w1", 4, 2)]
    }),
    createWorld({
      id: "w2",
      label: "Branch North",
      tiles: baseTiles,
      entities: [switchEntity("north-switch", "w2", 3, 2), relayEntity("north-relay", "w2", 5, 2)]
    }),
    createWorld({
      id: "w3",
      label: "Branch South",
      tiles: baseTiles,
      entities: [switchEntity("south-switch", "w3", 5, 2), relayEntity("south-relay", "w3", 3, 2)]
    }),
    createWorld({
      id: "w4",
      label: "Convergence",
      tiles: baseTiles,
      entities: [relayEntity("final-relay", "w4", 4, 2), exitEntity("exit-d", "w4", 6, 3)]
    })
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
      description: "Uncover both hidden branches and open the final convergence exit."
    }
  });
};
var createPhaseRouterEpisode = (seed) => {
  const topology = {
    nodes: [asNodeId("w1"), asNodeId("w2"), asNodeId("w3"), asNodeId("w4")],
    edges: [
      { from: asNodeId("w1"), to: asNodeId("w2"), channel: "north-path" },
      { from: asNodeId("w1"), to: asNodeId("w3"), channel: "south-path" },
      { from: asNodeId("w2"), to: asNodeId("w4"), channel: "resonance" },
      { from: asNodeId("w3"), to: asNodeId("w4"), channel: "resonance" },
      { from: asNodeId("w1"), to: asNodeId("w4"), channel: "phase-gate" }
    ]
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
        sensorEntity("readout", "w1", 4, 3)
      ],
      localFlags: { route: "north", phase: "direct", anchorAligned: false }
    }),
    createWorld({
      id: "w2",
      label: "North Branch",
      tiles: baseTiles,
      entities: [relayEntity("north-relay", "w2", 4, 2), stabilizerEntity("north-stabilizer", "w2", 5, 3)]
    }),
    createWorld({
      id: "w3",
      label: "South Branch",
      tiles: baseTiles,
      entities: [relayEntity("south-relay", "w3", 4, 2), stabilizerEntity("south-stabilizer", "w3", 3, 3)]
    }),
    createWorld({
      id: "w4",
      label: "Resonance Vault",
      tiles: baseTiles,
      entities: [relayEntity("vault-relay", "w4", 4, 2), exitEntity("vault-exit", "w4", 6, 3)]
    })
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
      oracleUses: 0
    },
    worlds,
    startWorldId: "w1",
    explicitRules: [
      "The visible workshop contains multiple configurable devices.",
      "The anchor must be aligned before hidden propagation fully wakes up.",
      "Changing one visible device may alter what a later pulse does.",
      "Armed hidden branches may still require local stabilization inside the hidden worlds.",
      "Remote worlds must still be discovered before possession can target them."
    ],
    mainTask: {
      title: "Open the resonance vault",
      description: phaseRouterMainTaskDescription
    }
  });
};
var emitPhaseRouterPropagation = (episode, event, events) => {
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
  if (phase === "inverted" && episode.hiddenState.hiddenFlags.northReady === true && episode.hiddenState.hiddenFlags.southReady === true && episode.hiddenState.hiddenFlags.northStabilized === true && episode.hiddenState.hiddenFlags.southStabilized === true) {
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
    tone: "warn"
  });
};
var emitPropagation = (episode, event, events) => {
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
  if (episode.hiddenState.hiddenFlags.hubTriggered === true && episode.hiddenState.hiddenFlags.northReady === true && episode.hiddenState.hiddenFlags.southReady === true) {
    setExitOpen(episode.worlds.w4, true);
    episode.hiddenState.hiddenFlags.exitOpen = true;
    events.push({ turn: episode.metrics.totalSteps + 1, text: "A convergence gate opens somewhere ahead.", tone: "good" });
  }
};
var buildTheoryEvaluation = (episode, submission) => {
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
      ruleDiscoveryScore: accepted ? 1 : mentionsRoute && mentionsPhase && mentionsAnchor && mentionsStabilize ? 0.8 : mentionsRoute || mentionsPhase || mentionsAnchor ? 0.35 : 0,
      evidenceScore: hasEvidence ? 0.85 : 0.2,
      feedback: accepted ? "Theory accepted: the anchor awakens the workshop, local router and lens states arm hidden branches, those branches must be stabilized in their hidden worlds, and only then can an inverted pulse open the vault." : "Theory noted, but it should explain the anchor gate, the local device combinations, the hidden-world stabilization step, and how resonance opens the vault."
    };
  }
  const mentionsPropagation = text.includes("propagat") || text.includes("chain") || text.includes("fork") || text.includes("branch");
  const mentionsRemoteExit = text.includes("exit") || text.includes("unlock");
  const mentionsBothBranches = text.includes("north") || text.includes("south") || text.includes("both");
  if (episode.levelFamilyId === "fork_join_basic") {
    return {
      ruleDiscoveryScore: mentionsPropagation && mentionsRemoteExit && mentionsBothBranches ? 1 : mentionsPropagation ? 0.5 : 0,
      evidenceScore: hasEvidence ? 0.75 : 0.25,
      feedback: mentionsPropagation && mentionsRemoteExit && mentionsBothBranches ? "Theory accepted: the convergence exit depends on hidden branch propagation." : "Theory noted, but it does not yet explain how both hidden branches contribute."
    };
  }
  return {
    ruleDiscoveryScore: mentionsPropagation && mentionsRemoteExit ? 1 : mentionsPropagation ? 0.5 : 0,
    evidenceScore: hasEvidence ? 0.75 : 0.25,
    feedback: mentionsPropagation && mentionsRemoteExit ? "Theory accepted: local switches propagate through hidden worlds to unlock a distant exit." : "Theory noted, but it does not yet capture the hidden propagation-to-exit rule."
  };
};
var propagationEscapePlugin = {
  id: "propagation_escape",
  title: "Propagation Escape",
  description: "Hidden cross-world propagation unlocks distant exits, with richer local rule composition in advanced families.",
  publicActionSchema: actionSchema3,
  vocabulary: {
    entityKinds: ["switch", "relay", "exit", "router", "lens", "sensor", "anchor", "stabilizer"],
    tileKinds: [".", "#"]
  },
  levelFamilies: [
    {
      id: "chain_basic",
      title: "Chain Basic",
      description: "Upstream actions ripple through a hidden chain of worlds."
    },
    {
      id: "fork_join_basic",
      title: "Fork Join Basic",
      description: "Separate branches must both complete before the exit unlocks."
    },
    {
      id: "phase_router",
      title: "Phase Router",
      description: "Visible local devices interact so the same pulse can arm different branches or trigger final resonance."
    }
  ],
  instanceGenerator: {
    generate: (seed, familyId) => {
      if (familyId === "fork_join_basic") return createForkJoinEpisode(seed);
      if (familyId === "phase_router") return createPhaseRouterEpisode(seed);
      return createChainEpisode(seed);
    }
  },
  interactionRules: [
    {
      id: "interact-propagation-escape",
      apply: ({ episode, emit, markKeyEvent }) => {
        const world = episode.worlds[episode.player.worldId];
        const entity = world.entities.find(
          (candidate) => candidate.tags.includes("interactive") && candidate.position.x === episode.player.position.x && candidate.position.y === episode.player.position.y
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
            text: nextAligned ? "The workshop anchor aligns. Dormant channels begin to hum." : "The workshop anchor falls out of alignment.",
            tone: nextAligned ? "good" : "warn"
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
              tone: "warn"
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
              tone: "warn"
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
                phase: lens?.publicState.phase ?? "direct"
              },
              sourceWorldId: `${episode.player.worldId}`
            },
            episode.eventLog
          );
          return;
        }
        if (entity.kind === "exit") {
          if (entity.hiddenState.open === true) {
            if (episode.levelFamilyId === "phase_router" && episode.publicState.scoreBreakdown.ruleDiscoveryScore < 0.8) {
              emit({
                turn: episode.metrics.totalSteps + 1,
                text: "The vault is open, but the benchmark requires a rule report before escape is accepted.",
                tone: "warn"
              });
              return;
            }
            episode.hiddenState.hiddenFlags.playerEscaped = true;
            emit({ turn: episode.metrics.totalSteps + 1, text: "You step through the opened exit.", tone: "good" });
          } else {
            emit({ turn: episode.metrics.totalSteps + 1, text: "The exit remains sealed.", tone: "warn" });
          }
        }
      }
    }
  ],
  propagationRules: [
    {
      id: "default-propagation-escape",
      propagate: (episode, event, events) => emitPropagation(episode, event, events)
    }
  ],
  winCondition: {
    evaluate: (episode) => ({
      done: episode.hiddenState.hiddenFlags.playerEscaped === true,
      reward: episode.hiddenState.hiddenFlags.playerEscaped === true ? 1 : 0,
      event: episode.hiddenState.hiddenFlags.playerEscaped === true ? { turn: episode.metrics.totalSteps, text: "Escape complete.", tone: "good" } : void 0
    })
  },
  observationAdapter: {
    toObservation: (episode) => buildObservation(episode, propagationEscapePlugin, episode.worlds[episode.player.worldId])
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
      glow: "rgba(142,202,230,0.35)"
    },
    entityAppearance: {
      switch: { fill: "#ffb703", stroke: "#ffd166", shape: "diamond", label: "S" },
      relay: { fill: "#219ebc", stroke: "#8ecae6", shape: "hex", label: "R" },
      exit: { fill: "#7bd389", stroke: "#d9f99d", shape: "square", label: "E" },
      router: { fill: "#f28482", stroke: "#fec5bb", shape: "hex", label: "T" },
      lens: { fill: "#84a59d", stroke: "#b7d3cc", shape: "diamond", label: "L" },
      sensor: { fill: "#cdb4db", stroke: "#efe1ff", shape: "square", label: "O" },
      anchor: { fill: "#e76f51", stroke: "#f4a261", shape: "circle", label: "A" },
      stabilizer: { fill: "#90be6d", stroke: "#d9ed92", shape: "hex", label: "Z" }
    },
    tileAppearance: {
      ".": { fill: "#263449", stroke: "rgba(255,255,255,0.04)" },
      "#": { fill: "#09101c", stroke: "rgba(255,255,255,0.03)" }
    }
  },
  getVisibleEntities: (world) => world.entities.map((entity) => ({
    entityId: entity.id,
    kind: entity.kind,
    position: entity.position,
    state: entity.publicState
  })),
  getPlayerSpawn: () => ({ x: 1, y: 1 }),
  syncBenchmarkState: (episode) => syncPropagationBenchmarkState(episode),
  evaluateTheorySubmission: (episode, submission) => buildTheoryEvaluation(episode, submission),
  requestOracleHint: (episode) => oracleHintForEpisode(episode)
};

// src/games/ritualNetwork/plugin.ts
var actionSchema4 = {
  actions: [
    { type: "move_up", description: "Move north" },
    { type: "move_down", description: "Move south" },
    { type: "move_left", description: "Move west" },
    { type: "move_right", description: "Move east" },
    { type: "interact", description: "Ignite braziers, awaken runes, or consecrate altars" },
    { type: "switch_world", description: "Cycle to the next world" },
    { type: "wait", description: "Pause for one step" }
  ]
};
var altar = (id, worldId, x, y) => ({
  id: asEntityId(id),
  kind: "altar",
  worldId: asWorldId(worldId),
  position: { x, y },
  tags: ["interactive", "ritual"],
  publicState: { consecrated: false },
  hiddenState: { consecrated: false }
});
var runeStone = (id, worldId, x, y) => ({
  id: asEntityId(id),
  kind: "rune_stone",
  worldId: asWorldId(worldId),
  position: { x, y },
  tags: ["interactive", "ritual"],
  publicState: { awakened: false },
  hiddenState: { awakened: false }
});
var brazier = (id, worldId, x, y) => ({
  id: asEntityId(id),
  kind: "brazier",
  worldId: asWorldId(worldId),
  position: { x, y },
  tags: ["interactive", "ritual"],
  publicState: { lit: false },
  hiddenState: { lit: false }
});
var sealNode = (id, worldId, x, y) => ({
  id: asEntityId(id),
  kind: "seal_node",
  worldId: asWorldId(worldId),
  position: { x, y },
  tags: ["interactive", "ritual"],
  publicState: { manifest: false },
  hiddenState: { manifest: false }
});
var ritualCells = [
  { x: 3, y: 2 },
  { x: 4, y: 2 },
  { x: 5, y: 2 },
  { x: 3, y: 3 }
];
var syncRitualState = (episode) => {
  const completed = Number(episode.hiddenState.hiddenFlags.completedStages ?? 0);
  setPublicStats(episode, {
    ritualStages: completed,
    localAttunement: Number(episode.worlds[episode.player.worldId].localFlags.attunement ?? 0)
  });
  setHudHints(episode, [
    "Ritual elements respond to hidden cross-world attunement.",
    "Some altars awaken only after distant braziers and runes align."
  ]);
  if (Number(episode.worlds.w2?.localFlags.attunement ?? 0) > 0) discoverWorld(episode, "w2");
  if (Number(episode.worlds.w3?.localFlags.attunement ?? 0) > 0) discoverWorld(episode, "w3");
  if (Number(episode.worlds.w4?.localFlags.attunement ?? 0) > 0) discoverWorld(episode, "w4");
  setExplicitRules(episode, [
    "A main-world ritual objective anchors the episode.",
    "Discovered hidden ritual chambers can be possessed.",
    "Ritual echoes travel through hidden topology and alter remote attunement.",
    "You may submit a theory about the hidden ritual dependency with evidence."
  ]);
  setMainTask(episode, {
    title: "Complete the hidden ritual network",
    description: episode.levelFamilyId === "dual_ritual_merge" ? "Merge separated rites and complete the final sanctum." : "Advance a chained rite until the silent altar completes.",
    completed: episode.hiddenState.hiddenFlags.ritualComplete === true
  });
  const hiddenTasks = episode.levelFamilyId === "dual_ritual_merge" ? [
    {
      id: "sun-rite",
      title: "Ignite the sun rite",
      description: "Complete the sun-side ritual branch.",
      worldId: asWorldId("w1"),
      completed: episode.hiddenState.hiddenFlags.sunRite === true,
      discovered: true
    },
    {
      id: "moon-rite",
      title: "Ignite the moon rite",
      description: "Complete the moon-side ritual branch.",
      worldId: asWorldId("w2"),
      completed: episode.hiddenState.hiddenFlags.moonRite === true,
      discovered: episode.publicState.discoveredWorldIds.includes(asWorldId("w2"))
    },
    {
      id: "final-sanctum",
      title: "Manifest the final sanctum",
      description: "Reveal and complete the final merged ritual site.",
      worldId: asWorldId("w4"),
      completed: episode.hiddenState.hiddenFlags.ritualComplete === true,
      discovered: episode.publicState.discoveredWorldIds.includes(asWorldId("w4"))
    }
  ] : [
    {
      id: "rune-cloister",
      title: "Awaken the rune cloister",
      description: "Carry ritual attunement into the rune world.",
      worldId: asWorldId("w2"),
      completed: episode.worlds.w2.entities.some((entity) => entity.kind === "rune_stone" && entity.hiddenState.awakened === true),
      discovered: episode.publicState.discoveredWorldIds.includes(asWorldId("w2"))
    },
    {
      id: "silent-altar",
      title: "Consecrate the silent altar",
      description: "Complete the final altar in the hidden world.",
      worldId: asWorldId("w3"),
      completed: episode.hiddenState.hiddenFlags.ritualComplete === true,
      discovered: episode.publicState.discoveredWorldIds.includes(asWorldId("w3"))
    }
  ];
  setHiddenTasks(episode, hiddenTasks);
  const completedHidden = hiddenTasks.filter((task) => task.completed).length;
  setScoreBreakdown(episode, {
    mainTaskScore: episode.hiddenState.hiddenFlags.ritualComplete === true ? 1 : 0,
    hiddenTaskScore: hiddenTasks.length > 0 ? completedHidden / hiddenTasks.length : 0,
    efficiencyScore: Math.max(0, 1 - episode.metrics.totalSteps / (episode.levelFamilyId === "dual_ritual_merge" ? 28 : 20))
  });
};
var createAltarChainEpisode = (seed) => {
  const [brazierPos, runePos, altarPos] = seededPositions(seed + 21, ritualCells, 3);
  const episode = createEpisodeBase({
    episodeSeed: seed,
    gameClassId: "ritual_network",
    levelFamilyId: "altar_chain",
    topology: {
      nodes: [asNodeId("w1"), asNodeId("w2"), asNodeId("w3")],
      edges: [
        { from: asNodeId("w1"), to: asNodeId("w2"), channel: "ritual", weight: 1 },
        { from: asNodeId("w2"), to: asNodeId("w3"), channel: "ritual", weight: 1 }
      ]
    },
    hiddenFlags: { completedStages: 0, ritualComplete: false },
    worlds: [
      createWorld({
        id: "w1",
        label: "Ash Court",
        tiles: cloneRoomTiles(),
        entities: [brazier("brazier-a", "w1", brazierPos.x, brazierPos.y)],
        localFlags: { attunement: 0 }
      }),
      createWorld({
        id: "w2",
        label: "Rune Cloister",
        tiles: cloneRoomTiles(),
        entities: [runeStone("rune-b", "w2", runePos.x, runePos.y)],
        localFlags: { attunement: 0 }
      }),
      createWorld({
        id: "w3",
        label: "Silent Altar",
        tiles: cloneRoomTiles(),
        entities: [altar("altar-c", "w3", altarPos.x, altarPos.y), sealNode("seal-c", "w3", 6, 3)],
        localFlags: { attunement: 0 }
      })
    ],
    startWorldId: "w1"
  });
  syncRitualState(episode);
  return episode;
};
var createDualRitualMergeEpisode = (seed) => {
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
        { from: asNodeId("w3"), to: asNodeId("w4"), channel: "ritual", weight: 1 }
      ]
    },
    hiddenFlags: { sunRite: false, moonRite: false, completedStages: 0, ritualComplete: false },
    worlds: [
      createWorld({
        id: "w1",
        label: "Sun Chapel",
        tiles: cloneRoomTiles(),
        entities: [brazier("sun-fire", "w1", 4, 2), altar("sun-altar", "w1", altarA.x, altarA.y)],
        localFlags: { attunement: 0 }
      }),
      createWorld({
        id: "w2",
        label: "Moon Chapel",
        tiles: cloneRoomTiles(),
        entities: [brazier("moon-fire", "w2", 4, 2), altar("moon-altar", "w2", altarB.x, altarB.y)],
        localFlags: { attunement: 0 }
      }),
      createWorld({
        id: "w3",
        label: "Rune Bridge",
        tiles: cloneRoomTiles(),
        entities: [runeStone("merge-rune", "w3", 4, 2)],
        localFlags: { attunement: 0 }
      }),
      createWorld({
        id: "w4",
        label: "Final Sanctum",
        tiles: cloneRoomTiles(),
        entities: [sealNode("merge-seal", "w4", sealPos.x, sealPos.y)],
        localFlags: { attunement: 0 }
      })
    ],
    startWorldId: "w1"
  });
  syncRitualState(episode);
  return episode;
};
var propagateRitual = (episode, event, events) => {
  const targets = episode.hiddenState.topology.edges.filter(
    (edge) => edge.channel === "ritual" && String(edge.from) === event.sourceWorldId
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
var ritualNetworkPlugin = {
  id: "ritual_network",
  title: "Ritual Network",
  description: "Consecrate distant altars by aligning ritual states across hidden world topology.",
  publicActionSchema: actionSchema4,
  vocabulary: {
    entityKinds: ["altar", "rune_stone", "brazier", "seal_node"],
    tileKinds: [".", "#"]
  },
  levelFamilies: [
    { id: "altar_chain", title: "Altar Chain", description: "One rite awakens the next, culminating in a hidden altar state." },
    { id: "dual_ritual_merge", title: "Dual Ritual Merge", description: "Two parallel rites must converge before the final seal manifests." }
  ],
  instanceGenerator: {
    generate: (seed, familyId) => familyId === "dual_ritual_merge" ? createDualRitualMergeEpisode(seed) : createAltarChainEpisode(seed)
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
          syncRitualState(episode);
          emit({ turn: episode.metrics.totalSteps + 1, text: "Sacred fire catches and sends a distant echo.", tone: "good" });
          return;
        }
        if (entity.kind === "rune_stone" && Number(episode.worlds[episode.player.worldId].localFlags.attunement ?? 0) > 0) {
          entity.publicState.awakened = true;
          entity.hiddenState.awakened = true;
          episode.hiddenState.hiddenFlags.completedStages = Number(episode.hiddenState.hiddenFlags.completedStages ?? 0) + 1;
          markKeyEvent();
          queuePropagation({ channel: "ritual", payload: { phase: "rune" }, sourceWorldId: String(episode.player.worldId) });
          syncRitualState(episode);
          emit({ turn: episode.metrics.totalSteps + 1, text: "The rune stone answers with a low chant.", tone: "good" });
          return;
        }
        if (entity.kind === "altar") {
          const attunement = Number(episode.worlds[episode.player.worldId].localFlags.attunement ?? 0);
          const ready = episode.levelFamilyId === "altar_chain" ? attunement > 0 : String(episode.player.worldId) === "w1" && episode.hiddenState.hiddenFlags.sunRite === true || String(episode.player.worldId) === "w2" && episode.hiddenState.hiddenFlags.moonRite === true;
          if (ready) {
            entity.publicState.consecrated = true;
            entity.hiddenState.consecrated = true;
            episode.hiddenState.hiddenFlags.completedStages = Number(episode.hiddenState.hiddenFlags.completedStages ?? 0) + 1;
            markKeyEvent();
            queuePropagation({ channel: "ritual", payload: { phase: "altar" }, sourceWorldId: String(episode.player.worldId) });
            if (episode.levelFamilyId === "altar_chain" && String(episode.player.worldId) === "w3") {
              episode.hiddenState.hiddenFlags.ritualComplete = true;
            }
            syncRitualState(episode);
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
      }
    }
  ],
  propagationRules: [
    {
      id: "propagate-ritual-echo",
      propagate: (episode, event, events) => propagateRitual(episode, event, events)
    }
  ],
  winCondition: {
    evaluate: (episode) => ({
      done: episode.hiddenState.hiddenFlags.ritualComplete === true,
      reward: episode.hiddenState.hiddenFlags.ritualComplete === true ? 1 : 0,
      event: episode.hiddenState.hiddenFlags.ritualComplete === true ? { turn: episode.metrics.totalSteps, text: "Ritual network completed.", tone: "good" } : void 0
    })
  },
  observationAdapter: {
    toObservation: (episode) => buildObservation(episode, ritualNetworkPlugin, episode.worlds[episode.player.worldId])
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
      glow: "rgba(242,166,90,0.3)"
    },
    entityAppearance: {
      altar: { fill: "#c084fc", stroke: "#e9d5ff", shape: "square", label: "A" },
      rune_stone: { fill: "#60a5fa", stroke: "#dbeafe", shape: "diamond", label: "R" },
      brazier: { fill: "#fb7185", stroke: "#fecdd3", shape: "circle", label: "F" },
      seal_node: { fill: "#f59e0b", stroke: "#fde68a", shape: "hex", label: "S" }
    },
    tileAppearance: {
      ".": { fill: "#38262d", stroke: "rgba(255,255,255,0.04)" },
      "#": { fill: "#120a0d", stroke: "rgba(255,255,255,0.02)" }
    }
  },
  getVisibleEntities: (world) => world.entities.map((entity) => ({
    entityId: entity.id,
    kind: entity.kind,
    position: entity.position,
    state: entity.publicState
  })),
  getPlayerSpawn: () => ({ x: 1, y: 1 }),
  getPublicPlayerStatus: () => ({
    focus: "ritual"
  }),
  syncBenchmarkState: (episode) => syncRitualState(episode),
  evaluateTheorySubmission: (_episode, submission) => {
    const text = `${submission.hypothesizedRule} ${submission.evidence}`.toLowerCase();
    const mentionsRitual = text.includes("ritual") || text.includes("altar") || text.includes("rune") || text.includes("brazier");
    const mentionsDependency = text.includes("attune") || text.includes("echo") || text.includes("chain") || text.includes("merge");
    return {
      ruleDiscoveryScore: mentionsRitual && mentionsDependency ? 1 : mentionsRitual ? 0.5 : 0,
      evidenceScore: submission.evidence.trim() ? 0.8 : 0.25,
      feedback: mentionsRitual && mentionsDependency ? "Theory accepted: ritual progress depends on hidden attunement and cross-world rite dependencies." : "Theory noted, but it does not yet explain the hidden ritual dependency structure."
    };
  }
};

// src/games/signalLogic/plugin.ts
var actionSchema5 = {
  actions: [
    { type: "move_up", description: "Move north" },
    { type: "move_down", description: "Move south" },
    { type: "move_left", description: "Move west" },
    { type: "move_right", description: "Move east" },
    { type: "interact", description: "Toggle sources or calibrate local logic devices" },
    { type: "switch_world", description: "Cycle to the next world" },
    { type: "wait", description: "Pause for one step" }
  ]
};
var signalSource = (id, worldId, x, y, channel) => ({
  id: asEntityId(id),
  kind: "signal_source",
  worldId: asWorldId(worldId),
  position: { x, y },
  tags: ["interactive", "logic"],
  publicState: { active: false, channel },
  hiddenState: { active: false, channel }
});
var logicGate = (id, worldId, x, y, mode) => ({
  id: asEntityId(id),
  kind: "logic_gate",
  worldId: asWorldId(worldId),
  position: { x, y },
  tags: ["interactive", "logic"],
  publicState: { mode, output: false },
  hiddenState: { mode, output: false }
});
var concealHiddenGateMode = (episode) => {
  if (episode.levelFamilyId !== "overlay_logic_stack") return;
  for (const worldId of ["w2", "w3"]) {
    const gate = episode.worlds[worldId].entities.find((entity) => entity.kind === "logic_gate");
    if (gate) {
      gate.publicState.mode = "unknown_overlay";
    }
  }
};
var receiver = (id, worldId, x, y) => ({
  id: asEntityId(id),
  kind: "receiver",
  worldId: asWorldId(worldId),
  position: { x, y },
  tags: ["status"],
  publicState: { output: false },
  hiddenState: { output: false }
});
var inverter = (id, worldId, x, y) => ({
  id: asEntityId(id),
  kind: "inverter",
  worldId: asWorldId(worldId),
  position: { x, y },
  tags: ["status"],
  publicState: { active: false },
  hiddenState: { active: false }
});
var logicCells = [
  { x: 3, y: 2 },
  { x: 4, y: 2 },
  { x: 5, y: 2 },
  { x: 4, y: 3 }
];
var syncLogicState = (episode) => {
  if (episode.levelFamilyId === "overlay_logic_stack") {
    const alphaActive = episode.hiddenState.hiddenFlags.alphaActive === true;
    const betaActive = episode.hiddenState.hiddenFlags.betaActive === true;
    const expected = alphaActive || betaActive;
    const overlayAlpha = alphaActive;
    const overlayBeta = betaActive;
    const overlayCount = Number(overlayAlpha) + Number(overlayBeta);
    const observed = Boolean(expected !== overlayAlpha !== overlayBeta);
    const anomalyDetected = observed !== expected;
    const overlayTags = [
      overlayAlpha ? "alpha-xor-overlay" : "",
      overlayBeta ? "beta-xor-overlay" : ""
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
    }
    if (betaChamberGate) {
      betaChamberGate.publicState.mode = "unknown_overlay";
      betaChamberGate.publicState.output = overlayBeta;
      betaChamberGate.hiddenState.output = overlayBeta;
    }
    episode.hiddenState.hiddenFlags.expectedVisibleOutput = expected ? "high" : "low";
    episode.hiddenState.hiddenFlags.visibleOutput = observed ? "high" : "low";
    episode.hiddenState.hiddenFlags.anomalyDetected = anomalyDetected;
    episode.hiddenState.hiddenFlags.activeOverlayCount = overlayCount;
    const stackedStable = observed === true && anomalyDetected === false && alphaActive && betaActive;
    episode.hiddenState.hiddenFlags.objectiveMet = stackedStable;
    if (alphaActive && anomalyDetected) discoverWorld(episode, "w2");
    if (betaActive && anomalyDetected) discoverWorld(episode, "w3");
    const inspectedAlpha = episode.hiddenState.hiddenFlags.overlayAlphaInspected === true;
    const inspectedBeta = episode.hiddenState.hiddenFlags.overlayBetaInspected === true;
    const currentWorldId = String(episode.player.worldId);
    const reportAccepted = episode.hiddenState.hiddenFlags.reportAccepted === true;
    const discoveredAlpha = episode.publicState.discoveredWorldIds.includes(asWorldId("w2"));
    const discoveredBeta = episode.publicState.discoveredWorldIds.includes(asWorldId("w3"));
    const worldCompleteness = [discoveredAlpha, discoveredBeta, inspectedAlpha, inspectedBeta].filter(Boolean).length / 4;
    const nextObjective = !alphaActive ? "Toggle the alpha source and compare the expected OR output with the observed receiver output." : alphaActive && anomalyDetected && !inspectedAlpha ? "An alpha-side anomaly is visible. Possess the discovered hidden chamber and inspect its overlay rule." : !betaActive ? "Return to the main world, toggle the beta source, and compare expected versus observed output again." : betaActive && anomalyDetected && !inspectedBeta ? "A beta-side anomaly is visible. Possess the discovered hidden chamber and inspect its overlay rule." : !stackedStable ? "Use both visible sources together so stacked hidden overlays act on the same main receiver." : !reportAccepted ? "You have enough evidence. Submit a report that states the hidden world count and the concrete overlay rules." : "The report has been accepted.";
    setPublicStats(episode, {
      baselineRule: "visible_or",
      expectedVisibleOutput: expected ? "high" : "low",
      observedMainOutput: observed ? "high" : "low",
      anomalyDetected,
      activeOverlayCount: overlayCount,
      activeOverlays: overlayTags.join(", ") || "none",
      hiddenWorldCountTarget: 2,
      hiddenWorldCompleteness: Number(worldCompleteness.toFixed(2)),
      reportAccepted,
      nextObjective
    });
    const anomalyHint = currentWorldId === "w1" ? anomalyDetected ? "The main receiver violates the visible OR rule. This is your cue to inspect the newly revealed hidden overlay chamber." : alphaActive || betaActive ? "No anomaly is visible right now. Change the visible source pattern and compare expected versus observed output." : "The visible console should follow a simple OR rule until a hidden overlay bleeds into it." : currentWorldId === "w2" ? inspectedAlpha ? "You have inspected the alpha overlay rule. Return to the main world and test how it stacks with other overlays." : "This hidden chamber explains the alpha-side anomaly. Inspect its gate rule, then return to the main world." : inspectedBeta ? "You have inspected the beta overlay rule. Return to the main world and test the stacked effect." : "This hidden chamber explains the beta-side anomaly. Inspect its gate rule, then return to the main world.";
    setHudHints(episode, [
      "The visible console advertises a simple OR rule for the main receiver.",
      "If the observed output disagrees with that OR rule, a hidden overlay is currently modifying the main world.",
      anomalyHint
    ]);
    setExplicitRules(episode, [
      "The visible main-world rule is OR: if either source is on, the main receiver should be high.",
      "Observed disagreement between expected and actual main output indicates that a hidden-world overlay rule is active.",
      "When an anomaly appears, the relevant hidden chamber becomes discoverable for inspection.",
      "Multiple hidden overlays can stack on the same main-world receiver.",
      "You may submit a theory about how hidden overlays modify the visible rule."
    ]);
    setMainTask(episode, {
      title: "Submit a complete hidden overlay report",
      description: "Use the visible OR console as your main task surface. Detect anomalies, inspect the hidden chambers that explain them, verify how multiple overlays stack on the same main receiver, and then submit a report that states how many hidden worlds are involved and what each hidden rule does.",
      completed: reportAccepted
    });
    const hiddenTasks2 = [
      {
        id: "inspect-alpha-overlay",
        title: "Inspect the alpha anomaly chamber",
        description: "Observe the hidden overlay rule that appears when the alpha source creates an anomaly in the main world.",
        worldId: asWorldId("w2"),
        completed: inspectedAlpha,
        discovered: episode.publicState.discoveredWorldIds.includes(asWorldId("w2"))
      },
      {
        id: "inspect-beta-overlay",
        title: "Inspect the beta anomaly chamber",
        description: "Observe the hidden overlay rule that appears when the beta source creates an anomaly in the main world.",
        worldId: asWorldId("w3"),
        completed: inspectedBeta,
        discovered: episode.publicState.discoveredWorldIds.includes(asWorldId("w3"))
      },
      {
        id: "verify-stacked-overlays",
        title: "Verify stacked overlay interaction",
        description: "Show in the main world that multiple hidden overlays can stack on the same receiver and restore a stable output.",
        worldId: asWorldId("w1"),
        completed: stackedStable,
        discovered: true
      },
      {
        id: "submit-overlay-report",
        title: "Submit the hidden overlay report",
        description: "Report the hidden world count and the concrete overlay rules governing the anomalies.",
        worldId: asWorldId("w1"),
        completed: reportAccepted,
        discovered: true
      }
    ];
    setHiddenTasks(episode, hiddenTasks2);
    const completedHidden2 = hiddenTasks2.filter((task) => task.completed).length;
    setScoreBreakdown(episode, {
      mainTaskScore: reportAccepted ? 1 : 0,
      hiddenTaskScore: hiddenTasks2.length > 0 ? completedHidden2 / hiddenTasks2.length : 0,
      efficiencyScore: Math.max(0, 1 - episode.metrics.totalSteps / 24)
    });
    return;
  }
  setPublicStats(episode, {
    localSignal: String(episode.worlds[episode.player.worldId].localFlags.signalState ?? "idle"),
    visibleOutput: String(episode.hiddenState.hiddenFlags.visibleOutput ?? "unknown")
  });
  setHudHints(episode, [
    "Toggle signal sources and watch which gates or receivers change in other worlds.",
    "The hidden target is a logic pattern, not a destination tile."
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
    "You may submit a theory about the hidden logic rule with evidence."
  ]);
  setMainTask(episode, {
    title: "Match the hidden logic target",
    description: episode.levelFamilyId === "fork_logic_merge" ? "Align multiple hidden signal branches until the merge receiver reaches its target state." : "Infer the hidden logic chain and drive the remote receiver into the target pattern.",
    completed: episode.hiddenState.hiddenFlags.objectiveMet === true
  });
  const hiddenTasks = episode.levelFamilyId === "fork_logic_merge" ? [
    {
      id: "alpha-signal",
      title: "Activate alpha signal",
      description: "Drive the alpha branch into an active state.",
      worldId: asWorldId("w1"),
      completed: episode.hiddenState.hiddenFlags.alphaSignal === true,
      discovered: true
    },
    {
      id: "beta-signal",
      title: "Activate beta signal",
      description: "Drive the beta branch into an active state.",
      worldId: asWorldId("w2"),
      completed: episode.hiddenState.hiddenFlags.betaSignal === true,
      discovered: episode.publicState.discoveredWorldIds.includes(asWorldId("w2"))
    },
    {
      id: "merge-receiver",
      title: "Satisfy the merge receiver",
      description: "Drive the final merged receiver to the target output.",
      worldId: asWorldId("w4"),
      completed: episode.hiddenState.hiddenFlags.objectiveMet === true,
      discovered: episode.publicState.discoveredWorldIds.includes(asWorldId("w4"))
    }
  ] : [
    {
      id: "gate-room",
      title: "Reveal the hidden gate room",
      description: "Observe and infer the remote transformation world.",
      worldId: asWorldId("w2"),
      completed: episode.worlds.w2.entities.some((entity) => entity.kind === "logic_gate" && entity.hiddenState.output === true),
      discovered: episode.publicState.discoveredWorldIds.includes(asWorldId("w2"))
    },
    {
      id: "receiver-room",
      title: "Match the receiver room",
      description: "Drive the hidden receiver into the target state.",
      worldId: asWorldId("w3"),
      completed: episode.hiddenState.hiddenFlags.objectiveMet === true,
      discovered: episode.publicState.discoveredWorldIds.includes(asWorldId("w3"))
    }
  ];
  setHiddenTasks(episode, hiddenTasks);
  const completedHidden = hiddenTasks.filter((task) => task.completed).length;
  setScoreBreakdown(episode, {
    mainTaskScore: episode.hiddenState.hiddenFlags.objectiveMet === true ? 1 : 0,
    hiddenTaskScore: hiddenTasks.length > 0 ? completedHidden / hiddenTasks.length : 0,
    efficiencyScore: Math.max(0, 1 - episode.metrics.totalSteps / (episode.levelFamilyId === "fork_logic_merge" ? 26 : 18))
  });
};
var createBasicLogicChain = (seed) => {
  const [sourcePos, gatePos, receiverPos] = seededPositions(seed + 51, logicCells, 3);
  const episode = createEpisodeBase({
    episodeSeed: seed,
    gameClassId: "signal_logic",
    levelFamilyId: "basic_logic_chain",
    topology: {
      nodes: [asNodeId("w1"), asNodeId("w2"), asNodeId("w3")],
      edges: [
        { from: asNodeId("w1"), to: asNodeId("w2"), channel: "signal", weight: 1 },
        { from: asNodeId("w2"), to: asNodeId("w3"), channel: "signal", weight: 1 }
      ]
    },
    hiddenFlags: { targetPattern: "inverted_on", visibleOutput: "idle", objectiveMet: false },
    worlds: [
      createWorld({
        id: "w1",
        label: "Emitter Room",
        tiles: cloneRoomTiles(),
        entities: [signalSource("src-a", "w1", sourcePos.x, sourcePos.y, "amber")],
        localFlags: { signalState: "low" }
      }),
      createWorld({
        id: "w2",
        label: "Gate Room",
        tiles: cloneRoomTiles(),
        entities: [logicGate("gate-b", "w2", gatePos.x, gatePos.y, "NOT"), inverter("inv-b", "w2", 6, 3)],
        localFlags: { signalState: "low" }
      }),
      createWorld({
        id: "w3",
        label: "Receiver Room",
        tiles: cloneRoomTiles(),
        entities: [receiver("recv-c", "w3", receiverPos.x, receiverPos.y)],
        localFlags: { signalState: "low" }
      })
    ],
    startWorldId: "w1"
  });
  concealHiddenGateMode(episode);
  syncLogicState(episode);
  return episode;
};
var createForkLogicMerge = (seed) => {
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
        { from: asNodeId("w3"), to: asNodeId("w4"), channel: "signal", weight: 1 }
      ]
    },
    hiddenFlags: { alphaSignal: false, betaSignal: false, visibleOutput: "idle", objectiveMet: false },
    worlds: [
      createWorld({
        id: "w1",
        label: "Alpha Source",
        tiles: cloneRoomTiles(),
        entities: [signalSource("src-alpha", "w1", sourceA.x, sourceA.y, "alpha")],
        localFlags: { signalState: "low" }
      }),
      createWorld({
        id: "w2",
        label: "Beta Source",
        tiles: cloneRoomTiles(),
        entities: [signalSource("src-beta", "w2", sourceB.x, sourceB.y, "beta")],
        localFlags: { signalState: "low" }
      }),
      createWorld({
        id: "w3",
        label: "Phase Inverter",
        tiles: cloneRoomTiles(),
        entities: [inverter("inv-bridge", "w3", 4, 2)],
        localFlags: { signalState: "low" }
      }),
      createWorld({
        id: "w4",
        label: "Merge Receiver",
        tiles: cloneRoomTiles(),
        entities: [logicGate("gate-merge", "w4", mergeGate.x, mergeGate.y, "AND"), receiver("recv-merge", "w4", 6, 3)],
        localFlags: { signalState: "low" }
      })
    ],
    startWorldId: "w1"
  });
  syncLogicState(episode);
  return episode;
};
var createOverlayLogicStack = (seed) => {
  const [alphaPos, betaPos, baselineGatePos, receiverPos] = seededPositions(seed + 91, logicCells, 4);
  const episode = createEpisodeBase({
    episodeSeed: seed,
    gameClassId: "signal_logic",
    levelFamilyId: "overlay_logic_stack",
    topology: {
      nodes: [asNodeId("w1"), asNodeId("w2"), asNodeId("w3")],
      edges: [
        { from: asNodeId("w2"), to: asNodeId("w1"), channel: "overlay", weight: 1 },
        { from: asNodeId("w3"), to: asNodeId("w1"), channel: "overlay", weight: 1 }
      ]
    },
    hiddenFlags: {
      alphaActive: false,
      betaActive: false,
      visibleOutput: "low",
      expectedVisibleOutput: "low",
      anomalyDetected: false,
      activeOverlayCount: 0,
      overlayAlphaInspected: false,
      overlayBetaInspected: false,
      objectiveMet: false,
      reportAccepted: false,
      reportedWorldCountCorrect: false,
      reportedRuleCoverage: 0
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
          receiver("recv-main", "w1", receiverPos.x, receiverPos.y)
        ],
        localFlags: { signalState: "idle" }
      }),
      createWorld({
        id: "w2",
        label: "Alpha Shadow Chamber",
        tiles: cloneRoomTiles(),
        entities: [logicGate("gate-alpha-overlay", "w2", 4, 2, "XOR(alpha)"), inverter("inv-alpha", "w2", 5, 3)],
        localFlags: { signalState: "idle" }
      }),
      createWorld({
        id: "w3",
        label: "Beta Shadow Chamber",
        tiles: cloneRoomTiles(),
        entities: [logicGate("gate-beta-overlay", "w3", 4, 2, "XOR(beta)"), inverter("inv-beta", "w3", 3, 3)],
        localFlags: { signalState: "idle" }
      })
    ],
    startWorldId: "w1"
  });
  syncLogicState(episode);
  return episode;
};
var propagateSignal = (episode, event, events) => {
  if (episode.levelFamilyId === "overlay_logic_stack") {
    const sourceTag = String(event.payload.sourceTag ?? "");
    const isActive2 = event.payload.active === true;
    if (sourceTag === "alpha") {
      episode.hiddenState.hiddenFlags.alphaActive = isActive2;
      episode.worlds.w2.localFlags.signalState = isActive2 ? "overlay_armed" : "idle";
    }
    if (sourceTag === "beta") {
      episode.hiddenState.hiddenFlags.betaActive = isActive2;
      episode.worlds.w3.localFlags.signalState = isActive2 ? "overlay_armed" : "idle";
    }
    syncLogicState(episode);
    const anomalyDetected = episode.hiddenState.hiddenFlags.anomalyDetected === true;
    const activeOverlayCount = Number(episode.hiddenState.hiddenFlags.activeOverlayCount ?? 0);
    if (anomalyDetected) {
      events.push({
        turn: episode.metrics.totalSteps + 1,
        text: `Observed output diverges from the visible OR rule. ${activeOverlayCount} hidden overlay(s) are bleeding into the main receiver.`,
        tone: "warn"
      });
    } else if (activeOverlayCount > 1 && episode.hiddenState.hiddenFlags.objectiveMet === true) {
      events.push({
        turn: episode.metrics.totalSteps + 1,
        text: "Stacked hidden overlays act on the same main receiver and cancel cleanly, restoring the visible rule.",
        tone: "good"
      });
    } else {
      events.push({
        turn: episode.metrics.totalSteps + 1,
        text: "The main receiver currently matches the visible OR rule."
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
var signalLogicPlugin = {
  id: "signal_logic",
  title: "Signal Logic",
  description: "Manipulate hidden cross-world logic until a distant receiver matches its target pattern.",
  publicActionSchema: actionSchema5,
  vocabulary: {
    entityKinds: ["signal_source", "logic_gate", "receiver", "inverter"],
    tileKinds: [".", "#"]
  },
  levelFamilies: [
    { id: "basic_logic_chain", title: "Basic Logic Chain", description: "A source feeds a hidden inversion chain ending at a receiver." },
    { id: "fork_logic_merge", title: "Fork Logic Merge", description: "Two remote sources must align to satisfy a merged logic gate." },
    {
      id: "overlay_logic_stack",
      title: "Overlay Logic Stack",
      description: "The visible main-world rule is correct until hidden overlay chambers stack extra rules onto the same receiver."
    }
  ],
  instanceGenerator: {
    generate: (seed, familyId) => familyId === "fork_logic_merge" ? createForkLogicMerge(seed) : familyId === "overlay_logic_stack" ? createOverlayLogicStack(seed) : createBasicLogicChain(seed)
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
          syncLogicState(episode);
          emit({ turn: episode.metrics.totalSteps + 1, text: `Signal source toggled ${nextState ? "on" : "off"}.`, tone: "good" });
          return;
        }
        if (entity.kind === "logic_gate") {
          if (episode.levelFamilyId === "overlay_logic_stack" && episode.player.worldId === "w2") {
            episode.hiddenState.hiddenFlags.overlayAlphaInspected = true;
            syncLogicState(episode);
            emit({
              turn: episode.metrics.totalSteps + 1,
              text: "The hidden gate hums only when the alpha source is active. On the main console, the receiver had contradicted the visible OR expectation; this chamber appears to contribute one layer of that anomaly rather than naming its exact rule outright.",
              tone: "good"
            });
            return;
          }
          if (episode.levelFamilyId === "overlay_logic_stack" && episode.player.worldId === "w3") {
            episode.hiddenState.hiddenFlags.overlayBetaInspected = true;
            syncLogicState(episode);
            emit({
              turn: episode.metrics.totalSteps + 1,
              text: "This hidden gate responds to the beta-side anomaly. It activates under the same kind of main-world contradiction, suggesting a second overlay layer on the receiver without directly spelling out the rule.",
              tone: "good"
            });
            return;
          }
          emit({
            turn: episode.metrics.totalSteps + 1,
            text: entity.publicState.mode === "unknown_overlay" ? `The hidden gate is active=${entity.publicState.output ? "true" : "false"}, but its transformation rule is not labeled. You need to infer it from how main-world expectation and observed output diverge.` : `The ${String(entity.publicState.mode)} gate shows ${entity.publicState.output ? "high" : "low"} output.`
          });
          return;
        }
        emit({ turn: episode.metrics.totalSteps + 1, text: "The device does not accept direct calibration.", tone: "warn" });
      }
    }
  ],
  propagationRules: [
    {
      id: "propagate-logic-state",
      propagate: (episode, event, events) => propagateSignal(episode, event, events)
    }
  ],
  winCondition: {
    evaluate: (episode) => {
      if (String(episode.levelFamilyId) === "overlay_logic_stack") {
        const accepted = episode.hiddenState.hiddenFlags.reportAccepted === true;
        return {
          done: accepted,
          reward: accepted ? Math.max(0, episode.publicState.scoreBreakdown.totalScore) : 0,
          event: accepted ? {
            turn: episode.metrics.totalSteps,
            text: "Overlay report accepted. Final reward is derived from report quality, world completeness, and efficiency.",
            tone: "good"
          } : void 0
        };
      }
      return {
        done: episode.hiddenState.hiddenFlags.objectiveMet === true,
        reward: episode.hiddenState.hiddenFlags.objectiveMet === true ? 1 : 0,
        event: episode.hiddenState.hiddenFlags.objectiveMet === true ? { turn: episode.metrics.totalSteps, text: "Signal pattern matched the hidden receiver target.", tone: "good" } : void 0
      };
    }
  },
  observationAdapter: {
    toObservation: (episode) => buildObservation(episode, signalLogicPlugin, episode.worlds[episode.player.worldId])
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
      glow: "rgba(147,197,253,0.28)"
    },
    entityAppearance: {
      signal_source: { fill: "#60a5fa", stroke: "#dbeafe", shape: "circle", label: "S" },
      logic_gate: { fill: "#818cf8", stroke: "#e0e7ff", shape: "square", label: "G" },
      receiver: { fill: "#34d399", stroke: "#d1fae5", shape: "hex", label: "R" },
      inverter: { fill: "#f472b6", stroke: "#fce7f3", shape: "diamond", label: "N" }
    },
    tileAppearance: {
      ".": { fill: "#2b3550", stroke: "rgba(255,255,255,0.04)" },
      "#": { fill: "#0a0f19", stroke: "rgba(255,255,255,0.02)" }
    }
  },
  getVisibleEntities: (world) => world.entities.map((entity) => ({
    entityId: entity.id,
    kind: entity.kind,
    position: entity.position,
    state: entity.publicState
  })),
  getPlayerSpawn: () => ({ x: 1, y: 1 }),
  getPublicPlayerStatus: () => ({
    focus: "logic"
  }),
  syncBenchmarkState: (episode) => syncLogicState(episode),
  evaluateTheorySubmission: (_episode, submission) => {
    const text = `${submission.hypothesizedRule} ${submission.evidence}`.toLowerCase();
    if (String(_episode.levelFamilyId) === "overlay_logic_stack") {
      const mentionsVisibleRule = text.includes("or") || text.includes("visible rule") || text.includes("main rule");
      const mentionsOverlay = text.includes("overlay") || text.includes("hidden chamber") || text.includes("hidden rule");
      const mentionsStack = text.includes("stack") || text.includes("same receiver") || text.includes("together") || text.includes("cancel");
      const mentionsFlip = text.includes("xor") || text.includes("flip") || text.includes("invert");
      const mentionsAlpha = text.includes("alpha") || text.includes("w2");
      const mentionsBeta = text.includes("beta") || text.includes("w3");
      const mentionsTwoWorlds = text.includes("2 hidden") || text.includes("two hidden") || text.includes("2 overlay") || text.includes("two overlay") || text.includes("two chambers") || text.includes("2 chambers") || mentionsAlpha && mentionsBeta;
      const discoveredAlpha = _episode.publicState.discoveredWorldIds.includes(asWorldId("w2"));
      const discoveredBeta = _episode.publicState.discoveredWorldIds.includes(asWorldId("w3"));
      const inspectedAlpha = _episode.hiddenState.hiddenFlags.overlayAlphaInspected === true;
      const inspectedBeta = _episode.hiddenState.hiddenFlags.overlayBetaInspected === true;
      const worldCompleteness = [discoveredAlpha, discoveredBeta, inspectedAlpha, inspectedBeta].filter(Boolean).length / 4;
      const ruleCoverage = [mentionsVisibleRule, mentionsOverlay, mentionsStack, mentionsFlip, mentionsAlpha, mentionsBeta, mentionsTwoWorlds].filter(Boolean).length / 7;
      const reportAccepted = worldCompleteness >= 0.75 && ruleCoverage >= 0.85;
      _episode.hiddenState.hiddenFlags.reportAccepted = reportAccepted;
      _episode.hiddenState.hiddenFlags.reportedWorldCountCorrect = mentionsTwoWorlds;
      _episode.hiddenState.hiddenFlags.reportRuleCoverage = ruleCoverage;
      return {
        ruleDiscoveryScore: reportAccepted ? 1 : Math.max(0.2, Number(ruleCoverage.toFixed(2))),
        evidenceScore: Math.max(0.2, Number(worldCompleteness.toFixed(2))),
        feedback: reportAccepted ? "Report accepted: you identified that the visible world follows OR, that there are two relevant hidden overlay chambers, that each chamber contributes an XOR-like flip, and that stacked overlays can cancel on the same main receiver." : "Report noted, but it should state the hidden world count and explain the visible OR rule, the alpha and beta overlay chambers, and how their XOR-like overlays stack on the same main receiver."
      };
    }
    const mentionsSignal = text.includes("signal") || text.includes("logic") || text.includes("receiver") || text.includes("gate");
    const mentionsTransform = text.includes("invert") || text.includes("and") || text.includes("merge") || text.includes("pattern");
    return {
      ruleDiscoveryScore: mentionsSignal && mentionsTransform ? 1 : mentionsSignal ? 0.5 : 0,
      evidenceScore: submission.evidence.trim() ? 0.8 : 0.25,
      feedback: mentionsSignal && mentionsTransform ? "Theory accepted: hidden signal transformations determine the remote receiver pattern." : "Theory noted, but it does not yet capture the hidden logic transformation rule."
    };
  }
};

// src/games/index.ts
var createDefaultRegistry = () => {
  const registry = new GameRegistry();
  registry.register(propagationEscapePlugin);
  registry.register(energyNetworkPlugin);
  registry.register(ritualNetworkPlugin);
  registry.register(signalLogicPlugin);
  registry.register(ecologyNetworkPlugin);
  return registry;
};

// src/utils/grid.ts
var isWithinBounds = (world, position) => position.x >= 0 && position.y >= 0 && position.x < world.width && position.y < world.height;
var getTile = (world, position) => world.tiles[position.y]?.[position.x] ?? "#";
var isWalkableTile = (tile) => tile !== "#";
var positionsEqual = (a, b) => a.x === b.x && a.y === b.y;

// src/core/kernel.ts
var appendEvent = (episode, event) => {
  episode.eventLog.push(event);
  episode.eventLog = episode.eventLog.slice(-6);
};
var syncPublicState = (episode) => {
  episode.publicState.turn = episode.metrics.totalSteps;
  episode.publicState.currentWorldId = episode.player.worldId;
  episode.publicState.player = {
    inventory: [...episode.player.inventory],
    energy: episode.player.energy,
    hp: episode.player.hp,
    status: { ...episode.publicState.player.status }
  };
};
var EnvironmentKernel = class {
  constructor(plugin, episode) {
    this.plugin = plugin;
    this.episode = episode;
    const spawn = this.plugin.getPlayerSpawn(this.episode);
    this.episode.player.position = { ...spawn };
    this.episode.player.worldId = this.episode.publicState.currentWorldId;
    this.syncDerivedPublicState();
  }
  getEpisode() {
    return this.episode;
  }
  getActionSchema() {
    const seen = new Set(this.plugin.publicActionSchema.actions.map((action) => action.type));
    const extraActions = [];
    if (!seen.has("return_main")) {
      extraActions.push({ type: "return_main", description: "Return control to the main world" });
    }
    if (!seen.has("submit_theory")) {
      extraActions.push({ type: "submit_theory", description: "Submit a hidden-rule hypothesis with evidence" });
    }
    if (!seen.has("request_oracle")) {
      extraActions.push({ type: "request_oracle", description: "Request a benchmark oracle hint at a scoring cost" });
    }
    return {
      actions: [...this.plugin.publicActionSchema.actions, ...extraActions]
    };
  }
  getObservation() {
    return this.plugin.observationAdapter.toObservation(this.episode);
  }
  reset(nextEpisode) {
    this.episode = nextEpisode;
    const spawn = this.plugin.getPlayerSpawn(this.episode);
    this.episode.player.position = { ...spawn };
    this.episode.player.worldId = this.episode.publicState.currentWorldId;
    this.syncDerivedPublicState();
    return {
      observation: this.getObservation(),
      reward: 0,
      done: false,
      truncated: false,
      info: this.getInfo()
    };
  }
  step(action) {
    const episode = this.episode;
    const world = episode.worlds[episode.player.worldId];
    const events = [];
    const propagationQueue = [];
    let reward = 0;
    let done = false;
    const emit = (event) => {
      events.push(event);
      appendEvent(episode, event);
    };
    const markKeyEvent = () => {
      if (episode.metrics.firstKeyEventStep === null) {
        episode.metrics.firstKeyEventStep = episode.metrics.totalSteps + 1;
      }
    };
    const queuePropagation = (event) => {
      propagationQueue.push(event);
    };
    if (action.type === "switch_world") {
      this.handleWorldShift(episode, emit);
    } else if (action.type === "return_main") {
      const mainWorldId = episode.publicState.mainWorldId;
      if (episode.player.worldId === mainWorldId) {
        emit({
          turn: episode.metrics.totalSteps + 1,
          text: "You are already acting from the main world."
        });
      } else {
        episode.player.worldId = mainWorldId;
        episode.publicState.currentWorldId = mainWorldId;
        const nextSpawn = this.plugin.getPlayerSpawn(episode);
        episode.player.position = { ...nextSpawn };
        emit({
          turn: episode.metrics.totalSteps + 1,
          text: `Returned control to ${episode.worlds[mainWorldId].label}.`
        });
      }
    } else if (action.type.startsWith("move_")) {
      const delta = action.type === "move_up" ? { x: 0, y: -1 } : action.type === "move_down" ? { x: 0, y: 1 } : action.type === "move_left" ? { x: -1, y: 0 } : { x: 1, y: 0 };
      const next = {
        x: episode.player.position.x + delta.x,
        y: episode.player.position.y + delta.y
      };
      const currentWorld = episode.worlds[episode.player.worldId];
      const blockingEntity = currentWorld.entities.find(
        (entity) => entity.blocksMovement && positionsEqual(entity.position, next)
      );
      if (isWithinBounds(currentWorld, next) && isWalkableTile(getTile(currentWorld, next)) && !blockingEntity) {
        episode.player.position = next;
      } else {
        emit({
          turn: episode.metrics.totalSteps + 1,
          text: "The path resists that move.",
          tone: "warn"
        });
      }
    } else if (action.type === "interact") {
      episode.metrics.interactionCount += 1;
      for (const rule of this.plugin.interactionRules) {
        rule.apply({
          episode,
          world,
          action,
          events,
          markKeyEvent,
          emit,
          queuePropagation
        });
      }
    } else if (action.type === "submit_theory") {
      this.handleTheorySubmission(action, episode, emit);
    } else if (action.type === "request_oracle") {
      this.handleOracleRequest(episode, emit);
    }
    while (propagationQueue.length > 0) {
      const event = propagationQueue.shift();
      for (const propagationRule of this.plugin.propagationRules) {
        propagationRule.propagate(episode, event, events);
      }
    }
    episode.metrics.totalSteps += 1;
    this.syncDerivedPublicState();
    const winResult = this.plugin.winCondition.evaluate(episode);
    if (winResult.event) {
      appendEvent(episode, winResult.event);
    }
    if (winResult.done) {
      done = true;
      reward += winResult.reward;
      episode.metrics.success = true;
      episode.metrics.successStep = episode.metrics.totalSteps;
    }
    return {
      observation: this.getObservation(),
      reward,
      done,
      truncated: false,
      info: this.getInfo()
    };
  }
  getInfo() {
    return {
      metrics: this.episode.metrics,
      publicState: this.episode.publicState
    };
  }
  syncDerivedPublicState() {
    syncPublicState(this.episode);
    this.episode.publicState.player.status = this.plugin.getPublicPlayerStatus?.(this.episode) ?? {};
    if (this.plugin.getWorldTasks) {
      this.episode.publicState.hiddenTasks = this.plugin.getWorldTasks(this.episode);
    }
    if (this.plugin.getScoreBreakdown) {
      this.episode.publicState.scoreBreakdown = this.plugin.getScoreBreakdown(this.episode);
    }
    this.plugin.syncBenchmarkState?.(this.episode);
  }
  handleWorldShift(episode, emit) {
    const mainWorldId = episode.publicState.mainWorldId;
    const hiddenTargets = (this.plugin.getPossessionTargets?.(episode) ?? episode.publicState.discoveredWorldIds.filter((worldId) => worldId !== mainWorldId)).map((worldId) => asWorldId(String(worldId)));
    if (hiddenTargets.length === 0) {
      emit({
        turn: episode.metrics.totalSteps + 1,
        text: "No discovered hidden world is available for possession yet.",
        tone: "warn"
      });
      return;
    }
    let nextWorldId = hiddenTargets[0];
    if (episode.player.worldId === mainWorldId) {
      nextWorldId = hiddenTargets[0];
    } else {
      const currentIndex = hiddenTargets.findIndex((worldId) => worldId === episode.player.worldId);
      if (currentIndex === -1 || currentIndex === hiddenTargets.length - 1) {
        nextWorldId = mainWorldId;
      } else {
        nextWorldId = hiddenTargets[currentIndex + 1];
      }
    }
    episode.player.worldId = nextWorldId;
    episode.publicState.currentWorldId = nextWorldId;
    episode.metrics.worldSwitches += 1;
    episode.metrics.possessions += 1;
    const nextSpawn = this.plugin.getPlayerSpawn(episode);
    episode.player.position = { ...nextSpawn };
    emit({
      turn: episode.metrics.totalSteps + 1,
      text: nextWorldId === mainWorldId ? `Returned to ${episode.worlds[nextWorldId].label}.` : `Possessed ${episode.worlds[nextWorldId].label}.`
    });
  }
  handleTheorySubmission(action, episode, emit) {
    const hypothesizedRule = String(action.hypothesizedRule ?? "").trim();
    const evidence = String(action.evidence ?? "").trim();
    const confidence = Number(action.confidence ?? 0);
    episode.metrics.theorySubmissions += 1;
    const fallback = {
      ruleDiscoveryScore: hypothesizedRule ? 0.25 : 0,
      evidenceScore: evidence ? 0.25 : 0,
      feedback: hypothesizedRule ? "Theory recorded. This benchmark variant does not yet score rule submissions precisely." : "Theory submission was empty."
    };
    const evaluation = this.plugin.evaluateTheorySubmission?.(episode, {
      hypothesizedRule,
      evidence,
      confidence
    }) ?? fallback;
    episode.publicState.scoreBreakdown = normalizeScoreBreakdown({
      ...episode.publicState.scoreBreakdown,
      ruleDiscoveryScore: evaluation.ruleDiscoveryScore,
      evidenceScore: evaluation.evidenceScore
    });
    episode.publicState.lastSubmissionFeedback = evaluation.feedback;
    emit({
      turn: episode.metrics.totalSteps + 1,
      text: evaluation.feedback,
      tone: evaluation.ruleDiscoveryScore > 0 ? "good" : "warn"
    });
  }
  handleOracleRequest(episode, emit) {
    episode.metrics.oracleRequests += 1;
    episode.hiddenState.hiddenFlags.oracleUses = Number(episode.hiddenState.hiddenFlags.oracleUses ?? 0) + 1;
    const response = this.plugin.requestOracleHint?.(episode) ?? {
      text: "Oracle hint: focus on the most recent meaningful state change and test one variable at a time."
    };
    emit({
      turn: episode.metrics.totalSteps + 1,
      text: `${response.text} This oracle request will reduce your final score.`,
      tone: "warn"
    });
  }
};

// src/interfaces/agentEnv.ts
var AgentEnvAdapter = class {
  constructor(registry) {
    this.registry = registry;
  }
  kernel = null;
  reset(options) {
    const plugin = this.registry.get(options.gameClassId);
    const episode = plugin.instanceGenerator.generate(options.seed ?? 1, options.levelFamilyId);
    this.kernel = new EnvironmentKernel(plugin, episode);
    return {
      observation: this.kernel.getObservation(),
      reward: 0,
      done: false,
      truncated: false,
      info: this.kernel.getInfo()
    };
  }
  step(action) {
    if (!this.kernel) {
      throw new Error("Environment has not been reset.");
    }
    return this.kernel.step(action);
  }
  getActionSchema() {
    if (!this.kernel) {
      return {
        actions: [
          { type: "move_up", description: "Move north" },
          { type: "move_down", description: "Move south" },
          { type: "move_left", description: "Move west" },
          { type: "move_right", description: "Move east" },
          { type: "interact", description: "Interact with local entities" },
          { type: "switch_world", description: "Possess the next discovered hidden world, or cycle back to main" },
          { type: "return_main", description: "Return control to the main world" },
          { type: "submit_theory", description: "Submit a hidden-rule hypothesis with evidence" },
          { type: "request_oracle", description: "Request a costly benchmark hint when you are stuck" },
          { type: "wait", description: "Do nothing for a turn" }
        ]
      };
    }
    return this.kernel.getActionSchema();
  }
  close() {
    this.kernel = null;
  }
};

// src/interfaces/llmTextEnv.ts
var describeEntity = (entity) => {
  const stateEntries = Object.entries(entity.state).map(([key, value]) => `${key}=${String(value)}`).join(", ");
  return `- ${entity.kind} at (${entity.position.x},${entity.position.y})${stateEntries ? ` [${stateEntries}]` : ""}`;
};
var summarizeTasks = (observation) => {
  const hiddenTasks = observation.hiddenTasks.length === 0 ? "- none surfaced yet" : observation.hiddenTasks.map(
    (task) => `- ${task.title}: ${task.discovered ? "discovered" : "hidden"}, ${task.completed ? "completed" : "pending"}${task.worldId ? `, world=${task.worldId}` : ""}`
  ).join("\n");
  return [
    `Main task: ${observation.mainTask.title}`,
    observation.mainTask.description,
    `Main task status: ${observation.mainTask.completed ? "completed" : "in progress"}`,
    "Hidden tasks:",
    hiddenTasks
  ].join("\n");
};
var summarizeScore = (observation) => {
  const score = observation.scoreBreakdown;
  return [
    `Score summary: total=${score.totalScore.toFixed(2)}`,
    `- main=${score.mainTaskScore.toFixed(2)}`,
    `- hidden=${score.hiddenTaskScore.toFixed(2)}`,
    `- rule=${score.ruleDiscoveryScore.toFixed(2)}`,
    `- evidence=${score.evidenceScore.toFixed(2)}`,
    `- efficiency=${score.efficiencyScore.toFixed(2)}`
  ].join("\n");
};
var formatObservationForLLM = (observation, schema) => {
  const actionLines = schema.actions.map((action) => `- ${action.type}: ${action.description}`).join("\n");
  const visibleEntities = observation.visibleEntities.length === 0 ? "- none" : observation.visibleEntities.map((entity) => describeEntity(entity)).join("\n");
  const recentEvents = observation.recentEvents.length === 0 ? "- none" : observation.recentEvents.map((event) => `- [turn ${event.turn}] ${event.text}`).join("\n");
  const explicitRules = observation.explicitRules.map((rule) => `- ${rule}`).join("\n");
  const stats = Object.entries(observation.publicStats).map(([key, value]) => `- ${key}: ${String(value)}`).join("\n");
  return [
    "You are interacting with a benchmark environment.",
    "Primary objective: complete the main visible task as efficiently as possible.",
    "Secondary objective: infer the hidden causal rule well enough to support the main task and submit the required theory.",
    "Treat this like a goal-directed task-solving environment, not a random walk.",
    "This environment usually has a visible main world, hidden worlds unlocked by discovery, and local hidden-world tasks that matter only because they are necessary steps toward the main task.",
    "Important strategy principles:",
    "- Keep asking: what is the next action that advances the main task most directly?",
    "- Do not explore hidden worlds unless they are relevant to opening, stabilizing, or reaching the main objective.",
    "- Compare outcomes after changing one local factor at a time.",
    "- Visible entity states are clues; the same action can cause different remote effects under different local configurations.",
    "- When a local device changes state and a distant event follows, record that as evidence.",
    "- Prefer short controlled experiments over wandering once you see a meaningful mechanism.",
    "- In these benchmarks, hidden-world actions are usually intermediate requirements for the main task, not separate side quests.",
    "- Escaping the environment may require both opening the exit and submitting a sufficiently correct rule theory, but opening the route to the main objective comes first.",
    "- An oracle hint is available as a last resort, but each use lowers the final score.",
    "- After you can explain the pattern in one or two sentences and cite evidence, use submit_theory.",
    `Current world: ${observation.worldId} (${observation.worldRole})`,
    `Turn: ${observation.turn}`,
    `Player position: (${observation.playerPosition.x},${observation.playerPosition.y})`,
    `Inventory: ${observation.player.inventory.join(", ") || "empty"}`,
    `Energy: ${observation.player.energy}`,
    `HP: ${observation.player.hp}`,
    `Discovered worlds: ${observation.discoveredWorlds.join(", ")}`,
    "",
    "Explicit rules:",
    explicitRules,
    "",
    "Implicit rule signals discovered so far:",
    observation.implicitRuleSignals.length === 0 ? "- none yet; some rule structure is still latent or ungated" : observation.implicitRuleSignals.map((signal) => `- ${signal}`).join("\n"),
    "",
    summarizeTasks(observation),
    "",
    "Visible entities:",
    visibleEntities,
    "",
    "Public stats:",
    stats || "- none",
    "",
    "HUD hints:",
    observation.hudHints.map((hint) => `- ${hint}`).join("\n"),
    "",
    "Recent events:",
    recentEvents,
    "",
    summarizeScore(observation),
    "",
    `Last submission feedback: ${observation.lastSubmissionFeedback}`,
    "",
    "Available actions:",
    actionLines,
    "",
    "Decision guidance:",
    "- Prioritize the main task over optional exploration.",
    "- If a newly discovered hidden world appears immediately after a meaningful main-world event, treat it as a likely required step for the main task.",
    "- If Public stats or HUD hints say the current branch follow-up is complete, immediately use return_main and continue the main task from the workshop.",
    "- If a visible local device can toggle mode, test it before repeating the same trigger.",
    "- If recent events imply a remote change, inspect newly discovered hidden worlds.",
    "- Once a hidden-world local task is done, return to the main world and continue advancing the main task.",
    "- If hidden progress exists but ruleDiscoveryScore is still low, prioritize submit_theory with concrete evidence.",
    "- Good evidence mentions a specific configuration, action, and observed outcome.",
    "- In report-driven environments, structure your submission explicitly: hidden_world_count, per-world rule, and stacking rule.",
    "- Do not wait for the environment to name a hidden rule directly; a good report can be based on anomaly patterns, chamber-specific activation, and stacked outcomes.",
    "- In phased puzzles, follow this protocol: unlock the gate, run a local configuration test, inspect the affected hidden world, complete any hidden-world local task, then return to the main world for the next test.",
    "- Use request_oracle only when you are genuinely stuck, because it lowers the final score.",
    "",
    "Reply with JSON only.",
    'Movement example: {"type":"move_right"}',
    'Interaction example: {"type":"interact"}',
    'Possession example: {"type":"switch_world"}',
    'Return example: {"type":"return_main"}',
    'Oracle example: {"type":"request_oracle"}',
    'Theory example: {"type":"submit_theory","hypothesizedRule":"hidden_world_count=2; visible_rule=OR; w2_rule=an alpha-linked hidden overlay modifies the same main receiver when alpha is active; w3_rule=a beta-linked hidden overlay also modifies that receiver; stacking_rule=the two overlays stack on the same receiver and their joint effect must be inferred from main-world anomalies.","evidence":"Alpha-only caused expected OR output to disagree with observed output and revealed one hidden chamber; beta-only caused a second anomaly and revealed another chamber; both hidden chambers showed activation tied to their respective source patterns; enabling both overlays together changed the anomaly pattern again on the same receiver.","confidence":0.9}'
  ].join("\n");
};
var heuristicActionFromText = (text) => {
  const lowered = text.trim().toLowerCase();
  if (!lowered) return null;
  if (lowered.includes("submit")) return { type: "submit_theory" };
  if (lowered.includes("oracle") || lowered.includes("hint")) return { type: "request_oracle" };
  if (lowered.includes("return")) return { type: "return_main" };
  if (lowered.includes("switch") || lowered.includes("possess")) return { type: "switch_world" };
  if (lowered.includes("interact")) return { type: "interact" };
  if (lowered.includes("up") || lowered.includes("north")) return { type: "move_up" };
  if (lowered.includes("down") || lowered.includes("south")) return { type: "move_down" };
  if (lowered.includes("left") || lowered.includes("west")) return { type: "move_left" };
  if (lowered.includes("right") || lowered.includes("east")) return { type: "move_right" };
  if (lowered.includes("wait")) return { type: "wait" };
  return null;
};
var parseLLMAction = (raw) => {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { type: "wait" };
  }
  try {
    const parsed = JSON.parse(trimmed);
    if (parsed && typeof parsed.type === "string") {
      return parsed;
    }
  } catch {
  }
  const heuristic = heuristicActionFromText(trimmed);
  if (heuristic) {
    return heuristic;
  }
  return { type: "wait" };
};
var LLMTextEnvAdapter = class {
  registry = createDefaultRegistry();
  env = new AgentEnvAdapter(this.registry);
  reset(options) {
    const stepResult = this.env.reset(options);
    const actionSchema6 = this.env.getActionSchema();
    return {
      actionSchema: actionSchema6,
      stepResult,
      textObservation: formatObservationForLLM(stepResult.observation, actionSchema6)
    };
  }
  step(action) {
    const stepResult = this.env.step(action);
    const actionSchema6 = this.env.getActionSchema();
    return {
      actionSchema: actionSchema6,
      parsedAction: action,
      stepResult,
      textObservation: formatObservationForLLM(stepResult.observation, actionSchema6)
    };
  }
  stepFromText(raw) {
    const parsedAction = parseLLMAction(raw);
    const turn = this.step(parsedAction);
    return {
      ...turn,
      parsedAction
    };
  }
  close() {
    this.env.close();
  }
};

// scripts/run_llm_benchmark.ts
var parseArgs = () => {
  const args = process.argv.slice(2);
  const get = (flag, fallback) => {
    const index = args.indexOf(flag);
    if (index === -1) return fallback;
    return args[index + 1] ?? fallback;
  };
  return {
    seed: Number(get("--seed", "7")),
    gameClassId: get("--game", "propagation_escape"),
    levelFamilyId: get("--family", "chain_basic"),
    maxSteps: Number(get("--max-steps", "20")),
    mode: get("--mode", "heuristic") ?? "heuristic",
    model: get("--model"),
    apiKey: get("--api-key") ?? process.env.OPENAI_API_KEY ?? process.env.KIMI_API_KEY ?? process.env.DEEPSEEK_API_KEY,
    baseUrl: get("--base-url") ?? process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1"
  };
};
var movementToward = (from, to) => {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (Math.abs(dx) > Math.abs(dy)) {
    return { type: dx > 0 ? "move_right" : "move_left" };
  }
  if (dy !== 0) {
    return { type: dy > 0 ? "move_down" : "move_up" };
  }
  if (dx !== 0) {
    return { type: dx > 0 ? "move_right" : "move_left" };
  }
  return { type: "interact" };
};
var findTask = (observation, id) => observation.hiddenTasks.find((task) => task.id === id);
var findEntityByKind = (observation, kind) => observation.visibleEntities.find((entity) => entity.kind === kind);
var moveOrInteract = (observation, kind) => {
  const target = findEntityByKind(observation, kind);
  if (!target) return null;
  const sameCell = target.position.x === observation.playerPosition.x && target.position.y === observation.playerPosition.y;
  return sameCell ? { type: "interact" } : movementToward(observation.playerPosition, target.position);
};
var isPlayerStandingOnVisibleEntity = (observation) => observation.visibleEntities.some(
  (entity) => entity.position.x === observation.playerPosition.x && entity.position.y === observation.playerPosition.y
);
var findNearestInteractiveEntity = (observation) => {
  const candidates = observation.visibleEntities.filter(
    (entity) => [
      "signal_source",
      "logic_gate",
      "switch",
      "anchor",
      "router",
      "lens",
      "stabilizer",
      "exit",
      "energy_orb",
      "battery_slot",
      "regulator",
      "altar",
      "rune_stone",
      "brazier",
      "seal_node",
      "pollution_source",
      "purifier",
      "seed_pod",
      "water_pool"
    ].includes(entity.kind)
  );
  if (candidates.length === 0) return null;
  return candidates.map((entity) => ({
    entity,
    distance: Math.abs(entity.position.x - observation.playerPosition.x) + Math.abs(entity.position.y - observation.playerPosition.y)
  })).sort((left, right) => left.distance - right.distance)[0]?.entity ?? null;
};
var hasRepeatedNoNearbySignal = (observation) => observation.recentEvents.filter((event) => event.text.includes("No nearby logic interface responds.")).length >= 2;
var countCompletedHiddenTasks = (observation) => observation.hiddenTasks.filter((task) => task.completed).length;
var chooseGuidedRecoveryAction = (observation) => {
  const nearestInteractive = findNearestInteractiveEntity(observation);
  if (nearestInteractive) {
    const sameCell = nearestInteractive.position.x === observation.playerPosition.x && nearestInteractive.position.y === observation.playerPosition.y;
    return sameCell ? { type: "interact" } : movementToward(observation.playerPosition, nearestInteractive.position);
  }
  if (observation.worldRole === "hidden") {
    return { type: "return_main" };
  }
  return null;
};
var phaseRouterHeuristic = (observation, stepIndex, maxSteps) => {
  const worldId = String(observation.worldId);
  const anchorTask = findTask(observation, "anchor-alignment");
  const northTask = findTask(observation, "north-branch");
  const northStabilizerTask = findTask(observation, "north-stabilizer");
  const southTask = findTask(observation, "south-branch");
  const southStabilizerTask = findTask(observation, "south-stabilizer");
  const resonanceTask = findTask(observation, "resonance-vault");
  const route = String(observation.publicStats.route ?? findEntityByKind(observation, "router")?.state.route ?? "north");
  const phase = String(observation.publicStats.phase ?? findEntityByKind(observation, "lens")?.state.phase ?? "direct");
  const sensor = String(observation.publicStats.sensor ?? findEntityByKind(observation, "sensor")?.state.readout ?? "idle");
  const discovered = new Set(observation.discoveredWorlds.map(String));
  const nearEnd = stepIndex >= Math.max(8, maxSteps - 3);
  if (observation.worldRole === "hidden") {
    if (worldId === "w2") {
      if (northStabilizerTask && !northStabilizerTask.completed) {
        return moveOrInteract(observation, "stabilizer") ?? { type: "return_main" };
      }
      return { type: "return_main" };
    }
    if (worldId === "w3") {
      if (southStabilizerTask && !southStabilizerTask.completed) {
        return moveOrInteract(observation, "stabilizer") ?? { type: "return_main" };
      }
      return { type: "return_main" };
    }
    if (worldId === "w4") {
      if (findEntityByKind(observation, "exit")?.state.open === true) {
        return moveOrInteract(observation, "exit") ?? { type: "wait" };
      }
      return { type: "return_main" };
    }
  }
  if (observation.worldRole === "main") {
    if (anchorTask && !anchorTask.completed) {
      return moveOrInteract(observation, "anchor") ?? { type: "wait" };
    }
    if (northTask && !northTask.completed) {
      if (route !== "north") {
        return moveOrInteract(observation, "router") ?? { type: "wait" };
      }
      if (phase !== "direct") {
        return moveOrInteract(observation, "lens") ?? { type: "wait" };
      }
      return moveOrInteract(observation, "switch") ?? { type: "wait" };
    }
    if (northStabilizerTask && !northStabilizerTask.completed) {
      if (worldId === "w1" && discovered.has("w2")) {
        return { type: "switch_world" };
      }
    }
    if (southTask && !southTask.completed) {
      if (route !== "south") {
        return moveOrInteract(observation, "router") ?? { type: "wait" };
      }
      if (phase !== "direct") {
        return moveOrInteract(observation, "lens") ?? { type: "wait" };
      }
      return moveOrInteract(observation, "switch") ?? { type: "wait" };
    }
    if (southStabilizerTask && !southStabilizerTask.completed) {
      if (worldId === "w1" && discovered.has("w3")) {
        return { type: "switch_world" };
      }
    }
    if (resonanceTask && !resonanceTask.completed) {
      if (phase !== "inverted") {
        return moveOrInteract(observation, "lens") ?? { type: "wait" };
      }
      if (sensor !== "resonance") {
        return moveOrInteract(observation, "switch") ?? { type: "wait" };
      }
      if (discovered.has("w4")) {
        return { type: "switch_world" };
      }
    }
    if (nearEnd) {
      return buildTheoryTemplate(observation);
    }
  }
  return null;
};
var buildTheoryTemplate = (observation) => {
  const family = String(observation.levelFamilyId);
  const game = String(observation.gameClassId);
  const defaultEvidence = observation.recentEvents.map((event) => `[${event.turn}] ${event.text}`).join(" | ");
  const confidence = observation.mainTask.completed ? 0.9 : 0.65;
  if (game === "propagation_escape") {
    return {
      type: "submit_theory",
      hypothesizedRule: family === "fork_join_basic" ? "Hidden branch propagation from multiple worlds jointly unlocks the convergence exit." : family === "phase_router" ? "After the anchor is aligned, router and lens settings arm hidden branches; each armed branch must be stabilized in its hidden world before an inverted pulse opens the vault." : "A local switch propagates through hidden worlds and eventually opens a distant exit.",
      evidence: defaultEvidence,
      confidence
    };
  }
  if (game === "energy_network") {
    return {
      type: "submit_theory",
      hypothesizedRule: family === "dual_source_merge" ? "Hidden energy conduits merge multiple source charges before the remote core stabilizes." : "Hidden energy routing carries charge toward a distant thresholded terminal.",
      evidence: defaultEvidence,
      confidence
    };
  }
  if (game === "ritual_network") {
    return {
      type: "submit_theory",
      hypothesizedRule: "Hidden ritual attunement propagates across worlds and gates later ritual stages.",
      evidence: defaultEvidence,
      confidence
    };
  }
  if (game === "signal_logic") {
    if (family === "overlay_logic_stack") {
      return {
        type: "submit_theory",
        hypothesizedRule: "hidden_world_count=2; visible_rule=OR; w2_rule=an alpha-linked hidden overlay changes the same main receiver that the visible OR rule controls; w3_rule=a beta-linked hidden overlay also changes that same receiver; stacking_rule=the two hidden overlays stack on the same receiver and should be described from anomaly evidence rather than from a labeled formula.",
        evidence: defaultEvidence,
        confidence
      };
    }
    return {
      type: "submit_theory",
      hypothesizedRule: "Hidden signal links transform local toggles into remote logic patterns.",
      evidence: defaultEvidence,
      confidence
    };
  }
  return {
    type: "submit_theory",
    hypothesizedRule: "Hidden ecological links balance pollution, purification, and growth across worlds.",
    evidence: defaultEvidence,
    confidence
  };
};
var entityStillWorthInteracting = (observation) => {
  const currentPosition = observation.playerPosition;
  const currentEntity = observation.visibleEntities.find(
    (entity) => entity.position.x === currentPosition.x && entity.position.y === currentPosition.y
  );
  if (!currentEntity) return false;
  const state = currentEntity.state;
  switch (currentEntity.kind) {
    case "switch":
      return state.active !== true;
    case "anchor":
      return state.aligned !== true;
    case "router":
      return true;
    case "lens":
      return true;
    case "stabilizer":
      return state.ready === true && state.tuned !== true;
    case "exit":
      return state.open === true;
    case "energy_orb":
      return state.charged === true;
    case "battery_slot":
      return observation.player.energy > 0;
    case "regulator":
      return observation.player.energy > 0 || state.tuned !== true;
    case "altar":
      return state.consecrated !== true;
    case "rune_stone":
      return state.awakened !== true;
    case "brazier":
      return state.lit !== true;
    case "seal_node":
      return state.manifest === true;
    case "signal_source":
      return true;
    case "pollution_source":
      return state.active !== true;
    case "purifier":
      return state.active !== true;
    case "seed_pod":
      return state.collected !== true;
    case "water_pool":
      return observation.player.inventory.includes("seed") && state.fertile !== true;
    default:
      return false;
  }
};
var chooseHeuristicAction = (observation, stepIndex, maxSteps) => {
  if (String(observation.levelFamilyId) === "phase_router") {
    const directedAction = phaseRouterHeuristic(observation, stepIndex, maxSteps);
    if (directedAction) {
      return directedAction;
    }
  }
  if (stepIndex >= Math.max(3, maxSteps - 2)) {
    return buildTheoryTemplate(observation);
  }
  const currentPosition = observation.playerPosition;
  if (entityStillWorthInteracting(observation)) {
    return { type: "interact" };
  }
  const targetEntity = observation.visibleEntities.find((entity) => {
    if (![
      "switch",
      "anchor",
      "router",
      "lens",
      "stabilizer",
      "exit",
      "energy_orb",
      "battery_slot",
      "regulator",
      "altar",
      "rune_stone",
      "brazier",
      "seal_node",
      "signal_source",
      "pollution_source",
      "purifier",
      "seed_pod",
      "water_pool"
    ].includes(entity.kind)) {
      return false;
    }
    const sameCell = entity.position.x === currentPosition.x && entity.position.y === currentPosition.y;
    if (!sameCell) return true;
    return entityStillWorthInteracting(observation);
  });
  if (targetEntity) {
    return movementToward(currentPosition, targetEntity.position);
  }
  if (observation.worldRole === "main" && observation.discoveredWorlds.length > 1) {
    return { type: "switch_world" };
  }
  if (observation.worldRole === "hidden" && stepIndex % 4 === 3) {
    return { type: "return_main" };
  }
  if (stepIndex % 5 === 4) {
    return { type: "switch_world" };
  }
  return { type: "wait" };
};
var buildBudgetedPrompt = (options, prompt, stepIndex, lastSubmissionFeedback) => {
  const stepsUsed = stepIndex;
  const stepsRemaining = Math.max(0, options.maxSteps - stepIndex);
  const finalSafeSubmissionStep = Math.max(1, options.maxSteps - 4);
  return [
    `Step budget: ${options.maxSteps}`,
    `Steps used so far: ${stepsUsed}`,
    `Steps remaining including this decision: ${stepsRemaining}`,
    `Submission deadline guidance: if you reach step ${finalSafeSubmissionStep} with a plausible explanation, stop exploring and use submit_theory.`,
    `Last submission feedback: ${lastSubmissionFeedback}`,
    "If the environment is report-driven, do not wait for the hidden rule to be explicitly stated. Infer it from repeated anomalies, hidden-world activation patterns, and stacked effects.",
    "",
    prompt
  ].join("\n");
};
var rectifyModelAction = (proposedAction, observation, stepIndex, options) => {
  const stepsRemaining = options.maxSteps - stepIndex;
  const completedHiddenTasks = countCompletedHiddenTasks(observation);
  const likelyEnoughEvidence = Number(observation.publicStats.hiddenWorldCompleteness ?? 0) >= 0.5 || completedHiddenTasks >= 2 || observation.discoveredWorlds.length >= 3;
  if (proposedAction.type === "interact" && !isPlayerStandingOnVisibleEntity(observation)) {
    return chooseGuidedRecoveryAction(observation) ?? proposedAction;
  }
  if (proposedAction.type === "interact" && hasRepeatedNoNearbySignal(observation)) {
    return chooseGuidedRecoveryAction(observation) ?? proposedAction;
  }
  if (stepsRemaining <= 4 && likelyEnoughEvidence) {
    if (observation.worldRole === "hidden") {
      return { type: "return_main" };
    }
    return buildTheoryTemplate(observation);
  }
  if (stepsRemaining <= 2 && observation.worldRole === "main") {
    return buildTheoryTemplate(observation);
  }
  return proposedAction;
};
var callOpenAICompatible = async (options, prompt) => {
  if (!options.model || !options.apiKey || !options.baseUrl) {
    throw new Error("OpenAI-compatible mode requires --model, --api-key, and --base-url (or env vars).");
  }
  const baseUrl = options.baseUrl.replace(/\/$/, "");
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${options.apiKey}`
    },
    body: JSON.stringify({
      model: options.model,
      temperature: 0,
      messages: [
        {
          role: "system",
          content: "You are controlling a benchmark agent. Reply with JSON only. Valid actions are move_up, move_down, move_left, move_right, interact, switch_world, return_main, submit_theory, request_oracle, wait."
        },
        {
          role: "user",
          content: prompt
        }
      ]
    })
  });
  if (!response.ok) {
    throw new Error(`Model request failed: ${response.status} ${await response.text()}`);
  }
  const payload = await response.json();
  return payload.choices?.[0]?.message?.content ?? '{"type":"wait"}';
};
var run = async () => {
  const options = parseArgs();
  const env = new LLMTextEnvAdapter();
  let turn = env.reset({
    seed: options.seed,
    gameClassId: options.gameClassId,
    levelFamilyId: options.levelFamilyId
  });
  const history = [];
  console.log("=== RESET ===");
  console.log(turn.textObservation);
  for (let stepIndex = 0; stepIndex < options.maxSteps && !turn.stepResult.done; stepIndex += 1) {
    const observation = turn.stepResult.observation;
    const llmPrompt = buildBudgetedPrompt(
      options,
      turn.textObservation,
      stepIndex,
      observation.lastSubmissionFeedback
    );
    const rawAction = options.mode === "openai-compatible" ? parseLLMAction(await callOpenAICompatible(options, llmPrompt)) : chooseHeuristicAction(observation, stepIndex, options.maxSteps);
    const action = options.mode === "openai-compatible" ? rectifyModelAction(rawAction, observation, stepIndex, options) : rawAction;
    turn = env.step(action);
    history.push({
      step: stepIndex + 1,
      action,
      reward: turn.stepResult.reward,
      done: turn.stepResult.done,
      worldId: String(turn.stepResult.observation.worldId),
      score: turn.stepResult.observation.scoreBreakdown.totalScore,
      lastSubmissionFeedback: turn.stepResult.observation.lastSubmissionFeedback
    });
    console.log(`=== STEP ${stepIndex + 1} ===`);
    console.log("ACTION", JSON.stringify(action));
    console.log(`WORLD ${turn.stepResult.observation.worldId} | SCORE ${turn.stepResult.observation.scoreBreakdown.totalScore.toFixed(2)}`);
    console.log(turn.stepResult.observation.recentEvents.map((event) => `- [${event.turn}] ${event.text}`).join("\n"));
  }
  const finalObservation = turn.stepResult.observation;
  const safeOptions = {
    ...options,
    apiKey: options.apiKey ? "[redacted]" : void 0
  };
  const result = {
    options: safeOptions,
    success: turn.stepResult.done,
    totalSteps: turn.stepResult.info.metrics.totalSteps,
    possessions: turn.stepResult.info.metrics.possessions,
    interactions: turn.stepResult.info.metrics.interactionCount,
    theorySubmissions: turn.stepResult.info.metrics.theorySubmissions,
    scoreBreakdown: finalObservation.scoreBreakdown,
    mainTask: finalObservation.mainTask,
    hiddenTasks: finalObservation.hiddenTasks,
    lastSubmissionFeedback: finalObservation.lastSubmissionFeedback,
    history
  };
  console.log("=== FINAL RESULT ===");
  console.log(JSON.stringify(result, null, 2));
  env.close();
};
run().catch((error) => {
  console.error(error);
  process.exit(1);
});
