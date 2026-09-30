import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { defaults, normalizeOffer, assessOffer, offerKey, validateSearch, validateTransition } from '../../../personal-agent/domain.mjs';
import { state, stateFile, write, readText, propose, decide, recoverableProposals, transaction } from '../../../personal-agent/store.mjs';
import { importOffers, recordEvidence, saveDraft, changeStage, handle } from '../../../personal-agent/service.mjs';
import { searchFranceTravail } from '../../../plugins.local/france-travail/index.mjs';

const NOW = new Date('2026-09-30T12:00:00Z');
const seed = (extra = {}) => ({ title: 'Stage Data Engineer', company: 'Synthetic Employer', url: 'https://example.com/jobs/qa-101', country: 'FR', contract: 'stage', postedAt: '2026-09-30T08:00:00Z', ...extra });
function scratch(t) {
  const parent = fs.realpathSync(os.tmpdir());
  const root = fs.mkdtempSync(path.join(parent, 'career-personal-qa-'));
  t.after(() => {
    const absolute = path.resolve(root);
    assert.equal(path.dirname(absolute), parent);
    assert.ok(path.basename(absolute).startsWith('career-personal-qa-'));
    fs.rmSync(absolute, { recursive: true, force: true });
  });
  return root;
}

test('freshness keeps the exact boundary, rejects older offers and flags unknown/future dates', () => {
  const assess = postedAt => assessOffer(normalizeOffer(seed({ postedAt }), NOW), defaults, NOW);
  assert.equal(assess('2026-09-23T12:00:00Z').included, true);
  assert.equal(assess('2026-09-23T11:59:59Z').included, false);
  for (const missing of [null, 'not-a-date']) {
    assert.equal(assess(missing).included, true);
    assert.ok(assess(missing).warnings.some(x => /publication inconnue/i.test(x)));
  }
  assert.ok(assess('2026-10-03T12:00:00Z').warnings.some(x => /future/i.test(x)));
});

test('country and eligibility stay unknown without explicit source facts', () => {
  const offer = normalizeOffer(seed({ country: undefined, location: 'Paris, France', eligibility: 'ACCEPTS_MOROCCO_CONFIRMED', eligibilityEvidence: 'Invented' }), NOW);
  assert.equal(offer.country, '');
  assert.equal(offer.eligibility, 'UNKNOWN');
  assert.equal(offer.eligibilityEvidence, '');
  const review = assessOffer(offer, defaults, NOW);
  assert.ok(review.warnings.some(x => /pays/i.test(x)));
  assert.ok(review.warnings.some(x => /Maroc/i.test(x)));
  assert.equal(assessOffer(normalizeOffer(seed(), NOW), { ...defaults, countries: ['MA'] }, NOW).included, false);
});

test('known out-of-scope country is excluded instead of downgraded to unknown', () => {
  const offer = normalizeOffer(seed({ country: 'DE', location: 'Berlin' }), NOW);
  assert.equal(offer.country, 'DE');
  assert.equal(assessOffer(offer, defaults, NOW).included, false);
});

test('contract selection and seniority are enforced independently', () => {
  assert.equal(assessOffer(normalizeOffer(seed({ title: 'Alternance Data Engineer', contract: 'alternance' }), NOW), { ...defaults, contracts: ['stage'] }, NOW).included, false);
  assert.equal(assessOffer(normalizeOffer(seed({ title: 'Senior Data Engineer intern' }), NOW), defaults, NOW).included, false);
});

test('selected role filters exclude unrelated AI/Data roles', () => {
  const review = assessOffer(normalizeOffer(seed(), NOW), { ...defaults, roles: ['ML Engineer'] }, NOW);
  assert.equal(review.included, false, 'Data Engineer must not bypass an ML-only role selection');
});

test('search settings reject impossible calendar dates', () => {
  assert.throws(() => validateSearch({ ...defaults, startDate: '2026-02-31' }));
  assert.equal(validateSearch({ ...defaults, startDate: '2028-02-29' }).startDate, '2028-02-29');
});

