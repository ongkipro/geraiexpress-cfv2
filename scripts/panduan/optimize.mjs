#!/usr/bin/env node
// Converts the PNG shots from capture.mjs into the WebP files the `/panduan` page serves, and writes their sizes
// into apps/worker/src/brand/panduan-shots.json (the page reads width and height from there).
//   node scripts/panduan/optimize.mjs <desktop png dir> <phone png dir> [out dir = apps/web-app/public/panduan]
// No image library is installed in this repository, so the browser Playwright already uses does the encoding
// (canvas → WebP). Phone shots (`<name>-hp.png`, 2× in a 390 px window) are framed by capture.mjs; nothing is cut
// here. A phone picture taller than MAX_PHONE_PX is reported so its framing can be fixed at the source.
/* global document, Image -- used only inside page.evaluate() callbacks, which run in the browser */
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs"
import { chromium } from "@playwright/test"

const args = process.argv.slice(2)
const merge = args.includes("--merge")
const positional = args.filter((a) => a !== "--merge")
const [desk, phone] = positional
const out = positional[2] ?? "apps/web-app/public/panduan"
const QUALITY = 0.84
const MAX_PHONE_PX = 2800 // 1400 CSS px at 2×: taller than this is worth a second look
mkdirSync(out, { recursive: true })

function listPngs(dir, isPhone) {
  const manifestPath = `${dir}/shots.json`
  if (!existsSync(manifestPath)) {
    throw new Error(`missing capture manifest ${manifestPath}; rerun capture.mjs before optimize.mjs`)
  }
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"))
  if (manifest.inProgress) {
    throw new Error(`${manifestPath} is marked inProgress (capture did not finish cleanly)`)
  }
  if (Array.isArray(manifest.failed) && manifest.failed.length) {
    throw new Error(`${manifestPath} reports failed capture section(s): ${manifest.failed.join(", ")}`)
  }
  if (!Array.isArray(manifest.shots) || manifest.shots.length === 0) {
    throw new Error(`${manifestPath} has no captured shots`)
  }
  return [...new Set(manifest.shots)].map((stem) => `${stem}${isPhone ? "-hp" : ""}.png`).sort()
}

const browser = await chromium.launch({ channel: "chrome", args: ["--password-store=basic"] })
const page = await browser.newPage()
const sizes = merge ? JSON.parse(readFileSync("apps/worker/src/brand/panduan-shots.json", "utf8")) : {}
let total = 0
for (const [dir, maxH, isPhone] of [[desk, 0, false], [phone, MAX_PHONE_PX, true]]) {
  for (const f of listPngs(dir, isPhone)) {
    const png = readFileSync(`${dir}/${f}`).toString("base64")
    const r = await page.evaluate(
      async ({ png, q, maxH }) => {
        const img = new Image()
        img.src = `data:image/png;base64,${png}`
        await img.decode()
        const c = document.createElement("canvas")
        c.width = img.naturalWidth
        c.height = img.naturalHeight
        c.getContext("2d").drawImage(img, 0, 0)
        return { w: c.width, h: c.height, cut: Boolean(maxH) && img.naturalHeight > maxH, data: c.toDataURL("image/webp", q).split(",")[1] }
      },
      { png, q: QUALITY, maxH },
    )
    const stem = f.replace(/\.png$/, "")
    writeFileSync(`${out}/${stem}.webp`, Buffer.from(r.data, "base64"))
    const size = statSync(`${out}/${stem}.webp`).size
    total += size
    sizes[stem] = { w: r.w, h: r.h }
    console.log(`${stem.padEnd(36)} ${String(r.w).padStart(4)}×${String(r.h).padEnd(4)} ${String(Math.round(size / 1024)).padStart(4)} KB${r.cut ? "  (TALL: check the framing in capture.mjs)" : ""}`)
  }
}
await browser.close()
writeFileSync("apps/worker/src/brand/panduan-shots.json", `${JSON.stringify(sizes, null, 2)}\n`)
console.log(`total ${Math.round(total / 1024)} KB, ${Object.keys(sizes).length} files in ${out}`)
