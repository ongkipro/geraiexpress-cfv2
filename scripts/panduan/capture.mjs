#!/usr/bin/env node
// Local only: drives the real flows on a running `wrangler dev` (mock Mengantar, synthetic data) and saves one
// screenshot per guide step. Numbered markers are drawn into the page before each shot, so the published image and
// the step text share the same numbers.
//
//   GX_OPS_TOKEN=<local ops token> node scripts/panduan/capture.mjs <state.json> <out dir>
//
// `state.json` comes from scripts/panduan/seed.mjs. Output: PNG files (converted to WebP by optimize.mjs).
// Screens are captured as Kasir wherever possible: the owner view shows cost and margin, which never appear on a
// public page (visual 09 §6.2). Owner-only screens (Pengaturan, Keuangan) are captured without cost figures.
/* global document, window, NodeFilter, getComputedStyle -- used only inside page.evaluate() callbacks, which run in the browser */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { chromium } from "@playwright/test"

const st = JSON.parse(readFileSync(process.argv[2], "utf8"))
const portStr = String(st.port ?? "")
const portNum = Number(portStr)
if (!/^\d{1,5}$/.test(portStr) || portNum < 1 || portNum > 65535) throw new Error(`invalid local port in state.json: ${st.port}`)
if (!/^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$/.test(String(st.slug ?? ""))) throw new Error(`invalid tenant slug in state.json: ${st.slug}`)
const out = process.argv[3]
mkdirSync(out, { recursive: true })
// Sentinel manifest before any PNG is written: if capture crashes mid-run (e.g. login error outside section()),
// optimize.mjs refuses to publish a stale or mixed set of screenshots from a reused output directory.
writeFileSync(`${out}/shots.json`, JSON.stringify({ inProgress: true, shots: [], failed: ["capture_incomplete"] }, null, 2))
const ops = process.env.GX_OPS_TOKEN ?? ""
const APP = `http://app.geraiexpress.localhost:${st.port}`
const OWNER = `http://owner.geraiexpress.localhost:${st.port}`
const SITE = `http://${st.slug}.geraimitra.localhost:${st.port}`
for (const origin of [APP, OWNER, SITE]) {
  if (!new URL(origin).hostname.endsWith(".localhost")) throw new Error(`refusing non-local origin: ${origin}`)
}
// GX_VIEW=phone: the same flows in a 390 px window, saved as `<name>-hp.png` (served to narrow screens).
const PHONE = process.env.GX_VIEW === "phone"
const W = PHONE ? 390 : 1440
const H = PHONE ? 844 : 900
const shots = []

const browser = await chromium.launch({ channel: "chrome", args: ["--password-store=basic"] })

async function open(viewport = { width: W, height: H }, ip = "198.51.100.90") {
  const ctx = await browser.newContext({ viewport, hasTouch: PHONE, deviceScaleFactor: PHONE ? 2 : 1, locale: "id-ID", timezoneId: "Asia/Jakarta", extraHTTPHeaders: { "cf-connecting-ip": ip } })
  const page = await ctx.newPage()
  page.setDefaultTimeout(20_000)
  return { ctx, page }
}
async function login(page, email) {
  for (let i = 0; ; i++) {
    try {
      await page.goto(`${APP}/masuk`)
      break
    } catch (err) {
      if (i >= 5) throw err
      await page.waitForTimeout(2000)
    }
  }
  await page.getByLabel(/email/i).first().fill(email)
  await page.getByLabel(/kata sandi/i).first().fill(st.password)
  await page.getByRole("button", { name: /^masuk/i }).click()
  await page.waitForURL((u) => !u.pathname.startsWith("/masuk"))
}
const settle = async (page, ms = 450) => {
  await page.waitForLoadState("networkidle").catch(() => {})
  await page.waitForTimeout(ms)
}

/**
 * Draws numbered badges and outlines on top of the page. `marks` = [{ n, loc, side?, pad? }]. The overlay is fixed to
 * the viewport, so nothing may scroll between marking and the shot: card shots use a tall viewport instead (`tall`).
 * A mark whose element is missing is skipped with a warning, never fatal.
 */
