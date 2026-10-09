#!/usr/bin/env bash
# ximo-OS 镜像构建编排 — 在 WSL Debian / 任意 Debian 系 Linux 中运行
# 用法：bash os/scripts/build-image.sh
# 前置：Windows 侧已跑 npm run host:build（产出 dist-host/agent-hostd.cjs）
set -euo pipefail

REPO_ROOT="${XIMO_REPO:-$(cd "$(dirname "$0")/../.." && pwd)}"
STAGE="$REPO_ROOT/os/mkosi/artifacts"

echo "[1/5] 前置检查"
test -f "$REPO_ROOT/dist-host/agent-hostd.cjs" || {
  echo "  ✗ 缺少 dist-host/agent-hostd.cjs — 先在 Windows 侧执行 npm run host:build"; exit 1
}
command -v mkosi >/dev/null || {
  echo "  ✗ 未安装 mkosi — 执行: sudo apt-get update && sudo apt-get install -y mkosi"; exit 1
}
command -v qemu-img >/dev/null || echo "  ⚠ 未安装 qemu-utils（转 VHDX 需要）：sudo apt-get install -y qemu-utils"

echo "[2/5] 归集主机运行时产物 → 镜像覆盖树"
# service 文件兼容两种布局：完整仓库（src/host/deploy）或精简构建树（os/mkosi/provision）
SERVICE_SRC=""
for cand in "$REPO_ROOT/src/host/deploy/agent-hostd.service" "$REPO_ROOT/os/mkosi/provision/agent-hostd.service"; do
  if [ -f "$cand" ]; then SERVICE_SRC="$cand"; break; fi
done
[ -n "$SERVICE_SRC" ] || { echo "  ✗ 找不到 agent-hostd.service"; exit 1; }

OVERLAY="$REPO_ROOT/os/mkosi/artifacts/image-overlay"
rm -rf "$REPO_ROOT/os/mkosi/artifacts"
mkdir -p \
  "$OVERLAY/opt/ximo-host/dist-host" \
  "$OVERLAY/etc/systemd/system/multi-user.target.wants" \
  "$OVERLAY/usr/local/sbin"
