// TASK-112 deliverability gate helpers (spec 12 §6). Read-only DNS checks over DNS-over-HTTPS (Cloudflare resolver)
// and evaluation of received headers pasted from test inboxes. Never sends mail and never changes DNS.
export async function dohTxt(name, fetchImpl = fetch) {
  const res = await fetchImpl(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(name)}&type=TXT`, { headers: { accept: "application/dns-json" }, signal: AbortSignal.timeout(8000) })
  const j = await res.json()
  return (j.Answer ?? []).filter((a) => a.type === 16).map((a) => a.data.replace(/^"|"$/g, "").replace(/" "/g, ""))
}

export function evaluateDns({ spf, dmarc, dkim }) {
  const checks = []
  const spfRec = spf.find((t) => t.startsWith("v=spf1"))
  checks.push({ id: "spf", ok: !!spfRec && /include:|ip4:|ip6:|a\b|mx\b/.test(spfRec) && /[~-]all\b/.test(spfRec), detail: spfRec ?? "tidak ada record SPF" })
  const dm = dmarc.find((t) => t.startsWith("v=DMARC1"))
  const policy = dm?.match(/\bp=(none|quarantine|reject)\b/)?.[1] ?? null
  checks.push({ id: "dmarc", ok: !!dm && !!policy, detail: dm ? `p=${policy}${/rua=/.test(dm) ? ", rua ada" : ", rua belum ada"}` : "tidak ada record DMARC" })
  checks.push({ id: "dkim", ok: dkim.some((t) => /v=DKIM1|p=/.test(t)), detail: dkim.length ? "record DKIM ditemukan" : "record DKIM belum ditemukan (periksa selector di dashboard Email Sending)" })
  return checks
}

/** Parses an Authentication-Results header block (from "Show original" in Gmail/Outlook/Yahoo). */
export function evaluateHeaders(raw) {
  const auth = raw.split(/\r?\n(?=\S)/).filter((l) => /^Authentication-Results:/i.test(l)).join(" ").replace(/\s+/g, " ")
  const pick = (k) => auth.match(new RegExp(`\\b${k}=(pass|fail|softfail|neutral|none|temperror|permerror)`, "i"))?.[1]?.toLowerCase() ?? "none"
  const dmarcAligned = /dmarc=pass/i.test(auth)
  return { spf: pick("spf"), dkim: pick("dkim"), dmarc: pick("dmarc"), pass: pick("spf") === "pass" && pick("dkim") === "pass" && dmarcAligned }
}

/** Delivery time in seconds from the Date header to the receiving server's first Received timestamp. */
export function deliverySeconds(raw) {
  const date = raw.match(/^Date:\s*(.+)$/im)?.[1]
  const received = raw.match(/^Received:[\s\S]*?;\s*([^\r\n]+)/im)?.[1]
  if (!date || !received) return null
  const d = Date.parse(date)
  const r = Date.parse(received.trim())
  return Number.isNaN(d) || Number.isNaN(r) ? null : Math.round((r - d) / 1000)
}

export const INBOX_MATRIX = ["gmail", "outlook", "yahoo"].flatMap((p) => ["signup_otp", "password_reset"].flatMap((t) => [1, 2].map((n) => ({ provider: p, template: t, send: n }))))
