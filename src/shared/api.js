export const API_URL = 'https://api.tarkov.dev/graphql';

// Posts a GraphQL query to tarkov.dev. The API sometimes answers with both
// `data` and an `errors` list (one record failed to resolve); that data is
// still usable, so only a response with no data at all is treated as a failure.
export async function gql(query, variables = {}, { timeoutMs = 20000, fetchImpl } = {}) {
  const doFetch = fetchImpl || globalThis.fetch;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await doFetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, variables }),
      signal: ctrl.signal
    });
    let body = null;
    try {
      body = await res.json();
    } catch {}
    if (body && body.data) return { data: body.data, errors: body.errors || [] };
    const err = new Error(body?.errors?.[0]?.message || `HTTP ${res.status}`);
    // A response that arrived but carried no data means the query itself was
    // rejected (e.g. the schema changed); callers can retry a simpler query.
    err.rejected = Boolean(body?.errors?.length) || res.status === 400;
    throw err;
  } catch (e) {
    if (e.name === 'AbortError') throw new Error('Request timed out', { cause: e });
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

// Runs the first query in `queries` that the API accepts and reports which
// one (`level`, 0 = first). Network failures stop immediately; only schema
// rejections fall through to the next query.
export async function gqlFirstAccepted(queries, variables, opts) {
  let lastError = null;
  for (const [level, query] of queries.entries()) {
    try {
      return { ...(await gql(query, variables, opts)), level };
    } catch (e) {
      lastError = e;
      if (!e.rejected) break;
      console.warn(
        `tarkov.dev rejected query ${level + 1}/${queries.length}: ${e.message}`
      );
    }
  }
  throw lastError || new Error('No query to run');
}
