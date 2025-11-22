import { Command } from 'commander';
import chalk from 'chalk';
import { updateTask, getTaskById } from '../../core/task.repository.js';

export const completeCommand = new Command('complete')
  .alias('done')
  .description('Mark a task as completed')
  .argument('<id>', 'Task ID')
  .action((id: string) => {
    const existing = getTaskById(id);
    if (!existing) {
      console.error(chalk.red(`Task not found: ${id}`));
      process.exit(1);
    }

    if (existing.status === 'completed') {
      console.log(chalk.yellow(`Task "${existing.title}" is already completed.`));
      return;
    }

    const task = updateTask(id, { status: 'completed' });

    if (task) {
      console.log(chalk.green('✓ Task completed!'));
      console.log(`  ${chalk.strikethrough(task.title)}`);
      console.log(chalk.dim(`  Completed at: ${task.completedAt?.toLocaleString()}`));
    } else {
      console.error(chalk.red('Failed to complete task.'));
      process.exit(1);
    }
  });
