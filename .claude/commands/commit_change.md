# Commit Change

Create a git commit following the project's commit message format specified in INSTRUCTIONS.md.

## Instructions

1. **Review Changes**: First, run these commands in parallel:
   - `git status` to see all untracked files
   - `git diff` to see both staged and unstaged changes
   - `git log -5 --oneline` to see recent commit messages

2. **Quality Checks**: Before committing, verify code quality:
   - Run `npm run check` to verify the codebase (it builds first, then formats, lints and type-checks)
   - If check fails, run `npm run fix` to automatically resolve issues
   - Run `npm run test` to ensure the unit and e2e suites pass

3. **Identify the issue**: Find the GitHub issue this commit closes or advances —
   `gh issue list` if it is not already known. The scope is that issue written `#<number>`
   — `"scope": "#4"` — so GitHub links the commit to it. Work with no issue behind it is
   committed without a scope, but that is the exception.

4. **Draft the payload**: komity owns the format; do not hand-write the message. The
   type list, the scope rule, the 100-character subject cap and the `[log]` line are all
   documented in INSTRUCTIONS.md — read it rather than reproducing the list here, because
   a second copy is what let this file drift out of date. `npx komity types` prints the
   live list if there is any doubt.

   **Body**: a few sentences on what the change does and why. Focus on purpose and
   impact, not a restatement of the diff.

   **Changelog**: include `changelog` only when the change is visible to a user. Omit it
   for refactors, test changes and internal moves.

5. **IMPORTANT Restrictions**:
   - DO NOT include AI attribution (no "🤖 Generated with Claude Code")
   - DO NOT include co-author tags (no "Co-Authored-By: Claude")
   - Keep the message concise and professional
   - Focus on the "why" rather than just the "what"

6. **Stage and Commit**:
   - Add the relevant files to the staging area with `git add`
   - Print the assembled message first, without touching the repository:

     ```bash
     npx komity commit --input - <<'JSON'
     {
       "type": "refactor",
       "scope": "#3",
       "subject": "move config locating, reading and parsing into a helper",
       "body": "Why it moved, and what it unblocks."
     }
     JSON
     ```

   - Re-run the same command with `--commit` to create it
   - Run `git status` after the commit to verify success

   komity rejects the payload outright on an unknown type, an empty subject, a subject
   over 100 characters, or a `changelog` containing a newline. It never truncates, so a
   rejection means fixing the payload, not retrying.

7. **Handle Pre-commit Hooks**: If the commit fails due to pre-commit hook changes:
   - Check authorship: `git log -1 --format='%an %ae'`
   - Check if pushed: `git status` should show "Your branch is ahead"
   - If both are true: amend the commit
   - Otherwise: create a NEW commit (never amend other developers' commits)

8. **Commit Organization**: Group related changes into logical commits:
   - Single feature/fix: One commit with all related files
   - Multiple unrelated changes: Create separate commits for each logical change
   - Don't separate a feature from its tests
   - Don't split configuration changes that are related

## Notes

- DO NOT push to remote unless explicitly requested
- Avoid using `git commit -i` or other interactive flags
- `komity commit` with no `--input` prompts interactively and requires a TTY; it is not
  usable from an agent
- If there are no changes, do not create an empty commit
- Always verify that quality checks pass before committing
