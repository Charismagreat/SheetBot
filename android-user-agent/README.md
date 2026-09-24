# SheetBot Deposit Agent (Android Native App)

시트봇 전용 무통장 입금 실시간 감지 및 자동 토큰 충전 네이티브 안드로이드 에이전트입니다.

## 🚀 주요 기능
- **0초 QR 페어링**: 시트봇 워크스페이스 대시보드의 QR코드를 카메라로 비추면 계정 연동 완료
- **한국 주요 은행 입금 SMS 자동 감지**:
  - 카카오뱅크(`1599-3333`), 토스뱅크, 국민, 신한, 우리, 하나, 농협, 기업은행 등
- **24시간 무중단 백그라운드 서비스 (`KeepAliveService`)**:
  - 포그라운드 서비스 및 배터리 최적화 제외로 스마트폰 화면이 꺼져도 24시간 안정 동작
- **안전한 웹훅 통신**:
  - 감지된 SMS를 `https://sheetbot.cloud/api/wallet/bank-webhook`으로 암호화 실시간 전송
- **가상 입금 테스트 도구**:
  - 실제 돈을 입금하지 않아도 웹훅 파이프라인이 정상 작동하는지 1초 만에 테스트 가능

## 🛠️ 빌드 방법
```bash
./gradlew assembleRelease
# 또는
./gradlew assembleDebug
```
빌드된 APK는 `app/build/outputs/apk/release/`에 생성됩니다.
