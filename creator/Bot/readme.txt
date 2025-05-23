Тут находятся файлы для конструктора чат-бота.
Теперь папка /Token находится внутри рабочей папки бота, а не снаружи, как раньше.
Взаимодействие с пользователем происходит в интерактивном режиме путем реакции на нажатие инлайн-кнопки на экране мессенджера.
Файлы большого размера - аудио, видео, документы - могут не загрузиться физически в локальные папки на сервере из-за ограничения Телеграм на
размер файлов (макс 20Мб). Бот сообщит об этом, если такое случится. Но доступ к этим файлам останется, т.к. они будут хранится на серверах
Телеграм долгое время (вечно) и бот сможет использовать идентификаторы этих файлов. Такой механизм значительно сокращает время получения
файла пользователем, а также позволяет обойти ограничение по размеру файла. Идентификаторы отправленных файлов сохраняются 
в файле FileId.txt и в папках медиаконтента, и при запросе файла от подписчика используются записи идентификаторов в первую очередь.
Для приватного использования бота достаточно записать 1-цу в файле privat.json. В таком случае бот будет отвечать только Админу или Служенцу.

Файлы скрипта:
- creator_bot.js - собственно сам скрипт бота.
- filename_bot.json - имя файла с токеном бота, в папке /Token, и пути к файлам Ежика и расписания, относительно текущей рабочей папки, но не выше папки РЕГИОН из -v команды запуска, если запускается в контейнере.
- AdminList.txt - массив админов бота, состоящий из ключа=chatId, и имени админа.
- UserList.txt - массив служенцев бота, состоящий из ключа=chatId, и имени служенца.
- LastMessId.txt - список последних messId пользователей для возможности удаления предыдущих сообщений с кнопками, чтобы не засорять чат.
- privat.json - файл выбора приватности, если = 1, то бот будет отвечать только Админу или Служенцу. "distance" - это за сколько дней до события напоминать.
- doc - директория с файлами для кнопок 'файлы'.
- photo - директория с картинками для кнопок 'фотки'.
- video - директория с картинками для кнопок 'видео'.
- audio - директория с картинками для кнопок 'аудио'.
- json/History.json - json-файл c личными историями для раздела 'Личные истории'.
- json/Tree.json - json-файл сo структурой кнопок бота.
- SignOff.txt - содержит признак остановки подписки новых юзеров, 1 - остановить, 0 - разрешить.

Админу бота доступны все команды, у Служенца есть ограничения на добавление/удаление кнопок.
Список всех команд для админа выводится по команде '/help' из файла helpAdmin.txt.
Список всех команд для служенца выводится по команде '/help' из файла helpUser.txt.

Перед запуском скрипта creator_bot.js необходимо заполнить файлы /Token/chatId.json и /Token/token_bot.json,
а также установить уровень приватности в файле privat.json.

Запустить можно и в Докере, читать файл Docker.txt
Готовый образ для Докера "kawadiyk/creatorbot:latest" можно загрузить из DockerHub.

Если предполагается запускать несколько ботов, то лучше переименовать папку "creator" названием местности,
например "nakazan", чтобы складывать сюда остальные боты и скрипты. Папку "Bot" тоже лучше переименовать
по задаче, например "InfoBot".
//-----------------------------------------------------------------------------------
Запуск контейнера в докере является самым простым способом разворота этого бота в системе, если, конечно, пакет докера
уже установлен в системе. Установка докера подробно описана в файле Docker.txt в папке Doc репозитория.
Для того, чтобы развернуть бота в системе, нужно всего лишь создать нужные папки и запустить контейнер бота.
Итак:
1. В домашней папке пользователя (например: /home/anton, в дальнейшем будем звать ее ДОМ) нужно создать основную папку
местности, например Minsk (в дальнейшем будем звать ее РЕГИОН), а внутри нее создать папку для этого бота ArchBot,
или с любым другим именем (в дальнейшем будем звать ее БОТ). Тогда полный путь к боту будет выглядеть так:
ДОМ/РЕГИОН/БОТ
а если в расшифрованном виде, то:
/home/anton/Minsk/ArchBot
Права записи в эти папки лучше открыть для всех, чтоб не было проблем при записи логов из системы.
Папка бота БОТ должна иметь уникальное имя, отличное от других папок с ботами в этой местности.

2. Теперь запустим контейнер с ботом, и он сам развернет в созданных папках все необходимые для своей работы файлы:

docker run --name name_bot -v ДОМ/РЕГИОН:/home/pi/РЕГИОН:rw --restart=unless-stopped -d -e "CURRENT_DIR=/home/pi/РЕГИОН/БОТ" kawadiyk/creatorbot:latest ./creator_bot
и следом остановить контейнер командой:
docker stop name_bot

где имя контейнера 'name_bot' можно заменить на любое другое, лишь бы самому понятно было, что это за бот.
Например: arch_bot, loader_bot, info_bot, и т.д.
Само собой, ДОМ, РЕГИОН и БОТ нужно заменить на свои пути и директории, о которых мы договорились выше.
После первого запуска бот еще не будет работать, ибо нужно заполнить вновь созданные (или уже имеющиеся, но дополненные)
файлы, согласно вышеописанным требованиям для этого бота.

3. После заполнения файлов токенами, именами и прочими настройками, нужно перезапустить контейнер командой:

docker restart name_bot

где name_bot нужно заменить на имя вашего контейнера, о чем говорилось выше.
После этого бот должен полноценно заработать.
Вот и все, что нужно сделать для запуска бота в докер-контейнере!
//-----------------------------------------------------------------------------------
Теперь запустить контейнер с ботом можно одной командой, без остановки и заполнения файлов настроек.
Нужно просто послать в контейнер все(или только нужные) параметры настроек, разместив их в переменных окружения.
В примере ниже прописаны все возможные переменные, но допустимо использовать их в любом сочетании или кол-ве.
Если остановить, удалить и запустить контейнер с новым набором окружения, то перезаписаны в нужные файлы на диске
будут только эти параметры.

1.
docker run --name name_bot -v ДОМ/РЕГИОН:/home/pi/РЕГИОН:rw --restart=unless-stopped -d \
-e "CURRENT_DIR=/home/pi/РЕГИОН/БОТ" \
-e "SUPERVISOR=1234567890" \
-e "PRIVAT=0" \
-e "DISTANCE=1" \
-e "TOKEN_BOT=токен основного бота как есть" \
-e "NAME_BOT=это_мой_bot или как хотите" \
-e "TOKEN_LOG=токен для бота логов, если нужен" \
-e "NAME_LOG=это_лог_bot или как хотите" \
-e "PATHEG =/../Rassilka/eg.txt ваш путь к файлу Ежика, если надо" \
-e "PATHRASPIS =/../Rassilka/raspis.txt ваш путь к файлу Расписания, если надо" \
kawadiyk/creatorbot:latest ./creator_bot

2.
docker stop name_bot && docker rm name_bot

3.
docker run --name name_bot -v ДОМ/РЕГИОН:/home/pi/РЕГИОН:rw --restart=unless-stopped -d -e "CURRENT_DIR=/home/pi/РЕГИОН/БОТ" kawadiyk/creatorbot:latest ./creator_bot

Если не сделать перезагрузку контейнера после первой команды с настройками, то все последующие рестарты контейнера
будут перезаписывать эти параметры вновь и вновь, а это не есть хорошо.

Удачи вам!
