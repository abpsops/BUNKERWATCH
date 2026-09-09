import { NavLink, Outlet } from "react-router-dom"
import { useState } from "react"
import { LayoutDashboard, Radar, Building2, Sailboat, Ship, FileBarChart, Search, GitCompareArrows } from "lucide-react"
import GlobalSearch from "@/components/layout/GlobalSearch"
import Logo from "@/components/ui/Logo"

const NAV_SECTIONS: {
  label: string
  items: { to: string; label: string; icon: React.ElementType; color: string }[]
}[] = [
  { label: "", items: [{ to: "/", label: "Dashboard", icon: LayoutDashboard, color: "#60A5FA" }] },
  {
    label: "Intelligence",
    items: [
      { to: "/sts-analysis", label: "Competitor Analysis", icon: Radar, color: "#C084FC" },
      { to: "/vessel-overlap", label: "Vessel Overlap", icon: GitCompareArrows, color: "#F472B6" },
      { to: "/vessel-lookup", label: "Vessel Lookup", icon: Search, color: "#38BDF8" },
    ],
  },
  {
    label: "Fleet",
    items: [
      { to: "/competitors", label: "Competitors", icon: Building2, color: "#22D3EE" },
      { to: "/barges", label: "Barges", icon: Sailboat, color: "#2DD4BF" },
      { to: "/vessels", label: "Vessels", icon: Ship, color: "#4ADE80" },
    ],
  },
  {
    label: "Reports",
    items: [{ to: "/reports", label: "Reports", icon: FileBarChart, color: "#FB923C" }],
  },
]

export default function DashboardLayout() {
  const [searchOpen, setSearchOpen] = useState(false)

  return (
    <div className="relative flex h-screen text-paper-100">
      <div className="bg-blobs" />

      <aside className="relative z-10 w-60 shrink-0 bg-navy-900 flex flex-col">
        <div className="px-5 py-5">
          <div className="flex items-center gap-2.5">
            <Logo className="h-7 w-7 text-white shrink-0" />
            <span className="font-display text-lg font-semibold tracking-tight text-white">BunkerWatch</span>
          </div>
          <p className="mt-1.5 text-[11px] text-navy-500 leading-tight">
            Competitor STS Intelligence
          </p>
        </div>
        <div className="mx-5 h-px bg-navy-700" />

        <nav className="flex-1 overflow-y-auto scrollbar-thin px-3 py-4 space-y-5">
          {NAV_SECTIONS.map((section, i) => (
            <div key={i}>
              {section.label && (
                <div className="px-2.5 mb-1.5 text-[11px] font-medium text-navy-500 tracking-wide">
                  {section.label}
                </div>
              )}
              <div className="space-y-0.5">
                {section.items.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.to === "/"}
                    style={({ isActive }) => ({ borderLeftColor: isActive ? item.color : "transparent" })}
                    className={({ isActive }) =>
                      `flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm transition-colors focus-ring border-l-2 ${
                        isActive
                          ? "bg-navy-800 text-white font-medium"
                          : "border-transparent text-navy-500 hover:bg-navy-800/60 hover:text-white"
                      }`
                    }
                  >
                    <item.icon size={15} strokeWidth={2} style={{ color: item.color }} />
                    {item.label}
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>
      </aside>

      <div className="relative z-10 flex-1 flex flex-col min-w-0">
        <header className="h-14 shrink-0 bg-white border-b border-ink-700 flex items-center justify-between px-6">
          <button
            onClick={() => setSearchOpen(true)}
            className="flex items-center gap-2 rounded-md border border-ink-700 bg-ink-950 px-3 py-1.5 text-sm text-paper-500 hover:text-paper-300 hover:border-ink-600 transition-colors w-80 focus-ring"
          >
            <Search size={14} />
            <span>Search vessel, IMO, barge, competitor…</span>
            <kbd className="ml-auto text-[10px] font-mono border border-ink-600 rounded-md px-1">/</kbd>
          </button>
          <div className="h-7 w-7 rounded-full bg-gradient-to-br from-vivid-blue to-vivid-purple flex items-center justify-center text-xs font-medium text-white shadow-sm">
            OP
          </div>
        </header>

        <main className="flex-1 overflow-y-auto scrollbar-thin">
          <Outlet />
        </main>
      </div>

      {searchOpen && <GlobalSearch onClose={() => setSearchOpen(false)} />}
    </div>
  )
}
