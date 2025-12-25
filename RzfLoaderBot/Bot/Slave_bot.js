const TelegramBot = require('node-telegram-bot-api');
const moment = require('moment-timezone');

class SlaveBot {
    constructor(token, onConfigUpdate, mainChatNewsRef) {
        this.bot = new TelegramBot(token, { polling: true });
        this.onConfigUpdate = onConfigUpdate; // Колбэк для обновления конфига
        this.pendingConfigs = new Map(); // chatId -> временные данные конфигурации
		this.cleanupTimer = null; // Для очистки таймера при остановке
        
        // Используем ссылку на объект из основного кода
        this.chat_news = mainChatNewsRef || {};
        
        this.setupHandlers();
        this.setupCleanupTimer();
        
        console.log('SlaveBot запущен');
    }

    saveConfig(event = null, data = {}) {
        try {
            if (this.onConfigUpdate) {
                this.onConfigUpdate({
                    config: this.chat_news,
                    event: event,
                    data: data,
                    timestamp: Date.now()
                });
            }
            return true;
        } catch (err) {
            console.error('Ошибка сохранения конфига:', err);
            return false;
        }
    }

    setupHandlers() {
        // Команда /config
        this.bot.onText(/\/config/, async (msg) => {
            try {
                const chatId = msg.chat.id;
                const chatTitle = msg.chat.title || msg.chat.username || `Чат ${chatId}`;
                
                // Проверяем права
                if (!await this.checkAdminRights(chatId, msg.from.id)) {
                    await this.bot.sendMessage(chatId, 
                        '❌ Только администраторы чата могут настраивать бота.');
                    return;
                }
                
                // Сохраняем message_thread_id, если он есть (для форумов)
                const messageThreadId = msg.message_thread_id || "";
                
                await this.startConfigProcess(chatId, chatTitle, messageThreadId);
            } catch (err) {
                console.error('Ошибка в /config:', err);
            }
        });
		// Команда /start - работает как /config
        this.bot.onText(/\/start/, async (msg) => {
            try {
                const chatId = msg.chat.id;
                const chatTitle = msg.chat.title || msg.chat.username || `Чат ${chatId}`;
                
                //console.log(`/start от ${chatId} (${chatTitle})`);
                
                // Проверяем права
                if (!await this.checkAdminRights(chatId, msg.from.id)) {
                    await this.bot.sendMessage(chatId, 
                        '❌ Только администраторы чата могут настраивать бота.');
                    return;
                }
                
                // Сохраняем message_thread_id, если он есть (для форумов)
                const messageThreadId = msg.message_thread_id || "";
                
                await this.startConfigProcess(chatId, chatTitle, messageThreadId);
            } catch (err) {
                console.error('Ошибка в /start:', err);
            }
        });

        // Команда /info - информация о настройках
        this.bot.onText(/\/info/, async (msg) => {
            try {
                const chatId = msg.chat.id;
                const chatTitle = msg.chat.title || msg.chat.username || `Чат ${chatId}`;
                
                const info = await this.getChatInfo(chatId);
                await this.bot.sendMessage(chatId, info, {parse_mode: 'markdown'});
            } catch (err) {
                console.error('Ошибка в /info:', err);
            }
        });

        // Удаление бота из чата/канала
        this.bot.on('left_chat_member', async (msg) => {
            try {
                const botId = this.bot.token.split(':')[0];
                if (msg.left_chat_member && msg.left_chat_member.id.toString() === botId) {
                    const chatId = msg.chat.id;
                    //console.log(`Бот удален из чата ${chatId} (left_chat_member)`);
                    await this.removeChatFromConfig(chatId, false);
                }
            } catch (err) {
                console.error('Ошибка в left_chat_member:', err);
            }
        });
		
		this.bot.on('my_chat_member', async (msg) => {
            try {
                const botId = this.bot.token.split(':')[0];
                const newStatus = msg.new_chat_member.status;
                const oldStatus = msg.old_chat_member.status;
                const chatId = msg.chat.id;
                
                // Бота удалили из чата
                if (newStatus === 'left' || newStatus === 'kicked') {
                    //console.log(`Бот удален из чата ${chatId} (my_chat_member: ${oldStatus} -> ${newStatus})`);
                    await this.removeChatFromConfig(chatId, false);
                }
                
                // Бота добавили в чат
                if ((oldStatus === 'left' || oldStatus === 'kicked') && 
                    (newStatus === 'member' || newStatus === 'administrator')) {
                    //console.log(`Бот добавлен в чат ${chatId} (my_chat_member: ${oldStatus} -> ${newStatus})`);
                    // Можно автоматически предложить настройку
                    setTimeout(async () => {
                        try {
                            await this.bot.sendMessage(chatId,
                                `👋 Привет! Я бот для публикаций.\n\n` +
                                `Чтобы настроить рассылку в этот чат, используйте команду /config\n` +
                                `Только администраторы чата могут выполнить настройку.`
                            );
                        } catch (err) {
                            // Игнорируем ошибки, возможно бот не имеет прав
                        }
                    }, 1500);
                }
            } catch (err) {
                console.error('Ошибка в my_chat_member:', err);
            }
        });

        // Обработка нажатий на кнопки
        this.bot.on('callback_query', async (msg) => {
            try {
                const chatId = msg.message.chat.id;
                const data = msg.data;
                const fromId = msg.from.id;
                
                // Проверяем права для callback
                if (!await this.checkAdminRights(chatId, fromId)) {
                    await this.bot.answerCallbackQuery(msg.id, {
                        text: '❌ Только администраторы могут настраивать бот',
                        show_alert: true
                    });
                    return;
                }
                
                if (data.startsWith('timezone_')) {
                    const timezone = data.replace('timezone_', '');
                    const messageThreadId = msg.message.message_thread_id || "";
                    await this.handleTimezoneSelection(chatId, timezone, messageThreadId);
                    
                    // Удаляем сообщение с кнопками
                    try {
                        await this.bot.deleteMessage(chatId, msg.message.message_id);
                    } catch (e) {
                        // Игнорируем ошибки удаления
                    }
                    
                    await this.bot.answerCallbackQuery(msg.id);
                    
                } else if (data === 'manual_timezone') {
                    this.pendingConfigs.set(chatId, {
                        ...this.pendingConfigs.get(chatId),
                        waitingForManualInput: true
                    });
                    
                    await this.bot.editMessageText(
                        'Отправьте смещение часового пояса в формате:\n' +
                        '• +3 (для UTC+3)\n' +
                        '• -5 (для UTC-5)\n' +
                        '• 0 (для UTC±0)\n',
                        {
                            chat_id: chatId,
                            message_id: msg.message.message_id,
                            reply_markup: { inline_keyboard: [[
                                { text: 'Отмена', callback_data: 'cancel_config' }
                            ]]}
                        }
                    );
                    
                    await this.bot.answerCallbackQuery(msg.id);
                    
                } else if (data === 'cancel_config') {
                    const pending = this.pendingConfigs.get(chatId);
                    // Удаляем сообщение с выбором контента, если есть
                    if (pending && pending.lastContentMessageId) {
                        try {
                            await this.bot.deleteMessage(chatId, pending.lastContentMessageId);
                        } catch (e) {
                            // Игнорируем ошибки удаления
                        }
                    }
					this.pendingConfigs.delete(chatId);
                    try {
                        await this.bot.deleteMessage(chatId, msg.message.message_id);
                    } catch (e) {}
                    await this.bot.sendMessage(chatId, '⚙️ Настройка отменена.');
                    await this.bot.answerCallbackQuery(msg.id);
                    
                } else if (data.startsWith('content_')) {
                    // Обработка выбора типа контента
                    const contentType = data.replace('content_', '');
                    await this.handleContentSelection(chatId, contentType);
                    await this.bot.answerCallbackQuery(msg.id);
                    
                } else if (data === 'save_config') {
                    // Удаляем сообщение с выбором контента
                    try {
                        await this.bot.deleteMessage(chatId, msg.message.message_id);
                    } catch (e) {
                        // Игнорируем ошибки удаления
                    }
					// Сохранение конфигурации
                    await this.finishConfig(chatId);
                    await this.bot.answerCallbackQuery(msg.id);
                    
                }
                
            } catch (err) {
                console.error('Ошибка в callback_query:', err);
                try {
                    await this.bot.answerCallbackQuery(msg.id, {
                        text: '❌ Произошла ошибка',
                        show_alert: true
                    });
                } catch (e) {}
            }
        });

        // Ответ на ручной ввод часового пояса
        this.bot.on('message', async (msg) => {
            try {
                if (msg.text && !msg.text.startsWith('/')) {
                    const chatId = msg.chat.id;
                    const pending = this.pendingConfigs.get(chatId);
                    
                    if (pending && pending.waitingForManualInput) {
                        const timezone = this.parseTimezoneInput(msg.text);
                        if (timezone) {
                            await this.handleTimezoneSelection(chatId, timezone, pending.message_thread_id || "");
                        } else {
                            await this.bot.sendMessage(chatId, 
                                '❌ Не удалось распознать часовой пояс.\n\n' +
                                'Попробуйте еще раз:\n' +
                                '• +3 (для UTC+3)\n' +
                                '• -5 (для UTC-5)\n' +
                                '• 0 (для UTC±0)\n');
                        }
                    }
                }
            } catch (err) {
                console.error('Ошибка в message handler:', err);
            }
        });

        // Обработка ошибок бота
        this.bot.on('polling_error', (error) => {
            console.error('Polling error in SlaveBot:', error.message);
        });

        this.bot.on('webhook_error', (error) => {
            console.error('Webhook error in SlaveBot:', error.message);
        });

        this.bot.on('error', (error) => {
            console.error('General error in SlaveBot:', error.message);
        });
    }

