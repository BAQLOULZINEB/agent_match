'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowUpRight, AudioLines, Check, ChevronRight, CircleHelp, FileText, Globe2, Link2, LoaderCircle, Mic, Plus, RefreshCw, Search, Send, ShieldCheck, Sparkles, Square, Workflow, X } from 'lucide-react';

type Tab = 'Opportunités' | 'Assistant' | 'Profil' | 'Workflow' | 'Connexions';
type Stage = 'NEW' | 'SHORTLISTED' | 'DRAFT_READY' | 'REVIEWED' | 'MANUALLY_APPLIED' | 'INTERVIEW' | 'REJECTED' | 'CLOSED';
type SearchConfig = { roles: string[]; countries: string[]; priorityCities: string[]; priorityCompanies: string[]; contracts: string[]; maxAgeDays: number; scanEveryHours: number; scheduleEnabled: boolean; timezone: string; startDate: string; durationMonths: number | null; languages: string[] };
type Proposal = { id: string; target: string; before: unknown; after: unknown; summary: string; status: string; createdAt: string; source: string };
type Offer = { key: string; url: string; applicationUrl?: string; title: string; company: string; location: string; country: string; contract: string; description: string; source: string; postedAt: string | null; firstSeenAt: string | null; lastCheckedAt: string | null; stage: Stage; eligibility: string; eligibilityEvidence?: string; draft?: { content: string; version: string }; assessment: { included: boolean; reasons: string[]; warnings: string[]; priority: number; explanation: string; keywords: string[] } };
type Conversation = { role: string; content: string };
type StudioState = { worker?: { status: string; heartbeatAt?: string; nextRunAt?: string }; profile: string; cv: string; search: SearchConfig; offers: Offer[]; proposals: Proposal[]; events: { id: string; at: string; role: string; action: string; detail: string; status: string }[]; conversations: Conversation[]; lastScan?: { finished?: string; status: string; error?: string; added?: number; companiesScanned?: number; postingsKept?: number }; connections: { ai: boolean; provider?: string; model: string; franceTravail: boolean; googleConfigured: boolean; googleConnected: boolean; googleScopes: string; redirectUri: string; hosting: string } };
type ApiPayload = Record<string, unknown>;
type GoogleItem = { title: string; date?: string; from?: string; url?: string };
type Recognition = { lang: string; continuous: boolean; interimResults: boolean; onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null; onerror: ((event: { error: string }) => void) | null; onend: (() => void) | null; start: () => void; stop: () => void; abort: () => void };
type SpeechWindow = Window & { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
const tabs: Tab[] = ['Opportunités', 'Assistant', 'Profil', 'Workflow', 'Connexions'];
const stageLabels: Record<Stage, string> = { NEW: 'À examiner', SHORTLISTED: 'Présélectionnée', DRAFT_READY: 'Brouillon prêt', REVIEWED: 'Relue', MANUALLY_APPLIED: 'Envoyée manuellement', INTERVIEW: 'Entretien', REJECTED: 'Écartée / refusée', CLOSED: 'Clôturée' };
const display = (value: unknown) => typeof value === 'string' ? value : JSON.stringify(value, null, 2);
const dateLabel = (value?: string | null) => value ? new Date(value).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' }) : 'Inconnue';
const safeLink = (value?: string) => { try { const url = new URL(value || ''); return ['https:', 'http:'].includes(url.protocol) ? url.href : undefined; } catch { return undefined; } };

async function api<T>(payload?: ApiPayload): Promise<T> {
  const response = await fetch('/api/personal', payload ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) } : { cache: 'no-store' });
  const result = await response.json();
  if (!response.ok) throw Error(typeof result.error === 'string' ? result.error : 'Action indisponible. Réessayez.');
  // Void actions (for example credential saves) return JSON null on success.
  return (result ?? {}) as T;
}

