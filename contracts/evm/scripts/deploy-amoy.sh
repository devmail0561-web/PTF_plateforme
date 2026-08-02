#!/usr/bin/env bash
# PTF — Déploiement automatisé sur Polygon Amoy (testnet)
#
# Usage :
#   cd contracts/evm
#   cp .env.example .env   # remplir les valeurs
#   bash scripts/deploy-amoy.sh
#
# Après le déploiement, le script :
#   1. Affiche un résumé des adresses
#   2. Génère backend/.env.testnet avec les adresses à copier dans backend/.env
#   3. Vérifie les contrats sur Polygonscan Amoy (si POLYGONSCAN_API_KEY est défini)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
EVM_DIR="$(dirname "$SCRIPT_DIR")"
ROOT_DIR="$(dirname "$(dirname "$EVM_DIR")")"
BACKEND_DIR="$ROOT_DIR/backend"

# Charger .env
if [[ ! -f "$EVM_DIR/.env" ]]; then
  echo "Erreur : $EVM_DIR/.env introuvable — copier .env.example et remplir les valeurs."
  exit 1
fi
set -o allexport
source "$EVM_DIR/.env"
set +o allexport

# Vérifications pré-déploiement
: "${DEPLOYER_PK:?Manquant : DEPLOYER_PK}"
: "${DEPLOYER_ADDRESS:?Manquant : DEPLOYER_ADDRESS}"
: "${TREASURY_ADDRESS:?Manquant : TREASURY_ADDRESS}"
: "${POLYGON_AMOY_RPC:?Manquant : POLYGON_AMOY_RPC}"

# USDC de test sur Polygon Amoy (mock USDC officiel Circle Amoy)
USDC_AMOY="${USDC_AMOY_ADDRESS:-0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582}"

echo "=== PTF — Déploiement Polygon Amoy ==="
echo "Deployer  : $DEPLOYER_ADDRESS"
echo "Treasury  : $TREASURY_ADDRESS"
echo "USDC Amoy : $USDC_AMOY"
echo "RPC       : $POLYGON_AMOY_RPC"
echo ""
echo "Appuyez sur Entrée pour continuer, Ctrl+C pour annuler..."
read -r

cd "$EVM_DIR"

# Déploiement avec capture de la sortie
DEPLOY_LOG=$(mktemp)
forge script scripts/Deploy.s.sol \
  --rpc-url "$POLYGON_AMOY_RPC" \
  --broadcast \
  --verify \
  --etherscan-api-key "${POLYGONSCAN_API_KEY:-}" \
  -vvvv \
  --env-file .env \
  2>&1 | tee "$DEPLOY_LOG"

echo ""
echo "=== Extraction des adresses déployées ==="

# Extraire les adresses depuis la sortie forge
CREDIT_TOKEN=$(grep -o 'CreditToken       : 0x[0-9a-fA-F]*' "$DEPLOY_LOG" | grep -o '0x[0-9a-fA-F]*' | tail -1)
REPUTATION_REGISTRY=$(grep -o 'ReputationRegistry: 0x[0-9a-fA-F]*' "$DEPLOY_LOG" | grep -o '0x[0-9a-fA-F]*' | tail -1)
PROJECT_REGISTRY=$(grep -o 'ProjectRegistry   : 0x[0-9a-fA-F]*' "$DEPLOY_LOG" | grep -o '0x[0-9a-fA-F]*' | tail -1)
ESCROW_VAULT=$(grep -o 'EscrowVault       : 0x[0-9a-fA-F]*' "$DEPLOY_LOG" | grep -o '0x[0-9a-fA-F]*' | tail -1)

if [[ -z "$CREDIT_TOKEN" || -z "$ESCROW_VAULT" ]]; then
  echo "Erreur : impossible d'extraire les adresses depuis la sortie forge."
  echo "Consultez le log complet : $DEPLOY_LOG"
  exit 1
fi

echo "CreditToken        : $CREDIT_TOKEN"
echo "ReputationRegistry : $REPUTATION_REGISTRY"
echo "ProjectRegistry    : $PROJECT_REGISTRY"
echo "EscrowVault        : $ESCROW_VAULT"

# Générer backend/.env.testnet
TESTNET_ENV="$BACKEND_DIR/.env.testnet"
cat > "$TESTNET_ENV" <<EOF
# PTF — Polygon Amoy testnet
# Généré le $(date -u +"%Y-%m-%dT%H:%M:%SZ") par scripts/deploy-amoy.sh
# Copier ces valeurs dans backend/.env et activer PolygonAdapter dans container.ts

NODE_ENV=testnet
DEFAULT_CHAIN=polygon

# Contrats déployés sur Polygon Amoy
CONTRACT_PROJECT_REGISTRY_POLYGON=$PROJECT_REGISTRY
CONTRACT_ESCROW_VAULT_POLYGON=$ESCROW_VAULT
CONTRACT_CREDIT_TOKEN_POLYGON=$CREDIT_TOKEN
CONTRACT_REPUTATION_REGISTRY_POLYGON=$REPUTATION_REGISTRY

# RPC Polygon Amoy
RPC_POLYGON=$POLYGON_AMOY_RPC

# Clé privée opérateur (même que le deployer pour le testnet)
# SIGNER_PRIVATE_KEY=<clé_privée_opérateur>
EOF

echo ""
echo "=== Fichier généré : backend/.env.testnet ==="
echo "Prochaines étapes :"
echo "  1. Copier les valeurs de backend/.env.testnet dans backend/.env"
echo "  2. Ajouter SIGNER_PRIVATE_KEY dans backend/.env"
echo "  3. Activer PolygonAdapter dans backend/src/container.ts (remplacer MockChainAdapter)"
echo "  4. Relancer le backend : docker-compose up backend"
echo ""
echo "Polygonscan Amoy :"
echo "  https://amoy.polygonscan.com/address/$ESCROW_VAULT"
echo "  https://amoy.polygonscan.com/address/$CREDIT_TOKEN"

rm -f "$DEPLOY_LOG"
