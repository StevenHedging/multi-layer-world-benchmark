import type { Action, EpisodeInstance, EventFeedback, PublicInfo, StepResult } from "../types/core";
import type { GameClassPlugin } from "../types/plugin";
import { normalizeScoreBreakdown } from "./scoring";
import { getTile, isWalkableTile, isWithinBounds, positionsEqual } from "../utils/grid";
import { asWorldId } from "../utils/ids";

const appendEvent = (episode: EpisodeInstance, event: EventFeedback): void => {
  episode.eventLog.push(event);
  episode.eventLog = episode.eventLog.slice(-6);
};

const syncPublicState = (episode: EpisodeInstance): void => {
  episode.publicState.turn = episode.metrics.totalSteps;
  episode.publicState.currentWorldId = episode.player.worldId;
  episode.publicState.player = {
    inventory: [...episode.player.inventory],
    energy: episode.player.energy,
    hp: episode.player.hp,
    status: { ...episode.publicState.player.status },
  };
};

export class EnvironmentKernel {
  constructor(private readonly plugin: GameClassPlugin, private episode: EpisodeInstance) {
    const spawn = this.plugin.getPlayerSpawn(this.episode);
    this.episode.player.position = { ...spawn };
    this.episode.player.worldId = this.episode.publicState.currentWorldId;
    this.syncDerivedPublicState();
  }

  getEpisode(): EpisodeInstance {
    return this.episode;
  }

