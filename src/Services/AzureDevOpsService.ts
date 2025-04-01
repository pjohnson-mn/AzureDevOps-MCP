import * as azdev from 'azure-devops-node-api';
import { WorkItemTrackingApi } from 'azure-devops-node-api/WorkItemTrackingApi';
import { AzureDevOpsConfig, RawWorkItemResponse } from '../Interfaces/AzureDevOps';
import { getPersonalAccessTokenHandler, getNtlmHandler, getBasicHandler } from 'azure-devops-node-api/WebApi';
import * as VsoBaseInterfaces from 'azure-devops-node-api/interfaces/common/VsoBaseInterfaces';

export class AzureDevOpsService {
  protected connection: azdev.WebApi;
  protected config: AzureDevOpsConfig;

  constructor(config: AzureDevOpsConfig) {
    this.config = config;
    
    // Get the appropriate authentication handler
    let authHandler;
    if (config.isOnPremises && config.auth) {
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
        default:
          if (!config.personalAccessToken) {
            throw new Error('PAT authentication requires a personal access token');
          }
          authHandler = getPersonalAccessTokenHandler(config.personalAccessToken);
      }
    } else {
      // Default to PAT for cloud or when no auth type is specified
      if (!config.personalAccessToken) {
        throw new Error('Personal Access Token is required for authentication');
      }
      authHandler = getPersonalAccessTokenHandler(config.personalAccessToken);
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