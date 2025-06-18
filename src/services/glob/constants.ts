/**
 * List of directories that are typically large and should be ignored
 * when showing recursive file listings or scanning for code indexing.
 * This list is shared between list-files.ts and the codebase indexing scanner
 * to ensure consistent behavior across the application.
 */
export const DIRS_TO_IGNORE = [
	"node_modules",
	"__pycache__",
	"env",
	"venv",
	"target/dependency",
	"build/dependencies",
	"dist",
	"out",
	"bundle",
	"vendor",
	"tmp",
	"temp",
	"deps",
	"pkg",
	"Pods",
	// Specific hidden directories that are commonly ignored
	// instead of the blanket ".*" pattern to allow access to useful dot directories
	".git",
	".svn",
	".hg",
	".bzr",
	".cache",
	".npm",
	".yarn",
	".pnpm",
	".next",
	".nuxt",
	".DS_Store",
	".Trash",
	".Spotlight-V100",
	".fseventsd",
	".DocumentRevisions-V100",
	".TemporaryItems",
	".Trashes",
	".VolumeIcon.icns",
	".com.apple.timemachine.donotpresent",
]
