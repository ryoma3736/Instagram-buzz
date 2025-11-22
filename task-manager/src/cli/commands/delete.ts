import { Command } from 'commander';
import chalk from 'chalk';
import { deleteTask, getTaskById } from '../../core/task.repository.js';

export const deleteCommand = new Command('delete')
  .alias('rm')
  .description('Delete a task')
  .argument('<id>', 'Task ID')
  .option('-f, --force', 'Skip confirmation')
  .action((id: string, options) => {
    const task = getTaskById(id);
    if (!task) {
      console.error(chalk.red(`Task not found: ${id}`));
      process.exit(1);
    }

    if (!options.force) {
      console.log(chalk.yellow(`Are you sure you want to delete "${task.title}"?`));
      console.log(chalk.dim('Use --force to skip this confirmation.'));
      // In a real implementation, you would add a readline prompt here
    }

    const success = deleteTask(id);
    if (success) {
      console.log(chalk.green(`✓ Task "${task.title}" deleted successfully!`));
    } else {
      console.error(chalk.red('Failed to delete task.'));
      process.exit(1);
    }
  });
