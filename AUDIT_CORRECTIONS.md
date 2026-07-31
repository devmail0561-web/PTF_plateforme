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

## ROUND 5 — Audit CIA (2026-07-31)

### [CIA-C1] CRITIQUE — JWT secret fallback hardcodé supprimé
**Fichier :** `backend/src/services/auth.service.ts:35`
**Problème :** `"ptf-dev-secret"` utilisé si `JWT_SECRET` absent — forgeage de token trivial.
**Correction :** `throw new Error(...)` au démarrage si `JWT_SECRET` n'est pas défini. Pas de fallback.

---

### [CIA-C2] CRITIQUE — Clé privée EVM fallback zéro supprimée (Polygon + Ethereum)
**Fichiers :** `backend/src/bal/adapters/polygon.adapter.ts:9`, `backend/src/bal/adapters/ethereum.adapter.ts:9`
**Problème :** `"0x" + "0".repeat(64)` — adresse publiquement compromise, toutes les tx on-chain signées par une clé connue.
**Correction :** `throw new Error(...)` au démarrage si `SIGNER_PRIVATE_KEY` absent. Pas de fallback.

---

### [CIA-I1] CRITIQUE — submitTask sans vérification d'ownership
**Fichier :** `backend/src/graphql/resolvers/task.resolver.ts:65`
**Problème :** N'importe quel utilisateur authentifié pouvait soumettre la tâche de quelqu'un d'autre.
**Correction :** Même logique de vérification que `cancelTask` — résolution des wallets liés de l'appelant comparée à `task.devAddress`.

---

### [CIA-I3] CRITIQUE — publishProject sans vérification d'ownership
**Fichiers :** `backend/src/graphql/resolvers/project.resolver.ts:73`, `backend/src/services/project.service.ts:189`
**Problème :** N'importe quel utilisateur authentifié pouvait activer le projet d'autrui.
**Correction :** `callerId` passé à `activate()`. Vérification `project.ownerId !== callerId` → erreur 401.

---

### [CIA-D1] CRITIQUE — Pagination ajoutée sur tasks() et projects()
**Fichiers :** `backend/src/services/task.service.ts:165`, `backend/src/services/project.service.ts:87`
**Problème :** `findMany` sans `take` — charge illimitée en mémoire, OOM potentiel.
**Correction :** `take: Math.min(limit ?? 50, 200)` + `skip: offset` dans les deux services. `limit`/`offset` ajoutés à `TaskFilter`, `ProjectFilter`, et aux types GraphQL `TaskFilterInput`/`ProjectFilterInput`.

---

### [CIA-I8] HAUTE — unlock() rendu transactionnel (TOCTOU avec spend())
**Fichier :** `backend/src/services/utxo.service.ts:402`
**Problème :** `findMany` hors transaction — `spend()` concurrent pouvait consommer les UTXOs entre le select et l'update.
**Correction :** `unlock()` entièrement enveloppé dans `this.db.$transaction`, identique à `lock()`.

---

### [CIA-I6] HAUTE — verifyProof multi-chain (chainId dynamique)
**Fichier :** `backend/src/services/utxo.service.ts:461`
**Problème :** `chainId: 137` hardcodé — les UTXOs Ethereum/BSC/Arbitrum rejetés comme invalides.
**Correction :** Map `CHAIN_IDS` interne (polygon=137, ethereum=1, bsc=56, avalanche=43114, arbitrum=42161, base=8453). `chainId` dérivé de `utxo.chain`.

---

### [CIA-I12] HAUTE — Validation amount > 0 dans mint/spend/lock/unlock
**Fichier :** `backend/src/services/utxo.service.ts:177, 250, 374, 402`
**Problème :** Montants négatifs ou zéro créaient des UTXOs invalides.
**Correction :** Guard `if (amount <= 0) throw new Error(...)` en tête de chaque méthode.

---

### [CIA-D6] HAUTE — Pagination ajoutée sur utxos() et utxoProvenance()
**Fichiers :** `backend/src/graphql/resolvers/wallet.resolver.ts:94-125`, `backend/src/graphql/schema.graphql:28-30`
**Problème :** Toute la provenance UTXO chargée sans limite.
**Correction :** `limit` (max 200) et `offset` ajoutés dans le schéma et les resolvers.

---

