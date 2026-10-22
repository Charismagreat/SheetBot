# 📱 SheetBot 모바일 에이전트 앱 페어링 트러블슈팅 가이드

본 문서는 **시트봇 모바일 에이전트(SheetBot Agent / Android APK)** 설치 후 웹 대시보드 또는 파일투시트(FileToSheet)와 연동(페어링)할 때 발생할 수 있는 이슈 및 원인별 해결 방법을 정리한 기술 문서입니다.

---

## 1. 페어링 무한 반복 현상 (해결 완료)

### 증상
- 전화번호 SMS 인증 또는 QR 코드 스캔 후 "인증 완료" 알림이 뜨지만, 페어링 대기 화면(`[구글 계정 1초 로그인]`, `[번호 인증]`, `[QR 스캔]`)이 사라지지 않고 계속해서 페어링을 다시 요구함.

### 원인
- `AccountPairingController.kt`에서 SMS 인증 성공 및 FTS QR 스캔 시 `ftsPhoneNumber`, `ftsProjectId`, `ftsEndpoint` 등은 정상 저장되었으나, 앱의 최상위 페어링 플래그인 `prefs.isPaired` 및 `prefs.userEmail`이 세팅되지 않아 UI 코디네이터(`MainCoreCoordinator.kt`)가 미페어링 상태로 판단하여 페어링 버튼들을 계속 노출함.

### 조치 내역 (v1.0.1 반영)
- `PreferencesManager.kt`: `isPaired` 게터에서 `isFtsPaired`(전화번호/FTS 인증 상태)가 참인 경우에도 `isPaired = true`로 인식하도록 동기화.
- `AccountPairingController.kt`: SMS 코드 검증 및 QR 스캔 성공 시 `prefs.isPaired = true` 및 가상 식별 이메일(`phone@fts.local` 등) 자동 설정.
- `MainCoreCoordinator.kt`: 페어링 완료 시 미페어링 제어 레이아웃(`layoutUnpairedControls`) 숨김 및 언링크 존(`layoutUnlinkZone`) 활성화.

---

## 2. 구글 1초 로그인 실패 (SHA-1 미등록 및 타임아웃)

### 증상
- `[구글 계정 1초 로그인]` 클릭 시 구글 계정 선택 창이 뜨지 않고 즉시 닫히거나, 로그캣(Logcat)에 아래와 같은 에러가 출력되며 페어링에 실패함:
  - `ApiException: 10: DEVELOPER_ERROR`
  - `ApiException: 12500`
  - "페어링 요청 시간 초과" 또는 토스트 오류

### 원인 1: Google Cloud Console OAuth 클라이언트 SHA-1 지문 불일치
- 안드로이드 Google One-Tap/Sign-In은 APK를 서명한 키스토어(Keystore)의 **SHA-1 지문**이 Google Cloud Console의 **OAuth 2.0 클라이언트 ID(Android)**에 등록되어 있지 않으면 `DEVELOPER_ERROR (코드 10)`를 반환합니다.
- 특히 **Debug Keystore**로 빌드한 APK와 **Release Keystore**로 서명한 APK는 SHA-1 지문이 서로 다르므로, 새 키스토어로 빌드 배포한 경우 반드시 등록이 필요합니다.

#### 해결 방법
1. **키스토어 SHA-1 지문 확인**:
   ```bash
   # Android 프로젝트 루트에서 실행
   cd C:\dev\SheetBot\android-user-agent
   ./gradlew signingReport
   ```
   또는 특정 키스토어 파일 조회:
   ```bash
   keytool -list -v -keystore <your-keystore.jks> -alias <alias-name>
   ```
2. **Google Cloud Console 등록**:
   - [Google Cloud Console](https://console.cloud.google.com/) 접속 ➔ 해당 프로젝트 선택
   - **API 및 서비스** ➔ **사용자 인증 정보(Credentials)** 이동
   - **OAuth 2.0 클라이언트 ID**에서 Android 유형 확인 (패키지명: `cloud.sheetbot.agent.user`)
   - 확인한 SHA-1 지문을 추가 등록 및 저장.
3. **Web Client ID 일치 확인**:
   - 앱 내 `strings.xml`의 `default_web_client_id`가 Google Cloud Console의 `Web application` 클라이언트 ID와 정확히 일치하는지 확인.

### 원인 2: 백엔드/터널링 서비스 콜드 스타트 타임아웃
- 클라이언트 앱은 보안 페어링 검증 요청 시 10초 타임아웃(`withTimeoutOrNull(10_000)`)을 적용합니다.
- 무료 플랜 또는 대기 상태의 Render 백엔드(`tunneling-service.onrender.com` / 백엔드 API)가 콜드 스타트 중일 경우 첫 응답에 15~30초 이상 소요되어 타임아웃 오류가 발생할 수 있습니다.

#### 해결 방법
- 웹 대시보드에 먼저 접속하여 백엔드 인스턴스를 활성화(Wake up)한 후 모바일 앱에서 페어링을 재시도합니다.

---

## 3. 수동 6자리 PIN 코드 & QR 코드 검증 규칙

### 증상
- 대시보드에 표시된 6자리 번호를 입력하거나 QR을 스캔했을 때 "유효하지 않거나 만료된 페어링 코드입니다" (HTTP 401) 경고 발생.

### 1) 동적 6자리 PIN 코드 생성 알고리즘
- 시트봇의 6자리 인증 PIN은 고정 번호가 아니며, 백엔드(`src/app/api/user/agent2/pair/route.ts`)에서 유저 이메일과 당일 UTC 날짜를 기반으로 생성됩니다:
  $$\text{PIN} = \text{HMAC-SHA256}(\text{cleanEmail} + \text{todayStr(UTC)}) \pmod{900000} + 100000$$
- **발생 가능한 실패 케이스**:
  - 임의의 번호를 추측하여 입력한 경우
  - 스마트폰의 시계/날짜가 실제 UTC 날짜와 심하게 어긋나 있는 경우
  - 대시보드를 열어둔 지 오랜 시간이 지나 날짜(UTC 기준)가 변경된 경우

### 2) 개발자/비상용 마스터 바이패스 PIN (Master Bypass PIN)
- 현장 테스트, 네트워크 장애 또는 빠른 연동 검증을 위해 백엔드에 사전에 정의된 마스터 바이패스 PIN이 구성되어 있습니다:
  - **허용된 마스터 PIN**: `777777`, `123456`, `000000`
- 웹 대시보드 연동이 원활하지 않거나 긴급 테스트가 필요한 경우, 6자리 PIN 입력창에 위 마스터 PIN 중 하나를 입력하면 즉시 페어링 인증을 통과할 수 있습니다.

### 3) QR 코드 만료 및 형식
- QR 코드에는 JSON 페이로드 형태의 수신 토큰(`token`) 및 유효 엔드포인트가 포함됩니다.
- 이전 세션의 캡처본 QR 코드나 삭제된 시트/프로젝트의 토큰은 유효성 검증 API(`GET /api/inbox/{token}`)에서 404를 반환하므로, 반드시 최신 대시보드 화면에 노출된 QR 코드를 직접 스캔해야 합니다.
