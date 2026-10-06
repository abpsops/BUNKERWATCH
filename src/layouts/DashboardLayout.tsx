import { NavLink, Outlet, useLocation } from "react-router-dom"
import { useEffect, useState } from "react"
import { LayoutDashboard, Radar, Building2, Sailboat, Ship, FileBarChart, Search, MapPin, Target, GitCompareArrows, Menu, X } from "lucide-react"
import GlobalSearch from "@/components/layout/GlobalSearch"
import Logo from "@/components/ui/Logo"

const NAV_SECTIONS: {
  label: string
  items: { to: string; label: string; icon: React.ElementType }[]
}[] = [
  { label: "", items: [{ to: "/", label: "Dashboard", icon: LayoutDashboard }] },
  {
    label: "Intelligence",
    items: [
      { to: "/sts-analysis", label: "Competitor Analysis", icon: Radar },
      { to: "/vessel-lookup", label: "Vessel Lookup", icon: Search },
      { to: "/barge-map", label: "Barge Map", icon: MapPin },
    ],
  },
  {
    label: "Fleet",
    items: [
      { to: "/competitors", label: "Competitors", icon: Building2 },
      { to: "/barges", label: "Barges", icon: Sailboat },
      { to: "/track-fko", label: "Track -FKO", icon: Target },
      { to: "/barges-sl", label: "BARGES -SL", icon: Sailboat },
      { to: "/vessels", label: "Vessels", icon: Ship },
    ],
  },
  {
    label: "Reports",
    items: [
      { to: "/reports", label: "Reports", icon: FileBarChart },
      { to: "/reconciliation", label: "Reconciliation", icon: GitCompareArrows },
    ],
  },
]

function Rail({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <>
      <div className="px-5 pb-4 pt-5">
        <div className="flex items-center gap-2.5">
          <Logo className="h-7 w-7 shrink-0 text-white" />
          <span className="font-display text-xl font-semibold text-white">BunkerWatch</span>
        </div>
        <p className="mt-1.5 text-xs leading-tight text-navy-500">Competitor STS intelligence</p>
      </div>

      <nav className="flex-1 space-y-5 overflow-y-auto scrollbar-thin px-3 pb-4 pt-2" aria-label="Main">
        {NAV_SECTIONS.map((section, i) => (
          <div key={i}>
            {section.label && (
              <div className="mb-1 px-3 text-xs font-medium text-navy-500">{section.label}</div>
            )}
            <div className="space-y-px">
              {section.items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.to === "/"}
                  onClick={onNavigate}
                  className={({ isActive }) =>
                    `relative flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors focus-ring ${
                      isActive
                        ? "bg-navy-800 font-medium text-white before:absolute before:inset-y-1.5 before:left-0 before:w-0.5 before:rounded-full before:bg-lamp"
                        : "text-navy-500 hover:bg-navy-800/60 hover:text-white"
                    }`
                  }
                >
                  <item.icon size={16} strokeWidth={1.75} />
                  {item.label}
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </nav>
    </>
  )
}

export default function DashboardLayout() {
  const [searchOpen, setSearchOpen] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const { pathname } = useLocation()

  // Close the mobile drawer whenever the route changes.
  useEffect(() => setDrawerOpen(false), [pathname])

  return (
    <div className="flex h-screen text-paper-100">
      {/* Desktop rail */}
      <aside className="hidden w-60 shrink-0 flex-col bg-navy-900 lg:flex">
        <Rail />
      </aside>

      {/* Mobile drawer */}
      {drawerOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-navy-900/60" onClick={() => setDrawerOpen(false)} aria-hidden="true" />
          <aside className="absolute inset-y-0 left-0 flex w-64 flex-col bg-navy-900 shadow-xl">
            <button
              onClick={() => setDrawerOpen(false)}
              className="absolute right-3 top-4 rounded-md p-1 text-navy-500 hover:text-white focus-ring"
              aria-label="Close menu"
            >
              <X size={18} />
            </button>
            <Rail onNavigate={() => setDrawerOpen(false)} />
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center gap-3 border-b border-ink-700 bg-white px-4 lg:px-6">
          <button
            onClick={() => setDrawerOpen(true)}
            className="rounded-md p-1.5 text-paper-300 hover:bg-ink-800 focus-ring lg:hidden"
            aria-label="Open menu"
          >
            <Menu size={18} />
          </button>
          <button
            onClick={() => setSearchOpen(true)}
            className="flex w-full max-w-sm items-center gap-2 rounded-md border border-ink-600 bg-ink-900 px-3 py-1.5 text-sm text-paper-500 transition-colors hover:border-ink-500 hover:text-paper-300 focus-ring"
          >
            <Search size={14} />
            <span className="truncate">Search vessel, IMO, barge, competitor…</span>
            <kbd className="ml-auto hidden rounded-md border border-ink-600 bg-white px-1 font-mono text-[10px] sm:block">/</kbd>
          </button>
          <div
            className="ml-auto flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-navy-900 text-xs font-semibold text-white"
            title="Operator"
          >
            OP
          </div>
        </header>

        <main className="flex-1 overflow-y-auto scrollbar-thin pb-10">
          <Outlet />
        </main>
      </div>

      {searchOpen && <GlobalSearch onClose={() => setSearchOpen(false)} />}
    </div>
  )
}
