import { MultiSearchReplaceDiffStrategy } from "../multi-search-replace"
import { MultiFileSearchReplaceDiffStrategy } from "../multi-file-search-replace"

describe("FuzzySearch Performance Tests", () => {
	describe("MultiSearchReplaceDiffStrategy", () => {
		it("should not hang on large XML files", async () => {
			const strategy = new MultiSearchReplaceDiffStrategy()

			// Create a large XML-like content (simulating a 1000+ line file)
			const largeXmlContent = Array.from(
				{ length: 1000 },
				(_, i) =>
					`  <item id="${i}">
    <name>Item ${i}</name>
    <description>This is a description for item ${i}</description>
    <value>${i * 10}</value>
  </item>`,
			).join("\n")

			const originalContent = `<?xml version="1.0" encoding="UTF-8"?>
<root>
${largeXmlContent}
</root>`

			// Create a diff that searches for content that doesn't exist
			// This would previously cause the fuzzySearch to hang
			const diffContent = `<<<<<<< SEARCH
:start_line:500
-------
  <item id="999999">
    <name>Non-existent Item</name>
    <description>This item does not exist</description>
    <value>999999</value>
  </item>
=======
  <item id="999999">
    <name>Updated Non-existent Item</name>
    <description>This item still does not exist</description>
    <value>999999</value>
  </item>
>>>>>>> REPLACE`

			const startTime = Date.now()

			// This should complete within a reasonable time (not hang)
			const result = await strategy.applyDiff(originalContent, diffContent)

			const endTime = Date.now()
			const duration = endTime - startTime

			// Should complete within 10 seconds (was hanging indefinitely before)
			expect(duration).toBeLessThan(10000)

			// Should fail to find the match (which is expected)
			expect(result.success).toBe(false)
			if (!result.success) {
				// Check if there's a direct error or error in failParts
				const errorMessage =
					result.error ||
					(result.failParts?.[0] && !result.failParts[0].success ? result.failParts[0].error : undefined)
				expect(errorMessage).toContain("No sufficiently similar match found")
			}
		}, 15000) // 15 second timeout for the test itself

		it("should handle complex XML structure efficiently", async () => {
			const strategy = new MultiSearchReplaceDiffStrategy()

			// Create complex nested XML structure
			const complexXml = Array.from(
				{ length: 500 },
				(_, i) =>
					`    <section id="section-${i}">
      <header>
        <title>Section ${i}</title>
        <metadata>
          <created>2024-01-${(i % 28) + 1}</created>
          <author>Author ${i % 10}</author>
        </metadata>
      </header>
      <content>
        <paragraph>This is paragraph 1 of section ${i}</paragraph>
        <paragraph>This is paragraph 2 of section ${i}</paragraph>
        <list>
          <item>Item 1</item>
          <item>Item 2</item>
          <item>Item 3</item>
        </list>
      </content>
    </section>`,
			).join("\n")

			const originalContent = `<?xml version="1.0" encoding="UTF-8"?>
<document>
  <header>
    <title>Large Document</title>
  </header>
  <body>
${complexXml}
  </body>
</document>`

			// Search for an actual existing section to replace
			const diffContent = `<<<<<<< SEARCH
:start_line:10
-------
    <section id="section-1">
      <header>
        <title>Section 1</title>
        <metadata>
          <created>2024-01-2</created>
          <author>Author 1</author>
        </metadata>
      </header>
=======
    <section id="section-1">
      <header>
        <title>Updated Section 1</title>
        <metadata>
          <created>2024-01-2</created>
          <author>Author 1</author>
          <updated>2024-12-18</updated>
        </metadata>
      </header>
>>>>>>> REPLACE`

			const startTime = Date.now()

			const result = await strategy.applyDiff(originalContent, diffContent)

			const endTime = Date.now()
			const duration = endTime - startTime

			// Should complete quickly
			expect(duration).toBeLessThan(5000)

			// Should successfully find and replace the content
			expect(result.success).toBe(true)
			if (result.success) {
				expect(result.content).toContain("Updated Section 1")
				expect(result.content).toContain("<updated>2024-12-18</updated>")
			}
		}, 10000)
	})

	describe("MultiFileSearchReplaceDiffStrategy", () => {
		it("should not hang on large files with array-based diff input", async () => {
			const strategy = new MultiFileSearchReplaceDiffStrategy()

			// Create a large file content
			const largeContent = Array.from(
				{ length: 2000 },
				(_, i) =>
					`Line ${i}: This is a long line with some content that might be searched for in a large file.`,
			).join("\n")

			// Create diff items that search for non-existent content
			const diffItems = [
				{
					content: `<<<<<<< SEARCH
Line 99999: This line does not exist
=======
Line 99999: This line has been updated
>>>>>>> REPLACE`,
					startLine: 1000,
				},
			]

			const startTime = Date.now()

			// This should complete within a reasonable time (not hang)
			const result = await strategy.applyDiff(largeContent, diffItems)

			const endTime = Date.now()
			const duration = endTime - startTime

			// Should complete within 10 seconds
			expect(duration).toBeLessThan(10000)

			// Should fail to find the match
			expect(result.success).toBe(false)
		}, 15000)
	})
})
