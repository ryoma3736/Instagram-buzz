import { Command } from 'commander';
import chalk from 'chalk';
import { getAllTasks } from '../../core/task.repository.js';
import type { TaskStatus, TaskPriority } from '../../types/task.js';

export const listCommand = new Command('list')
  .alias('ls')
  .description('List all tasks')
  .option('-s, --status <status>', 'Filter by status')
  .option('-p, --priority <priority>', 'Filter by priority')
  .option('--search <term>', 'Search in title and description')
  .option('--all', 'Show all tasks including completed')
  .action((options) => {
    const filter: { status?: TaskStatus; priority?: TaskPriority; search?: string } = {};

    if (options.status) filter.status = options.status as TaskStatus;
    if (options.priority) filter.priority = options.priority as TaskPriority;
    if (options.search) filter.search = options.search;

    let tasks = getAllTasks(filter);

    if (!options.all && !options.status) {
      tasks = tasks.filter(t => t.status !== 'completed' && t.status !== 'cancelled');
    }

    if (tasks.length === 0) {
      console.log(chalk.dim('No tasks found.'));
      return;
    }

    console.log(chalk.bold(`\nTasks (${tasks.length}):\n`));

    for (const task of tasks) {
      const statusIcon = getStatusIcon(task.status);
      const priorityBadge = formatPriority(task.priority);
      const dueInfo = task.dueDate ? chalk.dim(` | Due: ${task.dueDate.toLocaleDateString()}`) : '';
      const overdue = task.dueDate && new Date() > task.dueDate && task.status !== 'completed'
        ? chalk.red(' [OVERDUE]')
        : '';

      console.log(`${statusIcon} ${chalk.bold(task.title)} ${priorityBadge}${dueInfo}${overdue}`);
      console.log(chalk.dim(`   ID: ${task.id.slice(0, 8)}...`));
      if (task.description) {
        console.log(chalk.dim(`   ${task.description.slice(0, 60)}${task.description.length > 60 ? '...' : ''}`));
      }
      console.log();
    }
  });

function getStatusIcon(status: TaskStatus): string {
  const icons: Record<TaskStatus, string> = {
    pending: chalk.yellow('○'),
    in_progress: chalk.blue('◐'),
    completed: chalk.green('●'),
    cancelled: chalk.gray('✕'),
  };
  return icons[status];
}

function formatPriority(priority: TaskPriority): string {
  const badges: Record<TaskPriority, string> = {
    critical: chalk.bgRed.white(' CRITICAL '),
    high: chalk.bgYellow.black(' HIGH '),
    medium: chalk.bgBlue.white(' MEDIUM '),
    low: chalk.bgGray.white(' LOW '),
  };
  return badges[priority];
}
