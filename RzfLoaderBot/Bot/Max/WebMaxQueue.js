const { EventEmitter } = require('events');
//const moment = require('moment-timezone');//
const max = require('./WebMaxModule');

class WebMaxQueue extends EventEmitter {
    constructor(token, sessionsPath, sessionName = 'RZF_session', options = {}) {
        super();
        this.token = token;
		this.sessionsPath = sessionsPath || process.cwd();
		this.sessionName = sessionName;
        this.queue = [];
        this.isProcessing = false;
        this.isActive = true;
        
        // Настройки
		this.maxRetries = options.maxRetries || 3; // Максимальное количество попыток отправки одного сообщения (не используется, т.к. бесконечные попытки при сетевых ошибках)
		this.retryDelay = options.retryDelay || 5000; // Задержка между повторными попытками отправки (ms)
		this.messagesPerSecond = options.messagesPerSecond || 10; // Максимальное количество сообщений в секунду (для соблюдения лимитов)
		this.maxConsecutiveErrors = options.maxConsecutiveErrors || 5; // Количество последовательных ошибок, после которых делается длинная пауза (60 секунд)
        
        // Счётчики
        this.retryCounts = new Map();
        this.lastSentTime = 0;
        this.consecutiveErrors = 0;
		this.queueCount = 0;
		
		max.emitter.on('watchdogTimer', (res) => {
			if(res.status === 'OK') this.emit('disconnected',res.status);
 			else this.emit('disconnected',res.data);
		});
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
        
        // Проверка EFATAL с сетевыми проблемами
        if (error.code === 'EFATAL') {
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
                'tls',                 // TLS/SSL ошибка (проблемы с соединением)
                'certificate'          // Ошибка сертификата (сетевая проблема)
            ];
            return networkMessages.some(msg => errorMessage.includes(msg));
        }
        
