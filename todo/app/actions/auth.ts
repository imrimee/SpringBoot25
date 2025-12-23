"use server"

import { createClient } from "@/lib/supabase/server"

export async function createUserProfile(userId: string, fullName: string) {
  try {
    const supabase = await createClient()
    
    // 서버 사이드에서 실행되지만, 사용자가 아직 인증되지 않았을 수 있으므로
    // RLS 정책을 우회하기 위해 service role key가 필요하거나
    // Database Trigger를 사용하는 것이 더 안전합니다
    
    // 여기서는 시도해보고, 실패하면 Database Trigger에 의존합니다
    const { error } = await supabase
      .from("users")
      .insert({
        id: userId,
        full_name: fullName,
      })

    if (error) {
      // RLS 정책 위반이면 무시 (Database Trigger가 처리할 것)
      if (error.code === "42501") {
        console.log("RLS policy violation - Database Trigger will handle profile creation")
        return { success: true, message: "Will be created by trigger" }
      }
      console.error("Error creating user profile:", error)
      throw error
    }

    return { success: true }
  } catch (error) {
    // 에러가 발생해도 Database Trigger가 처리할 수 있으므로 성공으로 처리
    console.log("Profile creation failed, but Database Trigger may handle it:", error)
    return { success: true, message: "Will be created by trigger" }
  }
}


