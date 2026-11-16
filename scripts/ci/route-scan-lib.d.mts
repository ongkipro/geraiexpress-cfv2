export interface ScannedRoute {
  context: "app" | "owner"
  method: string
  path: string
  auth: string
  projection: string
}
export declare const PUBLIC_ALLOWLIST: Record<"app" | "owner", string[]>
export declare function scanRoutes(routes: ScannedRoute[]): string[]
export declare const OWNER_FORBIDDEN_PATH: RegExp
export declare const OWNER_ALLOWED_VAULT_CALLS: Set<string>
export declare function scanOwnerRoutes(routes: ReadonlyArray<{ context: string; method: string; path: string }>): string[]
export declare function scanOwnerVaultCalls(files: ReadonlyArray<{ path: string; source: string }>): string[]
