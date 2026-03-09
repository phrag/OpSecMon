# OpSecMon

**Cybersecurity Operations & OSINT Dashboard** — Real-time threat intelligence, vulnerability tracking, and security monitoring in a unified situational awareness interface.

[![License: AGPL v3](https://img.shields.io/badge/License-AGPL%20v3-blue.svg)](https://www.gnu.org/licenses/agpl-3.0)
[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=flat&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Upstream](https://img.shields.io/badge/Upstream-World_Monitor-blue?style=flat)](https://github.com/koala73/worldmonitor)

---

## Upstream Project

<table>
<tr>
<td width="80"><img src="https://worldmonitor.app/favico/android-chrome-192x192.png" width="64" alt="World Monitor"></td>
<td>
<strong>OpSecMon is a fork of <a href="https://github.com/koala73/worldmonitor">World Monitor</a></strong><br>
Created by <strong><a href="https://github.com/koala73">Elie Habib</a></strong> (<a href="https://x.com/eliehabib">@eliehabib</a>)<br><br>
World Monitor is an incredible open-source global intelligence dashboard with real-time news aggregation, geopolitical monitoring, and infrastructure tracking. This fork refocuses the platform on cybersecurity and OSINT use cases.<br><br>
<a href="https://github.com/koala73/worldmonitor">View Original Project</a> · <a href="https://worldmonitor.app">Live Demo</a> · <a href="https://github.com/koala73/worldmonitor/stargazers">⭐ Star the Original</a>
</td>
</tr>
</table>

---

## Why OpSecMon?

| Problem | Solution |
|---------|----------|
| Threat intel scattered across dozens of sources | **Unified dashboard** with CVEs, ransomware groups, breaches, and IOCs in one view |
| No geospatial context for cyber events | **Interactive map** with threat actor origins, targeted infrastructure, and attack vectors |
| Alert fatigue from noisy feeds | **AI-powered filtering** with severity scoring and deduplication |
| Expensive commercial SIEM/SOAR tools | **100% free & open source** |
| Cloud-dependent security tools | **Run locally** with Ollama — no data leaves your network |
| Delayed vulnerability awareness | **Real-time CVE tracking** with NVD integration and CVSS scoring |

---

## Key Features

### Threat Intelligence

- **CVE Tracking** — Real-time vulnerability feed from NVD with CVSS scoring, severity filtering, and affected product search
- **Ransomware Monitoring** — Track active ransomware groups, recent victims, and attack patterns
- **Breach Intelligence** — Monitor data breaches with timeline analysis and sector targeting
- **IOC Feeds** — Feodo Tracker, URLhaus, AlienVault OTX, AbuseIPDB integration

### OSINT Collection

- **GDELT Intel Panel** — Real-time news across cyber, military, intelligence, and sanctions topics
- **Security RSS Feeds** — Curated feeds from SecurityWeek, BleepingComputer, Dark Reading, The Hacker News, and more
- **CISA Advisories** — Critical infrastructure alerts and emergency directives

### Maps & Visualization

- **Dual Map Engine** — 3D globe and WebGL flat map with toggleable threat layers
- **Infrastructure Mapping** — Datacenters, undersea cables, cloud regions, and critical infrastructure
- **Attack Visualization** — Geographic display of threat origins and targets

### AI & Analysis

- **Threat Summarization** — LLM-powered briefs with 4-tier fallback: Ollama (local) → Groq → OpenRouter → browser T5
- **Headline Memory (RAG)** — Browser-local semantic index for historical threat correlation
- **Threat Classification** — Automatic categorization with keyword + ML + LLM pipeline

### Desktop & Deployment

- **Native Desktop App** — Tauri-based app for macOS, Windows, and Linux with OS keychain integration
- **Progressive Web App** — Installable with offline support
- **Self-Hostable** — Run entirely on your infrastructure

---

## Quick Start

```bash
git clone https://github.com/phrag/OpSecMon.git
cd OpSecMon
npm install
npm run dev:cyber    # Cyber-focused variant
```

Open [http://localhost:5173](http://localhost:5173)

For full API functionality (threat feeds, AI summaries):

```bash
npm install -g vercel
vercel dev           # Runs frontend + edge functions
```

### Environment Variables

Copy the example file and add your API keys:

```bash
cp .env.example .env.local
```

| Group | Variables | Purpose |
|-------|-----------|---------|
| **AI (Local)** | `OLLAMA_API_URL`, `OLLAMA_MODEL` | Local LLM for summaries |
| **AI (Cloud)** | `GROQ_API_KEY`, `OPENROUTER_API_KEY` | Cloud LLM fallback |
| **Cache** | `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | Response caching |
| **Threat Intel** | `NVD_API_KEY` | NVD CVE API (optional, higher rate limits) |

The dashboard works without API keys — panels for unconfigured services simply won't appear.

---

## Data Sources

### Vulnerability & Threat Data

| Source | Data Type | Update Frequency |
|--------|-----------|------------------|
| NVD (NIST) | CVEs, CVSS scores | Real-time |
| abuse.ch | Feodo Tracker, URLhaus | Hourly |
| AlienVault OTX | IOCs, threat pulses | Real-time |
| AbuseIPDB | Malicious IP reports | Real-time |

### News & OSINT Feeds

| Category | Sources |
|----------|---------|
| Security News | SecurityWeek, BleepingComputer, Dark Reading, The Hacker News, Krebs on Security |
| Government | CISA, US-CERT, NCSC, ENISA |
| Research | Google Project Zero, Microsoft Security, Mandiant |
| Community | Reddit r/netsec, Hacker News |

### Geopolitical Context

| Source | Data Type |
|--------|-----------|
| GDELT | Global event monitoring |
| ACLED | Conflict tracking |
| Cloudflare Radar | Internet traffic anomalies |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     OpSecMon Frontend                       │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │ Threat Feeds│  │ OSINT Panel │  │ Map Visualization   │  │
│  └─────────────┘  └─────────────┘  └─────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────┐
│                    Edge Functions (60+)                     │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │ CVE Proxy   │  │ RSS Aggreg. │  │ AI Summarization    │  │
│  └─────────────┘  └─────────────┘  └─────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────┐
│                    External APIs                            │
│  NVD · abuse.ch · GDELT · ACLED · RSS Feeds · LLM APIs     │
└─────────────────────────────────────────────────────────────┘
```

### Tech Stack

| Category | Technologies |
|----------|--------------|
| **Frontend** | Vanilla TypeScript, Vite, deck.gl, MapLibre GL, globe.gl |
| **Desktop** | Tauri 2 (Rust), OS keychain integration |
| **AI/ML** | Ollama, Groq, Transformers.js (browser-side) |
| **Caching** | Redis (Upstash), Service Worker |
| **APIs** | Protocol Buffers, auto-generated TypeScript clients |
| **Deployment** | Vercel Edge Functions, Tauri desktop, PWA |

---

## Development

```bash
# Development
npm run dev          # Default variant
npm run dev:cyber    # Cyber-focused variant

# Type checking
npm run typecheck
npm run typecheck:all

# Build
npm run build
npm run build:cyber

# Desktop
npm run desktop:dev
npm run desktop:build:full
```

---

## Self-Hosting

### Option 1: Vercel (Recommended)

```bash
npm install -g vercel
vercel
```

Add API keys in Vercel dashboard under **Settings → Environment Variables**.

### Option 2: Local with Vercel CLI

```bash
cp .env.example .env.local
vercel dev
```

### Option 3: Static Frontend Only

```bash
npm run dev
```

Map and static layers work; API-dependent panels won't load.

---

## Security

| Layer | Mechanism |
|-------|-----------|
| CORS | Origin allowlist enforcement |
| API Keys | Server-side only, never exposed to browser |
| Input Sanitization | XSS prevention via `escapeHtml()` |
| Rate Limiting | Redis-backed IP rate limiting |
| Desktop | OS keychain for credential storage |

---

## Contributing

Contributions welcome! Please:

1. Fork the repository
2. Create a feature branch
3. Run `npm run typecheck` before submitting
4. Open a pull request

---

## License

**GNU Affero General Public License v3.0 (AGPL-3.0)** — see [LICENSE](LICENSE).

You are free to use, modify, and distribute this software. If you run a modified version as a network service, you must provide the source code to users.

Original World Monitor code: Copyright (C) 2024-2026 Elie Habib. All rights reserved under AGPL-3.0.

---

## Acknowledgments

### World Monitor & Elie Habib

This project would not exist without [**World Monitor**](https://github.com/koala73/worldmonitor), created by [**Elie Habib**](https://github.com/koala73) ([@eliehabib](https://x.com/eliehabib)). The original project is an impressive feat of engineering — a real-time global intelligence dashboard built with vanilla TypeScript, featuring dual map engines, 60+ edge functions, AI-powered analysis, and support for 21 languages.

We are deeply grateful for Elie's decision to open-source World Monitor under the AGPL-3.0 license, enabling projects like OpSecMon to build upon this foundation.

**Please consider [starring the original repository](https://github.com/koala73/worldmonitor) to show your support.**

### Data Sources

- **NVD/NIST** — Vulnerability data and CVSS scoring
- **abuse.ch** — Feodo Tracker and URLhaus threat intelligence
- **GDELT Project** — Global event monitoring
- **The open-source security community**

---

<p align="center">
  <strong>OpSecMon</strong> — Open-source security operations monitoring<br>
  <sub>A fork of <a href="https://github.com/koala73/worldmonitor">World Monitor</a> by <a href="https://github.com/koala73">Elie Habib</a></sub>
</p>
