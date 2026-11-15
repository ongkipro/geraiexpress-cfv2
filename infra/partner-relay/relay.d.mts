export interface RelayResult {
  status: number
  body: string | Uint8Array
  headers: Record<string, string>
}
export declare const ALLOWED_TARGETS: Set<string>
export declare function createRelay(opts: {
  secret: string
  previousSecret?: string
  upstreamOrigin: string
  fetchImpl?: (url: string, init: RequestInit) => Promise<Response>
  now?: () => number
  maxConcurrent?: number
  log?: (line: string) => void
}): { handle(method: string, path: string, headers: Record<string, string | undefined>, body: Uint8Array): Promise<RelayResult> }
