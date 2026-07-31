# Corrections d'audit PTF — 2026-07-31

Résumé des corrections appliquées suite à l'audit multi-agents du système UTXO PTF.

---

## CRITICAL

### [C1] `isOffline()` toujours `true` pour toute URL non-localhost
**Fichier :** `cli/src/utils/api.ts:204`
**Problème :** `config.ptfApiUrl.includes("localhost") === false` s'évalue toujours `true` pour toute URL de production — le CLI était en permanence en mode offline.
**Correction :** `this.offline = !config.ptfApiUrl` — offline uniquement si aucune URL n'est configurée. Les erreurs réseau tombent en fallback offline existant.

---

### [C2] `withdrawCredits` utilise `ctx.user.userId` (cuid) comme `ownerAddress`
**Fichier :** `backend/src/graphql/resolvers/wallet.resolver.ts:184`
**Problème :** `ctx.user.userId` est un cuid Prisma (`clx3ab…`), pas une adresse Ethereum. `UTXOService.spend()` ne trouvait aucun UTXO car aucun n'est indexé sous un cuid.
**Correction :** Résolution du wallet lié via `wallet.getLinkedChains(ctx.user.userId)` filtré sur `chain` — `ownerAddress` est maintenant l'adresse Ethereum correcte. Erreur 400 si aucun wallet lié pour la chaîne demandée.

---

### [C3] `TaskService` sans `UTXOService` — récompense de tâche jamais mintée
**Fichiers :** `backend/src/services/task.service.ts`, `backend/src/container.ts`
**Problème :** `TaskService` n'avait aucune référence à `IUTXOService`. Valider une tâche ne créait aucun UTXO.
**Correction :** `IUTXOService` ajouté comme dépendance de `TaskService`. Le soft-lock au claim (`UTXOService.lock()`) et le soft-unlock au cancel/expire (`UTXOService.unlock()`) sont maintenant appelés. `container.ts` mis à jour.
> **Note :** La mutation `validateTask` n'existe pas encore dans le schéma GraphQL — `UTXOService.mint()` doit être appelé lors de l'implémentation de cette mutation.

---

### [C4] `TaskService.expire()` ne libérait pas le soft-lock
**Fichier :** `backend/src/services/task.service.ts:399`
**Problème :** `expire()` ne faisait que `status = 'expired'` — les 10 PTF restaient gelés définitivement.
**Correction :** `expire()` appelle maintenant `walletService.softUnlock()`, `utxoService.unlock()` et enregistre un `creditLedger.record('soft_unlocked')` avant de mettre à jour le statut.

---

### [C5] `PunishmentService` ne consommait pas les UTXOs lors d'une pénalité
**Fichiers :** `backend/src/services/punishment.service.ts`, `backend/src/container.ts`
**Problème :** `PunishmentService` appelait `adapter.deductPenalty()` (burn on-chain) et `creditLedger.record()`, mais jamais `UTXOService.spend()`. Le ledger UTXO divergeait de l'état on-chain.
**Correction :** `IUTXOService` ajouté comme dépendance. `utxoService.spend()` est appelé après le burn on-chain. Si les UTXOs sont insuffisants (déjà dépensés), l'erreur est absorbée (le burn on-chain est canonique) avec un commentaire de réconciliation.

---

### [C6] `cancelTask` ne vérifiait pas que l'appelant est le claimer
**Fichier :** `backend/src/graphql/resolvers/task.resolver.ts:85`
**Problème :** N'importe quel utilisateur authentifié pouvait annuler la tâche de quelqu'un d'autre.
**Correction :** Vérification que l'un des wallets liés de l'utilisateur correspond à `task.devAddress`. Erreur 401 sinon.

---

### [C7] CLI `deposit` toujours en mode offline, affichait une adresse simulée sans avertissement clair
**Fichier :** `cli/src/commands/wallet.ts:83`
**Problème :** `printWarning("Mode offline — adresse PTF simulée")` appelé inconditionnellement. Un utilisateur online voyait une adresse simulée.
**Correction :** Branchement `if (client.isOffline()) { … offline flow … } else { … TODO on-chain flow … }`. Message clair que le flux on-chain n'est pas encore disponible en mode online.

