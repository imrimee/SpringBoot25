import { google } from "@ai-sdk/google"
import { generateObject } from "ai"
import { z } from "zod"

// 구조화된 할 일 데이터 스키마
const todoSchema = z.object({
  title: z.string().describe("할 일의 제목"),
  description: z.string().optional().describe("할 일에 대한 상세 설명"),
  due_date: z.string().describe("마감일 (YYYY-MM-DD 형식)"),
  due_time: z.string().optional().describe("마감 시간 (HH:mm 형식, 없으면 기본값 09:00)"),
  priority: z.enum(["high", "medium", "low"]).describe("우선순위 (high/medium/low)"),
  category: z.string().optional().describe("카테고리 (업무/개인/건강/학습 중 하나 또는 없음)"),
})

// 입력 검증 상수
const INPUT_MIN_LENGTH = 2
const INPUT_MAX_LENGTH = 500
const TITLE_MIN_LENGTH = 2
const TITLE_MAX_LENGTH = 100

// 입력 전처리 함수
function preprocessInput(input: string): string {
  // 앞뒤 공백 제거
  let processed = input.trim()
  
  // 연속된 공백을 하나로 통합
  processed = processed.replace(/\s+/g, " ")
  
  // 대소문자 정규화 (한국어는 영향 없음, 영어만 처리)
  // 한국어 입력이므로 대소문자 정규화는 선택적
  
  return processed
}

// 입력 검증 함수
function validateInput(input: string): { valid: boolean; error?: string } {
  // 빈 문자열 체크
  if (!input || input.trim().length === 0) {
    return { valid: false, error: "입력 텍스트가 비어있습니다." }
  }

  // 최소 길이 체크
  if (input.length < INPUT_MIN_LENGTH) {
    return {
      valid: false,
      error: `입력 텍스트는 최소 ${INPUT_MIN_LENGTH}자 이상이어야 합니다.`,
    }
  }

  // 최대 길이 체크
  if (input.length > INPUT_MAX_LENGTH) {
    return {
      valid: false,
      error: `입력 텍스트는 최대 ${INPUT_MAX_LENGTH}자까지 입력 가능합니다.`,
    }
  }

  // 특수 문자나 이모지 체크 (경고만, 차단하지 않음)
  // 이모지와 특수 문자는 허용하되, 과도한 사용만 경고

  return { valid: true }
}

