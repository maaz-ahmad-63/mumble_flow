#!/usr/bin/env bash
# Mumble AI installer for a fresh Ubuntu 22.04 or 24.04 server.
#
#   curl -fsSL https://raw.githubusercontent.com/maaz-ahmad-63/mumble_flow/main/scripts/install-vps.sh | sudo bash
#
# What it does:
#   1. Installs Node.js, git, and Caddy.
#   2. Downloads Mumble AI into /opt/mumble-flow and creates .env.
#   3. Runs the app as a systemd service named mumble-ai.
#   4. Puts Caddy in front with HTTPS and a username and password.
#   5. Opens ports 22 (SSH), 80, and 443 in the firewall. Port 3050 stays closed.
#
# Running it again updates the app. It keeps .env, data/, and your password.
#
# Optional settings (put them before "bash", for example: ... | sudo MF_RECONFIGURE=1 bash):
#   MF_DOMAIN=dictate.example.com  Domain that already points at this server.
#                                  MF_DOMAIN=none uses a free sslip.io address instead.
#   MF_USERNAME=me                 Username for the password screen.
#   MF_PASSWORD=...                Password for the password screen.
#   MF_RECONFIGURE=1               Ask again for the domain, username, password, and keys.
#   MF_SKIP_FIREWALL=1             Do not change the firewall.
#   MF_PORT=3050                   Port the app uses inside the server.
#   MF_REPO=https://...git         Install from a different Git repository.
#   MF_BRANCH=main                 Install a different branch.
#   NODE_MAJOR=22                  Node.js version to install if Node.js is missing or older than 20.

set -euo pipefail

REPO_URL="${MF_REPO:-https://github.com/maaz-ahmad-63/mumble_flow.git}"
BRANCH="${MF_BRANCH:-main}"
APP_DIR=/opt/mumble-flow
APP_USER=mumble
APP_HOME=/var/lib/mumble-flow
SERVICE=mumble-ai
APP_PORT="${MF_PORT:-3050}"
NODE_MAJOR="${NODE_MAJOR:-22}"
CADDYFILE=/etc/caddy/Caddyfile
MARKER="# Managed by Mumble AI scripts/install-vps.sh"
RECONFIGURE="${MF_RECONFIGURE:-0}"

say()  { printf '\n==> %s\n' "$1"; }
warn() { printf 'WARNING: %s\n' "$1" >&2; }
fail() { printf '\nERROR: %s\n' "$1" >&2; exit 1; }

HAVE_TTY=0
if { : </dev/tty; } 2>/dev/null; then
  HAVE_TTY=1
fi

ask() {
  local prompt=$1 answer=""
  if [ "$HAVE_TTY" -eq 1 ]; then
    read -r -p "$prompt" answer </dev/tty || true
  fi
  printf '%s' "$answer"
}

ask_secret() {
  local prompt=$1 answer=""
  if [ "$HAVE_TTY" -eq 1 ]; then
    read -r -s -p "$prompt" answer </dev/tty || true
    printf '\n' >&2
  fi
  printf '%s' "$answer"
}

as_app() {
  runuser -u "$APP_USER" -- env HOME="$APP_HOME" "$@"
}

set_env_value() {
  local key=$1 value=$2 file="$APP_DIR/.env" tmp
  tmp=$(mktemp)
  KEY="$key" VALUE="$value" awk '
    BEGIN { k = ENVIRON["KEY"]; v = ENVIRON["VALUE"]; done = 0 }
    $0 ~ "^" k "=" { print k "=" v; done = 1; next }
    { print }
    END { if (!done) print k "=" v }
  ' "$file" >"$tmp"
  cat "$tmp" >"$file"
  rm -f "$tmp"
}

