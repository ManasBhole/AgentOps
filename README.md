# Orion — AI Agent Observability Platform

> Control plane for AI-powered operations. Observe, debug, and optimize every AI agent in production.

🌐 **Live Demo:** [orion-ai-dashboard.vercel.app](https://orion-ai-dashboard.vercel.app)

**Login:** `manasbhole2000@gmail.com` / `Usa@2021`

---

## What is Orion?

Orion is a full-stack observability and operations platform for AI agents — think Datadog, but purpose-built for LLM-powered systems.

## Features

| Category | Capabilities |
|----------|-------------|
| **Observe** | Real-time agent traces, incident detection, security monitoring |
| **Operate** | Orchestration, deployments, SLO tracking |
| **Analyze** | Cost analytics, budget intelligence, NL queries, NEXUS correlation |
| **Resilience** | Chaos engineering, blast radius simulation, time-travel debugger, alert correlation |
| **Insights** | Genome drift detection, flame graphs, cost allocation, audit log |
| **Dev** | Agent playground, prompt management, eval framework |

## Stack

- **Frontend:** React + TypeScript + Vite + Tailwind CSS
- **Backend:** Go (Gin) + PostgreSQL + GORM
- **Auth:** JWT (access + refresh tokens)
- **Realtime:** Server-Sent Events (SSE)

## Local Development

```bash
# Backend
cd api && go run .

# Frontend
cd dashboard && npm install && npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

## Environment Variables

See [`.env.example`](.env.example) for all required variables.

---

Built with ❤️ by [Manas Bhole](https://github.com/ManasBhole)
