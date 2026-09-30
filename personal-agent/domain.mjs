import { normalizeUrl } from '../url-key.mjs';

export const defaults = {
  roles: ['AI Engineer', 'Data Engineer', 'ML Engineer', 'Data Scientist', 'GenAI Engineer'],
  countries: ['FR', 'MA'], priorityCities: ['Lille', 'Rabat', 'Salé'],
  priorityCompanies: ['Deloitte', 'Capgemini'], contracts: ['stage', 'alternance'],
  maxAgeDays: 7, scanEveryHours: 6, scheduleEnabled: false, timezone: 'Africa/Casablanca',
  startDate: '', durationMonths: null, languages: ['fr', 'en'],
};
export const cleanText = (v, max = 16000) => typeof v === 'string' ? v.replace(/\0/g, '').slice(0, max).trim() : '';
export const fold = v => cleanText(v).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
export function safeUrl(v) {
  try { const u = new URL(v); return ['https:', 'http:'].includes(u.protocol) && !u.username && !u.password ? u.href : ''; } catch { return ''; }
}
export function offerKey(v) { const u = safeUrl(v); return u ? normalizeUrl(u) : ''; }
export function validateSearch(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('Search settings must be an object.');
  const s = { ...defaults, ...value };
  for (const k of ['roles','countries','priorityCities','priorityCompanies','contracts','languages']) {
    if (!Array.isArray(s[k]) || s[k].length > 30 || s[k].some(x => typeof x !== 'string' || x.length > 120)) throw Error(`Invalid ${k}.`);
  }
  if (!s.roles.length || !s.countries.length || !s.contracts.length) throw Error('Select roles, countries and contract types.');
  if (!Number.isInteger(s.maxAgeDays) || s.maxAgeDays < 1 || s.maxAgeDays > 90) throw Error('Freshness must be 1–90 days.');
  if (!Number.isInteger(s.scanEveryHours) || s.scanEveryHours < 1 || s.scanEveryHours > 168) throw Error('Scan interval must be 1–168 hours.');
  if (s.startDate && (!/^\d{4}-\d{2}-\d{2}$/.test(s.startDate) || !Number.isFinite(new Date(s.startDate).getTime()) || new Date(s.startDate).toISOString().slice(0,10)!==s.startDate)) throw Error('Use a valid YYYY-MM-DD start date.');
  if (typeof s.scheduleEnabled !== 'boolean') throw Error('Invalid schedule.');
  return Object.fromEntries(Object.keys(defaults).map(k => [k, s[k]]));
}
export function normalizeOffer(input, now = new Date()) {
  const url = safeUrl(input.url);
  if (!url || !cleanText(input.title) || !cleanText(input.company)) throw Error('A real source URL, title and company are required.');
  const date = input.postedAt ? new Date(input.postedAt) : null;
  return { key: offerKey(url), url, applicationUrl: safeUrl(input.applicationUrl) || url,
    title: cleanText(input.title, 300), company: cleanText(input.company, 200),
    location: cleanText(input.location, 250), country: /^[A-Z]{2}$/.test(input.country||'') ? input.country : '',
    contract: cleanText(input.contract, 150), description: cleanText(input.description, 22000),
    source: cleanText(input.source, 150) || 'Import manuel',
    postedAt: date && Number.isFinite(date.getTime()) ? date.toISOString() : null,
    firstSeenAt: now.toISOString(), lastCheckedAt: now.toISOString(),
    liveStatus: 'unknown', eligibility: 'UNKNOWN', eligibilityEvidence: '', stage: 'NEW',
  };
}
export function assessOffer(offer, search = defaults, now = new Date()) {
  const s = validateSearch(search); const reasons = []; const warnings = [];
  const title = fold(offer.title), text = fold(`${offer.title} ${offer.contract} ${offer.description}`);
  const patterns={
    'ai engineer': /\b(ai|ia|intelligence artificielle|artificial intelligence)\b/,
    'data engineer': /\b(data engineer|data engineering|ingenieur.{0,15}(data|donnees)|ingenierie.{0,8}donnees|big data)\b/,
    'ml engineer': /\b(ml|machine learning|apprentissage automatique)\b/,
    'data scientist': /\b(data scien(tist|ce)|science.{0,6}donnees)\b/,
    'genai engineer': /\b(genai|generative ai|ia generative|llm|rag)\b/,
    'analytics engineer': /\b(analytics engineer|analytics engineering)\b/,
  };
  const roleHit = s.roles.some(r => patterns[fold(r)]?.test(title) || title.includes(fold(r)));
  if (!roleHit) reasons.push('Intitulé hors des métiers IA / Data sélectionnés.');
  const intern = /\b(stage|stagiaire|internship|intern|pfe)\b/.test(fold(`${offer.title} ${offer.contract}`));
  const alternate = /\b(alternance|alternant|apprentissage|apprentice|apprenticeship)\b/.test(fold(`${offer.title} ${offer.contract}`));
  if (!(intern && s.contracts.includes('stage')) && !(alternate && s.contracts.includes('alternance'))) reasons.push('Stage / alternance non établi dans le titre ou le contrat.');
  if (/\b(senior|staff|principal|head|directeur)\b/.test(title)) reasons.push('Niveau expérimenté annoncé.');
  if (!offer.country) warnings.push('Pays à vérifier.');
  else if (!s.countries.includes(offer.country)) reasons.push('Pays hors recherche.');
  if (!offer.postedAt) warnings.push('Date de publication inconnue.');
  else {
    const age = now.getTime() - new Date(offer.postedAt).getTime();
    if (age < -86400000) warnings.push('Date de publication future à vérifier.');
    if (age > s.maxAgeDays * 86400000) reasons.push(`Publication datant de plus de ${s.maxAgeDays} jours.`);
  }
  if (offer.liveStatus === 'closed') reasons.push('Offre fermée.');
  if (offer.eligibility === 'EXPLICIT_RESTRICTION' && offer.eligibilityEvidence) reasons.push('Restriction explicite : ' + offer.eligibilityEvidence);
  if (offer.eligibility === 'UNKNOWN') warnings.push('Accueil depuis le Maroc, convention et démarches : à confirmer.');
  const priority = (s.priorityCompanies.some(x => fold(offer.company).includes(fold(x))) ? 2 : 0)
    + (s.priorityCities.some(x => fold(offer.location).includes(fold(x))) ? 1 : 0);
  return { included: !reasons.length, reasons, warnings, priority,
    explanation: roleHit ? 'Correspondance de métier détectée dans le titre. Compatibilité technique à examiner avec le CV.' : 'Pas de correspondance de métier détectée.',
    keywords: ['Python','SQL','Spark','FastAPI','RAG','LangGraph','Power BI','Azure','AWS','Docker'].filter(x => text.includes(fold(x))),
  };
}
export const stages = ['NEW','SHORTLISTED','DRAFT_READY','REVIEWED','MANUALLY_APPLIED','INTERVIEW','REJECTED','CLOSED'];
export function validateTransition(from, to, {confirmed=false,hasDraft=false} = {}) {
  if (!stages.includes(to)) throw Error('Unknown review stage.');
  if (confirmed !== true) throw Error('Explicit confirmation is required.');
  if (from === to) throw Error('This decision is already recorded.');
  const next = { NEW:['SHORTLISTED','REJECTED','CLOSED'], SHORTLISTED:['DRAFT_READY','REJECTED','CLOSED'], DRAFT_READY:['REVIEWED','SHORTLISTED','REJECTED','CLOSED'], REVIEWED:['MANUALLY_APPLIED','DRAFT_READY','REJECTED','CLOSED'], MANUALLY_APPLIED:['INTERVIEW','REJECTED','CLOSED'], INTERVIEW:['REJECTED','CLOSED'], REJECTED:[], CLOSED:[] };
  if (!next[from]?.includes(to)) throw Error(`Transition ${from} → ${to} is not available.`);
  if (['DRAFT_READY','REVIEWED','MANUALLY_APPLIED'].includes(to) && !hasDraft) throw Error('Prepare and review a document draft first.');
  return to;
}
