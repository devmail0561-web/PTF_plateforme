# Contribuer sur PTF — {{PROJECT_NAME}}

**Version :** 1.0  
**Date :** {{DATE}}  
**Projet ID :** `{{PROJECT_CRYPTO_ID}}`

---

## Bienvenue

{{PROJECT_DESCRIPTION}}

PTF (Parallel Task Framework) est une plateforme décentralisée où les développeurs monétisent leurs compétences en réclamant des tâches rémunérées. Chaque tâche complétée rapporte des **crédits PTF (1 crédit = 1 USDC)** et des **points de réputation**.

---

## 0. Avant de contribuer : comprendre le projet

Avant toute action, lis les deux fichiers de référence de CE projet :

1. **`docs/ARCHITECTURE.md`** — décrit l'architecture complète : modules, interfaces, contraintes techniques, dépendances. C'est la carte du projet.
2. **`docs/PLAN_ACTION.md`** — liste toutes les tâches PTF avec leurs IDs, dépendances, rewards et critères de succès. Chaque tâche en découle directement.

Ces fichiers ont été générés et validés par PTF via `ptf validate-docs`. Ils constituent la source de vérité du projet — chaque tâche disponible en découle directement.

**Si une tâche semble ambiguë :** relis la section `## Modules / Composants` de `ARCHITECTURE.md` correspondant au module concerné. Le champ `context` et l'`objective` de chaque tâche sont la source de vérité pour ce qui est attendu.

**En cas de doute persistant :** ouvre une discussion sur la tâche avant de la réclamer — sans l'engager :

```bash
ptf task discuss <taskId>   # pose une question sur une tâche sans la réclamer
```

---

## 1. S'inscrire sur PTF

### 1.1 Créer un compte

PTF utilise **GitHub OAuth** comme identité de base, couplée à un **wallet crypto** pour recevoir les paiements.

```bash
# Installation du CLI PTF
npm install -g @ptf/cli

# Connexion via GitHub OAuth
ptf auth login --github

# Lier un wallet (MetaMask, WalletConnect, ou wallet PTF interne)
ptf wallet connect --address <YOUR_WALLET_ADDRESS>

# Vérifier votre profil
ptf profile
```

Votre profil PTF contient :
- Votre identifiant GitHub
- Votre adresse wallet
- Votre score de réputation (commence à 0)
- Votre historique de tâches
- Votre solde de crédits PTF

### 1.2 Prérequis techniques

{{PREREQUISITES_TABLE}}

### 1.3 Lire la documentation du projet

Avant de réclamer une tâche :
1. **`docs/ARCHITECTURE.md`** — architecture complète du projet
2. **`docs/PLAN_ACTION.md`** — toutes les tâches PTF avec leurs IDs, dépendances et rewards
3. La description de la tâche via `ptf show <task_id>`

---

## 2. Trouver et réclamer une tâche

### 2.1 Trouver une tâche disponible

```bash
# Lister les tâches ouvertes du projet
ptf tasks list --project {{PROJECT_CRYPTO_ID}}

# Filtrer par reward minimum et compétence
ptf tasks list --project {{PROJECT_CRYPTO_ID}} --min-reward 50 --skill typescript

# Filtrer par type ou priorité (format legacy)
ptf list --project {{PROJECT_CRYPTO_ID}} --type feature --priority high

# Filtrer par langage
ptf list --project {{PROJECT_CRYPTO_ID}} --language {{TASK_LANGUAGE}}

# Lister tous les projets disponibles (projets privés automatiquement anonymisés)
ptf projects list
ptf projects list --type public    # publics uniquement

# Voir le détail complet d'une tâche (contraintes, scoring, reward, punishments, deadline)
ptf task show <task_id>
```

Une tâche est disponible (`open`) si :
- Son statut est `open`
- Toutes ses dépendances (`blockedBy`) sont en statut `completed`
- Sa deadline n'est pas dépassée

