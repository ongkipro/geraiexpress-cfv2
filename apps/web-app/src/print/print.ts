// Print client (TASK-306, DEC-224): PC-first = open the exact-size PDF in the browser's print dialog (the OS driver
// prints at 100 % on the 100 mm thermal printer). 58 mm = ESC/POS bytes sent over Web Bluetooth when available,
// otherwise the same PDF path. Never retries silently; the server records the print.
export type Format = "label_10x15_with_stub" | "label_10x10" | "label_10x15" | "roll_58mm"
export const FORMAT_LABEL: Record<Format, string> = { label_10x15_with_stub: "10×15 · Paket + Bukti", label_10x10: "10×10 · Paket saja", label_10x15: "10×15 · Paket saja", roll_58mm: "Roll 58 mm" }
export const PAPER_HINT: Record<Format, string> = { label_10x15_with_stub: "Pakai kertas thermal 100×150 mm", label_10x10: "Pakai kertas thermal 100×100 mm", label_10x15: "Pakai kertas thermal 100×150 mm", roll_58mm: "Pakai roll thermal 58 mm" }

/** This device's print density (device-local per spec 01 §2.4; Kasir may change it). */
export function deviceDensity(): "normal" | "tebal" {
  try {
    return localStorage.getItem("gx-print-density") === "tebal" ? "tebal" : "normal"
  } catch {
    return "normal"
  }
}
export function setDeviceDensity(d: "normal" | "tebal"): void {
  try {
    localStorage.setItem("gx-print-density", d)
  } catch {
    // storage unavailable: the choice lasts for this page only
  }
}

export class PrintError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message)
  }
}

export async function fetchPrint(body: { slugs: string[]; format: Format; reason?: string; preview?: boolean; density?: "normal" | "tebal" }): Promise<{ blob: Blob; refused: number }> {
  const res = await fetch("/api/app/print", { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify(body) })
  if (!res.ok) {
    const j = (await res.json().catch(() => null)) as { error?: { code: string; message: string } } | null
    throw new PrintError(j?.error?.code ?? "PRINT_FAILED", j?.error?.message ?? "Gagal menyiapkan label.")
  }
  return { blob: await res.blob(), refused: Number(res.headers.get("x-refused") ?? "0") }
}

/** Opens the PDF in a hidden iframe and triggers the system print dialog (fallback: new tab). */
export function printPdf(blob: Blob): void {
  const url = URL.createObjectURL(blob)
  const frame = document.createElement("iframe")
  frame.style.position = "fixed"
  frame.style.width = "0"
  frame.style.height = "0"
  frame.style.border = "0"
  frame.src = url
  frame.onload = () => {
    // The PDF viewer may take the print call asynchronously; never block the counter on it.
    setTimeout(() => {
      try {
        frame.contentWindow?.focus()
        frame.contentWindow?.print()
      } catch {
        window.open(url, "_blank", "noopener")
      }
    }, 0)
    setTimeout(() => {
      frame.remove()
      URL.revokeObjectURL(url)
    }, 60_000)
  }
  document.body.appendChild(frame)
}

type BtCharacteristic = { writeValueWithoutResponse?: (b: BufferSource) => Promise<void>; writeValue: (b: BufferSource) => Promise<void> }
/** Sends ESC/POS bytes to a paired BLE printer (common 58 mm service UUID); returns false when unsupported. */
export async function printBluetooth(bytes: Uint8Array): Promise<boolean> {
  const bt = (navigator as unknown as { bluetooth?: { requestDevice: (o: unknown) => Promise<{ gatt?: { connect: () => Promise<{ getPrimaryService: (u: string) => Promise<{ getCharacteristic: (u: string) => Promise<BtCharacteristic> }> }> } }> } }).bluetooth
  if (!bt) return false
  const SERVICE = "000018f0-0000-1000-8000-00805f9b34fb"
  const CHAR = "00002af1-0000-1000-8000-00805f9b34fb"
  const device = await bt.requestDevice({ filters: [{ services: [SERVICE] }] })
  const server = await device.gatt!.connect()
  const ch = await (await server.getPrimaryService(SERVICE)).getCharacteristic(CHAR)
  for (let i = 0; i < bytes.length; i += 180) {
    const chunk = bytes.slice(i, i + 180)
    await (ch.writeValueWithoutResponse ? ch.writeValueWithoutResponse(chunk) : ch.writeValue(chunk))
  }
  return true
}
