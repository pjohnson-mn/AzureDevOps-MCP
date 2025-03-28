import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { AzureDevOpsConfig } from './Interfaces/AzureDevOps';
import { AIAssistedDevelopmentToolMethods } from './Tools/AIAssistedDevelopmentTools';
import { ArtifactManagementToolMethods } from './Tools/ArtifactManagementTools';
import { BoardsSprintsToolMethods } from './Tools/BoardsSprintsTools';
import { DevSecOpsToolMethods } from './Tools/DevSecOpsTools';
import { GitToolMethods } from './Tools/GitTools';
import { ProjectToolMethods } from './Tools/ProjectTools';
import { TestingCapabilitiesToolMethods } from './Tools/TestingCapabilitiesTools';
import { WorkItemToolMethods } from './Tools/WorkItemTools';

// Try to load environment variables from .env file with multiple possible locations
function loadEnvFile() {
  // First try the current directory
  if (fs.existsSync('.env')) {
    dotenv.config();
    return;
  }
  
  // Try the directory of the running script
  const scriptDir = __dirname;
  const envPath = path.join(scriptDir, '..', '.env');
  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath });
    return;
  }

  // If we still haven't loaded env vars, try a few other common locations
  const possiblePaths = [
    // One level above the dist directory
    path.join(process.cwd(), '.env'),
    // User's home directory
    path.join(process.env.HOME || '', '.azuredevops.env')
  ];

  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      dotenv.config({ path: p });
      return;
    }
  }

  console.warn('No .env file found. Using environment variables if available.');
}

// Load environment variables
loadEnvFile();

/**
 * Get Azure DevOps configuration from environment variables
 */
export function getAzureDevOpsConfig(): AzureDevOpsConfig {
  const orgUrl = process.env.AZURE_DEVOPS_ORG_URL;
  const project = process.env.AZURE_DEVOPS_PROJECT;
  const personalAccessToken = process.env.AZURE_DEVOPS_PERSONAL_ACCESS_TOKEN;

  if (!orgUrl || !project || !personalAccessToken) {
    throw new Error('Missing required Azure DevOps configuration. Please check .env file or environment variables.');
  }

  return {
    orgUrl,
    project,
    personalAccessToken
  };
}

const ALL_ALLOWED_TOOLS = AIAssistedDevelopmentToolMethods
  .concat(ArtifactManagementToolMethods)
  .concat(BoardsSprintsToolMethods)
  .concat(DevSecOpsToolMethods)
  .concat(GitToolMethods)
  .concat(ProjectToolMethods)
  .concat(TestingCapabilitiesToolMethods)
  .concat(WorkItemToolMethods);

/**
 * Get allowed tools from `process.env.ALLOWED_TOOLS`.
 * 
 * For backward compatibility, if `process.env.ALLOWED_TOOLS` is `undefined`, all tools are allowed.
 */
export function getAllowedTools(): Set<string> {
  const ALLOWED_TOOLS = process.env.ALLOWED_TOOLS;
  if (!ALLOWED_TOOLS) return new Set(ALL_ALLOWED_TOOLS);
  const allowedTools = ALLOWED_TOOLS.split(',');
  return new Set(allowedTools);
}