cp -f "$REPO_ROOT"/dist-host/*.cjs "$OVERLAY/opt/ximo-host/dist-host/"
cp -f "$SERVICE_SRC" "$OVERLAY/etc/systemd/system/agent-hostd.service"
cp -f "$REPO_ROOT/os/mkosi/provision/ximo-os-firstboot.service" "$OVERLAY/etc/systemd/system/"
# 桌面会话单元（阶段 B1）— Xvfb :99 + openbox；由 agent-hostd 的 Wants= 依赖拉起
cp -f "$REPO_ROOT/os/mkosi/provision/xvfb@.service" "$OVERLAY/etc/systemd/system/"
cp -f "$REPO_ROOT/os/mkosi/provision/ximo-wm.service" "$OVERLAY/etc/systemd/system/"
cp -f "$REPO_ROOT/os/mkosi/provision/ximo-splash.service" "$OVERLAY/etc/systemd/system/"
cp -f "$REPO_ROOT/os/mkosi/provision/firstboot.sh" "$OVERLAY/usr/local/sbin/ximo-os-firstboot.sh"
cp -f "$REPO_ROOT/os/mkosi/provision/ximo-os-audit.sh" "$OVERLAY/usr/local/sbin/ximo-os-audit.sh"
cp -f "$REPO_ROOT/os/mkosi/provision/ximo-os-splash.sh" "$OVERLAY/usr/local/sbin/ximo-os-splash.sh"
chmod 755 "$OVERLAY/usr/local/sbin/ximo-os-firstboot.sh"
chmod 755 "$OVERLAY/usr/local/sbin/ximo-os-audit.sh"
chmod 755 "$OVERLAY/usr/local/sbin/ximo-os-splash.sh"
# 相对软链 = systemctl enable 的等价物（不依赖 mkosi 脚本时序）
ln -sfn ../agent-hostd.service "$OVERLAY/etc/systemd/system/multi-user.target.wants/agent-hostd.service"
ln -sfn ../ximo-os-firstboot.service "$OVERLAY/etc/systemd/system/multi-user.target.wants/ximo-os-firstboot.service"
# 开机品牌画面 — sysinit.target 阶段（服务之前露出）；目录按需创建
mkdir -p "$OVERLAY/etc/systemd/system/sysinit.target.wants"
ln -sfn ../ximo-splash.service "$OVERLAY/etc/systemd/system/sysinit.target.wants/ximo-splash.service" 
# CI 注入 apiKey（构建前写入 overlay — mkosi 会缓存树，构建后追加 overlay 不生效）
if [ -n "${DEEPSEEK_API_KEY:-}" ]; then
  mkdir -p "$OVERLAY/opt/ximo-host/config"
  cat > "$OVERLAY/opt/ximo-host/config/config.json" <<EOF
{
  "listen": "0.0.0.0:17890",
  "baseUrl": "https://api.deepseek.com/v1",
  "apiKey": "$DEEPSEEK_API_KEY",
  "model": "deepseek-chat",
  "mode": "coding",
  "display": ":99"
}
EOF
  chmod 600 "$OVERLAY/opt/ximo-host/config/config.json"
  echo "  ✓ 已注入 CI apiKey 到镜像配置（firstboot 检测到已存在则跳过占位）"
fi

echo "[3/5] mkosi summary — 断言配置解析非空（防静默忽略）"
cd "$REPO_ROOT/os/mkosi"
SUMMARY="$(mkosi summary 2>&1)" || { echo "  ✗ mkosi summary 失败"; echo "$SUMMARY"; exit 1; }
# 断言 Packages 主行非空（summary 的续行只是展示格式，见 mkosi.conf 语法注意 1）
echo "$SUMMARY" | grep -E '^[[:space:]]*Packages:' | grep -qviE 'packages:[[:space:]]*none$' || {
  echo "  ✗ summary 未解析到 Packages（配置段可能放错）"; exit 1
}
# 断言 PostInstallationScripts 生效 — mkosi 25.3 summary 显示为 "Postinstall Scripts:"
# （字段名带空格，grep 'PostInstallationScripts' 永远匹配不上）；放错段时显示 none
# 且无任何警告，见 mkosi.conf 语法注意 2
POSTINSTALL_LINE="$(echo "$SUMMARY" | grep -i 'postinstall scripts:')"
[ -n "$POSTINSTALL_LINE" ] || { echo "  ✗ summary 未解析到 Postinstall Scripts"; exit 1; }
echo "$POSTINSTALL_LINE" | grep -qiE 'postinstall scripts:[[:space:]]*none' && {
  echo "  ✗ PostInstallationScripts 未生效（可能放错了段 — 段落放错是静默忽略）"; exit 1
}
echo "  ✓ Packages / Postinstall Scripts 解析正常"

echo "[4/5] mkosi 构建（首次会下载 Debian 基础包，约几分钟）"
mkosi build

echo "[5/5] 完成"
# sudo 构建后把产物属主还给触发用户 — 后续步骤（CI 注入 config.json）需写入 overlay
if [ "$(id -u)" = "0" ] && [ -n "${SUDO_USER:-}" ]; then
  chown -R "$SUDO_USER" "$STAGE"
fi
ls -lh out/ || true
cat <<'NEXT'

下一步（三选一）：
  A. 直接引导验证:        sudo apt-get install -y qemu-system-x86 && mkosi qemu
                          （WSL2 支持嵌套虚拟化；启动后 journalctl -u agent-hostd 看令牌）
  B. 转 Hyper-V VHDX:     qemu-img convert -f raw -O vhdx out/ximo-os_0.1.raw ximo-os_0.1.vhdx
                          （Windows: New-VM -Generation 2 挂载启动，关闭安全启动）
  C. 交付给裸机/其他虚拟化：直接用 out/ 下的 raw 磁盘镜像

验收清单见 os/README.md
NEXT
