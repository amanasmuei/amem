#!/bin/bash
# Aman AI Memory — Remote Installer
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/USER/REPO/main/get.sh | bash
#   curl -fsSL URL | bash -s -- [target-directory]
#
# Downloads the template, makes scripts executable, and launches the wizard.

set -e

# ─── Configuration ───
# Update these when you publish to GitHub
REPO_OWNER="amanasmuei"
REPO_NAME="aman-ai-memory"
BRANCH="main"
INSTALL_DIR="${1:-aman-ai-memory}"

# ─── Colors ───

if [ -t 1 ]; then
  BOLD='\033[1m'
  DIM='\033[2m'
  GREEN='\033[0;32m'
  CYAN='\033[0;36m'
  RED='\033[0;31m'
  YELLOW='\033[0;33m'
  RESET='\033[0m'
else
  BOLD=''; DIM=''; GREEN=''; CYAN=''; RED=''; YELLOW=''; RESET=''
fi

# ─── Helpers ───

info()  { printf "${CYAN}▸${RESET} %s\n" "$1"; }
ok()    { printf "${GREEN}✓${RESET} %s\n" "$1"; }
warn()  { printf "${YELLOW}!${RESET} %s\n" "$1"; }
fail()  { printf "${RED}✗${RESET} %s\n" "$1"; exit 1; }

# ─── Preflight checks ───

echo ""
printf "${BOLD}${CYAN}Aman AI Memory — Installer${RESET}\n"
echo ""

# Check for curl or wget
if command -v curl > /dev/null 2>&1; then
  DOWNLOAD="curl"
elif command -v wget > /dev/null 2>&1; then
  DOWNLOAD="wget"
else
  fail "Neither curl nor wget found. Install one and try again."
fi

# Check for tar
command -v tar > /dev/null 2>&1 || fail "tar not found. Install it and try again."

# Check if target already exists
if [ -d "$INSTALL_DIR" ]; then
  warn "Directory '$INSTALL_DIR' already exists."
  printf "  Overwrite? ${DIM}[y/N]${RESET}: "
  if [ -t 0 ]; then
    read -r overwrite
  else
    overwrite="n"
  fi
  if [ "$overwrite" != "y" ] && [ "$overwrite" != "Y" ]; then
    echo "  Aborted."
    exit 0
  fi
  rm -rf "$INSTALL_DIR"
fi

# ─── Download ───

TARBALL_URL="https://github.com/${REPO_OWNER}/${REPO_NAME}/archive/${BRANCH}.tar.gz"
TEMP_DIR=$(mktemp -d)

info "Downloading from ${REPO_OWNER}/${REPO_NAME}..."

if [ "$DOWNLOAD" = "curl" ]; then
  curl -fsSL "$TARBALL_URL" -o "$TEMP_DIR/repo.tar.gz" || fail "Download failed. Check the repository URL."
else
  wget -q "$TARBALL_URL" -O "$TEMP_DIR/repo.tar.gz" || fail "Download failed. Check the repository URL."
fi

ok "Downloaded"

# ─── Extract ───

info "Extracting..."

tar -xzf "$TEMP_DIR/repo.tar.gz" -C "$TEMP_DIR" || fail "Extraction failed."

# GitHub archives extract to REPO-BRANCH/ directory
EXTRACTED="${TEMP_DIR}/${REPO_NAME}-${BRANCH}"

if [ ! -d "$EXTRACTED" ]; then
  # Try to find the extracted directory (some repos use different naming)
  EXTRACTED=$(find "$TEMP_DIR" -mindepth 1 -maxdepth 1 -type d | head -1)
fi

if [ ! -d "$EXTRACTED" ] || [ ! -f "$EXTRACTED/memory.md" ]; then
  fail "Extraction produced unexpected structure. Expected memory.md in extracted folder."
fi

mv "$EXTRACTED" "$INSTALL_DIR"
rm -rf "$TEMP_DIR"

ok "Extracted to ${INSTALL_DIR}/"

# ─── Make scripts executable ───

info "Setting up..."

chmod +x "$INSTALL_DIR"/*.sh 2>/dev/null || true

ok "Scripts ready"

# ─── Initialize fresh git repo ───

info "Initializing git repository..."

(
  cd "$INSTALL_DIR"

  # Remove any template git history (shouldn't exist from tarball, but just in case)
  rm -rf .git

  git init -q
  git add -A
  git commit -q -m "Initialize AI memory from aman-ai-memory template"
)

ok "Git repository initialized (clean history)"

# ─── Summary ───

echo ""
printf "${BOLD}${GREEN}Installation complete!${RESET}\n"
echo ""
echo "  Your files are in: ${INSTALL_DIR}/"
echo ""

# ─── Launch wizard ───

if [ -t 0 ]; then
  # Interactive terminal — offer to launch wizard
  printf "  Launch the setup wizard now? ${DIM}[Y/n]${RESET}: "
  read -r launch
  if [ -z "$launch" ] || [ "$launch" = "y" ] || [ "$launch" = "Y" ]; then
    echo ""
    cd "$INSTALL_DIR" && bash init.sh
  else
    echo ""
    echo "  To set up later, run:"
    echo ""
    echo "    cd ${INSTALL_DIR} && ./init.sh"
    echo ""
  fi
else
  # Non-interactive (piped) — just show instructions
  echo "  Next step — run the setup wizard:"
  echo ""
  echo "    cd ${INSTALL_DIR} && ./init.sh"
  echo ""
fi
