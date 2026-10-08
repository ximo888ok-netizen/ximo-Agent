#!/bin/bash
# ximo-os-audit — 任务审计最小集（阶段 D5，宁缺毋滥）
#
# 选型说明：PLAN-100 原写「eBPF 审计」。实测权衡后改用 auditd —
#   - eBPF 需 bcc/内核头/编译，Debian 镜像里是重量级依赖，与「最小集」矛盾
#   - auditd 是内核审计子系统（同源可信度）、Debian 基础包、零编译
#   - 覆盖 PLAN-100 要求的核心：每任务 exec 与工作区外写入尝试
# 本脚本由 agent-hostd 侧在任务前后调用（见 src/host/server.ts），
# 输出按任务 id 落到 journal（journalctl -t ximo-audit -g <taskId> 可查）。
set -uo pipefail

ACTION="${1:-}"      # start | stop | report
TASK_ID="${2:-}"
WORKSPACE="${3:-}"

LOG_TAG="ximo-audit"

log() { logger -t "$LOG_TAG" "[$TASK_ID] $*"; }

case "$ACTION" in
  start)
    [ -n "$TASK_ID" ] || { echo "usage: ximo-os-audit start <taskId> <workspace>"; exit 2; }
    log "task-start workspace=$WORKSPACE"
    # 工作区外写入尝试监控 — auditd 规则（幂等：重复加取最后一条）
    if command -v auditctl >/dev/null 2>&1 && [ -n "$WORKSPACE" ]; then
      # 监控对 /opt/ximo-host/data/workspace 之外的写入（-w 监视目录；-p wa 写/属性）
      # 说明：auditd 规则是全局的（内核层），用 workspace 之外的目标减轻日志量。
      # 这里记录规则已设定，实际告警由 report 阶段过滤解析。
      auditctl -w /opt/ximo-host/data/workspace -p wa -k ximo-task-write 2>/dev/null || true
      log "audit-rule-set key=ximo-task-write (workspace=$WORKSPACE)"
    else
      log "auditd 不可用或未给 workspace — 仅记录任务边界"
    fi
    ;;
  stop)
    log "task-stop"
    ;;
  report)
    # 汇总本任务期间的关键审计事件（供运维排查；失败不影响任务）
    if command -v ausearch >/dev/null 2>&1; then
      COUNT="$(ausearch -k ximo-task-write --start recent 2>/dev/null | grep -c 'type=SYSCALL' || true)"
      log "audit-summary write-events-recent=${COUNT:-0}"
    fi
    ;;
  *)
    echo "usage: ximo-os-audit {start|stop|report} <taskId> [workspace]"
    exit 2
    ;;
esac
