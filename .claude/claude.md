# Miyabi Project Instructions

## Project Overview

This is a Miyabi autonomous development framework project. Miyabi provides AI-driven development automation including agent execution, GitHub integration, Firebase deployment, and autonomous issue management.

## Environment Configuration

Environment variables are configured in `.env`:
- `ANTHROPIC_API_KEY`: Claude API key for AI agent execution
- `GITHUB_TOKEN`: GitHub Personal Access Token for repository operations
- Firebase configuration for deployment
- GitHub repository settings

## Available Commands

### Core Commands
- `npx miyabi init <project-name>` - Create new Miyabi project
- `npx miyabi install` - Add Miyabi to existing project
- `npx miyabi status` - Check project status
- `npx miyabi doctor` - System health check

### Agent Commands
- `npx miyabi agent` - Agent execution and management
- `npx miyabi auto` - Full autonomous mode (Water Spider Agent)
- `npx miyabi todos` - Auto-detect TODO comments and create Issues

### Configuration
- `npx miyabi config` - Manage configuration
- `npx miyabi auth` - GitHub authentication management
- `npx miyabi setup` - Setup guide

### Documentation
- `npx miyabi docs` - Generate documentation

## Development Guidelines

### Working with Miyabi
- Always load environment variables from `.env`
- Use `npx miyabi` commands for project operations
- Leverage autonomous agents for repetitive tasks
- Use `--json` flag for programmatic access
- Use `-y` flag for non-interactive mode

### Best Practices
- Keep `.env` file secure and never commit it
- Use `miyabi status` to check project health
- Let agents handle GitHub Issue management
- Use `miyabi doctor` when troubleshooting
