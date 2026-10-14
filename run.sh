#!/usr/bin/env bash
# Email Harvester launcher
echo "=========================================="
echo " Starting Email Harvester..."
echo "=========================================="

if command -v node >/dev/null 2>&1 && command -v npm >/dev/null 2>&1; then
  echo "Node.js detected. Launching full-stack web application on http://localhost:3000..."
  npm install
  npm run dev
elif command -v python3 >/dev/null 2>&1; then
  echo "Python3 detected. Launching desktop application..."
  pip install -r requirements.txt
  python3 harvester_app.py
else
  echo "Please install Node.js (v18+) or Python 3 to run Email Harvester."
  exit 1
fi