    async checkAdminRights(chatId, userId) {
        try {
            // Для приватных чатов всегда разрешаем
            if (chatId > 0) return true;
            
            const chatMember = await this.bot.getChatMember(chatId, userId);
            return ['administrator', 'creator'].includes(chatMember.status);
        } catch (err) {
            console.error('Ошибка проверки прав:', err);
            return false;
        }
    }

    async startConfigProcess(chatId, chatTitle, messageThreadId = "") {
        try {
            // Проверяем, есть ли уже такой чат в конфиге
            const existing = this.findChatInConfig(chatId);
            
            // Получаем текущие настройки контента из существующего конфига
            let contentSettings = { Eg: true, News: true };
            if (existing && existing.Eg !== undefined) {
                contentSettings.Eg = existing.Eg;
            }
            if (existing && existing.News !== undefined) {
                contentSettings.News = existing.News;
            }
            
            // Сохраняем информацию о старом чате во временные данные
            this.pendingConfigs.set(chatId, {
                chatTitle,
                timestamp: Date.now(),
                waitingForManualInput: false,
                oldSettings: existing,
                message_thread_id: messageThreadId, // Сохраняем ID темы
                timezoneOffset: null,
                contentSettings: contentSettings,
                lastContentMessageId: null
            });

            // Проверяем тип чата
            let chatType = 'чата';
            try {
                const chat = await this.bot.getChat(chatId);
                if (chat.type === 'channel') chatType = 'канала';
                if (chat.type === 'supergroup') chatType = 'супергруппы';
            } catch (e) {}

            // Показываем клавиатуру с выбором таймзоны
            const keyboard = this.createTimezoneKeyboard();
            
            let message = `⚙️ *Настройка бота для ${chatType}:* "${this.escapeMarkdown(chatTitle)}"\n\n` +
                         `*Шаг 1/2: Выберите часовой пояс*\n` +
                         `(Публикации будут выходить в указанное время по вашему часовому поясу)`;
            
            // Добавляем информацию, если чат уже настроен
            if (existing) {
                const hours = Math.abs(existing.offset / 60);
                const sign = existing.offset >= 0 ? '+' : '-';
                message += `\n\n📋 *Текущие настройки:* UTC${sign}${hours} ч.`;
				//console.log('existing='+JSON.stringify(existing));
            }
            
            // Добавляем информацию о теме форума
            if (messageThreadId) {
                message += `\n📌 *Настройка для темы форума:* ID ${messageThreadId}`;
            }
            
            await this.bot.sendMessage(chatId, message,
                {
                    parse_mode: 'Markdown',
                    reply_markup: { inline_keyboard: keyboard },
                    message_thread_id: messageThreadId || undefined // Отправляем в той же теме
                }
            );

        } catch (err) {
            console.error('Ошибка startConfigProcess:', err);
            await this.bot.sendMessage(chatId, '❌ Произошла ошибка при настройке.');
        }
    }

