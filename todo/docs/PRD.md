# PRD – AI 기반 할 일 관리 서비스

## 1. 개요
본 문서는 Supabase 기반 인증과 AI 기능을 결합한 할 일(To-do) 관리 웹 애플리케이션의 제품 요구사항 정의서(PRD)이다.  
본 PRD는 실제 개발에 즉시 활용할 수 있도록 기능, 화면 구성, 기술 스택, 데이터 구조, API 흐름을 포함한다.

---

## 2. 목표
- 사용자가 직관적으로 할 일을 관리할 수 있는 생산성 도구 제공
- 자연어 기반 AI 기능을 통해 입력 부담 최소화
- 개인 생산성에 대한 요약·분석 인사이트 제공

---

## 3. 주요 기능

### 3.1 사용자 인증
- 이메일 / 비밀번호 기반 회원가입 및 로그인
- Supabase Auth 사용 (https://supabase.com/docs/guides/auth)
- 기능
  - 회원가입
  - 로그인 / 로그아웃
  - 인증 상태 유지(Session)
  - 보호된 라우트 접근 제어
  - 인증 상태에 따라 접근 가능한 페이지를 구분 (비로그인 사용자는 로그인 화면으로 리다이렉트)
  - 사용자 정보(이메일, 이름 등)는 Supabase 'users' 테이블과 연동

---

### 3.2 할 일 관리 (CRUD)

#### 필드 정의
| 필드명 | 타입 | 설명 |
|------|------|------|
| id | uuid | 고유 식별자 |
| user_id | uuid | 사용자 ID (users FK) |
| title | text | 할 일 제목 |
| description | text | 할 일 설명 |
| created_date | timestamptz | 생성일 |
| due_date | timestamptz | 마감일 |
| priority | enum | high / medium / low |
| category | text | 업무, 개인, 학습 등 |
| completed | boolean | 완료 여부 |

#### 기능
- 할 일 생성
- 할 일 목록 조회
- 할 일 수정
- 할 일 삭제
- 완료 상태 토글

---

### 3.3 검색 / 필터 / 정렬

#### 검색
- 제목(title), 설명(description) 대상 부분 일치 검색

#### 필터
- 우선순위: high / medium / low
- 카테고리: 업무 / 개인 / 학습 (확장 가능)
- 상태
  - 진행 중 (completed=false, due_date >= today)
  - 완료
  - 지연 (completed=false, due_date < today)

#### 정렬
- 우선순위순
- 마감일순
- 생성일순

---

### 3.4 AI 할 일 생성

#### 기능 설명
- 사용자가 자연어로 입력한 문장을 AI가 분석
- 구조화된 Todo 데이터로 변환 후 생성

#### 입력 예시
"내일 오전 10시에 팀 회의 준비"

#### 출력 예시 (AI Response)
```json
{
  "title": "팀 회의 준비",
  "description": "내일 오전 10시에 있을 팀 회의를 위해 자료 작성하기",
  "due_date": "YYYY-MM-DDT10:00:00",
  "priority": "high",
  "category": "업무",
  "completed": false
}
```

#### 기술
- Google Gemini API
- Prompt Engineering으로 필드 매핑 고정

---

### 3.5 AI 요약 및 분석

#### 일일 요약
- 오늘 완료한 작업
- 아직 남은 작업
- 지연된 작업

#### 주간 요약
- 총 작업 수
- 완료율 (%)
- 카테고리별 분포
- 우선순위별 작업량

---

## 4. 화면 구성

### 4.1 로그인 / 회원가입
- 이메일 입력
- 비밀번호 입력
- 로그인 / 회원가입 전환

---

### 4.2 할 일 관리 메인 화면
- 상단
  - 검색바
  - 필터 / 정렬 드롭다운
- 메인
  - 할 일 리스트 (카드 또는 테이블)
- 하단 / 사이드
  - 할 일 추가 버튼
  - AI 할 일 생성 입력창
  - AI 요약 버튼

---

### 4.3 통계 및 분석 화면 (확장)
- 주간 완료율 차트
- 카테고리별 작업 분포
- 일자별 활동량

---

## 5. 기술 스택

| 영역 | 기술 |
|----|----|
| 프론트엔드 | Next.js (App Router) |
| 스타일 | Tailwind CSS |
| UI 컴포넌트 | shadcn/ui |
| 인증 / DB | Supabase |
| AI | Google Gemini API |
| 배포 | Vercel |

---

## 6. 데이터 구조 (Supabase)

### 6.1 users
- Supabase Auth 기본 테이블 사용

### 6.2 todos
```sql
create table todos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  title text not null,
  description text,
  created_date timestamptz default now(),
  due_date timestamptz,
  priority text check (priority in ('high', 'medium', 'low')),
  category text,
  completed boolean default false
);
```

---

## 7. 권한 정책 (RLS)
- 사용자는 자신의 todos만 조회/수정/삭제 가능

---

## 8. 비기능 요구사항
- 반응형 UI (모바일 대응)
- 평균 API 응답 시간 < 1초
- 접근성 고려 (키보드 네비게이션)

---

## 9. 향후 확장 아이디어
- 반복 일정
- 캘린더 연동
- 팀 단위 협업
- 알림 (이메일 / 푸시)

---

## 10. 성공 지표 (KPI)
- DAU / MAU
- 할 일 생성 대비 완료율
- AI 기능 사용 비율
