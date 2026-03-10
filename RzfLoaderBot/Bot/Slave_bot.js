const TelegramBot = require('node-telegram-bot-api');
const moment = require('moment-timezone');

class SlaveBot {
    constructor(token, onConfigUpdate, mainChatNewsRef, mainArea, needTown) {
        this.bot = new TelegramBot(token, { polling: true });
        this.onConfigUpdate = onConfigUpdate; // Колбэк для обновления конфига
        this.pendingConfigs = new Map(); // chatId -> временные данные конфигурации
        this.pendingChannelSetup = null; // Для настройки каналов через приватный чат
        this.cleanupTimer = null; // Для очистки таймера при остановке
		this.botName = null;//имя бота
		this.botUsername = null;//имя бота
		this.last502ErrorTime = 0;
        
        // Используем ссылку на объект из основного кода
        this.chat_news = mainChatNewsRef || {};
		
		// Название местности для приветствия
		this.area = mainArea || '';
		
		// Использовать ли настройку города
		this.needTown = needTown || false;
		
		this.initbotname();
        
        this.setupHandlers();
        this.setupCleanupTimer();
        this.setupPrivateChatHandlers(); // Добавляем обработчики для приватного чата
		
		this.requests = new Map();  // { requestId: { resolve, reject } }
        this.requestId = 0;
        
        console.log('SlaveBot запущен');
    }
	
	// Отправляем команду и ждем ответ
    async sendCommand(command, data = {}) {
        const id = ++this.requestId;
        
        return new Promise((resolve, reject) => {
            this.requests.set(id, { resolve, reject });
            
            // Отправляем через saveConfig
            this.saveConfig(command, {
                requestId: id,
                data: data
            });
            
            // Таймаут
            setTimeout(() => {
                if (this.requests.has(id)) {
                    this.requests.delete(id);
                    reject(new Error('Таймаут: мастер не ответил'));
                }
            }, 5000);
        });
    }
	
	// Мастер вызывает этот метод с ответом
    onMasterResponse(response) {
        const { requestId, result, error } = response;
        const request = this.requests.get(requestId);
        
        if (request) {
            this.requests.delete(requestId);
            if (error) {
                request.reject(new Error(error));
            } else {
                request.resolve(result);
            }
        }
    }

    async initbotname() {
			try {
				const botInfo = await this.bot.getMe();
				this.botName = botInfo.first_name || '';
				this.botUsername = botInfo.username || '';
				console.log(`Имя бота установлено: ${this.botName}`);
			} catch (err) {
				this.sendErrorMessage('Ошибка получения имени бота: ' + err);
			}
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
        this.bot.onText(/^\/config(?:@(\w+))?$/, async (msg, match) => {
            try {
                const chatId = msg.chat.id;
                const chatTitle = msg.chat.title || msg.chat.username || `Чат ${chatId}`;
                const fromId = msg.from.id;
				const mentionedBot = match[1];
				
				// Проверяем, нам ли адресована команда
				if (mentionedBot && mentionedBot !== this.botUsername) {return;}
                
                // Проверяем права
                const messageId = msg.message_id;
                if (chatId < 0) { // Только для групп/каналов (отрицательные ID)
                    if (!await this.checkAdminRights(chatId, fromId)) {
                        try { // Удаляем сообщение с командой
                            await this.bot.deleteMessage(chatId, messageId);
                        } catch (e) {} // Игнорируем, если нет прав на удаление
                        return;
                    }
                }
                
                // Сохраняем message_thread_id, если он есть (для форумов)
                const messageThreadId = msg.message_thread_id || "";
                
                await this.startConfigProcess(chatId, chatTitle, messageThreadId);
            } catch (err) {
                this.sendErrorMessage('Ошибка в /config: ' + err);
            }
        });
        
        // Команда /start
        this.bot.onText(/^\/start(?: (.+))?$/, async (msg, match) => {
            try {
                const chatId = msg.chat.id;
                const fromId = msg.from.id;
                const params = match[1]; // Параметры после /start
                const chatTitle = msg.chat.title || msg.chat.username || `Чат ${chatId}`;
				
                // Проверяем права
                const messageId = msg.message_id;
                if (chatId < 0) { // Только для групп/каналов (отрицательные ID)
                    if (!await this.checkAdminRights(chatId, fromId)) {
                        try { // Удаляем сообщение с командой
                            await this.bot.deleteMessage(chatId, messageId);
                        } catch (e) {} // Игнорируем, если нет прав на удаление
                        return;
                    }
                }
                
                // Задержка 1000мс прямо здесь
				await new Promise(resolve => setTimeout(resolve, 1000));
				
				// Проверяем тип чата
                let chatType;
                try {
                    const chat = await this.bot.getChat(chatId);
                    chatType = chat.type;
                } catch (e) {
                    chatType = 'unknown';
                }
                
                // Обработка глубокой ссылки для каналов
                if (chatId > 0 && params === 'channel_setup') {
                    await this.showChannelSelection(fromId);
                    return;
                }
                
                // Для каналов отправляем инструкцию
                if (chatType === 'channel') {
                    if(!this.botUsername) await this.initbotname();
                    
                    await this.bot.sendMessage(chatId,
                        `📢 <b>Настройка бота для канала</b>\n\n` +
                        `<b>Для настройки канала:</b>\n` +
                        `1. Перейдите в приватный чат с ботом @${this.botUsername}\n` +
                        `2. Используйте команду /config_channel\n` +
                        `3. Выберите этот канал из списка\n\n` +
                        `<b>Только администраторы канала могут выполнить настройку.</b>`,
                        { 
                            parse_mode: 'HTML',
                            message_thread_id: msg.message_thread_id || undefined
                        }
                    );
                    return;
                }
                
                // Для приватных чатов отправляем помощь
                if (chatId > 0) {
					await this.showPrivateChatHelp(fromId);
                    return;
                }
                
                const messageThreadId = msg.message_thread_id || "";
                await this.startConfigProcess(chatId, chatTitle, messageThreadId);
            } catch (err) {
                this.sendErrorMessage('Ошибка в /start: ' + err);
            }
        });

        // Команда /info - информация о настройках
        this.bot.onText(/^\/info(?:@(\w+))?$/, async (msg, match) => {
            try {
                const chatId = msg.chat.id;
                const chatTitle = msg.chat.title || msg.chat.username || `Чат ${chatId}`;
                const fromId = msg.from.id;
				const mentionedBot = match[1];
				
				// Проверяем, нам ли адресована команда
				if (mentionedBot && mentionedBot !== this.botUsername) {return;}
                
                // Проверяем права
                const messageId = msg.message_id;
                if (chatId < 0) { // Только для групп/каналов (отрицательные ID)
                    if (!await this.checkAdminRights(chatId, fromId)) {
                        try { // Удаляем сообщение с командой
                            await this.bot.deleteMessage(chatId, messageId);
                        } catch (e) {} // Игнорируем, если нет прав на удаление
                        return;
                    }
                }
                
                const info = await this.getChatInfo(chatId);
                await this.bot.sendMessage(chatId, info, 
                    {
                        parse_mode: 'HTML',
                        message_thread_id: msg.message_thread_id || undefined
                    }
                );
            } catch (err) {
                this.sendErrorMessage('Ошибка в /info: ' + err);
            }
        });

        // Команда /help
        this.bot.onText(/^\/help(?:@(\w+))?$/, async (msg, match) => {
            try {
                const chatId = msg.chat.id;
                const fromId = msg.from.id;
				const mentionedBot = match[1];
				
				// Проверяем, нам ли адресована команда
				if (mentionedBot && mentionedBot !== this.botUsername) {return;}
                
                // Проверяем права
                const messageId = msg.message_id;
                if (chatId < 0) { // Только для групп/каналов (отрицательные ID)
                    if (!await this.checkAdminRights(chatId, fromId)) {
                        try { // Удаляем сообщение с командой
                            await this.bot.deleteMessage(chatId, messageId);
                        } catch (e) {} // Игнорируем, если нет прав на удаление
                        return;
                    }
                }
                
                // Определяем тип чата
                let chatType;
                try {
                    const chat = await this.bot.getChat(chatId);
                    chatType = chat.type;
                } catch (e) {
                    chatType = 'unknown';
                }
                
                let helpText = `<b>🤖 Команды бота:</b>\n\n`;
                
                if (chatType === 'channel') {
                    helpText += `<b>📢 Для каналов:</b>\n` +
                               `/start - показать инструкцию по настройке\n\n` +
                               `<b>Как настроить:</b>\n` +
                               `1. Перейдите в приватный чат с ботом\n` +
                               `2. Используйте /config_channel\n` +
                               `3. Выберите этот канал\n\n`;
                } else if (chatType === 'group' || chatType === 'supergroup') {
                    helpText += `👥 <b>Для групп:</b>\n` +
                               `/config - настроить бота\n` +
                               `/info - показать текущие настройки\n\n`;
                } else {
                    helpText += `👤 <b>В приватном чате:</b>\n` +
                               `/start - показать инструкцию по настройке\n` +
							   `/config - настроить бота\n` +
                               `/info - показать текущие настройки\n\n` +
							   `<b>📢 Для каналов:</b>\n` +
                               `/start - показать инструкцию по настройке\n` +
                               `<b>Как настроить на канал:</b>\n` +
                               `1. Перейдите в приватный чат с ботом\n` +
                               `2. Используйте /config_channel\n`;
                }
                
                await this.bot.sendMessage(chatId, helpText, 
                    { 
                        parse_mode: 'HTML',
                        message_thread_id: msg.message_thread_id || undefined
                    }
                );
            } catch (err) {
                this.sendErrorMessage('Ошибка в /help: ' + err);
            }
        });

        // Удаление бота из чата/канала
        this.bot.on('left_chat_member', async (msg) => {
            try {
                const botId = this.bot.token.split(':')[0];
                if (msg.left_chat_member && msg.left_chat_member.id.toString() === botId) {
                    const chatId = msg.chat.id;
                    await this.removeChatFromConfig(chatId, false);
                }
            } catch (err) {
                this.sendErrorMessage('Ошибка в left_chat_member: ' + err);
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
                    await this.removeChatFromConfig(chatId, false);
                }
                
                // Бота добавили в чат
                if ((oldStatus === 'left' || oldStatus === 'kicked') && 
                    (newStatus === 'member' || newStatus === 'administrator')) {
                    
                    setTimeout(async () => {
                        try {
                            // Проверяем тип чата
							let chatType;
							try {
								const chat = await this.bot.getChat(chatId);
								chatType = chat.type;
							} catch (e) {
								chatType = 'unknown';
							}
							
							if (chatType === 'channel') {
                                // Для каналов отправляем специальное сообщение
                                if(!this.botUsername) await this.initbotname();
                                
                                await this.bot.sendMessage(chatId,
                                    `📢 <b>Настройка бота для канала</b>\n\n` +
                                    `<b>Для настройки канала:</b>\n` +
                                    `1. Перейдите в приватный чат с ботом @${this.botUsername}\n` +
                                    `2. Используйте команду /config_channel\n` +
                                    `3. Выберите этот канал из списка\n\n` +
                                    `<b>Только администраторы канала могут выполнить настройку.</b>`,
                                    { 
                                        parse_mode: 'HTML',
                                        message_thread_id: msg.message_thread_id || undefined
                                    }
                                );
                            } else if (chatType === 'private') {
                                // Для приватных чатов (личных сообщений)
								//await this.showPrivateChatHelp(chatId);//help уже послан из кнопки Start
                            } else {
                                if(!this.botName) await this.initbotname();
								// Для групп и супергрупп
                                await this.bot.sendMessage(chatId,
                                    `👋 <b>Привет! Я бот "${this.botName}".</b>\n\n` +
                                    `Чтобы настроить рассылку в этот чат, используйте команду\n` +
                                    `/config\n` +
									`в нужной теме.\n` +
									`На время настройки отключите анонимность админа.\n` +
									`<b>Только администраторы чата могут выполнить настройку.</b>`,
                                    { 
                                        parse_mode: 'HTML',
                                        message_thread_id: msg.message_thread_id || undefined
                                    }
                                );
                            }
                        } catch (err) {
                            // Игнорируем ошибки, возможно бот не имеет прав
                        }
                    }, 1500);
                }
            } catch (err) {
                this.sendErrorMessage('Ошибка в my_chat_member: ' + err);
            }
        });

