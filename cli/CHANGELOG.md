# Changelog — @ptf/cli

## [0.1.1] — 2026-08-03

### Fixed

- **GraphQL : schema mismatch — toutes les requêtes renvoyaient du mock**
  - **Bug :** 100% des commandes réseau retombaient en données simulées sans avertissement.
  - **Cause :** Les noms de champs dans les queries CLI ne correspondaient pas au schema backend : `reward { amount token }` (inexistant) au lieu de `rewardAmount`/`rewardToken` plats, `projectId` au lieu de `id`, `architecture`/`planAction` au lieu de `architectureMd`/`planActionMd`, `user { ptfAddress }` absent de `AuthResult`, `$skills: [String]` au lieu de `[String!]`, `walletStatus` sans le paramètre obligatoire `chain`.
  - **Fix :** Adapters `mapTask()` (RawTask → PtfTask) et `mapWalletStatus()` (flags plats → `verification {}`). Toutes les queries réécrites avec les noms exacts du schema.

- **REPL : erreurs techniques affichées en clair**
  - **Bug :** Les messages d'erreur GraphQL bruts (`Cannot query field "X" on type "Y"`) s'affichaient directement dans le terminal.
  - **Fix :** Tous les appels réseau en lecture enveloppés dans `try/catch` silencieux → fallback offline + bannière. Mutations (`auth`, `task cancel`, `wallet restore`) : messages métier lisibles en français.

- **REPL : `--help` crash sur commandes-groupe (`wallet --help`)**
  - **Bug :** `wallet --help`, `tasks --help` etc. faisaient crasher le process entier avec une stacktrace Node.js complète (`CommanderError: (outputHelp)` non catchée).
  - **Cause :** `progHelp.parseAsync(argv)` sans `await` créait une rejection non-gérée qui tuait le process.
  - **Fix :** `await progHelp.parseAsync(argv)` dans le bloc catch `commander.helpDisplayed`.

- **REPL : `--help` sur commandes feuilles n'affichait rien**
  - **Bug :** `generate --help`, `wallet create --help` etc. ne produisaient aucune sortie dans le REPL.
  - **Cause :** Le programme REPL est construit avec `writeOut: () => {}` (sortie silenciée). Le help était "affiché" mais avalé.
  - **Fix :** Reconstruction d'un second programme non-silencié (`buildProgram(false)`) utilisé uniquement pour les demandes de help.

- **`requireAuth` / `requireProjectConfig` : message affiché en double**
  - **Bug :** Ces fonctions faisaient `console.error(msg)` puis `throw new Error(msg)`. Le REPL catchait le throw et affichait le message une deuxième fois.
  - **Fix :** Retiré le `console.error()` — seul le throw subsiste, intercepté proprement par le REPL.

- **`wallet history` / `wallet utxos` / `wallet rep-history` : erreur brute affichée**
  - **Bug :** Ces queries (`creditHistory`, `utxos`, `reputationHistory`) n'existent pas encore dans le schema backend → erreur GraphQL affichée brute.
  - **Fix :** Enveloppées dans `try/catch` → fallback offline avec bannière discrète.

- **Prompt qui dérive pendant la saisie**
  - **Bug :** Le prompt `ptf ›` se décalait vers la droite à chaque touche tapée.
  - **Cause :** Les codes ANSI chalk dans la chaîne `prompt` de readline faussent le calcul de position du curseur.
  - **Fix :** Prompt en texte brut : `"ptf ❯ "`.

- **Ctrl+L ne fonctionnait pas**
  - **Fix :** `process.stdin.on("keypress", ...)` intercepte `key.ctrl && key.name === "l"` → `\x1b[2J\x1b[H`.

### Changed

- Logo ASCII : design unique fixe centré dans le terminal (remplace les 5 logos × 8 couleurs aléatoires)
- Bannière offline simplifiée : une seule ligne discrète au lieu du bloc encadré

## [0.1.0] — 2026-08-02

### Fixed

- **REPL : stdin capturé par le readline pendant les prompts interactifs**
  - **Bug :** Quand une commande utilisait `inquirer.prompt()` (ex: `wallet create`, `auth login`), le readline du REPL restait actif et interceptait la saisie utilisateur. Le mot de passe tapé était traité comme une commande → "Commande inconnue : bonjour1234" affiché en clair dans le terminal.
  - **Cause :** Deux consommateurs readline concurrents sur `process.stdin` — celui du REPL et celui d'inquirer.
  - **Fix v1 (insuffisant) :** `rl.pause()` / `rl.resume()` — ne libère pas stdin car le readline garde ses listeners `data` actifs.
  - **Fix v2 (définitif) :** Détruire le readline (`iface.close()`) avant d'exécuter la commande, puis le recréer après. Inquirer obtient stdin exclusivement. Toutes les commandes interactives (wallet, auth, init, commit, tasks, submit, scaffold, report, generate) sont protégées.

- **REPL : quitte le process après toute commande interactive**
  - **Bug :** Après `wallet create`, le REPL retombait sur le terminal au lieu de réafficher le prompt. La commande "Wallet configuré" s'affichait puis le process mourait.
  - **Cause :** Le handler `close` du readline appelait `process.exit(0)` inconditionnellement. Quand on fermait le readline pour libérer stdin (close temporaire), le handler tuait le process.
  - **Fix :** Flag `exiting` — `process.exit(0)` uniquement quand l'utilisateur tape `exit`/`quit`. Le close temporaire (avant une commande) ne déclenche plus rien.

- **Auth login : adresse en double préfixe `0x0x...`**
  - **Bug :** `ptf auth login` détectait le wallet mais affichait `0x0x5a1473...` et échouait avec "Aucun keystore trouvé pour 0x0x...".
  - **Cause :** `listLocalWallets()` ajoutait systématiquement `"0x"` au nom de fichier, mais `createWallet()` stocke le fichier avec le préfixe `0x` déjà inclus (`0x5a14...json`).
  - **Fix :** Vérifier si le nom de fichier commence déjà par `0x` avant d'ajouter le préfixe.

- **Commandes qui tuent le REPL au lieu de rendre la main**
  - **Bug :** Les commandes Commander appelaient `process.exit()` sur erreur, terminant tout le processus au lieu de revenir au prompt.
  - **Fix :** `exitOverride()` sur toutes les commandes en mode REPL + catch des codes Commander pour afficher des hints concis.
  - **Commit :** `0a1aa4b`

### Added

- **`wallet delete`** — supprimer un wallet PTF local (sélecteur si multi-wallet, confirmation obligatoire, avertissement irréversible). Si le wallet actif est supprimé, bascule automatiquement sur le suivant.
- Shell REPL interactif avec logos ASCII aléatoires (5 designs × 8 couleurs)
- Mode one-shot conservé pour scripts/pipelines (`ptf tasks list --available`)
