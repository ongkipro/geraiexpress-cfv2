// HTTP entry for the relay container (spec 10 §5). Config only from the environment; listens on PORT (default 8080).
import { createServer } from "node:http"
import { createRelay } from "./relay.mjs"

const relay = createRelay({ secret: process.env.RELAY_SECRET, previousSecret: process.env.RELAY_SECRET_PREVIOUS, upstreamOrigin: process.env.MENGANTAR_PARTNER_ORIGIN })
createServer((req, res) => {
  const chunks = []
  let size = 0
  req.on("data", (c) => {
    size += c.length
    if (size <= 64 * 1024) chunks.push(c) // never buffer past the limit
  })
  req.on("end", async () => {
    const headers = Object.fromEntries(Object.entries(req.headers).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]))
    // Over the limit: hand the handler a body of limit + 1 bytes so it answers 413 before any signature check.
    const body = size > 64 * 1024 ? Buffer.alloc(64 * 1024 + 1) : Buffer.concat(chunks)
    const out = await relay.handle(req.method, new URL(req.url, "http://relay").pathname, headers, body)
    res.writeHead(out.status, out.headers).end(out.body)
  })
}).listen(Number(process.env.PORT ?? 8080), "0.0.0.0")
