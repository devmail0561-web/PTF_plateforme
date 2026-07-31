# PTF — Security Audit Reference

**Version auditée :** v0.1.0 (commit `6a06212`) + rounds CIA 5–11 (2026-07-31)
**Date de l'audit :** 2026-07-31
**Méthode :** Workflow multi-agents adversarial (5 dimensions × vérification indépendante) + audit CIA complet (Confidentialité / Intégrité / Disponibilité) + corrections manuelles sur 11 rounds
**Périmètre :** Smart contracts EVM, backend Node.js/TypeScript, CLI TypeScript, système d'authentification, worker on-chain
**Résultat :** 80 findings — 78 corrigés, 2 ouverts (infrastructure)

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

**Total général : 80 findings — 78 corrigés — 2 ouverts**

Les 2 findings restants nécessitent une infrastructure de scan de blocs rétroactif :

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

**Problème :** Aucune vérification que `utxoId` n'a pas déjà été minté. Un opérateur compromis ou une erreur de retry pouvait appeler `mintUTXOReceipt()` plusieurs fois avec le même `utxoId` → inflation PTF illimitée.

**Correction :**
```solidity
if (spentUTXOs[utxoId]) revert UTXOAlreadySpent(utxoId);
spentUTXOs[utxoId] = true;
ptfToken.mint(dev, amount);
```

Le mapping `spentUTXOs` sert maintenant à la fois de guard double-spend (pour les retraits) et de guard double-mint.

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

## Findings ouverts (2 restants)

### [N3] MEDIUM — Pas de job de réconciliation rétroactif après crash prolongé

| | |
|---|---|
| **Fichier** | À créer : `backend/src/workers/reconciliation.worker.ts` |
| **Statut** | Ouvert — infrastructure manquante |

**Problème :** Le `DepositWorker` (N1) écoute les événements en temps réel et réconcilie les `UTXOSpent` courants, mais ne relit pas les blocs historiques après un crash prolongé. Un arrêt de plusieurs heures peut laisser des UTXOs désynchronisés.

**Solution requise :** Job de réconciliation périodique qui :
1. Lit le dernier bloc traité depuis un checkpoint (Redis ou DB)
2. Rejoue les events `CreditClaimed` / `UTXOSpent` manqués via `provider.getLogs()`
3. Applique `UTXOService.mint()` / `updateMany({ status: "spent" })` avec idempotency
4. Met à jour le checkpoint après chaque lot

---

### [CIA-I9] HIGH — DB commit avant confirmation on-chain

| | |
|---|---|
| **Fichier** | `backend/src/services/utxo.service.ts:371` |
| **Statut** | Ouvert — lié à N3 |

**Problème :** `spend()` commit la transaction DB avant que le tx on-chain soit confirmé. Si l'appel on-chain échoue après le commit, les UTXOs sont marqués `spent` en DB mais jamais brûlés on-chain.

**Solution requise :** Pattern saga / outbox : écrire l'intention en DB + déclencher l'on-chain dans le même appel, avec retry et réconciliation via le worker N3 en cas de divergence.

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
| Un `utxoId` ne peut être minté qu'une seule fois | `spentUTXOs[utxoId] = true` avant `mint()` |
| Un `utxoId` ne peut être dépensé qu'une seule fois | `spentUTXOs[utxoId]` check + `seenIds[]` intra-call |
| `softLocked[dev] ≤ creditBalance[dev]` | `invariant_softLock()` |

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
- [ ] `spentUTXOs[utxoId] = true` dans `mintUTXOReceipt()` avant `mint()`
- [ ] `executePunishment()` ne touche pas `escrowBalance` en PTF

### Risques résiduels connus

| Risque | Mitigation actuelle | Mitigation idéale |
|--------|---------------------|-------------------|
| Réconciliation rétroactive après crash prolongé (N3) | `DepositWorker` réconcilie `UTXOSpent` en temps réel | Worker de scan de blocs historiques depuis checkpoint |
| DB commit avant confirmation on-chain (CIA-I9) | `txHash` nullable + alertes logs | Pattern saga/outbox + retry on-chain piloté par worker N3 |
| Arithmétique float sur montants | `toFixed(6)` partout, `Math.round(x * 1e6)` pour on-chain | Migrer vers entiers en micro-PTF |
