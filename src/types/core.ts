export type Brand<K, T> = K & { __brand: T };

export type GameClassId = Brand<string, "GameClassId">;
export type LevelFamilyId = Brand<string, "LevelFamilyId">;
export type EpisodeId = Brand<string, "EpisodeId">;
export type WorldId = Brand<string, "WorldId">;
export type NodeId = Brand<string, "NodeId">;
export type EntityId = Brand<string, "EntityId">;

export type ActionType =
  | "move_up"
  | "move_down"
  | "move_left"
  | "move_right"
  | "interact"
  | "switch_world"
  | "wait";

export type PublicScalar = boolean | number | string;

export interface Position {
  x: number;
  y: number;
}

export interface PlayerPublicState {
  inventory: string[];
  energy: number;
  hp: number;
  status: Record<string, PublicScalar>;
}

export interface EventFeedback {
  turn: number;
  text: string;
  tone?: "neutral" | "good" | "warn";
}

export interface VisibleEntity {
  entityId: EntityId;
  kind: string;
  position: Position;
  state: Record<string, boolean | number | string>;
}

export interface ActionMask {
  allowed: ActionType[];
}

export interface Observation {
  episodeId: EpisodeId;
  gameClassId: GameClassId;
  levelFamilyId: LevelFamilyId;
  worldId: WorldId;
  turn: number;
  grid: string[][];
  visibleEntities: VisibleEntity[];
  playerPosition: Position;
  player: PlayerPublicState;
  publicStats: Record<string, PublicScalar>;
  hudHints: string[];
  recentEvents: EventFeedback[];
  actionMask: ActionMask;
}

export interface PublicActionSchema {
  actions: Array<{
    type: ActionType;
    description: string;
  }>;
}

export interface TopologyEdge {
  from: NodeId;
  to: NodeId;
  channel: string;
  weight?: number;
}

export interface TopologyGraph {
  nodes: NodeId[];
  edges: TopologyEdge[];
}

export interface EntityState {
  id: EntityId;
  kind: string;
  worldId: WorldId;
  position: Position;
  blocksMovement?: boolean;
  tags: string[];
  publicState: Record<string, boolean | number | string>;
  hiddenState: Record<string, boolean | number | string>;
}

export interface WorldState {
  id: WorldId;
  label: string;
  width: number;
  height: number;
  tiles: string[][];
  entities: EntityState[];
  localFlags: Record<string, boolean | number | string>;
}

export interface PlayerState {
  worldId: WorldId;
  position: Position;
  inventory: string[];
  energy: number;
  hp: number;
}

export interface GlobalHiddenState {
  topology: TopologyGraph;
  hiddenFlags: Record<string, boolean | number | string>;
}

export interface PublicGameState {
  episodeId: EpisodeId;
  gameClassId: GameClassId;
  levelFamilyId: LevelFamilyId;
  turn: number;
  currentWorldId: WorldId;
  player: PlayerPublicState;
  publicStats: Record<string, PublicScalar>;
  hudHints: string[];
}

export interface BenchmarkMetrics {
  episodeId: EpisodeId;
  episodeSeed: number;
  gameClassId: GameClassId;
  levelFamilyId: LevelFamilyId;
  totalSteps: number;
  worldSwitches: number;
  interactionCount: number;
  firstKeyEventStep: number | null;
  success: boolean;
  successStep: number | null;
}

export interface EpisodeInstance {
  episodeId: EpisodeId;
  episodeSeed: number;
  gameClassId: GameClassId;
  levelFamilyId: LevelFamilyId;
  publicState: PublicGameState;
  hiddenState: GlobalHiddenState;
  worlds: Record<string, WorldState>;
  player: PlayerState;
  metrics: BenchmarkMetrics;
  eventLog: EventFeedback[];
}

export interface Action {
  type: ActionType;
}

export interface StepResult {
  observation: Observation;
  reward: number;
  done: boolean;
  truncated: boolean;
  info: PublicInfo;
}

export interface PublicInfo {
  metrics: BenchmarkMetrics;
  publicState: PublicGameState;
}
