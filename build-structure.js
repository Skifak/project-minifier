import fs from 'fs-extra';
import path from 'path';
import readline from 'readline';

// Constant for the directory where JSON project structure files will be stored
const JSON_DIR = 'json-project';

/**
 * Recursively parses the structure of a directory, creating an object with files and folders.
 * This function is used to build the project tree.
 *
 * @param {string} dir - Path to the directory to parse
 * @param {string} basePath - Base path of the project for calculating relative paths
 * @returns {Promise<object>} - Promise that resolves to an object representing the directory structure
 */
async function parseStructure(dir, basePath) {
    const structure = {}; // Object to store the structure of the current directory
    const files = await fs.readdir(dir); // Read the contents of the directory (list of files and folders)

    // Iterate over each item in the directory
    for (const file of files) {
        const filePath = path.join(dir, file); // Form the full path to the current item
        const stat = await fs.stat(filePath); // Get information about the file/folder (is it a directory or file)

        if (stat.isDirectory()) {
            // If it's a directory, recursively parse its contents
            structure[file] = await parseStructure(filePath, basePath);
        } else {
            // If it's a file, save its relative path in the structure object
            structure[file] = path.relative(basePath, filePath).replace(/\\/g, '/');
            // path.relative calculates the path relative to basePath; replace backslashes with forward slashes for consistency
        }
    }
    return structure; // Return the formed structure object
}

/**
 * Creates a JSON file representing the project structure.
 * Can scan the entire project or only specified files/folders.
 *
 * @param {string} basePath - Base path of the project (usually the current working directory)
 * @param {string[]} initialDirs - Array of directories for selective scanning (optional)
 * @param {string[]} initialFiles - Array of files for selective scanning (optional)
 * @param {boolean} scanAll - Flag: scan the entire project (true) or only specified items (false)
 * @returns {Promise<void>} - Promise that resolves after writing the JSON file
 */
async function buildStructureJSON(basePath, initialDirs = [], initialFiles = [], scanAll = false) {
    // Ensure the JSON directory exists (create it if it doesn't)
    await fs.ensureDir(JSON_DIR);
    const structure = {}; // Object to store the final project structure

    // Helper function to process a single item (file or directory)
    const processItem = async (itemPath, basePath) => {
        const stat = await fs.stat(itemPath); // Get information about the item
        const itemName = path.basename(itemPath); // Extract the name of the file or directory from the path

        if (stat.isDirectory()) {
            // If it's a directory and scanning is allowed (scanAll or included in initialDirs)
            if (scanAll || initialDirs.includes(itemName)) {
                structure[itemName] = await parseStructure(itemPath, basePath);
            }
        } else if (stat.isFile()) {
            // If it's a file and inclusion is allowed (scanAll or included in initialFiles)
            if (scanAll || initialFiles.includes(itemName)) {
                structure[itemName] = path.relative(basePath, itemPath).replace(/\\/g, '/');
            }
        }
    };

    // Full project scan mode
    if (scanAll) {
        const items = await fs.readdir(basePath); // Read all items in the base directory
        // List of directories to exclude from scanning (e.g., utility folders)
        const excludedDirs = [
            'dist', '.github', '.cursor', '.vscode', 'node_modules', 
            '.git', 'docker', 'json-project', 'docs', 'logs'
        ];

        // Process each item in the base directory
        for (const item of items) {
            const itemPath = path.join(basePath, item); // Full path to the item
            const itemName = path.basename(item); // Item name
            // Skip the item if it's in the exclusion list
            if (!excludedDirs.includes(itemName)) {
                await processItem(itemPath, basePath); // Process the item
            }
        }
    } else {
        // Selective scan mode (only specified files and directories)
        for (const dir of initialDirs) {
            const dirPath = path.join(basePath, dir); // Full path to the directory
            if (await fs.pathExists(dirPath)) {
                // If the directory exists, parse it
                structure[dir] = await parseStructure(dirPath, basePath);
            } else {
                console.warn(`Directory not found: ${dirPath}`); // Warning if the path is not found
            }
        }
        for (const file of initialFiles) {
            const filePath = path.join(basePath, file); // Full path to the file
            if (await fs.pathExists(filePath)) {
                // If the file exists, add it to the structure
                structure[path.basename(file)] = path.relative(basePath, filePath).replace(/\\/g, '/');
            } else {
                console.warn(`File not found: ${filePath}`); // Warning if the file is not found
            }
        }
    }

    // Minify the JSON (remove extra spaces) and write it to a file
    const structureJSON = JSON.stringify(structure).replace(/\s+/g, ' ');
    await fs.writeFile(path.join(JSON_DIR, 'project-structure.min.json'), structureJSON);
    console.log('project-structure.min.json created successfully!'); // Notification of successful creation
}

/**
 * Main function to start the structure-building process.
 * Prompts the user for the operating mode via the terminal.
 */
async function main() {
    // Create an interface for interacting with the user via the terminal
    const rl = readline.createInterface({
        input: process.stdin,  // Input from the keyboard
        output: process.stdout // Output to the terminal
    });

    // Helper function to ask the user a question
    const question = () => new Promise((resolve) => {
        rl.question(
            'Choose the scan mode:\n' +
            '1. Scan all project files\n' +
            '2. Scan only specified files and directories\n' +
            'Enter your choice (1 or 2): ',
            (answer) => {
                resolve(answer.trim()); // Remove extra spaces from the answer
                rl.close(); // Close the interface after input
            }
        );
    });

    const answer = await question(); // Wait for the user's response

    // Predefined directories and files for selective scanning
    const dirs = ['src', 'server', 'supabase/migrations'];
    const files = ['package.json', 'redis.conf', 'README.md', 'game_readme.md'];

    // Process the user's choice
    if (answer === '1') {
        // Full scan mode
        await buildStructureJSON(process.cwd(), [], [], true); // process.cwd() - current working directory
    } else if (answer === '2') {
        // Selective scan mode
        await buildStructureJSON(process.cwd(), dirs, files, false);
    } else {
        console.log('Invalid choice. Exiting.'); // Message for invalid input
    }
}

// Run the main function
main();

export { parseStructure, buildStructureJSON, main };