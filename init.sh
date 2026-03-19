#!/bin/bash
# Aman AI Memory — One-step setup wizard
# Handles everything: identity, user profile, and hook installation.
# Designed for non-technical users.

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
MEMORY_PATH="${SCRIPT_DIR}/memory.md"

# ─── Colors ───

if [ -t 1 ]; then
  BOLD='\033[1m'
  DIM='\033[2m'
  GREEN='\033[0;32m'
  CYAN='\033[0;36m'
  YELLOW='\033[0;33m'
  RESET='\033[0m'
else
  BOLD=''; DIM=''; GREEN=''; CYAN=''; YELLOW=''; RESET=''
fi

# ─── Helpers ───

print_header() {
  echo ""
  printf "${BOLD}${CYAN}╔══════════════════════════════════════════╗${RESET}\n"
  printf "${BOLD}${CYAN}║        Aman AI Memory — Setup            ║${RESET}\n"
  printf "${BOLD}${CYAN}╚══════════════════════════════════════════╝${RESET}\n"
  echo ""
  echo "  This wizard will set up your AI memory system."
  echo "  Just answer a few questions — press Enter to use defaults."
  echo ""
}

print_step() {
  printf "\n${BOLD}${GREEN}── Step $1 of $2: $3 ──${RESET}\n\n"
}

print_choice() {
  printf "  ${BOLD}$1)${RESET} $2\n"
}

prompt_with_default() {
  local prompt="$1" default="$2" var_name="$3"
  if [ -n "$default" ]; then
    printf "  ${prompt} ${DIM}[${default}]${RESET}: "
  else
    printf "  ${prompt}: "
  fi
  read -r input
  if [ -z "$input" ]; then
    eval "$var_name=\"$default\""
  else
    eval "$var_name=\"\$input\""
  fi
}

prompt_choice() {
  local prompt="$1" default="$2" var_name="$3"
  shift 3
  local options=("$@")

  for i in "${!options[@]}"; do
    print_choice "$((i+1))" "${options[$i]}"
  done
  echo ""
  printf "  ${prompt} ${DIM}[${default}]${RESET}: "
  read -r choice

  if [ -z "$choice" ]; then
    choice="$default"
  fi

  if [[ "$choice" =~ ^[0-9]+$ ]] && [ "$choice" -ge 1 ] && [ "$choice" -le "${#options[@]}" ]; then
    eval "$var_name=\"\${options[$((choice-1))]}\""
  else
    eval "$var_name=\"\$choice\""
  fi
}

# ─── Preflight ───

if [ ! -f "$MEMORY_PATH" ]; then
  echo "Error: memory.md not found at $SCRIPT_DIR"
  echo "Make sure you're running this from the ai-memory folder."
  exit 1
fi

print_header

# ─── Mode Selection ───

echo "  How will this be used?"
echo ""
prompt_choice "Pick one" "1" setup_mode \
  "Just me — single user" \
  "Multiple people — shared project"

MULTI_USER=false
if [ "$setup_mode" = "Multiple people — shared project" ]; then
  MULTI_USER=true
  echo ""
  prompt_with_default "Your profile name" "$(whoami)" profile_name

  # Sanitize name
  profile_name=$(echo "$profile_name" | tr -cd '[:alnum:]-_')

  PROFILE_DIR="$SCRIPT_DIR/profiles/$profile_name"
  mkdir -p "$PROFILE_DIR/diary"
  cp "$SCRIPT_DIR/memory.md" "$PROFILE_DIR/memory.md"
  cp "$SCRIPT_DIR/session.md" "$PROFILE_DIR/session.md"

  # Setup will write to profile's memory.md directly
  MEMORY_PATH="$PROFILE_DIR/memory.md"

  printf "\n  ${GREEN}✓${RESET} Profile '${profile_name}' created\n"
fi

TOTAL_STEPS=3

# ─── Step 1: Your Profile ───

print_step 1 $TOTAL_STEPS "About You"

echo "  Tell me a bit about yourself so the AI can adapt to you."
echo ""

prompt_with_default "Your name" "" user_name
while [ -z "$user_name" ]; do
  printf "  ${YELLOW}Please enter your name:${RESET} "
  read -r user_name
done

