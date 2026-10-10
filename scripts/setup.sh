#!/usr/bin/env bash
# Sets up Mumble AI on macOS or Linux and starts it.
#
#   bash scripts/setup.sh              set up, run tests, start the app
#   bash scripts/setup.sh --no-start   set up and run tests only
#   bash scripts/setup.sh --skip-tests skip npm test
#
# Press Ctrl+C to stop the app.

set -euo pipefail

cd "$(dirname "$0")/.."

NO_START=0
SKIP_TESTS=0
DOWNLOAD_URL="https://nodejs.org/en/download"

for arg in "$@"; do
  case "$arg" in
    --no-start) NO_START=1 ;;
    --skip-tests) SKIP_TESTS=1 ;;
    -h|--help)
      sed -n '2,8p' "$0"
      exit 0
      ;;
    *)
      echo "Unknown option: $arg (use --help)" >&2
      exit 1
      ;;
  esac
done

step() { printf '\n==> %s\n' "$1"; }
fail() { printf '\nERROR: %s\n' "$1" >&2; exit 1; }

health() {
  node -e "require('http').get('http://localhost:' + process.argv[1] + '/health', r => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1)).setTimeout(2000, function () { this.destroy(); })" "$1" >/dev/null 2>&1
}

find_running_port() {
  # The app moves to the next port when its port is busy, so check a few.
  local first=$1 candidate
  for candidate in $(seq "$first" $((first + 5))); do
    if health "$candidate"; then
      echo "$candidate"
      return 0
    fi
  done
  return 1
}

step "Checking Node.js"
if ! command -v node >/dev/null 2>&1; then
  fail "Node.js is not installed. Download the LTS version from $DOWNLOAD_URL, install it, open a new terminal, and run this script again."
fi
NODE_VERSION=$(node --version)
NODE_MAJOR=$(node -p 'process.versions.node.split(".")[0]')
if [ "$NODE_MAJOR" -lt 20 ]; then
  fail "Node.js $NODE_VERSION is too old. Mumble AI needs version 20 or newer. Install the LTS version from $DOWNLOAD_URL and run this script again."
fi
echo "Found Node.js $NODE_VERSION"
if [ "$NODE_MAJOR" -eq 20 ]; then
  echo "Node.js 20 no longer gets security fixes. It works, but install the LTS version from $DOWNLOAD_URL when you can."
fi
command -v npm >/dev/null 2>&1 || fail "npm was not found. It comes with Node.js. Reinstall Node.js from $DOWNLOAD_URL."

step "Installing packages (npm install)"
npm install --no-audit --no-fund || fail "npm install failed. Read the messages above. Check your internet connection and run this script again."

step "Checking the .env settings file"
if [ -f .env ]; then
  echo ".env already exists. Leaving it as it is."
else
  cp .env.example .env
  echo "Created .env from .env.example."
fi
echo "API keys are optional. Add them in .env or later in the app under Settings."

if [ "$SKIP_TESTS" -eq 1 ]; then
  step "Skipping tests (--skip-tests)"
else
  step "Running tests (npm test)"
  npm test || fail "The tests failed. Read the messages above. Run 'npm test' again after fixing the problem."
fi

if [ "$NO_START" -eq 1 ]; then
  step "Setup finished"
  echo "Start the app later with: npm start"
  exit 0
fi

PORT_VALUE="${PORT:-}"
if [ -z "$PORT_VALUE" ] && [ -f .env ]; then
  PORT_VALUE=$(sed -n 's/^[[:space:]]*PORT[[:space:]]*=[[:space:]]*\([0-9][0-9]*\).*/\1/p' .env | tail -n 1)
fi
PORT_VALUE="${PORT_VALUE:-3050}"

if RUNNING_PORT=$(find_running_port "$PORT_VALUE"); then
  step "Mumble AI is already running"
  echo "Open http://localhost:$RUNNING_PORT"
  exit 0
fi

step "Starting Mumble AI"
node server/index.js &
SERVER_PID=$!
trap 'kill "$SERVER_PID" 2>/dev/null || true' INT TERM EXIT

RUNNING_PORT=""
for _ in $(seq 1 30); do
  sleep 1
  kill -0 "$SERVER_PID" 2>/dev/null || fail "The app stopped right after starting. Read the messages above."
  if RUNNING_PORT=$(find_running_port "$PORT_VALUE"); then
    break
  fi
  RUNNING_PORT=""
done

if [ -z "$RUNNING_PORT" ]; then
  echo "The app did not answer within 30 seconds. Read the messages above for the address it printed."
else
  echo
  echo "Mumble AI is running."
  echo "Open http://localhost:$RUNNING_PORT in Chrome, Edge, or Safari."
  echo "Keep this terminal open while you use it. Press Ctrl+C to stop."
fi

wait "$SERVER_PID"
