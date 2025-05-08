# Plan: Implement DefaultAzureCredential Authentication for Azure DevOps

This document outlines the plan to add a new authentication method using `DefaultAzureCredential` from the `@azure/identity` library to the AzureDevOps-MCP project.

## 1. Project Understanding

- **Current Authentication:** The project currently supports Personal Access Token (PAT), NTLM, and Basic authentication for Azure DevOps, configured via environment variables in `src/config.ts` and implemented in `src/Services/AzureDevOpsService.ts` using handlers from `azure-devops-node-api`.
- **Target Authentication:** `DefaultAzureCredential` allows authenticating using various mechanisms like environment variables, managed identity, Azure CLI, etc., simplifying credential management for Azure services. This is primarily for Azure DevOps Services (cloud), not on-premises.

## 2. Implementation Steps

### 2.1. Add Dependency ✅

- Add `@azure/identity` to the project's dependencies.
  - Modify `package.json`:
    ```json
    "dependencies": {
      // ... existing dependencies
      "@azure/identity": "^4.0.0" // Or latest stable version
    }
    ```
  - Run `npm install` or `yarn install`.

### 2.2. Update Interfaces (`src/Interfaces/AzureDevOps.ts`) ✅

- Define a new authentication type for Azure Identity.
- Update `AzureDevOpsAuthConfig` and `AzureDevOpsConfig` to include this new type.

```typescript
// In src/Interfaces/AzureDevOps.ts

// Add to existing auth type definitions
export type AzureDevOpsAuthType = 'pat' | 'ntlm' | 'basic' | 'entra';

export interface EntraAuth {
  type: 'entra';
}

// Update AzureDevOpsAuthConfig union type
export type AzureDevOpsAuthConfig = PatAuth | NtlmAuth | BasicAuth | EntraAuth;

// Ensure AzureDevOpsConfig can reflect this
export interface AzureDevOpsConfig {
  // ... existing fields
  auth?: AzureDevOpsAuthConfig; // Make auth optional or ensure it's always set
}
```

### 2.3. Update Configuration (`src/config.ts`) ✅

- Modify `getAzureDevOpsConfig()` to recognize and configure the `'entra'` authentication type.
- This will involve checking a new environment variable, e.g., `AZURE_DEVOPS_AUTH_TYPE=entra`.
- For `'entra'`, specific credentials like PAT or username/password will not be read from env vars, as `DefaultAzureCredential` handles credential discovery.

```typescript
// In src/config.ts in getAzureDevOpsConfig()

// ...
const authTypeInput = process.env.AZURE_DEVOPS_AUTH_TYPE || 'pat';
const authType = (authTypeInput === 'ntlm' || authTypeInput === 'basic' || authTypeInput === 'pat' || authTypeInput === 'entra')
  ? authTypeInput
  : 'pat';

let auth: AzureDevOpsConfig['auth'];

if (authType === 'entra') {
  if (isOnPremises) {
    throw new Error('Azure Identity (DefaultAzureCredential) authentication is not supported for on-premises Azure DevOps.');
  }
  auth = { type: 'entra' };
} else if (isOnPremises) {
  // ... existing NTLM, Basic, PAT logic for on-premises
} else {
  // Cloud: Default to PAT if not entra
  if (authType === 'pat') {
    if (!personalAccessToken) {
      throw new Error('PAT authentication requires a personal access token for Azure DevOps cloud unless AZURE_DEVOPS_AUTH_TYPE is set to entra.');
    }
    auth = { type: 'pat' };
  } else {
    // Should not happen if authType is validated correctly, but as a fallback:
     throw new Error(`Unsupported auth type "${authType}" for Azure DevOps cloud when not 'entra' or 'pat'.`);
  }
}
// ...
return {
  // ...
  ...(auth && { auth }) // Ensure auth is correctly passed
};
```

### 2.4. Update Service Layer (`src/Services/AzureDevOpsService.ts`) ✅

- Import `DefaultAzureCredential` from `@azure/identity`.
- Create a custom `IRequestHandler` for `azure-devops-node-api` that uses `DefaultAzureCredential` to obtain and manage Azure AD tokens.

