import type { LucideIcon } from "lucide-react"

export type KpiTone = "blue" | "cyan" | "teal" | "green" | "amber" | "orange" | "pink" | "purple" | "red"

const TONE_RULE: Record<KpiTone, string> = {
  blue: "bg-vivid-blue",
  cyan: "bg-vivid-cyan",
  teal: "bg-vivid-teal",
  green: "bg-vivid-green",
  amber: "bg-vivid-amber",
  orange: "bg-vivid-orange",
  pink: "bg-vivid-pink",
  purple: "bg-vivid-purple",
  red: "bg-vivid-red",
}

const TONE_ICON: Record<KpiTone, string> = {
  blue: "text-vivid-blue",
  cyan: "text-vivid-cyan",
  teal: "text-vivid-teal",
  green: "text-vivid-green",
  amber: "text-vivid-amber",
  orange: "text-vivid-orange",
  pink: "text-vivid-pink",
  purple: "text-vivid-purple",
  red: "text-vivid-red",
}

/**
 * One headline figure. The tone is carried by a thin left rule and the icon
 * only — the number itself stays in ink so a row of cards reads as data,
 * not as a row of coloured buttons.
 */
export default function KpiCard({
  label,
  value,
  sublabel,
  icon: Icon,
  tone = "blue",
}: {
  label: string
  value: string | number
  sublabel?: string
  icon?: LucideIcon
  tone?: KpiTone
}) {
  return (
    <div className="glass relative overflow-hidden rounded-xl py-3.5 pl-5 pr-4">
      <div className={`absolute inset-y-0 left-0 w-1 ${TONE_RULE[tone]}`} />
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs font-medium text-paper-500">{label}</div>
        {Icon && <Icon size={15} className={TONE_ICON[tone]} strokeWidth={2} />}
      </div>
      <div className="mt-1 font-display text-[28px] font-semibold leading-tight text-paper-100">{value}</div>
      {sublabel && <div className="mt-0.5 text-xs text-paper-500">{sublabel}</div>}
    </div>
  )
}
