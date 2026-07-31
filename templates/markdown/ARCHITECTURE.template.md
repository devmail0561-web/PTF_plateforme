---
ptf_version: "1.0"
project_name: "{{PROJECT_NAME}}"
project_type: "public | private"
reward_mode: "{{REWARD_MODE}}"
stack:
  languages: ["{{LANGUAGE_1}}", "{{LANGUAGE_2}}"]
  frameworks: ["{{FRAMEWORK_1}}"]
  runtime: "{{RUNTIME_VERSION}}"
  database: "{{DB_TYPE}}"
  blockchain: "{{CHAIN}}"
code_language:
  primary: "{{PRIMARY_LANGUAGE}}"
  allowed: ["{{ALLOWED_LANGUAGE_1}}"]
  forbidden: []
  version: "{{LANGUAGE_VERSION}}"
---

# {{PROJECT_NAME}} — Architecture

> **Pour les IA (Claude, Cursor, Copilot...)** : Ce fichier est un template PTF.
> Remplis chaque section `{{PLACEHOLDER}}` en respectant les règles suivantes :
> - Chaque module a : Nom, Rôle, Inputs typés, Outputs typés, Dépendances
> - Chaque contrainte est MESURABLE : "< 200ms", "> 80% coverage", "0 erreur lint"
> - JAMAIS de termes vagues : "améliorer", "optimiser", "refactoriser" sans métrique
> - Chaque interface est typée TypeScript (ou équivalent selon le stack)
> - Le hors-scope est EXPLICITE (minimum 3 items)
> Ce fichier sera validé par `ptf validate-docs` avant génération des tâches.

> Ce document est la source de vérité pour la génération automatique des tâches PTF.
> Il doit être complet, précis et sans ambiguïté avant d'exécuter `ptf generate`.
> Un agent PTF lira ce fichier pour décomposer le projet en tâches implémentables.

---

## Architecture standard PTF

> Ce fichier est l'un des **2 fichiers d'entrée OBLIGATOIRES** pour `ptf generate` (avec `PLAN_ACTION.md`).
> Il doit respecter le format standard PTF pour passer la validation `ptf validate-docs`.

Sections obligatoires validées par `ptf validate-docs` :
- `## Objectif du projet`
- `## Hors-scope`
- `## Modules / Composants` (tableau Nom | Rôle | Inputs | Outputs | Dépend de)
- `## Interfaces` (avec blocs TypeScript)
- `## Contraintes techniques`
- `## Dépendances d'implémentation`
- `## Glossaire`

> **Note — Anonymisation (projets privés) :** Pour les projets de type `private`, les sections "Objectif du projet" et "Modules / Composants" seront partiellement masquées dans les listings publics. Le nom du projet, l'owner et le repo ne seront pas exposés. Les informations de claim (reward, stack, claimCriteria) restent visibles.

---

## Objectif du projet

