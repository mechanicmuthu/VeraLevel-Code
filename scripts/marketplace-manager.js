#!/usr/bin/env node

/**
 * Marketplace Manager Script
 *
 * This script helps manage the marketplace registry and provides utilities
 * for reviewing, approving, and syncing marketplace submissions.
 */

const fs = require("fs")
const path = require("path")
const yaml = require("yaml")

const REGISTRY_PATH = path.join(__dirname, "..", "marketplace", "registry.yaml")

class MarketplaceManager {
	constructor() {
		this.registry = this.loadRegistry()
	}

	loadRegistry() {
		try {
			const content = fs.readFileSync(REGISTRY_PATH, "utf8")
			return yaml.parse(content)
		} catch (error) {
			console.error("Error loading registry:", error.message)
			process.exit(1)
		}
	}

	saveRegistry() {
		try {
			const content = yaml.stringify(this.registry, { indent: 2 })
			fs.writeFileSync(REGISTRY_PATH, content, "utf8")
			console.log("Registry saved successfully")
		} catch (error) {
			console.error("Error saving registry:", error.message)
			process.exit(1)
		}
	}

	listItems(type = "all", status = "all") {
		console.log("\n=== Marketplace Registry ===\n")

		if (type === "all" || type === "mcp") {
			console.log("MCP Servers:")
			this.registry.mcpServers.forEach((item, index) => {
				if (status === "all" || item.status === status) {
					console.log(`  ${index + 1}. ${item.name} (${item.status})`)
					console.log(`     Author: ${item.author}`)
					console.log(`     URL: ${item.url}`)
					console.log(`     Issue: #${item.submissionIssue}`)
					console.log("")
				}
			})
		}

		if (type === "all" || type === "mode") {
			console.log("Custom Modes:")
			this.registry.customModes.forEach((item, index) => {
				if (status === "all" || item.status === status) {
					console.log(`  ${index + 1}. ${item.name} (${item.status})`)
					console.log(`     Author: ${item.author}`)
					console.log(`     Issue: #${item.submissionIssue}`)
					console.log("")
				}
			})
		}
	}

	updateStatus(type, id, newStatus) {
		const items = type === "mcp" ? this.registry.mcpServers : this.registry.customModes
		const item = items.find((item) => item.id === id)

		if (!item) {
			console.error(`Item with ID '${id}' not found`)
			return false
		}

		const oldStatus = item.status
		item.status = newStatus
		item.lastUpdated = new Date().toISOString().split("T")[0]

		console.log(`Updated ${item.name}: ${oldStatus} → ${newStatus}`)
		return true
	}

	addItem(type, itemData) {
		const items = type === "mcp" ? this.registry.mcpServers : this.registry.customModes

		// Check if item already exists
		const existing = items.find((item) => item.id === itemData.id)
		if (existing) {
			console.error(`Item with ID '${itemData.id}' already exists`)
			return false
		}

		// Add default fields
		itemData.status = itemData.status || "pending-review"
		itemData.submissionDate = itemData.submissionDate || new Date().toISOString().split("T")[0]

		items.push(itemData)
		console.log(`Added new ${type} item: ${itemData.name}`)
		return true
	}

	generateMarketplaceData() {
		// Generate data in the format expected by the marketplace API
		const mcpItems = this.registry.mcpServers
			.filter((item) => item.status === "approved")
			.map((item) => ({
				id: item.id,
				name: item.name,
				description: item.description,
				author: item.author,
				authorUrl: item.authorUrl,
				url: item.url,
				tags: item.tags,
				prerequisites: item.prerequisites,
				content: typeof item.content === "string" ? JSON.parse(item.content) : item.content,
			}))

		const modeItems = this.registry.customModes
			.filter((item) => item.status === "approved")
			.map((item) => ({
				id: item.id,
				name: item.name,
				description: item.description,
				author: item.author,
				authorUrl: item.authorUrl,
				tags: item.tags,
				content: item.content,
			}))

		return {
			mcps: { items: mcpItems },
			modes: { items: modeItems },
		}
	}

	exportForAPI() {
		const data = this.generateMarketplaceData()

		// Write MCP data
		const mcpPath = path.join(__dirname, "..", "marketplace", "mcps.yaml")
		fs.writeFileSync(mcpPath, yaml.stringify(data.mcps, { indent: 2 }))

		// Write modes data
		const modesPath = path.join(__dirname, "..", "marketplace", "modes.yaml")
		fs.writeFileSync(modesPath, yaml.stringify(data.modes, { indent: 2 }))

		console.log("Exported marketplace data for API consumption")
		console.log(`- MCPs: ${mcpPath}`)
		console.log(`- Modes: ${modesPath}`)
	}
}

// CLI Interface
function main() {
	const args = process.argv.slice(2)
	const command = args[0]
	const manager = new MarketplaceManager()

	switch (command) {
		case "list":
			const type = args[1] || "all"
			const status = args[2] || "all"
			manager.listItems(type, status)
			break

		case "approve":
			if (args.length < 3) {
				console.error("Usage: approve <type> <id>")
				process.exit(1)
			}
			if (manager.updateStatus(args[1], args[2], "approved")) {
				manager.saveRegistry()
			}
			break

		case "reject":
			if (args.length < 3) {
				console.error("Usage: reject <type> <id>")
				process.exit(1)
			}
			if (manager.updateStatus(args[1], args[2], "rejected")) {
				manager.saveRegistry()
			}
			break

		case "export":
			manager.exportForAPI()
			break

		case "help":
		default:
			console.log(`
Marketplace Manager

Commands:
  list [type] [status]     List items (type: all|mcp|mode, status: all|pending-review|approved|rejected)
  approve <type> <id>      Approve an item (type: mcp|mode)
  reject <type> <id>       Reject an item (type: mcp|mode)
  export                   Export approved items for API consumption
  help                     Show this help message

Examples:
  node marketplace-manager.js list mcp pending-review
  node marketplace-manager.js approve mcp daft-ie-mcp
  node marketplace-manager.js export
            `)
			break
	}
}

if (require.main === module) {
	main()
}

module.exports = MarketplaceManager
