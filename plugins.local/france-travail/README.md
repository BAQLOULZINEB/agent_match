# France Travail extension

Read-only Offres d'emploi v2 connector. Create a FranceTravail.io application and subscribe to the API before entering `FRANCE_TRAVAIL_CLIENT_ID` and `FRANCE_TRAVAIL_CLIENT_SECRET` in the server connection settings. Missing credentials stop the request before network access. The default scope is `api_offresdemploiv2 o2dsoffre`; it can be overridden to match the application subscription.

## Interface

`searchFranceTravail({clientId, clientSecret, queries?, scope?}, fetchFn?)` returns `{offers, partial}`. The default fetch is used by the server adapter; plugin provider/search hooks always inject the engine's guarded `ctx.fetch`. This module performs no writes or submissions. The caller owns persisted first-seen timestamps, filtering, pipeline writes, and verification.

Normalized offers preserve `typeContratLibelle`, `typeContrat`, and `natureContrat` together in `contract`. This retains apprenticeship information when the base contract is CDD/CDI. Unknown codes remain raw; MIS is never converted into an internship. Eligibility and browser liveness remain unknown even when an offer is returned by the active-offer API.

Maximum five distinct queries and three 100-offer pages per query; truncation sets `partial`. Each request has a 20-second timeout, redirects are rejected, and 429 is retried at most twice. Retry-After over five seconds asks for a later scan instead of retrying early. Request and response errors never include upstream bodies or credentials. Only HTTP(S) offer links without embedded credentials are returned.

France coverage only. No Moroccan API integration is implied. Moroccan opportunities must be imported through separately verified sources.

## Verification

Run `node --test plugins.local/france-travail/test/smoke.mjs`. Synthetic tests cover OAuth placement, guarded fetch, pagination/deduplication, bounds, contract preservation, safe links, rate limits, and sanitized errors. No live authenticated search has been tested without credentials.

Official service description: https://www.data.gouv.fr/dataservices/api-offres-demploi

Official documentation entry: https://francetravail.io/produits-partages/catalogue/offres-emploi/documentation

The official documentation page did not expose readable endpoint/scope details to the research tool during this build. Endpoint and default scope must be confirmed against the application's current subscription during the first live connection check; they are not represented as independently verified here.