// 후처리 함수
function postprocessTodoData(
  todoData: z.infer<typeof todoSchema>,
  today: Date
): z.infer<typeof todoSchema> {
  // 제목 길이 조정
  let title = todoData.title || "할 일"
  if (title.length < TITLE_MIN_LENGTH) {
    title = "할 일"
  } else if (title.length > TITLE_MAX_LENGTH) {
    title = title.substring(0, TITLE_MAX_LENGTH - 3) + "..."
  }

  // 날짜가 과거인지 확인 및 조정
  let dueDate = todoData.due_date
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/
  if (dateRegex.test(dueDate)) {
    const dueDateObj = new Date(dueDate)
    const todayStart = new Date(today)
    todayStart.setHours(0, 0, 0, 0)
    
    // 날짜만 비교 (시간 제외)
    const dueDateOnly = new Date(dueDateObj)
    dueDateOnly.setHours(0, 0, 0, 0)
    
    // 과거 날짜인 경우 오늘 날짜로 조정
    if (dueDateOnly < todayStart) {
      dueDate = today.toISOString().split("T")[0]
    }
  }

  // 필수 필드 기본값 설정
  const priority = todoData.priority || "medium"
  const dueTime = todoData.due_time || "09:00"

  return {
    ...todoData,
    title,
    due_date: dueDate,
    due_time: dueTime,
    priority,
  }
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

    const { input } = requestBody

    // 입력 타입 검증
    if (typeof input !== "string") {
      return Response.json(
        { error: "입력 텍스트는 문자열 형식이어야 합니다." },
        { status: 400 }
      )
    }

    // 입력 전처리
    const preprocessedInput = preprocessInput(input)

    // 입력 검증
    const validation = validateInput(preprocessedInput)
    if (!validation.valid) {
      return Response.json(
        { error: validation.error },
        { status: 400 }
      )
    }

    // 현재 날짜 정보를 컨텍스트로 제공
    const today = new Date()
    const todayStr = today.toLocaleDateString("ko-KR", {
      year: "numeric",
      month: "long",
      day: "numeric",
      weekday: "long",
    })

    const todayISO = today.toISOString().split("T")[0]
    const tomorrow = new Date(today)
    tomorrow.setDate(tomorrow.getDate() + 1)
    const tomorrowISO = tomorrow.toISOString().split("T")[0]
    
    const dayAfterTomorrow = new Date(today)
    dayAfterTomorrow.setDate(dayAfterTomorrow.getDate() + 2)
    const dayAfterTomorrowISO = dayAfterTomorrow.toISOString().split("T")[0]

    // 이번 주 금요일 계산 (오늘이 금요일이면 오늘, 아니면 가장 가까운 금요일)
    const getThisWeekFriday = () => {
      const friday = new Date(today)
      const dayOfWeek = today.getDay() // 0 = 일요일, 5 = 금요일
      if (dayOfWeek === 5) {
        // 오늘이 금요일이면 오늘 반환
        return friday.toISOString().split("T")[0]
      }
      const daysUntilFriday = (5 - dayOfWeek + 7) % 7
      friday.setDate(today.getDate() + daysUntilFriday)
      return friday.toISOString().split("T")[0]
    }
    const thisWeekFridayISO = getThisWeekFriday()

    // 다음 주 월요일 계산 (오늘이 월요일이면 다음 주 월요일)
    const getNextWeekMonday = () => {
      const monday = new Date(today)
      const dayOfWeek = today.getDay() // 0 = 일요일, 1 = 월요일
      if (dayOfWeek === 1) {
        // 오늘이 월요일이면 다음 주 월요일
        monday.setDate(today.getDate() + 7)
      } else {
        // 오늘이 월요일이 아니면 가장 가까운 다음 주 월요일
        const daysUntilNextMonday = (1 - dayOfWeek + 7) % 7 || 7
        monday.setDate(today.getDate() + daysUntilNextMonday)
      }
      return monday.toISOString().split("T")[0]
    }
    const nextWeekMondayISO = getNextWeekMonday()

    // AI API 호출
    let result
    try {
      result = await generateObject({
        model: google("gemini-2.5-flash"),
        schema: todoSchema,
        prompt: `사용자가 자연어로 입력한 할 일을 구조화된 데이터로 변환해주세요.

현재 날짜 정보:
- 오늘: ${todayStr} (${todayISO})
- 내일: ${tomorrowISO}
- 모레: ${dayAfterTomorrowISO}
- 이번 주 금요일: ${thisWeekFridayISO}
- 다음 주 월요일: ${nextWeekMondayISO}

사용자 입력: "${preprocessedInput}"

다음 규칙을 반드시 엄격히 따라 변환해주세요:

## 1. title (제목)
- 할 일의 핵심 제목만 추출 (10-30자 이내, 간결하게)
- 예: "내일 오후 3시까지 중요한 팀 회의 준비하기" → "팀 회의 준비"

## 2. description (설명)
- 할 일에 대한 상세 설명 (선택사항)
- 원본 문장의 맥락을 유지하여 작성
- 없으면 생략 가능

## 3. due_date (날짜) - 반드시 다음 규칙 준수
날짜를 YYYY-MM-DD 형식으로 정확히 추출하세요:
- "오늘" → ${todayISO}
- "내일" → ${tomorrowISO}
- "모레" → ${dayAfterTomorrowISO}
- "이번 주 금요일" → ${thisWeekFridayISO}
- "다음 주 월요일" → ${nextWeekMondayISO}
- "다음 주 화요일/수요일/목요일/금요일/토요일/일요일" → 해당 요일의 실제 날짜 계산
- "12월 25일" → 올해 또는 내년 12월 25일 (YYYY-MM-DD)
- 날짜가 명시되지 않으면 ${todayISO} 사용

## 4. due_time (시간) - 반드시 다음 규칙 준수
시간을 HH:mm 형식으로 정확히 추출하세요:
- "아침" → "09:00"
- "점심" → "12:00"
- "오후" → "14:00"
- "저녁" → "18:00"
- "밤" → "21:00"
- "오전 10시" → "10:00"
- "오후 3시" → "15:00"
- "오후 3시 30분" → "15:30"
- "15:00" → "15:00"
- 시간이 명시되지 않으면 "09:00"을 기본값으로 사용

## 5. priority (우선순위) - 반드시 다음 키워드 기준으로 판단
- "high": 다음 키워드가 포함된 경우 → "급하게", "중요한", "빨리", "꼭", "반드시"
- "medium": 다음 키워드가 포함된 경우 → "보통", "적당히", 또는 키워드가 없음
- "low": 다음 키워드가 포함된 경우 → "여유롭게", "천천히", "언젠가"
- 키워드가 없으면 "medium" 사용

## 6. category (카테고리) - 반드시 다음 키워드 기준으로 분류
- "업무": 다음 키워드가 포함된 경우 → "회의", "보고서", "프로젝트", "업무"
- "개인": 다음 키워드가 포함된 경우 → "쇼핑", "친구", "가족", "개인"
- "건강": 다음 키워드가 포함된 경우 → "운동", "병원", "건강", "요가"
- "학습": 다음 키워드가 포함된 경우 → "공부", "책", "강의", "학습"
- 명확하지 않으면 null (생략)

## 출력 형식
반드시 JSON 형식으로 응답하세요. 모든 필드는 지정된 형식을 정확히 준수해야 합니다:
- due_date: YYYY-MM-DD 형식 (예: "2026-01-16")
- due_time: HH:mm 형식 (예: "15:00")
- priority: "high", "medium", "low" 중 하나
- category: "업무", "개인", "건강", "학습" 중 하나 또는 null

위 규칙을 엄격히 준수하여 변환해주세요.`,
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
          error: "AI 처리 중 오류가 발생했습니다. 입력 내용을 확인하고 다시 시도해주세요.",
        },
        { status: 500 }
      )
    }

    // 결과 후처리
    const rawTodoData = result.object
    const todoData = postprocessTodoData(rawTodoData, today)

    // 날짜 형식 검증
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/
    if (!dateRegex.test(todoData.due_date)) {
      return Response.json(
        { error: "생성된 날짜 형식이 올바르지 않습니다. 다시 시도해주세요." },
        { status: 500 }
      )
    }

    // 시간 형식 검증
    const timeRegex = /^\d{2}:\d{2}$/
    if (!timeRegex.test(todoData.due_time || "09:00")) {
      return Response.json(
        { error: "생성된 시간 형식이 올바르지 않습니다. 다시 시도해주세요." },
        { status: 500 }
      )
    }

    // ISO 형식으로 변환
    const dueDateTime = `${todoData.due_date}T${todoData.due_time}:00`

    return Response.json({
      title: todoData.title,
      description: todoData.description || null,
      due_date: dueDateTime,
      priority: todoData.priority,
      category: todoData.category || null,
      completed: false,
    })
  } catch (error: any) {
    console.error("AI Todo generation error:", error)

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