async function mark(page, marks) {
  const boxes = []
  for (const m of marks) {
    const locs = Array.isArray(m.loc) ? m.loc : [m.loc]
    const parts = []
    for (const l of locs) {
      const p = await l.first().boundingBox({ timeout: 2500 }).catch(() => null)
      if (p) parts.push(p)
    }
    if (parts.length !== locs.length) {
      console.warn(`  (mark ${m.n}: found ${parts.length}/${locs.length} target(s))`)
      continue
    }
    const x = Math.min(...parts.map((p) => p.x))
    const y = Math.min(...parts.map((p) => p.y))
    const b = { x, y, width: Math.max(...parts.map((p) => p.x + p.width)) - x, height: Math.max(...parts.map((p) => p.y + p.height)) - y }
    boxes.push({ n: m.n, side: m.side ?? "tr", pad: m.pad ?? 6, at: m.at ?? null, ...b })
  }
  return page.evaluate((items) => {
    document.getElementById("gx-marks")?.remove()
    const root = document.createElement("div")
    root.id = "gx-marks"
    root.style.cssText = "position:fixed;left:0;top:0;width:0;height:0;z-index:2147483000;pointer-events:none"

    // Rectangles of everything a reader has to be able to read: every visible run of text, and every form control.
    // A badge may not sit on any of them. Measured once, before anything is drawn.
    const obstacles = []
    const vw = window.innerWidth
    const vh = window.innerHeight
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (!n.nodeValue.trim()) continue
      const style = getComputedStyle(n.parentElement)
      if (style.visibility === "hidden" || style.display === "none" || Number(style.opacity) === 0) continue
      const range = document.createRange()
      range.selectNodeContents(n)
      for (const r of range.getClientRects()) if (r.width > 1 && r.height > 1 && r.bottom > 0 && r.top < vh && r.right > 0 && r.left < vw) obstacles.push(r)
    }
    const ruler = document.createElement("canvas").getContext("2d")
    for (const el of document.querySelectorAll("input, textarea, select, canvas, img, svg")) {
      const r = el.getBoundingClientRect()
      if (!(r.width > 1 && r.height > 1 && r.bottom > 0 && r.top < vh)) continue
      if (el.tagName === "INPUT" && !["checkbox", "radio", "file", "range"].includes(el.type)) {
        // Only the part of a one-line field that holds text (value or placeholder), plus its left padding.
        const cs = getComputedStyle(el)
        ruler.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`
        const textW = ruler.measureText(el.value || el.placeholder || "").width + parseFloat(cs.paddingLeft) + 14
        obstacles.push({ left: r.left, top: r.top, right: Math.min(r.right, r.left + textW), bottom: r.bottom })
      } else obstacles.push(r)
    }
    const SIZE = 34
    const placed = []
    const hits = (bx, by) => {
      const a = { l: bx + 3, t: by + 3, r: bx + SIZE - 3, b: by + SIZE - 3 }
      const over = (r) => a.l < r.right && a.r > r.left && a.t < r.bottom && a.b > r.top
      return obstacles.some(over) || placed.some((q) => a.l < q.x + SIZE + 2 && a.r > q.x - 2 && a.t < q.y + SIZE + 2 && a.b > q.y - 2)
    }

    for (const b of items) {
      const x = b.x - b.pad
      const y = b.y - b.pad
      const w = b.width + b.pad * 2
      const h = b.height + b.pad * 2
      const ring = document.createElement("div")
      ring.style.cssText = `position:absolute;left:${x}px;top:${y}px;width:${w}px;height:${h}px;border:3px solid #C2410C;border-radius:12px;box-shadow:0 0 0 4px rgba(194,65,12,.16)`
      // Candidate badge positions around the ring, the requested `side` first. The first one that covers no text,
      // no control and no other badge wins; the ring itself always shows which control is meant.
      const spots = {
        tr: [x + w - 34, y - 30],
        tl: [x - 16, y - 16],
        r: [x + w + 6, y + h / 2 - 17],
        br: [x + w - 34, y + h - 4],
        bl: [x + 4, y + h - 4],
        l: [x - SIZE - 6, y + h / 2 - 17],
        t: [x + w / 2 - 17, y - 30],
        b: [x + w / 2 - 17, y + h - 4],
        rt: [x + w + 6, y - 6],
        rb: [x + w + 6, y + h - 28],
        lt: [x - SIZE - 6, y - 6],
        lb: [x - SIZE - 6, y + h - 28],
        // Last resort in a dense form: inside the ring at its right end (text in a field is left-aligned).
        in: [x + w - SIZE - 8, y + h / 2 - 17],
      }
      const order = [b.side, "tr", "r", "tl", "br", "bl", "l", "t", "b", "rt", "rb", "lt", "lb", "in"].filter((k, i, a) => spots[k] && a.indexOf(k) === i)
      const clamp = ([px, py]) => [Math.min(Math.max(2, px), vw - SIZE - 2), Math.min(Math.max(2, py), vh - SIZE - 2)]
      let pos = null
      let covered = false
      if (b.at) {
        pos = clamp([x + w * b.at[0] - 17, y + h * b.at[1] - 17])
        covered = hits(pos[0], pos[1])
      } else {
        for (const k of order) {
          const c = clamp(spots[k])
          if (!hits(c[0], c[1])) {
            pos = c
            break
          }
        }
        if (!pos) {
          covered = true
          pos = clamp(spots[b.side] ?? spots.tr)
        }
      }
      placed.push({ x: pos[0], y: pos[1], n: b.n, covered })
      const dot = document.createElement("div")
      dot.textContent = String(b.n)
      dot.style.cssText = `position:absolute;left:${pos[0]}px;top:${pos[1]}px;width:30px;height:30px;border-radius:999px;background:#C2410C;color:#fff;font:700 16px/30px -apple-system,"Segoe UI",Roboto,sans-serif;text-align:center;box-shadow:0 2px 6px rgba(0,0,0,.28);border:2px solid #fff;box-sizing:content-box`
      root.append(ring, dot)
    }
    document.body.append(root)
    // Extent of everything drawn, so the caller can widen its crop around it; and any badge that found no free spot.
    const rs = [...root.children].map((el) => el.getBoundingClientRect())
    return rs.length
      ? { count: rs.length / 2, covered: placed.filter((q) => q.covered).map((q) => q.n), x0: Math.min(...rs.map((r) => r.left)), y0: Math.min(...rs.map((r) => r.top)), x1: Math.max(...rs.map((r) => r.right)), y1: Math.max(...rs.map((r) => r.bottom)) }
      : null
  }, boxes)
}
const unmark = (page) =>
  page.evaluate(() => {
    document.getElementById("gx-marks")?.remove()
    for (const el of document.querySelectorAll("[data-gx-orig]")) {
      el.value = el.dataset.gxOrig
      delete el.dataset.gxOrig
    }
    for (const el of document.querySelectorAll("[data-gx-orig-ph]")) {
      el.placeholder = el.dataset.gxOrigPh
      delete el.dataset.gxOrigPh
    }
  })

/** Tall viewport: the whole screen fits without scrolling, so card crops and marks line up. */
const PHONE_MAX_CSS = 1300 // tallest phone picture, in CSS px (about one and a half screens)
const WN = PHONE ? 390 : 1100 // full-content shots: 256 px sidebar + 844 px content
const MS = PHONE ? 390 : 1000 // mini-site window
const tall = (page, h = 1900, w = W) => page.setViewportSize({ width: PHONE ? 390 : w, height: PHONE ? Math.round(h * 1.9) : h })
const normal = (page) => page.setViewportSize({ width: W, height: H })
const main = (page) => page.locator("main").first()
/** Page heading plus the cards under it: the content without the empty canvas below. */
const content = async (page) => {
  const m = main(page)
  const parts = [m.locator("h1").first()]
  const cards = m.locator('[data-slot="card"]')
  await cards.first().waitFor({ timeout: 6000 }).catch(() => {})
  const n = Math.min(await cards.count(), 12)
  for (let i = 0; i < n; i++) parts.push(cards.nth(i))
  return parts
}

