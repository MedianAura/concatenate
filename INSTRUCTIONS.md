# AI Instructions

This file provides guidance to AI assistants working with this codebase.

**For project documentation**, see [README.md](./README.md) for complete details on:

- Project structure and workspaces
- Development commands and workflows
- Architecture and tech stack
- Build and deployment

## AI-Specific Guidelines

### Working with This Codebase

#### File Organization

When exploring or searching, avoid these directories (they're build artifacts or dependencies):

- `node_modules/`, `dist/`, `storybook-static/`, `playwright-report/`, `test-results/`, `.turbo/`

#### Code Style & Conventions

- **TypeScript**: Strict mode is enabled across all workspaces
- **Vue Components**: Use Composition API with `<script setup>` syntax
- **Code Verification**: Run `npm run check` to verify the entire codebase. This command bundles several checks, including formatting, linting, and type-checking.
- **Auto-Fixing**: To automatically fix formatting and linting errors, run `npm run fix`.
- **Testing**: Execute Playwright tests with `npm run test`
- **package.json Formatting**: When modifying any package.json file, ALWAYS run `npx sort-package-json <path-to-package.json>` to maintain alphabetical ordering of scripts and dependencies

#### Commit Message Format

Commits are written by [komity](https://github.com/MedianAura/komity), not by hand.
It owns the format, so this section describes it rather than defining it — when the
two disagree, komity wins. `npx komity types` prints the live list.

```
<type>(<issue>): <subject>

<body>

[log] <changelog entry>
```

**Scope is the GitHub issue reference, written `#<number>`** — `refactor(#4):` — and it
must be the issue the work actually closes or advances. The `#` is what GitHub's issue
tracker matches on, so the commit shows up against the issue automatically. A commit
with no scope is one nothing can trace. Omit it only for work that has no issue.

> Known trade-off: komity's own changelog generator reads the scope back with
> `/\((\w+-\d+|\d+)?\)/`, which does not match a `#`. `refactor(#4)` yields no task tag
> in the generated changelog where `refactor(4)` would yield `[4]`. GitHub linkage wins —
> it is the one people follow — and the changelog entry still renders, just without the
> tag.

`<subject>` is capped at **100 characters** — komity rejects the commit, it does not
truncate. `<body>` explains what and why in a few sentences.

The `[log]` line is optional and separate from `<body>` on purpose: the body is for
archaeology, the log line is the one sentence a user reads in the changelog. Omit it
for work with no user-visible effect — refactors, test changes, internal moves.

**Types** — canonical form on the left, aliases komity accepts on input and rewrites
on output. Writing `feat:` produces `feature:` in the history, so prefer the canonical
spelling and keep the history uniform.

| Type          | Aliases                | Use for                                    |
| ------------- | ---------------------- | ------------------------------------------ |
| `feature`     | `feat`                 | New end-user functionality                 |
| `fix`         |                        | Bug fixes for end-user issues              |
| `style`       |                        | User interface or user experience changes  |
| `refactor`    |                        | Restructuring with no behaviour change     |
| `perf`        |                        | Changes that improve performance           |
| `maintenance` | `chore`, `ci`, `build` | Non-behavioural: scripts, configs, tooling |
| `doc`         | `docs`                 | Documentation only                         |
| `test`        |                        | Adding or correcting tests                 |
| `dep`         | `deps`                 | Dependency add, remove or update           |

There is no `ui` or `ux` type — komity rejects both outright. Use `style`, which is
what they were.

DO NOT include AI attribution or co-author tags.

**Writing one.** Stage the files, then hand komity a JSON payload. Without `--commit`
it only prints the assembled message, which is the way to check it before it lands:

```bash
git add <files>
npx komity commit --input - <<'JSON'
{
  "type": "refactor",
  "scope": "#3",
  "subject": "move config locating, reading and parsing into a helper",
  "body": "Why it moved, and what it unblocks.",
  "changelog": "Optional single line, omitted for internal work."
}
JSON
```

Re-run with `--commit` to create it. `komity commit` with no `--input` prompts
interactively and requires a TTY.

#### Commit Organization

**ALWAYS group related changes together into logical commits**:

- **Single feature/fix**: One commit with all related files
- **Multiple unrelated changes**: Create separate commits for each logical change
- **Documentation vs code**: Separate docs changes from functional changes
- **Configuration vs features**: Separate config updates from feature implementations

**Examples of proper grouping**:

- Updating a component + its tests + its Storybook story = **one commit**
- Updating README + adding new documentation files = **one commit**
- Fixing a bug + updating tests for that bug = **one commit**
- Updating package.json + fixing build configuration = **one commit**
- Adding a new feature + updating documentation = **two separate commits**

**Avoid splitting**:

- Don't separate a feature from its tests
- Don't split configuration changes that are related
- Don't create multiple commits for the same logical change

### Tool Usage

- Use the Read tool before making any file modifications
- Prefer Edit over Write for existing files
- Use Grep for content search, Glob for file pattern matching
- Use Task tool with specialized agents for complex searches

### Workflow

1. Read relevant files first to understand context
2. Check INSTRUCTIONS.md for AI-specific guidelines
3. Reference README.md for project structure and commands
4. Make focused changes without over-engineering
5. Run quality checks before committing (see INSTRUCTIONS.md)

### Development Workflow

#### Before Making Changes

1. Read the relevant files first (use Read tool)
2. Understand existing patterns and architecture

#### When Implementing Features

1. Follow existing patterns in the codebase
2. Maintain TypeScript strict mode compliance

#### Before Committing

- [ ] Run `npm run check` (no errors)
- [ ] Run `npm run build` (all workspaces build successfully)
- [ ] Run `npm run test` if applicable (tests pass)
- [ ] If `npm run check` fails, try running `npm run fix` to automatically resolve issues.

### Code Quality Standards

#### Avoid Over-Engineering

- Only make changes that are directly requested or clearly necessary
- Don't add features beyond what was asked
- Don't add error handling for scenarios that can't happen
- Don't create abstractions for one-time operations
- Keep solutions simple and focused

#### Security Considerations

- Avoid common vulnerabilities (XSS, SQL injection, command injection, etc.)
- Validate at system boundaries (user input, external APIs)
- Trust internal code and framework guarantees

#### TypeScript Best Practices

- Use proper typing (avoid `any`)

### Testing Guidelines

#### Test Commands

```bash
npm run test           # Run all tests
```
