import { EmptyBlock, PageHead, Section } from "../components/page"

/** Menus whose content arrives with later tasks (Ringkasan/Pengawasan/Sistem TASK-208, Tarif TASK-207). */
export function PlaceholderPage({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex flex-col gap-6">
      <PageHead title={title} />
      <Section title={title}>
        <EmptyBlock title="Segera hadir" body={body} />
      </Section>
    </div>
  )
}