/** Saves a shot. `clip` = locator (or several: their union) to crop to, otherwise the viewport. */
async function shot(page, name, { clip, from, margin = 14, marks = [] } = {}) {
  await settle(page)
  // Presentation only, right before the shot: local hosts (`*.geraimitra.localhost:<port>`) read as the production
  // zone, and every phone number is written redacted (`08xx-xxxx-NNNN`, AGENTS.md "Example data policy").
  await page.evaluate((port) => {
    const phone = /(?<![\dA-Za-z])(?:\+?62[\s-]?|0)8\d{1,2}[- ]?\d{3,4}[- ]?\d{3,5}(?!\d)/g
    const mask = (m) => `08xx-xxxx-${m.replace(/\D/g, "").slice(-4)}`
    const fix = (t) => t.replaceAll(`.geraimitra.localhost:${port}`, ".geraimitra.com").replaceAll(".geraimitra.localhost", ".geraimitra.com").replace(phone, mask)
    const walk = (root) => {
      const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
      for (let n = w.nextNode(); n; n = w.nextNode()) {
        const next = fix(n.nodeValue)
        if (next !== n.nodeValue) n.nodeValue = next
      }
      for (const el of root.querySelectorAll?.("input, textarea") ?? []) {
        if (["password", "checkbox", "radio", "file"].includes(el.type)) continue
        const next = fix(el.value)
        if (next !== el.value) {
          el.dataset.gxOrig = el.value
          el.value = next
        }
        if (el.placeholder) {
          const nextPh = fix(el.placeholder)
          if (nextPh !== el.placeholder) {
            el.dataset.gxOrigPh = el.placeholder
            el.placeholder = nextPh
          }
        }
      }
      for (const img of root.querySelectorAll?.('img[src^="data:image/svg+xml"]') ?? []) {
        const raw = img.getAttribute("src") ?? ""
        const next = raw
          .replaceAll(`.geraimitra.localhost%3A${port}`, ".geraimitra.com")
          .replaceAll(`.geraimitra.localhost:${port}`, ".geraimitra.com")
          .replaceAll(".geraimitra.localhost", ".geraimitra.com")
        if (next !== raw) img.setAttribute("src", next)
      }
    }
    walk(document.body)
    for (const f of document.querySelectorAll("iframe")) {
      try {
        if (f.contentDocument?.body) walk(f.contentDocument.documentElement)
      } catch {
        /* cross-origin frame: left as is */
      }
    }
  }, st.port)
  const file = `${out}/${name}${PHONE ? "-hp" : ""}.png`
  let region
  if (clip) {
    const list = Array.isArray(clip) ? clip : [clip]
    const bs = []
    for (const c of list) {
      const b = await c.first().boundingBox({ timeout: 4000 }).catch(() => null)
      if (b) bs.push(b)
    }
    if (bs.length) {
      const vp = page.viewportSize()
      const x0 = Math.max(0, Math.min(...bs.map((b) => b.x)) - margin)
      const y0 = Math.max(0, Math.min(...bs.map((b) => b.y)) - Math.min(margin, 8))
      const x1 = Math.min(vp.width, Math.max(...bs.map((b) => b.x + b.width)) + margin)
      const y1 = Math.min(vp.height, Math.max(...bs.map((b) => b.y + b.height)) + margin)
      region = { x: x0, y: y0, width: x1 - x0, height: y1 - y0 }
    } else console.warn(`  (clip for ${name} not found: viewport used)`)
  }
  if (from && !region) {
    const top = await from.first().boundingBox({ timeout: 4000 }).catch(() => null)
    const vp = page.viewportSize()
    if (top) region = { x: 0, y: Math.max(0, top.y - 10), width: vp.width, height: vp.height - Math.max(0, top.y - 10) }
  }
  const drawn = marks.length ? await mark(page, marks) : null
  if (region && drawn) {
    const vp = page.viewportSize()
    const x0 = Math.max(0, Math.min(region.x, drawn.x0 - 6))
    const y0 = Math.max(0, Math.min(region.y, drawn.y0 - 6))
    const x1 = Math.min(vp.width, Math.max(region.x + region.width, drawn.x1 + 6))
    const y1 = Math.min(vp.height, Math.max(region.y + region.height, drawn.y1 + 6))
    region = { x: x0, y: y0, width: x1 - x0, height: y1 - y0 }
  }
  if (PHONE && region && region.height > PHONE_MAX_CSS) {
    // A long phone screen: keep the band that holds every marker, with context above it. Without markers, the top.
    const y0 = drawn ? Math.max(region.y, Math.min(drawn.y0 - 150, drawn.y1 + 60 - PHONE_MAX_CSS)) : region.y
    const y1 = Math.min(region.y + region.height, Math.max(y0 + PHONE_MAX_CSS, drawn ? drawn.y1 + 60 : 0))
    region = { ...region, y: y0, height: y1 - y0 }
    if (region.height > PHONE_MAX_CSS + 40) console.warn(`  (${name}: markers span ${Math.round(region.height)} px, taller than one phone image)`)
  }
  // Every marker must be inside the picture (cropped region or full viewport): a badge outside is a step without a pointer.
  const bounds = region ?? { x: 0, y: 0, ...page.viewportSize() }
  if (drawn && (drawn.x0 < bounds.x - 1 || drawn.y0 < bounds.y - 1 || drawn.x1 > bounds.x + bounds.width + 1 || drawn.y1 > bounds.y + bounds.height + 1)) {
    throw new Error(`${name}: a marker falls outside the picture`)
  }
  if (marks.length && (!drawn || drawn.count !== marks.length)) throw new Error(`${name}: ${drawn?.count ?? 0} of ${marks.length} markers drawn`)
  if (drawn?.covered?.length) throw new Error(`${name}: marker ${drawn.covered.join(", ")} has no free spot and would cover text`)
  await page.screenshot({ path: file, ...(region ? { clip: region } : {}) })
  await unmark(page)
  shots.push(name)
  console.log("shot", name)
}
/** Runs one guide section; a failure is reported and the next section still runs. */
const only = (process.env.GX_ONLY ?? "").split(",").map((x) => x.trim()).filter(Boolean)
async function section(title, fn) {
  if (only.length && !only.includes(title)) return
  try {
    await fn()
  } catch (err) {
    failed.push(title)
    console.error(`SECTION FAILED: ${title}: ${String(err?.message ?? err).split("\n")[0]}`)
  }
}
const failed = []

