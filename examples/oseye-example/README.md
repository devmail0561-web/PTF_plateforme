# OSEye — Exemple de projet PTF

Cet exemple montre comment OSEye a utilisé PTF comme **plateforme de recrutement décentralisé de développeurs** pour construire sa plateforme EDR/SIEM multi-OS sans constituer d'équipe interne fixe.

## Contexte

- **Entreprise :** OSEye (cybersécurité, EDR/SIEM multi-OS)
- **Besoin :** Développer OSEye v1.0 rapidement sans recruter 6 développeurs en CDI
- **Solution :** Publier 188 tâches rémunérées sur PTF, ouvertes aux développeurs du monde entier
- **Durée totale :** 33 semaines (8 mois)
- **Développeurs ayant participé :** 47 (issus de 12 pays)
- **Stack :** Agent Go (Linux/Windows/macOS) + Server Python + UI React

## Résultats

| Métrique | Recrutement classique (estimé) | Via PTF | Gain |
|----------|-------------------------------|---------|------|
| Durée totale | 18 mois | 8 mois | **-56%** |
| Tâches développées en parallèle (max) | 2–3 | 12 | **+300%** |
| Merge conflicts | ~30% | 5% | **-83%** |
| Time to merge PR | 4–5 jours | 8 heures | **-93%** |
| Coût développeurs | ~480 000 € (6 CDI × 8 mois) | 94 000 USDC | **-80%** |
| Soumissions malveillantes | Non mesurable | **0** | Grâce aux pénalités `maliciousCode` |
| Livraisons en retard | ~20% | 6% | **-70%** (timers + pénalités `lateDelivery`) |
| Litiges ouverts | — | **3** (tous résolus) | Escrow upfront = 0 impayé |

---

## Flux complet : d'OSEye à la livraison

### Étape 1 — Création du projet OSEye sur PTF

OSEye crée son espace projet sur PTF et publie son plan d'action.

```bash
# Connexion du compte OSEye (GitHub OAuth + wallet entreprise)
ptf auth login --github --org oseye

# Initialisation du projet depuis le plan d'action
ptf project create \
  --name "OSEye v1.0" \
  --plan docs/PLAN_ACTION.md \
  --repo https://github.com/oseye/oseye

# Résultat
# Project ID : 0x4a7f2c...d91e
# 188 tâches importées
# Reward pool estimé : 94 000 USDC
```

PTF génère automatiquement les IDs cryptographiques de chaque tâche :
```
Task ID = Hash(projectId + parentId + metadata + nonce)
```

OSEye configure également les punitions et critères de réclamation pour tout le projet :

```yaml
# Configuration des punitions globales OSEye (surchargeable par tâche)
projectPunishmentDefaults:
  lateDelivery:
    credits: 30
    reputation: 15
  maliciousCode:
    credits: 1000
    reputation: 500
    ban: "permanent"
  criticalBug:
    credits: 150
    reputation: 75
  nonCriticalBug:
    credits: 25
    reputation: 10

# Critères de réclamation pour les tâches critiques (Phase 1)
phase1ClaimCriteria:
  minReputation: 100
  minCompletedTasks: 5
  requiredSkills: ["go"]
  maxActiveTasks: 2
  minCreditBalance: 10

# Critères pour les tâches standard (Phases 2–10)
defaultClaimCriteria:
  minReputation: 50
  minCompletedTasks: 2
  requiredSkills: []
  maxActiveTasks: 3
  minCreditBalance: 10
```

### Étape 2 — Évaluation du coût total

```bash
ptf project estimate 0x4a7f2c...d91e

# Breakdown du reward pool
# Phase 1 (foundations)    : 12 tâches →  8 400 USDC
# Phase 2 (collectors)     : 25 tâches → 18 750 USDC
# Phase 3 (normalizers)    : 18 tâches → 12 600 USDC
# Phases 4–10              : ...
# ─────────────────────────────────────────────────
# Total tâches             : 188
# Total reward pool        : 94 000 USDC
# Frais plateforme PTF (3%):  2 820 USDC
# ─────────────────────────────────────────────────
# TOTAL à déposer en escrow: 96 820 USDC
```

### Étape 3 — Paiement en escrow

OSEye dépose les fonds **upfront** dans le contrat escrow PTF. Les fonds sont bloqués et libérés automatiquement à chaque tâche validée.

```bash
# Dépôt en escrow (signature wallet OSEye)
ptf escrow deposit \
  --project 0x4a7f2c...d91e \
  --amount 96820 \
  --token USDC

# Confirmation
# Escrow address : 0x91bc...44f2
# Balance        : 96 820 USDC
# Tâches financées: 188/188
# Statut projet   : active
```

Les tâches passent en statut `open` et deviennent visibles publiquement sur PTF.

### Étape 4 — Les développeurs réclament les tâches

