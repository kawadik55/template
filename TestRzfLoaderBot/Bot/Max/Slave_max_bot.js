// Slave_max_bot.js
const { Bot, InlineKeyboard } = require('@maxhub/max-bot-api');

class SlaveMaxBot {
    constructor(token, onConfigUpdate, mainChatNewsRef, mainArea, needTown) {
        this.bot = new Bot(token);
        this.onConfigUpdate = onConfigUpdate;
        this.pendingConfigs = new Map();
        this.pendingChannelSetup = null;
        this.cleanupTimer = null;
        this.botName = null;
        this.botUsername = null;
        this.last502ErrorTime = 0;
        this.recoveryTimer = null;

        this.chat_news = mainChatNewsRef || {};
        this.area = mainArea || '';
        this.needTown = needTown || false;

        this.requests = new Map();
        this.requestId = 0;

        this.initbotname();
        this.setupHandlers();
        this.setupCleanupTimer();

        this.bot.start();//запускаем бот

        console.log('SlaveMaxBot запущен');
    }

    async sendCommand(command, data = {}) {
        const id = ++this.requestId;

        return new Promise((resolve, reject) => {
            this.requests.set(id, { resolve, reject });

            this.saveConfig(command, {
                requestId: id,
                data: data
            });

            setTimeout(() => {
                if (this.requests.has(id)) {
                    this.requests.delete(id);
                    reject(new Error('Таймаут: мастер не ответил'));
                }
            }, 5000);
        });
    }

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
            const botInfo = await this.bot.api.getMe();
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
        const self = this;

        // Команда /config
        this.bot.command('config', async (ctx) => {
            try {
                const chatId = ctx.chat.id;
                const chatTitle = ctx.chat.title || ctx.chat.username || `Чат ${chatId}`;
                const fromId = ctx.from.id;

                const messageId = ctx.message.message_id;
                const botCanDelete = await self.isBotAdmin(chatId, true);
                if (chatId < 0) {
                    if (!await self.checkAdminRights(chatId, fromId)) {
                        try {
                            if (botCanDelete) await self.bot.api.deleteMessage(chatId, messageId);
                        } catch (e) {}
                        return;
                    }
                }

                const messageThreadId = ctx.message.message_thread_id || "";
                if (!botCanDelete) {
                    await self.checkBotPerm(chatId, messageThreadId);
                    return;
                }

                await self.startConfigProcess(chatId, chatTitle, messageThreadId);
            } catch (err) {
                self.sendErrorMessage('Ошибка в /config: ' + err);
            }
        });

        // Команда /start
        this.bot.command('start', async (ctx) => {
            try {
                const chatId = ctx.chat.id;
                const fromId = ctx.from.id;
                const params = ctx.match ? ctx.match[1] : null;
                const chatTitle = ctx.chat.title || ctx.chat.username || `Чат ${chatId}`;
                const botCanDelete = await self.isBotAdmin(chatId, true);

                const messageId = ctx.message.message_id;
                if (chatId < 0) {
                    if (!await self.checkAdminRights(chatId, fromId)) {
                        try {
                            if (botCanDelete) await self.bot.api.deleteMessage(chatId, messageId);
                        } catch (e) {}
                        return;
                    }
                }

                await new Promise(resolve => setTimeout(resolve, 1000));

                let chatType;
                try {
                    const chat = await self.bot.api.getChat(chatId);
                    chatType = chat.type;
                } catch (e) {
                    chatType = 'unknown';
                }

                if (chatId > 0 && params === 'channel_setup') {
                    await self.showChannelSelection(fromId);
                    return;
                }

                // В MAX API тип канала - 'channel'
                if (chatType === 'channel') {
                    if (!self.botUsername) await self.initbotname();

                    await self.bot.api.sendMessage(chatId,
                        `📢 <b>Настройка бота для канала</b>\n\n` +
                        `<b>Для настройки канала:</b>\n` +
                        `1. Перейдите в приватный чат с ботом @${self.botUsername}\n` +
                        `2. Используйте команду /config_channel\n` +
                        `3. Выберите этот канал из списка\n\n` +
                        `<b>Только администраторы канала могут выполнить настройку.</b>`,
                        { parse_mode: 'HTML' }
                    );
                    return;
                }

                if (chatId > 0) {
                    await self.showPrivateChatHelp(fromId);
                    return;
                }

                const messageThreadId = ctx.message.message_thread_id || "";
                if (!botCanDelete) {
                    await self.checkBotPerm(chatId, messageThreadId);
                    return;
                }
                await self.startConfigProcess(chatId, chatTitle, messageThreadId);
            } catch (err) {
                self.sendErrorMessage('Ошибка в /start: ' + err);
            }
        });

        // Команда /info
        this.bot.command('info', async (ctx) => {
            try {
                const chatId = ctx.chat.id;
                const fromId = ctx.from.id;

                const messageId = ctx.message.message_id;
                const botCanDelete = await self.isBotAdmin(chatId, true);
                if (chatId < 0) {
                    if (!await self.checkAdminRights(chatId, fromId)) {
                        try {
                            if (botCanDelete) await self.bot.api.deleteMessage(chatId, messageId);
                        } catch (e) {}
                        return;
                    }
                }

                if (!botCanDelete) {
                    await self.checkBotPerm(chatId, ctx.message.message_thread_id || undefined);
                    return;
                }

                const info = await self.getChatInfo(chatId);
                await self.bot.api.sendMessage(chatId, info, { parse_mode: 'HTML' });
            } catch (err) {
                self.sendErrorMessage('Ошибка в /info: ' + err);
            }
        });

