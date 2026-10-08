#!/bin/bash
# ximo-OS 首启引导 — ConditionPathExists 保证只在首次开机跑一次
# 职责：数据/配置目录、配置占位、属主修正、令牌位置提示
set -euo pipefail

DIR=/opt/ximo-host

mkdir -p "$DIR/config" "$DIR/data"
# 属主策略（阶段 D5）：agent-hostd 以 root 运行（需 CAP_SETUID 降权 worker），
# config（含 token/apiKey）归 root 独占 0600；data 归 ximo-host（worker 降权后需访问）
chown -R root:root "$DIR/config" 2>/dev/null || true
# data 归 ximo-host:ximo（共享组）— 任务用户（ximo-t*）需读写 settings/tasks 记录；
# setgid 位使组内新建文件继承 ximo 组，组员可继续协作
chown -R ximo-host:ximo "$DIR/data" 2>/dev/null || true
chmod -R g+rwX "$DIR/data" 2>/dev/null || true
find "$DIR/data" -type d -exec chmod g+s {} + 2>/dev/null || true
chown root:root "$DIR" 2>/dev/null || true
chmod 700 "$DIR/config"
# CI 构建期注入的 config.json 属主是构建用户 → 统一归 root 并收紧权限
[ -f "$DIR/config/config.json" ] && chown root:root "$DIR/config/config.json" && chmod 600 "$DIR/config/config.json"

# workspace 父目录（阶段 D5 沙箱）— 任务用户 ximo-t* 需在此创建各自工作区：
# sticky 位使其仅属主/root 可删他人条目；agent-hostd（CAP_CHOWN）再逐任务 chown
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