    createTimezoneKeyboard() {
        // Только российские часовые пояса
        const russianTimezones = [
            { label: 'Калининград UTC+2', offset: 120 },
            { label: 'Москва UTC+3', offset: 180 },
            { label: 'Самара UTC+4', offset: 240 },
            { label: 'Екатеринбург UTC+5', offset: 300 },
            { label: 'Омск UTC+6', offset: 360 },
            { label: 'Красноярск UTC+7', offset: 420 },
            { label: 'Иркутск UTC+8', offset: 480 },
            { label: 'Якутск UTC+9', offset: 540 },
            { label: 'Владивосток UTC+10', offset: 600 },
            { label: 'Магадан UTC+11', offset: 660 },
            { label: 'Камчатка UTC+12', offset: 720 }
        ];

        // Создаем строки клавиатуры (по 2 кнопки в строке)
        const rows = [];
        
        for (let i = 0; i < russianTimezones.length; i += 2) {
            const row = [];
            if (russianTimezones[i]) {
                row.push({
                    text: russianTimezones[i].label,
                    callback_data: `timezone_${russianTimezones[i].offset}`
                });
            }
            if (russianTimezones[i + 1]) {
                row.push({
                    text: russianTimezones[i + 1].label,
                    callback_data: `timezone_${russianTimezones[i + 1].offset}`
                });
            }
            if (row.length > 0) rows.push(row);
        }

        // Кнопки действий
        rows.push([
            { text: '✏️ Другой пояс', callback_data: 'manual_timezone' },
            { text: '❌ Отмена', callback_data: 'cancel_config' }
        ]);

        return rows;
    }

