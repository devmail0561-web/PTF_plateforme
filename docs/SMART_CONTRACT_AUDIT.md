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

Audit multi-agents réalisé via workflow PTF (5 dimensions × vérification adversariale).

### Findings corrigés

| ID | Sévérité | Fichier | Titre |
|----|----------|---------|-------|
| C1 | Critical | `cli/src/utils/api.ts` | `isOffline()` toujours `true` — logique inversée |
| C2 | Critical | `wallet.resolver.ts` | `withdrawCredits` passait un cuid comme `ownerAddress` |
| C3 | Critical | `task.service.ts` | `TaskService` sans `UTXOService` — reward jamais minté |
| C4 | Critical | `task.service.ts` | `expire()` ne libérait pas le soft-lock (gel permanent) |
| C5 | Critical | `punishment.service.ts` | `PunishmentService` ne consommait pas les UTXOs (double-spend potentiel) |
| C6 | Critical | `task.resolver.ts` | `cancelTask` sans vérification d'ownership |
| C7 | Critical | `cli/src/commands/wallet.ts` | Dépôt toujours offline — adresse simulée sans avertissement |
| S1 | Critical | `EscrowVault.sol` | Double-spend intra-call : même utxoId deux fois dans `inputs[]` |
| S2 | Critical | `EscrowVault.sol` | Signatures UTXO sans domain separator (struct hash brut) |
| H1 | High | `utxo.service.ts` | TOCTOU : coin-selection hors transaction |
| H2 | High | `utxo.service.ts` | `proofHash` incompatible on-chain vs off-chain |
| H3 | High | `utxo.service.ts` | `verifyProof()` — digest EIP-712 incomplet |
| H4 | High | `utxo.service.ts` | Change UTXOs acceptés sans vérification |
| H5 | High | `wallet.ts` CLI | Retrait online sans gestion d'erreur |
| H6 | High | `wallet.ts` CLI | Retrait offline sans garde solde insuffisant |
| H7 | High | `wallet.ts` CLI | Commande `ptf wallet utxos` inexistante |
| H8 | High | `wallet.ts` CLI | Chain hardcodée `'polygon'` dans la mutation withdraw |
| H9 | High | `utxo.service.ts` | `lock()` TOCTOU avec `spend()` concurrent |
| S3 | High | `EscrowVault.sol` | Chain hardcodée `"polygon"` dans verification UTXO |
| S4 | High | `EscrowVault.sol` | `mintUTXOReceipt` sans idempotency — inflation possible |
| S5 | High | `utxo.service.ts` | Domain mismatch `"PTFEscrow"` vs `"PTFEscrowVault"` |
| R1 | High | `utxo.service.ts` | `spend()` deux `Date.now()` — txId non-déterministe sur retry |
| R2 | High | `utxo.service.ts` | `unlock()` silencieux sur solde insuffisant |
| M1 | Medium | `schema.prisma` | `balanceAfter` absent de `CreditEvent` |
| M2 | Medium | `utxo.service.ts` | `computeProofHash` hachait les signatures au lieu des utxoIds |
| M3 | Medium | `EscrowVault.sol` | `executePunishment` polluait `escrowBalance` USDC avec des unités PTF |
| M4 | Medium | `creditLedger.service.ts` | `utxoId` absent de `CreditEventEntry` |
| Lo1 | Low | `wallet.ts` CLI | Variable morte `sign` dans reputation-history |
| Lo2 | Low | `wallet.ts` CLI | Référence morte vers `ptf wallet verify-utxo` |

### Findings non corrigés (à planifier)

| ID | Sévérité | Raison du report |
|----|----------|-----------------|
| N1 | Critical | Aucun listener on-chain pour les dépôts UTXO — nécessite un worker dédié |
| N2 | High | Change UTXOs avec hash 32 bytes non-ECDSA — nécessite clé privée opérateur |
| N3 | Medium | Pas de réconciliation DB/on-chain après crash — nécessite worker + idempotency |
| N4 | Medium | `CreditTransaction.inputIds/outputIds` sans FK — migration à planifier |
| N5 | Medium | Arithmétique float sur les montants — migration vers entiers micro-PTF recommandée |

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
