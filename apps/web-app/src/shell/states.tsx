import { EmptyState, PageHeader, SectionCard } from "../components/admin/page"
import { LinkButton } from "../components/admin/link-button"

// Page states (visual 07 §3 legend) now come from the shared admin kit (DEC-236); these names stay for existing pages.
export { EmptyState, ErrorState, LoadingState } from "../components/admin/page"
export const PageTitle = PageHeader

/** A workspace page whose feature task has not landed yet: honest notice instead of a dead link. */
export function ComingSoon({ title, body, task }: { title: string; body: string; task: string }) {
  return (
    <div>
      <PageHeader title={title} />
      <SectionCard title="Segera hadir">
        <EmptyState title="Segera hadir" body={body} action={<LinkButton variant="outline" to="/">Kembali ke Dashboard</LinkButton>} />
        <p className="sr-only">{task}</p>
      </SectionCard>
    </div>
  )
}

export function Forbidden() {
  return (
    <div>
      <PageHeader title="Akses ditolak" />
      <SectionCard title="Menu khusus pemilik">
        <EmptyState title="Menu ini hanya untuk pemilik gerai" body="Minta pemilik gerai membuka menu ini atau mengubah peran akun Anda." action={<LinkButton variant="outline" to="/">Kembali ke Dashboard</LinkButton>} />
      </SectionCard>
    </div>
  )
}
