const fs = require('fs');
const path = require('path');
const chalk = require('chalk');
const postmanToOpenApi = require('postman-to-openapi');

// Ensure fetch is available in Node.js versions that don't have it built-in
let fetch;
try {
    fetch = globalThis.fetch;
} catch {
    throw new Error('This tool requires Node.js version 18 or later with built-in fetch support');
}

const API_BASE = 'https://api.getpostman.com';
const DEBUG = process.env.DEBUG === 'true' || process.env.DEBUG === '1';

function debug(...args) {
    if (!DEBUG) return;
    console.log(chalk.blue('🔍 [DEBUG]'), ...args);
    if (args[1] && typeof args[1] === 'object') {
        console.log(JSON.stringify(args[1], null, 2));
    }
}

function cleanWorkspaceId(id) {
    if (!id) return id;
    // Remove any prefixes and clean up the ID
    return id.replace(/^(workspace-|workspace:|workspace\/|workspaces\/)/i, '').trim();
}

async function makeApiRequest(url, apiKey, options = {}) {
    debug(`Making request to: ${url}`);
    
    try {
        const response = await fetch(url, {
            method: options.method || 'GET',
            headers: {
                'X-Api-Key': apiKey,
                'Accept': 'application/json',
                ...options.headers
            },
            ...(options.body && { body: options.body })
        });

        debug('Response status:', response.status);
        debug('Response headers:', Object.fromEntries(response.headers));

        const data = await response.json();
        debug('Response data:', data);

        if (!response.ok) {
            const error = new Error(data.error ? `${data.error.name}: ${data.error.message}` : `HTTP ${response.status}`);
            error.status = response.status;
            error.response = data;
            throw error;
        }

        return data;
    } catch (error) {
        debug('Request failed:', {
            error: error.message,
            status: error.status,
            response: error.response
        });
        throw error;
    }
}

async function getAllWorkspaces(apiKey) {
    try {
        debug('Fetching workspaces');
        const data = await makeApiRequest(
            `${API_BASE}/workspaces`,
            apiKey
        );
        
        if (!data.workspaces || !Array.isArray(data.workspaces)) {
            debug('Invalid workspace data:', data);
            throw new Error('Invalid workspace data received from API');
        }
        
        debug('Found workspaces:', data.workspaces.length);
        return data.workspaces;
    } catch (error) {
        throw new Error(`Failed to fetch workspaces: ${error.message}`);
    }
}

async function validateWorkspace(workspaceId, apiKey) {
    try {
        const cleanId = cleanWorkspaceId(workspaceId);
        debug(`Validating workspace: ${cleanId}`);
        
        const data = await makeApiRequest(
            `${API_BASE}/workspaces/${cleanId}`,
            apiKey
        );
        
        if (!data.workspace) {
            debug('Invalid workspace response:', data);
            throw new Error('Invalid workspace data received from API');
        }
        
        debug('Workspace validated:', {
            id: data.workspace.id,
            name: data.workspace.name
        });
        
        return data.workspace;
    } catch (error) {
        if (error.status === 401) {
            throw new Error('Invalid API key or insufficient permissions');
        } else if (error.status === 404) {
            throw new Error(`Workspace not found: ${workspaceId}`);
        }
        throw error;
    }
}

async function getWorkspaceCollections(workspaceId, apiKey) {
    try {
        const cleanId = cleanWorkspaceId(workspaceId);
        debug(`Fetching collections for workspace: ${cleanId}`);
        
        // Get workspace data which includes collections
        const data = await makeApiRequest(
            `${API_BASE}/workspaces/${cleanId}`,
            apiKey
        );

        if (!data.workspace) {
            debug('Invalid workspace response:', data);
            throw new Error('Invalid workspace data received from API');
        }

        const workspace = data.workspace;
        debug('Workspace details:', {
            id: workspace.id,
            name: workspace.name,
            type: workspace.type
        });

        if (!workspace.collections || !Array.isArray(workspace.collections)) {
            debug('No collections found in workspace data:', workspace);
            throw new Error('No collections found in workspace');
        }

        debug(`Found ${workspace.collections.length} collections:`, 
            workspace.collections.map(c => ({
                id: c.uid || c.id,
                name: c.name
            }))
        );
        
        return workspace.collections;
    } catch (error) {
        debug('Failed to fetch collections:', {
            error: error.message,
            status: error.status,
            response: error.response,
            stack: error.stack
        });
        throw new Error(`Failed to fetch collections: ${error.message}`);
    }
}

