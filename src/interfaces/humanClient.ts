import { EnvironmentKernel } from "../core/kernel";
import { GameRegistry } from "../core/registry";
import type { Action, StepResult } from "../types/core";

export class HumanClientAdapter {
  private kernel: EnvironmentKernel | null = null;

  constructor(private readonly registry: GameRegistry) {}

  start(gameClassId: string, levelFamilyId: string, seed: number): StepResult {
    const plugin = this.registry.get(gameClassId);
    const episode = plugin.instanceGenerator.generate(seed, levelFamilyId);
    this.kernel = new EnvironmentKernel(plugin, episode);
    return {
      observation: this.kernel.getObservation(),
      reward: 0,
      done: false,
      truncated: false,
      info: this.kernel.getInfo(),
    };
  }

  dispatch(action: Action): StepResult {
    if (!this.kernel) {
      throw new Error("Human adapter not started.");
    }
    return this.kernel.step(action);
  }

  current() {
    if (!this.kernel) {
      return null;
    }
    return {
      observation: this.kernel.getObservation(),
      info: this.kernel.getInfo(),
    };
  }
}
