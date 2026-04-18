import type {
  Action,
  EpisodeInstance,
  EventFeedback,
  Observation,
  Position,
  PublicScalar,
  PublicActionSchema,
  VisibleEntity,
  WorldState,
} from "./core";

export interface InteractionContext {
  episode: EpisodeInstance;
  world: WorldState;
  action: Action;
  events: EventFeedback[];
  markKeyEvent: () => void;
  emit: (event: EventFeedback) => void;
  queuePropagation: (event: PropagationEvent) => void;
}

export interface PropagationEvent {
  channel: string;
  payload: Record<string, boolean | number | string>;
  sourceWorldId: string;
}

export interface PropagationRule {
  id: string;
  propagate: (episode: EpisodeInstance, event: PropagationEvent, events: EventFeedback[]) => void;
}

export interface InteractionRule {
  id: string;
  apply: (context: InteractionContext) => void;
}

export interface WinConditionEvaluator {
  evaluate: (episode: EpisodeInstance) => { done: boolean; reward: number; event?: EventFeedback };
}

export interface ObservationAdapter {
  toObservation: (episode: EpisodeInstance) => Observation;
}

export interface RendererSkin {
  palette: {
    background: string;
    panel: string;
    accent: string;
    gridLine: string;
    tileFloor: string;
    tileWall: string;
    player: string;
    glow: string;
  };
  entityAppearance: Record<
    string,
    {
      fill: string;
      stroke: string;
      shape: "square" | "circle" | "diamond" | "hex";
      label?: string;
    }
  >;
  tileAppearance: Record<
    string,
    {
      fill: string;
      stroke?: string;
    }
  >;
}

export interface LevelFamilyDefinition {
  id: string;
  title: string;
  description: string;
}

export interface InstanceGenerator {
  generate: (seed: number, familyId: string) => EpisodeInstance;
}

export interface GameClassPlugin {
  id: string;
  title: string;
  description: string;
  publicActionSchema: PublicActionSchema;
  vocabulary: {
    entityKinds: string[];
    tileKinds: string[];
  };
  levelFamilies: LevelFamilyDefinition[];
  instanceGenerator: InstanceGenerator;
  interactionRules: InteractionRule[];
  propagationRules: PropagationRule[];
  winCondition: WinConditionEvaluator;
  observationAdapter: ObservationAdapter;
  rendererSkin: RendererSkin;
  getVisibleEntities: (world: WorldState) => VisibleEntity[];
  getPlayerSpawn: (episode: EpisodeInstance) => Position;
  getPublicPlayerStatus?: (episode: EpisodeInstance) => Record<string, PublicScalar>;
}
