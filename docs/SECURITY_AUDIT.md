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

## Stratégie d'audit et plan de correction

### Principes directeurs

Trois règles guident la séquence des audits et des corrections :

1. **Corriger avant d'auditer ce qui en dépend** — les contrats smart sont la couche la plus critique et la plus coûteuse à corriger post-déploiement. Ils sont audités et gelés en premier. Le backend s'adapte aux contrats, pas l'inverse.

2. **Audit indépendant de l'implémentation** — chaque dimension est auditée par un agent distinct qui n'a pas accès aux résultats des autres (workflow adversarial). La convergence de deux agents sur un même finding confirme sa réalité.

3. **Corriger au plus proche de l'état actuel** — un audit sur une base de code qui a bougé depuis le précédent audit est partiellement invalide. Chaque round d'audit est suivi d'une correction immédiate avant le round suivant.

---

### État de départ — ce qui est déjà en place

Avant de planifier les prochains audits, inventaire honnête de l'existant :

**Smart contracts — protections déjà présentes :**
- `EscrowVault` : `Pausable`, `ReentrancyGuard`, `nonReentrant` sur toutes les fonctions de transfert, `SafeERC20`, checks-effects-interactions
- `ProjectRegistry` : `onlyRegistrar`, `onlyOwner`, guards `projectExists`
- Pas de multisig ni timelock — `onlyOwner` = EOA PTF Corp (point critique)

**Backend — protections déjà présentes :**
- `assertSafeCommand()` : `execFile` (pas de shell), whitelist binaires, `FORBIDDEN_ARGS`, longueur max 200 chars
- Rate limiting Redis partagé (300/15min global, 20/15min auth)
- Redlock distribué sur Redis Sentinel pour les claims
- `depthLimitRule` (max 6) sur Apollo GraphQL
- Introspection GraphQL désactivée en production
- Graceful shutdown SIGTERM/SIGINT

**Ce qui manque concrètement :**
- Metacharacters shell (`&&`, `;`, `|`, `$()`, backticks) non bloqués dans les arguments de `assertSafeCommand`
- Pas de multisig sur `onlyOwner` des contrats
- Pas de timelock sur les opérations admin
- Pas de query complexity scoring (seulement depth limit)
- Pas de headers HTTP de sécurité (CSP, HSTS, X-Frame-Options)
- Nonces auth en mémoire (pas Redis) — perdus au redémarrage
- `TODO: Notification via NotificationService` dans TimerService

---

### Phase A — Avant testnet (blockers absolus)

**Fenêtre : 2–3 semaines**
Ces items bloquent le déploiement testnet. Un contrat déployé avec un `onlyOwner` EOA ne peut pas être corrigé sans redéploiement.

#### A-1 : Multisig + Timelock sur les contrats (semaine 1)

**Fichiers :** `ProjectRegistry.sol`, `EscrowVault.sol`, `CreditToken.sol`, `ReputationRegistry.sol`

**Actions :**
```
1. Déployer Gnosis Safe 3-of-5 sur Polygon Amoy
2. Transférer ownership de tous les contrats vers le Safe
3. Déployer TimelockController (OpenZeppelin) — délai 24h
4. Les fonctions onlyOwner critiques passent par le Timelock :
   - addRegistrar / removeRegistrar
   - pause / unpause
   - setTreasury
   - addMinter / removeMinter (CreditToken)
5. Les fonctions opérationnelles fréquentes (addOperator) restent
   accessibles directement par le Safe sans timelock
```

**Test :** Simuler une attaque — compromettre une clé du Safe (2/5) ne suffit pas à exécuter une action.

---

#### A-2 : Metacharacters shell dans assertSafeCommand (semaine 1)

**Fichier :** `backend/src/services/validation.service.ts`

**Problème confirmé :** `execFile` ne passe pas par le shell, donc `npm test; curl attacker.com` échouerait réellement — `execFile` passe la chaîne entière comme argument unique au binaire `npm`. Ce n'est pas un vrai vecteur avec `execFile`.

**Mais :** si un arg contient `$(...)` et est passé à un sous-processus qui lui fait appel au shell (ex: un Makefile ou script npm), l'injection peut être indirecte.

