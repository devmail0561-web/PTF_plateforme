# Contracts — Setup

## Prérequis

```bash
# Foundry (compiler + test runner Solidity)
curl -L https://foundry.paradigm.xyz | bash
foundryup

# Vérifier
forge --version
```

## Installer les dépendances

```bash
cd contracts/evm

# OpenZeppelin Contracts v5
forge install OpenZeppelin/openzeppelin-contracts --no-commit

# Forge std (déjà inclus avec Foundry)
forge install foundry-rs/forge-std --no-commit
```

## Compiler

```bash
forge build
```

## Tests

```bash
# Tous les tests
forge test -vvv

# Tests avec fuzzing intensif (CI)
forge test --fuzz-runs 10000

# Tests invariants uniquement
forge test --match-contract Invariant -vvv

# Couverture
forge coverage --report lcov
```

## Déploiement (testnet Polygon Amoy)

```bash
cp .env.example .env
# Remplir .env avec vos valeurs

source .env
forge script scripts/Deploy.s.sol \
  --rpc-url $POLYGON_AMOY_RPC \
  --broadcast \
  --verify \
  -vvvv
```
