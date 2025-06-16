import * as vscode from "vscode"
import * as path from "path"
import * as os from "os"

export type InjectableConfigType =
	| string
	| {
			[key: string]:
				| undefined
				| null
				| boolean
				| number
				| InjectableConfigType
				| Array<undefined | null | boolean | number | InjectableConfigType>
	  }

/**
 * Deeply injects environment variables into a configuration object/string/json
 *
 * Uses VSCode env:name pattern: https://code.visualstudio.com/docs/reference/variables-reference#_environment-variables
 *
 * Does not mutate original object
 */
export async function injectEnv<C extends InjectableConfigType>(config: C, notFoundValue: any = "") {
	return injectVariables(config, { env: process.env }, notFoundValue)
}

/**
 * Resolves VS Code magic variables to their actual values
 * Based on: https://code.visualstudio.com/docs/editor/variables-reference
 */
function resolveVSCodeVariables(): Record<string, string> {
	const workspaceFolder = vscode.workspace.workspaceFolders?.[0]
	const activeEditor = vscode.window.activeTextEditor
	const activeDocument = activeEditor?.document

	const variables: Record<string, string> = {}

	// Workspace variables
	if (workspaceFolder) {
		variables.workspaceFolder = workspaceFolder.uri.fsPath
		variables.workspaceFolderBasename = path.basename(workspaceFolder.uri.fsPath)
		variables.workspaceRoot = workspaceFolder.uri.fsPath // deprecated but still supported
	}

	// File variables (if there's an active editor)
	if (activeDocument) {
		const filePath = activeDocument.uri.fsPath
		const fileWorkspaceFolder = vscode.workspace.getWorkspaceFolder(activeDocument.uri)

		variables.file = filePath
		variables.fileWorkspaceFolder = fileWorkspaceFolder?.uri.fsPath ?? workspaceFolder?.uri.fsPath ?? ""
		variables.relativeFile = fileWorkspaceFolder
			? path.relative(fileWorkspaceFolder.uri.fsPath, filePath)
			: path.basename(filePath)
		variables.relativeFileDirname = path.dirname(variables.relativeFile)
		variables.fileBasename = path.basename(filePath)
		variables.fileBasenameNoExtension = path.basename(filePath, path.extname(filePath))
		variables.fileExtname = path.extname(filePath)
		variables.fileDirname = path.dirname(filePath)
		variables.fileDirnameBasename = path.basename(path.dirname(filePath))
	}

	// System variables
	variables.userHome = os.homedir()
	variables.pathSeparator = path.sep

	// Line and selection variables (set to empty as they're not typically used in MCP configs)
	variables.lineNumber = ""
	variables.selectedText = ""
	variables.clipboardText = ""

	return variables
}

/**
 * Deeply injects variables into a configuration object/string/json
 *
 * Uses VSCode's variables reference pattern: https://code.visualstudio.com/docs/reference/variables-reference
 * Supports both custom variables and VS Code magic variables
 *
 * Does not mutate original object
 *
 * There is a special handling for a nested (record-type) variables, where it is replaced by `propNotFoundValue` (if available) if the root key exists but the nested key does not.
 *
 * Matched keys that have `null` | `undefined` values are treated as not found.
 */
export async function injectVariables<C extends InjectableConfigType>(
	config: C,
	variables: Record<string, undefined | null | string | Record<string, undefined | null | string>>,
	propNotFoundValue?: any,
) {
	// Use simple regex replace for now, will see if object traversal and recursion is needed here (e.g: for non-serializable objects)
	const isObject = typeof config === "object"
	let _config: string = isObject ? JSON.stringify(config) : config

	// Get VS Code magic variables
	const vscodeVariables = resolveVSCodeVariables()

	// Merge custom variables with VS Code variables (custom variables take precedence)
	const allVariables = { ...vscodeVariables, ...variables }

	// Intentionally using `== null` to match null | undefined
	for (const [key, value] of Object.entries(allVariables)) {
		if (value == null) continue

		if (typeof value === "string") {
			// Handle both ${key} and ${key:subkey} patterns
			_config = _config.replace(new RegExp(`\\$\\{${key}\\}`, "g"), value)
		} else {
			// Handle nested variables like ${env:PATH}
			_config = _config.replace(new RegExp(`\\$\\{${key}:([\\w]+)\\}`, "g"), (match, name) => {
				if (value[name] == null)
					console.warn(`[injectVariables] variable "${name}" referenced but not found in "${key}"`)

				return value[name] ?? propNotFoundValue ?? match
			})
		}
	}

	return (isObject ? JSON.parse(_config) : _config) as C extends string ? string : C
}
