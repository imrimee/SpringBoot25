"use client"

import * as React from "react"
import { Suspense } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { CheckSquare2, Mail, Lock } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { createClient } from "@/lib/supabase/client"
import { useAuth } from "@/components/auth/auth-provider"

const loginFormSchema = z.object({
  email: z.string().email("올바른 이메일 주소를 입력해주세요"),
  password: z.string().min(6, "비밀번호는 최소 6자 이상이어야 합니다"),
})

type LoginFormValues = z.infer<typeof loginFormSchema>

// URL 파라미터를 읽는 컴포넌트 (Suspense로 감싸야 함)
function LoginFormContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { user, loading: authLoading } = useAuth()
  const [isLoading, setIsLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [emailCheckMessage, setEmailCheckMessage] = React.useState<string | null>(null)

  // 이미 로그인된 사용자는 메인 페이지로 리다이렉트
  React.useEffect(() => {
    if (!authLoading && user) {
      router.push("/")
    }
  }, [user, authLoading, router])

  // URL 파라미터에서 메시지 확인
  React.useEffect(() => {
    const message = searchParams.get("message")
    if (message === "check-email") {
      setEmailCheckMessage("회원가입이 완료되었습니다. 이메일을 확인해주세요.")
    }
  }, [searchParams])

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginFormSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  })

  const onSubmit = async (data: LoginFormValues) => {
    setIsLoading(true)
    setError(null)

    try {
      const supabase = createClient()
      
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email: data.email,
        password: data.password,
      })
      
      if (authError) {
        // 사용자 친화적인 오류 메시지 변환
        if (authError.message.includes("Email not confirmed") || 
            authError.message.includes("email_not_confirmed")) {
          throw new Error("이메일 인증이 필요합니다. 가입하신 이메일을 확인해주세요.")
        }
        if (authError.message.includes("Invalid login credentials") || 
            authError.message.includes("invalid_credentials")) {
          throw new Error("이메일 또는 비밀번호가 올바르지 않습니다.")
        }
        throw new Error(authError.message)
      }

      // 로그인 성공 후 세션이 확실히 설정될 때까지 잠시 대기
      if (authData.session) {
        // 세션 확인 후 리다이렉트
        await new Promise((resolve) => setTimeout(resolve, 100))
        
        // 강제 리다이렉트 (window.location 사용)
        window.location.href = "/"
      } else {
        // 세션이 없으면 다시 확인 시도
        const { data: { session } } = await supabase.auth.getSession()
        if (session) {
          window.location.href = "/"
        } else {
          throw new Error("로그인 세션을 가져올 수 없습니다.")
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "로그인에 실패했습니다")
      setIsLoading(false)
    }
  }

  return (
    <>
      {/* 로그인 폼 */}
      <Card>
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl">로그인</CardTitle>
          <CardDescription>
            이메일과 비밀번호를 입력하여 로그인하세요
          </CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmit(onSubmit)}>
          <CardContent className="space-y-4">
            {error && (
              <div className="rounded-md bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive">
                {error}
              </div>
            )}
            {emailCheckMessage && (
              <div className="rounded-md bg-primary/10 border border-primary/20 p-3 text-sm text-primary">
                {emailCheckMessage}
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="email">이메일</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  placeholder="example@email.com"
                  className="pl-9"
                  {...register("email")}
                  aria-invalid={!!errors.email}
                />
              </div>
              {errors.email && (
                <p className="text-sm text-destructive">{errors.email.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">비밀번호</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                <Input
                  id="password"
                  type="password"
                  placeholder="비밀번호를 입력하세요"
                  className="pl-9"
                  {...register("password")}
                  aria-invalid={!!errors.password}
                />
              </div>
              {errors.password && (
                <p className="text-sm text-destructive">
                  {errors.password.message}
                </p>
              )}
            </div>
          </CardContent>
          <CardFooter className="flex flex-col space-y-4">
            <Button
              type="submit"
              className="w-full"
              disabled={isLoading}
            >
              {isLoading ? "로그인 중..." : "로그인"}
            </Button>
            <div className="text-center text-sm text-muted-foreground">
              계정이 없으신가요?{" "}
              <Link
                href="/signup"
                className="text-primary font-medium hover:underline"
              >
                회원가입
              </Link>
            </div>
          </CardFooter>
        </form>
      </Card>
    </>
  )
}

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-md space-y-8">
        {/* 로고 및 소개 */}
        <div className="text-center space-y-4">
          <div className="flex justify-center">
            <div className="flex items-center justify-center size-16 rounded-2xl bg-primary/10">
              <CheckSquare2 className="size-8 text-primary" />
            </div>
          </div>
          <div className="space-y-2">
            <h1 className="text-3xl font-bold tracking-tight">할 일 관리</h1>
            <p className="text-muted-foreground">
              AI 기반으로 더 스마트하게 일상을 관리하세요
            </p>
          </div>
        </div>

        {/* Suspense로 감싼 로그인 폼 */}
        <Suspense fallback={
          <Card>
            <CardHeader>
              <CardTitle className="text-2xl">로그인</CardTitle>
              <CardDescription>
                이메일과 비밀번호를 입력하여 로그인하세요
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-center text-muted-foreground py-8">
                로딩 중...
              </div>
            </CardContent>
          </Card>
        }>
          <LoginFormContent />
        </Suspense>

        {/* 추가 정보 */}
        <p className="text-center text-xs text-muted-foreground">
          로그인하시면 할 일 관리 서비스의 모든 기능을 이용하실 수 있습니다
        </p>
      </div>
    </div>
  )
}

