# ts-template 选项方案限定范围独立审（kimi）

## 审查结论与边界

- 结论：**PASS**。未发现 P0；发现 **1 项 P1、2 项 P2**，均可在实现单中修正，不需要推翻 A 方案或 TS 6 lint 方案 b。
- 被审对象：`.handoff/选项方案.md`，SHA-256 `6e8e97f39d661039109e77991ee2f7f16d06b03c3fe6104bd6450605a7cf094f`。
- 任务单：`deep-think-data/practices/engineer/handoff/ts-template/任务单-方案审-kimi.md`，仓库 HEAD 已核实为 `9d4cdbd346fc`；任务单 SHA-256 `48bfa7e358e6cd54fa5a01e4444204ab1f46ef3728cf2b8430b7d87aaab9523e`。
- ts-template 现场：`main`，基线 `11b2af49fd8bc17fb851da8ad92b60ebe0dca521`；审查前已有未跟踪 `.handoff/选项方案.md`，本会话没有修改它。唯一写入对象为本报告。
- 范围：仅审任务单指定的第 11、7、8、5、6 节及为核对证据所需的第 1–4、9、10 节；未通读或评审实现阶段、交接记录。
- 本次为纯文档方案审，未改代码、配置、锁或测试，未安装、未联网、未提交、未推送。`npm run check`、`check:full`、适用浏览器验收及 `check:milestone` 均为 `not_run`，原因是本任务没有代码变更且明确只读；它们不是方案 b 的实测证据。

## 1. 第 11 节决策表的证据与遗漏

**结论：通过。** 每项推荐都能追溯到第 2–10 节；在原任务限定内，没有发现会改变 A、纯 `.ts` Vue、方案 b 或矩阵结论的漏选项。

| 第 11 节决策        | 支撑证据                                                                                    | 审查意见                                                                                      |
| ------------------- | ------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| A 的 12 个成品      | `.handoff/选项方案.md:134-155` 比较审核、成本、漂移、离线、giget 和现有机制改动             | A/B 的关键取舍齐全；B 的在线重解析与锁不可预审风险有明确依据                                  |
| 目录命名            | `.handoff/选项方案.md:143-151`                                                              | 三个旧路径保留，另外九个后缀路径无默认别名，恰好 12 个                                        |
| Vue 保留纯 `.ts`    | `.handoff/选项方案.md:111-120`                                                              | SFC 的默认 TS、组合数和旧拒绝测试迁移影响均已揭示；没有暗中删除现有保护                       |
| TS 6 lint 采用 b    | `.handoff/选项方案.md:261-276`、`.handoff/选项方案.md:278-311`                              | 编译器一致性、规则对等、速度、依赖和配置成本均有证据或明确未验证项；b 未通过实验则不交付 TS 6 |
| 依赖工具逐项批准    | `.handoff/选项方案.md:313-341`                                                              | 精确直接依赖、条件依赖、传递锁另审及批准前不安装一致                                          |
| 快检策略            | `.handoff/选项方案.md:60-70`、`.handoff/选项方案.md:90-107`、`.handoff/选项方案.md:343-362` | Bun API、锁、双版本配置和 Stryker guard 均有错误样例与层级设计                                |
| TS 6 首次复查及退役 | `.handoff/选项方案.md:122-130`                                                              | 机器日期、到期行为、生态条件、连续两次复查和 Nika 批准形成闭环                                |
| 矩阵及运行预算      | `.handoff/选项方案.md:180-222`                                                              | 16 个两两取值对、G 风险追加、默认三组 milestone 和三系统安排一致                              |
| lint 实验预算       | `.handoff/选项方案.md:280-311`                                                              | 明确为待批预算而非实测结论，且不允许以性能为由降低正确性                                      |
| 维护边界修正        | `.handoff/选项方案.md:364-377`、`CONTRIBUTING.md:7`                                         | 旧标准路径与 `.handoff` 根镜像冲突均有现状依据；登记缺口见第 5 节 P1                          |

## 2. 第 7 节：22 条规则、方案 b 与实验

### 2.1 当前规则数量和名称：通过

本会话在仓库根目录用 Node `child_process.execFileSync` 调用现有 `node_modules/.bin/oxlint`：

- `oxlint --version`：退出 0，`Version: 1.93.0`。
- `oxlint --rules --format=json`：退出 0，共 872 条注册规则。
- `oxlint --print-config`：退出 0。
- 将解析配置中的启用规则与注册表 `type_aware: true` 取交集，再解析方案 7.1 表格，机器输出为：`ACTUAL_TYPE_AWARE_COUNT 22`、`PLAN_LIST_COUNT 22`、`UNIQUE 22`、`MISSING_FROM_PLAN []`、`EXTRA_IN_PLAN []`。

