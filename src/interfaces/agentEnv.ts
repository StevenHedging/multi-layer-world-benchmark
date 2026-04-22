import { EnvironmentKernel } from "../core/kernel";
import { GameRegistry } from "../core/registry";
import type { Action, PublicActionSchema, StepResult } from "../types/core";

export interface ResetOptions {
  seed?: number;
  gameClassId: string;
  levelFamilyId: string;
}

export class AgentEnvAdapter {
  private kernel: EnvironmentKernel | null = null;

  constructor(private readonly registry: GameRegistry) {}

  reset(options: ResetOptions): StepResult {
    const plugin = this.registry.get(options.gameClassId);
    const episode = plugin.instanceGenerator.generate(options.seed ?? 1, options.levelFamilyId);
    this.kernel = new EnvironmentKernel(plugin, episode);
    return {
      observation: this.kernel.getObservation(),
      reward: 0,
      done: false,
      truncated: false,
      info: this.kernel.getInfo(),
    };
  }

  step(action: Action): StepResult {
    if (!this.kernel) {
      throw new Error("Environment has not been reset.");
    }
    return this.kernel.step(action);
  }

  getActionSchema(): PublicActionSchema {
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
          { type: "wait", description: "Do nothing for a turn" },
        ],
      };
    }
    return this.kernel.getActionSchema();
  }

  close(): void {
    this.kernel = null;
  }
}
