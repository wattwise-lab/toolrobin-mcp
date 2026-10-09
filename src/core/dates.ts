// ToolRobin core copied from src/tools/calculation/dates-core.ts; see PROVENANCE.json.
const DAY_MS=86_400_000;
export const MIN_DATE='0001-01-01',MAX_DATE='9999-12-31';
// A date is a calendar day, not a local-time instant. This avoids DST and timezone drift.
export function dateOrdinal(value:string):number {
 const match=/^(\d{4})-(\d{2})-(\d{2})$/.exec(value);if(!match)throw new Error('Enter a valid date between years 0001 and 9999.');
 const year=Number(match[1]),month=Number(match[2]),day=Number(match[3]);
 if(year<1||year>9999||month<1||month>12||day<1||day>31)throw new Error('Enter a valid date between years 0001 and 9999.');
 const date=new Date(0);date.setUTCHours(0,0,0,0);date.setUTCFullYear(year,month-1,day);
 if(date.getUTCFullYear()!==year||date.getUTCMonth()!==month-1||date.getUTCDate()!==day)throw new Error('That calendar date does not exist.');
 return date.getTime()/DAY_MS;
}
export function dateDifference(start:string,end:string,inclusive=false) {
 const difference=dateOrdinal(end)-dateOrdinal(start);return inclusive?difference+(difference<0?-1:1):difference;
}
export function addDays(start:string,offset:string) {
 if(!/^[+-]?\d{1,7}$/.test(offset.trim()))throw new Error('Enter a whole number of days, using a minus sign to go backwards.');
 const amount=Number(offset);if(Math.abs(amount)>3_652_058)throw new Error('The day offset is too large.');
 const ordinal=dateOrdinal(start)+amount;
 if(ordinal<dateOrdinal(MIN_DATE)||ordinal>dateOrdinal(MAX_DATE))throw new Error('The result is outside years 0001 to 9999.');
 return new Date(ordinal*DAY_MS).toISOString().slice(0,10);
}
