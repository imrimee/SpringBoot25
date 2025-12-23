"use client"

import * as React from "react"
import { Check, Calendar, Tag, Trash2, Edit, AlertCircle } from "lucide-react"
import { format } from "date-fns"
import { ko } from "date-fns/locale"

import { cn } from "@/lib/utils"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import type { Todo, Priority } from "./types"

interface TodoCardProps {
  todo: Todo
  onToggleComplete?: (id: string) => void
  onEdit?: (todo: Todo) => void
  onDelete?: (id: string) => void
  className?: string
}

const priorityConfig: Record<Priority, { label: string; variant: "default" | "secondary" | "destructive" }> = {
  high: { label: "높음", variant: "destructive" },
  medium: { label: "보통", variant: "default" },
  low: { label: "낮음", variant: "secondary" },
}

function getStatus(todo: Todo): "in-progress" | "completed" | "overdue" {
  if (todo.completed) return "completed"
  if (todo.due_date) {
    const dueDate = new Date(todo.due_date)
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    if (dueDate < today) return "overdue"
  }
  return "in-progress"
}

export function TodoCard({
  todo,
  onToggleComplete,
  onEdit,
  onDelete,
  className,
}: TodoCardProps) {
  const status = getStatus(todo)
  const priorityInfo = priorityConfig[todo.priority]
  const isOverdue = status === "overdue"

  return (
    <Card
      className={cn(
        "transition-all hover:shadow-md",
        todo.completed && "opacity-60",
        isOverdue && !todo.completed && "border-destructive/50",
        className
      )}
    >
      <CardHeader>
        <div className="flex items-start gap-3">
          <Checkbox
            checked={todo.completed}
            onCheckedChange={() => onToggleComplete?.(todo.id)}
            className="mt-1"
          />
          <div className="flex-1 min-w-0">
            <CardTitle
              className={cn(
                "text-base font-semibold",
                todo.completed && "line-through text-muted-foreground"
              )}
            >
              {todo.title}
            </CardTitle>
            {todo.description && (
              <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                {todo.description}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {onEdit && (
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => onEdit(todo)}
                aria-label="편집"
              >
                <Edit className="size-4" />
              </Button>
            )}
            {onDelete && (
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => onDelete(todo.id)}
                aria-label="삭제"
              >
                <Trash2 className="size-4 text-destructive" />
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Badge variant={priorityInfo.variant} className="gap-1">
            <AlertCircle className="size-3" />
            {priorityInfo.label}
          </Badge>
          {todo.category && (
            <Badge variant="outline" className="gap-1">
              <Tag className="size-3" />
              {todo.category}
            </Badge>
          )}
          {todo.due_date && (
            <div
              className={cn(
                "flex items-center gap-1 text-muted-foreground",
                isOverdue && !todo.completed && "text-destructive font-medium"
              )}
            >
              <Calendar className="size-4" />
              <span>
                {format(new Date(todo.due_date), "yyyy년 MM월 dd일", {
                  locale: ko,
                })}
              </span>
            </div>
          )}
          {isOverdue && !todo.completed && (
            <Badge variant="destructive" className="gap-1">
              <AlertCircle className="size-3" />
              지연됨
            </Badge>
          )}
          {todo.completed && (
            <Badge variant="secondary" className="gap-1">
              <Check className="size-3" />
              완료
            </Badge>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

