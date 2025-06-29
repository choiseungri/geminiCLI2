# 완벽한 Gemini CLI 웹 인터페이스: 최종 개발 계획

이 문서는 `gemini-cli`의 공식 동작 방식을 기반으로, 안정성과 보안을 보장하는 웹 인터페이스를 구축하기 위한 최종 실행 계획이다.

## 0. 핵심 전제 및 리스크 관리

- **인증 핵심:** `gemini-cli`는 **대화형(interactive) `gcloud` 로그인**을 통해 사용자 인증을 수행한다. 서버 환경에서는 이 방식이 불가능하므로, 사용자가 프론트엔드에서 로그인할 때 받은 **Access Token**과 **Refresh Token**을 백엔드가 위임받아 사용하는 것이 이 계획의 핵심이다.
- **주요 리스크 및 해결 방안:**
    - **리스크:** Access Token의 만료 (일반적으로 1시간).
    - **해결 방안:** 프론트엔드에서 **Refresh Token**을 함께 받아 백엔드에 전달한다. 백엔드는 토큰 만료 시 Refresh Token을 사용하여 새로운 Access Token을 자동으로 발급받는다. 이는 사용자 경험의 연속성을 보장하는 가장 중요한 기능이다.
    - **리스크:** `gemini-cli`의 예기치 않은 종료 또는 오류 발생.
    - **해결 방안:** `node-pty`의 `onExit` 이벤트를 감지하여 프론트엔드에 "세션 종료" 또는 "오류 발생"을 알리고, 재연결 로직을 안내한다. `stderr` 출력을 별도로 처리하여 오류 내용을 사용자에게 표시한다.

## 1. 백엔드 개발 계획 (보안 및 안정성 강화)

### 1.1. 환경 설정 및 사전 준비

1. **Python 환경:** 서버에 Python 3.9 이상 버전을 설치한다.
2. **`gemini-cli` 설치:** `pip install google-gemini-cli` 명령어로 `gemini-cli`를 설치한다.
3. **환경 변수 관리:** `dotenv` 라이브러리를 사용하여 `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` 등 민감한 정보를 코드와 분리하여 관리한다.

### 1.2. 인증 흐름 (Refresh Token 포함)

1. **Google OAuth 2.0 설정:** Google Cloud Console에서 OAuth 2.0 클라이언트 ID를 생성한다. 이때 **"웹 애플리케이션"** 유형으로 만들고, 승인된 자바스크립트 원본(프론트엔드 주소)과 승인된 리디렉션 URI(백엔드 주소)를 정확히 등록한다.
2. **사용자 로그인 및 토큰 획득 (프론트엔드 -> 백엔드):**
    - 프론트엔드에서 사용자가 Google 로그인을 하면, **`offline` 접근 유형**을 요청하여 `authorization code`를 받는다.
    - 이 `code`를 백엔드로 전송한다.
3. **토큰 교환 및 저장 (백엔드):**
    - 백엔드는 전달받은 `code`를 사용하여 Google 인증 서버에 **Access Token**과 **Refresh Token**을 요청하여 발급받는다.
    - 각 사용자의 세션과 `access_token`, `refresh_token`을 안전하게 맵핑하여 관리한다. (실제 프로덕션 환경에서는 이 토큰들을 암호화하여 데이터베이스나 Redis 같은 보안 저장소에 저장해야 한다.)

### 1.3. CLI 프로세스 관리 (`pty.service.ts`) - 최종판

`PtyService`는 사용자의 토큰을 관리하고 `gemini-cli` 프로세스의 생명주기를 완벽하게 제어한다.

