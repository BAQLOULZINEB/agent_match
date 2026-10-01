const TOKEN = 'https://entreprise.francetravail.fr/connexion/oauth2/access_token?realm=/partenaire';
const BASE = 'https://api.francetravail.io/partenaire/offresdemploi/v2/offres/search';
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const string = value => typeof value === 'string' ? value : '';
function safeUrl(value) {
  try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? url.href : ''; }
  catch { return ''; }
}
async function request(fetchFn, url, options, label) {
  for (let attempt = 0; attempt < 3; attempt++) {
    let response;
    try { response = await fetchFn(url, { ...options, signal: AbortSignal.timeout(20000), redirect: 'error' }); }
    catch { throw Error(`France Travail : ${label} interrompue (réseau ou délai dépassé).`); }
    if (response.status !== 429 || attempt === 2) return response;
    const retry = response.headers?.get('retry-after');
    const delay = retry === null || retry === undefined ? 1000 * (attempt + 1)
      : /^\d+(\.\d+)?$/.test(retry) ? Number(retry) * 1000 : Math.max(0, Date.parse(retry) - Date.now());
    // Never retry earlier than requested. Long waits need a later scan.
    if (Number.isFinite(delay) && delay > 5000) throw Error('France Travail : limite de requêtes atteinte. Réessayez plus tard.');
    await sleep(Number.isFinite(delay) ? delay : 1000 * (attempt + 1));
  }
}
async function json(response) {
  try { return await response.json(); }
  catch { throw Error('France Travail : réponse JSON invalide.'); }
}
/** Read-only source lookup. All plugin hooks inject guarded ctx.fetch. */
export async function searchFranceTravail(settings = {}, fetchFn = globalThis.fetch) {
  const { clientId, clientSecret } = settings;
  if (!clientId || !clientSecret) throw Error('France Travail : renseignez le Client ID et le Client Secret dans Connexions.');
  const supplied = settings.queries ?? ['data', 'intelligence artificielle', 'machine learning'];
  if (!Array.isArray(supplied) || supplied.some(q => typeof q !== 'string' || !q.trim() || q.length > 150)) {
    throw Error('France Travail : mots-clés invalides (1 à 150 caractères par recherche).');
  }
  const queries = [...new Set(supplied.map(q => q.trim()))];
  if (!queries.length) return { offers: [], partial: false };
  const tokenResponse = await request(fetchFn, TOKEN, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'client_credentials', client_id: clientId,
      client_secret: clientSecret, scope: settings.scope || 'api_offresdemploiv2 o2dsoffre' }),
  }, 'authentification');
  if (!tokenResponse.ok) throw Error(`France Travail : authentification refusée (${tokenResponse.status}). Vérifiez l'application et ses habilitations.`);
  const token = await json(tokenResponse);
  if (!token || typeof token.access_token !== 'string' || !token.access_token) throw Error('France Travail : aucun jeton reçu.');
  const jobs = new Map(); let partial = queries.length > 5;
  const checkedAt = new Date().toISOString();
  for (const query of queries.slice(0, 5)) {
    for (let page = 0; page < 3; page++) {
      const url = new URL(BASE);
      url.searchParams.set('motsCles', query);
      url.searchParams.set('range', `${page * 100}-${page * 100 + 99}`);
      url.searchParams.set('sort', '1');
      const response = await request(fetchFn, url.href, {
        headers: { Authorization: `Bearer ${token.access_token}`, Accept: 'application/json' },
      }, 'recherche');
      if (response.status === 204 || response.status === 416) break;
      if (!response.ok) throw Error(`France Travail : recherche indisponible (${response.status}).`);
      const data = await json(response);
      if (!data || !Array.isArray(data.resultats)) throw Error('France Travail : format des offres invalide.');
      const rows = data.resultats;
      for (const offer of rows) {
        if (!offer || !string(offer.id).trim() || !string(offer.intitule).trim()) { partial = true; continue; }
        const fallback = `https://candidat.francetravail.fr/offres/recherche/detail/${encodeURIComponent(offer.id)}`;
        const sourceUrl = safeUrl(offer.origineOffre?.urlOrigine) || fallback;
        const partners = Array.isArray(offer.origineOffre?.partenaires) ? offer.origineOffre.partenaires : [];
        const partner = partners.map(p => safeUrl(p?.url)).find(Boolean);
        // Preserve apprenticeship nature even when the base contract is CDD/CDI.
        // Never infer internship from a temporary-work code such as MIS.
        const contract = [...new Set([offer.typeContratLibelle, offer.typeContrat, offer.natureContrat].filter(v => typeof v === 'string' && v.trim()))].join(' · ');
        jobs.set(offer.id, {
          id: offer.id, providerId: offer.id, title: offer.intitule,
          company: string(offer.entreprise?.nom) || 'Employeur non communiqué',
          location: string(offer.lieuTravail?.libelle), country: 'FR', url: sourceUrl,
          applicationUrl: safeUrl(offer.contact?.urlPostulation) || partner || sourceUrl,
          source: 'France Travail', postedAt: string(offer.dateCreation) || null,
          sourceUpdatedAt: string(offer.dateActualisation) || null,
          firstSeenAt: checkedAt, lastCheckedAt: checkedAt, description: string(offer.description), contract,
          liveStatus: 'unknown', eligibility: 'UNKNOWN',
        });
      }
      const range = response.headers?.get('content-range')?.match(/(\d+)-(\d+)\/(\d+|\*)/);
      const complete = range && range[3] !== '*' && Number(range[2]) + 1 >= Number(range[3]);
      if (complete || rows.length < 100 || response.status === 200) break;
      if (page === 2) partial = true;
      else await sleep(300);
    }
  }
  return { offers: [...jobs.values()], partial };
}
const run = async (ctx, query, entry = {}) => (await searchFranceTravail({
  clientId: ctx.env.FRANCE_TRAVAIL_CLIENT_ID, clientSecret: ctx.env.FRANCE_TRAVAIL_CLIENT_SECRET,
  queries: query ? [query] : entry.queries ?? ctx.settings?.queries, scope: ctx.settings?.scope,
}, ctx.fetch)).offers;
export default {
  provider: { id: 'france-travail', detect: entry => entry.provider === 'france-travail', fetch: (entry, ctx) => run(ctx, null, entry) },
  search: (query, ctx) => run(ctx, query),
};
