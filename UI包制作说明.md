# 主题包制作说明（通用版）

## 1. 主题包是什么

主题包是一个 JSON 文件，通过**覆盖 CSS 变量**来改变应用的界面外观。
未指定的变量保持内置默认值，因此只需写入你关心的部分即可。

```json
{
  "id": "my-theme-id",
  "name": "我的主题",
  "description": "一句话描述",
  "light": {
    "--theme-color": "#3b82f6",
    "--bg-base": "#eef0f4"
  },
  "dark": {
    "--theme-color": "#818cf8",
    "--bg-base": "#090b10"
  }
}
```

| 字段 | 必填 | 说明 |
|------|------|------|
| `id` | ✅ | 唯一标识，决定存储文件名（导入同 id 会覆盖旧包） |
| `name` | ✅ | 列表中显示的名称 |
| `description` | - | 简介 |
| `light` / `dark` | 至少一个 | 浅色 / 深色模式各自的变量覆盖表 |

## 2. 可编辑变量总表

### 主题色
| 变量 | 作用 | light 默认 | dark 默认 |
|------|------|-----------|-----------|
| `--theme-color` | 核心色，一切强调色的源头 | `#3b82f6` | `#3b82f6` |
| `--theme-accent-hover` | 悬停强调色 | `color-mix(in srgb, var(--theme-color) 85%, black)` | `color-mix(in srgb, var(--theme-color) 88%, white)` |
| `--theme-accent-muted` | 弱化强调色 | `color-mix(in srgb, var(--theme-color) 70%, white)` | `color-mix(in srgb, var(--theme-color) 70%, black)` |
| `--accent-light` | 亮色强调 | `color-mix(in srgb, var(--theme-color) 70%, white)` | `#60a5fa` |

### 背景层级
| 变量 | 作用 | light 默认 | dark 默认 |
|------|------|-----------|-----------|
| `--bg-base` | 窗口最底层背景 | `#eef0f4` | `#090b10` |
| `--bg-surface` | 卡片 / 面板表面 | `#ffffff` | `rgba(22, 25, 33, 0.66)` |
| `--bg-elevated` | 弹窗、下拉等升起面板 | `#ffffff` | `rgba(30, 34, 44, 0.85)` |
| `--bg-hover` | 悬停态背景 | `rgba(20, 30, 50, 0.06)` | `rgba(255, 255, 255, 0.06)` |
| `--bg-input` | 输入框背景 | `#ffffff` | `#12151c` |

### 玻璃材质（`.glass` / `.glass-panel`）
| 变量 | 作用 | light 默认 | dark 默认 |
|------|------|-----------|-----------|
| `--glass-bg` | 玻璃面板底色 | `#ffffff` | `rgba(24, 28, 38, 0.58)` |
| `--glass-bg-strong` | 强玻璃（侧栏、模态框） | `#ffffff` | `rgba(28, 32, 43, 0.82)` |
| `--glass-border` | 玻璃描边 | `rgba(20, 30, 50, 0.08)` | `rgba(255, 255, 255, 0.09)` |
| `--glass-highlight` | 顶部内高光 | `rgba(255, 255, 255, 0.5)` | `rgba(255, 255, 255, 0.12)` |
| `--glass-shadow` | 玻璃投影（可多层） | `0 8px 32px rgba(31,45,74,0.12), 0 1.5px 6px rgba(31,45,74,0.08)` | `0 12px 40px rgba(0,0,0,0.45), 0 2px 8px rgba(0,0,0,0.3)` |

### 边框与发光
| 变量 | 作用 | light 默认 | dark 默认 |
|------|------|-----------|-----------|
| `--border-DEFAULT` | 默认边框 | `rgba(20, 30, 50, 0.1)` | `rgba(255, 255, 255, 0.1)` |
| `--border-subtle` | 细微分割线 | `rgba(20, 30, 50, 0.06)` | `rgba(255, 255, 255, 0.06)` |
| `--border-hover` | 悬停边框 | `rgba(20, 30, 50, 0.18)` | `rgba(255, 255, 255, 0.2)` |
| `--glow-color` | 按钮发光、聚焦光晕 | `color-mix(in srgb, var(--theme-color) 38%, transparent)` | `color-mix(in srgb, var(--theme-color) 55%, transparent)` |

### 文字
| 变量 | 作用 | light 默认 | dark 默认 |
|------|------|-----------|-----------|
| `--text-primary` | 标题、正文 | `#141c2b` | `#f2f4f8` |
| `--text-secondary` | 描述文字 | `#5a6472` | `#a3aab8` |
| `--text-muted` | 占位、提示文字 | `#9aa3af` | `#646b78` |

### 极光环境光
| 变量 | 作用 | light 默认 | dark 默认 |
|------|------|-----------|-----------|
| `--orb-1` | 极光球 1（跟随主题色） | `color-mix(in srgb, var(--theme-color) 34%, transparent)` | `color-mix(in srgb, var(--theme-color) 30%, transparent)` |
| `--orb-2` | 极光球 2（青色） | `rgba(56, 189, 248, 0.26)` | `rgba(34, 211, 238, 0.13)` |
| `--orb-3` | 极光球 3（紫色） | `rgba(168, 130, 255, 0.22)` | `rgba(147, 96, 255, 0.16)` |

