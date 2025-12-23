"use client"

import * as React from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { CheckSquare2, Mail, Lock, User as UserIcon } from "lucide-react"

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
import { createUserProfile } from "@/app/actions/auth"

const signupFormSchema = z
  .object({
    name: z
      .string()
      .min(1, "이름을 입력해주세요")
      .max(50, "이름은 50자 이하로 입력해주세요"),
    email: z.string().email("올바른 이메일 주소를 입력해주세요"),
    password: z
      .string()
      .min(6, "비밀번호는 최소 6자 이상이어야 합니다")
      .regex(
        /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/,
        "비밀번호는 대문자, 소문자, 숫자를 포함해야 합니다"
      ),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "비밀번호가 일치하지 않습니다",
    path: ["confirmPassword"],
  })

type SignupFormValues = z.infer<typeof signupFormSchema>

export default function SignupPage() {
  const router = useRouter()
  const { user, loading: authLoading } = useAuth()
  const [isLoading, setIsLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  // 이미 로그인된 사용자는 메인 페이지로 리다이렉트
  React.useEffect(() => {
    if (!authLoading && user) {
      router.push("/")
    }
  }, [user, authLoading, router])
  const [success, setSuccess] = React.useState<string | null>(null)
  const supabase = React.useMemo(() => createClient(), [])

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<SignupFormValues>({
    resolver: zodResolver(signupFormSchema),
    defaultValues: {
      name: "",
      email: "",
      password: "",
      confirmPassword: "",
    },
  })

  const onSubmit = async (data: SignupFormValues) => {
    setIsLoading(true)
    setError(null)
    setSuccess(null)

    try {
      // 1. Supabase Auth에 회원가입
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: data.email,
        password: data.password,
        options: {
          data: { full_name: data.name },
          emailRedirectTo: `${window.location.origin}/login`,
        },
      })

      if (authError) {
        // 이미 존재하는 이메일인 경우
        if (authError.message.includes("already registered") || 
            authError.message.includes("User already registered") ||
            authError.message.includes("already exists")) {
          throw new Error("이 이메일은 이미 사용 중입니다. 다른 이메일을 사용해주세요.")
        }
        throw authError
      }

      // 2. 서버 액션을 통해 public.users 테이블에 사용자 프로필 생성
      // 서버 사이드에서 실행되므로 RLS 정책을 우회할 수 있습니다
      if (authData.user) {
        try {
          await createUserProfile(authData.user.id, data.name)
        } catch (profileError) {
          console.error("Error creating user profile:", profileError)
          // 프로필 생성 실패해도 회원가입은 성공했으므로 경고만 표시
          // Database Trigger가 있으면 자동으로 생성될 수 있습니다
        }
      }

      // 3. 회원가입 후 세션 확인
      // Supabase 설정에 따라 이메일 확인이 필요할 수 있음
      if (authData.session) {
        // 세션이 있으면 즉시 로그인된 상태
        setSuccess("회원가입이 완료되었습니다.")
        // 세션이 확실히 설정될 때까지 잠시 대기
        await new Promise((resolve) => setTimeout(resolve, 100))
        window.location.href = "/"
      } else {
        // 세션이 없으면 이메일 확인이 필요할 수 있음
        setSuccess("회원가입이 완료되었습니다. 이메일을 확인해주세요.")
        router.push("/login?message=check-email")
      }
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "회원가입에 실패했습니다. 잠시 후 다시 시도해주세요."
      setError(message)
    } finally {
      setIsLoading(false)
    }
  }

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

        {/* 회원가입 폼 */}
        <Card>
          <CardHeader className="space-y-1">
            <CardTitle className="text-2xl">회원가입</CardTitle>
            <CardDescription>
              이메일과 비밀번호를 입력하여 계정을 만드세요
            </CardDescription>
          </CardHeader>
          <form onSubmit={handleSubmit(onSubmit)}>
            <CardContent className="space-y-4">
              {error && (
                <div className="rounded-md bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive">
                  {error}
                </div>
              )}
              {success && (
                <div className="rounded-md bg-primary/10 border border-primary/20 p-3 text-sm text-primary">
                  {success}
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="name">이름</Label>
                <div className="relative">
                  <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                  <Input
                    id="name"
                    type="text"
                    placeholder="홍길동"
                    className="pl-9"
                    {...register("name")}
                    aria-invalid={!!errors.name}
                  />
                </div>
                {errors.name && (
                  <p className="text-sm text-destructive">{errors.name.message}</p>
                )}
              </div>

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
                <p className="text-xs text-muted-foreground">
                  대문자, 소문자, 숫자를 포함하여 최소 6자 이상
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirmPassword">비밀번호 확인</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                  <Input
                    id="confirmPassword"
                    type="password"
                    placeholder="비밀번호를 다시 입력하세요"
                    className="pl-9"
                    {...register("confirmPassword")}
                    aria-invalid={!!errors.confirmPassword}
                  />
                </div>
                {errors.confirmPassword && (
                  <p className="text-sm text-destructive">
                    {errors.confirmPassword.message}
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
                {isLoading ? "가입 중..." : "회원가입"}
              </Button>
              <div className="text-center text-sm text-muted-foreground">
                이미 계정이 있으신가요?{" "}
                <Link
                  href="/login"
                  className="text-primary font-medium hover:underline"
                >
                  로그인
                </Link>
              </div>
            </CardFooter>
          </form>
        </Card>

        {/* 추가 정보 */}
        <p className="text-center text-xs text-muted-foreground">
          회원가입하시면 할 일 관리 서비스의 모든 기능을 이용하실 수 있습니다
        </p>
      </div>
    </div>
  )
}

