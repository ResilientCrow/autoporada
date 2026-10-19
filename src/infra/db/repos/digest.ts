const SHA256_HEX = /^[0-9a-f]{64}$/;

/** A SHA-256 given as 64 lower-case hex characters, as the bytes the database stores. */
export function sha256Bytes(hex: string): Uint8Array {
  if (!SHA256_HEX.test(hex)) throw new Error('expected a SHA-256 as 64 lower-case hex characters');
  return Uint8Array.from(Buffer.from(hex, 'hex'));
}
