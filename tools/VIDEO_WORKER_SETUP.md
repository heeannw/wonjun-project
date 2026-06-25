# 무료 영상 분석 도우미

웹에서 YouTube 링크와 경기 시작·종료 시간을 입력하면 이 PC가 해당 구간만 잘라 Gemini로 분석합니다.

## 최초 설정

1. Supabase SQL Editor에서 `supabase/race_video_analysis_jobs.sql`을 실행합니다.
2. `tools/.env.worker.example`을 `tools/.env.worker`로 복사합니다.
3. 아래 값을 입력합니다.
   - `SUPABASE_URL`: Project Settings > API의 Project URL
   - `SUPABASE_SERVICE_ROLE_KEY`: Project Settings > API Keys의 `service_role`
   - `GEMINI_API_KEY`: Google AI Studio API 키
4. PowerShell에서 프로젝트 폴더로 이동한 뒤 실행합니다.

```powershell
npm run worker:video
```

또는 `tools/영상분석도우미_실행.cmd`를 더블클릭합니다.

`원준 영상 분석 도우미 실행 중`이 표시되면 준비가 끝난 것입니다.

## 사용

1. 웹의 `시합 일정 > 영상 레이스 분석`을 엽니다.
2. YouTube 링크, 경기 시작 위치, 종료 위치를 입력합니다.
3. `영상 자동 분석`을 누릅니다.
4. PC 도우미가 구간을 내려받고 분석하면 웹에 기록이 자동 입력됩니다.

도우미가 실행 중이지 않아도 요청은 사라지지 않습니다. 나중에 PC에서 도우미를 실행하면 오래된 요청부터 처리합니다.

## 보안

- `tools/.env.worker`는 Git에 올라가지 않습니다.
- `SUPABASE_SERVICE_ROLE_KEY`는 절대 웹 코드나 GitHub에 넣지 않습니다.
- 직접 분석할 권한이 있는 영상에만 사용합니다.