---

## HIGH

### [H1] `spend()` — TOCTOU : coin-selection hors transaction
**Fichier :** `backend/src/services/utxo.service.ts:268`
**Problème :** `getUnspent()` était appelé hors du bloc `$transaction`. Deux requêtes concurrentes pouvaient sélectionner les mêmes UTXOs.
**Correction :** La coin-selection est maintenant effectuée à l'intérieur du `$transaction` avec un `findMany` qui lit depuis le snapshot transactionnel. Toutes les opérations (select, mark spent, create change, create tx) sont atomiques.

---

### [H2] `proofHash` incompatible on-chain / off-chain
**Fichier :** `backend/src/services/utxo.service.ts:162`
**Problème :** Off-chain : `keccak256(eip712Sig_1 || eip712Sig_2 || …)`. On-chain (`EscrowVault.sol:435`) : `keccak256(utxoId_1 || utxoId_2 || …)`. Les deux valeurs étaient différentes pour la même transaction.
**Correction :** `proofHash` off-chain calculé comme `keccak256(utxoId_1 || utxoId_2 || …)` — identique à l'on-chain.

---

### [H3] `verifyProof()` — non-EIP-712 : struct hash sans domain separator
**Fichier :** `backend/src/services/utxo.service.ts:429`
**Problème :** `ethers.recoverAddress(structHash, sig)` — le struct hash seul n'est pas un digest EIP-712 valide. La récupération échouait systématiquement sur des signatures réelles.
**Correction :** Construction du digest complet `keccak256("\x19\x01" || domainSeparator || structHash)` avant `recoverAddress`.

---

### [H4] `verifyProof()` — UTXOs de type `change` acceptés sans vérification
**Fichier :** `backend/src/services/utxo.service.ts:413`
**Problème :** `return true` inconditionnel pour `sourceType === 'change'` — n'importe quelle signature était acceptée.
**Correction :** Vérification que `eip712Signature === keccak256(parentTx.proofHash || changeId)` en récupérant la transaction parente.

---

### [H5] CLI `withdraw` online — pas de gestion d'erreur
**Fichier :** `cli/src/commands/wallet.ts:184`
**Problème :** `client.query()` sans try/catch. Un solde insuffisant ou une erreur réseau provoquait une exception non gérée.
**Correction :** Bloc try/catch autour de `client.query()` avec `printError()` et `process.exit(1)`.

---

### [H6] CLI `withdraw` offline — pas de garde contre solde insuffisant
**Fichier :** `cli/src/commands/wallet.ts:156`
**Problème :** Si `--amount > 210`, `210 - amount` était négatif mais la commande continuait silencieusement.
**Correction :** Vérification `amount > 210` avec `printError()` et `process.exit(1)`.

---

### [H7] CLI — commande `ptf wallet utxos` inexistante
**Fichier :** `cli/src/commands/wallet.ts` (nouveau)
**Problème :** Le backend expose `utxos`, `utxoBalance`, `utxoProvenance` mais le CLI n'avait aucune commande pour les afficher.
**Correction :** Ajout de la commande `ptf wallet utxos [--address] [--status] [--chain]` avec affichage formaté et fallback offline.

---

### [H8] CLI `withdraw` hardcode `chain: 'polygon'` en ignorant `walletChain`
**Fichier :** `cli/src/commands/wallet.ts:201`
**Problème :** La chaîne était toujours `'polygon'` même si `userConfig.walletChain` était différent.
**Correction :** `const chain = userConfig.walletChain ?? "polygon"` utilisé dans la mutation.

---

## MEDIUM

### [M1] `CreditEvent.balanceAfter` absent du schéma Prisma
**Fichier :** `backend/prisma/schema.prisma`
**Problème :** `CreditLedgerService.record()` passait `balanceAfter` à Prisma mais le champ n'existait pas — erreur runtime silencieuse.
**Correction :** Ajout de `balanceAfter Float?` sur le modèle `CreditEvent`.

---

