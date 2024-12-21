const { exportWorkspace } = require('./exporter');
const fs = require('fs');
const path = require('path');

// Mock the fetch function
global.fetch = jest.fn();

// Mock child_process.execSync
jest.mock('child_process', () => ({
    execSync: jest.fn()
}));

// Mock fs functions
jest.mock('fs', () => ({
    existsSync: jest.fn(),
    mkdirSync: jest.fn()
}));

describe('exportWorkspace', () => {
    beforeEach(() => {
        // Clear all mocks before each test
        jest.clearAllMocks();
        
        // Default mock implementations
        fs.existsSync.mockReturnValue(false);
        global.fetch.mockResolvedValue({
            ok: true,
            json: () => Promise.resolve({
                collections: [
                    { uid: 'col1', name: 'Collection 1' },
                    { uid: 'col2', name: 'Collection 2' }
                ]
            })
        });
    });

    test('should throw error if workspace ID or API key is missing', async () => {
        await expect(exportWorkspace()).rejects.toThrow('Workspace ID and API key are required');
        await expect(exportWorkspace('workspace')).rejects.toThrow('Workspace ID and API key are required');
    });

    test('should create output directory if it does not exist', async () => {
        const outputDir = './test-output';
        await exportWorkspace('workspace', outputDir, { apiKey: 'test-key' });
        expect(fs.existsSync).toHaveBeenCalledWith(outputDir);
        expect(fs.mkdirSync).toHaveBeenCalledWith(outputDir, { recursive: true });
    });

    test('should fetch and filter collections by ID', async () => {
        const options = {
            apiKey: 'test-key',
            ids: ['col1']
        };

        await exportWorkspace('workspace', './output', options);
        
        expect(global.fetch).toHaveBeenCalledWith(
            'https://api.getpostman.com/workspaces/workspace/collections',
            expect.any(Object)
        );
    });

    test('should fetch and filter collections by name', async () => {
        const options = {
            apiKey: 'test-key',
            names: ['Collection 1']
        };

        await exportWorkspace('workspace', './output', options);
        
        expect(global.fetch).toHaveBeenCalledWith(
            'https://api.getpostman.com/workspaces/workspace/collections',
            expect.any(Object)
        );
    });

    test('should handle API errors gracefully', async () => {
        global.fetch.mockResolvedValueOnce({
            ok: false,
            statusText: 'Not Found',
            json: () => Promise.resolve({
                error: { message: 'Workspace not found' }
            })
        });

        await expect(
            exportWorkspace('invalid-workspace', './output', { apiKey: 'test-key' })
        ).rejects.toThrow('Failed to fetch collections: Not Found. Workspace not found');
    });

    test('should handle network errors gracefully', async () => {
        global.fetch.mockRejectedValueOnce({ code: 'ENOTFOUND' });

        await expect(
            exportWorkspace('workspace', './output', { apiKey: 'test-key' })
        ).rejects.toThrow('Network error: Unable to connect to Postman API');
    });
}); 