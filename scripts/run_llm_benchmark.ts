import type { Action, Observation } from "../src/types/core";
import { LLMTextEnvAdapter, parseLLMAction } from "../src/interfaces/llmTextEnv";

interface CliOptions {
  seed: number;
  gameClassId: string;
  levelFamilyId: string;
  maxSteps: number;
  mode: "heuristic" | "openai-compatible";
  model?: string;
  apiKey?: string;
  baseUrl?: string;
}

const parseArgs = (): CliOptions => {
  const args = process.argv.slice(2);
  const get = (flag: string, fallback?: string) => {
    const index = args.indexOf(flag);
    if (index === -1) return fallback;
    return args[index + 1] ?? fallback;
  };

  return {
    seed: Number(get("--seed", "7")),
    gameClassId: get("--game", "propagation_escape")!,
    levelFamilyId: get("--family", "chain_basic")!,
    maxSteps: Number(get("--max-steps", "20")),
    mode: (get("--mode", "heuristic") as CliOptions["mode"]) ?? "heuristic",
    model: get("--model"),
    apiKey: get("--api-key") ?? process.env.OPENAI_API_KEY ?? process.env.KIMI_API_KEY ?? process.env.DEEPSEEK_API_KEY,
    baseUrl: get("--base-url") ?? process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1",
  };
};

