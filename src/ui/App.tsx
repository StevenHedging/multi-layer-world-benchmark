import { useEffect, useRef, useState } from "react";
import { createDefaultRegistry } from "../games";
import { HumanClientAdapter } from "../interfaces/humanClient";
import { renderObservation } from "../render/canvasRenderer";
import type { Action, StepResult } from "../types/core";

const registry = createDefaultRegistry();
const humanAdapter = new HumanClientAdapter(registry);

const CANVAS_WIDTH = 960;
const CANVAS_HEIGHT = 640;

type ScreenState =
  | {
      kind: "menu";
      gameClassId: string;
      levelFamilyId: string;
      seed: number;
    }
  | {
      kind: "game";
      gameClassId: string;
      levelFamilyId: string;
      seed: number;
      result: StepResult;
    };

const initialGame = registry.list()[0];

interface LocalizedText {
  en: string;
  zh: string;
}

const overviewForSelection = (gameClassId: string, levelFamilyId: string): LocalizedText[] => {
  if (gameClassId === "propagation_escape" && levelFamilyId === "phase_router") {
    return [
      {
        en: "Your top priority is the main task: open the resonance vault. Rule discovery matters because it helps you complete that objective.",
        zh: "你的最高优先级是主任务：打开共振金库。规则发现之所以重要，是因为它帮助你完成这个目标。",
      },
      {
        en: "The visible workshop is where the main plan begins: align the gate, test configurations, and push the vault-opening sequence forward.",
        zh: "可见工坊是主线推进的起点：对齐门槛、测试配置，并不断推进打开金库的流程。",
      },
      {
        en: "Hidden worlds are not side content. If one appears after a workshop action, it probably contains a required follow-up step for the main task.",
        zh: "隐藏世界不是支线内容。如果它在一次工坊操作后出现，那它很可能包含主任务所必需的后续步骤。",
      },
      {
        en: "Think in short task-oriented experiments: change one factor, observe the result, do the newly required follow-up, then come back to the workshop.",
        zh: "请用面向任务的短实验来思考：每次改变一个因素，观察结果，完成新出现的必要后续步骤，然后回到工坊继续推进。",
      },
      {
        en: "Finishing the main objective still requires a rule report, but treat the report as the explanation of the route you used to solve the task.",
        zh: "完成主目标仍然需要提交规则报告，但你应把这份报告视为对自己通关路径的解释，而不是独立于主任务的另一件事。",
      },
    ];
  }
  if (gameClassId === "signal_logic" && levelFamilyId === "overlay_logic_stack") {
    return [
      {
        en: "The visible main world tells you a simple rule first: the console claims the main receiver follows OR logic.",
        zh: "可见主世界会先告诉你一个简单规则：控制台声称主接收器遵循 OR 逻辑。",
      },
      {
        en: "If the observed output disagrees with that visible rule, treat the mismatch as an anomaly rather than as noise.",
        zh: "如果观测到的输出与这个显式规则不一致，就要把这种不匹配看作异常，而不是噪声。",
      },
      {
        en: "That anomaly means a hidden-world overlay rule is currently bleeding into the main world.",
        zh: "这种异常意味着某个隐世界规则当前正在覆盖或叠加到主世界上。",
      },
      {
        en: "When an anomaly appears, jump to the newly revealed hidden chamber and inspect the overlay rule there.",
        zh: "当异常出现时，就跳转到新显露的隐世界房间，检查其中的 overlay 规则。",
      },
      {
        en: "Multiple hidden overlays can stack on the same main receiver, so solving the task may require combining hidden rules rather than eliminating them one by one.",
        zh: "多个隐世界 overlay 可以叠加到同一个主接收器上，所以解决任务可能需要组合隐规则，而不是逐个消除它们。",
      },
    ];
  }
  return [
    {
      en: "This benchmark expects both task completion and rule understanding.",
      zh: "这个 benchmark 同时要求任务完成与规则理解。",
    },
    {
      en: "Discovered hidden worlds can contain required local follow-up tasks.",
      zh: "已发现的隐藏世界中可能包含必须完成的局部后续任务。",
    },
    {
      en: "Use recent events, hidden tasks, and your own theory submission together.",
      zh: "请结合 recent events、hidden tasks 和你自己的规则提交一起推进。",
    },
  ];
};

