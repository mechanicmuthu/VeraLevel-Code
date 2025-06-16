# Marketplace Submissions

This document outlines the process for submitting new items (MCP servers and modes) to the Roo Code marketplace.

## Overview

The Roo Code marketplace allows users to discover and install MCP servers and custom modes. Community contributions are essential for growing the marketplace ecosystem.

## Submission Process

### 1. Prerequisites

Before submitting an MCP server or mode to the marketplace, ensure:

- Your project is open-source and publicly available
- The code follows security best practices
- Documentation is clear and comprehensive
- The project has a proper license (preferably MIT, Apache 2.0, or similar)
- For MCP servers: The server implements the MCP protocol correctly

### 2. Submission Requirements

#### For MCP Servers

Your MCP server submission must include:

- **Repository URL**: Link to the public GitHub repository
- **Name**: Clear, descriptive name for the MCP server
- **Description**: Brief description of what the server does
- **Author**: Your name or organization
- **Author URL**: Link to your profile or website (optional)
- **Tags**: Relevant tags for discoverability
- **Installation Instructions**: Clear setup and configuration steps
- **Prerequisites**: Any required dependencies or setup steps

#### For Modes

Your mode submission must include:

- **Mode Configuration**: Complete YAML configuration
- **Name**: Clear, descriptive name for the mode
- **Description**: Brief description of the mode's purpose
- **Author**: Your name or organization
- **Author URL**: Link to your profile or website (optional)
- **Tags**: Relevant tags for discoverability

### 3. How to Submit

1. **Create a GitHub Issue**: Use the "Marketplace Submission" template in the [Roo Code repository](https://github.com/RooCodeInc/Roo-Code/issues/new/choose)

2. **Provide Required Information**: Fill out all required fields in the issue template

3. **Wait for Review**: The Roo Code team will review your submission for:

    - Code quality and security
    - Documentation completeness
    - Compliance with marketplace guidelines
    - Functionality and usefulness

4. **Address Feedback**: If changes are requested, update your project and comment on the issue

5. **Approval and Addition**: Once approved, your item will be added to the marketplace

### 4. Review Criteria

Submissions are evaluated based on:

- **Security**: Code is secure and doesn't pose risks to users
- **Quality**: Well-written, maintainable code
- **Documentation**: Clear setup and usage instructions
- **Usefulness**: Provides value to the Roo Code community
- **Maintenance**: Active maintenance and support

### 5. Marketplace Guidelines

- Items must be family-friendly and appropriate for professional use
- No malicious code or security vulnerabilities
- Respect intellectual property and licensing requirements
- Follow the MCP protocol specification for MCP servers
- Provide accurate and honest descriptions

## Example Submissions

### MCP Server Example

```yaml
name: "Daft.ie MCP Server"
description: "MCP server for searching rental properties on Daft.ie (Irish rental website)"
author: "Amine Remache"
authorUrl: "https://github.com/amineremache"
url: "https://github.com/amineremache/daft-ie-mcp"
tags: ["real-estate", "rental", "ireland", "property-search"]
prerequisites:
    - "Node.js 18 or higher"
    - "npm or yarn package manager"
```

### Mode Example

```yaml
name: "Real Estate Analyst"
description: "Specialized mode for analyzing real estate data and market trends"
author: "Community Contributor"
tags: ["real-estate", "analysis", "data"]
content: |
    name: "🏠 Real Estate Analyst"
    slug: "real-estate-analyst"
    description: "I am a real estate analyst specialized in property market analysis..."
```

## Support

If you have questions about the submission process:

- Join our [Discord community](https://discord.gg/roocode)
- Create a discussion in the [GitHub repository](https://github.com/RooCodeInc/Roo-Code/discussions)
- Review existing marketplace submissions for examples

## Maintenance

Once your item is in the marketplace:

- Keep your repository updated and maintained
- Respond to user issues and questions
- Update documentation as needed
- Notify the Roo Code team of major changes

Thank you for contributing to the Roo Code marketplace!
