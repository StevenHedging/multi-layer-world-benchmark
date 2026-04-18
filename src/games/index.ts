import { GameRegistry } from "../core/registry";
import { ecologyNetworkPlugin } from "./ecologyNetwork/plugin";
import { energyNetworkPlugin } from "./energyNetwork/plugin";
import { propagationEscapePlugin } from "./propagationEscape/plugin";
import { ritualNetworkPlugin } from "./ritualNetwork/plugin";
import { signalLogicPlugin } from "./signalLogic/plugin";

export const createDefaultRegistry = (): GameRegistry => {
  const registry = new GameRegistry();
  registry.register(propagationEscapePlugin);
  registry.register(energyNetworkPlugin);
  registry.register(ritualNetworkPlugin);
  registry.register(signalLogicPlugin);
  registry.register(ecologyNetworkPlugin);
  return registry;
};
