// ESC/POS bytes for 58 mm printers (Web Bluetooth / USB raw). Native Code 128 (GS k 73) and QR (GS ( k) commands, so
// the printer renders bars at its own resolution; text is ASCII, 32 columns (Font A).
import type { RollLine } from "./roll58"

const ESC = 0x1b
const GS = 0x1d

export function escposBytes(lines: RollLine[], density: "normal" | "tebal" = "normal"): Uint8Array {
  const out: number[] = [ESC, 0x40] // init
  // Print density (GS ( K is not universal; ESC 7 heating time is common on cheap 58 mm heads).
  out.push(ESC, 0x37, 7, density === "tebal" ? 160 : 100, 2)
  const text = (s: string) => {
    for (const ch of s) out.push(ch.charCodeAt(0) & 0x7f)
    out.push(0x0a)
  }
  for (const l of lines) {
    if ("text" in l) {
      out.push(ESC, 0x45, l.bold ? 1 : 0) // bold
      out.push(GS, 0x42, l.invert ? 1 : 0) // white on black
      out.push(ESC, 0x61, 0) // left (lines are already padded/centred to 32 cols)
      text(l.text)
      continue
    }
    out.push(ESC, 0x45, 0, GS, 0x42, 0, ESC, 0x61, 1) // reset style, centre
    if ("barcode" in l) {
      const data = [0x7b, 0x42, ...[...l.barcode].map((c) => c.charCodeAt(0))] // {B + data
      out.push(GS, 0x68, 80) // height 80 dots ≈ 10 mm
      out.push(GS, 0x77, 2) // module width 2 dots
      out.push(GS, 0x48, 0) // no HRI (the grouped AWB is printed as text)
      out.push(GS, 0x6b, 73, data.length, ...data)
      out.push(0x0a)
    } else if ("qr" in l) {
      const d = [...new TextEncoder().encode(l.qr)]
      const len = d.length + 3
      out.push(GS, 0x28, 0x6b, 4, 0, 0x31, 0x41, 0x32, 0) // model 2
      out.push(GS, 0x28, 0x6b, 3, 0, 0x31, 0x43, 5) // module size 5
      out.push(GS, 0x28, 0x6b, 3, 0, 0x31, 0x45, 0x31) // ECC M
      out.push(GS, 0x28, 0x6b, len & 0xff, len >> 8, 0x31, 0x50, 0x30, ...d) // store
      out.push(GS, 0x28, 0x6b, 3, 0, 0x31, 0x51, 0x30) // print
      out.push(0x0a)
    } else {
      out.push(0x0a, 0x0a, 0x0a, GS, 0x56, 66, 0) // feed + partial cut
    }
  }
  return new Uint8Array(out)
}
