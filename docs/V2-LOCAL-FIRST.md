# Career Ops V2 — guide local-first

Cette V2 conserve le flux original : `/explore` collecte et déduplique les offres,
les offres retenues entrent dans le pipeline canonique, `/apply` prépare et remplit
le formulaire, puis la personne relit et clique elle-même sur **Submit**. La page
`/personal` reste optionnelle et réutilise les mêmes fichiers de profil, pipeline
et tracker ; elle n'est pas une seconde application.

## Architecture effective

1. **Collecte** — les scanners ATS interrogent Greenhouse, Lever, Ashby et Workday.
   Le flux public Arbeitnow complète les résultats sans identifiants. Les données
   externes sont toujours traitées comme non fiables.
2. **Déduplication** — les URL sont canonisées avant écriture dans
   `data/pipeline.md`, `data/scan-history.tsv` et `data/personal-agent.json`.
   `data/applications.md` est le tracker lisible ; son index `applications.db` est
   dérivé localement et ignoré par Git.
3. **Évaluation et rédaction** — le routeur classe la tâche. Les petites tâches
   JSON/chat essaient Ollama en premier. Les CV et lettres essaient la chaîne lourde
   OpenRouter → LiteLLM → OpenAI → Gemini → Groq → Ollama. Seuls les fournisseurs
   effectivement configurés sont appelés.
4. **Candidature** — Playwright ouvre un navigateur visible, remplit les champs et
   bloque les contrôles de soumission. Aucun CAPTCHA n'est contourné et aucun plugin
   stealth n'est ajouté. La soumission finale et la déclaration « Applied » restent
   manuelles.

## Installation locale

```powershell
cd C:\chemin\vers\career-ops
Copy-Item .env.example .env
npm install
npm --prefix web ci
python -m pip install -r personal-agent\requirements.txt
npx playwright install chromium
Copy-Item config\profile_vision.example.json config\profile_vision.json
```

Installez Ollama séparément, puis chargez le modèle local :

```powershell
ollama pull qwen2.5:14b
ollama serve
```

Le serveur Ollama doit répondre sur `http://127.0.0.1:11434`. Pour LiteLLM,
lancez votre proxy OpenAI-compatible et renseignez `LITELLM_BASE_URL` et
`LITELLM_MODEL` dans `.env`.

## Importer le CV

Placez le PDF dans `documents/master-cv.pdf` (ce dossier est ignoré par Git), puis :

```powershell
python personal-agent\cv_parser.py documents\master-cv.pdf --output data\cv-profile.json
```

Le résultat conserve le texte brut et des sections structurées. Il porte toujours
`review_required: true` : relisez-le avant de l'utiliser. Le parseur n'invente ni
diplôme, ni compétence, ni statut de visa. Complétez ensuite
`config/profile_vision.json`; laissez les réponses juridiques à `null` tant qu'elles
ne sont pas confirmées.

## Démarrer et utiliser

```powershell
npm run db:init
npm --prefix web run build
.\personal-agent\Start-Platform.ps1
```

Ouvrez `http://127.0.0.1:3000/`, puis **Career Studio**. Le lien conduit à
`/explore`. Lancez **Scan**, vérifiez la source et la localisation, ajoutez les
offres utiles au pipeline, évaluez-les, puis utilisez **Apply** pour préparer le
formulaire. Relisez tout et soumettez sur le site employeur vous-même.

Arrêt :

```powershell
.\personal-agent\Stop-Platform.ps1
```

## GitHub Actions sans abonnement IA

- `Career Ops CI` valide syntaxe, tests, TypeScript et build sans clé API.
- `Public job scan` s'exécute toutes les six heures ou manuellement. Il n'envoie ni
  CV, ni profil, ni secrets. Le résultat JSON est un artefact privé du run à relire.
- GitHub Actions n'héberge pas l'interface de façon persistante : ses machines sont
  éphémères. Pour garder l'interface et les données local-first, utilisez le PC ou
  un runner GitHub auto-hébergé. Une VM distante exige stockage persistant, HTTPS,
  authentification et sauvegardes ; ne rendez jamais ce tableau personnel public.

## Dépannage

- **Ollama indisponible** — vérifiez `ollama list`, puis `ollama serve`. Le routeur
  passe au fournisseur suivant si une clé correspondante est configurée.
- **Quota/rate limit** — ajoutez un fournisseur de repli ou choisissez un modèle
  moins coûteux. Le message d'erreur indique la chaîne tentée.
- **Chromium absent ou crash** — lancez `npx playwright install chromium`; fermez
  les processus Chrome orphelins et gardez au moins 1 Go de mémoire partagée dans
  Docker.
- **Aucune offre** — élargissez la période et les lieux, puis contrôlez l'URL source.
  Une recherche vide peut aussi signifier qu'aucune offre fraîche ne correspond.
- **Doublons** — exécutez `npm run dedup`. Ne modifiez pas `applications.db` : il
  est reconstruit depuis le tracker canonique.
- **PDF sans texte** — le document est probablement scanné. Faites un OCR local,
  puis relancez le parseur.
