"use client"

import * as React from "react"
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription, EmptyMedia } from "@/components/ui/empty"
import { TodoCard } from "./todo-card"
import type { Todo } from "./types"

interface TodoListProps {
  todos: Todo[]
  onToggleComplete?: (id: string) => void
  onEdit?: (todo: Todo) => void
  onDelete?: (id: string) => void
  className?: string
}

export function TodoList({
  todos,
  onToggleComplete,
  onEdit,
  onDelete,
  className,
}: TodoListProps) {
  if (todos.length === 0) {
    return (
      <Empty className="py-12">
        <EmptyMedia>
          <svg
            className="size-12 text-muted-foreground"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
            />
          </svg>
        </EmptyMedia>
        <EmptyHeader>
          <EmptyTitle>할 일이 없습니다</EmptyTitle>
          <EmptyDescription>새로운 할 일을 추가해보세요</EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  return (
    <div className={className}>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {todos.map((todo) => (
          <TodoCard
            key={todo.id}
            todo={todo}
            onToggleComplete={onToggleComplete}
            onEdit={onEdit}
            onDelete={onDelete}
          />
        ))}
      </div>
    </div>
  )
}

