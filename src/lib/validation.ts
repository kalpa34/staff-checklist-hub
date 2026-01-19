import { z } from 'zod';

// Department validation schema
export const departmentSchema = z.object({
  name: z.string()
    .min(1, 'Department name is required')
    .max(100, 'Name must be less than 100 characters')
    .trim(),
  description: z.string()
    .max(500, 'Description must be less than 500 characters')
    .optional()
    .nullable()
});

// Checklist validation schema
export const checklistSchema = z.object({
  title: z.string()
    .min(1, 'Title is required')
    .max(200, 'Title must be less than 200 characters')
    .trim(),
  description: z.string()
    .max(1000, 'Description must be less than 1000 characters')
    .optional()
    .nullable(),
  departmentId: z.string().uuid('Invalid department selected')
});

// Task validation schema
export const taskSchema = z.object({
  title: z.string()
    .min(1, 'Task title is required')
    .max(200, 'Task title must be less than 200 characters')
    .trim(),
  description: z.string()
    .max(500, 'Task description must be less than 500 characters')
    .optional()
    .nullable()
});

// Employee validation schema
export const employeeSchema = z.object({
  fullName: z.string()
    .min(1, 'Full name is required')
    .max(100, 'Name must be less than 100 characters')
    .trim(),
  email: z.string()
    .min(1, 'Email is required')
    .email('Please enter a valid email address'),
  password: z.string()
    .min(6, 'Password must be at least 6 characters')
    .max(72, 'Password must be less than 72 characters'),
  role: z.enum(['admin', 'employee'])
});

// Max number of tasks from Excel import
export const MAX_EXCEL_TASKS = 500;

// Validate tasks from Excel import
export function validateExcelTasks(tasks: Array<{ title: string; description: string }>): {
  validTasks: Array<{ id: string; title: string; description: string }>;
  errors: string[];
} {
  const validTasks: Array<{ id: string; title: string; description: string }> = [];
  const errors: string[] = [];

  if (tasks.length > MAX_EXCEL_TASKS) {
    errors.push(`Excel file contains too many tasks (max ${MAX_EXCEL_TASKS})`);
    return { validTasks: [], errors };
  }

  tasks.forEach((task, index) => {
    const result = taskSchema.safeParse({
      title: task.title?.trim() || '',
      description: task.description?.trim() || ''
    });

    if (result.success && result.data.title) {
      validTasks.push({
        id: (index + 1).toString(),
        title: result.data.title,
        description: result.data.description || ''
      });
    } else if (task.title?.trim()) {
      // If title exists but validation failed, truncate to fit
      validTasks.push({
        id: (index + 1).toString(),
        title: task.title.trim().substring(0, 200),
        description: (task.description || '').trim().substring(0, 500)
      });
    }
  });

  return { validTasks, errors };
}
