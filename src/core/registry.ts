import type { GameClassPlugin } from "../types/plugin";

export class GameRegistry {
  private readonly plugins = new Map<string, GameClassPlugin>();

  register(plugin: GameClassPlugin): void {
    this.plugins.set(plugin.id, plugin);
  }

  get(gameClassId: string): GameClassPlugin {
    const plugin = this.plugins.get(gameClassId);
    if (!plugin) {
      throw new Error(`Unknown game class: ${gameClassId}`);
    }
    return plugin;
  }

  list(): GameClassPlugin[] {
    return [...this.plugins.values()];
  }
}
