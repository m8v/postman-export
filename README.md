# Postman OpenAPI Exporter

A command-line tool to export Postman collections to OpenAPI format.

## Requirements

- Node.js >= 18.0.0 (for built-in fetch support)
- Postman API key with appropriate permissions
- Access to at least one Postman workspace

## Getting a Postman API Key

1. Log in to your Postman account
2. Go to [Postman API Keys](https://go.postman.co/settings/me/api-keys)
3. Click "Generate API Key"
4. Give your key a name (e.g., "OpenAPI Exporter")
5. Set the appropriate permissions:
   - Workspace: Read access
   - Collections: Read access
   - API Definitions: Read access
6. Click "Generate API Key" and save the key securely

## Installation

### Local Development
```bash
# Install dependencies
npm install

# Make the script executable
chmod +x src/index.js

# Create .env file with your API keys (optional)
echo "POSTMAN_API_KEY=your-api-key" > .env
echo "DEBUG_API_KEY=your-debug-api-key" >> .env
```

### Global Installation
To use the tool globally from anywhere:
```bash
# Install globally from the project directory
npm install -g .
```

## Environment Variables

The tool supports the following environment variables:

- `POSTMAN_API_KEY`: Default API key to use when not provided via command line
- `DEBUG_API_KEY`: API key to use when running in debug mode
- `DEBUG`: Set to 'true' or '1' to enable debug mode

You can set these in a `.env` file in the project root:

```env
POSTMAN_API_KEY=your-api-key
DEBUG_API_KEY=your-debug-api-key
DEBUG=true
```

## Usage

You can run the tool in interactive or non-interactive mode:

### Interactive Mode

If installed locally:
```bash
./src/index.js
```

If installed globally:
```bash
postman-export
```

The tool will guide you through:
1. Ask for your Postman API key (or use from .env)
2. Show a searchable list of your workspaces
   ```
   ? Select a workspace (type to search): 
   > My Team Workspace - Main development workspace
     Client Project - API documentation
     Personal - Testing and experiments
   ```
   - Type to search by workspace name or description
   - Press enter to select

3. Show a searchable list of collections in the selected workspace
   ```
   ? Select collections to export (type to search, space to select, enter to confirm): 
   ◯ User API
   ◯ Authentication Service
   ◯ Payment Processing
   ```
   - Type to search by collection name
   - Use space bar to select/deselect collections
   - Selected collections are marked with ◉
   - Press enter when done

4. Ask for the output directory

### Non-Interactive Mode

Local:
```bash
./src/index.js --no-interactive \
  -w <workspace-id> \
  -k <api-key> \
  -o <output-dir> \
  [-i <collection-ids>] \
  [-n <collection-names>]
```

Global:
```bash
postman-export --no-interactive \
  -w <workspace-id> \
  -k <api-key> \
  -o <output-dir> \
  [-i <collection-ids>] \
  [-n <collection-names>]
```

### Debug Mode

To enable detailed logging and error messages, use one of these methods:

1. Use the debug flag (will use DEBUG_API_KEY from .env):
```bash
./src/index.js --debug
```

2. Set the DEBUG environment variable:
```bash
DEBUG=true ./src/index.js
# or
export DEBUG=true
./src/index.js
```

Debug mode will show:
- API request details
- Response status codes
- Detailed error messages
- Stack traces on errors
- Data validation issues

#### Options

- `-w, --workspace`: Postman workspace ID (required)
- `-k, --api-key`: Postman API key (required if not in .env)
- `-o, --output`: Output directory (defaults to ./openapi-exports)
- `-i, --ids`: Comma-separated list of collection IDs to export
- `-n, --names`: Comma-separated list of collection names to export
- `--no-interactive`: Run in non-interactive mode
- `-d, --debug`: Enable debug mode (uses DEBUG_API_KEY from .env)

## Features

- Interactive workspace selection
  - Search by name or description
  - Clear display of workspace info
  - Single-select interface
- Interactive collection selection
  - Search by name
  - Multi-select with space bar
  - Visual feedback for selected items
  - Shows selection count
- Export collections to OpenAPI format
- Filter collections by ID or name
- Progress indicators and colorful output
- Detailed error messages and export summary
- Debug mode for troubleshooting

## Examples

1. Interactive mode with search:
```bash
postman-export
# Then type to search workspaces and collections
```

2. Export specific collections by name:
```bash
postman-export -w your-workspace-id -n "User API,Auth Service"
```

3. Export specific collections by ID:
```bash
postman-export -w your-workspace-id -i "abc123,def456"
```

4. Debug mode with custom output directory:
```bash
postman-export --debug -o ./my-exports
```

## Troubleshooting

### Common Issues

1. **"Invalid API key or insufficient permissions"**
   - Check that your API key is correct
   - Ensure your API key has the required permissions (Workspace, Collections, and API Definitions access)
   - Try running with --debug flag for more details

2. **"Workspace not found"**
   - Verify the workspace ID
   - Ensure you have access to the workspace
   - Try using interactive mode to select the workspace
   - Enable debug mode to see the API response

3. **"No collections found"**
   - Verify that the workspace contains collections
   - Check your API key permissions
   - Run with --debug to see the API response

4. **"Failed to get OpenAPI definition"**
   - Ensure the collection has a valid API structure
   - Some collections might not be exportable to OpenAPI format
   - Use debug mode to see the detailed error message