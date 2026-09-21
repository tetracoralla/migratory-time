# 发布与本地安装

## GitHub Pages

公开仓库：<https://github.com/tetracoralla/migratory-time>

正式网页：<https://tetracoralla.github.io/migratory-time/>

`.github/workflows/deploy-pages.yml` 会在 `main` 更新时执行测试、构建并发布 `dist/`。应用不依赖外部 CDN、数据库或服务器；React、时区计算与离线资源都进入构建产物。

GitHub Pages 是唯一正式网页入口。`check:deployments` 会逐个读取本地 `dist/`
文件，并确认线上对应文件的 SHA-256 完全一致；只检查入口 HTML 或页面可打开
不算发布完成。该命令还会从当前 Codex marketplace 列表解析 `personal` 插件源，
确认其文件清单和字节与仓库内独立插件包完全一致。

## Codex 插件发布验收

仓库内插件先通过可重定位包检查：

```bash
npm run check:plugin-package
```

它把完整插件复制到临时目录，通过包内 `.mcp.json` 启动 MCP，核对 9 个工具、
5 个 schema 资源和一次实际换算，然后删除临时副本。该结果证明包自洽，不能替代
marketplace 同步或真实安装。

项目侧首次启动另有独立检查：

```bash
npm run check:cold-start-mcp
```

它连续启动 12 个全新 MCP 进程，并要求初始化后的第一笔 `current_times` 调用成功，
同时记录启动到首笔结果的 p50、p95 和最大耗时。该检查定位插件 server 的进程边界，
不证明 Agent 会选中工具，也不证明 Agent Host 已激活当前版本。

仓库根目录本身是名为 `migratory-time` 的本地 marketplace。获得所有者授权后，
可以直接注册当前仓库并安装精确源码版本，不必先覆盖旧 `personal` 副本：

```bash
codex plugin marketplace add /Users/openadam/Development/tools-dev/migratory-time
codex plugin add migratory-time@migratory-time
```

运行中的旧任务不会热加载新的 Skill 或 MCP 工具。重新安装完成后运行：

```bash
npm run check:source-agent
npm run check:codex-plugin
```

前者把当前源码 MCP 挂入隔离的 fresh Codex 任务，验证 Agent 路由但不接触安装缓存；
后者默认要求 `migratory-time@migratory-time`。只有在明确验证另一个已配置
marketplace 时，才通过 `MIGRATORY_TIME_PLUGIN_MARKETPLACE` 指定其名称。

该检查会核对已安装插件版本与仓库版本、确认 `migratory_time` 已启用，并用
`gpt-5.6-luna` / `low` 启动全新的低成本临时 Codex 任务，验证当前时间、未来
换算、显式固定偏移、TimePlan 歧义、重复计划冲突、业务时限、业务计划重验证和
可用窗口。只有 Agent 自主选择正确领域工具、每题一次调用、得到预期结构结果，
且不使用 Web 或计算型 Shell 回退时才通过；检查仅允许 Codex 执行精确白名单内
的 Migratory Time Skill 定位或读取命令。独立 MCP 连接检查不能替代这一步。
若项目侧首次启动和 source-Agent 均通过，而安装态出现第一次 MCP 调用失败、重试
成功，按 [`diagnostics/2026-09-02-installed-codex-first-call.md`](diagnostics/2026-09-02-installed-codex-first-call.md)
交接，不在时间语义核心中猜测修复。

## 本地安装

```bash
npm ci
npm run local
```

打开 <http://127.0.0.1:4173/>，在 Chrome 或 Edge 中选择安装应用。首次成功加载后，PWA 可在无网络时继续换算与复制；清除浏览器站点数据后需要重新加载一次。

## 发布验收

1. 桌面和手机分别打开 HTTPS 地址，确认无横向滚动。
2. 修改任一地区时间，确认所有可见地区同步更新。
3. 输入无效日期后点击复制，确认编辑保留且剪贴板没有旧结果。
4. 输入夏令时重复时刻，完成“第 1 次/第 2 次”选择，确认此前的复制或切换动作继续执行。
5. 搜索并添加 Kathmandu、Paris 或 Chatham，关闭并重开后确认选择和顺序保留；复制、分享和重开新链接都只包含当前可见地区。
6. 切换中英文，确认时刻不变且主列表显示简短地点名，行内缩写与偏移随日期动态变化。
7. 成功在线打开一次后断网重启，确认仍可换算和复制。
8. 发布与 `personal` marketplace 同步后运行 `npm run check:deployments`，分别
   确认 GitHub Pages 与本地 `dist/`、个人 marketplace 插件与仓库插件逐文件一致。
9. 插件重新安装后运行 `npm run check:codex-plugin`，确认全新 Codex 任务实际调用领域工具，而不是 Web、Shell 或模型手算。