    parseTimezoneInput(text) {
        text = text.trim();
        
        // Проверяем числовой формат (+3, -5, 0)
        const numMatch = text.match(/^([+-]?\d+(?:\.\d+)?)$/);
        if (numMatch) {
            const hours = parseFloat(numMatch[1]);
            if (hours >= -12 && hours <= 14) {
                return Math.round(hours * 60);
            }
        }
        
        return null;
    }

    async handleTimezoneSelection(chatId, timezoneOffset, messageThreadId = "") {
        try {
            const pending = this.pendingConfigs.get(chatId);
            if (!pending) {
                await this.bot.sendMessage(chatId, '❌ Сессия настройки истекла. Начните заново с /config');
                return;
            }

            // Проверяем timezoneOffset
            const offsetNum = parseInt(timezoneOffset, 10);
            if (isNaN(offsetNum)) {
                console.error('handleTimezoneSelection: Неверный формат timezoneOffset', timezoneOffset);
                await this.bot.sendMessage(chatId, '❌ Ошибка: неверный формат часового пояса');
                return;
            }
            
            // Проверяем диапазон часового пояса (от -12 до +14 часов в минутах)
            if (offsetNum < -720 || offsetNum > 840) { // -12*60 до +14*60 минут
                console.error('handleTimezoneSelection: Часовой пояс вне диапазона', offsetNum);
                await this.bot.sendMessage(chatId, '❌ Ошибка: часовой пояс вне допустимого диапазона (-12...+14 часов)');
                return;
            }

            // Обновляем временные данные
            this.pendingConfigs.set(chatId, {
                ...pending,
                timezoneOffset: offsetNum
            });

            // Показываем выбор типа контента
            await this.showContentSelection(chatId);

        } catch (err) {
            console.error('Ошибка handleTimezoneSelection:', err);
            await this.bot.sendMessage(chatId, '❌ Произошла ошибка при выборе часового пояса.');
        }
    }

    async showContentSelection(chatId) {
        try {
            const pending = this.pendingConfigs.get(chatId);
            if (!pending) {
                await this.bot.sendMessage(chatId, '❌ Сессия настройки истекла. Начните заново с /config');
                return;
            }

            const hours = Math.abs(pending.timezoneOffset / 60);
            const sign = pending.timezoneOffset >= 0 ? '+' : '-';
            
            // Получаем текущие настройки контента
            const contentSettings = pending.contentSettings || { Eg: true, News: true };
            
            // Создаем клавиатуру для выбора контента
            const keyboard = this.createContentKeyboard(contentSettings);
            
            const message = `⚙️ *Настройка бота для чата:* "${this.escapeMarkdown(pending.chatTitle)}"\n\n` +
                          `*Шаг 2/2: Выберите нужный контент*\n\n` +
                          `✅ - будет получать\n` +
                          `❌ - не будет получать\n\n`;// +
                          //`📋 *Выбран часовой пояс:* UTC${sign}${hours} ч.`;
            
            const sentMessage = await this.bot.sendMessage(chatId, message,
                {
                    parse_mode: 'Markdown',
                    reply_markup: { inline_keyboard: keyboard },
                    message_thread_id: pending.message_thread_id || undefined
                }
            );
            
            // Сохраняем ID сообщения с выбором контента
            this.pendingConfigs.set(chatId, {
                ...pending,
                lastContentMessageId: sentMessage.message_id
            });

        } catch (err) {
            console.error('Ошибка showContentSelection:', err);
            await this.bot.sendMessage(chatId, '❌ Произошла ошибка при настройке контента.');
        }
    }

