import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { issueSession, verifySession, passwordMatches } from '../../src/lib/personal-auth.mjs';

const SECRET = 'synthetic-only-secret-at-least-32-characters';
const NOW = Date.parse('2026-09-30T12:00:00Z');
const TTL = 12 * 3600000;
function signed(payload) {
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return encoded + '.' + createHmac('sha256', SECRET).update(encoded).digest('base64url');
}

test('WebCrypto sessions issue unique nonces and verify with the issuing secret', async () => {
  const first = await issueSession(SECRET, NOW);
  const second = await issueSession(SECRET, NOW);
  assert.notEqual(first, second);
  assert.equal(await verifySession(first, SECRET, NOW), true);
  assert.equal(await verifySession(first, SECRET, NOW + TTL - 1), true);
  assert.equal(await verifySession(first, 'different-synthetic-secret-with-32-characters', NOW), false);
});

test('expiry boundary and dates beyond the maximum lifetime are rejected', async () => {
  const token = await issueSession(SECRET, NOW);
  assert.equal(await verifySession(token, SECRET, NOW + TTL), false);
  assert.equal(await verifySession(token, SECRET, NOW + TTL + 1), false);
  assert.equal(await verifySession(signed({ exp: NOW + TTL + 1 }), SECRET, NOW), false);
  assert.equal(await verifySession(signed({ exp: '2099-01-01' }), SECRET, NOW), false);
  assert.equal(await verifySession(signed({ nonce: 'no-expiry' }), SECRET, NOW), false);
});

test('payload and signature tampering never authenticates', async () => {
  const token = await issueSession(SECRET, NOW);
  const [payload, signature] = token.split('.');
  const changedPayload = Buffer.from(JSON.stringify({ exp: NOW + TTL - 1, nonce: 'attacker' })).toString('base64url');
  const changedSignature = (signature[0] === 'A' ? 'B' : 'A') + signature.slice(1);
  assert.equal(await verifySession(changedPayload + '.' + signature, SECRET, NOW), false);
  assert.equal(await verifySession(payload + '.' + changedSignature, SECRET, NOW), false);
});

test('malformed tokens and weak secrets fail closed', async () => {
  for (const secret of ['', undefined, 'x'.repeat(31)]) {
    await assert.rejects(issueSession(secret, NOW));
    assert.equal(await verifySession('anything', secret, NOW), false);
  }
  for (const token of ['', undefined, null, 'abc', '.', 'x.y.z', '!!!.???', 123, {}]) {
    assert.equal(await verifySession(token, SECRET, NOW), false);
  }
});

test('password checking requires exact text and an adequately long configured password', async () => {
  const password = 'Synthetic password — 123456';
  assert.equal(await passwordMatches(password, password), true);
  assert.equal(await passwordMatches(password + ' ', password), false);
  assert.equal(await passwordMatches(password.toUpperCase(), password), false);
  assert.equal(await passwordMatches('wrong', password), false);
  for (const input of [undefined, null, 123, {}, ['Synthetic password — 123456']]) {
    assert.equal(await passwordMatches(input, password), false);
  }
  for (const expected of [undefined, '', 'short', 'x'.repeat(15)]) {
    assert.equal(await passwordMatches(expected, expected), false);
  }
});
