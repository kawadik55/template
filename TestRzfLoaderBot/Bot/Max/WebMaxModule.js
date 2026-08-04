// webMaxModule.js
const { WebMaxClient } = require('mywebmaxsocket');
const EventEmitter = require('events');
const fs = require('fs');
const Emit = new EventEmitter();

let client = null;
let watchdogTimer = null;
let watchdogTimeout = 60000; // 60 секунд

//====================================================================
function resetWatchdog() {
    if (watchdogTimer) {
        clearTimeout(watchdogTimer);
        watchdogTimer = null;
    }
    
    watchdogTimer = setTimeout(async() => {
        let res = await stop();
        Emit.emit('watchdogTimer', res);
		watchdogTimer = null;
    }, watchdogTimeout);
}

//====================================================================
function _isNetworkError(err) {
    const networkErrors = [
        'ETIMEDOUT', 'ECONNRESET', 'ENOTFOUND', 
        'EAI_AGAIN', 'ECONNREFUSED', 'ENETUNREACH'
    ];
    
    const msg = err.message || String(err);
    const networkMessages = [
        'socket hang up', 'getaddrinfo', 'connect e',
        'econnreset', 'etimedout', 'enotfound',
        'eai_again', 'econnrefused', 'enetunreach',
        'timeout', 'network'
    ];
    
    return networkErrors.some(code => err.code === code) ||
           networkMessages.some(m => msg.toLowerCase().includes(m));
}

//====================================================================
async function init(token, deviceType = 'WEB', sessionPath, sessionName = 'RZF_session') {
    if(isReady()) return { status: 'OK', data: 'WebMax клиент уже инициализирован' };
	const initialToken = token || '';
    
    if(sessionName.trim() === '') sessionName = 'RZF_session';
	sessionName = sessionName.replace(/\s+/g, '_');
    const sessionFile = (sessionPath || process.cwd()) + '/sessions/' + sessionName + '.json';
	// Если файл сессии существует — игнорируем переданный токен
    if (fs.existsSync(sessionFile)) token = '';
	
	// Формируем параметры клиента
    const clientParams = {
        name: sessionName,
        saveToken: true,
        deviceType: deviceType,
        maxReconnectAttempts: 0,
		sessionPath: sessionPath
    };
	
	// Добавляем token, только если он передан и не пустой
    if (token && token.trim() !== '') {
        clientParams.token = token;
    }
	
	client = new WebMaxClient(clientParams);
    
    return new Promise((resolve, reject) => {
        client.onStart(async () => {
            const userName = '«'+(client.me?.firstname || 'Пользователь')+'»';
			console.log('✅ WebMax клиент '+userName+' инициализирован!');
            resetWatchdog();
			const newToken = client._token;
            // Сравниваем с переданным токеном
            if (newToken && newToken !== initialToken) Emit.emit('tokenUpdated', newToken);
            resolve({ status: 'OK', data: 'WebMax клиент '+userName+' инициализирован!' });
        });
        
        client.onError((err) => {
            console.error('❌ Ошибка инициализации клиента:', err);
            resolve({ status: 'ERROR', data: 'инициализация не удалась, '+err });
        });
        
        client.start().catch((err) => {
            if (_isNetworkError(err)) {
                reject(err);  // сетевая ошибка — пробрасываем
            } else {
                resolve({ status: 'ERROR', data: 'не удалось запустить клиент Макс' });
            }
        });
    });
}

//====================================================================
function isReady() {
    if (client && client.isConnected && client.isAuthorized) {
        resetWatchdog();
        return true;
    }
    return false;
}

//====================================================================
async function stop() {
    try {
        let res;
        if (client) {
            res = await client.stop();
            client.removeAllListeners();
            client = null;
        }
        console.log('✅ WebMax клиент остановлен');
        if (watchdogTimer) {
            clearTimeout(watchdogTimer);
            watchdogTimer = null;
        }
        return { status: 'OK', data: res };
    } catch (err) {
        return { status: 'ERROR', data: 'Ошибка в stop(): ' + err };
    }
}

//====================================================================
async function sendText(obj) {
    try {
        let { chatId, text, elements } = obj;
        if (!chatId) return { status: 'ERROR', data: 'отсутствует chatId' };
        if (!text) return { status: 'ERROR', data: 'отсутствует текст сообщения' };
        if (!elements) elements = [];
        
        if (!isReady()) throw new Error('MAX клиент не готов');
        
        let res = await client.sendMessage({ chatId, text, elements });
        let status = (res && res.id) ? 'OK' : 'ERROR';
        return { status: status, data: res };
    } catch (err) {
        if (_isNetworkError(err)) throw err;
        return { status: 'ERROR', data: 'Ошибка в sendText(): ' + err };
    }
}