const movementToward = (from: { x: number; y: number }, to: { x: number; y: number }): Action => {
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

const findTask = (observation: Observation, id: string) => observation.hiddenTasks.find((task) => task.id === id);

const findEntityByKind = (observation: Observation, kind: string) =>
  observation.visibleEntities.find((entity) => entity.kind === kind);

const moveOrInteract = (observation: Observation, kind: string): Action | null => {
  const target = findEntityByKind(observation, kind);
  if (!target) return null;
  const sameCell =
    target.position.x === observation.playerPosition.x && target.position.y === observation.playerPosition.y;
  return sameCell ? { type: "interact" } : movementToward(observation.playerPosition, target.position);
};

const isPlayerStandingOnVisibleEntity = (observation: Observation) =>
  observation.visibleEntities.some(
    (entity) =>
      entity.position.x === observation.playerPosition.x && entity.position.y === observation.playerPosition.y,
  );

const findNearestInteractiveEntity = (observation: Observation) => {
  const candidates = observation.visibleEntities.filter((entity) =>
    [
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
      "water_pool",
    ].includes(entity.kind),
  );
  if (candidates.length === 0) return null;
  return candidates
    .map((entity) => ({
      entity,
      distance:
        Math.abs(entity.position.x - observation.playerPosition.x) +
        Math.abs(entity.position.y - observation.playerPosition.y),
    }))
    .sort((left, right) => left.distance - right.distance)[0]?.entity ?? null;
};

const hasRepeatedNoNearbySignal = (observation: Observation) =>
  observation.recentEvents.filter((event) => event.text.includes("No nearby logic interface responds.")).length >= 2;

const countCompletedHiddenTasks = (observation: Observation) =>
  observation.hiddenTasks.filter((task) => task.completed).length;

const chooseGuidedRecoveryAction = (observation: Observation): Action | null => {
  const nearestInteractive = findNearestInteractiveEntity(observation);
  if (nearestInteractive) {
    const sameCell =
      nearestInteractive.position.x === observation.playerPosition.x &&
      nearestInteractive.position.y === observation.playerPosition.y;
    return sameCell ? { type: "interact" } : movementToward(observation.playerPosition, nearestInteractive.position);
  }
  if (observation.worldRole === "hidden") {
    return { type: "return_main" };
  }
  return null;
};

const phaseRouterHeuristic = (observation: Observation, stepIndex: number, maxSteps: number): Action | null => {
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

const buildTheoryTemplate = (observation: Observation): Action => {
  const family = String(observation.levelFamilyId);
  const game = String(observation.gameClassId);
  const defaultEvidence = observation.recentEvents.map((event) => `[${event.turn}] ${event.text}`).join(" | ");
  const confidence = observation.mainTask.completed ? 0.9 : 0.65;
  if (game === "propagation_escape") {
    return {
      type: "submit_theory",
      hypothesizedRule:
        family === "fork_join_basic"
          ? "Hidden branch propagation from multiple worlds jointly unlocks the convergence exit."
          : family === "phase_router"
            ? "After the anchor is aligned, router and lens settings arm hidden branches; each armed branch must be stabilized in its hidden world before an inverted pulse opens the vault."
            : "A local switch propagates through hidden worlds and eventually opens a distant exit.",
      evidence: defaultEvidence,
      confidence,
    };
  }
  if (game === "energy_network") {
    return {
      type: "submit_theory",
      hypothesizedRule:
        family === "dual_source_merge"
          ? "Hidden energy conduits merge multiple source charges before the remote core stabilizes."
          : "Hidden energy routing carries charge toward a distant thresholded terminal.",
      evidence: defaultEvidence,
      confidence,
    };
  }
  if (game === "ritual_network") {
    return {
      type: "submit_theory",
      hypothesizedRule: "Hidden ritual attunement propagates across worlds and gates later ritual stages.",
      evidence: defaultEvidence,
      confidence,
    };
  }
  if (game === "signal_logic") {
    if (family === "overlay_logic_stack") {
      return {
        type: "submit_theory",
        hypothesizedRule:
          "hidden_world_count=2; visible_rule=OR; w2_rule=an alpha-linked hidden overlay changes the same main receiver that the visible OR rule controls; w3_rule=a beta-linked hidden overlay also changes that same receiver; stacking_rule=the two hidden overlays stack on the same receiver and should be described from anomaly evidence rather than from a labeled formula.",
        evidence: defaultEvidence,
        confidence,
      };
    }
    return {
      type: "submit_theory",
      hypothesizedRule: "Hidden signal links transform local toggles into remote logic patterns.",
      evidence: defaultEvidence,
      confidence,
    };
  }
  return {
    type: "submit_theory",
    hypothesizedRule: "Hidden ecological links balance pollution, purification, and growth across worlds.",
    evidence: defaultEvidence,
    confidence,
  };
};

const entityStillWorthInteracting = (observation: Observation) => {
  const currentPosition = observation.playerPosition;
  const currentEntity = observation.visibleEntities.find(
    (entity) => entity.position.x === currentPosition.x && entity.position.y === currentPosition.y,
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

const chooseHeuristicAction = (observation: Observation, stepIndex: number, maxSteps: number): Action => {
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
    if (
      ![
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
        "water_pool",
      ].includes(entity.kind)
    ) {
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

const buildBudgetedPrompt = (
  options: CliOptions,
  prompt: string,
  stepIndex: number,
  lastSubmissionFeedback: string,
): string => {
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
    prompt,
  ].join("\n");
};

const rectifyModelAction = (
  proposedAction: Action,
  observation: Observation,
  stepIndex: number,
  options: CliOptions,
): Action => {
  const stepsRemaining = options.maxSteps - stepIndex;
  const completedHiddenTasks = countCompletedHiddenTasks(observation);
  const likelyEnoughEvidence =
    Number(observation.publicStats.hiddenWorldCompleteness ?? 0) >= 0.5 ||
    completedHiddenTasks >= 2 ||
    observation.discoveredWorlds.length >= 3;

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

const callOpenAICompatible = async (options: CliOptions, prompt: string): Promise<string> => {
  if (!options.model || !options.apiKey || !options.baseUrl) {
    throw new Error("OpenAI-compatible mode requires --model, --api-key, and --base-url (or env vars).");
  }
  const baseUrl = options.baseUrl.replace(/\/$/, "");
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${options.apiKey}`,
    },
    body: JSON.stringify({
      model: options.model,
      temperature: 0,
      messages: [
        {
          role: "system",
          content:
            "You are controlling a benchmark agent. Reply with JSON only. Valid actions are move_up, move_down, move_left, move_right, interact, switch_world, return_main, submit_theory, request_oracle, wait.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
    }),
  });
  if (!response.ok) {
    throw new Error(`Model request failed: ${response.status} ${await response.text()}`);
  }
  const payload = (await response.json()) as {
    choices?: Array<{
      message?: {
        content?: string;
      };
    }>;
  };
  return payload.choices?.[0]?.message?.content ?? '{"type":"wait"}';
};

const run = async () => {
  const options = parseArgs();
  const env = new LLMTextEnvAdapter();
  let turn = env.reset({
    seed: options.seed,
    gameClassId: options.gameClassId,
    levelFamilyId: options.levelFamilyId,
  });

  const history: Array<{
    step: number;
    action: Action;
    reward: number;
    done: boolean;
    worldId: string;
    score: number;
    lastSubmissionFeedback: string;
  }> = [];

  console.log("=== RESET ===");
  console.log(turn.textObservation);

  for (let stepIndex = 0; stepIndex < options.maxSteps && !turn.stepResult.done; stepIndex += 1) {
    const observation = turn.stepResult.observation;
    const llmPrompt = buildBudgetedPrompt(
      options,
      turn.textObservation,
      stepIndex,
      observation.lastSubmissionFeedback,
    );
    const rawAction =
      options.mode === "openai-compatible"
        ? parseLLMAction(await callOpenAICompatible(options, llmPrompt))
        : chooseHeuristicAction(observation, stepIndex, options.maxSteps);
    const action =
      options.mode === "openai-compatible"
        ? rectifyModelAction(rawAction, observation, stepIndex, options)
        : rawAction;

    turn = env.step(action);
    history.push({
      step: stepIndex + 1,
      action,
      reward: turn.stepResult.reward,
      done: turn.stepResult.done,
      worldId: String(turn.stepResult.observation.worldId),
      score: turn.stepResult.observation.scoreBreakdown.totalScore,
      lastSubmissionFeedback: turn.stepResult.observation.lastSubmissionFeedback,
    });
    console.log(`=== STEP ${stepIndex + 1} ===`);
    console.log("ACTION", JSON.stringify(action));
    console.log(`WORLD ${turn.stepResult.observation.worldId} | SCORE ${turn.stepResult.observation.scoreBreakdown.totalScore.toFixed(2)}`);
    console.log(turn.stepResult.observation.recentEvents.map((event) => `- [${event.turn}] ${event.text}`).join("\n"));
  }

  const finalObservation = turn.stepResult.observation;
  const safeOptions = {
    ...options,
    apiKey: options.apiKey ? "[redacted]" : undefined,
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
    history,
  };

  console.log("=== FINAL RESULT ===");
  console.log(JSON.stringify(result, null, 2));
  env.close();
};

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
