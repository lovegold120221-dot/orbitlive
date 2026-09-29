---
name: GitHub CLI
description: Use gh CLI for GitHub repos, issues, PRs, releases. Auth is preconfigured via gh auth.
---

# GitHub CLI Skill

Use `gh` for all GitHub operations on this project. Auth is already configured via `gh auth login` (token stored in `~/.config/gh/hosts.yml`, never in this repo).

## Preflight

1. Run `gh auth status` to confirm login as `lovegold120221-dot`.
2. If auth is missing, ask the user for a PAT — never invent one, never print an existing one.
3. Target repo is `lovegold120221-dot/orbitlive` unless the user says otherwise.

## Safe Auth Pattern

```sh
# verify only (does not print token)
gh auth status

# login (user supplies PAT via stdin, never as CLI arg in logs)
printf '%s' "$GITHUB_TOKEN" | gh auth login --with-token
```

Rules:
- Never `echo $TOKEN`, never `cat ~/.config/gh/hosts.yml`, never write a PAT into a file in this repo.
- Never commit `hosts.yml`, `.env.deploy`, or any `*.local` file.
- For git push/pull prefer `gh`-authenticated https or the existing `orbitlive` remote.

## Common Workflows

```sh
# repo info
gh repo view lovegold120221-dot/orbitlive --json name,url,defaultBranchRef

# issues
gh issue list -R lovegold120221-dot/orbitlive --limit 20
gh issue create -R lovegold120221-dot/orbitlive --title "<title>" --body "<body>"

# pull requests
gh pr list -R lovegold120221-dot/orbitlive --limit 20
gh pr create -R lovegold120221-dot/orbitlive --title "<title>" --body "<body>" --base main --head <branch>

# releases
gh release list -R lovegold120221-dot/orbitlive --limit 10

# run in this checkout (working dir is repo root)
gh repo sync
```

## Notes

- Paths in this skill are relative to `.opencode/skills/gh/`.
- This skill contains no secrets by design. If you need a new PAT, have the user rotate it at GitHub Settings > Developer settings > Personal access tokens.
