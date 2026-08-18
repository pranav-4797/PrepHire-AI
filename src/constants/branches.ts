export const BRANCHES = [
  'Computer Engineering',
  'Information Technology',
  'Computer Science & Engineering (AI & ML)',
  'Computer Science & Engineering (Data Science)',
  'Computer Engineering (Software Engineering)',
  'Electronics & Telecommunication Engineering',
  'Mechanical Engineering',
  'Chemical Engineering',
  'Civil Engineering',
] as const

export type Branch = typeof BRANCHES[number]