const api = (page) => async (path, data, extra = {}) => {
  const res = await page.context().request.post(`${APP}/api/app${path}`, { headers: { origin: APP, "content-type": "application/json", ...extra }, data: data ?? {} })
  const json = await res.json().catch(() => ({}))
  if (!res.ok()) throw new Error(`POST ${path} -> ${res.status()} ${JSON.stringify(json).slice(0, 160)}`)
  return json.data
}
const TEBET = "5fc64714f8f44b34aa4cdd60"
/**
 * A dev server that just (re)started has an empty Mengantar mock, so the first issue of an existing gerai is refused
 * once while it reserves a new pickup slot. One throwaway parcel through the API (retried) lets the flows start clean.
 */
async function warmUp(page) {
  const post = api(page)
  const get = async (path) => (await (await page.context().request.get(`${APP}/api/app${path}`)).json()).data
  const ids = { senderId: (await get("/contacts/senders")).items[0].id, recipientId: (await get("/contacts/recipients")).items[0].id }
  const { slug } = await post("/quotes/freeze", { destinationAreaId: TEBET, weightGram: 1000, mode: "none", serviceCode: "JT" })
  await post(`/shipments/${slug}/parties`, { ...ids, content: "Pakaian", prohibitedAck: true })
  await post(`/shipments/${slug}/payment`, { method: "qris" }, { "idempotency-key": `pdn${slug}pay01` })
  for (let i = 0; i < 3; i++) {
    try {
      await post(`/shipments/${slug}/dispatch`, {})
      await post(`/shipments/${slug}/cancel`, { reason: "paket uji panduan" }).catch(() => {})
      return
    } catch {
      // refused once while the pickup slot is renewed: try again
    }
  }
}

const card = (page, id) => page.locator(`[aria-labelledby="${id}"]`)
const pickSender = (page, name) => page.getByRole("list", { name: "Pilihan pengirim" }).getByRole("button", { name })
const pickRecipient = (page, name) => page.getByRole("list", { name: "Pilihan penerima" }).getByRole("button", { name })
const jnt = (page) => page.getByRole("radio", { name: /^J&T Express/ })
/** The primary that is actually on screen: the summary card's on desktop, the sticky bar's on phones. */
/**
 * Phones only: a normal 390×844 window where the element `last` sits just above the sticky action bar, so the bar
 * (with the primary button) and every control of the step are visible together and nothing is covered.
 */
async function phoneFrame(page, last, first) {
  // Tall enough that `first` (the card title) and `last` (the lowest control) both fit between the app header and
  // the sticky action bar; the window stays a phone, only longer than 844 px when the card needs it.
  await normal(page)
  const need = await last.first().evaluate((el, top) => {
    const t = top ? top.getBoundingClientRect().top : el.getBoundingClientRect().top
    return Math.ceil(el.getBoundingClientRect().bottom - t)
  }, first ? await first.first().elementHandle() : null)
  await page.setViewportSize({ width: W, height: Math.max(H, Math.min(need + 64 + 96 + 60, 1300)) })
  await last.first().evaluate((el) => {
    const bar = [...document.querySelectorAll("div.fixed")].filter((d) => d.getBoundingClientRect().bottom >= window.innerHeight - 2).pop()
    const barTop = bar ? bar.getBoundingClientRect().top : window.innerHeight
    window.scrollBy({ top: el.getBoundingClientRect().bottom - (barTop - 20), behavior: "instant" })
  })
  await settle(page, 400)
}
const primary = (page, name) => (PHONE ? page.getByRole("button", { name }).last() : page.getByRole("button", { name }).first())