Des développeurs du monde entier voient les tâches OSEye dans le marketplace PTF et réclament celles qui correspondent à leurs compétences.

```bash
# Un développeur (ex: @rustamov_dev depuis Tachkent) trouve les tâches OSEye
ptf list --project 0x4a7f2c...d91e --status open --language go

# Il consulte le détail d'une tâche
ptf show 0x8d3f...a201
# title: "platform/linux/fanotify/ — file events collector"
# type: feature
# priority: high
# reward: 750 USDC
# duration: "14d"
# deadline: claimedAt + 14 jours
# constraints:
#   maxFiles: 4
#   maxTotalLines: 500
#   requiredTests: true
#   minTestCoverage: 80%
#   languages: ["go"]
# claimCriteria:
#   minReputation: 50
#   minCompletedTasks: 2
#   requiredSkills: ["go"]
#   maxActiveTasks: 3
#   minCreditBalance: 10
# punishments:
#   lateDelivery: { credits: 30, reputation: 15 }
#   maliciousCode: { credits: 1000, reputation: 500, ban: "permanent" }
#   criticalBug:   { credits: 150, reputation: 75 }
#   nonCriticalBug:{ credits: 25, reputation: 10 }
# blockedBy: ["0x1a2b...c3d4"]  ← P1.17 LinuxDriver (déjà completed)

# Il réclame la tâche (critères vérifiés automatiquement)
ptf claim 0x8d3f...a201
# ✅ Réputation: 210 >= 50
# ✅ Tâches complétées: 8 >= 2
# ✅ Compétences: go ✓
# ✅ Tâches actives: 1/3
# ✅ Solde: 45 crédits >= 10
# Task 0x8d3f...a201 claimed by @rustamov_dev
# Timer démarré : deadline dans 14 jours (2024-03-29)
# Reward bloqué en escrow: 750 USDC
```

PTF identifie automatiquement les tâches parallélisables :

```bash
$ ptf parallelize --project 0x4a7f2c...d91e --phase 2

Phase 2 : 15 tâches, 6 clusters parallélisables

Cluster 1 (6 tâches — parallèles, toutes dépendent de P1.17 completed) :
  - 0x8d3f...a201 — platform/linux/fanotify/   → claimed by @rustamov_dev
  - 0x9e4a...b312 — platform/linux/inotify/    → claimed by @chen_wei_sh
  - 0xaf5b...c423 — platform/linux/netlink/    → claimed by @mbeki_code
  - 0xb06c...d534 — platform/linux/journald/   → claimed by @fernanda_ux
  - 0xc17d...e645 — platform/linux/udev/       → open
  - 0xd28e...f756 — platform/linux/syslog/     → open

Cluster 2 (séquentiel, attend Cluster 1 complet) :
  - 0xe39f...0867 — Adapters normalizer pour Cluster 1 → open (bloqué)

Recommandation: 2 tâches du Cluster 1 encore libres
```

### Étape 5 — Soumission via ptf submit

Une fois le développement terminé, le développeur soumet sa tâche.

```bash
# Push de la branche
git push origin ptf/0xaf5b-c423-linux-netlink

# Soumission PTF
ptf submit 0xaf5b...c423 --branch ptf/0xaf5b-c423-linux-netlink
```

### Étape 6 — Validation automatique

PTF valide instantanément les contraintes structurelles :

```yaml
# Résultat de validation — Task 0xaf5b...c423 (@mbeki_code)
✅ maxFiles: 3/4 fichiers modifiés
✅ maxTotalLines: 387/500 lignes
✅ Tests présents: agent/internal/platform/linux/netlink/collector_test.go
✅ Coverage: 87% (seuil: 80%)
✅ Interface Collector satisfaite:
   var _ collector.Collector = (*NetlinkCollector)(nil)
✅ Aucun secret hardcodé détecté
✅ Aucun goroutine leak (tous les goroutines utilisent ctx.Done())
✅ Documentation inline: 100% des exports

Statut: in_review → peer review assignée à @ptf_reviewer_4821
```

### Étape 7 — Peer review + validation client

- Un **reviewer PTF certifié** (score réputation > 500) effectue la revue sous 24h
- **OSEye** valide l'acceptance criteria via leur dashboard PTF

```bash
# Dashboard OSEye — suivi temps réel (multi-projets)
ptf project status 0x4a7f2c...d91e

# ── OSEye v1.0 (0x4a7f2c...d91e) ──────────────────────────────
# Phase 2 : 10/15 completed | 4 in_review | 1 open
# Escrow restant : 78 400 USDC
# Crédits distribués : 17 600 USDC
#
# Timers actifs :
#   0x8d3f...a201 (@rustamov_dev)  → deadline dans  9j 14h  [on track]
#   0x9e4a...b312 (@chen_wei_sh)   → deadline dans  6j  2h  [on track]
#   0xaf5b...c423 (@mbeki_code)    → deadline dans 11j  0h  [on track]
#   0xb06c...d534 (@fernanda_ux)   → deadline dans  3j  8h  ⚠️ [à risque]
#
# Pénalités appliquées ce mois : 0
# Bans actifs : 0
# ──────────────────────────────────────────────────────────────
```