public_ip() {
  local ip=""
  for url in https://api.ipify.org https://ifconfig.me/ip https://icanhazip.com; do
    ip=$(curl -fsS -4 -m 5 "$url" 2>/dev/null | tr -d '[:space:]') || true
    if [[ "$ip" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
      printf '%s' "$ip"
      return 0
    fi
  done
  return 1
}

# ---------------------------------------------------------------------------
say "Checking the server"
[ "$(id -u)" -eq 0 ] || fail "Run this script as root. Put sudo in front: curl -fsSL ... | sudo bash"
command -v apt-get >/dev/null 2>&1 || fail "This script needs Ubuntu (it uses apt-get). See docs/deploy/linux-vps.md for manual steps."
if [ -r /etc/os-release ]; then
  . /etc/os-release
  if [ "${ID:-}" != "ubuntu" ]; then
    warn "This script is written for Ubuntu 22.04 and 24.04. You have ${PRETTY_NAME:-an unknown system}. Continuing anyway."
  fi
fi
[[ "$APP_PORT" =~ ^[0-9]+$ ]] || fail "MF_PORT must be a number."

# ---------------------------------------------------------------------------
say "Installing system packages"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y ca-certificates curl gnupg git debian-keyring debian-archive-keyring apt-transport-https

NEED_NODE=1
if command -v node >/dev/null 2>&1; then
  CURRENT_NODE=$(node -p 'process.versions.node.split(".")[0]')
  if [ "$CURRENT_NODE" -ge 20 ]; then
    NEED_NODE=0
    echo "Node.js $(node --version) is already installed."
  fi
fi
if [ "$NEED_NODE" -eq 1 ]; then
  say "Installing Node.js $NODE_MAJOR"
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash -
  apt-get install -y nodejs
fi
NODE_BIN=$(command -v node)

# ---------------------------------------------------------------------------
say "Creating the mumble system user"
if ! id -u "$APP_USER" >/dev/null 2>&1; then
  useradd --system --create-home --home-dir "$APP_HOME" --shell /usr/sbin/nologin "$APP_USER"
fi
install -d -o "$APP_USER" -g "$APP_USER" "$APP_HOME"

say "Downloading Mumble AI into $APP_DIR"
if [ -d "$APP_DIR/.git" ]; then
  chown -R "$APP_USER:$APP_USER" "$APP_DIR"
  as_app git -C "$APP_DIR" fetch origin "$BRANCH"
  as_app git -C "$APP_DIR" checkout "$BRANCH"
  as_app git -C "$APP_DIR" pull --ff-only origin "$BRANCH" \
    || fail "Could not update $APP_DIR because files there were changed by hand. Run 'sudo -u $APP_USER git -C $APP_DIR status' to see them."
elif [ -d "$APP_DIR" ] && [ -n "$(ls -A "$APP_DIR")" ]; then
  fail "$APP_DIR exists but is not a Mumble AI download. Move it away and run this script again."
else
  install -d -o "$APP_USER" -g "$APP_USER" "$APP_DIR"
  as_app git clone --branch "$BRANCH" "$REPO_URL" "$APP_DIR"
fi

say "Installing app packages"
cd "$APP_DIR"
as_app npm ci --omit=dev --no-audit --no-fund || as_app npm install --omit=dev --no-audit --no-fund

# ---------------------------------------------------------------------------
say "Setting up .env"
NEW_ENV=0
if [ ! -f "$APP_DIR/.env" ]; then
  cp "$APP_DIR/.env.example" "$APP_DIR/.env"
  NEW_ENV=1
fi
chown "$APP_USER:$APP_USER" "$APP_DIR/.env"
chmod 600 "$APP_DIR/.env"
set_env_value PORT "$APP_PORT"

if [ "$NEW_ENV" -eq 1 ] || [ "$RECONFIGURE" = "1" ]; then
  if [ "$HAVE_TTY" -eq 1 ]; then
    echo "API keys are optional. Without them the app still cleans up text with built-in rules."
    echo "Get a free Groq key at https://console.groq.com/keys"
    GROQ_KEY=$(ask_secret "Paste your Groq API key and press Enter (or press Enter to skip): ")
    [ -n "$GROQ_KEY" ] && set_env_value GROQ_API_KEY "$GROQ_KEY"
    echo "Get a Gemini key at https://aistudio.google.com/apikey"
    GEMINI_KEY=$(ask_secret "Paste your Gemini API key and press Enter (or press Enter to skip): ")
    [ -n "$GEMINI_KEY" ] && set_env_value GEMINI_API_KEY "$GEMINI_KEY"
    unset GROQ_KEY GEMINI_KEY
  else
    echo "No keyboard input available. Add keys later with: sudo nano $APP_DIR/.env"
  fi
fi

# ---------------------------------------------------------------------------
say "Setting up the mumble-ai service"
cat >/etc/systemd/system/$SERVICE.service <<EOF
[Unit]
Description=Mumble AI
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=$APP_USER
Group=$APP_USER
WorkingDirectory=$APP_DIR
Environment=NODE_ENV=production
Environment=HOME=$APP_HOME
ExecStart=$NODE_BIN server/index.js
Restart=on-failure
RestartSec=5
NoNewPrivileges=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable "$SERVICE" >/dev/null
systemctl restart "$SERVICE"

# ---------------------------------------------------------------------------
say "Installing Caddy (HTTPS and password screen)"
if ! command -v caddy >/dev/null 2>&1; then
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' >/etc/apt/sources.list.d/caddy-stable.list
  chmod o+r /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  chmod o+r /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -y
  apt-get install -y caddy
fi

WRITE_CADDYFILE=1
if [ -f "$CADDYFILE" ] && grep -qF "$MARKER" "$CADDYFILE" && [ "$RECONFIGURE" != "1" ]; then
  WRITE_CADDYFILE=0
  echo "Keeping the existing Caddy settings. To change the domain or password, run again with MF_RECONFIGURE=1."
fi

SITE_URL=""
if [ "$WRITE_CADDYFILE" -eq 1 ]; then
  DOMAIN="${MF_DOMAIN:-}"
  if [ -z "$DOMAIN" ]; then
    echo
    echo "If you own a domain, create a DNS A record that points to this server first."
    DOMAIN=$(ask "Type your domain, for example dictate.example.com (or press Enter if you have none): ")
  fi
  [ "$DOMAIN" = "none" ] && DOMAIN=""
  DOMAIN=$(printf '%s' "$DOMAIN" | sed -e 's#^https\?://##' -e 's#/.*$##' | tr '[:upper:]' '[:lower:]')

  SERVER_IP=$(public_ip || true)
  if [ -n "$DOMAIN" ]; then
    SITE_ADDRESS="$DOMAIN"
    SITE_URL="https://$DOMAIN"
    DOMAIN_IP=$(getent ahostsv4 "$DOMAIN" 2>/dev/null | awk 'NR==1 {print $1}' || true)
    if [ -n "$SERVER_IP" ] && [ "$DOMAIN_IP" != "$SERVER_IP" ]; then
      warn "$DOMAIN points to '${DOMAIN_IP:-nothing}', but this server is $SERVER_IP. HTTPS will start working a few minutes after the DNS record is correct."
    fi
  elif [ -n "$SERVER_IP" ]; then
    SITE_ADDRESS="${SERVER_IP//./-}.sslip.io"
    SITE_URL="https://$SITE_ADDRESS"
    echo "No domain given. Using the free address $SITE_ADDRESS, which points to $SERVER_IP."
  else
    SITE_ADDRESS=":80"
    SITE_URL="http://THIS_SERVER_IP"
    warn "Could not find this server's public IP address. Serving plain HTTP on port 80."
    warn "Browsers block the microphone on plain HTTP. Run again with MF_DOMAIN set to fix this."
  fi

  AUTH_USER="${MF_USERNAME:-}"
  if [ -z "$AUTH_USER" ]; then
    AUTH_USER=$(ask "Choose a username for the password screen [mumble]: ")
    AUTH_USER="${AUTH_USER:-mumble}"
  fi
  [[ "$AUTH_USER" =~ ^[A-Za-z0-9._-]+$ ]] || fail "The username can use only letters, numbers, dot, dash, and underscore."

  AUTH_PASS="${MF_PASSWORD:-}"
  while [ -z "$AUTH_PASS" ]; do
    [ "$HAVE_TTY" -eq 1 ] || fail "No password given. Run again with MF_PASSWORD set, for example: curl ... | sudo MF_PASSWORD='YOUR_PASSWORD' bash"
    AUTH_PASS=$(ask_secret "Choose a password (at least 10 characters): ")
    if [ "${#AUTH_PASS}" -lt 10 ]; then
      echo "Too short. Try again."
      AUTH_PASS=""
      continue
    fi
    AUTH_PASS_AGAIN=$(ask_secret "Type the password again: ")
    if [ "$AUTH_PASS" != "$AUTH_PASS_AGAIN" ]; then
      echo "The passwords do not match. Try again."
      AUTH_PASS=""
      fi
  done
  AUTH_HASH=$(caddy hash-password --plaintext "$AUTH_PASS")
  unset AUTH_PASS AUTH_PASS_AGAIN

  if [ -f "$CADDYFILE" ] && ! grep -qF "$MARKER" "$CADDYFILE"; then
    BACKUP="$CADDYFILE.before-mumble-flow.$(date +%Y%m%d%H%M%S)"
    cp "$CADDYFILE" "$BACKUP"
    echo "Saved the old Caddyfile as $BACKUP"
  fi

  {
    printf '%s\n' "$MARKER"
    printf '%s\n' "# Running the script again with MF_RECONFIGURE=1 replaces this file."
    printf '%s {\n' "$SITE_ADDRESS"
    printf '\tencode gzip\n'
    printf '\tbasic_auth {\n'
    printf '\t\t%s %s\n' "$AUTH_USER" "$AUTH_HASH"
    printf '\t}\n'
    printf '\treverse_proxy 127.0.0.1:%s\n' "$APP_PORT"
    printf '}\n'
  } >"$CADDYFILE"

  caddy validate --config "$CADDYFILE" --adapter caddyfile >/dev/null \
    || fail "Caddy rejected $CADDYFILE. Run 'caddy validate --config $CADDYFILE' to see why."
else
  SITE_ADDRESS=$(grep -v '^#' "$CADDYFILE" | awk 'NF {print $1; exit}')
  case "$SITE_ADDRESS" in
    :*) SITE_URL="http://THIS_SERVER_IP" ;;
    *) SITE_URL="https://$SITE_ADDRESS" ;;
  esac