// --- A. Kasir: dashboard, cek ongkir, kiriman satuan, cetak, lacak --------------------------------------------
{
  const { ctx, page } = await open()
  await login(page, st.kasirEmail)
  await warmUp(page).catch((err) => console.warn(`  (warm-up skipped: ${String(err?.message ?? err).split("\n")[0]})`))

  await section("mulai", async () => {
    await page.goto(`${APP}/`)
    await page.setViewportSize({ width: WN, height: PHONE ? 844 : 700 })
    await shot(page, "mulai-dashboard", {
      marks: PHONE
        ? [
            { n: 1, loc: page.getByRole("link", { name: "Kiriman Baru" }), pad: 2, side: "tl" },
            { n: 2, loc: page.getByRole("navigation", { name: "Menu bawah" }).getByRole("link", { name: /Cek Ongkir/ }), pad: 0, side: "tl" },
            { n: 3, loc: page.getByRole("navigation", { name: "Menu bawah" }).getByRole("link", { name: /Kiriman/ }).last(), pad: 0, side: "tl" },
            { n: 4, loc: main(page).locator('[data-slot="card"]').last(), pad: 2, side: "tl" },
          ]
        : [
        { n: 1, loc: page.getByRole("button", { name: /Kiriman Baru/ }).first(), side: "tl" },
        { n: 2, loc: page.getByRole("button", { name: /Cek Ongkir & Resi/ }).or(page.getByRole("link", { name: /Cek Ongkir & Resi/ })), side: "tl" },
        { n: 3, loc: page.getByRole("button", { name: "Kiriman", exact: true }).or(page.getByRole("link", { name: "Kiriman", exact: true })), side: "tl" },
        { n: 4, loc: main(page).locator('[data-slot="card"]').last(), pad: 2, side: "tl" },
      ],
    })
    await normal(page)
  })

  await section("cek ongkir", async () => {
    await page.goto(`${APP}/kasir/cek-cepat`)
    await tall(page, 1700, WN)
    await page.getByLabel("Kecamatan tujuan").fill("tebet")
    const hit = page.getByRole("list", { name: "Hasil pencarian wilayah" }).getByRole("button", { name: /Tebet Barat/ })
    await hit.waitFor()
    await shot(page, "ongkir-1-kecamatan", { clip: await content(page), marks: [{ n: 1, loc: page.getByLabel("Kecamatan tujuan") }, { n: 2, loc: hit, pad: 2, side: "br" }] })
    await hit.click()
    const list = page.getByRole("list", { name: "Daftar ekspedisi" })
    await list.waitFor()
    await settle(page, 900)
    await shot(page, "ongkir-2-hasil", {
      clip: await content(page),
      marks: [
        { n: 3, loc: list.getByRole("listitem").first(), pad: 2, side: "tl" },
        { n: 4, loc: page.locator("#kurir-JT").getByRole("button", { name: "Buat Kiriman dari Tarif Ini" }), side: "tl" },
      ],
    })
    await normal(page)
  })

  await section("kiriman satuan", async () => {
    await page.goto(`${APP}/kasir`)
    await tall(page)
    await settle(page)
    await shot(page, "kirim-1-pengirim-penerima", {
      clip: [card(page, "pihak-senders"), card(page, "pihak-recipients")],
      marks: [
        { n: 1, loc: page.getByRole("list", { name: "Pilihan pengirim" }), pad: 2, side: "tl" },
        { n: 2, loc: page.getByRole("list", { name: "Pilihan penerima" }), pad: 2, side: "tl" },
      ],
    })
    await pickSender(page, /Ibu Siti Nisa/).click()
    await pickRecipient(page, /Rina Kartika/).click()
    await jnt(page).waitFor()
    await page.getByLabel("Isi paket", { exact: true }).fill("Pakaian")
    await shot(page, "kirim-2-detail-paket", {
      clip: card(page, "paket-judul"),
      marks: [
        { n: 3, loc: page.getByRole("button", { name: "Non-COD" }) },
        { n: 4, loc: page.getByRole("button", { name: "1 kg", exact: true }) },
        { n: 5, loc: page.getByLabel("Isi paket", { exact: true }) },
      ],
    })
    await jnt(page).click()
    await shot(page, "kirim-3-pilih-ekspedisi", { clip: card(page, "pilih-ekspedisi"), marks: [{ n: 6, loc: jnt(page), pad: 2, side: "tl" }] })
    await page.getByRole("checkbox", { name: "Isi paket bukan barang terlarang atau berbahaya" }).check()
    await page.getByRole("button", { name: "Tunai" }).click()
    await page.getByLabel("Uang diterima").fill("20000")
    const ack = page.locator("label", { hasText: "Isi paket bukan barang terlarang atau berbahaya" }).or(page.getByText("Isi paket bukan barang terlarang atau berbahaya")).first()
    if (PHONE) await phoneFrame(page, ack, card(page, "ringkasan-judul"))
    await shot(page, "kirim-4-bayar", {
      clip: PHONE ? undefined : card(page, "ringkasan-judul"),
      from: PHONE ? card(page, "ringkasan-judul") : undefined,
      marks: [
        { n: 7, loc: ["QRIS gerai", "Tunai", "Transfer", "Bayar nanti"].map((name) => page.getByRole("button", { name })), pad: 5 },
        { n: 8, loc: page.getByLabel("Uang diterima") },
        { n: 9, loc: ack, pad: 6, side: "r" },
        { n: 10, loc: primary(page, /Tandai Lunas & Cetak/), side: PHONE ? "tr" : "br" },
      ],
    })
    await primary(page, /Tandai Lunas & Cetak/).click()
    await page.getByText("Resi terbit").first().waitFor()
    await normal(page)
    await shot(page, "kirim-5-resi-terbit", {
      clip: [main(page).locator("h1").first(), main(page).locator('[data-slot="card"]').first()],
      marks: [
        { n: 11, loc: page.getByText(/AWB JT\d{10}/).first() },
        { n: 12, loc: page.getByRole("button", { name: "Cetak Label" }).first(), side: "r" },
      ],
    })
  })

  await section("cetak label", async () => {
    const onIssued = await page.getByRole("button", { name: "Cetak Label" }).first().isVisible().catch(() => false)
    if (!onIssued) {
      const list = await (await page.context().request.get(`${APP}/api/app/shipments`)).json()
      await page.goto(`${APP}/kiriman/${(list.data.items ?? list.data.rows ?? [])[0].slug}`)
    }
    await page.getByRole("button", { name: /^Cetak (Ulang )?Label/ }).first().click()
    await page.getByTitle("Pratinjau label").waitFor()
    if (PHONE) await tall(page, 1100)
    await settle(page, 1200)
    await shot(page, "cetak-1-laci", {
      clip: page.getByRole("dialog"),
      margin: 0,
      marks: [
        { n: 1, loc: page.getByRole("dialog").getByText("10×15 · Paket + Bukti").first(), pad: 10, side: "tl" },
        { n: 2, loc: page.getByTitle("Pratinjau label"), pad: 0, side: "tl" },
        { n: 3, loc: page.getByRole("button", { name: "Buka PDF / Cetak Sistem" }), side: "tl" },
      ],
    })
    await page.getByRole("button", { name: "Tutup" }).first().click()
    await normal(page)
  })

  await section("detail kiriman", async () => {
    // Self-contained: open the newest issued INV from the list (works when this section runs alone).
    const list = await (await page.context().request.get(`${APP}/api/app/shipments`)).json()
    const newest = (list.data.items ?? list.data.rows ?? [])[0]
    await page.goto(`${APP}/kiriman/${newest.slug}`)
    await page.waitForURL(/\/kiriman\/[0-9a-z]{7}$/)
    // Full desktop width: in a narrower window the stage chips are truncated ("Dibuat …") and unreadable.
    await tall(page, 1700)
    await settle(page, 700)
    const stages = page.locator('[aria-label="Tahapan proses pengiriman"]')
    await stages.waitFor()
    const statusCard = main(page).locator('[data-slot="card"]').filter({ has: stages }).first()
    await shot(page, "lacak-1-detail-inv", {
      clip: [main(page).locator("h1").first(), statusCard],
      marks: [
        { n: 2, loc: stages, pad: 4, side: "tl" },
        // Beside the button: above it sits the status headline, which the badge must not cover.
        { n: 3, loc: page.getByRole("button", { name: /Sinkronkan Status/ }).first(), side: "r" },
      ],
    })
    await normal(page)
  })

  await section("pengirim baru", async () => {
    await page.goto(`${APP}/kasir`)
    await settle(page)
    await page.getByRole("button", { name: /Pengirim baru/i }).or(card(page, "pihak-senders").getByRole("button", { name: /Baru/ })).first().click()
    const dlg = page.getByRole("dialog")
    await dlg.getByLabel("Nama pengirim asli").fill("Pak Hendra Gunawan")
    await dlg.getByLabel("Nomor WhatsApp (untuk retur & COD)").fill("081355557777")
    await shot(page, "kontak-1-pengirim-baru", {
      clip: dlg,
      margin: 0,
      marks: [
        { n: 1, loc: dlg.getByLabel("Nama pengirim asli") },
        { n: 2, loc: dlg.getByLabel("Nomor WhatsApp (untuk retur & COD)"), side: "br" },
        { n: 3, loc: dlg.getByRole("button", { name: "Simpan" }) },
      ],
    })
    await page.keyboard.press("Escape")
    await dlg.getByRole("button", { name: /Batal|Tutup/ }).first().click().catch(() => {})
  })

  await section("cod", async () => {
    await page.goto(`${APP}/kasir`)
    await tall(page)
    await settle(page)
    await page.getByRole("button", { name: "COD Barang" }).click()
    await pickSender(page, /Toko Hijab Nisa/).click()
    await pickRecipient(page, /Dewi Lestari/).click()
    await page.getByLabel("Harga barang (COD)").fill("150000")
    await jnt(page).waitFor()
    await page.getByLabel("Isi paket", { exact: true }).fill("Hijab 3 pcs")
    await settle(page, 900)
    await shot(page, "cod-1-harga-barang", {
      clip: card(page, "paket-judul"),
      marks: [
        { n: 1, loc: page.getByRole("button", { name: "COD Barang" }) },
        { n: 2, loc: page.getByLabel("Harga barang (COD)") },
        { n: 3, loc: page.locator('[aria-label="Biaya COD"]'), pad: 4 },
      ],
    })
    await jnt(page).click()
    await page.getByRole("checkbox", { name: "Isi paket bukan barang terlarang atau berbahaya" }).check()
    await settle(page, 700)
    const ringkasan = card(page, "ringkasan-judul")
    if (PHONE) await phoneFrame(page, ringkasan.getByText("Isi paket bukan barang terlarang atau berbahaya"), ringkasan)
    await shot(page, "cod-2-ringkasan", {
      clip: PHONE ? undefined : ringkasan,
      from: PHONE ? ringkasan : undefined,
      marks: [
        { n: 4, loc: [ringkasan.getByText("Ditagih kurir ke penerima"), ringkasan.getByText("Estimasi cair ke pengirim"), ringkasan.getByText(/^Rp 150\.000$/)], pad: 5, side: "r", at: PHONE ? [0.63, 0.5] : null },
        { n: 5, loc: primary(page, /Simpan & Cetak/), side: PHONE ? "tr" : "br" },
      ],
    })
    await normal(page)
  })

  await section("paket massal", async () => {
    await page.goto(`${APP}/kasir/multi`)
    await tall(page, 2000, WN)
    await page.getByText(/template/i).first().waitFor()
    await settle(page, 700)
    // The three numbered cards are regions labelled by `<id>-judul` (SectionCard); crop from the heading through the last.
    await card(page, "baris-judul").waitFor({ timeout: 15000 })
    await settle(page, 900)
    await shot(page, "massal-1-unggah", {
      clip: [main(page).locator("h1").first(), card(page, "pengirim-judul"), card(page, "layanan-judul"), card(page, "baris-judul")],
      marks: [
        // Phones: a whole card is taller than the picture, so 1 and 2 ring the card titles instead.
        { n: 1, loc: PHONE ? page.locator("#pengirim-judul") : card(page, "pengirim-judul"), pad: PHONE ? 6 : 0, side: PHONE ? "r" : "tl" },
        { n: 2, loc: PHONE ? page.locator("#layanan-judul") : card(page, "layanan-judul"), pad: PHONE ? 6 : 0, side: PHONE ? "r" : "tl" },
        { n: 3, loc: page.getByText("Unduh Template").first(), side: "r" },
        { n: 4, loc: page.getByRole("button", { name: /Unggah Excel/ }).or(page.getByText("Unggah Excel/CSV")).first(), side: "tl" },
      ],
    })
    await normal(page)
  })
  await ctx.close()
}