export function PersonalWorkspace() {
  const [data, setData] = useState<StudioState | null>(null);
  const [tab, setTab] = useState<Tab>('Opportunités');
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [filter, setFilter] = useState('included');
  const [query, setQuery] = useState('');
  const [selectedKey, setSelectedKey] = useState('');
  const [showImport, setShowImport] = useState(false);
  const [message, setMessage] = useState('');
  const [localReply, setLocalReply] = useState('');
  const [language, setLanguage] = useState('fr');
  const [speak, setSpeak] = useState(true);
  const [voiceAvailable, setVoiceAvailable] = useState(false);
  const [speechAvailable, setSpeechAvailable] = useState(false);
  const [listening, setListening] = useState(false);
  const [localHost, setLocalHost] = useState(true);
  const recognition = useRef<Recognition | null>(null);
  const [profileText, setProfileText] = useState('');
  const [cvText, setCvText] = useState('');
  const [searchDraft, setSearchDraft] = useState<SearchConfig | null>(null);
  const [draft, setDraft] = useState('');
  const [evidence, setEvidence] = useState('');
  const [eligibility, setEligibility] = useState('UNKNOWN');
  const [confirmation, setConfirmation] = useState<{ title: string; detail: string; payload: ApiPayload; preview?: string } | null>(null);
  const [googleItems, setGoogleItems] = useState<{ app: string; items: GoogleItem[] } | null>(null);
  const dialog = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!confirmation) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busyRef.current) setConfirmation(null);
      if (event.key !== 'Tab') return;
      const controls = dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled), textarea:not(:disabled), select:not(:disabled)');
      if (!controls?.length) { event.preventDefault(); return; }
      const first = controls[0], last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('keydown', onKey); previous?.focus(); };
  }, [confirmation]);

  const refresh = useCallback(async (initialize = false) => {
    const next = await api<StudioState>();
    setData(next);
    if (initialize) { setProfileText(next.profile); setCvText(next.cv); setSearchDraft(next.search); }
    return next;
  }, []);

  useEffect(() => {
    void refresh(true).catch((e: unknown) => setError(e instanceof Error ? e.message : 'Chargement impossible.'));
    const browser = window as SpeechWindow;
    setLocalHost(['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname));
    setVoiceAvailable(!!(browser.SpeechRecognition || browser.webkitSpeechRecognition));
    setSpeechAvailable('speechSynthesis' in window);
    return () => { recognition.current?.abort(); if ('speechSynthesis' in window) window.speechSynthesis.cancel(); };
  }, [refresh]);

  const act = async <T,>(payload: ApiPayload, success?: string): Promise<T | null> => {
    if (busyRef.current) return null;
    busyRef.current = true; setBusy(true); setError(''); setNotice('');
    try {
      const result = await api<T>(payload);
      try { await refresh(); } catch { setError('Action terminée, mais la vue n’a pas pu être actualisée. Actualisez avant de recommencer.'); }
      if (success) setNotice(success);
      return result;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Action impossible.');
      // Failed scans and AI calls can still append a meaningful workflow event.
      try { await refresh(); } catch { /* Preserve the original action error. */ }
      return null;
    }
    finally { busyRef.current = false; setBusy(false); }
  };
  const selected = data?.offers.find(o => o.key === selectedKey);
  const selectOffer = (offer: Offer) => { if (busyRef.current) return; setSelectedKey(offer.key); setDraft(offer.draft?.content || ''); setEligibility(offer.eligibility); setEvidence(offer.eligibilityEvidence || ''); };
  const pending = data?.proposals.filter(p => p.status === 'pending') || [];
  const offers = (data?.offers || []).filter(o => (filter === 'all' || (filter === 'included' ? o.assessment.included : !o.assessment.included)) && `${o.title} ${o.company} ${o.location}`.toLowerCase().includes(query.toLowerCase())).sort((a, b) => b.assessment.priority - a.assessment.priority);

  function dictate() {
    if (listening) { recognition.current?.stop(); return; }
    const browser = window as SpeechWindow;
    const Constructor = browser.SpeechRecognition || browser.webkitSpeechRecognition;
    if (!Constructor) { setError('La dictée n’est pas disponible dans ce navigateur. Utilisez le clavier.'); return; }
    const instance = new Constructor();
    instance.lang = language === 'fr' ? 'fr-FR' : 'en-US'; instance.continuous = false; instance.interimResults = false;
    instance.onresult = event => {
      const text = Array.from(event.results).map(result => result[0]?.transcript || '').join(' ');
      const combined = `${message.trim()}${message.trim() ? ' ' : ''}${text}`.trim();
      setMessage(combined);
      setNotice('J’ai compris votre demande. Je l’envoie à l’assistant ; les modifications resteront à confirmer.');
      void sendChat(combined);
    };
    instance.onerror = event => { setListening(false); setError(`Dictée interrompue (${event.error}). Vérifiez l’autorisation du micro ou utilisez le clavier.`); };
    instance.onend = () => setListening(false);
    recognition.current = instance;
    try { instance.start(); setListening(true); setError(''); } catch { setError('Impossible de démarrer le micro. Réessayez ou utilisez le clavier.'); }
  }
  const sendChat = async (spoken?: string) => {
    const text = (spoken ?? message).trim(); if (!text) return;
    const result = await act<{ reply: string; mode: string }>({ action: 'chat', message: text, language });
    if (result) {
      setMessage(''); setLocalReply(result.mode === 'setup' ? result.reply : '');
      if (speak && speechAvailable) {
        window.speechSynthesis.cancel(); const utterance = new SpeechSynthesisUtterance(result.reply); utterance.lang = language === 'fr' ? 'fr-FR' : 'en-US';
        utterance.onerror = () => setNotice('La lecture vocale a été interrompue. La réponse reste disponible à l’écran.');
        window.speechSynthesis.speak(utterance);
      }
    }
  };
  const propose = (target: string, value: unknown) => {
    // A blank optional list means no priorities, never a matching empty string.
    const cleaned = target === 'search' && value && typeof value === 'object'
      ? Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, Array.isArray(entry) ? entry.map(String).map(item => item.trim()).filter(Boolean) : entry]))
      : value;
    void act({ action: 'propose', target, value: cleaned, summary: `Modification du ${target === 'cv' ? 'CV' : target === 'profile' ? 'profil' : 'périmètre de recherche'}` }, 'Aperçu créé. Confirmez la proposition ci-dessous pour enregistrer.');
  };
  const downloadReviewed = async () => {
    if (!selected?.draft || busyRef.current) return;
    busyRef.current = true; setBusy(true); setError('');
    try {
      const response = await fetch(`/api/personal/document?version=${encodeURIComponent(selected.draft.version)}`, { cache: 'no-store' });
      if (!response.ok) {
        const result = await response.json();
        throw Error(typeof result.error === 'string' ? result.error : 'Téléchargement indisponible.');
      }
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement('a'); link.href = url; link.download = 'candidature-relue.txt';
      document.body.appendChild(link); link.click(); link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setNotice('Votre document relu a été téléchargé au format texte.');
    } catch (e) { setError(e instanceof Error ? e.message : 'Téléchargement impossible.'); }
    finally { busyRef.current = false; setBusy(false); }
  };
  const confirmStage = (stage: Stage) => {
    if (!selected) return;
    setConfirmation({ title: `Confirmer : ${stageLabels[stage]}`, detail: stage === 'MANUALLY_APPLIED' ? `Confirmez avoir vous-même envoyé la candidature à ${selected.company}. Cette action met uniquement à jour le suivi.` : `${selected.company} · ${selected.title}. La nouvelle étape sera enregistrée dans votre suivi.`, payload: { action: 'stage', key: selected.key, stage, confirmed: true } });
  };

  return <div className="career-studio" lang="fr">
    <header className="cs-top"><a href="/personal" className="cs-brand"><span className="cs-brand-icon"><Sparkles size={19} /></span> career<span>studio</span></a><div className="cs-top-right"><span className="cs-local"><i /> Espace personnel · {localHost ? "local" : "privé"}</span><button className="cs-icon" aria-label="Actualiser les données" disabled={busy} onClick={() => void refresh().catch((e: unknown) => setError(e instanceof Error ? e.message : 'Actualisation impossible.'))}><RefreshCw size={17} /></button></div></header>
    <nav className="cs-tabs" aria-label="Espace personnel">{tabs.map((item, i) => { const Icon = [Search, AudioLines, FileText, Workflow, Link2][i]; return <button key={item} className={tab === item ? 'active' : ''} onClick={() => setTab(item)} aria-current={tab === item ? 'page' : undefined}><Icon size={16} />{item}{item === 'Profil' && pending.length > 0 && <span className="cs-count">{pending.length}</span>}</button>; })}</nav>
    <div className="cs-body">
      <section className="cs-heading"><div><div className="cs-eyebrow">VOTRE PROCHAINE ÉTAPE, BIEN PRÉPARÉE</div><h1>{tab === 'Opportunités' ? <>Un cap clair.<br /><em>Des opportunités à explorer.</em></> : tab === 'Assistant' ? <>Parlons de <em>votre avenir.</em></> : tab === 'Profil' ? <>Votre parcours.<br /><em>Vos mots, votre décision.</em></> : tab === 'Workflow' ? <>Chaque étape, <em>en toute clarté.</em></> : <>Vos outils, <em>réunis ici.</em></>}</h1><p>{tab === 'Opportunités' ? 'Découvrez, comparez et préparez vos candidatures avec votre agent personnel.' : tab === 'Assistant' ? 'Écrivez ou dictez votre demande. Toute modification reste à confirmer.' : tab === 'Profil' ? 'Un profil de référence, des modifications relues et un historique conservé.' : tab === 'Workflow' ? 'Consultez les actions exécutées, leurs résultats et les points à valider.' : 'Connectez vos services pour activer la recherche, l’assistant et vos documents.'}</p></div><div className="cs-compass"><span>VOUS GARDEZ LE CAP</span><ShieldCheck size={30} /><p>Votre agent prépare.<br /><strong>Vous décidez.</strong></p></div></section>
      {error && <div className="cs-alert error" role="alert"><CircleHelp size={18} /><span>{error}</span><button aria-label="Fermer l’erreur" onClick={() => setError('')}><X size={16} /></button></div>}
      {notice && <div className="cs-alert" role="status"><Check size={18} /><span>{notice}</span><button aria-label="Fermer le message" onClick={() => setNotice('')}><X size={16} /></button></div>}
      {busy && <div className="cs-working" role="status"><LoaderCircle size={16} className="cs-spin" /> Action en cours…</div>}
      {!data && <div className="cs-empty"><LoaderCircle className="cs-spin" /><h2>{error ? 'Votre espace est indisponible' : 'Ouverture de votre espace…'}</h2>{error && <button className="cs-button" onClick={() => void refresh(true).catch((e: unknown) => setError(e instanceof Error ? e.message : 'Chargement impossible.'))}>Réessayer</button>}</div>}
      {data && <>
        {tab === 'Opportunités' && <>
          <div className="cs-stats"><div><span>OFFRES À EXPLORER</span><strong>{data.offers.filter(o => o.assessment.included).length.toString().padStart(2, '0')}</strong><small>Selon vos filtres de recherche</small></div><div><span>EN PRÉPARATION</span><strong>{data.offers.filter(o => ['SHORTLISTED', 'DRAFT_READY', 'REVIEWED'].includes(o.stage)).length.toString().padStart(2, '0')}</strong><small>Des dossiers que vous construisez</small></div><div><span>VOTRE PÉRIMÈTRE</span><strong className="cs-stat-text">{data.search.countries.join(' · ')}</strong><small>{data.search.priorityCities.join(' · ') || 'Villes à définir'}</small></div></div>
          <div className="cs-section-title"><div><h2>Votre sélection</h2><p>Dernière recherche : {dateLabel(data.lastScan?.finished)}{data.lastScan?.status === 'error' ? ' · interrompue' : ''}</p></div><div className="cs-actions"><button className="cs-button secondary" onClick={() => setShowImport(!showImport)}><Plus size={16} /> Ajouter une offre</button><button className="cs-button" disabled={busy} onClick={() => void act({ action: 'public-scan' }, 'Recherche lancée en arrière-plan. Actualisez dans quelques secondes pour voir les résultats.')}><Search size={16} /> Recherche rapide en ligne</button></div></div>
          {showImport && <form className="cs-card cs-import" onSubmit={e => { e.preventDefault(); const form = e.currentTarget; const values = Object.fromEntries(new FormData(form).entries()); void act({ action: 'import', offer: values }, 'Offre enregistrée. Sa source et son éligibilité restent à vérifier.').then(result => { if (result) { form.reset(); setShowImport(false); } }); }}><div className="cs-card-heading"><h3>Ajouter une offre depuis sa source</h3><button type="button" className="cs-icon" aria-label="Fermer l’import" onClick={() => setShowImport(false)}><X size={16} /></button></div><p>Pour le Maroc, ajoutez le lien et le descriptif d’une offre officielle.</p><div className="cs-form-grid">{[['url', 'Lien de l’offre', 'url'], ['company', 'Entreprise', 'text'], ['title', 'Intitulé du poste', 'text'], ['location', 'Ville', 'text'], ['contract', 'Contrat (stage, alternance…)', 'text'], ['postedAt', 'Date de publication, si connue', 'date']].map(([name, label, type]) => <label key={name}>{label}<input name={name} type={type} required={['url', 'company', 'title'].includes(name)} /></label>)}<label>Pays<select name="country"><option value="">À vérifier</option><option value="FR">France</option><option value="MA">Maroc</option></select></label></div><label>Description de l’offre<textarea name="description" rows={5} /></label><button className="cs-button" disabled={busy}>Enregistrer l’offre</button></form>}
          <div className="cs-filterbar"><div className="cs-segment" aria-label="Filtrer les offres">{[['included', 'À explorer'], ['excluded', 'Exclues'], ['all', 'Toutes']].map(([value, label]) => <button key={value} className={filter === value ? 'active' : ''} onClick={() => setFilter(value)}>{label}</button>)}</div><label className="cs-search"><Search size={16} /><input aria-label="Rechercher dans les offres" placeholder="Entreprise, poste ou ville…" value={query} onChange={e => setQuery(e.target.value)} /></label></div>
          <div className={`cs-offer-layout ${selected ? 'has-detail' : ''}`}><div className="cs-offers">{offers.length === 0 ? <div className="cs-empty"><Globe2 size={32} /><h3>{data.offers.length ? 'Aucune offre dans cette vue' : 'Votre recherche commence ici'}</h3><p>{data.offers.length ? 'Essayez un autre filtre ou un autre mot-clé.' : 'Connectez France Travail ou ajoutez une offre qui vous intéresse. Chaque opportunité sera expliquée avant votre décision.'}</p>{!data.offers.length && <button className="cs-button secondary" onClick={() => setTab('Connexions')}>Configurer mes connexions <ArrowUpRight size={15} /></button>}</div> : offers.map(offer => <button key={offer.key} disabled={busy} className={`cs-offer ${selectedKey === offer.key ? 'selected' : ''}`} onClick={() => selectOffer(offer)}><div className="cs-offer-top"><span className="cs-company-icon">{offer.company.slice(0, 2).toUpperCase()}</span><span>{offer.company}<small>{offer.location || 'Lieu à vérifier'} · {offer.country || 'Pays inconnu'}</small></span><ArrowUpRight size={18} /></div><h3>{offer.title}</h3><div className="cs-tags"><span>{offer.contract || 'Contrat à vérifier'}</span><span>{stageLabels[offer.stage]}</span>{offer.assessment.priority > 0 && <span className="priority">Priorité {offer.assessment.priority}</span>}</div><p>{offer.assessment.included ? offer.assessment.explanation : offer.assessment.reasons[0]}</p><div className="cs-offer-footer"><span>Publication : {offer.postedAt ? new Date(offer.postedAt).toLocaleDateString('fr-FR') : 'inconnue'}</span><span>Éligibilité {offer.eligibility === 'UNKNOWN' ? 'à confirmer' : 'documentée'} <ChevronRight size={13} /></span></div></button>)}</div>
          {selected && <aside className="cs-card cs-detail"><div className="cs-card-heading"><span className="cs-eyebrow">EXAMINER L’OFFRE</span><button className="cs-icon" aria-label="Fermer le détail" onClick={() => setSelectedKey('')}><X size={18} /></button></div><p>{selected.company}</p><h2>{selected.title}</h2><a className="cs-text-link" href={safeLink(selected.url)} target="_blank" rel="noreferrer">Consulter la source <ArrowUpRight size={15} /></a><div className="cs-tags"><span>{stageLabels[selected.stage]}</span><span>{selected.assessment.included ? 'Correspond aux filtres' : 'Exclue par les filtres'}</span></div><p>{selected.assessment.explanation}</p>{selected.assessment.reasons.length > 0 && <div className="cs-review-note"><strong>Motifs d’exclusion</strong><ul>{selected.assessment.reasons.map(r => <li key={r}>{r}</li>)}</ul></div>}{selected.assessment.warnings.length > 0 && <div className="cs-review-note"><strong>À vérifier</strong><ul>{selected.assessment.warnings.map(r => <li key={r}>{r}</li>)}</ul></div>}<dl className="cs-facts"><dt>Source</dt><dd>{selected.source}</dd><dt>Publication</dt><dd>{dateLabel(selected.postedAt)}</dd><dt>Première collecte</dt><dd>{dateLabel(selected.firstSeenAt)}</dd><dt>Dernière vérification</dt><dd>{dateLabel(selected.lastCheckedAt)}</dd></dl><details><summary>Description complète</summary><p className="cs-prewrap">{selected.description || 'Description à ajouter depuis la source.'}</p></details><details><summary>Documenter l’éligibilité</summary><label>Situation<select value={eligibility} onChange={e => setEligibility(e.target.value)}><option value="UNKNOWN">Inconnue — à confirmer</option><option value="ACCEPTS_MOROCCO_CONFIRMED">Accueil depuis le Maroc confirmé</option><option value="EXPLICIT_RESTRICTION">Restriction explicite</option></select></label><label>Citation de l’offre ou réponse de l’employeur<textarea rows={3} value={evidence} onChange={e => setEvidence(e.target.value)} /></label><button className="cs-button secondary" disabled={busy || (eligibility !== 'UNKNOWN' && !evidence.trim())} onClick={() => void act({ action: 'evidence', key: selected.key, eligibility, evidence }, 'Éligibilité documentée.')}>Enregistrer cette preuve</button></details>
            {selected.stage === 'NEW' && <button className="cs-button cs-full" disabled={busy} onClick={() => confirmStage('SHORTLISTED')}>Présélectionner <Check size={16} /></button>}
            {['SHORTLISTED', 'DRAFT_READY', 'REVIEWED'].includes(selected.stage) && <section className="cs-draft"><h3>Votre document de candidature</h3><p>Le CV original PDF reste la base. L’assistant propose les modifications adaptées à l’offre ; rien n’est exporté ni envoyé avant votre relecture et confirmation.</p><button className="cs-button secondary cs-full" disabled={busy} onClick={() => void act<{content: string}>({action: "prepare-draft", key: selected.key, language}, "Proposition prête. Relisez le texte avant de l’enregistrer.").then(result => { if (result) setDraft(result.content); })}><Sparkles size={15} /> Préparer avec l’assistant</button><textarea aria-label="Document de candidature" disabled={busy} rows={12} value={draft} onChange={e => setDraft(e.target.value)} /><button className="cs-button secondary cs-full" disabled={busy || !draft.trim()} onClick={() => void act({ action: 'draft', key: selected.key, content: draft, confirmed: true }, 'Brouillon enregistré. Une nouvelle relecture est nécessaire.')}>Confirmer et enregistrer ce brouillon</button>{selected.stage === 'DRAFT_READY' && <button className="cs-button cs-full" disabled={busy || draft !== selected.draft?.content} onClick={() => confirmStage('REVIEWED')}>J’ai relu cette version</button>}{selected.stage === 'REVIEWED' && <><button className="cs-button secondary cs-full" disabled={busy || draft !== selected.draft?.content} onClick={() => void downloadReviewed()}>Télécharger le document relu</button><button className="cs-button cs-full" disabled={busy || draft !== selected.draft?.content} onClick={() => setConfirmation({ title: 'Exporter vers Google Drive', detail: 'Ce texte exact sera créé comme document dans votre compte Google connecté.', preview: selected.draft?.content, payload: { action: 'google-export', key: selected.key, version: selected.draft?.version, confirmed: true } })}>Exporter le document relu <ArrowUpRight size={15} /></button><a className="cs-button secondary cs-full" href={safeLink(selected.applicationUrl || selected.url)} target="_blank" rel="noreferrer">Ouvrir la candidature officielle</a><button className="cs-button secondary cs-full" disabled={busy || draft !== selected.draft?.content} onClick={() => confirmStage('MANUALLY_APPLIED')}>J’ai envoyé ma candidature moi-même</button></>}</section>}
            {selected.stage === 'MANUALLY_APPLIED' && <button className="cs-button cs-full" disabled={busy} onClick={() => confirmStage('INTERVIEW')}>Enregistrer un entretien</button>}{!['REJECTED', 'CLOSED'].includes(selected.stage) && <div className="cs-actions cs-end-actions"><button className="cs-button quiet" disabled={busy} onClick={() => confirmStage('REJECTED')}>Écarter / refus</button><button className="cs-button quiet" disabled={busy} onClick={() => confirmStage('CLOSED')}>Clôturer</button></div>}
          </aside>}</div><div className="cs-footnote"><ShieldCheck size={16} /> Les filtres repèrent des correspondances. L’éligibilité et l’adéquation au poste restent à vérifier avec vous.</div>
        </>}
        {tab === 'Profil' && <>
          <section className="cs-proposals"><div className="cs-section-title"><div><h2>Propositions à confirmer <span className="cs-count">{pending.length}</span></h2><p>Relisez le texte exact. L’enregistrement crée une version dans votre historique.</p></div></div>{pending.length === 0 && <div className="cs-card cs-muted">Aucune modification en attente. Vous pouvez préparer un changement ci-dessous ou le demander à l’assistant.</div>}{pending.map(p => <article className="cs-card cs-proposal" key={p.id}><div className="cs-card-heading"><h3>{p.summary}</h3><span className="cs-tag">{p.source === 'agent' ? 'Proposé par l’assistant' : 'Votre modification'}</span></div><div className="cs-diff"><div><h4>Avant</h4><pre>{display(p.before)}</pre></div><div><h4>Après confirmation</h4><pre>{display(p.after)}</pre></div></div><div className="cs-actions"><button className="cs-button" disabled={busy} onClick={() => void act<Proposal>({ action: 'confirm', id: p.id, confirmed: true }, 'Modification confirmée et version enregistrée.').then(result => { if (result) { if (p.target === 'cv') setCvText(String(p.after)); if (p.target === 'profile') setProfileText(String(p.after)); if (p.target === 'search') setSearchDraft(p.after as SearchConfig); } })}><Check size={15} /> Confirmer cette modification</button><button className="cs-button secondary" disabled={busy} onClick={() => void act({ action: 'reject', id: p.id }, 'Proposition refusée.')}>Refuser</button></div></article>)}</section>
          <div className="cs-profile-grid"><section className="cs-card"><h2>CV de référence</h2><p>Gardez uniquement les compétences et expériences que vous pouvez expliquer et démontrer.</p><textarea aria-label="CV de référence" className="cs-editor" rows={20} value={cvText} onChange={e => setCvText(e.target.value)} /><button className="cs-button" disabled={busy || !cvText.trim() || cvText === data.cv} onClick={() => propose('cv', cvText)}>Prévisualiser le changement</button></section><section className="cs-card"><h2>Profil de référence</h2><p>Ce profil structuré est partagé avec le moteur career-ops. L’assistant peut vous aider à le modifier.</p><textarea aria-label="Profil de référence YAML" className="cs-editor" rows={20} value={profileText} onChange={e => setProfileText(e.target.value)} /><button className="cs-button" disabled={busy || !profileText.trim() || profileText === data.profile} onClick={() => propose('profile', profileText)}>Prévisualiser le changement</button></section></div>
          {searchDraft && <section className="cs-card cs-search-settings"><h2>Votre recherche</h2><p>Les villes et entreprises prioritaires remontent dans la liste. Les autres offres restent visibles selon les filtres.</p><div className="cs-form-grid">{([['roles', 'Métiers'], ['countries', 'Pays (FR, MA)'], ['priorityCities', 'Villes prioritaires'], ['priorityCompanies', 'Entreprises prioritaires'], ['contracts', 'Contrats (stage, alternance)'], ['languages', 'Langues (fr, en)']] as const).map(([key, label]) => <label key={key}>{label}<input value={searchDraft[key].join(', ')} onChange={e => setSearchDraft({ ...searchDraft, [key]: e.target.value.split(',').map(x => x.trim()) })} /><small>Séparez les valeurs par une virgule.</small></label>)}<label>Ancienneté maximale des offres (jours)<input type="number" min={1} max={90} value={searchDraft.maxAgeDays} onChange={e => setSearchDraft({ ...searchDraft, maxAgeDays: Number(e.target.value) })} /></label><label>Date de début confirmée<input type="date" value={searchDraft.startDate} onChange={e => setSearchDraft({ ...searchDraft, startDate: e.target.value })} /><small>Laissez vide si le calendrier EMSI reste à confirmer.</small></label><label>Durée en mois, si confirmée<input type="number" min={1} max={36} value={searchDraft.durationMonths ?? ''} onChange={e => setSearchDraft({ ...searchDraft, durationMonths: e.target.value ? Number(e.target.value) : null })} /></label><label>Intervalle des recherches (heures)<input type="number" min={1} max={168} value={searchDraft.scanEveryHours} onChange={e => setSearchDraft({ ...searchDraft, scanEveryHours: Number(e.target.value) })} /></label></div><label className="cs-checkbox"><input type="checkbox" checked={searchDraft.scheduleEnabled} onChange={e => setSearchDraft({ ...searchDraft, scheduleEnabled: e.target.checked })} /> Autoriser les recherches planifiées</label><p className="cs-small">La planification nécessite un processus de recherche en fonctionnement sur votre machine ou votre hébergement. Ce réglage enregistre votre préférence.</p><button className="cs-button" disabled={busy} onClick={() => propose('search', searchDraft)}>Prévisualiser ces préférences</button></section>}
          <details className="cs-card"><summary>Historique des modifications ({data.proposals.filter(p => p.status !== 'pending').length})</summary>{data.proposals.filter(p => p.status !== 'pending').map(p => <div className="cs-history-row" key={p.id}><span>{p.summary}</span><small>{p.status === 'approved' ? 'Confirmée' : 'Refusée'} · {dateLabel(p.createdAt)}</small></div>)}</details>
        </>}
        {tab === 'Workflow' && <><div className="cs-card"><div className="cs-card-heading"><h2>Recherches planifiées</h2><span className="cs-tag">{data.search.scheduleEnabled ? 'Autorisées' : 'Désactivées'}</span></div><p>Dernier état du processus : {data.worker?.status || 'Aucun démarrage enregistré'} · Dernière activité : {dateLabel(data.worker?.heartbeatAt)} · Prochaine recherche : {dateLabel(data.worker?.nextRunAt)}</p><p className="cs-small">Un ancien signal ne garantit pas que le processus fonctionne encore. Votre PC et le processus de recherche doivent rester allumés ; France Travail doit être configuré.</p></div><div className="cs-workflow-overview">{[['Collecte', 'Sources et offres'], ['Filtrage', 'Critères et priorités'], ['Rédaction', 'Brouillons et propositions'], ['Vous', 'Relecture et décision']].map(([title, subtitle], i) => <div key={title}><span>0{i + 1}</span><h3>{title}</h3><p>{subtitle}</p></div>)}</div><section className="cs-card"><div className="cs-section-title"><div><h2>Journal des actions</h2><p>Les étapes réellement exécutées et leurs résultats.</p></div><span className="cs-tag">{data.events.length} événements</span></div>{!data.events.length ? <div className="cs-empty"><Workflow size={30} /><h3>Votre journal est prêt</h3><p>Vos recherches, propositions et décisions apparaîtront ici.</p></div> : <ol className="cs-timeline">{data.events.map(event => <li key={event.id}><span className={`cs-event-dot ${event.status}`} /><div><div className="cs-event-title"><h3>{event.action}</h3><span className={`cs-tag ${event.status}`}>{event.status === 'error' ? 'Interrompu' : event.status === 'review' ? 'À relire' : event.status === 'running' ? 'Démarrage enregistré' : 'Terminé'}</span></div><p>{event.detail}</p><small>{event.role} · {dateLabel(event.at)}</small></div></li>)}</ol>}</section></>}
        {tab === 'Connexions' && <><div className="cs-connection-grid"><ConnectionCard title="Assistant IA" description="Analyse et rédaction avec OpenRouter ou OpenAI. Ajoutez plusieurs clés séparées par des retours à la ligne ; une autre est essayée si la première atteint sa limite." provider={data.connections.provider || "openrouter"} configured={data.connections.ai} fields={[['OPENROUTER_API_KEYS', 'Clés OpenRouter (une par ligne)', true], ['OPENROUTER_MODEL', 'Modèle OpenRouter (par défaut : openrouter/free)', false], ['OPENAI_API_KEYS', 'Clés OpenAI (une par ligne)', true], ['OPENAI_MODEL', 'Modèle OpenAI (facultatif)', false]]} busy={busy} onSave={values => act({ action: 'credentials', values }, 'Configuration IA enregistrée.').then(result => result !== null)} /><ConnectionCard title="France Travail" description="Recherche d’offres depuis le connecteur officiel. Les identifiants appartiennent à votre application." configured={data.connections.franceTravail} fields={[['FRANCE_TRAVAIL_CLIENT_ID', 'Client ID', true], ['FRANCE_TRAVAIL_CLIENT_SECRET', 'Client secret', true], ['FRANCE_TRAVAIL_SCOPE', 'Scope autorisé (facultatif)', false]]} busy={busy} onSave={values => act({ action: 'credentials', values }, 'Configuration France Travail enregistrée.').then(result => result !== null)} /><ConnectionCard title="Compte Google" description="Configurez votre application OAuth, puis autorisez séparément les services utiles." configured={data.connections.googleConfigured} fields={[['GOOGLE_CLIENT_ID', 'Client ID OAuth', true], ['GOOGLE_CLIENT_SECRET', 'Client secret OAuth', true], ['GOOGLE_REDIRECT_URI', `Adresse de retour (actuelle : ${data.connections.redirectUri})`, false]]} busy={busy} onSave={values => act({ action: 'credentials', values }, 'Configuration Google enregistrée.').then(result => result !== null)} /></div><section className="cs-card cs-google"><div className="cs-card-heading"><div><h2>Votre espace Google</h2><p>{data.connections.googleConnected ? 'Compte connecté. Autorisez chaque service dont vous avez besoin.' : 'Connectez votre compte pour retrouver vos échanges, événements et documents.'}</p></div><span className="cs-tag">{data.connections.googleConnected ? 'Connecté' : 'À connecter'}</span></div><div className="cs-google-apps">{([['gmail', 'Gmail', 'Consulter les messages liés à vos candidatures.'], ['calendar', 'Agenda', 'Consulter vos prochains événements.'], ['drive', 'Drive', 'Exporter les documents relus et retrouver les fichiers accessibles à l’application.']] as const).map(([app, title, description]) => <div key={app}><h3>{title}</h3><p>{description}</p><div className="cs-actions"><button className="cs-button secondary" disabled={busy || !data.connections.googleConfigured} onClick={() => void act<{ url: string }>({ action: 'google-start', app }).then(result => { if (result?.url && result.url.startsWith('https://accounts.google.com/')) window.location.assign(result.url); })}>Autoriser</button><button className="cs-button quiet" disabled={busy || !data.connections.googleConnected} onClick={() => void act<{ app: string; items: GoogleItem[] }>({ action: 'google-read', app }).then(result => { if (result) setGoogleItems(result); })}>Consulter <ArrowUpRight size={14} /></button></div></div>)}</div>{googleItems && <div className="cs-google-results"><h3>Lecture de {googleItems.app}</h3>{!googleItems.items.length ? <p>Aucun élément trouvé avec les droits actuels.</p> : googleItems.items.map((item, i) => <a key={i} href={safeLink(item.url)} target="_blank" rel="noreferrer"><span>{item.title}<small>{item.from || (item.date ? dateLabel(item.date) : '')}</small></span><ArrowUpRight size={16} /></a>)}</div>}{data.connections.googleConnected && <button className="cs-button quiet" disabled={busy} onClick={() => setConfirmation({ title: 'Déconnecter Google', detail: 'L’autorisation Google de cet espace sera révoquée. Vous pourrez reconnecter votre compte ultérieurement.', payload: { action: 'google-disconnect' } })}>Déconnecter Google</button>}</section><div className="cs-card cs-muted"><h3>Maroc · collecte depuis les sources</h3><p>Ajoutez des offres via « Ajouter une offre ». Aucun connecteur ANAPEC actif n’est annoncé. Vos identifiants sont conservés côté serveur ; ce poste doit rester personnel et protégé.</p></div></>}
      </>}
      <footer className="cs-footer"><span>career studio <span> / </span> votre espace personnel</span><span>Des faits vérifiés. Des décisions qui vous appartiennent.</span></footer>
    </div>
    {confirmation && <div className="cs-modal-backdrop" onClick={e => { if (e.target === e.currentTarget && !busy) setConfirmation(null); }}><section ref={dialog} className="cs-modal" role="dialog" aria-modal="true" aria-labelledby="cs-confirm-title"><ShieldCheck size={27} /><h2 id="cs-confirm-title">{confirmation.title}</h2><p>{confirmation.detail}</p>{confirmation.preview && <pre>{confirmation.preview}</pre>}<div className="cs-actions"><button autoFocus className="cs-button secondary" disabled={busy} onClick={() => setConfirmation(null)}>Annuler</button><button className="cs-button" disabled={busy} onClick={() => void act<{ webViewLink?: string }>(confirmation.payload, 'Action confirmée et enregistrée.').then(result => { if (result !== null) { setConfirmation(null); if (result?.webViewLink) setNotice('Document exporté. Retrouvez-le dans Connexions → Drive → Consulter.'); } })}>Confirmer</button></div></section></div>}
  </div>;
}

