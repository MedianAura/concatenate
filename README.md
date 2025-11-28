# Concatenate

A powerful CLI tool for executing multiple commands in series or parallel workflows. Perfect for automating your development tasks like linting, formatting, testing, and building.

[![Version](https://img.shields.io/npm/v/@medianaura/concatenate.svg)](https://npmjs.org/package/@medianaura/concatenate)
[![Downloads/week](https://img.shields.io/npm/dw/@medianaura/concatenate.svg)](https://npmjs.org/package/@medianaura/concatenate)
[![Commitizen friendly](https://img.shields.io/badge/commitizen-friendly-brightgreen.svg)](http://commitizen.github.io/cz-cli/)

## Table of Contents

- [What is Concatenate?](#what-is-concatenate)
- [Installation](#installation)
- [How It Works](#how-it-works)
- [Quick Start](#quick-start)
- [Configuration](#configuration)
- [Commands](#commands)
- [Examples](#examples)
- [Troubleshooting](#troubleshooting)

## What is Concatenate?

Concatenate is a task orchestration tool that allows you to define and run multiple command-line tasks. You define your workflows in clean YAML or JSON configuration files, eliminating the need for complex bash or npm script chains. Concatenate supports two primary execution modes:

## Installation

### As a Project Dependency (Recommended)

```bash
npm install --save-dev @medianaura/concatenate
```

Then use via npm scripts or npx:

```bash
# Via npx
npx concatenate fix

# Via npm script (add to package.json)
npm run fix
```

**Note on Usage**: While `npx` is useful for one-off executions or when the command isn't in `package.json`, `npm run` is generally preferred for consistency and easier management of scripts defined in your `package.json` file.

### Global Installation

```bash
npm install -g @medianaura/concatenate
```

Then use directly:

```bash
concatenate fix
```

**npm Scripts Integration**:
For better integration into your project's workflow, add concatenate commands to your `package.json` scripts:

```json
{
  "scripts": {
    "fix": "concatenate fix",
    "check": "concatenate check",
    "ci": "concatenate ci"
  }
}
```

**Requirements**: Node.js >= 18.0.0

## How It Works

1. **Configuration Files**: Create `.yaml` or `.json` files in a `.concatenate/` folder at your project root
2. **Define Actions**: Each file defines a workflow with a `type` (series/parallel) and a list of `actions`
3. **Execute**: Run `concatenate <filename>` to execute the workflow

### Execution Modes

**Series Mode** (`type: series`)

- Tasks execute sequentially in the order defined. Use this mode when commands have dependencies on each other's output.
- **Stops immediately** if any task fails (exit code ≠ 0).
- Subsequent tasks are not executed after a failure.
- Best for dependent tasks (e.g., build → test → deploy).

**Parallel Mode** (`type: parallel`)

- All tasks start simultaneously. Use this mode to speed up workflows by running independent checks concurrently.
- **All tasks run to completion** regardless of individual failures.
- Results are collected from all tasks.
- Errors are aggregated and displayed at the end.
- Best for independent tasks (e.g., multiple linters, multiple test suites).

## Quick Start

### 1. Generate Default Configuration Files

```bash
npx concatenate setup
```

This creates a `.concatenate/` folder with example configuration files:

- `fix.yaml` - Auto-fix code issues (runs in series)
- `check.yaml` - Check code quality (runs in parallel)

### 2. Run a Configuration

```bash
# Run a specific configuration file
npx concatenate fix

# Or check code quality
npx concatenate check

# Interactive mode: select from available configs
npx concatenate
```

### What You'll See

When running a configuration, you'll see a real-time task list with progress indicators:

```
Welcome to Concatenate CLI
Running file: fix

✔ Fixing with Prettier
✔ Fixing with ESLint
```

In parallel mode, all tasks run simultaneously:

```
Welcome to Concatenate CLI
Running file: check

✔ Checking with ESLint
✔ Checking with Prettier
✔ Checking with TSC
```

If a task fails, detailed error output is shown at the end.

## Configuration

Configuration files must be placed in a `.concatenate/` directory at your **project root** (where `package.json` is located). Supported formats: YAML (`.yaml`, `.yml`), JSON (`.json`), or JSON5 (`.json5`). JSON5 files also support comments and trailing commas.

### Configuration Schema

```yaml
type: series | parallel
actions:
  - label: Display name for the task
    command: Command to execute
  - label: Another task
    command: Another command
```

### YAML Example

**`.concatenate/fix.yaml`**

```yaml
type: series
actions:
  - label: Fixing with Prettier
    command: prettier --write --list-different --cache .
  - label: Fixing with ESLint
    command: eslint . --fix --format pretty --ext .js,.jsx,.ts,.tsx
```

### JSON Example

**`.concatenate/check.json`**

```json
{
  "type": "parallel",
  "actions": [
    {
      "label": "Checking with ESLint",
      "command": "eslint . --format pretty --ext .js,.ts"
    },
    {
      "label": "Checking with Prettier",
      "command": "prettier --list-different --cache ."
    },
    {
      "label": "Type Checking",
      "command": "tsc --noEmit"
    }
  ]
}
```

### Field Descriptions

| Field               | Type                       | Required | Description                                                                                                                                    |
| ------------------- | -------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `type`              | `"series"` \| `"parallel"` | Yes      | Execution mode for the actions                                                                                                                 |
| `actions`           | Array                      | Yes      | List of command actions to execute                                                                                                             |
| `actions[].id`      | string                     | No       | Unique identifier for the action. Required only if you want to filter and run specific actions by ID. Must be unique within the configuration. |
| `actions[].label`   | string                     | Yes      | Display name shown during execution. Use clear and descriptive labels to easily identify tasks.                                                |
| `actions[].command` | string                     | Yes      | Shell command to execute                                                                                                                       |

## Commands

### `concatenate [file] [actionIds...]`

Execute a configuration file from the `.concatenate/` directory, optionally filtering to run only specific actions.

**Syntax:**

```bash
concatenate [file] [actionIds...]
```

**Arguments:**

- `file` (optional): Name of the configuration file (without extension)
- `actionIds` (optional): Space-separated list of action IDs to execute. If provided, only actions with matching IDs will run. All specified IDs must exist in the configuration.

**Examples:**

```bash
# Run fix.yaml or fix.json
concatenate fix

# Run check.yaml or check.json
concatenate check

# Run custom-workflow.yaml
concatenate custom-workflow

# Filter to run only specific actions by ID
concatenate check eslint prettier

# Run multiple specific actions from fix workflow
concatenate fix eslint

# No argument: Interactive selection menu
concatenate
```

**Behavior:**

- Searches for `<file>.yaml`, `<file>.yml`, `<file>.json`, or `<file>.json5` in `.concatenate/`
- If no file specified, shows an interactive selection menu (use arrow keys to navigate)
- Must find **exactly one** matching file (errors if 0 or multiple matches with different extensions)
- Displays real-time progress for each action with labeled tasks (powered by Listr2)
- Commands execute from your **project root directory** (parent of `.concatenate/`). Ensure your commands use paths relative to the project root.
- Commands inherit your current **environment variables**.
- Commands that exit with non-zero codes will cause the workflow to fail (in series mode).
- Avoid commands that require user input, as they will hang the process. Use non-interactive flags where possible.

**Action ID Filtering:**

- When action IDs are provided, only actions with matching IDs will execute
- Execution order is preserved from the configuration file, not from the command-line order
- All requested action IDs must exist in the configuration or an error will be raised
- If a configuration has mixed actions (some with IDs, some without), only actions with matching IDs will run
- Duplicate action IDs within a configuration will cause an error
- Actions without IDs cannot be selected for filtering

**Exit Codes:**

- `0` - All tasks completed successfully
- `1` - One or more tasks failed or general error

---

### `concatenate setup <extension>`

Generate default configuration files in the `.concatenate/` directory.

**Syntax:**

```bash
concatenate setup <extension>
```

**Arguments:**

- `extension` (required): File format to create (`yaml` or `json`)

**Examples:**

```bash
# Create YAML configuration files
concatenate setup yaml

# Create JSON configuration files
concatenate setup json
```

**Generated Files:**

- `fix.yaml` or `fix.json` - Auto-fix workflow (Prettier + ESLint in series)
- `check.yaml` or `check.json` - Quality check workflow (ESLint, Prettier, Knip, TSC in parallel)

**Notes:**

- Creates `.concatenate/` directory if it doesn't exist
- **Overwrites existing files** without warning
- Generated templates assume you have ESLint, Prettier, Knip, and TypeScript installed

**Exit Codes:**

- `4` - Invalid file extension provided to setup command

---

## Examples

### Example 1: CI/CD Pipeline

This example demonstrates how to define a robust CI/CD pipeline, ensuring dependencies are installed, code quality checks pass, tests run, and the project builds successfully in a sequential manner.

**`.concatenate/ci.yaml`**

```yaml
type: series
actions:
  - label: Install Dependencies
    command: npm ci
  - label: Run Linters
    command: concatenate check
  - label: Run Tests
    command: npm test
  - label: Build Project
    command: npm run build
```

```bash
concatenate ci
```

### Example 2: Pre-commit Checks

This example illustrates how to set up parallel pre-commit checks to enforce code quality, formatting, linting, and type-checking before changes are committed.

**`.concatenate/pre-commit.yaml`**

```yaml
type: parallel
actions:
  - label: Check Formatting
    command: prettier --check .
  - label: Lint Code
    command: eslint . --max-warnings 0
  - label: Type Check
    command: tsc --noEmit
  - label: Run Unit Tests
    command: npm run test:unit
```

```bash
concatenate pre-commit
```

### Example 3: Multi-environment Build

This example shows how to build a project for multiple environments (development, staging, production) concurrently, speeding up the overall build process.

**`.concatenate/build-all.yaml`**

```yaml
type: parallel
actions:
  - label: Build Development
    command: npm run build:dev
  - label: Build Staging
    command: npm run build:staging
  - label: Build Production
    command: npm run build:prod
```

```bash
concatenate build-all
```

**Note**: For cross-platform environment variables, define them in package.json scripts or use a package like `cross-env`.

### Example 4: Clean and Reset (Cross-platform)

This example provides a cross-platform solution for cleaning project artifacts and reinstalling dependencies, useful for resetting a development environment.

**`.concatenate/clean.yaml`**

```yaml
type: series
actions:
  - label: Remove node_modules
    command: npx shx rm -rf node_modules
  - label: Remove dist
    command: npx shx rm -rf dist
  - label: Clear npm cache
    command: npm cache clean --force
  - label: Reinstall dependencies
    command: npm install
```

```bash
concatenate clean
```

**Note**: Examples use `shx` for cross-platform compatibility. Install with `npm install --save-dev shx`.

### Example 5: Action ID Filtering for Selective Execution

This example demonstrates how to use action IDs to selectively run specific actions from a configuration. This is useful in CI/CD pipelines where you may want to run only certain checks in parallel environments.

**`.concatenate/check.yaml`**

```yaml
type: parallel
actions:
  - id: eslint
    label: Checking with ESLint
    command: eslint . --format pretty
  - id: prettier
    label: Checking with Prettier
    command: prettier --list-different --cache .
  - id: knip
    label: Checking with Knip
    command: knip
  - id: tsc
    label: Checking with TSC
    command: tsc --noEmit
```

**Usage Examples:**

```bash
# Run all checks (no ID filtering)
concatenate check

# Run only ESLint and TypeScript checks
concatenate check eslint tsc

# Run only Prettier check
concatenate check prettier

# In CI, run only fast checks
concatenate check eslint prettier
```

**Use Cases:**

- **Parallel CI environments**: Run only specific checks on different agents to speed up pipelines
- **Local pre-commit**: Run only fast checks locally, save slower checks for CI
- **Selective debugging**: Run only the checks you're debugging during development
- **Skip slow operations**: Skip slow checks (like knip) during rapid development cycles

## Troubleshooting

### Error: "There was an issue trying to find the configuration file"

**Cause**: No matching file found, or multiple files with the same name but different extensions exist.

**Solution**:

- Ensure the file exists in `.concatenate/` directory
- Check that you only have ONE file with the given name (e.g., don't have both `fix.yaml` AND `fix.json`)
- Verify the file has a supported extension: `.yaml`, `.yml`, `.json`, or `.json5`

### Error: "Unsupported file type"

**Cause**: Configuration file has an unsupported extension.

**Solution**: Rename your file to use `.yaml`, `.yml`, `.json`, or `.json5` extension.

### Error: "The extension provided doesn't match the expected format"

**Cause**: Invalid extension passed to `setup` command.

**Solution**: Use only `yaml` or `json` as the extension argument:

```bash
concatenate setup yaml
# OR
concatenate setup json
```

### Tasks hanging or not responding

**Cause**: A command is waiting for user input (e.g., interactive prompts).

**Solution**: Use non-interactive flags for your commands:

```yaml
actions:
  - label: Install dependencies
    command: npm ci --silent
```

### Command not found errors

**Cause**: Commands run from the project root, not from `.concatenate/` directory.

**Solution**: Use paths relative to project root, or use `npx` to run local binaries:

```yaml
actions:
  - label: Run local script
    command: npx my-local-tool
```

### Action ID filtering errors

#### Error: "The following action IDs were not found"

**Cause**: One or more requested action IDs don't exist in the configuration.

**Solution**:

- Check the action ID names in your configuration file
- View available IDs in the error message
- Ensure IDs are spelled correctly and match case-sensitive

```bash
# Example: Check which IDs are available
concatenate check invalid-id  # Shows available IDs in error
```

#### Error: "Duplicate action IDs found in configuration"

**Cause**: Two or more actions in your configuration have the same ID.

**Solution**:

- Open your configuration file and ensure each action has a unique ID
- IDs must be unique within the same configuration file

```yaml
# ❌ Wrong: Duplicate IDs
actions:
  - id: eslint
    label: First lint check
    command: eslint .
  - id: eslint  # ERROR: Duplicate!
    label: Second lint check
    command: eslint --fix .

# ✅ Correct: Unique IDs
actions:
  - id: eslint-check
    label: Check linting
    command: eslint .
  - id: eslint-fix
    label: Fix linting
    command: eslint --fix .
```

#### Warning: "Some actions do not have IDs defined and will be excluded"

**Cause**: Your configuration has mixed actions (some with IDs, some without), and you're filtering by ID. Actions without IDs will be excluded.

**Solution**:

- Either add IDs to all actions that you might want to filter, or
- Don't filter if you want to run all actions including those without IDs

### Cross-platform compatibility issues

**Cause**: Using platform-specific commands (e.g., `rm -rf` on Windows).

**Solution**: Use cross-platform alternatives:

- Use `shx` package for file operations
- Use `cross-env` for environment variables
- Use `npm scripts` that handle platform differences

## License

MIT © MedianAura

## Repository

[https://github.com/MedianAura/concatenate](https://github.com/MedianAura/concatenate)