//====================================================================
async function sendPhoto(obj) {
    try {
        let { chatId, text, path, elements } = obj;
        if (!chatId) return { status: 'ERROR', data: 'отсутствует chatId' };
        if (!path) return { status: 'ERROR', data: 'отсутствует path' };
        if (!text) text = '';
        if (!elements) elements = [];
        
        const imageFormats = ['jpg', 'jpeg', 'png', 'gif', 'tiff', 'bmp', 'heic'];
        const ext = path.split('.').pop().toLowerCase();
        if (!imageFormats.includes(ext)) return { status: 'ERROR', data: 'формат фото ' + ext + ' не поддерживается' };
        
        if (!isReady()) throw new Error('MAX клиент не готов');
        
        const attach = await client.uploadPhoto(chatId, path);
        let res = await client.sendMessage({ chatId, attachments: [attach], text, elements });
        let status = (res && res.id) ? 'OK' : 'ERROR';
        return { status: status, data: res };
    } catch (err) {
        if (_isNetworkError(err)) throw err;
        return { status: 'ERROR', data: 'Ошибка в sendPhoto(): ' + err };
    }
}

//====================================================================
async function sendVideo(obj) {
    try {
        let { chatId, text, path, elements } = obj;
        if (!chatId) return { status: 'ERROR', data: 'отсутствует chatId' };
        if (!path) return { status: 'ERROR', data: 'отсутствует path' };
        if (!text) text = '';
        if (!elements) elements = [];
        
        const videoFormats = ['mp4', 'mov', 'mkv', 'webm'];
        const ext = path.split('.').pop().toLowerCase();
        if (!videoFormats.includes(ext)) return { status: 'ERROR', data: 'формат видео ' + ext + ' не поддерживается' };
        
        if (!isReady()) throw new Error('MAX клиент не готов');
        
        const attach = await client.uploadVideo(chatId, path);
        let res = await client.sendMessage({ chatId, attachments: [attach], text, elements });
        let status = (res && res.id) ? 'OK' : 'ERROR';
        return { status: status, data: res };
    } catch (err) {
        if (_isNetworkError(err)) throw err;
        return { status: 'ERROR', data: 'Ошибка в sendVideo(): ' + err };
    }
}

//====================================================================
async function sendAudio(obj) {
    try {
        let { chatId, text, path, elements } = obj;
        if (!chatId) return { status: 'ERROR', data: 'отсутствует chatId' };
        if (!path) return { status: 'ERROR', data: 'отсутствует path' };
        if (!text) text = '';
        if (!elements) elements = [];
        
        const audioFormats = ['mp3', 'ogg', 'm4a', 'wav', 'flac'];
        const ext = path.split('.').pop().toLowerCase();
        if (!audioFormats.includes(ext)) return { status: 'ERROR', data: 'формат аудио ' + ext + ' не поддерживается' };
        
        if (!isReady()) throw new Error('MAX клиент не готов');
        
        const attach = await client.uploadAudio(chatId, path);
        let res = await client.sendMessage({ chatId, attachments: [attach], text, elements });
        let status = (res && res.id) ? 'OK' : 'ERROR';
        return { status: status, data: res };
    } catch (err) {
        if (_isNetworkError(err)) throw err;
        return { status: 'ERROR', data: 'Ошибка в sendAudio(): ' + err };
    }
}

//====================================================================
async function sendFile(obj) {
    try {
        let { chatId, text, path, elements } = obj;
        if (!chatId) return { status: 'ERROR', data: 'отсутствует chatId' };
        if (!path) return { status: 'ERROR', data: 'отсутствует path' };
        if (!text) text = '';
        if (!elements) elements = [];
        
        if (!isReady()) throw new Error('MAX клиент не готов');
        
        const attach = await client.uploadFile(chatId, path);
        let res = await client.sendMessage({ chatId, attachments: [attach], text, elements });
        let status = (res && res.id) ? 'OK' : 'ERROR';
        return { status: status, data: res };
    } catch (err) {
        if (_isNetworkError(err)) throw err;
        return { status: 'ERROR', data: 'Ошибка в sendFile(): ' + err };
    }
}

