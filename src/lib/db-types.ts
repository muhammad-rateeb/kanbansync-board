// Auto-generated from your database schema — do not edit by hand.
// Regenerates automatically whenever a table is created or altered.

export type BoardCardsRow = {
  id: string
  userId: string
  boardId: string
  listId: string
  title: string
  description: string | null
  dueDate: string | null
  position: number | string
  createdAt: string
  updatedAt: string
}

export type BoardListsRow = {
  id: string
  userId: string
  boardId: string
  title: string
  position: number | string
  createdAt: string
}

export type BoardMembersRow = {
  id: string
  userId: string
  boardId: string
  role: string
  createdAt: string
}

export type BoardsRow = {
  id: string
  userId: string
  title: string
  createdAt: string
  updatedAt: string
}
