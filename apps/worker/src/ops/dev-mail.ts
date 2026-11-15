// Local development only (spec 12 §5: locally, mail is simulated). Lets e2e tests read the last message the mailer
// would send to an address. Refused unless GX_ENV is "local" AND the request carries the ops token.
import { timingSafeEqualStr } from "../crypto"
import { decryptString } from "../crypto/aead"
import { localMailbox } from "../email/mailer"
import { emailHash } from "../email/outbox"
import { fail, ok } from "../http/envelope"

export async function handleDevLastMail(request: Request, env: Env): Promise<Response> {
  if (env.GX_ENV !== "local") return fail(404, "NOT_FOUND", "Alamat tidak ditemukan.")
  const auth = request.headers.get("authorization") ?? ""
  if (!(await timingSafeEqualStr(auth.replace(/^Bearer /, ""), env.OPS_TOKEN))) return fail(401, "UNAUTHORIZED", "Akses ditolak.")
  const url = new URL(request.url)
  const to = url.searchParams.get("to") ?? ""
  const template = url.searchParams.get("template") ?? ""
  const hash = await emailHash(env.AUTH_SESSION_PEPPER, to)
  // Not yet dispatched → read the queued row; already dispatched → the simulated mailbox copy.
  const row = await env.DB.prepare("SELECT payload_encrypted FROM email_outbox WHERE to_email_hash = ? AND template_id = ? AND payload_encrypted IS NOT NULL ORDER BY created_at DESC, rowid DESC LIMIT 1")
    .bind(hash, template)
    .first<{ payload_encrypted: string }>()
  if (row) return ok(JSON.parse(await decryptString(env.KEK_SECRET, row.payload_encrypted, "email")))
  const sent = localMailbox.get(`${hash}:${template}`)
  return sent ? ok(sent) : fail(404, "NO_MAIL", "Tidak ada email.")
}
