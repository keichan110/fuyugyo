import { z } from 'zod';

// ビルド後もスキーマの初期化に先行するよう、Zod を設定してから SPA を読み込む。
z.config({ jitless: true });
void import('./main');
