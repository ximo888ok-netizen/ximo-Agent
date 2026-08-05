import type { StreamingSegment } from '@shared/types'

/** rAF 批处理器 — 将高频流式更新合并到每帧一次 */
export class StreamingBatcher {
  private rafId: number | null = null
  private dirty = false

  constructor(
    private readonly flush: (segments: StreamingSegment[]) => void,
    private readonly getSegments: () => StreamingSegment[],
  ) {}

  schedule(): void {
    this.dirty = true
    if (this.rafId !== null) return
    this.rafId = requestAnimationFrame(() => {
      this.rafId = null
      if (!this.dirty) return
      this.dirty = false
      const segCopy: StreamingSegment[] = this.getSegments().map(s => ({
        reasoning: s.reasoning,
        content: s.content,
        toolCalls: s.toolCalls.map(tc => ({ ...tc })),
        ...(s.expertEvents ? { expertEvents: s.expertEvents.map(e => ({ ...e })) } : {}),
      }))
      this.flush(segCopy)
    })
  }

  cancel(): void {
    if (this.rafId !== null) { cancelAnimationFrame(this.rafId); this.rafId = null }
    this.dirty = false
  }
}

/** 移除 'thinking' 创建的尾部空 segment */
export function trimTrailingEmpty(segments: StreamingSegment[]): void {
  if (segments.length > 1) {
    const last = segments[segments.length - 1]
    if (last && !last.reasoning && !last.content && last.toolCalls.length === 0 && !(last.expertEvents && last.expertEvents.length > 0)) {
      segments.pop()
    }
  }
}

/** 计算持久化用的 segments（仅多轮时保留） */
export function computePersistSegments(segments: StreamingSegment[]): StreamingSegment[] | undefined {
  const nonEmpty = segments.filter(s => s.reasoning || s.content || s.toolCalls.length > 0 || (s.expertEvents && s.expertEvents.length > 0))
  if (nonEmpty.length <= 1) return undefined
  return nonEmpty.map(s => ({
    reasoning: s.reasoning,
    content: s.content,
    toolCalls: s.toolCalls.map(tc => ({ ...tc, status: 'done' as const })),
    ...(s.expertEvents ? { expertEvents: s.expertEvents.map(e => ({ ...e })) } : {}),
  }))
}

/** 扁平化 segments 的内容 */
export function flatContent(segments: StreamingSegment[]): string {
  return segments.map(s => s.content).filter(Boolean).join('\n\n')
}

/** 扁平化 segments 的推理内容 */
export function flatReasoning(segments: StreamingSegment[]): string {
  return segments.map(s => s.reasoning).filter(Boolean).join('\n\n')
}