```
// pty.service.ts (개념 코드)
import { spawn, IPty } from 'node-pty';
import { google } from 'googleapis';

// Google OAuth2 클라이언트 초기화
const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  'postmessage' // 리디렉션 URI
);

export class PtyService {
  private ptyProcess: IPty | null = null;
  private userTokens: { access_token: string; refresh_token: string };

  constructor(tokens: { access_token: string; refresh_token: string }) {
    this.userTokens = tokens;
    // 토큰 설정
    oauth2Client.setCredentials({
        access_token: this.userTokens.access_token,
        refresh_token: this.userTokens.refresh_token,
    });
  }

  // 토큰 유효성 검사 및 갱신
  private async ensureValidToken() {
    if (oauth2Client.isTokenExpiring()) {
      const { credentials } = await oauth2Client.refreshAccessToken();
      this.userTokens.access_token = credentials.access_token!;
      oauth2Client.setCredentials(credentials);
    }
  }

  public async start(
    onData: (data: string) => void,
    onError: (error: string) => void,
    onExit: (code: number, signal: number) => void
  ) {
    await this.ensureValidToken();

    // gemini-cli는 'gemini' 또는 'python -m gemini'로 실행될 수 있음
    this.ptyProcess = spawn('gemini', [], {
      name: 'xterm-color',
      env: {
        ...process.env,
        // 여기가 핵심: gcloud SDK가 사용할 Access Token을 환경 변수로 주입
        CLOUDSDK_AUTH_ACCESS_TOKEN: this.userTokens.access_token,
      },
    });

    // 표준 출력 처리
    this.ptyProcess.onData((data) => onData(data));
    // 프로세스 종료 처리
    this.ptyProcess.onExit(({ exitCode, signal }) => onExit(exitCode, signal));

    // 표준 오류(stderr)는 별도로 처리하여 에러 상황을 인지
    // (node-pty는 stdout과 stderr를 구분하지 않으므로, 파싱 전략이 필요할 수 있음)
  }

  public write(command: string) {
    this.ptyProcess?.write(command + '\r'); // '\r'은 Enter 입력을 의미
  }

  public kill() {
    this.ptyProcess?.kill();
  }
}

```

### 1.4. 소켓 핸들러 (`cli.handler.ts`)

- 새로운 `socket` 연결 시, 인증 미들웨어를 통해 토큰 교환 절차를 수행한다.
- 성공적으로 토큰을 받으면, 해당 토큰으로 `PtyService` 인스턴스를 생성한다.
- `PtyService`의 `onData`, `onError`, `onExit` 콜백을 설정하여 프론트엔드에 각각 `{type: 'assistant', content: '...'}`, `{type: 'error', content: '...'}`, `{type: 'system', content: '...세션 종료...'}`와 같은 구조화된 데이터를 전송한다.

## 2. 프론트엔드 개발 계획 (인증 강화)

### 2.1. 인증 흐름 (`@react-oauth/google` 사용)

1. **`useGoogleLogin` Hook 사용:** `offline` 접근을 통해 `code`를 받아오는 로그인 버튼을 구현한다.
    
    ```
    // GoogleAuth.tsx
    import { useGoogleLogin } from '@react-oauth/google';
    
    const login = useGoogleLogin({
      onSuccess: (codeResponse) => {
        // 이 codeResponse.code를 백엔드로 전송
        sendCodeToBackend(codeResponse.code);
      },
      flow: 'auth-code', // 'code'를 얻기 위한 필수 설정
    });
    
    return <button onClick={() => login()}>Login with Google</button>;
    
    ```
    
2. **`code` 전송:** 로그인 성공 시 받은 `code`를 백엔드의 `/api/auth/google` 같은 엔드포인트로 전송한다.
3. **세션 상태 관리:** 백엔드으로부터 성공적인 연결 신호를 받으면, `replStore`의 `connectionState`를 `connected`로 변경하고 채팅 인터페이스를 보여준다.

### 2.2. UI/UX

- `REPLInterface.tsx`에서 `connectionState`가 `error`이거나 `disconnected`일 때, 사용자에게 명확한 메시지를 보여주고 재로그인을 유도하는 UI를 추가한다.
- `assistant` 메시지와 `error` 메시지를 시각적으로 구분하여 (예: 다른 색상으로 표시) 사용자가 시스템 상태를 쉽게 파악할 수 있도록 한다.

## 3. 최종 구현 로드맵 (상세 버전)

아래 로드맵은 2주간의 스프린트와 배포 단계로 구성된 실용적인 실행 계획이다.

### **1주차 스프린트: 핵심 인증 및 백엔드 기반 구축**

