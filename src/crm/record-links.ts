const base64UrlAlphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function encodeUuid(uuid: string): string | null {
  if (!uuidPattern.test(uuid)) return null;
  const hex = uuid.replaceAll("-", "");
  const bytes = Array.from({ length: 16 }, (_, index) => Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16));
  let bits = 0;
  let value = 0;
  let encoded = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 6) {
      bits -= 6;
      encoded += base64UrlAlphabet[(value >> bits) & 63];
      value &= (1 << bits) - 1;
    }
  }
  if (bits) encoded += base64UrlAlphabet[(value << (6 - bits)) & 63];
  return encoded;
}

export function decodeRecordId(value: string): string {
  if (uuidPattern.test(value)) return value;
  if (!/^[A-Za-z0-9_-]{22}$/.test(value)) return value;

  let bits = 0;
  let buffer = 0;
  const bytes: number[] = [];
  for (const character of value) {
    const digit = base64UrlAlphabet.indexOf(character);
    if (digit < 0) return value;
    buffer = (buffer << 6) | digit;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >> bits) & 255);
      buffer &= (1 << bits) - 1;
    }
  }
  if (bytes.length !== 16 || (bits && buffer !== 0)) return value;
  const hex = bytes.map((byte) => byte.toString(16).padStart(2, "0")).join("");
  const uuid = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  return uuidPattern.test(uuid) ? uuid : value;
}

export function compactRecordId(id: string): string {
  return encodeUuid(id) ?? id;
}

export function recordPath(kind: "lead" | "client" | "project", id: string): string {
  const section = kind === "lead" ? "leads" : kind === "client" ? "clients" : "projects";
  return `/${section}/${compactRecordId(id)}`;
}

export function compactRecordPath(path: string): string {
  const match = path.match(/^\/(leads|clients|projects)\/([0-9a-f-]{36})$/i);
  if (!match) return path;
  const section = match[1].toLowerCase();
  const kind = section === "leads" ? "lead" : section === "clients" ? "client" : "project";
  return recordPath(kind, match[2]);
}