### [CIA-D3] HAUTE — Ghost users supprimés dans ReportService
**Fichier :** `backend/src/services/report.service.ts:44`
**Problème :** Reporter une adresse inconnue créait un ghost user + WalletLink en DB — vecteur d'inflation illimité sans rate limiting.
**Correction :** `throw PtfError(INVALID_ADDRESS, ...)` si l'adresse n'est pas enregistrée. Aucun ghost créé.

---

### [CIA-C3-C8] HAUTE — Sécurisation CORS et formatError en production
**Fichier :** `backend/src/server.ts`
**Problème :** CORS wildcard `"*"` par défaut ; messages d'erreur internes exposés aux clients.
**Correction :**
- `CORS_ORIGIN` obligatoire en production (`throw` si absent et `NODE_ENV=production`).
- `formatError` : en production, seul le message + le code erreur sont renvoyés (pas de stack trace ni détails internes).
- Introspection GraphQL désactivée en production (`introspection: !isProd`).

---

### [CIA-D8] MOYENNE — Pagination dans checkDeadlineAlerts()
**Fichier :** `backend/src/services/timer.service.ts:61`
**Problème :** `findMany` sans `take` — chargement potentiellement massif toutes les heures.
**Correction :** `take: 500` ajouté.

---

---

## ROUND 6 — Refonte du système d'authentification (2026-07-31)

### Objectif
L'authentification précédente (GitHub OAuth seul) était insuffisante. Le nouveau système exige :
1. Un **compte PTF** identifié par une paire de clés secp256k1 (clé privée locale, clé publique enregistrée sur le serveur)
2. Un **compte GitHub** lié au compte PTF via OAuth
3. Un **wallet blockchain** lié via EIP-712 challenge-response

`claimTask`, `createProject`, `publishProject`, `generateTasks`, `submitTask` exigent les trois.

---

### [AUTH-1] Nouveau modèle `User` — identité par clé secp256k1
**Fichier :** `backend/prisma/schema.prisma`
- `ptfPublicKey String? @unique` — clé publique non-compressée (65 bytes, 0x-prefixée)
- `ptfAddress String? @unique` — adresse Ethereum dérivée : `keccak256(pubkey[1:])[12:]`
- Nouveau modèle `AuthChallenge` — nonce à usage unique lié à un userId (ou null avant création)
- Nouveau modèle `WalletLinkChallenge` — nonce lié à `(userId, chain, address)` pour la liaison wallet
- `Session.userAgent String?` — user-agent pour l'audit trail

---

### [AUTH-2] Login PTF — challenge-response (2 étapes)
**Fichier :** `backend/src/services/auth.service.ts`

**Étape 1 — `requestChallenge(ptfPublicKey)`**
- Valide que `ptfPublicKey` est un point secp256k1 valide (65 bytes, 0x-préfixé)
- Dérive `ptfAddress = keccak256(pubkey[1:])[12:]`
- Génère `nonce = keccak256(pubkey || timestamp_ms)` — unique par requête
- Persiste dans `AuthChallenge` avec TTL 5 minutes
- Retourne `{ challengeId, nonce }` au client

**Étape 2 — `loginWithPtfKey(ptfPublicKey, challengeId, signature)`**
- Vérifie que le challenge est valide, non utilisé, non expiré
- Vérifie `ethers.verifyMessage(nonce_bytes, signature) === ptfAddress`
- Marque le nonce `used = true` (prévient le replay)
- `upsert` sur `ptfAddress` : création du compte (register) ou authentification (login)
- Émet un JWT avec `{ userId, ptfAddress, githubLinked, walletLinked }`
- Rotation de session à chaque login

---

### [AUTH-3] Liaison GitHub — `linkGithub(userId, code)` (post-login)
**Fichier :** `backend/src/services/auth.service.ts`

- Échange le code OAuth GitHub avec timeout 10s (corrige D4 — appels externes sans timeout)
- Vérifie que le compte GitHub n'est pas déjà lié à un autre compte PTF (`GITHUB_ALREADY_LINKED`)
- Met à jour `User.githubId` et `User.githubHandle`
- Invalide les sessions précédentes et émet un nouveau JWT avec `githubLinked: true`

---

### [AUTH-4] Liaison Wallet — challenge-response EIP-712 (corrige CIA-I4/I5)
**Fichier :** `backend/src/services/auth.service.ts`