//====================================================================
async function sendAlbum(obj) {
    try {
        let { chatId, text, paths, elements } = obj;
        if (!chatId) return { status: 'ERROR', data: 'отсутствует chatId' };
        if (!paths || !Array.isArray(paths) || paths.length === 0) return { status: 'ERROR', data: 'отсутствует paths или это не массив' };
        if (!text) text = '';
        if (!elements) elements = [];
        
        const imageFormats = ['jpg', 'jpeg', 'png', 'gif', 'tiff', 'bmp', 'heic'];
        const videoFormats = ['mp4', 'mov', 'mkv', 'webm'];
        
        if (!isReady()) throw new Error('MAX клиент не готов');
        
        const attachments = [];
        for (const path of paths) {
            const ext = path.split('.').pop().toLowerCase();
            if (imageFormats.includes(ext)) {
                const attach = await client.uploadPhoto(chatId, path);
                attachments.push(attach);
            } else if (videoFormats.includes(ext)) {
                const attach = await client.uploadVideo(chatId, path);
                attachments.push(attach);
            }
        }
        
        if (attachments.length === 0) return { status: 'ERROR', data: 'нет подходящих файлов (только фото и видео)' };
        
        let res = await client.sendMessage({ chatId, attachments, text, elements });
        let status = (res && res.id) ? 'OK' : 'ERROR';
        return { status: status, data: res };
    } catch (err) {
        if (_isNetworkError(err)) throw err;
        return { status: 'ERROR', data: 'Ошибка в sendAlbum(): ' + err };
    }
}

//====================================================================
/**
 * Получает список участников группового чата
 * @param {number|string} chatId - ID группового чата
 * @returns {Promise<Array>} Массив участников чата
 */
async function getChatMembers(chatId) {
    try {
        if (!chatId) return { status: 'ERROR', data: 'отсутствует chatId' };
		chatId = typeof chatId === 'string' ? parseInt(chatId, 10) : chatId;
        
        if (!isReady()) throw new Error('MAX клиент не готов');
        
        //console.log('делаем запрос client.sendAndWait');
		const response = await client.sendAndWait(59, { chatId: chatId });
        //console.log('response = '+JSON.stringify(response));
		
        if (response.payload && response.payload.members) 
		{
            return { status: 'OK', data: response.payload.members };
        }
        else return { status: 'OK', data: [] };
        
    } catch (err) {
        if (_isNetworkError(err)) throw err;//при сетевой ошибке - исключение
        return { status: 'ERROR', data: 'Ошибка в getChatMembers(): ' + err };
    }
}
//====================================================================
/**
 * Получает количество участников для списка чатов
 * @param {Array<string|number>} chatIds - массив ID чатов
 * @returns {Promise<Array<{chatId: string, count: number}>>} Массив объектов с ID и количеством участников
 */
async function getChatMembersCounts(chatIds) 
{
    try {
        if (!chatIds || !Array.isArray(chatIds) || chatIds.length === 0) {
            return { status: 'ERROR', data: 'отсутствует массив chatIds' };
        }
        
        // Приводим все ID к числу
        const numericIds = chatIds.map(id => typeof id === 'string' ? parseInt(id, 10) : id);
        
        if (!isReady()) throw new Error('MAX клиент не готов');
        
        const result = await getChatInfo(numericIds);
        
        if (result.status === 'OK') {
            const mapped = result.data.map(chat => ({
                chatId: String(chat.id),
                count: chat.participantsCount || 0
            }));
            return { status: 'OK', data: mapped };
        }
        
        return { status: 'ERROR', data: result.data };
    } catch (err) {
        if (_isNetworkError(err)) throw err;
        return { status: 'ERROR', data: 'Ошибка в getChatMembersCounts(): ' + err };
    }
}
//====================================================================
/**
 * Получает информацию о чатах по их ID
 * @param {Array<string|number>} chatIds - массив ID чатов
 * @returns {Promise<{status: string, data: Array}>} 
 */