        // Команда /help
        this.bot.command('help', async (ctx) => {
            try {
                const chatId = ctx.chat.id;
                const fromId = ctx.from.id;

                const messageId = ctx.message.message_id;
                const botCanDelete = await self.isBotAdmin(chatId, true);
                if (chatId < 0) {
                    if (!await self.checkAdminRights(chatId, fromId)) {
                        try {
                            if (botCanDelete) await self.bot.api.deleteMessage(chatId, messageId);
                        } catch (e) {}
                        return;
                    }
                }
                if (!botCanDelete) {
                    await self.checkBotPerm(chatId, ctx.message.message_thread_id || undefined);
                    return;
                }

                let chatType;
                try {
                    const chat = await self.bot.api.getChat(chatId);
                    chatType = chat.type;
                } catch (e) {
                    chatType = 'unknown';
                }

                let helpText = `<b>🤖 Команды бота:</b>\n\n`;

                // В MAX API тип канала - 'channel', тип группы - 'chat'
                if (chatType === 'channel') {
                    helpText += `<b>📢 Для каналов:</b>\n` +
                        `/start - показать инструкцию по настройке\n\n` +
                        `<b>Как настроить:</b>\n` +
                        `1. Перейдите в приватный чат с ботом\n` +
                        `2. Используйте /config_channel\n` +
                        `3. Выберите этот канал\n\n`;
                } else if (chatType === 'chat') { // В MAX все группы - это 'chat'
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

                await self.bot.api.sendMessage(chatId, helpText, { parse_mode: 'HTML' });
            } catch (err) {
                self.sendErrorMessage('Ошибка в /help: ' + err);
            }
        });

        // Команда /config_channel
        this.bot.command('config_channel', async (ctx) => {
            try {
                const userId = ctx.from.id;
                const chatId = ctx.chat.id;

                if (chatId > 0) {
                    await self.showChannelSelection(userId);
                }
            } catch (err) {
                self.sendErrorMessage('Ошибка в /config_channel: ' + err);
            }
        });

        // Команда /setup_channel
        this.bot.command('setup_channel', async (ctx) => {
            try {
                const userId = ctx.from.id;
                if (!self.botUsername) await self.initbotname();
                const botUsername = '@' + self.botUsername;

                const deepLink = `https://t.me/${botUsername}?start=channel_setup`;

                await self.bot.api.sendMessage(userId,
                    `🔗 <b>Ссылка для настройки канала:</b>\n\n` +
                    `1. Перейдите по ссылке: ${deepLink}\n` +
                    `2. Бот предложит выбрать канал\n` +
                    `3. Настройте часовой пояс и контент\n\n` +
                    `<b>Примечание:</b> Вы должны быть администратором канала.`,
                    { parse_mode: 'HTML' }
                );
            } catch (err) {
                self.sendErrorMessage('Ошибка в /setup_channel: ' + err);
            }
        });

        // Обработка callback-запросов
        this.bot.on('callback_query', async (ctx) => {
            try {
                const chatId = ctx.chat.id;
                const data = ctx.data;
                const fromId = ctx.from.id;

                if (chatId < 0) {
                    if (!await self.checkAdminRights(chatId, fromId)) {
                        await ctx.answerCallbackQuery();
                        return;
                    }
                }

                if (data.startsWith('timezone_')) {
                    const timezone = data.replace('timezone_', '');
                    const messageThreadId = ctx.message?.message_thread_id || "";

                    try {
                        await self.bot.api.deleteMessage(chatId, ctx.message.message_id);
                    } catch (e) {}

                    await self.handleTimezoneSelection(chatId, timezone, messageThreadId);
                    await ctx.answerCallbackQuery();

                } else if (data === 'manual_timezone') {
                    const pending = self.pendingConfigs.get(chatId);
                    if (pending) {
                        if (pending.lastMessageId) {
                            try {
                                await self.bot.api.deleteMessage(chatId, pending.lastMessageId);
                            } catch (e) {}
                        }

                        pending.waitingForManualInput = true;
                        self.pendingConfigs.set(chatId, pending);
                    }

                    const keyboard = new InlineKeyboard();
                    keyboard.row();
                    keyboard.button('Отмена', 'cancel_config');

                    const sentMessage = await self.bot.api.sendMessage(chatId,
                        `<b>Отправьте смещение часового пояса в формате:</b>\n` +
                        `• +3 (для UTC+3)\n` +
                        `• -5 (для UTC-5)\n` +
                        `• 0 (для UTC±0)\n`,
                        {
                            parse_mode: 'HTML',
                            reply_markup: keyboard,
                            message_thread_id: pending ? pending.message_thread_id || undefined : undefined
                        }
                    );

                    if (pending) {
                        pending.lastMessageId = sentMessage.message_id;
                        self.pendingConfigs.set(chatId, pending);
                    }

                    await ctx.answerCallbackQuery();

                } else if (data === 'cancel_config') {
                    const pending = self.pendingConfigs.get(chatId);

                    if (pending) {
                        if (pending.waitingForTownInput) pending.waitingForTownInput = 0;
                        if (pending.waitingForManualInput) pending.waitingForManualInput = false;
                    }

                    if (pending && pending.lastMessageId) {
                        try {
                            await self.bot.api.deleteMessage(chatId, pending.lastMessageId);
                        } catch (e) {}
                    }

                    if (pending && pending.lastContentMessageId) {
                        try {
                            await self.bot.api.deleteMessage(chatId, pending.lastContentMessageId);
                        } catch (e) {}
                    }

                    self.pendingConfigs.delete(chatId);

                    try {
                        await self.bot.api.deleteMessage(chatId, ctx.message.message_id);
                    } catch (e) {}

                    await self.bot.api.sendMessage(chatId, '⚙️ Настройка отменена.', {
                        message_thread_id: pending ? pending.message_thread_id || undefined : undefined
                    });
                    await ctx.answerCallbackQuery();

                } else if (data.startsWith('content_')) {
                    const contentType = data.replace('content_', '');
                    await self.handleContentSelection(chatId, contentType);
                    await ctx.answerCallbackQuery();

                } else if (data === 'save_config') {
                    const pending = self.pendingConfigs.get(chatId);
                    if (pending && pending.lastContentMessageId) {
                        try {
                            await self.bot.api.deleteMessage(chatId, pending.lastContentMessageId);
                        } catch (e) {}
                    }

                    if (self.needTown && pending && pending.contentSettings && pending.contentSettings.Raspis) {
                        await self.getTownSlug(chatId);
                    } else {
                        await self.finishConfig(chatId);
                    }
                    await ctx.answerCallbackQuery();

                } else if (data === 'channel_by_id') {
                    const userId = ctx.from.id;

                    const pending = self.pendingConfigs.get(userId);
                    if (pending && pending.lastMessageId) {
                        try {
                            await self.bot.api.deleteMessage(userId, pending.lastMessageId);
                        } catch (e) {}
                    }

                    await self.requestChannelId(userId);
                    await ctx.answerCallbackQuery();

                } else if (data === 'channel_help') {
                    const userId = ctx.from.id;

                    const pending = self.pendingConfigs.get(userId);
                    if (pending && pending.lastMessageId) {
                        try {
                            await self.bot.api.deleteMessage(userId, pending.lastMessageId);
                        } catch (e) {}
                    }

                    await self.showChannelHelp(userId);
                    await ctx.answerCallbackQuery();

                } else if (data.startsWith('edit_channel_')) {
                    const channelId = data.replace('edit_channel_', '');
                    const userId = ctx.from.id;

                    const pending = self.pendingConfigs.get(userId);
                    if (pending && pending.lastMessageId) {
                        try {
                            await self.bot.api.deleteMessage(userId, pending.lastMessageId);
                        } catch (e) {}
                    }

                    let channelTitle = `Канал ${channelId}`;
                    try {
                        const chat = await self.bot.api.getChat(channelId);
                        channelTitle = chat.title;
                    } catch (err) {
                        console.error('Ошибка получения информации о канале:', err);
                    }

                    await self.startChannelEdit(userId, channelId, channelTitle);
                    await ctx.answerCallbackQuery();

                } else if (data.startsWith('remove_channel_')) {
                    const channelId = data.replace('remove_channel_', '');
                    const userId = ctx.from.id;

                    const pending = self.pendingConfigs.get(userId);
                    if (pending && pending.lastMessageId) {
                        try {
                            await self.bot.api.deleteMessage(userId, pending.lastMessageId);
                        } catch (e) {}
                    }

                    await self.removeChannelFromConfig(userId, channelId);
                    await ctx.answerCallbackQuery();

                } else if (data.startsWith('confirm_remove_channel_')) {
                    const channelId = data.replace('confirm_remove_channel_', '');
                    const userId = ctx.from.id;

                    const pending = self.pendingConfigs.get(userId);
                    if (pending && pending.lastMessageId) {
                        try {
                            await self.bot.api.deleteMessage(userId, pending.lastMessageId);
                        } catch (e) {}
                    }

                    const removed = self.removeChatFromAllTimezones(channelId, true);

                    if (removed) {
                        await self.bot.api.sendMessage(userId,
                            `✅ <b>Канал успешно удален из рассылки.</b>\n\n` +
                            `Чтобы снова добавить канал, используйте /config_channel`,
                            { parse_mode: 'HTML' }
                        );
                    } else {
                        await self.bot.api.sendMessage(userId,
                            `❌ <b>Не удалось удалить канал.</b>\n` +
                            `Возможно, он уже был удален ранее.`,
                            { parse_mode: 'HTML' }
                        );
                    }

                    await ctx.answerCallbackQuery();

                } else if (data === 'cancel_remove_channel') {
                    const userId = ctx.from.id;

                    const pending = self.pendingConfigs.get(userId);
                    if (pending && pending.lastMessageId) {
                        try {
                            await self.bot.api.deleteMessage(userId, pending.lastMessageId);
                        } catch (e) {}
                    }

                    await self.bot.api.sendMessage(userId, '⚙️ Удаление отменено.');
                    await ctx.answerCallbackQuery();

                } else if (data === 'cancel_channel_setup') {
                    const userId = ctx.from.id;

                    const pending = self.pendingConfigs.get(userId);
                    if (pending && pending.lastMessageId) {
                        try {
                            await self.bot.api.deleteMessage(userId, pending.lastMessageId);
                        } catch (e) {}
                    }

                    if (pending && pending.lastContentMessageId) {
                        try {
                            await self.bot.api.deleteMessage(userId, pending.lastContentMessageId);
                        } catch (e) {}
                    }

                    self.pendingChannelSetup = null;
                    self.pendingConfigs.delete(userId);

                    await self.bot.api.sendMessage(userId, '⚙️ Настройка канала отменена.');
                    await ctx.answerCallbackQuery();

                } else if (data === 'back_to_channel_select') {
                    const userId = ctx.from.id;

                    const pending = self.pendingConfigs.get(userId);
                    if (pending && pending.lastMessageId) {
                        try {
                            await self.bot.api.deleteMessage(userId, pending.lastMessageId);
                        } catch (e) {}
                    }

                    await self.showChannelSelection(userId);
                    await ctx.answerCallbackQuery();
                }

            } catch (err) {
                self.sendErrorMessage('Ошибка в callback_query: ' + err);
                try {
                    await ctx.answerCallbackQuery({
                        text: '❌ Произошла ошибка',
                        show_alert: true
                    });
                } catch (e) {}
            }
        });

        // Обработка текстовых сообщений
        this.bot.on('message', async (ctx) => {
            try {
                const text = ctx.message.text;
                if (!text || text.startsWith('/')) return;

                const chatId = ctx.chat.id;
                const userId = ctx.from.id;

                const pending = self.pendingConfigs.get(chatId);
                if (pending && pending.waitingForManualInput) {
                    const timezone = self.parseTimezoneInput(text);
                    if (timezone) {
                        if (pending.lastMessageId) {
                            try {
                                await self.bot.api.deleteMessage(chatId, pending.lastMessageId);
                            } catch (e) {}
                        }

                        await self.handleTimezoneSelection(chatId, timezone, pending.message_thread_id || "");
                    } else {
                        const sentMessage = await self.bot.api.sendMessage(chatId,
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

                        pending.lastMessageId = sentMessage.message_id;
                        self.pendingConfigs.set(chatId, pending);
                    }
                } else if (pending && pending.waitingForTownInput === 1) {
                    const townName = text.trim();
                    if (pending.lastMessageId) {
                        try {
                            await self.bot.api.deleteMessage(chatId, pending.lastMessageId);
                        } catch (e) {}
                    }
                    if (townName.length < 3) {
                        const keyboard = new InlineKeyboard();
                        keyboard.row();
                        keyboard.button('❌ Отмена', 'cancel_config');
                        const sentMessage = await self.bot.api.sendMessage(chatId,
                            `⚠️ <b>Слишком короткое название.</b>\n\n` +
                            `Введите минимум 3 символа.\n` +
                            `(вы ввели: "${townName}")`,
                            {
                                parse_mode: 'HTML',
                                reply_markup: keyboard,
                                message_thread_id: pending.message_thread_id || undefined
                            }
                        );
                        pending.lastMessageId = sentMessage.message_id;
                        self.pendingConfigs.set(chatId, pending);
                        return;
                    }

                    if (!townName) {
                        const keyboard = new InlineKeyboard();
                        keyboard.row();
                        keyboard.button('❌ Отмена', 'cancel_config');
                        const sentMessage = await self.bot.api.sendMessage(chatId,
                            '❌ <b>Название города не может быть пустым.</b>\n\n' +
                            'Пожалуйста, введите название города:',
                            {
                                parse_mode: 'HTML',
                                reply_markup: keyboard,
                                message_thread_id: pending.message_thread_id || undefined
                            }
                        );

                        pending.lastMessageId = sentMessage.message_id;
                        self.pendingConfigs.set(chatId, pending);
                        return;
                    }

                    try {
                        const result = await self.sendCommand('find_town', { name: townName });

                        if (!result || result.length === 0) {
                            throw new Error('Город не найден');
                        }
                        if (result.length > 5) {
                            const keyboard = new InlineKeyboard();
                            keyboard.row();
                            keyboard.button('❌ Отмена', 'cancel_config');
                            const sentMessage = await self.bot.api.sendMessage(chatId,
                                `⚠️ <b>Слишком много городов (${result.length}).</b>\n\n` +
                                `Уточните название (минимум 3 символа).`,
                                {
                                    parse_mode: 'HTML',
                                    reply_markup: keyboard,
                                    message_thread_id: pending.message_thread_id || undefined
                                }
                            );
                            pending.lastMessageId = sentMessage.message_id;
                            self.pendingConfigs.set(chatId, pending);
                            return;
                        }

                        if (result.length === 1) {
                            pending.townData = {
                                name: result[0].town,
                                slug: result[0].slug
                            };
                            pending.waitingForTownInput = 0;

                            await self.finishConfig(chatId);
                            self.pendingConfigs.set(chatId, pending);
                            return;
                        }

                        const citiesList = result.map(item => `<code>${item.town}</code>`).join('\n');
                        const keyboard = new InlineKeyboard();
                        keyboard.row();
                        keyboard.button('❌ Отмена', 'cancel_config');
                        const listMessage = await self.bot.api.sendMessage(chatId,
                            `🔍 <b>Найдено несколько городов:</b>\n\n` +
                            `${citiesList}\n\n` +
                            `📋 <b>Скопируйте один нужный город и пришлите его сюда.</b>\n` +
                            `(просто тапните по названию и вставьте)`,
                            {
                                parse_mode: 'HTML',
                                reply_markup: keyboard,
                                message_thread_id: pending.message_thread_id || undefined
                            }
                        );
                        pending.lastMessageId = listMessage.message_id;
                        self.pendingConfigs.set(chatId, pending);

                    } catch (error) {
                        const keyboard = new InlineKeyboard();
                        keyboard.row();
                        keyboard.button('❌ Отмена', 'cancel_config');
                        const errorMessage = await self.bot.api.sendMessage(chatId,
                            `❌ <b>Не удалось найти город.</b>\n\n` +
                            `${townName}\n\n` +
                            `Попробуйте ввести название иначе или нажмите "Отмена".`,
                            {
                                parse_mode: 'HTML',
                                reply_markup: keyboard,
                                message_thread_id: pending.message_thread_id || undefined
                            }
                        );
                        pending.lastMessageId = errorMessage.message_id;
                        self.pendingConfigs.set(chatId, pending);
                    }
                } else if (pending && self.pendingChannelSetup?.waitingForChannelId) {
                    const userId = ctx.from.id;
                    const channelIdInput = ctx.message.text.trim();

                    const userPending = self.pendingConfigs.get(userId);
                    if (userPending && userPending.lastMessageId) {
                        try {
                            await self.bot.api.deleteMessage(userId, userPending.lastMessageId);
                        } catch (e) {}
                    }

                    await self.processChannelInput(userId, channelIdInput, 'id');
                    self.pendingChannelSetup = null;
                }
            } catch (err) {
                self.sendErrorMessage('Ошибка в обработке сообщения: ' + err);
            }
        });

        // ============ ОБРАБОТКА ИЗМЕНЕНИЯ СТАТУСА БОТА ============
        this.bot.on('chat_member', async (ctx) => {
            try {
                const chatId = ctx.chat.id;
                const newStatus = ctx.new_chat_member?.status;
                const oldStatus = ctx.old_chat_member?.status;
                const botId = this.bot.token.split(':')[0];
                
                // Проверяем, что изменение касается бота
                const userId = ctx.new_chat_member?.user?.id || ctx.old_chat_member?.user?.id;
                if (userId && userId.toString() !== botId) {
                    return;
                }
                
                // Бота удалили из чата
                if (newStatus === 'left' || newStatus === 'kicked') {
                    await this.removeChatFromConfig(chatId, false);
                    console.log(`Бот удален из чата ${chatId}`);
                    return;
                }
                
                // Бота добавили в чат
                if ((oldStatus === 'left' || oldStatus === 'kicked') && 
                    (newStatus === 'member' || newStatus === 'administrator')) {
                    
                    setTimeout(async () => {
                        try {
                            let chatType;
                            try {
                                const chat = await this.bot.api.getChat(chatId);
                                chatType = chat.type;
                            } catch (e) {
                                chatType = 'unknown';
                            }
                            
                            if (chatType === 'channel') {
                                if (!this.botUsername) await this.initbotname();
                                
                                await this.bot.api.sendMessage(chatId,
                                    `📢 <b>Настройка бота для канала</b>\n\n` +
                                    `<b>Для настройки канала:</b>\n` +
                                    `1. Перейдите в приватный чат с ботом @${this.botUsername}\n` +
                                    `2. Используйте команду /config_channel\n` +
                                    `3. Выберите этот канал из списка\n\n` +
                                    `<b>Только администраторы канала могут выполнить настройку.</b>`,
                                    { parse_mode: 'HTML' }
                                );
                            } else if (chatType === 'dialog') {
                                return;
                            } else {
                                if (!this.botName) await this.initbotname();
                                
                                await this.bot.api.sendMessage(chatId,
                                    `👋 <b>Привет! Я бот "${this.botName}".</b>\n\n` +
                                    `Чтобы настроить рассылку в этот чат, используйте команду\n` +
                                    `/config\n` +
                                    `в нужной теме.\n` +
                                    `На время настройки отключите анонимность админа.\n` +
                                    `<b>Только администраторы чата могут выполнить настройку.</b>`,
                                    { parse_mode: 'HTML' }
                                );
                                
                                await this.checkBotPerm(chatId);
                            }
                        } catch (err) {
                            console.error('Ошибка приветствия:', err);
                        }
                    }, 1500);
                }
            } catch (err) {
                this.sendErrorMessage('Ошибка в chat_member: ' + err);
            }
        });

        // Обработка ошибок бота
        this.bot.on('polling_error', (error) => {
            if (self.recoveryTimer) return;

            if (error.message && (error.message.includes('502') || error.message.includes('Bad Gateway'))) {
                self.sendErrorMessage('Polling error in SlaveMaxBot: ' + error.message);
                const checkConnection = (delay) => {
                    self.recoveryTimer = setTimeout(() => {
                        self.bot.api.getMe().then(() => {
                            self.sendErrorMessage('Polling return in SlaveMaxBot: Polling восстановлен');
                            self.recoveryTimer = null;
                        }).catch(() => {
                            checkConnection(Math.min(delay * 2, 60000));
                        });
                    }, delay);
                };
                checkConnection(15000);
            }
        });

        this.bot.on('error', (error) => {
            self.sendErrorMessage('General error in SlaveMaxBot: ' + error.message);
        });
    }

    async showPrivateChatHelp(userId) {
        try {
            if (!this.botName) await this.initbotname();

            await this.bot.api.sendMessage(userId,
                `👋 <b>Привет! Я бот "${this.botName}".</b>\n\n` +
                `<b>Вы можете настроить:</b>\n\n` +
                `👤 <b>Приватный чат</b> - просто используйте /config\n\n` +
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
            this.pendingChannelSetup = null;
            const oldPending = this.pendingConfigs.get(userId);
            if (oldPending) {
                if (oldPending.lastMessageId) {
                    try {
                        await this.bot.api.deleteMessage(userId, oldPending.lastMessageId);
                    } catch (e) {}
                }
                if (oldPending.lastContentMessageId) {
                    try {
                        await this.bot.api.deleteMessage(userId, oldPending.lastContentMessageId);
                    } catch (e) {}
                }
            }

            const keyboard = new InlineKeyboard();
            keyboard.row();
            keyboard.button('🆔 Ввести ID канала', 'channel_by_id');
            keyboard.row();
            keyboard.button('❓ Как получить ID канала?', 'channel_help');
            keyboard.row();
            keyboard.button('❌ Отмена', 'cancel_channel_setup');

            const sentMessage = await this.bot.api.sendMessage(userId,
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

            this.pendingConfigs.set(userId, {
                userId: userId,
                timestamp: Date.now(),
                lastMessageId: sentMessage.message_id,
                lastContentMessageId: null,
                waitingForManualInput: false,
                configType: 'channel_selection',
                waitingForTownInput: 0
            });

        } catch (err) {
            this.sendErrorMessage('Ошибка showChannelSelection: ' + err);
        }
    }

    async checkAdminRights(chatId, userId) {
        try {
            if (chatId > 0) return true;

            const chatMember = await this.bot.api.getChatMember(chatId, userId);
            return ['administrator', 'creator'].includes(chatMember.status);
        } catch (err) {
            this.sendErrorMessage('Ошибка проверки прав: ' + err);
            return false;
        }
    }

    async startConfigProcess(chatId, chatTitle, messageThreadId = "") {
        try {
            const oldPending = this.pendingConfigs.get(chatId);
            if (oldPending) {
                if (oldPending.lastMessageId) {
                    try {
                        await this.bot.api.deleteMessage(chatId, oldPending.lastMessageId);
                    } catch (e) {}
                }
                if (oldPending.lastContentMessageId) {
                    try {
                        await this.bot.api.deleteMessage(chatId, oldPending.lastContentMessageId);
                    } catch (e) {}
                }
            }

            this.pendingConfigs.delete(chatId);

            const existing = this.findChatInConfig(chatId);

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

            const pendingData = {
                chatTitle,
                timestamp: Date.now(),
                waitingForManualInput: false,
                oldSettings: existing,
                message_thread_id: messageThreadId,
                timezoneOffset: null,
                contentSettings: contentSettings,
                lastContentMessageId: null,
                lastMessageId: null,
                waitingForTownInput: 0
            };

            this.pendingConfigs.set(chatId, pendingData);

            let chatType = 'чата';
            try {
                const chat = await this.bot.api.getChat(chatId);
                if (chat.type === 'channel') chatType = 'канала';
                if (chat.type === 'chat') chatType = 'группы';
            } catch (e) {}

            const keyboard = this.createTimezoneKeyboard();

            let message = `⚙️ <b>Настройка бота для ${chatType}:</b> "${this.escapeHtml(chatTitle)}"\n\n` +
                `<b>Шаг 1/2: Выберите часовой пояс</b>\n` +
                `(Публикации будут выходить в указанное время по вашему часовому поясу)`;

            if (existing) {
                const hours = Math.abs(existing.offset / 60);
                const sign = existing.offset >= 0 ? '+' : '-';
                message += `\n\n📋 <b>Текущие настройки:</b> UTC${sign}${hours} ч.\n`;
            }

            if (messageThreadId) {
                message += `📌 <b>Тема форума:</b> ID ${messageThreadId}\n`;
            }

            const sentMessage = await this.bot.api.sendMessage(chatId, message, {
                parse_mode: 'HTML',
                reply_markup: keyboard,
                message_thread_id: messageThreadId || undefined
            });

            pendingData.lastMessageId = sentMessage.message_id;
            this.pendingConfigs.set(chatId, pendingData);

        } catch (err) {
            this.sendErrorMessage('Ошибка startConfigProcess: ' + err);
            await this.bot.api.sendMessage(chatId, '❌ Произошла ошибка при настройке.', {
                message_thread_id: messageThreadId || undefined
            });
        }
    }

    createTimezoneKeyboard() {
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

        const keyboard = new InlineKeyboard();

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
            if (row.length > 0) {
                keyboard.row();
                row.forEach(btn => keyboard.button(btn.text, btn.callback_data));
            }
        }

        keyboard.row();
        keyboard.button('✏️ Другой пояс', 'manual_timezone');
        keyboard.row();
        keyboard.button('❌ Отмена', 'cancel_config');

        return keyboard;
    }

    parseTimezoneInput(text) {
        text = text.trim();

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
                await this.bot.api.sendMessage(chatId, '❌ Сессия настройки истекла. Начните заново с /config', {
                    message_thread_id: messageThreadId || undefined
                });
                return;
            }

            const offsetNum = parseInt(timezoneOffset, 10);
            if (isNaN(offsetNum)) {
                this.sendErrorMessage('handleTimezoneSelection: Неверный формат timezoneOffset: ' + timezoneOffset);
                await this.bot.api.sendMessage(chatId, '❌ Ошибка: неверный формат часового пояса', {
                    message_thread_id: pending.message_thread_id || undefined
                });
                return;
            }

            if (offsetNum < -720 || offsetNum > 840) {
                this.sendErrorMessage('handleTimezoneSelection: Часовой пояс вне диапазона: ' + offsetNum);
                await this.bot.api.sendMessage(chatId, '❌ Ошибка: часовой пояс вне допустимого диапазона (-12...+14 часов)', {
                    message_thread_id: pending.message_thread_id || undefined
                });
                return;
            }

            pending.timezoneOffset = offsetNum;
            pending.lastMessageId = null;
            this.pendingConfigs.set(chatId, pending);

            await this.showContentSelection(chatId);

        } catch (err) {
            this.sendErrorMessage('Ошибка handleTimezoneSelection: ' + err);
            const pending = this.pendingConfigs.get(chatId);
            await this.bot.api.sendMessage(chatId, '❌ Произошла ошибка при выборе часового пояса.', {
                message_thread_id: pending ? pending.message_thread_id || undefined : undefined
            });
        }
    }

