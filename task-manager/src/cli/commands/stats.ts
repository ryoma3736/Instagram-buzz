import { Command } from 'commander';
import chalk from 'chalk';
import { getTaskStats } from '../../core/task.repository.js';

export const statsCommand = new Command('stats')
  .description('Show task statistics')
  .action(() => {
    const stats = getTaskStats();

    console.log();
    console.log(chalk.bold.underline('Task Statistics'));
    console.log();

    const bar = (count: number, total: number, color: (s: string) => string) => {
      if (total === 0) return chalk.dim('N/A');
      const percent = Math.round((count / total) * 100);
      const filled = Math.round(percent / 5);
      const empty = 20 - filled;
      return color('█'.repeat(filled)) + chalk.dim('░'.repeat(empty)) + ` ${percent}%`;
    };

    console.log(`${chalk.dim('Total Tasks:')}     ${chalk.bold(stats.total.toString())}`);
    console.log();
    console.log(`${chalk.yellow('○')} Pending:       ${stats.pending.toString().padStart(3)} ${bar(stats.pending, stats.total, chalk.yellow)}`);
    console.log(`${chalk.blue('◐')} In Progress:   ${stats.inProgress.toString().padStart(3)} ${bar(stats.inProgress, stats.total, chalk.blue)}`);
    console.log(`${chalk.green('●')} Completed:     ${stats.completed.toString().padStart(3)} ${bar(stats.completed, stats.total, chalk.green)}`);

    if (stats.overdue > 0) {
      console.log();
      console.log(chalk.red(`⚠ Overdue Tasks: ${stats.overdue}`));
    }
    console.log();
  });