**Étape 1 — `requestWalletChallenge(userId, chain, address)`**
- Génère `nonce = keccak256(userId || chain || address || timestamp_ms)`
- Persiste dans `WalletLinkChallenge` avec TTL 5 minutes et binding `(userId, chain, address)`

**Étape 2 — `confirmLinkWallet(userId, challengeId, signature)`**
- Vérifie la validité + l'appartenance du challenge à `userId`
- Récupère le signer via `adapter.verifyEIP712Signature(domain, types, { nonce, userId }, sig)`
- Le domaine EIP-712 inclut `salt = keccak256(chain)` pour isolation cross-chain
- Compare `recovered === challenge.address` — propriété cryptographique réelle
- Persiste le `WalletLink`, invalide les sessions, émet un JWT avec `walletLinked: true`

**Correction des bugs CIA-I4/I5 :**
- Avant : nonce généré côté serveur *pendant* la vérification (donc inconnu du client) → vérification toujours fausse
- Avant : `signedNonce` utilisé comme message ET comme signature simultanément → aucune preuve d'ownership
- Après : nonce pré-émis stocké en DB, client signe le nonce reçu, serveur vérifie avec le nonce stocké

---

### [AUTH-5] Guard `assertFullyLinked` — exigé par les actions critiques
**Fichier :** `backend/src/graphql/context.ts`

```typescript
assertFullyLinked(ctx.user) // throws WALLET_NOT_LINKED ou GITHUB_NOT_LINKED si incomplet
```

Appliqué sur :
- `claimTask` — réclamer une tâche
- `submitTask` — soumettre un travail
- `generateTasks` — générer des tâches pour un projet
- `createProject` — créer un projet
- `publishProject` — publier un projet

Non appliqué (login seul suffit) :
- `cancelTask` — annulation d'urgence
- `withdrawCredits` — retrait de fonds
- `reportUser` — signalement

---

### [AUTH-6] Nouveaux codes d'erreur
**Fichier :** `backend/src/types/errors.ts`

| Code | Description |
|------|-------------|
| `INVALID_PTF_KEY` | Clé publique secp256k1 invalide |
| `GITHUB_ALREADY_LINKED` | GitHub déjà lié à un autre compte PTF |
| `GITHUB_NOT_LINKED` | GitHub requis mais non lié |
| `WALLET_NOT_LINKED` | Wallet requis mais non lié |
| `ACCOUNT_NOT_FULLY_LINKED` | Compte incomplet (générique) |

---

### [AUTH-7] Nouvelles mutations GraphQL
**Fichier :** `backend/src/graphql/schema.graphql`

```graphql
# Login PTF keypair
requestPtfChallenge(ptfPublicKey: String!): PtfChallenge!
loginWithPtfKey(ptfPublicKey: String!, challengeId: ID!, signature: String!): AuthResult!

# GitHub linking
linkGithub(code: String!): AuthResult!

# Wallet linking
requestWalletChallenge(chain: String!, address: String!): WalletChallenge!
confirmLinkWallet(challengeId: ID!, signature: String!): WalletLinkResult!
```

`loginWithGithub` et `linkWallet` (ancien flow) sont supprimés.

---

### [AUTH-8] UserProfile enrichi
**Fichier :** `backend/src/graphql/schema.graphql`

```graphql
type UserProfile {
  id:           ID!
  ptfAddress:   String    # clé d'identité PTF
  githubHandle: String
  githubLinked: Boolean!  # indique si GitHub est lié
  walletLinked: Boolean!  # indique si au moins un wallet est lié
  wallets:      [WalletLink!]!
}
```

Le client peut savoir immédiatement quelle étape de liaison est manquante.

---

### Flux complet d'onboarding

```
1. Client génère paire de clés secp256k1 (local, jamais transmise au serveur)
2. requestPtfChallenge(pubKey)  → { challengeId, nonce }
3. client.sign(nonce)           → signature
4. loginWithPtfKey(pubKey, challengeId, sig) → JWT (githubLinked=false, walletLinked=false)

5. Redirect GitHub OAuth  → code
6. linkGithub(code)       → JWT (githubLinked=true, walletLinked=false)

7. requestWalletChallenge(chain, address) → { challengeId, nonce }
8. wallet.signTypedData(nonce, userId)    → sig
9. confirmLinkWallet(challengeId, sig)   → JWT (githubLinked=true, walletLinked=true)

10. claimTask / createProject débloqués ✓
```

---

