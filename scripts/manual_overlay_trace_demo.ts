import { createDefaultRegistry } from "../src/games";
import { AgentEnvAdapter } from "../src/interfaces/agentEnv";
import type { Action } from "../src/types/core";

const runCase = (title: string, actions: Array<[string, Action]>) => {
  const env = new AgentEnvAdapter(createDefaultRegistry());
  const reset = env.reset({
    seed: 7,
    gameClassId: "signal_logic",
    levelFamilyId: "overlay_logic_stack",
  });

  console.log(`\n######## ${title} ########`);
  console.log(`start world=${String(reset.observation.worldId)} pos=(${reset.observation.playerPosition.x},${reset.observation.playerPosition.y})`);
  console.log(
    `expected=${String(reset.observation.publicStats.expectedVisibleOutput)} observed=${String(reset.observation.publicStats.observedMainOutput)} anomaly=${String(reset.observation.publicStats.anomalyDetected)} traceable=${String(reset.observation.publicStats.traceableAnomaly ?? "n/a")}`,
  );
  console.log(
    `entities=${reset.observation.visibleEntities.map((entity) => `${entity.kind}@(${entity.position.x},${entity.position.y})`).join(" | ")}`,
  );
  console.log(`discovered=${reset.observation.discoveredWorlds.join(",")}`);

  for (const [label, action] of actions) {
    const result = env.step(action);
    const observation = result.observation;
    console.log(`\n=== ${label} ===`);
    console.log(`action=${JSON.stringify(action)}`);
    console.log(`world=${String(observation.worldId)} pos=(${observation.playerPosition.x},${observation.playerPosition.y})`);
    console.log(
      `expected=${String(observation.publicStats.expectedVisibleOutput ?? "n/a")} observed=${String(observation.publicStats.observedMainOutput ?? "n/a")} anomaly=${String(observation.publicStats.anomalyDetected ?? "n/a")} traceable=${String(observation.publicStats.traceableAnomaly ?? "n/a")}`,
    );
    console.log(`discovered=${observation.discoveredWorlds.join(",")}`);
    console.log(`events=${observation.recentEvents.map((event) => event.text).join(" | ") || "none"}`);
  }

  env.close();
};

runCase("Beta -> w3 trace demo", [
  ["move right 1", { type: "move_right" }],
  ["move right 2", { type: "move_right" }],
  ["move down to beta source", { type: "move_down" }],
  ["toggle beta on", { type: "interact" }],
  ["move right to alpha source tile", { type: "move_right" }],
  ["move right to receiver", { type: "move_right" }],
  ["trace main receiver", { type: "interact" }],
  ["switch into discovered world", { type: "switch_world" }],
]);

runCase("Alpha -> w2 trace demo", [
  ["move right 1", { type: "move_right" }],
  ["move right 2", { type: "move_right" }],
  ["move right 3", { type: "move_right" }],
  ["move down to alpha source", { type: "move_down" }],
  ["toggle alpha on", { type: "interact" }],
  ["move right to receiver", { type: "move_right" }],
  ["trace main receiver", { type: "interact" }],
  ["switch into discovered world", { type: "switch_world" }],
]);
