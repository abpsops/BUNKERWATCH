/**
 * Vessel name normalizer for accurate bunker operations matching.
 * Cleans simple formatting differences:
 * - Upper/lower case
 * - Extra spaces
 * - Minor punctuation (dashes, periods, quotes, etc.)
 * - Standard maritime prefixes (MV, M/V, MT, M/T, TB)
 * - Trailing quantities if concatenated in report (e.g. "NORNS - 341.212" -> "NORNS")
 * Note: Never uses IMO and never forces match if names are distinct.
 */

export function normalizeVesselName(rawName: string | null | undefined): string {
  if (!rawName) return '';

  let cleaned = String(rawName).trim().toUpperCase();

  // If cell contains e.g. "NORNS - 341.212" or "NORNS -341.212" or "NORNS (341.212)" or "NORNS 341.212 MT"
  // Remove the trailing quantity part for vessel matching:
  cleaned = cleaned.replace(/[-–—]?\s*\d+(?:\.\d+)?\s*(?:MT|M\/T|MTS|KL)?\s*$/i, '').trim();

  // Strip common maritime prefixes only when at word boundary at start
  cleaned = cleaned.replace(/^(M\/?V|M\/?T|T\/?B|TUG|S\/?T)\s+([A-Z0-9])/i, '$2');
  cleaned = cleaned.replace(/^(M\.V\.|M\.T\.|T\.B\.)\s+([A-Z0-9])/i, '$2');

  // Replace punctuation characters with single spaces or remove them
  // e.g. "PACIFIC-STAR" -> "PACIFIC STAR", "ST. JUDE" -> "ST JUDE"
  cleaned = cleaned.replace(/[.,\/#!$%\^&\*;:{}=\-_`~()'"\[\]]/g, ' ');

  // Collapse multiple whitespaces
  cleaned = cleaned.replace(/\s+/g, ' ').trim();

  return cleaned;
}

export function cleanNumber(val: unknown): number {
  if (val === null || val === undefined || val === '') return 0;
  if (typeof val === 'number') {
    return isNaN(val) ? 0 : Math.abs(val);
  }
  let str = String(val).trim();

  // Handle accounting format e.g. (341.212) -> -341.212
  if (str.startsWith('(') && str.endsWith(')')) {
    str = '-' + str.slice(1, -1);
  }

  // Remove commas, currency symbols, and unit text like "MT", "MTS", "KL"
  str = str.replace(/[^\d.-]/g, '');
  const num = parseFloat(str);

  // In bunker supply & flow records, delivered quantities represent absolute mass
  // e.g. soundings delta of -341.212 MT means 341.212 MT supplied
  return isNaN(num) ? 0 : Math.round(Math.abs(num) * 1000) / 1000;
}

export function formatDateStr(val: unknown): string {
  if (val === null || val === undefined || val === '') return '';
  if (typeof val === 'number') {
    // Excel serial date number
    try {
      const utc_days = Math.floor(val - 25569);
      const utc_value = utc_days * 86400;
      const date_info = new Date(utc_value * 1000);
      const yyyy = date_info.getUTCFullYear();
      const mm = String(date_info.getUTCMonth() + 1).padStart(2, '0');
      const dd = String(date_info.getUTCDate()).padStart(2, '0');
      if (yyyy > 1990 && yyyy < 2100) {
        return `${yyyy}-${mm}-${dd}`;
      }
    } catch {
      // ignore
    }
  }

  const str = String(val).trim();

  // Check DD/MM/YYYY or DD-MM-YYYY
  const dmyMatch = str.match(/^(\d{1,2})[\/\.-](\d{1,2})[\/\.-](\d{4})/);
  if (dmyMatch) {
    const p1 = parseInt(dmyMatch[1], 10);
    const p2 = parseInt(dmyMatch[2], 10);
    const y = parseInt(dmyMatch[3], 10);
    // Usually DD/MM/YYYY in shipping
    if (p1 <= 31 && p2 <= 12) {
      return `${y}-${String(p2).padStart(2, '0')}-${String(p1).padStart(2, '0')}`;
    }
  }

  // Check YYYY/MM/DD or YYYY-MM-DD
  const ymdMatch = str.match(/^(\d{4})[\/\.-](\d{1,2})[\/\.-](\d{1,2})/);
  if (ymdMatch) {
    const y = parseInt(ymdMatch[1], 10);
    const m = parseInt(ymdMatch[2], 10);
    const d = parseInt(ymdMatch[3], 10);
    return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }

  // Check standard parse
  const parsed = new Date(str);
  if (!isNaN(parsed.getTime()) && parsed.getFullYear() > 1990 && parsed.getFullYear() < 2100) {
    const yyyy = parsed.getFullYear();
    const mm = String(parsed.getMonth() + 1).padStart(2, '0');
    const dd = String(parsed.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  return str;
}
