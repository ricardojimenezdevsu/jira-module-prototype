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
import { createLocalJWKSet, createRemoteJWKSet, jwtVerify } from 'jose';
import type { FitClaims } from './types.ts';

const JWKS_URL = 'https://forge.cdn.prod.atlassian-dev.net/.well-known/jwks.json';

/** A key set jose can verify against: Atlassian's remote JWKS, or a local one in tests. */
export type KeySet = ReturnType<typeof createRemoteJWKSet> | ReturnType<typeof createLocalJWKSet>;

// createRemoteJWKSet caches the keys and refreshes them when an unknown key id shows up.
const jwks = createRemoteJWKSet(new URL(JWKS_URL));

/**
 * Verifies a FIT and returns its claims. Throws if anything is wrong.
 * @param token The raw JWT from the Authorization header.
 * @param appId Our app ID, e.g. "ari:cloud:ecosystem::app/<uuid>".
 * @param keySet Key set to verify against. Only tests pass this.
 */
export async function verifyFit(token: string, appId: string, keySet: KeySet = jwks): Promise<FitClaims> {
  const { payload } = await jwtVerify<FitClaims>(token, keySet, {
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
