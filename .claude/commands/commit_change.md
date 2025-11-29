# Commit Change

Create a git commit following the project's commit message format specified in INSTRUCTIONS.md.

## Instructions

1. **Review Changes**: First, run these commands in parallel:
   - `git status` to see all untracked files
   - `git diff` to see both staged and unstaged changes
   - `git log -5 --oneline` to see recent commit messages

2. **Quality Checks**: Before committing, verify code quality:
   - Run `npm run check` to verify the codebase (formatting, linting, type-checking)
   - If check fails, run `npm run fix` to automatically resolve issues
   - Run `npm run build` to ensure all workspaces build successfully
   - Run `npm run test` if applicable to ensure tests pass

3. **Draft Commit Message**: Analyze the changes and draft a commit message using this format:

   ```
   <type>: <description>

   <body>
   ```

   **Types**:
   - `feat`: New end-user functionality or features
   - `ui`: User interface changes (layout, styling, components)
   - `ux`: User experience changes (interactions, flow improvements)
   - `fix`: Bug fixes for end-user issues
   - `maintenance`: Non-behavioral changes (scripts, configs, tooling)
   - `dep`: Dependency updates (add, remove, update packages)
   - `docs`: Documentation changes
   - `refactor`: Code restructuring without behavior change
   - `test`: Test-related changes

   **Body**: 1-3 sentences describing what the changes do and why. Focus on the purpose and impact, not just what was changed.

4. **IMPORTANT Restrictions**:
   - DO NOT include AI attribution (no "🤖 Generated with Claude Code")
   - DO NOT include co-author tags (no "Co-Authored-By: Claude")
   - Keep the message concise and professional
   - Focus on the "why" rather than just the "what"

5. **Stage and Commit**:
    - Add relevant untracked files to the staging area with `git add`
    - Write the commit message to `.git/COMMIT_EDITMSG`:
      ```bash
      echo "<type>: <description>

      <body>" > .git/COMMIT_EDITMSG
      ```
    - Create the commit (Git will automatically use the message file):
      ```bash
      git commit
      ```
    - Run `git status` after the commit to verify success

6. **Handle Pre-commit Hooks**: If the commit fails due to pre-commit hook changes:
   - Check authorship: `git log -1 --format='%an %ae'`
   - Check if pushed: `git status` should show "Your branch is ahead"
   - If both are true: amend the commit
   - Otherwise: create a NEW commit (never amend other developers' commits)

7. **Commit Organization**: Group related changes into logical commits:
   - Single feature/fix: One commit with all related files
   - Multiple unrelated changes: Create separate commits for each logical change
   - Don't separate a feature from its tests
   - Don't split configuration changes that are related

## Examples

```
feat: add user authentication flow

Implemented JWT-based authentication with login/logout endpoints and middleware for protected routes.
```

```
fix: resolve navigation routing issue

Fixed a bug where navigation links were not updating the URL correctly in nested routes.
```

```
maintenance: add test scripts to package.json

Added npm scripts for running tests in different modes to improve developer workflow.
```

## Notes

- DO NOT push to remote unless explicitly requested
- Avoid using `git commit -i` or other interactive flags
- If there are no changes, do not create an empty commit
- Always verify that quality checks pass before committing