test('canonical URL dedup covers tracking variants within and across imports', async t => {
  const root = scratch(t);
  const first = seed({ url: 'https://example.com/jobs/qa-101?utm_source=one' });
  const second = seed({ url: 'https://example.com/jobs/qa-101?utm_source=two#apply' });
  assert.equal(offerKey(first.url), offerKey(second.url));
  assert.deepEqual(await importOffers(root, [first, second]), { added: 1, duplicates: 1 });
  assert.deepEqual(await importOffers(root, [seed()]), { added: 0, duplicates: 1 });
  assert.equal(state(root).offers.length, 1);
  const pipeline = readText(path.join(root, 'data/pipeline.md'));
  assert.equal(pipeline.split('\n').filter(x => x.includes('qa-101')).length, 1);
});

test('eligibility requires quoted evidence and persists restrictions after reload', async t => {
  const root = scratch(t);
  await importOffers(root, [seed()]);
  const key = offerKey(seed().url);
  await assert.rejects(recordEvidence(root, { key, eligibility: 'ACCEPTS_MOROCCO_CONFIRMED', evidence: '  ' }));
  await assert.rejects(recordEvidence(root, { key, eligibility: 'PROBABLY', evidence: 'Maybe' }));
  assert.equal(state(root).offers[0].eligibility, 'UNKNOWN');
  await recordEvidence(root, { key, eligibility: 'EXPLICIT_RESTRICTION', evidence: 'Applicants must already have French work authorization.' });
  const reloaded = state(root).offers[0];
  assert.equal(reloaded.eligibility, 'EXPLICIT_RESTRICTION');
  assert.equal(assessOffer(reloaded, defaults, NOW).included, false);
});

test('proposals do not save candidate content without exact explicit confirmation', async t => {
  const root = scratch(t);
  write(path.join(root, 'cv.md'), '# Synthetic candidate\nOriginal facts.');
  const p = await propose(root, { target: 'cv', value: '# Synthetic candidate\nReviewed facts.', summary: 'CV correction' });
  assert.equal(readText(path.join(root, 'cv.md')), p.before);
  await assert.rejects(handle(root, { action: 'confirm', id: p.id, confirmed: false }));
  await assert.rejects(handle(root, { action: 'confirm', id: p.id, confirmed: 'yes' }));
  assert.equal(readText(path.join(root, 'cv.md')), p.before);
  assert.equal(state(root).proposals[0].status, 'pending');
  await handle(root, { action: 'confirm', id: p.id, confirmed: true });
  assert.equal(readText(path.join(root, 'cv.md')), p.after);
  assert.equal(state(root).proposals[0].status, 'approved');
  assert.ok(fs.existsSync(path.join(root, 'data/personal-versions', p.id + '.json')));
});

test('stale approval cannot overwrite externally changed CV', async t => {
  const root = scratch(t);
  write(path.join(root, 'cv.md'), 'Version one');
  const p = await propose(root, { target: 'cv', value: 'Proposed version', summary: 'Update' });
  write(path.join(root, 'cv.md'), 'Concurrent corrected version');
  await assert.rejects(decide(root, p.id, true), /changed since/i);
  assert.equal(readText(path.join(root, 'cv.md')), 'Concurrent corrected version');
  assert.equal(state(root).proposals[0].status, 'pending');
  assert.equal(fs.existsSync(path.join(root, 'data/personal-versions', p.id + '.json')), false);
});

test('reject survives a fresh process and cannot be approved later', async t => {
  const root = scratch(t);
  write(path.join(root, 'cv.md'), 'Original facts');
  const p = await propose(root, { target: 'cv', value: 'Unapproved replacement', summary: 'Reject me' });
  await decide(root, p.id, false);
  const storeURL = new URL('../../../personal-agent/store.mjs', import.meta.url).href;
  const persisted = JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', `import { state } from ${JSON.stringify(storeURL)}; process.stdout.write(JSON.stringify(state(process.argv[1])));`, root], { encoding: 'utf8', cwd: fileURLToPath(new URL('../../../', import.meta.url)) }));
  assert.equal(persisted.proposals[0].status, 'rejected');
  assert.equal(readText(path.join(root, 'cv.md')), 'Original facts');
  await assert.rejects(decide(root, p.id, true), /resolved/i);
});

