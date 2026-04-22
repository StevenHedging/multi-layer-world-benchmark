import { createDefaultRegistry } from "../games";
import type { Action, Observation, PublicActionSchema, StepResult, VisibleEntity } from "../types/core";
import { AgentEnvAdapter, type ResetOptions } from "./agentEnv";

export interface LLMTextTurn {
  actionSchema: PublicActionSchema;
  parsedAction?: Action;
  stepResult: StepResult;
  textObservation: string;
}

const describeEntity = (entity: VisibleEntity) => {
  const stateEntries = Object.entries(entity.state)
    .map(([key, value]) => `${key}=${String(value)}`)
    .join(", ");
  return `- ${entity.kind} at (${entity.position.x},${entity.position.y})${stateEntries ? ` [${stateEntries}]` : ""}`;
};

const summarizeTasks = (observation: Observation) => {
  const hiddenTasks =
    observation.hiddenTasks.length === 0
      ? "- none surfaced yet"
      : observation.hiddenTasks
          .map(
            (task) =>
              `- ${task.title}: ${task.discovered ? "discovered" : "hidden"}, ${task.completed ? "completed" : "pending"}${task.worldId ? `, world=${task.worldId}` : ""}`,
          )
          .join("\n");
  return [
    `Main task: ${observation.mainTask.title}`,
    observation.mainTask.description,
    `Main task status: ${observation.mainTask.completed ? "completed" : "in progress"}`,
    "Hidden tasks:",
    hiddenTasks,
  ].join("\n");
};

const summarizeScore = (observation: Observation) => {
  const score = observation.scoreBreakdown;
  return [
    `Score summary: total=${score.totalScore.toFixed(2)}`,
    `- main=${score.mainTaskScore.toFixed(2)}`,
    `- hidden=${score.hiddenTaskScore.toFixed(2)}`,
    `- rule=${score.ruleDiscoveryScore.toFixed(2)}`,
    `- evidence=${score.evidenceScore.toFixed(2)}`,
    `- efficiency=${score.efficiencyScore.toFixed(2)}`,
  ].join("\n");
};

export const formatObservationForLLM = (observation: Observation, schema: PublicActionSchema): string => {
  const actionLines = schema.actions.map((action) => `- ${action.type}: ${action.description}`).join("\n");
  const visibleEntities =
    observation.visibleEntities.length === 0
      ? "- none"
      : observation.visibleEntities.map((entity) => describeEntity(entity)).join("\n");
  const recentEvents =
    observation.recentEvents.length === 0
      ? "- none"
      : observation.recentEvents.map((event) => `- [turn ${event.turn}] ${event.text}`).join("\n");
  const explicitRules = observation.explicitRules.map((rule) => `- ${rule}`).join("\n");
  const stats = Object.entries(observation.publicStats)
    .map(([key, value]) => `- ${key}: ${String(value)}`)
    .join("\n");

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
    observation.implicitRuleSignals.length === 0
      ? "- none yet; some rule structure is still latent or ungated"
      : observation.implicitRuleSignals.map((signal) => `- ${signal}`).join("\n"),
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
    'Theory example: {"type":"submit_theory","hypothesizedRule":"hidden_world_count=2; visible_rule=OR; w2_rule=an alpha-linked hidden overlay modifies the same main receiver when alpha is active; w3_rule=a beta-linked hidden overlay also modifies that receiver; stacking_rule=the two overlays stack on the same receiver and their joint effect must be inferred from main-world anomalies.","evidence":"Alpha-only caused expected OR output to disagree with observed output and revealed one hidden chamber; beta-only caused a second anomaly and revealed another chamber; both hidden chambers showed activation tied to their respective source patterns; enabling both overlays together changed the anomaly pattern again on the same receiver.","confidence":0.9}',
  ].join("\n");
};

const heuristicActionFromText = (text: string): Action | null => {
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

export const parseLLMAction = (raw: string): Action => {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { type: "wait" };
  }

  try {
    const parsed = JSON.parse(trimmed) as Action;
    if (parsed && typeof parsed.type === "string") {
      return parsed;
    }
  } catch {
    // Fall back to heuristic parsing below.
  }

  const heuristic = heuristicActionFromText(trimmed);
  if (heuristic) {
    return heuristic;
  }
  return { type: "wait" };
};

export class LLMTextEnvAdapter {
  private readonly registry = createDefaultRegistry();
  private readonly env = new AgentEnvAdapter(this.registry);

  reset(options: ResetOptions): LLMTextTurn {
    const stepResult = this.env.reset(options);
    const actionSchema = this.env.getActionSchema();
    return {
      actionSchema,
      stepResult,
      textObservation: formatObservationForLLM(stepResult.observation, actionSchema),
    };
  }

  step(action: Action): LLMTextTurn {
    const stepResult = this.env.step(action);
    const actionSchema = this.env.getActionSchema();
    return {
      actionSchema,
      parsedAction: action,
      stepResult,
      textObservation: formatObservationForLLM(stepResult.observation, actionSchema),
    };
  }

  stepFromText(raw: string): LLMTextTurn {
    const parsedAction = parseLLMAction(raw);
    const turn = this.step(parsedAction);
    return {
      ...turn,
      parsedAction,
    };
  }

  close(): void {
    this.env.close();
  }
}
