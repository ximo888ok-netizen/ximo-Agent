declare module 'chroma-js' {
  interface ChromaStatic {
    (color: string | number | [number, number, number]): ChromaInstance
    scale(colors: (string | ChromaInstance)[]): {
      mode(m: string): { (t: number): ChromaInstance }
      (t: number): ChromaInstance
    }
    mix(color1: string, color2: string, ratio?: number): ChromaInstance
    brewer: Record<string, string[]>
  }
  interface ChromaInstance {
    hex(): string
    brighten(amount?: number): ChromaInstance
    darken(amount?: number): ChromaInstance
    saturate(amount?: number): ChromaInstance
    desaturate(amount?: number): ChromaInstance
    hue(): number
    luminance(): number
  }
  const chroma: ChromaStatic
  export default chroma
}
