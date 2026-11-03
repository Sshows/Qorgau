# Выпуск 3 ноября 2026

- Сайт: https://qorgau-vision-mad.vercel.app/
- Проект: https://vercel.com/mads-projects-27f6c416/qorgau-vision
- GitHub PR: https://github.com/Sshows/Qorgau/pull/1
- Выпущенный коммит: e65166c70ed80112b8d3772b3e4e662fdeb94586, ветка feat/situation-center.
- Vercel deployment: dpl_8AbkfDP2mmGHpSyxNQhX6zDahHV2, production, READY.
- Неизменяемый адрес сборки: https://qorgau-vision-nim1vx0it-mads-projects-27f6c416.vercel.app/ (может требовать входа Vercel).
- Среда: Vite, Node.js 24.x, npm ci, npm run build, dist; серверная Function api/index.
- Сборка Vercel: 25 секунд; GitHub Actions run 41649577158 завершён успешно.

Новый проект создан в аккаунте владельца по его выбору; прежний сайт qorgau-vision-almaty в этом аккаунте отсутствовал. Текущий постоянный адрес публичен. main не объединялся: исходники опубликованы в отдельной ветке и PR. Выпуск выполнен CLI из этой ветки; автоматическая Git-интеграция пока не настроена.

Без Supabase приложение остаётся локальным DEMO. Серверный API опубликован и проверен, но общая база, реальные пользователи, SQL/RLS и AI требуют подключения и отдельной сквозной проверки. Платные сервисы не создавались. Инструкция: [DEPLOYMENT.md](DEPLOYMENT.md).

Проверки: публичные HTTP-ответы, создание DEMO-записи и перезагрузка, воспроизведение публичной камеры, локальные тесты и CI. Подробности: [VALIDATION.md](VALIDATION.md).
