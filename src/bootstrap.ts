import { z } from 'zod';

// ビルド後もスキーマの初期化に先行するよう、Zod を設定してから SPA を読み込む。
z.config({ jitless: true });
void import('./main').catch((error: unknown) => {
  console.error('アプリの起動に失敗しました', error);

  const root = document.getElementById('root');
  if (!root) {
    return;
  }

  const message = document.createElement('p');
  message.setAttribute('role', 'alert');
  message.textContent = 'アプリを表示できませんでした。ページを再読み込みしてください。';

  const reload = document.createElement('button');
  reload.type = 'button';
  reload.textContent = '再読み込み';
  reload.addEventListener('click', () => window.location.reload());

  root.replaceChildren(message, reload);
});
