// Shared constants and server-side read-only guards for the public shareable demo account.
// The demo tenant lives in its own isolated GeraiVaultDO with simulated Mengantar rates and zero live API keys.
export const DEMO_EMAIL = "demo@geraiexpress.com"
export const DEMO_DEFAULT_PASSWORD = "geraiexpress123"
export const DEMO_TENANT_ID = "demo-tenant-001"
export const DEMO_TENANT_SLUG = "demo"
export const DEMO_TENANT_NAME = "Gerai Express Demo"
export const DEMO_SELLER_API_KEY = "gx-demo-simulated-seller-key"
export const DEMO_READ_ONLY_MESSAGE = "Akun demo bersifat hanya-baca. Daftar gerai gratis untuk menyimpan data dan mengirim paket."

export const isDemoEmail = (email: string | null | undefined): boolean => (email ?? "").trim().toLowerCase() === DEMO_EMAIL
export const isDemoTenantId = (id: string | null | undefined): boolean => id === DEMO_TENANT_ID
export const isDemoTenantSlug = (slug: string | null | undefined): boolean => (slug ?? "").trim().toLowerCase() === DEMO_TENANT_SLUG

// Only login, logout, read-only simulated quotes, and non-recording label preview/PDF are allowed on POST in demo mode.
const ALLOWED_APP_POSTS = new Set(["/api/app/auth/login", "/api/app/auth/logout", "/api/app/quotes", "/api/app/print"])
export const isDemoAllowedAppPost = (path: string): boolean => ALLOWED_APP_POSTS.has(path)