### [M2] `unlock()` — pas de vérification que le total déverrouillé couvre le montant
**Fichier :** `backend/src/services/utxo.service.ts:386`
**Problème :** Si les UTXOs locked ne couvraient pas `amount`, `updateMany` s'exécutait sur un ensemble partiel sans erreur.
**Correction :** La boucle s'arrête proprement quand `remaining <= 0`. Si les UTXOs disponibles ne couvrent pas le montant, on déverrouille tout ce qui est disponible (comportement gracieux — le lock est peut-être déjà partiellement libéré).

---

### [M3] Variable morte `sign` dans `reputation-history`
**Fichier :** `cli/src/commands/wallet.ts:459`
**Problème :** `sign` assigné mais jamais utilisé — `void sign` en fin de boucle.
**Correction :** Variable supprimée.

---

### [M4] CLI `withdraw` — référence à `ptf wallet verify-utxo` (commande inexistante)
**Fichier :** `cli/src/commands/wallet.ts:182`
**Problème :** Le message de fin pointait vers une commande inexistante.
**Correction :** Remplacement par `ptf wallet utxos --address <address>`.

---

---

## ROUND 2 — Corrections supplémentaires (agents relancés)

### [R1] `spend()` — deux `Date.now()` distincts → txId non-déterministe sur retry Prisma
**Fichier :** `backend/src/services/utxo.service.ts`
**Correction :** `const spendNow = Date.now()` capturé une seule fois avant `$transaction`, réutilisé pour `txId` et `changeUTXOId`.

---

### [R2] `unlock()` — bloc `if (remaining > 0)` vide, silencieux
**Fichier :** `backend/src/services/utxo.service.ts`
**Correction :** `throw new Error(...)` ajouté comme dans `lock()`.

---

### [R3] `history` CLI — pas de `utxoId` dans CreditEventEntry
**Fichiers :** `backend/src/services/creditLedger.service.ts`, `cli/src/commands/wallet.ts`
**Correction :** `utxoId` ajouté dans l'interface, la requête GraphQL et l'affichage.

---

## ROUND 3 — Audit sécurité EscrowVault + backend

### [S1] CRITICAL — Double-spend intra-call : même utxoId deux fois dans inputs[]
**Fichier :** `contracts/evm/EscrowVault.sol:413`
**Problème :** `spentUTXOs` n'est mis à jour qu'après la boucle de vérification. Soumettre le même utxoId deux fois dans `inputs[]` double `verifiedTotal` sans déclencher le guard.
**Correction :** Boucle de déduplication locale `seenIds[]` ajoutée avant le guard `spentUTXOs`.

---

### [S2] CRITICAL — Signatures UTXO vérifiées sans domain separator (struct hash brut)
**Fichier :** `contracts/evm/EscrowVault.sol:431`
**Problème :** `utxoStructHash.recover(sig)` au lieu de `_hashTypedDataV4(utxoStructHash).recover(sig)` — toute protection cross-chain et cross-contract était absente.
**Correction :** `_hashTypedDataV4(utxoStructHash).recover(inp.ptfSignature)` — EIP-712 complet.

---

### [S3] HIGH — Chain hardcodée `"polygon"` dans la vérification UTXO
**Fichier :** `contracts/evm/EscrowVault.sol:427`
**Problème :** `keccak256(bytes("polygon"))` toujours encodé — les UTXOs d'une chaîne pouvaient être rejoués sur une autre.
**Correction :** `keccak256(bytes(inp.chain))` — utilise le champ `chain` du UTXOInput. Champ `chain` ajouté dans `UTXOInput`.

---

### [S4] HIGH — `mintUTXOReceipt` sans idempotency guard — inflation illimitée
**Fichier :** `contracts/evm/EscrowVault.sol:468`
**Problème :** Un opérateur compromis pouvait minter le même utxoId indefiniment.
**Correction :** `if (spentUTXOs[utxoId]) revert UTXOAlreadySpent(utxoId)` + `spentUTXOs[utxoId] = true` ajoutés.

---

### [S5] MEDIUM — `executePunishment` ajoute des unités PTF à `escrowBalance` (USDC)
**Fichier :** `contracts/evm/EscrowVault.sol:298`
**Problème :** `escrowBalance[projectId] += projectShare` ajoutait des unités PTF à un mapping USDC — USDC fantôme.
**Correction :** La ligne supprimée — les 20% sont mintés en PTF au contrat sans toucher `escrowBalance`.

