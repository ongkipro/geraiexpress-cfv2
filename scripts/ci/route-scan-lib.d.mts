export interface ScannedRoute {
  context: "app" | "owner"
  method: string
  path: string
  auth: string
  projection: string
}
export declare const PUBLIC_ALLOWLIST: Record<"app" | "owner", string[]>
export declare function scanRoutes(routes: ScannedRoute[]): string[]
