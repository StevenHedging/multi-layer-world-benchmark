# Multi-Layer World Benchmark

一个面向人类玩家与 LLM 智能体的多层世界规则发现 benchmark。项目的核心目标不是单纯做迷宫或路径规划，而是让智能体在统一环境内核中，通过观测异常、跨世界探索、干预隐藏机制、提交结构化报告的方式，完成“发现规则”这件事。

## 项目定位

这个仓库提供的是一个统一的交互式 benchmark 框架：

- 人类玩家通过前端界面探索环境
- LLM 智能体通过统一文本接口或脚本 runner 与同一环境交互
- 两者共享同一套状态转移、传播逻辑、计分逻辑与隐藏信息边界

环境强调以下能力：

- 发现显式规则与隐式规则
- 识别异常现象并追踪其来源
- 在主世界与隐世界之间切换并做干预实验
- 用结构化报告总结隐藏世界数量、隐藏规则内容与叠加关系

## 当前重点环境：`signal_logic / overlay_logic_stack`

这是目前最贴近“规则发现 benchmark”目标的环境。

### 核心设定

- 主世界表面上遵循一个可见的 `OR` 规则
- 但隐藏世界会以 overlay 的形式影响主世界同一个 receiver
- 智能体不会一开始就直接看到隐藏世界
- 正确流程是：
  1. 在主世界中制造或观测异常
  2. 在主世界对异常进行 trace
  3. 解锁并进入对应隐世界
  4. 在隐世界中做交互，观察它如何改变主世界最终值
  5. 提交关于隐藏规则的结构化报告

### 当前实现语义

- 显式规则：

```text
expected = alpha OR beta
```

- 隐世界叠加后的主世界观测可理解为：

```text
observed = expected XOR z_alpha XOR z_beta
```

其中：

- `z_alpha` 表示 alpha 对应隐藏层当前是否在作用
- `z_beta` 表示 beta 对应隐藏层当前是否在作用

重要的是，这里的叠加不是随机的，而是由两类因素共同决定：

- 主世界中的显式触发条件
- 隐世界中你是否通过交互让该 overlay 继续生效或被 bypass

也就是说，隐藏世界对主世界的影响是动态变化的、可实验干预的，而不是纯后台静态设定。

### 异常驱动发现

`overlay_logic_stack` 现在采用“先异常、后追踪、再发现”的逻辑：

1. 隐规则可能已经在后台影响主世界
2. 智能体先在主世界观测到 `Expected != Observed`
3. 智能体必须在主接收器上进行 trace
4. 对应隐世界才会被发现并可切换进入

这比“异常一出现就自动开图”更符合规则发现任务的因果结构。

### 交互式隐藏层验证

当前版本已经支持：

- 在隐世界中对隐藏 gate 交互
- 直接改变主世界最终 `Observed` 值
- 在前端诊断面板中看到 `Expected / Observed / Anomaly / Traceable / Overlay State`

这样人类玩家和 LLM 都可以通过干预来验证规则，而不是只靠文本提示猜答案。

### 形式化文档

这个环境的更完整中文形式化说明见：

- [docs/overlay_logic_stack_formalization.md](./docs/overlay_logic_stack_formalization.md)

文档中包含：

- 分层隐藏状态建模
- HMM-like / POMDP-like 理解
- 显式规则与隐式叠加规则
- 异常定义
- anomaly-trace 发现机制
- 结构化报告目标
- `[0,1]` 归一化评分语义

## 评分

当前总分被限制在 `[0, 1]` 区间，采用加权和：

```text
totalScore =
0.40 * mainTaskScore +
0.20 * hiddenTaskScore +
0.20 * ruleDiscoveryScore +
0.15 * evidenceScore +
0.05 * efficiencyScore
```

各项含义：

- `mainTaskScore`：是否完成主任务并提交被接受的报告
- `hiddenTaskScore`：是否发现并验证隐藏任务与隐藏世界
- `ruleDiscoveryScore`：是否正确总结规则结构
- `evidenceScore`：是否提供足够实验依据
- `efficiencyScore`：是否在较少步数内完成探索与提交

这套设计避免了负分，同时让“规则发现质量”比“刷步数”更重要。

## 当前游戏类

当前仓库内置的游戏类包括：

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
  - `overlay_logic_stack`
- `Ecology Network`
  - `purify_chain`
  - `pollution_vs_growth`

## 技术栈

- TypeScript
- React
- Vite
- Canvas 2D

## 目录结构