    createContentKeyboard(contentSettings) {
        // Кнопки для выбора типов контента
        const rows = [
            [
                {
                    text: `${contentSettings.Eg ? '✅' : '❌'} Ежедневник`,
                    callback_data: 'content_Eg'
                },
                {
                    text: `${contentSettings.News ? '✅' : '❌'} Новости`,
                    callback_data: 'content_News'
                }
            ],
            [
                { text: '💾 Сохранить', callback_data: 'save_config' }
            ],
            [
                { text: '❌ Отмена', callback_data: 'cancel_config' }
            ]
        ];
        
        return rows;
    }

    async handleContentSelection(chatId, contentType) {
        try {
            const pending = this.pendingConfigs.get(chatId);
            if (!pending) {
                await this.bot.sendMessage(chatId, '❌ Сессия настройки истекла. Начните заново с /config');
                return;
            }

            // Переключаем состояние выбранного типа контента
            const contentSettings = pending.contentSettings || { Eg: true, News: true };
            
            if (contentType === 'Eg' || contentType === 'News') {
                contentSettings[contentType] = !contentSettings[contentType];
                
                // Обновляем временные данные
                this.pendingConfigs.set(chatId, {
                    ...pending,
                    contentSettings: contentSettings
                });
                
                // Обновляем сообщение с новой клавиатурой
                const hours = Math.abs(pending.timezoneOffset / 60);
                const sign = pending.timezoneOffset >= 0 ? '+' : '-';
                const keyboard = this.createContentKeyboard(contentSettings);
                
                const message = `⚙️ *Настройка бота для чата:* "${this.escapeMarkdown(pending.chatTitle)}"\n\n` +
                              `*Шаг 2/2: Выберите нужный контент*\n\n` +
                              `✅ - будет получать\n` +
                              `❌ - не будет получать\n\n`;// +
                              //`📋 *Выбран часовой пояс:* UTC${sign}${hours} ч.`;
                
                await this.bot.editMessageText(message, {
                    chat_id: chatId,
                    message_id: pending.lastContentMessageId,
                    parse_mode: 'Markdown',
                    reply_markup: { inline_keyboard: keyboard }
                });
                
            }

        } catch (err) {
            console.error('Ошибка handleContentSelection:', err);
            try {
                await this.bot.sendMessage(chatId, '❌ Произошла ошибка при выборе контента.');
            } catch (e) {}
        }
    }