const backgroundForSelection = (gameClassId: string, levelFamilyId: string): LocalizedText => {
  if (gameClassId === "propagation_escape" && levelFamilyId === "phase_router") {
    return {
      en: "You are inside a derelict resonance workshop whose sole purpose is to open a vault hidden across several layered spaces. Everything in the visible room exists to support that main objective: the anchor wakes the system, the router and lens shape the outgoing pulse, and any hidden branch you uncover is part of the route toward unlocking the final vault. The benchmark still expects a rule report, but the story logic is simple: solve the vault first, and understand the hidden structure well enough to explain how you solved it.",
      zh: "你正身处一座废弃的共振工坊，而它唯一的目的就是打开一个分布在多层空间中的隐藏金库。可见房间中的一切都服务于这个主目标：锚负责唤醒系统，路由器和透镜决定脉冲如何输出，而你发现的任何隐藏分支，都是通往最终金库路径的一部分。这个 benchmark 仍然要求提交规则报告，但叙事逻辑其实很简单：先解决金库，再把你如何解决它所依赖的隐藏结构解释清楚。",
    };
  }
  if (gameClassId === "signal_logic" && levelFamilyId === "overlay_logic_stack") {
    return {
      en: "You are operating a visible diagnostic console that appears to obey a clean OR rule, but the facility has been contaminated by hidden logic chambers whose rules can leak back into the main world. The main task still lives in the visible console: make the main receiver behave correctly. Hidden chambers matter only because their overlay rules explain why the visible system behaves abnormally, and because several overlays may stack on the same receiver before the main task can be solved.",
      zh: "你正在操作一个可见的诊断控制台，它表面上遵循清晰的 OR 规则，但这个设施已经被隐藏逻辑腔室污染了，那些隐世界规则会反向渗透回主世界。主任务仍然发生在可见控制台上：让主接收器恢复正确行为。隐藏腔室之所以重要，只是因为它们的 overlay 规则解释了为什么显式系统会出现异常，而且在主任务真正解决之前，多个 overlay 甚至可能会叠加在同一个接收器上。",
    };
  }
  return {
    en: "You are exploring a layered benchmark environment where visible actions can have hidden consequences across multiple connected worlds.",
    zh: "你正在探索一个分层 benchmark 环境，在这里，可见动作会在多个相互连接的世界中引发隐藏后果。",
  };
};

const mapKeyToAction = (event: KeyboardEvent): Action | null => {
  if (event.key === "ArrowUp" || event.key === "w" || event.key === "W") return { type: "move_up" };
  if (event.key === "ArrowDown" || event.key === "s" || event.key === "S") return { type: "move_down" };
  if (event.key === "ArrowLeft" || event.key === "a" || event.key === "A") return { type: "move_left" };
  if (event.key === "ArrowRight" || event.key === "d" || event.key === "D") return { type: "move_right" };
  if (event.key === "Tab") return { type: "switch_world" };
  if (event.key === "q" || event.key === "Q") return { type: "return_main" };
  if (event.key === "h" || event.key === "H") return { type: "request_oracle" };
  if (event.key === " " || event.key === "Enter" || event.key === "e" || event.key === "E") return { type: "interact" };
  return null;
};

