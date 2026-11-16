// HTTP entry for the relay container (spec 10 §5). Config only from the environment; listens on PORT (default 8080).
// Never crashes on a bad request: client resets and malformed URLs are contained per request.
import { createServer } from "node:http"
import { createRelay } from "./relay.mjs"

const relay = createRelay({ secret: process.env.RELAY_SECRET, previousSecret: process.env.RELAY_SECRET_PREVIOUS, upstreamOrigin: process.env.MENGANTAR_PARTNER_ORIGIN })
const send = (res, status, body, headers = { "content-type": "application/json" }) => {
  if (!res.headersSent) res.writeHead(status, headers).end(body)
}
createServer((req, res) => {
  const chunks = []
  let size = 0
  req.on("error", () => send(res, 400, JSON.stringify({ success: false, code: "relay_bad_request" })))
  res.on("error", () => {})
  req.on("data", (c) => {
    size += c.length
    if (size <= 64 * 1024) chunks.push(c) // never buffer past the limit
  })
  req.on("end", async () => {
    try {
      const headers = Object.fromEntries(Object.entries(req.headers).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]))
      // Path only, without URL authority parsing (`//a:b` must not throw).
      const path = (req.url ?? "/").split("?")[0] || "/"
      // Over the limit: hand the handler a body of limit + 1 bytes so it answers 413 before any signature check.
      const body = size > 64 * 1024 ? Buffer.alloc(64 * 1024 + 1) : Buffer.concat(chunks)
      const out = await relay.handle(req.method, path, headers, body)
      send(res, out.status, out.body, out.headers)
    } catch {
      send(res, 500, JSON.stringify({ success: false, code: "relay_internal_error" }))
    }
  })
}).listen(Number(process.env.PORT ?? 8080), "0.0.0.0")
