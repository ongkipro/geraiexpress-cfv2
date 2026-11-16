// Probe format (OBSERVABILITY.md): Probe: <name>|<url>|<expected-status>|<contains-or-TBD>|<max-latency-ms>
export const ENVS = ["local", "staging", "production"]

export function parseProbes(markdown) {
  return [...markdown.matchAll(/^Probe: ([^|]+)\|([^|]+)\|(\d{3})\|([^|]*)\|(\d+)\s*$/gm)].map((m) => ({
    name: m[1].trim(),
    url: m[2].trim(),
    status: Number(m[3]),
    contains: m[4].trim() === "TBD" ? null : m[4].trim(),
    maxMs: Number(m[5]),
  }))
}

const STAGING_PLATFORM = {
  "geraiexpress.com": "staging.geraiexpress.com",
  "app.geraiexpress.com": "app-staging.geraiexpress.com",
  "owner.geraiexpress.com": "owner-staging.geraiexpress.com",
  "hooks.geraiexpress.com": "hooks-staging.geraiexpress.com",
}

/**
 * Maps production probe URLs to an environment (spec 07 §7). The Partner relay exists only in production (M6,
 * spec 10), so `relay-health` runs only there. Unknown environments are refused by the caller.
 */
export function probeUrlsFor(probes, env, port = 8787) {
  if (!ENVS.includes(env)) throw new Error(`unknown env ${env}`)
  return probes
    .filter((p) => env === "production" || p.name !== "relay-health")
    .map((p) => {
      const u = new URL(p.url)
      const tail = `${u.pathname}${u.search}`
      let host = u.hostname
      if (env === "local") {
        host = host.replace(/geraiexpress\.com$/, "geraiexpress.localhost").replace(/geraimitra\.com$/, "geraimitra.localhost")
        return { ...p, url: `http://${host}:${port}${tail}`, maxMs: p.maxMs * 3 }
      }
      if (env === "staging") {
        const m = /^([a-z0-9-]+)\.geraimitra\.com$/.exec(host)
        host = STAGING_PLATFORM[host] ?? (m ? `${m[1]}-stg.geraimitra.com` : host)
      }
      return { ...p, url: `https://${host}${tail}` }
    })
}

export async function runProbe(p, { forceFail = false, fetchImpl = fetch } = {}) {
  const t0 = performance.now()
  if (forceFail) return { ok: false, status: null, ms: 0, reason: "kegagalan uji (--force-fail)" }
  try {
    const res = await fetchImpl(p.url, { signal: AbortSignal.timeout(Math.max(p.maxMs * 2, 3000)), redirect: "manual" })
    const body = await res.text()
    const ms = Math.round(performance.now() - t0)
    if (res.status !== p.status) return { ok: false, status: res.status, ms, reason: `status ${res.status}, seharusnya ${p.status}` }
    if (p.contains && !body.includes(p.contains)) return { ok: false, status: res.status, ms, reason: "isi respons tidak sesuai" }
    if (ms > p.maxMs) return { ok: false, status: res.status, ms, reason: `latensi ${ms} ms > ${p.maxMs} ms` }
    return { ok: true, status: res.status, ms }
  } catch (e) {
    return { ok: false, status: null, ms: Math.round(performance.now() - t0), reason: `tidak terjangkau: ${String(e?.message ?? e).slice(0, 80)}` }
  }
}

export function alertPayload(env, failed) {
  return {
    text: `GeraiExpress [${env}] probe gagal: ${failed.map((f) => `${f.probe.name} (${f.result.reason})`).join(", ")}`,
    env,
    probes: failed.map((f) => ({ name: f.probe.name, url: f.probe.url, reason: f.result.reason })),
  }
}

/** Posts to the owner's webhook; never prints the URL (a secret). */
export async function postAlert(hook, payload, fetchImpl = fetch) {
  try {
    const res = await fetchImpl(hook, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload), signal: AbortSignal.timeout(10_000) })
    return res.ok ? { ok: true, status: res.status } : { ok: false, status: res.status }
  } catch (e) {
    return { ok: false, status: null, error: e?.name ?? "Error" }
  }
}