        return networkErrors.some(netError => 
            error.code === netError || 
            error.message?.includes(netError) ||
            error.toString().includes(netError)
        );
    }
    
    //====================================================================
    /**
     * Добавление сообщения в очередь
     */
    addToQueue(messageData) {
        const queueItem = {
            //id: moment().format('DD/MM-HH_mm_ss_') + Math.random().toString(36).substr(2, 9),
            id: String(++this.queueCount).padStart(4, '0'),
			timestamp: Date.now(),
            type: messageData.type || 'sendText',
            chatId: messageData.chatId,
			username: messageData.username || 'undefined',
            data: messageData.data || {}, // data: { text, path, paths[], elements[] }
            attempts: 0
        };

        this.queue.push(queueItem);
        this.emit('queued', queueItem.id);
        
        // Пытаемся обработать очередь сразу
        if (!this.isProcessing) {
            this._processQueue();
        }
        
        return queueItem.id;
    }
    
    //====================================================================
    /**
     * Обработка очереди
     */
    async _processQueue() {
        if (!this.isActive || this.isProcessing || this.queue.length === 0) return;

        this.isProcessing = true;

        try {
            while (this.isActive && this.queue.length > 0) {
                const now = Date.now();
                const timeSinceLastMessage = now - this.lastSentTime;
                const minInterval = 1000 / this.messagesPerSecond;

                // Соблюдаем лимит сообщений в секунду
                if (timeSinceLastMessage < minInterval) {
                    await this._delay(minInterval - timeSinceLastMessage);
                }

                const queueItem = this.queue[0];
                
                try {
                    const result = await this._sendMessage(queueItem);
                    if (result.status === 'OK') {
                        this.lastSentTime = Date.now();
                        this.emit('sent', queueItem);
                    } else {
                        // Фатальная ошибка от MAX (неверный chatId, файл не найден и т.д.)
                        this.emit('failed', queueItem, result.data);
                    }
                    this.consecutiveErrors = 0;
                    
                } catch (error) {
                    queueItem.attempts++;
                    this.consecutiveErrors++;
                    this.emit('failed', queueItem, error);
                    await this._delay(10);
                    
                    // Если пропала связь, то выходим
                    if (this._isNetworkError(error)) {
                        await this._delay(60000);
                        this.consecutiveErrors = 0;
                        continue; // Бесконечные попытки при потере связи
                    }
                }
                
                // Удаляем из очереди в любом случае
                this.queue.shift();
                this.retryCounts.delete(queueItem.id);

                // Небольшая пауза между сообщениями для соблюдения лимитов
                if (this.queue.length > 0) {
                    await this._delay(5);
                }
            }
        } catch (err) {
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
        let { type, data, chatId } = queueItem;
        
        // Проверяем готовность, инициализируем при необходимости
        if (!max.isReady()) {
            const result = await max.init(this.token, 'WEB', this.sessionsPath, this.sessionName);
            if (result.status !== 'OK') {
                // Фатальная ошибка инициализации — возвращаем объект с ошибкой
                return { status: 'ERROR', data: result.data };
            }
			else this.emit('connected');
        }
        
        switch (type) {
            case 'sendText':
                return await max.sendText({ chatId, text: data.text, elements: data.elements || [] });
            case 'sendPhoto':
                return await max.sendPhoto({ chatId, path: data.path, text: data.text || '', elements: data.elements || [] });
            case 'sendVideo':
                return await max.sendVideo({ chatId, path: data.path, text: data.text || '', elements: data.elements || [] });
            case 'sendAudio':
                return await max.sendAudio({ chatId, path: data.path, text: data.text || '', elements: data.elements || [] });
            case 'sendFile':
                return await max.sendFile({ chatId, path: data.path, text: data.text || '', elements: data.elements || [] });
            case 'sendAlbum':
                return await max.sendAlbum({ chatId, paths: data.paths, text: data.text || '', elements: data.elements || [] });
            default:
                return { status: 'ERROR', data: `Unsupported type: ${type}` };
        }
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
            consecutiveErrors: this.consecutiveErrors,
            retryCounts: Object.fromEntries(this.retryCounts),
            maxIsConnected: max.isReady()
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
    forceProcess() {
        if (!this.isProcessing) {
            this._processQueue();
        }
    }
    
    //====================================================================
    /**
     * Уничтожение модуля
     */
    destroy() {
        return new Promise(async (resolve) => {
            this.isActive = false;
            console.log('Выполняем destroy очереди...');
            // Ждём завершения текущей обработки
            while (this.isProcessing) {
                await this._delay(50);
            }
            if (max.isReady())
			{	const res = await max.stop();
				if(res.status === 'OK') this.emit('disconnected',res.status);
				else this.emit('disconnected',res.data);
			}
            this.removeAllListeners();
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
            if (this.queue.length === 0 && !this.isProcessing) {
                resolve();
                return;
            }

            let timeoutId;

            const checkCondition = () => {
                if (this.queue.length === 0 && !this.isProcessing) {
                    cleanup();
                    resolve();
                }
            };

            const cleanup = () => {
                clearTimeout(timeoutId);
                this.off('processing_finished', checkCondition);
            };

            // Таймаут
            timeoutId = setTimeout(() => {
                cleanup();
                reject(new Error(`Таймаут опустошения очереди после ${timeout}мс. Длина очереди: ${this.queue.length}`));
            }, timeout);

            // Слушаем события, которые могут изменить состояние очереди
            this.on('processing_finished', checkCondition);

            // Проверяем сразу (может очередь опустела пока настраивали слушатели)
            checkCondition();
        });
    }
	
	//====================================================================
	/**
	 * Получает список участников группового чата
	 * @param {number|string} chatId - ID группового чата
	 * @returns {Promise<{status: string, data: any}>} Объект с статусом и данными
	 */
	async getChatMembers(chatId) 
	{
		// Проверяем готовность, инициализируем при необходимости (как в _sendMessage)
		if (!max.isReady()) {
			const result = await max.init(this.token, 'WEB', this.sessionsPath, this.sessionName);
			if (result.status !== 'OK') {
				return { status: 'ERROR', data: result.data };
			}
			this.emit('connected');
		}
		
		// Вызываем метод модуля
		try {
			return await max.getChatMembers(chatId);//Объект {status:'OK', data:...}
		} catch (err) {
			// Сетевая ошибка — возвращаем объект
			return { status: 'ERROR', data: err.message };
		}
	}
	//====================================================================
	async sendCommandOpcode(opcode, payload) 
	{
		// Проверяем готовность, инициализируем при необходимости
		if (!max.isReady()) {
			const result = await max.init(this.token, 'WEB', this.sessionsPath, this.sessionName);
			if (result.status !== 'OK') {
				return { status: 'ERROR', data: result.data };
			}
			this.emit('connected');
		}
		
		// Вызываем метод модуля
		try {
			return await max.sendCommandOpcode(opcode, payload);
		} catch (err) {
			return { status: 'ERROR', data: err.message };
		}
	}
	//====================================================================
	async getMyId() 
	{
		// Проверяем готовность, инициализируем при необходимости
		if (!max.isReady()) {
			const result = await max.init(this.token, 'WEB', this.sessionsPath, this.sessionName);
			if (result.status !== 'OK') {
				return { status: 'ERROR', data: result.data };
			}
			this.emit('connected');
		}
		
		// Вызываем метод модуля
		try {
			return await max.getMyId();
		} catch (err) {
			return { status: 'ERROR', data: err.message };
		}
	}
	//====================================================================
	async canWrite(chatId)
	{	// Проверяем готовность, инициализируем при необходимости
		if (!max.isReady()) {
			const result = await max.init(this.token, 'WEB', this.sessionsPath, this.sessionName);
			if (result.status !== 'OK') {
				return { status: 'ERROR', data: result.data };
			}
			this.emit('connected');
		}
		
		// Вызываем метод модуля
		try {
			return await max.canWrite(chatId);
		} catch (err) {
			return { status: 'ERROR', data: err.message };
		}
	}
	//====================================================================
}

module.exports = WebMaxQueue;
