import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import {
  closestCorners, DndContext, DragOverlay, PointerSensor, useDroppable, useSensor, useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Activity, ArrowRight, CalendarDays, Check, Columns3, Copy, Ellipsis, Layers3, LogOut, Menu, Moon, MoreHorizontal, Plus, Settings2, Sparkles, Sun, Trash2, Users, X } from 'lucide-react'
import { z } from 'zod'
import { toast } from 'sonner'
import { blink } from '@/blink/client'
import type { BoardCardsRow, BoardListsRow, BoardMembersRow, BoardsRow } from '@/lib/db-types'

const boardsTable = blink.db.table<BoardsRow>('boards')
const membersTable = blink.db.table<BoardMembersRow>('board_members')
const listsTable = blink.db.table<BoardListsRow>('board_lists')
const cardsTable = blink.db.table<BoardCardsRow>('board_cards')
const titleSchema = z.string().trim().min(1, 'Add a name first.').max(80, 'Keep names under 80 characters.')
const cardSchema = z.object({
  title: titleSchema,
  description: z.string().max(1200, 'Descriptions can be up to 1,200 characters.'),
  dueDate: z.string().refine((value) => !value || !Number.isNaN(Date.parse(value)), 'Choose a valid date.'),
})
const accountIdSchema = z.string().trim().min(1, 'Enter the collaborator’s account ID.').max(160, 'That account ID is too long.')
type AppUser = { id: string; name: string; email: string }
type Card = BoardCardsRow
type Channel = ReturnType<typeof blink.realtime.channel>
type CardValues = z.infer<typeof cardSchema>
const makeId = () => crypto.randomUUID()
const ordered = <T extends { position: number | string }>(rows: T[]) => [...rows].sort((a, b) => Number(a.position) - Number(b.position))
const errorText = (error: unknown) => error instanceof Error ? error.message : 'Please try again.'
const localDateStamp = () => {
  const date = new Date()
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export function WorkspaceLoading() {
  return <main className="min-h-dvh bg-background p-6"><div className="mx-auto max-w-7xl animate-pulse space-y-8"><div className="h-12 rounded-2xl bg-muted" /><div className="flex gap-5">{[0, 1, 2, 3].map((item) => <div key={item} className="h-[420px] w-72 shrink-0 rounded-2xl bg-muted/70" />)}</div></div></main>
}

function BrandMark() {
  return <div className="flex items-center gap-3"><div className="grid h-10 w-10 grid-cols-2 gap-1 rounded-xl bg-primary p-2 shadow-sm"><span className="rounded-sm bg-primary-foreground" /><span className="rounded-sm bg-primary-foreground/55" /><span className="rounded-sm bg-primary-foreground/70" /><span className="rounded-sm bg-primary-foreground/35" /></div><span className="text-[15px] font-bold tracking-tight">KanbanSync</span></div>
}

function SignInScreen({ onSignIn }: { onSignIn: () => void }) {
  return <main className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-background px-5 py-12"><div className="absolute -right-24 -top-28 h-96 w-96 rounded-full bg-primary/10 blur-3xl" /><div className="absolute -bottom-36 -left-24 h-96 w-96 rounded-full bg-accent/60 blur-3xl" /><section className="relative w-full max-w-[440px] rounded-[2rem] border border-border/80 bg-card/90 p-8 shadow-xl backdrop-blur sm:p-10"><BrandMark /><p className="mt-10 text-xs font-semibold uppercase tracking-[0.22em] text-primary">A little more flow</p><h1 className="mt-3 font-serif text-4xl leading-tight tracking-tight sm:text-5xl">Good work, <em>in motion.</em></h1><p className="mt-4 max-w-sm text-sm leading-6 text-muted-foreground">Bring your projects into one clear view. Make a board, move the work, and keep everyone on the same page.</p><button onClick={onSignIn} className="mt-8 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground shadow-md transition hover:-translate-y-0.5 hover:shadow-lg active:translate-y-0">Continue to your workspace <ArrowRight className="h-4 w-4" /></button><p className="mt-4 text-center text-xs text-muted-foreground">Sign in or create your KanbanSync account securely.</p><div className="mt-8 flex items-center gap-3 border-t border-border pt-5 text-xs text-muted-foreground"><Activity className="h-4 w-4" /> Your boards stay private to their members.</div></section></main>
}

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return <div className="fixed inset-0 z-50 grid place-items-center bg-foreground/30 px-4 py-8 backdrop-blur-sm" role="presentation" onMouseDown={onClose}><section role="dialog" aria-modal="true" aria-label={title} onMouseDown={(event) => event.stopPropagation()} className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl"><div className="flex items-center justify-between"><h2 className="font-serif text-2xl">{title}</h2><button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground hover:bg-muted" aria-label="Close"><X className="h-4 w-4" /></button></div>{children}</section></div>
}

