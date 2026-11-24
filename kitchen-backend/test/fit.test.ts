// Checks the FIT rules with a locally generated key pair standing in for Atlassian's JWKS.
import { test } from 'bun:test';
import assert from 'node:assert/strict';
import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair, type JWTPayload } from 'jose';
import { verifyFit } from '../src/fit.ts';

const APP_ID = 'ari:cloud:ecosystem::app/00000000-0000-0000-0000-000000000000';

const { privateKey, publicKey } = await generateKeyPair('RS256');
const keySet = createLocalJWKSet({ keys: [{ ...(await exportJWK(publicKey)), kid: 'k1', alg: 'RS256' }] });

const sign = (claims: JWTPayload, { audience = APP_ID, issuer = 'forge/invocation-token' } = {}) =>
  new SignJWT(claims)
    .setProtectedHeader({ alg: 'RS256', kid: 'k1' })
    .setIssuedAt()
    .setExpirationTime('1m')
    .setAudience(audience)
    .setIssuer(issuer)
    .sign(privateKey);

test('accepts a token for our app', async () => {
  const claims = await verifyFit(await sign({ app: { id: APP_ID } }), APP_ID, keySet);
  assert.equal(claims.app?.id, APP_ID);
});

test('rejects a token for another app (audience)', async () => {
  const token = await sign({ app: { id: APP_ID } }, { audience: 'ari:cloud:ecosystem::app/other' });
  await assert.rejects(verifyFit(token, APP_ID, keySet));
});

test('rejects a token whose app.id does not match', async () => {
  const token = await sign({ app: { id: 'ari:cloud:ecosystem::app/other' } });
  await assert.rejects(verifyFit(token, APP_ID, keySet), /app\.id/);
});

test('rejects a token from another issuer', async () => {
  const token = await sign({ app: { id: APP_ID } }, { issuer: 'someone-else' });
  await assert.rejects(verifyFit(token, APP_ID, keySet));
});

test('rejects a token signed with a key that is not in the key set', async () => {
  const other = await generateKeyPair('RS256');
  const token = await new SignJWT({ app: { id: APP_ID } })
    .setProtectedHeader({ alg: 'RS256', kid: 'k1' })
    .setIssuedAt()
    .setExpirationTime('1m')
    .setAudience(APP_ID)
    .setIssuer('forge/invocation-token')
    .sign(other.privateKey);
  await assert.rejects(verifyFit(token, APP_ID, keySet));
});