## ROUND 7 — UX Auth : password + gestion des appareils (2026-07-31)

### Problème
Le système précédent forçait l'utilisateur à gérer sa clé privée manuellement à chaque connexion — pas pratique et propice aux erreurs.

### Nouveau modèle

**Inscription :**
1. L'utilisateur choisit un email + mot de passe (≥12 chars)
2. Le serveur génère la paire de clés secp256k1 → dérive `ptfAddress`
3. La clé privée est chiffrée avec le mot de passe de l'utilisateur : `AES-256-GCM(privKey, PBKDF2(password, salt, 100000, 32, sha256))`
4. Le serveur stocke uniquement la clé chiffrée (`encryptedKey`) — jamais la clé en clair
5. `encryptedKey` est renvoyé **une fois** au client → stocké localement sur l'appareil

**Connexion :**
1. Email + mot de passe → vérification scrypt en temps constant (anti-timing attack)
2. JWT émis avec `{ userId, ptfAddress, githubLinked, walletLinked, deviceId }`
3. `encryptedKey` retourné → le client le déchiffre localement avec le mot de passe pour récupérer la clé privée en mémoire

**Nouvel appareil :**
- Chaque `login()` crée une `DeviceSession` distincte avec un nom d'appareil
- Le client stocke `encryptedKey` localement ; il n'a pas besoin de se souvenir de la clé privée

---

### [AUTH-DEV-1] Nouveau modèle `DeviceSession`
**Fichier :** `backend/prisma/schema.prisma`

Remplace `Session`. Champs :
- `id` — pré-généré (hash déterministe), embarqué dans le JWT comme `deviceId`
- `deviceName` — label lisible (`"Chrome on Ubuntu"`, `"PTF CLI"`)
- `userAgent` — user-agent HTTP
- `lastSeenAt` — mis à jour silencieusement à chaque requête authentifiée
- `expiresAt` — 30 jours (vs 7 jours précédemment)

---

### [AUTH-DEV-2] Chiffrement de la clé privée
**Fichier :** `backend/src/services/auth.service.ts`

```
encryptPrivateKey(privKeyHex, password):
  keySalt = randomBytes(32)
  iv      = randomBytes(12)
  aesKey  = PBKDF2(password, keySalt, 100_000, 32, sha256)
  cipher  = AES-256-GCM(aesKey, iv)
  → "v1:<keySalt_hex>:<iv_hex>:<ciphertext_hex>:<authTag_hex>"
```

Le serveur stocke `encryptedKey` dans `User.encryptedKey`. La clé privée en clair n'est jamais persistée.

---

### [AUTH-DEV-3] Hachage du mot de passe
**Fichier :** `backend/src/services/auth.service.ts`

`scrypt(password, salt_16b, 64, { N:32768, r:8, p:1 })` — format `"<salt_hex>:<hash_hex>"`.

`verifyPassword()` utilise `timingSafeEqual` pour éviter les attaques par timing.

Le chemin "utilisateur inconnu" exécute quand même `verifyPassword()` sur un hash factice pour éviter la fuite par timing sur l'existence du compte.

---

### [AUTH-DEV-4] Gestion des appareils
**Fichier :** `backend/src/services/auth.service.ts`

| Méthode | Description |
|---------|-------------|
| `listDevices(userId, currentDeviceId)` | Liste toutes les sessions actives non expirées, marque `isCurrent` |
| `revokeDevice(userId, deviceId)` | Supprime une session — vérifie que `session.userId === userId` |
| `revokeAllOtherDevices(userId, currentDeviceId)` | Déconnecte tous les autres appareils en une requête |
| `banUser()` | Supprime **toutes** les sessions immédiatement en plus de bannir |

---

### [AUTH-DEV-5] Nouvelles mutations GraphQL
**Fichier :** `backend/src/graphql/schema.graphql`

```graphql
register(input: RegisterInput!): AuthResult!         # email + password + deviceName
login(input: LoginInput!):    AuthResult!             # email + password + deviceName
revokeDevice(deviceId: ID!):         Boolean!
revokeAllOtherDevices:               Boolean!

# Query
myDevices: [DeviceSession!]!
```

`AuthResult` inclut maintenant `encryptedKey` (retourné sur register et login).

---

### [AUTH-DEV-6] `deviceId` dans le JWT et le contexte GraphQL
**Fichiers :** `backend/src/graphql/context.ts`, `backend/src/server.ts`

