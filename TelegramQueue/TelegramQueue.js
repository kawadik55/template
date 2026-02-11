const { EventEmitter } = require('events');
const moment = require('moment-timezone');

class TelegramQueue extends EventEmitter {
    constructor(bot, options = {}) {
        super();
        this.bot = bot;
        this.queue = [];
        this.isProcessing = false;
        this.isConnected = true; // При polling: true изначально считаем соединение активным.
        
        // Настройки
        this.maxRetries = options.maxRetries || 3;
        this.retryDelay = options.retryDelay || 5000;
        this.messagesPerSecond = options.messagesPerSecond || 8;
        this.maxConsecutiveErrors = options.maxConsecutiveErrors || 5;
        
        // Улучшенные счетчики
        this.retryCounts = new Map();
        this.lastSentTime = 0;
        this.consecutiveErrors = 0;
        
        // Настройка обработчиков ошибок для polling бота
        this._setupErrorHandlers();
		this.connectTimer = null;
		
		// список file_id
		this.fileIdList = {};
    }
	//====================================================================
    /**
     * Обработчики ошибок для polling бота
     */
    _setupErrorHandlers() {
        this.bot.on('error', (error) => {
            this.consecutiveErrors++;
            console.error(`Bot error (${this.consecutiveErrors}):`, error.message);
            
            if (this.consecutiveErrors >= this.maxConsecutiveErrors || this._isNetworkError(error)) 
			{	this.isConnected = false;
                error.message = error.message ? ('(queue error)=> '+error.message) : 'queue error';
				this.emit('disconnected', error);
            }
            
            this._scheduleReconnection();
        });

        this.bot.on('polling_error', (error) => {
            this.consecutiveErrors++;
            console.error(`Polling error (${this.consecutiveErrors}):`, error.message);
            
            if (error.code === 'EFATAL' || this._isNetworkError(error)) 
			{	this.isConnected = false;
                error.message = error.message ? ('(queue polling_error)=> '+error.message) : 'queue polling_error';
				this.emit('disconnected', error);
            }
            
            this._scheduleReconnection();
        });

        this.bot.on('callback_query', (msg) => 
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

        /*this.bot.on('channel_post', () => {
            // Также сбрасываем ошибки при получении постов из каналов
            this.consecutiveErrors = 0;
            if (!this.isConnected) {
                this.isConnected = true;
                this.emit('connected');
                this._processQueue();
            }
        });*/
    }
	//====================================================================
    /**
     * Проверка типа ошибки (сетевая или API), возвращает true/false
     */
    _isNetworkError(error) {
        const networkErrors = [
            'ETIMEDOUT', 'ECONNRESET', 'ENOTFOUND', 
            'EAI_AGAIN', 'ECONNREFUSED', 'ENETUNREACH'
        ];
        
        return networkErrors.some(netError => 
            error.code === netError || 
            error.message?.includes(netError) ||
            error.toString().includes(netError)
        );
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
     */
    async _checkConnection() {
        try {
            await this.bot.getMe();
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
            id: moment().format('DD/MM-HH_mm_ss_') + Math.random().toString(36).substr(2, 9),//идентификатор
            timestamp: Date.now(),//время
			type: messageData.type || 'sendMessage',//тип
			data: messageData.data,//само сообщение, путь или media
			options: messageData.options || '',
			chatId: messageData.chatId,
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
					this.emit('failed', queueItem, error);//отправка с ошибкой
					await this._delay(10);
					//если пропала связь, то выходим
					if (error.code === 'EFATAL' || this._isNetworkError(error) || !this.isConnected) {return;}
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
     * Отправка сообщения через бота
     */
    async _sendMessage(queueItem) {
        // Создаем копию options чтобы избежать мутаций
		const options = queueItem.options ? JSON.parse(JSON.stringify(queueItem.options)) : {};
		let { type, data, chatId, bot } = queueItem;
		if (bot == null || bot==='default') bot = this.bot;
		// Проверяем, что бот доступен
		if (!bot) {throw new Error('Bot instance is not available');}
		let attempts = 0;
		const maxAttempts = this.maxRetries || 3;
		
		const botKey = bot.token || bot.options?.token || 'error_bot';//токен будет ключом
		if (!this.fileIdList[botKey]) this.fileIdList[botKey] = {};//инит для нового бота
		//проверка
		if (Object.keys(this.fileIdList[botKey]).length > 0)
		{	const isMediaGroup = Array.isArray(data);
			const hasCurrentFile = isMediaGroup 
					? data.some(mediaItem => this.fileIdList[botKey][mediaItem.media])//альбом
					: this.fileIdList[botKey][data];//одиночный файл
			//if (!hasCurrentFile) this.fileIdList[botKey] = {};//очистка, если прилетел другой файл
		}
		const FileId = this.fileIdList[botKey]?.[data];
		
	  while (attempts < maxAttempts)
	  { try{
          switch (type) {
            case 'sendMessage':
				return await bot.sendMessage(chatId, data, options); 
				break;
            
            case 'sendPhoto':
                //если уже есть file_id
				if(FileId) return await bot.sendPhoto(chatId, FileId, options); 
				//если это первая отправка файла с диска
				else
				{	let file_id;
					const res = await bot.sendPhoto(chatId, data, options);
					if(res.photo && res.photo.length > 0) file_id = res.photo[res.photo.length - 1].file_id;
					//сохраняем file_id
					if(file_id)
					{	//this.fileIdList[botKey] = {};
						this.fileIdList[botKey][data] = file_id;
					}
					return res;
				}
				break;
            
            case 'sendVideo':
                if(FileId)	return await bot.sendVideo(chatId, FileId, options);
                else
				{	const res = await bot.sendVideo(chatId, data, options);
					if(res.video) this.fileIdList[botKey][data] = res.video.file_id;
					return res;
				}
				break;
            
            case 'sendDocument':
                if(FileId)	return await bot.sendDocument(chatId, FileId, options);
                else
				{	const res = await bot.sendDocument(chatId, data, options);
					if(res.document) this.fileIdList[botKey][data] = res.document.file_id;
					return res;
				}
				break;
            
            case 'sendAudio':
                if(FileId)	return await bot.sendAudio(chatId, FileId, options);
                else
				{	const res = await bot.sendAudio(chatId, data, options);
					if(res.audio) this.fileIdList[botKey][data] = res.audio.file_id;
					return res;
				}
				break;
            
            case 'sendMediaGroup':
                // Для медиагруппы обрабатываем каждый элемент
				const processedMedia = data.map(mediaItem => 
				{	const mediaCopy = { ...mediaItem };
					// Если для этого media есть сохраненный file_id
					if(this.fileIdList[botKey][mediaCopy.media]) mediaCopy.media = this.fileIdList[botKey][mediaCopy.media];
					return mediaCopy;
				});
				const resMediaGroup = await bot.sendMediaGroup(chatId, processedMedia, options);
				// Пытаемся извлечь и сохранить file_id для каждого файла
                if(Array.isArray(resMediaGroup))
				{	resMediaGroup.forEach((msg, index) =>
					{	if(index < data.length)
						{	const originalMedia = data[index];
                            let file_id;
                            if(msg.photo && msg.photo.length > 0) file_id = msg.photo[msg.photo.length - 1].file_id; 
							else if(msg.video) file_id = msg.video.file_id;
                            else if(msg.document) file_id = msg.document.file_id;
                            else if(msg.audio) file_id = msg.audio.file_id;
							if (file_id && originalMedia.media)
							{	// Сохраняем file_id для этого media
								this.fileIdList[botKey][originalMedia.media] = file_id;
							}
                        }
					});
				}
                return resMediaGroup; 
				break;
            
            case 'sendSticker':
                return await bot.sendSticker(chatId, data, options); 
				break;
			
			case 'sendAnimation':
                if(FileId)	return await bot.sendAnimation(chatId, FileId, options);
                else
				{	const res = await bot.sendAnimation(chatId, data, options);
					if(res.animation) this.fileIdList[botKey][data] = res.animation.file_id;
					return res;
				}
				break;
			
			default:
                throw new Error(`Unsupported message type: ${type}`);
          }
		} 
		catch (error) 
		{	attempts++;
            const isRateLimit = error.response?.body?.error_code === 429 || 
				(error.response?.body?.description || error.message || '').toLowerCase().includes('too many requests');
			//if (error.response?.body?.error_code === 429 && attempts < maxAttempts)
			if (isRateLimit && attempts < maxAttempts)
			{
                const retryAfter = error.response.body.parameters?.retry_after || 5;
                console.log(`429. Ждем ${retryAfter}с (${attempts}/${maxAttempts})`);
                await this._delay(retryAfter * 1000);
                continue;
            }
			
			throw error;
		}
      }
	  
	  throw new Error(`Failed after ${maxAttempts} attempts`);
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
        this.bot.removeAllListeners('error');
        this.bot.removeAllListeners('polling_error');
        this.bot.removeAllListeners('callback_query');
        //this.bot.removeAllListeners('channel_post');
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
}

module.exports = TelegramQueue;