### 动效缓动
| 变量 | 作用 | 默认 |
|------|------|------|
| `--ease-ios` | iOS 标准缓动 | `cubic-bezier(0.32, 0.72, 0, 1)` |
| `--ease-out-expo` | Expo 缓出 | `cubic-bezier(0.16, 1, 0.3, 1)` |
| `--ease-out-quart` | Quart 缓出 | `cubic-bezier(0.25, 1, 0.5, 1)` |

### 3D 变换与光照（进阶）
| 变量 | 作用 | 默认 |
|------|------|------|
| `--perspective` | 透视距离 | `1000px` |
| `--perspective-origin` | 透视原点 | `center` |
| `--transform-style` | 子元素 3D 渲染 | `preserve-3d` |
| `--backface-visibility` | 背面可见性 | `hidden` |
| `--rotate-x / --rotate-y / --rotate-z` | 各轴旋转角度 | `0deg` |
| `--translate-z` | Z 轴位移 | `0px` |
| `--card-tilt-x / --card-tilt-y` | 卡片悬停倾斜 | `2deg` / `-2deg` |
| `--depth-shadow` | 3D 层级投影 | light: `0 4px 8px rgba(31,45,74,0.12), 0 8px 16px rgba(31,45,74,0.08)` / dark: `0 4px 8px rgba(0,0,0,0.3), 0 8px 16px rgba(0,0,0,0.2)` |
| `--light-color` | 3D 表面高光颜色 | `rgba(255,255,255,0.15)` |
| `--light-angle` | 光照角度 | `135deg` |
| `--light-intensity` | 高光强度系数 | `0.15` |
| `--ambient-light` | 环境填充光 | `rgba(255,255,255,0.05)` |
| `--edge-highlight` | 边缘高光色 | `rgba(255,255,255,0.3)` |
| `--edge-highlight-size` | 边缘高光宽度 | `1px` |

## 3. 核心设计技巧

### 3.1 透明度（玻璃透明感）

半透明颜色用 `rgba(r, g, b, alpha)`，alpha 越大越不透明。

```
背景   alpha 0.10  →  90% 透明
组件   alpha 0.25  →  75% 透明（比背景少 15% 透明度）
强玻璃 alpha 0.35  →  65% 透明（侧栏、模态框更稳）
```

层级经验：**背景最透，面板略实，弹窗/模态更实**，逐层递进形成空间感。

### 3.2 立体玻璃 = 多层阴影 + 内高光

```css
--glass-shadow: 0 1px 2px rgba(0,0,0,0.25),   /* 贴近：接地感 */
                0 8px 24px rgba(0,0,0,0.30),  /* 中层：体积感 */
                0 24px 64px rgba(0,0,0,0.35); /* 远处：悬浮感 */
--glass-highlight: rgba(255,255,255,0.18);    /* 顶部内高光：光照方向 */
```

该组合被 `.glass-panel` 消费：`box-shadow: var(--glass-shadow), inset 0 1px 0 var(--glass-highlight)`。

### 3.3 跟随主题色

`color-mix(in srgb, var(--theme-color) N%, black/white/transparent)`
可实现"改一个 `--theme-color` 联动全局"的效果，无需写死色值。

## 4. 玻璃效果的底层机制

窗口本身透明（主进程 `transparent: true`），玻璃感来自 CSS：

```css
.glass {
  background: var(--glass-bg);                /* 半透明底色 */
  backdrop-filter: blur(12px) saturate(130%); /* 模糊 + 增饱和，透出桌面/背景 */
}
```

要点：背景必须半透明，backdrop-filter 才有东西可模糊。

## 5. 如何导入使用

1. 打开 **设置 → 外观**
2. 找到 **自定义主题包** → 点击 **导入主题包**
3. 选择你的 `.json` 文件
4. 在列表中点击主题包右侧的 ✓ 应用（再次点击取消）

## 6. 常见调整对照

| 想达到的效果 | 修改方式 |
|--------------|----------|
| 换主色调 | 改 `--theme-color`，其他 `color-mix` 变量自动跟随 |
| 背景更透 / 更实 | 改 `--bg-base` 的 alpha |
| 全局玻璃化 | 把 `--bg-surface` / `--bg-elevated` 改为半透明 rgba |
| 玻璃更立体 | 加大 `--glass-shadow` 中层/远层的 alpha 或模糊半径 |
| 玻璃更亮 | 提高 `--glass-highlight` 的 alpha |
| 只换文字色 | 改 `--text-primary` / `--text-secondary` / `--text-muted` |
| 去掉环境光 | 删除 `--orb-*` 相关行（回退默认值） |

> 小技巧：把主题包导入后，可用设置里的**可视化主题编辑器**继续微调，二者互不冲突（编辑器变量优先于主题包）。