```typescript
// In src/Services/AzureDevOpsService.ts
import { DefaultAzureCredential, AccessToken } from "@azure/identity";
import { IRequestHandler, WebRequest, IHttpClientResponse, IRequestInfo, IHttpClient } from "azure-devops-node-api/interfaces/common/VsoBaseInterfaces";
// ... other imports

// Custom Request Handler for Azure Identity
class AzureIdentityCredentialHandler implements IRequestHandler {
    private credential = new DefaultAzureCredential();
    // Azure DevOps Resource ID. Use 'https://app.vssps.visualstudio.com/.default' for broader compatibility if needed.
    private scope = "499b84ac-1321-427f-aa17-267ca6975798/.default"; 
    private token: AccessToken | null = null;

    private async ensureToken(forceRefresh: boolean = false): Promise<string> {
        if (forceRefresh) {
            this.token = null;
        }
        // Refresh if no token, token is expired, or nearing expiry (e.g., 5 minutes buffer)
        if (!this.token || this.token.expiresOnTimestamp < Date.now() + 300000) { 
            try {
                this.token = await this.credential.getToken(this.scope);
            } catch (error) {
                console.error("Failed to acquire token from Azure Identity:", error);
                throw new Error(`Failed to acquire token from Azure Identity: ${error.message}`);
            }
        }
        if (!this.token) {
            throw new Error("Acquired token is null or undefined from Azure Identity.");
        }
        return this.token.token;
    }

    public prepareRequest = async (options: WebRequest): Promise<void> => {
        const accessToken = await this.ensureToken();
        options.headers = {
            ...options.headers,
            'Authorization': `Bearer ${accessToken}`,
            // This header might be necessary for organizations connected to Azure AD
            // to ensure the token is correctly processed.
            'X-VSS-ForceMsaPassThrough': 'true' 
        };
    }

    public canHandleAuthentication(response: IHttpClientResponse): boolean {
        // If we get a 401, it means the token might have expired or was invalid.
        // We can attempt to refresh it.
        return response.message.statusCode === 401;
    }

    public async handleAuthentication(httpClient: IHttpClient, requestInfo: IRequestInfo, objs: any[]): Promise<any> {
        // Token was invalid, force a refresh for the next attempt.
        // The azure-devops-node-api's WebApi client will typically retry the request.
        await this.ensureToken(true); // Force refresh the token
        return; // Indicate authentication has been "handled" by refreshing the token
    }
}

// In AzureDevOpsService constructor:
constructor(config: AzureDevOpsConfig) {
    this.config = config;
    let authHandler: IRequestHandler;

    if (config.auth?.type === 'entra') {
        if (config.isOnPremises) {
             throw new Error('Azure Identity (DefaultAzureCredential) authentication is not supported for on-premises Azure DevOps.');
        }
        authHandler = new AzureIdentityCredentialHandler();
    } else if (config.isOnPremises && config.auth) {
      // ... existing NTLM, Basic, PAT logic for on-premises
    } else {
      // Cloud: Default to PAT if not entra
      if (!config.personalAccessToken) {
        throw new Error('Personal Access Token is required for Azure DevOps cloud unless AZURE_DEVOPS_AUTH_TYPE is set to entra.');
      }
      authHandler = getPersonalAccessTokenHandler(config.personalAccessToken);
    }
    // ... rest of the constructor (WebApi initialization)
    this.connection = new azdev.WebApi(baseUrl, authHandler, requestOptions);
}
```

### 2.5. Update Documentation ✅

- **README.md**: Explain the new `entra` authentication method.
  - Detail how `DefaultAzureCredential` works (order of credential lookup).
  - Provide examples of how to configure the environment for different scenarios (e.g., Azure CLI login, Service Principal environment variables: `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, `AZURE_CLIENT_SECRET`).
- **`.env.cloud.example`**: Add `AZURE_DEVOPS_AUTH_TYPE=entra` as an option.

```
# .env.cloud.example (snippet)
# ...
# Authentication Type: 'pat' (Personal Access Token) or 'entra'
AZURE_DEVOPS_AUTH_TYPE=entra

# For AZURE_DEVOPS_AUTH_TYPE=pat:
# AZURE_DEVOPS_PERSONAL_ACCESS_TOKEN=your_pat_here

# For AZURE_DEVOPS_AUTH_TYPE=entra, ensure your environment is configured
# for DefaultAzureCredential (e.g., logged in via Azure CLI `az login`, or
# environment variables like AZURE_CLIENT_ID, AZURE_TENANT_ID, AZURE_CLIENT_SECRET are set).
# No specific token needs to be set here for entra.
```

## 3. Testing Plan

### 3.1. Unit Tests

- Mock `DefaultAzureCredential` and its `getToken` method.
- Verify that `AzureDevOpsService` constructor correctly initializes `AzureIdentityCredentialHandler` when `authType` is `'entra'`.
- Test `AzureIdentityCredentialHandler`:
    - `prepareRequest` correctly adds the Authorization header.
    - Token caching and refresh logic in `ensureToken`.
    - `canHandleAuthentication` and `handleAuthentication` logic for 401 responses.

### 3.2. Integration Tests

- **Environment Setup**:
    - **Scenario 1: Azure CLI**: Log in using `az login` with an account that has access to the target Azure DevOps organization.
    - **Scenario 2: Service Principal**: Set environment variables (`AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, `AZURE_CLIENT_SECRET`) for a service principal with appropriate permissions on Azure DevOps.
    - **Scenario 3 (Optional): Managed Identity**: If running in an Azure environment that supports Managed Identities (e.g., Azure VM, App Service), configure it.
- **Test Cases**:
    - Configure the MCP with `AZURE_DEVOPS_AUTH_TYPE=entra`.
    - Execute existing tool functionalities that interact with Azure DevOps (e.g., `search_issues`, `get_issue`).
    - Verify successful connection and data retrieval.
    - Test token expiry and refresh if feasible (might be hard to simulate precisely without long-running tests).
- **Negative Tests**:
    - Attempt to use `entra` with an on-premises configuration (should throw an error).
    - Test scenarios where `DefaultAzureCredential` cannot find any credentials (should fail gracefully with an informative error).

### 3.3. Regression Testing

- Ensure existing authentication methods (PAT, NTLM, Basic) continue to function as expected.

## 4. Considerations

- **Error Handling**: Robust error handling is crucial, especially around token acquisition from `DefaultAzureCredential`.
- **Scope**: The Azure DevOps scope `499b84ac-1321-427f-aa17-267ca6975798/.default` is standard. If issues arise, `https://app.vssps.visualstudio.com/.default` can also be tried.
- **On-Premises**: Clearly document that `DefaultAzureCredential` is not for on-premises instances. The implementation should prevent its use with on-premises configurations.
- **`X-VSS-ForceMsaPassThrough` Header**: This header is often required when using Azure AD tokens with Azure DevOps to ensure the token is routed correctly, especially for organizations backed by Azure AD. It's included in the proposed `AzureIdentityCredentialHandler`.

This plan provides a comprehensive approach to integrating `DefaultAzureCredential`, enhancing the flexibility and security of Azure DevOps authentication within the MCP project.
