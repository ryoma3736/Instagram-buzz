#!/usr/bin/env node
import { Command } from 'commander';
import chalk from 'chalk';
import { addCommand } from './commands/add.js';
import { listCommand } from './commands/list.js';
import { showCommand } from './commands/show.js';
import { updateCommand } from './commands/update.js';
import { deleteCommand } from './commands/delete.js';
import { completeCommand } from './commands/complete.js';
import { statsCommand } from './commands/stats.js';

const program = new Command();

program
  .name('task')
  .description('Simple task management CLI')
  .version('1.0.0');

program.addCommand(addCommand);
program.addCommand(listCommand);
program.addCommand(showCommand);
program.addCommand(updateCommand);
program.addCommand(deleteCommand);
program.addCommand(completeCommand);
program.addCommand(statsCommand);

program
  .command('server')
  .description('Start the web UI server')
  .option('-p, --port <port>', 'Port number', '3000')
  .action(async (options) => {
    console.log(chalk.cyan(`Starting web server on port ${options.port}...`));
    const { startServer } = await import('../web/server.js');
    startServer(parseInt(options.port, 10));
  });

program.parse();