fi

systemctl enable caddy >/dev/null
systemctl reload caddy 2>/dev/null || systemctl restart caddy

# ---------------------------------------------------------------------------
if [ "${MF_SKIP_FIREWALL:-0}" = "1" ]; then
  say "Skipping the firewall (MF_SKIP_FIREWALL=1)"
elif command -v iptables >/dev/null 2>&1 && iptables -S INPUT 2>/dev/null | grep -q -- '-j REJECT' \
     && ! { command -v ufw >/dev/null 2>&1 && ufw status 2>/dev/null | grep -q '^Status: active'; }; then
  # Oracle Cloud Ubuntu images block ports with iptables rules and break if ufw is enabled.
  say "Opening ports 80 and 443 in iptables"
  for port in 80 443; do
    if ! iptables -C INPUT -p tcp -m state --state NEW --dport "$port" -j ACCEPT 2>/dev/null; then
      REJECT_LINE=$(iptables -L INPUT --line-numbers -n | awk '$2 == "REJECT" {print $1; exit}')
      iptables -I INPUT "${REJECT_LINE:-1}" -p tcp -m state --state NEW --dport "$port" -j ACCEPT
    fi
  done
  if command -v netfilter-persistent >/dev/null 2>&1; then
    netfilter-persistent save >/dev/null
  else
    warn "netfilter-persistent is not installed, so the port rules reset after a reboot. Install it with: sudo apt-get install -y iptables-persistent"
  fi
