#!/usr/bin/env bash
set -euo pipefail

BOLD="\033[1m"
GREEN="\033[32m"
YELLOW="\033[33m"
RED="\033[31m"
CYAN="\033[36m"
RESET="\033[0m"

banner() {
  echo -e "${CYAN}"
  echo "  ██╗██████╗ ██████╗     ██████╗ ██╗      █████╗ ████████╗███████╗ ██████╗ ██████╗ ███╗   ███╗"
  echo "  ██║██╔══██╗██╔══██╗    ██╔══██╗██║     ██╔══██╗╚══██╔══╝██╔════╝██╔═══██╗██╔══██╗████╗ ████║"
  echo "  ██║██║  ██║██████╔╝    ██████╔╝██║     ███████║   ██║   █████╗  ██║   ██║██████╔╝██╔████╔██║"
  echo "  ██║██║  ██║██╔═══╝     ██╔═══╝ ██║     ██╔══██║   ██║   ██╔══╝  ██║   ██║██╔══██╗██║╚██╔╝██║"
  echo "  ██║██████╔╝██║         ██║     ███████╗██║  ██║   ██║   ██║     ╚██████╔╝██║  ██║██║ ╚═╝ ██║"
  echo "  ╚═╝╚═════╝ ╚═╝         ╚═╝     ╚══════╝╚═╝  ╚═╝   ╚═╝   ╚═╝      ╚═════╝ ╚═╝  ╚═╝╚═╝     ╚═╝"
  echo -e "${RESET}"
  echo -e "${BOLD}Internal Developer Platform — Self-service infrastructure provisioning${RESET}"
  echo ""
}

check_prereq() {
  local cmd=$1 name=$2
  if command -v "$cmd" &>/dev/null; then
    echo -e "  ${GREEN}✓${RESET} $name found"
    return 0
  else
    echo -e "  ${RED}✗${RESET} $name not found — please install it first"
    return 1
  fi
}

banner

echo -e "${BOLD}Step 1/5: Checking prerequisites...${RESET}"
FAIL=0
check_prereq node "Node.js >= 20" || FAIL=1
check_prereq pnpm "pnpm >= 11" || FAIL=1

# Docker: try both the macOS Docker path and system path
if /Applications/Docker.app/Contents/Resources/bin/docker info &>/dev/null 2>&1; then
  export DOCKER="/Applications/Docker.app/Contents/Resources/bin/docker"
  echo -e "  ${GREEN}✓${RESET} Docker Desktop found"
elif command -v docker &>/dev/null && docker info &>/dev/null 2>&1; then
  export DOCKER="docker"
  echo -e "  ${GREEN}✓${RESET} Docker found"
else
  echo -e "  ${RED}✗${RESET} Docker not running — start Docker Desktop first"
  FAIL=1
fi

if [ "$FAIL" = "1" ]; then
  echo -e "\n${RED}Please install missing prerequisites and re-run.${RESET}"
  exit 1
fi
echo ""

echo -e "${BOLD}Step 2/5: Starting infrastructure (PostgreSQL, Redis, Vault)...${RESET}"
$DOCKER compose up -d 2>/dev/null || {
  echo -e "  ${YELLOW}docker compose failed, trying docker-compose...${RESET}"
  $DOCKER-compose up -d 2>/dev/null || {
    echo -e "  ${RED}Failed to start Docker services. Is Docker running?${RESET}"
    exit 1
  }
}
echo -e "  ${GREEN}✓${RESET} PostgreSQL, Redis and Vault are starting..."
echo ""

echo -e "${BOLD}Step 3/5: Configuring environment...${RESET}"
if [ ! -f apps/api/.env ]; then
  if [ -f apps/api/.env.example ]; then
    cp apps/api/.env.example apps/api/.env
    echo -e "  ${YELLOW}⚠${RESET} Created apps/api/.env from .env.example — please edit it with your credentials"
  else
    cat > apps/api/.env << 'DOTENV'
# Required
DATABASE_URL=postgresql://infraena:infraena@localhost:5433/infraena
REDIS_URL=redis://localhost:6379
VAULT_ADDR=http://localhost:8200
VAULT_TOKEN=root
JWT_SECRET=dev-secret-change-me-in-production-min-32-chars

# GitHub OAuth (required for login)
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=
GITHUB_ORG=

# GitHub API (optional — worker skips if missing)
GITHUB_TOKEN=

# Terraform Cloud (optional — worker skips if missing)
TERRAFORM_CLOUD_TOKEN=
TERRAFORM_ORG=
DOTENV
    echo -e "  ${YELLOW}⚠${RESET} Created apps/api/.env — please edit it with your credentials"
  fi
else
  echo -e "  ${GREEN}✓${RESET} apps/api/.env already exists"
fi

if [ ! -f apps/web/.env ]; then
  if [ -f apps/web/.env.example ]; then
    cp apps/web/.env.example apps/web/.env
  else
    echo "VITE_API_URL=" > apps/web/.env
  fi
fi
echo ""

echo -e "${BOLD}Step 4/5: Installing dependencies...${RESET}"
pnpm install
echo -e "  ${GREEN}✓${RESET} Dependencies installed"
echo ""

echo -e "${BOLD}Step 5/5: Running database migrations...${RESET}"
pnpm db:generate 2>/dev/null || true
pnpm db:migrate 2>/dev/null || {
  echo -e "  ${YELLOW}⚠${RESET} Migration via 'prisma migrate dev' failed (may need reset)."
  echo -e "  ${YELLOW}⚠${RESET} Trying 'prisma db push' instead..."
  cd apps/api && pnpm exec prisma db push && cd ../..
  echo -e "  ${GREEN}✓${RESET} Database synced with prisma db push"
}
pnpm db:seed 2>/dev/null || true
echo ""

echo -e "${GREEN}${BOLD}Setup complete!${RESET}"
echo ""
echo -e "  Start the platform:  ${CYAN}pnpm dev${RESET}"
echo -e "  Web interface:       ${CYAN}http://localhost:3000${RESET}"
echo -e "  API:                 ${CYAN}http://localhost:8080${RESET}"
echo -e "  API docs:            ${CYAN}http://localhost:8080/docs${RESET}"
echo -e "  Metrics:             ${CYAN}http://localhost:8080/metrics${RESET}"
echo ""
echo -e "  ${YELLOW}Make sure to edit apps/api/.env with your credentials before creating services.${RESET}"
