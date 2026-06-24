export type Role = 'admin' | 'manager' | 'member'
export type Priority = 'high' | 'medium' | 'low'
export type Frequency = 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly' | 'once'
export type TaskStatus = 'pending' | 'in-progress' | 'review' | 'done'
export type Category = 'maintenance' | 'review' | 'report' | 'meeting' | 'audit' | 'other'

export interface Profile {
  id: string
  email: string
  full_name: string
  role: Role
  department: string | null
  avatar_initials: string
  created_at: string
}

export interface Task {
  id: string
  title: string
  description: string | null
  assigned_to: string          // profile id
  assigned_to_name?: string    // joined
  category: Category
  priority: Priority
  frequency: Frequency
  status: TaskStatus
  due_date: string | null
  created_by: string
  created_at: string
  updated_at: string
}