        // Обработка нажатий на кнопки
        this.bot.on('callback_query', async (msg) => {
            try {
                const chatId = msg.message.chat.id;
                const data = msg.data;
                const fromId = msg.from.id;
                
                // Проверяем права для callback
                if (chatId < 0) { // Только для групп/каналов (отрицательные ID)
                    if (!await this.checkAdminRights(chatId, fromId)) {
                        await this.bot.answerCallbackQuery(msg.id); // Пустой ответ
                        return;
                    }
                }
                
                if (data.startsWith('timezone_')) {
                    const timezone = data.replace('timezone_', '');
                    const messageThreadId = msg.message.message_thread_id || "";
                    
                    // Удаляем сообщение с кнопками (текущее активное сообщение)
                    try {
                        await this.bot.deleteMessage(chatId, msg.message.message_id);
                    } catch (e) {
                        // Игнорируем ошибки удаления
                    }
                    
                    await this.handleTimezoneSelection(chatId, timezone, messageThreadId);
                    await this.bot.answerCallbackQuery(msg.id);
                    
                } else if (data === 'manual_timezone') {
                    const pending = this.pendingConfigs.get(chatId);
                    if (pending) {
                        // Удаляем текущее активное сообщение
                        if (pending.lastMessageId) {
                            try {
                                await this.bot.deleteMessage(chatId, pending.lastMessageId);
                            } catch (e) {
                                // Игнорируем ошибки удаления
                            }
                        }
                        
                        pending.waitingForManualInput = true;
                        this.pendingConfigs.set(chatId, pending);
                    }
                    
                    // Отправляем новое сообщение
                    const sentMessage = await this.bot.sendMessage(chatId,
                        `<b>Отправьте смещение часового пояса в формате:</b>\n` +
                        `• +3 (для UTC+3)\n` +
                        `• -5 (для UTC-5)\n` +
                        `• 0 (для UTC±0)\n`,
                        {
                            parse_mode: 'HTML',
                            reply_markup: { inline_keyboard: [[
                                { text: 'Отмена', callback_data: 'cancel_config' }
                            ]]},
                            message_thread_id: msg.message.message_thread_id || undefined
                        }
                    );
                    
                    // Сохраняем ID нового активного сообщения
                    if (pending) {
                        pending.lastMessageId = sentMessage.message_id;
                        this.pendingConfigs.set(chatId, pending);
                    }
                    
                    await this.bot.answerCallbackQuery(msg.id);
                    
                } else if (data === 'cancel_config') {
                    const pending = this.pendingConfigs.get(chatId);
                    
                    if (pending) {
						if (pending.waitingForTownInput) pending.waitingForTownInput = 0;
						if (pending.waitingForManualInput) pending.waitingForManualInput = false;
					}
					// Удаляем текущее активное сообщение
                    if (pending && pending.lastMessageId) {
                        try {
                            await this.bot.deleteMessage(chatId, pending.lastMessageId);
                        } catch (e) {
                            // Игнорируем ошибки удаления
                        }
                    }
                    
                    // Удаляем сообщение с выбором контента, если есть
                    if (pending && pending.lastContentMessageId) {
                        try {
                            await this.bot.deleteMessage(chatId, pending.lastContentMessageId);
                        } catch (e) {
                            // Игнорируем ошибки удаления
                        }
                    }
                    
                    this.pendingConfigs.delete(chatId);
                    
                    // Удаляем текущее сообщение с кнопками
                    try {
                        await this.bot.deleteMessage(chatId, msg.message.message_id);
                    } catch (e) {}
                    
                    await this.bot.sendMessage(chatId, '⚙️ Настройка отменена.', {
                        message_thread_id: pending ? pending.message_thread_id || undefined : undefined
                    });
                    await this.bot.answerCallbackQuery(msg.id);
                    
                } else if (data.startsWith('content_')) {
                    // Обработка выбора типа контента
                    const contentType = data.replace('content_', '');
                    
                    await this.handleContentSelection(chatId, contentType);
                    await this.bot.answerCallbackQuery(msg.id);
                    
                } else if (data === 'save_config') {
                    // Удаляем сообщение с выбором контента
                    const pending = this.pendingConfigs.get(chatId);
                    if (pending && pending.lastContentMessageId) {
                        try {
                            await this.bot.deleteMessage(chatId, pending.lastContentMessageId);
                        } catch (e) {
                            // Игнорируем ошибки удаления
                        }
                    }
                    
                    // Проверяем, нужно ли спрашивать город
					if (this.needTown && pending && pending.contentSettings && pending.contentSettings.Raspis) {
						await this.getTownSlug(chatId);// Запускаем процесс запроса города
					}
					else await this.finishConfig(chatId);// Сохраняем конфигурацию без города
                    await this.bot.answerCallbackQuery(msg.id);
                    
                } else if (data === 'channel_by_id') {
                    const userId = msg.from.id;
                    
                    // Удаляем текущее активное сообщение
                    const pending = this.pendingConfigs.get(userId);
                    if (pending && pending.lastMessageId) {
                        try {
                            await this.bot.deleteMessage(userId, pending.lastMessageId);
                        } catch (e) {}
                    }
                    
                    await this.requestChannelId(userId);
                    await this.bot.answerCallbackQuery(msg.id);
                    
                } else if (data === 'channel_help') {
                    const userId = msg.from.id;
                    
                    // Удаляем текущее активное сообщение
                    const pending = this.pendingConfigs.get(userId);
                    if (pending && pending.lastMessageId) {
                        try {
                            await this.bot.deleteMessage(userId, pending.lastMessageId);
                        } catch (e) {}
                    }
                    
                    await this.showChannelHelp(userId);
                    await this.bot.answerCallbackQuery(msg.id);
                    
                } else if (data.startsWith('edit_channel_')) {
                    const channelId = data.replace('edit_channel_', '');
                    const userId = msg.from.id;
                    
                    // Удаляем текущее активное сообщение
                    const pending = this.pendingConfigs.get(userId);
                    if (pending && pending.lastMessageId) {
                        try {
                            await this.bot.deleteMessage(userId, pending.lastMessageId);
                        } catch (e) {}
                    }
                    
                    // Получаем информацию о канале
                    let channelTitle = `Канал ${channelId}`;
                    try {
                        const chat = await this.bot.getChat(channelId);
                        channelTitle = chat.title;
                    } catch (err) {
                        console.error('Ошибка получения информации о канале:', err);
                    }
                    
                    // Начинаем процесс редактирования
                    await this.startChannelEdit(userId, channelId, channelTitle);
                    await this.bot.answerCallbackQuery(msg.id);
                    
                } else if (data.startsWith('remove_channel_')) {
                    const channelId = data.replace('remove_channel_', '');
                    const userId = msg.from.id;
                    
                    // Удаляем текущее активное сообщение
                    const pending = this.pendingConfigs.get(userId);
                    if (pending && pending.lastMessageId) {
                        try {
                            await this.bot.deleteMessage(userId, pending.lastMessageId);
                        } catch (e) {}
                    }
                    
                    await this.removeChannelFromConfig(userId, channelId);
                    await this.bot.answerCallbackQuery(msg.id);
                    
                } else if (data.startsWith('confirm_remove_channel_')) {
                    const channelId = data.replace('confirm_remove_channel_', '');
                    const userId = msg.from.id;
                    
                    // Удаляем текущее активное сообщение
                    const pending = this.pendingConfigs.get(userId);
                    if (pending && pending.lastMessageId) {
                        try {
                            await this.bot.deleteMessage(userId, pending.lastMessageId);
                        } catch (e) {}
                    }
                    
                    // Удаляем канал из конфига
                    const removed = this.removeChatFromAllTimezones(channelId, true);
                    
                    if (removed) {
                        await this.bot.sendMessage(userId,
                            `✅ <b>Канал успешно удален из рассылки.</b>\n\n` +
                            `Чтобы снова добавить канал, используйте /config_channel`,
							{ parse_mode: 'HTML' }
                        );
                    } else {
                        await this.bot.sendMessage(userId,
                            `❌ <b>Не удалось удалить канал.</b>\n` +
                            `Возможно, он уже был удален ранее.`,
							{ parse_mode: 'HTML' }
                        );
                    }
                    
                    await this.bot.answerCallbackQuery(msg.id);
                    
                } else if (data === 'cancel_remove_channel') {
                    const userId = msg.from.id;
                    
                    // Удаляем текущее активное сообщение
                    const pending = this.pendingConfigs.get(userId);
                    if (pending && pending.lastMessageId) {
                        try {
                            await this.bot.deleteMessage(userId, pending.lastMessageId);
                        } catch (e) {}
                    }
                    
                    await this.bot.sendMessage(userId, '⚙️ Удаление отменено.');
                    await this.bot.answerCallbackQuery(msg.id);
                    
                } else if (data === 'cancel_channel_setup') {
                    const userId = msg.from.id;
                    
                    // Удаляем текущее активное сообщение
                    const pending = this.pendingConfigs.get(userId);
                    if (pending && pending.lastMessageId) {
                        try {
                            await this.bot.deleteMessage(userId, pending.lastMessageId);
                        } catch (e) {}
                    }
                    
                    // Удаляем сообщение с выбором контента, если есть
                    if (pending && pending.lastContentMessageId) {
                        try {
                            await this.bot.deleteMessage(userId, pending.lastContentMessageId);
                        } catch (e) {}
                    }
                    
                    this.pendingChannelSetup = null;
                    // Удаляем pending конфиг для этого пользователя
                    this.pendingConfigs.delete(userId);
                    
                    await this.bot.sendMessage(userId, '⚙️ Настройка канала отменена.');
                    await this.bot.answerCallbackQuery(msg.id);
                    
                } else if (data === 'back_to_channel_select') {
                    const userId = msg.from.id;
                    
                    // Удаляем текущее активное сообщение
                    const pending = this.pendingConfigs.get(userId);
                    if (pending && pending.lastMessageId) {
                        try {
                            await this.bot.deleteMessage(userId, pending.lastMessageId);
                        } catch (e) {}
                    }
                    
                    await this.showChannelSelection(userId);
                    await this.bot.answerCallbackQuery(msg.id);
                }
                
            } catch (err) {
                this.sendErrorMessage('Ошибка в callback_query: ' + err);
                try {
                    await this.bot.answerCallbackQuery(msg.id, {
                        text: '❌ Произошла ошибка',
                        show_alert: true
                    });
                } catch (e) {}
            }
        });

