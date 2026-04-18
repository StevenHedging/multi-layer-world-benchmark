import type { Action, EpisodeInstance, EventFeedback, PublicInfo, StepResult } from "../types/core";
import type { GameClassPlugin } from "../types/plugin";
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
    syncPublicState(this.episode);
    this.episode.publicState.player.status = this.plugin.getPublicPlayerStatus?.(this.episode) ?? {};
  }

  getEpisode(): EpisodeInstance {
    return this.episode;
  }

  getActionSchema() {
    return this.plugin.publicActionSchema;
  }

  getObservation() {
    return this.plugin.observationAdapter.toObservation(this.episode);
  }

  reset(nextEpisode: EpisodeInstance): StepResult {
    this.episode = nextEpisode;
    const spawn = this.plugin.getPlayerSpawn(this.episode);
    this.episode.player.position = { ...spawn };
    this.episode.player.worldId = this.episode.publicState.currentWorldId;
    syncPublicState(this.episode);
    this.episode.publicState.player.status = this.plugin.getPublicPlayerStatus?.(this.episode) ?? {};
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
      const worldIds = Object.keys(episode.worlds);
      const index = worldIds.indexOf(episode.player.worldId);
      const nextWorldId = asWorldId(worldIds[(index + 1) % worldIds.length]);
      episode.player.worldId = nextWorldId;
      episode.publicState.currentWorldId = nextWorldId;
      episode.metrics.worldSwitches += 1;
      const nextSpawn = this.plugin.getPlayerSpawn(episode);
      episode.player.position = { ...nextSpawn };
      emit({
        turn: episode.metrics.totalSteps + 1,
        text: `Shifted focus to ${episode.worlds[nextWorldId].label}.`,
      });
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
    }

    while (propagationQueue.length > 0) {
      const event = propagationQueue.shift()!;
      for (const propagationRule of this.plugin.propagationRules) {
        propagationRule.propagate(episode, event, events);
      }
    }

    episode.metrics.totalSteps += 1;
    syncPublicState(episode);
    episode.publicState.player.status = this.plugin.getPublicPlayerStatus?.(episode) ?? {};

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
}