    async showContentSelection(chatId) {
        try {
            const pending = this.pendingConfigs.get(chatId);
            if (!pending) {
                await this.bot.api.sendMessage(chatId, '❌ Сессия настройки истекла. Начните заново с /config', {
                    message_thread_id: pending ? pending.message_thread_id || undefined : undefined
                });
                return;
            }

            const keyboard = this.createContentKeyboard(pending.contentSettings);

            const message = `⚙️ <b>Настройка бота для чата:</b> "${this.escapeHtml(pending.chatTitle)}"\n\n` +
                `<b>Шаг 2/2: Выберите нужный контент</b>\n\n` +
                `✅ - будет получать\n` +
                `❌ - не будет получать\n\n`;

            const sentMessage = await this.bot.api.sendMessage(chatId, message, {
                parse_mode: 'HTML',
                reply_markup: keyboard,
                message_thread_id: pending.message_thread_id || undefined
            });

            pending.lastContentMessageId = sentMessage.message_id;
            pending.lastMessageId = sentMessage.message_id;
            this.pendingConfigs.set(chatId, pending);

        } catch (err) {
            this.sendErrorMessage('Ошибка showContentSelection: ' + err);
            const pending = this.pendingConfigs.get(chatId);
            await this.bot.api.sendMessage(chatId, '❌ Произошла ошибка при настройке контента.', {
                message_thread_id: pending ? pending.message_thread_id || undefined : undefined
            });
        }
    }