function CardSurface({ card, overlay = false, today = '' }: { card: Card; overlay?: boolean; today?: string }) {
  const overdue = Boolean(card.dueDate && today && card.dueDate.slice(0, 10) < today)
  return <div className={overlay ? 'w-[275px] rotate-1 rounded-xl border border-primary/30 bg-card p-3.5 shadow-xl' : ''}><p className="text-sm font-semibold leading-5">{card.title}</p>{card.description && <p className="mt-2 line-clamp-2 text-xs leading-5 text-muted-foreground">{card.description}</p>}{card.dueDate && <div className={`mt-3 inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[10px] font-semibold ${overdue ? 'bg-destructive/10 text-destructive' : 'bg-secondary text-secondary-foreground'}`}><CalendarDays className="h-3 w-3" /><time dateTime={card.dueDate}>{new Date(`${card.dueDate}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</time></div>}</div>
}

function SortableCard({ card, onOpen, disabled, today }: { card: Card; onOpen: () => void; disabled: boolean; today: string }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: `card:${card.id}`, disabled })
  return <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} {...attributes} {...listeners} className={isDragging ? 'opacity-35' : ''}><button onClick={onOpen} className="w-full cursor-grab rounded-xl border border-border/75 bg-card p-3.5 text-left shadow-sm transition duration-200 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md active:cursor-grabbing active:scale-[0.99]"><CardSurface card={card} today={today} /></button></div>
}

function BoardColumn({ list, cards, onAddCard, onOpenCard, onRename, onDelete, editing, editingTitle, onEditingTitle, onSaveRename, onCancelRename, dragDisabled, today }: {
  list: BoardListsRow; cards: Card[]; onAddCard: (listId: string, title: string) => void; onOpenCard: (card: Card) => void
  onRename: (list: BoardListsRow) => void; onDelete: (list: BoardListsRow) => void; editing: boolean; editingTitle: string
  onEditingTitle: (title: string) => void; onSaveRename: (event: FormEvent<HTMLFormElement>) => void; onCancelRename: () => void; dragDisabled: boolean; today: string
}) {
  const [adding, setAdding] = useState(false)
  const [cardTitle, setCardTitle] = useState('')
  const { setNodeRef, isOver } = useDroppable({ id: `column:${list.id}` })
  const submitCard = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!cardTitle.trim()) return toast.error('Add a card name first.')
    onAddCard(list.id, cardTitle)
    setCardTitle('')
    setAdding(false)
  }
  return <section ref={setNodeRef} className={`flex max-h-full w-[275px] shrink-0 flex-col rounded-2xl border bg-secondary/50 p-2.5 transition-colors sm:w-[295px] sm:p-3 ${isOver ? 'border-primary/50 bg-primary/5' : 'border-border/70'}`} aria-label={`${list.title} list`}><div className="flex items-center gap-2 px-1 pb-3 pt-1"><span className="h-2 w-2 rounded-full bg-primary" />{editing ? <form onSubmit={onSaveRename} className="flex min-w-0 flex-1 items-center gap-1"><input autoFocus value={editingTitle} onChange={(event) => onEditingTitle(event.target.value)} className="min-w-0 flex-1 border-b border-primary bg-transparent text-sm font-semibold outline-none" aria-label="List name" /><button aria-label="Save list name" className="text-primary"><Check className="h-4 w-4" /></button><button type="button" onClick={onCancelRename} aria-label="Cancel rename" className="text-muted-foreground"><X className="h-4 w-4" /></button></form> : <><h2 className="min-w-0 flex-1 truncate text-sm font-bold">{list.title}</h2><span className="rounded-md bg-background/80 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-muted-foreground">{cards.length}</span><div className="group relative"><button className="grid h-7 w-7 place-items-center rounded-lg text-muted-foreground hover:bg-background" aria-label={`Options for ${list.title}`}><Ellipsis className="h-4 w-4" /></button><div className="invisible absolute right-0 top-7 z-10 w-36 rounded-xl border border-border bg-popover p-1 opacity-0 shadow-lg transition group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100"><button onClick={() => onRename(list)} className="w-full rounded-lg px-2 py-2 text-left text-xs hover:bg-muted">Rename list</button><button onClick={() => onDelete(list)} className="w-full rounded-lg px-2 py-2 text-left text-xs text-destructive hover:bg-destructive/10">Delete list</button></div></div></>}</div><SortableContext items={cards.map((card) => `card:${card.id}`)} strategy={verticalListSortingStrategy}><div className="min-h-12 flex-1 space-y-2 overflow-y-auto px-0.5 pb-2">{cards.map((card) => <SortableCard key={card.id} card={card} onOpen={() => onOpenCard(card)} disabled={dragDisabled} today={today} />)}{cards.length === 0 && !adding && <div className="grid min-h-24 place-items-center rounded-xl border border-dashed border-border/70 text-center"><p className="text-[11px] text-muted-foreground">Drop a card here<br />or add the next step</p></div>}</div></SortableContext>{adding ? <form onSubmit={submitCard} className="mt-1 rounded-xl border border-primary/30 bg-card p-2 shadow-sm"><input autoFocus value={cardTitle} onChange={(event) => setCardTitle(event.target.value)} placeholder="What needs doing?" className="h-9 w-full bg-transparent px-1 text-sm outline-none placeholder:text-muted-foreground" aria-label="New card title" /><div className="mt-1 flex justify-end gap-1"><button type="button" onClick={() => { setAdding(false); setCardTitle('') }} className="rounded-lg px-2 py-1.5 text-xs text-muted-foreground hover:bg-muted">Cancel</button><button className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground">Add card</button></div></form> : <button onClick={() => setAdding(true)} className="mt-1 flex h-9 items-center gap-2 rounded-xl px-2 text-xs font-semibold text-muted-foreground transition hover:bg-card hover:text-primary"><Plus className="h-3.5 w-3.5" /> Add a card</button>}</section>
}

function CardEditor({ card, onSave, onDelete, onClose }: { card: Card; onSave: (card: Card, values: CardValues) => Promise<void>; onDelete: (card: Card) => Promise<void>; onClose: () => void }) {
  const [title, setTitle] = useState(card.title)
  const [description, setDescription] = useState(card.description ?? '')
  const [dueDate, setDueDate] = useState(card.dueDate ?? '')
  const [saving, setSaving] = useState(false)
  const [removing, setRemoving] = useState(false)
  const [error, setError] = useState('')
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const parsed = cardSchema.safeParse({ title, description, dueDate })
    if (!parsed.success) return setError(parsed.error.issues[0]?.message || 'Check the card details.')
    setSaving(true)
    try { await onSave(card, parsed.data); onClose() } catch (failure) { setError(errorText(failure)) } finally { setSaving(false) }
  }
  const remove = async () => {
    setRemoving(true)
    try { await onDelete(card); onClose() } catch (failure) { setError(errorText(failure)) } finally { setRemoving(false) }
  }
  return <Modal title="Card details" onClose={onClose}><form onSubmit={(event) => void submit(event)} className="mt-5 space-y-4"><label className="block text-xs font-semibold">Title<input value={title} onChange={(event) => setTitle(event.target.value)} className="mt-2 h-11 w-full rounded-xl border border-input bg-background px-3 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15" /></label><label className="block text-xs font-semibold">Description<textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={4} maxLength={1200} placeholder="Add a few details…" className="mt-2 w-full resize-y rounded-xl border border-input bg-background px-3 py-2.5 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15" /></label><label className="block text-xs font-semibold">Due date<input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} className="mt-2 h-11 w-full rounded-xl border border-input bg-background px-3 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15" /></label>{error && <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">{error}</p>}<div className="flex items-center justify-between border-t border-border pt-4"><button type="button" onClick={() => void remove()} disabled={removing || saving} className="inline-flex items-center gap-1.5 rounded-lg px-2 py-2 text-xs font-medium text-destructive transition hover:bg-destructive/10 disabled:opacity-50"><Trash2 className="h-3.5 w-3.5" />{removing ? 'Deleting…' : 'Delete card'}</button><div className="flex gap-2"><button type="button" onClick={onClose} className="h-10 rounded-xl px-3 text-sm font-medium text-muted-foreground hover:bg-muted">Cancel</button><button disabled={saving || removing} className="h-10 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-50">{saving ? 'Saving…' : 'Save changes'}</button></div></div></form></Modal>
}

export function KanbanWorkspace() {
  const [user, setUser] = useState<AppUser | null>(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [boards, setBoards] = useState<BoardsRow[]>([])
  const [selectedBoardId, setSelectedBoardId] = useState<string | null>(null)
  const [lists, setLists] = useState<BoardListsRow[]>([])
  const [cards, setCards] = useState<Card[]>([])
  const [boardsLoading, setBoardsLoading] = useState(true)
  const [boardLoading, setBoardLoading] = useState(true)
  const [live, setLive] = useState(false)
  const [newBoardOpen, setNewBoardOpen] = useState(false)
  const [newBoardTitle, setNewBoardTitle] = useState('')
  const [editingTitle, setEditingTitle] = useState(false)
  const [boardTitleDraft, setBoardTitleDraft] = useState('')
  const [newListTitle, setNewListTitle] = useState('')
  const [editingListId, setEditingListId] = useState<string | null>(null)
  const [editingListTitle, setEditingListTitle] = useState('')
  const [selectedCard, setSelectedCard] = useState<Card | null>(null)
  const [draggedCard, setDraggedCard] = useState<Card | null>(null)
  const [movingCard, setMovingCard] = useState(false)
  const [today, setToday] = useState('')
  const [shareOpen, setShareOpen] = useState(false)
  const [members, setMembers] = useState<BoardMembersRow[]>([])
  const [inviteAccountId, setInviteAccountId] = useState('')
  const [memberBusy, setMemberBusy] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [mobileBoardsOpen, setMobileBoardsOpen] = useState(false)
  const [darkMode, setDarkMode] = useState(false)
  const channelRef = useRef<Channel | null>(null)
  const board = boards.find((item) => item.id === selectedBoardId) ?? null
  const boardId = board?.id ?? null
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setToday(localDateStamp())
      setDarkMode(document.documentElement.classList.contains('dark'))
    }, 0)
    const interval = window.setInterval(() => setToday(localDateStamp()), 60_000)
    return () => { window.clearTimeout(timer); window.clearInterval(interval) }
  }, [])

  useEffect(() => {
    return blink.auth.onAuthStateChanged((state) => {
      const nextUser = state.user ? { id: state.user.id, name: state.user.displayName || state.user.email || 'Your workspace', email: state.user.email || '' } : null
      setUser(nextUser)
      if (!nextUser) {
        setBoards([])
        setSelectedBoardId(null)
        setLists([])
        setCards([])
        setBoardsLoading(false)
        setBoardLoading(false)
      } else {
        setBoardsLoading(true)
        setBoardLoading(true)
      }
      if (!state.isLoading) setAuthLoading(false)
    })
  }, [])

  const reloadBoards = useCallback(async () => {
    if (!user?.id) return [] as BoardsRow[]
    try {
      // Membership RLS on boards returns only boards this user owns or belongs to.
      const available = await boardsTable.list({ orderBy: { updatedAt: 'desc' } })
      setBoards(available)
      setSelectedBoardId((current) => available.some((item) => item.id === current) ? current : available[0]?.id ?? null)
      return available
    } finally {
      setBoardsLoading(false)
    }
  }, [user])

  useEffect(() => {
    if (!user?.id) return
    let active = true
    reloadBoards().catch((error: unknown) => { if (active) toast.error('Your boards could not load', { description: errorText(error) }) })
    return () => { active = false }
  }, [reloadBoards, user?.id])

  const loadBoardData = useCallback(async (targetBoardId: string) => {
    if (!user?.id) return
    try {
      const [nextLists, nextCards] = await Promise.all([listsTable.list({ where: { boardId: targetBoardId }, orderBy: { position: 'asc' } }), cardsTable.list({ where: { boardId: targetBoardId }, orderBy: { position: 'asc' } })])
      setLists(ordered(nextLists))
      setCards(ordered(nextCards))
    } finally { setBoardLoading(false) }
  }, [user])

  useEffect(() => {
    if (!boardId || !user?.id) return
    let active = true
    loadBoardData(boardId).catch((error: unknown) => { if (active) toast.error('This board could not load', { description: errorText(error) }) })
    return () => { active = false }
  }, [boardId, loadBoardData, user?.id])

  useEffect(() => {
    if (!boardId || !user?.id) return
    let active = true
    let channel: Channel | null = null
    const connect = async () => {
      try {
        channel = blink.realtime.channel(`kanbansync-board-${boardId}`)
        channelRef.current = channel
        await channel.subscribe({ userId: user.id, metadata: { displayName: user.name } })
        if (!active) { await channel.unsubscribe(); return }
        channel.onMessage((message) => {
          if (message.type === 'board-change' && message.userId !== user.id) {
            void Promise.all([loadBoardData(boardId), reloadBoards()]).catch((error: unknown) => toast.error('A live update could not load', { description: errorText(error) }))
          }
        })
        setLive(true)
      } catch (error) { if (active) toast.error('Live updates are reconnecting', { description: errorText(error) }) }
    }
    void connect()
    return () => { active = false; channelRef.current = null; setLive(false); if (channel) void channel.unsubscribe() }
  }, [boardId, loadBoardData, reloadBoards, user?.id, user?.name])

  const broadcast = useCallback(async (action: string, entityId: string) => {
    if (!channelRef.current || !user) return
    try { await channelRef.current.publish('board-change', { action, entityId, at: Date.now() }, { userId: user.id, metadata: { displayName: user.name } }) }
    catch (error) { toast.error('Saved, but live updates could not be sent', { description: errorText(error) }) }
  }, [user])

  const toggleTheme = () => {
    const next = !darkMode
    setDarkMode(next)
    document.documentElement.classList.toggle('dark', next)
    localStorage.setItem('theme', next ? 'dark' : 'light')
  }

  const createBoard = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!user) return
    const parsed = titleSchema.safeParse(newBoardTitle)
    if (!parsed.success) return toast.error(parsed.error.issues[0]?.message || 'Enter a board name.')
    const boardId = makeId()
    const now = new Date().toISOString()
    const optimisticBoard: BoardsRow = { id: boardId, userId: user.id, title: parsed.data, createdAt: now, updatedAt: now }
    const starterLists: BoardListsRow[] = ['To do', 'In progress', 'Done'].map((title, index) => ({ id: makeId(), userId: user.id, boardId, title, position: index * 1000, createdAt: now }))
    const previousBoardId = selectedBoardId
    const previousLists = lists
    const previousCards = cards
    setBoards((current) => [optimisticBoard, ...current])
    setSelectedBoardId(boardId)
    setLists(starterLists)
    setCards([])
    setBoardLoading(false)
    setNewBoardTitle('')
    setNewBoardOpen(false)
    try {
      await boardsTable.create(optimisticBoard)
      await membersTable.create({ id: makeId(), userId: user.id, boardId, role: 'owner', createdAt: now })
      for (const item of starterLists) await listsTable.create(item)
      await broadcast('board-created', boardId)
      toast.success('Your board is ready')
    } catch (error) {
      await Promise.allSettled([cardsTable.deleteMany({ where: { boardId } }), listsTable.deleteMany({ where: { boardId } }), membersTable.deleteMany({ where: { boardId } }), boardsTable.delete(boardId)])
      setBoards((current) => current.filter((item) => item.id !== boardId))
      setSelectedBoardId(previousBoardId)
      setLists(previousLists)
      setCards(previousCards)
      setBoardLoading(false)
      toast.error('The board could not be created', { description: errorText(error) })
    }
  }

  const renameBoard = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!board) return
    const parsed = titleSchema.safeParse(boardTitleDraft)
    if (!parsed.success) return toast.error(parsed.error.issues[0]?.message || 'Enter a board name.')
    const updatedAt = new Date().toISOString()
    const previous = board
    setBoards((current) => current.map((item) => item.id === board.id ? { ...item, title: parsed.data, updatedAt } : item))
    setEditingTitle(false)
    try {
      await boardsTable.update(board.id, { title: parsed.data, updatedAt })
      await broadcast('board-renamed', board.id)
      toast.success('Board name updated')
    } catch (error) {
      setBoards((current) => current.map((item) => item.id === previous.id ? previous : item))
      setEditingTitle(true)
      toast.error('The board name could not be saved', { description: errorText(error) })
    }
  }

  const deleteBoard = async () => {
    if (!board || !user || board.userId !== user.id) return
    if (!window.confirm(`Delete “${board.title}” and all its cards? This cannot be undone.`)) return
    try {
      await cardsTable.deleteMany({ where: { boardId: board.id } })
      await listsTable.deleteMany({ where: { boardId: board.id } })
      await membersTable.deleteMany({ where: { boardId: board.id } })
      await boardsTable.delete(board.id)
      const remaining = boards.filter((item) => item.id !== board.id)
      setBoards(remaining)
      setLists([])
      setCards([])
      setBoardLoading(Boolean(remaining[0]))
      setSelectedBoardId(remaining[0]?.id ?? null)
      setMenuOpen(false)
      toast.success('Board deleted')
    } catch (error) { toast.error('The board could not be deleted', { description: errorText(error) }) }
  }

  const addList = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!board || !user) return
    const parsed = titleSchema.safeParse(newListTitle)
    if (!parsed.success) return toast.error(parsed.error.issues[0]?.message || 'Enter a list name.')
    const now = new Date().toISOString()
    const item: BoardListsRow = { id: makeId(), userId: user.id, boardId: board.id, title: parsed.data, position: lists.length ? Math.max(...lists.map((list) => Number(list.position))) + 1000 : 0, createdAt: now }
    setLists((current) => [...current, item])
    setNewListTitle('')
    try { await listsTable.create(item); await broadcast('list-created', item.id) }
    catch (error) { setLists((current) => current.filter((list) => list.id !== item.id)); toast.error('The list could not be created', { description: errorText(error) }) }
  }

  const renameList = async (event: FormEvent<HTMLFormElement>, list: BoardListsRow) => {
    event.preventDefault()
    const parsed = titleSchema.safeParse(editingListTitle)
    if (!parsed.success) return toast.error(parsed.error.issues[0]?.message || 'Enter a list name.')
    setLists((current) => current.map((item) => item.id === list.id ? { ...item, title: parsed.data } : item))
    setEditingListId(null)
    try { await listsTable.update(list.id, { title: parsed.data }); await broadcast('list-renamed', list.id) }
    catch (error) { setLists((current) => current.map((item) => item.id === list.id ? list : item)); setEditingListId(list.id); toast.error('The list name could not be saved', { description: errorText(error) }) }
  }

  const deleteList = async (list: BoardListsRow) => {
    if (!window.confirm(`Delete “${list.title}” and the cards inside it?`)) return
    const previousCards = cards
    setCards((current) => current.filter((card) => card.listId !== list.id))
    setLists((current) => current.filter((item) => item.id !== list.id))
    try { await cardsTable.deleteMany({ where: { listId: list.id } }); await listsTable.delete(list.id); await broadcast('list-deleted', list.id); toast.success('List deleted') }
    catch (error) { setLists((current) => [...current, list].sort((a, b) => Number(a.position) - Number(b.position))); setCards(previousCards); toast.error('The list could not be deleted', { description: errorText(error) }) }
  }

  const createCard = async (listId: string, rawTitle: string) => {
    if (!board || !user) return
    const parsed = cardSchema.safeParse({ title: rawTitle, description: '', dueDate: '' })
    if (!parsed.success) return toast.error(parsed.error.issues[0]?.message || 'Enter a card name.')
    const inList = cards.filter((card) => card.listId === listId)
    const position = inList.length ? Math.max(...inList.map((card) => Number(card.position))) + 1000 : 0
    const now = new Date().toISOString()
    const tempId = `pending-${makeId()}`
    const optimistic: Card = { id: tempId, userId: user.id, boardId: board.id, listId, title: parsed.data.title, description: '', dueDate: null, position, createdAt: now, updatedAt: now }
    setCards((current) => [...current, optimistic])
    try { const saved = await cardsTable.create({ ...optimistic, id: makeId() }); setCards((current) => ordered(current.map((card) => card.id === tempId ? saved : card))); await broadcast('card-created', saved.id); toast.success('Card added') }
    catch (error) { setCards((current) => current.filter((card) => card.id !== tempId)); toast.error('The card could not be created', { description: errorText(error) }) }
  }

  const saveCard = async (card: Card, values: CardValues) => {
    const parsed = cardSchema.safeParse(values)
    if (!parsed.success) throw new Error(parsed.error.issues[0]?.message || 'Check the card details.')
    const updatedAt = new Date().toISOString()
    const optimistic = { ...card, title: parsed.data.title, description: parsed.data.description, dueDate: parsed.data.dueDate || null, updatedAt }
    setCards((current) => current.map((item) => item.id === card.id ? optimistic : item))
    setSelectedCard(optimistic)
    try { await cardsTable.update(card.id, { title: optimistic.title, description: optimistic.description, dueDate: optimistic.dueDate, updatedAt }); await broadcast('card-edited', card.id); toast.success('Card saved') }
    catch (error) { setCards((current) => current.map((item) => item.id === card.id ? card : item)); setSelectedCard(card); throw error }
  }

  const deleteCard = async (card: Card) => {
    const before = cards
    setCards((current) => current.filter((item) => item.id !== card.id))
    try { await cardsTable.delete(card.id); setSelectedCard(null); await broadcast('card-deleted', card.id); toast.success('Card deleted') }
    catch (error) { setCards(before); throw error }
  }

  const openShare = async () => {
    if (!board || board.userId !== user?.id) return
    try {
      const boardMembers = await membersTable.list({ where: { boardId: board.id }, orderBy: { createdAt: 'asc' } })
      setMembers(boardMembers)
      setShareOpen(true)
    } catch (error) { toast.error('Collaborators could not be loaded', { description: errorText(error) }) }
  }

  const addCollaborator = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!board || !user || board.userId !== user.id) return
    const parsed = accountIdSchema.safeParse(inviteAccountId)
    if (!parsed.success) return toast.error(parsed.error.issues[0]?.message || 'Enter an account ID.')
    if (parsed.data === user.id) return toast.error('You already have access as the board owner.')
    setMemberBusy(true)
    const member: BoardMembersRow = { id: makeId(), userId: parsed.data, boardId: board.id, role: 'member', createdAt: new Date().toISOString() }
    try {
      await membersTable.create(member)
      setMembers((current) => [...current, member])
      setInviteAccountId('')
      await broadcast('member-added', member.id)
      toast.success('Board access granted', { description: 'The collaborator can now open this board with their account.' })
    } catch (error) { toast.error('Could not add this collaborator', { description: errorText(error) }) }
    finally { setMemberBusy(false) }
  }

  const removeCollaborator = async (member: BoardMembersRow) => {
    if (!board || board.userId !== user?.id || member.userId === board.userId) return
    setMemberBusy(true)
    try {
      await membersTable.delete(member.id)
      setMembers((current) => current.filter((item) => item.id !== member.id))
      await broadcast('member-removed', member.id)
      toast.success('Board access removed')
    } catch (error) { toast.error('Could not remove board access', { description: errorText(error) }) }
    finally { setMemberBusy(false) }
  }

  const copyAccountId = async () => {
    try { await navigator.clipboard.writeText(user.id); toast.success('Your account ID was copied') }
    catch (error) { toast.error('Could not copy your account ID', { description: errorText(error) }) }
  }

  const moveCard = async (event: DragEndEvent) => {
    const activeId = String(event.active.id)
    const overId = event.over ? String(event.over.id) : ''
    if (!activeId.startsWith('card:') || !overId || activeId === overId || !board) return
    const moving = cards.find((card) => card.id === activeId.slice(5))
    if (!moving) return
    const target = overId.startsWith('card:') ? cards.find((card) => card.id === overId.slice(5)) : null
    const targetListId = target?.listId ?? (overId.startsWith('column:') ? overId.slice(7) : '')
    if (!targetListId || !lists.some((list) => list.id === targetListId)) return
    const snapshot = cards
    const destination = ordered(cards.filter((card) => card.listId === targetListId && card.id !== moving.id))
    const foundIndex = target ? destination.findIndex((card) => card.id === target.id) : destination.length
    const index = foundIndex < 0 ? destination.length : foundIndex
    const before = destination[index - 1]
    const after = destination[index]
    const position = before && after ? (Number(before.position) + Number(after.position)) / 2 : before ? Number(before.position) + 1000 : after ? Number(after.position) - 1000 : 0
    setCards(ordered(cards.map((card) => card.id === moving.id ? { ...card, listId: targetListId, position } : card)))
    setMovingCard(true)
    try { await cardsTable.update(moving.id, { listId: targetListId, position, updatedAt: new Date().toISOString() }); await broadcast('card-moved', moving.id) }
    catch (error) { setCards(snapshot); toast.error('The card could not be moved', { description: errorText(error) }) }
    finally { setMovingCard(false); setDraggedCard(null) }
  }

  const grouped = useMemo(() => new Map(lists.map((list) => [list.id, ordered(cards.filter((card) => card.listId === list.id))])), [cards, lists])

  if (authLoading) return <WorkspaceLoading />
  if (!user) return <SignInScreen onSignIn={() => blink.auth.login()} />

  return <main className="flex min-h-dvh flex-col overflow-hidden bg-background text-foreground">
    <header className="relative z-20 flex h-[68px] shrink-0 items-center justify-between border-b border-border/80 bg-card/85 px-4 backdrop-blur-xl sm:px-6"><div className="flex min-w-0 items-center gap-3"><button onClick={() => setMobileBoardsOpen(!mobileBoardsOpen)} className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-border bg-background text-muted-foreground transition hover:bg-muted md:hidden" aria-label="Open boards"><Menu className="h-4 w-4" /></button><BrandMark /><span className="hidden h-6 w-px bg-border sm:block" /><div className="hidden items-center gap-2 text-xs text-muted-foreground sm:flex"><span className={`h-2 w-2 rounded-full ${live ? 'bg-primary' : 'bg-amber-500'}`} />{live ? 'Live' : 'Connecting'}</div></div><div className="flex items-center gap-2"><button onClick={toggleTheme} className="grid h-9 w-9 place-items-center rounded-xl text-muted-foreground transition hover:bg-muted hover:text-foreground" aria-label={darkMode ? 'Switch to light theme' : 'Switch to dark theme'}>{darkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}</button><div className="hidden max-w-36 items-center gap-2 rounded-full border border-border bg-background py-1 pl-1 pr-3 sm:flex"><div className="grid h-7 w-7 place-items-center rounded-full bg-accent text-xs font-bold text-accent-foreground">{user.name.charAt(0).toUpperCase()}</div><span className="truncate text-xs font-medium">{user.name}</span></div><button onClick={() => void blink.auth.logout()} className="grid h-9 w-9 place-items-center rounded-xl text-muted-foreground transition hover:bg-muted hover:text-foreground" aria-label="Sign out" title="Sign out"><LogOut className="h-4 w-4" /></button></div></header>
    <div className="flex min-h-0 flex-1"><aside className={`${mobileBoardsOpen ? 'absolute inset-x-0 top-[68px] z-30 block border-b shadow-xl' : 'hidden'} w-full shrink-0 bg-card p-4 md:relative md:inset-auto md:block md:w-[244px] md:border-r md:border-b-0 md:p-5 md:shadow-none`}><div className="flex items-center justify-between"><p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">Your workspace</p><button onClick={() => { setNewBoardOpen(true); setMobileBoardsOpen(false) }} className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground transition hover:bg-muted hover:text-primary" aria-label="Create a board"><Plus className="h-4 w-4" /></button></div><button onClick={() => { setNewBoardOpen(true); setMobileBoardsOpen(false) }} className="mt-4 flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-border text-sm font-semibold text-muted-foreground transition hover:border-primary/50 hover:bg-primary/5 hover:text-primary"><Plus className="h-4 w-4" /> New board</button><div className="mt-6 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground"><Layers3 className="h-3.5 w-3.5" /> Boards</div><nav className="mt-2 max-h-52 space-y-1 overflow-y-auto md:max-h-[calc(100dvh-270px)]" aria-label="Boards">{boardsLoading ? <div className="space-y-2 py-2">{[0, 1, 2].map((item) => <div key={item} className="h-9 animate-pulse rounded-lg bg-muted" />)}</div> : boards.map((item, index) => <button key={item.id} onClick={() => { setBoardLoading(true); setLists([]); setCards([]); setSelectedBoardId(item.id); setMobileBoardsOpen(false) }} className={`group flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm transition ${selectedBoardId === item.id ? 'bg-primary/10 font-semibold text-primary' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}`}><span className={`grid h-6 w-6 shrink-0 place-items-center rounded-md text-[10px] font-bold ${selectedBoardId === item.id ? 'bg-primary text-primary-foreground' : 'bg-accent text-accent-foreground'}`}>{item.title.charAt(0).toUpperCase()}</span><span className="min-w-0 flex-1 truncate">{item.title}</span>{index === 0 && item.userId === user.id && <span className="h-1.5 w-1.5 rounded-full bg-primary" />}</button>)}{!boardsLoading && boards.length === 0 && <p className="px-2 py-3 text-xs leading-5 text-muted-foreground">No boards yet. Create one to start organizing your work.</p>}</nav><div className="mt-6 hidden rounded-2xl bg-secondary/70 p-4 md:block"><div className="flex items-center gap-2 text-xs font-semibold"><Sparkles className="h-3.5 w-3.5 text-primary" /> Keep it moving</div><p className="mt-2 text-[11px] leading-5 text-muted-foreground">A clear next step is often all a project needs.</p></div><div className="mt-6 hidden items-center gap-2 border-t border-border pt-4 text-[11px] text-muted-foreground md:flex"><Activity className="h-3.5 w-3.5 text-primary" /> Updates sync live</div></aside>
      <section className="flex min-w-0 flex-1 flex-col overflow-hidden">{board ? <><div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-border/70 px-4 py-4 sm:px-7 sm:py-5"><div className="min-w-0 flex-1"><div className="mb-1 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground"><span>Boards</span><span>/</span><span className="truncate">{board.title}</span></div>{editingTitle ? <form onSubmit={(event) => void renameBoard(event)} className="flex items-center gap-2"><input autoFocus value={boardTitleDraft} onChange={(event) => setBoardTitleDraft(event.target.value)} className="min-w-0 max-w-lg border-b border-primary bg-transparent py-1 font-serif text-2xl outline-none sm:text-3xl" aria-label="Board name" /><button className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground">Save</button><button type="button" onClick={() => setEditingTitle(false)} className="rounded-lg p-2 text-muted-foreground hover:bg-muted" aria-label="Cancel rename"><X className="h-4 w-4" /></button></form> : <h1 className="truncate font-serif text-2xl tracking-tight sm:text-3xl">{board.title}</h1>}</div><div className="relative flex items-center gap-2"><div className="hidden items-center gap-2 rounded-full bg-secondary px-3 py-1.5 text-[11px] font-medium text-secondary-foreground sm:flex"><span className={`h-1.5 w-1.5 rounded-full ${live ? 'bg-primary' : 'bg-amber-500'}`} />{live ? 'Synced just now' : 'Syncing board'}</div>{board.userId === user.id && <><button onClick={() => { setBoardTitleDraft(board.title); setEditingTitle(true) }} className="hidden h-9 items-center gap-2 rounded-xl border border-border px-3 text-xs font-semibold text-muted-foreground transition hover:bg-muted hover:text-foreground sm:flex"><Settings2 className="h-3.5 w-3.5" /> Rename</button><button onClick={() => setMenuOpen(!menuOpen)} className="grid h-9 w-9 place-items-center rounded-xl border border-border text-muted-foreground transition hover:bg-muted" aria-label="Board options"><MoreHorizontal className="h-4 w-4" /></button>{menuOpen && <div className="absolute right-0 top-11 z-20 w-48 rounded-xl border border-border bg-popover p-1.5 shadow-lg"><button onClick={() => { setBoardTitleDraft(board.title); setEditingTitle(true); setMenuOpen(false) }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs hover:bg-muted"><Settings2 className="h-3.5 w-3.5" /> Rename board</button><button onClick={() => void openShare()} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs hover:bg-muted"><Users className="h-3.5 w-3.5" /> Share board</button><button onClick={() => void deleteBoard()} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs text-destructive hover:bg-destructive/10"><Trash2 className="h-3.5 w-3.5" /> Delete board</button></div>}</>}</div></div><div className="flex min-h-0 flex-1 flex-col overflow-hidden">{boardLoading ? <div className="flex gap-4 overflow-hidden p-6">{[0, 1, 2].map((item) => <div key={item} className="h-[450px] w-[290px] shrink-0 animate-pulse rounded-2xl bg-muted" />)}</div> : <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={(event) => { const activeId = String(event.active.id); setDraggedCard(cards.find((card) => `card:${card.id}` === activeId) ?? null) }} onDragEnd={(event) => void moveCard(event)} onDragCancel={() => setDraggedCard(null)}><div className="flex min-h-0 flex-1 items-start gap-4 overflow-x-auto overflow-y-hidden px-4 py-5 sm:gap-5 sm:px-7 sm:py-7">{lists.map((list) => <BoardColumn key={list.id} list={list} cards={grouped.get(list.id) ?? []} onAddCard={createCard} onOpenCard={setSelectedCard} onRename={(item) => { setEditingListId(item.id); setEditingListTitle(item.title) }} onDelete={(item) => void deleteList(item)} editing={editingListId === list.id} editingTitle={editingListTitle} onEditingTitle={setEditingListTitle} onSaveRename={(event) => void renameList(event, list)} onCancelRename={() => setEditingListId(null)} dragDisabled={movingCard} today={today} />)}<form onSubmit={(event) => void addList(event)} className="w-[275px] shrink-0 rounded-2xl border border-dashed border-border bg-card/50 p-3 transition hover:border-primary/40 sm:w-[295px]"><label htmlFor="new-list" className="sr-only">New list name</label><div className="flex items-center gap-2"><input id="new-list" value={newListTitle} onChange={(event) => setNewListTitle(event.target.value)} placeholder="Add another list…" className="h-10 min-w-0 flex-1 rounded-lg bg-transparent px-2 text-sm outline-none placeholder:text-muted-foreground" /><button aria-label="Create list" className="grid h-8 w-8 place-items-center rounded-lg bg-primary text-primary-foreground transition hover:scale-105 active:scale-95"><Plus className="h-4 w-4" /></button></div></form>{lists.length === 0 && <div className="pointer-events-none absolute left-1/2 top-1/2 hidden -translate-x-1/2 -translate-y-1/2 text-center lg:block"><div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-accent text-accent-foreground"><Columns3 className="h-5 w-5" /></div><p className="mt-3 text-sm font-semibold">Your board starts with a list</p><p className="mt-1 text-xs text-muted-foreground">Add a column, then bring in the cards.</p></div>}</div><DragOverlay>{draggedCard ? <CardSurface card={draggedCard} overlay today={today} /> : null}</DragOverlay></DndContext>}</div></> : <div className="grid min-h-[70vh] flex-1 place-items-center px-6 py-12"><div className="max-w-md text-center"><div className="mx-auto grid h-16 w-16 place-items-center rounded-[1.35rem] bg-primary/10 text-primary"><Columns3 className="h-7 w-7" /></div><h1 className="mt-6 font-serif text-3xl tracking-tight">A clear path starts here.</h1><p className="mx-auto mt-3 max-w-sm text-sm leading-6 text-muted-foreground">Create a board for a project, a launch, or the million little things in between.</p><button onClick={() => setNewBoardOpen(true)} className="mt-6 inline-flex h-11 items-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"><Plus className="h-4 w-4" /> Create your first board</button>{boardsLoading && <p className="mt-4 text-xs text-muted-foreground">Loading your boards…</p>}</div></div>}</section>
    </div>
    {newBoardOpen && <Modal title="Create a board" onClose={() => setNewBoardOpen(false)}><p className="text-sm text-muted-foreground">Give this project a name. You can rename it whenever you need.</p><form onSubmit={(event) => void createBoard(event)} className="mt-5 space-y-4"><label className="block text-xs font-semibold">Board name<input autoFocus value={newBoardTitle} onChange={(event) => setNewBoardTitle(event.target.value)} placeholder="e.g. Spring launch" className="mt-2 h-11 w-full rounded-xl border border-input bg-background px-3 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15" /></label><div className="flex justify-end gap-2"><button type="button" onClick={() => setNewBoardOpen(false)} className="h-10 rounded-xl px-4 text-sm font-medium text-muted-foreground hover:bg-muted">Cancel</button><button className="h-10 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:opacity-90">Create board</button></div></form></Modal>}
    {shareOpen && board && <Modal title="Share this board" onClose={() => setShareOpen(false)}><div className="mt-4 space-y-5"><section className="rounded-xl border border-border bg-secondary/50 p-3"><p className="text-xs font-semibold">Your account ID</p><p className="mt-1 break-all font-mono text-[11px] text-muted-foreground">{user.id}</p><button onClick={() => void copyAccountId()} className="mt-3 inline-flex h-8 items-center gap-2 rounded-lg border border-border bg-card px-3 text-xs font-semibold transition hover:bg-muted"><Copy className="h-3.5 w-3.5" /> Copy ID</button></section><form onSubmit={(event) => void addCollaborator(event)} className="space-y-2"><label htmlFor="collaborator-id" className="text-xs font-semibold">Add a collaborator by account ID</label><p className="text-xs leading-5 text-muted-foreground">Ask them to copy their account ID from this panel in their own workspace. Adding it grants immediate access. This does not send an email.</p><div className="flex gap-2"><input id="collaborator-id" value={inviteAccountId} onChange={(event) => setInviteAccountId(event.target.value)} placeholder="Paste their account ID" className="h-10 min-w-0 flex-1 rounded-lg border border-input bg-background px-3 font-mono text-xs outline-none focus:border-primary" /><button disabled={memberBusy} className="h-10 shrink-0 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground disabled:opacity-50">{memberBusy ? 'Saving…' : 'Grant access'}</button></div></form><section><h3 className="text-xs font-semibold">People with access</h3><div className="mt-2 max-h-40 space-y-2 overflow-y-auto">{members.map((member) => <div key={member.id} className="flex items-center gap-2 rounded-lg border border-border px-3 py-2"><span className="min-w-0 flex-1 truncate font-mono text-[11px] text-muted-foreground">{member.userId}{member.userId === user.id ? ' · you' : ''}</span>{member.userId !== board.userId && <button disabled={memberBusy} onClick={() => void removeCollaborator(member)} className="rounded-md px-2 py-1 text-[11px] font-semibold text-destructive hover:bg-destructive/10 disabled:opacity-50">Remove</button>}</div>)}{members.length === 0 && <p className="text-xs text-muted-foreground">No members found.</p>}</div></section></div></Modal>}
    {selectedCard && <CardEditor key={selectedCard.id} card={cards.find((item) => item.id === selectedCard.id) ?? selectedCard} onSave={saveCard} onDelete={deleteCard} onClose={() => setSelectedCard(null)} />}
  </main>
}