// --- B. Pickup & Surat Jalan, Meja Retur, Daftar Kiriman -------------------------------------------------------
{
  const { ctx, page } = await open()
  await login(page, st.kasirEmail)
  const post = api(page)
  const get = async (path) => (await (await page.context().request.get(`${APP}/api/app${path}`)).json()).data
  let ids
  const issue = async (serviceCode) => {
    ids ??= { senderId: (await get("/contacts/senders")).items[0].id, recipientId: (await get("/contacts/recipients")).items[0].id }
    const { slug } = await post("/quotes/freeze", { destinationAreaId: TEBET, weightGram: 1000, mode: "none", serviceCode })
    await post(`/shipments/${slug}/parties`, { ...ids, content: "Pakaian", prohibitedAck: true })
    await post(`/shipments/${slug}/payment`, { method: "qris" }, { "idempotency-key": `pdn${slug}pay01` })
    return { slug, awb: (await post(`/shipments/${slug}/dispatch`, {})).awb }
  }

  await section("pickup", async () => {
    const a = await issue("JT")
    const b = await issue("JT")
    await issue("SiCepat")
    await page.goto(`${APP}/kiriman?tab=pickup`)
    await tall(page, 1700, WN)
    const start = page.getByRole("listitem").filter({ hasText: "J&T" }).getByRole("button", { name: "Mulai Pindai" })
    await start.waitFor()
    await shot(page, "pickup-1-antrean", { clip: await content(page), marks: [{ n: 1, loc: start }] })
    await start.click()
    await page.getByRole("heading", { name: "Manifest J&T" }).waitFor()
    const box = page.getByLabel("Pindai barcode resi atau QR INV")
    // Scan everything this courier is waiting for (parcels issued by earlier sections too), so the screenshot shows
    // the state the guide asks for: `Belum dipindai` empty before the courier leaves.
    const waiting = main(page).locator('[data-slot="card"]').filter({ hasText: "Belum dipindai" })
    const codes = new Set([a.awb, b.awb])
    for (const t of await waiting.getByText(/JT\d{10}/).allTextContents()) codes.add(t.match(/JT\d{10}/)[0])
    if (codes.size > 6) throw new Error(`${codes.size} J&T parcels are waiting: run the pickup section on a fresh state (see README)`)
    for (const code of codes) {
      await box.fill(code)
      await box.press("Enter")
      await settle(page, 450)
    }
    // The caption promises an empty `Belum dipindai` list: do not publish the picture otherwise.
    await page.getByText("Belum dipindai (0)").waitFor({ timeout: 8000 })
    await page.getByLabel("Nama kurir").fill("Budi Kurir")
    await page.getByLabel("No HP kurir").fill("0812-9999-0000")
    await page.getByLabel("No. polisi").fill("D 1234 ABC")
    const pad = page.getByLabel("Area tanda tangan kurir")
    const pb = await pad.boundingBox()
    await page.mouse.move(pb.x + 30, pb.y + pb.height * 0.6)
    await page.mouse.down()
    for (let i = 1; i <= 14; i++) await page.mouse.move(pb.x + 30 + i * 14, pb.y + pb.height * (0.55 + 0.2 * Math.sin(i * 0.9)), { steps: 3 })
    await page.mouse.up()
    await shot(page, "pickup-2-pindai-serah", {
      clip: await content(page),
      marks: [
        { n: 2, loc: box },
        { n: 3, loc: [page.getByLabel("Nama kurir"), page.getByLabel("No HP kurir"), page.getByLabel("No. polisi")], pad: 5 },
        { n: 4, loc: pad, pad: 2, side: "r" },
        { n: 5, loc: page.getByRole("button", { name: "Selesai & Tanda Tangan" }) },
      ],
    })
    await page.getByRole("button", { name: "Selesai & Tanda Tangan" }).click()
    const sj = page.getByRole("link", { name: "Cetak Surat Jalan" })
    await sj.waitFor()
    await shot(page, "pickup-3-surat-jalan", { clip: await content(page), marks: [{ n: 6, loc: sj, side: "r" }] })
    await normal(page)
  })

  await section("retur", async () => {
    const rt = await issue("JT")
    await post("/dev/provider-status", { slug: rt.slug, category: "RETURN" })
    await page.goto(`${APP}/kiriman?tab=retur`)
    await tall(page, 2000, WN)
    await page.getByLabel("Pindai resi atau INV").fill(rt.awb)
    await shot(page, "retur-1-terima", { clip: await content(page), marks: [{ n: 1, loc: page.getByLabel("Pindai resi atau INV") }, { n: 2, loc: page.getByRole("button", { name: "Terima Paket Retur" }), side: "r" }] })
    await page.getByRole("button", { name: "Terima Paket Retur" }).click()
    await page.getByText(`INV ${rt.slug.toUpperCase()} diterima di gerai.`).waitFor()
    await page.getByRole("button", { name: "Kirim Kode Ambil" }).click()
    await page.getByRole("link", { name: "Buka WhatsApp" }).waitFor()
    // Marks belong to this INV's own card (earlier runs may have left other returned parcels on the desk).
    const row = main(page).locator('[data-slot="card"]').filter({ hasText: `INV ${rt.slug.toUpperCase()}` }).last()
    await shot(page, "retur-2-kode-ambil", {
      clip: await content(page),
      marks: [
        { n: 3, loc: row.getByRole("link", { name: "Buka WhatsApp" }) },
        { n: 4, loc: row.getByLabel("Kode Ambil") },
        { n: 5, loc: row.getByRole("button", { name: "Serahkan ke Pengirim" }), side: "r" },
      ],
    })
    await normal(page)
  })

  await section("daftar kiriman", async () => {
    await page.goto(`${APP}/kiriman`)
    await tall(page, 1900, 1240)
    await settle(page, 800)
    await shot(page, "lacak-2-daftar-kiriman", { clip: await content(page) })
    await normal(page)
  })
  await ctx.close()
}