async function getOpenApiDefinition(collectionId, apiKey) {
    try {
        debug(`Getting OpenAPI definition for collection: ${collectionId}`);
        
        // First get the collection
        debug('Getting collection...');
        const collectionData = await makeApiRequest(
            `${API_BASE}/collections/${collectionId}`,
            apiKey
        );

        if (!collectionData || !collectionData.collection) {
            debug('No collection data received');
            throw new Error('Failed to get collection');
        }

        // Save collection to a temporary file
        const tempFile = path.join(process.cwd(), `temp-${collectionId}.json`);
        const outputFile = path.join(process.cwd(), `openapi-${collectionId}.json`);
        
        try {
            // Save the collection
            fs.writeFileSync(tempFile, JSON.stringify(collectionData, null, 2));
            
            // Convert to OpenAPI
            debug('Converting to OpenAPI...');
            await postmanToOpenApi(
                tempFile,
                outputFile,
                {
                    defaultTag: collectionData.collection.info.name,
                    outputFormat: 'json'
                }
            );

            // Read the converted file
            const openApiData = JSON.parse(fs.readFileSync(outputFile, 'utf8'));
            
            // Cleanup temporary files
            fs.unlinkSync(tempFile);
            fs.unlinkSync(outputFile);
            
            return openApiData;
        } catch (error) {
            debug('Conversion failed:', error);
            // Cleanup temporary files if they exist
            if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
            if (fs.existsSync(outputFile)) fs.unlinkSync(outputFile);
            throw error;
        }
    } catch (error) {
        debug('Export failed:', error);
        throw new Error(`Failed to export collection: ${error.message}`);
    }
}

async function exportWorkspace(workspaceId, outputDir, options = {}) {
    const {
        apiKey,
        ids = [],
        names = []
    } = options;

    if (!workspaceId || !apiKey) {
        throw new Error('Workspace ID and API key are required');
    }

    // Create output directory if it doesn't exist
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }

    try {
        // First validate the workspace and API key
        const workspace = await validateWorkspace(workspaceId, apiKey);
        debug(`Workspace validated: ${workspace.name}`);

        // Get all collections in the workspace
        const collections = await getWorkspaceCollections(workspaceId, apiKey);
        
        if (!collections || collections.length === 0) {
            throw new Error('No collections found in the workspace');
        }

        debug(`Found ${collections.length} collections`);

        // Filter collections based on IDs and names
        const filteredCollections = filterCollections(collections, ids, names);

        if (filteredCollections.length === 0) {
            throw new Error('No collections match the specified filters');
        }

        debug(`Exporting ${filteredCollections.length} collections...`);

        // Export each collection
        const results = [];
        for (const collection of filteredCollections) {
            debug(`\nExporting collection: ${collection.name} (${collection.uid})`);
            try {
                // Get the OpenAPI definition for this collection
                const openApiData = await getOpenApiDefinition(collection.uid, apiKey);
                
                // Save to file
                const outputFile = path.join(outputDir, `${collection.name.replace(/[^a-zA-Z0-9]/g, '_')}.json`);
                fs.writeFileSync(outputFile, JSON.stringify(openApiData, null, 2));
                debug(`✓ Saved to ${outputFile}`);
                
                results.push({ name: collection.name, success: true, file: outputFile });
            } catch (error) {
                console.error(`✗ Failed to export collection ${collection.name}: ${error.message}`);
                results.push({ name: collection.name, success: false, error: error.message });
            }
        }

        // Report summary
        const successful = results.filter(r => r.success).length;
        const failed = results.filter(r => !r.success).length;
        
        if (failed > 0) {
            console.log(`\nExport Summary:\nSuccessful: ${successful}\nFailed: ${failed}`);
            throw new Error('Some collections failed to export');
        }

        return results;
    } catch (error) {
        throw error;
    }
}

function filterCollections(collections, collectionIds, collectionNames) {
    if (!collections || !Array.isArray(collections)) {
        return [];
    }

    if (collectionIds.length === 0 && collectionNames.length === 0) {
        return collections;
    }

    return collections.filter(collection => {
        const matchesId = collectionIds.length === 0 || collectionIds.includes(collection.uid);
        const matchesName = collectionNames.length === 0 || 
            collectionNames.some(name => 
                collection.name.toLowerCase().includes(name.toLowerCase())
            );
        return matchesId || matchesName;
    });
}

module.exports = {
    exportWorkspace,
    getAllWorkspaces,
    getWorkspaceCollections
}; 