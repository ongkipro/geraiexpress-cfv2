// In-app notifications (TASK-301). Rows live in the tenant object; read state is per user. Feature tasks call
// `notify(...)` through the vault RPC (`addNotification`) when something needs a human.
export type NotificationKind =
  | "webhook_inactive"
  | "discount_selisih"
  | "provider_unpaid_hold"
  | "reconciliation_needed"
  | "pickup_ready"
  | "return_waiting"
  | "member_joined"
  | "system"

export interface NotificationItem {
  id: string
  kind: NotificationKind
  title: string
  body: string | null
  link: string | null
  createdAt: number
  readAt: number | null
}

/** Only same-origin app paths are accepted as links (no open redirect through notifications). */
export function safeLink(link: string | null | undefined): string | null {
  if (!link) return null
  return /^\/[a-z0-9\-/]*(\?[a-z0-9=&\-_]*)?$/i.test(link) && !link.startsWith("//") ? link : null
}