// --- C. Owner settings (no cost or margin on these screens) ----------------------------------------------------
{
  const { ctx, page } = await open()
  await login(page, st.ownerEmail)
  const ownerScreens = [
    [
      "siap-1-mengantar",
      "/pengaturan/mengantar",
      1500,
      () => [
        { n: 1, loc: page.getByText("Sinkron otomatis aktif").first(), pad: 4, side: "tl" },
        { n: 2, loc: page.getByRole("link", { name: /Buka Mengantar/ }).or(page.getByRole("button", { name: /Buka Mengantar/ })).first(), side: "r" },
      ],
    ],
    [
      "siap-2-anggota",
      "/pengaturan/anggota",
      1300,
      () => [
        { n: 9, loc: [page.getByLabel(/Email/i).first(), page.getByRole("button", { name: /Kirim Undangan/ }).first()], pad: 6, side: "tr" },
      ],
    ],
    [
      "siap-3-printer",
      "/pengaturan/printer",
      2200,
      () => [
        {
          n: 5,
          loc: [page.locator("label", { hasText: "10×15 · Paket + Bukti" }), page.locator("label", { hasText: "Roll 58 mm" })],
          pad: 6,
          side: "tl",
        },
        { n: 6, loc: page.getByRole("button", { name: /Cetak Uji Contoh/ }).first(), side: "tl" },
        {
          n: 7,
          loc: [page.getByRole("button", { name: "Normal", exact: true }), page.getByRole("button", { name: "Tebal", exact: true })],
          pad: 6,
          side: "tl",
        },
      ],
    ],
  ]
  for (const [name, path, h, marksFn] of ownerScreens) {
    await section(name, async () => {
      await page.goto(`${APP}${path}`)
      await tall(page, h + 500, WN)
      await settle(page, 1000)
      await shot(page, name, { clip: await content(page), marks: marksFn() })
      await normal(page)
    })
  }
  await ctx.close()
}

