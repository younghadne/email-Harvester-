# Email Harvester — Pro Lead Discovery Platform

High-speed email harvester and lead discovery platform with quality scoring, seed crawling, search backends, and live SQLite database persistence.

## Features
- **Categories Mode**: Search the web by topic or keyword (Google News RSS, DuckDuckGo, Bing fallback).
- **Seed URLs Mode**: Direct contact page traversal (includes 35+ rap & hip-hop submission blogs).
- **Custom Queries & Dorks**: Verbatim Google dork syntax (`site:`, `inurl:contact`, `intext:"@gmail.com"`).
- **High-Speed Concurrency**: Parallel worker pool scanning multiple sites simultaneously.
- **DNS MX Deliverability Check**: Resolves live MX mail server records on the fly with in-memory caching.
- **Persistent SQLite Database**: Automatically auto-saves every email to disk in real-time as it is found.
- **Clean & Purge Tools**: 1-click removal of junk tracking tokens, error beacons, and off-niche addresses.
- **1-Click Export**: Save to CSV or Excel (.xlsx) anytime.

## Quick Start (Web App)
```bash
npm install
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

## Quick Start (Python Desktop App)
```bash
pip install -r requirements.txt
python3 harvester_app.py
```
Or run:
```bash
chmod +x run.sh && ./run.sh
```