    createContentKeyboard(contentSettings) {
        const keyboard = new InlineKeyboard();

        keyboard.row();
        keyboard.button(`${contentSettings.Eg ? '✅' : '❌'} Ежедневник`, 'content_Eg');
        keyboard.button(`${contentSettings.News ? '✅' : '❌'} Новости`, 'content_News');

        keyboard.row();
        keyboard.button(`${contentSettings.Raspis ? '✅' : '❌'} Расписание`, 'content_Raspis');

        keyboard.row();
        keyboard.button('💾 Сохранить', 'save_config');

        keyboard.row();
        keyboard.button('❌ Отмена', 'cancel_config');

        return keyboard;
    }

    async handleContentSelection(chatId, contentType) {
        try {
            const pending = this.pendingConfigs.get(chatId);
            if (!pending) {
                await this.bot.api.sendMessage(chatId, '❌ Сессия настройки истекла. Начните заново с /config', {
                    message_thread_id: pending ? pending.message_thread_id || undefined : undefined
                });
                return;
            }

            const contentSettings = pending.contentSettings || { Eg: true, News: true, Raspis: false };

            if (contentType === 'Eg' || contentType === 'News' || contentType === 'Raspis') {
                contentSettings[contentType] = !contentSettings[contentType];

                pending.contentSettings = contentSettings;

                const keyboard = this.createContentKeyboard(contentSettings);

                const message = `⚙️ <b>Настройка бота для чата:</b> "${this.escapeHtml(pending.chatTitle)}"\n\n` +
                    `<b>Шаг 2/2: Выберите нужный контент</b>\n\n` +
                    `✅ - будет получать\n` +
                    `❌ - не будет получать\n\n`;

                try {
                    await this.bot.api.editMessageText(chatId, pending.lastContentMessageId, message, {
                        parse_mode: 'HTML',
                        reply_markup: keyboard
                    });

                    this.pendingConfigs.set(chatId, pending);

                } catch (err) {
                    console.error('Ошибка редактирования сообщения:', err);
                    const sentMessage = await this.bot.api.sendMessage(chatId, message, {
                        parse_mode: 'HTML',
                        reply_markup: keyboard,
                        message_thread_id: pending.message_thread_id || undefined
                    });

                    pending.lastContentMessageId = sentMessage.message_id;
                    pending.lastMessageId = sentMessage.message_id;
                    this.pendingConfigs.set(chatId, pending);
                }
            }

        } catch (err) {
            this.sendErrorMessage('Ошибка handleContentSelection: ' + err);
            try {
                const pending = this.pendingConfigs.get(chatId);
                await this.bot.api.sendMessage(chatId, '❌ Произошла ошибка при выборе контента.', {
                    message_thread_id: pending ? pending.message_thread_id || undefined : undefined
                });
            } catch (e) {}
        }
    }

