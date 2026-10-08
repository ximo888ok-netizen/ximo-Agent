#!/bin/bash
# ximo-OS 首启引导 — ConditionPathExists 保证只在首次开机跑一次
# 职责：数据/配置目录、配置占位、属主修正、令牌位置提示
set -euo pipefail

DIR=/opt/ximo-host

mkdir -p "$DIR/config" "$DIR/data"
chown -R ximo-host:ximo-host "$DIR"

# workspace 父目录（阶段 D5 沙箱）— 任务用户 ximo-t* 需在此创建各自工作区：
# 组写 + sticky（仅属主/root 可删他人条目），agent-hostd（CAP_CHOWN）再逐任务 chown
mkdir -p "$DIR/data/workspace" "$DIR/data/snapshots"
chmod 1777 "$DIR/data/workspace"

# 配置占位 — apiKey 需要填写（SSH 进系统编辑，或后续驾驶舱远程下发）
if [ ! -f "$DIR/config/config.json" ]; then
  cat > "$DIR/config/config.json" <<'EOF'
{
  "listen": "0.0.0.0:17890",
  "baseUrl": "https://api.deepseek.com/v1",
  "apiKey": "",
  "model": "deepseek-chat",
  "mode": "coding"
}
EOF
  chmod 600 "$DIR/config/config.json"
  echo "[ximo-os] config.json 占位已生成 — 请填入 apiKey 后 systemctl restart agent-hostd"
fi

echo "[ximo-os] 首启完成。agent-hostd 令牌: $DIR/config/token（首次启动由 agent-hostd 生成，journalctl -u agent-hostd 可见回显）"

mkdir -p /var/lib/ximo-os
touch /var/lib/ximo-os/initialized
