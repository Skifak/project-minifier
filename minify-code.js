import fs from 'fs-extra';
import path from 'path';
import pkg from 'enquirer';
const { Select, Confirm, Input, prompt } = pkg;
import chalk from 'chalk';

// Constants for directories and paths
const SAVES_DIR = path.join('json-project', 'minify-saves'); // Directory for saved file selections
const JSON_DIR = 'json-project'; // Directory for JSON files
const GITIGNORE_PATH = '.gitignore'; // Path to the .gitignore file

/**
 * Removes ANSI codes (colors) from a string for correct text length calculation
 * @param {string} str - String with possible ANSI codes
 * @returns {string} - String without ANSI codes
 */
function stripAnsi(str) {
    return str.replace(/\x1B\[[0-9;]*m/g, ''); // Regular expression to remove ANSI sequences
}

/**
 * Main function for code minification.
 * Provides the user with a choice of actions: minification, loading saves, managing them, or exiting.
 */
async function minifyCode() {
    // Ensure the required directories exist
    await fs.ensureDir(JSON_DIR);
    await fs.ensureDir(SAVES_DIR);
    const saveFiles = await fs.readdir(SAVES_DIR); // Read the list of saved selections

    // Ask the user what they want to do
    const firstAction = await prompt({
        type: 'select',
        name: 'action',
        message: chalk.bold('What do you want to do?'), // Bold question
        choices: [
            { name: 'minify', message: 'Select files to minify' }, // Select files for minification
            { name: 'load', message: 'Load a saved selection' },   // Load a saved selection
            { name: 'manage', message: 'Manage saved selections' }, // Manage saved selections
            { name: 'exit', message: 'Exit' },                     // Exit the program
        ],
    });

    // Process the user's choice
    switch (firstAction.action) {
        case 'minify':
            // Read the project structure from JSON
            const structure = await fs.readJson(path.join(JSON_DIR, 'project-structure.min.json'));
            const filePaths = getFilePaths(structure); // Get the list of file paths
            const selectedFiles = await interactiveSelect(filePaths); // Interactive file selection
            if (selectedFiles && selectedFiles.length > 0) {
                // If files are selected, calculate total characters and minify
                const totalCharacters = await calculateTotalCharacters(selectedFiles);
                console.log(chalk.blue(`Total characters in selected files: ${totalCharacters} ; selected files: ${selectedFiles.length}`));
                await minifyAndSave(selectedFiles); // Minify and save
            } else {
                console.log(chalk.yellow('No files selected for minification.')); // Warning if nothing is selected
            }
            break;
        case 'load':
            if (saveFiles.length > 0) {
                await loadSave(saveFiles); // Load a saved selection if available
            } else {
                console.log(chalk.yellow('No saved selections found.')); // Message if no saves exist
            }
            break;
        case 'manage':
            if (saveFiles.length > 0) {
                await manageSaves(saveFiles); // Manage saved selections
            } else {
                console.log(chalk.yellow('No saved selections found to manage.')); // Message if no saves exist
            }
            break;
        case 'exit':
            console.log(chalk.gray('Exiting.')); // Exit the program
            break;
    }
}

/**
 * Calculates the total number of characters in the selected files.
 * @param {string[]} filePaths - Array of file paths
 * @returns {Promise<number>} - Total number of characters
 */
async function calculateTotalCharacters(filePaths) {
    let totalCharacters = 0;
    for (const filePath of filePaths) {
        try {
            const fileContent = await fs.readFile(filePath, 'utf-8'); // Read file contents
            totalCharacters += fileContent.length; // Add content length
        } catch (error) {
            console.error(chalk.red(`Error reading file: ${filePath}`), error); // Error reading file
        }
    }
    return totalCharacters;
}

/**
 * Minifies the contents of selected files and saves the result to JSON.
 * @param {string[]} selectedFiles - Array of paths to selected files
 */
async function minifyAndSave(selectedFiles) {
    const code = await readFiles(selectedFiles); // Read file contents
    const codeJSON = JSON.stringify(code); // Convert to JSON string
    const minifiedCodeJSON = codeJSON.replace(/\s+/g, ' '); // Remove extra spaces
    await fs.writeFile(path.join(JSON_DIR, 'project-code.min.json'), minifiedCodeJSON); // Write to file
    console.log(chalk.green('project-code.min.json created successfully!')); // Successful completion
}

/**
 * Loads a saved selection of files and performs minification.
 * @param {string[]} saveFiles - Array of saved file names
 */
async function loadSave(saveFiles) {
    const loadSavePrompt = new Select({
        name: 'selectedSave',
        message: chalk.bold('Select save to load:'),
        choices: [...saveFiles, chalk.bold('Back to main menu')], // Add back option
    });

    const selectedSave = await loadSavePrompt.run(); // Prompt user for choice

    if (!selectedSave || selectedSave === chalk.bold('Back to main menu')) {
        return; // Return to main menu
    }

    const savePath = path.join(SAVES_DIR, selectedSave); // Path to the saved selection
    const selectedFiles = await fs.readJson(savePath); // Read file list from save
    const totalCharacters = await calculateTotalCharacters(selectedFiles); // Calculate characters
    console.log(chalk.blue(`Total characters in selected files: ${totalCharacters} ; selected files: ${selectedFiles.length}`));
    await minifyAndSave(selectedFiles); // Minify and save
}

/**
 * Manages saved selections (view, delete).
 * @param {string[]} saveFiles - Array of saved file names
 */
async function manageSaves(saveFiles) {
    const managePrompt = new Select({
        name: 'saveAction',
        message: chalk.bold('Manage saved selections:'),
        choices: [
            ...saveFiles, // List of saves
            { name: 'delete', message: chalk.red('Delete a save') }, // Delete option
            { name: 'back', message: 'Back to main menu' }, // Back option
        ],
    });

    const selectedAction = await managePrompt.run(); // Prompt for choice

    if (selectedAction === 'delete') {
        await deleteSave(saveFiles); // Delete a save
    } else if (selectedAction !== 'back') {
        console.log(chalk.yellow(`Selected save: ${selectedAction}`)); // Show selected save
    }
}

/**
 * Deletes a selected save after confirmation.
 * @param {string[]} saveFiles - Array of saved file names
 */
async function deleteSave(saveFiles) {
    const deletePrompt = new Select({
        name: 'saveToDelete',
        message: chalk.bold(chalk.red('Select a save to delete:')),
        choices: [...saveFiles, chalk.bold('Cancel')], // Add cancel option
    });

    const saveToDelete = await deletePrompt.run(); // Prompt for choice

    if (saveToDelete && saveToDelete !== chalk.bold('Cancel')) {
        const confirmDelete = await prompt({
            type: 'confirm',
            name: 'confirm',
            message: chalk.bold(chalk.red(`Are you sure you want to delete ${saveToDelete}?`)),
            initial: false, // Default is "no"
        });

        if (confirmDelete.confirm) {
            const savePath = path.join(SAVES_DIR, saveToDelete); // Path to save file
            await fs.remove(savePath); // Remove the file
            console.log(chalk.green(`Deleted save: ${saveToDelete}`)); // Successful deletion
            const updatedSaveFiles = await fs.readdir(SAVES_DIR); // Update save list
            if (updatedSaveFiles.length > 0) {
                await manageSaves(updatedSaveFiles); // Continue managing if saves remain
            } else {
                console.log(chalk.yellow('No saved selections left.')); // Message if no saves remain
            }
        } else {
            console.log(chalk.gray('Delete cancelled.')); // Cancel deletion
            await manageSaves(saveFiles); // Return to management
        }
    } else if (saveToDelete !== chalk.bold('Cancel')) {
        await manageSaves(saveFiles); // Return to management
    }
}

/**
 * Interactive file selection for minification with .gitignore support and character counting.
 * @param {string[]} filePaths - Array of file paths
 * @returns {Promise<string[]>} - Array of selected files
 */
async function interactiveSelect(filePaths) {
    // Form the list of choices with colored display
    const choices = filePaths.map((filePath) => {
        const firstDir = filePath.split('/')[0]; // Extract first directory for color coding
        let color;

        // Determine color based on directory
        switch (firstDir) {
            case 'src': color = chalk.blue; break;
            case 'server': color = chalk.magenta; break;
            case 'supabase': color = chalk.yellow; break;
            case 'DOCUMENTATION': color = chalk.cyan; break;
            case 'alerts': color = chalk.green; break;
            case 'docs': color = chalk.redBright; break;
            case 'grafana': color = chalk.blueBright; break;
            case 'logs': color = chalk.magentaBright; break;
            case 'loki': color = chalk.yellowBright; break;
            case 'promtail': color = chalk.cyanBright; break;
            case 'prometheus': color = chalk.greenBright; break;
            case 'public': color = chalk.red; break;
            default: color = chalk.white; // Default color
        }

        return {
            name: filePath,       // File name (path)
            message: color(filePath), // Colored path display
        };
    });

    // Custom class for interactive selection with additional logic
    class CustomSelect extends Select {
        constructor(options) {
            super(options);
            this.column = 'left'; // Current active column (left or right)
            this.totalCharacters = 0; // Total characters in selected files
            this.selectedFilesCount = 0; // Number of selected files
            this.selectedFilesGitignore = ''; // Path to a file from .gitignore (if selected)
            this.gitignorePatterns = []; // Patterns from .gitignore
            this.loadGitignore(); // Load .gitignore on initialization
        }

        // Load contents of .gitignore to check ignored files
        async loadGitignore() {
            try {
                const ignoreContent = await fs.readFile(GITIGNORE_PATH, 'utf-8');
                this.gitignorePatterns = ignoreContent
                    .split('\n') // Split by lines
                    .map(line => line.trim()) // Trim spaces*.
                    .filter(line => line && !line.startsWith('#')); // Filter out empty lines and comments
            } catch (error) {
                if (error.code !== 'ENOENT') {
                    console.error(chalk.yellow(`Warning: Could not read .gitignore: ${error.message}`));
                }
                this.gitignorePatterns = []; // Use empty array if .gitignore is not found
            }
        }

        // Check if a file is ignored according to .gitignore
        isPathIgnored(filePath) {
            return this.gitignorePatterns.some(pattern => {
                const regexPattern = new RegExp(
                    '^' + pattern.replace(/\./g, '\\.').replace(/\*/g, '.*') + '$'
                ); // Convert pattern to regular expression
                return regexPattern.test(filePath); // Check for match
            });
        }

        // Render the file selection interface in two columns
        async render() {
            const terminalWidth = process.stdout.columns || 80; // Terminal width
            const halfWidth = Math.floor(terminalWidth / 2) - 2; // Width of each column

            const midPoint = Math.ceil(this.choices.length / 2); // Split point for columns
            const leftColumn = this.choices.slice(0, midPoint); // Left column
            const rightColumn = this.choices.slice(midPoint);   // Right column

            let output = []; // Array of strings for output
            
            process.stdout.write('\x1B[2J\x1B[H'); // Clear terminal screen

            // Warning if a file from .gitignore is selected
            let gitignoreWarning = '';
            if (this.selectedFilesGitignore) {
                gitignoreWarning = chalk.yellow(` ; Attention file selected from .gitignore: ${this.selectedFilesGitignore}`);
            }

            // Header and statistics
            output.push(chalk.bold('Select files to minify (Use "Space" to select; "a" to select all files; "right" or "left" arrows to switch columns; "Enter" to confirm):'));
            output.push(chalk.blue(`Total characters in selected files: ${this.totalCharacters} ; selected files: ${this.selectedFilesCount} ${gitignoreWarning}`));
            
            // Determine current cursor position
            const cursorIndex = this.state.index;
            const isLeftColumn = cursorIndex < midPoint;
            const rowIndex = isLeftColumn ? cursorIndex : cursorIndex - midPoint;

            // Render rows for both columns
            for (let i = 0; i < Math.max(leftColumn.length, rightColumn.length); i++) {
                const leftChoice = leftColumn[i] || { message: '', enabled: false }; // Left column item
                const rightChoice = rightColumn[i] || { message: '', enabled: false }; // Right column item

                // Selection indicators (green for selected, red for ignored)
                const leftIndicator = leftChoice.enabled ? (this.isPathIgnored(leftChoice.name) ? chalk.red('[x]') : chalk.green('[x]')) : '[ ]';
                const rightIndicator = rightChoice.enabled ? (this.isPathIgnored(rightChoice.name) ? chalk.red('[x]') : chalk.green('[x]')) : '[ ]';

                // Truncate text to column width
                const leftText = `${leftIndicator} ${leftChoice.message || ''}`.slice(0, halfWidth);
                const rightText = `${rightIndicator} ${rightChoice.message || ''}`.slice(0, halfWidth);

                // Highlight active item
                const isLeftActive = this.column === 'left' && i === rowIndex;
                const isRightActive = this.column === 'right' && i === rowIndex;
                const leftDisplay = isLeftActive ? chalk.bgWhite.black(leftText) : leftText;
                const rightDisplay = isRightActive ? chalk.bgWhite.black(rightText) : rightText;

                // Pad columns with spaces
                const leftCleanLength = stripAnsi(leftDisplay).length;
                const rightCleanLength = stripAnsi(rightDisplay).length;
                const paddedLeft = leftDisplay + ' '.repeat(halfWidth - leftCleanLength);
                const paddedRight = rightDisplay + ' '.repeat(halfWidth - rightCleanLength);

                output.push(`${paddedLeft}  ${paddedRight}`); // Add row to output
            }

            this.write(output.join('\n')); // Display the interface
        }

        // Handle keypress events
        async keypress(input, key) {
            if (key.name === 'right' || key.name === 'left') {
                // Switch between columns
                const midPoint = Math.ceil(this.choices.length / 2);
                const isLeftColumn = this.state.index < midPoint;
                const rowIndex = isLeftColumn ? this.state.index : this.state.index - midPoint;

                this.column = this.column === 'left' ? 'right' : 'left'; // Toggle active column

                if (this.column === 'right' && rowIndex < this.choices.length - midPoint) {
                    this.state.index = midPoint + rowIndex; // Move cursor to right column
                } else if (this.column === 'left') {
                    this.state.index = rowIndex; // Move cursor to left column
                }

                await this.render(); // Redraw interface
                return;
            } else if (key.name === 'space') {
                // Toggle file selection
                const choice = this.choices[this.state.index];
                if (choice) {
                    choice.enabled = !choice.enabled; // Toggle selection state
                    this.totalCharacters = 0; // Reset character counter
                    this.selectedFilesCount = this.choices.filter(c => c.enabled).length; // Update selected count
                    this.selectedFilesGitignore = ''; // Reset .gitignore warning
                    for (const c of this.choices) {
                        if (c.enabled) {
                            if (this.isPathIgnored(c.name)) {
                                this.selectedFilesGitignore = c.name; // Record ignored file path
                            }
                            try {
                                const content = await fs.readFile(c.name, 'utf-8'); // Read file
                                this.totalCharacters += content.length; // Add content length
                            } catch (err) {
                                console.error(chalk.red(`Error reading file: ${c.name}`), err); // Error reading
                            }
                        }
                    }
                    await this.render(); // Redraw interface
                    return;
                }
            }

            await super.keypress(input, key); // Handle other keys via parent class
        }

        // Toggle selection state (used for "a" - select all)
        toggle(i) {
            super.toggle(i);
            const choice = this.choices[i];
            if (choice) {
                this.totalCharacters = 0; // Reset character counter
                this.selectedFilesCount = this.choices.filter(c => c.enabled).length; // Update count
                this.selectedFilesGitignore = ''; // Reset warning
                this.choices.forEach(c => {
                    if (c.enabled) {
                        if (this.isPathIgnored(c.name)) {
                            this.selectedFilesGitignore = c.name; // Record ignored file path
                        }
                        fs.readFile(c.name, 'utf-8')
                            .then(content => {
                                this.totalCharacters += content.length; // Add content length
                                this.render(); // Redraw interface
                            })
                            .catch(err => {
                                console.error(chalk.red(`Error reading file: ${c.name}`), err); // Error reading
                            });
                    }
                });
                this.render(); // Redraw interface
            }
        }
    }

    // Create interactive prompt for file selection
    const selectPrompt = new CustomSelect({
        name: 'selectedFiles',
        message: chalk.bold('Select files to minify:'),
        choices: choices, // List of files
        multiple: true,   // Allow multiple selections
        async indicator(state, choice) {
            // Selection indicator (green or red for ignored)
            return choice.enabled ? (this.isPathIgnored(choice.name) ? chalk.red('[x]') : chalk.green('[x]')) : '[ ]';
        },
        async result() {
            // Return array of selected paths
            return this.selected.map((choice) => choice.name);
        },
    });

    const selectedFiles = await selectPrompt.run(); // Run selection

    if (selectedFiles && selectedFiles.length > 0) {
        // If files are selected, ask to save the selection
        const confirmSave = new Confirm({
            name: 'saveSelection',
            message: chalk.bold('Do you want to save this selection?'),
            initial: false, // Default is "no"
        });

        const shouldSave = await confirmSave.run(); // Prompt for confirmation

        if (shouldSave) {
            await saveSelectionToFile(selectedFiles); // Save selection
        }
    }

    return selectedFiles; // Return selected files
}

/**
 * Saves selected files to a JSON file.
 * @param {string[]} selectedFiles - Array of paths to selected files
 */
async function saveSelectionToFile(selectedFiles) {
    const saveNamePrompt = new Input({
        name: 'saveName',
        message: chalk.bold('Enter save name:'),
        validate: (value) => value.length > 0, // Ensure name is not empty
    });

    const saveName = await saveNamePrompt.run(); // Prompt for save name
    const savePath = path.join(SAVES_DIR, `${saveName}.json`); // Form path
    await fs.writeJson(savePath, selectedFiles); // Write selection to file
    console.log(chalk.green(`Selection saved to ${savePath}`)); // Successful save
}

/**
 * Extracts all file paths from the project structure object.
 * @param {object} structure - Project structure object
 * @param {string} base - Base path for recursion (default empty)
 * @returns {string[]} - Array of file paths
 */
function getFilePaths(structure, base = '') {
    let files = []; // Array of file paths
    let directories = []; // Array of paths from nested directories

    for (const key in structure) {
        const value = structure[key];
        const currentPath = base ? `${base}/${key}` : key; // Current path
        if (typeof value === 'string') {
            files.push(value); // If it's a string (file), add path
        } else {
            // If it's an object (directory), recursively get files
            directories = directories.concat(getFilePaths(value, currentPath));
        }
    }
    return files.concat(directories); // Combine files and nested paths
}

/**
 * Reads file contents and returns an object with their contents.
 * @param {string[]} filePaths - Array of file paths
 * @returns {Promise<object>} - Object with paths and file contents
 */
async function readFiles(filePaths) {
    const code = {};
    for (const filePath of filePaths) {
        try {
            const fileContent = await fs.readFile(filePath, 'utf-8'); // Read file
            code[filePath] = fileContent; // Save content under path key
        } catch (error) {
            console.error(chalk.red(`Error reading file: ${filePath}`), error); // Error reading
        }
    }
    return code;
}

// Run the main function
minifyCode();

export { minifyCode, interactiveSelect, minifyAndSave, getFilePaths, saveSelectionToFile };