> **Projets privés dans les listings :** les projets privés apparaissent dans `ptf projects list` avec nom anonymisé (`"Private Project #xxxx"`), owner masqué (`"0x****...****"`) et repo à `null`. Les infos de claim restent visibles (reward, duration, claimCriteria, stack). Pour les tâches de projets privés, le `projectName` est également anonymisé.

### 2.2 Réclamer une tâche — flow en 4 étapes

```bash
# Étape 1 — Lister les tâches disponibles
ptf tasks list
ptf tasks list --project {{PROJECT_CRYPTO_ID}} --min-reward 50 --skill typescript

# Étape 2 — Voir le détail d'une tâche
ptf task show <task_id>
# [Projet paid] → Vérifie immédiatement : solde PTF ≥ 10 crédits
#                → Si insuffisant → ❌ "Solde insuffisant (X PTF). Déposez des crédits : ptf wallet deposit"
#                → Si ok → affiche conditions complètes (punishments crédits+réputation,
#                           deadline, verificationSteps, reward, contraintes, langue requise)
# [Projet free] → Pas de vérification de solde
#                → Affiche directement les conditions (punishments réputation uniquement,
#                   deadline, verificationSteps, contraintes, langue — reward: null/0)

# Étape 3 — Réclamer la tâche
ptf task claim <task_id>
# → Vérification wallet (6 critères)
# → Vérification claimCriteria
# → Si ok → affiche conditions complètes + confirmation interactive
# → Dev tape [o/N]
# → Si confirmé → attribution + signature EIP-712 automatique + enregistrement on-chain

# Étape 4 — Voir ses tâches réclamées
ptf tasks mine
ptf tasks mine --status in_progress
ptf tasks mine --project {{PROJECT_CRYPTO_ID}}
```

