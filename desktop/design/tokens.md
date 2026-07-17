# TimeMate 液态玻璃设计令牌 v3

> 唯一实现来源：`src/renderer/styles/tokens.css`。组件应引用语义 Token，不直接写颜色、模糊、阴影与圆角数值。

## 1. 设计方向

TimeMate 使用克制的 iOS 液态玻璃语言：环境背景提供可被玻璃采样的颜色，玻璃通过透明度、模糊、饱和度、边缘高光与阴影共同表达空间层级。浅色主题是冷调日光蓝灰，深色主题是石墨蓝黑；两种主题都使用系统蓝作为唯一主操作色。

不要把所有容器做成玻璃。信息、数据、聊天记录和设置主体属于内容层，保持 92%–96% 不透明且不做背景模糊；导航、紧凑控件和临时浮层才属于玻璃层。层级越靠前，材质隔离和投影越强；尺寸越小，边缘高光越清晰。

## 2. 环境与主题色

| Token | 浅色 | 深色 | 用途 |
| --- | --- | --- | --- |
| `--bg` | `#e8eef5` | `#0b1118` | 不支持渐变时的窗口底色 |
| `--bg-top` | `#f4f8fc` | `#121c27` | 环境渐变顶部 |
| `--bg-bottom` | `#dce6f1` | `#080c12` | 环境渐变底部 |
| `--ambient-primary` | 蓝色光晕 | 蓝色光晕 | 主环境光 |
| `--ambient-secondary` | 紫色光晕 | 紫色光晕 | 次环境光 |
| `--ambient-warm` | 暖色微光 | 暖色微光 | 平衡冷色背景 |
| `--ambient-background` | 三层径向渐变 + 纵向渐变 | 同左 | 页面环境背景，可直接用于 `background` |

## 3. 三层界面与五种语义材质

界面固定分为三层：

1. **内容层**：页面主体、卡片、表格和消息，使用 `--content-surface` / `--content-surface-muted`，不使用 `backdrop-filter`。
2. **玻璃控制层**：侧栏、移动端导航、紧凑按钮、Chip 和分段器。
3. **浮层**：Sheet、Popover、Toast 和菜单；使用更强 tint 与分离阴影，但模糊上限为 24px。

组件只映射到 `bar`、`control`、`panel`、`popover`、`prominent` 五种语义角色，不为单个组件发明新的强度。

| 层级 | 表面 Token | 模糊 / 饱和度 | 使用位置 |
| --- | --- | --- | --- |
| 导航玻璃 | `--glass-nav` | `--glass-blur-nav` / `--glass-saturation-nav` | 侧栏、顶部导航 |
| 内容表面 | `--content-surface` | 无模糊 | 页面、卡片、主要信息区 |
| 控件玻璃 | `--glass-control` | `--glass-blur-control` / `--glass-saturation-control` | 紧凑按钮、分段器、Chip |
| 浮层玻璃 | `--glass-overlay` | `--glass-blur-overlay` / `--glass-saturation-overlay` | Sheet、Popover、Toast、菜单 |

`--glass-stage` 仅作为旧页面兼容表面，不应新增使用。技能资产的 `18px` 基础模糊、`24px` 强模糊、`1.35` 饱和度和 `12/18/26/999px` 圆角已映射为 `--glass-*` 语义 Token。每种玻璃角色都有 `*-solid` 后备色，供降透明度或不支持 `backdrop-filter` 的环境使用。

边缘与空间 Token：

- `--glass-border` / `--glass-border-strong`：普通与前景玻璃边框。
- `--edge-highlight` / `--edge-highlight-strong`：玻璃上沿高光与内侧折射。
- `--shadow-glass`：内容玻璃悬浮阴影。
- `--shadow-control`：小控件阴影。
- `--shadow-float`：Sheet、Popover 等前景浮层阴影。
- `--glass-blur` / `--glass-blur-strong`：技能资产的 18px / 24px 光学基线。
- `--glass-role-bar-blur` / `--glass-role-control-blur` / `--glass-role-popover-blur`：组件应使用的角色别名。

