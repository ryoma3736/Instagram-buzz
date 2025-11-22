import { Command } from 'commander';
import chalk from 'chalk';
import { updateTask, getTaskById } from '../../core/task.repository.js';
import type { TaskStatus, TaskPriority } from '../../types/task.js';

export const updateCommand = new Command('update')
  .description('Update a task')
  .argument('<id>', 'Task ID')
  .option('-t, --title <title>', 'New title')
  .option('-d, --description <desc>', 'New description')
  .option('-s, --status <status>', 'New status (pending/in_progress/completed/cancelled)')
  .option('-p, --priority <priority>', 'New priority (critical/high/medium/low)')
  .option('--due <date>', 'New due date (YYYY-MM-DD)')
  .option('--tags <tags>', 'New tags (comma-separated)')
  .action((id: string, options) => {
    const existing = getTaskById(id);
    if (!existing) {
      console.error(chalk.red(`Task not found: ${id}`));
      process.exit(1);
    }

    const updates: {
      title?: string;
      description?: string;
      status?: TaskStatus;
      priority?: TaskPriority;
      dueDate?: Date;
      tags?: string[];
    } = {};

    if (options.title) updates.title = options.title;
    if (options.description) updates.description = options.description;
    if (options.status) updates.status = options.status as TaskStatus;
    if (options.priority) updates.priority = options.priority as TaskPriority;
    if (options.due) updates.dueDate = new Date(options.due);
    if (options.tags) updates.tags = options.tags.split(',').map((t: string) => t.trim());

    if (Object.keys(updates).length === 0) {
      console.log(chalk.yellow('No updates provided. Use --help to see options.'));
      return;
    }

    const task = updateTask(id, updates);

    if (task) {
      console.log(chalk.green('✓ Task updated successfully!'));
      console.log(`  ${chalk.bold(task.title)}`);
      console.log(chalk.dim(`  Status: ${task.status} | Priority: ${task.priority}`));
    } else {
      console.error(chalk.red('Failed to update task.'));
      process.exit(1);
    }
  });