### Étape 8 — Distribution des crédits

À validation complète, le contrat escrow transfère automatiquement les crédits :

```
Task 0xaf5b...c423 completed
  → @mbeki_code reçoit 750 USDC (wallet: 0x72da...9f01)
  → @mbeki_code gagne 85 points de réputation
  → Tâche 0xe39f...0867 (normalizer) débloquée → passe en open
```

---

## Architecture des tâches OSEye sur PTF

```
OSEye Project (0x4a7f2c...d91e)
│
├── Phase 1 — Foundations (séquentielle)
│   ├── P1.01 [completed] Types & interfaces Go         → 500 USDC
│   ├── P1.02 [completed] gRPC proto definitions        → 600 USDC
│   └── P1.17 [completed] LinuxDriver base              → 800 USDC  ← déblocage Phase 2
│
├── Phase 2 — Collectors Linux (parallèle)
│   ├── P2.01 [completed] fanotify collector            → 750 USDC
│   ├── P2.02 [completed] inotify collector             → 600 USDC
│   ├── P2.03 [completed] netlink collector             → 750 USDC
│   ├── P2.04 [in_review] journald collector            → 600 USDC
│   ├── P2.05 [claimed]   udev collector                → 550 USDC
│   ├── P2.06 [open]      syslog collector              → 500 USDC
│   └── P2.07 [open]      Adapters normalizer (bloqué)  → 900 USDC
│
└── ... Phases 3–10
```

---

## Fichiers de référence

Les fichiers OSEye utilisés comme base pour ce projet sont dans `/home/virus-one/Documents/OSEye_project/` :

- `docs/PLAN_ACTION.md` — 188 tâches PTF, 10 phases
- `docs/ARCHITECTURE.md` — architecture logicielle complète
- `CONTRIBUTING.md` — guide contributeur PTF adapté OSEye
- `.github/workflows/ci.yml` — CI multi-OS (Go + Python + React)
- `.github/workflows/ptf-validate.yml` — validation automatique PTF

---

## Leçons apprises

### Ce qui a bien fonctionné

1. **Escrow upfront** — les développeurs avaient confiance car le paiement était garanti. Taux de complétion des tâches réclamées : 94%.

2. **Phase 1 séquentielle avec interfaces figées** — crucial. Les 188 développeurs ont pu travailler en parallèle sans conflits d'API car les contrats Go étaient finalisés avant toute parallélisation.

3. **Validation automatique des contraintes** — 85% des problèmes détectés avant la peer review (secrets, leaks, coverage, interfaces). Les reviewers humains se concentraient sur la qualité architecturale.

4. **Réputation décentralisée** — OSEye n'avait pas à "faire confiance" : le score PTF des développeurs reflétait leur historique réel sur d'autres projets.

5. **Système de punitions dissuasif** — Aucune soumission malveillante sur 188 tâches. La combinaison `minCreditBalance: 10` + pénalités `maliciousCode: ban permanent` a suffi à garantir la bonne foi des contributeurs. Les 3 livraisons en retard ont déclenché automatiquement les pénalités `lateDelivery`, sans intervention manuelle d'OSEye.

### Ce qui pourrait être amélioré

1. **Estimation des rewards** — les estimations initiales sous-évaluaient la complexité de certaines tâches Go/eBPF. PTF devrait suggérer des adjustements basés sur l'historique de tâches similaires.

2. **Dépendances "soft" non documentées** — certaines tâches avaient des dépendances implicites (P3.05 nécessitait P2.08 terminé en pratique). PTF devrait permettre de déclarer des `softDependencies` en plus des `blockedBy`.

3. **Tests d'intégration cross-tâches** — les tests unitaires passaient, mais les tests d'intégration entre collectors échouaient parfois. PTF devrait supporter des tâches de type `integration-test` qui se déclenchent automatiquement quand un cluster est complet.

---

## Reproduire cet exemple

```bash
# 1. Installer le CLI PTF
npm install -g @ptf/cli

# 2. S'authentifier
ptf auth login --github

# 3. Cloner l'exemple OSEye
git clone https://github.com/ptf/ptf
cp -r ptf/examples/oseye-example mon-projet-ptf
cd mon-projet-ptf

# 4. Créer votre projet PTF depuis votre plan d'action
ptf project create --name "Mon Projet" --plan docs/PLAN_ACTION.md

# 5. Estimer le coût
ptf project estimate <project_id>

# 6. Déposer en escrow et activer les tâches
ptf escrow deposit --project <project_id> --amount <total_usdc> --token USDC

# 7. Suivre l'avancement
ptf project status <project_id>
```