`JwtPayload` inclut `deviceId`. Le contexte GraphQL expose `token` en clair pour que `verifyJwt()` puisse toucher `lastSeenAt` sans requête supplémentaire à l'identifiant.

---

## ROUND 8 — Vérification email pour les nouveaux appareils (2026-07-31)

### Problème
Un attaquant ayant volé le mot de passe pouvait se connecter depuis n'importe quel appareil sans alerte.

### Solution : OTP email sur nouvel appareil + device token persistant

**Flux connexion — appareil inconnu :**
```
login(email, password, deviceName)
  → credentials OK, device inconnu
  → génère OTP 6 chiffres (crypto.randomBytes)
  → stocke PendingDeviceSession { otpHash = scrypt(otp), expiresAt = +10min }
  → envoie email OTP via SMTP
  → retourne { pendingSessionId, requiresVerification: true }

verifyNewDevice(pendingSessionId, otp)
  → vérifie scrypt(otp) === otpHash
  → crée TrustedDevice { deviceToken = randomBytes(32), expiresAt = +1an }
  → crée DeviceSession (30 jours)
  → retourne { token, encryptedKey, user, deviceToken }
```

**Flux connexion — appareil connu :**
```
login(email, password, deviceName, deviceToken)
  → credentials OK
  → TrustedDevice trouvé et non expiré → skip OTP
  → renouvelle TrustedDevice.expiresAt (+1an)
  → crée DeviceSession
  → retourne { token, encryptedKey, user } immédiatement
```

---

### [AUTH-OTP-1] Nouveaux modèles Prisma
**Fichier :** `backend/prisma/schema.prisma`

| Modèle | Rôle |
|--------|------|
| `TrustedDevice` | Appareil vérifié par OTP. Stocke `deviceToken` (32 bytes hex). Expire en 1 an. Renouvelé à chaque connexion. |
| `PendingDeviceSession` | Session en attente de vérification. Stocke `otpHash` (scrypt). Expire en 10 min. `used` consommé après vérification. |

---

### [AUTH-OTP-2] `EmailService`
**Fichier :** `backend/src/services/email.service.ts`

Utilise **nodemailer** (SMTP configuré via `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`).
En dev, si les variables sont absentes, tente le port 1025 (mailhog/mailpit).

Email envoyé **fire-and-forget** (`catch` silencieux) — une erreur SMTP ne bloque pas le retour de `login()`.

---

### [AUTH-OTP-3] OTP sécurisé
- Généré via `crypto.randomBytes(3)` → 24 bits → modulo 1 000 000 → 6 chiffres
- Hashé avec `scrypt` (mêmes paramètres que les mots de passe) — jamais stocké en clair
- Comparé via `timingSafeEqual` (même fonction `verifyPassword`)
- TTL 10 minutes, `used = true` après première vérification (anti-replay)

---

### [AUTH-OTP-4] `deviceToken` côté client
- Chaîne hex 32 bytes — opaque, aucune information encodée
- Retourné **uniquement** par `verifyNewDevice()` dans `AuthResult.deviceToken`
- Le client le stocke en localStorage / keychain
- Passé via `LoginInput.deviceToken` lors des connexions suivantes
- Si le token est expiré ou révoqué côté serveur, le flux OTP est redemandé automatiquement

---

### Variables d'environnement requises
```
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=noreply@ptf.dev
SMTP_PASS=<secret>
SMTP_FROM=PTF <noreply@ptf.dev>
```

---

## ROUND 9 — Réputation réservée aux projets open-source (2026-07-31)

### Règle
Les points de réputation ne sont accordés que si le projet est **public sur GitHub** et possède une **licence OSI-approuvée**. La vérification est faite via l'API GitHub à la création ET à la publication du projet.

---

### [REP-1] Nouveaux champs sur `Project`
**Fichier :** `backend/prisma/schema.prisma`

| Champ | Type | Description |
|-------|------|-------------|
| `isOpenSource` | `Boolean @default(false)` | `true` uniquement après vérification GitHub réussie |
| `license` | `String?` | Identifiant SPDX, ex. `"MIT"`, `"GPL-3.0"` |
| `licenseVerifiedAt` | `DateTime?` | Horodatage de la dernière vérification réussie |

---

### [REP-2] `GithubService`
**Fichier :** `backend/src/services/github.service.ts` (nouveau)

