import { google } from "@ai-sdk/google"
import { generateObject } from "ai"
import { z } from "zod"

// 요약 응답 스키마
const summarySchema = z.object({
  summary: z.string().describe("할 일 목록의 전체 요약 (완료율 포함)"),
  urgentTasks: z.array(z.string()).describe("긴급하거나 마감이 임박한 할 일 목록"),
  insights: z.array(z.string()).describe("데이터 분석을 통한 인사이트 (2-4개)"),
  recommendations: z.array(z.string()).describe("실행 가능한 추천 사항 (2-3개)"),
})

// 할 일 데이터 타입
interface TodoData {
  id: string
  title: string
  description?: string | null
  due_date?: string | null
  priority: "high" | "medium" | "low"
  category?: string | null
  completed: boolean
  created_date: string
}

export async function POST(request: Request) {
  try {
    // 환경 변수 확인
    if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
      return Response.json(
        { error: "AI 서비스가 설정되지 않았습니다. 관리자에게 문의해주세요." },
        { status: 500 }
      )
    }

    // 요청 본문 파싱
    let requestBody
    try {
      requestBody = await request.json()
    } catch (parseError) {
      return Response.json(
        { error: "잘못된 요청 형식입니다. JSON 형식으로 입력해주세요." },
        { status: 400 }
      )
    }

    const { todos, period } = requestBody

    // 입력 검증
    if (!Array.isArray(todos)) {
      return Response.json(
        { error: "할 일 목록 데이터가 필요합니다." },
        { status: 400 }
      )
    }

    if (period !== "today" && period !== "week") {
      return Response.json(
        { error: "분석 기간은 'today' 또는 'week'여야 합니다." },
        { status: 400 }
      )
    }

    if (todos.length === 0) {
      return Response.json({
        summary: period === "today" 
          ? "오늘 등록된 할 일이 없습니다." 
          : "이번 주 등록된 할 일이 없습니다.",
        urgentTasks: [],
        insights: ["할 일을 추가하여 생산성을 높여보세요!"],
        recommendations: ["새로운 할 일을 추가해보세요."],
      })
    }

    // 기본 통계 계산
    const total = todos.length
    const completed = todos.filter((todo: TodoData) => todo.completed).length
    const incomplete = total - completed
    const completionRate = total > 0 ? ((completed / total) * 100).toFixed(1) : "0.0"
    
    // 우선순위별 통계
    const highPriority = todos.filter((todo: TodoData) => todo.priority === "high")
    const mediumPriority = todos.filter((todo: TodoData) => todo.priority === "medium")
    const lowPriority = todos.filter((todo: TodoData) => todo.priority === "low")
    
    const highCompleted = highPriority.filter((todo: TodoData) => todo.completed).length
    const mediumCompleted = mediumPriority.filter((todo: TodoData) => todo.completed).length
    const lowCompleted = lowPriority.filter((todo: TodoData) => todo.completed).length
    
    const highCompletionRate = highPriority.length > 0 
      ? ((highCompleted / highPriority.length) * 100).toFixed(1) 
      : "0.0"
    const mediumCompletionRate = mediumPriority.length > 0 
      ? ((mediumCompleted / mediumPriority.length) * 100).toFixed(1) 
      : "0.0"
    const lowCompletionRate = lowPriority.length > 0 
      ? ((lowCompleted / lowPriority.length) * 100).toFixed(1) 
      : "0.0"

    // 날짜 기준 설정 (마감일 분석용)
    const todayForAnalysis = new Date()
    todayForAnalysis.setHours(0, 0, 0, 0)
    const tomorrow = new Date(todayForAnalysis)
    tomorrow.setDate(tomorrow.getDate() + 1)

    const urgentTasks = todos
      .filter((todo: TodoData) => {
        if (todo.completed) return false
        if (todo.priority === "high") return true
        if (todo.due_date) {
          const dueDate = new Date(todo.due_date)
          dueDate.setHours(0, 0, 0, 0)
          return dueDate <= tomorrow
        }
        return false
      })
      .map((todo: TodoData) => todo.title)
      .slice(0, 5) // 최대 5개만

    // 시간대별 분포 분석 (완료/미완료 구분)
    const timeDistribution: { [key: string]: { total: number; completed: number } } = {
      오전: { total: 0, completed: 0 },
      오후: { total: 0, completed: 0 },
      저녁: { total: 0, completed: 0 },
      미지정: { total: 0, completed: 0 },
    }

    todos.forEach((todo: TodoData) => {
      let timeSlot = "미지정"
      if (todo.due_date) {
        const dueDate = new Date(todo.due_date)
        const hour = dueDate.getHours()
        if (hour < 12) {
          timeSlot = "오전"
        } else if (hour < 18) {
          timeSlot = "오후"
        } else {
          timeSlot = "저녁"
        }
      }
      timeDistribution[timeSlot].total++
      if (todo.completed) {
        timeDistribution[timeSlot].completed++
      }
    })

    // 가장 생산적인 시간대 계산
    const timeProductivity = Object.entries(timeDistribution)
      .filter(([_, stats]) => stats.total > 0)
      .map(([time, stats]) => ({
        time,
        rate: ((stats.completed / stats.total) * 100).toFixed(1),
        total: stats.total,
      }))
      .sort((a, b) => parseFloat(b.rate) - parseFloat(a.rate))

    // 카테고리별 분포 (완료/미완료 구분)
    const categoryDistribution: { [key: string]: { total: number; completed: number } } = {}
    todos.forEach((todo: TodoData) => {
      const category = todo.category || "미분류"
      if (!categoryDistribution[category]) {
        categoryDistribution[category] = { total: 0, completed: 0 }
      }
      categoryDistribution[category].total++
      if (todo.completed) {
        categoryDistribution[category].completed++
      }
    })

    // 마감일 준수율 계산 (마감일이 지난 미완료 작업)
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    
    const overdueTasks = todos.filter((todo: TodoData) => {
      if (todo.completed || !todo.due_date) return false
      const dueDate = new Date(todo.due_date)
      dueDate.setHours(0, 0, 0, 0)
      return dueDate < today
    })
    
    const onTimeTasks = todos.filter((todo: TodoData) => {
      if (!todo.due_date) return false
      const dueDate = new Date(todo.due_date)
      dueDate.setHours(0, 0, 0, 0)
      return todo.completed && dueDate >= today
    })
    
    const tasksWithDueDate = todos.filter((todo: TodoData) => todo.due_date)
    const deadlineComplianceRate = tasksWithDueDate.length > 0
      ? ((onTimeTasks.length / tasksWithDueDate.length) * 100).toFixed(1)
      : "0.0"

    // 요일별 생산성 분석 (생성일 기준)
    const dayOfWeekDistribution: { [key: string]: { total: number; completed: number } } = {
      일요일: { total: 0, completed: 0 },
      월요일: { total: 0, completed: 0 },
      화요일: { total: 0, completed: 0 },
      수요일: { total: 0, completed: 0 },
      목요일: { total: 0, completed: 0 },
      금요일: { total: 0, completed: 0 },
      토요일: { total: 0, completed: 0 },
    }

    const dayNames = ["일요일", "월요일", "화요일", "수요일", "목요일", "금요일", "토요일"]
    
    todos.forEach((todo: TodoData) => {
      const createdDate = new Date(todo.created_date)
      const dayName = dayNames[createdDate.getDay()]
      dayOfWeekDistribution[dayName].total++
      if (todo.completed) {
        dayOfWeekDistribution[dayName].completed++
      }
    })

    // 가장 생산적인 요일 계산
    const dayProductivity = Object.entries(dayOfWeekDistribution)
      .filter(([_, stats]) => stats.total > 0)
      .map(([day, stats]) => ({
        day,
        rate: ((stats.completed / stats.total) * 100).toFixed(1),
        total: stats.total,
      }))
      .sort((a, b) => parseFloat(b.rate) - parseFloat(a.rate))

    // 자주 미루는 작업 유형 분석 (마감일이 지났지만 미완료)
    const postponedTasks = overdueTasks.map((todo: TodoData) => {
      const dueDate = new Date(todo.due_date!)
      dueDate.setHours(0, 0, 0, 0)
      return {
        title: todo.title,
        category: todo.category || "미분류",
        priority: todo.priority,
        daysOverdue: Math.floor((today.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24)),
      }
    })

    // 완료하기 쉬운 작업의 특징 (완료된 작업 중 짧은 시간에 완료된 것)
    const quickCompletedTasks = todos
      .filter((todo: TodoData) => {
        if (!todo.completed || !todo.created_date || !todo.due_date) return false
        const created = new Date(todo.created_date)
        const due = new Date(todo.due_date)
        const daysToComplete = Math.floor((due.getTime() - created.getTime()) / (1000 * 60 * 60 * 24))
        return daysToComplete <= 1 // 1일 이내에 완료된 작업
      })
      .map((todo: TodoData) => ({
        category: todo.category || "미분류",
        priority: todo.priority,
      }))

    // AI 분석을 위한 컨텍스트 생성
    const periodLabel = period === "today" ? "오늘" : "이번 주"
    const todosSummary = todos
      .map((todo: TodoData) => {
        const status = todo.completed ? "완료" : "미완료"
        const dueInfo = todo.due_date 
          ? `마감: ${new Date(todo.due_date).toLocaleDateString("ko-KR")}` 
          : "마감일 없음"
        const createdInfo = `생성: ${new Date(todo.created_date).toLocaleDateString("ko-KR")}`
        return `- ${todo.title} (${status}, ${todo.priority} 우선순위, ${dueInfo}, ${createdInfo}, 카테고리: ${todo.category || "미분류"})`
      })
      .join("\n")

    // AI API 호출
    let result
    try {
      result = await generateObject({
        model: google("gemini-2.5-flash"),
        schema: summarySchema,
        prompt: `사용자의 할 일 목록을 심층 분석하여 정교한 요약과 실행 가능한 인사이트를 제공해주세요.

분석 기간: ${periodLabel}

할 일 목록:
${todosSummary}

=== 상세 통계 정보 ===

[기본 통계]
- 전체 할 일: ${total}개
- 완료: ${completed}개 (${completionRate}%)
- 미완료: ${incomplete}개

[우선순위별 완료율 분석]
- 높은 우선순위: ${highPriority.length}개 중 ${highCompleted}개 완료 (${highCompletionRate}%)
- 보통 우선순위: ${mediumPriority.length}개 중 ${mediumCompleted}개 완료 (${mediumCompletionRate}%)
- 낮은 우선순위: ${lowPriority.length}개 중 ${lowCompleted}개 완료 (${lowCompletionRate}%)

[시간 관리 분석]
- 마감일 준수율: ${deadlineComplianceRate}% (${onTimeTasks.length}/${tasksWithDueDate.length}개)
- 연기된 할 일: ${overdueTasks.length}개
${postponedTasks.length > 0 ? `- 연기된 작업 상세: ${postponedTasks.map(t => `${t.title} (${t.daysOverdue}일 지연, ${t.category}, ${t.priority})`).join(", ")}` : ""}

[시간대별 생산성 분석]
${Object.entries(timeDistribution).map(([time, stats]) => 
  `- ${time}: ${stats.total}개 중 ${stats.completed}개 완료 (${stats.total > 0 ? ((stats.completed / stats.total) * 100).toFixed(1) : "0.0"}%)`
).join("\n")}
${timeProductivity.length > 0 ? `- 가장 생산적인 시간대: ${timeProductivity[0].time} (${timeProductivity[0].rate}% 완료율)` : ""}

[요일별 생산성 분석]
${dayProductivity.length > 0 ? dayProductivity.map(d => `- ${d.day}: ${d.total}개 중 ${((parseFloat(d.rate) / 100) * d.total).toFixed(0)}개 완료 (${d.rate}%)`).join("\n") : "데이터 부족"}
${dayProductivity.length > 0 ? `- 가장 생산적인 요일: ${dayProductivity[0].day} (${dayProductivity[0].rate}% 완료율)` : ""}

[카테고리별 분석]
${Object.entries(categoryDistribution).map(([cat, stats]) => 
  `- ${cat}: ${stats.total}개 중 ${stats.completed}개 완료 (${stats.total > 0 ? ((stats.completed / stats.total) * 100).toFixed(1) : "0.0"}%)`
).join("\n")}

[완료하기 쉬운 작업 특징]
${quickCompletedTasks.length > 0 ? `- 빠르게 완료된 작업: ${quickCompletedTasks.length}개 (주로 ${quickCompletedTasks.map(t => t.category).filter((v, i, a) => a.indexOf(v) === i).join(", ")} 카테고리)` : "데이터 부족"}

[긴급 작업]
- 긴급 작업 수: ${urgentTasks.length}개

=== 분석 요청사항 ===

${period === "today" 
  ? `[오늘의 요약 특화]
- 당일 집중도와 남은 할 일의 우선순위를 명확히 제시
- 오늘 하루 동안의 생산성 패턴 분석
- 남은 시간을 효율적으로 활용할 수 있는 구체적 제안` 
  : `[이번 주 요약 특화]
- 주간 패턴 분석 및 다음 주 계획 제안
- 주간 생산성 트렌드 파악
- 다음 주를 위한 전략적 제안`}

다음 형식으로 분석 결과를 제공해주세요:

1. summary (전체 요약)
   - 완료율을 포함한 자연스러운 한국어 문장
   - ${period === "today" ? "오늘의 집중도와 남은 할 일 우선순위 강조" : "주간 패턴과 다음 주 계획 제안 포함"}
   - 긍정적인 톤으로 작성 (예: "총 8개의 할 일 중 5개를 완료하셨네요! 62.5%의 완료율로 오늘 하루를 알차게 보내셨습니다.")

2. urgentTasks (긴급 작업 목록, 최대 5개)
   - 미완료 상태의 긴급 작업 제목만 포함
   - 높은 우선순위이거나 오늘/내일 마감인 할 일

3. insights (심층 인사이트, 3-5개)
   반드시 다음 내용을 포함하되, 자연스러운 한국어 문장으로 작성:
   
   [완료율 분석]
   - 우선순위별 완료 패턴 분석 (어떤 우선순위에서 완료율이 높은지)
   - ${period === "week" ? "이전 기간 대비 개선도 비교 (가능한 경우)" : "오늘의 완료율 평가"}
   
   [시간 관리 분석]
   - 마감일 준수율 평가 및 연기된 할 일 패턴 분석
   - 시간대별 업무 집중도 분포 분석
   - ${period === "week" ? "요일별 생산성 패턴 분석" : "오늘의 시간대별 집중도"}
   
   [생산성 패턴]
   - 가장 생산적인 ${period === "week" ? "요일과 " : ""}시간대 도출
   - 자주 미루는 작업 유형 분석 (카테고리, 우선순위 패턴)
   - 완료하기 쉬운 작업의 공통 특징 도출
   
   [긍정적인 피드백]
   - 사용자가 잘하고 있는 부분 강조 (완료율이 높은 영역, 잘 지키는 패턴 등)
   - 개선점을 격려하는 긍정적인 톤으로 제시
   - 동기부여 메시지 포함
   
   모든 인사이트는 사용자가 이해하기 쉽고, 바로 실천할 수 있도록 구체적이고 자연스러운 한국어 문장으로 작성해주세요.

4. recommendations (실행 가능한 추천, 3-4개)
   반드시 다음 내용을 포함하되, 구체적이고 실용적으로 작성:
   
   [시간 관리 팁]
   - 구체적인 시간 관리 방법 제안
   - 생산적인 시간대 활용 전략
   
   [우선순위 조정 및 일정 재배치]
   - 우선순위 조정 제안
   - 일정 재배치 전략
   
   [업무 과부하 분산]
   - 업무 과부하를 줄이는 분산 전략
   - 연기된 작업 처리 방법
   
   [긍정적인 격려]
   - 잘하고 있는 부분에 대한 격려
   - 지속적인 개선을 위한 동기부여
   
   모든 추천사항은 구체적이고 실행 가능하며, 자연스러운 한국어 문장으로 작성해주세요.

=== 작성 원칙 ===
- 자연스럽고 친근한 한국어 문체 사용
- 사용자가 이해하기 쉽고 바로 실천할 수 있는 구체적인 내용
- 긍정적이고 격려하는 톤 유지
- 데이터 기반의 객관적 분석과 주관적 조언의 균형
- ${period === "today" ? "당일 집중도와 남은 할 일 우선순위 강조" : "주간 패턴 분석 및 다음 주 계획 제안"}

위 요구사항을 모두 반영하여 분석 결과를 제공해주세요.`,
      })
    } catch (aiError: any) {
      console.error("AI API 호출 오류:", aiError)
      
      // API 호출 한도 초과 오류 처리
      if (
        aiError.message?.includes("quota") ||
        aiError.message?.includes("rate limit") ||
        aiError.message?.includes("429") ||
        aiError.status === 429
      ) {
        return Response.json(
          {
            error: "AI 서비스 사용 한도를 초과했습니다. 잠시 후 다시 시도해주세요.",
          },
          { status: 429 }
        )
      }

      // 기타 AI API 오류
      return Response.json(
        {
          error: "AI 처리 중 오류가 발생했습니다. 다시 시도해주세요.",
        },
        { status: 500 }
      )
    }

    // 결과 반환
    return Response.json({
      summary: result.object.summary,
      urgentTasks: result.object.urgentTasks || urgentTasks,
      insights: result.object.insights || [],
      recommendations: result.object.recommendations || [],
    })
  } catch (error: any) {
    console.error("AI Summary generation error:", error)

    // 이미 처리된 오류는 재처리하지 않음
    if (error.status) {
      throw error
    }

    // 예상치 못한 오류
    return Response.json(
      {
        error: "서버 오류가 발생했습니다. 잠시 후 다시 시도해주세요.",
      },
      { status: 500 }
    )
  }
}

