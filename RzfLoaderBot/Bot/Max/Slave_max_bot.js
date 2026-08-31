// Slave_max_bot.js
//const { Bot, Keyboard } = require('@maxhub/max-bot-api');
const { Bot, Keyboard } = require('@irklva/max-bot-api');

class SlaveMaxBot {
	constructor(token, onConfigUpdate, mainChatNewsRef, mainArea, needTown) {
		this.bot = new Bot(token);
		
		/*console.log('Методы:', Object.getOwnPropertyNames(Object.getPrototypeOf(this.bot)));
		console.log('Свойства:', Object.keys(this.bot));
		console.log('api содержимое:', this.bot.api);
		console.log('Ключи api:', Object.keys(this.bot.api));*/
		
		this.onConfigUpdate = onConfigUpdate;
		this.pendingConfigs = new Map();
		this.pendingChannelSetup = null;
		this.cleanupTimer = null;
		this.botName = null;
		this.botUsername = null;
		this.last502ErrorTime = 0;
		this.recoveryTimer = null;
		this.botId = null;

		// Используем ссылку на объект из основного кода
		this.chat_news = mainChatNewsRef || {};
		// Название местности для приветствия
		this.area = mainArea || '';
		// Использовать ли настройку города
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
				if(this.requests.has(id)) {
					this.requests.delete(id);
					reject(new Error('Таймаут: мастер не ответил'));
				}
			}, 5000);
		});
	}

	onMasterResponse(response) {
		const { requestId, result, error } = response;
		const request = this.requests.get(requestId);

		if(request) {
			this.requests.delete(requestId);
			if(error) {
				request.reject(new Error(error));
			} else {
				request.resolve(result);
			}
		}
	}

	async initbotname() {
		try {
			const botInfo = await this.bot.api.getMyInfo();
			this.botName = botInfo.first_name || '';
			this.botUsername = botInfo.username || '';
			this.botId = botInfo.id || botInfo.user_id;
			this.sendErrorMessage('Имя слэйв-бота Max установлено: '+this.botName);
		} catch(err) {
			this.sendErrorMessage('Ошибка получения имени слэйв-бота Max: ' + (err.message||err));
		}
	}

	saveConfig(event = null, data = {}) {
		try {
			if(this.onConfigUpdate) {
				this.onConfigUpdate({
					config: this.chat_news,
					event: event,
					data: data,
					timestamp: Date.now()
				});
			}
			return true;
		} catch(err) {
			console.error('Ошибка сохранения конфига:', (err.message||err));
			return false;
		}
	}

	setupHandlers() {
		const self = this;
		
		// КНОПКА "Начать"
		this.bot.on('bot_started', async (ctx) => {
			try {	const chatId = ctx.update?.chat_id;
					const params = ctx.startPayload;
					if (!chatId) {
						console.warn('max bot_started(): chatId не найден');
						return;
					}
					if(!this.botName) await this.initbotname();
					// Если перешли по ссылке с параметром channel_setup
					if (params === 'channel_setup') {
						const fromId = ctx.update?.user_id;
						await self.showChannelSelection(chatId, fromId);
						return;
					}
					await self.showPrivateChatHelp(chatId);
			} catch(err) {
				this.sendErrorMessage('Ошибка в max bot_started: ' + (err.message||err));
			}
		});

		// Команда /config
		this.bot.command('config', async (ctx) => {
			try {
				const chatId = ctx.update?.message?.recipient?.chat_id || ctx.update?.chat_id || ctx.update?.user_id;
				const chatTitle = ctx.update?.message?.recipient?.chat_type === 'dialog' ? ctx.update?.message?.sender?.name : '';
				const fromId = ctx.update?.message?.sender?.user_id || ctx.update?.user_id || ctx.from?.id;
				const messageId = ctx.update?.message?.body?.mid || ctx.update?.message_id;
				const messageThreadId = "";
				
				/*console.log('ctx keys:', Object.keys(ctx));
				console.log('ctx.update keys:', ctx.update ? Object.keys(ctx.update) : 'нет');
				console.log('ctx.chat keys:', ctx.chat ? Object.keys(ctx.chat) : 'нет');
				console.log('ctx.from keys:', ctx.from ? Object.keys(ctx.from) : 'нет');
				console.log('ctx.update:', ctx.update);*/
				
				const botCanDelete = await self.isBotAdmin(chatId, true);
				if(chatId < 0) {
					if(!await self.checkAdminRights(chatId, fromId)) {
						if(botCanDelete && messageId) await this.deleteMessage(messageId, chatId);
						return;
					}
				}

				if(!botCanDelete) {
					await self.checkBotPerm(chatId, messageThreadId);
					return;
				}

				await self.startConfigProcess(chatId, chatTitle, messageThreadId);
			} catch(err) {
				self.sendErrorMessage('Ошибка в /config: ' + (err.message||err));
			}
		});

		// Команда /start
		this.bot.command('start', async (ctx) => {
			try {
				const recipient = ctx.update?.message?.recipient || {};
				const sender = ctx.update?.message?.sender || {};

				const chatId = recipient.chat_id;
				const fromId = sender.user_id;
				const chatTitle = recipient.chat_type === 'dialog' ? sender.name : '';
				const messageId = ctx.update?.message?.body?.mid;
				const messageThreadId = "";
				
				const botCanDelete = await self.isBotAdmin(chatId, true);
				if(chatId < 0) {
					if(!await self.checkAdminRights(chatId, fromId)) {
						if(botCanDelete && messageId) await this.deleteMessage(messageId, chatId);
						return;
					}
				}

				await new Promise(resolve => setTimeout(resolve, 1000));

				let chatType;
				try {
					const chatInfo = await self.bot.api.getChat(chatId);
					chatType = chatInfo.type;
				} catch(e) {
					chatType = 'unknown';
				}

				if(chatId > 0) {
					await self.showPrivateChatHelp(chatId);
					return;
				}

				if(!botCanDelete) {
					await self.checkBotPerm(chatId, messageThreadId);
					return;
				}
				await self.startConfigProcess(chatId, chatTitle, messageThreadId);
			} catch(err) {
				self.sendErrorMessage('Ошибка в /start: ' + (err.message||err));
			}
		});

		// Команда /info
		this.bot.command('info', async (ctx) => {
			try {
				const recipient = ctx.update?.message?.recipient || {};
				const sender = ctx.update?.message?.sender || {};
				const chatId = recipient.chat_id;
				const fromId = sender.user_id;
				const messageId = ctx.update?.message?.body?.mid;
				
				const botCanDelete = await self.isBotAdmin(chatId, true);
				if(chatId < 0) {
					if(!await self.checkAdminRights(chatId, fromId)) {
						if(botCanDelete && messageId) await this.deleteMessage(messageId, chatId);
						return;
					}
				}

				if(!botCanDelete) {
					await self.checkBotPerm(chatId);
					return;
				}

				const info = await self.getChatInfo(chatId);
				await self.bot.api.sendMessageToChat(chatId, info, { format: 'HTML' });
			} catch(err) {
				self.sendErrorMessage('Ошибка в /info: ' + (err.message||err));
			}
		});

		// Команда /help
		this.bot.command('help', async (ctx) => {
			try {
				const recipient = ctx.update?.message?.recipient || {};
				const sender = ctx.update?.message?.sender || {};
				const chatId = recipient.chat_id;
				const fromId = sender.user_id;
				const messageId = ctx.update?.message?.body?.mid;
				
				const botCanDelete = await self.isBotAdmin(chatId, true);
				if(chatId < 0) {
					if(!await self.checkAdminRights(chatId, fromId)) {
						if(botCanDelete && messageId) await this.deleteMessage(messageId, chatId);
						return;
					}
				}
				if(!botCanDelete) {
					await self.checkBotPerm(chatId);
					return;
				}

				let chatType;
				try {
					const chatInfo = await self.bot.api.getChat(chatId);
					chatType = chatInfo.type;
				} catch(e) {
					chatType = 'unknown';
				}

				let helpText = `<b>🤖 Команды бота:</b>\n\n`;

				// В MAX API тип канала - 'channel', тип группы - 'chat'
				if(chatType === 'channel') {
					helpText += `<b>📢 Для каналов:</b>\n` +
						`/start - показать инструкцию по настройке\n\n` +
						`<b>Как настроить:</b>\n` +
						`1. Перейдите в приватный чат с ботом\n` +
						`2. Используйте /config_channel\n` +
						`3. Выберите этот канал\n\n`;
				} else if(chatType === 'chat') { // В MAX все группы - это 'chat'
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

				await self.bot.api.sendMessageToChat(chatId, helpText, { format: 'HTML' });
			} catch(err) {
				self.sendErrorMessage('Ошибка в /help: ' + (err.message||err));
			}
		});

		// Команда /config_channel
		this.bot.command('config_channel', async (ctx) => {
			try {
				const recipient = ctx.update?.message?.recipient || {};
				const sender = ctx.update?.message?.sender || {};
				const chatId = recipient.chat_id;
				const fromId = sender.user_id;
				const messageId = ctx.update?.message?.body?.mid;
				
				const botCanDelete = await self.isBotAdmin(chatId, true);
				if(chatId < 0) {
					if(!await self.checkAdminRights(chatId, fromId)) {
						if(botCanDelete && messageId) await this.deleteMessage(messageId, chatId);
						return;
					}
				}

				if(chatId > 0) {
					await self.showChannelSelection(chatId,fromId);
				}
			} catch(err) {
				self.sendErrorMessage('Ошибка в /config_channel: ' + (err.message||err));
			}
		});

		// Команда /setup_channel
		this.bot.command('setup_channel', async (ctx) => {
			try {
				const chatId = ctx.update?.message?.recipient?.chat_id;
				const fromId = sender.user_id;
				const messageId = ctx.update?.message?.body?.mid;
				const botCanDelete = await self.isBotAdmin(chatId, true);
				if(chatId < 0) {
					if(!await self.checkAdminRights(chatId, fromId)) {
						if(botCanDelete && messageId) await this.deleteMessage(messageId, chatId);
						return;
					}
				}
				if(!self.botUsername) await self.initbotname();
				const botUsername = '@' + self.botUsername;

				const deepLink = `https://max.ru/${this.botUsername}?start=channel_setup`;

				await self.bot.api.sendMessageToChat(chatId,
					`🔗 <b>Ссылка для настройки канала:</b>\n\n` +
					`1. Перейдите по ссылке: ${deepLink}\n` +
					`2. Бот предложит выбрать канал\n` +
					`3. Настройте часовой пояс и контент\n\n` +
					`<b>Примечание:</b> Вы должны быть администратором канала.`,
					{ format: 'HTML' }
				);
			} catch(err) {
				self.sendErrorMessage('Ошибка в /setup_channel: ' + (err.message||err));
			}
		});
		//=====================================================================================
		// Обработка callback-запросов
		this.bot.on('message_callback', async (ctx) => {
			try {
				const chatId = ctx.update?.message?.recipient?.chat_id;
				const fromId = ctx.update?.callback?.user?.user_id;
				const data = ctx.update?.callback?.payload;
				const messageId = ctx.update?.message?.body?.mid;
				const pending = self.pendingConfigs.get(chatId);
				const last = pending?.lastMessageId ? pending.lastMessageId : null;

				if(chatId < 0) {
					if(!await self.checkAdminRights(chatId, fromId)) {
						//await ctx.answerOnCallback();
						return;
					}
				}

				if(data.startsWith('timezone_')) {
					const timezone = data.replace('timezone_', '');
					await self.handleTimezoneSelection(chatId, timezone, '');
					if(last) await self.deleteMessage(last, chatId);
				} else if(data === 'manual_timezone') {
					if(pending) {
						pending.waitingForManualInput = true;
						self.pendingConfigs.set(chatId, pending);
					}

					const keyboard = Keyboard.inlineKeyboard([
						[Keyboard.button.callback('Отмена', 'cancel_config')]
					]);

					const sentMessage = await self.bot.api.sendMessageToChat(chatId,
						`<b>Отправьте смещение часового пояса в формате:</b>\n` +
						`• +3 (для UTC+3)\n` +
						`• -5 (для UTC-5)\n` +
						`• 0 (для UTC±0)\n`,
						{
							format: 'HTML',
							attachments: [keyboard]
						}
					);

					if(pending) {
						pending.lastMessageId = sentMessage.body?.mid;
						self.pendingConfigs.set(chatId, pending);
					}
					if(last) await self.deleteMessage(last, chatId);
					
				} else if(data === 'cancel_config') {
					await self.bot.api.sendMessageToChat(chatId, '⚙️ Настройка отменена.');
					
					if(pending) {
						if(pending.waitingForTownInput) pending.waitingForTownInput = 0;
						if(pending.waitingForManualInput) pending.waitingForManualInput = false;
					}

					if(last) await self.deleteMessage(last, chatId);

					if(pending && pending.lastContentMessageId) {
						await self.deleteMessage(pending.lastContentMessageId, chatId);
					}

					self.pendingConfigs.delete(chatId);

				} else if(data.startsWith('content_')) {
					const contentType = data.replace('content_', '');
					await self.handleContentSelection(chatId, contentType);
					
				} else if(data === 'save_config') {
					const lastContent = pending?.lastContentMessageId ? pending.lastContentMessageId : null;
					if(self.needTown && pending && pending.contentSettings && pending.contentSettings.Raspis) {
						await self.getTownSlug(chatId);
					} else {
						await self.finishConfig(chatId);
					}
					if(last) await self.deleteMessage(last, chatId);
					if(lastContent) await self.deleteMessage(lastContent, chatId);

				} else if(data === 'channel_by_id') {
					await self.requestChannelId(chatId);
					if(last) await self.deleteMessage(last, chatId);

				} else if(data === 'channel_help') {
					await self.showChannelHelp(chatId);
					if(last) await self.deleteMessage(last, chatId);

				} else if(data.startsWith('edit_channel_')) {
					const channelId = data.replace('edit_channel_', '');
					let channelTitle = `Канал ${channelId}`;
					try {
						const chat = await self.bot.api.getChat(channelId);
						channelTitle = chat.title;
					} catch(err) {
						console.error('Ошибка получения информации о канале:', (err.message||err));
					}

					await self.startChannelEdit(chatId, channelId, channelTitle);
					if(last) await self.deleteMessage(last, chatId);

				} else if(data.startsWith('remove_channel_')) {
					const channelId = data.replace('remove_channel_', '');
					await self.removeChannelFromConfig(chatId, channelId);
					if(last) await self.deleteMessage(last, chatId);

				} else if(data.startsWith('confirm_remove_channel_')) {
					const channelId = data.replace('confirm_remove_channel_', '');
					const removed = self.removeChatFromAllTimezones(channelId, true);

					if(removed) {
						await self.bot.api.sendMessageToChat(chatId,
							`✅ <b>Канал успешно удален из рассылки.</b>\n\n` +
							`Чтобы снова добавить канал, используйте /config_channel`,
							{ format: 'HTML' }
						);
					} else {
						await self.bot.api.sendMessageToChat(chatId,
							`❌ <b>Не удалось удалить канал.</b>\n` +
							`Возможно, он уже был удален ранее.`,
							{ format: 'HTML' }
						);
					}
					if(last) await self.deleteMessage(last, chatId);

				} else if(data === 'cancel_remove_channel') {
					await self.bot.api.sendMessageToChat(chatId, '⚙️ Удаление отменено.');
					if(last) await self.deleteMessage(last, chatId);
					
				} else if(data === 'cancel_channel_setup') {
					await self.bot.api.sendMessageToChat(chatId, '⚙️ Настройка канала отменена.');
					if(last) await self.deleteMessage(last, chatId);
					if(pending && pending.lastContentMessageId) {
						await self.deleteMessage(pending.lastContentMessageId, chatId);
					}
					self.pendingChannelSetup = null;
					self.pendingConfigs.delete(chatId);

				} else if(data === 'back_to_channel_select') {
					await self.showChannelSelection(chatId,fromId);
					if(last) await self.deleteMessage(last, chatId);
				}

			} catch(err) {
				self.sendErrorMessage('Ошибка в message_callback: ' + (err.message||err));
				try {
					await ctx.answerOnCallback({
						text: '❌ Произошла ошибка',
						show_alert: true
					});
				} catch(e) {}
			}
		});

		// Обработка текстовых сообщений
		this.bot.on('message_created', async (ctx) => {
			try {
				const text = ctx.update?.message?.body?.text || '';
				if (!text || text.startsWith('/')) return;
				const chatId = ctx.update?.message?.recipient?.chat_id;
				const pending = self.pendingConfigs.get(chatId);
				const last = pending?.lastMessageId ? pending.lastMessageId : null;
				
				if(pending && pending.waitingForManualInput) {
					const timezone = self.parseTimezoneInput(text);
					if(timezone) {
						await self.handleTimezoneSelection(chatId, timezone, '');
						if(last) await self.deleteMessage(last, chatId);
						
					} else {
						const sentMessage = await self.bot.api.sendMessageToChat(chatId,
							'❌ <b>Не удалось распознать часовой пояс.</b>\n\n' +
							`<b>Попробуйте еще раз:</b>\n` +
							`• +3 (для UTC+3)\n` +
							`• -5 (для UTC-5)\n` +
							`• 0 (для UTC±0)\n`,
							{
								format: 'HTML'
							}
						);

						pending.lastMessageId = sentMessage.body?.mid;
						self.pendingConfigs.set(chatId, pending);
					}
				} else if(pending && pending.waitingForTownInput === 1) {
					const townName = text.trim();
					if(townName.length < 3) {
						const keyboard = Keyboard.inlineKeyboard([
							[Keyboard.button.callback('❌ Отмена', 'cancel_config')]
						]);
						const sentMessage = await self.bot.api.sendMessageToChat(chatId,
							`⚠️ <b>Слишком короткое название.</b>\n\n` +
							`Введите минимум 3 символа.\n` +
							`(вы ввели: "${townName}")`,
							{
								format: 'HTML',
								attachments: [keyboard]
							}
						);
						pending.lastMessageId = sentMessage.body?.mid;
						self.pendingConfigs.set(chatId, pending);
						if(last) await self.deleteMessage(last, chatId);
						return;
					}

					if(!townName) {
						const keyboard = Keyboard.inlineKeyboard([
							[Keyboard.button.callback('❌ Отмена', 'cancel_config')]
						]);
						const sentMessage = await self.bot.api.sendMessageToChat(chatId,
							'❌ <b>Название города не может быть пустым.</b>\n\n' +
							'Пожалуйста, введите название города:',
							{
								format: 'HTML',
								attachments: [keyboard]
							}
						);

						pending.lastMessageId = sentMessage.body?.mid;
						self.pendingConfigs.set(chatId, pending);
						if(last) await self.deleteMessage(last, chatId);
						return;
					}

					try {
						const result = await self.sendCommand('find_town', { name: townName });

						if(!result || result.length === 0) {
							throw new Error('Город не найден');
						}
						if(result.length > 5) {
							const keyboard = Keyboard.inlineKeyboard([
								[Keyboard.button.callback('❌ Отмена', 'cancel_config')]
							]);
							const sentMessage = await self.bot.api.sendMessageToChat(chatId,
								`⚠️ <b>Слишком много городов (${result.length}).</b>\n\n` +
								`Уточните название (минимум 3 символа).`,
								{
									format: 'HTML',
									attachments: [keyboard]
								}
							);
							pending.lastMessageId = sentMessage.body?.mid;
							self.pendingConfigs.set(chatId, pending);
							if(last) await self.deleteMessage(last, chatId);
							return;
						}

						if(result.length === 1) {
							pending.townData = {
								name: result[0].town,
								slug: result[0].slug
							};
							pending.waitingForTownInput = 0;

							await self.finishConfig(chatId);
							self.pendingConfigs.set(chatId, pending);
							if(last) await self.deleteMessage(last, chatId);
							return;
						}

						const citiesList = result.map(item => `<code>${item.town}</code>`).join('\n');
						const keyboard = Keyboard.inlineKeyboard([
							[Keyboard.button.callback('❌ Отмена', 'cancel_config')]
						]);
						const listMessage = await self.bot.api.sendMessageToChat(chatId,
							`🔍 <b>Найдено несколько городов:</b>\n\n` +
							`${citiesList}\n\n` +
							`📋 <b>Скопируйте один нужный город и пришлите его сюда.</b>\n` +
							`(просто тапните по названию и вставьте)`,
							{
								format: 'HTML',
								attachments: [keyboard]
							}
						);
						pending.lastMessageId = listMessage.message_id;
						self.pendingConfigs.set(chatId, pending);

					} catch(error) {
						const keyboard = Keyboard.inlineKeyboard([
							[Keyboard.button.callback('❌ Отмена', 'cancel_config')]
						]);
						const errorMessage = await self.bot.api.sendMessageToChat(chatId,
							`❌ <b>Не удалось найти город.</b>\n\n` +
							`${townName}\n\n` +
							`Попробуйте ввести название иначе или нажмите "Отмена".`,
							{
								format: 'HTML',
								attachments: [keyboard]
							}
						);
						pending.lastMessageId = errorMessage.message_id;
						self.pendingConfigs.set(chatId, pending);
						if(last) await self.deleteMessage(last, chatId);
					}
				//принимаем chatId канала
				} else if(pending && self.pendingChannelSetup?.waitingForChannelId) {
					const chatId = ctx.update?.message?.recipient?.chat_id;
					const channelIdInput = ctx.update?.message?.body?.text.trim()||'';
					
					await self.processChannelInput(chatId, channelIdInput, 'id');
					self.pendingChannelSetup = null;
					if(last) await self.deleteMessage(last, chatId);
				}
			} catch(err) {
				self.sendErrorMessage('Ошибка в обработке сообщения: ' + (err.message||err));
			}
		});

		// ============ ОБРАБОТКА ИЗМЕНЕНИЯ СТАТУСА БОТА ============
		this.bot.on('bot_added', async (ctx) => 
		{
			try {
				const chatId = ctx.update?.chat_id;
				if (!chatId) return;
				
				setTimeout(async () => {
					try {
						let chatType;
						try {
							const chatInfo = await this.bot.api.getChat(chatId);
							chatType = chatInfo.type;
						} catch(e) {
							chatType = 'unknown';
						}
						
						if (chatType === 'channel') {
							if (!this.botUsername) await this.initbotname();
							
							await this.sleep(2*60*1000);//через 2мин отправим сообщение, чтоб успел админа получить
							
							const deepLink = `https://max.ru/${this.botUsername}?start=channel_setup`;
							await this.bot.api.sendMessageToChat(chatId,
								`📢 <b>Настройка бота для канала</b>\n\n` +
								`Для настройки бота перейдите по ссылке:\n` +
								`${deepLink}\n\n` +
								//`🆔 <b>ID канала:</b> <code>${chatId}</code>\n\n` +
								`🆔 <b>ID канала:</b> ${chatId}\n\n` +
								`<b>Только администраторы канала могут выполнить настройку.</b>`,
								{ format: 'HTML' }
							);
						} else if (chatType === 'dialog') {
							return;
						} else {
							if (!this.botName) await this.initbotname();
							
							await this.bot.api.sendMessageToChat(chatId,
								`👋 <b>Привет! Я бот "${this.botName}".</b>\n\n` +
								`Чтобы настроить рассылку в этот чат, используйте команду\n` +
								`/config\n` +
								`в нужной теме.\n` +
								`На время настройки отключите анонимность админа.\n` +
								`<b>Только администраторы чата могут выполнить настройку.</b>`,
								{ format: 'HTML' }
							);
							
							await this.checkBotPerm(chatId);
						}
					} catch(err) {
						console.error('Ошибка приветствия:', (err.message||err));
					}
				}, 1500);
				
			} catch(err) {
				this.sendErrorMessage('Ошибка в bot_added: ' + (err.message||err));
			}
		});
		
		// Удаление из чатов и каналов и личек
		this.bot.on('bot_removed', async (ctx) => {
			try {
				const chatId = ctx.update?.dialog_id || ctx.update?.chat_id;
				if (!chatId) return;
				
				await this.removeChatFromConfig(chatId, false);
				console.log(`Бот удален из чата ${chatId}, конфиг очищен`);
				
			} catch(err) {
				this.sendErrorMessage('Ошибка в bot_removed: ' + (err.message||err));
			}
		});
		this.bot.on('dialog_removed', async (ctx) => {
			try {
				const chatId = ctx.update?.dialog_id || ctx.update?.chat_id;
				if (!chatId) return;
				
				await this.removeChatFromConfig(chatId, false);
				console.log(`Бот удален из диалога ${chatId}, конфиг очищен`);
				
			} catch(err) {
				this.sendErrorMessage('Ошибка в dialog_removed: ' + (err.message||err));
			}
		});
		this.bot.on('bot_stopped', async (ctx) => {
			try {
				const chatId = ctx.update?.dialog_id || ctx.update?.chat_id;
				if (!chatId) return;
				
				await this.removeChatFromConfig(chatId, false);
				console.log(`Бот остановлен ${chatId}, конфиг очищен`);
				
			} catch(err) {
				this.sendErrorMessage('Ошибка в bot_stopped: ' + (err.message||err));
			}
		});

		// Обработка ошибок бота
		this.bot.on('polling_error', (error) => {
			if(self.recoveryTimer) return;

			if(error.message && (error.message.includes('502') || error.message.includes('Bad Gateway'))) {
				self.sendErrorMessage('Polling error in SlaveMaxBot: ' + error.message);
				const checkConnection = (delay) => {
					self.recoveryTimer = setTimeout(() => {
						self.bot.api.getMyInfo().then(() => {
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

	async showPrivateChatHelp(chatId) {
		try {
			if(!this.botName) await this.initbotname();
			await this.bot.api.sendMessageToChat(chatId,
				`👋 <b>Привет! Я бот "${this.botName}".</b>\n\n` +
				`<b>Вы можете настроить:</b>\n\n` +
				`👤 <b>Приватный чат</b> - просто используйте /config\n\n` +
				`👥 <b>Группы</b> - добавьте меня в группу и используйте /config\n` +
				`На время настройки отключите анонимность админа.\n\n` +
				`📢 <b>Каналы</b> - используйте /config_channel\n` +
				`/setup_channel - получить ссылку для настройки\n\n` +
				`<b>Для получения справки используйте</b> /help`,
				{ format: 'HTML' }
			);
		} catch(err) {
			this.sendErrorMessage('Ошибка showPrivateChatHelp: ' + (err.message||err));
		}
	}

	async showChannelSelection(chatId, userId) {
		try {
			this.pendingChannelSetup = null;
			const oldPending = this.pendingConfigs.get(chatId);
			const last = oldPending?.lastMessageId ? oldPending.lastMessageId : null;
			const lastContent = oldPending?.lastContentMessageId ? oldPending.lastContentMessageId : null;

			const keyboard = Keyboard.inlineKeyboard([
				[Keyboard.button.callback('🆔 Ввести ID канала', 'channel_by_id')],
				[Keyboard.button.callback('❓ Как получить ID канала?', 'channel_help')],
				[Keyboard.button.callback('❌ Отмена', 'cancel_channel_setup')]
			]);

			const sentMessage = await this.bot.api.sendMessageToChat(chatId,
				`📢 <b>Настройка бота для канала</b>\n\n` +
				`<b>Введите ID канала:</b>\n\n` +
				`<b>🆔 Формат ID:</b>\n` +
				`• -1234567890\n\n` +
				`<b>Требования:</b>\n` +
				`✓ Вы должны быть администратором канала\n` +
				`✓ Бот должен быть добавлен в канал как администратор`,
				{
					format: 'HTML',
					attachments: [keyboard]
				}
			);

			this.pendingConfigs.set(chatId, {
				userId: userId,
				timestamp: Date.now(),
				lastMessageId: sentMessage.body?.mid,
				lastContentMessageId: null,
				waitingForManualInput: false,
				configType: 'channel_selection',
				waitingForTownInput: 0
			});
			if(last) await this.deleteMessage(last, chatId);
			if(lastContent) await this.deleteMessage(lastContent, chatId);

		} catch(err) {
			this.sendErrorMessage('Ошибка showChannelSelection: ' + (err.message||err));
		}
	}

	async checkAdminRights(chatId, userId) {
		try {
			if (chatId > 0) return true;

			const admins = await this.bot.api.getChatAdmins(chatId);
			if (admins && Array.isArray(admins.members)) {
				return admins.members.some(admin => 
					admin.user_id === userId || admin.id === userId
				);
			}
			return false;
		} catch(err) {
			this.sendErrorMessage('Ошибка проверки прав: ' + (err.message||err));
			return false;
		}
	}

	async startConfigProcess(chatId, chatTitle, messageThreadId = "") {
		try {
			if (!chatTitle) 
			{	try {
					const chatInfo = await this.bot.api.getChat(chatId);
					chatTitle = chatInfo.title || chatInfo.username || `Чат ${chatId}`;
				} catch(e) {
					console.log('Ошибка chatTitle: '+e);
					chatTitle = `Чат ${chatId}`;
				}
			}
			const oldPending = this.pendingConfigs.get(chatId);
			const last = oldPending?.lastMessageId ? oldPending.lastMessageId : null;
			const lastContent = oldPending?.lastContentMessageId ? oldPending.lastContentMessageId : null;

			this.pendingConfigs.delete(chatId);

			const existing = this.findChatInConfig(chatId);

			let contentSettings = { Eg: true, News: true, Raspis: false };
			if(existing && existing.Eg !== undefined) {
				contentSettings.Eg = existing.Eg;
			}
			if(existing && existing.News !== undefined) {
				contentSettings.News = existing.News;
			}
			if(existing && existing.Raspis !== undefined) {
				contentSettings.Raspis = existing.Raspis;
			}

			const pendingData = {
				chatTitle,
				timestamp: Date.now(),
				waitingForManualInput: false,
				oldSettings: existing,
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
				if(chat.type === 'channel') chatType = 'канала';
				if(chat.type === 'chat') chatType = 'группы';
			} catch(e) {}

			const keyboard = this.createTimezoneKeyboard();

			let message = `⚙️ <b>Настройка бота для ${chatType}:</b> "${this.escapeHtml(chatTitle)}"\n\n` +
				`<b>Шаг 1/2: Выберите часовой пояс</b>\n` +
				`(Публикации будут выходить в указанное время по вашему часовому поясу)`;

			if(existing) {
				const hours = Math.abs(existing.offset / 60);
				const sign = existing.offset >= 0 ? '+' : '-';
				message += `\n\n📋 <b>Текущие настройки:</b> UTC${sign}${hours} ч.\n`;
			}

			if(messageThreadId) {
				message += `📌 <b>Тема форума:</b> ID ${messageThreadId}\n`;
			}

			const sentMessage = await this.bot.api.sendMessageToChat(chatId, message, {
				format: 'HTML',
				attachments: [keyboard]
			});

			pendingData.lastMessageId = sentMessage.body?.mid;
			this.pendingConfigs.set(chatId, pendingData);
			
			if(last) await this.deleteMessage(last, chatId);
			if(lastContent) await this.deleteMessage(lastContent, chatId);

		} catch(err) {
			this.sendErrorMessage('Ошибка startConfigProcess: ' + (err.message||err));
			await this.bot.api.sendMessageToChat(chatId, '❌ Произошла ошибка при настройке.');
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

		const buttons = [];
		for (const tz of russianTimezones) {
			buttons.push([Keyboard.button.callback(tz.label, `timezone_${tz.offset}`)]);
		}
		buttons.push([Keyboard.button.callback('✏️ Другой пояс', 'manual_timezone')]);
		buttons.push([Keyboard.button.callback('❌ Отмена', 'cancel_config')]);

		return Keyboard.inlineKeyboard(buttons);
	}

	parseTimezoneInput(text) {
		text = text.trim();

		const numMatch = text.match(/^([+-]?\d+(?:\.\d+)?)$/);
		if(numMatch) {
			const hours = parseFloat(numMatch[1]);
			if(hours >= -12 && hours <= 14) {
				return Math.round(hours * 60);
			}
		}

		return null;
	}

	async handleTimezoneSelection(chatId, timezoneOffset, messageThreadId = "") {
		try {
			const pending = this.pendingConfigs.get(chatId);
			if(!pending) {
				await this.bot.api.sendMessageToChat(chatId, '❌ Сессия настройки истекла. Начните заново с /config');
				return;
			}

			const offsetNum = parseInt(timezoneOffset, 10);
			if(isNaN(offsetNum)) {
				this.sendErrorMessage('handleTimezoneSelection: Неверный формат timezoneOffset: ' + timezoneOffset);
				await this.bot.api.sendMessageToChat(chatId, '❌ Ошибка: неверный формат часового пояса');
				return;
			}

			if(offsetNum < -720 || offsetNum > 840) {
				this.sendErrorMessage('handleTimezoneSelection: Часовой пояс вне диапазона: ' + offsetNum);
				await this.bot.api.sendMessageToChat(chatId, '❌ Ошибка: часовой пояс вне допустимого диапазона (-12...+14 часов)');
				return;
			}

			pending.timezoneOffset = offsetNum;
			pending.lastMessageId = null;
			this.pendingConfigs.set(chatId, pending);

			await this.showContentSelection(chatId);

		} catch(err) {
			this.sendErrorMessage('Ошибка handleTimezoneSelection: ' + (err.message||err));
			const pending = this.pendingConfigs.get(chatId);
			await this.bot.api.sendMessageToChat(chatId, '❌ Произошла ошибка при выборе часового пояса.');
		}
	}

	async showContentSelection(chatId) {
		try {
			const pending = this.pendingConfigs.get(chatId);
			if(!pending) {
				await this.bot.api.sendMessageToChat(chatId, '❌ Сессия настройки истекла. Начните заново с /config');
				return;
			}

			const keyboard = this.createContentKeyboard(pending.contentSettings);

			const message = `⚙️ <b>Настройка бота для чата:</b> "${this.escapeHtml(pending.chatTitle)}"\n\n` +
				`<b>Шаг 2/2: Выберите нужный контент</b>\n\n` +
				`✅ - будет получать\n` +
				`❌ - не будет получать\n\n`;

			const sentMessage = await this.bot.api.sendMessageToChat(chatId, message, {
				format: 'HTML',
				attachments: [keyboard]
			});

			pending.lastContentMessageId = sentMessage.body?.mid;
			pending.lastMessageId = sentMessage.body?.mid;
			this.pendingConfigs.set(chatId, pending);

		} catch(err) {
			this.sendErrorMessage('Ошибка showContentSelection: ' + (err.message||err));
			const pending = this.pendingConfigs.get(chatId);
			await this.bot.api.sendMessageToChat(chatId, '❌ Произошла ошибка при настройке контента.');
		}
	}

	createContentKeyboard(contentSettings) {
		const buttons = Keyboard.inlineKeyboard([
			[
				Keyboard.button.callback(`${contentSettings.Eg ? '✅' : '❌'} Ежедневник`, 'content_Eg'),
				Keyboard.button.callback(`${contentSettings.News ? '✅' : '❌'} Новости`, 'content_News')
			],
			[Keyboard.button.callback(`${contentSettings.Raspis ? '✅' : '❌'} Расписание`, 'content_Raspis')],
			[Keyboard.button.callback('💾 Сохранить', 'save_config')],
			[Keyboard.button.callback('❌ Отмена', 'cancel_config')]
		]);

		return (buttons);
	}

	async handleContentSelection(chatId, contentType) {
		try {
			const pending = this.pendingConfigs.get(chatId);
			if(!pending) {
				await this.bot.api.sendMessageToChat(chatId, '❌ Сессия настройки истекла. Начните заново с /config');
				return;
			}

			const contentSettings = pending.contentSettings || { Eg: true, News: true, Raspis: false };

			if(contentType === 'Eg' || contentType === 'News' || contentType === 'Raspis') {
				contentSettings[contentType] = !contentSettings[contentType];

				pending.contentSettings = contentSettings;

				const keyboard = this.createContentKeyboard(contentSettings);

				const message = `⚙️ <b>Настройка бота для чата:</b> "${this.escapeHtml(pending.chatTitle)}"\n\n` +
					`<b>Шаг 2/2: Выберите нужный контент</b>\n\n` +
					`✅ - будет получать\n` +
					`❌ - не будет получать\n\n`;

				try {
					await this.bot.api.editMessage(pending.lastContentMessageId, {
						text: message,
						format: 'HTML',
						attachments: [keyboard]
					});

					this.pendingConfigs.set(chatId, pending);

				} catch(err) {
					console.error('Ошибка редактирования сообщения:', (err.message||err));
					const sentMessage = await this.bot.api.sendMessageToChat(chatId, message, {
						format: 'HTML',
						attachments: [keyboard]
					});

					pending.lastContentMessageId = sentMessage.body?.mid;
					pending.lastMessageId = sentMessage.body?.mid;
					this.pendingConfigs.set(chatId, pending);
				}
			}

		} catch(err) {
			this.sendErrorMessage('Ошибка handleContentSelection: ' + (err.message||err));
			try {
				const pending = this.pendingConfigs.get(chatId);
				await this.bot.api.sendMessageToChat(chatId, '❌ Произошла ошибка при выборе контента.');
			} catch(e) {}
		}
	}

	async finishConfig(chatId) {
		try {
			let pending = this.pendingConfigs.get(chatId);
			if (!pending) {
				await this.bot.api.sendMessageToChat(chatId, '❌ Сессия настройки истекла. Начните заново с /config');
				return;
			}
			const last = pending?.lastMessageId ? pending.lastMessageId : null;
			const lastContent = pending?.lastContentMessageId ? pending.lastContentMessageId : null;

			if (pending.timezoneOffset === null) {
				await this.bot.api.sendMessageToChat(chatId, '❌ Ошибка: часовой пояс не выбран');
				if(last) await this.deleteMessage(last, chatId);
				if(lastContent) await this.deleteMessage(lastContent, chatId);
				return;
			}

			const contentSettings = pending.contentSettings || { Eg: true, News: true, Raspis: false };
			if (!contentSettings.Eg && !contentSettings.News && !contentSettings.Raspis) {
				await this.bot.api.sendMessageToChat(chatId,
					'❌ <b>Ошибка: должен быть выбран хотя бы один тип контента</b>\n\n' +
					`<b>Выберите хоть что нибудь и нажмите "Сохранить"</b>`,
					{ format: 'HTML' }
				);
				if(last) await this.deleteMessage(last, chatId);
				if(lastContent) await this.deleteMessage(lastContent, chatId);
				return;
			}

			const offsetNum = pending.timezoneOffset;
			const offsetKey = offsetNum >= 0 ? `+${offsetNum}` : `${offsetNum}`;

			if (!this.chat_news || typeof this.chat_news !== 'object') {
				this.chat_news = {};
			}

			const targetChatId = pending.chatId || chatId;
			this.removeChatFromAllTimezones(targetChatId, true);

			if (!this.chat_news[offsetKey] || !Array.isArray(this.chat_news[offsetKey])) {
				this.chat_news[offsetKey] = [];
			}

			const chatTitle = pending.chatTitle || `chat_${targetChatId}`;
			const chatEntry = {
				name: chatTitle,
				chatId: targetChatId.toString(),
				Eg: Boolean(contentSettings.Eg),
				News: Boolean(contentSettings.News),
				Raspis: Boolean(contentSettings.Raspis),
				timeAt: new Date().toISOString()
			};

			if (pending.townData) {
				chatEntry.town = pending.townData.name;
				chatEntry.slug = pending.townData.slug;
			}

			// Удаляем старую запись
			this.chat_news[offsetKey] = this.chat_news[offsetKey].filter(chat => {
				for (const [key, value] of Object.entries(chat)) {
					if (key !== 'Eg' && key !== 'News' && key !== 'Raspis' && key !== 'town' && key !== 'slug' &&
						(value.toString() === targetChatId.toString() || value === targetChatId)) {
						return false;
					}
				}
				return true;
			});

			this.chat_news[offsetKey].push(chatEntry);

			if (this.saveConfig('chat_configured', {
				chatId: targetChatId,
				chatTitle: chatTitle,
				timezone: offsetKey,
				contentSettings: contentSettings,
				isEdit: pending.isEdit || false
			})) {
				const hours = Math.abs(offsetNum / 60);
				const sign = offsetNum >= 0 ? '+' : '-';

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

				await this.bot.api.sendMessageToChat(chatId,
					`${completionMessage}\n\n` +
					`📝 <b>Чат:</b> "${this.escapeHtml(chatTitle)}"\n` +
					townInfo +
					`🌍 <b>Часовой пояс:</b> UTC${sign}${hours} ч.\n` +
					`<b>Получаем:</b>\n${contentInfo}`,
					{ format: 'HTML' }
				);
				if(last) await this.deleteMessage(last, chatId);
				if(lastContent) await this.deleteMessage(lastContent, chatId);
			} else {
				await this.bot.api.sendMessageToChat(chatId, '❌ Ошибка сохранения конфигурации.');
			}

			this.pendingConfigs.delete(chatId);

		} catch(err) {
			this.sendErrorMessage('Ошибка finishConfig: ' + (err.message||err));
			try {
				const pending = this.pendingConfigs.get(chatId);
				if(pending) this.pendingConfigs.delete(chatId);
			} catch(e) {}
			await this.bot.api.sendMessageToChat(chatId, '❌ Произошла ошибка при сохранении настроек.');
		}
	}

	async finishChannelConfig(chatId) {
		const pending = this.pendingConfigs.get(chatId);

		if(!pending) {
			await this.bot.api.sendMessageToChat(chatId, '❌ Сессия настройки истекла. Начните заново с /config_channel');
			return;
		}

		if(this.needTown && pending.contentSettings && pending.contentSettings.Raspis) {
			await this.getTownSlug(chatId);
		} else {
			await this.finishConfig(chatId);
		}
	}

	findChatInConfig(chatId) {
		if(!this.chat_news || typeof this.chat_news !== 'object') {
			return null;
		}

		for(const [timezoneKey, chats] of Object.entries(this.chat_news)) {
			if(!Array.isArray(chats)) {
				continue;
			}

			for(const chat of chats) {
				if(chat.chatId && (chat.chatId.toString() === chatId.toString() || chat.chatId === chatId)) {
					return {
						title: chat.name || `Chat ${chatId}`,
						offset: parseInt(timezoneKey, 10),
						timezoneKey,
						Eg: chat.Eg !== undefined ? chat.Eg : false,
						News: chat.News !== undefined ? chat.News : false,
						Raspis: chat.Raspis !== undefined ? chat.Raspis : false,
						town: chat.town || null,
						slug: chat.slug || null
					};
				}
			}
		}
		return null;
	}

	async getChatInfo(chatId) {
		const existing = this.findChatInConfig(chatId);

		if(!existing) {
			return `❌ <b>Этот чат не настроен для рассылки.</b>\nИспользуйте /config для настройки.`;
		}

		const hours = Math.abs(existing.offset / 60);
		const sign = existing.offset >= 0 ? '+' : '-';

		const contentTypes = [];
		if(existing.Eg) contentTypes.push('📔 Ежедневник');
		if(existing.News) contentTypes.push('🌐 Новости');
		if(existing.Raspis) contentTypes.push('📅 Расписание');
		let contentText;
		if(contentTypes.length > 0) {
			contentText = contentTypes.join('\n');
		} else {
			contentText = '❌ Не выбрано';
		}
		let townInfo = '';
		if(existing.town) {
			townInfo = `🏙️ <b>Город:</b> ${this.escapeHtml(existing.town)}\n`;
		}

		return `⚙️ <b>Настройки бота:</b>\n\n` +
			`📝 <b>Чат:</b> "${this.escapeHtml(existing.title)}"\n` +
			townInfo +
			`🌍 <b>Часовой пояс:</b> UTC${sign}${hours} ч.\n\n` +
			`<b>Получает:</b>\n${contentText}\n\n` +
			`ℹ️ <b>Команды:</b>\n` +
			`/config - перенастроить чат`;
	}

	async removeChatFromConfig(chatId, showConfirm = true) {
		try {
			const existing = this.findChatInConfig(chatId);

			if(!existing) {
				if(showConfirm) {
					await this.bot.api.sendMessageToChat(chatId,'❌ Этот чат не найден в настройках рассылки.');
				}
				return false;
			}

			const removed = this.removeChatFromAllTimezones(chatId, true);

			if(removed && showConfirm) {
				try {
					await this.bot.api.sendMessageToChat(chatId,
						`✅ Чат "${existing.title}" удален из рассылки публикаций.`
					);
				} catch(err) {}
			}

			return removed;

		} catch(err) {
			this.sendErrorMessage('Ошибка removeChatFromConfig: ' + (err.message||err));
			if(showConfirm) {
				try {
					const existing = this.findChatInConfig(chatId);
					await this.bot.api.sendMessageToChat(chatId, '❌ Ошибка при удалении чата.');
				} catch(e) {}
			}
			return false;
		}
	}

	removeChatFromAllTimezones(chatId, cleanupEmpty = true) {
		let removed = false;
		let chatName = '';

		if(!this.chat_news || typeof this.chat_news !== 'object') {
			this.chat_news = {};
			return false;
		}

		for(const [timezoneKey, chats] of Object.entries(this.chat_news)) {
			if(!Array.isArray(chats)) {
				continue;
			}

			const initialLength = chats.length;
			this.chat_news[timezoneKey] = chats.filter(chat => {
				if(chat.chatId && (chat.chatId.toString() === chatId.toString() || chat.chatId === chatId))
				{	chatName = chat.name || `Chat ${chatId}`;
					return false;
				}
				return true;
			});

			if(this.chat_news[timezoneKey].length !== initialLength) {
				removed = true;
			}

			if(cleanupEmpty && this.chat_news[timezoneKey].length === 0) {
				delete this.chat_news[timezoneKey];
				removed = true;
			}
		}

		if(removed) {
			this.saveConfig('chat_removed', {
				chatId: chatId,
				chatName: chatName,
				removedFromTimezones: true
			});
		}

		return removed;
	}

	setupCleanupTimer() {
		const CHAT_CLEANUP_INTERVAL = 6 * 60 * 60 * 1000 + 11*60000; // 6 часов 11 мин
		let nextChatCleanup = Date.now() + CHAT_CLEANUP_INTERVAL;

		// Очистка старых pending сессий каждые timeout минут
		this.cleanupTimer = setInterval(() => {
			const now = Date.now();
			const timeout = 20 * 60 * 1000; // 20 минут

			for(const [chatId, data] of this.pendingConfigs.entries()) {
				if(now - data.timestamp > timeout) {
					if(data.lastMessageId) {
						this.deleteMessage(data.lastMessageId, chatId);
					}
					if(data.lastContentMessageId) {
						this.deleteMessage(data.lastContentMessageId, chatId);
					}

					this.pendingConfigs.delete(chatId);
					console.log(`Очищена устаревшая сессия для чата ${chatId}`);
				}
			}

			if(this.pendingChannelSetup && now - this.pendingChannelSetup.timestamp > timeout) {
				this.pendingChannelSetup = null;
				console.log('Очищена устаревшая сессия настройки канала');
			}

			// Раз в сутки проверяем существование чатов
			if(now >= nextChatCleanup) { //каждые 6 часов
				nextChatCleanup = now + CHAT_CLEANUP_INTERVAL;
				this.cleanupDeadChats();
			}
		}, 10 * 60 * 1000);
	}

	async cleanupDeadChats() {
		try {
			this.sendErrorMessage('Начинаем очистку несуществующих чатов...');
			let cleaned = 0;
			
			try {
				await this.bot.api.getMyInfo();
			} catch (err) {
				this.sendErrorMessage('Нет соединения с MAX, очистка отложена');
				return;
			}
			
			if (!this.chat_news || typeof this.chat_news !== 'object') return;
			
			for (const [timezoneKey, chats] of Object.entries(this.chat_news))
			{
				if (!Array.isArray(chats)) continue;
				
				const chatIds = [];
				for (const chat of chats)
				{	if (chat.chatId) chatIds.push(chat.chatId);
				}
				
				if (chatIds.length === 0) continue;
				
				const deadIds = [];
				for (const chatId of chatIds) {
					try {
						await Promise.race([
							this.bot.api.getChat(chatId),
							new Promise((_, reject) => 
								setTimeout(() => reject(new Error('Timeout')), 10000)
							)
						]);
					} catch (err) {
						const msg = (err.message || err.response?.message || '').toLowerCase();
						if(	msg.includes('forbidden') || msg.includes('403') || 
							msg.includes('404') || msg.includes('not found'))
						{							
							console.log('Чат ' + chatId + ' не существует или бот удален, удаляем из конфига');
							deadIds.push(chatId.toString());
							cleaned++;
						}
						else
						{	this.sendErrorMessage('Обнаружена проблема со связью, очистка прервана', msg);
							return;
						}
					}
				}
				
				if (deadIds.length > 0) {
					for (let i = chats.length - 1; i >= 0; i--) {
						const chat = chats[i];
						if (chat.chatId && deadIds.includes(chat.chatId.toString())) {
							chats.splice(i, 1);
						}
					}
					if (chats.length === 0) {
						delete this.chat_news[timezoneKey];
					}
				}
			}
			
			if (cleaned > 0) {
				this.saveConfig('cleanup_completed', {cleanedCount: cleaned, timestamp: Date.now()});
			} else {
				this.sendErrorMessage('Очистка завершена: нет удаленных чатов');
			}
			
		} catch (err) {
			this.sendErrorMessage('Ошибка при очистке несуществующих чатов: ' + (err.message || err));
		}
	}

	stop() {
		return new Promise((resolve) => {
			try {
				if(this.bot) {
					this.bot.stop();
					console.log('SlaveMaxBot остановлен');
				}

				if(this.cleanupTimer) {
					clearInterval(this.cleanupTimer);
					this.cleanupTimer = null;
				}

				this.pendingConfigs.clear();
				this.pendingChannelSetup = null;

				if(this.recoveryTimer) {
					clearTimeout(this.recoveryTimer);
					this.recoveryTimer = null;
				}

			} catch(err) {
				this.sendErrorMessage('Ошибка остановки SlaveMaxBot: ' + (err.message||err));
			}
			resolve();
		});
	}

	getCurrentConfig() {
		return this.chat_news;
	}

	escapeMarkdown(text) {
		if(typeof text !== 'string') return text;
		return text.replace(/([_*\[\]()~`>#])/g, '\\$1');
	}

	escapeHtml(text) {
		if(typeof text !== 'string') return text;
		return text
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;')
			.replace(/"/g, '&quot;')
			.replace(/'/g, '&#039;');
	}

	// ============ МЕТОДЫ ДЛЯ РАБОТЫ С КАНАЛАМИ ============

	async requestChannelId(chatId) {
		try {
			const sentMessage = await this.bot.api.sendMessageToChat(chatId,
				`🆔 <b>Введите ID канала:</b>\n\n` +
				`<b>Формат:</b>\n` +
				`• -1234567890\n\n` +
				`<b>Как получить ID канала:</b>\n` +
				`1. При добавлении меня в канал, я присылаю\n` +
				`   сообщение со ссылкой и номером ID канала\n` +
				`2. Сопируйте и вставьте номер ID из сообщения\n` +
				`Или получите ID канала любым другим доступным способом\n\n` +
				`<b>Примечание:</b>\n` +
				`• ID канала всегда начинается с минуса, но если скопировать` +
				`с минусом не получается, то я добавлю его сам!\n`,
				{
					format: 'HTML'
				}
			);
			
			const pending = this.pendingConfigs.get(chatId);
			if(pending) {
				pending.lastMessageId = sentMessage.body?.mid;
				this.pendingConfigs.set(chatId, pending);
			}

			this.pendingChannelSetup = {
				userId: chatId,
				waitingForChannelId: true,
				timestamp: Date.now()
			};
		} catch(err) {
			this.sendErrorMessage('Ошибка requestChannelId: ' + (err.message||err));
		}
	}

	async showChannelHelp(chatId) {
		try {
			const helpText = `<b>📚 Помощь по настройке каналов</b>\n\n` +
				`<b>Как получить ID канала:</b>\n\n` +
				`1. Добавьте бота в канал как администратора\n` +
				`2. ID канала можно найти в веб-версии web.max.ru\n` +
				`3. Либо используйте @id380124799522_1_bot для определения ID канала\n\n` +
				`<b>Формат ID канала:</b>\n` +
				`• Отрицательное число\n` +
				`• Пример: -1234567890\n\n` +
				`<b>Для публичных каналов можно также использовать юзернейм:</b>\n` +
				`• Например: @my_channel или просто my_channel\n\n` +
				`<b>Проверка прав:</b>\n` +
				`• Вы должны быть администратором канала\n` +
				`• Бот должен быть администратором канала`;

			const keyboard = Keyboard.inlineKeyboard([
				[Keyboard.button.callback('🆔 Ввести ID канала', 'channel_by_id')],
				[Keyboard.button.callback('❌ Отмена', 'cancel_channel_setup')]
			]);

			const sentMessage = await this.bot.api.sendMessageToChat(chatId, helpText, {
				format: 'HTML',
				attachments: [keyboard]
			});

			const pending = this.pendingConfigs.get(chatId);
			if(pending) {
				pending.lastMessageId = sentMessage.body?.mid;
				this.pendingConfigs.set(chatId, pending);
			}
		} catch(err) {
			this.sendErrorMessage('Ошибка showChannelHelp: ' + (err.message||err));
		}
	}

	async processChannelInput(chatId, input, inputType) {
		try {
			let channelIdentifier = input.trim();

			if (inputType === 'id') {
				if (channelIdentifier.startsWith('@')) 
				{
					const username = channelIdentifier.substring(1);

					if (!username.match(/^[a-zA-Z0-9_]{5,32}$/)) {
						const sentMessage = await this.bot.api.sendMessageToChat(chatId,
							`❌ <b>Неверный формат юзернейма.</b>\n` +
							`<b>Юзернейм должен содержать 5-32 символа:</b>\n` +
							`• Латинские буквы a-z, A-Z\n` +
							`• Цифры 0-9\n` +
							`• Нижнее подчеркивание _\n\n` +
							`<b>Используйте ID канала</b>`,
							{ format: 'HTML' }
						);

						const pending = this.pendingConfigs.get(chatId);
						if (pending) {
							pending.lastMessageId = sentMessage.body?.mid;
							this.pendingConfigs.set(chatId, pending);
						}
						return;
					}

					try {
						const chat = await this.bot.api.getChat(`@${username}`);

						if (chat.type !== 'channel') {
							await this.bot.api.sendMessageToChat(chatId,
								`❌ <b>Это не канал.</b>\n` +
								`"@${username}" — это ${chat.type}.\n` +
								`<b>Используйте ID именно канала.</b>`,
								{ format: 'HTML' }
							);
							return;
						}

						await this.startChannelConfig(chatId, chat.chat_id, chat.title, 'username');

					} catch(err) {
						await this.bot.api.sendMessageToChat(chatId,
							`❌ <b>Канал не найден или является частным.</b>\n\n` +
							`<b>Используйте ID канала</b>`,
							{ format: 'HTML' }
						);
					}
					return;
				}

				let channelIdNum = parseInt(channelIdentifier);

				if (isNaN(channelIdNum)) {
					const sentMessage = await this.bot.api.sendMessageToChat(chatId,
						`❌ <b>Неверный формат ID.</b>\n` +
						`<b>ID канала должен быть числом, например:</b>\n` +
						`-1234567890\n\n` +
						`<b>Используйте ID канала</b>`,
						{ format: 'HTML' }
					);

					const pending = this.pendingConfigs.get(chatId);
					if (pending) {
						pending.lastMessageId = sentMessage.body?.mid;
						this.pendingConfigs.set(chatId, pending);
					}
					return;
				}
				if (channelIdNum > 0) channelIdNum = -channelIdNum;

				try {
					const chat = await this.bot.api.getChat(channelIdNum);

					if (chat.type !== 'channel') {
						await this.bot.api.sendMessageToChat(chatId,
							`❌ <b>Это не канал.</b>\n` +
							`ID ${channelIdNum} — это ${chat.type}.\n` +
							`<b>Укажите ID именно канала.</b>`,
							{ format: 'HTML' }
						);
						return;
					}

					await this.startChannelConfig(chatId, chat.chat_id, chat.title, 'id');

				} catch(err) {
					await this.bot.api.sendMessageToChat(chatId,
						`❌ <b>Не удалось получить информацию о канале.</b>\n\n` +
						`<b>Возможные причины:</b>\n` +
						`1. Бот не добавлен в этот канал\n` +
						`2. ID канала указан неверно\n` +
						`3. Канал не существует\n\n` +
						`<b>Проверьте, что:</b>\n` +
						`• ID канала правильный\n` +
						`• Бот добавлен в канал как администратор\n` +
						`• Вы администратор канала`,
						{ format: 'HTML' }
					);
				}
			}

		} catch(err) {
			this.sendErrorMessage('Ошибка processChannelInput: ' + (err.message||err));
			await this.bot.api.sendMessageToChat(chatId,
				`❌ <b>Ошибка при обработке данных канала.</b>\n` +
				`Попробуйте еще раз или обратитесь к администратору.`,
				{ format: 'HTML' }
			);
		}
	}

	async startChannelConfig(chatId, channelId, channelTitle = null, sourceType = 'unknown') {
		try {
			const pending = this.pendingConfigs.get(chatId);
			const userId = pending?.userId || '';
			const last = pending?.lastMessageId ? pending.lastMessageId : null;
			const lastContent = pending?.lastContentMessageId ? pending.lastContentMessageId : null;

			this.pendingConfigs.delete(chatId);

			const existingConfig = this.findChatInConfig(channelId);

			if(existingConfig) {
				const hours = Math.abs(existingConfig.offset / 60);
				const sign = existingConfig.offset >= 0 ? '+' : '-';

				const contentTypes = [];
				if(existingConfig.Eg) contentTypes.push('📔 Ежедневник');
				if(existingConfig.News) contentTypes.push('🌐 Новости');
				if(existingConfig.Raspis) contentTypes.push('📅 Расписание');
				const contentInfo = contentTypes.length > 0 ? contentTypes.join('\n') : '❌ Не выбрано';

				const keyboard = Keyboard.inlineKeyboard([
					[
						Keyboard.button.callback('✏️ Изменить настройки', `edit_channel_${channelId}`),
						Keyboard.button.callback('🗑️ Удалить из рассылки', `remove_channel_${channelId}`)
					],
					[Keyboard.button.callback('❌ Отмена', 'cancel_channel_setup')]
				]);

				const sentMessage = await this.bot.api.sendMessageToChat(chatId,
					`⚠️ <b>Этот канал уже настроен!</b>\n\n` +
					`📢 <b>Канал:</b> "${this.escapeHtml(existingConfig.title)}"\n` +
					`🌍 <b>Часовой пояс:</b> UTC${sign}${hours} ч.\n` +
					`<b>Получает:</b>\n${contentInfo}\n\n` +
					`<b>Что вы хотите сделать?</b>`,
					{
						format: 'HTML',
						attachments: [keyboard]
					}
				);

				this.pendingConfigs.set(chatId, {
					userId: userId,
					chatId: channelId,
					timestamp: Date.now(),
					lastMessageId: sentMessage.body?.mid,
					lastContentMessageId: null,
					configType: 'channel_manage',
					waitingForTownInput: 0
				});

				if(last) await this.deleteMessage(last, chatId);
				if(lastContent) await this.deleteMessage(lastContent, chatId);
				return;
			}

			const isAdmin = await this.checkChannelAdminRights(channelId, userId);

			if(!isAdmin) {
				const keyboard = Keyboard.inlineKeyboard([
					[Keyboard.button.callback('❌ Отмена', 'cancel_channel_setup')]
				]);

				const sentMessage = await this.bot.api.sendMessageToChat(chatId,
					`❌ <b>Доступ запрещен</b>\n\n` +
					`Вы не являетесь администратором этого канала.\n` +
					`<b>Только администраторы могут настраивать бота.</b>\n\n` +
					`Добавьте себя как администратора в настройках канала.`,
					{
						format: 'HTML',
						attachments: [keyboard]
					}
				);

				this.pendingConfigs.set(chatId, {
					userId: userId,
					timestamp: Date.now(),
					lastMessageId: sentMessage.body?.mid,
					lastContentMessageId: null,
					configType: 'channel_error',
					waitingForTownInput: 0
				});

				if(last) await this.deleteMessage(last, chatId);
				if(lastContent) await this.deleteMessage(lastContent, chatId);
				return;
			}

			if(!this.botUsername) await this.initbotname();
			const botUsername = '@' + this.botUsername;
			const botIsAdmin = await this.checkChannelAdminRights(channelId, this.botId);

			if(!botIsAdmin) {
				const keyboard = Keyboard.inlineKeyboard([
					[Keyboard.button.callback('❌ Отмена', 'cancel_channel_setup')]
				]);

				const sentMessage = await this.bot.api.sendMessageToChat(chatId,
					`❌ <b>Бот не имеет прав</b>\n\n` +
					`Бот должен быть администратором канала.\n\n` +
					`<b>Добавьте бота в канал как администратора:</b>\n` +
					`1. Откройте настройки канала\n` +
					`2. Добавьте участника: ${botUsername}\n` +
					`3. Назначьте права администратора\n` +
					`4. Включите разрешение "Публикация сообщений"`,
					{
						format: 'HTML',
						attachments: [keyboard]
					}
				);

				this.pendingConfigs.set(chatId, {
					userId: userId,
					timestamp: Date.now(),
					lastMessageId: sentMessage.body?.mid,
					lastContentMessageId: null,
					configType: 'channel_error',
					waitingForTownInput: 0
				});

				if(last) await this.deleteMessage(last, chatId);
				if(lastContent) await this.deleteMessage(lastContent, chatId);
				return;
			}

			if(!channelTitle) {
				try {
					const chat = await this.bot.api.getChat(channelId);
					channelTitle = chat.title;
				} catch(err) {
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
				timezoneOffset: null,
				contentSettings: { Eg: true, News: true, Raspis: true },
				lastContentMessageId: null,
				lastMessageId: null,
				configType: 'channel',
				sourceType: sourceType,
				isEdit: false,
				waitingForTownInput: 0
			};

			this.pendingConfigs.set(chatId, pendingData);

			const keyboard = this.createTimezoneKeyboard();

			let sourceInfo = '';
			if(sourceType === 'username') {
				sourceInfo = ' (по юзернейму)';
			} else if(sourceType === 'id') {
				sourceInfo = ' (по ID)';
			}

			const sentMessage = await this.bot.api.sendMessageToChat(chatId,
				`✅ <b>Канал найден!</b>${sourceInfo}\n\n` +
				`📢 <b>Канал:</b> "${this.escapeHtml(channelTitle)}"\n` +
				`🆔 <b>ID:</b> ${channelId}\n\n` +
				`<b>Шаг 1/2: Выберите часовой пояс</b>\n` +
				`(Публикации будут выходить в указанное время по вашему часовому поясу)`,
				{
					format: 'HTML',
					attachments: [keyboard]
				}
			);

			pendingData.lastMessageId = sentMessage.body?.mid;
			this.pendingConfigs.set(chatId, pendingData);
			
			if(last) await this.deleteMessage(last, chatId);
			if(lastContent) await this.deleteMessage(lastContent, chatId);

		} catch(err) {
			this.sendErrorMessage('Ошибка startChannelConfig: ' + (err.message||err));
			const keyboard = Keyboard.inlineKeyboard([
				[Keyboard.button.callback('❌ Отмена', 'cancel_channel_setup')]
			]);

			const sentMessage = await this.bot.api.sendMessageToChat(chatId,
				`❌ <b>Произошла ошибка при настройке канала.</b>\n` +
				`<b>Проверьте, что:</b>\n` +
				`1. Бот добавлен в канал\n` +
				`2. Вы и бот — администраторы канала`,
				{
					format: 'HTML',
					attachments: [keyboard]
				}
			);

			this.pendingConfigs.set(chatId, {
				userId: userId,
				timestamp: Date.now(),
				lastMessageId: sentMessage.body?.mid,
				lastContentMessageId: null,
				configType: 'channel_error',
				waitingForTownInput: 0
			});
		}
	}

	async startChannelEdit(chatId, channelId, channelTitle) {
		try {
			const pending = this.pendingConfigs.get(chatId);
			const userId = pending?.userId || '';
			const last = pending?.lastMessageId ? pending.lastMessageId : null;
			const lastContent = pending?.lastContentMessageId ? pending.lastContentMessageId : null;

			this.pendingConfigs.delete(chatId);

			const existing = this.findChatInConfig(channelId);
			if(!existing) 
			{
				const keyboard = Keyboard.inlineKeyboard([
					[Keyboard.button.callback('❌ Отмена', 'cancel_channel_setup')]
				]);

				const sentMessage = await this.bot.api.sendMessageToChat(chatId,
					`❌ <b>Настройки канала не найдены.</b>\n` +
					`Возможно, канал уже был удален из рассылки.`,
					{
						format: 'HTML',
						attachments: [keyboard]
					}
				);

				this.pendingConfigs.set(chatId, {
					userId: userId,
					timestamp: Date.now(),
					lastMessageId: sentMessage.body?.mid,
					lastContentMessageId: null,
					configType: 'channel_error',
					waitingForTownInput: 0
				});

				if(last) await this.deleteMessage(last, chatId);
				if(lastContent) await this.deleteMessage(lastContent, chatId);
				return;
			}

			let contentSettings = { Eg: true, News: true, Raspis: true };
			if(existing && existing.Eg !== undefined) {
				contentSettings.Eg = existing.Eg;
			}
			if(existing && existing.News !== undefined) {
				contentSettings.News = existing.News;
			}
			if(existing && existing.Raspis !== undefined) {
				contentSettings.Raspis = existing.Raspis;
			}

			const pendingData = {
				userId: userId,
				chatId: channelId,
				chatTitle: channelTitle,
				timestamp: Date.now(),
				waitingForManualInput: false,
				oldSettings: existing,
				timezoneOffset: existing.offset,
				contentSettings: contentSettings,
				lastContentMessageId: null,
				lastMessageId: null,
				configType: 'channel',
				sourceType: 'edit',
				isEdit: true,
				waitingForTownInput: 0
			};

			this.pendingConfigs.set(chatId, pendingData);

			const hours = Math.abs(existing.offset / 60);
			const sign = existing.offset >= 0 ? '+' : '-';

			const contentTypes = [];
			if(contentSettings.Eg) contentTypes.push('📔 Ежедневник');
			if(contentSettings.News) contentTypes.push('🌐 Новости');
			if(contentSettings.Raspis) contentTypes.push('📅 Расписание');
			const contentInfo = contentTypes.length > 0 ? contentTypes.join('\n') : '❌ Не выбрано';

			let townInfo = '';
			if(existing.town) {
				townInfo = `🏙️ <b>Город:</b> ${this.escapeHtml(existing.town)}\n`;
			}

			const keyboard = this.createTimezoneKeyboard();

			const sentMessage = await this.bot.api.sendMessageToChat(chatId,
				`✏️ <b>Редактирование настроек канала</b>\n\n` +
				`📢 <b>Канал:</b> "${this.escapeHtml(channelTitle)}"\n` +
				townInfo +
				`🌍 <b>Текущий часовой пояс:</b> UTC${sign}${hours} ч.\n` +
				`<b>Текущие настройки контента:</b>\n${contentInfo}\n\n` +
				`<b>Шаг 1/2: Выберите новый часовой пояс</b>\n` +
				`(или оставьте текущий)`,
				{
					format: 'HTML',
					attachments: [keyboard]
				}
			);

			pendingData.lastMessageId = sentMessage.body?.mid;
			this.pendingConfigs.set(chatId, pendingData);
			
			if(last) await this.deleteMessage(last, chatId);
			if(lastContent) await this.deleteMessage(lastContent, chatId);

		} catch(err) {
			this.sendErrorMessage('Ошибка startChannelEdit: ' + (err.message||err));
			const keyboard = Keyboard.inlineKeyboard([
				[Keyboard.button.callback('❌ Отмена', 'cancel_channel_setup')]
			]);

			const sentMessage = await this.bot.api.sendMessageToChat(chatId,
				`❌ <b>Произошла ошибка при редактировании настроек.</b>`,
				{
					format: 'HTML',
					attachments: [keyboard]
				}
			);

			this.pendingConfigs.set(chatId, {
				userId: userId,
				timestamp: Date.now(),
				lastMessageId: sentMessage.body?.mid,
				lastContentMessageId: null,
				configType: 'channel_error',
				waitingForTownInput: 0
			});
		}
	}

	async removeChannelFromConfig(chatId, channelId) {
		try {
			const pending = this.pendingConfigs.get(chatId);
			const userId = pending?.userId || '';
			
			const existing = this.findChatInConfig(channelId);
			if(!existing) {
				const keyboard = Keyboard.inlineKeyboard([
					[Keyboard.button.callback('❌ Отмена', 'cancel_channel_setup')]
				]);

				const sentMessage = await this.bot.api.sendMessageToChat(chatId,
					`❌ <b>Канал не найден в настройках рассылки.</b>`,
					{
						format: 'HTML',
						attachments: [keyboard]
					}
				);

				this.pendingConfigs.set(chatId, {
					userId: userId,
					timestamp: Date.now(),
					lastMessageId: sentMessage.body?.mid,
					lastContentMessageId: null,
					configType: 'channel_remove',
					waitingForTownInput: 0
				});

				return;
			}

			const keyboard = Keyboard.inlineKeyboard([
				[
					Keyboard.button.callback('✅ Да, удалить', `confirm_remove_channel_${channelId}`),
					Keyboard.button.callback('❌ Отмена', 'cancel_channel_setup')
				]
			]);

			const sentMessage = await this.bot.api.sendMessageToChat(chatId,
				`⚠️ <b>Вы уверены, что хотите удалить канал из рассылки?</b>\n\n` +
				`📢 <b>Канал:</b> "${this.escapeHtml(existing.title)}"\n` +
				`<b>Это действие нельзя отменить.</b>`,
				{
					format: 'HTML',
					attachments: [keyboard]
				}
			);

			this.pendingConfigs.set(chatId, {
				userId: userId,
				timestamp: Date.now(),
				lastMessageId: sentMessage.body?.mid,
				lastContentMessageId: null,
				configType: 'channel_remove',
				waitingForTownInput: 0
			});

		} catch(err) {
			this.sendErrorMessage('Ошибка removeChannelFromConfig: ' + (err.message||err));
			const keyboard = Keyboard.inlineKeyboard([
				[Keyboard.button.callback('❌ Отмена', 'cancel_channel_setup')]
			]);

			const sentMessage = await this.bot.api.sendMessageToChat(chatId,
				`❌ <b>Произошла ошибка при удалении канала.</b>`,
				{
					format: 'HTML',
					attachments: [keyboard]
				}
			);

			this.pendingConfigs.set(chatId, {
				userId: userId,
				timestamp: Date.now(),
				lastMessageId: sentMessage.body?.mid,
				lastContentMessageId: null,
				configType: 'channel_error',
				waitingForTownInput: 0
			});
		}
	}

	async checkChannelAdminRights(channelId, userId) {
		try {
			const admins = await this.bot.api.getChatAdmins(channelId);
			if (admins && Array.isArray(admins.members)) {
				return admins.members.some(admin => 
					admin.user_id === userId || admin.id === userId
				);
			}
			return false;
		} catch(err) {
			this.sendErrorMessage('Ошибка проверки прав в канале: ' + (err.message||err));
			return false;
		}
	}

	async isBotAdmin(chatId, checkDeletePermission = false) {
		try {
			if (chatId > 0) return true;
			const botId = this.botId;
			const admins = await this.bot.api.getChatAdmins(chatId);
			
			if (admins && Array.isArray(admins.members)) {
				const user = admins.members.find(m => 
					m.user_id === parseInt(botId) || m.id === parseInt(botId)
				);
				if (user) {
					const isAdmin = user.is_admin === true || user.is_owner === true;
					if (!isAdmin) return false;
					/*if (checkDeletePermission) {
						return user.permissions?.includes('delete') === true;
					}*/
					return true;
				}
			}
			return false;
		} catch(err) {
			this.sendErrorMessage('Ошибка проверки прав бота: ' + (err.message||err));
			return false;
		}
	}

	sendErrorMessage(message) {
		console.error(message);
		this.saveConfig('common_message', { message: message, timestamp: Date.now() });
	}

	async getTownSlug(chatId) {
		try {
			const pending = this.pendingConfigs.get(chatId);
			const last = pending?.lastMessageId ? pending.lastMessageId : null;
			if(!pending) {
				await this.bot.api.sendMessageToChat(chatId, '❌ Сессия настройки истекла. Начните заново с /config');
				return;
			}

			const isAdmin = await this.isBotAdmin(chatId);
			if(!isAdmin) {
				await this.bot.api.sendMessageToChat(chatId,
					`⚠️ <b>Для настройки расписания мне нужно быть администратором группы</b>\n\n` +
					`1. Сделайте меня администратором с минимальными правами чтения и удаления.\n` +
					`2. Начните настройку заново командой /config`,
					{
						format: 'HTML'
					}
				);

				if(pending.waitingForTownInput) pending.waitingForTownInput = 0;
				if(pending.waitingForManualInput) pending.waitingForManualInput = false;
				this.pendingConfigs.delete(chatId);
				if(last) await this.deleteMessage(last, chatId);
				return;
			}

			const keyboard = Keyboard.inlineKeyboard([
				[Keyboard.button.callback('❌ Отмена', 'cancel_config')]
			]);

			const sentMessage = await this.bot.api.sendMessageToChat(chatId,
				`🏙️ <b>Для получения расписания в своем городе</b>\n\n` +
				`Пришлите мне, пожалуйста, <b>название своего города</b>.\n` +
				`Постарайтесь написать его так, как город называется на картах.\n\n` +
				`<i>Например:</i> Москва, Санкт-Петербург, Казань\n\n` +
				`Возможен поиск по части названия.`,
				{
					format: 'HTML',
					attachments: [keyboard]
				}
			);

			pending.waitingForTownInput = 1;
			pending.lastMessageId = sentMessage.body?.mid;
			pending.lastContentMessageId = null;
			this.pendingConfigs.set(chatId, pending);
			if(last) await this.deleteMessage(last, chatId);

		} catch(err) {
			this.sendErrorMessage('Ошибка в getTownSlug: ' + (err.message||err));
		}
	}

	async checkBotPerm(chatId, messageThreadId = null) {
		try {
			const hasPermissions = await this.isBotAdmin(chatId, true);
			if(!hasPermissions) {
				await this.bot.api.sendMessageToChat(chatId,
					`⚠️ <b>Для корректной работы мне нужно быть администратором</b>\n\n` +
					`Пожалуйста, сделайте меня администратором с минимальными правами:\n` +
					`• ✅ Чтение сообщений\n` +
					`• ✅ Удаление сообщений\n\n` +
					`Остальные права можно отключить.\n\n` +
					`После этого используйте /config для настройки.`,
					{
						format: 'HTML'
					}
				);
				return false;
			}
			return true;
		} catch(err) {
			this.sendErrorMessage('Ошибка проверки прав бота: ' + (err.message||err));
			return false;
		}
	}
	
	async deleteMessage(messageId, chatId = null) {
		try {
			await this.bot.api.deleteMessage(messageId);
			
			if (chatId) {
				const pending = this.pendingConfigs.get(chatId);
				if (pending) {
					let flag = false;
					if (pending.lastMessageId === messageId) {pending.lastMessageId = null; flag = true;}
					if (pending.lastContentMessageId === messageId) {pending.lastContentMessageId = null; flag = true;}
					if(flag) this.pendingConfigs.set(chatId, pending);
				}
			}
		} catch(e) {}
		//await this.sleep(200);
	}
	
	async sleep(ms) {return new Promise(resolve => setTimeout(resolve, ms));}
}

module.exports = SlaveMaxBot;