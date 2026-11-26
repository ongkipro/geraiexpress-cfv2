#!/usr/bin/env node
// Local only: synthetic data for the /panduan screenshots on a running `wrangler dev` (mock Mengantar).
// Usage: GX_OPS_TOKEN=<local ops token> node scripts/panduan/seed.mjs [port] > state.json
// Creates one owner with a connected gerai, one invited Kasir, contacts, and a few issued shipments.
// Every name, phone and address is synthetic (AGENTS.md "Example data policy").
const port = process.argv[2] ?? "8911"
const portNum = Number(port)
if (!/^\d{1,5}$/.test(port) || portNum < 1 || portNum > 65535) throw new Error(`invalid local port: ${port}`)
const APP = `http://app.geraiexpress.localhost:${port}`
const OWNER = `http://owner.geraiexpress.localhost:${port}`
const ops = process.env.GX_OPS_TOKEN ?? ""
if (!ops) throw new Error("GX_OPS_TOKEN is required")

const jar = () => {
  let cookie = ""
  return {
    get cookie() { return cookie },
    async call(path, data, method = "POST") {
      const res = await fetch(`${APP}/api/app${path}`, {
        method,
        headers: { origin: APP, "content-type": "application/json", "cf-connecting-ip": "198.51.100.77", ...(cookie ? { cookie } : {}) },
        body: method === "GET" ? undefined : JSON.stringify(data ?? {}),
      })
      const set = res.headers.get("set-cookie")
      if (set) cookie = set.split(";")[0]
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${JSON.stringify(json).slice(0, 200)}`)
      return json.data
    },
  }
}
const mail = async (to, template) => {
  for (let i = 0; i < 30; i++) {
    const r = await fetch(`${OWNER}/internal/dev/last-mail?to=${encodeURIComponent(to)}&template=${template}`, { headers: { authorization: `Bearer ${ops}` } })
    if (r.ok) return (await r.json()).data
    await new Promise((s) => setTimeout(s, 300))
  }
  throw new Error(`no ${template} mail for ${to}`)
}

const stamp = Date.now().toString(36)
const ownerEmail = `pemilik.${stamp}@contoh.test`
const kasirEmail = `kasir.${stamp}@contoh.test`
const password = "panduan-kuat-123"

const o = jar()
const { otpId } = await o.call("/auth/signup/request", { email: ownerEmail, turnstileToken: "ok" })
const { ticket } = await o.call("/auth/signup/verify", { otpId, code: (await mail(ownerEmail, "signup_otp")).code })
await o.call("/auth/signup/complete", { ticket, name: "Bu Ani Wijaya", password })
// The slug shows in the screenshots (`berkahjaya.geraimitra.com`): keep it readable. It must be free, so a second
// run needs a fresh --persist-to folder or `GX_SLUG=<other>`.
const { slug } = await o.call("/dev/seed-tenant", { slug: process.env.GX_SLUG ?? "berkahjaya", name: "Berkah Jaya Cell", connect: true, masking: true })

const senders = []
for (const [name, phone] of [["Ibu Siti Nisa", "081234567890"], ["Toko Hijab Nisa", "081298765432"], ["Pak Budi Santoso", "081377776666"]]) {
  const s = await o.call("/contacts/senders", { name, phone })
  await o.call(`/contacts/senders/${s.item.id}/verify-wa`, {})
  senders.push(s.item.id)
}
const AREA = { areaId: "5fc64714f8f44b34aa4cdd60", areaLabel: "Tebet Barat" }
for (const [name, phone, street] of [
  ["Rina Kartika", "085712348821", "Jl. Tebet Barat No. 14"],
  ["Dewi Lestari", "085698761234", "Jl. Tebet Barat Dalam II No. 7"],
  ["Agus Prasetyo", "081311112222", "Jl. Tebet Barat IX No. 21"],
]) await o.call("/contacts/recipients", { name, phone, street, ...AREA })

await o.call("/members/invitations", { email: kasirEmail })
const inviteLink = (await mail(kasirEmail, "kasir_invite")).link
const token = inviteLink.split("/undangan/")[1]
const k = jar()
await k.call(`/auth/invitations/${token}/accept`, { name: "Rudi Hartono", password })

console.log(JSON.stringify({ port, slug, ownerEmail, kasirEmail, password, senders }, null, 2))