test('crash journal marks an already written approved version as recovered', async t => {
  const root = scratch(t);
  write(path.join(root, 'cv.md'), 'Old');
  const p = await propose(root, { target: 'cv', value: 'Approved replacement', summary: 'Update' });
  write(path.join(root, 'data/personal-versions', p.id + '.json'), { ...p, approvedAt: NOW.toISOString() });
  write(path.join(root, 'cv.md'), p.after);
  assert.equal(recoverableProposals(root)[0].status, 'approved');
  assert.equal(readText(path.join(root, 'cv.md')), p.after);
});

test('unconfirmed draft and application actions leave state and tracker unchanged', async t => {
  const root = scratch(t);
  await importOffers(root, [seed()]);
  const key = offerKey(seed().url);
  await transaction(root, s => { s.offers[0].stage = 'REVIEWED'; s.offers[0].draft = { version: 'synthetic-v1', content: 'Synthetic reviewed draft' }; });
  const before = readText(stateFile(root));
  await assert.rejects(saveDraft(root, { key, content: 'Unapproved draft', confirmed: false }));
  await assert.rejects(changeStage(root, { key, stage: 'MANUALLY_APPLIED', confirmed: false }));
  assert.equal(readText(stateFile(root)), before);
  assert.equal(fs.existsSync(path.join(root, 'data/applications.md')), false);
  assert.equal(fs.existsSync(path.join(root, 'data/personal-documents')), false);
});

test('application transition requires reviewed draft and cannot skip review', () => {
  assert.throws(() => validateTransition('NEW', 'MANUALLY_APPLIED', { confirmed: true, hasDraft: true }));
  assert.throws(() => validateTransition('REVIEWED', 'MANUALLY_APPLIED', { confirmed: true, hasDraft: false }));
  assert.equal(validateTransition('REVIEWED', 'MANUALLY_APPLIED', { confirmed: true, hasDraft: true }), 'MANUALLY_APPLIED');
  assert.throws(() => validateTransition('MANUALLY_APPLIED', 'MANUALLY_APPLIED', { confirmed: true, hasDraft: true }));
});

test('truthy strings cannot stand in for an explicit confirmation', async t => {
  assert.throws(() => validateTransition('REVIEWED', 'MANUALLY_APPLIED', { confirmed: 'false', hasDraft: true }));
  const root = scratch(t);
  await importOffers(root, [seed()]);
  await transaction(root, s => { s.offers[0].stage = 'SHORTLISTED'; });
  await assert.rejects(saveDraft(root, { key: offerKey(seed().url), content: 'Unapproved text', confirmed: 'false' }));
  assert.equal(fs.existsSync(path.join(root, 'data/personal-documents')), false);
});

test('France Travail mock preserves posting creation date and leaves review facts unconfirmed', async () => {
  const calls = [];
  const fetchFn = async (url, options) => {
    calls.push({ url, options });
    if (calls.length === 1) return { ok: true, json: async () => ({ access_token: 'synthetic-token' }) };
    return { ok: true, status: 200, json: async () => ({ resultats: [{ id: 'QA123', intitule: 'Stage Data Engineer', entreprise: { nom: 'Synthetic Employer' }, dateCreation: '2026-09-01T10:00:00Z', dateActualisation: '2026-09-30T10:00:00Z', typeContratLibelle: 'Stage', lieuTravail: { libelle: 'Lille' } }] }) };
  };
  const result = await searchFranceTravail({ clientId: 'fake', clientSecret: 'fake', queries: ['data'] }, fetchFn);
  assert.equal(calls.length, 2);
  assert.equal(result.offers[0].postedAt, '2026-09-01T10:00:00Z');
  assert.equal(result.offers[0].country, 'FR');
  assert.equal(normalizeOffer(result.offers[0], NOW).eligibility, 'UNKNOWN');
  assert.equal(calls[1].options.headers.Authorization, 'Bearer synthetic-token');
  assert.equal(result.partial, false);
});