async function getChatInfo(chatIds) {
    try {
        if (!chatIds || !Array.isArray(chatIds) || chatIds.length === 0) {
            return { status: 'ERROR', data: 'отсутствует массив chatIds' };
        }
        
        const numericIds = chatIds.map(id => typeof id === 'string' ? parseInt(id, 10) : id);
        
        if (numericIds.some(id => isNaN(id))) {
            return { status: 'ERROR', data: 'некорректный chatId в массиве' };
        }
        
        if (!isReady()) throw new Error('MAX клиент не готов');
        
        const result = await sendCommandOpcode(48, { chatIds: numericIds });
        
        if (result.status === 'OK' && result.data.payload && result.data.payload.chats) {
            return { status: 'OK', data: result.data.payload.chats };//массив
        }
        
        return { status: 'OK', data: [] };
    } catch (err) {
        if (_isNetworkError(err)) throw err;
        return { status: 'ERROR', data: 'Ошибка в getChatInfo(): ' + err };
    }
}
//====================================================================
async function sendCommandOpcode(opcode, payload) 
{
    // Проверяем, что opcode — число
    if (typeof opcode !== 'number' || isNaN(opcode)) {
        throw new Error('opcode должен быть числом');
    }
    
    // Проверяем, что payload — объект (или null/undefined)
    if (payload !== undefined && payload !== null && typeof payload !== 'object') {
        throw new Error('payload должен быть объектом');
    }
    
    // Приводим chatId к числу, если он есть в payload
    if (payload && payload.chatId !== undefined) {
        payload.chatId = typeof payload.chatId === 'string' ? parseInt(payload.chatId, 10) : payload.chatId;
        if (isNaN(payload.chatId)) {
            throw new Error('неверный chatId');
        }
    }
    if (payload && payload.chatIds && Array.isArray(payload.chatIds)) {
        payload.chatIds = payload.chatIds.map(id => 
            typeof id === 'string' ? parseInt(id, 10) : id
        );
    }
    
    if (!isReady()) throw new Error('MAX клиент не готов');
    
    try {
        const response = await client.sendAndWait(opcode, payload);
        return { status: 'OK', data: response };
    } catch (err) {
        if (_isNetworkError(err)) throw err;
        return { status: 'ERROR', data: 'Ошибка в sendCommandOpcode(): ' + err.message };
    }
}
//====================================================================
async function getMyId() 
{
    if (!isReady()) throw new Error('MAX клиент не готов');
	return { status: 'OK', data: client.me };
}
//====================================================================
async function canWrite(chatId) 
{
    try {
        if (!isReady()) throw new Error('MAX клиент не готов');
        
        // Приводим chatId к числу
        chatId = typeof chatId === 'string' ? parseInt(chatId, 10) : chatId;
        if (isNaN(chatId)) {
            return { status: 'ERROR', data: 'Неверный chatId: ' + chatId };
        }
        
        // 1. Получаем свой ID
        const meResult = await getMyId();
        if (meResult.status !== 'OK') {
            return { status: 'ERROR', data: 'Не удалось получить свой ID' };
        }
        const myId = meResult.data.id;
        
        // 2. Проверяем, есть ли я в чате (opcode 59)
        const membersResult = await sendCommandOpcode(59, { chatId: chatId });
        if (membersResult.status === 'ERROR') {
            return { status: 'ERROR', data: 'Я не участник чата '+chatId+' или нет доступа' };
        }
        
        // 3. Получаем информацию о чате через getChatInfo
        const infoResult = await getChatInfo([chatId]);
        if (infoResult.status !== 'OK' || !infoResult.data || infoResult.data.length === 0) {
            return { status: 'ERROR', data: 'Не удалось получить информацию о чате '+chatId };
        }
        
        const chat = infoResult.data[0];
        
        // 4. Определяем тип чата
        if (chat.type === 'CHAT') {
            return { status: 'OK', data: 'Есть право записи в чате '+chatId+'!' };
        }
        
        if (chat.type === 'CHANNEL') {
            const adminParticipant = chat.adminParticipants?.[myId];
            if (!adminParticipant) {
                return { status: 'ERROR', data: 'Нет права записи в чате '+chatId+'!' };
            }
            const permissions = adminParticipant.permissions || 0;
            if ((permissions & 1) !== 0) {
                return { status: 'OK', data: 'Есть право записи в чате ' + chatId + '!' };
            } else {
                return { status: 'ERROR', data: 'Нет права записи в чате ' + chatId + '!' };
            }
        }
        
        return { status: 'ERROR', data: 'Неизвестный тип чата: '+chat.type+'!' };
    } catch (err) {
        if (_isNetworkError(err)) throw err;
        return { status: 'ERROR', data: 'Ошибка в canWrite(): ' + err.message };
    }
}
//====================================================================
module.exports = {
    init,
    stop,
    isReady,
    sendText,
    sendPhoto,
    sendVideo,
    sendAudio,
    sendFile,
    sendAlbum,
	getChatMembers,
	getChatInfo,
	getChatMembersCounts,
	sendCommandOpcode,
	getMyId,
	canWrite,
	emitter: Emit
};