逐条核对结果如下；“实际”和“方案”均为是：

| #   | 规则（省略两边前缀）             | 实际 | 方案 | #   | 规则（省略两边前缀）            | 实际 | 方案 |
| --- | -------------------------------- | ---- | ---- | --- | ------------------------------- | ---- | ---- |
| 1   | `await-thenable`                 | 是   | 是   | 12  | `no-unsafe-argument`            | 是   | 是   |
| 2   | `no-array-delete`                | 是   | 是   | 13  | `no-unsafe-assignment`          | 是   | 是   |
| 3   | `no-base-to-string`              | 是   | 是   | 14  | `no-unsafe-call`                | 是   | 是   |
| 4   | `no-duplicate-type-constituents` | 是   | 是   | 15  | `no-unsafe-member-access`       | 是   | 是   |
| 5   | `no-floating-promises`           | 是   | 是   | 16  | `no-unsafe-return`              | 是   | 是   |
| 6   | `no-for-in-array`                | 是   | 是   | 17  | `no-unsafe-unary-minus`         | 是   | 是   |
| 7   | `no-implied-eval`                | 是   | 是   | 18  | `no-useless-default-assignment` | 是   | 是   |
| 8   | `no-meaningless-void-operator`   | 是   | 是   | 19  | `require-array-sort-compare`    | 是   | 是   |
| 9   | `no-misused-promises`            | 是   | 是   | 20  | `restrict-template-expressions` | 是   | 是   |
| 10  | `no-misused-spread`              | 是   | 是   | 21  | `switch-exhaustiveness-check`   | 是   | 是   |
| 11  | `no-redundant-type-constituents` | 是   | 是   | 22  | `unbound-method`                | 是   | 是   |

其中显式启用的类型规则正好 8 条，其余 14 条来自 `correctness`，与 `.oxlintrc.json:4-26` 和 `.handoff/选项方案.md:228-253` 一致。方案对 typescript-eslint 同名规则的依据给出了固定 8.72.2 注册表来源（`.handoff/选项方案.md:255`）；本次未安装该包、未重新联网取源，因此行为对等仍正确保留为后续实验项。

### 2.2 方案 b 可行性：通过，仍以实验为交付门

- 非类型规则继续由 Oxlint 承担，TS 6 的 22 条由 ESLint + typescript-eslint `projectService` 承担，TS 7 不安装 ESLint，符合任务要求（`.handoff/选项方案.md:261-270`）。
- 公共 Oxlint 配置关闭 22 条、TS 7 typed 配置恢复 22 条，避免 TS 7 静默失去保护；TS 6 不生成 typed 配置（`.handoff/选项方案.md:276`）。该配置拆分在职责上可行。
- `eslint.config.mjs` 避免新增 `jiti`，直接使用 `typescript-eslint` 导出的 parser/plugin，不需要 `@eslint/js`；文件集合、本地 TS 6、`tsconfigRootDir` 和工程外文件失败均有约束（`.handoff/选项方案.md:274`）。
- 没有把同名当作同语义：默认 options、thenable、void、unbound method 和诊断位置均要求验证；失败不得发布 TS 6（`.handoff/选项方案.md:255`、`.handoff/选项方案.md:272`）。

### 2.3 实验判定：基本可机器执行，P2 补精确断言

**P2 — 将“22 条一条不丢”固化为规则清单和诊断来源断言。**

- 证据：`.handoff/选项方案.md:286` 要求 22 条各一对正反样例，`:305-307` 要求 JSON 诊断和结构化汇总，`:311` 要求全部检出；这些足以设计机器检查。但“合法样例无未解释误报”“任何未知漏报”仍含人工分类措辞，且门槛没有单独写明每个 TS 6 违规样例必须由 ESLint 输出预期的 `@typescript-eslint/<rule>`。
- 风险：实现者若只按进程非零或总错误数验收，可能让同一文件上的其他规则代为命中，不能严格证明指定规则未丢。
- 建议改法：在实现单中放入固定 22 项机器可读 manifest；每个违规 fixture 断言 `tsc` 退出 0、ESLint JSON 中预期规则 ID 至少一次且来源为 ESLint，每个合法 fixture 的预期诊断集合为空；同时断言 ESLint 解析配置恰好启用这 22 条且均为 error。人工语义比较保留为附加证据，不替代上述精确断言。

## 3. 第 8 节待批依赖

**结论：通过。** 推荐路径未发现会导致方案 b 无法落地的漏包。

