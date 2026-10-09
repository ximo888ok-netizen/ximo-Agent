#!/bin/bash
# ximo-OS 开机动画 —— 品牌层（控制台/串口）
#
# ══ 设计约束（务必先读，改之前先想清楚为什么这样写）══
#  1. **输出目标是控制台，不是图形屏幕**。ximo-OS 是 headless 架构：QEMU 以
#     -nographic 启动、桌面是 Xvfb（纯内存帧缓冲，不接任何显示设备）。物理/图形
#     屏幕上不会出现任何东西；真实可见的通路只有 /dev/console（QEMU=串口 hvc0、
#     裸机=tty1、云主机=串口控制台）。要图形化必须另加 plymouth + DRM/KMS 栈。
#  2. **零阻塞**：总耗时约 0.5s，且**不 sleep 等待任何真实事件**。开机动画绝不能
#     成为启动瓶颈（本项目启动目标 ≤2min 内 ready，动画占其中 <1%）。
#  3. **不声明任何假状态**（AGENTS.md §5 禁模拟数据）：本脚本只输出**品牌视觉**，
#     不打印 "服务已启动/端口就绪" 之类文案 —— 真实状态由 systemd 自己打印
#     （journal 里那些 [ OK ] Started ... 就是权威来源）。
#  4. **CI 兼容**：只用「逐行追加 + 行内回车脉冲」，**不清屏、不上移光标**。
#     CI 靠 grep 串口日志提取 agent-hostd 令牌（`token = `），清屏/光标控制会
#     破坏日志可读性。ANSI 色彩码不影响按行 grep。
#
# 关闭方式：内核命令行加 `ximo.splash=0`（生产/调试环境推荐），或删除本文件。
set -u

CONSOLE=/dev/console

# 内核 cmdline 开关 —— 裸机演示时现场可关
if grep -q 'ximo\.splash=0' /proc/cmdline 2>/dev/null; then
  exit 0
fi
# 控制台不可写（被重定向/管道）时保持安静，避免污染数据流
[ -w "$CONSOLE" ] || exit 0

# ── 品牌色板（主色 #6366f1 = 驾驶舱默认 themeColor，保持与 App 一致）──
c_dim=$'\033[38;2;72;74;170m'    # 暗档：起手"未点亮"
c_main=$'\033[38;2;99;102;241m'  # 主色 #6366f1
c_glow=$'\033[38;2;165;168;255m' # 亮档：焦点/脉冲峰值
c_soft=$'\033[38;2;124;127;214m' # 次级文案
c_reset=$'\033[0m'

out() { printf '%s\n' "$1" > "$CONSOLE"; }
out_raw() { printf '%s' "$1" > "$CONSOLE"; }
# 逐帧节奏 —— 极短，只用于制造"点亮"感，不做等待
tick() { sleep 0.045; }

# ── 字标：六行块字，自上而下逐行"点亮"（暗 → 主色 → 亮）──
banner=(
'██╗  ██╗██╗███╗   ███╗ ██████╗ '
'╚██╗██╔╝██║████╗ ████║██╔═══██╗'
' ╚███╔╝ ██║██╔████╔██║██║   ██║'
' ██╔██╗ ██║██║╚██╔╝██║██║   ██║'
'██╔╝ ██╗██║██║ ╚═╝ ██║╚██████╔╝'
'╚═╝  ╚═╝╚═╝╚═╝     ╚═╝ ╚═════╝ '
)

out ''
i=0
for row in "${banner[@]}"; do
  # 颜色随行号推进：暗 → 主 → 亮，形成自上而下的点亮带
  case $i in
    0|1) col=$c_dim ;;
    2|3) col=$c_main ;;
    *)   col=$c_glow ;;
  esac
  out "${col}${row}${c_reset}"
  tick
  i=$((i + 1))
done

# ── 焦点圆点脉冲（家族签名：焦点圆点，见 icons/ximo 设计规范）──
# 行内回车刷新 —— 只影响这一行，不移动光标、不清屏。
# 注意：out_raw 用 printf '%s'（不解释转义），故回车/换行必须写成 $(printf '\r')
# 非交互输出（管道/日志重定向）时回车不会覆盖 → 退化为只画一帧，保持日志干净
out ''
if [ -t 1 ]; then
  out_raw "  "
  for frame in "$c_dim" "$c_main" "$c_glow" "$c_main"; do
    out_raw "$(printf '\r')  ${frame}◉${c_reset}"
    tick
  done
  out_raw "$(printf '\r')  ${c_glow}◉${c_reset} ${c_main}ximo-OS${c_reset} ${c_soft}0.1${c_reset}"
else
  out_raw "  ${c_glow}◉${c_reset} ${c_main}ximo-OS${c_reset} ${c_soft}0.1${c_reset}"
fi
out ''

# ── 定调一句话 + 分隔线（分隔线宽度与字标等宽，形成规整版式）──
out "  ${c_soft}Agent-Native Linux · headless-first${c_reset}"
out "  ${c_dim}──────────────────────────────────────────${c_reset}"
out ''

exit 0