    async finishConfig(chatId) {
        try {
            const pending = this.pendingConfigs.get(chatId);
            if (!pending) {
                await this.bot.sendMessage(chatId, '❌ Сессия настройки истекла. Начните заново с /config');
                return;
            }
			// Удаляем сообщение с выбором контента, если оно еще существует
            if (pending.lastContentMessageId) {
                try {
                    await this.bot.deleteMessage(chatId, pending.lastContentMessageId);
                } catch (e) {
                    // Игнорируем ошибки удаления
                }
            }

            // Проверяем, что часовой пояс выбран
            if (pending.timezoneOffset === null) {
                await this.bot.sendMessage(chatId, '❌ Ошибка: часовой пояс не выбран');
                return;
            }

            // Проверяем, что выбран хотя бы один тип контента
            const contentSettings = pending.contentSettings || { Eg: true, News: true };
            if (!contentSettings.Eg && !contentSettings.News) {
                await this.bot.sendMessage(chatId, 
                    '❌ Ошибка: должен быть выбран хотя бы один тип контента\n\n' +
                    'Выберите Ежедневник или Новости (или оба) и нажмите "Сохранить"');
                return;
            }

            const offsetNum = pending.timezoneOffset;
            
            // Форматируем смещение для ключа
            const offsetKey = offsetNum >= 0 ? `+${offsetNum}` : `${offsetNum}`;
            
            // Гарантируем, что chat_news существует и является объектом
            if (!this.chat_news || typeof this.chat_news !== 'object') {this.chat_news = {};}
            
            // Сохраняем текущее состояние массива для новой таймзоны (если есть)
            const currentArray = this.chat_news[offsetKey] && Array.isArray(this.chat_news[offsetKey]) 
                ? this.chat_news[offsetKey] 
                : [];

            // Удаляем чат из ВСЕХ старых таймзон (если он где-то был)
            // удаляем пустые таймзоны в этом вызове
            this.removeChatFromAllTimezones(chatId, true);
            
            // Восстанавливаем/создаем массив для новой таймзоны
            if (!this.chat_news[offsetKey] || !Array.isArray(this.chat_news[offsetKey])) {
                this.chat_news[offsetKey] = currentArray; // Восстанавливаем предыдущее состояние
            }

            // Создаем запись о чате в строгом формате
            const chatEntry = {};
            
            // Используем оригинальное название чата как ключ
            const chatTitle = pending.chatTitle || `chat_${chatId}`;
            
            // Добавляем ID чата
            chatEntry[chatTitle] = chatId.toString();
            
            // Добавляем message_thread_id
            chatEntry.message_thread_id = pending.message_thread_id || "";
            
            // Добавляем настройки контента
            chatEntry.Eg = Boolean(contentSettings.Eg);
            chatEntry.News = Boolean(contentSettings.News);
            
            // Проверяем, является ли чат форумом
            /*try {
                const chat = await this.bot.getChat(chatId);
                if (chat.type === 'supergroup' && chat.is_forum) {
                    // Логика для форумов
                }
            } catch (err) {
                console.error('Ошибка получения информации о чате:', err);
            }*/
            
            // Проверяем, нет ли дубликата в текущей таймзоне
            if (Array.isArray(this.chat_news[offsetKey])) {
                // Удаляем возможный дубликат (на случай если чат уже был в этой таймзоне)
                this.chat_news[offsetKey] = this.chat_news[offsetKey].filter(chat => {
                    for (const [key, value] of Object.entries(chat)) {
                        if (key !== 'message_thread_id' && key !== 'Eg' && key !== 'News' && 
                            (value.toString() === chatId.toString() || value === chatId)) {
                            return false; // Удаляем дубликат
                        }
                    }
                    return true; // Оставляем чат
                });
            } else {
                // Если по какой-то причине это не массив, создаем новый
                this.chat_news[offsetKey] = [];
            }
            
            // Добавляем запись в конфиг
            this.chat_news[offsetKey].push(chatEntry);
            
            // Сохраняем конфиг
            if (this.saveConfig('chat_configured', {
                chatId: chatId,
                chatTitle: chatTitle,
                timezone: offsetKey,
                threadId: chatEntry.message_thread_id,
                contentSettings: contentSettings,
                oldTimezone: pending.oldSettings ? pending.oldSettings.timezoneKey : null
            })) {
                const hours = Math.abs(offsetNum / 60);
                const sign = offsetNum >= 0 ? '+' : '-';
                
                let oldSettingsInfo = '';
                if (pending.oldSettings) {
                    const oldHours = Math.abs(pending.oldSettings.offset / 60);
                    const oldSign = pending.oldSettings.offset >= 0 ? '+' : '-';
                    oldSettingsInfo = `\n🔄 *Старый часовой пояс:* UTC${oldSign}${oldHours} ч.`;
                }
                
                let threadInfo = '';
                if (chatEntry.message_thread_id) {
                    threadInfo = `\n📌 *Тема форума:* ID ${chatEntry.message_thread_id}`;
                }
                
                // Формируем информацию о выбранных типах контента
                const contentTypes = [];
                if (contentSettings.Eg) contentTypes.push('📔 Ежедневник');
                if (contentSettings.News) contentTypes.push('🌐 Новости');
                const contentInfo = contentTypes.length > 0 ? contentTypes.join('\n') : '❌ Не выбрано';
                
                await this.bot.sendMessage(chatId,
                    `✅ *Настройка завершена!*\n\n` +
                    `📝 *Чат:* "${this.escapeMarkdown(chatTitle)}"\n` +
                    `🌍 *Часовой пояс:* UTC${sign}${hours} ч.\n` +
                    `*Получаем:*\n${contentInfo}` +
                    //oldSettingsInfo +
                    threadInfo,
                    { parse_mode: 'Markdown' }
                );
            } else {
                await this.bot.sendMessage(chatId, '❌ Ошибка сохранения конфигурации.');
            }

            // Очищаем временные данные
            this.pendingConfigs.delete(chatId);

        } catch (err) {
            console.error('Ошибка finishConfig:', err);
            await this.bot.sendMessage(chatId, '❌ Произошла ошибка при сохранении настроек.');
        }
    }

