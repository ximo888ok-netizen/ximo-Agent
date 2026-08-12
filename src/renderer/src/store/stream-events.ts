import type { SegmentEvent } from '@shared/types'

/** 向 segment 的 events 数组推送事件，连续同类型文本事件自动合并 */
export function pushEvent(seg: { events?: SegmentEvent[] }, event: SegmentEvent): void {
  if (!seg.events) seg.events = []
  if (event.type === 'reasoning' || event.type === 'content') {
    const last = seg.events[seg.events.length - 1]
    if (last && last.type === event.type) {
      last.text = (last.text || '') + (event.text || '')
      return
    }
  }
  seg.events.push(event)
}
