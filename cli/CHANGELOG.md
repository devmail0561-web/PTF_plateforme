# Changelog — @ptf/cli

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

- Shell REPL interactif avec logos ASCII aléatoires (5 designs × 8 couleurs)
- Mode one-shot conservé pour scripts/pipelines (`ptf tasks list --available`)
