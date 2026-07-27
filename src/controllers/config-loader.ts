import path from 'node:path';
import { parseConfigData, readConfigFile } from '../helpers/config-file.js';
import type { ActionNodeSchema } from '../models/action-model.js';
import { ConfigModel } from '../models/config-model.js';
import type { ResolvedConfig, ResolvedNode } from '../models/config-tree.js';

/**
 * Applies to **imports only**. `children:` nesting is bounded by the file it is written
 * in and cannot loop, so capping it would only reject a legally deep inline config.
 */
export const MAX_IMPORT_DEPTH = 10;

interface ResolveContext {
  /**
   * The chain of files currently being imported, innermost last. Deliberately not a
   * global visited set: a diamond -- two branches importing the same file -- is legal and
   * each branch gets its own resolved copy. This is a recursion guard, not
   * de-duplication, and it is the difference users will actually hit.
   */
  stack: string[];
  depth: number;
  idPath?: string[];
  labelPath: string[];
}

function relativise(file: string): string {
  return path.relative(process.cwd(), file).replaceAll(path.sep, '/') || file;
}

/**
 * `import` requires an explicit extension, which is exactly what lets it bypass the
 * `globby('<name>.*')` exactly-one-match lookup the root config name goes through. A
 * bare `./shared/lint` would be ambiguous in the same way two `check.*` files are.
 */
function resolveImportPath(specifier: string, importingFile: string): string {
  if (path.extname(specifier) === '') {
    throw new Error(`Import "${specifier}" in ${relativise(importingFile)} must include a file extension (.yaml, .yml, .json or .json5).`);
  }

  return path.resolve(path.dirname(importingFile), specifier);
}

/**
 * Reading and parsing stay separate calls at every use site. Wrapping both in one
 * try/catch buried `Unsupported file type: .toml` under a generic "could not read"
 * message -- a missing file and an unparseable one are different mistakes.
 */
function parseConfig(file: string): unknown {
  return parseConfigData(file, readConfigFile(file));
}

function resolveNode(action: ActionNodeSchema, file: string, context: ResolveContext): ResolvedNode {
  const labelPath = [...context.labelPath, action.label];
  // Breaks permanently at the first id-less node: once an ancestor is unaddressable,
  // nothing below it can be addressed either.
  const idPath = context.idPath !== undefined && action.id !== undefined ? [...context.idPath, action.id] : undefined;
  const base = { id: action.id, label: action.label, labelPath, idPath };

  if ('command' in action) {
    return { ...base, kind: 'leaf', command: action.command, file };
  }

  if ('children' in action) {
    return {
      ...base,
      kind: 'group',
      // One expression, and the only place the default lives. Inheriting the parent's
      // type was the arguable alternative -- an unannotated `children:` inside a
      // `type: parallel` file reads as grouping, not as a mode switch -- but `series` is
      // the predictable answer and is trivial to flip once a real config renders.
      type: action.type ?? 'series',
      children: action.children.map((child) => resolveNode(child, file, { ...context, labelPath, idPath })),
    };
  }

  return resolveImport(action.import, action.label, file, { ...context, labelPath, idPath });
}

function resolveImport(specifier: string, label: string, importingFile: string, context: ResolveContext): ResolvedNode {
  const target = resolveImportPath(specifier, importingFile);

  if (context.stack.includes(target)) {
    const chain = [...context.stack, target].map((entry) => relativise(entry)).join(' -> ');

    throw new Error(`Import cycle detected: ${chain}`);
  }

  if (context.depth + 1 > MAX_IMPORT_DEPTH) {
    throw new Error(`Import depth limit of ${String(MAX_IMPORT_DEPTH)} exceeded at ${relativise(target)}.`);
  }

  let contents: string;
  try {
    contents = readConfigFile(target);
  } catch (error: unknown) {
    // Both paths, because either can be the mistake: the specifier may be wrong, or the
    // file it is written in may not be where the author thought it was.
    throw new Error(`Could not read import "${specifier}" from ${relativise(importingFile)}: expected ${relativise(target)}.`, { cause: error });
  }

  // Outside the catch above, so an unsupported extension keeps its own message.
  const config = ConfigModel.parse(parseConfigData(target, contents));

  return {
    id: context.idPath?.at(-1),
    label,
    labelPath: context.labelPath,
    idPath: context.idPath,
    kind: 'group',
    // The import action supplies the label; the **imported file's own type** governs the
    // subtree. There is no override key -- the file is runnable on its own, and it would
    // be surprising for it to run differently depending on who imported it.
    type: config.type,
    children: config.actions.map((action) =>
      resolveNode(action, target, {
        stack: [...context.stack, target],
        depth: context.depth + 1,
        idPath: context.idPath,
        labelPath: context.labelPath,
      }),
    ),
  };
}

/**
 * Reads, validates and resolves a config file into a tree.
 *
 * Takes an absolute path rather than a config name, which keeps globby out of the loader
 * entirely: name lookup is the root's problem and belongs to whoever found the root.
 */
export function loadFile(absolutePath: string): ResolvedConfig {
  const file = path.resolve(absolutePath);
  const config = ConfigModel.parse(parseConfig(file));

  return {
    type: config.type,
    nodes: config.actions.map((action) => resolveNode(action, file, { stack: [file], depth: 0, idPath: [], labelPath: [] })),
  };
}