    async finishConfig(chatId) {
        try {
            let pending = this.pendingConfigs.get(chatId);

            if (!pending) {
                if (chatId > 0) {
                    await this.bot.api.sendMessage(chatId, '❌ Сессия настройки истекла. Начните заново с /config_channel');
                } else {
                    await this.bot.api.sendMessage(chatId, '❌ Сессия настройки истекла. Начните заново с /config');
                }
                return;
            }

            if (pending.lastContentMessageId) {
                try {
                    const messageChatId = pending.chatId || chatId;
                    await this.bot.api.deleteMessage(messageChatId, pending.lastContentMessageId);
                } catch (e) {}
            }

            if (pending.timezoneOffset === null) {
                await this.bot.api.sendMessage(chatId, '❌ Ошибка: часовой пояс не выбран', {
                    message_thread_id: pending.message_thread_id || undefined
                });
                return;
            }

            const contentSettings = pending.contentSettings || { Eg: true, News: true, Raspis: false };
            if (!contentSettings.Eg && !contentSettings.News && !contentSettings.Raspis) {
                await this.bot.api.sendMessage(chatId,
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
            const offsetKey = offsetNum >= 0 ? `+${offsetNum}` : `${offsetNum}`;

            if (!this.chat_news || typeof this.chat_news !== 'object') {
                this.chat_news = {};
            }

            const currentArray = this.chat_news[offsetKey] && Array.isArray(this.chat_news[offsetKey])
                ? this.chat_news[offsetKey]
                : [];

            const targetChatId = pending.isEdit ? pending.chatId : (pending.chatId || chatId);
            this.removeChatFromAllTimezones(targetChatId, true);

            if (!this.chat_news[offsetKey] || !Array.isArray(this.chat_news[offsetKey])) {
                this.chat_news[offsetKey] = currentArray;
            }

            const chatEntry = {};
            const chatTitle = pending.chatTitle || `chat_${targetChatId}`;

            chatEntry[chatTitle] = targetChatId.toString();
            chatEntry.message_thread_id = pending.message_thread_id || "";
            chatEntry.Eg = Boolean(contentSettings.Eg);
            chatEntry.News = Boolean(contentSettings.News);
            chatEntry.Raspis = Boolean(contentSettings.Raspis);

            if (pending.townData) {
                chatEntry.town = pending.townData.name;
                chatEntry.slug = pending.townData.slug;
            }

            if (Array.isArray(this.chat_news[offsetKey])) {
                this.chat_news[offsetKey] = this.chat_news[offsetKey].filter(chat => {
                    for (const [key, value] of Object.entries(chat)) {
                        if (key !== 'message_thread_id' && key !== 'Eg' && key !== 'News' && key !== 'Raspis' &&
                            (value.toString() === targetChatId.toString() || value === targetChatId)) {
                            return false;
                        }
                    }
                    return true;
                });
            } else {
                this.chat_news[offsetKey] = [];
            }

            this.chat_news[offsetKey].push(chatEntry);

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

                let threadInfo = '';
                if (chatEntry.message_thread_id) {
                    threadInfo = `📌 <b>Тема форума:</b> ID ${chatEntry.message_thread_id}\n`;
                }

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

                const targetUserId = pending.userId || chatId;

                await this.bot.api.sendMessage(targetUserId,
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
                await this.bot.api.sendMessage(targetUserId, '❌ Ошибка сохранения конфигурации.', {
                    message_thread_id: pending.message_thread_id || undefined
                });
            }

            this.pendingConfigs.delete(chatId);

        } catch (err) {
            this.sendErrorMessage('Ошибка finishConfig: ' + err);
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
            } catch (e) {}
            await this.bot.api.sendMessage(targetUserId, '❌ Произошла ошибка при сохранении настроек.', {
                message_thread_id: messageThreadId || undefined
            });
        }
    }

    async finishChannelConfig(userId) {
        const pending = this.pendingConfigs.get(userId);

        if (!pending) {
            await this.bot.api.sendMessage(userId, '❌ Сессия настройки истекла. Начните заново с /config_channel');
            return;
        }

        if (this.needTown && pending.contentSettings && pending.contentSettings.Raspis) {
            await this.getTownSlug(userId);
        } else {
            await this.finishConfig(userId);
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
            const existing = this.findChatInConfig(chatId);

            if (!existing) {
                if (showConfirm) {
                    await this.bot.api.sendMessage(chatId,
                        '❌ Этот чат не найден в настройках рассылки.', {
                            message_thread_id: existing && existing.threadId ? existing.threadId : undefined
                        }
                    );
                }
                return false;
            }

            const removed = this.removeChatFromAllTimezones(chatId, true);

            if (removed && showConfirm) {
                try {
                    await this.bot.api.sendMessage(chatId,
                        `✅ Чат "${existing.title}" удален из рассылки публикаций.`, {
                            message_thread_id: existing && existing.threadId ? existing.threadId : undefined
                        }
                    );
                } catch (err) {}
            }

            return removed;

        } catch (err) {
            this.sendErrorMessage('Ошибка removeChatFromConfig: ' + err);
            if (showConfirm) {
                try {
                    const existing = this.findChatInConfig(chatId);
                    await this.bot.api.sendMessage(chatId, '❌ Ошибка при удалении чата.', {
                        message_thread_id: existing && existing.threadId ? existing.threadId : undefined
                    });
                } catch (e) {}
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
                for (const [key, value] of Object.entries(chat)) {
                    if (key !== 'message_thread_id' && key !== 'Eg' && key !== 'News' && key !== 'Raspis' &&
                        (value.toString() === chatId.toString() || value === chatId)) {
                        chatName = key;
                        return false;
                    }
                }
                return true;
            });

            if (this.chat_news[timezoneKey].length !== initialLength) {
                removed = true;
            }

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
        const CHAT_CLEANUP_INTERVAL = 6 * 60 * 60 * 1000;
        let nextChatCleanup = Date.now() + CHAT_CLEANUP_INTERVAL;

        this.cleanupTimer = setInterval(() => {
            const now = Date.now();
            const timeout = 20 * 60 * 1000;

            for (const [chatId, data] of this.pendingConfigs.entries()) {
                if (now - data.timestamp > timeout) {
                    if (data.lastMessageId) {
                        try {
                            this.bot.api.deleteMessage(chatId, data.lastMessageId);
                        } catch (e) {}
                    }
                    if (data.lastContentMessageId) {
                        try {
                            this.bot.api.deleteMessage(chatId, data.lastContentMessageId);
                        } catch (e) {}
                    }

                    this.pendingConfigs.delete(chatId);
                    console.log(`Очищена устаревшая сессия для чата ${chatId}`);
                }
            }

            if (this.pendingChannelSetup && now - this.pendingChannelSetup.timestamp > timeout) {
                this.pendingChannelSetup = null;
                console.log('Очищена устаревшая сессия настройки канала');
            }

            if (now >= nextChatCleanup) {
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
                    for (const [key, value] of Object.entries(chat)) {
                        if (key !== 'message_thread_id' && key !== 'Eg' && key !== 'News' && key !== 'Raspis') {
                            chatId = value;
                            break;
                        }
                    }

                    if (!chatId) {
                        continue;
                    }

                    try {
                        await this.bot.api.getChat(chatId);
                        validChats.push(chat);
                    } catch (err) {
                        console.log(`Чат ${chatId} не существует или бот удален, удаляем из конфига`);
                        cleaned++;
                    }
                }

                this.chat_news[timezoneKey] = validChats;

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
                    this.bot.stop();
                    console.log('SlaveMaxBot остановлен');
                }

                if (this.cleanupTimer) {
                    clearInterval(this.cleanupTimer);
                    this.cleanupTimer = null;
                }

                this.pendingConfigs.clear();
                this.pendingChannelSetup = null;

                if (this.recoveryTimer) {
                    clearTimeout(this.recoveryTimer);
                    this.recoveryTimer = null;
                }

            } catch (err) {
                this.sendErrorMessage('Ошибка остановки SlaveMaxBot: ' + err);
            }
            resolve();
        });
    }

    getCurrentConfig() {
        return this.chat_news;
    }

    escapeMarkdown(text) {
        if (typeof text !== 'string') return text;
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
            const sentMessage = await this.bot.api.sendMessage(userId,
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
                    parse_mode: 'HTML'
                }
            );

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

            const keyboard = new InlineKeyboard();
            keyboard.row();
            keyboard.button('🆔 Ввести ID канала', 'channel_by_id');
            keyboard.row();
            keyboard.button('❌ Отмена', 'cancel_channel_setup');

            const sentMessage = await this.bot.api.sendMessage(userId, helpText, {
                parse_mode: 'HTML',
                reply_markup: keyboard
            });

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

            if (inputType === 'id') {
                if (channelIdentifier.startsWith('@')) {
                    const username = channelIdentifier.substring(1);

                    if (!username.match(/^[a-zA-Z0-9_]{5,32}$/)) {
                        const sentMessage = await this.bot.api.sendMessage(userId,
                            `❌ <b>Неверный формат юзернейма.</b>\n` +
                            `<b>Юзернейм должен содержать 5-32 символа:</b>\n` +
                            `• Латинские буквы a-z, A-Z\n` +
                            `• Цифры 0-9\n` +
                            `• Нижнее подчеркивание _\n\n` +
                            `<b>Используйте ID канала (начинается с -100)</b>`,
                            { parse_mode: 'HTML' }
                        );

                        const pending = this.pendingConfigs.get(userId);
                        if (pending) {
                            pending.lastMessageId = sentMessage.message_id;
                            this.pendingConfigs.set(userId, pending);
                        }
                        return;
                    }

                    try {
                        const chat = await this.bot.api.getChat(`@${username}`);

                        if (chat.type !== 'channel') {
                            await this.bot.api.sendMessage(userId,
                                `❌ <b>Это не канал.</b>\n` +
                                `"@${username}" — это ${chat.type}.\n` +
                                `<b>Используйте ID именно канала.</b>`,
                                { parse_mode: 'HTML' }
                            );
                            return;
                        }

                        await this.startChannelConfig(userId, chat.id, chat.title, 'username');

                    } catch (err) {
                        await this.bot.api.sendMessage(userId,
                            `❌ <b>Канал не найден или является частным.</b>\n\n` +
                            `<b>Используйте ID канала (начинается с -100)</b>`,
                            { parse_mode: 'HTML' }
                        );
                    }
                    return;
                }

                let channelIdNum = parseInt(channelIdentifier);

                if (isNaN(channelIdNum)) {
                    const sentMessage = await this.bot.api.sendMessage(userId,
                        `❌ <b>Неверный формат ID.</b>\n` +
                        `<b>ID канала должен быть числом, например:</b>\n` +
                        `-1001234567890\n\n` +
                        `<b>Используйте ID канала (начинается с -100)</b>`,
                        { parse_mode: 'HTML' }
                    );

                    const pending = this.pendingConfigs.get(userId);
                    if (pending) {
                        pending.lastMessageId = sentMessage.message_id;
                        this.pendingConfigs.set(userId, pending);
                    }
                    return;
                }

                if (channelIdNum > 0) {
                    channelIdNum = -1000000000000 - channelIdNum;
                }

                if (channelIdNum >= -1000000000000) {
                    const sentMessage = await this.bot.api.sendMessage(userId,
                        `❌ <b>Неверный формат ID канала.</b>\n\n` +
                        `<b>ID канала должен:</b>\n` +
                        `• Начинаться с -100\n` +
                        `• Иметь 13-14 цифр\n\n` +
                        `<b>Пример:</b> -1001234567890\n\n` +
                        `<b>Убедитесь, что вы вводите правильный ID канала.</b>`,
                        { parse_mode: 'HTML' }
                    );

                    const pending = this.pendingConfigs.get(userId);
                    if (pending) {
                        pending.lastMessageId = sentMessage.message_id;
                        this.pendingConfigs.set(userId, pending);
                    }
                    return;
                }

                try {
                    const chat = await this.bot.api.getChat(channelIdNum);

                    if (chat.type !== 'channel') {
                        await this.bot.api.sendMessage(userId,
                            `❌ <b>Это не канал.</b>\n` +
                            `ID ${channelIdNum} — это ${chat.type}.\n` +
                            `<b>Укажите ID именно канала.</b>`,
                            { parse_mode: 'HTML' }
                        );
                        return;
                    }

                    await this.startChannelConfig(userId, chat.id, chat.title, 'id');

                } catch (err) {
                    await this.bot.api.sendMessage(userId,
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
            await this.bot.api.sendMessage(userId,
                `❌ <b>Ошибка при обработке данных канала.</b>\n` +
                `Попробуйте еще раз или обратитесь к администратору.`,
                { parse_mode: 'HTML' }
            );
        }
    }

    async startChannelConfig(userId, channelId, channelTitle = null, sourceType = 'unknown') {
        try {
            const oldPending = this.pendingConfigs.get(userId);
            if (oldPending) {
                if (oldPending.lastMessageId) {
                    try {
                        await this.bot.api.deleteMessage(userId, oldPending.lastMessageId);
                    } catch (e) {}
                }
                if (oldPending.lastContentMessageId) {
                    try {
                        await this.bot.api.deleteMessage(userId, oldPending.lastContentMessageId);
                    } catch (e) {}
                }
            }

            this.pendingConfigs.delete(userId);

            const existingConfig = this.findChatInConfig(channelId);

            if (existingConfig) {
                const hours = Math.abs(existingConfig.offset / 60);
                const sign = existingConfig.offset >= 0 ? '+' : '-';

                const contentTypes = [];
                if (existingConfig.Eg) contentTypes.push('📔 Ежедневник');
                if (existingConfig.News) contentTypes.push('🌐 Новости');
                if (existingConfig.Raspis) contentTypes.push('📅 Расписание');
                const contentInfo = contentTypes.length > 0 ? contentTypes.join('\n') : '❌ Не выбрано';

                const keyboard = new InlineKeyboard();
                keyboard.row();
                keyboard.button('✏️ Изменить настройки', `edit_channel_${channelId}`);
                keyboard.button('🗑️ Удалить из рассылки', `remove_channel_${channelId}`);
                keyboard.row();
                keyboard.button('❌ Отмена', 'cancel_channel_setup');

                const sentMessage = await this.bot.api.sendMessage(userId,
                    `⚠️ <b>Этот канал уже настроен!</b>\n\n` +
                    `📢 <b>Канал:</b> "${this.escapeHtml(existingConfig.title)}"\n` +
                    `🌍 <b>Часовой пояс:</b> UTC${sign}${hours} ч.\n` +
                    `<b>Получает:</b>\n${contentInfo}\n\n` +
                    `<b>Что вы хотите сделать?</b>`,
                    {
                        parse_mode: 'HTML',
                        reply_markup: keyboard
                    }
                );

                this.pendingConfigs.set(userId, {
                    userId: userId,
                    chatId: channelId,
                    timestamp: Date.now(),
                    lastMessageId: sentMessage.message_id,
                    lastContentMessageId: null,
                    configType: 'channel_manage',
                    waitingForTownInput: 0
                });

                return;
            }

            const isAdmin = await this.checkChannelAdminRights(channelId, userId);

            if (!isAdmin) {
                const keyboard = new InlineKeyboard();
                keyboard.row();
                keyboard.button('❌ Отмена', 'cancel_channel_setup');

                const sentMessage = await this.bot.api.sendMessage(userId,
                    `❌ <b>Доступ запрещен</b>\n\n` +
                    `Вы не являетесь администратором этого канала.\n` +
                    `<b>Только администраторы могут настраивать бота.</b>\n\n` +
                    `Добавьте себя как администратора в настройках канала.`,
                    {
                        parse_mode: 'HTML',
                        reply_markup: keyboard
                    }
                );

                this.pendingConfigs.set(userId, {
                    userId: userId,
                    timestamp: Date.now(),
                    lastMessageId: sentMessage.message_id,
                    lastContentMessageId: null,
                    configType: 'channel_error',
                    waitingForTownInput: 0
                });

                return;
            }

            if (!this.botUsername) await this.initbotname();
            const botUsername = '@' + this.botUsername;
            const botId = this.bot.token.split(':')[0];
            const botIsAdmin = await this.checkChannelAdminRights(channelId, botId);

            if (!botIsAdmin) {
                const keyboard = new InlineKeyboard();
                keyboard.row();
                keyboard.button('❌ Отмена', 'cancel_channel_setup');

                const sentMessage = await this.bot.api.sendMessage(userId,
                    `❌ <b>Бот не имеет прав</b>\n\n` +
                    `Бот должен быть администратором канала.\n\n` +
                    `<b>Добавьте бота в канал как администратора:</b>\n` +
                    `1. Откройте настройки канала\n` +
                    `2. Добавьте участника: ${botUsername}\n` +
                    `3. Назначьте права администратора\n` +
                    `4. Включите разрешение "Публикация сообщений"`,
                    {
                        parse_mode: 'HTML',
                        reply_markup: keyboard
                    }
                );

                this.pendingConfigs.set(userId, {
                    userId: userId,
                    timestamp: Date.now(),
                    lastMessageId: sentMessage.message_id,
                    lastContentMessageId: null,
                    configType: 'channel_error',
                    waitingForTownInput: 0
                });

                return;
            }

            if (!channelTitle) {
                try {
                    const chat = await this.bot.api.getChat(channelId);
                    channelTitle = chat.title;
                } catch (err) {
                    channelTitle = `Канал ${channelId}`;
                }
            }

            const pendingData = {
                userId: userId,
                chatId: channelId,
                chatTitle: channelTitle,
                timestamp: Date.now(),
                waitingForManualInput: false,
                oldSettings: null,
                message_thread_id: "",
                timezoneOffset: null,
                contentSettings: { Eg: true, News: true, Raspis: true },
                lastContentMessageId: null,
                lastMessageId: null,
                configType: 'channel',
                sourceType: sourceType,
                isEdit: false,
                waitingForTownInput: 0
            };

            this.pendingConfigs.set(userId, pendingData);

            const keyboard = this.createTimezoneKeyboard();

            let sourceInfo = '';
            if (sourceType === 'username') {
                sourceInfo = ' (по юзернейму)';
            } else if (sourceType === 'id') {
                sourceInfo = ' (по ID)';
            }

            const sentMessage = await this.bot.api.sendMessage(userId,
                `✅ <b>Канал найден!</b>${sourceInfo}\n\n` +
                `📢 <b>Канал:</b> "${this.escapeHtml(channelTitle)}"\n` +
                `🆔 <b>ID:</b> ${channelId}\n\n` +
                `<b>Шаг 1/2: Выберите часовой пояс</b>\n` +
                `(Публикации будут выходить в указанное время по вашему часовому поясу)`,
                {
                    parse_mode: 'HTML',
                    reply_markup: keyboard
                }
            );

            pendingData.lastMessageId = sentMessage.message_id;
            this.pendingConfigs.set(userId, pendingData);

        } catch (err) {
            this.sendErrorMessage('Ошибка startChannelConfig: ' + err);
            const keyboard = new InlineKeyboard();
            keyboard.row();
            keyboard.button('❌ Отмена', 'cancel_channel_setup');

            const sentMessage = await this.bot.api.sendMessage(userId,
                `❌ <b>Произошла ошибка при настройке канала.</b>\n` +
                `<b>Проверьте, что:</b>\n` +
                `1. Бот добавлен в канал\n` +
                `2. Вы и бот — администраторы канала`,
                {
                    parse_mode: 'HTML',
                    reply_markup: keyboard
                }
            );

            this.pendingConfigs.set(userId, {
                userId: userId,
                timestamp: Date.now(),
                lastMessageId: sentMessage.message_id,
                lastContentMessageId: null,
                configType: 'channel_error',
                waitingForTownInput: 0
            });
        }
    }

    async startChannelEdit(userId, channelId, channelTitle) {
        try {
            const oldPending = this.pendingConfigs.get(userId);
            if (oldPending) {
                if (oldPending.lastMessageId) {
                    try {
                        await this.bot.api.deleteMessage(userId, oldPending.lastMessageId);
                    } catch (e) {}
                }
                if (oldPending.lastContentMessageId) {
                    try {
                        await this.bot.api.deleteMessage(userId, oldPending.lastContentMessageId);
                    } catch (e) {}
                }
            }

            this.pendingConfigs.delete(userId);

            const existing = this.findChatInConfig(channelId);
            if (!existing) {
                const keyboard = new InlineKeyboard();
                keyboard.row();
                keyboard.button('❌ Отмена', 'cancel_channel_setup');

                const sentMessage = await this.bot.api.sendMessage(userId,
                    `❌ <b>Настройки канала не найдены.</b>\n` +
                    `Возможно, канал уже был удален из рассылки.`,
                    {
                        parse_mode: 'HTML',
                        reply_markup: keyboard
                    }
                );

                this.pendingConfigs.set(userId, {
                    userId: userId,
                    timestamp: Date.now(),
                    lastMessageId: sentMessage.message_id,
                    lastContentMessageId: null,
                    configType: 'channel_error',
                    waitingForTownInput: 0
                });

                return;
            }

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

            const pendingData = {
                userId: userId,
                chatId: channelId,
                chatTitle: channelTitle,
                timestamp: Date.now(),
                waitingForManualInput: false,
                oldSettings: existing,
                message_thread_id: "",
                timezoneOffset: existing.offset,
                contentSettings: contentSettings,
                lastContentMessageId: null,
                lastMessageId: null,
                configType: 'channel',
                sourceType: 'edit',
                isEdit: true,
                waitingForTownInput: 0
            };

            this.pendingConfigs.set(userId, pendingData);

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

            const sentMessage = await this.bot.api.sendMessage(userId,
                `✏️ <b>Редактирование настроек канала</b>\n\n` +
                `📢 <b>Канал:</b> "${this.escapeHtml(channelTitle)}"\n` +
                townInfo +
                `🌍 <b>Текущий часовой пояс:</b> UTC${sign}${hours} ч.\n` +
                `<b>Текущие настройки контента:</b>\n${contentInfo}\n\n` +
                `<b>Шаг 1/2: Выберите новый часовой пояс</b>\n` +
                `(или оставьте текущий)`,
                {
                    parse_mode: 'HTML',
                    reply_markup: keyboard
                }
            );

            pendingData.lastMessageId = sentMessage.message_id;
            this.pendingConfigs.set(userId, pendingData);

        } catch (err) {
            this.sendErrorMessage('Ошибка startChannelEdit: ' + err);
            const keyboard = new InlineKeyboard();
            keyboard.row();
            keyboard.button('❌ Отмена', 'cancel_channel_setup');

            const sentMessage = await this.bot.api.sendMessage(userId,
                `❌ <b>Произошла ошибка при редактировании настроек.</b>`,
                {
                    parse_mode: 'HTML',
                    reply_markup: keyboard
                }
            );

            this.pendingConfigs.set(userId, {
                userId: userId,
                timestamp: Date.now(),
                lastMessageId: sentMessage.message_id,
                lastContentMessageId: null,
                configType: 'channel_error',
                waitingForTownInput: 0
            });
        }
    }

    async removeChannelFromConfig(userId, channelId) {
        try {
            const existing = this.findChatInConfig(channelId);
            if (!existing) {
                const keyboard = new InlineKeyboard();
                keyboard.row();
                keyboard.button('❌ Отмена', 'cancel_channel_setup');

                const sentMessage = await this.bot.api.sendMessage(userId,
                    `❌ <b>Канал не найден в настройках рассылки.</b>`,
                    {
                        parse_mode: 'HTML',
                        reply_markup: keyboard
                    }
                );

                this.pendingConfigs.set(userId, {
                    userId: userId,
                    timestamp: Date.now(),
                    lastMessageId: sentMessage.message_id,
                    lastContentMessageId: null,
                    configType: 'channel_remove',
                    waitingForTownInput: 0
                });

                return;
            }

            const keyboard = new InlineKeyboard();
            keyboard.row();
            keyboard.button('✅ Да, удалить', `confirm_remove_channel_${channelId}`);
            keyboard.button('❌ Отмена', 'cancel_channel_setup');

            const sentMessage = await this.bot.api.sendMessage(userId,
                `⚠️ <b>Вы уверены, что хотите удалить канал из рассылки?</b>\n\n` +
                `📢 <b>Канал:</b> "${this.escapeHtml(existing.title)}"\n` +
                `<b>Это действие нельзя отменить.</b>`,
                {
                    parse_mode: 'HTML',
                    reply_markup: keyboard
                }
            );

            this.pendingConfigs.set(userId, {
                userId: userId,
                timestamp: Date.now(),
                lastMessageId: sentMessage.message_id,
                lastContentMessageId: null,
                configType: 'channel_remove',
                waitingForTownInput: 0
            });

        } catch (err) {
            this.sendErrorMessage('Ошибка removeChannelFromConfig: ' + err);
            const keyboard = new InlineKeyboard();
            keyboard.row();
            keyboard.button('❌ Отмена', 'cancel_channel_setup');

            const sentMessage = await this.bot.api.sendMessage(userId,
                `❌ <b>Произошла ошибка при удалении канала.</b>`,
                {
                    parse_mode: 'HTML',
                    reply_markup: keyboard
                }
            );

            this.pendingConfigs.set(userId, {
                userId: userId,
                timestamp: Date.now(),
                lastMessageId: sentMessage.message_id,
                lastContentMessageId: null,
                configType: 'channel_error',
                waitingForTownInput: 0
            });
        }
    }

    async checkChannelAdminRights(channelId, userId) {
        try {
            const chatMember = await this.bot.api.getChatMember(channelId, userId);
            return ['administrator', 'creator'].includes(chatMember.status);
        } catch (err) {
            this.sendErrorMessage('Ошибка проверки прав в канале: ' + err);
            return false;
        }
    }

    async isBotAdmin(chatId, checkDeletePermission = false) {
        try {
            if (chatId > 0) return true;
            const botId = this.bot.token.split(':')[0];
            const botMember = await this.bot.api.getChatMember(chatId, botId);
            const isAdmin = botMember.status === 'administrator';
            if (!isAdmin) return false;
            if (checkDeletePermission) return botMember.can_delete_messages === true;
            return true;
        } catch (err) {
            this.sendErrorMessage('Ошибка проверки прав бота: ' + err);
            return false;
        }
    }

    sendErrorMessage(message) {
        console.error(message);
        this.saveConfig('error_message', { message: message, timestamp: Date.now() });
    }

    async getTownSlug(chatId) {
        try {
            const pending = this.pendingConfigs.get(chatId);
            if (!pending) {
                await this.bot.api.sendMessage(chatId, '❌ Сессия настройки истекла. Начните заново с /config', {
                    message_thread_id: pending ? pending.message_thread_id || undefined : undefined
                });
                return;
            }

            if (pending.lastMessageId) {
                try {
                    await this.bot.api.deleteMessage(chatId, pending.lastMessageId);
                } catch (e) {}
            }

            const isAdmin = await this.isBotAdmin(chatId);
            if (!isAdmin) {
                await this.bot.api.sendMessage(chatId,
                    `⚠️ <b>Для настройки расписания мне нужно быть администратором группы</b>\n\n` +
                    `1. Сделайте меня администратором с минимальными правами чтения и удаления.\n` +
                    `2. Начните настройку заново командой /config`,
                    {
                        parse_mode: 'HTML',
                        message_thread_id: pending.message_thread_id || undefined
                    }
                );

                if (pending.waitingForTownInput) pending.waitingForTownInput = 0;
                if (pending.waitingForManualInput) pending.waitingForManualInput = false;
                this.pendingConfigs.delete(chatId);
                return;
            }

            const keyboard = new InlineKeyboard();
            keyboard.row();
            keyboard.button('❌ Отмена', 'cancel_config');

            const sentMessage = await this.bot.api.sendMessage(chatId,
                `🏙️ <b>Для получения расписания в своем городе</b>\n\n` +
                `Пришлите мне, пожалуйста, <b>название своего города</b>.\n` +
                `Постарайтесь написать его так, как город называется на картах.\n\n` +
                `<i>Например:</i> Москва, Санкт-Петербург, Казань\n\n` +
                `Возможен поиск по части названия.`,
                {
                    parse_mode: 'HTML',
                    reply_markup: keyboard,
                    message_thread_id: pending.message_thread_id || undefined
                }
            );

            pending.waitingForTownInput = 1;
            pending.lastMessageId = sentMessage.message_id;
            pending.lastContentMessageId = null;
            this.pendingConfigs.set(chatId, pending);

        } catch (err) {
            this.sendErrorMessage('Ошибка в getTownSlug: ' + err);
        }
    }

    async checkBotPerm(chatId, messageThreadId = null) {
        try {
            const hasPermissions = await this.isBotAdmin(chatId, true);
            if (!hasPermissions) {
                await this.bot.api.sendMessage(chatId,
                    `⚠️ <b>Для корректной работы мне нужно быть администратором</b>\n\n` +
                    `Пожалуйста, сделайте меня администратором с минимальными правами:\n` +
                    `• ✅ Удаление сообщений\n\n` +
                    `Остальные права можно отключить.\n\n` +
                    `После этого используйте /config для настройки.`,
                    {
                        parse_mode: 'HTML',
                        message_thread_id: messageThreadId || undefined
                    }
                );
                return false;
            }
            return true;
        } catch (err) {
            this.sendErrorMessage('Ошибка проверки прав бота: ' + err);
            return false;
        }
    }
}

module.exports = SlaveMaxBot;