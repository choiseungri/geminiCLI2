import express, { Request, Response } from 'express';
import dotenv from 'dotenv';
import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { PtyService } from './pty.service';

dotenv.config({ path: '../../.env' }); // 루트 디렉토리의 .env 파일을 로드

const app = express();
const server = http.createServer(app);
const io = new SocketIOServer(server, {
  cors: {
    origin: process.env.FRONTEND_URL || "http://localhost:5173", // 프론트엔드 주소
    methods: ["GET", "POST"]
  }
});

const port = process.env.BACKEND_PORT || 3000;

app.use(express.json());

app.get('/', (req: Request, res: Response) => {
  res.send('Backend server is running with Socket.IO!');
});

app.post('/api/auth/google', (req: Request, res: Response) => {
  const { code } = req.body;

  if (!code) {
    return res.status(400).json({ message: 'Authorization code is missing.' });
  }

  console.log('Received authorization code:', code);

  const { google } = require('googleapis');

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    'postmessage' // 이 값은 프론트엔드에서 useGoogleLogin hook에 설정된 redirectUri와 일치해야 합니다.
  );

  oauth2Client.getToken(code).then(({ tokens }: { tokens: any }) => {
    console.log('Received tokens:', tokens);

    // TODO: 이 토큰들을 안전하게 저장하고 사용자 세션과 연결해야 합니다.
    // 일단은 access_token과 refresh_token을 응답으로 보내 확인합니다. (실제 프로덕션에서는 절대 이렇게 하면 안 됩니다)
    res.status(200).json({
      message: 'Authorization code exchanged for tokens successfully.',
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
    });
  }).catch((err: Error) => {
    console.error('Failed to exchange authorization code for tokens:', err);
    res.status(500).json({ message: 'Failed to exchange authorization code for tokens.', error: err.message });
  });
});

// Socket.IO 연결 처리
io.on('connection', (socket) => {
  console.log(`Socket connected: ${socket.id}`);

  const sessionId = socket.id; // 간단히 socket id를 세션 ID로 사용

  // PtyService의 onData 콜백: pty 출력을 클라이언트로 전송
  const handlePtyData = (data: string) => {
    socket.emit('pty-output', data);
  };

  // PtyService의 onExit 콜백: 클라이언트에 세션 종료 알림
  const handlePtyExit = (code: number, signal?: number) => {
    console.log(`PtyService for session ${sessionId} exited with code ${code}, signal ${signal}`);
    socket.emit('pty-exit', `Terminal session ended (code: ${code}${signal ? ', signal: ' + signal : ''})`);
    socket.disconnect(true); // pty 종료 시 소켓 연결도 종료
  };

  // TODO: 실제로는 인증된 사용자의 토큰을 기반으로 PtyService를 생성해야 합니다.
  // 현재는 토큰 없이 PtyService를 사용하며, `ensureValidToken` 로직은 PtyService 내에서 주석 처리되어 있습니다.
  const ptyService = new PtyService(handlePtyData, handlePtyExit);

  // 초기 터미널 크기는 프론트엔드에서 연결 후 'pty-resize' 이벤트로 전달받는 것이 좋음
  // 여기서는 기본값으로 시작
  ptyService.start().catch(err => {
    console.error(`Socket ${sessionId}: PtyService failed to start`, err);
    socket.emit('pty-error', 'Failed to start terminal session.');
    socket.disconnect(true);
  });

  socket.on('pty-input', (data: string) => {
    // console.log(`Socket ${sessionId} (pty-input):`, data); // 너무 많은 로그 방지
    ptyService.write(data);
  });

  socket.on('pty-resize', ({ cols, rows }: { cols: number, rows: number }) => {
    console.log(`Socket ${sessionId} (pty-resize): cols=${cols}, rows=${rows}`);
    ptyService.resize(cols, rows);
  });

  socket.on('disconnect', (reason) => {
    console.log(`Socket disconnected: ${sessionId}, reason: ${reason}`);
    ptyService.kill(); // 사용자가 연결을 끊으면 pty 프로세스도 종료
  });
});

server.listen(port, () => {
  console.log(`Backend server with Socket.IO is listening on port ${port}`);
});
