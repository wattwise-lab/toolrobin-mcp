// ToolRobin core copied from src/tools/password/core.ts; see PROVENANCE.json.
export type PasswordOptions = {length:number;count?:number;uppercase:boolean;lowercase:boolean;digits:boolean;symbols:boolean;excludeAmbiguous:boolean};
type RandomSource = {getRandomValues(array:Uint8Array):Uint8Array};
const groups = {
  uppercase: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  lowercase: 'abcdefghijklmnopqrstuvwxyz',
  digits: '0123456789',
  symbols: '!"#$%&\'()*+,-./:;<=>?@[\\]^_`{|}~',
};
export function passwordOptions(options:PasswordOptions) {
  const length = Number(options.length);
  const count = Number(options.count ?? 1);
  if (!Number.isInteger(length) || length < 8 || length > 64) throw new Error('Choose a length from 8 to 64 characters.');
  if (![1, 10].includes(count)) throw new Error('Generate one password or ten at once.');
  const selected = Object.entries(groups).filter(([key]) => options[key as keyof PasswordOptions]).map(([, value]) => options.excludeAmbiguous ? value.replace(/[0O1lI]/g, '') : value);
  if (!selected.length) throw new Error('Choose at least one character type.');
  return {length, count, selected, alphabet: selected.join('')};
}
// Sample uniformly over all strings that contain every selected character type.
// Reject out-of-range bytes instead of introducing modulo bias.
export function generatePasswords(options:PasswordOptions, random:RandomSource|undefined = globalThis.crypto) {
  const {length, count, selected, alphabet} = passwordOptions(options);
  if (!random?.getRandomValues) throw new Error('Secure randomness is unavailable. Try a current browser.');
  const bound = 256 - 256 % alphabet.length;
  const bytes = new Uint8Array(128);
  let offset = bytes.length;
  function next() {
    for (let attempt = 0; attempt < 4096; attempt++) {
      if (offset === bytes.length) { random.getRandomValues(bytes); offset = 0; }
      const byte = bytes[offset++]!;
      if (byte < bound) return alphabet[byte % alphabet.length]!;
    }
    throw new Error('The random source did not respond correctly. Please retry.');
  }
  const results = [];
  for (let index = 0; index < count; index++) {
    let accepted = false;
    for (let attempt = 0; attempt < 4096; attempt++) {
      let password = '';
      for (let i = 0; i < length; i++) password += next();
      if (selected.every(group => [...password].some(char => group.includes(char)))) {
        results.push(password); accepted = true; break;
      }
    }
    if (!accepted) throw new Error('Could not generate a password. Please retry.');
  }
  return results;
}
export function entropyBits(options:PasswordOptions) {
  const {length, selected, alphabet} = passwordOptions(options);
  // Inclusion-exclusion counts the permitted strings after the type constraint.
  let possibilities = 0n;
  for (let mask = 0; mask < 1 << selected.length; mask++) {
    let excluded = 0, parity = 0;
    for (let i = 0; i < selected.length; i++) if (mask & 1 << i) {excluded += selected[i]!.length; parity++;}
    const term = BigInt(alphabet.length - excluded) ** BigInt(length);
    possibilities += parity % 2 ? -term : term;
  }
  return Math.log2(Number(possibilities));
}
