# ClaudeTorio Dashboard

Real-time monitoring dashboard for Factorio automation powered by Claude AI agents.

## Overview

ClaudeTorio is an AI-driven Factorio automation system where Claude agents play the game autonomously. This dashboard provides real-time visibility into:

- Factory metrics and production rates
- Agent actions and decisions
- Resource flow and logistics
- Research progress

## Structure

```
claudetorio/
├── dashboard/
│   ├── server.py    # FastAPI dashboard server
│   └── index.html   # Dashboard UI
├── .github/
│   └── workflows/
│       └── deploy.yml
└── README.md
```

## Deployment

The dashboard auto-deploys to production when changes are pushed to `main`.

### Workflow

1. Develop on `dev` branch
2. Test changes locally
3. Merge to `main` for deployment
4. GitHub Actions deploys via SSH

## Local Development

```bash
cd dashboard
pip install aiohttp aiofiles
python server.py
```

Dashboard runs at http://localhost:8080

## License

MIT
