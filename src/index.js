#!/usr/bin/env node
require('dotenv').config();
const { program } = require('commander');
const inquirer = require('inquirer');
const chalk = require('chalk');
const ora = require('ora');
const { exportWorkspace, getAllWorkspaces, getWorkspaceCollections } = require('./exporter');

// Register inquirer prompts
inquirer.registerPrompt('search-list', require('inquirer-search-list'));
inquirer.registerPrompt('checkbox-plus', require('inquirer-checkbox-plus-prompt'));

function displayWelcomeBanner() {
    const title = 'Postman OpenAPI Exporter';
    const version = 'Version 1.1.0';
    const author = '@m8v';
    
    // Box width is determined by the longest line (title)
    const boxWidth = title.length + 4; // 4 = 2 spaces padding + 2 borders
    const line = '─'.repeat(boxWidth - 2);
    
    // Center-align shorter lines
    const versionPadding = ' '.repeat(boxWidth - version.length - 3);
    const authorPadding = ' '.repeat(boxWidth - author.length - 3);
    
    console.log('\n' + chalk.bold.cyan(`╭${line}╮`));
    console.log(chalk.bold.cyan('│ ') + chalk.bold.yellow(title) + chalk.bold.cyan(' │'));
    console.log(chalk.bold.cyan('│ ') + chalk.bold.white(version) + chalk.bold.cyan(versionPadding + '│'));
    console.log(chalk.bold.cyan('│ ') + chalk.bold.magenta(author) + chalk.bold.cyan(authorPadding + '│'));
    console.log(chalk.bold.cyan(`╰${line}╯\n`));
}

async function selectWorkspace(apiKey) {
    const spinner = ora('Fetching workspaces...').start();
    try {
        const workspaces = await getAllWorkspaces(apiKey);
        spinner.stop();

        if (!workspaces || workspaces.length === 0) {
            throw new Error('No workspaces found for this API key');
        }

        const { workspace } = await inquirer.prompt({
            type: 'search-list',
            name: 'workspace',
            message: 'Select a workspace (type to search):',
            choices: workspaces.map(ws => ({
                name: `${ws.name}${ws.description ? ` - ${ws.description}` : ''}`,
                value: ws.id || ws._postman_id,
                short: ws.name
            })),
            searchable: true,
            source: async (answersSoFar, input) => {
                if (!input) return workspaces.map(ws => ({
                    name: `${ws.name}${ws.description ? ` - ${ws.description}` : ''}`,
                    value: ws.id || ws._postman_id,
                    short: ws.name
                }));

                return workspaces
                    .filter(ws => 
                        ws.name.toLowerCase().includes(input.toLowerCase()) ||
                        (ws.description && ws.description.toLowerCase().includes(input.toLowerCase()))
                    )
                    .map(ws => ({
                        name: `${ws.name}${ws.description ? ` - ${ws.description}` : ''}`,
                        value: ws.id || ws._postman_id,
                        short: ws.name
                    }));
            }
        });

        return workspace;
    } catch (error) {
        spinner.fail('Failed to fetch workspaces');
        console.error('\nError details:', error);
        throw error;
    }
}

async function selectCollections(workspaceId, apiKey) {
    const spinner = ora('Fetching collections...').start();
    try {
        const collections = await getWorkspaceCollections(workspaceId, apiKey);
        spinner.stop();

        if (!collections || collections.length === 0) {
            throw new Error('No collections found in this workspace');
        }

        const { selectedCollections } = await inquirer.prompt({
            type: 'checkbox-plus',
            name: 'selectedCollections',
            message: 'Select collections to export (type to search, space to select, enter to confirm):',
            choices: collections.map(col => ({
                name: col.name,
                value: col.uid,
                short: col.name,
                checked: false
            })),
            searchable: true,
            highlight: true,
            source: async (answersSoFar, input) => {
                if (!input) return collections.map(col => ({
                    name: col.name,
                    value: col.uid,
                    short: col.name,
                    checked: false
                }));

                return collections
                    .filter(col => col.name.toLowerCase().includes(input.toLowerCase()))
                    .map(col => ({
                        name: col.name,
                        value: col.uid,
                        short: col.name,
                        checked: false
                    }));
            }
        });

        return selectedCollections;
    } catch (error) {
        spinner.fail('Failed to fetch collections');
        throw error;
    }
}

