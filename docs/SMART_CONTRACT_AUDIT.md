# PTF — Stratégie d'audit smart contracts

**Approche** : Audit automatisé multi-outils + agents IA indépendants
**Coût** : 0€ (outils open source + LLM de l'utilisateur)
**Objectif** : Couverture équivalente à un audit professionnel via analyses comparatives

---

## Principe : audit comparatif indépendant

Plusieurs agents IA analysent les contrats de façon **indépendante** (sans voir les résultats des autres), puis les résultats sont croisés. Une vulnérabilité confirmée par plusieurs agents indépendants a une haute probabilité d'être réelle.

```
Contrat Solidity
      │
      ├──► Agent IA 1 (Claude)      ──► Rapport 1
      ├──► Agent IA 2 (GPT-4o)      ──► Rapport 2
      ├──► Agent IA 3 (Gemini)      ──► Rapport 3
      ├──► Slither (statique)       ──► Rapport 4
      ├──► Mythril (symbolique)     ──► Rapport 5
      └──► Foundry Fuzz             ──► Rapport 6
                │
                ▼
         Comparaison croisée
                │
                ▼
      Rapport consolidé
      (vulnérabilités confirmées par ≥2 sources)
```

---

## Résultats audit agents IA — 2026-07-31

Audit multi-agents réalisé via workflow PTF (5 dimensions × vérification adversariale), suivi de 4 rounds de corrections.

**Document de référence complet :** [`docs/SECURITY_AUDIT.md`](SECURITY_AUDIT.md) — scénarios d'attaque, corrections détaillées, invariants, guide pour futurs audits.

### Findings corrigés (32/36)

| ID | Sévérité | Couche | Titre | Commit |
|----|----------|--------|-------|--------|
| S1 | Critical | Contract | Double-spend intra-call via `inputs[]` dupliqués | `03fe287` |
| S2 | Critical | Contract | Signatures UTXO sans domain separator EIP-712 | `03fe287` |
| C1 | Critical | CLI | `isOffline()` toujours `true` — logique inversée | `03fe287` |
| C2 | Critical | Backend | `withdrawCredits` passait un cuid comme `ownerAddress` | `03fe287` |
| C3 | Critical | Backend | `TaskService` sans `UTXOService` — reward jamais minté | `03fe287` |
| C4 | Critical | Backend | `expire()` ne libérait pas le soft-lock (gel permanent) | `03fe287` |
| C5 | Critical | Backend | `PunishmentService` ne consommait pas les UTXOs | `03fe287` |
| C6 | Critical | Backend | `cancelTask` sans vérification d'ownership | `03fe287` |
| C7 | Critical | CLI | Dépôt toujours offline — adresse simulée sans avertissement | `03fe287` |
| S3 | High | Contract | Chain hardcodée `"polygon"` dans vérification UTXO | `03fe287` |
| S4 | High | Contract | `mintUTXOReceipt` sans idempotency — inflation possible | `03fe287` |
| H1 | High | Backend | TOCTOU : coin-selection hors transaction | `03fe287` |
| H2 | High | Backend | `proofHash` incompatible on-chain vs off-chain | `03fe287` |
| H3 | High | Backend | `verifyProof()` — digest EIP-712 incomplet | `03fe287` |
| H4 | High | Backend | Change UTXOs acceptés sans vérification | `03fe287` |
| H5 | High | CLI | Retrait online sans gestion d'erreur | `03fe287` |
| H6 | High | CLI | Retrait offline sans garde solde insuffisant | `03fe287` |
| H7 | High | CLI | Commande `ptf wallet utxos` inexistante | `03fe287` |
| H8 | High | CLI | Chain hardcodée `'polygon'` dans la mutation withdraw | `03fe287` |
| S6 | High | Backend | `lock()` TOCTOU avec `spend()` concurrent | `03fe287` |
| S7 | High | Backend | Domain mismatch `"PTFEscrow"` vs `"PTFEscrowVault"` | `03fe287` |
| S8 | High | Backend | `computeProofHash` hachait les signatures au lieu des utxoIds | `03fe287` |
| R1 | High | Backend | `spend()` deux `Date.now()` — txId non-déterministe sur retry | `03fe287` |
| R2 | High | Backend | `unlock()` silencieux sur solde insuffisant | `03fe287` |
| S5 | Medium | Contract | `executePunishment` polluait `escrowBalance` USDC avec des unités PTF | `03fe287` |
| M1 | Medium | Backend | `balanceAfter` absent de `CreditEvent` (Prisma) | `03fe287` |
| M2 | Medium | Backend | `utxoId` absent de `CreditEventEntry` | `03fe287` |
| M3 | Medium | Backend | `unlock()` partiel silencieux sans erreur | `03fe287` |
| N4 | Medium | Backend | `CreditTransaction.inputIds/outputIds` sans FK Prisma | `6a06212` |
| Lo1 | Low | CLI | Variable morte `sign` dans reputation-history | `03fe287` |
| Lo2 | Low | CLI | Référence morte vers `ptf wallet verify-utxo` | `03fe287` |
| N5 | Low | CLI | Mock UTXO IDs tronqués en mode offline | `6a06212` |

### Findings ouverts (4/36)

| ID | Sévérité | Raison du report |
|----|----------|-----------------|
| S9 | High | Change UTXOs avec keccak32 non-ECDSA — nécessite clé privée opérateur |
| N1 | Critical | Aucun listener on-chain pour les dépôts UTXO — worker dédié requis |
| N3 | Medium | Pas de réconciliation DB/on-chain après crash — worker + idempotency requis |
| — | Info | Arithmétique float sur les montants — migration vers entiers micro-PTF recommandée |

---

## Phase 1 — Outils automatisés (gratuit)

### Slither — Analyse statique
```bash
# Installation
pip install slither-analyzer

# Analyse complète
slither contracts/ --print human-summary
slither contracts/ --print inheritance-graph
slither contracts/ --detect reentrancy-eth,reentrancy-no-eth
slither contracts/ --detect unprotected-upgrade
slither contracts/ --detect arbitrary-send-eth
slither contracts/EscrowVault.sol
slither contracts/CreditToken.sol
slither contracts/ProjectRegistry.sol
slither contracts/ReputationRegistry.sol

# Rapport JSON pour comparaison
slither contracts/ --json audit/slither-report.json
```

Détecte : reentrancy, integer overflow, unprotected functions, tx.origin, dangerous strict equalities

### Mythril — Analyse symbolique
```bash
# Installation
pip install mythril

# Analyse par contrat
myth analyze contracts/EscrowVault.sol --solv 0.8.20
myth analyze contracts/CreditToken.sol --solv 0.8.20
myth analyze contracts/ProjectRegistry.sol --solv 0.8.20

# Avec timeout étendu pour analyse profonde
myth analyze contracts/EscrowVault.sol --execution-timeout 300

# Rapport JSON
myth analyze contracts/EscrowVault.sol -o json > audit/mythril-escrow.json
```

Détecte : integer overflow/underflow, reentrancy, unhandled exceptions, delegatecall injection

### Foundry — Tests avec invariants et fuzzing
```bash
# Installation
curl -L https://foundry.paradigm.xyz | bash

# Tests unitaires avec couverture
forge test -vvv
forge coverage --report lcov

# Fuzzing intensif (10 000 runs)
forge test --fuzz-runs 10000 --fuzz-seed 42

# Invariant testing (propriétés qui ne doivent JAMAIS être violées)
# Exemple d'invariant pour EscrowVault :
# "La somme de tous les escrowBalance[projectId] ne dépasse jamais le solde USDC du contrat"
forge test --match-contract EscrowVaultInvariant -vvv
```

Invariants critiques à tester :
```solidity
// test/invariants/EscrowVaultInvariant.t.sol
contract EscrowVaultInvariant is Test {
    // Invariant 1 : solvabilité
    function invariant_solvency() public {
        assertLe(vault.totalEscrowBalance(), usdc.balanceOf(address(vault)));
    }
    // Invariant 2 : soft-lock cohérent
    function invariant_softLock() public {
        for (address dev : knownDevs) {
            assertLe(vault.softLocked(dev), vault.creditBalance(dev));
        }
    }
    // Invariant 3 : distribution 80/20 correcte
    function invariant_punishmentDistribution() public {
        assertEq(vault.platformShare(), vault.totalPunishments() * 80 / 100);
    }
}
```

---

## Phase 2 — Agents IA indépendants

### Principe d'indépendance
Chaque agent IA reçoit le même contrat mais **sans voir les résultats des autres**. L'ordre d'analyse est randomisé. Les agents répondent en format structuré JSON.

### Prompt système de l'agent audit

Utiliser ce prompt avec chaque LLM (Claude, GPT-4o, Gemini...) :

```
Tu es un auditeur de smart contracts Solidity expert (équivalent Certik/Trail of Bits).
Analyse ce contrat Solidity de façon EXHAUSTIVE et INDÉPENDANTE.

Pour chaque vulnérabilité trouvée, retourne un objet JSON :
{
  "severity": "critical|high|medium|low|informational",
  "category": "reentrancy|overflow|access-control|logic|gas|other",
  "function": "nom de la fonction concernée",
  "line": numéro de ligne,
  "title": "titre court de la vulnérabilité",
  "description": "description technique précise",
  "attack_scenario": "comment un attaquant exploiterait cette faille",
  "recommendation": "correction Solidity précise",
  "confidence": "high|medium|low"
}

Vérifie OBLIGATOIREMENT :
1. Reentrancy (checks-effects-interactions respecté ?)
2. Integer overflow/underflow (SafeMath ou Solidity 0.8+ ?)
3. Access control (onlyOwner, roles, multisig ?)
4. EIP-712 : nonces présents ? chainId dynamique ? deadline ?
5. ERC-20 interactions : SafeERC20 ? callbacks ERC-777 ?
6. Logique économique : distribution 80/20 correcte ? soft-lock cohérent ?
7. Replay attacks cross-chain
8. Front-running possible ?
9. Griefing attacks (bloquer le contrat intentionnellement ?)
10. Upgradability (proxy pattern sécurisé ?)

Retourne UNIQUEMENT le JSON, pas de texte avant ou après.
```

### Commande ptf audit

```bash
# Lancer un audit comparatif complet
ptf audit --contract contracts/EscrowVault.sol

# Audit de tous les contrats
ptf audit --all

# Audit avec rapport comparatif
ptf audit --all --compare --output audit/report.md
```

### Flow de l'agent audit PTF

```
ptf audit --contract EscrowVault.sol
      │
      ├── [1] Slither scan → audit/slither.json
      ├── [2] Mythril scan → audit/mythril.json
      ├── [3] Agent IA 1 (LLM configuré) → audit/ai-agent-1.json
      ├── [4] Agent IA 2 (même LLM, contexte effacé) → audit/ai-agent-2.json
      ├── [5] Agent IA 3 (même LLM, contexte effacé) → audit/ai-agent-3.json
      │         (simuler l'indépendance via contextes séparés)
      │
      └── [6] Consolidation → audit/report.md
            Vulnérabilités confirmées par ≥2 sources = HIGH PRIORITY
            Vulnérabilités par 1 source = REVIEW NEEDED
            Faux positifs éliminés par vote
```

---

## Phase 3 — Rapport consolidé

### Format du rapport comparatif

```markdown
# Audit comparatif — EscrowVault.sol
Date : YYYY-MM-DD | Outils : Slither + Mythril + 3× IA

## Résumé
| Sévérité | Slither | Mythril | IA-1 | IA-2 | IA-3 | Confirmé |
|----------|---------|---------|------|------|------|---------|
| Critical | 1 | 1 | 1 | 1 | 1 | ✅ 1 |
| High | 0 | 1 | 2 | 1 | 2 | ✅ 1 |
| Medium | 2 | 1 | 3 | 2 | 3 | ✅ 2 |

## Vulnérabilités confirmées (≥2 sources)

### [CRITICAL] C-01 — Reentrancy dans releaseToDev
Sources : Slither ✅ Mythril ✅ IA-1 ✅ IA-2 ✅ IA-3 ✅
...

## Vulnérabilités à vérifier (1 source)
...
```

### Règles de priorisation

- **≥3 sources** → Correction obligatoire avant déploiement
- **2 sources** → Correction fortement recommandée
- **1 source** → Analyse manuelle requise
- **0 source (Foundry fuzz uniquement)** → Potentiellement un invariant violé — investigation

---

## Phase 4 — Testnet long (3–6 mois)

```bash
# Déploiement sur Polygon Amoy (testnet public)
npx hardhat run scripts/deploy.js --network polygon-amoy

# Ou avec Foundry
forge script scripts/Deploy.s.sol --rpc-url $POLYGON_AMOY_RPC --broadcast

# Vérifier les contrats sur explorer
forge verify-contract <address> EscrowVault --chain polygon-amoy
```

Programme testnet :
- Mois 1–2 : 10 utilisateurs internes, projets fictifs, montants fictifs
- Mois 3–4 : beta ouverte, montants fictifs, vraie charge
- Mois 5–6 : simulation mainnet avec les montants réels des projets pilotes
- Mois 7 : déploiement mainnet si aucun bug critique

---

## Checklist avant déploiement mainnet

### Automatisé
- [ ] Slither : 0 finding Critical/High
- [ ] Mythril : 0 finding Critical/High
- [ ] Foundry : tous les tests passent (couverture > 95%)
- [ ] Foundry fuzz : 100 000 runs sans échec
- [ ] Foundry invariants : tous validés
- [ ] 3× agents IA indépendants : 0 finding critique non adressé

### Manuel
- [ ] Revue du code par au moins 2 développeurs
- [ ] Toutes les vulnérabilités des audits automatisés adressées et revalidées
- [ ] Multisig configuré (Gnosis Safe 3-of-5)
- [ ] Timelock 24h sur les opérations critiques
- [ ] Circuit-breaker (Pausable) testé
- [ ] Testnet > 3 mois sans incident critique
- [ ] Documentation des fonctions critiques à jour

---

## Budget total : 0€

| Outil | Coût | Note |
|-------|------|------|
| Slither | Gratuit | Open source Python |
| Mythril | Gratuit | Open source Python |
| Foundry | Gratuit | Open source Rust |
| Agents IA | Gratuit* | *LLM de l'utilisateur |
| Testnet Polygon Amoy | Gratuit | Faucet MATIC disponible |
| **Total** | **0€** | |
