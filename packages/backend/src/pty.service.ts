import { spawn, IPty } from 'node-pty';
import os from 'os';

// Google OAuth2 클라이언트 초기화 (실제 토큰 관리는 index.ts에서 이루어짐)
// import { google } from 'googleapis'; // 토큰 갱신 시 필요
// const oauth2Client = new google.auth.OAuth2(
//   process.env.GOOGLE_CLIENT_ID,
//   process.env.GOOGLE_CLIENT_SECRET,
//   'postmessage' // 또는 백엔드 콜백 URI
// );

export class PtyService {
  private ptyProcess: IPty | null = null;
  private shell: string;
  private readonly initialCommand = 'gemini'; // 초기 실행 명령어
  private onDataCallback: (data: string) => void;
  private onExitCallback: (code: number, signal?: number) => void;
  // private userTokens: { access_token: string; refresh_token?: string }; // 토큰 기반 인증 시 필요

  constructor(
    onData: (data: string) => void,
    onExit: (code: number, signal?: number) => void,
    // userTokens?: { access_token: string; refresh_token?: string } // 토큰 기반 인증 시 필요
  ) {
    this.onDataCallback = onData;
    this.onExitCallback = onExit;
    // if (userTokens) { // 토큰 기반 인증 시 필요
    //   this.userTokens = userTokens;
    //   oauth2Client.setCredentials(this.userTokens);
    // }
    this.shell = os.platform() === 'win32' ? 'powershell.exe' : 'bash';
  }

  // 토큰 유효성 검사 및 갱신 로직 (2주차 작업에서 구체화)
  // private async ensureValidToken(): Promise<void> {
  //   if (!this.userTokens || !oauth2Client) return;
  //   if (oauth2Client.isTokenExpiring()) {
  //     try {
  //       console.log('PtyService: Access token is expiring, attempting to refresh...');
  //       const { credentials } = await oauth2Client.refreshAccessToken();
  //       this.userTokens.access_token = credentials.access_token!;
  //       if (credentials.refresh_token) {
  //         this.userTokens.refresh_token = credentials.refresh_token;
  //       }
  //       oauth2Client.setCredentials(credentials);
  //       console.log('PtyService: Access token refreshed successfully.');
  //       // TODO: 갱신된 토큰을 안전하게 저장하는 로직 (예: DB 업데이트)
  //     } catch (error) {
  //       console.error('PtyService: Failed to refresh access token:', error);
  //       this.onDataCallback(`\r\nError: Could not refresh access token. Please try logging in again.\r\n`);
  //       this.kill(); // 토큰 갱신 실패 시 프로세스 종료
  //       throw new Error('Failed to refresh access token.');
  //     }
  //   }
  // }

  public async start(cols: number = 80, rows: number = 30): Promise<void> {
    // await this.ensureValidToken(); // 토큰 기반 인증 시 활성화

    try {
      this.ptyProcess = spawn(this.shell, [], {
        name: 'xterm-color',
        cols,
        rows,
        cwd: process.env.HOME || os.homedir(),
        env: {
          ...process.env,
          // 토큰 기반 인증 시 주석 해제
          // CLOUDSDK_AUTH_ACCESS_TOKEN: this.userTokens?.access_token,
        },
      });

      console.log(`PtyService: Spawned shell (PID: ${this.ptyProcess.pid})`);

      this.ptyProcess.onData((data: string) => {
        // console.log('PtyService (onData raw):', Buffer.from(data).toString()); // 디버깅용
        this.onDataCallback(data);
      });

      this.ptyProcess.onExit(({ exitCode, signal }) => {
        console.log(`PtyService (onExit): Process (PID: ${this.ptyProcess?.pid}) exited with code ${exitCode}, signal ${signal}`);
        this.onExitCallback(exitCode, signal);
        this.ptyProcess = null;
      });

      // 초기 gemini 명령어 실행
      this.ptyProcess.write(`${this.initialCommand}\r`);
      console.log(`PtyService: Initial command "${this.initialCommand}" sent.`);

    } catch (error: any) {
      console.error('PtyService: Failed to start pty process:', error);
      this.onDataCallback(`\r\nError starting terminal session: ${error.message}\r\n`);
      this.kill(); // 시작 실패 시 정리
      throw error; // 오류를 상위로 전파
    }
  }

  public write(data: string): void {
    if (this.ptyProcess && this.ptyProcess.writable) {
      this.ptyProcess.write(data);
    } else {
      console.warn('PtyService: No active or writable pty process to write to.');
      // 여기서 onDataCallback을 통해 사용자에게 알릴 수도 있음
      // this.onDataCallback("\r\nError: Terminal session is not active. Please reconnect.\r\n");
    }
  }

  public kill(): void {
    if (this.ptyProcess) {
      const pid = this.ptyProcess.pid;
      this.ptyProcess.kill();
      console.log(`PtyService: Sent kill signal to process (PID: ${pid}).`);
      // onExit 콜백은 ptyProcess.onExit 핸들러에서 호출됨
    }
    this.ptyProcess = null; // 참조 제거
  }

  public resize(cols: number, rows: number): void {
    if (this.ptyProcess) {
      try {
        this.ptyProcess.resize(cols, rows);
        console.log(`PtyService: Resized terminal (PID: ${this.ptyProcess.pid}) to ${cols}x${rows}`);
      } catch (error) {
        console.error(`PtyService: Error resizing terminal (PID: ${this.ptyProcess.pid}):`, error);
        // resize 실패는 치명적이지 않을 수 있으므로, 에러 로그만 남김
      }
    }
  }
}
