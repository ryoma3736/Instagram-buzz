import { Command } from 'commander';
import chalk from 'chalk';
import { createTask } from '../../core/task.repository.js';
import { CreateTaskSchema } from '../../schemas/task.schema.js';
import type { TaskPriority } from '../../types/task.js';

export const addCommand = new Command('add')
  .description('Add a new task')
  .argument('<title>', 'Task title')
  .option('-d, --description <desc>', 'Task description')
  .option('-p, --priority <priority>', 'Priority (critical/high/medium/low)', 'medium')
  .option('--due <date>', 'Due date (YYYY-MM-DD)')
  .option('-t, --tags <tags>', 'Comma-separated tags')
  .action((title: string, options) => {
    try {
      const input = CreateTaskSchema.parse({
        title,
        description: options.description,
        priority: options.priority as TaskPriority,
        dueDate: options.due ? new Date(options.due) : undefined,
        tags: options.tags ? options.tags.split(',').map((t: string) => t.trim()) : [],
      });

      const task = createTask(input);

      console.log(chalk.green('✓ Task created successfully!'));
      console.log(chalk.dim(`  ID: ${task.id}`));
      console.log(`  Title: ${chalk.bold(task.title)}`);
      console.log(`  Priority: ${formatPriority(task.priority)}`);
      if (task.dueDate) {
        console.log(`  Due: ${task.dueDate.toLocaleDateString()}`);
      }
    } catch (error) {
      if (error instanceof Error) {
        console.error(chalk.red(`Error: ${error.message}`));
      }
      process.exit(1);
    }
  });

function formatPriority(priority: string): string {
  const colors: Record<string, (s: string) => string> = {
    critical: chalk.red,
    high: chalk.yellow,
    medium: chalk.blue,
    low: chalk.gray,
  };
  return (colors[priority] || chalk.white)(priority);
}
