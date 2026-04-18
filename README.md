# Multi-Layer World Benchmark

一个面向人类玩家与智能体评测的交互式 benchmark 平台。

这个项目不是普通的网页小游戏合集，而是一个共享同一套环境内核的多游戏 benchmark：不同游戏类都运行在“多局部世界 + 隐藏拓扑 + 局部交互影响远端世界”的统一框架之上。人类玩家通过前端探索规则，智能体通过统一 API 与环境交互；两者看到的是同一种公共 observation，底层状态转移逻辑只有一份。

## Features

- 统一环境内核：`step/reset`、移动、交互、切换世界、传播、胜利判定、metrics 记录共用一套逻辑
- 游戏类插件化：新增游戏类不需要改内核，只需实现 `GameClassPlugin`
- 人类 / 智能体双端适配：前端与 agent adapter 共享同一环境
- 隐藏信息隔离：不直接暴露拓扑、隐藏目标、传播细节或关键世界
- Canvas 前端：轻量渲染主干 + 游戏类皮肤机制
- Seed 支持：episode 支持种子驱动的实例生成与可复现

## Current Game Classes

当前已内置以下游戏类与 level family：

- `Propagation Escape`
  - `chain_basic`
  - `fork_join_basic`
- `Energy Network`
  - `single_source_threshold`
  - `dual_source_merge`
- `Ritual Network`
  - `altar_chain`
  - `dual_ritual_merge`
- `Signal Logic`
  - `basic_logic_chain`
  - `fork_logic_merge`
- `Ecology Network`
  - `purify_chain`
  - `pollution_vs_growth`

## Tech Stack

- TypeScript
- Vite
- React
- Canvas 2D

## Architecture

项目围绕“统一环境内核 + 游戏插件层 + 双适配接口”组织。

### 1. Core Kernel

位置：`src/core/`

- `kernel.ts`
  - 唯一真实状态转移入口
  - 负责移动、交互、切世界、传播事件调度、胜利判定、metrics 更新
- `registry.ts`
  - 管理所有 `GameClassPlugin`

这一层不依赖 UI，也不硬编码具体游戏元素。

### 2. Shared Types

位置：`src/types/`

- `core.ts`
  - 基础 ID、`EpisodeInstance`、`WorldState`、`Observation`、`BenchmarkMetrics` 等
- `plugin.ts`
  - `GameClassPlugin`、`InteractionRule`、`PropagationRule`、`ObservationAdapter`、`RendererSkin` 等插件接口

这些类型定义了平台长期扩展的“稳定骨架”。

### 3. Game Plugin Layer

位置：`src/games/`

每个游戏类放在独立目录中，负责：

- 元素 vocabulary
- level family 定义
- instance generator
- 局部交互逻辑
- 跨世界传播规则
- 胜利条件 evaluator
- observation 适配
- renderer skin

共享工具位于：

- `src/games/shared/builders.ts`
- `src/games/shared/observation.ts`
- `src/games/shared/helpers.ts`

### 4. Human / Agent Adapters

位置：`src/interfaces/`

- `humanClient.ts`
  - 面向前端 UI 的薄适配层
- `agentEnv.ts`
  - 提供统一的 `reset / step / getActionSchema / close` 风格接口

这两层都调用同一个 `EnvironmentKernel`，不会出现两套规则实现。

### 5. Frontend and Rendering

位置：

- `src/ui/`
- `src/render/`

职责包括：

- 菜单页
- 游戏页
- HUD / 事件日志 / 图例
- Canvas 渲染
- 游戏类皮肤复用

## Directory Structure

```text
src/
  core/          # 环境内核与游戏注册表
  games/         # 各游戏类插件与共享生成/observation工具
  interfaces/    # human / agent adapter
  render/        # Canvas 渲染主干
  types/         # 核心类型与插件接口
  ui/            # React 前端页面与样式
  utils/         # ID、网格、随机数等工具
```

## Public Interaction Model

所有游戏类共享同一组基础动作：

- `move_up`
- `move_down`
- `move_left`
- `move_right`
- `interact`
- `switch_world`
- `wait`

前端默认按键：

- `WASD` / 方向键：移动
- `E` / `Enter` / `Space`：交互
- `Tab`：切换世界
- `R`：重开
- `Esc`：返回菜单

## Observation and Hidden Information

环境对人类与智能体只暴露公共 observation，例如：

- 当前世界局部网格
- 当前世界可见实体
- 玩家局部位置
- 公共资源 / 背包 / 状态
- 最近几步事件反馈
- 公共 HUD hints

不会直接暴露：

- 完整隐藏拓扑
- 隐藏传播规则
- 隐藏胜利条件
- 全局 latent state

## Getting Started

### Requirements

- Node.js 18+
- npm 10+（更低版本通常也可运行，但当前环境已使用 npm 10）

### Install

```bash
npm install
```

### Run in Development

```bash
npm run dev
```

启动后打开本地 Vite 地址，进入菜单页后选择：

- 游戏类
- level family
- seed

然后即可开始游玩。

### Build

```bash
npm run build
```

### Preview Production Build

```bash
npm run preview
```

## Agent Adapter

项目中已经包含一个统一的智能体适配层：`src/interfaces/agentEnv.ts`。

接口风格如下：

```ts
reset(options: { seed?: number; gameClassId: string; levelFamilyId: string })
step(action: Action)
getActionSchema()
close()
```

特点：

- 可以在 reset 时选择游戏类、family 与 seed
- 返回公共 observation，不泄漏隐藏信息
- 与前端游玩共享同一个 kernel

## Design Principles

- 统一环境内核优先，不为不同入口写第二套规则
- 插件化扩展优先，不在 kernel 中堆积具体游戏 if/else
- 隐藏信息管理严格，benchmark 语义优先
- 强类型、低耦合、可维护

## How to Add a New Game Class

新增一个新游戏类时，推荐流程如下：

1. 在 `src/games/` 下新建目录，例如 `src/games/myNewGame/`
2. 实现一个新的 `GameClassPlugin`
3. 定义：
   - `levelFamilies`
   - `instanceGenerator`
   - `interactionRules`
   - `propagationRules`
   - `winCondition`
   - `observationAdapter`
   - `rendererSkin`
4. 在 `src/games/index.ts` 中注册插件

理想情况下，不需要修改 `EnvironmentKernel`。

## Project Status

当前版本是一个可运行的 benchmark 原型，已经具备：

- 多游戏类插件架构
- 可玩的网页前端
- 可复用的 agent adapter
- 基础 metrics 与日志
- 基础 seed 支持

后续仍可继续增强：

- 更丰富的实例生成与拓扑采样
- 更细致的 action mask
- replay / benchmark batch runner
- 更丰富的 renderer asset / icon system
- 更细粒度的测试覆盖

## License

当前仓库尚未附带许可证文件。
如果你准备公开上传到 GitHub，建议补充一个 `LICENSE` 文件。