- **목표:** 사용자가 웹에서 로그인하면, 백엔드가 해당 사용자 권한으로 `gemini -h` 명령어를 성공적으로 실행할 수 있는 최소 기능 제품(MVP)을 완성한다.
- **작업 목록 (Tasks):**
    1. **[Backend]** Monorepo 환경 설정 (`npm workspaces`, `typescript`, `eslint`) - (8시간)
    2. **[System]** Google Cloud Console에서 OAuth 2.0 웹 클라이언트 ID 설정 및 `.env` 파일에 키 저장 - (2시간)
    3. **[Backend]** Express 서버 및 `/api/auth/google` 엔드포인트 구현 (프론트에서 `code` 수신) - (6시간)
    4. **[Backend]** 수신한 `code`를 `googleapis` 라이브러리를 통해 Access/Refresh Token으로 교환하는 로직 구현 - (8시간)
    5. **[Frontend]** Vite + React 프로젝트 생성 및 `@react-oauth/google` 설정 - (4시간)
    6. **[Frontend]** `useGoogleLogin` hook을 사용하여 `flow: 'auth-code'` 방식의 로그인 버튼 구현 및 백엔드로 `code` 전송 - (6시간)
    7. **[Backend]** Socket.IO 기본 설정 및 인증된 연결 시, 전달받은 토큰으로 `PtyService` 초기 버전(`gemini -h` 실행) 인스턴스 생성 - (6시간)
- **1주차 완료 조건:** 프론트엔드에서 로그인하면, 백엔드 서버의 콘솔에 `gemini -h`의 도움말 내용이 오류 없이 출력되어야 한다.

### **2주차 스프린트: 완전한 채팅 기능 및 안정성 확보**

- **목표:** 실시간 양방향 통신이 가능한 완전한 채팅 인터페이스를 구현하고, 토큰 갱신 및 오류 처리를 통해 서비스 안정성을 확보한다.
- **작업 목록 (Tasks):**
    1. **[Backend]** `PtyService`에 `write(command)`, `kill()` 메서드 및 `onData`, `onExit` 이벤트 핸들러 기능 완전 구현 - (8시간)
    2. **[Backend]** Access Token 만료 시 Refresh Token을 사용한 자동 갱신 로직 구현 및 테스트 - (6시간)
    3. **[Backend]** Socket.IO 핸들러에 `cli:command` 수신 및 `disconnect` 이벤트 처리 로직 구현 - (6시간)
    4. **[Frontend]** Zustand를 사용한 `replStore` 설정 (메시지 배열, 연결 상태 관리) - (4시간)
    5. **[Frontend]** `REPLInterface.tsx` 컴포넌트 구현 (메시지 목록 렌더링, 입력창 및 전송 버튼) - (8시간)
    6. **[Frontend]** Socket.IO 클라이언트 이벤트 리스너 구현 (`assistant`, `error`, `system` 메시지 수신 및 `replStore` 업데이트) - (6시간)
    7. **[Frontend]** 연결 오류/세션 종료 시 사용자에게 명확한 피드백을 주는 UI 처리 - (2시간)
- **2주차 완료 조건:** 사용자가 웹 채팅 인터페이스를 통해 Gemini와 자유롭게 대화할 수 있어야 한다. 1시간 이상 세션을 유지해도 토큰이 자동 갱신되어 대화가 끊기지 않아야 한다.

### **최종 단계: 테스트 및 배포**

- **목표:** 철저한 테스트를 거쳐 안정적인 서비스를 프로덕션 환경에 배포한다.
- **작업 목록 (Tasks):**
    1. **[QA]** 통합 테스트: 다양한 예외 상황(네트워크 불안정, CLI 프로세스 오류 등) 시나리오 테스트 - (8시간)
    2. **[DevOps]** 백엔드 및 프론트엔드 서비스의 Dockerfile 작성 - (4시간)
    3. **[DevOps]** GitHub Actions를 사용한 CI/CD 파이프라인 구축 (Master 브랜치 Push 시 자동 빌드 및 배포) - (8시간)
    4. **[DevOps]** Google Cloud Run 또는 유사 서비스에 컨테이너화된 애플리케이션 배포 및 최종 테스트 - (4시간)
- **프로젝트 완료 조건:** 공개된 URL을 통해 모든 사용자가 로그인하여 서비스를 안정적으로 사용할 수 있다.

## **사용자가 경험하게 될 최종 제품**

사용자는 복잡한 설치나 명령어 없이, 웹 브라우저만으로 `gemini-cli`의 모든 기능을 사용하는 세련된 웹 애플리케이션을 마주하게 됩니다.

1. **첫 화면 (로그인 페이지):**
    - 사용자는 깔끔한 웹페이지에 접속합니다. 화면 중앙에는 **"Google 계정으로 로그인"** 버튼 하나만 존재합니다.
