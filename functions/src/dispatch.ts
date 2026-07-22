import { onRequest } from 'firebase-functions/v2/https';
import { handleHttpRequest } from '@mbh/actions';
import { getDeps } from './composition.js';

// The dispatch function: all HTTP. Hosting rewrites /api/** and /health here.
// It is a thin adapter — the boundary logic is the fully-tested
// handleHttpRequest in @mbh/actions.
export const dispatch = onRequest({ region: 'europe-west2', cors: true }, async (req, res) => {
  const authorization = req.headers.authorization;
  const result = await handleHttpRequest(getDeps(), {
    method: req.method,
    path: req.path,
    ...(authorization !== undefined ? { authorization } : {}),
    body: req.body,
  });
  res.status(result.status).json(result.body);
});
