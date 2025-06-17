import { QdrantClient, Schemas } from "@qdrant/js-client-rest"
import { createHash } from "crypto"
import * as path from "path"
import { getWorkspacePath } from "../../../utils/path"
import { IVectorStore } from "../interfaces/vector-store"
import { Payload, VectorStoreSearchResult } from "../interfaces"
import { MAX_SEARCH_RESULTS, SEARCH_MIN_SCORE } from "../constants"

/**
 * Qdrant implementation of the vector store interface
 */
export class QdrantVectorStore implements IVectorStore {
	private readonly QDRANT_URL = "http://localhost:6333"
	private readonly vectorSize!: number
	private readonly DISTANCE_METRIC = "Cosine"

	private client: QdrantClient
	private readonly collectionName: string

	/**
	 * Creates a new Qdrant vector store
	 * @param workspacePath Path to the workspace
	 * @param url Optional URL to the Qdrant server
	 */
	constructor(workspacePath: string, url: string, vectorSize: number, apiKey?: string) {
		this.client = new QdrantClient({
			url: url ?? this.QDRANT_URL,
			apiKey,
			headers: {
				"User-Agent": "Roo-Code",
			},
		})

		// Generate collection name from workspace path
		const hash = createHash("sha256").update(workspacePath).digest("hex")
		this.vectorSize = vectorSize
		this.collectionName = `ws-${hash.substring(0, 16)}`
	}

	private async getCollectionInfo(): Promise<Schemas["CollectionInfo"] | null> {
		try {
			const collectionInfo = await this.client.getCollection(this.collectionName)
			return collectionInfo
		} catch (error: unknown) {
			if (error instanceof Error) {
				console.warn(
					`[QdrantVectorStore] Warning during getCollectionInfo for "${this.collectionName}". Collection may not exist or another error occurred:`,
					error.message,
				)
			}
			return null
		}
	}

	/**
	 * Initializes the vector store
	 * @returns Promise resolving to boolean indicating if a new collection was created
	 */
	async initialize(): Promise<boolean> {
		let created = false
		try {
			const collectionInfo = await this.getCollectionInfo()

			if (collectionInfo === null) {
				// Collection info not retrieved (assume not found or inaccessible), create it
				await this.client.createCollection(this.collectionName, {
					vectors: {
						size: this.vectorSize,
						distance: this.DISTANCE_METRIC,
					},
				})
				created = true
			} else {
				// Collection exists, check vector size
				const existingVectorSize = collectionInfo.config?.params?.vectors?.size
				if (existingVectorSize === this.vectorSize) {
					created = false // Exists and correct
				} else {
					// Exists but wrong vector size, recreate
					console.warn(
						`[QdrantVectorStore] Collection ${this.collectionName} exists with vector size ${existingVectorSize}, but expected ${this.vectorSize}. Recreating collection.`,
					)
					await this.client.deleteCollection(this.collectionName) // Known to exist
					await this.client.createCollection(this.collectionName, {
						vectors: {
							size: this.vectorSize,
							distance: this.DISTANCE_METRIC,
						},
					})
					created = true
				}
			}

			// Create payload indexes
			for (let i = 0; i <= 4; i++) {
				try {
					await this.client.createPayloadIndex(this.collectionName, {
						field_name: `pathSegments.${i}`,
						field_schema: "keyword",
					})
				} catch (indexError: any) {
					const errorMessage = (indexError?.message || "").toLowerCase()
					if (!errorMessage.includes("already exists")) {
						console.warn(
							`[QdrantVectorStore] Could not create payload index for pathSegments.${i} on ${this.collectionName}. Details:`,
							indexError?.message || indexError,
						)
					}
				}
			}
			return created
		} catch (error: any) {
			console.error(
				`[QdrantVectorStore] Failed to initialize Qdrant collection "${this.collectionName}":`,
				error?.message || error,
			)
			throw error
		}
	}

	/**
	 * Validates vector dimensions against the expected collection vector size
	 * @param vectors Array of vectors to validate
	 * @returns true if all vectors have correct dimensions
	 */
	private validateVectorDimensions(vectors: number[][]): void {
		for (let i = 0; i < vectors.length; i++) {
			const vector = vectors[i]
			if (!Array.isArray(vector)) {
				throw new Error(`Vector at index ${i} is not an array`)
			}
			if (vector.length !== this.vectorSize) {
				throw new Error(
					`Vector at index ${i} has incorrect dimensions: expected ${this.vectorSize}, got ${vector.length}`,
				)
			}
			// Check for invalid values (NaN, Infinity)
			for (let j = 0; j < vector.length; j++) {
				const value = vector[j]
				if (typeof value !== "number" || !isFinite(value)) {
					throw new Error(`Vector at index ${i} contains invalid value at position ${j}: ${value}`)
				}
			}
		}
	}