2. **원클릭 보안 로그인:**
    - 버튼을 누르면 익숙한 Google 로그인 팝업창이 뜹니다. 사용자는 여기에 자신의 Google 계정으로 안전하게 로그인하고 필요한 권한을 허용합니다.
    - 로그인이 완료되면 팝업은 사라지고, 별도의 과정 없이 즉시 메인 채팅 화면으로 이동합니다.
3. **메인 화면 (채팅 인터페이스):**
    - 슬랙(Slack)이나 카카오톡처럼 직관적인 채팅 UI가 나타납니다.
    - 중앙에는 대화 내용이 표시되고, 하단에는 메시지를 입력할 수 있는 텍스트 창과 '전송' 버튼이 있습니다.
    - 화면 한쪽에는 '온라인' 또는 '연결됨'이라는 표시가 있어 현재 서비스가 정상적으로 연결되어 있음을 알려줍니다.
4. **실시간 대화 경험:**
    - 사용자가 "오늘 서울 날씨 어때?"라고 입력하고 '전송' 버튼을 누르면, 해당 메시지가 즉시 오른쪽에 표시됩니다.
    - 곧바로 왼쪽에는 Gemini가 응답을 생성 중임을 알리는 애니메이션(예: ...)이 나타납니다.
    - 잠시 후, `>>>` 같은 불필요한 기호 없이 깔끔하게 가공된 Gemini의 답변이 왼쪽에 나타납니다.
    - 이처럼 사용자는 끊김 없이 자연스러운 실시간 대화를 이어갈 수 있습니다.
5. **안정적인 세션 유지:**
    - 사용자는 웹 브라우저 탭을 몇 시간 동안 열어 두거나 다른 작업을 하다가 돌아와도 로그아웃되지 않고 대화를 이어서 할 수 있습니다. 백엔드에서 보이지 않게 자동으로 인증을 연장해주기 때문입니다.
6. **명확한 오류 안내:**
    - 만약 서버 점검이나 예기치 않은 문제로 연결이 끊기면, "연결이 끊겼습니다. 페이지를 새로고침하여 다시 로그인해주세요."와 같은 명확한 안내 메시지가 나타나며, 사용자는 혼란 없이 다음 행동을 결정할 수 있습니다.

### **기술적으로 완성된 결과물**

개발자는 다음과 같은 견고하고 확장 가능한 시스템을 구축하게 됩니다.

1. **구조화된 모노레포 프로젝트:** `frontend`와 `backend` 패키지가 분리되어 효율적으로 관리되는 프로젝트 구조가 완성됩니다.
2. **지능적인 백엔드 서버 (Node.js):**
    - **보안 인증 처리:** 사용자의 일회성 `code`를 받아 Google로부터 `Access Token`과 `Refresh Token`을 안전하게 교환하고 관리하는 API 엔드포인트를 갖춥니다.
    - **실시간 통신 허브:** Socket.IO를 통해 다수의 사용자와 안정적인 실시간 연결을 유지하고 각 사용자별로 `gemini-cli` 세션을 관리합니다.
    - **자동 인증 연장:** `Refresh Token`을 사용하여 `Access Token`이 만료되기 전에 자동으로 갱신함으로써, 사용자가 재로그인해야 하는 불편함을 없앤 안정적인 서비스를 제공합니다.
3. **세련된 프론트엔드 앱 (React):**
    - Google의 공식 가이드에 맞는 보안 로그인(`auth-code` 흐름) 기능을 갖춘 로그인 컴포넌트를 보유합니다.
    - 상태 관리 라이브러리(Zustand)를 통해 메시지 기록, 연결 상태 등을 체계적으로 관리하여 UI/UX의 일관성과 안정성을 보장합니다.
4. **자동화된 배포 시스템 (DevOps):**
    - 백엔드와 프론트엔드를 각각 컨테이너(Docker)로 만들어 어떤 서버 환경에서도 쉽게 배포할 수 있게 됩니다.
    - GitHub에 코드를 푸시하면 자동으로 테스트, 빌드, 배포가 이루어지는 CI/CD 파이프라인이 구축되어, 향후 기능 추가나 유지보수가 매우 빠르고 안정적으로 이루어집니다.

결론적으로, 이 계획의 최종 결과물은 **단순한 CLI 래퍼(Wrapper)를 넘어, 사용자와 개발자 모두를 만족시키는 완성도 높은 상용 수준의 웹 서비스**입니다.
