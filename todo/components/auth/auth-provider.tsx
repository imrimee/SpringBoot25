"use client"

import * as React from "react"
import { useRouter, usePathname } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import type { User } from "@supabase/supabase-js"

interface AuthContextType {
  user: User | null
  loading: boolean
  signOut: () => Promise<void>
}

const AuthContext = React.createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const [user, setUser] = React.useState<User | null>(null)
  const [loading, setLoading] = React.useState(true)

  React.useEffect(() => {
    let supabase
    try {
      supabase = createClient()
    } catch (error) {
      console.error("Failed to create Supabase client:", error)
      setLoading(false)
      return
    }

    // 초기 사용자 정보 가져오기
    const initAuth = async () => {
      try {
        // getSession()은 세션이 없을 때 에러를 던지지 않으므로 더 안전함
        const { data: { session }, error: sessionError } = await supabase.auth.getSession()
        
        if (sessionError) {
          console.error("Error getting session:", sessionError)
          setUser(null)
        } else {
          setUser(session?.user ?? null)
        }
        
        setLoading(false)

        // 인증 상태에 따른 리다이렉트 처리
        const isAuthPage = pathname === "/login" || pathname === "/signup"
        const authUser = session?.user ?? null
        
        if (!authUser && !isAuthPage) {
          router.replace("/login")
        } else if (authUser && isAuthPage) {
          router.replace("/")
        }
      } catch (error) {
        // 예상치 못한 오류만 로그 출력
        console.error("Error initializing auth:", error)
        setUser(null)
        setLoading(false)
      }
    }

    initAuth()

    // 인증 상태 변경 감지
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        try {
          const currentPath = window.location.pathname
          const isAuthPage = currentPath === "/login" || currentPath === "/signup"
          
          if (event === "SIGNED_IN" && session?.user) {
            setUser(session.user)
            if (isAuthPage) {
              router.replace("/")
              router.refresh()
            }
          } else if (event === "SIGNED_OUT") {
            setUser(null)
            if (!isAuthPage) {
              router.replace("/login")
              router.refresh()
            }
          } else if (event === "TOKEN_REFRESHED" && session?.user) {
            setUser(session.user)
          }
        } catch (error) {
          console.error("Error handling auth state change:", error)
        }
      }
    )

    return () => {
      subscription.unsubscribe()
    }
  }, [router, pathname])

  const signOut = React.useCallback(async () => {
    const supabase = createClient()
    const { error } = await supabase.auth.signOut()
    
    if (error) {
      throw error
    }
    
    setUser(null)
    // 강제 리다이렉트 (window.location 사용)
    window.location.href = "/login"
  }, [])

  return (
    <AuthContext.Provider value={{ user, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = React.useContext(AuthContext)
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider")
  }
  return context
}