材质组合示例：

```css
.example-navigation {
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-card);
  background: var(--glass-nav);
  box-shadow: var(--edge-highlight), var(--shadow-glass);
  backdrop-filter: blur(var(--glass-role-bar-blur)) saturate(var(--glass-saturation-nav));
}
```

## 4. 文本与状态色

| Token | 角色 |
| --- | --- |
| `--label-1` | 主标题、关键数据 |
| `--label-2` | 正文、次级信息 |
| `--label-3` | 辅助说明、元数据 |
| `--label-4` | 禁用、占位符 |
| `--accent` | 唯一主操作、选中态 |
| `--accent-text` | 浅色表面上的强调文字 |
| `--accent-soft` / `--accent-soft-strong` | 轻选中与强选中底色 |
| `--positive` | 成功、已完成 |
| `--warning` | 注意、即将到期 |
| `--critical` | 错误、删除、严重逾期 |
| `--late` | 深夜、延后语义 |

每个状态色都有对应 `*-soft` 背景。禁止使用状态色装饰普通界面。

## 5. 圆角与同心规则

| Token | 值 | 使用位置 |
| --- | --- | --- |
| `--radius-control` | `14px` | 按钮、小控件 |
| `--radius-field` | `16px` | 输入框、分段器 |
| `--radius-card` | `22px` | 卡片、Toast |
| `--radius-sheet` | `30px` | Sheet、大型浮层 |
| `--radius-pill` | `999px` | Chip、Switch、胶囊按钮 |

嵌套组件遵循同心圆角：`内圆角 = 外圆角 - 内边距`。不要再使用统一 6–8px 小圆角，也不要用 `50%` 代替非圆形胶囊。

## 6. 字体与间距

字体栈优先采用 SF Pro，Windows 回退到 Segoe UI 与苹方/微软雅黑。现有文字层级保持：

- `--text-large-title`：页面大标题。
- `--text-title` / `--text-title-3`：主信息与卡片标题。
- `--text-headline`：分节标题。
- `--text-body` / `--text-body-strong`：正文。
- `--text-callout` / `--text-footnote` / `--text-caption`：说明、元信息与标签。

间距使用 `--space-1` 至 `--space-8` 的 4px 基础网格。

## 7. 动效

| Token | 值 | 用途 |
| --- | --- | --- |
| `--ease-standard` | `cubic-bezier(0.32, 0.72, 0, 1)` | 常规状态与位移 |
| `--ease-emphasized` | `cubic-bezier(0.22, 1, 0.36, 1)` | 页面进入、重点展开 |
| `--ease-spring` | `cubic-bezier(0.34, 1.38, 0.64, 1)` | 按压回弹、浮层到位 |
| `--dur-press` | `100ms` | 按下反馈 |
| `--dur-fast` | `150ms` | Hover、颜色变化 |
| `--dur-state` | `220ms` | 选中、开关状态 |
| `--dur-base` | `260ms` | 常规组件变化 |
| `--dur-sheet` / `--dur-slow` | `420ms` | Sheet 与大范围过渡 |

动效只改变透明度、变换、滤镜与颜色，避免触发布局抖动。系统启用减少动态效果时，应由全局 motion 样式关闭位移与弹性。

## 8. 兼容与验收规则

1. 新组件必须使用语义角色 Token；旧变量暂时保留，迁移完成前不可删除。
2. 浅色与深色主题必须同时检查文字对比、边缘可见性和浮层隔离。
3. 模糊必须有环境背景可采样；纯色背景上的透明白块不算液态玻璃。
4. 所有主交互必须有默认、Hover、Active、Focus、Disabled 状态。
5. 不支持 `backdrop-filter` 时必须回退到对应的 `*-solid` 表面。
6. `data-reduce-transparency`、`prefers-reduced-transparency`、`prefers-contrast: more` 和 `forced-colors` 必须保持同一信息层级、清晰焦点和可辨选中态。
7. 禁止内容面、大输入区、滚动区域以及 blur 祖先内的子控件再次模糊；每个导航区域最多一个 blur 表面。
