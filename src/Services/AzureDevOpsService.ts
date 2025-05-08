import * as azdev from 'azure-devops-node-api';
import { WorkItemTrackingApi } from 'azure-devops-node-api/WorkItemTrackingApi';
import { AzureDevOpsConfig, RawWorkItemResponse } from '../Interfaces/AzureDevOps';
import { getPersonalAccessTokenHandler, getNtlmHandler, getBasicHandler } from 'azure-devops-node-api/WebApi';
import * as VsoBaseInterfaces from 'azure-devops-node-api/interfaces/common/VsoBaseInterfaces';
import { DefaultAzureCredential, AccessToken } from "@azure/identity";
import { IRequestHandler, IHttpClientResponse, IRequestInfo, IHttpClient } from "azure-devops-node-api/interfaces/common/VsoBaseInterfaces";

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
            } catch (error: any) {
                console.error("Failed to acquire token from Azure Identity:", error);
                throw new Error(`Failed to acquire token from Azure Identity: ${error.message}`);
            }
        }
        if (!this.token) {
            throw new Error("Acquired token is null or undefined from Azure Identity.");
        }
        return this.token.token;
    }

    public prepareRequest = async (options: VsoBaseInterfaces.IRequestOptions): Promise<void> => {
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

export class AzureDevOpsService {
  protected connection: azdev.WebApi;
  protected config: AzureDevOpsConfig;

  constructor(config: AzureDevOpsConfig) {
    this.config = config;
    
    // Get the appropriate authentication handler
    let authHandler: IRequestHandler;

    if (config.auth?.type === 'entra') {
        if (config.isOnPremises) {
             throw new Error('Azure Identity (DefaultAzureCredential) authentication is not supported for on-premises Azure DevOps.');
        }
        authHandler = new AzureIdentityCredentialHandler();
    } else if (config.isOnPremises && config.auth) {
      switch (config.auth.type) {
        case 'ntlm':
          if (!config.auth.username || !config.auth.password) {
            throw new Error('NTLM authentication requires username and password');
          }
          authHandler = getNtlmHandler(
            config.auth.username,
            config.auth.password,
            config.auth.domain
          );
          break;
        case 'basic':
          if (!config.auth.username || !config.auth.password) {
            throw new Error('Basic authentication requires username and password');
          }
          authHandler = getBasicHandler(
            config.auth.username,
            config.auth.password
          );
          break;
        case 'pat':
        default: // Default to PAT for on-premises if auth type is missing or unrecognized
          if (!config.personalAccessToken) {
            throw new Error('PAT authentication requires a personal access token for on-premises if specified or as fallback.');
          }
          authHandler = getPersonalAccessTokenHandler(config.personalAccessToken);
      }
    } else { // Cloud environment, and not 'entra'
      if (config.auth?.type === 'pat' || !config.auth) { // Explicitly PAT or no auth specified (defaults to PAT for cloud)
        if (!config.personalAccessToken) {
          throw new Error('Personal Access Token is required for cloud authentication when auth type is PAT or not specified.');
        }
        authHandler = getPersonalAccessTokenHandler(config.personalAccessToken);
      } else {
        // This case should ideally not be reached if config is validated correctly
        throw new Error(`Unsupported authentication type "${config.auth?.type}" for Azure DevOps cloud.`);
      }
    }

    // Create the connection with the appropriate base URL
    let baseUrl = config.orgUrl;
    if (config.isOnPremises && config.collection) {
      // For on-premises, ensure the collection is included in the URL
      baseUrl = `${config.orgUrl}/${config.collection}`;
    }

    // Create options for the WebApi
    const requestOptions: VsoBaseInterfaces.IRequestOptions = {};
    
    // For on-premises with API version specification, we'll add it to request headers
    if (config.isOnPremises && config.apiVersion) {
      requestOptions.headers = {
        'Accept': `application/json;api-version=${config.apiVersion}`
      };
    }

    // Create the WebApi instance
    this.connection = new azdev.WebApi(baseUrl, authHandler, requestOptions);
  }

  /**
   * Get the WorkItemTracking API client
   */
  protected async getWorkItemTrackingApi(): Promise<WorkItemTrackingApi> {
    return await this.connection.getWorkItemTrackingApi();
  }

  /**
   * List work items based on a WIQL query
   */
  public async listWorkItems(wiqlQuery: string): Promise<RawWorkItemResponse> {
    try {
      const witApi = await this.getWorkItemTrackingApi();
      
      // Execute the WIQL query
      const queryResult = await witApi.queryByWiql({
        query: wiqlQuery
      }, {
        project: this.config.project
      });
      
      // Return the work items
      return {
        workItems: queryResult.workItems || [],
        count: queryResult.workItems?.length || 0
      };
    } catch (error) {
      console.error('Error listing work items:', error);
      throw error;
    }
  }
}