    findChatInConfig(chatId) {
        if (!this.chat_news || typeof this.chat_news !== 'object') {
            return null;
        }
        
        for (const [timezoneKey, chats] of Object.entries(this.chat_news)) {
            if (!Array.isArray(chats)) {
                continue;
            }
            
            for (const chat of chats) {
                // Ищем chatId среди значений объекта (исключая message_thread_id)
                for (const [key, value] of Object.entries(chat)) {
                    if (key !== 'message_thread_id' && key !== 'Eg' && key !== 'News' && 
                        (value.toString() === chatId.toString() || value === chatId)) {
                        return {
                            title: key,  // ← Используем ключ как название чата
                            offset: parseInt(timezoneKey, 10),
                            timezoneKey,
                            Eg: chat.Eg !== undefined ? chat.Eg : false,
                            News: chat.News !== undefined ? chat.News : false
                        };
                    }
                }
            }
        }
        return null;
    }

    async getChatInfo(chatId) {
        const existing = this.findChatInConfig(chatId);
        
        if (!existing) {
            return `❌ Этот чат не настроен для рассылки.\nИспользуйте /config для настройки.`;
        }
        
        const hours = Math.abs(existing.offset / 60);
        const sign = existing.offset >= 0 ? '+' : '-';
        
        // Формируем информацию о типах контента
		const contentTypes = [];
		if (existing.Eg) contentTypes.push('📔 Ежедневник');
		if (existing.News) contentTypes.push('🌐 Новости');
		let contentText;
        if (contentTypes.length > 0) {
            contentText = contentTypes.join('\n');
        } else {
            contentText = '❌ Не выбрано';
        }
        
        return `⚙️ *Настройки бота:*\n\n` +
               `📝 *Чат:* "${this.escapeMarkdown(existing.title)}"\n` +
               `🌍 *Часовой пояс:* UTC${sign}${hours} ч.\n\n` +
               `*Получает:*\n${contentText}\n\n` +
               `ℹ️ *Команды:*\n` +
               `/config - перенастроить чат`;
    }

    async removeChatFromConfig(chatId, showConfirm = true) {
        try {
            //console.log(`Удаление чата ${chatId} из конфига, showConfirm=${showConfirm}`);
            
            // Сначала пытаемся найти чат в конфиге
            const existing = this.findChatInConfig(chatId);
            
            if (!existing) {
                //console.log(`Чат ${chatId} не найден в конфиге`);
                if (showConfirm) {
                    await this.bot.sendMessage(chatId, 
                        '❌ Этот чат не найден в настройках рассылки.'
                    );
                }
                return false;
            }

            // Удаляем без подтверждения
            //console.log(`Начинаем удаление чата ${chatId} из всех таймзон`);
            const removed = this.removeChatFromAllTimezones(chatId, true);
            
            if (removed) {
                // Пытаемся отправить сообщение (если бот еще в чате)
                try {
                    await this.bot.sendMessage(chatId, 
                        `✅ Чат "${existing.title}" удален из рассылки публикаций.`
                    );
                } catch (err) {
                    // Игнорируем ошибку, бот уже удален
                }
            }
            
            return removed;

        } catch (err) {
            console.error('Ошибка removeChatFromConfig:', err);
            if (showConfirm) {
                try {
                    await this.bot.sendMessage(chatId, '❌ Ошибка при удалении чата.');
                } catch (e) {
                    // Игнорируем, бот может быть уже удален
                }
            }
            return false;
        }
    }

