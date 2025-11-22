import express from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { getAllTasks, getTaskById, createTask, updateTask, deleteTask, getTaskStats } from '../core/task.repository.js';
import type { TaskStatus, TaskPriority, CreateTaskInput, UpdateTaskInput } from '../types/task.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// API Routes
app.get('/api/tasks', (req, res) => {
  const { status, priority, search } = req.query;
  const filter: { status?: TaskStatus; priority?: TaskPriority; search?: string } = {};
  if (status) filter.status = status as TaskStatus;
  if (priority) filter.priority = priority as TaskPriority;
  if (search) filter.search = search as string;

  res.json(getAllTasks(filter));
});

app.get('/api/tasks/stats', (_req, res) => {
  res.json(getTaskStats());
});

app.get('/api/tasks/:id', (req, res) => {
  const task = getTaskById(req.params.id);
  if (!task) {
    res.status(404).json({ error: 'Task not found' });
    return;
  }
  res.json(task);
});

app.post('/api/tasks', (req, res) => {
  try {
    const input: CreateTaskInput = req.body;
    const task = createTask(input);
    res.status(201).json(task);
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : 'Invalid input' });
  }
});

app.patch('/api/tasks/:id', (req, res) => {
  const input: UpdateTaskInput = req.body;
  const task = updateTask(req.params.id, input);
  if (!task) {
    res.status(404).json({ error: 'Task not found' });
    return;
  }
  res.json(task);
});

app.delete('/api/tasks/:id', (req, res) => {
  const success = deleteTask(req.params.id);
  if (!success) {
    res.status(404).json({ error: 'Task not found' });
    return;
  }
  res.status(204).send();
});

app.post('/api/tasks/:id/complete', (req, res) => {
  const task = updateTask(req.params.id, { status: 'completed' });
  if (!task) {
    res.status(404).json({ error: 'Task not found' });
    return;
  }
  res.json(task);
});

// Simple HTML UI
app.get('/', (_req, res) => {
  const tasks = getAllTasks();
  const stats = getTaskStats();

  const html = `
<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Task Manager</title>
  <script src="https://unpkg.com/htmx.org@1.9.10"></script>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0d1117; color: #c9d1d9; padding: 2rem; }
    .container { max-width: 800px; margin: 0 auto; }
    h1 { margin-bottom: 1.5rem; color: #58a6ff; }
    .stats { display: flex; gap: 1rem; margin-bottom: 2rem; }
    .stat { background: #161b22; padding: 1rem; border-radius: 8px; flex: 1; text-align: center; border: 1px solid #30363d; }
    .stat-value { font-size: 2rem; font-weight: bold; }
    .stat-label { color: #8b949e; font-size: 0.875rem; }
    .pending .stat-value { color: #f0883e; }
    .in-progress .stat-value { color: #58a6ff; }
    .completed .stat-value { color: #3fb950; }
    .form-container { background: #161b22; padding: 1.5rem; border-radius: 8px; margin-bottom: 2rem; border: 1px solid #30363d; }
    .form-row { display: flex; gap: 1rem; margin-bottom: 1rem; }
    input, select { background: #0d1117; border: 1px solid #30363d; color: #c9d1d9; padding: 0.5rem 1rem; border-radius: 6px; font-size: 1rem; }
    input:focus, select:focus { outline: none; border-color: #58a6ff; }
    input[type="text"] { flex: 1; }
    button { background: #238636; color: white; border: none; padding: 0.5rem 1rem; border-radius: 6px; cursor: pointer; font-size: 1rem; }
    button:hover { background: #2ea043; }
    .task-list { list-style: none; }
    .task-item { background: #161b22; padding: 1rem; border-radius: 8px; margin-bottom: 0.5rem; display: flex; align-items: center; gap: 1rem; border: 1px solid #30363d; }
    .task-item:hover { border-color: #58a6ff; }
    .task-status { font-size: 1.5rem; }
    .task-info { flex: 1; }
    .task-title { font-weight: 500; }
    .task-meta { color: #8b949e; font-size: 0.875rem; }
    .priority-critical { color: #f85149; }
    .priority-high { color: #f0883e; }
    .priority-medium { color: #58a6ff; }
    .priority-low { color: #8b949e; }
    .task-actions button { background: #21262d; margin-left: 0.5rem; }
    .task-actions button:hover { background: #30363d; }
    .complete-btn:hover { background: #238636 !important; }
    .delete-btn:hover { background: #da3633 !important; }
  </style>
</head>
<body>
  <div class="container">
    <h1>📋 Task Manager</h1>

    <div class="stats">
      <div class="stat pending"><div class="stat-value">${stats.pending}</div><div class="stat-label">Pending</div></div>
      <div class="stat in-progress"><div class="stat-value">${stats.inProgress}</div><div class="stat-label">In Progress</div></div>
      <div class="stat completed"><div class="stat-value">${stats.completed}</div><div class="stat-label">Completed</div></div>
    </div>

    <div class="form-container">
      <form hx-post="/api/tasks" hx-swap="afterbegin" hx-target="#task-list" hx-on::after-request="this.reset(); location.reload();">
        <div class="form-row">
          <input type="text" name="title" placeholder="New task..." required>
          <select name="priority">
            <option value="medium">Medium</option>
            <option value="critical">Critical</option>
            <option value="high">High</option>
            <option value="low">Low</option>
          </select>
          <button type="submit">Add Task</button>
        </div>
      </form>
    </div>

    <ul class="task-list" id="task-list">
      ${tasks.filter(t => t.status !== 'completed').map(task => `
        <li class="task-item">
          <span class="task-status">${task.status === 'in_progress' ? '🔵' : '⚪'}</span>
          <div class="task-info">
            <div class="task-title">${escapeHtml(task.title)}</div>
            <div class="task-meta">
              <span class="priority-${task.priority}">${task.priority}</span>
              ${task.dueDate ? `• Due: ${new Date(task.dueDate).toLocaleDateString()}` : ''}
            </div>
          </div>
          <div class="task-actions">
            <button class="complete-btn" hx-post="/api/tasks/${task.id}/complete" hx-swap="none" hx-on::after-request="location.reload()">✓</button>
            <button class="delete-btn" hx-delete="/api/tasks/${task.id}" hx-swap="none" hx-on::after-request="location.reload()">✕</button>
          </div>
        </li>
      `).join('')}
    </ul>
  </div>
</body>
</html>`;

  res.send(html);
});

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function startServer(port: number = 3000): void {
  app.listen(port, () => {
    console.log(`🚀 Task Manager running at http://localhost:${port}`);
  });
}