  getActionSchema() {
    const seen = new Set(this.plugin.publicActionSchema.actions.map((action) => action.type));
    const extraActions: Array<{ type: Action["type"]; description: string }> = [];
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
      actions: [...this.plugin.publicActionSchema.actions, ...extraActions],
    };
  }

  getObservation() {
    return this.plugin.observationAdapter.toObservation(this.episode);
  }

  reset(nextEpisode: EpisodeInstance): StepResult {
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
      info: this.getInfo(),
    };
  }

  step(action: Action): StepResult {
    const episode = this.episode;
    const world = episode.worlds[episode.player.worldId];
    const events: EventFeedback[] = [];
    const propagationQueue: Parameters<NonNullable<GameClassPlugin["propagationRules"]>[number]["propagate"]>[1][] = [];
    let reward = 0;
    let done = false;

    const emit = (event: EventFeedback) => {
      events.push(event);
      appendEvent(episode, event);
    };

    const markKeyEvent = () => {
      if (episode.metrics.firstKeyEventStep === null) {
        episode.metrics.firstKeyEventStep = episode.metrics.totalSteps + 1;
      }
    };

    const queuePropagation = (event: Parameters<NonNullable<GameClassPlugin["propagationRules"]>[number]["propagate"]>[1]) => {
      propagationQueue.push(event);
    };

    if (action.type === "switch_world") {
      this.handleWorldShift(episode, emit);
    } else if (action.type === "return_main") {
      const mainWorldId = episode.publicState.mainWorldId;
      if (episode.player.worldId === mainWorldId) {
        emit({
          turn: episode.metrics.totalSteps + 1,
          text: "You are already acting from the main world.",
        });
      } else {
        episode.player.worldId = mainWorldId;
        episode.publicState.currentWorldId = mainWorldId;
        const nextSpawn = this.plugin.getPlayerSpawn(episode);
        episode.player.position = { ...nextSpawn };
        emit({
          turn: episode.metrics.totalSteps + 1,
          text: `Returned control to ${episode.worlds[mainWorldId].label}.`,
        });
      }
    } else if (action.type.startsWith("move_")) {
      const delta =
        action.type === "move_up"
          ? { x: 0, y: -1 }
          : action.type === "move_down"
            ? { x: 0, y: 1 }
            : action.type === "move_left"
              ? { x: -1, y: 0 }
              : { x: 1, y: 0 };
      const next = {
        x: episode.player.position.x + delta.x,
        y: episode.player.position.y + delta.y,
      };
      const currentWorld = episode.worlds[episode.player.worldId];
      const blockingEntity = currentWorld.entities.find(
        (entity) => entity.blocksMovement && positionsEqual(entity.position, next),
      );
      if (isWithinBounds(currentWorld, next) && isWalkableTile(getTile(currentWorld, next)) && !blockingEntity) {
        episode.player.position = next;
      } else {
        emit({
          turn: episode.metrics.totalSteps + 1,
          text: "The path resists that move.",
          tone: "warn",
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
          queuePropagation,
        });
      }
    } else if (action.type === "submit_theory") {
      this.handleTheorySubmission(action, episode, emit);
    } else if (action.type === "request_oracle") {
      this.handleOracleRequest(episode, emit);
    }

    while (propagationQueue.length > 0) {
      const event = propagationQueue.shift()!;
      for (const propagationRule of this.plugin.propagationRules) {
        const previousEventCount = events.length;
        propagationRule.propagate(episode, event, events);
        for (const propagatedEvent of events.slice(previousEventCount)) {
          appendEvent(episode, propagatedEvent);
        }
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
      info: this.getInfo(),
    };
  }

  getInfo(): PublicInfo {
    return {
      metrics: this.episode.metrics,
      publicState: this.episode.publicState,
    };
  }

  private syncDerivedPublicState(): void {
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

  private handleWorldShift(episode: EpisodeInstance, emit: (event: EventFeedback) => void): void {
    const mainWorldId = episode.publicState.mainWorldId;
    const hiddenTargets = (
      this.plugin.getPossessionTargets?.(episode) ??
      episode.publicState.discoveredWorldIds.filter((worldId) => worldId !== mainWorldId)
    ).map((worldId) => asWorldId(String(worldId)));

    if (hiddenTargets.length === 0) {
      emit({
        turn: episode.metrics.totalSteps + 1,
        text: "No discovered hidden world is available for possession yet.",
        tone: "warn",
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
      text:
        nextWorldId === mainWorldId
          ? `Returned to ${episode.worlds[nextWorldId].label}.`
          : `Possessed ${episode.worlds[nextWorldId].label}.`,
    });
  }

  private handleTheorySubmission(
    action: Action,
    episode: EpisodeInstance,
    emit: (event: EventFeedback) => void,
  ): void {
    const hypothesizedRule = String(action.hypothesizedRule ?? "").trim();
    const evidence = String(action.evidence ?? "").trim();
    const confidence = Number(action.confidence ?? 0);
    episode.metrics.theorySubmissions += 1;

    const fallback = {
      ruleDiscoveryScore: hypothesizedRule ? 0.25 : 0,
      evidenceScore: evidence ? 0.25 : 0,
      feedback: hypothesizedRule
        ? "Theory recorded. This benchmark variant does not yet score rule submissions precisely."
        : "Theory submission was empty.",
    };
    const evaluation = this.plugin.evaluateTheorySubmission?.(episode, {
      hypothesizedRule,
      evidence,
      confidence,
    }) ?? fallback;

    episode.publicState.scoreBreakdown = normalizeScoreBreakdown({
      ...episode.publicState.scoreBreakdown,
      ruleDiscoveryScore: evaluation.ruleDiscoveryScore,
      evidenceScore: evaluation.evidenceScore,
    });
    episode.publicState.lastSubmissionFeedback = evaluation.feedback;
    emit({
      turn: episode.metrics.totalSteps + 1,
      text: evaluation.feedback,
      tone: evaluation.ruleDiscoveryScore > 0 ? "good" : "warn",
    });
  }

  private handleOracleRequest(episode: EpisodeInstance, emit: (event: EventFeedback) => void): void {
    episode.metrics.oracleRequests += 1;
    episode.hiddenState.hiddenFlags.oracleUses = Number(episode.hiddenState.hiddenFlags.oracleUses ?? 0) + 1;

    const response =
      this.plugin.requestOracleHint?.(episode) ?? {
        text: "Oracle hint: focus on the most recent meaningful state change and test one variable at a time.",
      };

    emit({
      turn: episode.metrics.totalSteps + 1,
      text: `${response.text} This oracle request will reduce your final score.`,
      tone: "warn",
    });
  }
}
