#!/usr/bin/env bash
# PTF — Setup initial Hetzner CX21 (Ubuntu 22.04)
#
# Usage (depuis votre machine locale) :
#   ssh root@<VPS_IP> "bash -s" < infra/setup-vps.sh
#
# Ce script :
#   1. Met à jour le système + installe Docker, Docker Compose, Certbot, curl
#   2. Crée l'utilisateur déployeur non-root
#   3. Configure UFW (firewall)
#   4. Crée la structure de dossiers
#   5. Configure le renouvellement automatique des certificats TLS

set -euo pipefail

DEPLOY_USER="ptf"
PTF_HOME="/home/$DEPLOY_USER/ptf"

echo "=== PTF — Setup VPS Hetzner ==="
echo "OS : $(lsb_release -ds 2>/dev/null || cat /etc/os-release | grep PRETTY | cut -d= -f2)"

# ── 1. Mise à jour système ────────────────────────────────────────────────────
echo "→ Mise à jour système..."
apt-get update -qq
apt-get upgrade -y -qq
apt-get install -y -qq \
  curl wget git ufw fail2ban \
  ca-certificates gnupg lsb-release

# ── 2. Docker ────────────────────────────────────────────────────────────────
if ! command -v docker &>/dev/null; then
  echo "→ Installation Docker..."
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  chmod a+r /etc/apt/keyrings/docker.gpg
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
    https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update -qq
  apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-compose-plugin
  systemctl enable docker
  systemctl start docker
else
  echo "→ Docker déjà installé ($(docker --version))"
fi

# ── 3. Certbot ───────────────────────────────────────────────────────────────
if ! command -v certbot &>/dev/null; then
  echo "→ Installation Certbot..."
  apt-get install -y -qq certbot
fi

# ── 4. Utilisateur déployeur ─────────────────────────────────────────────────
if ! id "$DEPLOY_USER" &>/dev/null; then
  echo "→ Création utilisateur $DEPLOY_USER..."
  useradd -m -s /bin/bash "$DEPLOY_USER"
  usermod -aG docker "$DEPLOY_USER"
fi

# ── 5. Firewall (UFW) ────────────────────────────────────────────────────────
echo "→ Configuration UFW..."
ufw --force reset
ufw default deny incoming
ufw default allow outgoing
ufw allow ssh
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

# ── 6. Fail2ban ───────────────────────────────────────────────────────────────
systemctl enable fail2ban
systemctl start fail2ban

# ── 7. Structure de dossiers ─────────────────────────────────────────────────
echo "→ Création structure $PTF_HOME..."
mkdir -p "$PTF_HOME/framework"
mkdir -p "$PTF_HOME/service"
mkdir -p /var/www/certbot
chown -R "$DEPLOY_USER:$DEPLOY_USER" "$PTF_HOME"
chown -R www-data:www-data /var/www/certbot

# ── 8. Renouvellement TLS automatique ────────────────────────────────────────
echo "→ Configuration cron renouvellement TLS..."
CRON_LINE="0 3 * * * certbot renew --quiet && docker exec nginx nginx -s reload"
(crontab -l 2>/dev/null | grep -v certbot; echo "$CRON_LINE") | crontab -

# ── 9. Registry GitHub ───────────────────────────────────────────────────────
echo ""
echo "=== Setup terminé ==="
echo ""
echo "Prochaines étapes manuelles :"
echo "  1. Copier les fichiers infra/ sur le VPS :"
echo "     scp -r infra/ $DEPLOY_USER@<VPS_IP>:$PTF_HOME/framework/"
echo ""
echo "  2. Créer les .env de production :"
echo "     cp infra/.env.framework.example $PTF_HOME/framework/.env"
echo "     cp infra/.env.service.example $PTF_HOME/service/.env"
echo "     # Remplir les valeurs"
echo ""
echo "  3. Obtenir les certificats TLS :"
echo "     certbot certonly --webroot -w /var/www/certbot \\"
echo "       -d api.ptf-framework.dev \\"
echo "       -d api.ptf-service.dev \\"
echo "       -d app.ptf-service.dev \\"
echo "       --email <email> --agree-tos --non-interactive"
echo ""
echo "  4. Se connecter au registry GitHub :"
echo "     echo \$GHCR_TOKEN | docker login ghcr.io -u <github_user> --password-stdin"
echo ""
echo "  5. Démarrer les services :"
echo "     cd $PTF_HOME/framework"
echo "     docker compose -f docker-compose.prod.yml up -d"
echo "     cd $PTF_HOME/service"
echo "     docker compose -f docker-compose.service.prod.yml up -d"
