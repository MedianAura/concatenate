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

Refer to the type listed below (DO NOT include AI attribution or co-author tags):

```
<type>: <description>

<body>
```

Where `<body>` is a brief explanation of what the commit does and why. It should be 1-3 sentences describing the changes and their purpose.

Common types: `feat`, `ui`, `ux`, `fix`, `maintenance`, `dep`, `docs`, `refactor`, `test`

**Type Definitions**:

- `feat`: New end-user functionality or features
- `ui`: User interface changes (layout, styling, components)
- `ux`: User experience changes (interactions, flow improvements)
- `fix`: Bug fixes for end-user issues
- `maintenance`: Non-behavioral changes (scripts, configs, tooling)
- `dep`: Dependency updates (add, remove, update packages)
- `docs`: Documentation changes
- `refactor`: Code restructuring without behavior change
- `test`: Test-related changes

Examples:

- `feat: add user authentication flow

  Implemented JWT-based authentication with login/logout endpoints and middleware for protected routes.`

- `ui: update button styling and layout

  Updated button components with new design system colors and improved accessibility.`

- `ux: improve form validation feedback

  Enhanced form validation to show real-time feedback and clearer error messages.`

- `fix: resolve navigation routing issue

  Fixed a bug where navigation links were not updating the URL correctly in nested routes.`

- `maintenance: add test scripts to package.json

  Added npm scripts for running tests in different modes to improve developer workflow.`

- `dep: update PrimeVue to latest version

  Updated PrimeVue from v3.15 to v3.20 to include new components and bug fixes.`

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
