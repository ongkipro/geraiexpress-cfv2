// Minimal stateless MCP server over Streamable HTTP (spec 2025-06-18 / 2025-03-26): every POST carries one JSON-RPC
// message (or a batch for 2025-03-26 clients) and gets a JSON reply; no session id, no server-initiated stream (GET →
// 405). Methods: initialize, ping, tools/list, tools/call, notifications/* (202). Tool results are structured JSON
// (`structuredContent` + a JSON text block) so untrusted parcel/address strings are data, never instructions.
import { z } from "zod"

export const PROTOCOL_VERSIONS = ["2025-06-18", "2025-03-26", "2024-11-05"] as const

export interface ToolAnnotations {
  readOnlyHint?: boolean
  destructiveHint?: boolean
  idempotentHint?: boolean
  openWorldHint?: boolean
}

export interface Tool<C> {
  name: string
  title: string
  description: string
  input: z.ZodObject
  annotations: ToolAnnotations
  /** Required scope (authenticated server); public tools leave it undefined. */
  scope?: string
  run: (ctx: C, args: Record<string, unknown>) => Promise<{ ok: true; data: unknown } | { ok: false; code: string; message: string }>
}

type Rpc = { jsonrpc: "2.0"; id?: string | number | null; method?: string; params?: Record<string, unknown> }

const rpcError = (id: Rpc["id"], code: number, message: string) => ({ jsonrpc: "2.0" as const, id: id ?? null, error: { code, message } })

export function toolList<C>(tools: Tool<C>[]) {
  return tools.map((t) => ({ name: t.name, title: t.title, description: t.description, inputSchema: z.toJSONSchema(t.input, { io: "input" }), annotations: { title: t.title, ...t.annotations } }))
}

async function one<C>(msg: Rpc, ctx: C, tools: Tool<C>[], info: { name: string; title: string; instructions: string }) {
  if (msg?.jsonrpc !== "2.0" || typeof msg.method !== "string") return rpcError(msg?.id, -32600, "Invalid Request")
  const isNotification = msg.id === undefined
  if (msg.method.startsWith("notifications/")) return null
  if (isNotification) return null
  const p = msg.params ?? {}
  switch (msg.method) {
    case "initialize": {
      const asked = typeof p.protocolVersion === "string" ? p.protocolVersion : ""
      const protocolVersion = (PROTOCOL_VERSIONS as readonly string[]).includes(asked) ? asked : PROTOCOL_VERSIONS[0]
      return { jsonrpc: "2.0", id: msg.id, result: { protocolVersion, capabilities: { tools: { listChanged: false } }, serverInfo: { name: info.name, title: info.title, version: "1.0.0" }, instructions: info.instructions } }
    }
    case "ping":
      return { jsonrpc: "2.0", id: msg.id, result: {} }
    case "tools/list":
      return { jsonrpc: "2.0", id: msg.id, result: { tools: toolList(tools) } }
    case "tools/call": {
      const tool = tools.find((t) => t.name === p.name)
      if (!tool) return rpcError(msg.id, -32602, `Unknown tool: ${String(p.name)}`)
      const parsed = tool.input.safeParse(p.arguments ?? {})
      if (!parsed.success) return { jsonrpc: "2.0", id: msg.id, result: toolError("INVALID_ARGUMENTS", parsed.error.issues.map((i) => `${i.path.join(".") || "arguments"}: ${i.message}`).join("; ")) }
      const r = await tool.run(ctx, parsed.data as Record<string, unknown>)
      if (!r.ok) return { jsonrpc: "2.0", id: msg.id, result: toolError(r.code, r.message) }
      const structured = r.data && typeof r.data === "object" && !Array.isArray(r.data) ? (r.data as Record<string, unknown>) : { result: r.data }
      return { jsonrpc: "2.0", id: msg.id, result: { content: [{ type: "text", text: JSON.stringify(structured) }], structuredContent: structured, isError: false } }
    }
    default:
      return rpcError(msg.id, -32601, `Method not found: ${msg.method}`)
  }
}

const toolError = (code: string, message: string) => ({ content: [{ type: "text", text: JSON.stringify({ error: { code, message } }) }], structuredContent: { error: { code, message } }, isError: true })

/** Handles one Streamable HTTP request for an already authorized context. */
export async function serveMcp<C>(request: Request, ctx: C, tools: Tool<C>[], info: { name: string; title: string; instructions: string }): Promise<Response> {
  const headers = { "content-type": "application/json", "cache-control": "no-store" }
  if (request.method === "GET") return new Response(null, { status: 405, headers: { allow: "POST, DELETE" } })
  if (request.method === "DELETE") return new Response(null, { status: 204 })
  if (request.method !== "POST") return new Response(null, { status: 405, headers: { allow: "POST, DELETE" } })
  const version = request.headers.get("mcp-protocol-version")
  if (version && !(PROTOCOL_VERSIONS as readonly string[]).includes(version)) return Response.json(rpcError(null, -32600, `Unsupported MCP-Protocol-Version: ${version}`), { status: 400, headers })
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json(rpcError(null, -32700, "Parse error"), { status: 400, headers })
  }
  if (Array.isArray(body)) {
    if (body.length === 0 || body.length > 20) return Response.json(rpcError(null, -32600, "Invalid Request"), { status: 400, headers })
    const out = (await Promise.all(body.map((m) => one(m as Rpc, ctx, tools, info)))).filter((x) => x !== null)
    return out.length ? Response.json(out, { headers }) : new Response(null, { status: 202 })
  }
  const r = await one(body as Rpc, ctx, tools, info)
  return r ? Response.json(r, { headers }) : new Response(null, { status: 202 })
}
