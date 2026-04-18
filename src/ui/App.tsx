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

const mapKeyToAction = (event: KeyboardEvent): Action | null => {
  if (event.key === "ArrowUp" || event.key === "w" || event.key === "W") return { type: "move_up" };
  if (event.key === "ArrowDown" || event.key === "s" || event.key === "S") return { type: "move_down" };
  if (event.key === "ArrowLeft" || event.key === "a" || event.key === "A") return { type: "move_left" };
  if (event.key === "ArrowRight" || event.key === "d" || event.key === "D") return { type: "move_right" };
  if (event.key === "Tab") return { type: "switch_world" };
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
    return (
      <div className="app-shell">
        <div className="menu-card">
          <p className="eyebrow">Interactive Benchmark Platform</p>
          <h1>Multi-Layer World Benchmark</h1>
          <p className="intro">
            A shared environment kernel for hidden-topology games, with one public interface for humans and agents.
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

          <button
            className="primary-button"
            onClick={() => {
              const result = humanAdapter.start(screen.gameClassId, screen.levelFamilyId, screen.seed);
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

  return (
    <div className="app-shell">
      <div className="game-layout">
        <div ref={canvasPanelRef} className="canvas-panel panel">
          <div className="canvas-header">
            <div>
              <p className="eyebrow">{plugin.title}</p>
              <h2>{plugin.levelFamilies.find((family) => family.id === screen.levelFamilyId)?.title}</h2>
            </div>
            <div className="status-pill">{info.metrics.success ? "Objective complete" : "Exploration active"}</div>
          </div>

          <div className="stats-strip">
            <div className="stat-chip">
              <span>World</span>
              <strong>{worldLabel}</strong>
            </div>
            <div className="stat-chip">
              <span>Steps</span>
              <strong>{info.metrics.totalSteps}</strong>
            </div>
            <div className="stat-chip">
              <span>Switches</span>
              <strong>{info.metrics.worldSwitches}</strong>
            </div>
            <div className="stat-chip">
              <span>Interactions</span>
              <strong>{info.metrics.interactionCount}</strong>
            </div>
          </div>

          <canvas ref={canvasRef} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} />

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

        <div className="side-panel">
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
              {playerStatusEntries.map(([key, value]) => (
                <div key={key}>
                  <span>{key}</span>
                  <strong>{String(value)}</strong>
                </div>
              ))}
              {publicStatEntries.map(([key, value]) => (
                <div key={key}>
                  <span>{key}</span>
                  <strong>{String(value)}</strong>
                </div>
              ))}
            </div>
          </div>

          <div className="panel panel-dense">
            <h3>Controls</h3>
            <div className="control-list">
              <p><strong>Move</strong> WASD / Arrow Keys</p>
              <p><strong>Interact</strong> E / Enter / Space</p>
              <p><strong>Switch World</strong> Tab</p>
              <p><strong>Restart</strong> R</p>
              <p><strong>Back to Menu</strong> Esc</p>
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

          <div className="button-row">
            <button
              onClick={() => {
                const restarted = humanAdapter.start(screen.gameClassId, screen.levelFamilyId, screen.seed);
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
      </div>
    </div>
  );
};