`verifyOpenSourceRepo(repoUrl)` :
1. Parse l'URL — accepte `https://github.com/owner/repo`, `github.com/owner/repo`, `owner/repo`
2. Appelle `GET /repos/{owner}/{repo}` (API GitHub v2022-11-28)
3. Vérifie `private === false` → sinon `REPO_NOT_PUBLIC`
4. Vérifie `license.spdx_id !== null && !== "NOASSERTION"` → sinon `REPO_NO_LICENSE`
5. Vérifie `spdxId ∈ OSI_LICENSES` (set de ~30 licences OSI courantes) → sinon `REPO_LICENSE_NOT_OSI`
6. Retourne `{ isPublic, spdxId, isOsiApproved, name, url }`

Timeout 10 secondes. Gère 404 (`REPO_NOT_FOUND`), 403/429 (`GITHUB_RATE_LIMITED`).
Configurer `GITHUB_TOKEN` pour passer de 60 à 5000 requêtes/heure.

---

### [REP-3] Vérification à la création et à la publication
**Fichier :** `backend/src/services/project.service.ts`

- `create()` : si `repoType === "github"` et `repoUrl` fourni → appel `githubService.verifyOpenSourceRepo()`. Stocke `isOpenSource`, `license`, `licenseVerifiedAt`.
- `activate()` : re-vérifie systématiquement avant publication (le propriétaire peut avoir ajouté une licence entre la création et la publication, ou au contraire l'avoir supprimée).

Les projets `self-hosted` ou `ptf-temp` restent `isOpenSource: false` (pas de vérification possible).

---

### [REP-4] `reputationPoints = 0` pour les projets fermés
**Fichier :** `backend/src/services/task.service.ts:122`

```typescript
const reputationPoints = project?.isOpenSource
  ? reputationService.calculatePoints(scoring, durationDays)
  : 0;
```

Les tâches créées sur un projet non open-source ont `reputationPoints = 0` en DB. `applyDelta()` avec delta=0 est sans effet.

Les **punitions de réputation** (malicious_code, lateDelivery, etc.) s'appliquent à **tous les projets** — elles ne sont pas conditionnées par `isOpenSource`.

---

### [REP-5] Query GraphQL publique `verifyRepoLicense`
**Fichier :** `backend/src/graphql/schema.graphql`, `backend/src/graphql/resolvers/project.resolver.ts`

```graphql
query {
  verifyRepoLicense(repoUrl: "https://github.com/owner/repo") {
    isPublic
    spdxId        # "MIT"
    isOsiApproved # true
    name          # "MIT License"
    url
  }
}
```

Permet au client de vérifier une URL avant de créer un projet.

---

### Licences OSI reconnues (liste complète dans `github.service.ts`)
MIT, Apache-2.0, GPL-2.0/3.0, LGPL-2.0/2.1/3.0, AGPL-3.0, MPL-2.0, CDDL-1.0, EPL-1.0/2.0, EUPL-1.1/1.2, BSD-2/3/4-Clause, ISC, Artistic-2.0, CPAL-1.0, OSL-3.0, AFL-3.0, CC0-1.0, Unlicense.

---

## ROUND 10 — Catalogue de licences + création automatique de LICENSE.md (2026-07-31)

### Objectif
Ne jamais bloquer la création d'un projet pour une licence manquante. À la place : indiquer quoi faire et permettre la création automatique via l'API GitHub.

---

### [LIC-1] `licenses.ts` — catalogue complet (50+ licences)
**Fichier :** `backend/src/services/licenses.ts`

Quatre catégories :

| Catégorie | `reputationEligible` | Exemples |
|-----------|---------------------|---------|
| `osi` | ✓ | MIT, Apache-2.0, GPL-3.0, AGPL-3.0, MPL-2.0, BSD-*, ISC, EPL-2.0, EUPL-1.2, CC0-1.0, Unlicense… |
| `free` | ✓ | WTFPL, CC-BY-4.0, CC-BY-SA-4.0, MS-PL, MS-RL, FTL… |
| `source` | ✗ | BUSL-1.1, SSPL-1.0, Elastic-2.0, PolyForm-NC, FSL-1.1… |
| `proprietary` | ✗ | LicenseRef-Proprietary, LicenseRef-AllRightsReserved, LicenseRef-Commercial |

Chaque entrée : `spdxId`, `name`, `category`, `isOsi`, `isFsf`, `gplCompatible`, `reputationEligible`, `description`, `url`, `githubKey` (clé API GitHub ou `null`).

Exports utilitaires : `getLicense(spdxId)`, `isReputationEligible(spdxId)`, `ELIGIBLE_SPDX_IDS`, `GITHUB_CREATABLE_LICENSES`, `getFallbackLicenseText(spdxId, year, author)`.

---

### [LIC-2] `checkRepoLicense()` non-bloquant
**Fichier :** `backend/src/services/github.service.ts`

Remplace l'ancienne `verifyOpenSourceRepo()` pour la création de projet. Retourne toujours un résultat (jamais de throw) :

```typescript
{
  passes:      boolean,     // true → réputation éligible
  reason:      string|null, // explication si passes=false
  instruction: string|null  // marche à suivre pour corriger
}
```

`verifyOpenSourceRepo()` (utilisée à `activate()`) continue de thrower sur échec.

---

### [LIC-3] `createLicenseFile()` — création automatique via GitHub API
**Fichier :** `backend/src/services/github.service.ts`

1. Récupère le template via `GET /licenses/{githubKey}` si disponible
2. Substitue `[year]` et `[fullname]` dans le template
3. Pour les licences sans clé GitHub (`githubKey: null`) : génère un texte minimal via `getFallbackLicenseText()`
4. Crée ou met à jour `LICENSE.md` via `PUT /repos/{owner}/{repo}/contents/LICENSE.md`
5. Re-vérifie immédiatement via `checkRepoLicense()` et met à jour `Project.isOpenSource`

Nécessite le token GitHub OAuth de l'utilisateur (scope `repo` write).

---

### [LIC-4] `createProject()` non-bloquant
**Fichier :** `backend/src/services/project.service.ts`

Le projet est **toujours créé**, même sans licence. Retourne maintenant `CreateProjectResult` :

| `licenseStatus` | Signification |
|-----------------|--------------|
| `"ok"` | Licence détectée et éligible → `isOpenSource: true` |
| `"missing"` | Pas de fichier LICENSE → `isOpenSource: false` + `licenseInstruction` |
| `"ineligible"` | Licence non éligible (source/proprietary) → `isOpenSource: false` + `licenseInstruction` |
| `"not_github"` | Repo non-GitHub → `isOpenSource: false`, pas d'instruction |

`licenseInstruction` contient le texte exact à afficher à l'utilisateur (comment ajouter une licence ou utiliser `createProjectLicense`).

---

### [LIC-5] Nouvelles mutations et queries GraphQL

```graphql
# Créer LICENSE.md automatiquement dans le dépôt GitHub
createProjectLicense(projectId: ID!, spdxId: String!, authorName: String!, userToken: String!): ProjectLicenseResult!

# Lister toutes les licences (filtre par catégorie optionnel)
getLicenses(category: String): [LicenseCatalogEntry!]!

# Vérifier une URL de dépôt (non-bloquant, retourne instruction)
verifyRepoLicense(repoUrl: String!): RepoLicenseInfo!
```

`createProject` retourne `CreateProjectResult` (inclut `licenseStatus` et `licenseInstruction`).

---

### Flux typique côté client

```
1. createProject(input) → { licenseStatus: "missing", licenseInstruction: "..." }
2. Client affiche : "Aucune licence trouvée. Choisissez une licence :"
3. getLicenses(category: "osi") → liste des licences disponibles
4. Utilisateur choisit "MIT"
5. createProjectLicense(projectId, "MIT", "Jean Dupont", githubToken)
   → LICENSE.md créé, Project.isOpenSource mis à jour
6. publishProject(projectId) → vérifie et publie
```

---

## ROUND 11 — Corrections des findings ouverts (2026-07-31)

### [S9-corrigé] Change UTXOs : signature EIP-712 ECDSA avec clé opérateur
**Fichier :** `backend/src/services/utxo.service.ts`
**Correction :** Fonction `signChangeUTXO()` ajoutée. En production (`NODE_ENV=production`), `PTF_OPERATOR_PRIVATE_KEY` est obligatoire — throw si absent. La fonction construit le digest EIP-712 complet (`\x19\x01 || domainSeparator || structHash`) et signe avec `ethers.Wallet(privKey).signMessage(digest)`. En dev/test, fallback keccak non on-chain pour ne pas bloquer les tests.

---

### [CIA-C4-corrigé] Signatures EIP-712 retirées du schéma GraphQL public
**Fichier :** `backend/src/graphql/schema.graphql`, `backend/src/graphql/resolvers/wallet.resolver.ts`
**Correction :** `eip712Signature` supprimé du type `CreditUTXO` GraphQL. Les resolvers `utxos`, `utxoProvenance` et `withdrawCredits` strippent ce champ avant de retourner les données au client. Les signatures ne sont accessibles qu'en interne (services backend).

---

### [CIA-C6-corrigé] OAuth GitHub CSRF : paramètre `state` ajouté
**Fichiers :** `backend/src/graphql/schema.graphql`, `backend/src/services/auth.service.ts`, `backend/src/graphql/resolvers/wallet.resolver.ts`
**Correction :**
- Nouvelle mutation `requestGithubOAuthState()` → génère un nonce keccak256 TTL 10 min, stocké dans `AuthChallenge`.
- `linkGithub(code, state)` — vérifie que `state` existe en DB, appartient au bon userId, n'est pas expiré ou déjà utilisé. Marque `used = true` après vérification. Un state manquant ou invalide retourne une erreur 401.

---

### [CIA-D2-corrigé] Rate limiting ajouté
**Fichier :** `backend/src/server.ts`
**Correction :** `express-rate-limit` installé et configuré sur deux niveaux :
- Global : 300 req / 15 min sur tous les endpoints.
- Auth : 20 req / 15 min sur les mutations sensibles (`register`, `login`, `verifyNewDevice`, `linkGithub`, `requestGithubOAuthState`, `requestWalletChallenge`, `confirmLinkWallet`) — détectées par regex sur le body de la requête GraphQL.

---

### [CIA-D5-corrigé] Profondeur maximale de requête GraphQL limitée
**Fichier :** `backend/src/server.ts`
**Correction :** Validation rule `depthLimitRule` ajoutée dans `ApolloServer({ validationRules })`. Toute requête avec une profondeur > 6 est rejetée avec une erreur claire. Implémentation inline sans dépendance externe (`graphql-depth-limit` non maintenu pour Apollo 4).

---

### [CIA-I7-corrigé] Redlock fallback no-op supprimé
**Fichier :** `backend/src/services/task.service.ts`
**Correction :** Le `catch` qui substituait un objet no-op est remplacé par un `throw new Error(...)`. Si Redlock ne peut pas s'initialiser, le serveur refuse de démarrer plutôt que de laisser `task.claim()` sans protection contre la contention.

---

### [N1-corrigé] Worker on-chain pour les dépôts
**Fichier :** `backend/src/workers/deposit.worker.ts` (nouveau), `backend/src/server.ts`
**Correction :**
- `DepositWorker` : souscrit aux événements `CreditClaimed` et `UTXOSpent` de `EscrowVault` via WebSocket (`ethers.WebSocketProvider`).
- `CreditClaimed` → `UTXOService.mint()` avec idempotency guard (skip si UTXO déjà en DB).
- `UTXOSpent` → réconciliation DB (marque le UTXO `spent` si l'on-chain a précédé le DB — couvre partiellement N3).
- `maybeStartDepositWorker(prisma)` : démarre le worker si `RPC_WS_URL` et `ESCROW_VAULT_ADDRESS` sont définis, sinon warning et skip gracieux.
- Intégré dans `server.ts` au démarrage et à l'arrêt gracieux.

**Variables d'environnement requises :**
```
RPC_WS_URL=wss://polygon-mainnet.infura.io/ws/v3/<key>
ESCROW_VAULT_ADDRESS=0x...
PTF_OPERATOR_ADDRESS=0x...     # adresse de l'opérateur PTF (pour logs)
PTF_OPERATOR_PRIVATE_KEY=0x... # clé privée pour signer les change UTXOs (S9)
```

---

## NON CORRIGÉS (à traiter séparément)

| # | Sévérité | Raison du report |
|---|----------|-----------------|
| N3 | medium | **Pas de job de réconciliation périodique DB/on-chain** — le worker N1 gère le cas `UTXOSpent` en temps réel mais ne fait pas de scan rétroactif des événements manqués après un crash prolongé. Nécessite un job qui relit les blocs depuis le dernier checkpoint. |
| CIA-I9 | haute | **DB commit avant confirmation on-chain** — nécessite un worker de réconciliation (lié à N3) |