> **Vérification avant attribution — ordre des barrières**
>
> **Projet paid (public paid ou private) :**
> 1. **Solde ≥ 10 PTF** — vérifié dès `ptf task show` (avant même d'afficher les conditions)
> 2. **Wallet valide (6 critères)** — vérifié au `ptf task claim` : format EIP-55, activité on-chain, MATIC > 0.01, PTF >= 10, non banni, ownership prouvé
> 3. **claimCriteria** — minReputation, minCompletedTasks, requiredSkills, maxActiveTasks (librement configurés par le responsable)
> 4. **Conditions complètes affichées** — punishments, deadline, verificationSteps, reward, contraintes, langue
> 5. **Confirmation interactive** — le dev tape `[o/N]`
> 6. **Attribution + signature EIP-712 automatique + on-chain** — si confirmé
>
> **Projet free (public free) :**
> 1. ~~Solde ≥ 10 PTF~~ — non applicable, aucune vérification de solde
> 2. **Wallet valide (6 critères)** — vérifié au `ptf task claim` : format EIP-55, activité on-chain, MATIC > 0.01, non banni, ownership prouvé (le critère solde PTF >= 10 est ignoré)
> 3. **claimCriteria** — minReputation, minCompletedTasks, requiredSkills, maxActiveTasks (librement configurés par le responsable)
> 4. **Conditions complètes affichées** — punishments (réputation uniquement), deadline, verificationSteps, contraintes, langue
> 5. **Confirmation interactive** — le dev tape `[o/N]`
> 6. **Attribution + signature EIP-712 automatique + on-chain** — si confirmé

La réclamation (`ptf task claim`) :
- Lie votre wallet à la tâche
- Passe le statut de `open` à `claimed`
- **Démarre un timer** : `deadline = claimedAt + duration` (la durée est définie par tâche, défaut 30 jours)
- Une seule personne peut réclamer une tâche à la fois (anti-collision automatique)
- Si vous abandonnez, la tâche repasse en `open` après {{CLAIM_TIMEOUT_HOURS}}h

> **Langue requise :** la langue est configurée par le créateur du projet et affichée dans les conditions lors du claim (ex : `Langue requise : TypeScript 5.0+`, `Langages interdits : Python, Go`). Elle est vérifiable automatiquement dans les contraintes de la tâche.

Les critères de réclamation (`claimCriteria`) sont **vérifiés automatiquement** au moment du `ptf task claim`. Ils sont **librement configurés par le responsable du projet** — aucun n'est obligatoire. La garantie 10 PTF est une règle **systémique** (non configurable) qui s'applique uniquement aux projets paid.

| Critère | Description | Obligatoire ? |
|---------|-------------|---------------|
| `minReputation` | Score de réputation minimum requis | Non — au choix du responsable |
| `minCompletedTasks` | Nombre de tâches complétées sur PTF | Non — au choix du responsable |
| `requiredSkills` | Compétences déclarées dans votre profil | Non — au choix du responsable |
| `maxActiveTasks` | Nombre max de tâches actives simultanées | Non — au choix du responsable |

> **Garantie 10 PTF :** ce n'est pas un critère configurable — c'est une règle systémique vérifiée avant tout pour les projets **paid** (public paid ou private). Elle ne s'applique pas aux projets **free**.

Si vous ne satisfaites pas l'un des claimCriteria configurés, le claim est rejeté immédiatement avec le motif précis.

### 2.3 Mes tâches réclamées

```bash
# Voir toutes ses tâches réclamées (tous projets)
ptf tasks mine

# Filtrer par statut
ptf tasks mine --status in_progress

# Filtrer par projet
ptf tasks mine --project {{PROJECT_CRYPTO_ID}}
```

La vue `ptf tasks mine` affiche pour chaque tâche : taskId, projectName (anonymisé si projet privé), titre, statut, deadline, jours restants, reward, langue requise.

### 2.4 Listing des contributeurs (projets publics uniquement)

```bash
# Lister les contributeurs d'un projet public
ptf contributors list {{PROJECT_CRYPTO_ID}}

# Vérifier si une adresse est déjà contributeur
ptf contributors verify {{PROJECT_CRYPTO_ID}} <wallet_address>
```

> Cette fonctionnalité est réservée aux projets publics. Sur les projets privés, toute tentative retourne l'erreur `PRIVATE_PROJECT_CONTRIBUTORS_HIDDEN`.

### 2.5 Créer une branche de travail

```bash
git clone {{PROJECT_REPO_URL}}
cd {{PROJECT_REPO_NAME}}
git checkout -b ptf/<task_id>-<short-description>
```

---

## 3. Implémenter dans les contraintes

Chaque tâche PTF définit des **contraintes strictes de soumission**. La validation est automatique et bloquante.

### 3.1 Contraintes structurelles

| Contrainte | Description | Vérification |
|-----------|-------------|--------------|
| `maxFiles` | Nombre maximum de fichiers modifiés | `ptf validate` compte les fichiers du diff |
| `maxLinesPerFile` | Lignes max par fichier modifié | Analyse statique du diff |
| `maxTotalLines` | Total de lignes modifiées (ajouts + suppressions) | `git diff --stat` |
| `requiredTests` | Fichier(s) de test obligatoire(s) | Présence vérifiée par naming convention |
| `minTestCoverage` | Couverture minimum en % | Rapport de couverture analysé |
| `languages` | Langages autorisés | Extension et toolchain détectées |
| `forbiddenPatterns` | Regex de patterns interdits | Scan du code soumis |

### 3.2 Bonnes pratiques obligatoires

- **Documentation inline** : toutes les fonctions/méthodes publiques doivent avoir un commentaire
- **Pas de secrets** : aucune clé API, token, ou mot de passe dans le code (scan automatique)
- **Pas de TODO non justifié** : les `TODO` doivent référencer un task ID PTF (`// TODO: ptf/<task_id>`)
- **Logs structurés** : utiliser le logger du projet, pas `console.log` nu

### 3.3 Vérifier avant de soumettre

```bash
# Validation complète en mode dry-run
ptf validate <task_id> --dry-run

# Sortie attendue
# ✅ maxFiles: 3/5 fichiers modifiés
# ✅ maxTotalLines: 420/500 lignes
# ✅ Tests présents: src/__tests__/feature.test.ts
# ✅ Coverage: 84% (seuil: {{COVERAGE_THRESHOLD}}%)
# ✅ Aucun secret détecté
# ✅ Patterns interdits: 0 occurrence
# ✅ Documentation inline: 100% des exports
```

---

## 4. Soumettre une tâche

### 4.1 Commande de soumission

```bash
# Push de la branche
git push origin ptf/<task_id>-<short-description>

# Soumission PTF (crée automatiquement la PR et déclenche la validation)
ptf submit <task_id> --branch ptf/<task_id>-<short-description>
```

### 4.2 Format du commit

```
ptf(<task_id>): <Description impérative courte>

<Corps optionnel détaillant le WHY et les choix techniques>

PTF-Task: <task_id>
PTF-Project: {{PROJECT_CRYPTO_ID}}
```

### 4.3 Ce qui se passe après soumission

Le statut passe à `in_review`. La validation se déroule en trois étapes :

1. **Validation automatique PTF** (immédiat)
   - Contraintes structurelles (fichiers, lignes)
   - Tests et couverture
   - Scan de sécurité (secrets, patterns interdits)
   - Compilation et build

2. **Peer review** (sous {{PEER_REVIEW_DELAY}})
   - 1 reviewer PTF certifié assigné aléatoirement (pondéré par réputation)
   - Revue du code, de l'architecture, de la lisibilité
   - Peut demander des modifications (`disputed`) ou approuver

3. **Validation client** (sous 72h — auto-approbation si silence passé ce délai)
   - Le client (propriétaire du projet) valide l'acceptance criteria
   - Approbation finale déclenchant la distribution des crédits

---

## 5. Crédits et réputation

### 5.1 Distribution des crédits PTF

Dès validation complète (auto + peer + client) :

```bash
# Les crédits sont automatiquement envoyés à votre wallet
ptf wallet balance

# Historique des transactions
ptf wallet history

# Vérifier la validité cryptographique des crédits signés
ptf wallet verify <address>
```

- **1 crédit PTF = 1 USDC**
- Les crédits sont représentés en **float64, 6 décimales** (ex : `10.500000 PTF`)
- **Minimum de retrait : 1.0 PTF**
- Les crédits sont transférables et convertibles
- Pas de frais de plateforme sur les 3 premiers mois (`{{PLATFORM_FEE_WAIVER_DATE}}`)

### 5.2 Calcul du reward

Le reward est fixé à la création de la tâche et visible via `ptf task show <task_id>` :

```
reward = base_amount (USDC)
```

Le reward est déposé en escrow lors de la création du projet. Il ne peut pas être modifié après réclamation.

### 5.3 Recharger son compte

Pour participer à des projets paid, votre solde doit rester au minimum à 10 PTF. Vous pouvez déposer des crédits depuis plusieurs sources :

```bash
# Dépôt depuis la blockchain Polygon en USDC
ptf wallet deposit --chain polygon --amount 50 --token USDC

# Dépôt en ETH (conversion automatique vers PTF)
ptf wallet deposit --currency ETH --amount 0.1

# Conversion depuis une devise fiat
ptf wallet convert --from EUR --amount 100
```

> **Securite — verifier l'adresse PTF avant tout envoi de fonds**
>
> Avant d'envoyer des fonds, **verifiez toujours l'adresse de destination officielle** via la Merkle root du reseau PTF. Ne jamais envoyer de fonds a une adresse non verifiee.
>
> ```bash
> # Lister les adresses officielles PTF verifiees sur le reseau
> ptf network addresses
> ```
>
> Toute adresse qui ne figure pas dans cette liste est suspecte. PTF ne remboursera pas les fonds envoyes a une adresse non officielle.

### 5.4 Conversion de devises

```bash
# Convertir depuis EUR, USD, GBP, etc. vers des credits PTF
ptf wallet convert --from EUR --amount 100

# Convertir depuis ETH ou une autre crypto
ptf wallet deposit --currency ETH --amount 0.1   # conversion automatique en PTF
```

### 5.5 Évolution de la réputation

Les **points de réputation** sont **calculés automatiquement par PTF** à chaque tâche complétée. Le créateur du projet ne peut pas configurer directement le champ `reputationPoints` — il définit uniquement les paramètres `complexity`, `effort` et `impact` (échelle 1–5) dans le bloc `scoring` de chaque tâche. PTF en déduit les points.

```
reputationGained = scoring.reputationPoints × qualityMultiplier

# scoring.reputationPoints est calculé automatiquement par PTF
# à partir de : complexity (1-5) × effort (1-5) × impact (1-5)

qualityMultiplier:
  - Validation du premier coup (0 demandes de modification) : 1.2×
  - Livraison avant deadline :                                1.1×
  - Livraison dans les temps :                               1.0×
  - Livraison après 1 demande de modification :              0.9×
  - Livraison après 2+ demandes de modification :            0.7×
```

La réputation débloque des avantages :
- **Score 0–99** : accès aux tâches `low` et `medium`
- **Score 100–499** : accès aux tâches `high`
- **Score 500+** : accès aux tâches `critical`, éligibilité peer reviewer
- **Score 1000+** : badge "Senior PTF Developer", visibilité accrue

### 5.6 Litiges (`disputed`)

Si vous contestez le rejet d'une soumission :

```bash
ptf dispute <task_id> --reason "{{DISPUTE_REASON}}"
```

Un panel de 3 reviewers PTF séniors tranche sous 48h. En cas de décision en votre faveur, vous recevez le reward complet + 10% de bonus de litige.

---

## 6. Garantie et responsabilité

### 6.1 Garantie minimum de 10 crédits (projets paid uniquement)

> **Cette section s'applique uniquement aux projets paid (public paid et private).** Pour les projets **public free**, aucune garantie de solde n'est requise.

Pour réclamer une tâche sur un **projet paid**, votre wallet doit contenir **au minimum 10 crédits PTF (10 USDC)**. Cette garantie est vérifiée automatiquement dès `ptf task show`, avant même d'afficher les conditions.

**Pourquoi ?** Les crédits servent de caution. En cas de faute grave (code malveillant, bug critique), des pénalités sont prélevées directement sur votre solde. Sans solde minimum, le système de punitions crédits ne peut pas fonctionner.

```bash
# Vérifier votre solde avant de réclamer (projets paid)
ptf wallet balance

# Vérifier la validité cryptographique de vos crédits
ptf wallet verify <address>

# Vérification complète du wallet (6 critères)
ptf wallet status
# → Format EIP-55          : ✅ valide
# → Wallet active          : ✅ (au moins 1 tx on-chain)
# → Solde MATIC (gas)      : ✅ > 0.01 MATIC
# → Solde PTF credits      : ✅ >= 10 crédits  ← vérifié uniquement pour projets paid
# → Wallet banni           : ✅ non banni
# → Ownership prouvé       : ✅ nonce signé et vérifié
```

> **Vérifications automatiques :** avant toute opération (`ptf task claim`, `ptf wallet withdraw`), PTF exécute automatiquement les **6 vérifications** ci-dessus. Pour les projets **free**, la vérification du solde PTF >= 10 est ignorée. En cas d'échec sur un autre critère, l'opération est bloquée avec le motif précis.

Si votre solde est insuffisant sur un projet paid :
```
❌ Solde insuffisant (4 PTF). Déposez des crédits : ptf wallet deposit
   Minimum requis : 10 crédits PTF
```

### 6.2 Système de punitions

PTF est un **écosystème cryptographique qui récompense ET punit**. Chaque tâche définit ses propres barèmes de pénalités dans le champ `punishments`. Les règles diffèrent selon le mode du projet.

**Distribution des pénalités crédits (projets paid) :**
- **80 %** des crédits prélevés vont à la **trésorerie PTF**
- **20 %** vont au **fonds du projet** concerné

**Projet public free** — pénalités de réputation uniquement (aucun débit de crédits) :

| Type de faute | Pénalité crédits | Pénalité réputation | Autre sanction |
|---------------|-----------------|---------------------|----------------|
| Livraison en retard | — | Variable (défini par tâche) | — |
| Bug critique en production | — | Variable | — |
| Bug non critique | — | Variable | — |
| Code malveillant / backdoor | — | Variable | Ban décidé par PTF |

**Projet paid** (public paid ou private) — pénalités crédits + réputation :

| Type de faute | Pénalité crédits | Pénalité réputation | Autre sanction |
|---------------|-----------------|---------------------|----------------|
| Livraison en retard | Variable (défini par tâche) | Variable | — |
| Bug critique en production | Variable | Variable | — |
| Bug non critique | Variable | Variable | — |
| Code malveillant / backdoor | Variable (jusqu'à solde complet) | Variable | Ban décidé par PTF |

Pour les projets **paid**, les pénalités crédits sont **prélevées automatiquement** sur votre wallet lors de la validation (ou de la détection post-merge). Pour les projets **free**, seule la réputation est affectée — aucun débit de crédits.

> **Le bannissement est une décision exclusive de la plateforme PTF, jamais du créateur du projet.** Le créateur ne peut pas déclencher un ban directement. Il peut uniquement signaler un comportement problématique via `ptf report` (voir section 6.3). C'est PTF qui analyse et décide.

Vous ne pouvez pas contester une pénalité `maliciousCode` — la détection automatique fait foi.

Pour les autres types de pénalités, vous pouvez ouvrir un litige :

```bash
ptf dispute <task_id> --reason "Explication de la contestation"
```

### 6.3 Signalement d'un comportement problématique

Si vous constatez un comportement malveillant de la part d'un autre développeur (code dangereux, plagiat, fraude, harcèlement…), vous pouvez le signaler à PTF. **Le signalement ne déclenche pas de sanction automatique** — PTF analyse le dossier et prend la décision.

```bash
ptf report --dev <address> --reason <raison> --task <taskId> --evidence "description détaillée"
```

Raisons acceptées :

| Raison | Description |
|--------|-------------|
| `malicious_code` | Code contenant une backdoor, un exploit, ou un comportement malveillant |
| `plagiarism` | Code copié sans attribution |
| `fraud` | Fausse réclamation, fausses preuves de complétion |
| `harassment` | Comportement abusif envers d'autres membres |
| `spam` | Réclamations abusives ou soumissions vides |
| `other` | Tout autre comportement contraire aux règles PTF |

**Ce qui se passe après un signalement :**
1. PTF enregistre le signalement on-chain (immuable)
2. Un analyste PTF examine les preuves fournies
3. PTF peut demander des informations complémentaires
4. Si le signalement est fondé : avertissement, pénalité, ou bannissement selon la gravité
5. Si le signalement est infondé : le dossier est classé sans suite

> Le créateur d'un projet **ne peut pas bannir** un développeur directement. Cette décision appartient exclusivement à PTF.

---

## 7. Règles et éthique

- **Une tâche à la fois** : vous ne pouvez réclamer qu'une tâche par projet simultanément
- **Pas de copie** : tout code soumis doit être original (détection de plagiat automatique)
- **Respect des interfaces** : ne pas modifier les contrats définis en Phase 1 sans approbation
- **Communication** : utiliser les commentaires PTF sur la tâche, pas de canaux externes non documentés
- **Immutabilité des tâches réclamées** : une tâche que tu as réclamée (statut ≠ `open`) ne peut plus être modifiée ni supprimée par le créateur du projet. Cette règle est stricte et définitive — elle vous protège contre toute modification des conditions en cours de route.
- **Sécurité des dépôts** : avant d'envoyer des fonds vers PTF, vérifiez toujours l'adresse officielle via `ptf network addresses`. PTF ne remboursera pas les fonds envoyés à une adresse non vérifiée.

---

## 8. Support

- **Documentation PTF :** `ptf docs`
- **Canal projet :** {{COMMUNICATION_CHANNEL}}
- **Issues PTF :** `ptf issue create`
- **Question sur une tâche :** `ptf task discuss <taskId>` — pose une question sur une tâche sans la réclamer (utile pour lever une ambiguïté avant de s'engager)

---

**Bienvenue dans l'économie PTF — chaque ligne de code compte.**
