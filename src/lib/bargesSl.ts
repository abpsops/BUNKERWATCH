/**
 * Fixed watchlist behind the "BARGES -SL" (Sri Lanka) section.
 * IMO is null where the source list marks it "Not verified" — it's entered
 * on the page before that vessel can be added to the tracker.
 */
export interface BargesSlEntry {
  company: string
  vessel: string
  imo: string | null
  coverage: string
}

export const BARGES_SL: BargesSlEntry[] = [
  { company: "Interocean Energy", vessel: "MT Ocean Lanka", imo: "8904135", coverage: "CMB / GAL / HAM / TRC" },
  { company: "Interocean Energy", vessel: "MT Ocean Trinco", imo: "8817679", coverage: "CMB / GAL / HAM / TRC" },
  { company: "Interocean Energy", vessel: "MT Kandy", imo: "9004683", coverage: "CMB / GAL / HAM / TRC" },
  { company: "Lanka Marine Services", vessel: "LM Mahaweli", imo: "8505238", coverage: "Sri Lanka" },
  { company: "Lanka Marine Services", vessel: "LM Nilwala", imo: "9140334", coverage: "Sri Lanka" },
  { company: "Lanka Marine Services", vessel: "MT Kumana", imo: "9809538", coverage: "Sri Lanka / HAM" },
  { company: "Lanka IOC", vessel: "MT Southern Star", imo: "8923844", coverage: "CMB" },
  { company: "Moceti International", vessel: "MT Global Dominance", imo: "9672301", coverage: "CMB / OPL" },
  { company: "Lanka IOC", vessel: "MT Yala", imo: "9809526", coverage: "HAM / Sri Lanka" },
  { company: "Lanka IOC", vessel: "Ceylon Star", imo: "9021291", coverage: "Sri Lanka" },
]
