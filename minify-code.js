import fs from 'fs-extra';
import path from 'path';
import pkg from 'enquirer';
const { Select, Confirm, Input, prompt } = pkg;
import chalk from 'chalk';
import cliBoxes from 'cli-boxes';

// Constants for directories and paths
const SAVES_DIR = path.join('json-project', 'minify-saves');
const JSON_DIR = 'json-project';
const GITIGNORE_PATH = '.gitignore';

function stripAnsi(str) {
    return str.replace(/\x1B\[[0-9;]*m/g, '');
}

async function minifyCode() {
    await fs.ensureDir(JSON_DIR);
    await fs.ensureDir(SAVES_DIR);
    const USGS = await fs.readdir(SAVES_DIR);

    const firstAction = await prompt({
        type: 'select',
        name: 'action',
        message: chalk.bold('What do you want to do?'),
        choices: [
            { name: 'minify', message: 'Select files to minify' },
            { name: 'load', message: 'Load a saved selection' },
            { name: 'manage', message: 'Manage saved selections' },
            { name: 'exit', message: 'Exit' },
        ],
    });

    switch (firstAction.action) {
        case 'minify':
            const structure = await fs.readJson(path.join(JSON_DIR, 'project-structure.min.json'));
            const filePaths = getFilePaths(structure);
            const selectedFiles = await interactiveSelect(filePaths);
            if (selectedFiles && selectedFiles.length > 0) {
                const totalCharacters = await calculateTotalCharacters(selectedFiles);
                console.log(chalk.blue(`Total characters in selected files: ${totalCharacters} ; selected files: ${selectedFiles.length}`));
                await minifyAndSave(selectedFiles);
            } else {
                console.log(chalk.yellow('No files selected for minification.'));
            }
            break;
        case 'load':
            if (saveFiles.length > 0) {
                await loadSave(saveFiles);
            } else {
                console.log(chalk.yellow('No saved selections found.'));
            }
            break;
        case 'manage':
            if (saveFiles.length > 0) {
                await manageSaves(saveFiles);
            } else {
                console.log(chalk.yellow('No saved selections found to manage.'));
            }
            break;
        case 'exit':
            console.log(chalk.gray('Exiting.'));
            break;
    }
}

async function calculateTotalCharacters(filePaths) {
    let totalCharacters = 0;
    for (const filePath of filePaths) {
        try {
            const fileContent = await fs.readFile(filePath, 'utf-8');
            totalCharacters += fileContent.length;
        } catch (error) {
            console.error(chalk.red(`Error reading file: ${filePath}`), error);
        }
    }
    return totalCharacters;
}

async function minifyAndSave(selectedFiles) {
    const code = await readFiles(selectedFiles);
    const codeJSON = JSON.stringify(code);
    const minifiedCodeJSON = codeJSON.replace(/\s+/g, ' ');
    await fs.writeFile(path.join(JSON_DIR, 'project-code.min.json'), minifiedCodeJSON);
    console.log(chalk.green('project-code.min.json created successfully!'));
}

async function loadSave(saveFiles) {
    const loadSavePrompt = new Select({
        name: 'selectedSave',
        message: chalk.bold('Select save to load:'),
        choices: [...saveFiles, chalk.bold('Back to main menu')],
    });

    const selectedSave = await loadSavePrompt.run();
    if (!selectedSave || selectedSave === chalk.bold('Back to main menu')) return;

    const savePath = path.join(SAVES_DIR, selectedSave);
    const selectedFiles = await fs.readJson(savePath);
    const totalCharacters = await calculateTotalCharacters(selectedFiles);
    console.log(chalk.blue(`Total characters in selected files: ${totalCharacters} ; selected files: ${selectedFiles.length}`));
    await minifyAndSave(selectedFiles);
}

async function manageSaves(saveFiles) {
    const managePrompt = new Select({
        name: 'saveAction',
        message: chalk.bold('Manage saved selections:'),
        choices: [
            ...saveFiles,
            { name: 'delete', message: chalk.red('Delete a save') },
            { name: 'back', message: 'Back to main menu' },
        ],
    });

    const selectedAction = await managePrompt.run();
    if (selectedAction === 'delete') {
        await deleteSave(saveFiles);
    } else if (selectedAction !== 'back') {
        console.log(chalk.yellow(`Selected save: ${selectedAction}`));
    }
}

async function deleteSave(saveFiles) {
    const deletePrompt = new Select({
        name: 'saveToDelete',
        message: chalk.bold(chalk.red('Select a save to delete:')),
        choices: [...saveFiles, chalk.bold('Cancel')],
    });

    const saveToDelete = await deletePrompt.run();
    if (saveToDelete && saveToDelete !== chalk.bold('Cancel')) {
        const confirmDelete = await prompt({
            type: 'confirm',
            name: 'confirm',
            message: chalk.bold(chalk.red(`Are you sure you want to delete ${saveToDelete}?`)),
            initial: false,
        });

        if (confirmDelete.confirm) {
            const savePath = path.join(SAVES_DIR, saveToDelete);
            await fs.remove(savePath);
            console.log(chalk.green(`Deleted save: ${saveToDelete}`));
            const updatedSaveFiles = await fs.readdir(SAVES_DIR);
            if (updatedSaveFiles.length > 0) {
                await manageSaves(updatedSaveFiles);
            } else {
                console.log(chalk.yellow('No saved selections left.'));
            }
        } else {
            console.log(chalk.gray('Delete cancelled.'));
            await manageSaves(saveFiles);
        }
    } else if (saveToDelete !== chalk.bold('Cancel')) {
        await manageSaves(saveFiles);
    }
}

async function interactiveSelect(filePaths) {
    const choices = filePaths.map((filePath) => {
        const firstDir = filePath.split('/')[0];
        let color;
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
            default: color = chalk.white;
        }
        return { name: filePath, message: color(filePath) };
    });

    class CustomSelect extends Select {
        constructor(options) {
            super(options);
            this.column = 'left';
            this.totalCharacters = 0;
            this.selectedFilesCount = 0;
            this.selectedFilesGitignore = '';
            this.gitignorePatterns = [];
            this.visibleStart = 0;
            this.updateTerminalDimensions();
            this.loadGitignore();

            process.stdout.on('resize', () => {
                this.updateTerminalDimensions();
                this.render();
            });
        }

        updateTerminalDimensions() {
            this.terminalHeight = process.stdout.rows || 24;
            this.terminalWidth = process.stdout.columns || 80;
            this.visibleRows = Math.max(1, this.terminalHeight - 4); // Учитываем верхнюю границу, заголовок, статистику и нижнюю границу
        }

        async loadGitignore() {
            try {
                const ignoreContent = await fs.readFile(GITIGNORE_PATH, 'utf-8');
                this.gitignorePatterns = ignoreContent
                    .split('\n')
                    .map(line => line.trim())
                    .filter(line => line && !line.startsWith('#'));
            } catch (error) {
                if (error.code !== 'ENOENT') {
                    console.error(chalk.yellow(`Warning: Could not read .gitignore: ${error.message}`));
                }
                this.gitignorePatterns = [];
            }
        }

        isPathIgnored(filePath) {
            return this.gitignorePatterns.some(pattern => {
                const regexPattern = new RegExp('^' + pattern.replace(/\./g, '\\.').replace(/\*/g, '.*') + '$');
                return regexPattern.test(filePath);
            });
        }

        async render() {
            this.updateTerminalDimensions();
            const innerWidth = this.terminalWidth - 2;
            const headerHeight = 2;
            const listHeight = Math.max(1, this.terminalHeight - headerHeight - 2);
        
            process.stdout.write('\x1B[2J\x1B[H');
        
            const topBorder = cliBoxes.round.topLeft + cliBoxes.round.top.repeat(innerWidth) + cliBoxes.round.topRight;
            const bottomBorder = cliBoxes.round.bottomLeft + cliBoxes.round.bottom.repeat(innerWidth) + cliBoxes.round.bottomRight;
            const sideBorder = cliBoxes.round.right;
        
            let output = [topBorder];
        
            // Фиксированные верхние строки
            const header = chalk.bold('Select files to minify (Use "Space" to select; "a" to select all files; "right" or "left" arrows to switch columns; "Enter" to confirm):');
            const stats = chalk.blue(`Total characters in selected files: ${this.totalCharacters} ; selected files: ${this.selectedFilesCount}`);
            const gitignoreWarning = this.selectedFilesGitignore ? chalk.yellow(` ; Attention file selected from .gitignore: ${this.selectedFilesGitignore}`) : '';
            const fullStats = stats + gitignoreWarning;
        
            const padHeader = sideBorder + ' ' + header + ' '.repeat(Math.max(0, innerWidth - 2 - stripAnsi(header).length)) + ' ' + sideBorder;
            const padStats = sideBorder + ' ' + fullStats + ' '.repeat(Math.max(0, innerWidth - 2 - stripAnsi(fullStats).length)) + ' ' + sideBorder;
        
            output.push(padHeader);
            output.push(padStats);
        
            const midPoint = Math.ceil(this.choices.length / 2);
            const leftColumn = this.choices.slice(0, midPoint);
            const rightColumn = this.choices.slice(midPoint);
            const maxLeftRows = leftColumn.length;
            const maxRightRows = rightColumn.length;
        
            // Корректировка видимой области для левой колонки
            if (this.column === 'left') {
                if (this.state.index >= maxLeftRows) {
                    this.state.index = maxLeftRows - 1;
                }
                if (this.state.index < this.visibleStart) {
                    this.visibleStart = this.state.index;
                } else if (this.state.index >= this.visibleStart + listHeight) {
                    this.visibleStart = this.state.index - listHeight + 1;
                }
            }
            // Корректировка видимой области для правой колонки
            else {
                const rightIndex = this.state.index - midPoint;
                if (rightIndex >= maxRightRows) {
                    this.state.index = midPoint + maxRightRows - 1;
                }
                if (rightIndex < this.visibleStart) {
                    this.visibleStart = rightIndex;
                } else if (rightIndex >= this.visibleStart + listHeight) {
                    this.visibleStart = rightIndex - listHeight + 1;
                }
            }
        
            // Ограничение видимой области
            this.visibleStart = Math.max(0, Math.min(
                this.visibleStart,
                Math.max(maxLeftRows, maxRightRows) - listHeight
            ));
        
            for (let i = 0; i < listHeight; i++) {
                const rowIndex = this.visibleStart + i;
                const leftChoice = leftColumn[rowIndex] || { message: '', enabled: false, name: '' };
                const rightChoice = rightColumn[rowIndex] || { message: '', enabled: false, name: '' };
        
                const leftIndicator = leftChoice.enabled ? (this.isPathIgnored(leftChoice.name) ? chalk.red('[x]') : chalk.green('[x]')) : '[ ]';
                const rightIndicator = rightChoice.enabled ? (this.isPathIgnored(rightChoice.name) ? chalk.red('[x]') : chalk.green('[x]')) : '[ ]';
        
                const halfWidth = Math.floor(innerWidth / 2) - 2;
                const leftText = `${leftIndicator} ${leftChoice.message || ''}`.slice(0, halfWidth);
                const rightText = `${rightIndicator} ${rightChoice.message || ''}`.slice(0, halfWidth);
        
                const isLeftActive = this.column === 'left' && rowIndex === this.state.index;
                const isRightActive = this.column === 'right' && rowIndex === (this.state.index - midPoint);
                const leftDisplay = isLeftActive ? chalk.bgWhite.black(leftText) : leftText;
                const rightDisplay = isRightActive ? chalk.bgWhite.black(rightText) : rightText;
        
                const paddedLeft = sideBorder + ' ' + leftDisplay + ' '.repeat(Math.max(0, halfWidth - stripAnsi(leftDisplay).length));
                const paddedRight = '  ' + rightDisplay + ' '.repeat(Math.max(0, halfWidth - stripAnsi(rightDisplay).length)) + ' ' + sideBorder;
        
                output.push(paddedLeft + paddedRight);
            }
        
            while (output.length < this.terminalHeight - 1) {
                output.push(sideBorder + ' '.repeat(innerWidth) + sideBorder);
            }
        
            output.push(bottomBorder);
        
            this.write(output.join('\n'));
        }

        async keypress(input, key) {
            const midPoint = Math.ceil(this.choices.length / 2);
            const listHeight = Math.max(1, this.terminalHeight - 4);
            const maxLeftRows = midPoint;
            const maxRightRows = this.choices.length - midPoint;
        
            if (key.name === 'down') {
                if (this.column === 'left' && this.state.index < maxLeftRows - 1) {
                    this.state.index++;
                } else if (this.column === 'right' && this.state.index < this.choices.length - 1) {
                    this.state.index++;
                }
                await this.render();
                return;
            } else if (key.name === 'up') {
                if (this.state.index > (this.column === 'left' ? 0 : midPoint)) {
                    this.state.index--;
                }
                await this.render();
                return;
            } else if (key.name === 'right' || key.name === 'left') {
                const newColumn = key.name;
                if (this.column !== newColumn) {
                    this.column = newColumn;
                    const newIsLeft = this.column === 'left';
                    
                    if (newIsLeft) {
                        // Переход в левую колонку
                        this.state.index = Math.min(this.state.index, maxLeftRows - 1);
                    } else {
                        // Переход в правую колонку
                        if (this.state.index < midPoint) {
                            this.state.index = midPoint;
                        }
                        this.state.index = Math.min(this.state.index, this.choices.length - 1);
                    }
                    await this.render();
                }
                return;
            } else if (key.name === 'space') {
                const choice = this.choices[this.state.index];
                if (choice) {
                    choice.enabled = !choice.enabled;
                    this.totalCharacters = 0;
                    this.selectedFilesCount = this.choices.filter(c => c.enabled).length;
                    this.selectedFilesGitignore = '';
                    for (const c of this.choices) {
                        if (c.enabled) {
                            if (this.isPathIgnored(c.name)) {
                                this.selectedFilesGitignore = c.name;
                            }
                            try {
                                const content = await fs.readFile(c.name, 'utf-8');
                                this.totalCharacters += content.length;
                            } catch (err) {
                                console.error(chalk.red(`Error reading file: ${c.name}`), err);
                            }
                        }
                    }
                    await this.render();
                }
                return;
            } else if (input === 'a') {
                const allSelected = this.choices.every(choice => choice.enabled);
                this.choices.forEach(choice => (choice.enabled = !allSelected));
                this.totalCharacters = 0;
                this.selectedFilesCount = this.choices.filter(c => c.enabled).length;
                this.selectedFilesGitignore = '';
                for (const c of this.choices) {
                    if (c.enabled) {
                        if (this.isPathIgnored(c.name)) {
                            this.selectedFilesGitignore = c.name;
                        }
                        try {
                            const content = await fs.readFile(c.name, 'utf-8');
                            this.totalCharacters += content.length;
                        } catch (err) {
                            console.error(chalk.red(`Error reading file: ${c.name}`), err);
                        }
                    }
                }
                await this.render();
                return;
            }

            await super.keypress(input, key);
        }
    }

    const selectPrompt = new CustomSelect({
        name: 'selectedFiles',
        message: chalk.bold('Select files to minify:'),
        choices: choices,
        multiple: true,
        async indicator(state, choice) {
            return choice.enabled ? (this.isPathIgnored(choice.name) ? chalk.red('[x]') : chalk.green('[x]')) : '[ ]';
        },
        async result() {
            return this.selected.map((choice) => choice.name);
        },
    });

    const selectedFiles = await selectPrompt.run();

    if (selectedFiles && selectedFiles.length > 0) {
        const confirmSave = new Confirm({
            name: 'saveSelection',
            message: chalk.bold('Do you want to save this selection?'),
            initial: false,
        });

        const shouldSave = await confirmSave.run();
        if (shouldSave) {
            await saveSelectionToFile(selectedFiles);
        }
    }

    return selectedFiles;
}

async function saveSelectionToFile(selectedFiles) {
    const saveNamePrompt = new Input({
        name: 'saveName',
        message: chalk.bold('Enter save name:'),
        validate: (value) => value.length > 0,
    });

    const saveName = await saveNamePrompt.run();
    const savePath = path.join(SAVES_DIR, `${saveName}.json`);
    await fs.writeJson(savePath, selectedFiles);
    console.log(chalk.green(`Selection saved to ${savePath}`));
}

function getFilePaths(structure, base = '') {
    let files = [];
    let directories = [];
    for (const key in structure) {
        const value = structure[key];
        const currentPath = base ? `${base}/${key}` : key;
        if (typeof value === 'string') {
            files.push(value);
        } else {
            directories = directories.concat(getFilePaths(value, currentPath));
        }
    }
    return files.concat(directories);
}

async function readFiles(filePaths) {
    const code = {};
    for (const filePath of filePaths) {
        try {
            const fileContent = await fs.readFile(filePath, 'utf-8');
            code[filePath] = fileContent;
        } catch (error) {
            console.error(chalk.red(`Error reading file: ${filePath}`), error);
        }
    }
    return code;
}

export { minifyCode, interactiveSelect, minifyAndSave, getFilePaths, saveSelectionToFile };