echo ""
echo "  What do you mainly work on?"
echo ""
prompt_choice "Pick one or type your own" "1" user_focus \
  "Web development" \
  "Mobile development" \
  "Data science / ML" \
  "DevOps / Infrastructure" \
  "Creative writing" \
  "General coding" \
  "Research / Academic"

echo ""
echo "  How should the AI explain things to you?"
echo ""
prompt_choice "Pick one or type your own" "1" user_level \
  "Keep it simple — I'm still learning" \
  "I know the basics — skip the intro stuff" \
  "I'm experienced — just give me the details" \
  "Expert — be concise and technical"

echo ""
echo "  How do you like your answers?"
echo ""
prompt_choice "Pick one or type your own" "1" user_style \
  "Concise — short and to the point" \
  "Detailed — explain the reasoning" \
  "Step-by-step — walk me through it" \
  "Code first — show me the code, explain after"

# ─── Step 2: AI Personality ───

print_step 2 $TOTAL_STEPS "AI Personality"

echo "  Give your AI a name and personality."
echo ""

prompt_with_default "AI name" "Atlas" ai_name

echo ""
echo "  What should the AI help you with?"
echo ""
prompt_choice "Pick one or type your own" "1" ai_role \
  "Coding partner" \
  "Study buddy" \
  "Writing assistant" \
  "Research assistant" \
  "General assistant"

echo ""
echo "  How should the AI talk to you?"
echo ""
prompt_choice "Pick one or type your own" "1" ai_tone \
  "Direct and technical" \
  "Warm and encouraging" \
  "Casual and friendly" \
  "Professional and formal"

echo ""
echo "  Pick 2-3 personality traits:"
echo ""
prompt_choice "Pick one set or type your own" "1" ai_traits \
  "Pragmatic, curious, honest" \
  "Patient, thorough, supportive" \
  "Creative, playful, energetic" \
  "Analytical, precise, efficient"

# ─── Apply to memory.md ───

export AWK_AI_NAME="$ai_name"
export AWK_AI_ROLE="$ai_role"
export AWK_AI_TONE="$ai_tone"
export AWK_AI_TRAITS="$ai_traits"
export AWK_USER_NAME="$user_name"
export AWK_USER_FOCUS="$user_focus"
export AWK_USER_LEVEL="$user_level"
export AWK_USER_STYLE="$user_style"
export AWK_TODAY="$(date +%Y-%m-%d)"

awk '
/^# Memory — / { print "# Memory — " ENVIRON["AWK_AI_NAME"]; next }
/ \*\*AI Name\*\* / { print "| **AI Name** | " ENVIRON["AWK_AI_NAME"] " |"; next }
/ \*\*Role\*\* /    { print "| **Role** | " ENVIRON["AWK_AI_ROLE"] " |"; next }
/ \*\*Tone\*\* /    { print "| **Tone** | " ENVIRON["AWK_AI_TONE"] " |"; next }
/ \*\*Traits\*\* /  { print "| **Traits** | " ENVIRON["AWK_AI_TRAITS"] " |"; next }
/ \*\*Name\*\* /    { print "| **Name** | " ENVIRON["AWK_USER_NAME"] " |"; next }
/ \*\*Focus\*\* /   { print "| **Focus** | " ENVIRON["AWK_USER_FOCUS"] " |"; next }
/ \*\*Level\*\* /   { print "| **Level** | " ENVIRON["AWK_USER_LEVEL"] " |"; next }
/ \*\*Style\*\* /   { print "| **Style** | " ENVIRON["AWK_USER_STYLE"] " |"; next }
/^\*Last updated:/ { print "*Last updated: " ENVIRON["AWK_TODAY"] "*"; next }
{ print }
' "$MEMORY_PATH" > "${MEMORY_PATH}.tmp" && mv "${MEMORY_PATH}.tmp" "$MEMORY_PATH"

unset AWK_AI_NAME AWK_AI_ROLE AWK_AI_TONE AWK_AI_TRAITS
unset AWK_USER_NAME AWK_USER_FOCUS AWK_USER_LEVEL AWK_USER_STYLE AWK_TODAY

# ─── Step 3: Installation ───

print_step 3 $TOTAL_STEPS "Installation"

