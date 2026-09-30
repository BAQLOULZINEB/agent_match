# Recherche locale avec votre n8n

Ce workflow facultatif déclenche la collecte France Travail de votre plateforme. Les offres passent par le même import et la même déduplication que le bouton de recherche. La liste reste dans votre espace Career Ops. Le workflow ne contient aucun envoi de candidature, courriel ou publication.

**État livré : désactivé, sans identifiant.** L'import et l'exécution dans votre propre n8n restent à effectuer. Le JSON utilise les nœuds Schedule Trigger 1.2 et HTTP Request 4.2, encore présents dans le code officiel consulté le 30 septembre 2026. La version de votre installation n'a pas été vérifiée.

## Installation sur le même PC

1. Configurez France Travail dans **Connexions** et réussissez une recherche manuelle dans la plateforme.
2. Créez un jeton aléatoire distinct du mot de passe et du secret de session. Utilisez au moins 32 caractères sans espaces, au maximum 256. Ajoutez-le dans l'environnement privé du serveur Career Ops sous `PERSONAL_AUTOMATION_TOKEN`, puis redémarrez ce serveur. Conservez sa valeur dans votre gestionnaire de secrets.
3. Dans n8n, importez `workflow.json` avec **Import from File**. L'import n'active pas le planning.
4. Dans **Collect offers locally**, créez une credential **Header Auth** : nom d'en-tête `Authorization`, valeur `Bearer VOTRE_JETON`. Sélectionnez cette credential sur le nœud. N'inscrivez pas le jeton directement dans le JSON du workflow.
5. Vérifiez l'URL : `http://127.0.0.1:3000/api/personal/scheduled-scan`. Adaptez uniquement le port si votre plateforme en utilise un autre.
6. Exécutez **Test manually**. Un succès retourne seulement `ok`, `added` et `duplicates`. Vérifiez les offres et le journal dans Career Ops.
7. Choisissez votre cadence sur **Every six hours**, puis publiez/activez le workflow lorsque vous voulez démarrer. Le fuseau du workflow est `Africa/Casablanca`. n8n gère cette cadence indépendamment de la préférence de planning affichée dans Career Ops : évitez d'activer deux planificateurs.

Le PC, n8n et Career Ops doivent fonctionner pour exécuter les recherches. La reprise d'une exécution manquée dépend de la version et du planificateur n8n installé ; ce workflow n'active aucun rattrapage spécifique.

### Si n8n fonctionne dans Docker

Dans un conteneur, `127.0.0.1` désigne le conteneur. Le workflow livré cible une installation n8n native sur le même PC. L'accès Docker nécessite une configuration réseau locale adaptée ; ne remplacez pas simplement l'URL par une adresse publique. L'endpoint refuse les hôtes non locaux. La topologie réelle de votre n8n doit être vérifiée avant d'adapter ce point.

## Accès et diagnostic

- Le serveur doit écouter sur `127.0.0.1` pour ce scénario local. Le contrôle de l'en-tête Host ne remplace pas cette liaison réseau.
- Le jeton autorise uniquement une recherche. L'endpoint ignore les paramètres et le contenu de la requête et appelle le moteur avec `action: scan`.
- `401` : credential Header Auth absente ou différente du jeton du serveur.
- `403` : l'adresse ou l'hôte transmis n'est pas local.
- `503` : jeton non configuré, trop court, ou moteur indisponible.
- `502`/`504` : échec ou délai dépassé. Consultez le journal local pour le détail ; la réponse HTTP n'expose pas de secret ou de document.
- Pour arrêter, désactivez le workflow dans n8n. Pour révoquer l'accès, retirez ou remplacez le jeton serveur puis redémarrez Career Ops.

## Références vérifiées

- [Schedule Trigger : cadence, fuseau et publication](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.scheduletrigger/)
- [HTTP Request et authentification générique](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.httprequest/)
- [Import et export de workflows](https://docs.n8n.io/workflows/export-import/)
- [Source officielle Schedule Trigger](https://github.com/n8n-io/n8n/blob/master/packages/nodes-base/nodes/Schedule/ScheduleTrigger.node.ts)
- [Source officielle HTTP Request](https://github.com/n8n-io/n8n/blob/master/packages/nodes-base/nodes/HttpRequest/V3/HttpRequestV3.node.ts)
