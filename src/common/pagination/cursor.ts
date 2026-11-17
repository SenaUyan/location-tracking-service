/**
 * Opaque keyset-pagination cursor: the (enteredAt, id) of the last row of the previous page.
 * Encoded as base64url so clients treat it as an opaque token.
 */
export interface EntryCursor {
  enteredAt: string;
  id: string;
}

export function encodeCursor(cursor: EntryCursor): string {
  return Buffer.from(JSON.stringify([cursor.enteredAt, cursor.id])).toString('base64url');
}

export function decodeCursor(raw: string): EntryCursor | null {
  try {
    const parsed: unknown = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
    if (!Array.isArray(parsed) || parsed.length !== 2) return null;
    const [enteredAt, id] = parsed as unknown[];
    if (typeof enteredAt !== 'string' || Number.isNaN(Date.parse(enteredAt))) return null;
    if (typeof id !== 'string' || !/^\d{1,19}$/.test(id)) return null;
    return { enteredAt, id };
  } catch {
    return null;
  }
}
