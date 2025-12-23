"use client"

import * as React from "react"
import { useState, useMemo, useEffect } from "react"
import { useRouter } from "next/navigation"
import {
  CheckSquare2,
  Search,
  Filter,
  ArrowUpDown,
  LogOut,
  User,
  Plus,
  X,
  Sparkles,
  Loader2,
  BarChart3,
} from "lucide-react"
import Link from "next/link"
import { toast } from "sonner"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { Card } from "@/components/ui/card"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { TodoForm, TodoList } from "@/components/todo"
import type { Todo, TodoFormData, Priority } from "@/components/todo/types"
import { createClient } from "@/lib/supabase/client"
import { useAuth } from "@/components/auth/auth-provider"

type FilterStatus = "all" | "completed" | "in-progress" | "overdue"
type SortOption = "priority" | "due_date" | "created_date" | "title"

export default function HomePage() {
  const router = useRouter()
  const { user: authUser, loading: authLoading, signOut } = useAuth()
  const [todos, setTodos] = useState<Todo[]>([])
  const [searchQuery, setSearchQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState<FilterStatus>("all")
  const [priorityFilter, setPriorityFilter] = useState<Priority | "all">("all")
  const [sortBy, setSortBy] = useState<SortOption>("created_date")
  const [editingTodo, setEditingTodo] = useState<Todo | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [user, setUser] = useState<{ email: string; name?: string } | null>(null)
  const [isLoggingOut, setIsLoggingOut] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [deleteTodoId, setDeleteTodoId] = useState<string | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  
  // AI 요약 관련 상태
  const [summaryPeriod, setSummaryPeriod] = useState<"today" | "week">("today")
  const [summaryData, setSummaryData] = useState<{
    summary: string
    urgentTasks: string[]
    insights: string[]
    recommendations: string[]
  } | null>(null)
  const [isGeneratingSummary, setIsGeneratingSummary] = useState(false)

  // 할 일 목록 조회
  const fetchTodos = React.useCallback(async () => {
    if (!authUser) return

    try {
      setIsLoading(true)
      const supabase = createClient()

      // 세션 확인
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        throw new Error("인증 세션이 없습니다.")
      }

      // 할 일 목록 조회 (user_id 기준, 최근 생성 순)
      let query = supabase
        .from("todos")
        .select("*")
        .eq("user_id", authUser.id)
        .order("created_date", { ascending: false })

      const { data, error } = await query

      if (error) {
        if (error.code === "PGRST301" || error.message.includes("JWT")) {
          toast.error("인증이 만료되었습니다. 다시 로그인해주세요.")
          router.push("/login")
          return
        }
        throw error
      }

      // Supabase 데이터를 Todo 타입으로 변환
      const todosData: Todo[] = (data || []).map((item) => ({
        id: item.id,
        user_id: item.user_id,
        title: item.title,
        description: item.description,
        created_date: item.created_date,
        due_date: item.due_date,
        priority: item.priority as Priority,
        category: item.category,
        completed: item.completed,
      }))

      setTodos(todosData)
    } catch (error: any) {
      console.error("Error fetching todos:", error)
      toast.error(
        error.message || "할 일 목록을 불러오는 중 오류가 발생했습니다."
      )
    } finally {
      setIsLoading(false)
    }
  }, [authUser, router])

  // 할 일 목록 초기 로드
  useEffect(() => {
    if (!authLoading && authUser) {
      fetchTodos()
    }
  }, [authUser, authLoading, fetchTodos])

  // 필터링 및 정렬된 할 일 목록
  const filteredAndSortedTodos = useMemo(() => {
    let filtered = [...todos]

    // 검색 필터 (제목 기준)
    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      filtered = filtered.filter((todo) =>
        todo.title.toLowerCase().includes(query)
      )
    }

    // 상태 필터
    if (statusFilter !== "all") {
      filtered = filtered.filter((todo) => {
        if (statusFilter === "completed") return todo.completed
        if (statusFilter === "in-progress") {
          return !todo.completed && (!todo.due_date || new Date(todo.due_date) >= new Date())
        }
        if (statusFilter === "overdue") {
          return !todo.completed && todo.due_date && new Date(todo.due_date) < new Date()
        }
        return true
      })
    }

    // 우선순위 필터
    if (priorityFilter !== "all") {
      filtered = filtered.filter((todo) => todo.priority === priorityFilter)
    }

    // 정렬
    filtered.sort((a, b) => {
      switch (sortBy) {
        case "priority":
          const priorityOrder = { high: 3, medium: 2, low: 1 }
          return priorityOrder[b.priority] - priorityOrder[a.priority]
        case "due_date":
          if (!a.due_date) return 1
          if (!b.due_date) return -1
          return new Date(a.due_date).getTime() - new Date(b.due_date).getTime()
        case "created_date":
          return new Date(b.created_date).getTime() - new Date(a.created_date).getTime()
        case "title":
          return a.title.localeCompare(b.title, "ko")
        default:
          return 0
      }
    })

    return filtered
  }, [todos, searchQuery, statusFilter, priorityFilter, sortBy])

  // 할 일 추가
  const handleAddTodo = async (data: TodoFormData) => {
    if (!authUser) {
      toast.error("로그인이 필요합니다.")
      return
    }

    // Optimistic Update: 임시 ID로 즉시 추가
    const tempId = `temp-${Date.now()}`
    const optimisticTodo: Todo = {
      id: tempId,
      user_id: authUser.id,
      title: data.title,
      description: data.description || null,
      created_date: new Date().toISOString(),
      due_date: data.due_date || null,
      priority: data.priority,
      category: data.category || null,
      completed: data.completed || false,
    }

    // 즉시 UI에 추가
    setTodos((prev) => [optimisticTodo, ...prev])
    setShowForm(false)

    try {
      const supabase = createClient()

      const { data: newTodo, error } = await supabase
        .from("todos")
        .insert({
          user_id: authUser.id,
          title: data.title,
          description: data.description || null,
          due_date: data.due_date || null,
          priority: data.priority,
          category: data.category || null,
          completed: data.completed || false,
        })
        .select()
        .single()

      if (error) {
        // 실패 시 롤백
        setTodos((prev) => prev.filter((todo) => todo.id !== tempId))
        if (error.code === "PGRST301" || error.message.includes("JWT")) {
          toast.error("인증이 만료되었습니다. 다시 로그인해주세요.")
          router.push("/login")
          return
        }
        throw error
      }

      // 성공 시 임시 항목을 실제 데이터로 교체
      setTodos((prev) =>
        prev.map((todo) =>
          todo.id === tempId
            ? {
                id: newTodo.id,
                user_id: newTodo.user_id,
                title: newTodo.title,
                description: newTodo.description,
                created_date: newTodo.created_date,
                due_date: newTodo.due_date,
                priority: newTodo.priority as Priority,
                category: newTodo.category,
                completed: newTodo.completed,
              }
            : todo
        )
      )

      toast.success("할 일이 추가되었습니다.")
    } catch (error: any) {
      console.error("Error adding todo:", error)
      toast.error(error.message || "할 일 추가 중 오류가 발생했습니다.")
    }
  }

  // 할 일 수정
  const handleEditTodo = async (data: TodoFormData) => {
    if (!editingTodo || !authUser) return

    // Optimistic Update: 즉시 UI 업데이트
    const previousTodo = editingTodo
    const updatedTodo: Todo = {
      ...previousTodo,
      title: data.title,
      description: data.description || null,
      due_date: data.due_date || null,
      priority: data.priority,
      category: data.category || null,
      completed: data.completed || false,
    }

    // 즉시 UI 업데이트
    setTodos((prev) =>
      prev.map((todo) => (todo.id === editingTodo.id ? updatedTodo : todo))
    )
    setEditingTodo(null)
    setShowForm(false)

    try {
      const supabase = createClient()

      const { error } = await supabase
        .from("todos")
        .update({
          title: data.title,
          description: data.description || null,
          due_date: data.due_date || null,
          priority: data.priority,
          category: data.category || null,
          completed: data.completed || false,
        })
        .eq("id", editingTodo.id)
        .eq("user_id", authUser.id) // 본인 소유만 수정 가능

      if (error) {
        // 실패 시 롤백
        setTodos((prev) =>
          prev.map((todo) => (todo.id === editingTodo.id ? previousTodo : todo))
        )
        if (error.code === "PGRST301" || error.message.includes("JWT")) {
          toast.error("인증이 만료되었습니다. 다시 로그인해주세요.")
          router.push("/login")
          return
        }
        throw error
      }

      toast.success("할 일이 수정되었습니다.")
    } catch (error: any) {
      console.error("Error updating todo:", error)
      toast.error(error.message || "할 일 수정 중 오류가 발생했습니다.")
    }
  }

  // 할 일 삭제 확인
  const handleDeleteClick = (id: string) => {
    setDeleteTodoId(id)
  }

  // 할 일 삭제 실행
  const handleDeleteConfirm = async () => {
    if (!deleteTodoId || !authUser) return

    // Optimistic Update: 즉시 UI에서 제거
    const deletedTodo = todos.find((todo) => todo.id === deleteTodoId)
    if (deletedTodo) {
      setTodos((prev) => prev.filter((todo) => todo.id !== deleteTodoId))
    }
    setDeleteTodoId(null)

    try {
      setIsDeleting(true)
      const supabase = createClient()

      const { error } = await supabase
        .from("todos")
        .delete()
        .eq("id", deleteTodoId)
        .eq("user_id", authUser.id) // 본인 소유만 삭제 가능

      if (error) {
        // 실패 시 롤백
        if (deletedTodo) {
          setTodos((prev) => [...prev, deletedTodo].sort((a, b) => 
            new Date(b.created_date).getTime() - new Date(a.created_date).getTime()
          ))
        }
        if (error.code === "PGRST301" || error.message.includes("JWT")) {
          toast.error("인증이 만료되었습니다. 다시 로그인해주세요.")
          router.push("/login")
          return
        }
        throw error
      }

      toast.success("할 일이 삭제되었습니다.")
    } catch (error: any) {
      console.error("Error deleting todo:", error)
      toast.error(error.message || "할 일 삭제 중 오류가 발생했습니다.")
    } finally {
      setIsDeleting(false)
    }
  }

  // 완료 상태 토글
  const handleToggleComplete = async (id: string) => {
    if (!authUser) return

    const todo = todos.find((t) => t.id === id)
    if (!todo) return

    // Optimistic Update: 즉시 UI 업데이트
    const previousCompleted = todo.completed
    setTodos((prev) =>
      prev.map((t) => (t.id === id ? { ...t, completed: !t.completed } : t))
    )

    try {
      const supabase = createClient()

      const { error } = await supabase
        .from("todos")
        .update({ completed: !todo.completed })
        .eq("id", id)
        .eq("user_id", authUser.id) // 본인 소유만 수정 가능

      if (error) {
        // 실패 시 롤백
        setTodos((prev) =>
          prev.map((t) => (t.id === id ? { ...t, completed: previousCompleted } : t))
        )
        if (error.code === "PGRST301" || error.message.includes("JWT")) {
          toast.error("인증이 만료되었습니다. 다시 로그인해주세요.")
          router.push("/login")
          return
        }
        throw error
      }
    } catch (error: any) {
      console.error("Error toggling todo:", error)
      toast.error(error.message || "상태 변경 중 오류가 발생했습니다.")
    }
  }

  // 할 일 편집 시작
  const handleStartEdit = (todo: Todo) => {
    setEditingTodo(todo)
    setShowForm(true)
  }

  // 폼 취소
  const handleCancelForm = () => {
    setEditingTodo(null)
    setShowForm(false)
  }

  // 폼 제출
  const handleFormSubmit = async (data: TodoFormData) => {
    if (editingTodo) {
      await handleEditTodo(data)
    } else {
      await handleAddTodo(data)
    }
  }

  // 사용자 프로필 정보 가져오기
  useEffect(() => {
    if (!authLoading && authUser) {
      // 기본 사용자 정보 설정 (프로필 조회 실패해도 표시)
      setUser({
        email: authUser.email || "",
        name: undefined,
      })

      const supabase = createClient()
      let retryCount = 0
      const maxRetries = 3
      
      const getProfile = async () => {
        try {
          // 세션이 확실히 설정되었는지 확인
          const { data: { session }, error: sessionError } = await supabase.auth.getSession()
          
          if (sessionError || !session) {
            retryCount++
            if (retryCount < maxRetries) {
              // 세션이 없으면 잠시 후 재시도
              setTimeout(() => {
                getProfile()
              }, 500)
            }
            return
          }

          // 프로필 조회 시도
          const { data: profile, error: profileError } = await supabase
            .from("users")
            .select("full_name")
            .eq("id", authUser.id)
            .maybeSingle() // single() 대신 maybeSingle() 사용 (없어도 에러 안남)
          
          if (profileError) {
            // 406 오류는 조용히 무시 (RLS 정책 또는 세션 문제일 수 있음)
            if (profileError.code === "42501" || profileError.message?.includes("406")) {
              // RLS 정책 위반 또는 406 오류는 조용히 처리
              // 기본 정보만 표시
              return
            }
            // 다른 오류는 로그만 출력
            if (profileError.code !== "PGRST116") {
              console.warn("Error fetching user profile:", profileError.message)
            }
          } else if (profile) {
            // 프로필이 있으면 업데이트
            setUser({
              email: authUser.email || "",
              name: profile.full_name || undefined,
            })
          }
        } catch (error) {
          // 예상치 못한 오류는 조용히 처리
          // 기본 정보는 이미 설정되어 있음
        }
      }

      // 약간의 지연 후 프로필 가져오기 (세션 설정 대기)
      const timer = setTimeout(() => {
        getProfile()
      }, 300)

      return () => clearTimeout(timer)
    } else if (!authLoading && !authUser) {
      setUser(null)
    }
  }, [authUser, authLoading])

  // 로그아웃
  const handleLogout = async () => {
    setIsLoggingOut(true)
    
    try {
      await signOut()
    } catch (err) {
      console.error("Logout error:", err)
      alert("로그아웃 중 오류가 발생했습니다. 다시 시도해주세요.")
    } finally {
      setIsLoggingOut(false)
    }
  }

  // 오늘/이번주 할 일 필터링
  const getFilteredTodosByPeriod = (period: "today" | "week"): Todo[] => {
    const now = new Date()
    const todayStart = new Date(now)
    todayStart.setHours(0, 0, 0, 0)
    
    if (period === "today") {
      const todayEnd = new Date(todayStart)
      todayEnd.setHours(23, 59, 59, 999)
      
      return todos.filter((todo) => {
        if (!todo.due_date) return false
        const dueDate = new Date(todo.due_date)
        dueDate.setHours(0, 0, 0, 0)
        return dueDate >= todayStart && dueDate <= todayEnd
      })
    } else {
      // 이번 주 (월요일부터 일요일까지)
      const dayOfWeek = now.getDay() // 0 = 일요일, 1 = 월요일, ..., 6 = 토요일
      const monday = new Date(todayStart)
      // 일요일이면 6일 전, 월요일이면 0일 전, ..., 토요일이면 5일 전
      monday.setDate(todayStart.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1))
      monday.setHours(0, 0, 0, 0)
      
      const sunday = new Date(monday)
      sunday.setDate(monday.getDate() + 6)
      sunday.setHours(23, 59, 59, 999)
      
      return todos.filter((todo) => {
        if (!todo.due_date) return false
        const dueDate = new Date(todo.due_date)
        dueDate.setHours(0, 0, 0, 0)
        return dueDate >= monday && dueDate <= sunday
      })
    }
  }

  // AI 요약 생성
  const handleGenerateSummary = async () => {
    if (!authUser) {
      toast.error("로그인이 필요합니다.")
      return
    }

    setIsGeneratingSummary(true)
    setSummaryData(null)

    try {
      const filteredTodos = getFilteredTodosByPeriod(summaryPeriod)
      
      if (filteredTodos.length === 0) {
        toast.info(
          summaryPeriod === "today"
            ? "오늘 등록된 할 일이 없습니다."
            : "이번 주 등록된 할 일이 없습니다."
        )
        setIsGeneratingSummary(false)
        return
      }

      const response = await fetch("/api/ai/summary", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          todos: filteredTodos,
          period: summaryPeriod,
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "요약 생성에 실패했습니다.")
      }

      const data = await response.json()
      setSummaryData(data)
      toast.success("AI 요약이 생성되었습니다.")
    } catch (error: any) {
      console.error("Error generating summary:", error)
      toast.error(error.message || "요약 생성 중 오류가 발생했습니다.")
    } finally {
      setIsGeneratingSummary(false)
    }
  }

  // 인증 로딩 중이거나 사용자가 없으면 로딩 표시
  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <p className="text-muted-foreground">로딩 중...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-16 items-center justify-between px-4">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center size-10 rounded-lg bg-primary/10">
              <CheckSquare2 className="size-5 text-primary" />
            </div>
            <h1 className="text-xl font-bold">할 일 관리</h1>
          </div>

          <div className="flex items-center gap-4">
            {user && (
              <>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <User className="size-4" />
                  <span className="hidden sm:inline">{user.name || user.email}</span>
                  <span className="sm:hidden">{user.email}</span>
                </div>
                <Separator orientation="vertical" className="h-6" />
              </>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={handleLogout}
              disabled={isLoggingOut}
              className="gap-2"
            >
              <LogOut className="size-4" />
              <span className="hidden sm:inline">
                {isLoggingOut ? "로그아웃 중..." : "로그아웃"}
              </span>
            </Button>
          </div>
        </div>
      </header>

      {/* Toolbar */}
      <div className="border-b bg-muted/40">
        <div className="container px-4 py-4">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            {/* 검색 */}
            <div className="flex-1 max-w-md">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                <Input
                  placeholder="할 일 검색..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>

            {/* 필터 및 정렬 */}
            <div className="flex flex-wrap items-center gap-2">
              {/* 상태 필터 */}
              <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as FilterStatus)}>
                <SelectTrigger className="w-[140px]">
                  <Filter className="size-4 mr-2" />
                  <SelectValue placeholder="상태" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">전체</SelectItem>
                  <SelectItem value="in-progress">진행 중</SelectItem>
                  <SelectItem value="completed">완료</SelectItem>
                  <SelectItem value="overdue">지연</SelectItem>
                </SelectContent>
              </Select>

              {/* 우선순위 필터 */}
              <Select
                value={priorityFilter}
                onValueChange={(value) => setPriorityFilter(value as Priority | "all")}
              >
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder="우선순위" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">전체</SelectItem>
                  <SelectItem value="high">높음</SelectItem>
                  <SelectItem value="medium">보통</SelectItem>
                  <SelectItem value="low">낮음</SelectItem>
                </SelectContent>
              </Select>

              {/* 정렬 */}
              <Select value={sortBy} onValueChange={(value) => setSortBy(value as SortOption)}>
                <SelectTrigger className="w-[140px]">
                  <ArrowUpDown className="size-4 mr-2" />
                  <SelectValue placeholder="정렬" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="created_date">생성일순</SelectItem>
                  <SelectItem value="due_date">마감일순</SelectItem>
                  <SelectItem value="priority">우선순위순</SelectItem>
                  <SelectItem value="title">제목순</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      </div>

      {/* Main Area */}
      <main className="container flex-1 px-4 py-6">
        <div className="space-y-6">
          {/* AI 요약 및 분석 섹션 */}
          <Card>
            <div className="p-6 border-b">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <BarChart3 className="size-5 text-primary" />
                  <h2 className="text-lg font-semibold">AI 요약 및 분석</h2>
                </div>
              </div>
            </div>
            <div className="p-6">
              <Tabs
                value={summaryPeriod}
                onValueChange={(value) => {
                  setSummaryPeriod(value as "today" | "week")
                  setSummaryData(null) // 탭 변경 시 이전 요약 초기화
                }}
              >
                <TabsList className="mb-4">
                  <TabsTrigger value="today">오늘의 요약</TabsTrigger>
                  <TabsTrigger value="week">이번주 요약</TabsTrigger>
                </TabsList>
                <TabsContent value="today" className="space-y-4">
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-muted-foreground">
                      오늘 등록된 할 일: {getFilteredTodosByPeriod("today").length}개
                    </p>
                    <Button
                      onClick={handleGenerateSummary}
                      disabled={isGeneratingSummary || getFilteredTodosByPeriod("today").length === 0}
                      className="gap-2"
                    >
                      {isGeneratingSummary ? (
                        <>
                          <Loader2 className="size-4 animate-spin" />
                          분석 중...
                        </>
                      ) : (
                        <>
                          <Sparkles className="size-4" />
                          AI 요약
                        </>
                      )}
                    </Button>
                  </div>
                </TabsContent>
                <TabsContent value="week" className="space-y-4">
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-muted-foreground">
                      이번 주 등록된 할 일: {getFilteredTodosByPeriod("week").length}개
                    </p>
                    <Button
                      onClick={handleGenerateSummary}
                      disabled={isGeneratingSummary || getFilteredTodosByPeriod("week").length === 0}
                      className="gap-2"
                    >
                      {isGeneratingSummary ? (
                        <>
                          <Loader2 className="size-4 animate-spin" />
                          분석 중...
                        </>
                      ) : (
                        <>
                          <Sparkles className="size-4" />
                          AI 요약
                        </>
                      )}
                    </Button>
                  </div>
                </TabsContent>
              </Tabs>

              {/* 요약 결과 표시 */}
              {summaryData && (
                <div className="mt-6 space-y-6 border-t pt-6">
                  {/* 전체 요약 */}
                  <div>
                    <h3 className="text-sm font-semibold mb-2">전체 요약</h3>
                    <p className="text-sm text-muted-foreground">{summaryData.summary}</p>
                  </div>

                  {/* 긴급 작업 */}
                  {summaryData.urgentTasks.length > 0 && (
                    <div>
                      <h3 className="text-sm font-semibold mb-2">긴급 작업</h3>
                      <ul className="list-disc list-inside space-y-1">
                        {summaryData.urgentTasks.map((task, index) => (
                          <li key={index} className="text-sm text-muted-foreground">
                            {task}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* 인사이트 */}
                  {summaryData.insights.length > 0 && (
                    <div>
                      <h3 className="text-sm font-semibold mb-2">인사이트</h3>
                      <ul className="list-disc list-inside space-y-1">
                        {summaryData.insights.map((insight, index) => (
                          <li key={index} className="text-sm text-muted-foreground">
                            {insight}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* 추천 사항 */}
                  {summaryData.recommendations.length > 0 && (
                    <div>
                      <h3 className="text-sm font-semibold mb-2">추천 사항</h3>
                      <ul className="list-disc list-inside space-y-1">
                        {summaryData.recommendations.map((recommendation, index) => (
                          <li key={index} className="text-sm text-muted-foreground">
                            {recommendation}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>
          </Card>

          {/* 할 일 관리 섹션 */}
          <div className="grid gap-6 lg:grid-cols-[400px_1fr]">
          {/* 좌측: TodoForm */}
          <div className="space-y-4">
            <Card className="sticky top-24">
              <div className="flex items-center justify-between p-6 border-b">
                <h2 className="text-lg font-semibold">
                  {editingTodo ? "할 일 수정" : "새 할 일 추가"}
                </h2>
                {showForm && (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={handleCancelForm}
                  >
                    <X className="size-4" />
                  </Button>
                )}
              </div>
              <div className="p-6">
                {showForm ? (
                  <TodoForm
                    todo={editingTodo || undefined}
                    onSubmit={handleFormSubmit}
                    onCancel={handleCancelForm}
                  />
                ) : (
                  <Button
                    onClick={() => setShowForm(true)}
                    className="w-full gap-2"
                  >
                    <Plus className="size-4" />
                    할 일 추가하기
                  </Button>
                )}
              </div>
            </Card>
          </div>

          {/* 우측: TodoList */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">
                할 일 목록 ({filteredAndSortedTodos.length})
              </h2>
            </div>
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <p className="text-muted-foreground">로딩 중...</p>
              </div>
            ) : (
              <TodoList
                todos={filteredAndSortedTodos}
                onToggleComplete={handleToggleComplete}
                onEdit={handleStartEdit}
                onDelete={handleDeleteClick}
              />
            )}
          </div>
          </div>
        </div>
      </main>

      {/* 할 일 삭제 확인 다이얼로그 */}
      <AlertDialog open={!!deleteTodoId} onOpenChange={(open) => !open && setDeleteTodoId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>할 일 삭제</AlertDialogTitle>
            <AlertDialogDescription>
              정말로 이 할 일을 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>취소</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? "삭제 중..." : "삭제"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