function ConnectionCard({ title, description, configured, fields, busy, onSave, provider }: { provider?: string; title: string; description: string; configured: boolean; fields: [string, string, boolean][]; busy: boolean; onSave: (values: Record<string, string>) => Promise<boolean> }) {
  return <form className="cs-card cs-connection" onSubmit={e => { e.preventDefault(); const form = e.currentTarget; const values = Object.fromEntries(Array.from(new FormData(form).entries()).map(([key, value]) => [key, String(value)])); void onSave(values).then(saved => { if (saved) form.reset(); }); }}><div className="cs-card-heading"><Link2 size={22} /><span className={`cs-tag ${configured ? 'connected' : ''}`}>{configured ? 'Configuré' : 'À configurer'}</span></div><h2>{title}</h2><p>{description}</p>{provider && <label>Fournisseur actif<select name="AI_PROVIDER" defaultValue={provider}><option value="openrouter">OpenRouter</option><option value="openai">OpenAI</option></select></label>}{fields.map(([name, label, secret]) => <label key={name}>{label}<input type={secret ? 'password' : 'text'} name={name} autoComplete="off" placeholder={secret && configured ? 'Enregistré · laisser vide pour conserver' : ''} /></label>)}<button className="cs-button secondary" disabled={busy}>Enregistrer les identifiants</button></form>;
}




