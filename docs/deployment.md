# 发布与本地安装

## GitHub Pages

公开仓库：<https://github.com/tetracoralla/migratory-time>

正式网页：<https://tetracoralla.github.io/migratory-time/>

`.github/workflows/deploy-pages.yml` 会在 `main` 更新时执行测试、构建并发布 `dist/`。应用不依赖外部 CDN、数据库或服务器；React、时区计算与离线资源都进入构建产物。

GitHub Pages 是唯一正式网页入口。`check:deployments` 会逐个读取本地 `dist/` 文件，并确认线上对应文件的 SHA-256 完全一致；只检查入口 HTML 或页面可打开不算发布完成。

## Codex 插件发布验收

更新插件后必须使用插件缓存版本更新和重新安装流程；运行中的旧任务不会热加载新的 Skill 或 MCP 工具。重新安装完成后运行：

```bash
npm run check:codex-plugin
```

该检查会核对已安装插件版本与仓库版本、确认 `migratory_time` 已启用，并用 `gpt-5.6-luna` / `low` 启动全新的低成本临时 Codex 任务，以普通中英文用户请求分别验证当前时间、未来换算与显式固定偏移。只有 Agent 自主选择正确领域工具、每题一次调用、返回全球目标地区，且不使用 Web 或计算型 Shell 回退时才通过；检查仅允许 Codex 执行精确白名单内的 Migratory Time Skill 定位或读取命令。独立 MCP 连接检查不能替代这一步。

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
8. 发布后运行 `npm run check:deployments`，确认 GitHub Pages 与本地 `dist/` 逐文件一致。
9. 插件重新安装后运行 `npm run check:codex-plugin`，确认全新 Codex 任务实际调用领域工具，而不是 Web、Shell 或模型手算。
