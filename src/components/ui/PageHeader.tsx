/**
 * Title band across the top of every page: white strip with a hairline
 * underneath, title and one-line description on the left, page actions on
 * the right. Content below sits on the fog canvas.
 */
export default function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string
  subtitle?: string
  actions?: React.ReactNode
}) {
  return (
    <div className="mb-6 border-b border-ink-700 bg-white px-6 py-5">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
        <div className="min-w-0">
          <h1 className="font-display text-[26px] font-semibold leading-tight text-paper-100">{title}</h1>
          {subtitle && <p className="mt-1 max-w-2xl text-sm text-paper-500">{subtitle}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2 shrink-0">{actions}</div>}
      </div>
    </div>
  )
}
