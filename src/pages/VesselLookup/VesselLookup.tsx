import { useState } from "react"
import { Search, UploadCloud, Info } from "lucide-react"
import PageHeader from "@/components/ui/PageHeader"
import { parseShipTrackFile, extractBunkeringEvents, toDubaiDateTimeParts, type BunkeringExtraction } from "@/services/data/shipTrackParser"
import { formatDateDisplay } from "@/lib/dates"

/**
 * A pure search/lookup tool — separate from the per-barge Analyse-and-Save
 * flow on the Barges page. Nothing here is written to the database; it
 * just answers "does this vessel show up in this file, and if so when and
 * where" without needing to pick a barge first.
 */
export default function VesselLookup() {
  const [vesselName, setVesselName] = useState("")
  const [vesselImo, setVesselImo] = useState("")
  const [fileName, setFileName] = useState<string | null>(null)
  const [events, setEvents] = useState<BunkeringExtraction[] | null>(null)
  const [totalRows, setTotalRows] = useState(0)
  const [notShipTrack, setNotShipTrack] = useState(false)
  const [busy, setBusy] = useState(false)

  const onFile = async (f: File) => {
    setBusy(true)
    setFileName(f.name)
    setNotShipTrack(false)
    setEvents(null)
    const parsed = await parseShipTrackFile(f)
    if (!parsed.isShipTrackFormat) {
      setNotShipTrack(true)
      setBusy(false)
      return
    }
    setTotalRows(parsed.rows.length)
    setEvents(extractBunkeringEvents(parsed.rows))
    setBusy(false)
  }

  const q = vesselName.trim().toLowerCase()
  const visible = (events ?? [])
    .filter((e) => (q ? e.vesselName.toLowerCase().includes(q) : true))
    .slice()
    .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime())

  return (
    <div>
      <PageHeader
        title="Vessel Lookup"
        subtitle="Check whether a specific vessel appears in any barge's AIS export — no barge to pick, nothing gets saved."
      />

      <div className="px-6 grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-1 rounded-xl glass p-4 space-y-3 h-fit">
          <div>
            <label className="block text-xs font-medium text-paper-500 mb-1">Vessel Name</label>
            <div className="relative">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-paper-500" />
              <input
                value={vesselName}
                onChange={(e) => setVesselName(e.target.value)}
                placeholder="e.g. OCTA DIVINE"
                className="w-full bg-ink-950 border border-ink-700 rounded-md pl-8 pr-3 py-1.5 text-sm focus-ring"
              />
            </div>
            <p className="mt-1 text-[11px] text-paper-500">Also filters the results table below as you type.</p>
          </div>

          <div>
            <label className="block text-xs font-medium text-paper-500 mb-1">Vessel IMO (optional)</label>
            <input
              value={vesselImo}
              onChange={(e) => setVesselImo(e.target.value)}
              placeholder="e.g. 9612345"
              className="w-full bg-ink-950 border border-ink-700 rounded-md px-3 py-1.5 text-sm font-mono focus-ring"
            />
            {vesselImo && (
              <p className="mt-1 flex items-start gap-1 text-[11px] text-vivid-amber">
                <Info size={12} className="shrink-0 mt-0.5" />
                AIS exports don't include the other vessel's IMO — matching below is by name only. This is kept for your own reference.
              </p>
            )}
          </div>

          <label className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-ink-600 py-8 cursor-pointer hover:border-vivid-teal/60 transition-colors">
            <UploadCloud size={20} className="text-paper-500" />
            <span className="text-xs text-paper-300 text-center px-2">
              {fileName ? `Uploaded: ${fileName}` : "Drop a barge's export, or click to browse"}
            </span>
            <input
              type="file"
              accept=".csv,.xlsx,.xls"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
            />
          </label>
        </div>

        <div className="lg:col-span-2 rounded-xl glass p-4">
          {busy && <div className="text-sm text-paper-500 py-8 text-center">Analysing {fileName}…</div>}

          {!busy && notShipTrack && (
            <div className="text-sm text-vivid-red py-8 text-center">
              {fileName} isn't a recognized ShipTrackExport file — this tool only reads that format.
            </div>
          )}

          {!busy && !notShipTrack && !events && (
            <div className="text-sm text-paper-500 py-8 text-center">Upload a file to search it.</div>
          )}

          {!busy && events && (
            <div>
              <div className="flex items-center gap-4 text-xs mb-3">
                <span className="text-signal-ok">{events.length} STS Bunkering events found</span>
                <span className="text-paper-500">out of {totalRows} track points in {fileName}</span>
                {q && (
                  <span className="text-paper-300">
                    — showing {visible.length} matching "{vesselName}"
                  </span>
                )}
              </div>
              <div className="rounded-md border border-ink-700 overflow-hidden">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-ink-700 text-left font-medium text-paper-500">
                      <th className="px-3 py-2">Vessel</th>
                      <th className="px-3 py-2">Date</th>
                      <th className="px-3 py-2">Time</th>
                      <th className="px-3 py-2">Location</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visible.map((e, i) => {
                      const { date, time } = toDubaiDateTimeParts(e.timestamp)
                      return (
                        <tr key={i} className="border-b border-ink-800">
                          <td className="px-3 py-1.5 font-medium">{e.vesselName}</td>
                          <td className="px-3 py-1.5">{formatDateDisplay(date)}</td>
                          <td className="px-3 py-1.5 font-mono text-paper-500">{time}</td>
                          <td className="px-3 py-1.5 text-paper-300">{e.location || "Unknown"}</td>
                        </tr>
                      )
                    })}
                    {events.length === 0 && (
                      <tr>
                        <td colSpan={4} className="px-3 py-6 text-center text-paper-500">
                          No STS Bunkering events found in this file at all.
                        </td>
                      </tr>
                    )}
                    {events.length > 0 && visible.length === 0 && (
                      <tr>
                        <td colSpan={4} className="px-3 py-6 text-center text-paper-500">
                          No vessel matches "{vesselName}" in this file.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
