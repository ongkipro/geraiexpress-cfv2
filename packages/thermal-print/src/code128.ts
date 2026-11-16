// Code 128 (subset B, with subset C runs for even digit pairs) → module widths. No dependency; the pattern table is
// the ISO/IEC 15417 symbol set (bar/space widths, 11 modules per symbol, stop = 13).
const PATTERNS = [
  "212222", "222122", "222221", "121223", "121322", "131222", "122213", "122312", "132212", "221213",
  "221312", "231212", "112232", "122132", "122231", "113222", "123122", "123221", "223211", "221132",
  "221231", "213212", "223112", "312131", "311222", "321122", "321221", "312212", "322112", "322211",
  "212123", "212321", "232121", "111323", "131123", "131321", "112313", "132113", "132311", "211313",
  "231113", "231311", "112133", "112331", "132131", "113123", "113321", "133121", "313121", "211331",
  "231131", "213113", "213311", "213131", "311123", "311321", "331121", "312113", "312311", "332111",
  "314111", "221411", "431111", "111224", "111422", "121124", "121421", "141122", "141221", "112214",
  "112412", "122114", "122411", "142112", "142211", "241211", "221114", "413111", "241112", "134111",
  "111242", "121142", "121241", "114212", "124112", "124211", "411212", "421112", "421211", "212141",
  "214121", "412121", "111143", "111341", "131141", "114113", "114311", "411113", "411311", "113141",
  "114131", "311141", "411131", "211412", "211214", "211232", "2331112",
]
const START_B = 104
const START_C = 105
const CODE_B = 100
const CODE_C = 99
const STOP = 106

/** Symbol values (incl. start, checksum, stop). Throws on characters outside printable ASCII. */
export function code128Values(text: string): number[] {
  if (!/^[\x20-\x7e]+$/.test(text)) throw new RangeError("Code 128B: printable ASCII only")
  const out: number[] = []
  let set: "B" | "C" | null = null
  let i = 0
  while (i < text.length) {
    const run = /^\d+/.exec(text.slice(i))?.[0].length ?? 0
    // Switch to C for runs of ≥ 4 digits (or a whole-text even run); keeps labels short and scannable.
    const useC = run >= 4 && (run % 2 === 0 || i + run < text.length || run >= 5)
    if (useC) {
      const pairs = Math.floor(run / 2)
      if (set !== "C") out.push(set === null ? START_C : CODE_C)
      set = "C"
      for (let k = 0; k < pairs; k++) out.push(Number(text.slice(i + k * 2, i + k * 2 + 2)))
      i += pairs * 2
      continue
    }
    if (set !== "B") out.push(set === null ? START_B : CODE_B)
    set = "B"
    out.push(text.charCodeAt(i) - 32)
    i++
  }
  const checksum = out.reduce((sum, v, idx) => sum + v * (idx === 0 ? 1 : idx), 0) % 103
  return [...out, checksum, STOP]
}

/** Alternating bar/space module widths starting with a bar (no quiet zone). */
export function code128Modules(text: string): number[] {
  return code128Values(text).flatMap((v) => [...PATTERNS[v]!].map(Number))
}

export const totalModules = (modules: number[]) => modules.reduce((a, b) => a + b, 0)
