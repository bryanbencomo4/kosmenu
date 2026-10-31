/**
 * Production schemas can lag migrations. Admin must never crash SSR because a
 * column is missing — strip the bad column and retry.
 *
 * Pure helper (no secrets) so unit tests can import it without server-only.
 */

export function extractMissingColumn(message: string): string | null {
  const patterns = [
    /column\s+[\w."]+\.([\w]+) does not exist/i,
    /column\s+"?([\w]+)"? does not exist/i,
    /Could not find the '([\w]+)' column/i,
    /Could not find the "([\w]+)" column/i,
  ];
  for (const pattern of patterns) {
    const match = message.match(pattern);
    if (match?.[1]) return match[1];
  }
  return null;
}

function stripColumnFromSelect(select: string, column: string): string | null {
  const wanted = column.toLowerCase();
  // Prefer splitting top-level commas only (avoid breaking plans(code,name)).
  const parts: string[] = [];
  let buf = '';
  let depth = 0;
  for (const ch of select) {
    if (ch === '(') depth += 1;
    if (ch === ')') depth = Math.max(0, depth - 1);
    if (ch === ',' && depth === 0) {
      if (buf.trim()) parts.push(buf.trim());
      buf = '';
      continue;
    }
    buf += ch;
  }
  if (buf.trim()) parts.push(buf.trim());

  const next = parts
    .map((part) => {
      const alias = part.split(':')[0]?.trim() ?? part;
      const leaf = alias.includes('.') ? alias.split('.').pop()! : alias;
      const bare = leaf.replace(/\(.*\)$/, '').trim().toLowerCase();
      if (bare === wanted) return null;

      // Nested: plan:plans(code,name) when missing is "name"
      const embed = part.match(/^([^:()]+:[^(]+)\((.*)\)$/);
      if (embed) {
        const fields = embed[2]
          .split(',')
          .map((field) => field.trim())
          .filter((field) => field.toLowerCase() !== wanted);
        if (fields.length === 0) return null;
        if (fields.length !== embed[2].split(',').length) {
          return `${embed[1]}(${fields.join(',')})`;
        }
      }
      return part;
    })
    .filter((part): part is string => Boolean(part));

  if (next.length === 0) return null;
  const joined = next.join(',');
  return joined === select ? null : joined;
}

type QueryResult<T> = {
  data: T | null;
  error: { message: string } | null;
};

/**
 * Runs a PostgREST select; if Postgres says a column is missing, removes that
 * column from the select list and retries (bounded).
 */
export async function selectWithMissingColumnFallback<T>(
  run: (select: string) => PromiseLike<QueryResult<T>>,
  select: string,
  options?: { maxAttempts?: number },
): Promise<{ data: T | null; selectUsed: string; stripped: string[] }> {
  const maxAttempts = Math.min(Math.max(options?.maxAttempts ?? 8, 1), 12);
  let current = select;
  const stripped: string[] = [];

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const { data, error } = await run(current);
    if (!error) {
      return { data, selectUsed: current, stripped };
    }

    const missing = extractMissingColumn(error.message);
    if (!missing) {
      throw new Error(error.message);
    }

    const next = stripColumnFromSelect(current, missing);
    if (!next) {
      throw new Error(error.message);
    }

    stripped.push(missing);
    current = next;
  }

  throw new Error(
    `Demasiadas columnas ausentes en el esquema (${stripped.join(', ')}).`,
  );
}