```text
src/
  core/          环境内核与评分
  games/         各游戏类插件与共享工具
  interfaces/    human / agent 适配层
  render/        Canvas 渲染
  types/         核心类型与插件接口
  ui/            React 前端
  utils/         通用工具

docs/            形式化描述与设计文档
scripts/         LLM runner、分析脚本、辅助脚本
build-node/      构建后的 Node 脚本
results/         实验日志与分析结果
```

## 环境架构

### 1. Core Kernel

位置：`src/core/`

- `kernel.ts`
  - 统一处理 `reset / step`
  - 负责移动、交互、切世界、传播、事件日志、胜利判定与 metrics 更新
- `registry.ts`
  - 注册并管理所有 `GameClassPlugin`
- `scoring.ts`
  - 统一的归一化评分逻辑

### 2. Plugin Layer

位置：`src/games/`

每个游戏类负责：

- 词汇与实体定义
- level family 定义
- instance generator
- 局部交互规则
- 跨世界传播规则
- 胜利条件
- observation 适配
- renderer skin

### 3. Human / Agent Adapters

位置：`src/interfaces/`

- `humanClient.ts`
  - 前端 UI 的适配层
- `agentEnv.ts`
  - 通用 agent 环境接口
- `llmTextEnv.ts`
  - 面向文本模型的 prompt / observation 包装

### 4. Frontend

位置：`src/ui/` 与 `src/render/`

前端负责：

- 菜单页与运行页
- HUD、任务面板、Recent Events、Score Breakdown
- 当前世界画布渲染
- 环境特定的诊断信息展示

## 公共交互模型

所有环境共享同一组基础动作：

- `move_up`
- `move_down`
- `move_left`
- `move_right`
- `interact`
- `switch_world`
- `wait`
- `submit_theory`（部分环境可用）

默认按键：

- `WASD` / 方向键：移动
- `E` / `Enter` / `Space`：交互
- `Tab`：切换世界
- `R`：重开
- `Esc`：返回菜单

## 安装与运行

### 依赖

- Node.js 18+
- npm 10+

### 安装

```bash
npm install
```

### 开发模式

```bash
npm run dev
```

### 构建前端

```bash
npm run build
```

### 预览构建结果

```bash
npm run preview
```

## LLM 运行与脚本

### 构建 LLM runner

```bash
npm run build:llm-runner
```

### 运行启发式模式

```bash
npm run run:llm:heuristic
```

### 计算 phase router 最少步数

```bash
npm run run:phase-router-min
```

其他实验脚本见：

- [scripts/run_llm_benchmark.ts](./scripts/run_llm_benchmark.ts)
- [scripts/manual_overlay_trace_demo.ts](./scripts/manual_overlay_trace_demo.ts)
- [scripts/compute_phase_router_min_steps.ts](./scripts/compute_phase_router_min_steps.ts)

## Agent 接口

统一 agent 接口位于：

- [src/interfaces/agentEnv.ts](./src/interfaces/agentEnv.ts)

基本风格：

```ts
reset(options: { seed?: number; gameClassId: string; levelFamilyId: string })
step(action: Action)
getActionSchema()
close()
```

特点：

- 人类前端与 agent 共用同一个环境内核
- 只暴露公共 observation，不泄漏完整隐藏状态
- 支持通过 `gameClassId / levelFamilyId / seed` 生成可复现实例

## 设计原则

- 单一环境内核优先，不为不同入口维护两套规则
- 插件化扩展优先，不在 kernel 里堆游戏特判
- 隐藏信息边界严格，保证 benchmark 语义
- 强调规则发现，而不只是路径规划
- 尽量让“异常 -> 实验 -> 验证 -> 报告”成为主要解题流程

## 如何新增一个游戏类

推荐流程：

1. 在 `src/games/` 下新建目录
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

理想情况下，不需要改 `EnvironmentKernel`。

## 当前状态

当前仓库已经具备：

- 多游戏类插件架构
- 可玩的前端
- 可复用的 agent / LLM 适配层
- 基础评分与事件日志
- 基于 seed 的复现实例生成
- 面向 `overlay_logic_stack` 的形式化描述和实验脚本

后续仍然适合继续增强：

- 更丰富的隐藏规则组合与拓扑结构
- 更强的 theory submission / judge 机制
- 更系统的 batch benchmark runner
- 更好的前端可视化与教程引导
- 更完整的测试覆盖

## License

当前仓库未附带许可证文件。如果准备公开长期维护，建议补充一个明确的 `LICENSE`。
