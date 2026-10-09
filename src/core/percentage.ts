// ToolRobin core copied from src/tools/calculation/percentage-core.ts; see PROVENANCE.json.
export const modes = {
  percent: { name: 'Percentage of a number', a: 'Number', b: 'Percentage (%)', example: ['200', '15'], hint: 'For example, 15% of 200 is 30.' },
  share: { name: 'What percent is it?', a: 'Part', b: 'Total', example: ['30', '200'], hint: 'For example, 30 is 15% of 200. The total must be positive.' },
  change: { name: 'Percentage change', a: 'Original value', b: 'New value', example: ['200', '250'], hint: 'Positive means an increase; negative means a decrease. The original value must be positive.' },
  adjust: { name: 'Increase or decrease', a: 'Original value', b: 'Change (%)', example: ['200', '-15'], hint: 'Enter 15 to increase by 15%, or -15 to decrease by 15%.' },
  discount: { name: 'Discounted price', a: 'Original price', b: 'Discount (% off)', example: ['200', '20'], hint: 'Enter 20 for 20% off. A price of 200 becomes 160.' },
} as const;
export type Mode = keyof typeof modes;
const scale = 1_000_000n;
function parse(raw: string): bigint {
  const text = raw.trim();
  if (!/^[+-]?\d{1,15}(?:\.\d{1,6})?$/.test(text)) throw new Error('Enter a number with up to 15 integer digits and 6 decimal places, without commas, percent signs or units.');
  const [whole = '0', decimal = ''] = text.replace(/^[+-]/, '').split('.');
  return (BigInt(whole) * scale + BigInt(decimal.padEnd(6, '0'))) * (text.startsWith('-') ? -1n : 1n);
}
function render(n: bigint, d: bigint) {
  const negative = n < 0n;
  const magnitude = negative ? -n : n;
  const rounded = (magnitude * scale * 2n + d) / (d * 2n);
  const digits = (rounded % scale).toString().padStart(6, '0').replace(/0+$/, '');
  return { value: `${negative && rounded !== 0n ? '-' : ''}${rounded / scale}${digits ? '.' + digits : ''}`, approximate: magnitude * scale % d !== 0n };
}
export function calculate(mode: Mode, first: string, second: string) {
  const a = parse(first), b = parse(second);
  let n: bigint, d: bigint, formula: string;
  const x = render(a, scale).value, y = render(b, scale).value;
  let suffix = '';
  switch (mode) {
    case 'percent': n = a * b; d = scale * scale * 100n; formula = `${x} × (${y} ÷ 100)`; break;
    case 'share':
      if (b <= 0n || a < 0n) throw new Error('The total must be positive and the part cannot be negative.');
      n = a * 100n; d = b; suffix = '%'; formula = `${x} ÷ ${y} × 100%`; break;
    case 'change':
      if (a <= 0n) throw new Error('The original value must be positive to calculate percentage change.');
      n = (b - a) * 100n; d = a; suffix = '%'; formula = `(${y} − ${x}) ÷ ${x} × 100%`; break;
    case 'adjust': n = a * (100n * scale + b); d = scale * scale * 100n; formula = `${x} × (1 + ${y} ÷ 100)`; break;
    case 'discount':
      if (a < 0n || b < 0n || b > 100n * scale) throw new Error('The price cannot be negative. Enter a discount percentage from 0 to 100.');
      n = a * (100n * scale - b); d = scale * scale * 100n; formula = `${x} × (1 − ${y} ÷ 100)`; break;
    default: throw new Error('Choose a valid calculation mode.');
  }
  const result = render(n, d);
  return { ...result, value: result.value + suffix, formula };
}
