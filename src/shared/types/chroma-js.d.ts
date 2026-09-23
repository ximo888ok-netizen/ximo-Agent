declare module 'chroma-js' {
  export type ColorLike = string | number | [number, number, number] | ChromaInstance

  export interface ChromaStatic {
    (color: ColorLike): ChromaInstance
    (r: number, g: number, b: number): ChromaInstance
    scale(colors: ColorLike[]): {
      mode(m: string): { (t: number): ChromaInstance }
      (t: number): ChromaInstance
    }
    mix(color1: ColorLike, color2: ColorLike, ratio?: number): ChromaInstance
    contrast(a: ColorLike, b: ColorLike): number
    luminance(color: ColorLike): number
    valid(color: unknown): boolean
    hsl(h: number, s: number, l: number): ChromaInstance
    rgb(r: number, g: number, b: number): ChromaInstance
    brewer: Record<string, string[]>
  }

  export interface ChromaInstance {
    hex(mode?: string): string
    css(mode?: string): string
    /** 相对亮度 0–1（WCAG 用值） */
    luminance(): number
    /** WCAG 对比度，1–21 */
    contrast(color: ColorLike): number
    alpha(): number
    alpha(a: number): ChromaInstance
    get(channel: string): number
    set(channel: string, value: number): ChromaInstance
    hsl(): [number, number, number]
    rgb(): [number, number, number]
    rgba(): [number, number, number, number]
    lab(): [number, number, number]
    brighten(amount?: number): ChromaInstance
    darken(amount?: number): ChromaInstance
    saturate(amount?: number): ChromaInstance
    desaturate(amount?: number): ChromaInstance
    mix(color: ColorLike, ratio?: number): ChromaInstance
    hue(): number
    clone(): ChromaInstance
  }

  const chroma: ChromaStatic
  export default chroma
}
