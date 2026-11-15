// AES-256-GCM envelope (spec 05 §2.3) with a key derived from KEK_SECRET via HKDF-SHA256 per purpose, so any secret
// string length works and keys for different purposes never coincide. Format: "v1.<iv b64url>.<ct b64url>".
const te = new TextEncoder()
const td = new TextDecoder()

const b64u = (b: Uint8Array) => btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
const unb64u = (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0))

const keyCache = new Map<string, Promise<CryptoKey>>()

function aeadKey(kek: string, purpose: string): Promise<CryptoKey> {
  const id = `${purpose}\u0000${kek}`
  let k = keyCache.get(id)
  if (!k) {
    k = (async () => {
      const base = await crypto.subtle.importKey("raw", te.encode(kek), "HKDF", false, ["deriveKey"])
      return crypto.subtle.deriveKey(
        { name: "HKDF", hash: "SHA-256", salt: te.encode("geraiexpress-v2"), info: te.encode(purpose) },
        base,
        { name: "AES-GCM", length: 256 },
        false,
        ["encrypt", "decrypt"],
      )
    })()
    keyCache.set(id, k)
  }
  return k
}

export async function encryptString(kek: string, plaintext: string, purpose = "default"): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await aeadKey(kek, purpose), te.encode(plaintext)))
  return `v1.${b64u(iv)}.${b64u(ct)}`
}

export async function decryptString(kek: string, envelope: string, purpose = "default"): Promise<string> {
  const [v, iv, ct] = envelope.split(".")
  if (v !== "v1" || !iv || !ct) throw new Error("ENVELOPE_INVALID")
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64u(iv) }, await aeadKey(kek, purpose), unb64u(ct))
  return td.decode(pt)
}
