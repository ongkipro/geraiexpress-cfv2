#!/usr/bin/env node
// Local only: creates a synthetic owner + applied gerai + Super Admin on a running `wrangler dev` so screens can be
// rendered and gated (dotuiux, admin-geometry). Uses the public flows plus the local preview/ops endpoints.
import { readFileSync } from "node:fs"
const port = process.argv[2] ?? "8787"
const APP = `http://app.geraiexpress.localhost:${port}`
const OWNER = `http://owner.geraiexpress.localhost:${port}`
const ops = (readFileSync(".dev.vars", "utf8").match(/^OPS_TOKEN=(.*)$/m)?.[1] ?? "").trim().replace(/^(["'])(.*)\1$/, "$2")
const ip = `198.51.100.${Math.floor(Date.now() / 1000) % 250}`
const h = { "content-type": "application/json", origin: APP, "cf-connecting-ip": ip }
async function mail(to, template) {
  const r = await fetch(`${OWNER}/internal/dev/last-mail?to=${encodeURIComponent(to)}&template=${template}`, { headers: { authorization: `Bearer ${ops}` } })
  return (await r.json()).data
}
async function account(email, name, password) {
  // Existing account → the preview endpoint can sign in; skip sign-up (no OTP is sent to an existing address).
  const probe = await fetch(`${APP}/internal/dev/preview?token=${encodeURIComponent(ops)}&as=${encodeURIComponent(email)}&to=/`, { redirect: "manual" })
  if (probe.status === 302) return
  const r1 = await (await fetch(`${APP}/api/app/auth/signup/request`, { method: "POST", headers: h, body: JSON.stringify({ email, turnstileToken: "ok" }) })).json()
  const { code } = await mail(email, "signup_otp")
  const { data } = await (await fetch(`${APP}/api/app/auth/signup/verify`, { method: "POST", headers: h, body: JSON.stringify({ otpId: r1.data.otpId, code }) })).json()
  await fetch(`${APP}/api/app/auth/signup/complete`, { method: "POST", headers: h, body: JSON.stringify({ ticket: data.ticket, name, password }) })
}
const owner = `pemilik.preview@contoh.test`
await account(owner, "Bu Ani (contoh)", "preview-kuat-123")
const pv = await fetch(`${APP}/internal/dev/preview?token=${encodeURIComponent(ops)}&as=${encodeURIComponent(owner)}&to=/`, { redirect: "manual" })
const cookie = (pv.headers.get("set-cookie") ?? "").split(";")[0]
if (cookie) {
  await fetch(`${APP}/api/app/onboarding/application`, {
    method: "POST",
    headers: { ...h, cookie },
    body: JSON.stringify({ slug: "sinarjaya", businessName: "Sinar Jaya Cell", contactWhatsapp: "081200000001", sellerEmail: "seller.preview@contoh.test", consentMengantar: true, outlet: { name: "Berkah Jaya", picName: "Bu Ani", picPhone: "081200000001", areaId: "5fc62f5df8f44b34aa4c0d8c", areaLabel: "Dago, Coblong, Kota Bandung, Jawa Barat", streetAddress: "Jl. Contoh No. 1" } }),
  })
}
const admin = "admin.preview@contoh.test"
await account(admin, "Admin Contoh", "preview-kuat-123")
await fetch(`${OWNER}/internal/ops/bootstrap-admin`, { method: "POST", headers: { authorization: `Bearer ${ops}`, "content-type": "application/json" }, body: JSON.stringify({ email: admin }) })
console.log(JSON.stringify({ owner, admin, preview: `${OWNER}/internal/dev/preview?token=<OPS_TOKEN>&as=${admin}&to=/gerai` }))
