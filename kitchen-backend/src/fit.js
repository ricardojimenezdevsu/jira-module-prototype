/**
 * Verification of the Forge Invocation Token (FIT).
 *
 * Every Forge Remote request carries `Authorization: Bearer <FIT>`. The FIT is a JWT signed
 * by Atlassian. We check, as the Forge Remote contract requires:
 *   - the signature, against Atlassian's public JWKS
 *   - iss = "forge/invocation-token"
 *   - aud = our app ID, which comes from our own config (not from the token)
 *   - app.id inside the token matches the same configured app ID
 * jose also checks exp / nbf, so expired tokens are rejected.
 */
import { createRemoteJWKSet, jwtVerify } from 'jose';

const JWKS_URL = 'https://forge.cdn.prod.atlassian-dev.net/.well-known/jwks.json';

// createRemoteJWKSet caches the keys and refreshes them when an unknown key id shows up.
const jwks = createRemoteJWKSet(new URL(JWKS_URL));

/**
 * Verifies a FIT and returns its claims. Throws if anything is wrong.
 * @param {string} token The raw JWT from the Authorization header.
 * @param {string} appId Our app ID, e.g. "ari:cloud:ecosystem::app/<uuid>".
 * @param {Function} [keySet] Key set to verify against. Only tests pass this.
 */
export async function verifyFit(token, appId, keySet = jwks) {
  const { payload } = await jwtVerify(token, keySet, {
    audience: appId,
    issuer: 'forge/invocation-token',
  });

  if (payload.app?.id !== appId) {
    throw new Error('FIT app.id does not match the configured app ID');
  }
  // Isolated Cloud tokens are signed with a different JWKS. Not supported in this prototype.
  if (payload.icLabel) {
    throw new Error('Isolated Cloud invocations are not supported by this prototype');
  }
  return payload;
}
