// Автономная страница: игра на весь экран со встроенным обучающим движком — темы, режимы,
// генерация пакетов на сервере и разноуровневый резерв, если сервер недоступен.

import { mountTreasury } from './embed';

const host = document.getElementById('treasury');
if (host) {
  const params = new URLSearchParams(location.search);
  const level = params.get('level');
  mountTreasury(host, {
    level: level ? Number(level) : undefined,
  });
}
