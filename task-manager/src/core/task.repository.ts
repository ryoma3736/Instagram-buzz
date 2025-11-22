import { db } from '../db/database.js';
import type { Task, CreateTaskInput, UpdateTaskInput, TaskFilter } from '../types/task.js';
import { v4 as uuidv4 } from 'uuid';

interface TaskRow {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  due_date: string | null;
  tags: string;
  parent_id: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

function rowToTask(row: TaskRow): Task {
  return {
    id: row.id,
    title: row.title,
    description: row.description || undefined,
    status: row.status as Task['status'],
    priority: row.priority as Task['priority'],
    dueDate: row.due_date ? new Date(row.due_date) : undefined,
    tags: JSON.parse(row.tags),
    parentId: row.parent_id || undefined,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    completedAt: row.completed_at ? new Date(row.completed_at) : undefined,
  };
}

export function createTask(input: CreateTaskInput): Task {
  const id = uuidv4();
  const now = new Date().toISOString();

  const stmt = db.prepare(`
    INSERT INTO tasks (id, title, description, status, priority, due_date, tags, parent_id, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    id,
    input.title,
    input.description || null,
    input.status || 'pending',
    input.priority || 'medium',
    input.dueDate?.toISOString() || null,
    JSON.stringify(input.tags || []),
    input.parentId || null,
    now,
    now
  );

  return getTaskById(id)!;
}

export function getTaskById(id: string): Task | null {
  const stmt = db.prepare('SELECT * FROM tasks WHERE id = ?');
  const row = stmt.get(id) as TaskRow | undefined;
  return row ? rowToTask(row) : null;
}

export function getAllTasks(filter?: TaskFilter): Task[] {
  let sql = 'SELECT * FROM tasks WHERE 1=1';
  const params: unknown[] = [];

  if (filter?.status) {
    sql += ' AND status = ?';
    params.push(filter.status);
  }

  if (filter?.priority) {
    sql += ' AND priority = ?';
    params.push(filter.priority);
  }

  if (filter?.search) {
    sql += ' AND (title LIKE ? OR description LIKE ?)';
    const searchTerm = `%${filter.search}%`;
    params.push(searchTerm, searchTerm);
  }

  if (filter?.dueBefore) {
    sql += ' AND due_date <= ?';
    params.push(filter.dueBefore.toISOString());
  }

  if (filter?.dueAfter) {
    sql += ' AND due_date >= ?';
    params.push(filter.dueAfter.toISOString());
  }

  sql += " ORDER BY CASE priority WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END, due_date ASC NULLS LAST, created_at DESC";

  const stmt = db.prepare(sql);
  const rows = stmt.all(...params) as TaskRow[];
  return rows.map(rowToTask);
}

export function updateTask(id: string, input: UpdateTaskInput): Task | null {
  const existing = getTaskById(id);
  if (!existing) return null;

  const updates: string[] = ['updated_at = ?'];
  const params: unknown[] = [new Date().toISOString()];

  if (input.title !== undefined) {
    updates.push('title = ?');
    params.push(input.title);
  }
  if (input.description !== undefined) {
    updates.push('description = ?');
    params.push(input.description);
  }
  if (input.status !== undefined) {
    updates.push('status = ?');
    params.push(input.status);
    if (input.status === 'completed') {
      updates.push('completed_at = ?');
      params.push(new Date().toISOString());
    }
  }
  if (input.priority !== undefined) {
    updates.push('priority = ?');
    params.push(input.priority);
  }
  if (input.dueDate !== undefined) {
    updates.push('due_date = ?');
    params.push(input.dueDate.toISOString());
  }
  if (input.tags !== undefined) {
    updates.push('tags = ?');
    params.push(JSON.stringify(input.tags));
  }

  params.push(id);

  const stmt = db.prepare(`UPDATE tasks SET ${updates.join(', ')} WHERE id = ?`);
  stmt.run(...params);

  return getTaskById(id);
}

export function deleteTask(id: string): boolean {
  const stmt = db.prepare('DELETE FROM tasks WHERE id = ?');
  const result = stmt.run(id);
  return result.changes > 0;
}

export function getTaskStats(): { total: number; pending: number; inProgress: number; completed: number; overdue: number } {
  const now = new Date().toISOString();

  const total = (db.prepare('SELECT COUNT(*) as count FROM tasks').get() as { count: number }).count;
  const pending = (db.prepare('SELECT COUNT(*) as count FROM tasks WHERE status = ?').get('pending') as { count: number }).count;
  const inProgress = (db.prepare('SELECT COUNT(*) as count FROM tasks WHERE status = ?').get('in_progress') as { count: number }).count;
  const completed = (db.prepare('SELECT COUNT(*) as count FROM tasks WHERE status = ?').get('completed') as { count: number }).count;
  const overdue = (db.prepare('SELECT COUNT(*) as count FROM tasks WHERE status NOT IN (?, ?) AND due_date < ?').get('completed', 'cancelled', now) as { count: number }).count;

  return { total, pending, inProgress, completed, overdue };
}