<!--
INSTRUCTIONS :
- Décrire en 1 à 3 phrases MAX ce que fait le projet.
- Inclure un critère de succès mesurable et observable (ex: latence, taux d'erreur, débit).
- Identifier précisément le public cible (qui va l'utiliser, dans quel contexte).
- Eviter les généralités ("performant", "scalable") sans chiffre associé.

✅ BON EXEMPLE :
"API REST de gestion de portefeuille crypto permettant à des utilisateurs de suivre leurs
positions en temps réel. Critère de succès : réponse < 200ms pour 95% des requêtes sur
1 000 utilisateurs simultanés. Public cible : développeurs intégrant un dashboard DeFi."

❌ MAUVAIS EXEMPLE :
"Une API performante pour gérer des portefeuilles. Elle sera rapide et scalable."
→ Problèmes : pas de chiffre, pas de public cible précis, termes vagues non définis.
-->

**Description :** {{PROJECT_DESCRIPTION}}

**Critère de succès :** {{SUCCESS_CRITERION}}

**Public cible :** {{TARGET_AUDIENCE}}

**Mode de rémunération :** `{{REWARD_MODE}}` — `free` (projet open source, contributions sans reward USDC) | `paid` (projet rémunéré, escrow USDC, garantie 10 PTF requise)

---

## Hors-scope

<!--
INSTRUCTIONS :
- Lister explicitement tout ce qui N'est PAS dans ce projet.
- Chaque item doit être spécifique (éviter "la gestion des erreurs" → préférer "les retries automatiques sur timeout réseau").
- Ce bloc sert à aligner les attentes et éviter le gold-plating dans les tâches générées.
- Minimum 3 items.
-->

Ce qui n'est PAS dans le périmètre de ce projet :

- {{OUT_OF_SCOPE_1}}
- {{OUT_OF_SCOPE_2}}
- {{OUT_OF_SCOPE_3}}

---

## Modules / Composants

<!--
INSTRUCTIONS :
- Lister tous les modules/composants du système.
- Chaque ligne du tableau doit permettre à un développeur de comprendre :
  - Ce que fait le module (Rôle)
  - Ce qu'il reçoit en entrée (Inputs) — format précis si possible
  - Ce qu'il produit en sortie (Outputs) — format précis si possible
  - De quel(s) autre(s) module(s) il dépend (Dépend de)
- Si un module n'a pas de dépendance, mettre "—"

✅ BON EXEMPLE (inputs/outputs typés) :
| AuthService | Authentifie les utilisateurs via JWT | `{ email: string, password: string }` | `{ token: string (RS256, 1h), userId: UUID }` | UserRepository |
| RateLimiter | Limite les requêtes à 100 req/min par IP | `Request (IP: string, path: string)` | `void` ou `HTTP 429 + Retry-After header` | RedisCache |

❌ MAUVAIS EXEMPLE (description vague, pas de types) :
| AuthService | Gère l'auth | Les identifiants | Un token | — |
→ Problèmes : inputs non typés, output non typé, dépendances manquantes.
-->

| Nom | Rôle | Inputs | Outputs | Dépend de |
|-----|------|--------|---------|-----------|
| {{MODULE_1_NAME}} | {{MODULE_1_ROLE}} | {{MODULE_1_INPUTS}} | {{MODULE_1_OUTPUTS}} | {{MODULE_1_DEPS}} |
| {{MODULE_2_NAME}} | {{MODULE_2_ROLE}} | {{MODULE_2_INPUTS}} | {{MODULE_2_OUTPUTS}} | {{MODULE_2_DEPS}} |
| {{MODULE_3_NAME}} | {{MODULE_3_ROLE}} | {{MODULE_3_INPUTS}} | {{MODULE_3_OUTPUTS}} | {{MODULE_3_DEPS}} |

---

## Interfaces

<!--
INSTRUCTIONS :
- Documenter chaque interface publique exposée par le système.
- Utiliser le langage du projet (TypeScript, Python typings, Solidity ABI, etc.).
- Inclure les types de retour précis et les erreurs possibles.
- Si l'interface est un endpoint REST, documenter méthode HTTP, path, body/query params, réponse.
- Minimum : une interface par module externe.

EXEMPLE TypeScript :
interface IWalletService {
  getBalance(address: string): Promise<{ usdc: number; ptf: number }>;
  transfer(from: string, to: string, amount: number, token: "USDC" | "PTF"): Promise<TxHash>;
}

EXEMPLE REST :
POST /api/v1/tasks/{taskId}/claim
Body: { walletAddress: string }
Response 200: { taskId: string; claimedAt: string; deadline: string }
Response 409: { error: "ALREADY_CLAIMED" }
-->

### Interface : {{INTERFACE_1_NAME}}

```{{INTERFACE_LANGUAGE}}
{{INTERFACE_1_DEFINITION}}
```

### Interface : {{INTERFACE_2_NAME}}

```{{INTERFACE_LANGUAGE}}
{{INTERFACE_2_DEFINITION}}
```

---

## Contraintes techniques

<!--
INSTRUCTIONS :
- Lister toutes les contraintes non-fonctionnelles qui s'appliquent au projet.
- Chaque contrainte doit être vérifiable automatiquement si possible.
- Les contraintes de performance doivent avoir des chiffres précis.
- Les contraintes de sécurité doivent être actionnables (pas de "sécurisé" sans définition).
- La couverture de tests doit être définie par module, pas globalement.

✅ BON EXEMPLE :
Performance : "API répond < 200ms P95 sous 500 req/s — mesuré via k6 load test"
Sécurité : "Aucune clé privée dans le code — détectée par git-secrets à chaque commit"
Tests : "Module AuthService : couverture >= 90% — vérifié par npm run coverage"

❌ MAUVAIS EXEMPLE :
Performance : "API rapide" — pas de chiffre, non vérifiable
Sécurité : "Code sécurisé" — non actionnable, aucune règle concrète
Tests : "Bonne couverture" — aucun seuil défini
-->

### Performance

- {{PERF_CONSTRAINT_1}}
- {{PERF_CONSTRAINT_2}}

### Sécurité

- {{SECURITY_CONSTRAINT_1}}
- {{SECURITY_CONSTRAINT_2}}

### Compatibilité

- {{COMPAT_CONSTRAINT_1}}
- {{COMPAT_CONSTRAINT_2}}

### Couverture de tests minimale par module

| Module | Couverture minimale |
|--------|---------------------|
| {{MODULE_1_NAME}} | {{MODULE_1_COVERAGE}}% |
| {{MODULE_2_NAME}} | {{MODULE_2_COVERAGE}}% |
| {{MODULE_3_NAME}} | {{MODULE_3_COVERAGE}}% |

### Mode de rémunération

- **Mode de rémunération :** `free` (open source, contribution sans reward) | `paid` (rémunéré, escrow USDC, garantie 10 PTF)
- La valeur est définie dans le frontmatter YAML (`reward_mode`) et dans `ptf init --reward free|paid`
- `free` : pas d'escrow, pas de reward USDC, pénalités réputation uniquement
- `paid` : escrow obligatoire, reward USDC par tâche, garantie 10 PTF requise, pénalités crédits + réputation

### Langage du code

- **Langage principal :** `{{PRIMARY_LANGUAGE}}` (version `{{LANGUAGE_VERSION}}`)
- **Langages autorisés :** `{{ALLOWED_LANGUAGE_1}}`
- **Langages interdits :** aucun par défaut (à préciser si nécessaire)
- Tout fichier soumis dans un langage non autorisé sera rejeté automatiquement à la soumission
- La langue est configurable par tâche via le champ `constraints.languages`

> **Note PTF :** Ce champ est utilisé par PTF pour vérifier automatiquement que le code soumis respecte la langue configurée. La valeur de `code_language` dans le frontmatter YAML de ce fichier est la source de vérité pour le projet. Elle est affichée dans les conditions lors du `ptf task claim`.

---

## Dépendances d'implémentation

<!--
INSTRUCTIONS :
- Définir l'ordre dans lequel les modules doivent être implémentés.
- Un module ne peut pas être développé si ses dépendances ne sont pas complètes.
- Utiliser un diagramme ASCII ou une liste ordonnée numérotée.
- Indiquer les modules pouvant être développés en parallèle sur la même ligne.

EXEMPLE ASCII :
[Fondations] ──► [AuthService] ──► [WalletService] ──► [API Gateway]
                                └─► [TaskService]  ──►┘

EXEMPLE liste :
1. Fondations (bloque tout)
2. [AuthService, DatabaseLayer] — parallèles, dépendent de Fondations
3. [WalletService, TaskService] — parallèles, dépendent de AuthService
4. APIGateway — dépend de WalletService + TaskService
-->

```
{{DEPENDENCY_DIAGRAM}}
```

Ordre d'implémentation :

1. {{IMPL_ORDER_1}}
2. {{IMPL_ORDER_2}}
3. {{IMPL_ORDER_3}}

---

## Glossaire

<!--
INSTRUCTIONS :
- Définir tous les termes spécifiques au projet qui pourraient être ambigus.
- Un terme non défini ici peut conduire à des implémentations incorrectes.
- Inclure : acronymes, termes métier, noms de concepts propres au projet.
- Format : Terme — Définition en une phrase claire.

EXEMPLE :
- **Claim** — Action par laquelle un développeur réserve une tâche PTF pour l'implémenter.
- **Escrow** — Contrat smart qui détient les fonds USDC en attendant la validation de la tâche.
- **Reputation** — Score numérique non-transférable reflétant l'historique de contributions d'un wallet.
-->

- **{{TERM_1}}** — {{DEFINITION_1}}
- **{{TERM_2}}** — {{DEFINITION_2}}
- **{{TERM_3}}** — {{DEFINITION_3}}
