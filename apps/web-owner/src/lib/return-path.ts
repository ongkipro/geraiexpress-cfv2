// `kembali` after a TOTP step-up (DEC-246 Sol R1 #3): only a same-origin console path survives. Control characters and
// whitespace are refused before parsing, because browsers strip tab/CR/LF when they resolve a URL (`/\t/evil.example`
// would become `//evil.example`); the parsed result must stay on this origin.
const unsafe = (raw: string) => [...raw].some((ch) => ch.charCodeAt(0) <= 0x20 || ch.charCodeAt(0) === 0x7f || ch === "\\" || /\s/.test(ch))

export function safeReturnPath(raw: unknown, origin: string): string | undefined {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > 512) return undefined
  if (!raw.startsWith("/") || raw.startsWith("//") || unsafe(raw)) return undefined
  let url: URL
  try {
    url = new URL(raw, origin)
  } catch {
    return undefined
  }
  if (url.origin !== new URL(origin).origin) return undefined
  return `${url.pathname}${url.search}${url.hash}`
}