# Detect if we're inside another project
IS_SUBFOLDER=false
PROJECT_ROOT=""

if git rev-parse --show-toplevel > /dev/null 2>&1; then
  PROJECT_ROOT="$(git rev-parse --show-toplevel)"
  if [ "$SCRIPT_DIR" != "$PROJECT_ROOT" ]; then
    IS_SUBFOLDER=true
  fi
fi

if [ "$IS_SUBFOLDER" = true ]; then
  RELPATH="${SCRIPT_DIR#$PROJECT_ROOT/}"
  echo "  Detected: this is a subfolder of $(basename "$PROJECT_ROOT")"
  echo "  Template path: $RELPATH/"
  echo ""
  printf "  Install hooks into the host project? ${DIM}[Y/n]${RESET}: "
  read -r do_install
  if [ -z "$do_install" ] || [ "$do_install" = "y" ] || [ "$do_install" = "Y" ]; then
    bash "$SCRIPT_DIR/install.sh" <<< "y"
  else
    echo "  Skipped. You can run ./install.sh later."
  fi
else
  # Multi-user: set up symlinks before git init
  if [ "$MULTI_USER" = true ]; then
    echo "  Setting up multi-user profile..."
    cd "$SCRIPT_DIR"

    # Replace root files with symlinks to active profile
    rm -f memory.md session.md
    rm -rf diary
    ln -s "profiles/$profile_name/memory.md" memory.md
    ln -s "profiles/$profile_name/session.md" session.md
    ln -s "profiles/$profile_name/diary" diary

    # Gitignore the symlinks (actual files tracked in profiles/)
    for entry in "memory.md" "session.md" "diary"; do
      grep -qxF "$entry" .gitignore 2>/dev/null || echo "$entry" >> .gitignore
    done

    printf "  ${GREEN}✓${RESET} Profile symlinks activated\n"
  fi

  # Standalone project — ensure a fresh git repo
  NEEDS_INIT=false

  if [ ! -d "$SCRIPT_DIR/.git" ]; then
    # No git repo at all
    NEEDS_INIT=true
  elif git -C "$SCRIPT_DIR" remote get-url origin 2>/dev/null | grep -q "aman-ai-memory"; then
    # Cloned from template — strip the template history
    NEEDS_INIT=true
  fi

  if [ "$NEEDS_INIT" = true ]; then
    echo "  Creating a fresh git repository for your memory..."
    rm -rf "$SCRIPT_DIR/.git"
    git -C "$SCRIPT_DIR" init -q
    git -C "$SCRIPT_DIR" add -A
    COMMIT_MSG="Initialize AI memory for ${user_name}"
    [ "$MULTI_USER" = true ] && COMMIT_MSG="Initialize AI memory for ${user_name} (profile: ${profile_name})"
    git -C "$SCRIPT_DIR" commit -q -m "$COMMIT_MSG"
    printf "  ${GREEN}✓${RESET} Fresh git repo created (clean history)\n"
  else
    echo "  Detected: standalone project with existing git history."
    echo "  Hooks are already configured — no installation needed."
  fi
fi

# ─── Summary ───

echo ""
printf "${BOLD}${CYAN}╔══════════════════════════════════════════╗${RESET}\n"
printf "${BOLD}${CYAN}║             Setup Complete!               ║${RESET}\n"
printf "${BOLD}${CYAN}╚══════════════════════════════════════════╝${RESET}\n"
echo ""
printf "  ${BOLD}AI Name:${RESET}   $ai_name\n"
printf "  ${BOLD}Role:${RESET}      $ai_role\n"
printf "  ${BOLD}Tone:${RESET}      $ai_tone\n"
printf "  ${BOLD}Your Name:${RESET} $user_name\n"
printf "  ${BOLD}Focus:${RESET}     $user_focus\n"
echo ""
printf "  ${BOLD}${GREEN}What to do next:${RESET}\n"
echo ""
echo "  1. Start a conversation with Claude Code (or any AI)"
echo "  2. Just chat normally — memory loads automatically"
echo "  3. Say \"save\" before ending important sessions"
echo ""
printf "  ${DIM}Files: memory.md (persistent) | session.md (per-session) | diary/ (optional)${RESET}\n"
echo ""
