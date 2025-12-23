"use client"

import * as React from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"
import { format } from "date-fns"
import { ko } from "date-fns/locale"
import { CalendarIcon, Sparkles, Loader2 } from "lucide-react"
import { toast } from "sonner"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Calendar } from "@/components/ui/calendar"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import type { Todo, TodoFormData, Priority } from "./types"

const todoFormSchema = z.object({
  title: z.string().min(1, "제목을 입력해주세요"),
  description: z.string().optional(),
  due_date: z.string().optional(),
  priority: z.enum(["high", "medium", "low"]),
  category: z.string().optional(),
  completed: z.boolean().optional(),
})

type TodoFormValues = z.infer<typeof todoFormSchema>

interface TodoFormProps {
  todo?: Todo
  onSubmit: (data: TodoFormData) => void | Promise<void>
  onCancel?: () => void
  className?: string
}

const priorityOptions: { value: Priority; label: string }[] = [
  { value: "high", label: "높음" },
  { value: "medium", label: "보통" },
  { value: "low", label: "낮음" },
]

const categoryOptions = ["업무", "개인", "건강", "학습"]

export function TodoForm({
  todo,
  onSubmit,
  onCancel,
  className,
}: TodoFormProps) {
  const [date, setDate] = React.useState<Date | undefined>(
    todo?.due_date ? new Date(todo.due_date) : undefined
  )
  const [aiInput, setAiInput] = React.useState("")
  const [isGenerating, setIsGenerating] = React.useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    setValue,
    watch,
    reset,
  } = useForm<TodoFormValues>({
    resolver: zodResolver(todoFormSchema),
    defaultValues: {
      title: todo?.title || "",
      description: todo?.description || "",
      due_date: todo?.due_date || "",
      priority: todo?.priority || "medium",
      category: todo?.category || "",
      completed: todo?.completed || false,
    },
  })

  const priority = watch("priority")
  const category = watch("category")

  const onDateSelect = (selectedDate: Date | undefined) => {
    setDate(selectedDate)
    setValue("due_date", selectedDate ? selectedDate.toISOString() : "")
  }

  // AI 기반 할 일 생성
  const handleAiGenerate = async () => {
    if (!aiInput.trim()) {
      return
    }

    setIsGenerating(true)
    try {
      const response = await fetch("/api/ai/todo", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ input: aiInput }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "AI 변환에 실패했습니다.")
      }

      const data = await response.json()

      // 폼에 데이터 채우기
      setValue("title", data.title)
      if (data.description) {
        setValue("description", data.description)
      }
      if (data.due_date) {
        const dueDate = new Date(data.due_date)
        setDate(dueDate)
        setValue("due_date", data.due_date)
      }
      setValue("priority", data.priority)
      if (data.category) {
        setValue("category", data.category)
      }

      // AI 입력창 초기화
      setAiInput("")
      toast.success("할 일이 생성되었습니다. 확인 후 저장해주세요.")
    } catch (error: any) {
      console.error("AI generation error:", error)
      toast.error(error.message || "AI 변환 중 오류가 발생했습니다.")
    } finally {
      setIsGenerating(false)
    }
  }

  const onFormSubmit = async (data: TodoFormValues) => {
    await onSubmit({
      ...data,
      due_date: date ? date.toISOString() : undefined,
    })
  }

  return (
    <form onSubmit={handleSubmit(onFormSubmit)} className={cn("space-y-4", className)}>
      {/* AI 기반 할 일 생성 */}
      {!todo && (
        <div className="space-y-2 p-4 bg-muted/50 rounded-lg border">
          <Label htmlFor="ai-input" className="flex items-center gap-2">
            <Sparkles className="size-4 text-primary" />
            AI로 할 일 생성
          </Label>
          <div className="flex gap-2">
            <Input
              id="ai-input"
              value={aiInput}
              onChange={(e) => setAiInput(e.target.value)}
              placeholder="예: 내일 오후 3시까지 중요한 팀 회의 준비하기"
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault()
                  handleAiGenerate()
                }
              }}
              disabled={isGenerating}
            />
            <Button
              type="button"
              onClick={handleAiGenerate}
              disabled={isGenerating || !aiInput.trim()}
              size="icon"
            >
              {isGenerating ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Sparkles className="size-4" />
              )}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            자연어로 할 일을 입력하면 자동으로 구조화된 데이터로 변환됩니다
          </p>
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="title">
          제목 <span className="text-destructive">*</span>
        </Label>
        <Input
          id="title"
          {...register("title")}
          placeholder="할 일 제목을 입력하세요"
          aria-invalid={!!errors.title}
        />
        {errors.title && (
          <p className="text-sm text-destructive">{errors.title.message}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="description">설명</Label>
        <Textarea
          id="description"
          {...register("description")}
          placeholder="할 일에 대한 상세 설명을 입력하세요"
          rows={3}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="priority">우선순위</Label>
          <Select
            value={priority}
            onValueChange={(value) => setValue("priority", value as Priority)}
          >
            <SelectTrigger id="priority">
              <SelectValue placeholder="우선순위 선택" />
            </SelectTrigger>
            <SelectContent>
              {priorityOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="category">카테고리</Label>
          <Select
            value={category || "none"}
            onValueChange={(value) => setValue("category", value === "none" ? undefined : value)}
          >
            <SelectTrigger id="category">
              <SelectValue placeholder="카테고리 선택" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">없음</SelectItem>
              {categoryOptions.map((cat) => (
                <SelectItem key={cat} value={cat}>
                  {cat}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-2">
        <Label>마감일</Label>
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              className={cn(
                "w-full justify-start text-left font-normal",
                !date && "text-muted-foreground"
              )}
            >
              <CalendarIcon className="mr-2 size-4" />
              {date ? (
                format(date, "yyyy년 MM월 dd일", { locale: ko })
              ) : (
                <span>마감일 선택</span>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              selected={date}
              onSelect={onDateSelect}
              initialFocus
            />
          </PopoverContent>
        </Popover>
      </div>

      <div className="flex justify-end gap-2 pt-4">
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel}>
            취소
          </Button>
        )}
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "저장 중..." : todo ? "수정" : "추가"}
        </Button>
      </div>
    </form>
  )
}

