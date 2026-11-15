import { createRootRoute, createRoute, createRouter, Outlet } from "@tanstack/react-router"

// Route table for the owner SPA. Feature tasks add their routes under src/routes/** and register them here.
const rootRoute = createRootRoute({
  component: Outlet,
  notFoundComponent: NotFound,
})

function Home() {
  return (
    <main className="flex min-h-svh items-center justify-center p-4">
      <div className="flex w-full max-w-[440px] flex-col gap-2 rounded-lg border border-border p-6 text-center">
        <h1 className="text-[28px] font-semibold leading-tight">GeraiExpress · Super Admin</h1>
        <p className="text-base text-muted-foreground">Konsol platform sedang disiapkan.</p>
      </div>
    </main>
  )
}

function NotFound() {
  return (
    <main className="flex min-h-svh items-center justify-center p-4">
      <div className="flex w-full max-w-[440px] flex-col gap-2 text-center">
        <h1 className="text-[28px] font-semibold leading-tight">Halaman tidak ditemukan</h1>
        <p className="text-base text-muted-foreground">Alamat yang Anda buka tidak tersedia.</p>
      </div>
    </main>
  )
}

const indexRoute = createRoute({ getParentRoute: () => rootRoute, path: "/", component: Home })

export const routeTree = rootRoute.addChildren([indexRoute])

export const router = createRouter({ routeTree, defaultPreload: "intent" })

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router
  }
}
