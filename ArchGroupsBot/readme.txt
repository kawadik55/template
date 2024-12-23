Тут находятся файлы для бота-архивариуса.
Бот позволяет загрузить/прочитать отчеты групп местности.
Пользователи бота подразделяются на 2 группы - Читатели и Писатели. Пароли для этих групп различны.
Читатели имеют право только для чтения, Писатели - чтение/запись.
С помощью кнопок выбираются интересующие год-месяц-подкомитет, и действие - чтение или запись.
Для записи в архив бот принимает текстовое сообщение или файл с отчетом, допустимы форматирование и эмодзи.
Есть также группа админов бота, которые имеют полный доступ и дополнительные кнопки в меню.
Админ бота может посмотреть/изменить пароли доступа, посмотреть список допущенных Читателей/Писателей,
посмотреть log-файл, удалить любой отчет.

arch_groups_bot.js - основной скрипт бота.
Для своей работы скрипт использует служебные файлы:
- filename_bot.json - имена файлов токенов, другие настройки.
- AdminBot.txt - массив админов бота, состоящий из ключа=chatId, и имени админа. Заполняется руками.
- ReaderList - json-список пользователей, прошедших авторизацию с правами Читателя.
- WriterList - json-список пользователей, прошедших авторизацию с правами Писателя.
- PasswordList.txt - json-список паролей доступа.
- BlackList.txt - json-список забаненных пользователей. Юзер попадает туда после 10-ти неверных попыток ввода пароля. Удаляется руками.
- LastMessId.txt - список последних messId пользователей для возможности удаления предыдущих сообщений с кнопками, чтобы не засорять чат.
- Comitee.txt - массив аббревиатур комитетов данной местности, из них создаются кнопки, можно изменять состав в файле.
- Year.txt - массив годов, пополняется новым годом автоматически при наступлении оного.
- /json/knopki.json - массив инлайн-кнопок бота по-умолчанию.
- /reports - директория для хранения отчетов.
Журнал работы скрипта сохраняется в файле /../log/имяБота.log.
Файл filename_bot.json содержит поля "file_arch_bot" и "file_mso_bot" с именами файлов токенов соотв. ботов.
Поле "mestnost" позволяет указать название местности.
Поле "mso_enable" (true/false) определяет вкл/выкл вспопогательного бота.

Если установлено "mso_enable":true, то скрипт запускает бота-помощника из "file_mso_bot", который дежурит в чате
и ловит сообщения с нужными тегами. Этот бот должен быть создан с настройкой Bot Setting -> Group Privacy = off, 
и добавлен в необходимую телеграм-группу.
В этой группе должны состоять служащие, которые будут публиковать в этой группе отчеты. Для того, чтобы отчет автоматически
сохранился в базе, в начале текста необходимо разместить хештег = #отчет Новая-02-2025 и далее через пробел или с новой строки
текст самого отчета. В хештеге 'Новая' - название группы, '02' - отчетный месяц, '2025' - отчетный год. Название группы
должно обязательно совпадать с одним из шаблонов в файле comitee.txt. Тоже самое справедливо и для
года и месяца - если год в хештеге не совпадает ни с каким значением из Year.txt, или месяц не равен 01-12,
то отчет не будет записан. 
Если использовать вспомогательного бота не нужно, то достаточно установить "mso_enable":false. 

Перед запуском скрипта arch_bot.js необходимо заполнить файлы токенов используемых ботов в директории /../Token,
а также файл chatId.json.

Готовый образ для Докера "kawadiyk/archgroupsbot:latest" можно загрузить из DockerHub.

