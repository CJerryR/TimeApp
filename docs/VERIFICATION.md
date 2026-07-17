# TimeMate 验证记录

## 当前有效批次

| 项目 | 结果 |
| --- | --- |
| Run ID | `2026-07-10T23-07-33-106Z` |
| 验证日期 | 2026-07-11（Asia/Shanghai） |
| TypeScript typecheck | 通过 |
| 生产构建 | 通过 |
| Electron smoke | 通过 |
| Legacy contract | 104/104 |
| Visual | 22/22 |
| 总计 | 127/127 |
| 剩余失败项 | 0 |

总计 127 项由 Legacy 104 项、既有 Legacy 契约保持断言 1 项、Visual 22 项组成。Legacy 104 项内部包括 build 3 项、full 92 项和 persist 9 项。

## 复现命令

在 `desktop/` 目录执行。PowerShell 建议使用 `npm.cmd`，避免本机脚本执行策略影响 npm 启动器。

```powershell
npm.cmd ci
node --check scripts/smoke.mjs
npm.cmd run typecheck
npm.cmd run build
npm.cmd run smoke
```

CMD 等价命令：

```bat
npm ci
node --check scripts\smoke.mjs
npm run typecheck
npm run build
npm run smoke
```

`npm run smoke` 会再次执行构建，并运行 full、persist 与 visual 阶段。验证结果可由命令输出和本页摘要独立阅读；原始 JSON 是否上传不影响本页结论。

## 命令结果

| 命令 | 退出码 | 摘要 |
| --- | ---: | --- |
| `node --check scripts/smoke.mjs` | 0 | smoke 驱动语法检查通过 |
| `npm.cmd run typecheck` | 0 | TypeScript 无错误 |
| `npm.cmd run build` | 0 | Electron main 与 Vite renderer 生产构建通过 |
| `npm.cmd run smoke` | 0 | build、full、persist、visual 全部完成 |

非阻塞输出：

- npm 提示旧式 Electron mirror 配置将在下一 npm major 停止支持。
- Electron 输出 Windows network change notifier `10108`。
- 两项均未造成退出码或断言失败。

## Legacy 104/104 覆盖范围

### 构建与资源

- 生产构建目录存在，构建文件数量与体积检查通过。
- 活动像素资产数量、体积和单项小于 1 MiB 检查通过。
- 构建产物中的 Live2D、Layered2D 和旧角色资源违规数为 0。

### 主窗口与本地数据

- 主 renderer shell、根节点与窗口标题正常。
- 创建任务、创建日程、创建记忆、更新设置和聊天消息流程通过。
- JSON 导出包含完整快照，导出/导入往返、聊天往返与任务类型往返通过。
- 私人模式、本地 fallback、敏感内容本地处理、脱敏和 `neverMention` 排除通过。

### 规划与日历

- 任务与日程创建、删除、状态更新通过。
- 日、周、月、年四种日历视图及其导航、今日、选中日期、农历、日程块和检查面板通过。
- 桌面与移动规划截图生成通过。

### 2D 像素桌宠

- 桌宠窗口仅渲染一个 `pixel-sprite` 图像节点，无 canvas 或 legacy 节点。
- 原始帧尺寸 48×64，像素化渲染与视口内布局通过。
- 8 种状态与 3 种位置帧契约通过。
- 点击、拖动、双击打开主窗口、右键菜单、隐藏/显示、缩放、任务栏停靠和自由位置保存通过。
- 专注、任务完成、待确认、担心、睡眠和庆祝保持时间等业务状态联动通过。
- 桌宠交互区域中心可点击、透明角不响应的命中区域契约通过。

### Persist 9/9

跨 Electron 重启后，以下内容保持：

- 任务及任务类型
- 日程
- 记忆
- 用户聊天消息与桌宠回复
- 设置与桌宠设置
- AI 审计记录

## Visual 22/22 覆盖范围

### 页面与视口矩阵

- 六页覆盖：当前、对话、规划、记忆、接入、设置。
- 桌面配置：1180×780、浅色主题、正常动效。
- 窄窗口配置：420×900、深色主题、减弱动效。
- 每个样本保持单一可见页面、单一活动导航项，无文档横向溢出。

### 响应式与日历

- 420px 规划页中周五、周六、周日均可达。
- 月历内部无横向溢出，完整七列保持可见。
- smoke 允许窄窗口测试边界；生产主窗口正常最小宽度仍为 920px。

### 动画与可访问性

- 空间动画不超过 280ms。
- 正常动效样本存在、会启动并最终稳定。
- 减弱动效样本存在，首帧为 `opacity: 1`、`transform: none`、无页面动画。
- 快速页面切换保持单页面；快速弹层切换保持单对话框与单遮罩。

### 液态玻璃集成

- 浅色与深色主题均被覆盖。
- 动效令牌存在并被读取。
- 首页连续舞台背景通过，已移除右半区域贯穿全高的硬分割。
- 记忆页保持单一主操作，设置页保持单层工作区。
- `window-seat` 模式下主窗口与独立桌宠窗口遵守单角色唯一性契约。

## 截图与透明窗口边界

有效批次生成了六页桌面截图、六页窄窗口截图、正常/减弱动效采样截图，以及主窗口、桌宠窗口和规划页截图。

桌宠 smoke 窗口在测试模式下使用 `transparent: false` 和不透明深色背景，因此捕获 PNG 的 alpha 已被合成。该截图可验证：

- 像素角色实际渲染
- 角色尺寸与帧选择
- placement 与单角色唯一性
- 点击命中区域

该截图不能验证生产模式 `transparent: true` 时，Windows 桌面 compositor 的真实透出效果。源像素帧本身的逐像素检查确认：24 张 PNG 只有 alpha 0 或 255、没有半透明像素、四角均透明；这与生产透明窗口合成验证是两个不同层面。

## 证据边界

- 本页把 `2026-07-10T23-07-33-106Z` 作为当前接受的有效基线，不把目录中的其他历史产物自动视为发布证据。
- 独立 full、persist、visual JSON 是同一 smoke 批次的阶段结果；测试事实以 aggregate 及其阶段内容为准。
- 当前若干运行时文件已经与该批次报告记录的源码哈希不同，因此 127/127 应理解为该批次对应快照的验证结果，而不是对所有后续未提交变化的自动认证。
- README、CHANGELOG 和本页等纯文档修改不改变运行时；正式发布前仍应对最终拟提交源码重新执行完整命令并更新有效 Run ID。