**Actions :**
```typescript
// Ajouter dans assertSafeCommand() après la vérification FORBIDDEN_ARGS
const SHELL_METACHAR_RE = /[;&|`$(){}<>\\!]/;
for (const arg of args) {
  if (SHELL_METACHAR_RE.test(arg)) {
    throw new PtfError(
      PtfErrorCode.UNAUTHORIZED,
      `Caractère shell interdit dans l'argument "${arg}"`
    );
  }
}
```

---

#### A-3 : Headers HTTP de sécurité (semaine 1)

**Fichier :** `backend/src/server.ts`

**Actions :**
```bash
npm install helmet
```
```typescript
import helmet from "helmet";
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
    },
  },
  hsts: { maxAge: 31536000, includeSubDomains: true },
}));
```

---

#### A-4 : Nonces auth persistés dans Redis (semaine 1)

**Fichier :** `backend/src/services/auth.service.ts`

**Problème :** Les nonces challenge-response sont actuellement en mémoire. Un redémarrage force l'utilisateur à refaire le challenge — pas critique mais mauvaise UX.

**Actions :** Stocker les nonces dans Redis Sentinel avec TTL 5min. Utiliser la même instance `redisSentinel` que pour les sessions.

---

#### A-5 : Query complexity scoring GraphQL (semaine 2)

**Fichier :** `backend/src/server.ts`

**Problème :** Un attaquant peut émettre des queries larges mais peu profondes — `tasks(limit: 200) { title context objective deliverable outOfScope... }` — qui passent le depth limit mais font beaucoup de travail DB.

**Actions :**
```typescript
// Score par champ = 1, par relation = 10
// Max complexité totale = 100
import { createComplexityRule } from "graphql-query-complexity";
const complexityRule = createComplexityRule({
  maximumComplexity: 100,
  estimators: [fieldExtensionsEstimator(), simpleEstimator({ defaultComplexity: 1 })],
  onComplete: (complexity) => {
    if (process.env["NODE_ENV"] !== "production") {
      console.log(`Query complexity: ${complexity}`);
    }
  },
});
// Ajouter dans validationRules: [depthLimitRule, complexityRule]
```

---

#### A-6 : Audit round 18 — contrats + backend (semaine 2-3)

**Périmètre :**
- `ProjectRegistry.sol` — nouvelles fonctions MetadataRegistry (registerTaskMetadata, setTaskArchiveId)
- `EscrowVault.sol` — vérifier que Pausable + Timelock sont correctement branchés
- `backend/src/services/metadata.service.ts` — nouveau service, non encore audité
- `backend/src/services/task.service.ts` — pattern `claim_pending` + rollback compensatoire

**Dimensions d'audit (4 agents indépendants) :**
1. **Contrats** — reentrancy, access control, MetadataRegistry hash manipulation
2. **Backend métadonnées** — cohérence hash, archivage Arweave, eviction
3. **Claim flow** — `claim_pending` + rollback, race condition, double-claim
4. **Intégration** — cohérence entre contrats et backend après A-1 à A-5

**Critère de sortie :** 0 finding Critical/High non corrigé.

---

### Phase B — Testnet (3–6 mois)

**Déclencheur :** Validation de la Phase A, 0 finding bloquant.

#### B-1 : Déploiement Polygon Amoy

```
Semaine 1 :
  - Déployer les 4 contrats + multisig Gnosis Safe + Timelock
  - Vérifier les contrats sur Polygonscan Amoy
  - Configurer le backend sur VPS Hetzner CX21

Semaine 2-4 :
  - 10 utilisateurs internes, projets fictifs
  - Monitoring : Grafana Cloud + Loki + Better Uptime

Mois 2-3 :
  - Beta ouverte, montants fictifs, vraie charge
  - Activer le ReconciliationWorker sur les vrais contrats
  - Tester MetadataService.archiveTask() sur Arweave testnet

Mois 4-5 :
  - Simulation mainnet — mêmes montants que les projets pilotes prévus
  - Load test : 100 claims simultanés, vérifier Redlock tient

Mois 6 :
  - Audit round 19 — testnet complet (focus: comportements emergents sous charge)
  - Critère de sortie : 0 incident critique sur 4 semaines consécutives
