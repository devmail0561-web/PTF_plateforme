# Changelog — @ptf/cli

## [0.1.0] — 2026-08-02

### Fixed

- **REPL : stdin capturé par le readline pendant les prompts interactifs**
  - **Bug :** Quand une commande utilisait `inquirer.prompt()` (ex: `wallet create`, `auth login`), le readline du REPL restait actif et interceptait la saisie utilisateur. Le mot de passe tapé était traité comme une commande → "Commande inconnue : bonjour1234" affiché en clair dans le terminal.
  - **Cause :** Deux consommateurs readline concurrents sur `process.stdin` — celui du REPL et celui d'inquirer.
  - **Fix v1 (insuffisant) :** `rl.pause()` / `rl.resume()` — ne libère pas stdin car le readline garde ses listeners `data` actifs.
  - **Fix v2 (définitif) :** Détruire le readline (`iface.close()`) avant d'exécuter la commande, puis le recréer après. Inquirer obtient stdin exclusivement. Toutes les commandes interactives (wallet, auth, init, commit, tasks, submit, scaffold, report, generate) sont protégées.

- **Commandes qui tuent le REPL au lieu de rendre la main**
  - **Bug :** Les commandes Commander appelaient `process.exit()` sur erreur, terminant tout le processus au lieu de revenir au prompt.
  - **Fix :** `exitOverride()` sur toutes les commandes en mode REPL + catch des codes Commander pour afficher des hints concis.
  - **Commit :** `0a1aa4b`

### Added

- Shell REPL interactif avec logos ASCII aléatoires (5 designs × 8 couleurs)
- Mode one-shot conservé pour scripts/pipelines (`ptf tasks list --available`)