---

### [S6] HIGH — `lock()` TOCTOU avec `spend()` concurrent
**Fichier :** `backend/src/services/utxo.service.ts:375`
**Problème :** `lock()` lisait les UTXOs hors transaction — `spend()` concurrent pouvait consommer les mêmes UTXOs.
**Correction :** `lock()` entièrement enveloppé dans `this.db.$transaction`.

---

### [S7] HIGH — Domain mismatch : backend `"PTFEscrow"` vs contrat `"PTFEscrowVault"`
**Fichier :** `backend/src/services/utxo.service.ts:461`
**Correction :** Domain aligné sur `"PTFEscrowVault"`.

---

### [S8] MEDIUM — `computeProofHash` hachait les signatures au lieu des utxoIds
**Fichier :** `backend/src/services/utxo.service.ts:162`
**Problème :** La fonction exportée produisait un hash différent de `spend()` et de l'on-chain — audit trail cassé.
**Correction :** `computeProofHash` réécrit pour concaténer les `utxoId` bytes, cohérent avec on-chain et `spend()`.

---

### [S9] HIGH — Change UTXOs avec hash 32 bytes au lieu d'une signature ECDSA 65 bytes (non résolu)
**Fichier :** `backend/src/services/utxo.service.ts:324`
**Statut :** TODO documenté dans le code — nécessite la clé privée opérateur pour signer correctement. À implémenter quand le système de signature PTF est disponible.

---

## ROUND 4 — Corrections des bugs reportés

### [N2-corrigé] Hardcode `'polygon'` dans EscrowVault.sol
**Statut :** Déjà corrigé dans la correction S3 du Round 3.
`keccak256(bytes("polygon"))` remplacé par `keccak256(bytes(inp.chain))` — champ `chain` ajouté dans `UTXOInput`. Non déployé (hors scope v0.1.0), mais le code source est correct.

---

### [N4] CreditTransaction.inputIds/outputIds sans FK
**Fichier :** `backend/prisma/schema.prisma`
**Problème :** `inputIds String[]` et `outputIds String[]` sont des tableaux de strings sans contrainte FK — un `CreditUTXO` supprimé ne déclenche aucune erreur sur la transaction qui le référence.
**Correction :**
- Suppression des champs `inputIds`/`outputIds` de `CreditTransaction`
- Ajout de `createdInTxId String?` sur `CreditUTXO` — FK vers la transaction qui a créé cet UTXO (change outputs)
- Ajout des relations Prisma `spendingTx @relation("inputs")` et `creationTx @relation("outputs")` sur `CreditUTXO`
- `utxo.service.ts` : `createdInTxId: txId` ajouté dans le `create()` du change UTXO ; `inputIds`/`outputIds` retirés du `creditTransaction.create()`
- La traversabilité est désormais garantie par FK : `tx.inputs[]` et `tx.outputs[]` via Prisma inclusions

---

### [N5] Mock UTXO IDs tronqués dans offline mode
**Fichier :** `cli/src/commands/wallet.ts:150-159`
**Problème :** IDs mock `"0xutxo001…"` / `"0xtask001…"` / `"0xchange001…"` — chaînes tronquées avec `…`, pas des hashes hex valides. Toute logique qui vérifie le format 32-bytes (`0x` + 64 hex chars) rejetait ces valeurs.
**Correction :** Remplacement par de vrais hashes 32-bytes en hex complet (`"0xc001a1b2…"`, 66 chars).

---

## NON CORRIGÉS (à traiter séparément)

| # | Sévérité | Raison du report |
|---|----------|-----------------|
| N1 | critical | **Aucun listener on-chain pour les dépôts** — nécessite un worker/webhook + infrastructure (hors scope correction rapide) |
| N3 | medium | **Pas de mécanisme de réconciliation DB/on-chain** — nécessite un worker de réconciliation |
| S9 | high | **Change UTXOs : keccak32 au lieu de signature ECDSA 65-bytes** — nécessite la clé privée opérateur |