        // Ответ на ручной ввод часового пояса и данных канала
        this.bot.on('message', async (msg) => {
            //try {
                const text = msg.text;
                if (!text || text.startsWith('/')) return;
                
                const chatId = msg.chat.id;
                const userId = msg.from.id;
                
                // Обработка обычных настроек (для чатов)
                const pending = this.pendingConfigs.get(chatId);
                if (pending && pending.waitingForManualInput) 
				{
                    const timezone = this.parseTimezoneInput(text);
                    if (timezone) {
                        // Удаляем текущее активное сообщение
                        if (pending.lastMessageId) {
                            try {await this.bot.deleteMessage(chatId, pending.lastMessageId);} catch (e) {}
                        }
                        
                        await this.handleTimezoneSelection(chatId, timezone, pending.message_thread_id || "");
                    } else {
                        const sentMessage = await this.bot.sendMessage(chatId, 
                            '❌ <b>Не удалось распознать часовой пояс.</b>\n\n' +
                            `<b>Попробуйте еще раз:</b>\n` +
                            `• +3 (для UTC+3)\n` +
                            `• -5 (для UTC-5)\n` +
                            `• 0 (для UTC±0)\n`,
                            { 
                                parse_mode: 'HTML',
                                message_thread_id: pending.message_thread_id || undefined
                            }
                        );
                        
                        // Обновляем ID активного сообщения
                        pending.lastMessageId = sentMessage.message_id;
                        this.pendingConfigs.set(chatId, pending);
                    }
                }
				
				// Обработка ввода города
				else if (pending && pending.waitingForTownInput===1) 
				{
					const townName = text.trim();
					// Удаляем текущее сообщение с приглашением
					if (pending.lastMessageId) {
						try {await this.bot.deleteMessage(chatId, pending.lastMessageId);} catch (e) {}
					}
					if (townName.length < 3) {
						const sentMessage = await this.bot.sendMessage(chatId,
							`⚠️ <b>Слишком короткое название.</b>\n\n` +
							`Введите минимум 3 символа.\n` +
							`(вы ввели: "${townName}")`,
							{
								parse_mode: 'HTML',
								reply_markup: {
									inline_keyboard: [[
										{ text: '❌ Отмена', callback_data: 'cancel_config' }
									]]
								},
								message_thread_id: pending.message_thread_id || undefined
							}
						);
						pending.lastMessageId = sentMessage.message_id;
						this.pendingConfigs.set(chatId, pending);
						return;
					}
					
					if (!townName) {
						const sentMessage = await this.bot.sendMessage(chatId,
							'❌ <b>Название города не может быть пустым.</b>\n\n' +
							'Пожалуйста, введите название города:',
							{
								parse_mode: 'HTML',
								reply_markup: {
									inline_keyboard: [[
										{ text: '❌ Отмена', callback_data: 'cancel_config' }
									]]
								},
								message_thread_id: pending.message_thread_id || undefined
							}
						);
						
						pending.lastMessageId = sentMessage.message_id;
						this.pendingConfigs.set(chatId, pending);
						return;
					}
					// Отправляем запрос Мастеру и ждем ответ
					try {
						
						const result = await this.sendCommand('find_town', { name: townName });
						
						if (!result || result.length === 0) {throw new Error('Город не найден');}
						if (result.length > 5) {
							const sentMessage = await this.bot.sendMessage(chatId,
								`⚠️ <b>Слишком много городов (${result.length}).</b>\n\n` +
								`Уточните название (минимум 3 символа).`,
								{
									parse_mode: 'HTML',
									reply_markup: {
										inline_keyboard: [[
											{ text: '❌ Отмена', callback_data: 'cancel_config' }
										]]
									}
								}
							);
							pending.lastMessageId = sentMessage.message_id;
							this.pendingConfigs.set(chatId, pending);
							return;
						}
						
						if (result.length === 1) {
							// Сохраняем город в сессию
							pending.townData = {
								name: result[0].town,
								slug: result[0].slug
							};
							pending.waitingForTownInput = 0; // очищаем флаг
								
							// Завершаем конфигурацию
							await this.finishConfig(chatId);
							this.pendingConfigs.set(chatId, pending);
							return;
						}
						//если городов несколько
						const citiesList = result.map(item => `<code>${item.town}</code>`).join('\n');
						// Отправляем список для выбора
						const listMessage = await this.bot.sendMessage(chatId,
							`🔍 <b>Найдено несколько городов:</b>\n\n` +
							`${citiesList}\n\n` +
							`📋 <b>Скопируйте один нужный город и пришлите его сюда.</b>\n` +
							`(просто тапните по названию и вставьте)`,
							{
								parse_mode: 'HTML',
								reply_markup: {
									inline_keyboard: [[
										{ text: '❌ Отмена', callback_data: 'cancel_config' }
									]]
								}
							}
						);
					    pending.lastMessageId = listMessage.message_id;
						this.pendingConfigs.set(chatId, pending);
						
					} catch (error) {
						// Ошибка от Мастера или таймаут
						const errorMessage = await this.bot.sendMessage(chatId,
							`❌ <b>Не удалось найти город.</b>\n\n` +
							`${townName}\n\n` +
							`Попробуйте ввести название иначе или нажмите "Отмена".`,
							{
								parse_mode: 'HTML',
								reply_markup: {
									inline_keyboard: [[
										{ text: '❌ Отмена', callback_data: 'cancel_config' }
									]]
								}
							}
						);
						// Обновляем lastMessageId для возможности последующего удаления
						pending.lastMessageId = errorMessage.message_id;
						this.pendingConfigs.set(chatId, pending);
						// Флаг НЕ очищаем - оставляем waitingForTownInput = 1
					}
				}
		});
			
		// Обработка ошибок бота
		this.bot.on('polling_error', (error) => {
			if (error.message.includes('502') || error.message.includes('Bad Gateway'))
			{	const now = Date.now();
				if (now - this.last502ErrorTime < 15000) return;
				this.last502ErrorTime = now;
			}
			this.sendErrorMessage('Polling error in SlaveBot: ' + error.message);
		});

		this.bot.on('webhook_error', (error) => {
			this.sendErrorMessage('Webhook error in SlaveBot: ' + error.message);
		});