export const App = () => {
  const [screen, setScreen] = useState<ScreenState>({
    kind: "menu",
    gameClassId: initialGame.id,
    levelFamilyId: initialGame.levelFamilies[0].id,
    seed: 7,
  });
  const [transitionAlpha, setTransitionAlpha] = useState(0);
  const [ruleDraft, setRuleDraft] = useState("");
  const [evidenceDraft, setEvidenceDraft] = useState("");
  const [confidenceDraft, setConfidenceDraft] = useState(0.6);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const canvasPanelRef = useRef<HTMLDivElement | null>(null);

  const currentPlugin = registry.get(screen.gameClassId);

  useEffect(() => {
    if (screen.kind !== "game" || !canvasRef.current) {
      return;
    }
    renderObservation(canvasRef.current, screen.result.observation, currentPlugin.rendererSkin, transitionAlpha);
  }, [screen, currentPlugin, transitionAlpha]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = canvasPanelRef.current;
    if (!canvas || !container || screen.kind !== "game") {
      return;
    }

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const width = Math.max(320, Math.floor(container.clientWidth - 32));
      const height = Math.floor(width * (CANVAS_HEIGHT / CANVAS_WIDTH));
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      const context = canvas.getContext("2d");
      context?.setTransform(dpr, 0, 0, dpr, 0, 0);
      renderObservation(canvas, screen.result.observation, currentPlugin.rendererSkin, transitionAlpha);
    };

    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(container);
    window.addEventListener("resize", resize);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", resize);
    };
  }, [screen, currentPlugin, transitionAlpha]);

  useEffect(() => {
    if (screen.kind !== "game") {
      return;
    }
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setScreen({
          kind: "menu",
          gameClassId: screen.gameClassId,
          levelFamilyId: screen.levelFamilyId,
          seed: screen.seed,
        });
        return;
      }
      if (event.key === "r" || event.key === "R") {
        const restarted = humanAdapter.start(screen.gameClassId, screen.levelFamilyId, screen.seed);
        setRuleDraft("");
        setEvidenceDraft("");
        setConfidenceDraft(0.6);
        setScreen({ ...screen, result: restarted });
        return;
      }
      const action = mapKeyToAction(event);
      if (!action) {
        return;
      }
      event.preventDefault();
      const result = humanAdapter.dispatch(action);
      if (action.type === "switch_world") {
        setTransitionAlpha(1);
        window.setTimeout(() => setTransitionAlpha(0), 140);
      }
      setScreen({ ...screen, result });
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [screen]);

  if (screen.kind === "menu") {
    const plugin = registry.get(screen.gameClassId);
    const tutorialSteps = overviewForSelection(screen.gameClassId, screen.levelFamilyId);
    const backgroundText = backgroundForSelection(screen.gameClassId, screen.levelFamilyId);
    return (
      <div className="app-shell">
        <div className="menu-card">
          <p className="eyebrow">Interactive Benchmark Platform</p>
          <h1>Multi-Layer World Benchmark</h1>
          <p className="intro">
            A shared environment kernel for hidden-topology games, now oriented toward main-world objectives, possession,
            and hidden-rule discovery.
          </p>

          <div className="menu-grid">
            <label>
              <span>Game Class</span>
              <select
                value={screen.gameClassId}
                onChange={(event) => {
                  const nextPlugin = registry.get(event.target.value);
                  setScreen({
                    ...screen,
                    gameClassId: nextPlugin.id,
                    levelFamilyId: nextPlugin.levelFamilies[0].id,
                  });
                }}
              >
                {registry.list().map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.title}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span>Level Family</span>
              <select
                value={screen.levelFamilyId}
                onChange={(event) => setScreen({ ...screen, levelFamilyId: event.target.value })}
              >
                {plugin.levelFamilies.map((family) => (
                  <option key={family.id} value={family.id}>
                    {family.title}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span>Seed</span>
              <input
                type="number"
                value={screen.seed}
                onChange={(event) => setScreen({ ...screen, seed: Number(event.target.value) || 1 })}
              />
            </label>
          </div>

          <div className="panel blurb">
            <h2>{plugin.title}</h2>
            <p>{plugin.description}</p>
            <p>{plugin.levelFamilies.find((family) => family.id === screen.levelFamilyId)?.description}</p>
          </div>

          <div className="panel blurb">
            <h2>World Background</h2>
            <p>{backgroundText.en}</p>
            <p>{backgroundText.zh}</p>
          </div>

          <div className="panel blurb">
            <h2>Concept Overview</h2>
            {tutorialSteps.map((step, index) => (
              <p key={`${step.en}-${index}`}>
                {step.en}
                <br />
                {step.zh}
              </p>
            ))}
          </div>

          <button
            className="primary-button"
            onClick={() => {
              const result = humanAdapter.start(screen.gameClassId, screen.levelFamilyId, screen.seed);
              setRuleDraft("");
              setEvidenceDraft("");
              setConfidenceDraft(0.6);
              setScreen({
                kind: "game",
                gameClassId: screen.gameClassId,
                levelFamilyId: screen.levelFamilyId,
                seed: screen.seed,
                result,
              });
            }}
          >
            Start Benchmark
          </button>
        </div>
      </div>
    );
  }

  const plugin = registry.get(screen.gameClassId);
  const observation = screen.result.observation;
  const info = screen.result.info;
  const worldLabel = String(observation.worldId).replace(/^w/i, "World ");
  const legendEntries = Object.entries(plugin.rendererSkin.entityAppearance);
  const publicStatEntries = Object.entries(observation.publicStats);
  const playerStatusEntries = Object.entries(observation.player.status);
  const score = observation.scoreBreakdown;
  const tutorialSteps = overviewForSelection(screen.gameClassId, screen.levelFamilyId);
  const backgroundText = backgroundForSelection(screen.gameClassId, screen.levelFamilyId);
  const completedHiddenTasks = observation.hiddenTasks.filter((task) => task.completed).length;
  const settlementTitle = info.metrics.success ? "Benchmark Complete" : "Run Summary";
  const isOverlayLogicStack = screen.gameClassId === "signal_logic" && screen.levelFamilyId === "overlay_logic_stack";
  const expectedVisibleOutput = String(observation.publicStats.expectedVisibleOutput ?? "-");
  const observedMainOutput = String(observation.publicStats.observedMainOutput ?? "-");
  const anomalyDetected = String(observation.publicStats.anomalyDetected ?? "false") === "true";
  const traceableAnomaly = String(observation.publicStats.traceableAnomaly ?? "none");
  const alphaOverlayState = String(observation.publicStats.alphaOverlayState ?? "-");
  const betaOverlayState = String(observation.publicStats.betaOverlayState ?? "-");
  const nextObjective = String(observation.publicStats.nextObjective ?? observation.mainTask.description);

  return (
    <div className="app-shell">
      <div className="game-layout">
        <div className="game-rail">
          <div className="panel panel-dense">
            <h3>Main Task</h3>
            <p><strong>{observation.mainTask.title}</strong></p>
            <p>{observation.mainTask.description}</p>
            <p>{observation.mainTask.completed ? "Completed" : "In progress"}</p>
          </div>

          <div className="panel panel-dense">
            <h3>Hidden Tasks</h3>
            <div className="hint-list">
              {observation.hiddenTasks.length === 0 ? <p>No hidden task has been surfaced yet.</p> : null}
              {observation.hiddenTasks.map((task) => (
                <p key={task.id}>
                  <strong>{task.title}</strong>
                  <br />
                  {task.description}
                  <br />
                  {task.discovered ? "discovered" : "hidden"} / {task.completed ? "completed" : "pending"}
                </p>
              ))}
            </div>
          </div>

          <div className="panel panel-dense">
            <h3>Concept Overview</h3>
            <div className="hint-list">
              {tutorialSteps.map((step, index) => (
                <p key={`${step.en}-${index}`}>
                  {step.en}
                  <br />
                  {step.zh}
                </p>
              ))}
            </div>
          </div>

          <div className="panel panel-dense">
            <h3>World Background</h3>
            <p>{backgroundText.en}</p>
            <p>{backgroundText.zh}</p>
          </div>
        </div>

        <div className="center-stage">
          <div ref={canvasPanelRef} className="canvas-panel panel">
            <div className="canvas-header">
              <div>
                <p className="eyebrow">{plugin.title}</p>
                <h2>{plugin.levelFamilies.find((family) => family.id === screen.levelFamilyId)?.title}</h2>
              </div>
              <div className="status-pill">{info.metrics.success ? "Objective complete" : "Exploration active"}</div>
            </div>

            <div className="stats-strip">
              <div className="stat-chip stat-chip-focus">
                <span>World</span>
                <strong>{worldLabel} ({observation.worldRole})</strong>
              </div>
              {isOverlayLogicStack ? (
                <>
                  <div className={`stat-chip diagnostic-chip ${anomalyDetected ? "diagnostic-alert" : "diagnostic-ok"}`}>
                    <span>Anomaly</span>
                    <strong>{anomalyDetected ? "DETECTED" : "CLEAR"}</strong>
                  </div>
                  <div className="stat-chip diagnostic-chip">
                    <span>Expected</span>
                    <strong>{expectedVisibleOutput}</strong>
                  </div>
                  <div className="stat-chip diagnostic-chip">
                    <span>Observed</span>
                    <strong>{observedMainOutput}</strong>
                  </div>
                  <div className="stat-chip diagnostic-chip">
                    <span>Traceable</span>
                    <strong>{traceableAnomaly}</strong>
                  </div>
                </>
              ) : (
                <>
                  <div className="stat-chip stat-chip-focus">
                    <span>Route</span>
                    <strong>{String(observation.publicStats.route ?? "-")}</strong>
                  </div>
                  <div className="stat-chip stat-chip-focus">
                    <span>Phase</span>
                    <strong>{String(observation.publicStats.phase ?? "-")}</strong>
                  </div>
                  <div className="stat-chip stat-chip-focus">
                    <span>Sensor</span>
                    <strong>{String(observation.publicStats.sensor ?? "-")}</strong>
                  </div>
                  <div className="stat-chip">
                    <span>Anchor</span>
                    <strong>{String(observation.publicStats.anchorAligned ?? false)}</strong>
                  </div>
                </>
              )}
              <div className="stat-chip">
                <span>Steps</span>
                <strong>{info.metrics.totalSteps}</strong>
              </div>
              <div className="stat-chip">
                <span>Possessions</span>
                <strong>{info.metrics.possessions}</strong>
              </div>
              <div className="stat-chip">
                <span>Interactions</span>
                <strong>{info.metrics.interactionCount}</strong>
              </div>
            </div>

            <canvas ref={canvasRef} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} />

            {isOverlayLogicStack ? (
              <div className="overlay-diagnostic-panel">
                <div className={`overlay-diagnostic-banner ${anomalyDetected ? "overlay-diagnostic-banner-alert" : "overlay-diagnostic-banner-clear"}`}>
                  <div>
                    <span className="overlay-diagnostic-label">Main Receiver Status</span>
                    <strong>{anomalyDetected ? "Anomaly present: trace or intervene." : "No active mismatch right now."}</strong>
                  </div>
                  <div className="overlay-diagnostic-banner-values">
                    <span>Expected {expectedVisibleOutput}</span>
                    <span>Observed {observedMainOutput}</span>
                  </div>
                </div>

                <div className="overlay-diagnostic-grid">
                  <div className="overlay-diagnostic-card">
                    <span>Traceable Side</span>
                    <strong>{traceableAnomaly}</strong>
                    <p>When this is `alpha` or `beta`, go to the main receiver and interact to trace the anomaly.</p>
                  </div>
                  <div className="overlay-diagnostic-card">
                    <span>Alpha Overlay</span>
                    <strong>{alphaOverlayState}</strong>
                    <p>`engaged` means the alpha-side hidden layer is affecting the main receiver. `bypassed` means you disabled that layer inside `w2`.</p>
                  </div>
                  <div className="overlay-diagnostic-card">
                    <span>Beta Overlay</span>
                    <strong>{betaOverlayState}</strong>
                    <p>`engaged` means the beta-side hidden layer is affecting the main receiver. `bypassed` means you disabled that layer inside `w3`.</p>
                  </div>
                  <div className="overlay-diagnostic-card overlay-diagnostic-card-wide">
                    <span>Next Objective</span>
                    <strong>{nextObjective}</strong>
                    <p>Play around this panel: trigger a mismatch in the main world, trace it from the receiver, then change the hidden overlay and watch `Observed` update.</p>
                  </div>
                </div>
              </div>
            ) : null}

            <div className="legend-row">
              {legendEntries.map(([kind, appearance]) => (
                <div key={kind} className="legend-item">
                  <span
                    className={`legend-swatch legend-${appearance.shape}`}
                    style={{ background: appearance.fill, borderColor: appearance.stroke }}
                  />
                  <span>{kind}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="panel panel-dense">
            <h3>Recent Events</h3>
            <div className="event-list">
              {observation.recentEvents.length === 0 ? <p>No local feedback yet.</p> : null}
              {observation.recentEvents.map((event) => (
                <p key={`${event.turn}-${event.text}`} className={`event-${event.tone ?? "neutral"}`}>
                  <span className="event-turn">{event.turn}</span>
                  <span>{event.text}</span>
                </p>
              ))}
            </div>
          </div>

          <div className="panel panel-dense">
            <h3>Rule Submission</h3>
            <div className="control-list">
              <textarea
                value={ruleDraft}
                onChange={(event) => setRuleDraft(event.target.value)}
                placeholder="Describe the hidden rule you currently believe."
                rows={3}
              />
              <textarea
                value={evidenceDraft}
                onChange={(event) => setEvidenceDraft(event.target.value)}
                placeholder="List the evidence, events, or worlds that support the theory."
                rows={3}
              />
              <label>
                <span>Confidence</span>
                <input
                  type="number"
                  min={0}
                  max={1}
                  step={0.1}
                  value={confidenceDraft}
                  onChange={(event) => setConfidenceDraft(Number(event.target.value) || 0)}
                />
              </label>
              <button
                onClick={() => {
                  const result = humanAdapter.dispatch({
                    type: "submit_theory",
                    hypothesizedRule: ruleDraft,
                    evidence: evidenceDraft,
                    confidence: confidenceDraft,
                  });
                  setScreen({ ...screen, result });
                }}
              >
                Submit Theory
              </button>
              <p>{observation.lastSubmissionFeedback}</p>
            </div>
          </div>

          <div className="button-row">
            <button
              onClick={() => {
                const result = humanAdapter.dispatch({ type: "request_oracle" });
                setScreen({ ...screen, result });
              }}
            >
              Ask Oracle
            </button>
            <button
              onClick={() => {
                const result = humanAdapter.dispatch({ type: "return_main" });
                setScreen({ ...screen, result });
              }}
            >
              Return Main
            </button>
            <button
              onClick={() => {
                const restarted = humanAdapter.start(screen.gameClassId, screen.levelFamilyId, screen.seed);
                setRuleDraft("");
                setEvidenceDraft("");
                setConfidenceDraft(0.6);
                setScreen({ ...screen, result: restarted });
              }}
            >
              Restart
            </button>
            <button
              onClick={() =>
                setScreen({
                  kind: "menu",
                  gameClassId: screen.gameClassId,
                  levelFamilyId: screen.levelFamilyId,
                  seed: screen.seed,
                })
              }
            >
              Back to Menu
            </button>
          </div>
        </div>

        <div className="game-rail">
          <div className="panel panel-dense">
            <p className="eyebrow">Public State</p>
            <div className="metric-grid">
              <div>
                <span>Energy</span>
                <strong>{observation.player.energy}</strong>
              </div>
              <div>
                <span>HP</span>
                <strong>{observation.player.hp}</strong>
              </div>
              <div>
                <span>Inventory</span>
                <strong>{observation.player.inventory.join(", ") || "empty"}</strong>
              </div>
              <div>
                <span>Seed</span>
                <strong>{screen.seed}</strong>
              </div>
              <div>
                <span>Unlocked Worlds</span>
                <strong>{observation.discoveredWorlds.join(", ")}</strong>
              </div>
              {playerStatusEntries.map(([key, value]) => (
                <div key={key}>
                  <span>{key}</span>
                  <strong>{String(value)}</strong>
                </div>
              ))}
              {publicStatEntries
                .filter(([key]) => !["route", "phase", "sensor", "anchorAligned"].includes(key))
                .map(([key, value]) => (
                <div key={key}>
                  <span>{key}</span>
                  <strong>{String(value)}</strong>
                </div>
                ))}
            </div>
          </div>

          <div className="panel panel-dense">
            <h3>Score Breakdown</h3>
            <div className="metric-grid">
              <div>
                <span>Main</span>
                <strong>{score.mainTaskScore.toFixed(2)}</strong>
              </div>
              <div>
                <span>Hidden</span>
                <strong>{score.hiddenTaskScore.toFixed(2)}</strong>
              </div>
              <div>
                <span>Rule</span>
                <strong>{score.ruleDiscoveryScore.toFixed(2)}</strong>
              </div>
              <div>
                <span>Evidence</span>
                <strong>{score.evidenceScore.toFixed(2)}</strong>
              </div>
              <div>
                <span>Efficiency</span>
                <strong>{score.efficiencyScore.toFixed(2)}</strong>
              </div>
              <div>
                <span>Total</span>
                <strong>{score.totalScore.toFixed(2)}</strong>
              </div>
            </div>
          </div>

          <div className="panel panel-dense">
            <h3>Controls</h3>
            <div className="control-list">
              <p><strong>Move</strong> WASD / Arrow Keys</p>
              <p><strong>Interact</strong> E / Enter / Space</p>
              <p><strong>Possess Discovered Hidden World</strong> Tab</p>
              <p><strong>Return Main</strong> Q</p>
              <p><strong>Ask Oracle</strong> H</p>
              <p><strong>Restart</strong> R</p>
              <p><strong>Back to Menu</strong> Esc</p>
            </div>
          </div>

          <div className="panel panel-dense">
            <h3>Explicit Rules</h3>
            <div className="hint-list">
              {observation.explicitRules.map((rule) => (
                <p key={rule}>{rule}</p>
              ))}
            </div>
          </div>

          <div className="panel panel-dense">
            <h3>Implicit Rule Signals</h3>
            <div className="hint-list">
              {observation.implicitRuleSignals.length === 0 ? <p>No hidden rule signal has surfaced yet.</p> : null}
              {observation.implicitRuleSignals.map((signal) => (
                <p key={signal}>{signal}</p>
              ))}
            </div>
          </div>

          <div className="panel panel-dense">
            <h3>Hints</h3>
            <div className="hint-list">
              {observation.hudHints.map((hint) => (
                <p key={hint}>{hint}</p>
              ))}
            </div>
          </div>
        </div>
      </div>

      {info.metrics.success ? (
        <div className="settlement-overlay">
          <div className="settlement-card panel">
            <p className="eyebrow">Settlement</p>
            <h2>{settlementTitle}</h2>
            <p className="settlement-intro">
              You reached the terminal objective. This panel summarizes whether the run satisfied both the escape task
              and the benchmark's rule-discovery requirement.
            </p>

            <div className="settlement-grid">
              <div className="stat-chip stat-chip-focus">
                <span>Main Task</span>
                <strong>{observation.mainTask.completed ? "Completed" : "Incomplete"}</strong>
              </div>
              <div className="stat-chip stat-chip-focus">
                <span>Hidden Tasks</span>
                <strong>{completedHiddenTasks} / {observation.hiddenTasks.length}</strong>
              </div>
              <div className="stat-chip">
                <span>Total Score</span>
                <strong>{score.totalScore.toFixed(2)}</strong>
              </div>
              <div className="stat-chip">
                <span>Rule Score</span>
                <strong>{score.ruleDiscoveryScore.toFixed(2)}</strong>
              </div>
              <div className="stat-chip">
                <span>Evidence</span>
                <strong>{score.evidenceScore.toFixed(2)}</strong>
              </div>
              <div className="stat-chip">
                <span>Steps</span>
                <strong>{info.metrics.totalSteps}</strong>
              </div>
              <div className="stat-chip">
                <span>Oracle Uses</span>
                <strong>{info.metrics.oracleRequests}</strong>
              </div>
            </div>

            <div className="panel panel-dense settlement-panel">
              <h3>Final Feedback</h3>
              <p>{observation.lastSubmissionFeedback}</p>
            </div>

            <div className="panel panel-dense settlement-panel">
              <h3>Completed Hidden Tasks</h3>
              <div className="hint-list">
                {observation.hiddenTasks.filter((task) => task.completed).map((task) => (
                  <p key={task.id}>
                    <strong>{task.title}</strong>
                    <br />
                    {task.description}
                  </p>
                ))}
              </div>
            </div>

            <div className="button-row settlement-actions">
              <button
                onClick={() => {
                  const restarted = humanAdapter.start(screen.gameClassId, screen.levelFamilyId, screen.seed);
                  setRuleDraft("");
                  setEvidenceDraft("");
                  setConfidenceDraft(0.6);
                  setScreen({ ...screen, result: restarted });
                }}
              >
                Play Again
              </button>
              <button
                onClick={() =>
                  setScreen({
                    kind: "menu",
                    gameClassId: screen.gameClassId,
                    levelFamilyId: screen.levelFamilyId,
                    seed: screen.seed,
                  })
                }
              >
                Back to Menu
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};