```

#### B-2 : Audit round 19 — testnet sous charge

**Dimensions :**
1. **Race conditions réelles** — 50 devs clament la même tâche simultanément
2. **ReconciliationWorker sous charge** — crash simulé à différentes étapes du claim
3. **MetadataStore** — nœuds qui servent des données corrompues (test de la vérification hash CLI)
4. **TimerService** — expiration massive de tâches (100 deadlines simultanées)

---

### Phase C — Mainnet (après testnet validé)

**Déclencheur :** Testnet stable 4 semaines consécutives sans incident.

#### C-1 : Audit externe optionnel

Si budget disponible : Trail of Bits, OpenZeppelin, Certik sur `EscrowVault.sol` uniquement (le contrat qui touche les fonds USDC réels). Coût estimé : 30–80k€.

Si pas de budget : round 20 avec 5 agents IA indépendants + Slither + Mythril + Foundry fuzz 100k runs. Critère : 0 finding Critical/High après consolidation.

#### C-2 : Déploiement mainnet progressif

```
Semaine 1 : Déploiement contrats sur Polygon mainnet
  - Multisig Gnosis Safe déjà testé sur testnet
  - Timelock 48h en mainnet (vs 24h testnet)
  - Limit: escrow max 1000 USDC par projet (garde-fou)

Mois 1 : 5 projets pilotes, reward pool < 500 USDC chacun
  - Monitoring 24/7
  - Circuit breaker activé sur EscrowVault si anomalie

Mois 2 : Retrait des limites si mois 1 sans incident
```

#### C-3 : Post-mainnet — items long terme

| Item | Horizon | Prérequis |
|---|---|---|
| Vérification on-chain obligatoire CLI | M+1 | Mainnet stable |
| NodeRegistry on-chain (phase 2 réseau) | M+3 | Staking économiquement viable |
| Commit-reveal anti front-running | M+6 | Après mesure du problème réel |
| TEE/SGX pour PTF Agent | M+12 | Budget infra |
| DAO + slashing | M+18 | Masse critique nœuds |

---

### Tableau de bord — état des corrections

| ID | Description | Statut | Phase |
|---|---|---|---|
| A-1 | Multisig + Timelock contrats | 🔴 À faire | Avant testnet |
| A-2 | Metacharacters shell assertSafeCommand | 🔴 À faire | Avant testnet |
| A-3 | Headers HTTP helmet | 🔴 À faire | Avant testnet |
| A-4 | Nonces auth dans Redis | 🔴 À faire | Avant testnet |
| A-5 | Query complexity scoring GraphQL | 🔴 À faire | Avant testnet |
| A-6 | Audit round 18 (contrats + backend) | 🔴 À faire | Avant testnet |
| B-1 | Déploiement Polygon Amoy | 🔴 À faire | Testnet |
| B-2 | Audit round 19 (testnet sous charge) | 🔴 À faire | Testnet |
| C-1 | Audit externe / round 20 | 🔴 À faire | Mainnet |
| C-2 | Déploiement mainnet progressif | 🔴 À faire | Mainnet |
| C-3 | Vérification on-chain CLI obligatoire | 🔴 À faire | Post-mainnet M+1 |
| C-4 | NodeRegistry on-chain | 🔴 À faire | Post-mainnet M+3 |
| C-5 | DAO + slashing | 🔴 À faire | Post-mainnet M+18 |

---

### Critères de sortie par phase

**Phase A complète quand :**
- [ ] Multisig 3-of-5 propriétaire de tous les contrats
- [ ] Timelock 24h sur fonctions admin
- [ ] `assertSafeCommand` bloque les metacharacters shell
- [ ] Headers helmet activés
- [ ] Nonces auth dans Redis
- [ ] Complexity scoring actif
- [ ] Audit round 18 : 0 finding Critical/High

**Phase B complète quand :**
- [ ] Testnet actif depuis 4 semaines sans incident critique
- [ ] ReconciliationWorker testé sur vrais events on-chain
- [ ] MetadataService.archiveTask testé sur Arweave testnet
- [ ] Load test 100 claims simultanés sans double-claim
- [ ] Audit round 19 : 0 finding Critical

**Phase C déclenchée quand :**
- [ ] Phase B validée
- [ ] Audit final : 0 finding Critical/High
- [ ] Gnosis Safe multisig testnet → clone mainnet
- [ ] Escrow max 1000 USDC configuré (garde-fou lancement)
