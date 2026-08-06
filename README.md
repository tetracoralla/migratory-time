# Migratory Time

**Migratory Time** 是 openAdam 的双语世界时钟与时区换算工具。正式名称保留 `Time`，让第一次看到的人也能立刻理解用途；紧凑位置可只显示 `Migratory`。

点击列表中任一地区的时间，直接键入完整日期时间，所有地区立即联动。页面只保留世界时钟、五个悬浮图标与必要反馈，不设置独立输入区或解释面板。

## 功能

- 默认显示北京、美东、美西、英国和中欧，可用左下角地球图标选择显示地区。
- 左下角语言图标切换中英文；英文主列表直接使用 CST、EDT、PDT、BST、CEST 等动态缩写。
- 点击任一时间行内编辑；输入 `YYYYMMDDHHmm` 时自动生成标准分隔符。
- `Enter` 校验并提交，`Esc` 取消；无效输入会保留编辑并阻止复制或切换，避免误用旧时间。
- 右下角分享、恢复到现在、复制所示时间；复制格式统一为 `PDT | 2026-08-04 21:13`。
- 分享会打开固定快照面板，可复制或下载带完整年份和 `Migratory Time · openAdam` 标记的 375px 移动端时间图片，也可复制链接；支持系统分享的设备会额外显示“更多”。
- 使用 IANA 时区和 Temporal，自动处理夏令时、重复时刻和不存在的当地时刻。
- 中文/英文和显示地区偏好只保存在当前浏览器，不需要账号、数据库或 AI 额度。
- 支持 PWA 安装和离线使用；现代浏览器优先使用原生 Temporal，旧浏览器动态加载兼容包。

## 在线与本地使用

- GitHub Pages：<https://tetracoralla.github.io/migratory-time/>
- 飞书妙搭：<https://wto1touj2p.feishuapp.com/app/app_17bgxtewh4w>

本地运行：

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

### 增加地区

在 `src/data/timeZones.ts` 的 `TIME_ZONES` 中加入中文名、英文名、IANA 时区、唯一 `shareCode` 和缩写映射。列表、UTC 偏移、编辑、地区选择、复制和分享链接会共用同一配置。

## 飞书云文档小组件

`addons/migratory-time-docs/` 是原生云文档正文小组件源码：一个组件代表一个时间节点，文档编辑者可直接修改任一地区时间，并用文档级模态框选择显示地区；每位查看者可独立切换语言。组件不读取或改写周围 PRD，也不调用 AI。

本地源码与构建已实现；真正上传前仍需用个人飞书身份创建 `appID` 与 `blockTypeID`。当前官方开发工具登录会落到乐森企业租户，因此没有把应用误建在公司名下。边界与继续方式见 [`docs/feishu-addon.md`](docs/feishu-addon.md)。

## 名称与许可

`Migratory Time` 表达候鸟跨区域迁徙与全球协作，也直接说明这是时间工具。`Migratory` 可用于图标、短标题和窄视口，但不作为脱离上下文的正式名称。

项目使用 [Apache License 2.0](LICENSE)。可复制、修改、分发和商用；再分发时需保留许可与 [NOTICE](NOTICE)。Apache-2.0 不自动授予品牌商标权。

Copyright 2026 openAdam.