- 直接项均有精确版本、用途、适用组合、开发属性和许可证：Bun 1.3.11、`jsonc-parser` 3.3.1、TypeScript 6.0.3、ESLint 10.15.0、typescript-eslint 8.72.2（`.handoff/选项方案.md:317-323`）。
- 方案 b 所需 parser/plugin 已由 `typescript-eslint` 包提供，四个固定子包明确标为间接依赖、不重复直接声明（`:324-327`）；采用 mjs 后不把 `@eslint/js`、`jiti` 误列为必需包（`:274`、`:335-339`）。
- SFC 条件项与推荐纯 `.ts` 路径隔离，`vue-tsc`、Vite Vue 插件、`vue-eslint-parser`、`@vue/compiler-sfc` 等版本和许可证均已列出（`:328-335`）。
- 来源给出固定版本 registry 端点或上游固定版本文件，并记录 2026-11-16 核对日期（`:315`、`:341`）。Bun 捆绑第三方许可没有被“MIT”一句话掩盖（`:319`）。
- 完整传递图未伪装成已批准：实际版本、许可证、advisory 和体积须在获批锁生成后另审（`:315`、`:337`、`:373`）。本审未联网重查 registry，故只确认方案的版本/来源/许可证记录及依赖设计，不把元数据复核冒充安装验收。

## 4. 第 5、6 节漂移防线

**结论：检查链通过；另有 1 项 P2 文案明确化。**

- 单一权威输入、有限字段变换、composer 不安装、`templates:sync` 只消费已审核锁、`templates:check` 离线比较完整路径、字节、权限和根镜像，见 `.handoff/选项方案.md:143-155`。
- 现有实现也证明该“检查”不是只比较锁：`tools/template-tests/src/assembly.ts:154-165` 重新组装权威输入后比较每个输出，`tools/template-tests/src/files.ts:84-91` 对完整文件集合、字节和 mode 的任一差异抛错。
- 新方案将 12 组离线组装、字节和权限检查放在维护器静态快检（`.handoff/选项方案.md:173`、`:207`）；`:163` 明确较高层继承快检，因此 `check:full` 和 `check:milestone` 不会绕过它。安装契约不能替代该静态门。

**P2 — 把“禁止手改成品”从隐含约定写成显式规则。**

- 证据：`:138` 只说手改容易漂移，`:143-153` 和 `CONTRIBUTING.md:11-21` 已隐含单一生成来源，但方案没有一句直接的“12 个目录禁止手改”。
- 建议改法：在第 5 或 6.1 节明确写：`templates/` 下恰好 12 个成品只能由 `templates:sync` 从权威 scaffold 和已审核锁生成，禁止手改；维护器 `check` 必须重新组装并逐路径、逐字节、逐 mode 比较，任何缺失、额外或内容差异均非零。这样实现单无需从比较表反推写入政策。

## 5. 新规则层级、长期/补坑与删除条件

**结论：核心选项规则通过；1 项 P1 登记遗漏。**

- 6.1 表对锁与管理器、Bun API、双版本配置、22 条类型规则、frozen 安装、安全/许可证、12 组漂移、Stryker、默认 milestone、TS 6 日期、定期复查及 G 风险追加均标了主层和性质（`.handoff/选项方案.md:163-178`）。
- 补坑删除条件具体：TS 6 适配回 4.3 的原生能力、连续实测和批准条件；Stryker 要求正式支持、固定版本、三默认组合连续两次实测及 Nika 批准（`:128-130`、`:362`）；G 追加也有两次连续验收和等效覆盖条件（`:178`）。长期保障没有随补坑删除而取消。

**P1 — `.handoff` 根镜像/成品隔离新保护未登记到 6.1。**

- 证据：`.handoff/选项方案.md:377` 新增“精确 `.handoff` 根纳入 maintainer 隔离，并补不泄露到成品的保护”，第 11 节 `:392` 也要求实施；但 6.1 `:165-178` 没有该规则的所属层、长期/补坑性质或删除条件。
- 风险：实现单若只按 6.1 执行，可能只把根检查修绿，而漏掉 `.handoff` 不得进入 12 成品的负例，或误用过宽排除规则。
- 建议改法：在 6.1 增加“根镜像仅精确排除维护器 `.handoff`，且任何 `.handoff` 路径不得进入成品”一行；主层为维护器静态 `check` 并由 full/milestone 继承，性质为长期。测试至少覆盖：根 `.handoff` 被允许且不进入输出、成品内注入 `.handoff` 失败、相似目录名不被误排除。若未来改根所有权模型，只能在有等效隔离保护并获批准后调整。

RESULT: PASS