else
  say "Setting up the ufw firewall"
  command -v ufw >/dev/null 2>&1 || apt-get install -y ufw
  SSH_PORTS=$(sshd -T 2>/dev/null | awk '$1 == "port" {print $2}' | sort -u || true)
  for port in ${SSH_PORTS:-22}; do
    ufw allow "$port/tcp" >/dev/null
  done
  ufw allow 80/tcp >/dev/null
  ufw allow 443/tcp >/dev/null
  ufw --force enable >/dev/null
  echo "Allowed SSH (${SSH_PORTS:-22}), 80, and 443. Port $APP_PORT stays closed to the internet."
fi

# ---------------------------------------------------------------------------
say "Checking that Mumble AI answers"
HEALTHY=0
for _ in $(seq 1 30); do
  if curl -fsS -m 2 "http://127.0.0.1:$APP_PORT/health" >/dev/null 2>&1; then
    HEALTHY=1
    break
  fi
  sleep 1
done
if [ "$HEALTHY" -ne 1 ]; then
  fail "Mumble AI did not answer on port $APP_PORT. See the log with: sudo journalctl -u $SERVICE -n 50 --no-pager"
fi

cat <<EOF

Mumble AI is installed and running.

  Open:      $SITE_URL
  Username:  the one you chose (password is not shown here)

If the page does not load:
  - Open TCP ports 80 and 443 in your cloud provider's firewall
    (Lightsail Networking tab, Oracle security list, Azure network security group,
    Google Cloud firewall rules, Hetzner or DigitalOcean cloud firewall).
  - The first HTTPS certificate can take a minute or two.

Useful commands:
  Status:        sudo systemctl status $SERVICE
  App log:       sudo journalctl -u $SERVICE -f
  HTTPS log:     sudo journalctl -u caddy -f
  Edit keys:     sudo nano $APP_DIR/.env   then   sudo systemctl restart $SERVICE
  Update:        run the same curl command again
  Change login:  curl -fsSL https://raw.githubusercontent.com/maaz-ahmad-63/mumble_flow/main/scripts/install-vps.sh | sudo MF_RECONFIGURE=1 bash
EOF
