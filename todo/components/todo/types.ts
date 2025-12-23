export type Priority = "high" | "medium" | "low"

export type TodoStatus = "in-progress" | "completed" | "overdue"

export interface Todo {
  id: string
  user_id: string
  title: string
  description?: string | null
  created_date: string
  due_date?: string | null
  priority: Priority
  category?: string | null
  completed: boolean
}

export interface TodoFormData {
  title: string
  description?: string
  due_date?: string
  priority: Priority
  category?: string
  completed?: boolean
}