// --- D. Registration (new visitor) -----------------------------------------------------------------------------
await section("daftar", async () => {
  const { ctx, page } = await open({ width: W, height: PHONE ? 1500 : H }, "198.51.100.91")
  // The form card (tabs + wizard); on phones the stage column is cropped to it so no empty canvas is published.
  const form = PHONE ? page.locator("[data-auth-col]") : page.locator("[data-auth-main]")
  const email = "rina.toko@contoh.test".replace("rina", `rina${Date.now().toString(36).slice(-4)}`)
  await page.goto(`${APP}/daftar-akun`)
  await page.getByLabel("Email").fill(email)
  await page.getByRole("button", { name: "Kirim Kode" }).click()
  await page.getByLabel("Kode verifikasi").waitFor()
  let code = ""
  for (let i = 0; i < 30 && !code; i++) {
    const r = await fetch(`${OWNER}/internal/dev/last-mail?to=${encodeURIComponent(email)}&template=signup_otp`, { headers: { authorization: `Bearer ${ops}` } })
    if (r.ok) code = (await r.json()).data.code
    else await new Promise((res) => setTimeout(res, 300))
  }
  await page.getByLabel("Kode verifikasi").fill(code)
  await shot(page, "daftar-2-kode", { clip: form, margin: PHONE ? 12 : 0, marks: [{ n: 3, loc: page.getByLabel("Kode verifikasi") }, { n: 4, loc: page.getByRole("button", { name: "Verifikasi" }) }] })
  await page.getByRole("button", { name: "Verifikasi" }).click()
  await page.getByLabel("Nama lengkap").fill("Bu Rina Marlina")
  await page.getByLabel("Kata sandi").fill("contoh-kuat-123")
  await shot(page, "daftar-3-akun", { clip: form, margin: PHONE ? 12 : 0, marks: [{ n: 5, loc: page.getByLabel("Nama lengkap") }, { n: 6, loc: page.getByLabel("Kata sandi") }, { n: 7, loc: page.getByRole("button", { name: "Buat Akun" }) }] })
  await page.getByRole("button", { name: "Buat Akun" }).click()
  await page.getByLabel("Nama gerai").fill(`Toko Rina Jaya ${Date.now().toString(36).slice(-2).toUpperCase()}`)
  await page.getByLabel("WhatsApp gerai").fill("081234560000")
  await page.getByLabel("Email untuk akun Mengantar").fill(email)
  await settle(page)
  await shot(page, "daftar-4-gerai", { clip: form, margin: PHONE ? 12 : 0, marks: [{ n: 8, loc: page.getByLabel("Nama gerai") }, { n: 9, loc: page.getByLabel("Email untuk akun Mengantar") }, { n: 10, loc: page.getByRole("button", { name: "Lanjut" }) }] })
  await page.getByRole("button", { name: "Lanjut" }).click()
  await page.getByLabel("Kecamatan").fill("coblong")
  await page.getByRole("option", { name: /Coblong/ }).click()
  await page.getByLabel("Alamat lengkap titik jemput").fill("Jl. Dago Asri No. 12")
  await page.getByLabel("PIC penjemputan").fill("Bu Rina")
  await page.getByRole("checkbox").check()
  await settle(page)
  await shot(page, "daftar-5-titik-jemput", { clip: form, margin: PHONE ? 12 : 0, marks: [{ n: 11, loc: page.getByLabel("Kecamatan") }, { n: 12, loc: page.getByLabel("Alamat lengkap titik jemput") }, { n: 13, loc: page.getByRole("button", { name: "Ajukan Gerai" }), side: "br" }] })
  await page.getByRole("button", { name: "Ajukan Gerai" }).click()
  await page.getByRole("heading", { name: "Status Pengajuan" }).waitFor()
  if (PHONE) await page.setViewportSize({ width: W, height: H })
  await shot(page, "daftar-6-status", { clip: page.locator("main").first(), margin: 0 })
  await ctx.close()
})

// --- E. Mini-site (what the gerai's customers see) -------------------------------------------------------------
await section("mini-site", async () => {
  const { ctx, page } = await open({ width: MS, height: PHONE ? 2600 : 1500 }, "198.51.100.92")
  await page.goto(`${SITE}/`)
  await shot(page, "minisite-1-cek-ongkir", { clip: page.locator("body") , margin: 0 })
  await page.goto(`${SITE}/kirim`)
  await page.getByLabel("Nama pengirim").fill("Ibu Siti Nisa")
  await page.getByLabel("No. WhatsApp pengirim").fill("081234567890")
  await page.getByLabel("Nama penerima").fill("Rina Kartika")
  await page.getByLabel("No. HP penerima").fill("085712348821")
  await page.getByLabel("Kecamatan penerima").fill("tebet")
  await page.getByRole("button", { name: /Tebet Barat/ }).click()
  await page.getByLabel("Alamat lengkap").fill("Jl. Tebet Barat No. 14")
  await page.getByLabel("Isi paket").fill("Pakaian")
  await page.setViewportSize({ width: MS, height: PHONE ? 3200 : 2200 })
  await shot(page, "minisite-2-kirim-dari-rumah", { clip: page.locator("main").first(), marks: [{ n: 2, loc: page.getByRole("button", { name: "Buat Kode QR" }), side: "r" }] })
  await page.getByRole("button", { name: "Buat Kode QR" }).click()
  await page.waitForURL(/\/kirim\/[0-9a-z]{7}$/)
  await page.setViewportSize({ width: MS, height: PHONE ? 1800 : 1400 })
  await shot(page, "minisite-3-kode-qr", { clip: page.locator("main").first() })
  await ctx.close()
})

// --- F. Phone views of the two screens a Kasir uses most -------------------------------------------------------
await section("hp", async () => {
  if (PHONE) return
  const { ctx, page } = await open({ width: 390, height: 844 }, "198.51.100.93")
  await login(page, st.kasirEmail)
  await page.goto(`${APP}/`)
  await shot(page, "hp-1-dashboard", {})
  await ctx.close()
})

await browser.close()
writeFileSync(`${out}/shots.json`, JSON.stringify({ inProgress: false, shots, failed }, null, 2))
console.log(`done: ${shots.length} shots, ${failed.length} failed section(s)${failed.length ? ": " + failed.join(", ") : ""}`)
if (failed.length) process.exitCode = 1
