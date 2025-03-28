# Azure DevOps MCP Integration
[![smithery badge](https://smithery.ai/badge/@RyanCardin15/azuredevops-mcp)](https://smithery.ai/server/@RyanCardin15/azuredevops-mcp)

<a href="https://glama.ai/mcp/servers/z7mxfcinp8">
  <img width="380" height="200" src="https://glama.ai/mcp/servers/z7mxfcinp8/badge" />
</a>


A powerful integration for Azure DevOps that provides seamless access to work items, repositories, projects, boards, and sprints through the Model Context Protocol (MCP) server.

## Overview

This server provides a convenient API for interacting with Azure DevOps services, enabling AI assistants and other tools to manage work items, code repositories, boards, sprints, and more. Built with the Model Context Protocol, it provides a standardized interface for communicating with Azure DevOps.

## Demo
![Azure DevOps MCP Demo](AdoMcpDemo.gif)

## Features

The integration is organized into four main tool categories:

### Work Item Tools
- List work items using WIQL queries
- Get work item details by ID
- Search for work items
- Get recently updated work items
- Get your assigned work items
- Create new work items
- Update existing work items
- Add comments to work items
- Update work item state
- Assign work items
- Create links between work items
- Bulk create/update work items

### Boards & Sprints Tools
- Get team boards
- Get board columns
- Get board items
- Move cards on boards
- Get sprints
- Get the current sprint
- Get sprint work items
- Get sprint capacity
- Get team members

### Project Tools
- List projects
- Get project details
- Create new projects
- Get areas
- Get iterations
- Create areas
- Create iterations
- Get process templates
- Get work item types
- Get work item type fields

### Git Tools
- List repositories
- Get repository details
- Create repositories
- List branches
- Search code
- Browse repositories
- Get file content
- Get commit history
- List pull requests
- Create pull requests
- Get pull request details
- Get pull request comments
- Approve pull requests
- Merge pull requests

## Installation

### Installing via Smithery

To install azuredevops-mcp for Claude Desktop automatically via [Smithery](https://smithery.ai/server/@RyanCardin15/azuredevops-mcp):

```bash
npx -y @smithery/cli install @RyanCardin15/azuredevops-mcp --client claude
```

### Prerequisites
- Node.js (v16 or later)
- TypeScript (v4 or later)
- An Azure DevOps account with a Personal Access Token (PAT)

### Setup

1. Clone the repository:
   ```bash
   git clone <repository-url>
   cd AzureDevOps
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Configure environment variables (create a `.env` file or set them directly):
   ```
   AZURE_DEVOPS_ORG_URL=https://dev.azure.com/your-organization
   AZURE_DEVOPS_PERSONAL_ACCESS_TOKEN=your-personal-access-token
   AZURE_DEVOPS_PROJECT=your-default-project
   ```

4. Build the project:
   ```bash
   npm run build
   ```

   If you encounter TypeScript errors but want to proceed anyway:
   ```bash
   npm run build:ignore-errors
   ```

5. Start the server:
   ```bash
   npm run start
   ```

## Configuration

### Personal Access Token (PAT)

You'll need to create a Personal Access Token with appropriate permissions:

1. Go to your Azure DevOps organization
2. Click on your profile icon in the top right
3. Select "Personal access tokens"
4. Click "New Token"
5. Give it a name and select the appropriate scopes:
   - Work Items: Read & Write
   - Code: Read & Write
   - Project and Team: Read & Write
   - Build: Read
   - Release: Read

### Environment Variables

The server can be configured using the following environment variables:

| Variable | Description | Required | Default |
|----------|-------------|----------|---------|
| AZURE_DEVOPS_ORG_URL | URL of your Azure DevOps organization | Yes | - |
| AZURE_DEVOPS_PERSONAL_ACCESS_TOKEN | Your personal access token | Yes | - |
| AZURE_DEVOPS_PROJECT | Default project to use | Yes | - |
| ALLOWED_TOOLS | Allowed tools. Separate with comma | No | - (All tools allowed) |

## Usage

Once the server is running, you can interact with it using the MCP protocol. The server exposes several tools for different Azure DevOps functionalities.

### Available Tools

> **Note:** By default, only a subset of tools are registered in the `index.ts` file to keep the initial implementation simple. See the [Tool Registration](#tool-registration) section for information on how to register additional tools.

### Example: List Work Items

```json
{
  "tool": "listWorkItems",
  "params": {
    "query": "SELECT [System.Id], [System.Title], [System.State] FROM WorkItems WHERE [System.State] = 'Active' ORDER BY [System.CreatedDate] DESC"
  }
}
```

### Example: Create a Work Item

```json
{
  "tool": "createWorkItem",
  "params": {
    "workItemType": "User Story",
    "title": "Implement new feature",
    "description": "As a user, I want to be able to export reports to PDF.",
    "assignedTo": "john@example.com"
  }
}
```

### Example: List Repositories

```json
{
  "tool": "listRepositories",
  "params": {
    "projectId": "MyProject"
  }
}
```

### Example: Create a Pull Request

```json
{
  "tool": "createPullRequest",
  "params": {
    "repositoryId": "repo-guid",
    "sourceRefName": "refs/heads/feature-branch",
    "targetRefName": "refs/heads/main",
    "title": "Add new feature",
    "description": "This PR adds the export to PDF feature"
  }
}
```

## Architecture

The project is structured as follows:

- `src/`
  - `Interfaces/`: Type definitions for parameters and responses
  - `Services/`: Service classes for interacting with Azure DevOps APIs
  - `Tools/`: Tool implementations that expose functionality to clients
  - `index.ts`: Main entry point that registers tools and starts the server
  - `config.ts`: Configuration handling

### Service Layer

The service layer handles direct communication with the Azure DevOps API:

- `WorkItemService`: Work item operations
- `BoardsSprintsService`: Boards and sprints operations
- `ProjectService`: Project management operations
- `GitService`: Git repository operations

### Tools Layer

The tools layer wraps the services and provides a consistent interface for the MCP protocol:

- `WorkItemTools`: Tools for work item operations
- `BoardsSprintsTools`: Tools for boards and sprints operations
- `ProjectTools`: Tools for project management operations
- `GitTools`: Tools for Git operations

## Tool Registration

The MCP server requires tools to be explicitly registered in the `index.ts` file. By default, only a subset of all possible tools are registered to keep the initial implementation manageable.

To register more tools:

1. Open the `src/index.ts` file
2. Add new tool registrations following the pattern of existing tools
3. Build and restart the server

A comprehensive guide to tool registration is available in the `TOOL_REGISTRATION.md` file in the repository.

> **Note:** When registering tools, be careful to use the correct parameter types, especially for enum values. The type definitions in the `Interfaces` directory define the expected types for each parameter. Using the wrong type (e.g., using `z.string()` instead of `z.enum()` for enumerated values) will result in TypeScript errors during build.

Example of registering a new tool:

```typescript
server.tool("searchCode", 
  "Search for code in repositories",
  {
    searchText: z.string().describe("Text to search for"),
    repositoryId: z.string().optional().describe("ID of the repository")
  },
  async (params, extra) => {
    const result = await gitTools.searchCode(params);
    return {
      content: result.content,
      rawData: result.rawData,
      isError: result.isError
    };
  }
);
```

## Troubleshooting

### Common Issues

#### Authentication Errors
- Ensure your Personal Access Token is valid and has the required permissions
- Check that the organization URL is correct

#### TypeScript Errors During Build
- Use `npm run build:ignore-errors` to bypass TypeScript errors
- Check for missing or incorrect type definitions

#### Runtime Errors
- Verify that the Azure DevOps project specified exists and is accessible

## Contributing

Contributions are welcome! Here's how you can contribute:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

Please ensure your code passes linting and includes appropriate tests.
