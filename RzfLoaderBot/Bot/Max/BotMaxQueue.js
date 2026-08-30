// очередь для сообщений в Макс
// под библиотеку @maxhub/max-bot-api
const { EventEmitter } = require('events');
const fs = require('fs');

class BotMaxQueue extends EventEmitter {
    constructor(bot, options = {}) {
        super();
        this.bot = bot;
        this.queue = [];
        this.isProcessing = false;
        this.isConnected = true; // При polling: true изначально считаем соединение активным.
        
        // Настройки
        this.maxRetries = options.maxRetries || 3;
        this.retryDelay = options.retryDelay || 5000;
        this.messagesPerSecond = options.messagesPerSecond || 10;
        this.maxConsecutiveErrors = options.maxConsecutiveErrors || 5;
        
        // Улучшенные счетчики
        this.retryCounts = new Map();
        this.lastSentTime = 0;
        this.consecutiveErrors = 0;
		this.queueCount = 0;
        
        // Настройка обработчиков ошибок для polling бота
        this._setupErrorHandlers();
		this.connectTimer = null;
    }
	//====================================================================
    /**
     * Обработчики ошибок для polling бота (max-bot-api)
     */
    _setupErrorHandlers() {
        this.bot.on('error', (error) => {
            this.consecutiveErrors++;
            console.error(`Bot error (${this.consecutiveErrors}):`, error.message);
            
            if (this.consecutiveErrors >= this.maxConsecutiveErrors || this._isNetworkError(error)) 
			{	this.isConnected = false;
                error.message = error.message ? ('(max queue error)=> '+error.message) : 'max queue error';
				this.emit('disconnected', error);
            }
            
            this._scheduleReconnection();
        });

        this.bot.on('message_callback', (msg) => 
		{
			// Сбрасываем счетчик ошибок при успешном получении сообщений
            if(this.consecutiveErrors > 0)
			{	this.consecutiveErrors = 0;
				if (!this.isConnected)
				{	this.isConnected = true;
					this.emit('connected');
					this._processQueue();
				}
			}
        });
    }
	//====================================================================
    /**
     * Проверка типа ошибки (сетевая или API), возвращает true/false
     * Для max-bot-api на Node.js 18 ошибки приходят через error.cause.code
     */
    _isNetworkError(error) {
        // Проверяем error.cause.code (основной источник в Node.js 18)
        if (error.cause && error.cause.code) {
            const code = error.cause.code;
            if (typeof code === 'string' && code.startsWith('UND_ERR_')) {
                return true;
            }
            const netCodes = ['ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'EAI_AGAIN', 'ENETUNREACH'];
            if (netCodes.includes(code)) {
                return true;
            }
			const httpCodes = ['429', '500', '503', '504'];
			if (httpCodes.includes(String(code))) {
				return true;
			}
        }
        
        // Проверяем error.code (если ошибка пришла напрямую)
        if (error.code) {
            const code = error.code;
            if (typeof code === 'string' && code.startsWith('UND_ERR_')) {
                return true;
            }
            const netCodes = ['ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'EAI_AGAIN', 'ENETUNREACH'];
            if (netCodes.includes(code)) {
                return true;
            }
			const httpCodes = ['429', '500', '503', '504'];
			if (httpCodes.includes(String(code))) {
				return true;
			}
        }
        
        // Проверка сообщения на сетевые проблемы
        const errorMessage = (error.message || '').toLowerCase();
        const networkMessages = [
			'socket hang up',      // Разрыв соединения
			'getaddrinfo',         // DNS ошибка
			'connect e',           // Ошибка подключения
			'econnreset',          // Сброс соединения
			'etimedout',           // Таймаут
			'enotfound',           // Хост не найден
			'eai_again',           // DNS временная ошибка
			'econnrefused',        // Соединение отклонено
			'enetunreach',         // Сеть недоступна
			'timeout',             // Таймаут
			'network',             // Сетевая проблема
			'tls',                 // TLS/SSL ошибка
			'certificate',         // Ошибка сертификата
			'fetch failed',        // max-bot-api
			'request failed',      // max-bot-api
			'429',                 // Too Many Requests
			'500',                 // Internal Server Error
			'503',                 // Service Unavailable
			'504',                 // Gateway Timeout
			'rate limit',          // Rate limiting
			'too many requests',   // Too Many Requests
			'service unavailable',
			'internal server error',
			'gateway timeout'
        ];
        if (networkMessages.some(msg => errorMessage.includes(msg))) {
            return true;
        }
        
        return false;
    }
	//====================================================================
    /**
     * Планирование переподключения с экспоненциальной задержкой
     */
    _scheduleReconnection() {
        if (!this.isConnected) {
            const delay = Math.min(
                this.retryDelay * Math.pow(2, this.consecutiveErrors), 
                300000 // Максимум 5 минут
            );
            console.log(`Schedule reconnection in ${delay}ms`);
            clearTimeout(this.connectTimer);
			this.connectTimer = setTimeout(() => this._checkConnection(), delay);
        }
    }
	//====================================================================
    /**
     * Проверка соединения
     * Для max-bot-api используем getMyInfo() — он доступен
     */
    async _checkConnection() {
        try {
            await this.bot.getMyInfo();
            if (!this.isConnected) {
                this.isConnected = true;
                this.consecutiveErrors = 0;
                this.emit('connected');
                this._processQueue();
            }
        } catch (error) {
            console.error('Connection check failed:', error.message);
            // Продолжаем попытки
            this._scheduleReconnection();
        }
    }
	//====================================================================
    /**
     * Добавление сообщения в очередь
     */
    addToQueue(messageData) {
        const queueItem = {
            id: String(++this.queueCount).padStart(4, '0')+'_bot',
			timestamp: Date.now(),
            type: messageData.type || 'sendText',
            chatId: messageData.chatId,
			username: messageData.username || 'undefined',
            data: messageData.data || {}, // data: { text, path, paths[], markups[] }
            attempts: 0,
			bot: messageData.bot || null	//this.bot // по умолчанию основной бот
        };

        this.queue.push(queueItem);
        this.emit('queued', queueItem.id);
        
        // Пытаемся обработать очередь сразу
        if (this.isConnected && !this.isProcessing) {
            this._processQueue();
        }
        
        return queueItem.id;
    }
	//====================================================================
    /**
     * Обработка очереди
     */
    async _processQueue() {
        if (this.isProcessing || !this.isConnected || this.queue.length === 0) {return;}

        this.isProcessing = true;
        //this.emit('processing_started', this.queue.length);

        try {
            while (this.queue.length > 0 && this.isConnected)
			{
                const now = Date.now();
                const timeSinceLastMessage = now - this.lastSentTime;
                const minInterval = 1000 / this.messagesPerSecond;

                // Соблюдаем лимит сообщений в секунду
                if (timeSinceLastMessage < minInterval) {
                    await this._delay(minInterval - timeSinceLastMessage);
                }

                const queueItem = this.queue[0];
                
                try {
                    await this._sendMessage(queueItem);
                    this.lastSentTime = Date.now();
                    
                    // Успешная отправка
                    this.emit('sent', queueItem);
                    
                    // Сбрасываем счетчик ошибок при успешной отправке
                    this.consecutiveErrors = 0;
                    
                }
				catch (error) 
				{	queueItem.attempts++;
                    this.consecutiveErrors++;
					//if(error.message && !error.message.includes('Can\'t deserialize body')) 
						this.emit('failed', queueItem, error);//отправка с ошибкой
					await this._delay(10);
					//если пропала связь, то выходим
					if (this._isNetworkError(error) || !this.isConnected) 
					{
						await this._delay(60000);
						this.consecutiveErrors = 0;
						continue; // Бесконечные попытки при потере связи
					}
                }
				//удаляем из очереди в любом случае
                this.queue.shift();
                this.retryCounts.delete(queueItem.id);

                // Небольшая пауза между сообщениями для соблюдения лимитов
                if (this.queue.length > 0) {await this._delay(5);}
            }
        } catch(err) {
			console.log(err);
		} finally {
            this.isProcessing = false;
            this.emit('processing_finished');
        }
    }
	//====================================================================
    /**
     * Отправка сообщения через бота (max-bot-api)
     * В max-bot-api все методы отправки находятся в bot.api
     * Для медиа используется sendMessage с attachments
     * chatId > 0 - личный чат (пользователь)
     * chatId < 0 - групповой чат или канал
     */
    async _sendMessage(queueItem)
	{
        let { type, data, chatId, bot, username } = queueItem;
		if (bot == null || bot==='default') bot = this.bot;
		if (username == null || username==='undefined') username = chatId;
		
		// Проверяем, что бот доступен
		if (!bot) {throw new Error('Bot instance is not available');}//передаем наверх строку
		let attempts = 0;
		const maxAttempts = this.maxRetries || 3;
		
		if(type==='sendAnimation') type = 'sendVideo';
		
	  while (attempts < maxAttempts)
	  { try{
          switch (type) {
            case 'sendText': return await this._sendText(bot, chatId, data, username); break;
            case 'sendPhoto': return await this._sendPhoto(bot, chatId, data, username); break;
            case 'sendVideo': return await this._sendVideo(bot, chatId, data, username); break;
            case 'sendAudio': return await this._sendAudio(bot, chatId, data, username); break;
			case 'sendFile': return await this._sendFile(bot, chatId, data, username); break;
            case 'sendAlbum': return await this._sendAlbum(bot, chatId, data, username); break;
			case 'sendSticker': return await this._sendSticker(bot, chatId, data, username); break;			
			default: throw new Error(`Unsupported message type: ${type}`);//строка
          }
		} 
		catch (error) 
		{	attempts++;
            // В max-bot-api ошибки могут быть в разных форматах
            const errorBody = error.message || '';
            const isRateLimit = errorBody.includes('too many requests') || errorBody.includes('rate limit') || 
								errorBody.includes('429');
			this.emit('error_response', error.message);//отдаем строку в эмит
			if (isRateLimit && attempts < maxAttempts)
			{
                const retryAfter = 5;
                console.log(`429. Ждем ${retryAfter}с (${attempts}/${maxAttempts})`);
				await this._delay(retryAfter * 1000);
                continue;
            }
			
			throw error;//передаем наверх весь объект ошибки
		}
      }
	  
	  throw new Error(`Failed after ${maxAttempts} attempts`);//передаем наверх строку
	}
	//====================================================================
    /**
     * Вспомогательная функция задержки
     */
    _delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
	//====================================================================
    /**
     * Получение статистики очереди
     */
    getQueueStats() {
        return {
            queueLength: this.queue.length,
            isProcessing: this.isProcessing,
            isConnected: this.isConnected,
            consecutiveErrors: this.consecutiveErrors,
            retryCounts: Object.fromEntries(this.retryCounts)
        };
    }
	//====================================================================
    /**
     * Очистка очереди
     */
    clearQueue() {
        const clearedItems = this.queue.length;
        this.queue = [];
        this.retryCounts.clear();
        this.consecutiveErrors = 0;
        this.emit('cleared', clearedItems);
        return clearedItems;
    }
	//====================================================================
    /**
     * Принудительная обработка очереди
     */
    forceProcess() {if(!this.isProcessing) {this._processQueue();}}
	//====================================================================
    /**
     * Уничтожение модуля
     */
    async destroy()
	{ return new Promise(async(resolve) => {
		this.isConnected = false;// Прекращаем обработку новых сообщений
		let checkInterval;
		//ждем завершения текущей передачи
		await Promise.race ([
            new Promise(resolve => 
			{	if(!this.isProcessing) resolve();
				checkInterval = setInterval(() => 
				{if (!this.isProcessing)
				 {	clearInterval(checkInterval);
					resolve();
				 }
				}, 10); // проверяем каждые 10мс
			}),
			new Promise(resolve => setTimeout(()=>{clearInterval(checkInterval); resolve();}, 10000)) // Таймаут 10 сек
		]);
		// Снимаем все обработчики с бота
        //this.bot.removeAllListeners('error');
        //this.bot.removeAllListeners('message_callback');
		this.removeAllListeners();
		clearTimeout(this.connectTimer);
		resolve();
      });
	}
	//====================================================================
	/**
     * Ожидает полного опустошения очереди
     */
    async waitForQueueEmpty(timeout = 60000) {
        return new Promise((resolve, reject) => {
            // Если очередь уже пустая и не обрабатывается
            if ((this.queue.length===0 && !this.isProcessing) || !this.isConnected) {
                resolve();
                return;
            }

            let timeoutId;

            const checkCondition = () => {
                if ((this.queue.length===0 && !this.isProcessing) || !this.isConnected) {
                    cleanup();
                    resolve();
                }
            };

            const cleanup = () => {
                clearTimeout(timeoutId);
                //this.off('sent', checkCondition);
                //this.off('failed', checkCondition);
                this.off('processing_finished', checkCondition);
            };

            // Таймаут
            timeoutId = setTimeout(() => {
                cleanup();
                reject(new Error(`Timeout waiting for empty queue after ${timeout}ms. Queue length: ${this.queue.length}`));
            }, timeout);

            // Слушаем события, которые могут изменить состояние очереди
            //this.on('sent', checkCondition);
            //this.on('failed', checkCondition);
            this.on('processing_finished', checkCondition);

            // Проверяем сразу (может очередь опустела пока настраивали слушатели)
            checkCondition();
        });
    }
	//====================================================================
	async _sendText(bot, chatId, data, username)
	{	if (bot == null || bot==='default') bot = this.bot;
		let obj = {};
		if(data.format) obj.format = data.format;
		if (data.text.length > 4000) 
		{	delete obj.format;
			data.text = data.text.substring(0, 4000);
		}
		return await bot.api.sendMessageToChat(chatId, data.text, obj);
	}
	//====================================================================
	async _sendPhoto(bot, chatId, data, username)
	{	if (bot == null || bot==='default') bot = this.bot;
		if (username == null || username==='undefined') username = chatId;
		if (!data.path || !fs.existsSync(data.path)) throw new Error('Файл для '+username+' не найден: ' + data.path);
		const attach = await bot.api.uploadImage({ source: data.path });//загружаем файл
		let obj = {attachments: [attach.toJson()]};
		if(data.format) obj.format = data.format;
		if (data.text.length > 4000) 
		{	delete obj.format;
			data.text = data.text.substring(0, 4000);
		}
		return await bot.api.sendMessageToChat(chatId, data.text || '', obj);
	}
	//====================================================================
	async _sendVideo(bot, chatId, data, username)
	{	if (bot == null || bot==='default') bot = this.bot;
		if (username == null || username==='undefined') username = chatId;
		if (!data.path || !fs.existsSync(data.path)) throw new Error('Файл для '+username+' не найден: ' + data.path);
		const attach = await bot.api.uploadVideo({ source: data.path });//загружаем файл
		let obj = {attachments: [attach.toJson()]};
		if(data.format) obj.format = data.format;
		if (data.text.length > 4000) 
		{	delete obj.format;
			data.text = data.text.substring(0, 4000);
		}
		return await bot.api.sendMessageToChat(chatId, data.text || '', obj);
	}
	//====================================================================
	async _sendAudio(bot, chatId, data, username)
	{	if (bot == null || bot==='default') bot = this.bot;
		if (username == null || username==='undefined') username = chatId;
		if (!data.path || !fs.existsSync(data.path)) throw new Error('Файл для '+username+' не найден: ' + data.path);
		const attach = await bot.api.uploadAudio({ source: data.path });//загружаем файл
		let obj = {attachments: [attach.toJson()]};
		if(data.format) obj.format = data.format;
		if (data.text.length > 4000) 
		{	delete obj.format;
			data.text = data.text.substring(0, 4000);
		}
		return await bot.api.sendMessageToChat(chatId, data.text || '', obj);
	}
	//====================================================================
	async _sendFile(bot, chatId, data, username)
	{	if (bot == null || bot==='default') bot = this.bot;
		if (username == null || username==='undefined') username = chatId;
		if (!data.path || !fs.existsSync(data.path)) throw new Error('Файл для '+username+' не найден: ' + data.path);
		const attach = await bot.api.uploadFile({ source: data.path });//загружаем файл
		let obj = {attachments: [attach.toJson()]};
		if(data.format) obj.format = data.format;
		if (data.text.length > 4000) 
		{	delete obj.format;
			data.text = data.text.substring(0, 4000);
		}
		return await bot.api.sendMessageToChat(chatId, data.text || '', obj);
	}
	//====================================================================
	async _sendAlbum(bot, chatId, data, username)
	{	if (bot == null || bot==='default') bot = this.bot;
		if (username == null || username==='undefined') username = chatId;
		const imageFormats = ['jpg', 'jpeg', 'png', 'gif', 'tiff', 'bmp', 'heic'];
		const videoFormats = ['mp4', 'mov', 'mkv', 'webm'];
		const attachments = [];
		for (const path of data.paths)
		{	if (!path || !fs.existsSync(path)) throw new Error('Файл альбома для '+username+' не найден: ' + path);
			const ext = path.split('.').pop().toLowerCase();
			if (imageFormats.includes(ext)) {
				const attach = await bot.api.uploadImage({ source: path });
				attachments.push(attach.toJson());
			} else if (videoFormats.includes(ext)) {
				const attach = await bot.api.uploadVideo({ source: path });
				attachments.push(attach.toJson());
			}
		}
		if (attachments.length === 0) throw new Error('Нет валидных файлов альбома для '+username);
		let obj = {attachments: attachments};
		if(data.format) obj.format = data.format;
		if (data.text.length > 4000) 
		{	delete obj.format;
			data.text = data.text.substring(0, 4000);
		}
		return await bot.api.sendMessageToChat(chatId, data.text || '', obj);
	}
	//====================================================================
	async _sendSticker(bot, chatId, data, username)
	{	if (bot == null || bot==='default') bot = this.bot;
		if (username == null || username==='undefined') username = chatId;
		if (!data.code) throw new Error('Код стикера для '+username+' не найден: ' + data.code);
		const obj = {attachments: [{type: 'sticker', code: data.code}]};
		return await bot.api.sendMessageToChat(chatId, '', obj);
	}
	//====================================================================
}

module.exports = BotMaxQueue;