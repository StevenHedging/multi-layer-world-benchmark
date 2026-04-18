import type { EntityId, EpisodeId, GameClassId, LevelFamilyId, NodeId, WorldId } from "../types/core";

export const asGameClassId = (value: string) => value as GameClassId;
export const asLevelFamilyId = (value: string) => value as LevelFamilyId;
export const asEpisodeId = (value: string) => value as EpisodeId;
export const asWorldId = (value: string) => value as WorldId;
export const asNodeId = (value: string) => value as NodeId;
export const asEntityId = (value: string) => value as EntityId;
