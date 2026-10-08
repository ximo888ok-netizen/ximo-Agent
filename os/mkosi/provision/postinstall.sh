#!/bin/bash
# mkosi PostInstallation 脚本 — 在镜像 chroot 内以 root 执行
# 职责：建系统用户、锁 root。（服务文件与 wants 软链由 ExtraTrees 覆盖树落位，
# 无需 systemctl enable —— 时序免疫）
#
# 注意（均来自 CI 实测报错）：
#  - 镜像里可能没有 /usr/sbin/nologin（`login` 包未显式安装）→ 探测可用路径
#  - chroot 期间 / 可能只读 → 写 /etc/hostname 前先确保可写
set -euo pipefail

# 系统用户 — agent-hostd 以其身份运行（非 root，阶段 3 升级为按任务隔离）
# nologin 路径跨发行版不同（Debian 新版把 /sbin 并入 /usr/sbin），探测后回退 /bin/false
NOLOGIN=""
for cand in /usr/sbin/nologin /sbin/nologin /usr/bin/nologin /bin/false; do
  [ -x "$cand" ] && NOLOGIN="$cand" && break
done
[ -n "$NOLOGIN" ] || NOLOGIN=/bin/false

if ! id -u ximo-host >/dev/null 2>&1; then
  useradd --system --home /opt/ximo-host --shell "$NOLOGIN" ximo-host
fi

# 主机名 — chroot 内 / 可能是只读挂载，先尝试重挂为可写（失败则跳过，不阻断构建）
if ! echo ximo-os > /etc/hostname 2>/dev/null; then
  if mount -o remount,rw / 2>/dev/null; then
    echo ximo-os > /etc/hostname || echo "[ximo-os] 警告：hostname 写入失败（不影响主机运行）"
  else
    # 部分构建环境 hostname 由 mkosi 的 Hostname= 或 systemd 管理，跳过即可
    echo "[ximo-os] 跳过 /etc/hostname（文件系统只读，由 mkosi/systemd 接管）"
  fi
fi

# root 密码锁死 — 入口只有 SSH 密钥（可选注入）与 Hyper-V/QEMU 控制台
passwd -l root >/dev/null 2>&1 || true

# 任务用户池（阶段 D5 按任务用户沙箱）— 每任务以专用系统用户跑 worker，
# 任务间在工作区所有权层面隔离（进程隔离之外的第二道墙）
for i in 1 2 3 4; do
  if ! id -u "ximo-t$i" >/dev/null 2>&1; then
    useradd --system --no-create-home --shell "$NOLOGIN" "ximo-t$i"
  fi
done
echo "[ximo-os] 任务用户池就绪：ximo-t1..t4（沙箱 uid 级隔离）"

# DNS — mkosi 会把构建机的 resolv.conf（如 127.0.0.53 stub）拷进镜像，guest 内不可达
# （CI 实测：agent-hostd 起来了但 LLM 请求 fetch failed）。启用 resolved：
# DNS 由 DHCP 提供（QEMU slirp=10.0.2.3 / 云=真实 DHCP），resolv.conf 指向本地 stub
if systemctl enable systemd-resolved.service >/dev/null 2>&1; then
  if [ -e /etc/resolv.conf ] && ! [ -L /etc/resolv.conf ]; then rm -f /etc/resolv.conf; fi
  ln -sfn /run/systemd/resolve/stub-resolv.conf /etc/resolv.conf
  echo "[ximo-os] DNS：systemd-resolved 已启用（DHCP 提供上游）"
else
  # resolved 不可用时兜底：slirp 的静态 DNS（仅 QEMU 用户态网络正确）
  echo "nameserver 10.0.2.3" > /etc/resolv.conf 2>/dev/null || true
  echo "[ximo-os] 警告：resolved 启用失败，resolv.conf 兜底为 10.0.2.3"
fi

echo "[ximo-os] postinstall 完成：ximo-host 用户就绪（shell=$NOLOGIN），服务经覆盖树软链启用"
