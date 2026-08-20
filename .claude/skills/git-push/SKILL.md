---
name: git-push
description: Automate the full git pull-add-commit-push workflow. Pulls from remote, stages all changes, auto-generates a brief conventional commit message by analyzing the diff, and pushes to the current branch. Use when the user says "git push", "push my changes", "commit and push", "save and push", "pull and push", "sync", "git sync", "/git-push", or wants to quickly ship their current work to the remote. Also trigger on "push it", "send it up", "deploy my changes", or any variation of pulling, committing, and pushing code.
---

# Git Push — Pull, Add, Commit & Push

Automate `git pull → git add . → git commit → git push` with an intelligent, auto-generated commit message.

## Workflow

### Step 1: Pull from Remote

Sync with the remote before staging:

```bash
git pull
```

If the pull fails due to merge conflicts, report the conflicts to the user and stop. Do not auto-resolve.

If the pull reports "Already up to date," continue normally.

### Step 2: Stage All Changes

Run `git add .` to stage everything.

**Before staging, check for sensitive files.** If `.env`, `credentials.json`, `credentials.ini`, or other secret files appear in `git status`, warn the user and exclude them.

### Step 3: Analyze the Diff

Run these commands in parallel to gather context:

- `git diff --cached --stat` — summary of files changed
- `git diff --cached` — full diff content (read first ~200 lines if massive)
- `git branch --show-current` — current branch name
- `git log --oneline -5` — recent commits for style reference

### Step 4: Generate the Commit Message

Analyze the staged diff and write a **brief, descriptive** commit message using conventional commit format:

**Format:** `<type>: <short description>`

| Type | When to use |
|------|-------------|
| `feat` | New feature or functionality added |
| `fix` | Bug fix |
| `update` | Enhancement to existing feature |
| `refactor` | Code restructuring without behavior change |
| `docs` | Documentation only |
| `style` | Formatting, whitespace, missing semicolons |
| `chore` | Build scripts, config, dependencies |
| `test` | Adding or updating tests |

**Rules for the message:**
- Keep it under 72 characters
- Describe WHAT changed, not HOW — the diff shows the how
- If multiple types of changes exist, use the dominant one
- If many files changed across categories, summarize: `update: improve homepage styling and fix mobile nav`
- End with `Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>`

**Examples:**
```
feat: add Stripe checkout integration for pro plan
fix: resolve mobile nav hamburger menu not opening
update: improve biomarker report PDF formatting
refactor: extract shared auth logic into middleware
chore: update dependencies and fix lint warnings
docs: add API endpoint documentation to README
```

### Step 5: Commit

Run the commit using a HEREDOC for proper formatting:

```bash
git commit -m "$(cat <<'EOF'
<type>: <description>

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

### Step 6: Push to Current Branch

Use the branch name detected in Step 3:

```bash
git push -u origin <current-branch>
```

If the push fails because the remote branch doesn't exist yet, the `-u` flag handles that. If it fails for another reason (e.g., diverged history), report the error to the user — never force push without explicit permission.

### Step 7: Confirm

Tell the user:
- What was committed (brief summary)
- The commit message used
- Which branch it was pushed to
- The push result (success or any issues)

## Edge Cases

- **No changes to commit:** If `git status` shows nothing to stage after pulling, tell the user "Nothing to commit — working tree is clean." and stop.
- **Pull conflicts:** If `git pull` results in merge conflicts, list the conflicting files and stop. Do not stage or commit.
- **Sensitive files:** Before staging, check if `.env`, `credentials`, or secret files are being added. Warn the user and exclude them if found.
- **Large diffs:** If the diff is enormous (100+ files), summarize by directory/category rather than listing every file.
- **Merge conflicts:** If there are unresolved conflicts, tell the user and stop — don't try to auto-resolve.