	/**
	 * Upserts points into the vector store
	 * @param points Array of points to upsert
	 */
	async upsertPoints(
		points: Array<{
			id: string
			vector: number[]
			payload: Record<string, any>
		}>,
	): Promise<void> {
		try {
			// Validate input points
			if (!Array.isArray(points)) {
				throw new Error("Points must be an array")
			}

			if (points.length === 0) {
				return // Nothing to upsert
			}

			// Validate each point structure and collect vectors for dimension validation
			const vectors: number[][] = []
			for (let i = 0; i < points.length; i++) {
				const point = points[i]
				if (!point.id || typeof point.id !== "string") {
					throw new Error(`Point at index ${i} must have a valid string id`)
				}
				if (!Array.isArray(point.vector) || point.vector.length === 0) {
					throw new Error(`Point at index ${i} must have a valid vector array`)
				}
				if (!point.payload || typeof point.payload !== "object") {
					throw new Error(`Point at index ${i} must have a valid payload object`)
				}
				vectors.push(point.vector)
			}

			// Validate vector dimensions
			this.validateVectorDimensions(vectors)

			const processedPoints = points.map((point) => {
				if (point.payload?.filePath) {
					const segments = point.payload.filePath.split(path.sep).filter(Boolean)
					const pathSegments = segments.reduce(
						(acc: Record<string, string>, segment: string, index: number) => {
							acc[index.toString()] = segment
							return acc
						},
						{},
					)
					return {
						id: point.id,
						vector: point.vector,
						payload: {
							...point.payload,
							pathSegments,
						},
					}
				}
				return {
					id: point.id,
					vector: point.vector,
					payload: point.payload,
				}
			})

			// Use the batch upsert operation with proper error handling
			const upsertRequest = {
				points: processedPoints,
				wait: true,
			}

			await this.client.upsert(this.collectionName, upsertRequest)
		} catch (error: any) {
			// Enhanced error logging to help debug the "Bad Request" issue
			const errorMessage = error?.message || error?.toString() || "Unknown error"
			const errorDetails = {
				message: errorMessage,
				status: error?.status || error?.response?.status,
				statusText: error?.statusText || error?.response?.statusText,
				data: error?.data || error?.response?.data,
				pointsCount: points.length,
				collectionName: this.collectionName,
				vectorSize: this.vectorSize,
				sampleVectorLengths: points.slice(0, 3).map((p) => p.vector?.length || "undefined"),
			}

			console.error("Failed to upsert points:", errorDetails)

			// Re-throw with more context
			const enhancedError = new Error(
				`Failed to upsert ${points.length} points to collection ${this.collectionName}: ${errorMessage}`,
			)
			enhancedError.cause = error
			throw enhancedError
		}
	}

	/**
	 * Checks if a payload is valid
	 * @param payload Payload to check
	 * @returns Boolean indicating if the payload is valid
	 */
	private isPayloadValid(payload: Record<string, unknown> | null | undefined): payload is Payload {
		if (!payload) {
			return false
		}
		const validKeys = ["filePath", "codeChunk", "startLine", "endLine"]
		const hasValidKeys = validKeys.every((key) => key in payload)
		return hasValidKeys
	}

	/**
	 * Searches for similar vectors
	 * @param queryVector Vector to search for
	 * @param limit Maximum number of results to return
	 * @returns Promise resolving to search results
	 */
	async search(
		queryVector: number[],
		directoryPrefix?: string,
		minScore?: number,
	): Promise<VectorStoreSearchResult[]> {
		try {
			let filter = undefined

			if (directoryPrefix) {
				const segments = directoryPrefix.split(path.sep).filter(Boolean)

				filter = {
					must: segments.map((segment, index) => ({
						key: `pathSegments.${index}`,
						match: { value: segment },
					})),
				}
			}

			const searchRequest = {
				query: queryVector,
				filter,
				score_threshold: SEARCH_MIN_SCORE,
				limit: MAX_SEARCH_RESULTS,
				params: {
					hnsw_ef: 128,
					exact: false,
				},
				with_payload: {
					include: ["filePath", "codeChunk", "startLine", "endLine", "pathSegments"],
				},
			}

			if (minScore !== undefined) {
				searchRequest.score_threshold = minScore
			}

			const operationResult = await this.client.query(this.collectionName, searchRequest)
			const filteredPoints = operationResult.points.filter((p) => this.isPayloadValid(p.payload))

			return filteredPoints as VectorStoreSearchResult[]
		} catch (error) {
			console.error("Failed to search points:", error)
			throw error
		}
	}

	/**
	 * Deletes points by file path
	 * @param filePath Path of the file to delete points for
	 */
	async deletePointsByFilePath(filePath: string): Promise<void> {
		return this.deletePointsByMultipleFilePaths([filePath])
	}

	async deletePointsByMultipleFilePaths(filePaths: string[]): Promise<void> {
		if (filePaths.length === 0) {
			return
		}

		try {
			const workspaceRoot = getWorkspacePath()
			const normalizedPaths = filePaths.map((filePath) => {
				const absolutePath = path.resolve(workspaceRoot, filePath)
				return path.normalize(absolutePath)
			})

			const filter = {
				should: normalizedPaths.map((normalizedPath) => ({
					key: "filePath",
					match: {
						value: normalizedPath,
					},
				})),
			}

			await this.client.delete(this.collectionName, {
				filter,
				wait: true,
			})
		} catch (error) {
			console.error("Failed to delete points by file paths:", error)
			throw error
		}
	}

	/**
	 * Deletes the entire collection.
	 */
	async deleteCollection(): Promise<void> {
		try {
			// Check if collection exists before attempting deletion to avoid errors
			if (await this.collectionExists()) {
				await this.client.deleteCollection(this.collectionName)
			}
		} catch (error) {
			console.error(`[QdrantVectorStore] Failed to delete collection ${this.collectionName}:`, error)
			throw error // Re-throw to allow calling code to handle it
		}
	}

	/**
	 * Clears all points from the collection
	 */
	async clearCollection(): Promise<void> {
		try {
			await this.client.delete(this.collectionName, {
				filter: {
					must: [],
				},
				wait: true,
			})
		} catch (error) {
			console.error("Failed to clear collection:", error)
			throw error
		}
	}

	/**
	 * Checks if the collection exists
	 * @returns Promise resolving to boolean indicating if the collection exists
	 */
	async collectionExists(): Promise<boolean> {
		const collectionInfo = await this.getCollectionInfo()
		return collectionInfo !== null
	}
}