		this.bot.on('error', (error) => {
			this.sendErrorMessage('General error in SlaveBot: ' + error.message);
		});
	}

    setupPrivateChatHandlers() {
        // Команда /config_channel - настройка канала через приватный чат
        this.bot.onText(/^\/config_channel$/, async (msg) => {
            try {
                const userId = msg.from.id;
                const chatId = msg.chat.id;
                
                // Проверяем, что это приватный чат
                if (chatId > 0) {
                    await this.showChannelSelection(userId);
                }
            } catch (err) {
                this.sendErrorMessage('Ошибка в /config_channel: ' + err);
            }
        });
        
        // Команда /setup_channel - получить ссылку для настройки
        this.bot.onText(/^\/setup_channel$/, async (msg) => {
            try {
                const userId = msg.from.id;
                if(!this.botUsername) await this.initbotname();
				const botUsername = '@' + this.botUsername;
                
                const deepLink = `https://t.me/${botUsername}?start=channel_setup`;
                
                await this.bot.sendMessage(userId,
                    `🔗 <b>Ссылка для настройки канала:</b>\n\n` +
                    `1. Перейдите по ссылке: ${deepLink}\n` +
					`2. Бот предложит выбрать канал\n` +
                    `3. Настройте часовой пояс и контент\n\n` +
                    `<b>Примечание:</b> Вы должны быть администратором канала.`,
                    { parse_mode: 'HTML' }
                );
            } catch (err) {
                this.sendErrorMessage('Ошибка в /setup_channel: ' + err);
            }
        });
    }

    async showPrivateChatHelp(userId) {
        try {
            if(!this.botName) await this.initbotname();
			
			await this.bot.sendMessage(userId,
                `👋 <b>Привет! Я бот "${this.botName}".</b>\n\n` +
                `<b>Вы можете настроить:</b>\n\n` +
                `👥 <b>Приватный чат</b> - просто используйте /config\n\n` +
				`👥 <b>Группы</b> - добавьте меня в группу и используйте /config\n` +
				`На время настройки отключите анонимность админа.\n\n` +
				`📢 <b>Каналы</b> - используйте /config_channel\n` +
                `/setup_channel - получить ссылку для настройки\n\n` +
				`<b>Для получения справки используйте</b> /help`,
                { parse_mode: 'HTML' }
            );
        } catch (err) {
            this.sendErrorMessage('Ошибка showPrivateChatHelp: ' + err);
        }
    }

    async showChannelSelection(userId) {
        try {
            // Если есть старая сессия настройки канала, удаляем её сообщения
            const oldPending = this.pendingConfigs.get(userId);
            if (oldPending) {
                // Удаляем текущее активное сообщение
                if (oldPending.lastMessageId) {
                    try {
                        await this.bot.deleteMessage(userId, oldPending.lastMessageId);
                    } catch (e) {
                        // Игнорируем ошибки удаления
                    }
                }
                // Удаляем сообщение с выбором контента, если есть
                if (oldPending.lastContentMessageId) {
                    try {
                        await this.bot.deleteMessage(userId, oldPending.lastContentMessageId);
                    } catch (e) {
                        // Игнорируем ошибки удаления
                    }
                }
            }
            
            const keyboard = {
                inline_keyboard: [
                    [
                        { 
                            text: '🆔 Ввести ID канала', 
                            callback_data: 'channel_by_id' 
                        }
                    ],
                    [
                        { 
                            text: '❓ Как получить ID канала?', 
                            callback_data: 'channel_help' 
                        }
                    ],
                    [
                        { 
                            text: '❌ Отмена', 
                            callback_data: 'cancel_channel_setup' 
                        }
                    ]
                ]
            };
            
            const sentMessage = await this.bot.sendMessage(userId,
                `📢 <b>Настройка бота для канала</b>\n\n` +
                `<b>Введите ID канала:</b>\n\n` +
                `<b>🆔 Формат ID:</b>\n` +
                `• -1001234567890\n\n` +
                `<b>Требования:</b>\n` +
                `✓ Вы должны быть администратором канала\n` +
                `✓ Бот должен быть добавлен в канал как администратор`,
                {
                    parse_mode: 'HTML',
                    reply_markup: keyboard
                }
            );
            
            // Сохраняем временные данные (используем userId как ключ)
            this.pendingConfigs.set(userId, {
                userId: userId,
                timestamp: Date.now(),
                lastMessageId: sentMessage.message_id, // Сохраняем ID активного сообщения
                lastContentMessageId: null,
                waitingForManualInput: false,
                configType: 'channel_selection'
            });
            
        } catch (err) {
            this.sendErrorMessage('Ошибка showChannelSelection: ' + err);
        }
    }

    async checkAdminRights(chatId, userId) {
        try {
            // Для приватных чатов всегда разрешаем
            if (chatId > 0) return true;
            
            const chatMember = await this.bot.getChatMember(chatId, userId);
            return ['administrator', 'creator'].includes(chatMember.status);
        } catch (err) {
            this.sendErrorMessage('Ошибка проверки прав: ' + err);
            return false;
        }
    }

    async startConfigProcess(chatId, chatTitle, messageThreadId = "") {
        try {
            // ОЧИСТКА СТАРОЙ СЕССИИ: Удаляем старое активное сообщение, если есть
            const oldPending = this.pendingConfigs.get(chatId);
            if (oldPending) {
                // Удаляем текущее активное сообщение
                if (oldPending.lastMessageId) {
                    try {
                        await this.bot.deleteMessage(chatId, oldPending.lastMessageId);
                    } catch (e) {
                        // Игнорируем ошибки удаления
                    }
                }
                // Удаляем сообщение с выбором контента, если есть
                if (oldPending.lastContentMessageId) {
                    try {
                        await this.bot.deleteMessage(chatId, oldPending.lastContentMessageId);
                    } catch (e) {
                        // Игнорируем ошибки удаления
                    }
                }
            }
            
            // Очищаем старую сессию
            this.pendingConfigs.delete(chatId);
            
            // Проверяем, есть ли уже такой чат в конфиге
            const existing = this.findChatInConfig(chatId);
            
            // Получаем текущие настройки контента из существующего конфига
            let contentSettings = { Eg: true, News: true, Raspis: false };
            if (existing && existing.Eg !== undefined) {
                contentSettings.Eg = existing.Eg;
            }
            if (existing && existing.News !== undefined) {
                contentSettings.News = existing.News;
            }
			if (existing && existing.Raspis !== undefined) {
                contentSettings.Raspis = existing.Raspis;
            }
            
            // Сохраняем информацию о старом чате во временные данные
            const pendingData = {
                chatTitle,
                timestamp: Date.now(),
                waitingForManualInput: false,
                oldSettings: existing,
                message_thread_id: messageThreadId,
                timezoneOffset: null,
                contentSettings: contentSettings,
                lastContentMessageId: null,
                lastMessageId: null // Инициализируем поле для активного сообщения
            };

            this.pendingConfigs.set(chatId, pendingData);

            // Проверяем тип чата
            let chatType = 'чата';
            try {
                const chat = await this.bot.getChat(chatId);
                if (chat.type === 'channel') chatType = 'канала';
                if (chat.type === 'supergroup') chatType = 'супергруппы';
            } catch (e) {}

            // Показываем клавиатуру с выбором таймзоны
            const keyboard = this.createTimezoneKeyboard();
            
            let message = `⚙️ <b>Настройка бота для ${chatType}:</b> "${this.escapeHtml(chatTitle)}"\n\n` +
                         `<b>Шаг 1/2: Выберите часовой пояс</b>\n` +
                         `(Публикации будут выходить в указанное время по вашему часовому поясу)`;
            
            // Добавляем информацию, если чат уже настроен
            if (existing) {
                const hours = Math.abs(existing.offset / 60);
                const sign = existing.offset >= 0 ? '+' : '-';
                message += `\n\n📋 <b>Текущие настройки:</b> UTC${sign}${hours} ч.\n`;
            }
            
            // Добавляем информацию о теме форума
            if (messageThreadId) {
                message += `📌 <b>Тема форума:</b> ID ${messageThreadId}\n`;
            }
            
            const sentMessage = await this.bot.sendMessage(chatId, message,
                {
                    parse_mode: 'HTML',
                    reply_markup: { inline_keyboard: keyboard },
                    message_thread_id: messageThreadId || undefined
                }
            );
            
            // Сохраняем ID активного сообщения
            pendingData.lastMessageId = sentMessage.message_id;
            this.pendingConfigs.set(chatId, pendingData);

        } catch (err) {
            this.sendErrorMessage('Ошибка startConfigProcess: ' + err);
            await this.bot.sendMessage(chatId, '❌ Произошла ошибка при настройке.', {
                message_thread_id: messageThreadId || undefined
            });
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
                await this.bot.sendMessage(chatId, '❌ Сессия настройки истекла. Начните заново с /config', {
                    message_thread_id: messageThreadId || undefined
                });
                return;
            }

            // Проверяем timezoneOffset
            const offsetNum = parseInt(timezoneOffset, 10);
            if (isNaN(offsetNum)) {
                this.sendErrorMessage('handleTimezoneSelection: Неверный формат timezoneOffset: ' + timezoneOffset);
				await this.bot.sendMessage(chatId, '❌ Ошибка: неверный формат часового пояса', {
                    message_thread_id: pending.message_thread_id || undefined
                });
                return;
            }
            
            // Проверяем диапазон часового пояса (от -12 до +14 часов в минутах)
            if (offsetNum < -720 || offsetNum > 840) { // -12*60 до +14*60 минут
                this.sendErrorMessage('handleTimezoneSelection: Часовой пояс вне диапазона: ' + offsetNum);
                await this.bot.sendMessage(chatId, '❌ Ошибка: часовой пояс вне допустимого диапазона (-12...+14 часов)', {
                    message_thread_id: pending.message_thread_id || undefined
                });
                return;
            }

            // Обновляем временные данные
            pending.timezoneOffset = offsetNum;
            
            // Очищаем ID активного сообщения (оно уже удалено в callback)
            pending.lastMessageId = null;
            
            this.pendingConfigs.set(chatId, pending);

            // Показываем выбор типа контента
            await this.showContentSelection(chatId);

        } catch (err) {
            this.sendErrorMessage('Ошибка handleTimezoneSelection: ' + err);
            const pending = this.pendingConfigs.get(chatId);
            await this.bot.sendMessage(chatId, '❌ Произошла ошибка при выборе часового пояса.', {
                message_thread_id: pending ? pending.message_thread_id || undefined : undefined
            });
        }
    }

    async showContentSelection(chatId) {
        try {
            const pending = this.pendingConfigs.get(chatId);
            if (!pending) {
                await this.bot.sendMessage(chatId, '❌ Сессия настройки истекла. Начните заново с /config', {
                    message_thread_id: pending ? pending.message_thread_id || undefined : undefined
                });
                return;
            }

            const hours = Math.abs(pending.timezoneOffset / 60);
            const sign = pending.timezoneOffset >= 0 ? '+' : '-';
            
            // Создаем клавиатуру для выбора контента
            const keyboard = this.createContentKeyboard(pending.contentSettings);
            
            const message = `⚙️ <b>Настройка бота для чата:</b> "${this.escapeHtml(pending.chatTitle)}"\n\n` +
                          `<b>Шаг 2/2: Выберите нужный контент</b>\n\n` +
                          `✅ - будет получать\n` +
                          `❌ - не будет получать\n\n`;
            
            const sentMessage = await this.bot.sendMessage(chatId, message,
                {
                    parse_mode: 'HTML',
                    reply_markup: { inline_keyboard: keyboard },
                    message_thread_id: pending.message_thread_id || undefined
                }
            );
            
            // Сохраняем ID сообщения с выбором контента
            pending.lastContentMessageId = sentMessage.message_id;
            pending.lastMessageId = sentMessage.message_id; // Также сохраняем как активное сообщение
            this.pendingConfigs.set(chatId, pending);

        } catch (err) {
            this.sendErrorMessage('Ошибка showContentSelection: ' + err);
            const pending = this.pendingConfigs.get(chatId);
            await this.bot.sendMessage(chatId, '❌ Произошла ошибка при настройке контента.', {
                message_thread_id: pending ? pending.message_thread_id || undefined : undefined
            });
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
				{
					text: `${contentSettings.Raspis ? '✅' : '❌'} Расписание`,
					callback_data: 'content_Raspis'
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
                await this.bot.sendMessage(chatId, '❌ Сессия настройки истекла. Начните заново с /config', {
                    message_thread_id: pending ? pending.message_thread_id || undefined : undefined
                });
                return;
            }

            // Переключаем состояние выбранного типа контента
            const contentSettings = pending.contentSettings || { Eg: true, News: true, Raspis: false };
            
            if (contentType === 'Eg' || contentType === 'News' || contentType === 'Raspis') {
                contentSettings[contentType] = !contentSettings[contentType];
                
                // Обновляем временные данные
                pending.contentSettings = contentSettings;
                
                // Редактируем существующее сообщение вместо удаления и отправки нового
                const keyboard = this.createContentKeyboard(contentSettings);
                
                const message = `⚙️ <b>Настройка бота для чата:</b> "${this.escapeHtml(pending.chatTitle)}"\n\n` +
                              `<b>Шаг 2/2: Выберите нужный контент</b>\n\n` +
                              `✅ - будет получать\n` +
                              `❌ - не будет получать\n\n`;
                
                try {
                    // Редактируем существующее сообщение
                    await this.bot.editMessageText(message, {
                        chat_id: chatId,
                        message_id: pending.lastContentMessageId,
                        parse_mode: 'HTML',
                        reply_markup: { inline_keyboard: keyboard }
                    });
                    
                    // Сохраняем обновленные данные (ID сообщения остается тем же)
                    this.pendingConfigs.set(chatId, pending);
                    
                } catch (err) {
                    console.error('Ошибка редактирования сообщения:', err);
                    // Если не удалось отредактировать, отправляем новое сообщение
                    const sentMessage = await this.bot.sendMessage(chatId, message,
                        {
                            parse_mode: 'HTML',
                            reply_markup: { inline_keyboard: keyboard },
                            message_thread_id: pending.message_thread_id || undefined
                        }
                    );
                    
                    // Сохраняем ID нового сообщения
                    pending.lastContentMessageId = sentMessage.message_id;
                    pending.lastMessageId = sentMessage.message_id;
                    this.pendingConfigs.set(chatId, pending);
                }
            }

        } catch (err) {
            this.sendErrorMessage('Ошибка handleContentSelection: ' + err);
            try {
                const pending = this.pendingConfigs.get(chatId);
                await this.bot.sendMessage(chatId, '❌ Произошла ошибка при выборе контента.', {
                    message_thread_id: pending ? pending.message_thread_id || undefined : undefined
                });
            } catch (e) {}
        }
    }

    async finishConfig(chatId) {
        try {
            // Ищем сессию по chatId
            let pending = this.pendingConfigs.get(chatId);
            
            if (!pending) {
                // Проверяем, не это ли отмена канала
                if (chatId > 0) { // Приватный чат
                    await this.bot.sendMessage(chatId, '❌ Сессия настройки истекла. Начните заново с /config_channel');
                } else {
                    await this.bot.sendMessage(chatId, '❌ Сессия настройки истекла. Начните заново с /config');
                }
                return;
            }
            
            // Удаляем сообщение с выбором контента, если оно еще существует
            if (pending.lastContentMessageId) {
                try {
                    // Используем chatId из сессии для каналов, если есть
                    const messageChatId = pending.chatId || chatId;
                    await this.bot.deleteMessage(messageChatId, pending.lastContentMessageId);
                } catch (e) {
                    // Игнорируем ошибки удаления
                }
            }

            // Проверяем, что часовой пояс выбран
            if (pending.timezoneOffset === null) {
                await this.bot.sendMessage(chatId, '❌ Ошибка: часовой пояс не выбран', {
                    message_thread_id: pending.message_thread_id || undefined
                });
                return;
            }

            // Проверяем, что выбран хотя бы один тип контента
            const contentSettings = pending.contentSettings || { Eg: true, News: true, Raspis: false };
            if (!contentSettings.Eg && !contentSettings.News && !contentSettings.Raspis) {
                await this.bot.sendMessage(chatId, 
                    '❌ <b>Ошибка: должен быть выбран хотя бы один тип контента</b>\n\n' +
                    `<b>Выберите хоть что нибудь и нажмите "Сохранить"</b>`,
                    { 
                        parse_mode: 'HTML',
                        message_thread_id: pending.message_thread_id || undefined
                    }
                );
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
            const targetChatId = pending.isEdit ? pending.chatId : (pending.chatId || chatId);
            this.removeChatFromAllTimezones(targetChatId, true);
            
            // Восстанавливаем/создаем массив для новой таймзоны
            if (!this.chat_news[offsetKey] || !Array.isArray(this.chat_news[offsetKey])) {
                this.chat_news[offsetKey] = currentArray; // Восстанавливаем предыдущее состояние
            }

            // Создаем запись о чате в строгом формате
            const chatEntry = {};
            
            // Используем оригинальное название чата как ключ
            const chatTitle = pending.chatTitle || `chat_${targetChatId}`;
            
            // Добавляем ID чата
            chatEntry[chatTitle] = targetChatId.toString();
            
            // Добавляем message_thread_id
            chatEntry.message_thread_id = pending.message_thread_id || "";
            
            // Добавляем настройки контента
            chatEntry.Eg = Boolean(contentSettings.Eg);
            chatEntry.News = Boolean(contentSettings.News);
			chatEntry.Raspis = Boolean(contentSettings.Raspis);
			
			//добавляем настройки на город
			if (pending.townData) {
				chatEntry.town = pending.townData.name;
				chatEntry.slug = pending.townData.slug;
			}
            
            // Проверяем, нет ли дубликата в текущей таймзоне
            if (Array.isArray(this.chat_news[offsetKey])) {
                // Удаляем возможный дубликат (на случай если чат уже был в этой таймзоне)
                this.chat_news[offsetKey] = this.chat_news[offsetKey].filter(chat => {
                    for (const [key, value] of Object.entries(chat)) {
                        if (key !== 'message_thread_id' && key !== 'Eg' && key !== 'News' && key !== 'Raspis' && 
                            (value.toString() === targetChatId.toString() || value === targetChatId)) {
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
                chatId: targetChatId,
                chatTitle: chatTitle,
                timezone: offsetKey,
                threadId: chatEntry.message_thread_id,
                contentSettings: contentSettings,
                oldTimezone: pending.oldSettings ? pending.oldSettings.timezoneKey : null,
                isEdit: pending.isEdit || false
            })) {
                const hours = Math.abs(offsetNum / 60);
                const sign = offsetNum >= 0 ? '+' : '-';
                
                let oldSettingsInfo = '';
                if (pending.oldSettings) {
                    const oldHours = Math.abs(pending.oldSettings.offset / 60);
                    const oldSign = pending.oldSettings.offset >= 0 ? '+' : '-';
                    oldSettingsInfo = `\n🔄 <b>Старый часовой пояс:</b> UTC${oldSign}${oldHours} ч.`;
                }
                
                let threadInfo = '';
                if (chatEntry.message_thread_id) {
                    threadInfo = `📌 <b>Тема форума:</b> ID ${chatEntry.message_thread_id}\n`;
                }
                
                // Формируем информацию о выбранных типах контента
                const contentTypes = [];
                if (contentSettings.Eg) contentTypes.push('📔 Ежедневник');
                if (contentSettings.News) contentTypes.push('🌐 Новости');
				if (contentSettings.Raspis) contentTypes.push('📅 Расписание');
                const contentInfo = contentTypes.length > 0 ? contentTypes.join('\n') : '❌ Не выбрано';
				
				let townInfo = '';
				if (pending.townData) {
					townInfo = `🏙️ <b>Город:</b> ${this.escapeHtml(pending.townData.name)}\n`;
				}
                
                const completionMessage = pending.isEdit ? 
                    `✅ <b>Настройки обновлены!</b>` : 
                    `✅ <b>Настройка завершена!</b>`;
                
                // Определяем, куда отправлять сообщение
                const targetUserId = pending.userId || chatId;
                
                await this.bot.sendMessage(targetUserId,
                    `${completionMessage}\n\n` +
                    `📝 <b>Чат:</b> "${this.escapeHtml(chatTitle)}"\n` +
					threadInfo +
					townInfo + 
                    `🌍 <b>Часовой пояс:</b> UTC${sign}${hours} ч.\n` +
                    `<b>Получаем:</b>\n${contentInfo}`,
                    { 
                        parse_mode: 'HTML',
                        message_thread_id: pending.message_thread_id || undefined
                    }
                );
            } else {
                const targetUserId = pending.userId || chatId;
                await this.bot.sendMessage(targetUserId, '❌ Ошибка сохранения конфигурации.', {
                    message_thread_id: pending.message_thread_id || undefined
                });
            }

            // Очищаем временные данные
            this.pendingConfigs.delete(chatId);

        } catch (err) {
            this.sendErrorMessage('Ошибка finishConfig: ' + err);
            // Пытаемся определить userId для отправки сообщения об ошибке
            let targetUserId = chatId;
            let messageThreadId = undefined;
            try {
                const pending = this.pendingConfigs.get(chatId);
                if (pending && pending.userId) {
                    targetUserId = pending.userId;
                }
                if (pending && pending.message_thread_id) {
                    messageThreadId = pending.message_thread_id;
                }
            } catch (e) {
                // Игнорируем ошибку поиска
            }
            await this.bot.sendMessage(targetUserId, '❌ Произошла ошибка при сохранении настроек.', {
                message_thread_id: messageThreadId || undefined
            });
        }
    }

    async finishChannelConfig(userId) {
        // Алиас для finishConfig для каналов
        const pending = this.pendingConfigs.get(userId);
        
        if (!pending) {
            await this.bot.sendMessage(userId, '❌ Сессия настройки истекла. Начните заново с /config_channel');
            return;
        }
        
        if (this.needTown && pending.contentSettings && pending.contentSettings.Raspis) {
			await this.getTownSlug(userId);
		}
		else await this.finishConfig(userId);
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
                    if (key !== 'message_thread_id' && key !== 'Eg' && key !== 'News' && key !== 'Raspis' && 
                        (value.toString() === chatId.toString() || value === chatId)) {
                        return {
                            title: key,
                            offset: parseInt(timezoneKey, 10),
                            timezoneKey,
                            Eg: chat.Eg !== undefined ? chat.Eg : false,
                            News: chat.News !== undefined ? chat.News : false,
							Raspis: chat.Raspis !== undefined ? chat.Raspis : false,
                            threadId: chat.message_thread_id || "",
							town: chat.town || null,
							slug: chat.slug || null 
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
            return `❌ <b>Этот чат не настроен для рассылки.</b>\nИспользуйте /config для настройки.`;
        }
        
        const hours = Math.abs(existing.offset / 60);
        const sign = existing.offset >= 0 ? '+' : '-';
        
        // Формируем информацию о типах контента
        const contentTypes = [];
        if (existing.Eg) contentTypes.push('📔 Ежедневник');
        if (existing.News) contentTypes.push('🌐 Новости');
		if (existing.Raspis) contentTypes.push('📅 Расписание');
        let contentText;
        if (contentTypes.length > 0) {
            contentText = contentTypes.join('\n');
        } else {
            contentText = '❌ Не выбрано';
        }
		let threadInfo = '';
        if (existing.threadId) {
			threadInfo = `📌 <b>Тема форума:</b> ID ${existing.threadId}\n`;
        }
		let townInfo = '';
		if (existing.town) {
			townInfo = `🏙️ <b>Город:</b> ${this.escapeHtml(existing.town)}\n`;
		}		
        
        return `⚙️ <b>Настройки бота:</b>\n\n` +
               `📝 <b>Чат:</b> "${this.escapeHtml(existing.title)}"\n` +
			   threadInfo +
			   townInfo +
               `🌍 <b>Часовой пояс:</b> UTC${sign}${hours} ч.\n\n` +
               `<b>Получает:</b>\n${contentText}\n\n` +
               `ℹ️ <b>Команды:</b>\n` +
               `/config - перенастроить чат`;
    }

    async removeChatFromConfig(chatId, showConfirm = true) {
        try {
            // Сначала пытаемся найти чат в конфиге
            const existing = this.findChatInConfig(chatId);
            
            if (!existing) {
                if (showConfirm) {
                    await this.bot.sendMessage(chatId, 
                        '❌ Этот чат не найден в настройках рассылки.',
                        {
                            message_thread_id: existing && existing.threadId ? existing.threadId : undefined
                        }
                    );
                }
                return false;
            }

            // Удаляем без подтверждения
            const removed = this.removeChatFromAllTimezones(chatId, true);
            
            if (removed && showConfirm) {
                // Пытаемся отправить сообщение (если бот еще в чате)
                try {
                    await this.bot.sendMessage(chatId, 
                        `✅ Чат "${existing.title}" удален из рассылки публикаций.`,
                        {
                            message_thread_id: existing && existing.threadId ? existing.threadId : undefined
                        }
                    );
                } catch (err) {
                    // Игнорируем ошибку, бот уже удален
                }
            }
            
            return removed;

        } catch (err) {
            this.sendErrorMessage('Ошибка removeChatFromConfig: ' + err);
            if (showConfirm) {
                try {
                    const existing = this.findChatInConfig(chatId);
                    await this.bot.sendMessage(chatId, '❌ Ошибка при удалении чата.', {
                        message_thread_id: existing && existing.threadId ? existing.threadId : undefined
                    });
                } catch (e) {
                    // Игнорируем, бот может быть уже удален
                }
            }
            return false;
        }
    }

    removeChatFromAllTimezones(chatId, cleanupEmpty = true) {
        let removed = false;
		let chatName = '';
        
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
                    if (key !== 'message_thread_id' && key !== 'Eg' && key !== 'News' && key !== 'Raspis' && 
                        (value.toString() === chatId.toString() || value === chatId))
					{
                        chatName = key;
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
				chatName: chatName,
                removedFromTimezones: true
            });
        }
        
        return removed;
    }

    setupCleanupTimer() {
        const CHAT_CLEANUP_INTERVAL = 6 * 60 * 60 * 1000; // 6 часов
		let nextChatCleanup = Date.now() + CHAT_CLEANUP_INTERVAL;
		
		// Очистка старых pending конфигураций каждые 10 минут
        this.cleanupTimer = setInterval(() => {
            const now = Date.now();
            const timeout = 20 * 60 * 1000; // 20 минут
            
            for (const [chatId, data] of this.pendingConfigs.entries()) {
                if (now - data.timestamp > timeout) {
                    // Удаляем активное сообщение при истечении таймаута
                    if (data.lastMessageId) {
                        try {
                            this.bot.deleteMessage(chatId, data.lastMessageId);
                        } catch (e) {
                            // Игнорируем ошибки удаления
                        }
                    }
                    // Удаляем сообщение с контентом при истечении таймаута
                    if (data.lastContentMessageId) {
                        try {
                            this.bot.deleteMessage(chatId, data.lastContentMessageId);
                        } catch (e) {
                            // Игнорируем ошибки удаления
                        }
                    }
                    
                    this.pendingConfigs.delete(chatId);
                    console.log(`Очищена устаревшая сессия для чата ${chatId}`);
                }
            }
            
            // Очистка pendingChannelSetup
            if (this.pendingChannelSetup && now - this.pendingChannelSetup.timestamp > timeout) {
                this.pendingChannelSetup = null;
                console.log('Очищена устаревшая сессия настройки канала');
            }
            
            // Раз в сутки проверяем существование чатов
            if (now >= nextChatCleanup) { //каждые 6 часов
                nextChatCleanup = now + CHAT_CLEANUP_INTERVAL;
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
                        if (key !== 'message_thread_id' && key !== 'Eg' && key !== 'News' && key !== 'Raspis') {
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
            }
            
            console.log(`✅ Очистка завершена: удалено ${cleaned} несуществующих чатов`);
            
        } catch (err) {
            this.sendErrorMessage('Ошибка при очистке несуществующих чатов: ' + err);
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
                this.pendingChannelSetup = null;
                
            } catch (err) {
                this.sendErrorMessage('Ошибка остановки SlaveBot: ' + err);
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
		// Экранируем только то, что действительно ломает Markdown
		return text.replace(/([_*\[\]()~`>#])/g, '\\$1');
	}
	
	escapeHtml(text) {
		if (typeof text !== 'string') return text;
		return text
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;')
			.replace(/"/g, '&quot;')
			.replace(/'/g, '&#039;');
	}

    // ============ МЕТОДЫ ДЛЯ РАБОТЫ С КАНАЛАМИ ============

    async requestChannelId(userId) {
        try {
            const sentMessage = await this.bot.sendMessage(userId,
                `🆔 <b>Введите ID канала:</b>\n\n` +
                `<b>Формат:</b>\n` +
                `• -1001234567890\n\n` +
                `<b>Как получить ID канала:</b>\n` +
                `1. Добавьте бота @getidsbot в канал\n` +
                `2. Перешлите любое сообщение этому боту\n` +
                `3. Бот покажет ID канала\n` +
				`Или получите ID канала любым другим доступным способом\n\n` +
                `<b>Примечание:</b>\n` +
                `• ID канала всегда начинается с -100`,
                {
                    parse_mode: 'HTML',
                    reply_markup: {
                        force_reply: true,
                        selective: true,
                        input_field_placeholder: '-1001234567890'
                    }
                }
            );
            
            // Обновляем ID активного сообщения
            const pending = this.pendingConfigs.get(userId);
            if (pending) {
                pending.lastMessageId = sentMessage.message_id;
                this.pendingConfigs.set(userId, pending);
            }
            
            this.pendingChannelSetup = {
                userId: userId,
                waitingForChannelId: true,
                timestamp: Date.now()
            };
            
        } catch (err) {
            this.sendErrorMessage('Ошибка requestChannelId: ' + err);
        }
    }

    async showChannelHelp(userId) {
        try {
            const helpText = `<b>📚 Помощь по настройке каналов</b>\n\n` +
                `<b>Как получить ID канала:</b>\n\n` +
                `<b>Для любого канала:</b>\n` +
                `1. Добавьте бота @getidsbot в канал\n` +
                `2. Перешлите любое сообщение этому боту\n` +
                `3. Бот покажет ID канала\n` +
				`Или получите ID канала любым другим доступным способом\n\n` +
                `<b>Формат ID канала:</b>\n` +
                `• Всегда начинается с -100\n` +
                `• Пример: -1001234567890\n\n` +
                `<b>Для публичных каналов можно также использовать юзернейм:</b>\n` +
                `• Например: @my_channel или просто my_channel\n\n` +
                `<b>Проверка прав:</b>\n` +
                `• Вы должны быть администратором канала\n` +
                `• Бот должен быть администратором канала`;
            
            const sentMessage = await this.bot.sendMessage(userId, helpText, {
                parse_mode: 'HTML',
                reply_markup: {
                    inline_keyboard: [
                        [
                            { text: '🆔 Ввести ID канала', callback_data: 'channel_by_id' }
                        ],
                        [
                            { text: '❌ Отмена', callback_data: 'cancel_channel_setup' }
                        ]
                    ]
                }
            });
            
            // Обновляем ID активного сообщения
            const pending = this.pendingConfigs.get(userId);
            if (pending) {
                pending.lastMessageId = sentMessage.message_id;
                this.pendingConfigs.set(userId, pending);
            }
        } catch (err) {
            this.sendErrorMessage('Ошибка showChannelHelp: ' + err);
        }
    }

    async processChannelInput(userId, input, inputType) {
        try {
            let channelIdentifier = input.trim();
            
            // Обработка ID канала
            if (inputType === 'id') {
                // Проверяем, это юзернейм или числовой ID
                if (channelIdentifier.startsWith('@')) {
                    // Это юзернейм - секретная фича для публичных каналов
                    const username = channelIdentifier.substring(1);
                    
                    // Проверяем формат юзернейма
                    if (!username.match(/^[a-zA-Z0-9_]{5,32}$/)) {
                        const sentMessage = await this.bot.sendMessage(userId,
                            `❌ <b>Неверный формат юзернейма.</b>\n` +
                            `<b>Юзернейм должен содержать 5-32 символа:</b>\n` +
                            `• Латинские буквы a-z, A-Z\n` +
                            `• Цифры 0-9\n` +
                            `• Нижнее подчеркивание _\n\n` +
                            `<b>Используйте ID канала (начинается с -100)</b>`,
                            { parse_mode: 'HTML' }
                        );
                        
                        // Обновляем ID активного сообщения
                        const pending = this.pendingConfigs.get(userId);
                        if (pending) {
                            pending.lastMessageId = sentMessage.message_id;
                            this.pendingConfigs.set(userId, pending);
                        }
                        return;
                    }
                    
                    // Пробуем получить чат по юзернейму
                    try {
                        const chat = await this.bot.getChat(`@${username}`);
                        
                        // Проверяем, что это канал
                        if (chat.type !== 'channel') {
                            await this.bot.sendMessage(userId,
                                `❌ <b>Это не канал.</b>\n` +
                                `"@${username}" — это ${chat.type}.\n` +
                                `<b>Используйте ID именно канала.</b>`,
								{ parse_mode: 'HTML' }
							);
                            return;
                        }
                        
                        // Начинаем настройку
                        await this.startChannelConfig(userId, chat.id, chat.title, 'username');
                        
                    } catch (err) {
                        await this.bot.sendMessage(userId,
                            `❌ <b>Канал не найден или является частным.</b>\n\n` +
                            `<b>Используйте ID канала (начинается с -100)</b>`,
							{ parse_mode: 'HTML' }
                        );
                    }
                    return;
                }
                
                // Пробуем распарсить как число
                let channelIdNum = parseInt(channelIdentifier);
                
                if (isNaN(channelIdNum)) {
                    const sentMessage = await this.bot.sendMessage(userId,
                        `❌ <b>Неверный формат ID.</b>\n` +
                        `<b>ID канала должен быть числом, например:</b>\n` +
                        `-1001234567890\n\n` +
                        `<b>Используйте ID канала (начинается с -100)</b>`,
                        { parse_mode: 'HTML' }
                    );
                    
                    // Обновляем ID активного сообщения
                    const pending = this.pendingConfigs.get(userId);
                    if (pending) {
                        pending.lastMessageId = sentMessage.message_id;
                        this.pendingConfigs.set(userId, pending);
                    }
                    return;
                }
                
                // Добавляем префикс -100 если это положительное число
                if (channelIdNum > 0) {
                    channelIdNum = -1000000000000 - channelIdNum;
                }
                
                // Проверяем, что ID имеет правильный формат для канала
                if (channelIdNum >= -1000000000000) {
                    const sentMessage = await this.bot.sendMessage(userId,
                        `❌ <b>Неверный формат ID канала.</b>\n\n` +
                        `<b>ID канала должен:</b>\n` +
                        `• Начинаться с -100\n` +
                        `• Иметь 13-14 цифр\n\n` +
                        `<b>Пример:</b> -1001234567890\n\n` +
                        `<b>Убедитесь, что вы вводите правильный ID канала.</b>`,
                        { parse_mode: 'HTML' }
                    );
                    
                    // Обновляем ID активного сообщения
                    const pending = this.pendingConfigs.get(userId);
                    if (pending) {
                        pending.lastMessageId = sentMessage.message_id;
                        this.pendingConfigs.set(userId, pending);
                    }
                    return;
                }
                
                // Пробуем получить информацию о канале
                try {
                    const chat = await this.bot.getChat(channelIdNum);
                    
                    if (chat.type !== 'channel') {
                        await this.bot.sendMessage(userId,
                            `❌ <b>Это не канал.</b>\n` +
                            `ID ${channelIdNum} — это ${chat.type}.\n` +
                            `<b>Укажите ID именно канала.</b>`,
							{ parse_mode: 'HTML' }
						);
                        return;
                    }
                    
                    // Начинаем настройку
                    await this.startChannelConfig(userId, chat.id, chat.title, 'id');
                    
                } catch (err) {
                    await this.bot.sendMessage(userId,
                        `❌ <b>Не удалось получить информацию о канале.</b>\n\n` +
                        `<b>Возможные причины:</b>\n` +
                        `1. Бот не добавлен в этот канал\n` +
                        `2. ID канала указан неверно\n` +
                        `3. Канал не существует\n\n` +
                        `<b>Проверьте, что:</b>\n` +
                        `• ID канала правильный (начинается с -100)\n` +
                        `• Бот добавлен в канал как администратор\n` +
                        `• Вы администратор канала`,
						{ parse_mode: 'HTML' }
                    );
                }
            }
            
        } catch (err) {
            this.sendErrorMessage('Ошибка processChannelInput: ' + err);
            await this.bot.sendMessage(userId,
                `❌ <b>Ошибка при обработке данных канала.</b>\n` +
                `Попробуйте еще раз или обратитесь к администратору.`,
				{ parse_mode: 'HTML' }
            );
        }
    }

    async startChannelConfig(userId, channelId, channelTitle = null, sourceType = 'unknown') {
        try {
            // Если есть старая сессия настройки, удаляем её сообщения
            const oldPending = this.pendingConfigs.get(userId);
            if (oldPending) {
                // Удаляем текущее активное сообщение
                if (oldPending.lastMessageId) {
                    try {
                        await this.bot.deleteMessage(userId, oldPending.lastMessageId);
                    } catch (e) {
                        // Игнорируем ошибки удаления
                    }
                }
                // Удаляем сообщение с выбором контента, если есть
                if (oldPending.lastContentMessageId) {
                    try {
                        await this.bot.deleteMessage(userId, oldPending.lastContentMessageId);
                    } catch (e) {
                        // Игнорируем ошибки удаления
                    }
                }
            }
            
            // Очищаем старую сессия
            this.pendingConfigs.delete(userId);
            
            // Сначала проверяем, не настроен ли уже этот канал
            const existingConfig = this.findChatInConfig(channelId);
            
            if (existingConfig) {
                // Канал уже настроен, показываем текущие настройки
                const hours = Math.abs(existingConfig.offset / 60);
                const sign = existingConfig.offset >= 0 ? '+' : '-';
                
                const contentTypes = [];
                if (existingConfig.Eg) contentTypes.push('📔 Ежедневник');
                if (existingConfig.News) contentTypes.push('🌐 Новости');
				if (existingConfig.Raspis) contentTypes.push('📅 Расписание');
                const contentInfo = contentTypes.length > 0 ? contentTypes.join('\n') : '❌ Не выбрано';
                
                // Спрашиваем, хочет ли пользователь изменить настройки
                const sentMessage = await this.bot.sendMessage(userId,
                    `⚠️ <b>Этот канал уже настроен!</b>\n\n` +
                    `📢 <b>Канал:</b> "${this.escapeHtml(existingConfig.title)}"\n` +
                    `🌍 <b>Часовой пояс:</b> UTC${sign}${hours} ч.\n` +
                    `<b>Получает:</b>\n${contentInfo}\n\n` +
                    `<b>Что вы хотите сделать?</b>`,
                    {
                        parse_mode: 'HTML',
                        reply_markup: {
                            inline_keyboard: [
                                [
                                    { text: '✏️ Изменить настройки', callback_data: `edit_channel_${channelId}` },
                                    { text: '🗑️ Удалить из рассылки', callback_data: `remove_channel_${channelId}` }
                                ],
                                [
                                    { text: '❌ Отмена', callback_data: 'cancel_channel_setup' }
                                ]
                            ]
                        }
                    }
                );
                
                // Сохраняем временные данные
                this.pendingConfigs.set(userId, {
                    userId: userId,
                    chatId: channelId,
                    timestamp: Date.now(),
                    lastMessageId: sentMessage.message_id,
                    lastContentMessageId: null,
                    configType: 'channel_manage'
                });
                
                return;
            }
            
            // Проверяем права пользователя в канале
            const isAdmin = await this.checkChannelAdminRights(channelId, userId);
            
            if (!isAdmin) {
                const sentMessage = await this.bot.sendMessage(userId,
                    `❌ <b>Доступ запрещен</b>\n\n` +
                    `Вы не являетесь администратором этого канала.\n` +
                    `<b>Только администраторы могут настраивать бота.</b>\n\n` +
                    `Добавьте себя как администратора в настройках канала.`,
                    {
                        parse_mode: 'HTML',
                        reply_markup: {
                            inline_keyboard: [[
                                { text: '❌ Отмена', callback_data: 'cancel_channel_setup' }
                            ]]
                        }
                    }
                );
                
                // Сохраняем временные данные
                this.pendingConfigs.set(userId, {
                    userId: userId,
                    timestamp: Date.now(),
                    lastMessageId: sentMessage.message_id,
                    lastContentMessageId: null,
                    configType: 'channel_error'
                });
                
                return;
            }
            
            // Проверяем права бота в канале
            if(!this.botUsername) await this.initbotname();
			const botUsername = '@' + this.botUsername;
            const botId = this.bot.token.split(':')[0];
			const botIsAdmin = await this.checkChannelAdminRights(channelId, botId);
            
            if (!botIsAdmin) {
                const sentMessage = await this.bot.sendMessage(userId,
                    `❌ <b>Бот не имеет прав</b>\n\n` +
                    `Бот должен быть администратором канала.\n\n` +
                    `<b>Добавьте бота в канал как администратора:</b>\n` +
                    `1. Откройте настройки канала\n` +
                    `2. Добавьте участника: ${botUsername}\n` +
                    `3. Назначьте права администратора\n` +
                    `4. Включите разрешение "Публикация сообщений"`,
                    {
                        parse_mode: 'HTML',
                        reply_markup: {
                            inline_keyboard: [[
                                { text: '❌ Отмена', callback_data: 'cancel_channel_setup' }
                            ]]
                        }
                    }
                );
                
                // Сохраняем временные данные
                this.pendingConfigs.set(userId, {
                    userId: userId,
                    timestamp: Date.now(),
                    lastMessageId: sentMessage.message_id,
                    lastContentMessageId: null,
                    configType: 'channel_error'
                });
                
                return;
            }
            
            // Получаем информацию о канале, если не передана
            if (!channelTitle) {
                try {
                    const chat = await this.bot.getChat(channelId);
                    channelTitle = chat.title;
                } catch (err) {
                    channelTitle = `Канал ${channelId}`;
                }
            }
            
            // Сохраняем временные данные (используем userId как ключ)
            const pendingData = {
                userId: userId,
                chatId: channelId,
                chatTitle: channelTitle,
                timestamp: Date.now(),
                waitingForManualInput: false,
                oldSettings: null,
                message_thread_id: "", // У каналов нет тем
                timezoneOffset: null,
                contentSettings: { Eg: true, News: true, Raspis: true },
                lastContentMessageId: null,
                lastMessageId: null, // Инициализируем поле для активного сообщения
                configType: 'channel',
                sourceType: sourceType,
                isEdit: false
            };
            
            this.pendingConfigs.set(userId, pendingData);
            
            // Показываем часовые пояса с кнопкой отмены
            const keyboard = this.createTimezoneKeyboard();
            
            let sourceInfo = '';
            if (sourceType === 'username') {
                sourceInfo = ' (по юзернейму)';
            } else if (sourceType === 'id') {
                sourceInfo = ' (по ID)';
            }
            
            const sentMessage = await this.bot.sendMessage(userId,
                `✅ <b>Канал найден!</b>${sourceInfo}\n\n` +
                `📢 <b>Канал:</b> "${this.escapeHtml(channelTitle)}"\n` +
                `🆔 <b>ID:</b> ${channelId}\n\n` +
                `<b>Шаг 1/2: Выберите часовой пояс</b>\n` +
                `(Публикации будут выходить в указанное время по вашему часовому поясу)`,
                {
                    parse_mode: 'HTML',
                    reply_markup: { inline_keyboard: keyboard }
                }
            );
            
            // Сохраняем ID активного сообщения
            pendingData.lastMessageId = sentMessage.message_id;
            this.pendingConfigs.set(userId, pendingData);
            
        } catch (err) {
            this.sendErrorMessage('Ошибка startChannelConfig: ' + err);
            const sentMessage = await this.bot.sendMessage(userId,
                `❌ <b>Произошла ошибка при настройке канала.</b>\n` +
                `<b>Проверьте, что:</b>\n` +
                `1. Бот добавлен в канал\n` +
                `2. Вы и бот — администраторы канала`,
                {
                    parse_mode: 'HTML',
                    reply_markup: {
                        inline_keyboard: [[
                            { text: '❌ Отмена', callback_data: 'cancel_channel_setup' }
                        ]]
                    }
                }
            );
            
            // Сохраняем временные данные
            this.pendingConfigs.set(userId, {
                userId: userId,
                timestamp: Date.now(),
                lastMessageId: sentMessage.message_id,
                lastContentMessageId: null,
                configType: 'channel_error'
            });
        }
    }

    async startChannelEdit(userId, channelId, channelTitle) {
        try {
            // Если есть старая сессия настройки, удаляем её сообщения
            const oldPending = this.pendingConfigs.get(userId);
            if (oldPending) {
                // Удаляем текущее активное сообщение
                if (oldPending.lastMessageId) {
                    try {
                        await this.bot.deleteMessage(userId, oldPending.lastMessageId);
                    } catch (e) {
                        // Игнорируем ошибки удаления
                    }
                }
                // Удаляем сообщение с выбором контента, если есть
                if (oldPending.lastContentMessageId) {
                    try {
                        await this.bot.deleteMessage(userId, oldPending.lastContentMessageId);
                    } catch (e) {
                        // Игнорируем ошибки удаления
                    }
                }
            }
            
            // Очищаем старую сессию
            this.pendingConfigs.delete(userId);
            
            // Находим текущие настройки
            const existing = this.findChatInConfig(channelId);
            if (!existing) {
                const sentMessage = await this.bot.sendMessage(userId,
                    `❌ <b>Настройки канала не найдены.</b>\n` +
                    `Возможно, канал уже был удален из рассылки.`,
                    {
                        parse_mode: 'HTML',
                        reply_markup: {
                            inline_keyboard: [[
                                { text: '❌ Отмена', callback_data: 'cancel_channel_setup' }
                            ]]
                        }
                    }
                );
                
                // Сохраняем временные данные
                this.pendingConfigs.set(userId, {
                    userId: userId,
                    timestamp: Date.now(),
                    lastMessageId: sentMessage.message_id,
                    lastContentMessageId: null,
                    configType: 'channel_error'
                });
                
                return;
            }
            
            // Получаем текущие настройки контента
            let contentSettings = { Eg: true, News: true, Raspis: true };
            if (existing && existing.Eg !== undefined) {
                contentSettings.Eg = existing.Eg;
            }
            if (existing && existing.News !== undefined) {
                contentSettings.News = existing.News;
            }
			if (existing && existing.Raspis !== undefined) {
                contentSettings.Raspis = existing.Raspis;
            }
            
            // Сохраняем временные данные для редактирования
            const pendingData = {
                userId: userId,
                chatId: channelId,
                chatTitle: channelTitle,
                timestamp: Date.now(),
                waitingForManualInput: false,
                oldSettings: existing,
                message_thread_id: "", // У каналов нет тем
                timezoneOffset: existing.offset, // Используем существующий часовой пояс
                contentSettings: contentSettings,
                lastContentMessageId: null,
                lastMessageId: null, // Инициализируем поле для активного сообщения
                configType: 'channel',
                sourceType: 'edit',
                isEdit: true // Флаг редактирования
            };
            
            this.pendingConfigs.set(userId, pendingData);
            
            // Показываем текущие настройки и предлагаем изменить
            const hours = Math.abs(existing.offset / 60);
            const sign = existing.offset >= 0 ? '+' : '-';
            
            const contentTypes = [];
            if (contentSettings.Eg) contentTypes.push('📔 Ежедневник');
            if (contentSettings.News) contentTypes.push('🌐 Новости');
			if (contentSettings.Raspis) contentTypes.push('📅 Расписание');
            const contentInfo = contentTypes.length > 0 ? contentTypes.join('\n') : '❌ Не выбрано';
			
			let townInfo = '';
			if (existing.town) {
				townInfo = `🏙️ <b>Город:</b> ${this.escapeHtml(existing.town)}\n`;
			}
            
            const keyboard = this.createTimezoneKeyboard();
            
            const sentMessage = await this.bot.sendMessage(userId,
                `✏️ <b>Редактирование настроек канала</b>\n\n` +
                `📢 <b>Канал:</b> "${this.escapeHtml(channelTitle)}"\n` +
				townInfo +
                `🌍 <b>Текущий часовой пояс:</b> UTC${sign}${hours} ч.\n` +
                `<b>Текущие настройки контента:</b>\n${contentInfo}\n\n` +
                `<b>Шаг 1/2: Выберите новый часовой пояс</b>\n` +
                `(или оставьте текущий)`,
                {
                    parse_mode: 'HTML',
                    reply_markup: { inline_keyboard: keyboard }
                }
            );
            
            // Сохраняем ID активного сообщения
            pendingData.lastMessageId = sentMessage.message_id;
            this.pendingConfigs.set(userId, pendingData);
            
        } catch (err) {
            this.sendErrorMessage('Ошибка startChannelEdit: ' + err);
            const sentMessage = await this.bot.sendMessage(userId,
                `❌ <b>Произошла ошибка при редактировании настроек.</b>`,
                {
                    parse_mode: 'HTML',
                    reply_markup: {
                        inline_keyboard: [[
                            { text: '❌ Отмена', callback_data: 'cancel_channel_setup' }
                        ]]
                    }
                }
            );
            
            // Сохраняем временные данные
            this.pendingConfigs.set(userId, {
                userId: userId,
                timestamp: Date.now(),
                lastMessageId: sentMessage.message_id,
                lastContentMessageId: null,
                configType: 'channel_error'
            });
        }
    }

    async removeChannelFromConfig(userId, channelId) {
        try {
            // Находим текущие настройки
            const existing = this.findChatInConfig(channelId);
            if (!existing) {
                const sentMessage = await this.bot.sendMessage(userId,
                    `❌ <b>Канал не найден в настройках рассылки.</b>`,
                    {
                        parse_mode: 'HTML',
                        reply_markup: {
                            inline_keyboard: [[
                                { text: '❌ Отмена', callback_data: 'cancel_channel_setup' }
                            ]]
                        }
                    }
                );
                
                // Сохраняем временные данные
                this.pendingConfigs.set(userId, {
                    userId: userId,
                    timestamp: Date.now(),
                    lastMessageId: sentMessage.message_id,
                    lastContentMessageId: null,
                    configType: 'channel_remove'
                });
                
                return;
            }
            
            // Спрашиваем подтверждение
            const sentMessage = await this.bot.sendMessage(userId,
                `⚠️ <b>Вы уверены, что хотите удалить канал из рассылки?</b>\n\n` +
                `📢 <b>Канал:</b> "${this.escapeHtml(existing.title)}"\n` + 
                `<b>Это действие нельзя отменить.</b>`,
                {
                    parse_mode: 'HTML',
                    reply_markup: {
                        inline_keyboard: [
                            [
                                { text: '✅ Да, удалить', callback_data: `confirm_remove_channel_${channelId}` },
                                { text: '❌ Отмена', callback_data: 'cancel_channel_setup' }
                            ]
                        ]
                    }
                }
            );
            
            // Сохраняем временные данные
            this.pendingConfigs.set(userId, {
                userId: userId,
                timestamp: Date.now(),
                lastMessageId: sentMessage.message_id,
                lastContentMessageId: null,
                configType: 'channel_remove'
            });
            
        } catch (err) {
            this.sendErrorMessage('Ошибка removeChannelFromConfig: ' + err);
            const sentMessage = await this.bot.sendMessage(userId,
                `❌ <b>Произошла ошибка при удалении канала.</b>`,
                {
                    parse_mode: 'HTML',
                    reply_markup: {
                        inline_keyboard: [[
                            { text: '❌ Отмена', callback_data: 'cancel_channel_setup' }
                        ]]
                    }
                }
            );
            
            // Сохраняем временные данные
            this.pendingConfigs.set(userId, {
                userId: userId,
                timestamp: Date.now(),
                lastMessageId: sentMessage.message_id,
                lastContentMessageId: null,
                configType: 'channel_error'
            });
        }
    }

    async checkChannelAdminRights(channelId, userId) {
        try {
            const chatMember = await this.bot.getChatMember(channelId, userId);
            return ['administrator', 'creator'].includes(chatMember.status);
        } catch (err) {
            this.sendErrorMessage('Ошибка проверки прав в канале: ' + err);
            return false;
        }
    }
	
	// Проверка, является ли бот администратором в чате
	async isBotAdmin(chatId) {
		try {
			// Для приватных чатов всегда true
			if (chatId > 0) return true;
			
			const botId = this.bot.token.split(':')[0];
			const botMember = await this.bot.getChatMember(chatId, botId);
			return botMember.status === 'administrator';
		} catch (err) {
			this.sendErrorMessage('Ошибка проверки прав бота: ' + err);
			return false; // При ошибке считаем, что не админ
		}
	}
	
	sendErrorMessage(message) {
		console.error(message);
		this.saveConfig('error_message', {message: message, timestamp: Date.now()});
	}
	
	async getTownSlug(chatId) {
      try {
        const pending = this.pendingConfigs.get(chatId);
        if (!pending) {
            await this.bot.sendMessage(chatId, '❌ Сессия настройки истекла. Начните заново с /config', {
                message_thread_id: pending ? pending.message_thread_id || undefined : undefined
            });
            return;
        }

        // Очищаем предыдущие активные сообщения
        if (pending.lastMessageId) {
            try {
                await this.bot.deleteMessage(chatId, pending.lastMessageId);
            } catch (e) {
                // Игнорируем ошибки удаления
            }
        }
		
		const isAdmin = await this.isBotAdmin(chatId);
        if (!isAdmin) {
            // Если не админ - отправляем сообщение и выходим из настройки
            await this.bot.sendMessage(chatId,
                `⚠️ <b>Для настройки расписания мне нужно быть администратором группы</b>\n\n` +
                `1. Сделайте меня администратором с минимальными правами чтения, хотя бы на время настройки.\n` +
                `2. Начните настройку заново командой /config`,
                {
                    parse_mode: 'HTML',
                    message_thread_id: pending.message_thread_id || undefined
                }
            );
            
            // Сбрасываем все флаги
			if (pending.waitingForTownInput) pending.waitingForTownInput = 0;
			if (pending.waitingForManualInput) pending.waitingForManualInput = false;
			// Очищаем сессию настройки
            this.pendingConfigs.delete(chatId);
            return;
        }

        // Отправляем сообщение с запросом города и кнопкой отмены
        const sentMessage = await this.bot.sendMessage(chatId,
            `🏙️ <b>Для получения расписания в своем городе</b>\n\n` +
            `Пришлите мне, пожалуйста, <b>название своего города</b>.\n` +
            `Постарайтесь написать его так, как город называется на картах.\n\n` +
            `<i>Например:</i> Москва, Санкт-Петербург, Казань\n\n`+
			`Возможен поиск по части названия.`,
            {
                parse_mode: 'HTML',
                reply_markup: {
                    inline_keyboard: [[
                        { text: '❌ Отмена', callback_data: 'cancel_config' }
                    ]]
                },
                message_thread_id: pending.message_thread_id || undefined
            }
        );

        // Обновляем состояние сессии
        pending.waitingForTownInput = 1;  // Новый флаг, нужно добавить
        pending.lastMessageId = sentMessage.message_id;
        pending.lastContentMessageId = null;  // Сбрасываем, так как это новый шаг
        this.pendingConfigs.set(chatId, pending);

        //console.log(`Запрошен город для chatId ${chatId}`);

      } catch (err) {this.sendErrorMessage('Ошибка в getTownSlug: ' + err);}
	}
}

module.exports = SlaveBot;
