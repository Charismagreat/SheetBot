# SheetBot 개발 태스크 관리 대장 (Task Checklist)

## 📌 Phase 1. 문서 체계 및 개발 원칙 수립
- [x] `task.md` 작성 및 개발 진행 추적 체계화
- [x] `AGENTS.md` 개발 원칙 수록 (7종 감사 컬럼, 소프트 삭제, EasyBot 오케스트레이션, 멀티유저 격리)
- [x] `src/docs/sheetbot-manual.md` 사용자 매뉴얼 작성

## 📌 Phase 2. 이지데스크 My DB 정규화 & 마이그레이션
- [x] `src/lib/setup-db.ts` 데이터베이스 자동 생성 및 마이그레이션 모듈 구현
  - `sheetbot_projects` 테이블 정의 및 7종 감사 컬럼 기본 제공
  - `sheetbot_schedules` 테이블 정의 및 7종 감사 컬럼 기본 제공
  - 기존 `system_settings`의 데이터를 새 테이블로 1회 안전 이전(In-app Migration)
- [x] `src/app/api/projects/route.ts` 정규 테이블 CRUD 및 소프트 삭제(`deleted_at IS NULL`) 리팩토링
- [x] `src/app/api/schedules/route.ts` 정규 테이블 CRUD 및 소프트 삭제 리팩토링

## 📌 Phase 3. 이지데스크 AI Caller 통합 연동
- [x] `src/app/api/generate/route.ts`에서 `callAiCaller`를 최우선으로 경유하도록 변경

## 📌 Phase 4. AI 도움말 및 이지봇(EasyBot) 구축
- [x] `src/app/api/ai/contextual-help/route.ts` 컨텍스트 도움말 API 구현
- [x] `src/components/AIHelpManager.tsx` 마우스 호버 AI 가이드 컴포넌트 구현
- [x] `src/app/api/easybot/route.ts` Apps Script 특화 대화형 오케스트레이터 API 구현
- [x] `src/components/EasyBot.tsx` 플로팅 대화창 및 바로가기 지원 컴포넌트 구현
- [x] `src/app/layout.tsx`에 `AIHelpManager`와 `EasyBot` 전역 마운트
- [x] UI 컴포넌트(`Dashboard`, `Navbar`, 모달 등)에 `data-easybot-hint` 힌트 속성 부착

## 📌 Phase 5. 검증 및 최종 보고
- [x] TypeScript 및 Next.js 빌드 검증 (`npm run build` 성공 통과)
- [x] `src/docs/walkthrough.md` 작업 결과 보고서 작성
