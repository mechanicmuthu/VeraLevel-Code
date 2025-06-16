import * as esbuild from "esbuild"
import * as fs from "fs"
import * as path from "path"
import { fileURLToPath } from "url"
import process from "node:process"
import * as console from "node:console"

import { copyPaths, copyWasms, copyLocales, setupLocaleWatcher } from "@roo-code/build"

// Lock file to prevent concurrent execution
const LOCK_FILE = path.join(process.cwd(), '.esbuild.lock')
const MAX_WAIT_TIME = 30000 // 30 seconds
const POLL_INTERVAL = 100 // 100ms

async function acquireLock() {
	const startTime = Date.now()
	
	while (Date.now() - startTime < MAX_WAIT_TIME) {
		try {
			// Try to create lock file exclusively
			fs.writeFileSync(LOCK_FILE, process.pid.toString(), { flag: 'wx' })
			return true
		} catch (error) {
			if (error.code === 'EEXIST') {
				// Lock file exists, check if the process is still running
				try {
					const lockPid = fs.readFileSync(LOCK_FILE, 'utf8').trim()
					const pid = parseInt(lockPid, 10)
					
					// Check if process is still running
					try {
						process.kill(pid, 0) // Signal 0 checks if process exists
						// Process is still running, wait
						await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL))
						continue
					} catch (killError) {
						// Process is not running, remove stale lock
						fs.unlinkSync(LOCK_FILE)
						continue
					}
				} catch (readError) {
					// Can't read lock file, try to remove it
					try {
						fs.unlinkSync(LOCK_FILE)
					} catch (unlinkError) {
						// Ignore unlink errors
					}
					continue
				}
			} else {
				throw error
			}
		}
	}
	
	throw new Error(`Failed to acquire lock after ${MAX_WAIT_TIME}ms`)
}

function releaseLock() {
	try {
		fs.unlinkSync(LOCK_FILE)
	} catch (error) {
		// Ignore errors when releasing lock
	}
}

// Ensure lock is released on process exit
process.on('exit', releaseLock)
process.on('SIGINT', () => {
	releaseLock()
	process.exit(0)
})
process.on('SIGTERM', () => {
	releaseLock()
	process.exit(0)
})

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

async function main() {
	const name = "extension"
	const production = process.argv.includes("--production")
	const watch = process.argv.includes("--watch")
	const minify = production
	const sourcemap = !production

	// Acquire lock to prevent concurrent execution
	console.log(`[${name}] Acquiring build lock...`)
	await acquireLock()
	console.log(`[${name}] Build lock acquired`)

	try {
		/**
		 * @type {import('esbuild').BuildOptions}
		 */
		const buildOptions = {
			bundle: true,
			minify,
			sourcemap,
			logLevel: "silent",
			format: "cjs",
			sourcesContent: false,
			platform: "node",
		}

		const srcDir = __dirname
		const buildDir = __dirname
		const distDir = path.join(buildDir, "dist")

		if (fs.existsSync(distDir)) {
			console.log(`[${name}] Cleaning dist directory: ${distDir}`)
			fs.rmSync(distDir, { recursive: true, force: true })
		}

		/**
		 * @type {import('esbuild').Plugin[]}
		 */
		const plugins = [
			{
				name: "copyFiles",
				setup(build) {
					build.onEnd(() => {
						copyPaths(
							[
								["../README.md", "README.md"],
								["../CHANGELOG.md", "CHANGELOG.md"],
								["../LICENSE", "LICENSE"],
								["../.env", ".env", { optional: true }],
								["node_modules/vscode-material-icons/generated", "assets/vscode-material-icons"],
								["../webview-ui/audio", "webview-ui/audio"],
							],
							srcDir,
							buildDir,
						)
					})
				},
			},
			{
				name: "copyWasms",
				setup(build) {
					build.onEnd(() => copyWasms(srcDir, distDir))
				},
			},
			{
				name: "copyLocales",
				setup(build) {
					build.onEnd(() => copyLocales(srcDir, distDir))
				},
			},
			{
				name: "esbuild-problem-matcher",
				setup(build) {
					build.onStart(() => console.log("[esbuild-problem-matcher#onStart]"))
					build.onEnd((result) => {
						result.errors.forEach(({ text, location }) => {
							console.error(`✘ [ERROR] ${text}`)
							if (location && location.file) {
								console.error(`    ${location.file}:${location.line}:${location.column}:`)
							}
						})

						console.log("[esbuild-problem-matcher#onEnd]")
					})
				},
			},
		]

		/**
		 * @type {import('esbuild').BuildOptions}
		 */
		const extensionConfig = {
			...buildOptions,
			plugins,
			entryPoints: ["extension.ts"],
			outfile: "dist/extension.js",
			external: ["vscode"],
		}

		/**
		 * @type {import('esbuild').BuildOptions}
		 */
		const workerConfig = {
			...buildOptions,
			entryPoints: ["workers/countTokens.ts"],
			outdir: "dist/workers",
		}

		const [extensionCtx, workerCtx] = await Promise.all([
			esbuild.context(extensionConfig),
			esbuild.context(workerConfig),
		])

		if (watch) {
			await Promise.all([extensionCtx.watch(), workerCtx.watch()])
			copyLocales(srcDir, distDir)
			setupLocaleWatcher(srcDir, distDir)
		} else {
			await Promise.all([extensionCtx.rebuild(), workerCtx.rebuild()])
			await Promise.all([extensionCtx.dispose(), workerCtx.dispose()])
		}
	} finally {
		// Always release the lock
		releaseLock()
		console.log(`[${name}] Build lock released`)
	}
}

main().catch((e) => {
	console.error(e)
	releaseLock()
	process.exit(1)
})
