#!/usr/bin/env bash
# Met à jour les adresses de contrats dans subgraph.yaml après déploiement
# Usage : bash subgraph/scripts/update-addresses.sh
#   Lit backend/.env.testnet ou backend/.env selon NODE_ENV

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SUBGRAPH_YAML="$SCRIPT_DIR/../subgraph.yaml"
ENV_FILE="$SCRIPT_DIR/../../backend/.env.testnet"

if [[ ! -f "$ENV_FILE" ]]; then
  ENV_FILE="$SCRIPT_DIR/../../backend/.env"
fi

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Erreur : aucun fichier .env trouvé ($ENV_FILE)."
  exit 1
fi

source "$ENV_FILE" 2>/dev/null || true

: "${CONTRACT_PROJECT_REGISTRY_POLYGON:?Manquant dans .env}"
: "${CONTRACT_ESCROW_VAULT_POLYGON:?Manquant dans .env}"
: "${CONTRACT_CREDIT_TOKEN_POLYGON:?Manquant dans .env}"
: "${CONTRACT_REPUTATION_REGISTRY_POLYGON:?Manquant dans .env}"

echo "Mise à jour des adresses dans subgraph.yaml :"
echo "  ProjectRegistry   : $CONTRACT_PROJECT_REGISTRY_POLYGON"
echo "  EscrowVault       : $CONTRACT_ESCROW_VAULT_POLYGON"
echo "  CreditToken       : $CONTRACT_CREDIT_TOKEN_POLYGON"
echo "  ReputationRegistry: $CONTRACT_REPUTATION_REGISTRY_POLYGON"

# Sed in-place pour chaque contrat (remplace la ligne address après le nom du dataSource)
python3 - <<EOF
import re, sys

with open("$SUBGRAPH_YAML", "r") as f:
    content = f.read()

replacements = {
    "ProjectRegistry":   "$CONTRACT_PROJECT_REGISTRY_POLYGON",
    "EscrowVault":       "$CONTRACT_ESCROW_VAULT_POLYGON",
    "CreditToken":       "$CONTRACT_CREDIT_TOKEN_POLYGON",
    "ReputationRegistry":"$CONTRACT_REPUTATION_REGISTRY_POLYGON",
}

for name, addr in replacements.items():
    # Remplace l'adresse dans le bloc du dataSource correspondant
    pattern = r'(name: ' + name + r'.*?source:\s*\n\s*address: )"[^"]*"'
    replacement = r'\g<1>"' + addr + '"'
    content = re.sub(pattern, replacement, content, flags=re.DOTALL)

with open("$SUBGRAPH_YAML", "w") as f:
    f.write(content)

print("subgraph.yaml mis à jour.")
EOF