    removeChatFromAllTimezones(chatId, cleanupEmpty = true) {
        let removed = false;
        
        if (!this.chat_news || typeof this.chat_news !== 'object') {
            this.chat_news = {};
            return false;
        }
        
        for (const [timezoneKey, chats] of Object.entries(this.chat_news)) {
            if (!Array.isArray(chats)) {
                continue;
            }
            
            const initialLength = chats.length;
            this.chat_news[timezoneKey] = chats.filter(chat => {
                // Ищем chatId среди значений объекта (исключая message_thread_id)
                for (const [key, value] of Object.entries(chat)) {
                    if (key !== 'message_thread_id' && key !== 'Eg' && key !== 'News' && 
                        (value.toString() === chatId.toString() || value === chatId)) {
                        return false; // ← Удаляем этот чат
                    }
                }
                return true; // ← Оставляем этот чат
            });
            
            if (this.chat_news[timezoneKey].length !== initialLength) {
                removed = true;
            }
            
            // Удаляем пустые таймзоны только если cleanupEmpty = true
            if (cleanupEmpty && this.chat_news[timezoneKey].length === 0) {
                delete this.chat_news[timezoneKey];
				removed = true;
            }
        }
        
        if (removed) {
            this.saveConfig('chat_removed', {
                chatId: chatId,
                removedFromTimezones: true
            });
        }
		
		return removed;
    }

    setupCleanupTimer() {
        // Очистка старых pending конфигураций каждые 10 минут
        this.cleanupTimer = setInterval(() => {
            const now = Date.now();
            const timeout = 30 * 60 * 1000; // 30 минут
            
            for (const [chatId, data] of this.pendingConfigs.entries()) {
                if (now - data.timestamp > timeout) {
                    this.pendingConfigs.delete(chatId);
                    console.log(`Очищена устаревшая сессия для чата ${chatId}`);
                }
            }
            
            // Раз в сутки проверяем существование чатов
            if (Math.random() < 0.1) { // ~10% вероятность при каждом запуске
                this.cleanupDeadChats();
            }
        }, 10 * 60 * 1000);
    }
	
	async cleanupDeadChats() {
        try {
            console.log('Начинаем очистку несуществующих чатов...');
            let cleaned = 0;
            
            if (!this.chat_news || typeof this.chat_news !== 'object') {
                return;
            }
            
            for (const [timezoneKey, chats] of Object.entries(this.chat_news)) {
                if (!Array.isArray(chats)) {
                    continue;
                }
                
                const validChats = [];
                for (const chat of chats) {
                    let chatId = null;
                    // Ищем chatId в объекте
                    for (const [key, value] of Object.entries(chat)) {
                        if (key !== 'message_thread_id' && key !== 'Eg' && key !== 'News') {
                            chatId = value;
                            break;
                        }
                    }
                    
                    if (!chatId) {
                        continue;
                    }
                    
                    // Проверяем, существует ли чат и бот в нем
                    try {
                        const chatInfo = await this.bot.getChat(chatId);
                        // Если дошли сюда - чат существует и бот в нем
                        validChats.push(chat);
                    } catch (err) {
                        // Ошибка означает что чат не существует или бот не в нем
                        console.log(`Чат ${chatId} не существует или бот удален, удаляем из конфига`);
                        cleaned++;
                    }
                }
                
                // Обновляем массив чатов
                this.chat_news[timezoneKey] = validChats;
                
                // Удаляем пустые таймзоны
                if (this.chat_news[timezoneKey].length === 0) {
                    delete this.chat_news[timezoneKey];
                }
            }
            
            if (cleaned > 0) {
                this.saveConfig('cleanup_completed', {
                    cleanedCount: cleaned,
                    timestamp: Date.now()
                });
				console.log(`Очистка завершена: удалено ${cleaned} несуществующих чатов`);
            }
			else console.log('Очистка завершена');
            
        } catch (err) {
            console.error('Ошибка при очистке несуществующих чатов:', err);
        }
    }

    stop() {
        return new Promise((resolve) => {
            try {
                if (this.bot) {
                    this.bot.stopPolling();
                    console.log('SlaveBot остановлен');
                }
                
                // Очищаем таймер очистки сессий
                if (this.cleanupTimer) {
                    clearInterval(this.cleanupTimer);
                    this.cleanupTimer = null;
                }
                
                // Очищаем pending конфигурации
                this.pendingConfigs.clear();
                
            } catch (err) {
                console.error('Ошибка остановки SlaveBot:', err);
            }
            resolve();
        });
    }

    getCurrentConfig() {
        // Возвращаем текущее состояние объекта
        return this.chat_news;
    }
	
	escapeMarkdown(text) {
        if (typeof text !== 'string') return text;
        return text.replace(/([_*[\]()~`>#+\-=|{}.!])/g, '\\$1');
    }
}

module.exports = SlaveBot;
