// A one-shot authenticated dispatch for ONLINE actions that need an immediate
// answer (accepting a load: did I get it, or was it already taken?). Offline
// captures use the SyncQueue instead; this is the request/response path to the
// same POST /api/dispatch endpoint.

export type DispatchResult =
  | { ok: true; result: Record<string, unknown> }
  | { ok: false; error: { code: string; message: string } };

export async function dispatchAction(
  getIdToken: () => Promise<string | null>,
  type: string,
  payload: unknown,
  requestId: string
): Promise<DispatchResult> {
  const token = await getIdToken();
  let res: Response;
  try {
    res = await fetch('/api/dispatch', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(token !== null ? { authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ type, payload, requestId }),
    });
  } catch {
    return { ok: false, error: { code: 'network', message: 'No connection — please try again.' } };
  }
  try {
    return (await res.json()) as DispatchResult;
  } catch {
    return { ok: false, error: { code: 'unknown', message: 'Unexpected response.' } };
  }
}
