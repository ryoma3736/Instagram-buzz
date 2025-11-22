import { Command } from 'commander';
import chalk from 'chalk';
import { getTaskById } from '../../core/task.repository.js';

export const showCommand = new Command('show')
  .description('Show task details')
  .argument('<id>', 'Task ID (can be partial)')
  .action((id: string) => {
    const task = getTaskById(id);

    if (!task) {
      console.error(chalk.red(`Task not found: ${id}`));
      process.exit(1);
    }

    console.log();
    console.log(chalk.bold.underline(task.title));
    console.log();
    console.log(`${chalk.dim('ID:')}         ${task.id}`);
    console.log(`${chalk.dim('Status:')}     ${formatStatus(task.status)}`);
    console.log(`${chalk.dim('Priority:')}   ${formatPriority(task.priority)}`);

    if (task.description) {
      console.log(`${chalk.dim('Description:')}`);
      console.log(`  ${task.description}`);
    }

    if (task.dueDate) {
      const isOverdue = new Date() > task.dueDate && task.status !== 'completed';
      console.log(`${chalk.dim('Due Date:')}   ${task.dueDate.toLocaleDateString()}${isOverdue ? chalk.red(' [OVERDUE]') : ''}`);
    }

    if (task.tags.length > 0) {
      console.log(`${chalk.dim('Tags:')}       ${task.tags.map(t => chalk.cyan(`#${t}`)).join(' ')}`);
    }

    console.log(`${chalk.dim('Created:')}    ${task.createdAt.toLocaleString()}`);
    console.log(`${chalk.dim('Updated:')}    ${task.updatedAt.toLocaleString()}`);

    if (task.completedAt) {
      console.log(`${chalk.dim('Completed:')}  ${task.completedAt.toLocaleString()}`);
    }
    console.log();
  });

function formatStatus(status: string): string {
  const colors: Record<string, (s: string) => string> = {
    pending: chalk.yellow,
    in_progress: chalk.blue,
    completed: chalk.green,
    cancelled: chalk.gray,
  };
  return (colors[status] || chalk.white)(status.replace('_', ' '));
}

function formatPriority(priority: string): string {
  const colors: Record<string, (s: string) => string> = {
    critical: chalk.red,
    high: chalk.yellow,
    medium: chalk.blue,
    low: chalk.gray,
  };
  return (colors[priority] || chalk.white)(priority);
}
