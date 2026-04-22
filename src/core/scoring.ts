import type { ScoreBreakdown } from "../types/core";

export const SCORE_WEIGHTS = {
  mainTaskScore: 0.4,
  hiddenTaskScore: 0.2,
  ruleDiscoveryScore: 0.2,
  evidenceScore: 0.15,
  efficiencyScore: 0.05,
} as const;

export const clampUnit = (value: number): number => {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
};

export const computeTotalScore = (score: Omit<ScoreBreakdown, "totalScore">): number => {
  const normalized = {
    mainTaskScore: clampUnit(score.mainTaskScore),
    hiddenTaskScore: clampUnit(score.hiddenTaskScore),
    ruleDiscoveryScore: clampUnit(score.ruleDiscoveryScore),
    evidenceScore: clampUnit(score.evidenceScore),
    efficiencyScore: clampUnit(score.efficiencyScore),
  };

  const total =
    normalized.mainTaskScore * SCORE_WEIGHTS.mainTaskScore +
    normalized.hiddenTaskScore * SCORE_WEIGHTS.hiddenTaskScore +
    normalized.ruleDiscoveryScore * SCORE_WEIGHTS.ruleDiscoveryScore +
    normalized.evidenceScore * SCORE_WEIGHTS.evidenceScore +
    normalized.efficiencyScore * SCORE_WEIGHTS.efficiencyScore;

  return clampUnit(total);
};

export const normalizeScoreBreakdown = (score: Partial<ScoreBreakdown>): ScoreBreakdown => {
  const normalized = {
    mainTaskScore: clampUnit(score.mainTaskScore ?? 0),
    hiddenTaskScore: clampUnit(score.hiddenTaskScore ?? 0),
    ruleDiscoveryScore: clampUnit(score.ruleDiscoveryScore ?? 0),
    evidenceScore: clampUnit(score.evidenceScore ?? 0),
    efficiencyScore: clampUnit(score.efficiencyScore ?? 0),
  };

  return {
    ...normalized,
    totalScore: computeTotalScore(normalized),
  };
};
