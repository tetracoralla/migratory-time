# Migratory Time

**Migratory Time** 是 openAdam 的双语世界时钟与时区换算工具。正式名称保留 `Time`，让第一次看到的人也能立刻理解用途；紧凑位置可只显示 `Migratory`。

点击列表中任一地区的时间，直接键入完整日期时间，所有地区立即联动。页面只保留世界时钟、悬浮操作与必要反馈，不设置独立输入区或解释面板。

## 功能

- 默认显示北京、美东、美西、英国和中欧；地区选择器可按城市、国家、地区名或 IANA 标识搜索全球时区，最多保留 20 个有序地区。
- 左下角语言图标切换中英文；主列表使用简短地点名（如 China、Paris、加德满都），动态缩写保留在换算详情、复制文本和分享图中。
- 点击任一时间行内编辑；输入 `YYYYMMDDHHmm` 时自动生成标准分隔符。
- `Enter` 校验并提交，`Esc` 取消；无效输入会保留编辑并阻止复制或切换，避免误用旧时间。
- 右下角分享、恢复到现在、复制所示时间；复制格式统一为 `PDT | 2026-08-04 21:13`。
- 分享会打开固定快照面板，可复制或下载带完整年份和 `Migratory Time · openAdam` 标记的 375px 移动端时间图片，也可复制链接；支持系统分享的设备会额外显示“更多”。
- 使用 IANA 时区和 Temporal，支持 UTC、`UTC-5` 类显式固定偏移、整点、半小时和 15/45 分钟地区偏移，自动处理夏令时、重复时刻和不存在的当地时刻。
- 支持 1901 年及之后的日期，避免早期 IANA 秒级历史偏移在分钟界面中被静默截断。
- 中文/英文和显示地区偏好只保存在当前浏览器，不需要账号、数据库或 AI 额度。
- 支持 PWA 安装和离线使用；现代浏览器优先使用原生 Temporal，旧浏览器动态加载兼容包。

## 在线与本地使用

在线使用：<https://tetracoralla.github.io/migratory-time/>

本地运行：

需要 Node.js 20.19+（或 22.12+）。本仓库是 GitHub 源码与 Codex 插件项目，`private: true` 会阻止误发到 npm。

```bash
npm ci
npm run local
```

然后打开 <http://127.0.0.1:4173/>。Chrome 或 Edge 可把页面安装成独立桌面应用。发布与离线验收详见 [`docs/deployment.md`](docs/deployment.md)。

## 开发与验证

```bash
npm ci
npm test
npm run build
npm run dev
```

## Agent 与 Codex Plugin

仓库同时提供一个只读、无需账号的本地 MCP 服务和 Codex Plugin。Agent 不再自行推算 UTC 偏移，而是调用与网页共用同一地区配置和换算核心的确定性工具：

- `convert_time`：按来源地区换算指定日期时间；城市、国家、地区名和 IANA 标识可直接使用，遇到夏令时重复时刻会返回前后两个候选，不擅自选择。
- `current_times`：返回同一瞬间下最多 20 个地区的当前时间；普通无歧义地点一次调用完成。
- `search_time_zones`：在明确探索或名称无法唯一解析时，有界返回最多 10 个候选及当前偏移。
- `list_time_zones`：以游标分页浏览规范 IANA 注册表，每次最多 50 项，不一次倾倒完整目录。

工具会同时返回结构化结果、可直接粘贴的专业格式和网页分享链接。插件源码位于 `plugins/migratory-time/`，其中的薄 Skill 只负责引导 Agent 何时调用工具以及如何处理重复或不存在的当地时刻；准确结果由 MCP 中的共享程序逻辑产生。

本地验证：

```bash
npm run typecheck:mcp
npm run check:mcp
```

本地插件通过个人市场安装时，个人市场中的 `migratory-time` 源码必须与本仓库的 `plugins/migratory-time/` 完全相同。每次更新先重新构建 MCP，再按 Codex 的本地插件更新流程写入单一 cachebuster、同步到个人市场源码并重新安装；刷新 Codex 后，应在新会话中同时看到 Skill 和四个领域工具。

### 时区数据与产品别名

全球规范标识、IANA 链接、国家和主要城市来自 `@vvo/tzdb`；运行时偏移由 Temporal/Intl 的 IANA 数据计算。`src/data/timeZones.ts` 只保留默认五区、旧分享短码和稳定显示兼容，常用中文别名位于共享注册表。产品不会用模型猜测地点或固定偏移。

## 暂缓的飞书云文档小组件

`addons/migratory-time-docs/` 仅保留此前的原型源码。由于真正使用需要飞书租户、应用、管理员和平台审核对接，当前明确搁置，不属于 2.0 的构建、验收或发布范围；恢复条件见 [`docs/feishu-addon.md`](docs/feishu-addon.md)。

## 名称与许可

`Migratory Time` 表达候鸟跨区域迁徙与全球协作，也直接说明这是时间工具。`Migratory` 可用于图标、短标题和窄视口，但不作为脱离上下文的正式名称。

项目使用 [Apache License 2.0](LICENSE)。可复制、修改、分发和商用；再分发时需保留许可与 [NOTICE](NOTICE)。Apache-2.0 不自动授予品牌商标权。

Copyright 2026 openAdam.
