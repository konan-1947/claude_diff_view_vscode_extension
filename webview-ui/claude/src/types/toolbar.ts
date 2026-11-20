// Todo item interface
export interface Todo {
  content: string
  status: 'pending' | 'in_progress' | 'completed'
  activeForm: string  // required, since it is always provided in practice
}

// File edit info interface
export interface FileEdit {
  name: string
  additions?: number
  deletions?: number
}