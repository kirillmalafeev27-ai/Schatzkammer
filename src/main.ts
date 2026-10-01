// Автономная страница: игра на весь экран с локальным банком вопросов.

import { mountTreasury } from './embed';
import { LocalBankProvider } from './questions/LocalBankProvider';

const host = document.getElementById('treasury');
if (host) {
  const params = new URLSearchParams(location.search);
  const level = params.get('level');
  mountTreasury(host, {
    questions: new LocalBankProvider(),
    level: level ? Number(level) : undefined,
  });
}
