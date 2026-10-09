# ximo-OS 开机动画（品牌层）

## 它出现在哪里

**控制台，不是图形屏幕。** 这是由架构决定的，不是妥协：

| 环境 | "控制台"实际是什么 |
|---|---|
| QEMU TCG（CI/验收） | 串口 `hvc0`（`-nographic`，CI 直接读它） |
| 裸机 | `tty1` |
| 云主机 | 串口控制台 |

为什么没有图形开机动画：ximo-OS 是 **headless-first** 架构 —— QEMU 以 `-nographic`
启动，桌面是 **Xvfb（纯内存帧缓冲，不接任何显示设备）**。物理/图形屏幕上没有东西
可画，所以走控制台通路。要做图形化动画需要另加 plymouth + DRM/KMS 显示栈。

## 视觉设计

| 元素 | 取值 | 依据 |
|---|---|---|
| 主色 | `#6366f1` | 驾驶舱默认 `themeColor`（`src/shared/defaults.ts`），与 App 一致 |
| 亮档/脉冲峰值 | `#a5a8ff` | 主色提亮，用于焦点圆点脉冲峰值 |
| 暗档 | `#484aaa` | 起手"未点亮"态 |
| 动效 | 块字自上而下逐行点亮（暗→主→亮）+ 焦点圆点脉冲 | 圆点是 ximo 图标家族的**签名元素**（见 `icons/ximo` 设计规范） |
| 节奏 | 约 0.5s 总时长，每帧 45ms | 绝不成为启动瓶颈（启动目标 ≤2min，动画占 <1%） |
| 版式 | 字标 + 定调行 + 等宽分隔线 | 与字标等宽，形成规整版式 |

## 设计纪律

1. **不声明任何假状态**（AGENTS.md §5 禁模拟数据）：动画只输出品牌视觉，**不打印
   "服务已启动""端口就绪"**之类文案。真实状态由 systemd 权威输出（journal 里的
   `[ OK ] Started ...`）。
2. **零阻塞**：不 `sleep` 等待任何真实事件。
3. **CI 兼容**：只用「逐行追加 + 行内回车脉冲」，**不清屏、不上移光标**——CI 靠
   grep 串口日志提取 agent-hostd 令牌，清屏会破坏日志。动画文本不含 `token = ` 字样。

## 关闭方式

```bash
# 内核命令行加参数（脚本自身会读）
ximo.splash=0
```

生产/调试环境推荐关闭，让控制台直接显示内核与服务日志。

## 相关文件

| 文件 | 作用 |
|---|---|
| `os/mkosi/provision/ximo-os-splash.sh` | 动画脚本（品牌层） |
| `os/mkosi/provision/ximo-splash.service` | systemd 单元（`sysinit.target`，服务之前露出） |
| `os/scripts/build-image.sh` | 归集到镜像覆盖树 |
| `.github/workflows/ximo-os-image.yml` | CI 断言「品牌画面必须出现」 |

## 验证

CI 的 QEMU 冒烟会断言 `ximo-OS` 出现在串口日志中（`grep -q 'ximo-OS'`）——
这是**可失败的硬断言**，不是装饰（本项目有过「断言从未真正执行」的教训）。
