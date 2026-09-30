import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { importOffers, changeStage, saveDraft, trackerRows, snapshot } from '../../../personal-agent/service.mjs';
import { state, write, readText } from '../../../personal-agent/store.mjs';
import { offerKey } from '../../../personal-agent/domain.mjs';

function scratch(t) {
  const parent = fs.realpathSync(os.tmpdir());
  const root = fs.mkdtempSync(path.join(parent, 'career-integration-qa-'));
  // Explicit overrides inherited by the real core subprocesses must also point
  // inside this fixture. Never trust a developer's real tracker environment.
  const saved = {};
  for (const [key, value] of Object.entries({ CAREER_OPS_TRACKER: path.join(root, 'data/applications.md'), CAREER_OPS_ROOT: root, CAREER_OPS_DATA_DIR: root })) {
    saved[key] = process.env[key]; process.env[key] = value;
  }
  t.after(() => {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
    const absolute = path.resolve(root);
    assert.equal(path.dirname(absolute), parent);
    assert.ok(path.basename(absolute).startsWith('career-integration-qa-'));
    fs.rmSync(absolute, { recursive: true, force: true });
  });
  write(path.join(root, 'cv.md'), '# Synthetic Test Candidate\nPython and SQL projects.');
  return root;
}

test('fresh import proceeds through canonical tracker, versioned draft, review and manual applied', async t => {
  const root = scratch(t);
  const offer = { title: 'Stage Data Engineer', company: 'Synthetic QA Company', url: 'https://example.com/jobs/integration-501', country: 'FR', contract: 'stage', postedAt: new Date().toISOString(), description: 'Synthetic Python and SQL internship.' };
  const key = offerKey(offer.url);
  assert.deepEqual(await importOffers(root, [offer]), { added: 1, duplicates: 0 });
  assert.ok(readText(path.join(root, 'data/pipeline.md')).includes(offer.url));
  assert.equal(trackerRows(root).length, 0);

  const shortlisted = await changeStage(root, { key, stage: 'SHORTLISTED', confirmed: true }).catch(error => {
    error.message += '\nSynthetic tracker at failure:\n' + readText(path.join(root, 'data/applications.md'));
    throw error;
  });
  assert.ok(shortlisted.reportNumber);
  assert.equal(trackerRows(root).length, 1);
  assert.equal(trackerRows(root)[0].status, 'Evaluated');
  assert.equal(snapshot(root).offers[0].trackerNumber, shortlisted.reportNumber);

  const drafted = await saveDraft(root, { key, content: 'Synthetic application draft; no message will be sent.', confirmed: true });
  assert.equal(drafted.stage, 'DRAFT_READY');
  assert.ok(fs.existsSync(path.join(root, 'data/personal-documents', drafted.draft.version + '.json')));
  await assert.rejects(changeStage(root, { key, stage: 'MANUALLY_APPLIED', confirmed: true }));
  assert.equal(trackerRows(root)[0].status, 'Evaluated');

  await changeStage(root, { key, stage: 'REVIEWED', confirmed: true });
  assert.equal(state(root).offers[0].stage, 'REVIEWED');
  assert.equal(trackerRows(root)[0].status, 'Evaluated');
  await assert.rejects(changeStage(root, { key, stage: 'MANUALLY_APPLIED', confirmed: false }));
  await changeStage(root, { key, stage: 'MANUALLY_APPLIED', confirmed: true });
  assert.equal(trackerRows(root).length, 1);
  assert.equal(trackerRows(root)[0].status, 'Applied');
  assert.ok(state(root).offers[0].appliedAt);
  assert.equal(snapshot(root).offers[0].stage, 'MANUALLY_APPLIED');
  assert.ok(readText(path.join(root, 'data/status-log.tsv')).includes('Applied'));
  await assert.rejects(changeStage(root, { key, stage: 'MANUALLY_APPLIED', confirmed: true }));
  assert.equal(trackerRows(root).length, 1);
});

test('revising a reviewed draft creates history and requires another review', async t => {
  const root = scratch(t);
  write(path.join(root, 'data/applications.md'), '# Synthetic tracker\n\n| # | Date | Company | Role | Score | Status | PDF | Report | Notes |\n|---|---|---|---|---|---|---|---|---|\n');
  const offer = { title: 'Stage ML Engineer', company: 'Synthetic Revision Company', url: 'https://example.com/jobs/integration-502', country: 'MA', contract: 'stage' };
  await importOffers(root, [offer]);
  const key = offerKey(offer.url);
  await changeStage(root, { key, stage: 'SHORTLISTED', confirmed: true });
  const first = await saveDraft(root, { key, content: 'First reviewed text', confirmed: true });
  await changeStage(root, { key, stage: 'REVIEWED', confirmed: true });
  const second = await saveDraft(root, { key, content: 'Revised text needing another review', confirmed: true });
  assert.notEqual(first.draft.version, second.draft.version);
  assert.equal(second.stage, 'DRAFT_READY');
  assert.equal(fs.readdirSync(path.join(root, 'data/personal-documents')).length, 2);
  await assert.rejects(changeStage(root, { key, stage: 'MANUALLY_APPLIED', confirmed: true }));
  assert.equal(trackerRows(root)[0].status, 'Evaluated');
});
