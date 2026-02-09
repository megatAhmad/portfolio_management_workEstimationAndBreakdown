# AI-Ops Task Architect

A project scoping tool that converts high-level feature requests into granular, resource-aware execution plans. Bridges LLM brainstorming and deterministic project management (Gantt/Sprints).

## Architecture

```
backend/          FastAPI server — AI decomposition, scheduling, validation
  app/
    api/          REST endpoints (decompose, schedule, validate)
    core/         Configuration
    models/       Pydantic data models
    services/     AI decomposer, scheduler, graph validator
  tests/          Backend unit tests

frontend/         React + TypeScript — Interactive task visualization
  src/
    api/          HTTP client for backend
    components/   PromptInput, TeamSidebar, TaskDAG, GanttView, ViewToggle
    store/        Zustand state management
    types/        TypeScript type definitions
```

## Tech Stack

- **Frontend:** React 19, React Flow (DAG editor), Frappe Gantt (timelines), Zustand (state)
- **Backend:** FastAPI, Pydantic v2
- **AI:** Anthropic Claude / OpenAI GPT-4o (configurable)

## Setup

### Backend

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # Add your API keys
uvicorn app.main:app --reload
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

The frontend runs on `http://localhost:5173` and the backend on `http://localhost:8000`.

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/v1/decompose` | AI-powered task decomposition |
| POST | `/api/v1/schedule` | Decompose + schedule into sprints |
| POST | `/api/v1/schedule-from-tasks` | Schedule existing tasks (no AI) |
| POST | `/api/v1/validate` | Validate task graph constraints |
| GET | `/health` | Health check |

## Features

- **Contextual Task Decomposition:** Natural language to structured JSON task tree via LLM
- **Interactive DAG View:** React Flow node editor — drag to create dependencies, double-click to edit hours, right-click to delete
- **Resource-Aware Scheduling:** Team capacity calculation with configurable safety buffer (default 20%)
- **Sprint Planner:** Auto-overflow logic — tasks exceeding 80% capacity push to next sprint
- **Gantt Chart:** Timeline visualization with Frappe Gantt
- **Validation:** Circular dependency detection, dependency reference checks, total hours summation

## Running Tests

```bash
cd backend
pip install pytest
pytest
```
