// ToolRobin core copied from src/tools/timestamp/core.ts; see PROVENANCE.json.
const MAX_DATE_MILLISECONDS = 8_640_000_000_000_000;

function checkDateRange(milliseconds: number) {
  if (!Number.isSafeInteger(milliseconds) || Math.abs(milliseconds) > MAX_DATE_MILLISECONDS) {
    throw new Error('This value is outside the supported date range.');
  }
}

function formatSeconds(milliseconds: number) {
  return (milliseconds / 1000).toFixed(3).replace(/\.?0+$/u, '');
}

export interface TimestampResult { utc: string; seconds: string; milliseconds: string; }

function formatTimestampResult(milliseconds: number): TimestampResult {
  checkDateRange(milliseconds);
  const date = new Date(milliseconds);
  if (Number.isNaN(date.getTime())) throw new Error('This value is outside the supported date range.');
  return { utc: date.toISOString(), seconds: formatSeconds(milliseconds), milliseconds: String(milliseconds) };
}

export function timestampToDate(value: string, unit: 'seconds' | 'milliseconds') {
  const trimmed = value.trim();
  if (!/^-?\d{1,16}$/u.test(trimmed)) throw new Error('Enter a whole-number Unix timestamp.');
  const numeric = Number(trimmed);
  if (!Number.isSafeInteger(numeric)) throw new Error('Enter a whole-number Unix timestamp.');
  const milliseconds = unit === 'seconds' ? numeric * 1000 : numeric;
  return formatTimestampResult(milliseconds);
}

function isLeapYear(year: number) {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

export function dateToTimestamp(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?(Z|[+-]\d{2}:\d{2})$/iu.exec(value.trim());
  if (!match) throw new Error('Enter an ISO 8601 date and time with an explicit timezone.');

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  const millisecondsPart = match[7] ?? '';
  const timezone = match[8]!;
  const monthDays = [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (month < 1 || month > 12 || day < 1 || day > monthDays[month - 1]! || hour > 23 || minute > 59 || second > 59) {
    throw new Error('Enter a valid ISO 8601 date and time.');
  }

  let offsetMilliseconds = 0;
  if (!/^Z$/iu.test(timezone)) {
    const offsetHours = Number(timezone.slice(1, 3));
    const offsetMinutes = Number(timezone.slice(4, 6));
    if (offsetHours > 23 || offsetMinutes > 59) throw new Error('Enter a valid ISO 8601 timezone offset.');
    const sign = timezone[0] === '+' ? 1 : -1;
    offsetMilliseconds = sign * (offsetHours * 60 + offsetMinutes) * 60_000;
  }

  const fraction = Number((millisecondsPart + '000').slice(0, 3));
  const utc = new Date(0);
  utc.setUTCFullYear(year, month - 1, day);
  utc.setUTCHours(hour, minute, second, fraction);
  return formatTimestampResult(utc.getTime() - offsetMilliseconds);
}
