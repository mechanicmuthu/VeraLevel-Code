# Context Overflow Contingency

This feature provides a safety mechanism for subtasks that may encounter context overflow issues, particularly when using browser interactions or other tools that can return large amounts of content.

## Overview

When enabled for a specific mode, the context overflow contingency feature monitors the token usage during subtask execution. If the context usage exceeds a configurable threshold (default: 90% of the model's context window), the subtask will automatically exit with an `attempt_completion` message, allowing the parent task to continue.

## Configuration

The feature is configured per-mode in the mode configuration file (`.roomodes` for project-specific or global settings):

```yaml
customModes:
    - slug: "mcp-expert"
      name: "MCP Expert"
      roleDefinition: "You are an expert at handling browser interactions using PlayWright"
      whenToUse: "Use this mode for browser automation tasks"
      groups: ["read", "edit", "browser", "command", "mcp"]
      contextOverflowContingency:
          enabled: true
          message: "Task failed because of a context overflow, possibly because webpage returned from the browser was too big"
          toolSpecific:
              browser_action: "Browser action returned too much content, causing context overflow"
              read_file: "File content was too large, causing context overflow"
```

### Configuration Options

- **`enabled`** (boolean): Whether to enable context overflow contingency for this mode
- **`message`** (string, optional): Default message to use when context overflow is detected
- **`toolSpecific`** (object, optional): Tool-specific messages that override the default message when a specific tool was the last one used

## How It Works

1. **Monitoring**: The feature checks context usage before making API requests and during task execution
2. **Threshold Detection**: When context usage exceeds 90% of the model's context window, the contingency is triggered
3. **Tool Detection**: The system attempts to identify the last tool used to provide more specific error messages
4. **Graceful Exit**: The subtask exits with an `attempt_completion` containing the configured message
5. **Parent Continuation**: The parent task receives the completion message and can continue execution

## Use Cases

This feature is particularly useful for:

- **Browser Automation**: When web pages return large amounts of content
- **File Processing**: When reading large files that exceed context limits
- **API Interactions**: When external APIs return unexpectedly large responses
- **Document Processing**: When processing large documents or datasets

## Example Scenario

Consider an "MCP Expert" mode that navigates to a webpage:

1. The mode uses a browser tool to navigate to a page
2. The webpage returns a very large HTML document
3. Context usage jumps to 95% of the available window
4. The contingency is triggered with the message: "Browser action returned too much content, causing context overflow"
5. The subtask exits gracefully, and the parent task can handle the situation

## Benefits

- **Prevents Hanging**: Avoids situations where tasks get stuck due to context overflow
- **Maintains Workflow**: Allows parent tasks to continue even when subtasks fail due to context issues
- **Customizable Messages**: Provides clear, actionable feedback about why the task failed
- **Tool-Specific Handling**: Different tools can have different failure messages for better debugging

## Implementation Details

The feature works by:

1. Adding context overflow checks at key points in the task execution loop
2. Monitoring token usage using the existing token counting infrastructure
3. Comparing current usage against the model's context window limits
4. Triggering graceful exit when thresholds are exceeded
5. Using the existing `attempt_completion` mechanism for clean task termination

## Limitations

- Only works for subtasks (tasks with a parent task)
- Requires the mode to have the feature explicitly enabled
- Uses a fixed threshold of 90% context usage
- Tool detection is based on pattern matching in recent messages