async function promptForMissingOptions(options) {
    const questions = [];
    
    // In debug mode, use the debug API key from .env
    if (options.debug && process.env.DEBUG_API_KEY) {
        options.apiKey = process.env.DEBUG_API_KEY;
        console.log(chalk.yellow('Using debug API key from environment'));
    }
    
    if (!options.apiKey) {
        questions.push({
            type: 'password',
            name: 'apiKey',
            message: 'Enter your Postman API key:',
            validate: input => input.trim().length > 0,
            default: process.env.POSTMAN_API_KEY // Use default API key if available
        });
    }

    if (!options.output) {
        questions.push({
            type: 'input',
            name: 'output',
            message: 'Enter output directory:',
            default: './openapi-exports'
        });
    }

    const answers = await inquirer.prompt(questions);
    const apiKey = options.apiKey || answers.apiKey;

    // Interactive workspace selection
    const workspaceId = options.workspace || await selectWorkspace(apiKey);

    // Interactive collection selection if no filters provided
    let ids = options.ids || [];
    let names = options.names || [];

    if (!options.ids && !options.names) {
        ids = await selectCollections(workspaceId, apiKey);
    }

    return {
        ...options,
        workspace: workspaceId,
        apiKey: apiKey,
        output: options.output || answers.output,
        ids: ids,
        names: names
    };
}

program
    .name('postman-export')
    .description('Export Postman collections to OpenAPI format')
    .version('1.1.0')
    .option('-w, --workspace <id>', 'Postman workspace ID')
    .option('-k, --api-key <key>', 'Postman API key')
    .option('-o, --output <dir>', 'Output directory')
    .option('-i, --ids <ids>', 'Collection IDs (comma-separated)')
    .option('-n, --names <names>', 'Collection names (comma-separated)')
    .option('--no-interactive', 'Disable interactive prompts')
    .option('-d, --debug', 'Enable debug mode')
    .action(async (options) => {
        try {
            displayWelcomeBanner();

            // Set debug mode if flag is present
            if (options.debug) {
                process.env.DEBUG = 'true';
            }

            // If interactive mode and missing required options, prompt for them
            if (options.interactive) {
                options = await promptForMissingOptions(options);
            } else {
                // Validate required fields in non-interactive mode
                if (!options.workspace) {
                    console.error(chalk.red('Error: Workspace ID is required in non-interactive mode'));
                    process.exit(1);
                }
                if (!options.apiKey) {
                    console.error(chalk.red('Error: Postman API key is required in non-interactive mode'));
                    process.exit(1);
                }
                
                // Process command line IDs and names
                if (options.ids) {
                    options.ids = options.ids
                        .replace(/[\n\r]+/g, ',')
                        .split(',')
                        .map(id => id.trim())
                        .filter(Boolean);
                }
                if (options.names) {
                    options.names = options.names
                        .replace(/[\n\r]+/g, ',')
                        .split(',')
                        .map(name => name.trim())
                        .filter(Boolean);
                }
            }

            const spinner = ora('Exporting collections...').start();

            const results = await exportWorkspace(
                options.workspace,
                options.output || './openapi-exports',
                {
                    apiKey: options.apiKey,
                    ids: options.ids || [],
                    names: options.names || []
                }
            );

            spinner.succeed(chalk.green('Export completed successfully!'));
            
            // Log successful exports
            if (results && results.length > 0) {
                console.log('\nExported collections:');
                results.forEach(result => {
                    if (result.success) {
                        console.log(chalk.green(`✓ ${result.name}`));
                    } else {
                        console.log(chalk.red(`✗ ${result.name}: ${result.error}`));
                    }
                });
            }
        } catch (error) {
            console.error(chalk.red('Export failed:'), error.message);
            if (process.env.DEBUG === 'true') {
                console.error(chalk.gray('Debug stack trace:'), error.stack);
            }
            process.exit(1);
        }
    });

program.parse(); 