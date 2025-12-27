process.env["NTBA_FIX_350"] = 1;
const fs = require('fs');
const path = require('path');
const moment = require('moment-timezone');
const cron = require('node-cron');
//const { execFile } = require('child_process');
const TelegramBot = require('node-telegram-bot-api');
const TelegramQueue = require('./TelegramQueue');
const SlaveBot = require('./Slave_bot');
const currentDir = (process.env.CURRENT_DIR) ? process.env.CURRENT_DIR : __dirname;
const PathToImages = currentDir+'/images';//путь к файлам на выполнение.
const PathToImagesModer = currentDir+'/moder';//путь к файлам на выполнение
const FileUserList = currentDir+"/UserList.txt";//имя файла белого листа
const FileBlackList = currentDir+"/BlackList.txt";//имя файла черного листа
const FileAdminList = currentDir+"/AdminList.txt";//имя файла списка админов
const FileAdminBot = currentDir+"/AdminBot.txt";//имя файла списка админов бота
const FileImagesList = currentDir+"/ImagesList.txt";//имя файла списка файлов
const FileTextList = currentDir+"/TextList.txt";//имя файла списка текстов
const FileModerImagesList = currentDir+"/ModerImagesList.txt";//имя файла списка файлов на модерацию
const FileModerTextList = currentDir+"/ModerTextList.txt";//имя файла списка текстов на модерацию
const FileBackUpText = currentDir+"/BackUpText.txt";//имя файла бэкапа текстов
const TokenDir=currentDir+"/Token";//путь к папке с токенами
const FileRun = currentDir+'/run.txt';//файл со списком запуска
const FileButtons = currentDir+'/buttons.txt';//файл с кнопками
var FileEg = 	currentDir+'/../Raspis/eg.txt';//файл с ежиком
var FileRaspis = currentDir+'/../Raspis/raspis.txt';//файл с расписанием на день
const smilik = '¯\\_(ツ)_/¯';
const PathToLog = currentDir+'/../log';//путь к логам
const LOGGING = true;//включение/выключение записи лога в файл
const SPEEDLIMIT = 15;//ограничение скорости сообщений в сек
let PathToHostImg = '';//путь к хостингу картинок
let hostname = '';
let hostingImg = false;//выключатель кнопки хостинга картинок
let area = 'АН';//местность
let timePablic = '06:00:00';//опорное машинное время выхода публикаций на текущие сутки по-умолчанию
let utcOffset = moment().utcOffset();//пока системное смещение
let forDate = [3,0];//массив дней по дате - 3й и 0й день, если меньше 2х недель
let lifeTime = 180;//срок регистраци юзера в днях
let rassilka = true;//выключатель крона рассылки
//проверим папку логов
if(!fs.existsSync(PathToLog)) {fs.mkdirSync(PathToLog); fs.chmod(currentDir+"/../log", 0o777, () => {});}
//---------------------------------------------------
//сразу проверяем или создаем необходимые папки и файлы
setContextFiles();
//---------------------------------------------------
var LogFile;
(() =>{	let tmp=currentDir.split('/'); let name=tmp[tmp.length-1]+'.log';//вытащим чисто имя папки в конце
		LogFile = PathToLog+'/'+name;
})();
let config={}, chat_news = {};
try{config = JSON.parse(fs.readFileSync(currentDir+"/config.json"));
	if(!config.lifeTime) {config.lifeTime = lifeTime; WriteFileJson(currentDir+"/config.json",config);}
	if(!config.utcOffset) {config.utcOffset = utcOffset>0?'+'+String(moment().utcOffset()):String(moment().utcOffset()); WriteFileJson(currentDir+"/config.json",config);}
}catch(err)
{config = {"area":area, "timePablic":timePablic, "utcOffset":String(utcOffset), "forDate":forDate, "lifeTime":lifeTime, "rassilka":rassilka, "hostingImg":hostingImg, "pathHostingImg":"/../www/img", "hostname":"https://vps.na-server.ru", "Supervisor":"1234567", "queuelimit":200};
 WriteFileJson(currentDir+"/config.json",config);
}
if(isNaN(Number(config.utcOffset))) {config.utcOffset = String(utcOffset); WriteLogFile('Ошибка в utcOffset','вчат');}
area = config.area; timePablic = config.timePablic; utcOffset = Number(config.utcOffset); forDate = config.forDate; lifeTime = config.lifeTime; rassilka = config.rassilka; 
const QUEUELIMIT = config.queuelimit ? Number(config.queuelimit) : 200;//ограничение макс размера очереди
if(!config.queuelimit) {config.queuelimit = QUEUELIMIT; WriteFileJson(currentDir+"/config.json",config);}
if(!!config.hostingImg) hostingImg = config.hostingImg;
if(!!config.pathHostingImg) PathToHostImg = currentDir+config.pathHostingImg;
if(!!config.hostname) hostname = config.hostname;
setTimezoneByOffset(utcOffset);//устанавливаем локальную таймзону

//список чатов
try{chat_news = require(currentDir+"/chatId.json");
}catch(err){WriteFileJson(currentDir+"/chatId.json",chat_news);}

// выбор токена
let tokenLoader = '', tokenNews = '';
tokenLoader = require(TokenDir+"/loader_bot.json").token;
var namebot = 'unnown';
try{namebot = require(TokenDir+"/loader_bot.json").comment;}catch(err){console.log(err);}//юзернейм бота
tokenNews = require(TokenDir+"/news_bot.json").token;

//пользователь 'Supervisor'
var chat_Supervisor = (config && config.Supervisor) ? config.Supervisor : '1234';
if(chat_Supervisor==='1234') {WriteLogFile('Отсутствует chat_Supervisor в конфиге');}

//если chat_news находится в старом файле, то переносим в новый
if(config && config.chat_news)
{	chat_news = config.chat_news;
	//в старом файле нету некоторых полей, добавим
	// Проходим по всем часовым поясам
    const timezones = Object.keys(config.chat_news);
    for (let t = 0; t < timezones.length; t++)
	{	const timezone = timezones[t];
        const chatArray = config.chat_news[timezone];
        if (!Array.isArray(chatArray)) continue;
        // Проходим по всем чатам
        for (let i = 0; i < chatArray.length; i++)
		{	const chatObj = chatArray[i];
            if (chatObj && typeof chatObj === 'object')
			{	// Добавляем только если ключ не существует
                if (!chatObj.hasOwnProperty('Eg')) chatObj.Eg = true;
                if (!chatObj.hasOwnProperty('News')) chatObj.News = true;
            }
        }
    }
	WriteFileJson(currentDir+"/chatId.json",chat_news);
	delete config.chat_news;//удаляем в старом
	WriteFileJson(currentDir+"/config.json",config);	
}

const LoaderBot = new TelegramBot(tokenLoader, {polling: true});
const NewsBot = new TelegramBot(tokenNews, {polling: false});//этот без поллинга
let tokenLog;
try{tokenLog = require(TokenDir+"/logs_bot.json").token;}catch(err){console.log(err);}
var logBot;
if(!!tokenLog) logBot = new TelegramBot(tokenLog, {polling: false});//бот для вывода лог-сообщений
// Создаем очередь
const queue = new TelegramQueue(LoaderBot, {
    maxRetries: 5,
    retryDelay: 10000,
    messagesPerSecond: 10,
	maxConsecutiveErrors: 5
});
//---------------------------------------------------
let UserList=new Object();//массив допущенных
let BlackList=new Object();//массив забаненных
let AdminList=new Object();//массив админов
let AdminBot=new Object();//массив админов бота
let ImagesList=new Object();//массив загруженных файлов на выполнение
let TextList=new Object();//массив загруженных текстов на выполнение
let ModerImagesList=new Object();//массив загруженных файлов на модерацию
let ModerTextList=new Object();//массив загруженных текстов на модерацию
let WaitFlag=new Object();//флаги готовности приема постов от юзера
let TempPost=new Object();//
let LastMessId=new Object();//массив для хранения нужных message_id
let masDay=['пустота','Понедельник','Вторник','Среда','Четверг','Пятница','Суббота','Воскресенье','Ежедневно'];
let dayOfWeek=new Object();
let numOfDelete=new Object();
let timeCron='';//время для крона
let MediaList=new Object();//массив группы медиа файлов
let RunList = {};//список запуска функций
let Buttons = {};//кнопки

//файл списка запуска функций рассылки
try 
{ RunList = JSON.parse(fs.readFileSync(FileRun));
} catch (err) 
{WriteLogFile('Ошибка парсинга RunList\n'+err,'вбот');
 RunList.Text = false; RunList.Image = false; RunList.Eg = false; RunList.Raspis = false;
 RunList.FileEg = '/eg.txt';
 RunList.FileRaspis = '/raspis.txt';
}
if(!!RunList.FileEg) FileEg = currentDir+RunList.FileEg;
if(!!RunList.FileRaspis) FileRaspis = currentDir+RunList.FileRaspis;
//файл кнопок
try 
{ Buttons = JSON.parse(fs.readFileSync(FileButtons));
} catch (err) {console.error(err); WriteFileJson(FileButtons,Buttons);}
//прочитаем сохраненный файл LastMessId.txt
try 
{let bl = fs.readFileSync(currentDir+"/LastMessId.txt");
 LastMessId = JSON.parse(bl);
}
//если файл отсутствует, то создадим его 
catch (err) {WriteFileJson(currentDir+"/LastMessId.txt",LastMessId);}

//прочитаем файл Url.txt со ссылкой для Вопросов
let keyboard = getKeyList();// массив клавиатур
try 
{let url = fs.readFileSync(currentDir+"/Url.txt").toString();
 if(url.search(/^http+s?:\/\//)<0) url = 'https://t.me/битаяСсылка';
 if(!!keyboard['1'][1][0].url) keyboard['1'][1][0].url = url;
 if(!!keyboard['adm1'][2][0].url) keyboard['adm1'][2][0].url = url;
}
//если файл отсутствует, то создадим его 
catch (err) {fs.writeFileSync(currentDir+"/Url.txt",'https://t.me/ссылкаДляВопросов');}
//добавим клавишу хостинга, если разрешено
if(hostingImg && !!PathToHostImg)
{	let obj = [{"text": "Хостинг картинок","callback_data": "1_Хостинг картинок"}];
	keyboard['1'].push(obj);
	let len = keyboard['adm1'].length;
	if(keyboard['adm1'][len-1][0].text == 'Модерация Постов') keyboard['adm1'].splice(len-1,0,obj);
	else keyboard['adm1'].push(obj);
}

const TmpPath = "/tmp";//путь для временных файлов
let forDeleteList = [];//список файлов на удаление

//====================================================================
//Функция-колбэк для уведомлений об изменениях из слэйв бота
const onConfigUpdate = (update) => {
    console.log('Конфиг обновлен в SlaveBot!');
    switch(update.event) {
        case 'chat_configured':
                WriteLogFile(`Чат ${update.data.chatTitle} настроен на таймзону ${update.data.timezone}`);
                break;
                
        case 'chat_removed':
                WriteLogFile(`Чат ${update.data.chatId} удален из рассылки`);
                break;
                
        case 'cleanup_completed':
                WriteLogFile(`Очищено ${update.data.cleanedCount} несуществующих чатов`);
                //console.log(`Статистика: ${update.data.totalChatsBefore} → ${update.data.totalChatsAfter} чатов`);
                break;
    }
	WriteFileJson(currentDir+"/chatId.json",chat_news);
};

//Создаем экземпляр SlaveBot
const slaveBot = new SlaveBot(
    tokenNews, 				// Токен слэйв бота
    onConfigUpdate,        // Колбэк для уведомлений
    chat_news              // Ссылка на объект конфига
);
//====================================================================
if(!timeCron)//всегда выполняется
{	if(timePablic != moment(timePablic,'HH:mm:ss').format('HH:mm:ss'))
	{WriteLogFile('Ошибка в timePublic','вчат'); timePablic = '06:00:00';
	}
	let tmp=timePablic.split(':');
	//timeCron = tmp[1]+' '+tmp[0]+' * * *';
	timeCron = tmp[1]+' * * * *';//теперь будем проверять каждый час для мультизонности
}
//установим службу стандартных утренних публикаций в каналах
var Cron1 = cron.schedule(timeCron, async function() 
{	if(rassilka)//если рассылка включена
	{	//WriteLogFile('Начинаем стандартную Рассылку:');
		//обновим список чатов
		try{chat_news = require(currentDir+"/chatId.json");}catch(e){}
		if(typeof chat_news === 'object')
		{	let num = Object.keys(chat_news);
			if(num.length>0)
			{	for(let i in num) 
				{	let parsed = parseInt(num[i], 10);
					if(isNaN(parsed) || parsed.toString() !== num[i].replace(/^\+/, ''))
					{	WriteLogFile('Ошибка: таймзона '+num[i]+' в chatId.json не распознана!');
						delete chat_news[num[i]];
					}
				}
			}
		}
		//ежик
		if(RunList.Eg===true) await send_Eg();
		//расписание
		//if(RunList.Raspis===true) await send_Raspis();
		
		//WriteLogFile('Далее рассылка текстов и картинок:');
	}
},{timezone:moment().tz()});//в локальной таймзоне
//установим службу публикаций по времени, каждую нечетную мин
var Cron2 = cron.schedule('10 '+'*/2 * * * *', async function()
{	if(rassilka)//если рассылка включена
	{	let now = moment();
		console.log('Зашли в крон с now='+now.format('DD.MM.YYYY HH:mm:ss'));
		now = now.subtract(10, 'seconds');//приводим к 0 сек
		let offset = Object.keys(chat_news).length>0 ? Object.keys(chat_news) :[];
		//публикуем тексты
		if(RunList.Text===true) 
		{	for(let i=0;i<offset.length;i++) {await send_Text(now, offset[i]); console.log('Text '+offset[i]+' now='+now.format('DD.MM.YYYY HH:mm:ss'));}
		}
		//публикуем фото и пр
		if(RunList.Image===true)
		{	for(let i=0;i<offset.length;i++) {await send_Images(now, offset[i]); console.log('Image '+offset[i]+' now='+now.format('DD.MM.YYYY HH:mm:ss'));}
		}	
	}
},{timezone:moment().tz()});//в локальной таймзоне
//установим службу удаления старых картинок из хостинга
var Cron3 = cron.schedule('15 2 * * *', function()//ночью каждый день
{	if(hostingImg && fs.existsSync(PathToHostImg))//если хостинг разрешен
	{	//Удаляем старые файлы
		const isFile = fileName => {return fs.lstatSync(fileName).isFile()};
		//загружаем список файлов из PathToHostImg - полный путь
		let FilesList = fs.readdirSync(PathToHostImg).map(fileName => {return path.join(PathToHostImg, fileName)}).filter(isFile);
		for(let i in FilesList)
		{	let mas = FilesList[i].split('/');
			let filename = mas[mas.length-1];//чисто имя файла
			mas = filename.split('-');
			if(mas.length<2 || moment(mas[1],'DD_MM_YYYY').isValid()==false)//проверяем на валидность 
			{	WriteLogFile('В хостинге обнаружен путь к левому файлу '+FilesList[i], 'вчат');
				continue;//пропускаем если не наш
			}
			if(moment().diff(moment(mas[1],'DD_MM_YYYY'), 'days') > 365)//если совсем старый файл
			{	try {fs.unlinkSync(FilesList[i]);} catch (e) {console.log(e);}
				WriteLogFile('Файл '+FilesList[i]+' удален из папки хостинга картинок.');
			}
		}
	}
},{timezone:moment().tz()});//в локальной таймзоне
Cron1.start();
Cron2.start();
Cron3.start();
//====================================================================
function klava(keyb)
{try{	
	let arr = new Object();
	arr.reply_markup = new Object();
	arr.reply_markup.inline_keyboard = keyb;
	arr.parse_mode = "markdown";
	return arr;
}catch(err){WriteLogFile(err+'\nfrom klava()','вчат');}
}
//====================================================================
//сначала читаем сохраненные списки
//====================================================================
//белый лист
try 
{let wl = fs.readFileSync(FileUserList);
 UserList = JSON.parse(wl);
 //проверим на правильность chatId
 let flag=0;
 let keys = Object.keys(UserList);
 for(let i in keys) 
 {if(!isValidChatId(keys[i])) 
  {console.log('Неверный chatId в UserList='+keys[i]); 
   delete UserList[keys[i]]; 
   flag=1;
  }
  if(typeof(UserList[keys[i]]) !== 'object')//если не массив
  {let tmp = UserList[keys[i]];//сохраняем старое значение
   let mas = [];
   mas.push(tmp);//теперь имя пользователя в [0]
   mas.push(moment().format('DD.MM.YYYY'));//дата регистрации в [1]
   UserList[keys[i]] = mas;
   flag=1;
  }
  validUser(keys[i]);//там удаляются старые юзеры
 }
 if(flag) WriteFileJson(FileUserList,UserList);//записываем файл
}
catch (err)//если файл отсутствует, то создадим его 
{WriteFileJson(FileUserList,UserList);
}

//черный лист
try 
{let bl = fs.readFileSync(FileBlackList);
 BlackList = JSON.parse(bl);
}
catch (err)//если файл отсутствует, то создадим его 
{WriteFileJson(FileBlackList,BlackList);
}

//список админов
try 
{let bl = fs.readFileSync(FileAdminList);
 AdminList = JSON.parse(bl);
}
catch (err)//если файл отсутствует, то создадим его 
{	AdminList.coordinatorWhatsApp = '';
	AdminList.coordinatorName = '';
	WriteFileJson(FileAdminList,AdminList);
}

//список админов бота
try 
{let bl = fs.readFileSync(FileAdminBot);
 AdminBot = JSON.parse(bl);
 //проверим на правильность chatId
 let flag=0;
 let keys = Object.keys(AdminBot);
 for(let i in keys) 
 {if(!isValidChatId(keys[i])) {console.log('Неверный chatId в AdminBot='+keys[i]); delete AdminBot[keys[i]]; flag=1;}
 }
 if(flag) WriteFileJson(FileAdminBot,AdminBot);//записываем файл
}
catch (err)//если файл отсутствует, то создадим его 
{WriteFileJson(FileAdminBot,AdminBot);
}

//список файлов на выполнение
try 
{let bl = fs.readFileSync(FileImagesList);
 ImagesList = JSON.parse(bl);
 ImagesList = shiftObject(ImagesList);//упорядочиваем номера-ключи в массиве
 WriteFileJson(FileImagesList,ImagesList);
}
catch (err)//если файл отсутствует, то создадим его 
{WriteFileJson(FileImagesList,ImagesList);
}

//список текстов на выполнение
try 
{let bl = fs.readFileSync(FileTextList);
 TextList = JSON.parse(bl);
 TextList = shiftObject(TextList);//упорядочиваем номера-ключи в массиве
 WriteFileJson(FileTextList,TextList);
}
catch (err)//если файл отсутствует, то создадим его 
{WriteFileJson(FileTextList,TextList);
}

//список файлов на модерацию
try 
{let bl = fs.readFileSync(FileModerImagesList);
 ModerImagesList = JSON.parse(bl);
 ModerImagesList = shiftObject(ModerImagesList);//упорядочиваем номера-ключи в массиве
 WriteFileJson(FileModerImagesList,ModerImagesList);
}
catch (err)//если файл отсутствует, то создадим его 
{WriteFileJson(FileModerImagesList,ModerImagesList);
}

//список текстов на модерацию
try 
{let bl = fs.readFileSync(FileModerTextList);
 ModerTextList = JSON.parse(bl);
 ModerTextList = shiftObject(ModerTextList);//упорядочиваем номера-ключи в массиве
 WriteFileJson(FileModerTextList,ModerTextList);
}
catch (err)//если файл отсутствует, то создадим его 
{WriteFileJson(FileModerTextList,ModerTextList);
}

//загрузим chatId координатора WhatsApp
let chat_coordinatorWhatsApp;
if(Object.hasOwn(AdminList, 'coordinatorWhatsApp')&&AdminList.coordinatorWhatsApp !== '') {chat_coordinatorWhatsApp = AdminList.coordinatorWhatsApp;}
else 
{chat_coordinatorWhatsApp = 0; AdminList.coordinatorWhatsApp = ''; AdminList.coordinatorName = '';
 WriteFileJson(FileAdminList,AdminList);
}

WriteLogFile('=======================================================');
WriteLogFile('Запуск бота @'+namebot);
if(rassilka) WriteLogFile('Установлено время рассылки - '+timePablic+'Z'+moment().format('Z'));

//загружаем очередь, если сохраняли
if(fs.existsSync(currentDir+'/queue.json'))
{	let savedQueue;
	try{
		savedQueue = JSON.parse(fs.readFileSync(currentDir+'/queue.json'));
	} catch(err){WriteLogFile('Ошибка парсинга savedQueue\n'+err,'вбот');}
	if(!!savedQueue.queue)
	{	queue.queue = [...savedQueue.queue];
		queue.queue.forEach(item => {
			item.bot = item.bot=='NewsBot' ? NewsBot : (item.bot=='logBot' ? logBot : LoaderBot)
		});
		WriteLogFile('Загружена очередь из файла, '+queue.queue.length+' постов. Запускаем передачу.');
	}
	WriteFileJson(currentDir+'/queue.json', {});//очищаем файл
}

if(queue.queue.length>0) queue.forceProcess();//запускаем не пустую очередь на выполнение

/*(async () => {   
	let time = moment(timePablic,'HH:mm:ss');//время "Ч"
	let now = moment('00:00:00','HH:mm:ss');//текущее время
	let sec = now.diff(time, 'seconds');//разница в секундах
	console.log('sec='+sec);
})();*/
//====================================================================
// СТАРТ
LoaderBot.onText(/\/start/, async (msg) => 
{
try{
	const chatId = msg.chat.id;
	const name = ' '+msg.chat.first_name; 
	const user = '@'+msg.chat.username;
	let ban = banUser(chatId);
	let valid = validUser(chatId);
	
	let str='Привет, '+name+'! Это чат-бот '+area+'! ';
	str+='С моей помощью Вы сможете опубликовать в NAших Телеграм-каналах свои файлы и текстовые объявления. ';
	
	//проверим юзера
	if(ban) sendMessage(chatId, str+'Извините, ' + name + ', но Вы забанены! Обратитесь к админу. ');
	else if(!valid)
	{	await sendMessage(chatId, str+'Извините, ' + name + ', но Вам необходимо сначала пройти авторизацию! ');
		await send_instruction(chatId,user,'');
	}
	else 
	{	await sendMessage(chatId, str);
		await welcome(chatId,name);
	}
}catch(err){WriteLogFile(err+'\nfrom /start/','вчат');}
});
//====================================================================
// ПАРОЛЬ
/*LoaderBot.onText(/\/pass (.+)/, async (msg, match) => 
{
	const chatId = msg.chat.id;
	const name = ' '+msg.chat.first_name;
	const user = ''+msg.chat.username;
	const pass = match[1];
	let ban = banUser(chatId);
	let valid = validUser(chatId);
	
	//проверяем только незарегистрированного юзера
	if(ban) sendMessage(chatId, 'Извините, ' + name + ', но Вы забанены! Обратитесь к админу.');
	else if(!valid)
	{	if(pass == password)
		{	if(user=='') user='Неизвестный';
			UserList[chatId] = user+' ('+name+')';//добавляем юзера в список
			WriteFileJson(FileUserList,UserList);
			welcome(chatId,name);
			sendMessageToAdmin('Юзер "'+name+'" ('+user+') был добавлен в список авторизованных');//пошлем сообщение админам
		}
		else
		{	sendMessage(chatId, 'Извините, ' + name + ', но пароль не верный! Попробуйте еще разок...');
			send_instruction(chatId,user,pass);
		}
	}
	else 
	{	sendMessage(chatId, 'В этом нет необходимости, ' + name + ', Вы уже авторизованы ранее!',klava(begin(chatId)));
	}
});*/
//====================================================================
// ФОТО
LoaderBot.on('photo', async (msg) => 
{	
try{
	const chatId = msg.chat.id;
	const name = ' '+msg.chat.first_name;
	const user = '@'+msg.chat.username;
	let ban = banUser(chatId);
	let valid = validUser(chatId);
	let media_group_id = msg.media_group_id;
	
	//проверим юзера
	if(ban) sendMessage(chatId, 'Извините, ' + name + ', но Вы забанены! Обратитесь к админу.');
	else if(!valid)
	{	sendMessage(chatId, 'Извините, ' + name + ', но Вам необходимо сначала пройти авторизацию!');
		send_instruction(chatId,user,'');
	}
	else //все в порядке
	{	
		//проверяем, действительно ли что-то ожидается
		if(!!WaitFlag[chatId] && WaitFlag[chatId] == 31)//ожидаем картинку для хостинга
		{
			//загружаем картинку
			let path;
			try {path = await LoaderBot.downloadFile(msg.photo[msg.photo.length-1].file_id, PathToHostImg);}
			catch(err)
			{	sendMessage(chatId, 'Эта картинка слишком велика, разрешено не более 20Мб', klava(begin(chatId)));
				clearTempWait(chatId);
				return;
			}
			let mas = path.split('/');
			let fileName = chatId+'-'+moment().format('DD_MM_YYYY-HH_mm_ss')+'-'+mas[mas.length-1];//вытащим и изменим имя файла
			let newpath = PathToHostImg+'/'+fileName;//новый путь и имя файла
			//скопируем файл с новым именем в папку хостинга
			fs.copyFileSync(path, newpath);
			//сразу удалим временный файл
			try {fs.unlinkSync(path);} catch (e) {console.log(e);}
			//сформируем прямую ссылку
			let str = hostname+'/'+fileName;
			await sendMessage(chatId, 'Прямая ссылка на картинку:\n'+str);
			await sendMessage(chatId, 'Чтобы вернуться, нажмите на кнопку', klava(keyboard['3']));//в Начало
			clearTempWait(chatId);
			return;
		}
		//если ничего не ожидается
		else if(!TempPost[chatId] || !WaitFlag[chatId] || WaitFlag[chatId] != 1) 
		{	sendMessage(chatId, '🤷🏻‍♂️');
			return;
		}
		let date = '', day = '', time = '';
		if(!!TempPost[chatId] && !!TempPost[chatId].date) 		date = TempPost[chatId].date;//дата
		if(!!TempPost[chatId] && !!TempPost[chatId].dayOfWeek) 	day = TempPost[chatId].dayOfWeek;//день
		if(!!TempPost[chatId] && !!TempPost[chatId].time) 		time = TempPost[chatId].time;//время
		
		if(!day || !date)
		{	clearTempWait(chatId);
			sendMessage(chatId, 'Неожиданно... игнорирую.', klava(begin(chatId)));
			return;
		}
		//если дата корявая, то уходим
		if(date != moment(date,'DD.MM.YYYY').format('DD.MM.YYYY')) 
		{	clearTempWait(chatId);
			//если файлы уже были загружены, то нужно их удалить!
			if(!!media_group_id) {await deleteMediaFiles(MediaList[media_group_id]); delete MediaList[media_group_id];}
			sendMessage(chatId, 'Неожиданная дата или период... игнорирую.', klava(begin(chatId)));
			return;
		}
		//проверяем подпись
		if(Object.hasOwn(msg, 'caption') && msg.caption.length > 1000)
		{	sendMessage(chatId, '🤷‍♂️Сожалею, но подпись к файлу не может превышать 1000 символов!🤷‍♂️', klava(keyboard['3']));
			clearTempWait(chatId);
			//если файлы уже были загружены, то нужно их удалить!
			if(!!media_group_id) {await deleteMediaFiles(MediaList[media_group_id]); delete MediaList[media_group_id];}
			return;
		}
		//удаляем флаг, если не альбом
		if(!media_group_id) delete WaitFlag[chatId];
		
		//загружаем картинку на модерацию
		let path;
		try {path = await LoaderBot.downloadFile(msg.photo[msg.photo.length-1].file_id, TmpPath);}
		catch(err)
		{sendMessage(chatId, 'Эта картинка слишком велика, разрешено не более 20Мб', klava(begin(chatId)));
		 clearTempWait(chatId);
		 //если файлы уже были загружены, то нужно их удалить!
		 if(!!media_group_id) {await deleteMediaFiles(MediaList[media_group_id]); delete MediaList[media_group_id];}
		 return;
		}
		
		let mas = path.split('/');
		let fileName = moment().format('DDMMYYYY-HH_mm_ss_ms')+'-'+mas[mas.length-1];//вытащим и изменим имя файла
        let newpath = PathToImagesModer+'/'+fileName;//новый путь файла для модерации
		if(Object.hasOwn(msg, 'caption')) TempPost[chatId].caption = msg.caption;//подпись
		if(Object.hasOwn(msg, 'caption_entities')) TempPost[chatId].caption_entities = JSON.stringify(msg.caption_entities);//форматирование
		TempPost[chatId].type = 'image';//тип - картинка
		if(!Object.hasOwn(TempPost[chatId], 'userName')) TempPost[chatId].userName = user;
		if(!Object.hasOwn(TempPost[chatId], 'chatId')) TempPost[chatId].chatId = chatId;
		TempPost[chatId].timeload = moment().format('DD.MM.YY HH:mm:ss');//время загрузки
		//если в подписи форматирования нет, то проверим на символы markdown
		if(!TempPost[chatId].caption_entities && !!TempPost[chatId].caption)
		{	let cnt1 = (TempPost[chatId].caption.match(/\*/g) || []).length;//символы *
			let cnt2 = (TempPost[chatId].caption.match(/_/g) || []).length;//символы _
			if(cnt1>0)//если есть символы * четное 
			{	if(cnt1%2==0) TempPost[chatId].parse_mode = 'markdown';
				else if(!!TempPost[chatId].parse_mode) delete TempPost[chatId].parse_mode;
			}
			if(cnt2>0)//если есть символы _ четное 
			{	if(cnt2%2==0 && cnt1%2==0) TempPost[chatId].parse_mode = 'markdown';
				else if(!!TempPost[chatId].parse_mode) delete TempPost[chatId].parse_mode;
			}
			//удалим принудительно markdown, ошибается
			if(!!TempPost[chatId].parse_mode) delete TempPost[chatId].parse_mode;
		}
		//переносим картинку и записываем в список картинок на модерацию
		let len = await setToModerImagesList(path, newpath, TempPost[chatId], media_group_id);//получаем последний индекс
        //если одиночная картинка
		if(!media_group_id)
		{	//пошлем сообщение админам
			sendMessageToAdmin('Юзер "'+name+'" ('+user+') просит добавить картинку '+'"'+date+' ('+day+')"');
			sendMessage(chatId, 'Поздравляю, '+name+'! Картинка "'+date+' ('+day+')" отправлена на модерацию!', klava(begin(chatId)));
			delete TempPost[chatId];
		}
		else if(!!MediaList[media_group_id].count)//если альбом
		{	TempPost[chatId] = {};
			TempPost[chatId].date = date;
			TempPost[chatId].dayOfWeek = day;
			if(!!time) TempPost[chatId].time = time;
			//проверяем конец альбома
			if(MediaList[media_group_id].media.length == MediaList[media_group_id].count.length)
			{	let obj = {};
				obj.media = MediaList[media_group_id].media;
				obj.dayOfWeek = MediaList[media_group_id].dayOfWeek;
				obj.date = MediaList[media_group_id].date;
				obj.userName = MediaList[media_group_id].userName;
				obj.chatId = MediaList[media_group_id].chatId;
				obj.type = MediaList[media_group_id].type;
				if(!!MediaList[media_group_id].time) obj.time = MediaList[media_group_id].time;
				delete WaitFlag[obj.chatId];
				delete TempPost[obj.chatId];
				delete MediaList[media_group_id];
				obj.media = sortMedia(obj.media);
				let len = await setToModerImagesList(null, null, obj);
				//пошлем сообщение админам
				sendMessageToAdmin('Юзер "'+name+'" ('+user+') просит добавить альбом '+'"'+date+' ('+day+')"');
				sendMessage(chatId, 'Поздравляю, '+name+'! Альбом "'+date+' ('+day+')" отправлен на модерацию!', klava(begin(chatId)));
			}
		}
		else
		{	clearTempWait(obj.chatId);
			delete MediaList[media_group_id];
		}
	}
}catch(err){WriteLogFile(err+'\nfrom LoaderBot.on(photo)','вчат');}
});
//====================================================================
// ВИДЕО
LoaderBot.on('video', async (msg) => 
{	
try{
	const chatId = msg.chat.id;
	const name = ' '+msg.chat.first_name;
	const user = '@'+msg.chat.username;
	let ban = banUser(chatId);
	let valid = validUser(chatId);
	let media_group_id = msg.media_group_id;
	
	//проверим юзера
	if(ban) sendMessage(chatId, 'Извините, ' + name + ', но Вы забанены! Обратитесь к админу.');
	else if(!valid)
	{	sendMessage(chatId, 'Извините, ' + name + ', но Вам необходимо сначала пройти авторизацию!');
		send_instruction(chatId,user,'');
	}
	else //все в порядке
	{	
		//проверяем, действительно ли что-то ожидается
		if(!TempPost[chatId] || !WaitFlag[chatId] || WaitFlag[chatId] != 1) 
		{	sendMessage(chatId, '🤷🏻‍♂️');
			return;
		}
		let date = '', day = '', time = '';
		if(!!TempPost[chatId] && !!TempPost[chatId].date) 		date = TempPost[chatId].date;//дата
		if(!!TempPost[chatId] && !!TempPost[chatId].dayOfWeek) 	day = TempPost[chatId].dayOfWeek;//день
		if(!!TempPost[chatId] && !!TempPost[chatId].time) 		time = TempPost[chatId].time;//время
		
		if(!day || !date)
		{	clearTempWait(chatId);
			sendMessage(chatId, 'Неожиданно... игнорирую.', klava(begin(chatId)));
			return;
		}
		//если дата корявая, то уходим
		if(date != moment(date,'DD.MM.YYYY').format('DD.MM.YYYY')) 
		{	clearTempWait(chatId);
			//если файлы уже были загружены, то нужно их удалить!
			if(!!media_group_id) {await deleteMediaFiles(MediaList[media_group_id]); delete MediaList[media_group_id];}
			sendMessage(chatId, 'Неожиданная дата или период... игнорирую.', klava(begin(chatId)));
			return;
		}
		//проверяем подпись
		if(Object.hasOwn(msg, 'caption') && msg.caption.length > 1000)
		{	sendMessage(chatId, '🤷‍♂️Сожалею, но подпись к ролику не может превышать 1000 символов!🤷‍♂️', klava(keyboard['3']));
			clearTempWait(chatId);
			//если файлы уже были загружены, то нужно их удалить!
			if(!!media_group_id) {await deleteMediaFiles(MediaList[media_group_id]); delete MediaList[media_group_id];}
			return;
		}
		//удаляем флаг, если не альбом
		if(!media_group_id) delete WaitFlag[chatId];
		
		//загружаем ролик на модерацию
		let path;
		try {path = await LoaderBot.downloadFile(msg.video.file_id, TmpPath);}
		catch(err)
		{sendMessage(chatId, 'Этот ролик слишком велик, разрешено не более 20Мб', klava(begin(chatId)));
		 clearTempWait(chatId);
		 //если файлы уже были загружены, то нужно их удалить!
		 if(!!media_group_id) {await deleteMediaFiles(MediaList[media_group_id]); delete MediaList[media_group_id];}
		 return;
		}
		
		let mas = path.split('/');
		let fileName = moment().format('DDMMYYYY-HH_mm_ss_ms')+'-'+mas[mas.length-1];//вытащим и изменим имя файла
        let newpath = PathToImagesModer+'/'+fileName;//новый путь файла для модерации
		if(Object.hasOwn(msg, 'caption')) TempPost[chatId].caption = msg.caption;//подпись
		if(Object.hasOwn(msg, 'caption_entities')) TempPost[chatId].caption_entities = JSON.stringify(msg.caption_entities);//форматирование
		TempPost[chatId].type = 'video';//тип - видео
		if(!Object.hasOwn(TempPost[chatId], 'userName')) TempPost[chatId].userName = user;
		if(!Object.hasOwn(TempPost[chatId], 'chatId')) TempPost[chatId].chatId = chatId;
		TempPost[chatId].timeload = moment().format('DD.MM.YY HH:mm:ss');//время загрузки
		//переносим ролик и записываем в список файлов на модерацию
		let len = await setToModerImagesList(path, newpath, TempPost[chatId], media_group_id);//получаем последний индекс
        //если одиночная ролик
		if(!media_group_id)
		{	//пошлем сообщение админам
			sendMessageToAdmin('Юзер "'+name+'" ('+user+') просит добавить ролик '+'"'+date+' ('+day+')"');
			sendMessage(chatId, 'Поздравляю, '+name+'! Ролик "'+date+' ('+day+')" отправлен на модерацию!', klava(begin(chatId)));
			delete TempPost[chatId];
		}
		else if(!!MediaList[media_group_id].count)//если альбом
		{	TempPost[chatId] = {};
			TempPost[chatId].date = date;
			TempPost[chatId].dayOfWeek = day;
			if(!!time) TempPost[chatId].time = time;
			//проверяем конец альбома
			if(MediaList[media_group_id].media.length == MediaList[media_group_id].count.length)
			{	let obj = {};
				obj.media = MediaList[media_group_id].media;
				obj.dayOfWeek = MediaList[media_group_id].dayOfWeek;
				obj.date = MediaList[media_group_id].date;
				obj.userName = MediaList[media_group_id].userName;
				obj.chatId = MediaList[media_group_id].chatId;
				obj.type = MediaList[media_group_id].type;
				if(!!MediaList[media_group_id].time) obj.time = MediaList[media_group_id].time;
				delete WaitFlag[obj.chatId];
				delete TempPost[obj.chatId];
				delete MediaList[media_group_id];
				obj.media = sortMedia(obj.media);
				let len = await setToModerImagesList(null, null, obj);
				//пошлем сообщение админам
				sendMessageToAdmin('Юзер "'+name+'" ('+user+') просит добавить альбом '+'"'+date+' ('+day+')"');
				sendMessage(chatId, 'Поздравляю, '+name+'! Альбом "'+date+' ('+day+')" отправлен на модерацию!', klava(begin(chatId)));
			}
		}
		else
		{	delete WaitFlag[obj.chatId];
			delete TempPost[obj.chatId];
			delete MediaList[media_group_id];
		}
	}
}catch(err){WriteLogFile(err+'\nfrom LoaderBot.on(video)','вчат');}
});
//====================================================================
// АУДИО
LoaderBot.on('audio', async (msg) => 
{	
try{
	const chatId = msg.chat.id;
	const name = ' '+msg.chat.first_name;
	const user = '@'+msg.chat.username;
	let ban = banUser(chatId);
	let valid = validUser(chatId);
	let media_group_id = msg.media_group_id;
	
	//проверим юзера
	if(ban) sendMessage(chatId, 'Извините, ' + name + ', но Вы забанены! Обратитесь к админу.');
	else if(!valid)
	{	sendMessage(chatId, 'Извините, ' + name + ', но Вам необходимо сначала пройти авторизацию!');
		send_instruction(chatId,user,'');
	}
	else //все в порядке
	{	
		if(media_group_id) return;//не пропускаем пока, если альбом
		//проверяем, действительно ли что-то ожидается
		if(!TempPost[chatId] || !WaitFlag[chatId] || WaitFlag[chatId] != 1) 
		{	sendMessage(chatId, '🤷🏻‍♂️');
			return;
		}
		let date = '', day = '';
		if(!!TempPost[chatId] && !!TempPost[chatId].date) 		date = TempPost[chatId].date;//дата
		if(!!TempPost[chatId] && !!TempPost[chatId].dayOfWeek) 	day = TempPost[chatId].dayOfWeek;//день
		
		if(!day || !date)
		{	clearTempWait(chatId);
			sendMessage(chatId, 'Неожиданно... игнорирую.', klava(begin(chatId)));
			return;
		}
		//проверяем подпись
		if(Object.hasOwn(msg, 'caption') && msg.caption.length > 1000)
		{	sendMessage(chatId, '🤷‍♂️Сожалею, но подпись к аудио не может превышать 1000 символов!🤷‍♂️', klava(keyboard['3']));
			clearTempWait(chatId);
			return;
		}
		//если дата корявая или нет периода, то уходим
		if(date != moment(date,'DD.MM.YYYY').format('DD.MM.YYYY') || !day)  
		{	clearTempWait(chatId);
			sendMessage(chatId, 'Неожиданная дата или период... игнорирую.', klava(begin(chatId)));
			return;
		}
		//удаляем флаг, если не альбом
		if(!media_group_id) delete WaitFlag[chatId];
		
		//загружаем трек на модерацию
		let path;
		try {path = await LoaderBot.downloadFile(msg.audio.file_id, TmpPath);}
		catch(err)
		{sendMessage(chatId, 'Этот Трек слишком велик, разрешено не более 20Мб', klava(begin(chatId)));
		 numOfDelete[chatId]='';
		 delete TempPost[chatId];
		 return;
		}
		
		let mas = path.split('/');
		let fileName = moment().format('DDMMYYYY-HH_mm_ss_ms')+'-'+mas[mas.length-1];//вытащим и изменим имя файла
        let newpath = PathToImagesModer+'/'+fileName;//новый путь файла для модерации
		if(Object.hasOwn(msg, 'caption')) TempPost[chatId].caption = msg.caption;//подпись
		if(Object.hasOwn(msg, 'caption_entities')) TempPost[chatId].caption_entities = JSON.stringify(msg.caption_entities);//форматирование
		TempPost[chatId].type = 'audio';//тип - audio
		if(!Object.hasOwn(TempPost[chatId], 'userName')) TempPost[chatId].userName = user;
		if(!Object.hasOwn(TempPost[chatId], 'chatId')) TempPost[chatId].chatId = chatId;
		TempPost[chatId].timeload = moment().format('DD.MM.YY HH:mm:ss');//время загрузки
		//переносим ролик и записываем в список файлов на модерацию
		let len = await setToModerImagesList(path, newpath, TempPost[chatId]);//получаем последний индекс
            
		//пошлем сообщение админам
		sendMessageToAdmin('Юзер "'+name+'" ('+user+') просит добавить аудио '+'"'+date+' ('+day+')"');
			
		sendMessage(chatId, 'Поздравляю, '+name+'! Аудиотрек "'+date+' ('+day+')" отправлен на модерацию!', klava(begin(chatId)));
		delete TempPost[chatId];
	}
}catch(err){WriteLogFile(err+'\nfrom LoaderBot.on(audio)','вчат');}
});
//====================================================================
// ДОКУМЕНТ
LoaderBot.on('document', async (msg) => 
{	
try{
	const chatId = msg.chat.id;
	const name = ' '+msg.chat.first_name;
	const user = '@'+msg.chat.username;
	let ban = banUser(chatId);
	let valid = validUser(chatId);
	let media_group_id = msg.media_group_id;
	
	//проверим юзера
	if(ban) sendMessage(chatId, 'Извините, ' + name + ', но Вы забанены! Обратитесь к админу.');
	else if(!valid)
	{	sendMessage(chatId, 'Извините, ' + name + ', но Вам необходимо сначала пройти авторизацию!');
		send_instruction(chatId,user,'');
	}
	else //все в порядке
	{	
		if(media_group_id) return;//не пропускаем пока, если альбом
		//проверяем, действительно ли что-то ожидается
		if(!TempPost[chatId] || !WaitFlag[chatId] || WaitFlag[chatId] != 1) 
		{	sendMessage(chatId, '🤷🏻‍♂️');
			return;
		}
		let date = '', day = '';
		if(WaitFlag[chatId]==1)
		{	if(!!TempPost[chatId] && !!TempPost[chatId].date) 		date = TempPost[chatId].date;//дата
			if(!!TempPost[chatId] && !!TempPost[chatId].dayOfWeek) 	day = TempPost[chatId].dayOfWeek;//день
			delete WaitFlag[chatId];
		}
		if(!day || !date)
		{	clearTempWait(chatId);
			sendMessage(chatId, 'Неожиданно... игнорирую.', klava(begin(chatId)));
			return;
		}
		//проверяем подпись
		if(Object.hasOwn(msg, 'caption') && msg.caption.length > 1000)
		{	sendMessage(chatId, '🤷‍♂️Сожалею, но подпись к файлу не может превышать 1000 символов!🤷‍♂️', klava(keyboard['3']));
			delete TempPost[chatId];
			numOfDelete[chatId]='';
			return;
		}
		//если дата корявая или нет периода, то уходим
		if(date != moment(date,'DD.MM.YYYY').format('DD.MM.YYYY') || !day)  
		{	numOfDelete[chatId]='';
			delete TempPost[chatId];
			sendMessage(chatId, 'Неожиданная дата или период... игнорирую.', klava(begin(chatId)));
			return;
		}
		
		//загружаем док на модерацию
		let path;
		try {path = await LoaderBot.downloadFile(msg.document.file_id, TmpPath);}
		catch(err)
		{sendMessage(chatId, 'Этот файл слишком велик, разрешено не более 20Мб', klava(begin(chatId)));
		 numOfDelete[chatId]='';
		 delete TempPost[chatId];
		 return;
		}
		
		let mas = path.split('/');
		let fileName = moment().format('DDMMYYYY-HH_mm_ss_ms')+'-'+mas[mas.length-1];//вытащим и изменим имя файла
        let newpath = PathToImagesModer+'/'+fileName;//новый путь файла для модерации
		if(Object.hasOwn(msg, 'caption')) TempPost[chatId].caption = msg.caption;//подпись
		if(Object.hasOwn(msg, 'caption_entities')) TempPost[chatId].caption_entities = JSON.stringify(msg.caption_entities);//форматирование
		TempPost[chatId].type = 'document';//тип - document
		if(!Object.hasOwn(TempPost[chatId], 'userName')) TempPost[chatId].userName = user;
		if(!Object.hasOwn(TempPost[chatId], 'chatId')) TempPost[chatId].chatId = chatId;
		TempPost[chatId].timeload = moment().format('DD.MM.YY HH:mm:ss');//время загрузки
		//переносим ролик и записываем в список файлов на модерацию
		let len = await setToModerImagesList(path, newpath, TempPost[chatId]);//получаем последний индекс
            
		//пошлем сообщение админам
		sendMessageToAdmin('Юзер "'+name+'" ('+user+') просит добавить документ '+'"'+date+' ('+day+')"');
			
		sendMessage(chatId, 'Поздравляю, '+name+'! Документ "'+date+' ('+day+')" отправлен на модерацию!', klava(begin(chatId)));
		delete TempPost[chatId];
	}
}catch(err){WriteLogFile(err+'\nfrom LoaderBot.on(document)','вчат');}
});
//====================================================================
// ловим тексты
LoaderBot.on('message', async (msg) => 
{	
try{	
	const chatId = msg.chat.id;
	const name = ' '+msg.chat.first_name;
	const user = '@'+msg.chat.username;
	let ban = banUser(chatId);
	let valid = validUser(chatId);
	let media_group_id = msg.media_group_id;
	
	//if(!msg.text) {return;}//если текста нет
	if(!msg.text && !media_group_id) {return;}//если текста нет и не альбом
	if(!!msg.text && msg.text.slice(0,1)=='/') return;//если команда
	
	//проверим юзера
	if(ban) sendMessage(chatId, 'Извините, ' + name + ', но Вы забанены! Обратитесь к админу.');
	else if(!valid)
	{	sendMessage(chatId, 'Извините, ' + name + ', но Вам необходимо сначала пройти авторизацию!');
		send_instruction(chatId,user,'');
	}
	else //все в порядке
	{
		if(!!media_group_id)//если это альбом
		{	if(Object.hasOwn(msg, 'photo') || Object.hasOwn(msg, 'video'))
			{	if(!Object.hasOwn(MediaList, media_group_id))//если первый файл альбома
				{	MediaList[media_group_id] = {};
					MediaList[media_group_id].media = [];
					MediaList[media_group_id].count = [];
					MediaList[media_group_id].type = 'album';
				}
				if(Object.hasOwn(msg, 'photo'))
				{	let mas = Object.keys(msg.photo);
					MediaList[media_group_id].count.push(msg.photo[mas.length-1].file_id);
				}
				if(Object.hasOwn(msg, 'video'))
				{	MediaList[media_group_id].count.push(msg.video.file_id);
				}
			}
			return;
		}
		
		//проверяем текст
		if(!msg.text && msg.text.length > 4050)
		{	sendMessage(chatId, '🤷‍♂️Сожалею, но длина текста не может превышать 4000 символов!🤷‍♂️', klava(keyboard['3']));
			clearTempWait(chatId);
			return;
		}
	  //----------------------------------------------------------------
	  //первый стейт - текст
	  //проверим лист ожиданий
	  if(!!TempPost[chatId] && !!WaitFlag[chatId] && WaitFlag[chatId] == 1)
	  {	delete WaitFlag[chatId];//удаляем из листа ожиданий
		//сохраним текст во временный массив
		//когда сюда приходим, у нас уже есть dayOfWeek, date
		if(!!TempPost[chatId].type) delete TempPost[chatId].type;//в тексте типа нет
		TempPost[chatId].text=msg.text;//сам текст
		TempPost[chatId].entities=msg.entities;//форматирование
		if(!!msg.link_preview_options) TempPost[chatId].link_preview_options=msg.link_preview_options;//превью
		TempPost[chatId].timeload = moment().format('DD.MM.YY HH:mm:ss');//время загрузки
		//если форматирования нет, то проверим на markdown
		if(!TempPost[chatId].entities)
		{	let cnt1 = (TempPost[chatId].text.match(/\*/g) || []).length;//символы *
			let cnt2 = (TempPost[chatId].text.match(/_/g) || []).length;//символы _
			if(cnt1>0)//если есть символы * четное 
			{	if(cnt1%2==0) TempPost[chatId].parse_mode = 'markdown';
				else if(!!TempPost[chatId].parse_mode) delete TempPost[chatId].parse_mode;
			}
			if(cnt2>0)//если есть символы _ четное 
			{	if(cnt2%2==0 && cnt1%2==0) TempPost[chatId].parse_mode = 'markdown';
				else if(!!TempPost[chatId].parse_mode) delete TempPost[chatId].parse_mode;
			}
		}
		let date=TempPost[chatId].date;
		let day=TempPost[chatId].dayOfWeek;
		let obj = {};
		obj.entities = TempPost[chatId].entities;
		obj.link_preview_options=TempPost[chatId].link_preview_options;
		if(TempPost[chatId].link_preview_options && TempPost[chatId].link_preview_options.is_disabled) obj.disable_web_page_preview = true;
		if(!!TempPost[chatId].parse_mode) obj.parse_mode = TempPost[chatId].parse_mode;
		if(!Object.hasOwn(obj, 'userName')) obj.userName = user;
		if(!Object.hasOwn(obj, 'chatId')) obj.chatId = chatId;
		await sendMessage(chatId, TempPost[chatId].text, obj);//показываем присланный текст
		await sendMessage(chatId, '👆Вот что я получил.👆\nДата="'+date+' ('+day+')"\nВсе ли верно?', klava(keyboard['2']));
	  }
	  //----------------------------------------------------------------
	  //второй стейт - сюда входим только если ждем Дату
	  else if(WaitFlag[chatId]==2)
	  {	delete WaitFlag[chatId];//удаляем из листа ожиданий
		//проверим дату
		let date=msg.text;
		if(date != moment(date,'DD.MM.YYYY').format('DD.MM.YYYY'))
		{	sendMessage(chatId, 'Дата не соответствует шаблону, или символы введены некорректно!\nПопробуйте еще разок сначала', klava(begin(chatId)));
		}
		else if(moment(date,'DD.MM.YYYY').diff(moment(), 'days') < 0)//если дата вчерашняя
		{	sendMessage(chatId, 'Прошедшее время не подходит!\nПопробуйте еще разок сначала', klava(begin(chatId)));
		}
		else if(date == moment(date,'DD.MM.YYYY').format('DD.MM.YYYY'))//если дата верна
		{	
			TempPost[chatId].date = date;//запоминаем дату
			/*let str = 'Теперь пришлите мне один пост (текст, картинка, видео, аудио, документ, альбом), который необходимо опубликовать. ';
			str += 'Его можно просто скопировать-вставить из любого чата, или загрузить из хранилища. ';
			str += 'Форматирование текста и подписи сохраняется.';
			WaitFlag[chatId]=1;//взводим флаг ожидания текста или файла от юзера
			await sendMessage(chatId, str, klava(keyboard['3']));
			//теперь будем ждать или текст, или файл*/
			let str = 'Хотите ввести особое *ВРЕМЯ* публикации? Если нажмете *Нет*, то пост будет опубликован ';
			str += 'в стандартное время - '+timePablic+'Z'+moment().format('Z');
			await sendMessage(chatId, str, klava(keyboard['10']));//Да/Нет/В начало
		}
		else 
		{	if(!!TempPost[chatId]) delete TempPost[chatId];
			await sendMessage(chatId, 'Сожалею, но такую дату принять не могу...🤷🏻‍♂️', klava(begin(chatId)));
		}
	  }
	  //----------------------------------------------------------------
	  //третий стейт - ловим номер удаляемого поста
	  else if(WaitFlag[chatId]==3)
	  {	delete WaitFlag[chatId];//удаляем из листа ожиданий
		let num=msg.text;
		let List = await readPostList();//читаем файлы постов
		let mas = Object.keys(List);//создаем массив ключей из списка постов
		if(mas.indexOf(num)+1)//если список включает в себя присланный номер
		{	numOfDelete[chatId]=num;//сохраняем номер записи в глобальной переменной
			await sendMessage(chatId, 'Вы выбрали пост:\n** номер: '+num+' ** ('+List[num].date+')');
			//это текст
			if(Object.hasOwn(List[num], 'text'))
			{await sendMessage(chatId, List[num].text, {entities:List[num].entities});//показываем выбранный текст
			}
			//это файл
			else if(Object.hasOwn(List[num], 'path'))
			{let opt = new Object();
			 opt.caption = List[num].caption;
			 opt.caption_entities = List[num].caption_entities;
			 if(Object.hasOwn(List[num], 'type'))
			 {if(List[num].type == 'image') {await sendPhoto(LoaderBot, chatId, List[num].path, opt);}
			  else if(List[num].type == 'video') {await sendVideo(LoaderBot, chatId, List[num].path, opt);}
			  else if(List[num].type == 'audio') {await sendAudio(LoaderBot, chatId, List[num].path, opt);}
			  else if(List[num].type == 'document') {await sendDocument(LoaderBot, chatId, List[num].path, opt);}
			  else if(List[num].type=='album') {await sendAlbum(LoaderBot, chatId, List[num].media);}
			 }
			 else await sendPhoto(LoaderBot, chatId, List[num].path, opt);
			}
			//ждем выполнения очереди
			try{await queue.waitForQueueEmpty(30000);}catch(err){console.log(err);}
			sendMessage(chatId, '👆 Удаляем этот пост? 👆', klava(keyboard['7']));
		}
		else await sendMessage(chatId, 'В списке такого номера нет!', klava(begin(chatId)));
	  }
	  //----------------------------------------------------------------
	  //четвертый стейт - ловим номер удаляемого файла
	  else if(WaitFlag[chatId]==4)
	  {	delete WaitFlag[chatId];//удаляем из листа ожиданий
		let num=msg.text;
		await readImagesList();//читаем файл ImagesList
		let mas = Object.keys(ImagesList);//создаем массив ключей из списка файлов
		if(mas.indexOf(num)+1)//если список включает в себя присланный номер
		{	numOfDelete[chatId]=num;//сохраняем номер записи в глобальной переменной
			await sendMessage(chatId, 'Вы выбрали файл:\n** номер: '+num+' ** ('+ImagesList[num].date+')');
			let opt = new Object();
			opt.caption = ImagesList[num].caption;
			opt.caption_entities = ImagesList[num].caption_entities;
			if(Object.hasOwn(ImagesList[num], 'type'))
			{if(ImagesList[num].type == 'image') {await sendPhoto(LoaderBot, chatId, ImagesList[num].path, opt);}
			 else if(ImagesList[num].type == 'video') {await sendVideo(LoaderBot, chatId, ImagesList[num].path, opt);}
			 else if(ImagesList[num].type == 'audio') {await sendAudio(LoaderBot, chatId, ImagesList[num].path, opt);}
			 else if(ImagesList[num].type == 'document') {await sendDocument(LoaderBot, chatId, ImagesList[num].path, opt);}
			 else if(ImagesList[num].type=='album') {await sendAlbum(LoaderBot, chatId, ImagesList[num].media);}
			}
			else await sendPhoto(LoaderBot, chatId, ImagesList[num].path, opt);
			//ждем выполнения очереди
			try{await queue.waitForQueueEmpty(30000);}catch(err){console.log(err);}
			sendMessage(chatId, '👆 Удаляем этот файл? 👆', klava(keyboard['8']));
		}
		else await sendMessage(chatId, 'В списке такого номера нет!', klava(begin(chatId)));
	  }
	  //----------------------------------------------------------------
	  //ловим номер удаляемого текста на модерацию
	  else if(WaitFlag[chatId]==10)
	  {	delete WaitFlag[chatId];//удаляем из листа ожиданий
		let num=msg.text;
		readModerTextList();//читаем файл текстов в TextList
		let mas = Object.keys(ModerTextList);//создаем массив ключей из списка текстов
		if(mas.indexOf(num)+1)//если список включает в себя присланный номер
		{	numOfDelete[chatId]=num;//сохраняем номер записи в глобальной переменной
			await sendMessage(chatId, 'Вы выбрали текст:\n** номер: '+num+' ** ('+ModerTextList[num].date+')');
			await sendMessage(chatId, ModerTextList[num].text, {entities:ModerTextList[num].entities});//показываем выбранный текст
			sendMessage(chatId, '👆 Удаляем этот текст? 👆', klava(keyboard['101']));
		}
		else await sendMessage(chatId, 'В списке такого номера нет!', klava(begin(chatId)));
	  }
	  //----------------------------------------------------------------
	  //ловим номер удаляемого файла на модерацию
	  else if(WaitFlag[chatId]==11)
	  {	delete WaitFlag[chatId];//удаляем из листа ожиданий
		let num=msg.text;
		readModerImagesList();//читаем файл ModerImagesList
		let mas = Object.keys(ModerImagesList);//создаем массив ключей из списка файлов
		if(mas.indexOf(num)+1)//если список включает в себя присланный номер
		{	numOfDelete[chatId]=num;//сохраняем номер записи в глобальной переменной
			await sendMessage(chatId, 'Вы выбрали файл:\n** номер: '+num+' ** ('+ModerImagesList[num].date+')');
			let opt = new Object();
			opt.caption = ModerImagesList[num].caption;
			opt.caption_entities = ModerImagesList[num].caption_entities;
			if(Object.hasOwn(ModerImagesList[num], 'type'))
			{if(ModerImagesList[num].type == 'image') {await sendPhoto(LoaderBot, chatId, ModerImagesList[num].path, opt);}
			 else if(ModerImagesList[num].type == 'video') {await sendVideo(LoaderBot, chatId, ModerImagesList[num].path, opt);}
			 else if(ModerImagesList[num].type == 'audio') {await sendAudio(LoaderBot, chatId, ModerImagesList[num].path, opt);}
			 else if(ModerImagesList[num].type == 'document') {await sendDocument(LoaderBot, chatId, ModerImagesList[num].path, opt);}
			 else if(ModerImagesList[num].type=='album') {await sendAlbum(LoaderBot, chatId, ModerImagesList[num].media);}
			}
			else await sendPhoto(LoaderBot, chatId, ModerImagesList[num].path, opt);
			//ждем выполнения очереди
			try{await queue.waitForQueueEmpty(30000);}catch(err){console.log(err);}
			sendMessage(chatId, '👆 Удаляем этот файл? 👆', klava(keyboard['103']));
		}
		else await sendMessage(chatId, 'В списке такого номера нет!', klava(get_keyb100()));
	  }
	  //----------------------------------------------------------------
	  // ловим текст с причиной удаления текстового поста
	  else if(WaitFlag[chatId]==21 && numOfDelete[chatId]!='')
	  {	delete WaitFlag[chatId];//удаляем из листа ожиданий
		readModerTextList();//читаем файл текстов в ModerTextList
		//сначала уведомим отправителя об удалении
		if(Object.hasOwn(ModerTextList[numOfDelete[chatId]], 'chatId'))
		{let opt=new Object();
		 opt.caption = ModerTextList[numOfDelete[chatId]].caption;
		 opt.caption_entities = ModerTextList[numOfDelete[chatId]].caption_entities;
		 await sendMessage(ModerTextList[numOfDelete[chatId]].chatId, ModerTextList[numOfDelete[chatId]].text, opt);
		 await sendMessage(ModerTextList[numOfDelete[chatId]].chatId, '😢 К сожалению этот текст не прошел модерацию и был удален по причине:\n'+msg.text);
		}
		delete ModerTextList[numOfDelete[chatId]];
		await sendMessage(chatId, 'Выбранный текст успешно удален!', klava(get_keyb100()));
		ModerTextList = shiftObject(ModerTextList);//упорядочиваем номера-ключи в массиве
		WriteFileJson(FileModerTextList,ModerTextList);//сохраняем вычищенный список
		numOfDelete[chatId]='';
	  }
	  //----------------------------------------------------------------
	  // ловим текст с причиной удаления файла
	  else if(WaitFlag[chatId]==22 && numOfDelete[chatId]!='')
	  {	delete WaitFlag[chatId];//удаляем из листа ожиданий
		readModerImagesList();//читаем файл ModerImagesList
		//сначала уведомим отправителя об удалении
		if(Object.hasOwn(ModerImagesList[numOfDelete[chatId]], 'chatId'))
		{let opt=new Object();
		 opt.caption = ModerImagesList[numOfDelete[chatId]].caption;
		 if(Object.hasOwn(ModerImagesList[numOfDelete[chatId]], 'type'))
		 {if(ModerImagesList[numOfDelete[chatId]].type == 'image') {await sendPhoto(LoaderBot, ModerImagesList[numOfDelete[chatId]].chatId, ModerImagesList[numOfDelete[chatId]].path, opt);}
		  else if(ModerImagesList[numOfDelete[chatId]].type == 'video') {await sendVideo(LoaderBot, ModerImagesList[numOfDelete[chatId]].chatId, ModerImagesList[numOfDelete[chatId]].path, opt);}
		  else if(ModerImagesList[numOfDelete[chatId]].type == 'audio') {await sendAudio(LoaderBot, ModerImagesList[numOfDelete[chatId]].chatId, ModerImagesList[numOfDelete[chatId]].path, opt);}
		  else if(ModerImagesList[numOfDelete[chatId]].type == 'document') {await sendDocument(LoaderBot, ModerImagesList[numOfDelete[chatId]].chatId, ModerImagesList[numOfDelete[chatId]].path, opt);}
		  else if(ModerImagesList[numOfDelete[chatId]].type == 'album') {await sendAlbum(LoaderBot, ModerImagesList[numOfDelete[chatId]].chatId, ModerImagesList[numOfDelete[chatId]].media);}
		 }
		 else await sendPhoto(LoaderBot, ModerImagesList[numOfDelete[chatId]].chatId, ModerImagesList[numOfDelete[chatId]].path, opt);
		 await sendMessage(ModerImagesList[numOfDelete[chatId]].chatId, '😢 К сожалению этот файл не прошел модерацию и был удален по причине:\n'+msg.text);
		}
		try//удаляем сам файл
		{	if(!!ModerImagesList[numOfDelete[chatId]].path) fs.unlinkSync(ModerImagesList[numOfDelete[chatId]].path);
			if(!!ModerImagesList[numOfDelete[chatId]].media)
			{	let mas = Object.keys(ModerImagesList[numOfDelete[chatId]].media);
				for(let i=0;i<mas.length;i++)
				{	if(fs.existsSync(ModerImagesList[numOfDelete[chatId]].media[i].media))
					{	fs.unlinkSync(ModerImagesList[numOfDelete[chatId]].media[i].media);
					}
				}
			}
		} catch (e) {console.log(e);}
		delete ModerImagesList[numOfDelete[chatId]];//удаляем запись в списке
		//ждем выполнения очереди
		try{await queue.waitForQueueEmpty(30000);}catch(err){console.log(err);}
		await sendMessage(chatId, 'Выбранный файл успешно удален!', klava(get_keyb100()));
		ModerImagesList = shiftObject(ModerImagesList);//упорядочиваем номера-ключи в массиве
		WriteFileJson(FileModerImagesList,ModerImagesList);//сохраняем вычищенный список
		numOfDelete[chatId]='';
	  }
	  //----------------------------------------------------------------
	  //ловим время публикации
	  else if(WaitFlag[chatId]=='Time')
	  {	delete WaitFlag[chatId];//удаляем из листа ожиданий
		//проверим время
		let time=msg.text;
		if(time != moment(time,'HH:mm').format('HH:mm'))
		{	clearTempWait(chatId);
			sendMessage(chatId, 'Время не соответствует шаблону, или символы введены некорректно!\nПопробуйте еще разок сначала', klava(begin(chatId)));
		}
		else //если время корректно
		{	
			TempPost[chatId].time = time;//запоминаем время
			let str = 'Теперь пришлите мне один пост (текст, картинка, видео, аудио, документ, альбом), который необходимо опубликовать. ';
			str += 'Его можно просто скопировать-вставить из любого чата, или загрузить из хранилища. ';
			str += 'Форматирование текста и подписи сохраняется.';
			WaitFlag[chatId]=1;//взводим флаг ожидания текста или файла от юзера
			await sendMessage(chatId, str, klava(keyboard['3']));
			//теперь будем ждать или текст, или файл
		}
	  }
	  //----------------------------------------------------------------
	  else //если пришел текст 'от фонаря'
	  {	if(forDeleteList.length > 0) forDeleteList = [];//очищаем список удаляемых файлов
		clearTempWait(chatId);
		//сохраняем для посл.удаления
		let chat_id='', mess_id='';
		if(LastMessId[chatId]) {chat_id=chatId; mess_id=LastMessId[chatId].messId;}
		welcome(chatId,name);
	  }	
	}
}catch(err){WriteLogFile(err+'\nfrom LoaderBot.on(message)','вчат');}
});
//====================================================================
// обработка ответов от кнопок
LoaderBot.on('callback_query', async (msg) => 
{	
try{
	const chatId = msg.message.chat.id;
	const messId = msg.message.message_id;
    const messText = msg.message.text;
    const messEnt = msg.message.entities;
	const name = ' '+msg.message.chat.first_name;
	const user = '@'+msg.message.chat.username;
	let ban = banUser(chatId);
	let valid = validUser(chatId);
	
	//проверим юзера
	if(ban) sendMessage(chatId, 'Извините, ' + name + ', но Вы забанены! Обратитесь к админу.');
	else if(!valid)
	{	sendMessage(chatId, 'Извините, ' + name + ', но Вам необходимо сначала пройти авторизацию!');
		send_instruction(chatId,user,'');
	}
	else //все в порядке
	{	let answer = msg.data.split('_');
		let state = answer[0];//номер набора кнопок
		let button = answer[1];//содержание
		//Админские кнопки доступны только Админам
		if(state>=100 && !(validAdmin(chatId) | validAdminBot(chatId))) return;
		
		//------------ набор '1' ----------------------------------------
		if(state==1)
		{	let str = 'Вы выбрали "'+button+'".\r\n';
			if(TempPost[chatId]) delete TempPost[chatId];

			// кнопка Загрузить ПОСТ
			if(button=='Загрузить Пост')
			{	str += 'Теперь выберите подходящий режим публикаций:\n';
                await sendMessage(chatId, str, klava(keyboard['5']));
			}
			// кнопка Удалить ПОСТ
			if(button=='Удалить Пост')
			{	if(Object.keys(TextList).length > 0 || Object.keys(ImagesList).length > 0)
				{
					await showPostList(chatId, 1);
					str = 'Теперь пришлите мне *номер* Поста, который нужно удалить.\n';
					WaitFlag[chatId]=3;//взводим флаг ожидания номера от юзера
				}
                else str += '*Упс... А список то пустой!*\n';
                //ждем выполнения очереди
				try{await queue.waitForQueueEmpty(30000);}catch(err){console.log(err);}
				await sendMessage(chatId, str, klava(keyboard['3']));//В Начало
			}
			// кнопка Хостинг картинок
			if(button=='Хостинг картинок')
			{	if(!!PathToHostImg && fs.existsSync(PathToHostImg) && !!hostname)
				{ 	str += 'Пришлите мне картинку и я верну прямую ссылку на нее.';
					WaitFlag[chatId]=31;//взводим флаг ожидания картинки от юзера
					await sendMessage(chatId, str, klava(keyboard['3']));//В Начало
				}
				else
				{	str = 'Ошибка: Отсутствует папка или hostname!';
					await sendMessage(chatId, str, klava(keyboard['3']));//В Начало
				}
			}
			// кнопка Админ Бота
			if(button=='Админ Бота')
			{	valid = validAdmin(chatId) | validAdminBot(chatId);
				if(!valid) return;
				str += 'Здесь Админ Бота может провести модерацию присланных заявок.';
                await sendMessage(chatId, str, klava(get_keyb100()));
			}
		}
		//------------ набор 'Да + Нет' при подтверждении текста--------
		else if(state==2 && !!TempPost[chatId])//
		{	if(button=='Да')
			{
				//Дата или день недели уже сидит
				if(TempPost[chatId] && Object.hasOwn(TempPost[chatId], 'date'))//если временный текст существует и есть Дата
				{	await setToModerTextList(TempPost[chatId]);//сохраняем в списке текстов
					//пошлем сообщение админам
					let day = TempPost[chatId].dayOfWeek;
					sendMessageToAdmin('Юзер "'+name+'" ('+user+') просит добавить Текст "'+TempPost[chatId].date+' ('+day+')"');
					
					sendMessage(chatId, 'Поздравляю, '+name+'! Текст "'+TempPost[chatId].date+' ('+day+')" отправлен на модерацию!', klava(begin(chatId)));
				}
				else sendMessage(chatId, 'Текст "'+TempPost[chatId].dayOfWeek+'" не может быть опубликован!', klava(begin(chatId)));
				
				delete TempPost[chatId];//удаляем временный текст
				delete WaitFlag[chatId]
				numOfDelete[chatId]='';
			}
			else if(button=='Нет')
			{	clearTempWait(chatId);
				await sendMessage(chatId, 'Не беда! Давайте попробуем еще разок с начала!', klava(begin(chatId)));
			}
			else if(button=='Назад')
			{	clearTempWait(chatId);
				welcome(chatId,name);
			}
		}
		//------------ В Начало ----------------------------------------
		else if(state==3)
		{	clearTempWait(chatId);
            welcome(chatId,name);
		}
		//------------ набор 'Да + Нет' при удалении файлов -------------------------
		else if(state==4)
		{	if(button=='Да')//удаляем файлы
			{	if(forDeleteList.length > 0)
				{	for(let i in forDeleteList)
					{	try
						{	fs.unlinkSync(forDeleteList[i]);
						} catch (e) {console.log(e);}		
					}
                    await sendMessage(chatId, 'Все сделал в лучшем виде!', klava(begin(chatId)));
				}			
			}
			else
			{	await sendMessage(chatId, 'Вот и хорошо, торопиться не будем!', klava(begin(chatId)));
			}
			forDeleteList = [];//очищаем список удаляемых файлов
		}
		//------------ Дни недели для Постов ----------------------------------------
		else if(state==5)
		{	let str = 'Вы выбрали "'+button+'".\n';
			TempPost[chatId]=new Object();//создаем сразу временный объект для поста
			TempPost[chatId].dayOfWeek=button;//запоминаем выбранную кнопку
			TempPost[chatId].chatId=chatId;
			TempPost[chatId].userName=user;
			
			if((masDay.indexOf(button)+1) && button!='Ежедневно')//для дней недели
			{	str+="В этом режиме объявление будет выходить еженедельно в выбранный день, ";
				str+='вплоть до даты последней публикации.\n';
				str+='Теперь пришлите пожалуйста дату последней публикации в формате ';
				str+='"ДД.ММ.ГГГГ" без кавычек, обязательно с точками-разделителями. День и месяц должны состоять из ';
				str+='двух цифр, год - из четырех. Это день, когда объявление будет опубликовано в последний раз. ';
				await sendMessage(chatId, str, klava(keyboard['3']));//кнопка 'В Начало'
				WaitFlag[chatId]=2;//взводим флаг ожидания даты от юзера
			}
			else if(button=='Ежедневно')//для Ежедневно
			{	str+="В этом режиме объявление будет выходить каждый день, вплоть до даты последней публикации.\n";
				str+='Теперь пришлите пожалуйста дату последней публикации в формате ';
				str+='"ДД.ММ.ГГГГ" без кавычек, обязательно с точками-разделителями. День и месяц должны состоять из ';
				str+='двух цифр, год - из четырех. Это день, когда объявление будет опубликовано в последний раз. ';
				await sendMessage(chatId, str, klava(keyboard['3']));//кнопка 'В Начало'
				WaitFlag[chatId]=2;//взводим флаг ожидания даты от юзера
			}
			else if(button == 'Дата')//для Даты
			{	str+="Этот режим подходит для удаленных по времени событий и будет публиковаться по особому расписанию:\n";
				//str+='за 2 недели до события - 1 раз в неделю;\n';
				//str+='если ближе, то в 13,9,6,3,2,1,0-й день до события.\n';
				str+='если далеко до события - 1 раз в неделю;\n';
				str+='если ближе, то в ';
				for(let i in forDate) str+=forDate[i]+', '
				str+='день до события.\n';
				str+='Теперь пришлите пожалуйста дату наступления события в формате ';
				str+='"ДД.ММ.ГГГГ" без кавычек, обязательно с точками-разделителями. День и месяц должны состоять из ';
				str+='двух цифр, год - из четырех. Это день, когда объявление будет опубликовано в последний раз. ';
				await sendMessage(chatId, str, klava(keyboard['3']));//кнопка 'В Начало'
				WaitFlag[chatId]=2;//взводим флаг ожидания даты от юзера
			}
			else if(button == 'Однократно')//для Однократно
			{	str+="В этом режиме объявление будет опубликовано один раз.\n";
				str+='Теперь пришлите пожалуйста дату публикации в формате ';
				str+='"ДД.ММ.ГГГГ" без кавычек, обязательно с точками-разделителями. День и месяц должны состоять из ';
				str+='двух цифр, год - из четырех. Это день, когда объявление будет опубликовано единственный раз. ';
				await sendMessage(chatId, str, klava(keyboard['3']));//кнопка 'В Начало'
				WaitFlag[chatId]=2;//взводим флаг ожидания даты от юзера
			}
			else if(button == 'По дням недели')//для показа списка дней недели
			{	str = "Выберите необходимый день недели:";
				await sendMessage(chatId, str, klava(keyboard['9']));//кнопки дней для текста
			}
			else if(button == 'Завтра')//для Завтра
			{	TempPost[chatId].date = moment().add(1,'day').format('DD.MM.YYYY');//запоминаем дату на завтра
				str = 'Режим Завтра, на '+TempPost[chatId].date+'\n';
				str += 'Хотите ввести особое *ВРЕМЯ* публикации? Если нажмете *Нет*, то пост будет опубликован ';
				str += 'в стандартное время - '+timePablic+'Z'+moment().format('Z');
				await sendMessage(chatId, str, klava(keyboard['10']));//Да/Нет/В начало
			}
			else if(button == 'Сегодня')//для Сегодня
			{	TempPost[chatId].date = moment().add(0,'day').format('DD.MM.YYYY');//запоминаем дату на Сегодня
				str = 'Режим "Только Сегодня", на '+TempPost[chatId].date+'\n';
				str += 'Хотите ввести особое *ВРЕМЯ* публикации? Если нажмете *Нет*, то после модерации ';
				str += 'пост будет опубликован немедленно, если его прислали после '+timePablic+'Z'+moment().format('Z');
				await sendMessage(chatId, str, klava(keyboard['10']));//Да/Нет/В начало
			}
		}
		//------------ набор 'Да + Нет' при удалении поста--------
		else if(state==7 && numOfDelete[chatId]!='')
		{
			if(button=='Да')//удаляем текст
			{	let List = await readPostList();//читаем файлы постов
				let date = List[numOfDelete[chatId]].date;//временно сохраняем дату для Админов
				let mask = JSON.stringify(List[numOfDelete[chatId]]);
                //это текст
				if(Object.hasOwn(List[numOfDelete[chatId]], 'text'))
				{	await readTextList();//читаем файл TextList
					let keys = Object.keys(TextList);
					//ищем объект в TextList
					for(i in keys) 
					{	if(JSON.stringify(TextList[keys[i]]) === mask) 
						{	delete TextList[keys[i]]; 
							await sendMessage(chatId, 'Выбранный текст успешно удален!', klava(begin(chatId)));
							TextList = shiftObject(TextList);//упорядочиваем номера-ключи в массиве
							WriteFileJson(FileTextList,TextList);//сохраняем вычищенный список
							sendMessageToAdmin('Юзер "'+name+'" ('+user+') удалил Текст "'+date+'"');//Админам
							break;
						}
					}
				}
				//это файл
				if(Object.hasOwn(List[numOfDelete[chatId]], 'path'))
				{	await readImagesList();//читаем файл ImagesList
					let keys = Object.keys(ImagesList);
					//ищем объект в ImagesList
					for(i in keys) 
					{	if(JSON.stringify(ImagesList[keys[i]]) === mask) 
						{	try//удаляем сам файл
							{	fs.unlinkSync(ImagesList[keys[i]].path);
							} catch (e) {console.log(e);} 
							delete ImagesList[keys[i]];//удаляем запись в списке
							await sendMessage(chatId, 'Выбранный файл успешно удален!', klava(begin(chatId)));
							ImagesList = shiftObject(ImagesList);//упорядочиваем номера-ключи в массиве
							WriteFileJson(FileImagesList,ImagesList);//сохраняем вычищенный список
							sendMessageToAdmin('Юзер "'+name+'" ('+user+') удалил Файл "'+date+'"');//Админам	
							break;
						}
					}
				}
				//это альбом
				if(Object.hasOwn(List[numOfDelete[chatId]], 'media'))
				{	await readImagesList();//читаем файл ImagesList
					let keys = Object.keys(ImagesList);
					//ищем объект в ImagesList
					for(i in keys) 
					{	if(JSON.stringify(ImagesList[keys[i]]) === mask) 
						{	try//удаляем сам файл
							{	let mas = Object.keys(ImagesList[keys[i]].media);
								for(let j=0;j<mas.length;j++)
								{	if(fs.existsSync(ImagesList[keys[i]].media[j].media))
									{	fs.unlinkSync(ImagesList[keys[i]].media[j].media);
									}
								}
							} catch (e) {console.log(e);} 
							delete ImagesList[keys[i]];//удаляем запись в списке
							await sendMessage(chatId, 'Выбранный альбом успешно удален!', klava(begin(chatId)));
							ImagesList = shiftObject(ImagesList);//упорядочиваем номера-ключи в массиве
							WriteFileJson(FileImagesList,ImagesList);//сохраняем вычищенный список
							sendMessageToAdmin('Юзер "'+name+'" ('+user+') удалил Альбом "'+date+'"');//Админам	
							break;
						}
					}
				}
			}
			else
			{	await sendMessage(chatId, 'Вот и хорошо, торопиться не будем!', klava(begin(chatId)));
			}
			numOfDelete[chatId]='';
		}
		//------------ набор 'Да + Нет' при удалении файла--------
		else if(state==8 && numOfDelete[chatId]!='')
		{
			if(button=='Да')//удаляем файл
			{	await readImagesList();//читаем файл ImagesList
				try//удаляем сам файл или альбом
				{	if(!!ImagesList[numOfDelete[chatId]].path)
					{	fs.unlinkSync(ImagesList[numOfDelete[chatId]].path);
					}
					else if(!!ImagesList[numOfDelete[chatId]].media)
					{	for(let i=0; i<ImagesList[numOfDelete[chatId]].media.length; i++)
						{	fs.unlinkSync(ImagesList[numOfDelete[chatId]].media[i].media);
						}
					}
				} catch (e) {console.log(e);}
				let date = ImagesList[numOfDelete[chatId]].date;//временно сохраняем дату для Админов
                delete ImagesList[numOfDelete[chatId]];//удаляем запись в списке
				await sendMessage(chatId, 'Выбранный файл успешно удален!', klava(begin(chatId)));
				ImagesList = shiftObject(ImagesList);//упорядочиваем номера-ключи в массиве
				WriteFileJson(FileImagesList,ImagesList);//сохраняем вычищенный список
                sendMessageToAdmin('Юзер "'+name+'" ('+user+') удалил Файл "'+date+'"');//Админам				
			}
			else
			{	await sendMessage(chatId, 'Вот и хорошо, торопиться не будем!', klava(begin(chatId)));
			}
			numOfDelete[chatId]='';
		}
		//------------ набор 'Да/Нет/В начало для ввода времени' -------------------------
		else if(state==10)
		{	if(button=='Да')
			{	let str = 'Пришлите мне время в формате ЧЧ:ММ\n';
				WaitFlag[chatId]='Time';//взводим флаг ожидания Времени от юзера
				await sendMessage(chatId, str, klava(keyboard['3']));//кнопка 'В Начало'
			}
			else if(button=='Нет')
			{	let str = 'Теперь пришлите мне один пост (текст, картинка, видео, аудио, документ, альбом), который необходимо опубликовать. ';
				str += 'Его можно просто скопировать-вставить из любого чата, или загрузить из хранилища. ';
				str += 'Форматирование текста и подписи сохраняется.';
				WaitFlag[chatId]=1;//взводим флаг ожидания текста или файла от юзера
				await sendMessage(chatId, str, klava(keyboard['3']));
				//теперь будем ждать или текст, или файл
			}
		}
		//------------ набор 'Админ Бота' -------------------------
		else if(state==100)
		{	if(button=='Удалить Тексты')//которые на модерацию
			{	let str='';
				if(Object.keys(ModerTextList).length > 0)
				{
					await showModerTextList(chatId, 1);
					str = 'Теперь пришлите мне *номер* Текста, который нужно удалить.\n';
					WaitFlag[chatId]=10;//взводим флаг ожидания номера от юзера
				}
                else str = '*Упс... А список то пустой!*\n';
                await sendMessage(chatId, str, klava(keyboard['102']));//Назад		
			}
			else if(button=='Публиковать Тексты')
			{	if(Object.keys(ModerTextList).length > 0)
				{
					await showModerTextList(chatId, 0);
					let str = 'Публикуем эти тексты?';
					await sendMessage(chatId, str, klava(keyboard['104']));//Да-Нет
				}
				else 
				{	let str = '*Упс... А список то пустой!*\n';
					await sendMessage(chatId, str, klava(keyboard['102']));//Назад
				}		
			}
			else if(button=='Удалить Файлы')
			{	let str='';
				if(Object.keys(ModerImagesList).length > 0)
				{
					await showModerImagesList(chatId, 1);
					str = 'Теперь пришлите мне *номер* Файла, который нужно удалить.\n';
					WaitFlag[chatId]=11;//взводим флаг ожидания номера от юзера
				}
				else str = '*Упс... А список то пустой!*\n';
				//ждем выполнения очереди
				try{await queue.waitForQueueEmpty(30000);}catch(err){console.log(err);}
				await sendMessage(chatId, str, klava(keyboard['102']));//Назад	
			}
			else if(button=='Публиковать Файлы')
			{	if(Object.keys(ModerImagesList).length > 0)
				{
					await showModerImagesList(chatId, 0);
					let str = 'Публикуем эти файлы?';
					//ждем выполнения очереди
					try{await queue.waitForQueueEmpty(30000);}catch(err){console.log(err);}
					await sendMessage(chatId, str, klava(keyboard['105']));//Да-Нет
				}
				else
				{	let str = '*Упс... А список то пустой!*\n';
					await sendMessage(chatId, str, klava(keyboard['102']));//Назад
				}		
			}
		}
		//------------ набор 'Да + Нет' при удалении текста на модерацию--------
		else if(state==101 && numOfDelete[chatId]!='')
		{
			if(button=='Да')//удаляем текст
			{	if(WaitFlag[chatId] && WaitFlag[chatId]==21) return;
				WaitFlag[chatId] = 21;//взводим признак ожидания текста причины
				await sendMessage(chatId, 'Пожалуйста, опишите причину удаления. Я сообщу ее отправителю поста.');				
			}
			else
			{	await sendMessage(chatId, 'Вот и хорошо, торопиться не будем!', klava(get_keyb100()));
				clearTempWait(chatId);
			}
		}
		//------------ Назад ----------------------------------------
		else if(state==102)
		{	clearTempWait(chatId);
            await sendMessage(chatId, 'Вот и хорошо, торопиться не будем!', klava(begin(chatId)));
		}
		//------------ набор 'Да + Нет' при удалении файла на модерацию--------
		else if(state==103 && numOfDelete[chatId]!='')
		{
			if(button=='Да')//удаляем файл
			{	if(WaitFlag[chatId] && WaitFlag[chatId]==22) return;
				WaitFlag[chatId] = 22;//взводим признак ожидания текста причины
				await sendMessage(chatId, 'Пожалуйста, опишите причину удаления. Я сообщу ее отправителю поста.');
			}
			else
			{	await sendMessage(chatId, 'Вот и хорошо, торопиться не будем!', klava(get_keyb100()));
				clearTempWait(chatId);//удаляем из листа ожиданий
			}
		}
		//------------ набор 'Да + Нет' при публикации текста--------
		else if(state==104)
		{
			if(button=='Да')
			{	readModerTextList();//читаем файл текстов в ModerTextList
				//отправляем координатору вотсап, если он есть
				let ss = await sendTextToWhatsup(ModerTextList);
				if(ss != 'OK') console.log(ss);
				//переносим тексты
				const keys = Object.keys(ModerTextList);
				for(let key of keys)
				{	await setToTextList(ModerTextList[key]);//сохраняем в списке текстов
					//публикуем текст прямо сейчас, если дата или день недели совпадает
					let offset = Object.keys(chat_news)>0 ? Object.keys(chat_news) :[];
					for(let i=0;i<offset.length;i++) await publicText(ModerTextList[key], offset[i]);
					//сообщаем отправителю
					if(Object.hasOwn(ModerTextList[key], 'chatId'))
					{let opt=new Object();
					 opt.entities = ModerTextList[key].entities;
					 if(Object.hasOwn(ModerTextList[key], 'link_preview_options'))
					 {opt.link_preview_options=ModerTextList[key].link_preview_options;
					  if(Object.hasOwn(ModerTextList[key].link_preview_options, 'is_disabled')) opt.disable_web_page_preview = true;
					 }
					 await sendMessage(ModerTextList[key].chatId, ModerTextList[key].text, opt);
					 await sendMessage(ModerTextList[key].chatId, '👍🏻 Ура! Этот текст прошел модерацию и будет опубликован!!');
					}
					delete ModerTextList[key];//теперь удалим эту запись из списка
				}
				WriteFileJson(FileModerTextList,ModerTextList);//сохраняем вычищенный список
				if(Object.keys(ModerTextList).length===0) await sendMessage(chatId, 'Сделано, шеф!', klava(get_keyb100()));
				else await sendMessage(chatId, 'Не всё получилось, шеф :(\nЕсть ошибки...', klava(get_keyb100()));
			}
			else
			{	await sendMessage(chatId, 'Вот и хорошо, торопиться не будем!', klava(get_keyb100()));
			}
		}
		//------------ набор 'Да + Нет' при публикации файлов--------
		else if(state==105)
		{
			if(button=='Да')
			{	readModerImagesList();//читаем файл ModerImagesList
				//отправляем координатору вотсап, если он есть
				let ss = await sendImageToWhatsup(ModerImagesList);
				if(ss != 'OK') console.log(ss);
				//переносим файлы
				let keys = Object.keys(ModerImagesList);
				for(let key of keys)
				{ try
				  {	//сообщаем отправителю
					if(Object.hasOwn(ModerImagesList[key], 'chatId'))
					{let opt=new Object();
					 opt.caption = ModerImagesList[key].caption;
					 if(Object.hasOwn(ModerImagesList[key], 'caption_entities')) opt.caption_entities = ModerImagesList[key].caption_entities;
					 if(Object.hasOwn(ModerImagesList[key], 'type'))
					 {if(ModerImagesList[key].type == 'image') {await sendPhoto(LoaderBot, ModerImagesList[key].chatId, ModerImagesList[key].path, opt);}
					  else if(ModerImagesList[key].type == 'video') {await sendVideo(LoaderBot, ModerImagesList[key].chatId, ModerImagesList[key].path, opt);}
					  else if(ModerImagesList[key].type == 'audio') {await sendAudio(LoaderBot, ModerImagesList[key].chatId, ModerImagesList[key].path, opt);}
					  else if(ModerImagesList[key].type == 'document') {await sendDocument(LoaderBot, ModerImagesList[key].chatId, ModerImagesList[key].path, opt);}
					  else if(ModerImagesList[key].type == 'album') {await sendAlbum(LoaderBot, ModerImagesList[key].chatId, ModerImagesList[key].media);}
					 }
					 else await sendPhoto(LoaderBot, ModerImagesList[key].chatId, ModerImagesList[key].path, opt);
					 //ждем выполнения очереди
					 try{await queue.waitForQueueEmpty(30000);}catch(err){console.log(err);}
					 await sendMessage(ModerImagesList[key].chatId, '👍🏻 Ура! Этот файл прошел модерацию и будет опубликован!!');
					}
					if(!!ModerImagesList[key].path)//одиночный файл
					{	let path = ModerImagesList[key].path;
						let mas = path.split('/');
						let fileName = mas[mas.length-1];//вытащим имя файла
						let newpath = PathToImages+'/'+fileName;//новый путь файла для модерации
						//переносим файл и записываем в список файлов
						let len = await setToImagesList(newpath, ModerImagesList[key]);//получаем последний индекс
						//публикуем файл сразу первый раз, если по Дате, или день недели совпадает
						let offset = Object.keys(chat_news)>0 ? Object.keys(chat_news) :[];
						for(let i=0;i<offset.length;i++) await publicImage(ImagesList[len], offset[i]);
					}
					if(!!ModerImagesList[key].media)//альбом
					{	//переносим альбом и записываем в список файлов
						let len = await setToImagesList(null, ModerImagesList[key]);//получаем последний индекс
						//публикуем альбом сразу первый раз, если по Дате, или день недели совпадает
						let offset = Object.keys(chat_news)>0 ? Object.keys(chat_news) :[];
						for(let i=0;i<offset.length;i++) await publicImage(ImagesList[len], offset[i]);
					}
					delete ModerImagesList[key];//теперь удалим эту запись из списка
					
				  } catch (e) 
				  {	let str = 'Ошибка: пост='+key;
					if(!!ModerImagesList[key].type) str += ', тип='+ModerImagesList[key].type;
					if(!!ModerImagesList[key].date) str += ', дата='+ModerImagesList[key].date;
					sendMessage(chatId, str);
					WriteLogFile(e+'\nfrom state=105'+'\n'+str,'вчат');
				  }
				}
				WriteFileJson(FileModerImagesList,ModerImagesList);//сохраняем оставшийся список
				if(Object.keys(ModerImagesList).length===0) await sendMessage(chatId, 'Сделано, шеф!', klava(get_keyb100()));
				else await sendMessage(chatId, 'Не всё получилось, шеф :(\nЕсть ошибки...', klava(get_keyb100()));
			}
			else
			{	await sendMessage(chatId, 'Вот и хорошо, торопиться не будем!', klava(get_keyb100()));
			}
		}
	}
}catch(err){WriteLogFile(err+'\nfrom LoaderBot.on(callback_query)\n'+JSON.stringify(msg,null,2),'вчат');}
});
//====================================================================
// Показать список команд
LoaderBot.onText(/\/help/, async (msg) => 
{
try{
	const chatId = msg.chat.id;
	let valid = validAdmin(chatId) | validAdminBot(chatId);
	if(valid) 
	{	let str = 'Команды бота:\n';
		str += '` /help` - список команд бота\n';
		str += '` /UserList` - список авторизованных юзеров\n';
		//str += '` /BlackList` - список забаненных юзеров\n';
		str += '` /AdminList` - посмотреть настройки\n';
		str += '` /ShowTextList` - посмотреть тексты\n';
		str += '` /ShowImagesList` - посмотреть картинки\n';
		str += '` /ShowLifeTime` - посмотреть общий срок действия регистрации юзеров\n';
		str += '` /AddUser chatID=Имя=НазваниеГруппы` - добавить Юзера\n';
		str += '` /AddAdmin chatID=Имя` - добавить Админа Бота\n';
		str += '` /AddWhatsApp chatID=Имя` - добавить Координатора Вотсап\n';
		//str += '` /AddBan chatID=Имя` - добавить в Черный список\n';
		//str += '` /DeleteFiles` - удаление старых картинок\n';
		str += '` /DelAdmin chatID` - удалить Админа Бота\n';
		str += '` /DelWhatsApp` - удалить Координатора Вотсап\n';
		str += '` /DelUser chatID` - удалить Юзера\n';
		str += '` /EditUrl новыйUrl` - изменить ссылку в Вопросах\n';
		str += '` /EditLifeTime новыйСрок` - изменить срок действия регистрации юзеров, в днях\n';
		//str += '` /DelBan chatID` - удалить из Черного списка\n';
		sendMessage(chatId, str, {parse_mode:"markdown"});
	}
	else sendMessage(chatId, smilik);
}catch(err){WriteLogFile(err+'\nfrom LoaderBot.on(/help/)','вчат');}
});
//====================================================================
// Показать UserList
LoaderBot.onText(/\/UserList/, async (msg) => 
{
try{
	const chatId = msg.chat.id;
	let valid = validAdmin(chatId) | validAdminBot(chatId);
	if(valid) 
	{	try {UserList = JSON.parse(fs.readFileSync(FileUserList));} catch(err){console.log(err);}
		let str = 'Список авторизованных пользователей:\n';
		let keys = Object.keys(UserList);
        for(let i in keys) 
		{str += keys[i]+' : '+UserList[keys[i]][0]+' ('+UserList[keys[i]][1]+') ';
		 if(!!keys[i][2]) str += UserList[keys[i]][2];
		 str += '\n';
		}
		sendMessage(chatId, str);
	}
	else sendMessage(chatId, smilik);
}catch(err){WriteLogFile(err+'\nfrom LoaderBot.on(/UserList/)','вчат');}
});
//====================================================================
// Показать BlackList
LoaderBot.onText(/\/BlackList/, async (msg) => 
{
try{
	const chatId = msg.chat.id;
	let valid = validAdmin(chatId) | validAdminBot(chatId);
	if(valid) 
	{	let str = 'Список забаненных пользователей:\n';
		let keys = Object.keys(BlackList);
        for(let i in keys) str += keys[i]+': '+BlackList[keys[i]]+'\n';
		sendMessage(chatId, str);
	}
	else sendMessage(chatId, smilik);
}catch(err){WriteLogFile(err+'\nfrom LoaderBot.on(/BlackList/)','вчат');}
});
//====================================================================
// Показать AdminList
LoaderBot.onText(/\/AdminList/, async (msg) => 
{
try{
	const chatId = msg.chat.id;
	let valid = validAdmin(chatId) | validAdminBot(chatId);
	if(valid)
    {   let str = '';
        str += 'Координатор *WhatsApp:* '+AdminList.coordinatorWhatsApp+' : '+AdminList.coordinatorName+'\n';
        str += 'Список админов бота:\n'
        try {AdminBot = JSON.parse(fs.readFileSync(FileAdminBot));} catch (err) {console.log(err);}
		let keys = Object.keys(AdminBot);
        for(let i in keys) str += keys[i]+': '+AdminBot[keys[i]]+'\n';
        sendMessage(chatId, str, {parse_mode:"markdown"});
    }
	else sendMessage(chatId, smilik);
}catch(err){WriteLogFile(err+'\nfrom LoaderBot.on(/AdminList/)','вчат');}
});
//====================================================================
// Добавить Админа Бота
LoaderBot.onText(/\/AddAdmin/, async (msg) => 
{
try{
	const chatId = msg.chat.id;
	//let valid = validAdmin(chatId);//только для СуперАдминов
	let valid = validAdmin(chatId) | validAdminBot(chatId);
	if(valid)
    {   let match = msg.text.match(/\/AddAdmin (.+$)/);
		if(match===null) return;
		if(!match[0] || match.length<2) return;
		let str = match[1];
		match = [];
		match = str.split('=');
		if(match.length<1) return;
		if(!isValidChatId(match[0])) 
		{await sendMessage(chatId, match[0]+' не есть chatId', {parse_mode:"markdown"}); 
		 return;
		}
		try {AdminBot = JSON.parse(fs.readFileSync(FileAdminBot));} catch (err) {console.log(err);}
		const id = match[0];//chatId
		const name = match[1];//имя
		AdminBot[id] = name;//добавляем новичка
		WriteFileJson(FileAdminBot,AdminBot);//записываем файл

		str = 'Новый список Админов Бота:\n'
        try {AdminBot = JSON.parse(fs.readFileSync(FileAdminBot));} catch (err) {console.log(err);}
		let keys = Object.keys(AdminBot);
        for(let i in keys) str += keys[i]+' : '+AdminBot[keys[i]]+'\n';
        sendMessage(chatId, str, {parse_mode:"markdown"});
    }
	else sendMessage(chatId, smilik);
}catch(err){WriteLogFile(err+'\nfrom LoaderBot.on(/AddAdmin/)','вчат');}
});
//====================================================================
// Добавить Координатора Вотсап
LoaderBot.onText(/\/AddWhatsApp/, async (msg) => 
{
try{
	const chatId = msg.chat.id;
	let valid = validAdmin(chatId) | validAdminBot(chatId);
	if(valid)
    {   
		let match = msg.text.match(/\/AddWhatsApp (.+$)/);
		if(match===null) return;
		if(match.length<2) return;
		let str = match[1];
		match = [];
		match = str.split('=');
		if(match.length<1) return;
		if(!isValidChatId(match[0])) 
		{await sendMessage(chatId, match[0]+' не есть chatId', {parse_mode:"markdown"}); 
		 return;
		}
		try {AdminList = JSON.parse(fs.readFileSync(FileAdminList));} catch (err) {console.log(err);}
		const id = match[0];//chatId
		const name = match[1];//имя
		AdminList.coordinatorWhatsApp = id;//добавляем новичка
		AdminList.coordinatorName = name;//добавляем новичка
		WriteFileJson(FileAdminList,AdminList);//записываем файл

		str = 'Новый Координатор Вотсап:\n'
        str += id+' : '+name+'\n';
        sendMessage(chatId, str, {parse_mode:"markdown"});
		chat_coordinatorWhatsApp = AdminList.coordinatorWhatsApp;
    }
	else sendMessage(chatId, smilik);
}catch(err){WriteLogFile(err+'\nfrom LoaderBot.on(/AddWhatsApp/)','вчат');}
});
//====================================================================
// Добавить Юзера
LoaderBot.onText(/\/AddUser/, async (msg) => 
{
try{
	const chatId = msg.chat.id;
	const username = '@'+msg.chat.username;
	let valid = validAdmin(chatId) | validAdminBot(chatId);
	if(valid)
    {   
		let match = msg.text.match(/\/AddUser (.+$)/);
		if(match===null) return;
		if(match.length<2) return;
		let str = match[1];
		match = [];
		match = str.split('=');
		if(match.length<3) return;
		if(!isValidChatId(match[0])) 
		{await sendMessage(chatId, match[0]+' не есть chatId', {parse_mode:"markdown"}); 
		 return;
		}
		try {UserList = JSON.parse(fs.readFileSync(FileUserList));} catch (err) {console.log(err);}
		const id = match[0];//chatId
		const name = match[1];//имя
		let group = match[2];//группа
		group = group.replace(/"/g, '');
		group = group.replace(/'/g, '');
		let mas = [];
		mas.push(name+", гр.<"+group+">");//добавляем новичка
		mas.push(moment().format('DD.MM.YYYY'));//дата регистрации в [1]
		mas.push('add by '+username);//username в [2]
		UserList[id] = mas;//добавляем новичка
		WriteFileJson(FileUserList,UserList);//записываем файл

		str = 'Новый Пользователь бота:\n'
        str += UserList[id][0]+'('+UserList[id][1]+') '+UserList[id][2];
        sendMessage(chatId, str);
    }
	else sendMessage(chatId, smilik);
}catch(err){WriteLogFile(err+'\nfrom LoaderBot.on(/AddUser/)','вчат');}
});
//====================================================================
// Добавить в Черный список
LoaderBot.onText(/\/AddBan/, async (msg) => 
{
try{
	const chatId = msg.chat.id;
	let valid = validAdmin(chatId) | validAdminBot(chatId);
	if(valid)
    {   
		let match = msg.text.match(/\/AddBan (.+$)/);
		if(match===null) return;
		if(match.length<2) return;
		let str = match[1];
		match = [];
		match = str.split('=');
		if(match.length<2) return;
		if(!isValidChatId(match[0])) 
		{await sendMessage(chatId, match[0]+' не есть chatId', {parse_mode:"markdown"}); 
		 return;
		}
		try {BlackList = JSON.parse(fs.readFileSync(FileBlackList));} catch (err) {console.log(err);}
		const id = match[0];//chatId
		const name = match[1];//имя
		BlackList[id] = name;//добавляем в бан
		WriteFileJson(FileBlackList,BlackList);//записываем файл

		str = 'Забаненный Пользователь:\n'
        str += id+' : '+name+'\n';
        sendMessage(chatId, str);
    }
	else sendMessage(chatId, smilik);
}catch(err){WriteLogFile(err+'\nfrom LoaderBot.on(/AddBun/)','вчат');}
});
//====================================================================
// Показать ImagesList
LoaderBot.onText(/\/ImagesList/, async (msg) => 
{
try{
	const chatId = msg.chat.id;
	let valid = validAdmin(chatId) | validAdminBot(chatId);
	await readImagesList();//читаем список из файла
    if(valid) sendMessage(chatId, 'Список файлов:\r\n'+JSON.stringify(ImagesList,null,2));
	else sendMessage(chatId, smilik);
}catch(err){WriteLogFile(err+'\nfrom LoaderBot.on(/ImagesList/)','вчат');}	
});
//====================================================================
// Показать файлы из ImagesList
LoaderBot.onText(/\/ShowImagesList/, async (msg) => 
{
try{
	const chatId = msg.chat.id;
	let valid = validAdmin(chatId) | validAdminBot(chatId);
	await readImagesList();//читаем список из файла
    if(valid) {showImagesList(chatId, 0);}
	else sendMessage(chatId, smilik);
}catch(err){WriteLogFile(err+'\nfrom LoaderBot.on(/ShowUserList/)','вчат');}	
});
//====================================================================
// Показать срок действия регистрации юзеров lifeTime
LoaderBot.onText(/\/ShowLifeTime/, async (msg) => 
{
try{
	const chatId = msg.chat.id;
	let valid = validAdmin(chatId) | validAdminBot(chatId);
    if(valid) {sendMessage(chatId, 'Текущий срок действия регистрации юзеров:\n'+lifeTime+' дн.');}
	else sendMessage(chatId, smilik);
}catch(err){WriteLogFile(err+'\nfrom LoaderBot.on(/ShowLifeTime/)','вчат');}	
});
//====================================================================
// Показать TextList
LoaderBot.onText(/\/TextList/, async (msg) => 
{
try{
	const chatId = msg.chat.id;
	let valid = validAdmin(chatId) | validAdminBot(chatId);
	await readTextList();//читаем файл текстов в TextList
	if(valid) sendMessage(chatId, 'Список текстов:\r\n'+JSON.stringify(TextList,null,2));
	else sendMessage(chatId, smilik);
}catch(err){WriteLogFile(err+'\nfrom LoaderBot.on(/TextList/)','вчат');}	
});
//====================================================================
// Показать сообщения TextList
LoaderBot.onText(/\/ShowTextList/, async (msg) => 
{
try{
	const chatId = msg.chat.id;
	let valid = validAdmin(chatId) | validAdminBot(chatId);
	await readTextList();//читаем файл текстов в TextList
	if(valid) showTextList(chatId, 0); 
	else sendMessage(chatId, smilik);
}catch(err){WriteLogFile(err+'\nfrom LoaderBot.on(/ShowTextList/)','вчат');}	
});
//====================================================================
// Удаление Админа Бота
LoaderBot.onText(/\/DelAdmin/, async (msg) => 
{	
try{
	const chatId = msg.chat.id;
	//let valid = validAdmin(chatId);//только для СуперАдминов
	let valid = validAdmin(chatId) | validAdminBot(chatId);
	if(valid)
	{	let match = msg.text.match(/\/DelAdmin (.+$)/);
		if(match.length<2) return;
		let id = match[1];
		let str='';
		try {AdminBot = JSON.parse(fs.readFileSync(FileAdminBot));} catch (err) {console.log(err);}//читаем файл
		if(Object.keys(AdminBot).indexOf(id)+1)//если такой Админ есть в списке
		{	delete AdminBot[id];
			WriteFileJson(FileAdminBot,AdminBot);//записываем файл
			str='Новый список Админов Бота:\n';
			//try {AdminBot = JSON.parse(fs.readFileSync(FileAdminBot));} catch (err) {console.log(err);}
			let keys = Object.keys(AdminBot);
			for(let i in keys) str += keys[i]+' : '+AdminBot[keys[i]]+'\n';
		}
		else str = 'Такого Админа в списке нет!';
		sendMessage(chatId, str, {parse_mode:"markdown"});
	}
	else sendMessage(chatId, smilik);
}catch(err){WriteLogFile(err+'\nfrom LoaderBot.on(/DelAdmin/)','вчат');}	
});
//====================================================================
// Удаление Координатора Вотсап
LoaderBot.onText(/\/DelWhatsApp/, async (msg) => 
{	
try{
	const chatId = msg.chat.id;
	let valid = validAdmin(chatId) | validAdminBot(chatId);
	if(valid)
	{	let str='';
		try {AdminList = JSON.parse(fs.readFileSync(FileAdminList));} catch (err) {console.log(err);}//читаем файл
		AdminList.coordinatorWhatsApp = '';
		AdminList.coordinatorName = '';
		WriteFileJson(FileAdminList,AdminList);//записываем файл
		str='Координатор Вотсап удален!';
		sendMessage(chatId, str, {parse_mode:"markdown"});
		chat_coordinatorWhatsApp = 0;
	}
	else sendMessage(chatId, smilik);
}catch(err){WriteLogFile(err+'\nfrom LoaderBot.on(/DelWhatsApp/)','вчат');}	
});
//====================================================================
// Удаление Юзера
LoaderBot.onText(/\/DelUser/, async (msg) => 
{	
try{
	const chatId = msg.chat.id;
	let valid = validAdmin(chatId) | validAdminBot(chatId);
	if(valid)
	{	let match = msg.text.match(/\/DelUser (.+$)/);
		if(match.length<2) return;
		let id = match[1];
		let str='';
		try {UserList = JSON.parse(fs.readFileSync(FileUserList));} catch (err) {console.log(err);}//читаем файл
		if(Object.keys(UserList).indexOf(id)+1)//если такой Юзер есть в списке
		{	let user = UserList[id];//запоминаем на время
			delete UserList[id];
			WriteFileJson(FileUserList,UserList);//записываем файл
			str='Юзер '+user[0]+' удален!';
			sendMessage(chatId, str);
		}
		else str = 'Такого Юзера в списке нет!';
		sendMessage(chatId, str, {parse_mode:"markdown"});
	}
	else sendMessage(chatId, smilik);
}catch(err){WriteLogFile(err+'\nfrom LoaderBot.on(/DelUser/)','вчат');}	
});
//====================================================================
// Удаление из Черного списка
LoaderBot.onText(/\/DelBan/, async (msg) => 
{	
try{
	const chatId = msg.chat.id;
	let valid = validAdmin(chatId) | validAdminBot(chatId);
	if(valid)
	{	let match = msg.text.match(/\/DelBan (.+$)/);
		if(match.length<2) return;
		let id = match[1];
		let str='';
		try {BlackList = JSON.parse(fs.readFileSync(FileBlackList));} catch (err) {console.log(err);}//читаем файл
		if(Object.keys(BlackList).indexOf(id)+1)//если такой Юзер есть в списке
		{	let user = BlackList[id];//запоминаем на время
			delete BlackList[id];
			WriteFileJson(FileBlackList,BlackList);//записываем файл
			str='Бан '+user+' удален из Черного списка!';
			sendMessage(chatId, str);
		}
		else str = 'Такого Бана в списке нет!';
		sendMessage(chatId, str, {parse_mode:"markdown"});
	}
	else sendMessage(chatId, smilik);
}catch(err){WriteLogFile(err+'\nfrom LoaderBot.on(/DelBan/)','вчат');}	
});
//====================================================================
// Очистка папки картинок от старых файлов
/*LoaderBot.onText(/\/DeleteFiles/, async (msg) => 
{
try{
	const chatId = msg.chat.id;
	const name = ' '+msg.chat.first_name;
	const user = '@'+msg.chat.username;
	let ban = banUser(chatId);
	let valid = validAdmin(chatId) | validAdminBot(chatId);
	
	//проверяем только незарегистрированного юзера
	if(ban) sendMessage(chatId, 'Извините, ' + name + ', но Вы забанены! Обратитесь к админу.');
	else if(!valid)
	{	sendMessage(chatId, 'Извините, ' + name + ', но Вы не являетесь админом бота!');	
	}
	else //если все ОК
	{   forDeleteList=[];//чистим список удаляемых файлов
		const isFile = fileName => {return fs.lstatSync(fileName).isFile()};
        //загружаем список файлов из Images - полный путь
        let FilesList = fs.readdirSync(PathToImages).map(fileName => {return path.join(PathToImages, fileName)}).filter(isFile);
        //сравниваем с файлами из рабочего списка и удаляем ненужные
        await readImagesList();//читаем список из файла
        let key=[];
		for(let i in ImagesList) key.push(ImagesList[i].path);//собираем массив рабочих путей из списка
        for(let i in FilesList)
        {	if(key.indexOf(FilesList[i])==-1)//если в папке есть файл, которого нет в рабочем списке
            {forDeleteList.push(FilesList[i]);}//собираем файлы для удаления
        }
		
        if(forDeleteList.length > 0)//если старые файлы найдены
        {sendMessage(chatId, 'Найдены старые файлы:\n'+JSON.stringify(forDeleteList,null,2)+'\n\nУдалять?', klava(keyboard['4']));
        }
		else sendMessage(chatId, 'Нет старых файлов для удаления!');
		
	}
}catch(err){WriteLogFile(err+'\nfrom LoaderBot.on(/DeleteFiles/)','вчат');}	
});*/
//====================================================================
// Изменить ссылку в кнопке Вопросы
LoaderBot.onText(/\/EditUrl/, async (msg) => 
{
try{
	const chatId = msg.chat.id;
	const name = ' '+msg.chat.first_name;
	let ban = banUser(chatId);
	let valid = validAdmin(chatId) | validAdminBot(chatId);
	
	//проверяем только незарегистрированного юзера
	if(ban) sendMessage(chatId, 'Извините, ' + name + ', но Вы забанены! Обратитесь к админу.');
	else if(!valid)
	{	sendMessage(chatId, 'Извините, ' + name + ', но Вы не являетесь админом бота!');	
	}
	else //если все ОК
	{	let match = msg.text.match(/\/EditUrl (.+$)/);
		if(match.length<2) return;
		let url = match[1];
		if(url.indexOf('https://t.me/')<0) return;
		if(!!keyboard['1'][1][0].url) keyboard['1'][1][0].url = url;
		if(!!keyboard['adm1'][2][0].url) keyboard['adm1'][2][0].url = url;
		WriteFileJson(currentDir+"/Url.txt", url);
		let str='Новый URl '+url+' принят!';
		sendMessage(chatId, str);
		if(!!config && !!config.url)//удаляем от сюда, щас по другому
		{	delete config.url;
			WriteFileJson(currentDir+"/config.json", config);
		}
	}
}catch(err){WriteLogFile(err+'\nfrom LoaderBot.on(/EditUrl/)','вчат');}	
});
//====================================================================
// Изменить срок действия допуска юзеров
LoaderBot.onText(/\/EditLifeTime/, async (msg) => 
{
try{
	const chatId = msg.chat.id;
	const name = ' '+msg.chat.first_name;
	let ban = banUser(chatId);
	let valid = validAdmin(chatId) | validAdminBot(chatId);
	
	//проверяем только незарегистрированного юзера
	if(ban) sendMessage(chatId, 'Извините, ' + name + ', но Вы забанены! Обратитесь к админу.');
	else if(!valid)
	{	sendMessage(chatId, 'Извините, ' + name + ', но Вы не являетесь админом бота!');	
	}
	else //если все ОК
	{	let match = msg.text.match(/\/EditLifeTime (.+$)/);
		if(match.length<2) return;
		let url = Number(match[1]);
		if(typeof(url) !== 'number') return;
		lifeTime = url;
		config.lifeTime = lifeTime;
		WriteFileJson(currentDir+"/config.json", config);
		let str='Новый срок '+url+' принят!';
		sendMessage(chatId, str);
	}
}catch(err){WriteLogFile(err+'\nfrom LoaderBot.on(/EditLifeTime/)','вчат');}	
});
//====================================================================
// СМЕНА ПАРОЛЯ
/*LoaderBot.onText(/\/changepassword (.+)/, async (msg, match) => 
{
	const chatId = msg.chat.id;
	const name = ' '+msg.chat.first_name;
	const user = '@'+msg.chat.username;
	let pass = match[1]; 
	pass = pass.trim();
	let ban = banUser(chatId);
	let valid = validAdmin(chatId);
	
	//проверяем только незарегистрированного юзера
	if(ban) sendMessage(chatId, 'Извините, ' + name + ', но Вы забанены! Обратитесь к админу.');
	else if(!valid)
	{	sendMessage(chatId, 'Извините, ' + name + ', но у Вас нет прав на эту операцию!');	
	}
	else //если все ОК
	{
		if(pass != '' && pass != undefined)
		{
			AdminList['password'] = pass;
			WriteFileJson(FileAdminList,AdminList);
			password = AdminList['password'];
			sendMessage(chatId, 'Пароль успешно изменен!', klava(keyboard['1']));
            //если пароль изменен, то надо убить список авторизованных
            UserList=new Object();//чистим массив
            WriteFileJson(FileUserList,UserList);//сохраняем пустой список
		}
		else sendMessage(chatId, 'Пароль не может быть пустым!', klava(begin(chatId)));
	}
});*/
//====================================================================
// периодически будем проверять список файлов и текстов на просрочку и удалять
// старые записи
let timer = setInterval(async function()
{		
try{
	let flag = 0;
	let beg = moment().startOf('day');//начало суток
	let now = moment();//текущее время
	let diff = now.diff(beg, 'hours');//разница в часах
	if(diff >= 4) return;//только от 0 до 4 часов утра
	
	//---------------------------------------------
	now = moment().startOf('day');
	//список файлов
	flag =0;
	await readImagesList();//читаем список из файла
    let keys = Object.keys(ImagesList);
	for(let key of keys)
	{	let time = moment(ImagesList[key].date,'DD.MM.YYYY');
		if(!isNaN(time))//только по дате
		{let days = time.diff(now, 'days')+1;
		 if(days<=-1 || !time)//если позавчерашняя и далее 
		 {try{
			 if(!!ImagesList[key].path) fs.unlinkSync(ImagesList[key].path);//удаляем файл из папки
			 if(!!ImagesList[key].media)
			 {	for(let i=0;i<ImagesList[key].media.length;i++) fs.unlinkSync(ImagesList[key].media[i].media);
			 }
			} catch(err){}
		  delete ImagesList[key];//удаляем запись, если просрочена
		  flag = 1;
		 }
		}
		else if(ImagesList[key].date==='')//удаляем запись, как битую
		{try{if(!!ImagesList[key].path) fs.unlinkSync(ImagesList[key].path);//удаляем файл из папки
			 if(!!ImagesList[key].media)
			 {	for(let i=0;i<ImagesList[key].media.length;i++) fs.unlinkSync(ImagesList[key].media[i].media);
			 }
			} catch(err){}//удаляем файл из папки
		 delete ImagesList[key];//удаляем запись 
		 flag = 1;
		}
	}
	if(flag) WriteFileJson(FileImagesList,ImagesList);//сохраняем вычищенный список
	//---------------------------------------------
	//Удаляем старые файлы, потерянные
	const isFile = fileName => {return fs.lstatSync(fileName).isFile()};
    //загружаем список файлов из Images - полный путь
    let FilesList = fs.readdirSync(PathToImages).map(fileName => {return path.join(PathToImages, fileName)}).filter(isFile);
    //сравниваем с файлами из рабочего списка и удаляем ненужные
    let key=[];
	for(let i in ImagesList) //собираем массив рабочих путей из списка
	{	if(!!ImagesList[i].path) key.push(ImagesList[i].path);
		if(!!ImagesList[i].media)
		{	for(let j=0;j<ImagesList[i].media.length;j++) key.push(ImagesList[i].media[j].media);
		}
	}
    for(let i in FilesList)
    {	//если в папке есть файл, которого нет в рабочем списке
		if(key.indexOf(FilesList[i])==-1)
        {	fs.unlinkSync(FilesList[i]);
		}
    }
	
	//загружаем список файлов из ModerImages - полный путь
    FilesList = fs.readdirSync(PathToImagesModer).map(fileName => {return path.join(PathToImagesModer, fileName)}).filter(isFile);
    //сравниваем с файлами из рабочего списка и удаляем ненужные
    key=[];
	for(let i in ModerImagesList) //собираем массив рабочих путей из списка
	{	if(!!ModerImagesList[i].path) key.push(ModerImagesList[i].path);
		if(!!ModerImagesList[i].media)
		{	for(let j=0;j<ModerImagesList[i].media.length;j++) key.push(ModerImagesList[i].media[j].media);
		}
	}
    for(let i in FilesList)
    {	//если в папке есть файл, которого нет в рабочем списке
		if(key.indexOf(FilesList[i])==-1)
        {	fs.unlinkSync(FilesList[i]);
		}
    }
	//---------------------------------------------
	//список текстов
	await readTextList();//читаем файл текстов в TextList
	keys = Object.keys(TextList);
	for(let key of keys)
	{	let time = moment(TextList[key].date,'DD.MM.YYYY');
		if(!isNaN(time))//только по дате
		{let days = time.diff(now, 'days')+1;//если позавчерашняя и далее 
		 if(days<=-1)//если вчерашняя и далее
		 {delete TextList[key];//удаляем запись, если просрочена
		  flag = 1;
		 }
		}
		else if(TextList[key].date==='') 
		{delete TextList[key]; flag = 1;//удаляем запись, как битую
		}
	}
	if(flag) WriteFileJson(FileTextList,TextList);//сохраняем вычищенный список
	
	//---------------------------------------------
	//заодно тут же сохраняем файл LastMessId
	fs.writeFile(currentDir+'/LastMessId.txt', JSON.stringify(LastMessId,null,2), (err) => {if(err) console.log(err);});
}catch(err){WriteLogFile(err+'\nfrom SetInterval()','вчат');}		
},2*3600000);//раз в час
//====================================================================
async function send_instruction(chatId,user,pass)
{try{	
	let str = "";
	str += "Обратитесь, пожалуйста, к Админу бота для регистрации.";
	//let but = keyboard['1']; but.splice(0,1);//оставляем только Вопросы
	//await sendMessage(chatId, str, klava(but));
	await sendMessage(chatId, str, klava(keyboard['1']));
}catch(err){WriteLogFile(err+'\nfrom send_instruction()','вчат');}
}
//====================================================================
//запись в файл объекта, массива
async function WriteFileJson(path,arr)
{
try{
	if(typeof arr === 'object') res = fs.writeFileSync(path, JSON.stringify(arr,null,2));
    else res = fs.writeFileSync(path, arr);
}catch(err){console.log(err+'\nfrom WriteFileJson()'); WriteLogFile(err+'\nfrom WriteFileJson()','вчат');}
}
//====================================================================
//запись с бэкап файл массива с добавлением в конец
function AppendFileJson(path,arr)
{
try{
	fs.appendFile(path, JSON.stringify(arr,null,2), (err) => 
	{if(err) {console.log(err);}
	});
}catch(err){WriteLogFile(err+'\nfrom AppendFileJson()','вчат');}
}
//====================================================================
//проверка юзера на валидность
function validUser(chatId)
{try{	
	const now = moment().startOf('day');
	if(!!UserList[chatId])//есть в юзерах
	{	let time;
		if(!!UserList[chatId][1]) time = moment(UserList[chatId][1],'DD.MM.YYYY');
		if(!time) return false;
		let days = now.diff(time, 'days');
		if(days > lifeTime) 
		{	let tmp = UserList[chatId];
			delete UserList[chatId]; 
			WriteFileJson(FileUserList,UserList);
			WriteLogFile('По сроку давности удален пользователь "'+chatId+'":\n'+JSON.stringify(tmp,null,2),'вчат');
			sendMessage(chatId, 'Срок Вашей регистрации уже истек.\n'+smilik);
			return false;
		}
	}
	if(!!UserList[chatId]) return true;//есть в юзерах
	else if(validAdmin(chatId)) return true;//есть в админах
	else if(validAdminBot(chatId)) return true;//есть в админах бота
	else if(chatId==chat_coordinatorWhatsApp) return true;//координатор вотсап
	else return false;//нету нигде
}catch(err){WriteLogFile(err+'\nfrom validUser()','вчат');}
}
//====================================================================
//проверка админа на валидность
function validAdmin(chatId)
{	
try{
	const keys = Object.keys(AdminList);
	
	if(keys.indexOf(''+chatId)+1 || chatId==chat_Supervisor) return true;//есть в разрешенных
	else return false;//нет в разрешенных
}catch(err){WriteLogFile(err+'\nfrom validAdmin()','вчат');}	
}
//====================================================================
//проверка админа бота на валидность
function validAdminBot(chatId)
{	
try{
	const keys = Object.keys(AdminBot);
	
	if(keys.indexOf(''+chatId)+1) return true;//есть в разрешенных
	else if(validAdmin(chatId)) return true;
	else return false;//нет в разрешенных
}catch(err){WriteLogFile(err+'\nfrom ValidAdminBot()','вчат');}	
}
//====================================================================
//проверка банов
function banUser(chatId)
{
try{
	const bans = Object.keys(BlackList);
	
	if(bans.indexOf(''+chatId)+1) return true;//есть в банах
	else return false;//нет в банах
}catch(err){WriteLogFile(err+'\nfrom banUser()','вчат');}	
}
//====================================================================
function welcome(chatId,name)
{	
try{
	let str='';
	str+='Для загрузки текста или файла (картинка, видео, аудио, документ, альбом) просто нажми соответствующую кнопку и следуй моим подсказкам.';
	str+='\nВремя выхода публикаций в каналы - ' + timePablic + 'Z' + moment().format('Z');
	sendMessage(chatId, str, klava(begin(chatId)));
}catch(err){WriteLogFile(err+'\nfrom welcome()','вчат');}	
}
//====================================================================
async function sendMessage(chatId,str,option)
{
try{	
	if(Number(chatId)<0) return;//отрицательные chatId не пускаем
	if(!isValidChatId(chatId)) return;//если не число, то не пускаем
	while(!getMessageCount()) await sleep(50);//получаем разрешение по лимиту сообщ/сек
	//сохраняем для посл.удаления
	let chat_id='', mess_id='';
	if(LastMessId[chatId]) {chat_id=chatId; mess_id=LastMessId[chatId].messId;}
	if(str.length > 4097) {str = str.substr(0,4090);str+='\n...обрезка';}//обрезаем строку
	
	let res = new Object();
    if(option)
    {	if(Object.hasOwn(option, 'link_preview_options')) option.link_preview_options = JSON.stringify(option.link_preview_options);
		//посылаем сообщение
		res=await LoaderBot.sendMessage(chatId, str, option);
		//сохраняем xxx_id, если с кнопками
		if(Object.hasOwn(res, 'reply_markup') && Object.hasOwn(res.reply_markup, 'inline_keyboard'))
		{
		 LastMessId[chatId]=new Object();
		 LastMessId[chatId].messId=res.message_id;
		 LastMessId[chatId].username=res.chat.username;
         LastMessId[chatId].first_name=res.chat.first_name;
         //удаляем предыдущее сообщение с кнопками
		 if(!!mess_id) {await remove_message(chat_id, mess_id);}
		}
	}
	else {res=await LoaderBot.sendMessage(chatId, str);
		 }

	return res;
}catch(err)
		{	WriteLogFile(err+'\nfrom sendMessage("'+chatId+'")','вчат');
		}
}
//====================================================================
async function sendPhoto(Bot, chatId, path, opt)
{
try{
	//if(Number(chatId)<0) return;//отрицательные chatId не пускаем
	if(!isValidChatId(chatId)) return;//если не число, то не пускаем
	if(!fs.existsSync(path)) return false;
	//while(!getMessageCount()) await sleep(50);//получаем разрешение по лимиту сообщ/сек
	if(!!opt && !!opt.caption && opt.caption.length > 1024) {opt.caption = opt.caption.substr(0,1023);}//обрезаем подпись
	while(queue.getQueueStats().queueLength >= QUEUELIMIT) await sleep(50);//ограничение очереди
	await queue.addToQueue({type:'sendPhoto', chatId:chatId, data:path, options:opt, bot:Bot});
	return true;
}catch(err){WriteLogFile(err+'\nfrom sendPhoto()','вчат');return Promise.reject(false);}
}
//====================================================================
async function sendAlbum(Bot, chatId, media, opt)
{
try{
	//if(Number(chatId)<0) return;//отрицательные chatId не пускаем
	if(!isValidChatId(chatId)) return;//если не число, то не пускаем
	//while(!getMessageCount()) await sleep(50);//получаем разрешение по лимиту сообщ/сек
	let mas = [...media];
	if(!!opt && !!opt.caption)
	{	if(!mas[0].caption) mas[0].caption = '';
		mas[0].caption += opt.caption;
	}
	if(!!mas[0].caption_entities && typeof(mas[0].caption_entities) == 'string')
	{	mas[0].caption_entities = JSON.parse(mas[0].caption_entities);
	}
	if(!!mas[0].caption && mas[0].caption.length > 1024) {mas[0].caption = mas[0].caption.substr(0,1023);}//обрезаем подпись
	while(queue.getQueueStats().queueLength >= QUEUELIMIT) await sleep(50);//ограничение очереди
	await queue.addToQueue({type:'sendMediaGroup', chatId:chatId, data:mas, bot:Bot});
	return true;
}catch(err){WriteLogFile(err+'\nfrom sendAlbum()','вчат');return Promise.reject(false);}
}
//====================================================================
async function sendVideo(Bot, chatId, path, opt)
{
try{
	//if(Number(chatId)<0) return;//отрицательные chatId не пускаем
	if(!isValidChatId(chatId)) return;//если не число, то не пускаем
	if(!fs.existsSync(path)) return false;
	//while(!getMessageCount()) await sleep(50);//получаем разрешение по лимиту сообщ/сек
	if(!!opt && !!opt.caption && opt.caption.length > 1024) {opt.caption = opt.caption.substr(0,1023);}//обрезаем подпись
	while(queue.getQueueStats().queueLength >= QUEUELIMIT) await sleep(50);//ограничение очереди
	await queue.addToQueue({type:'sendVideo', chatId:chatId, data:path, options:opt, bot:Bot});
	return true;
}catch(err){WriteLogFile(err+'\nfrom sendVideo()','вчат');return Promise.reject(false);}
}
//====================================================================
async function sendAudio(Bot, chatId, path, opt)
{
try{
	//if(Number(chatId)<0) return;//отрицательные chatId не пускаем
	if(!isValidChatId(chatId)) return;//если не число, то не пускаем
	if(!fs.existsSync(path)) return false;
	//while(!getMessageCount()) await sleep(50);//получаем разрешение по лимиту сообщ/сек
	if(!!opt && !!opt.caption && opt.caption.length > 1024) {opt.caption = opt.caption.substr(0,1023);}//обрезаем подпись
	while(queue.getQueueStats().queueLength >= QUEUELIMIT) await sleep(50);//ограничение очереди
	await queue.addToQueue({type:'sendAudio', chatId:chatId, data:path, options:opt, bot:Bot});
	return true;
}catch(err){WriteLogFile(err+'\nfrom sendAudio()','вчат');return Promise.reject(false);}
}
//====================================================================
async function sendDocument(Bot, chatId, path, opt)
{
try{
	//if(Number(chatId)<0) return;//отрицательные chatId не пускаем
	if(!isValidChatId(chatId)) return;//если не число, то не пускаем
	if(!fs.existsSync(path)) return false;
	//while(!getMessageCount()) await sleep(50);//получаем разрешение по лимиту сообщ/сек
	if(!!opt && !!opt.caption && opt.caption.length > 1024) {opt.caption = opt.caption.substr(0,1023);}//обрезаем подпись
	while(queue.getQueueStats().queueLength >= QUEUELIMIT) await sleep(50);//ограничение очереди
	await queue.addToQueue({type:'sendDocument', chatId:chatId, data:path, options:opt, bot:Bot});
	return true;
}catch(err){WriteLogFile(err+'\nfrom sendDocument()','вчат');return Promise.reject(false);}
}
//====================================================================
async function remove_buttons(str,messId,chatId,ent)
{	try{await LoaderBot.editMessageText(str,{message_id:messId,chat_id:chatId,entities:ent});}catch(err){console.error(err);}
}
//====================================================================
async function remove_message(chatId,messId)
{	
try{await LoaderBot.deleteMessage(chatId, messId);} 
catch(err){ 
	if(String(err).indexOf("message can't be deleted")+1)
	{	try{await LoaderBot.editMessageText("!",{chat_id:chatId, message_id:messId/*, reply_markup:keyboard*/});}
		catch(err1){console.log('Ошибка: не могу исправить старое сообщение\n'+err1);}
		try{await LoaderBot.deleteMessage(chatId, messId);}
		catch(err1){console.log('Ошибка: не могу удалить старое сообщение\n'+err1);}
	}
	else {console.error(err);}
}
}
//====================================================================
//подписка на выход из скрипта
[`SIGINT`, `uncaughtException`, `SIGTERM`].forEach((event) => 
{	process.on(event, async ()=>
	{	fs.writeFileSync(currentDir+'/LastMessId.txt', JSON.stringify(LastMessId,null,2));
		clearInterval(timer);
		await queue.destroy();// Корректно уничтожаем очередь
		if(queue.queue.length>0)//Записываем остатки в файл
		{	const state = {
				queue: queue.queue.map(item => ({
					id: item.id,
					timestamp: item.timestamp,
					type: item.type,
					data: item.data,
					options: item.options,
					chatId: item.chatId,
					attempts: item.attempts,
					bot: item.bot==NewsBot ? 'NewsBot' : (item.bot==logBot ? 'logBot' : 'LoaderBot')
				}))
			};
			await WriteFileJson(currentDir+'/queue.json', state);
			await WriteLogFile('Остатки очереди='+queue.queue.length+', записали в queue.json');
		}
		await slaveBot.stop();
		await WriteLogFile('выход из процесса по '+event);
		process.exit();
	});
});
//====================================================================
async function readImagesList()
{   //список файлов
    try 
	{	ImagesList = shiftObject(JSON.parse(fs.readFileSync(FileImagesList))); 
		let mas=[];
		for(let key in ImagesList) 
		{	if(!!ImagesList[key].path && !fs.existsSync(ImagesList[key].path)) 
			{	await sendMessage(chat_Supervisor, 'Обнаружено отсутствие файла из списка:\n'+JSON.stringify(ImagesList[key],null,2));
				WriteLogFile('Обнаружено отсутствие файла из списка:\n'+JSON.stringify(ImagesList[key],null,2));
				mas.push(key);
			}
			if(!!ImagesList[key].media)//альбом
			{	for(let i in ImagesList[key].media)
				{	if(!fs.existsSync(ImagesList[key].media[i].media))
					{	await sendMessage(chat_Supervisor, 'Обнаружено отсутствие файла из списка:\n'+JSON.stringify(ImagesList[key],null,2));
						WriteLogFile('Обнаружено отсутствие файла из списка:\n'+JSON.stringify(ImagesList[key],null,2));
						ImagesList[key].media.splice(i, 1);//удаляем запись
					}
				}
				if(ImagesList[key].media.length==0) {mas.push(key);}
			}
		}
		if(mas.length>0) 
		{	for(let i in mas) delete ImagesList[mas[i]];//удаляем запись
			ImagesList = shiftObject(ImagesList);//упорядочиваем номера-ключи в массиве
			WriteFileJson(FileImagesList,ImagesList);
		}
		return 'OK';
	}
    catch (err) {WriteLogFile(err+'\nfrom readImagesList()','вчат'); return 'NO';}
}
//====================================================================
function readModerImagesList()
{   //список файлов
    try {ModerImagesList = shiftObject(JSON.parse(fs.readFileSync(FileModerImagesList)));}
    catch (err) {WriteLogFile(err+'\nfrom readModerImagesList()','вчат');}
}
//====================================================================
async function readTextList()
{   //список текстов
    try {TextList = shiftObject(JSON.parse(fs.readFileSync(FileTextList))); return 'OK';}
    catch (err) {WriteLogFile(err+'\nfrom readTextList()','вчат'); return 'NO';}
}
//====================================================================
async function readPostList()
{try{   
	//список постов
    await readTextList();
	await readImagesList();
	let obj={};
	let num = 1;
	let keys = Object.keys(TextList);
	if(!!keys && keys.length > 0) for(i in keys) {obj[num.toString()] = TextList[keys[i]]; num +=1;}
	keys = Object.keys(ImagesList);
	if(!!keys && keys.length > 0) for(i in keys) {obj[num.toString()] = ImagesList[keys[i]]; num +=1;}
	
	return obj;
}catch(err){WriteLogFile(err+'\nfrom readPostList()','вчат');}
}
//====================================================================
function readModerTextList()
{   //список текстов
    try {ModerTextList = shiftObject(JSON.parse(fs.readFileSync(FileModerTextList)));}
    catch (err) {WriteLogFile(err+'\nfrom readModerTextList()','вчат');}
}
//====================================================================
async function showTextList(chatId, flag)
{	
try{	
	await readTextList();//читаем файл текстов в TextList
	await sendMessage(chatId, '*<< Показываю Тексты из списка >>*\n👇🏻👇🏻👇🏻👇🏻👇🏻👇🏻👇🏻', {parse_mode:"markdown"});
	let mas = Object.keys(TextList);
	if(mas.length > 0)
	{	for(let i in mas)
		{	let str = '';
			let time = !!TextList[mas[i]].time?(' - '+TextList[mas[i]].time):(' - '+moment(timePablic,'HH:mm').format('HH:mm'));
			if(flag!=0) str = TextList[mas[i]].text + '\n\n** номер: '+mas[i]+' ** ('+TextList[mas[i]].date+' - '+TextList[mas[i]].dayOfWeek+time+') - '+TextList[mas[i]].userName;//с номером
			else str = TextList[mas[i]].text + '\n\n('+TextList[mas[i]].date+' - '+TextList[mas[i]].dayOfWeek+time+') - '+TextList[mas[i]].userName;//без номера
			let opt = {};
			opt.entities = TextList[mas[i]].entities; 
			opt.link_preview_options=TextList[mas[i]].link_preview_options;
			if(!!TextList[mas[i]].parse_mode) opt.parse_mode = TextList[mas[i]].parse_mode;
			await sendMessage(chatId, str, opt);
		}
	}
	else await sendMessage(chatId, '*Упс... А список то пустой!*\n', {parse_mode:"markdown"});
}catch(err){WriteLogFile(err+'\nfrom showTextList()','вчат');}
}
//====================================================================
async function showPostList(chatId, flag)
{	
try{	
	let List = await readPostList();//читаем общий список постов
	await sendMessage(chatId, '*<< Показываю Посты из списка >>*\n👇🏻👇🏻👇🏻👇🏻👇🏻👇🏻👇🏻', {parse_mode:"markdown"});
	let mas = Object.keys(List);
	if(mas.length > 0)
	{	for(let i in mas)
		{	if(Object.hasOwn(List[mas[i]], 'text'))//это текст
			{	let str = '';
				let time = !!List[mas[i]].time?(' - '+List[mas[i]].time):(' - '+moment(timePablic,'HH:mm').format('HH:mm'));
				if(flag!=0) str = List[mas[i]].text + '\n\n** номер: '+mas[i]+' ** ('+List[mas[i]].date+' - '+List[mas[i]].dayOfWeek+time+') - '+List[mas[i]].userName;//с номером
				else str = List[mas[i]].text + '\n\n('+List[mas[i]].date+' - '+List[mas[i]].dayOfWeek+time+') - '+List[mas[i]].userName;//без номера
				let opt = {};
				if(!!List[mas[i]].entities) opt.entities = List[mas[i]].entities; 
				if(!!List[mas[i]].link_preview_options) opt.link_preview_options=List[mas[i]].link_preview_options;
				if(!!List[mas[i]].parse_mode) opt.parse_mode = List[mas[i]].parse_mode;
				await sendMessage(chatId, str, opt);
			}
			else if(Object.hasOwn(List[mas[i]], 'path'))//это одиночный файл
			{	let opt = new Object();
				if(Object.hasOwn(List[mas[i]], 'caption')) 
				{	opt.caption = List[mas[i]].caption;
					if(!!List[mas[i]].caption_entities) opt.caption_entities = List[mas[i]].caption_entities;
				}
				else opt.caption = '';
				if(Object.hasOwn(List[mas[i]], 'parse_mode')) opt.parse_mode = List[mas[i]].parse_mode;
				let time = !!List[mas[i]].time?(' - '+List[mas[i]].time):(' - '+moment(timePablic,'HH:mm').format('HH:mm'));
				if(flag!=0) opt.caption += "\n\n** номер: "+mas[i]+" ** ("+List[mas[i]].date+" - "+List[mas[i]].dayOfWeek+time+") - "+List[mas[i]].userName;
				else opt.caption += "\n\n("+List[mas[i]].date+" - "+List[mas[i]].dayOfWeek+time+") - "+List[mas[i]].userName;
				if(!!List[mas[i]].parse_mode) opt.parse_mode = List[mas[i]].parse_mode;
				if(Object.hasOwn(List[mas[i]], 'type'))
				{if(List[mas[i]].type=='image') {await sendPhoto(LoaderBot, chatId, List[mas[i]].path, opt);}
				 else if(List[mas[i]].type=='video') {await sendVideo(LoaderBot, chatId, List[mas[i]].path, opt);}
				 else if(List[mas[i]].type=='audio') {await sendAudio(LoaderBot, chatId, List[mas[i]].path, opt);}
				 else if(List[mas[i]].type=='document') {await sendDocument(LoaderBot, chatId, List[mas[i]].path, opt);}
				}
				else await sendPhoto(LoaderBot, chatId, List[mas[i]].path, opt);
				//ждем выполнения очереди
				//try{await queue.waitForQueueEmpty(30000);}catch(err){console.log(err);}
			}
			else if(Object.hasOwn(List[mas[i]], 'media'))//это альбом
			{	let opt = new Object();
				opt.caption = '';
				let time = !!List[mas[i]].time?(' - '+List[mas[i]].time):(' - '+moment(timePablic,'HH:mm').format('HH:mm'));
				if(flag!=0) opt.caption += "\n\n** номер: "+mas[i]+" ** ("+List[mas[i]].date+" - "+List[mas[i]].dayOfWeek+time+") - "+List[mas[i]].userName;
				else opt.caption += "\n\n("+List[mas[i]].date+" - "+List[mas[i]].dayOfWeek+time+") - "+List[mas[i]].userName;
				if(Object.hasOwn(List[mas[i]], 'type'))
				{if(List[mas[i]].type=='image') {await sendPhoto(LoaderBot, chatId, List[mas[i]].path, opt);}
				 else if(List[mas[i]].type=='video') {await sendVideo(LoaderBot, chatId, List[mas[i]].path, opt);}
				 else if(List[mas[i]].type=='audio') {await sendAudio(LoaderBot, chatId, List[mas[i]].path, opt);}
				 else if(List[mas[i]].type=='document') {await sendDocument(LoaderBot, chatId, List[mas[i]].path, opt);}
				 else if(List[mas[i]].type=='album') {await sendAlbum(LoaderBot, chatId, List[mas[i]].media, opt);}
				}
				//ждем выполнения очереди
				//try{await queue.waitForQueueEmpty(30000);}catch(err){console.log(err);}
			}
		}
	}
	else await sendMessage(chatId, '*Упс... А список то пустой!*\n', {parse_mode:"markdown"});
}catch(err){WriteLogFile(err+'\nfrom showPostList()','вчат');}
}
//====================================================================
async function showModerTextList(chatId, flag)
{	
try{	
	readModerTextList();//читаем файл текстов в ModerTextList
	await sendMessage(chatId, '*<< Показываю Тексты из списка >>*\n👇🏻👇🏻👇🏻👇🏻👇🏻👇🏻👇🏻', {parse_mode:"markdown"});
	let mas = Object.keys(ModerTextList);
	if(mas.length > 0)
	{	for(let i in mas)
		{	let str = '';
			let time = !!ModerTextList[mas[i]].time?(' - '+ModerTextList[mas[i]].time):(' - '+moment(timePablic,'HH:mm').format('HH:mm'));
			if(flag!=0) str = ModerTextList[mas[i]].text + '\n\n** номер: '+mas[i]+' ** ('+ModerTextList[mas[i]].date+' - '+ModerTextList[mas[i]].dayOfWeek+time+') - '+ModerTextList[mas[i]].userName;//с номером
			else str = ModerTextList[mas[i]].text + '\n\n('+ModerTextList[mas[i]].date+' - '+ModerTextList[mas[i]].dayOfWeek+time+') - '+ModerTextList[mas[i]].userName;//без номера
			let opt = {};
			opt.entities = ModerTextList[mas[i]].entities;
			opt.link_preview_options=ModerTextList[mas[i]].link_preview_options;
			if(!!ModerTextList[mas[i]].parse_mode) opt.parse_mode = ModerTextList[mas[i]].parse_mode;
			await sendMessage(chatId, str, opt);
		}
	}
	else await sendMessage(chatId, '*Упс... А список то пустой!*\n', {parse_mode:"markdown"});
}catch(err){WriteLogFile(err+'\nfrom showModerTextList()','вчат');}
}
//====================================================================
async function showImagesList(chatId, flag)
{	
try{	
	await readImagesList();//читаем список из файла
    await sendMessage(chatId, '*<< Показываю Файлы из списка >>*\n👇🏻👇🏻👇🏻👇🏻👇🏻👇🏻👇🏻', {parse_mode:"markdown"});
	if(Object.keys(ImagesList).length > 0)
	{	for(var key in ImagesList)
		{	let opt = new Object();
			opt.caption = '';
			if(Object.hasOwn(ImagesList[key], 'caption')) 
			{	opt.caption = ImagesList[key].caption;
				if(!!ImagesList[key].caption_entities) opt.caption_entities = ImagesList[key].caption_entities;
			}
			if(Object.hasOwn(ImagesList[key], 'parse_mode')) opt.parse_mode = ImagesList[key].parse_mode;
			let time = !!ImagesList[key].time?(' - '+ImagesList[key].time):(' - '+moment(timePablic,'HH:mm').format('HH:mm'));
			if(flag!=0) opt.caption += "\n\n** номер: "+key+" ** ("+ImagesList[key].date+" - "+ImagesList[key].dayOfWeek+time+") - "+ImagesList[key].userName;
			else opt.caption += "\n\n("+ImagesList[key].date+" - "+ImagesList[key].dayOfWeek+time+") - "+ImagesList[key].userName;
			if(!!ImagesList[key].parse_mode) opt.parse_mode = ImagesList[key].parse_mode;
			if(Object.hasOwn(ImagesList[key], 'type'))
			{if(ImagesList[key].type=='image') {await sendPhoto(LoaderBot, chatId, ImagesList[key].path, opt);}
			 else if(ImagesList[key].type=='video') {await sendVideo(LoaderBot, chatId, ImagesList[key].path, opt);}
			 else if(ImagesList[key].type=='audio') {await sendAudio(LoaderBot, chatId, ImagesList[key].path, opt);}
			 else if(ImagesList[key].type=='document') {await sendDocument(LoaderBot, chatId, ImagesList[key].path, opt);}
			 else if(ImagesList[key].type=='album') {await sendAlbum(LoaderBot, chatId, ImagesList[key].media, opt);}
			}
			else await sendPhoto(LoaderBot, chatId, ImagesList[key].path, opt);
			//ждем выполнения очереди
			//try{await queue.waitForQueueEmpty(30000);}catch(err){console.log(err);}
		}
	}
	else await sendMessage(chatId, '*Упс... А список то пустой!*\n', {parse_mode:"markdown"});
}catch(err){WriteLogFile(err+'\nfrom showImagesList()','вчат');}
}
//====================================================================
async function showModerImagesList(chatId, flag)
{	
try{	
	readModerImagesList();//читаем список из файла
    await sendMessage(chatId, '*<< Показываю Файлы из списка >>*\n👇🏻👇🏻👇🏻👇🏻👇🏻👇🏻👇🏻', {parse_mode:"markdown"});
	if(Object.keys(ModerImagesList).length > 0)
	{	for(var key in ModerImagesList)
		{	let opt = new Object();
			if(Object.hasOwn(ModerImagesList[key], 'caption')) 
			{	opt.caption = ModerImagesList[key].caption;
				opt.caption_entities = ModerImagesList[key].caption_entities;
			}
			else opt.caption = '';
			if(Object.hasOwn(ModerImagesList[key], 'parse_mode')) opt.parse_mode = ModerImagesList[key].parse_mode;
			let time = !!ModerImagesList[key].time?(' - '+ModerImagesList[key].time):(' - '+moment(timePablic,'HH:mm').format('HH:mm'));
			if(flag!=0) opt.caption += "\n\n** номер: "+key+" ** ("+ModerImagesList[key].date+" - "+ModerImagesList[key].dayOfWeek+time+") - "+ModerImagesList[key].userName;
			else opt.caption += "\n\n("+ModerImagesList[key].date+" - "+ModerImagesList[key].dayOfWeek+time+") - "+ModerImagesList[key].userName;
			if(!!ModerImagesList[key].parse_mode) opt.parse_mode = ModerImagesList[key].parse_mode;
			if(Object.hasOwn(ModerImagesList[key], 'type'))
			{if(ModerImagesList[key].type=='image') {await sendPhoto(LoaderBot, chatId, ModerImagesList[key].path, opt);}
			 else if(ModerImagesList[key].type=='video') {await sendVideo(LoaderBot, chatId, ModerImagesList[key].path, opt);}
			 else if(ModerImagesList[key].type=='audio') {await sendAudio(LoaderBot, chatId, ModerImagesList[key].path, opt);}
			 else if(ModerImagesList[key].type=='document') {await sendDocument(LoaderBot, chatId, ModerImagesList[key].path, opt);}
			 else if(ModerImagesList[key].type=='album') {await sendAlbum(LoaderBot, chatId, ModerImagesList[key].media, opt);}
			}
			else await sendPhoto(LoaderBot, chatId, ModerImagesList[key].path, opt);
			//ждем выполнения очереди
			//try{await queue.waitForQueueEmpty(30000);}catch(err){console.log(err);}
		}
	}
	else await sendMessage(chatId, '*Упс... А список то пустой!*\n', {parse_mode:"markdown"});
}catch(err){WriteLogFile(err+'\nfrom showModerImagesList()','вчат');}
}
//====================================================================
async function sendMessageToAdmin(str, opt)
{
try{
    let keys = Object.keys(AdminBot);
    for(let i in keys) sendMessage(keys[i], str, opt);//пошлем сообщение админу из списка
}catch(err){WriteLogFile(err+'\nfrom sendMessageToAdmin()');}
}
//====================================================================
function sendPhotoToAdmin(path, opt)
{
try{
    let keys = Object.keys(AdminBot);
    for(let i in keys) sendPhoto(LoaderBot, keys[i], path, opt);//пошлем картинку админу из списка
}catch(err){WriteLogFile(err+'\nfrom sendPhotoToAdmin()','вчат');}
}
//====================================================================
async function sendVideoToAdmin(path, opt)
{
try{
    let keys = Object.keys(AdminBot);
    for(let i in keys) await sendVideo(LoaderBot, keys[i], path, opt);//пошлем ролик админу из списка
}catch(err){WriteLogFile(err+'\nfrom sendVideoToAdmin()','вчат');}
}
//====================================================================
async function sendAudioToAdmin(path, opt)
{
try{
    let keys = Object.keys(AdminBot);
    for(let i in keys) await sendAudio(LoaderBot, keys[i], path, opt);//пошлем аудио админу из списка
}catch(err){WriteLogFile(err+'\nfrom sendAudioToAdmin()','вчат');}
}
//====================================================================
async function sendDocToAdmin(path, opt)
{
try{
    let keys = Object.keys(AdminBot);
    for(let i in keys) await sendDocument(LoaderBot, keys[i], path, opt);//пошлем файл админу из списка
}catch(err){WriteLogFile(err+'\nfrom sendDocToAdmin()','вчат');}
}
//====================================================================
//упорядочивает номера-ключи в объекте с 1го номера
function shiftObject(obj)
{try{
	if(typeof obj !== 'object') return obj;
	if(Object.keys(obj).length === 0) return obj;
	let tmp = new Object();
	let n = 1;
	for(let i in obj) {tmp[n] = obj[i]; n++;}
	return tmp;
}catch(err){WriteLogFile(err+'\nfrom shiftObject()','вчат');}
}
//====================================================================
async function setToTextList(obj)
{
try{
	//определяем длину массива
	await readTextList();//читаем файл текстов в TextList
	TextList = shiftObject(TextList);//упорядочиваем номера-ключи в массиве
	let len=Object.keys(TextList).length;
	if(len==0) len=1;
	else {let mas=Object.keys(TextList); len=mas[mas.length-1]; len++;}//последний ключ + 1
	//сохраняем в лист публикаций с форматированием
	TextList[len]=obj;//из временного объекта
	TextList = shiftObject(TextList);//упорядочиваем номера-ключи в массиве
	WriteFileJson(FileTextList,TextList);//сохраняем лист публикаций текста в файл
}catch(err){WriteLogFile(err+'\nfrom setToTextList()','вчат');}
}
//====================================================================
async function setToModerTextList(obj)
{
try{
	//определяем длину массива
	readModerTextList();//читаем файл текстов в ModerTextList
	ModerTextList = shiftObject(ModerTextList);//упорядочиваем номера-ключи в массиве
	let len=Object.keys(ModerTextList).length;
	if(len==0) len=1;
	else {let mas=Object.keys(ModerTextList); len=mas[mas.length-1]; len++;}//последний ключ + 1
	//сохраняем в лист публикаций с форматированием
	ModerTextList[len]=obj;//из временного объекта
	ModerTextList = shiftObject(ModerTextList);//упорядочиваем номера-ключи в массиве
	WriteFileJson(FileModerTextList,ModerTextList);//сохраняем лист модераций текста в файл
}catch(err){WriteLogFile(err+'\nfrom setToModerTextList()','вчат');}
}
//====================================================================
//проверка на возможность немедленной публикации
function check_permissions(obj,offset)
{
try{
	//публикуем текст прямо сейчас, если дата или день недели и время совпадает
	let flag = 0;
	let now = moment().utcOffset(Number(offset),true).startOf('day');//текущий день в зоне
	let day;
	if(Object.hasOwn(obj, 'dayOfWeek')) day=obj.dayOfWeek;
	if(!Object.hasOwn(obj, 'date') || !moment(obj.date,'DD.MM.YYYY').isValid()) return 0;
	
	if(!day) return 0;
	
	//если по Дате
	if(day=='Дата') 
	{	let time = getDateTimeForZone(obj.date, offset);//дата окончания по местному времени
		let days = time.diff(now, 'days')+1;//плюс 1
		if(days>0 && days%7==0) {flag++;}//кратно неделе
		else if(days<14)//менее 2х недель
		//else if(days<7)//менее 1 недели
		{	/*switch(days)
			{	//case 10: flag++; break;
				//case 7: flag++; break;
				case 4: flag++; break;
				//case 3: flag++; break;
				//case 2: flag++; break;
				case 1: flag++; break;//сегодня
			}*/
			let tmp=days-1;
			if(forDate.indexOf(tmp)+1) flag++;
		}
	}
	//если по Дням недели
	else if(masDay.indexOf(day)+1)
	{ 	//если дата окончания не наступила
			let timet = getDateTimeForZone(obj.date, offset);//дата окончания по местному времени
			if(timet.diff(now, 'days') >= 0);//разница в днях, 0 = сегодня
			{	if(obj.dayOfWeek==masDay[8]) flag++;//ежедневно, публикуем однозначно
				else
				{ 	
					let dayWeek = now.day();//сегодняшний день недели в зоне: 0-воскресенье, 1-понедельник
					if(dayWeek==0) dayWeek=7;//приведем к формату 1..7
					if(dayWeek==masDay.indexOf(day)) flag++;//совпали дни, публикуем
				}
			}
	}
	//во всех остальных случаях
	else
	{	let timet = now.format('DD.MM.YYYY');
		if(obj.date==timet) flag++;//прям сегодня
	}
	
	return flag;
}catch(err){WriteLogFile(err+'\nfrom check_permissions()','вчат');}
}
//====================================================================
//эта функция используется только при загрузке поста, в рассылке не участвует
async function publicText(obj,offset)//тут текст на публикацию
{
try{
	//проверяем разрешение на публикацию немедленно
	let flag = check_permissions(obj,offset);
	let timepublic = getDateTimeForZone(timePablic, offset);//время "Ч" в зоне в абсолютах
	let timeobj;
	if(Object.hasOwn(obj, 'time') && !!obj.time)
	{	if(moment(obj.time,'DD.MM.YYYY').isValid()) 
		{timeobj = getDateTimeForZone(obj.time, offset);//приводим к местному времени
		}
	}
	// до или после глобальной публикации
	let now = moment();//текущее время
	let sec = -1;
	//если времени в объекте нет, то используем глобальное время публикаций
	if(!timeobj) sec = now.diff(timepublic, 'seconds');//разница в секундах
	//если время в объекте есть, то используем совпадение времени
	else
	{	sec = now.diff(timeobj, 'seconds');//разница в секундах
		if(sec >= 0 && sec < 120) sec = 1;//в 2х-минутном интервале от времени "Ч"
		else sec = -1;
	}
	//публикуем в каналах из массива, если условия совпадают
	if(flag && sec>0)//если после времени утренней публикации
	{	let timestr = !!obj.time?(' '+obj.time):'';//запись времени
		let day = !!obj.dayOfWeek?obj.dayOfWeek:'';//запись дня
		let date = !!obj.date?obj.date:'';//запись даты
		WriteLogFile('text "Срочно" => день='+day+'; дата='+date+timestr);
		//соберем все чаты в новый массив
		//let all_chats = getAllChats();//посылаем без разбору по зонам
		let all_chats = chat_news[offset] ? chat_news[offset] : [];
		for(let i=0;i<all_chats.length;i++) 
		try{
		  if(!!all_chats[i])
		  {	let opt = {};
			let chatId = '', threadId = '';
			if(!!all_chats[i] && !all_chats[i].News) continue;//не выбран News в доставке
			let key = Object.keys(all_chats[i]);
			if(!!all_chats[i][key[0]]) chatId = all_chats[i][key[0]];
			if(!!all_chats[i].message_thread_id) threadId = all_chats[i].message_thread_id;
			opt.entities = obj.entities;
			if(!!threadId) opt.message_thread_id = threadId;
			if(Object.hasOwn(obj, 'link_preview_options'))
			{opt.link_preview_options=JSON.stringify(obj.link_preview_options);
			 if(Object.hasOwn(obj.link_preview_options, 'is_disabled')) opt.disable_web_page_preview = true;
			}
			if(!!obj.parse_mode) opt.parse_mode = obj.parse_mode;
			if(!!chatId)
			{	while(!getMessageCount()) await sleep(50);//получаем разрешение по лимиту сообщ/сек
				let res = await sendTextToBot(NewsBot, chatId, obj.text, opt);//посылаем пост
				if(res===false) WriteLogFile('Не смог послать текст text "'+key+'"'+' в '+name[0]);
				else WriteLogFile('в '+key[0]+' = ОК');
			}
		  }
		}catch(err){WriteLogFile(err+'\nfrom publicText()=>for()','вчат');}
	}
}catch(err){WriteLogFile(err+'\nfrom publicText()','вчат');}
}
//====================================================================
async function sendTextToWhatsup(list)
{
try{
	//отправляем координатору вотсап, если он есть
	let flag = 0;
	if(chat_coordinatorWhatsApp && Object.hasOwn(LastMessId, chat_coordinatorWhatsApp)) 
	{	await sendMessage(chat_coordinatorWhatsApp, '*<< Координатору Whatsup >>*\n👇🏻👇🏻👇🏻👇🏻👇🏻👇🏻👇🏻', {parse_mode:"markdown"});
		for(var key in list)
		{	let obj = list[key];
			let opt = {};
			if(!!obj.entities) opt.entities = obj.entities;
			if(!!obj.parse_mode) opt.parse_mode = obj.parse_mode;
			await sendMessage(chat_coordinatorWhatsApp, obj.text, opt);
			await sendMessage(chat_coordinatorWhatsApp, '👆🏻👆🏻👆🏻👆🏻👆🏻👆🏻👆🏻\n'+obj.date+' - '+obj.dayOfWeek);
			flag++;
		}		
	}
	if(flag) return 'OK'; else return 'NO';
}catch(err){WriteLogFile(err+'\nfrom sendTextToWhatsApp()','вчат'); return -1;}
}
//====================================================================
async function setToImagesList(newpath, obj)
{
try{
	if(!!obj.path)
	{	//скопируем файл с новым именем в основную папку Images
		fs.copyFileSync(obj.path, newpath);
		//сразу удалим временный файл
		try {fs.unlinkSync(obj.path);} catch (e) {console.log(e);}
		obj.path = newpath;//новый путь
	}
	else if(!!obj.media)//если альбом
	{	for(let i in obj.media)
		{	let mas = obj.media[i].media.split('/');
			let fileName = mas[mas.length-1];//вытащим имя файла
			newpath = PathToImages+'/'+fileName;//новый путь для файла
			//скопируем файл с новым именем в основную папку Images
			fs.copyFileSync(obj.media[i].media, newpath);
			//сразу удалим временный файл
			try {fs.unlinkSync(obj.media[i].media);} catch (e) {console.log(e);}
			//заменим путь в объекте
			obj.media[i].media = newpath;
		}
	}
	await readImagesList();//читаем список из файла
	ImagesList = shiftObject(ImagesList);//упорядочиваем номера-ключи
	//определим длину массива
	let len=Object.keys(ImagesList).length;
	if(len===0) len=1;
	else {let mas=Object.keys(ImagesList); len=mas[mas.length-1]; len++;}//последний ключ + 1
    ImagesList[len]=obj;//переносим в новый список
	
    ImagesList = shiftObject(ImagesList);//упорядочиваем номера-ключи в массиве
	WriteFileJson(FileImagesList,ImagesList);//сохраним список в файл
	return len;
}catch(err){WriteLogFile(err+'\nfrom setToImagesList()','вчат'); return -1;}
}
//====================================================================
async function setToModerImagesList(oldpath, newpath, obj, media_group_id)
{
try{
	if(!fs.existsSync(PathToImagesModer)) {fs.mkdirSync(PathToImagesModer);}//создадим папку, если ее нет
	if(!!oldpath && !!newpath)
	{	//скопируем файл с новым именем в папку moder
		fs.copyFileSync(oldpath, newpath);
		//сразу удалим временный файл
		try {fs.unlinkSync(oldpath);} catch (e) {console.log(e);}
	}
	//если это часть альбома
	if(!!media_group_id)
	{	if(!Object.hasOwn(MediaList, media_group_id) || MediaList[media_group_id].media.length==0)//если первый файл альбома
		{	if(!Object.hasOwn(MediaList, media_group_id)) MediaList[media_group_id] = {};
			if(!Object.hasOwn(MediaList, 'media')) MediaList[media_group_id].media = [];
			if(Object.hasOwn(obj, 'dayOfWeek')) MediaList[media_group_id].dayOfWeek = obj.dayOfWeek;//день недели или однократно или Дата
			if(Object.hasOwn(obj, 'date')) MediaList[media_group_id].date = obj.date;//дата
			if(Object.hasOwn(obj, 'userName')) MediaList[media_group_id].userName = obj.userName;
			if(Object.hasOwn(obj, 'chatId')) MediaList[media_group_id].chatId = obj.chatId;
			if(Object.hasOwn(obj, 'timeload')) MediaList[media_group_id].timeload = obj.timeload;
			if(Object.hasOwn(obj, 'time')) MediaList[media_group_id].time = obj.time;
			MediaList[media_group_id].type = 'album';
		}
		let mobj = {};
		if(Object.hasOwn(obj, 'type')) {if(obj.type=='image') mobj.type = 'photo'; else mobj.type = obj.type;}//тип
		if(Object.hasOwn(obj, 'caption')) mobj.caption = obj.caption;
		if(Object.hasOwn(obj, 'caption_entities')) mobj.caption_entities = obj.caption_entities;
		if(Object.hasOwn(obj, 'parse_mode')) mobj.parse_mode = obj.parse_mode;
		mobj.media = newpath;//путь
		MediaList[media_group_id].media.push(mobj);//пушим объект
		return 0;
	}
	readModerImagesList();//читаем список из файла
	ModerImagesList = shiftObject(ModerImagesList);//упорядочиваем номера-ключи
	//определим длину массива
	let len=Object.keys(ModerImagesList).length;
	if(len==0) len=1;
	else {let mas=Object.keys(ModerImagesList); len=mas[mas.length-1]; len++;}//последний ключ + 1
    ModerImagesList[len]=new Object();
	if(!obj.media) ModerImagesList[len].path = newpath;//путь
	else ModerImagesList[len].media = obj.media;
	ModerImagesList[len].dayOfWeek = obj.dayOfWeek;//день недели или однократно или Дата
	ModerImagesList[len].date = obj.date;//дата
	//ModerImagesList[len].chatId = obj.chatId;
	if(!!obj && !!obj.caption) ModerImagesList[len].caption = obj.caption;//подпись
	if(Object.hasOwn(obj, 'caption_entities')) ModerImagesList[len].caption_entities = obj.caption_entities;//форматирование
	if(Object.hasOwn(obj, 'parse_mode')) ModerImagesList[len].parse_mode = obj.parse_mode;
	if(Object.hasOwn(obj, 'type')) ModerImagesList[len].type = obj.type;//тип файла
	if(Object.hasOwn(obj, 'userName')) ModerImagesList[len].userName = obj.userName;
	if(Object.hasOwn(obj, 'chatId')) ModerImagesList[len].chatId = obj.chatId;
	if(Object.hasOwn(obj, 'timeload')) ModerImagesList[len].timeload = obj.timeload;
	if(Object.hasOwn(obj, 'time')) ModerImagesList[len].time = obj.time;
	
	ModerImagesList = shiftObject(ModerImagesList);//упорядочиваем номера-ключи в массиве
	WriteFileJson(FileModerImagesList,ModerImagesList);//сохраним список в файл
	return len;
}catch(err){WriteLogFile(err+'\nfrom setToModerImagesList()','вчат'); return -1;}
}
//====================================================================
//эта функция используется только при загрузке поста, в рассылке не участвует
async function publicImage(obj,offset)
{
try{
	let opt = new Object();
	if(Object.hasOwn(obj, 'caption')) opt.caption = obj.caption;
	if(Object.hasOwn(obj, 'caption_entities')) opt.caption_entities = obj.caption_entities;
	if(Object.hasOwn(obj, 'parse_mode')) opt.parse_mode = obj.parse_mode;
	//проверяем разрешение на публикацию немедленно
	let flag = check_permissions(obj,offset);
	let timepublic = getDateTimeForZone(timePablic, offset);//время "Ч" в зоне в абсолютах
	let timeobj;
	if(Object.hasOwn(obj, 'time') && !!obj.time)
	{	if(moment(obj.time,'DD.MM.YYYY').isValid()) 
		{timeobj = getDateTimeForZone(obj.time, offset);//приводим к местному времени
		}
	}
	// до или после утренней публикации
	let now = moment();//текущее время
	let sec = -1;
	//если времени в объекте нет, то используем глобальное время публикаций
	if(!timeobj) sec = now.diff(timepublic, 'seconds');//разница в секундах
	//если время в объекте есть, то используем совпадение времени
	else
	{	sec = now.diff(timeobj, 'seconds');//разница в секундах
		if(sec >= 0 && sec < 120) sec = 1;//в 2х-минутном интервале от времени "Ч"
		else sec = -1;
	} 
	//публикуем в каналах из массива, если условия совпадают
	if(flag && sec>0)//если после времени утренней публикации 
    {	let timestr = !!obj.time?(' '+obj.time):'';//запись времени
		let day = !!obj.dayOfWeek?obj.dayOfWeek:'';//запись дня
		let date = !!obj.date?obj.date:'';//запись даты
		WriteLogFile(obj.type+' "Срочно" в очередь => день='+day+'; дата='+date+timestr);
	 //соберем все чаты в новый массив
	 //let all_chats = getAllChats();
	 let all_chats = chat_news[offset] ? chat_news[offset] : [];
	 for(let i=0;i<all_chats.length;i++) 
	 {	try{
		  let chatId = '', threadId = '';
		  if(!!all_chats[i]) 
		  {	if(!!all_chats[i] && !all_chats[i].News) continue;//не выбран News в доставке
			let key = Object.keys(all_chats[i]);
			if(!!all_chats[i][key[0]]) chatId = all_chats[i][key[0]];
			if(!chatId) continue;//пропускаем цикл, если нет chatId
			if(!!all_chats[i].message_thread_id) threadId = all_chats[i].message_thread_id;
			if(!!threadId) opt.message_thread_id = threadId;
			while(!getMessageCount()) await sleep(50);//получаем разрешение по лимиту сообщ/сек
			if(Object.hasOwn(obj, 'type')) 
			{	if(obj.type=='image') {await sendPhoto(NewsBot, chatId, obj.path, opt);}//если картинка
				else if(obj.type=='video') {await sendVideo(NewsBot, chatId, obj.path, opt);}//если видео
				else if(obj.type=='audio') {await sendAudio(NewsBot, chatId, obj.path, opt);}//если audio
				else if(obj.type=='document') {await sendDocument(NewsBot, chatId, obj.path, opt);}//если document
				else if(obj.type=='album' && !!obj.media && obj.media.length>0) 
				{	if(!!obj.media[0].caption_entities && typeof(obj.media[0].caption_entities) == 'string')
					{	obj.media[0].caption_entities = JSON.parse(obj.media[0].caption_entities);
					}
					let tmp = [...obj.media];
					if(!!threadId) tmp.message_thread_id = threadId;
					await sendAlbum(NewsBot, chatId, tmp);
				}
			}
			else sendPhoto(NewsBot, chatId, obj.path, opt);//без типа - картинка
			WriteLogFile('в '+key[0]+' = ОК');
		  }
		}catch(err){WriteLogFile(err+'\nfrom publicImage()=>for()','вчат');}
	 }
	}
}catch(err){WriteLogFile(err+'\nfrom publicImage()','вчат');}
}
//====================================================================
async function sendImageToWhatsup(list)
{
try{
	//отправляем координатору вотсап, если он есть
	let flag = 0;
	if(chat_coordinatorWhatsApp && Object.hasOwn(LastMessId, chat_coordinatorWhatsApp))
	{	await sendMessage(chat_coordinatorWhatsApp, '*<< Координатору Whatsup >>*\n👇🏻👇🏻👇🏻👇🏻👇🏻👇🏻👇🏻', {parse_mode:"markdown"});
		for(var key in list)
		{	let obj = list[key];
			let opt = {};
			if(Object.hasOwn(obj, 'caption')) opt.caption = obj.caption;
			if(Object.hasOwn(obj, 'caption_entities')) opt.caption_entities = obj.caption_entities;
			if(Object.hasOwn(obj, 'parse_mode')) opt.parse_mode = obj.parse_mode;
			if(obj.type=='image') {await sendPhoto(LoaderBot, chat_coordinatorWhatsApp, obj.path, opt);}//если картинка
			else if(obj.type=='video') {await sendVideo(LoaderBot, chat_coordinatorWhatsApp, obj.path, opt);}//если видео
			else if(obj.type=='audio') {await sendAudio(LoaderBot, chat_coordinatorWhatsApp, obj.path, opt);}//если audio
			else if(obj.type=='document') {await sendDocument(LoaderBot, chat_coordinatorWhatsApp, obj.path, opt);}//если document
			//ждем выполнения очереди
			try{await queue.waitForQueueEmpty(30000);}catch(err){console.log(err);}
			await sendMessage(chat_coordinatorWhatsApp, '👆🏻👆🏻👆🏻👆🏻👆🏻👆🏻👆🏻\n'+obj.date+' - '+obj.dayOfWeek);
			flag++;
		}
	}
	if(flag) return 'OK'; else return 'NO';
}catch(err){WriteLogFile(err+'\nfrom sendImageToWhatsup()','вчат'); return -1;}
}
//====================================================================
function begin(chatId)
{try{	
	if(validAdmin(chatId) || validAdminBot(chatId)) return keyboard['adm1'];
	else return keyboard['1'];
}catch(err){WriteLogFile(err+'\nfrom begin()','вчат');}
}
//====================================================================
function get_keyb100()
{try{	
	let mas = keyboard['100'];
	if(Object.keys(ModerTextList).length > 0) mas[1][0].text = '❗️Публиковать Тексты❗️';
	else mas[1][0].text = 'Публиковать Тексты';
	if(Object.keys(ModerImagesList).length > 0) mas[1][1].text = '❗️Публиковать Файлы❗️';
	else mas[1][1].text = 'Публиковать Файлы';
	return mas;
}catch(err){WriteLogFile(err+'\nfrom get_keyb100()','вчат');}
}
//====================================================================
function isValidChatId(value) 
{try{
    if(typeof(value)==='string')
	{return /^-?\d+$/.test(value);//целые отрицательные можно
	 //return /^\d+$/.test(value);//целые отрицательные нельзя
	 //return /^-?\d+(\.\d+)?$/.test(value);//вещественные отрицательные можно
	}
	else if(typeof(value)==='number') return true;
	else return false;
}catch(err){WriteLogFile(err+'\nfrom isValidChatId()','вчат');}
}
//====================================================================
async function WriteLogFile(arr, flag) 
{   if(!LOGGING) return;
	let str=moment().format('DD.MM.YY HH:mm:ss:ms')+' - '+arr+'\n';
	console.log(str.replace('\n',''));
    try{
		await fs.appendFileSync(LogFile, str);
		if(!!logBot && !!flag) 
		{str='From @'+namebot+' '+area+'\n'+str;
		 while(queue.getQueueStats().queueLength >= QUEUELIMIT) await sleep(50);//ограничение очереди
		 await queue.addToQueue({type:'sendMessage', chatId:chat_Supervisor, data:str, bot:logBot});
		 //await logBot.sendMessage(chat_Supervisor, str);
		}
	}catch(err){}
}
//====================================================================
//если бот запускается в пустой папке местности, то нужно создать папки и файлы по-умолчанию
//из контекста сборки
//это будет работать только из контейнера
function setContextFiles()
{//файлы контекста находятся в /home/pi/context/Bot
	let cBot = '/home/pi/context/Bot';
	//let cToken = '/home/pi/context/Token';
	let SUPERVISOR = (process.env.SUPERVISOR) ? process.env.SUPERVISOR : '';//чатайди супера из ENV
	let TOKEN_BOT = (process.env.TOKEN_BOT) ? process.env.TOKEN_BOT : '';//токен бота из ENV
	let NAME_BOT = (process.env.NAME_BOT) ? process.env.NAME_BOT : '';//имя бота из ENV
	let TOKEN_LOG = (process.env.TOKEN_LOG) ? process.env.TOKEN_LOG : '';//токен лог-бота из ENV
	let NAME_LOG = (process.env.NAME_LOG) ? process.env.NAME_LOG : '';//имя лог-бота из ENV
	let TOKEN_NEWS = (process.env.TOKEN_NEWS) ? process.env.TOKEN_NEWS : '';//токен news-бота из ENV
	let NAME_NEWS = (process.env.NAME_NEWS) ? process.env.NAME_NEWS : '';//имя news-бота из ENV
	let CONFIG_OBJ = (process.env.CONFIG_OBJ) ? process.env.CONFIG_OBJ : '';//настройки из ENV
	//let CHAT_NEWS_OBJ = (process.env.CHAT_NEWS_OBJ) ? process.env.CHAT_NEWS_OBJ : '';//объект с chatId каналов из ENV
	let BUTTONS_OBJ = (process.env.BUTTONS_OBJ) ? process.env.BUTTONS_OBJ : '';//объект с кнопками под расписанием из ENV
	let RUN_OBJ = (process.env.RUN_OBJ) ? process.env.RUN_OBJ : '';//объект с выбором нужных функций из ENV
	if(!fs.existsSync(TokenDir)) {fs.mkdirSync(TokenDir);}//создадим папку, если ее нет
	//if(!fs.existsSync(RassilkaDir)) {fs.mkdirSync(RassilkaDir);}//создадим папку, если ее нет
	if(!fs.existsSync(PathToImages)) {fs.mkdirSync(PathToImages);}//создадим папку, если ее нет
	if(!fs.existsSync(PathToImagesModer)) {fs.mkdirSync(PathToImagesModer);}//создадим папку, если ее нет
	if(fs.existsSync(cBot))
	{	//текстовые файлы переписываем принудительно
		if(fs.existsSync(cBot+'/readme.txt')) {fs.copyFileSync(cBot+'/readme.txt',currentDir+'/readme.txt');}
		if(fs.existsSync(cBot+'/LoaderUserGuid.txt')) {fs.copyFileSync(cBot+'/LoaderUserGuid.txt',currentDir+'/LoaderUserGuid.txt');}
	}
	//config.json
		if(!fs.existsSync(currentDir+'/config.json')) 
		{	if(fs.existsSync(cBot+'/config.json')) {fs.copyFileSync(cBot+'/config.json',currentDir+'/config.json');}
			else
			{	let obj={}; obj.area = "НашаМестность"; obj.timePablic = "06:00:00"; obj.forDate = [3,0]; obj.lifeTime = 180; obj.rassilka = true; obj.hostingImg = false; obj.pathHostingImg = "/../www/img", obj.hostname = "https://vps.na-ufa.ru", obj.Supervisor='123456';
				WriteFileJson(currentDir+'/config.json',obj);
			}
		}
		if(fs.existsSync(currentDir+'/config.json'))//если файл уже имеется
		{	let obj;
			try{obj = JSON.parse(fs.readFileSync(currentDir+'/config.json'));}catch(err){console.log(err);}
			if(typeof obj !== 'object')
			{if(fs.existsSync(cBot+'/config.json')) {fs.copyFileSync(cBot+'/config.json',currentDir+'/config.json');}
			 else
			 {	obj={}; obj.area = "НашаМестность"; obj.timePablic = "06:00:00"; obj.forDate = [3,0]; obj.lifeTime = 365; obj.rassilka = true; obj.hostingImg = false; obj.pathHostingImg = "/../www/img", obj.hostname = "https://vps.na-server.ru", obj.Supervisor='123456';
				WriteFileJson(currentDir+'/config.json',obj);
			 }
			}
			if(!Object.hasOwn(obj,'rassilka')) {obj.rassilka = true; WriteFileJson(currentDir+'/config.json',obj);}
			if(!Object.hasOwn(obj,'utcOffset')) {obj.utcOffset = utcOffset>0?'+'+String(moment().utcOffset()):String(moment().utcOffset()); WriteFileJson(currentDir+'/config.json',obj);}
			if(!Object.hasOwn(obj,'Supervisor')) {obj.Supervisor = '123456'; WriteFileJson(currentDir+'/config.json',obj);}
			//если запрошено изменение конфига в ENV
			if(!!CONFIG_OBJ) 
			{	let mas;
				try{mas = JSON.parse(CONFIG_OBJ);}catch(err){console.log(err); mas = '';}
				if(!mas) WriteLogFile('CONFIG_OBJ - не объект');
				else 
				{try{	if(!!mas.area && !!mas.timePablic && !!mas.forDate && !!mas.lifeTime) 
						{	if(typeof(mas.forDate) != 'object') {mas.forDate = [3,0]; WriteLogFile('Ошибка в объекте CONFIG_OBJ.forDate');}
							WriteFileJson(currentDir+'/config.json',mas);
						}
				 }catch(err){WriteLogFile('Ошибка в объекте CONFIG_OBJ');}
				}
			}
			//если запрошено изменение чатайди супера в ENV
			if(!!SUPERVISOR) {obj.Supervisor = SUPERVISOR; WriteFileJson(currentDir+'/config.json',obj);}
		}
	//button.txt
		if(!fs.existsSync(currentDir+'/buttons.txt')) {WriteFileJson(currentDir+'/buttons.txt',{});}
		if(fs.existsSync(currentDir+'/buttons.txt'))//если файл уже имеется
		{	let obj;
			try{obj = JSON.parse(fs.readFileSync(currentDir+'/buttons.txt'));}catch(err){console.log(err);}
			if(typeof(obj) != 'object' || Object.keys(obj).length === 0) {obj={}; WriteFileJson(currentDir+'/buttons.txt',obj);}
			//если запрошено изменение кнопок в ENV
			if(!!BUTTONS_OBJ) 
			{	let mas;
				try{mas = JSON.parse(BUTTONS_OBJ);}catch(err){console.log(err); mas = '';}
				if(!mas) WriteLogFile('BUTTONS_OBJ - не объект');
				else 
				{try{if(!!mas.reply_markup && !!mas.reply_markup.inline_keyboard &&
					!!mas.reply_markup.inline_keyboard[0][0].text &&
					!!mas.reply_markup.inline_keyboard[0][0].url
					) 
					{WriteFileJson(currentDir+'/buttons.txt',mas);}
					}catch(err){WriteLogFile('Ошибка в объекте BUTTONS_OBJ');}
				}
			}
		}
	//run.txt
		if(!fs.existsSync(currentDir+'/run.txt')) {WriteFileJson(currentDir+'/run.txt',{});}
		if(fs.existsSync(currentDir+'/run.txt'))//если файл уже имеется
		{	let obj;
			try{obj = JSON.parse(fs.readFileSync(currentDir+'/run.txt'));}catch(err){console.log(err);}
			if(typeof(obj) != 'object' || Object.keys(obj).length === 0) 
			{	obj={}; obj.Text = true; obj.Image = true; obj.Eg = false; obj.Raspis = false;
				obj.FileEg = '/../Rassilka/eg.txt';
				obj.FileRaspis = '/../Rassilka/raspis.txt';
				WriteFileJson(currentDir+'/run.txt',obj);
			}
			//если запрошено изменение RUN_OBJ в ENV
			if(!!RUN_OBJ) 
			{	let mas;
				try{mas = JSON.parse(RUN_OBJ);}catch(err){console.log(err); mas = '';}
				if(!mas) WriteLogFile('RUN_OBJ - не объект');
				else 
				{	if(Object.hasOwn(mas,'Text') && Object.hasOwn(mas,'Image') && Object.hasOwn(mas,'Eg') && Object.hasOwn(mas,'Raspis') && !!mas.FileEg && !!mas.FileRaspis)
					WriteFileJson(currentDir+'/run.txt',mas);
				}
			}
		}
	//файл токена лог бота
		if(!fs.existsSync(TokenDir+'/logs_bot.json'))
		{WriteFileJson(TokenDir+'/logs_bot.json',{"token":"сюда надо вписать токен бота", "comment":"имя_бота"});}
		if(fs.existsSync(TokenDir+'/logs_bot.json'))//если файл уже имеется
		{	let obj;
			try{obj = JSON.parse(fs.readFileSync(TokenDir+'/logs_bot.json'));}catch(err){console.log(err);}
			if(typeof(obj) != 'object')
			{obj={}; obj.token = "ТокенБотаЛогов"; obj.comment = "имяБота";
			 WriteFileJson(TokenDir+'/logs_bot.json',obj);
			}
			//если запрошено изменение токена бота в ENV
			if(!!TOKEN_LOG) {obj.token = TOKEN_LOG; WriteFileJson(TokenDir+'/logs_bot.json',obj);}
			//если запрошено изменение имени бота в ENV
			if(!!NAME_LOG) {obj.name = NAME_LOG; WriteFileJson(TokenDir+'/logs_bot.json',obj);}
		}
	//файл токена основного бота
		if(!fs.existsSync(TokenDir+"/loader_bot.json"))//если файла с токеном нет, то создадим по-умолчанию
		{WriteFileJson(TokenDir+"/loader_bot.json",{"token":"сюда надо вписать токен бота", "comment":"имя_бота"});}
		if(fs.existsSync(TokenDir+"/loader_bot.json"))//если файл уже имеется
		{	let obj;
			try{obj = JSON.parse(fs.readFileSync(TokenDir+"/loader_bot.json"));}catch(err){console.log(err);}
			if(typeof(obj) != 'object')
			{obj={}; obj.token = "ТокенБота"; obj.comment = "имяБота";
			 WriteFileJson(TokenDir+"/loader_bot.json",obj);
			}
			//если запрошено изменение токена бота в ENV
			if(!!TOKEN_BOT) {obj.token = TOKEN_BOT; WriteFileJson(TokenDir+"/loader_bot.json",obj);}
			//если запрошено изменение имени бота в ENV
			if(!!NAME_BOT) {obj.name = NAME_BOT; WriteFileJson(TokenDir+"/loader_bot.json",obj);}
		}
	//файл токена новостного бота
		if(!fs.existsSync(TokenDir+"/news_bot.json"))//если файла с токеном нет, то создадим по-умолчанию
		{WriteFileJson(TokenDir+"/news_bot.json",{"token":"сюда надо вписать токен бота", "comment":"имя_бота"});}
		if(fs.existsSync(TokenDir+"/news_bot.json"))//если файл уже имеется
		{	let obj;
			try{obj = JSON.parse(fs.readFileSync(TokenDir+"/news_bot.json"));}catch(err){console.log(err);}
			if(typeof(obj) != 'object')
			{obj={}; obj.token = "ТокенБота"; obj.comment = "имяБота";
			 WriteFileJson(TokenDir+"/news_bot.json",obj);
			}
			//если запрошено изменение токена бота в ENV
			if(!!TOKEN_NEWS) {obj.token = TOKEN_NEWS; WriteFileJson(TokenDir+"/news_bot.json",obj);}
			//если запрошено изменение имени бота в ENV
			if(!!NAME_NEWS) {obj.name = NAME_NEWS; WriteFileJson(TokenDir+"/news_bot.json",obj);}
		}
}
//====================================================================
//сортируем массив медиа, если caption не в первом элементе
function sortMedia(mas)
{	if(!!mas[0].caption) return mas;
	let media = [];
	for(let i=0;i<mas.length;i++)
	{	if(!!mas[i].caption)
		{	media.push(mas[i]);//положим первым
			mas.splice(i,1);
			break;
		}
	}
	for(let i=0;i<mas.length;i++) {media.push(mas[i]);}//остатки
	return media;
}
//====================================================================
function deleteMediaFiles(obj)
{	
try{
	if(!!obj.media && obj.media.length>0)
	{	for(let i in obj.media)
		{	if(!!obj.media[i].media && fs.existsSync(obj.media[i].media)) 
			{	try{fs.unlinkSync(obj.media[i].media);}catch(err){console.log(err);}//удаление с диска
			}
		}
		return true;
	}
	return false;
}catch(err){WriteLogFile(err+'\nfrom deleteMediaFiles()');}
}
//====================================================================
function getKeyByValue(object, value) {return Object.keys(object).find(key => object[key] === value);
}
//====================================================================
async function sleep(ms) {return new Promise(resolve => setTimeout(resolve, ms));}
//====================================================================
function getMessageCount()
{
	if(sendMessage.count >= SPEEDLIMIT) return false;//достигли максимума
	sendMessage.count = (sendMessage.count || 0) + 1;//счетчик сообщений в секунду
	if(sendMessage.count == 1) setTimeout(doAfter, 1000);//на первом заряжаем таймер
	return true;
	
	function doAfter()
	{	sendMessage.count = 0;
	}
}
//====================================================================
function getKeyList()
{
var keyList =
{
  "1": [
    [
      {
        "text": "Загрузить Пост",
        "callback_data": "1_Загрузить Пост"
      }
    ],
    [
      {
        "text": "Вопросы",
        "url": "https://t.me/ссылкаДляВопросов"
      }
    ]
  ],
  "2": [
    [
      {
        "text": "Да",
        "callback_data": "2_Да"
      },
      {
        "text": "Нет",
        "callback_data": "2_Нет"
      }
    ],
    [
      {
        "text": "Назад",
        "callback_data": "2_Назад"
      }
    ]
  ],
  "3": [
    [
      {
        "text": "в 'Начало'",
        "callback_data": "3_Вначало"
      }
    ]
  ],
  "4": [
    [
      {
        "text": "Да",
        "callback_data": "4_Да"
      },
      {
        "text": "Нет",
        "callback_data": "4_Нет"
      }
    ]
  ],
  "5": [
	[
      {
        "text": "Только Сегодня",
        "callback_data": "5_Сегодня"
      }
    ],
	[
      {
        "text": "Завтра",
        "callback_data": "5_Завтра"
      }
    ],
	[
      {
        "text": "По дням недели",
        "callback_data": "5_По дням недели"
      }
    ],
    [
      {
        "text": "Ежедневно",
        "callback_data": "5_Ежедневно"
      }
    ],
    [
      {
        "text": "Однократно",
        "callback_data": "5_Однократно"
      }
    ],
    [
      {
        "text": "Дата",
        "callback_data": "5_Дата"
      }
    ],
	[
      {
        "text": "в 'Начало'",
        "callback_data": "3_Вначало"
      }
    ]
  ],
  "7": [
    [
      {
        "text": "Да",
        "callback_data": "7_Да"
      },
      {
        "text": "Нет",
        "callback_data": "7_Нет"
      }
    ],
    [
      {
        "text": "Назад",
        "callback_data": "2_Назад"
      }
    ]
  ],
  "8": [
    [
      {
        "text": "Да",
        "callback_data": "8_Да"
      },
      {
        "text": "Нет",
        "callback_data": "8_Нет"
      }
    ],
    [
      {
        "text": "Назад",
        "callback_data": "2_Назад"
      }
    ]
  ],
  "9": [
    [
      {
        "text": "Понедельник",
        "callback_data": "5_Понедельник"
      }
    ],
    [
      {
        "text": "Вторник",
        "callback_data": "5_Вторник"
      }
    ],
    [
      {
        "text": "Среда",
        "callback_data": "5_Среда"
      }
    ],
    [
      {
        "text": "Четверг",
        "callback_data": "5_Четверг"
      }
    ],
    [
      {
        "text": "Пятница",
        "callback_data": "5_Пятница"
      }
    ],
    [
      {
        "text": "Суббота",
        "callback_data": "5_Суббота"
      }
    ],
    [
      {
        "text": "Воскресенье",
        "callback_data": "5_Воскресенье"
      }
    ],
    [
      {
        "text": "в 'Начало'",
        "callback_data": "3_Вначало"
      }
    ]
  ],
  "10": [
    [
      {
        "text": "Да",
        "callback_data": "10_Да"
      },
      {
        "text": "Нет",
        "callback_data": "10_Нет"
      }
    ],
    [
      {
        "text": "в 'Начало'",
        "callback_data": "3_Вначало"
      }
    ]
  ],
  "100": [
    [
      {
        "text": "Удалить Тексты",
        "callback_data": "100_Удалить Тексты"
      },
      {
        "text": "Удалить Файлы",
        "callback_data": "100_Удалить Файлы"
      }
    ],
    [
      {
        "text": "Публиковать Тексты",
        "callback_data": "100_Публиковать Тексты"
      },
      {
        "text": "Публиковать Файлы",
        "callback_data": "100_Публиковать Файлы"
      }
    ],
    [
      {
        "text": "Назад",
        "callback_data": "3_Вначало"
      }
    ]
  ],
  "101": [
    [
      {
        "text": "Да",
        "callback_data": "101_Да"
      },
      {
        "text": "Нет",
        "callback_data": "101_Нет"
      }
    ],
    [
      {
        "text": "Назад",
        "callback_data": "1_Админ Бота"
      }
    ]
  ],
  "102": [
    [
      {
        "text": "Назад",
        "callback_data": "1_Админ Бота"
      }
    ]
  ],
  "103": [
    [
      {
        "text": "Да",
        "callback_data": "103_Да"
      },
      {
        "text": "Нет",
        "callback_data": "103_Нет"
      }
    ],
    [
      {
        "text": "Назад",
        "callback_data": "1_Админ Бота"
      }
    ]
  ],
  "104": [
    [
      {
        "text": "Да",
        "callback_data": "104_Да"
      },
      {
        "text": "Нет",
        "callback_data": "104_Нет"
      }
    ],
    [
      {
        "text": "Назад",
        "callback_data": "1_Админ Бота"
      }
    ]
  ],
  "105": [
    [
      {
        "text": "Да",
        "callback_data": "105_Да"
      },
      {
        "text": "Нет",
        "callback_data": "105_Нет"
      }
    ],
    [
      {
        "text": "Назад",
        "callback_data": "1_Админ Бота"
      }
    ]
  ],
  "adm1": [
    [
      {
        "text": "Загрузить Пост",
        "callback_data": "1_Загрузить Пост"
      }
    ],
    [
      {
        "text": "Удалить Пост",
        "callback_data": "1_Удалить Пост"
      }
    ],
    [
      {
        "text": "Вопросы",
        "url": "https://t.me/ссылкаДляВопросов"
      }
    ],
    [
      {
        "text": "Модерация Постов",
        "callback_data": "1_Админ Бота"
      }
    ]
  ]
}
return keyList;
}
//====================================================================
async function sendTextToBot(Bot, chat, text, opt)
{ let res;
  try{
		if(!isValidChatId(chat)) return false;//если не число, то не пускаем
		if(text=='') return false;
		//while(!getMessageCount()) await sleep(50);//получаем разрешение по лимиту сообщ/сек
		while(queue.getQueueStats().queueLength >= QUEUELIMIT) await sleep(50);//ограничение очереди
		res = queue.addToQueue({type:'sendMessage', chatId:chat, data:text, options:opt, bot:Bot});
  }catch(err)
  {	console.error(getTimeStr()+err);
    console.error('Не смог послать текст в '+chat);
	WriteLogFile(err+'\nfrom sendTextToBot()','вчат');
	res=err;
  }
  return res;
}
//====================================================================
function getTimeStr() {return moment().format('DD-MM-YY HH:mm:ss:ms ');}
//====================================================================
//посылает Ежик всегда в markdown
async function send_Eg()
{ try
  {		if(!fs.existsSync(FileEg)) {WriteLogFile(getTimeStr()+'файл с ежиком отсутствует'); return;}
		let offset = Object.keys(chat_news);//массив смещений строками
		if(offset.length==0) {console.log('offset.length='+offset.length); return;}
		let now = moment();
		let publicHour = moment(timePablic, 'HH:mm:ss').hour();//Установленный час публикаций как число
		for(let i=0;i<offset.length;i++)
		{	let userHour = getUserDateTime(now, Number(offset[i])).hour();//час юзера как число
			if(userHour===publicHour) go2public(chat_news[offset[i]],offset[i],now);//передаем массив чатов
		}
	
	async function go2public(chat,groffset,parnow)
	{
		if(!Array.isArray(chat) || chat.length==0) return;//если не массив
		//вычислим нужный файл Ежика по локальному времени группы чатов
		let refpath = FileEg;//путь по-умолчанию
		const userTime = getUserDateTime(parnow, Number(groffset)).startOf('day');//дата группы чатов
		const todayDate = getEgDateTime(refpath).startOf('day'); //дата Ежика на сегодня
		const diffDays = todayDate.diff(userTime, 'days');//разница в днях
		if(diffDays > 0)
		{	const yesterdayPath = path.join(path.dirname(refpath), 'yesterday_' + path.basename(refpath));//с префиксом вчера
			if(fs.existsSync(yesterdayPath)) refpath = yesterdayPath;
		}
		else if(diffDays < 0)
		{	const tomorrowPath = path.join(path.dirname(refpath), 'tomorrow_' + path.basename(refpath));//с префиксом завтра
			if(fs.existsSync(tomorrowPath)) refpath = tomorrowPath;
		}		
		let eg = (await fs.promises.readFile(refpath)).toString();//получаем "сегодняшний" для юзера Ежик
		
		WriteLogFile('Рассылка Ежика в каналы '+groffset+' через очередь:');
		for(let i=0;i<chat.length;i++) 
		{  try{	
			let chatId = '', threadId = '', opt = {};
			let name = (chat[i] && typeof chat[i] === 'object') ? Object.keys(chat[i]) : [];
			if(name.length==0) continue;
			if(!!chat[i] && !chat[i].Eg) continue;//не выбран ежик в доставке
			if(!!chat[i][name[0]]) chatId = chat[i][name[0]];
			if(!chatId) continue;//пропускаем цикл, если нет chatId
			if(!!chat[i].message_thread_id) threadId = chat[i].message_thread_id;
			if(!!threadId) opt.message_thread_id = threadId;
			opt.parse_mode = "markdown"; opt.disable_web_page_preview = true;
			while(!getMessageCount()) await sleep(50);//получаем разрешение по лимиту сообщ/сек
			let res = await sendTextToBot(NewsBot,chatId,eg,opt);
			if(res===false) await WriteLogFile('Не смог послать Ежик в '+name[0]);
			else if(Object.hasOwn(res, 'code'))//в ответе есть ошибка
			{	
				if(res.code.indexOf('ETELEGRAM')+1)//ошибка от Телеги 
				{
					await WriteLogFile(' '+res);
				}
				else //ошибка от Ноды
				{//можно послать сообщение админу в телегу
					let obj = {}; obj.message = '';
					if(Object.hasOwn(res, 'message')) obj.message = res.message;
					await WriteLogFile('Что-то случилось...\ncode='+obj.message,'вчат');
				}
			}
			else await WriteLogFile('в '+name[0]+' = ОК');

		  }catch(err){WriteLogFile(err+'\nfrom send_Eg()=>for()','вчат');}
		}
	}
  } catch (err) 
  {WriteLogFile(err+'\nfrom send_Eg()','вчат');
  }
}
//====================================================================
async function send_Raspis()
{ try
  {		let raspis = '';
		if(fs.existsSync(FileRaspis)) raspis = fs.readFileSync(FileRaspis).toString();
		if(!raspis) {WriteLogFile('файл с расписанием отсутствует'); return;}
		let mode = 'HTML';//по-умолчанию
		let obj = {};
		let flag = 1;
		//проверим на объект
		try{obj = JSON.parse(raspis);}catch(err){flag = 0;}//если не JSON
		if(flag)//если это объект
		{	if(Object.hasOwn(obj, 'text')) raspis = obj.text;
			if(Object.hasOwn(obj, 'mode')) mode = obj.mode;
			if(!raspis) {raspis = smilik; mode = 'markdown';}
		}
		else return;
		
		let offset = Object.keys(chat_news);//массив смещений строками
		if(offset.length==0) {console.log('offset.length='+offset.length); return;}
		let now = moment();
		let publicHour = moment(timePablic, 'HH:mm:ss').hour();//Установленный час публикаций как число
		for(let i=0;i<offset.length;i++)
		{	let userHour = getUserDateTime(now, Number(offset[i])).hour();//час юзера как число
			if(userHour===publicHour) go2public(chat_news[offset[i]],offset[i]);//передаем массив чатов
		}
		
	async function go2public(chat,groffset)
	{
		if(!Array.isArray(chat) || chat.length==0) return;//если не массив
		await WriteLogFile('Рассылка Расписания в каналы '+groffset+' через очередь:');
		let opt = getButtonUrl(mode,true);//прилепим кнопку с ботом с отключенным превью ссылок
		for(let i=0;i<chat.length;i++) 
		{  try{
			let chatId = '', threadId = '';
			let name = (chat[i] && typeof chat[i] === 'object') ? Object.keys(chat[i]) : [];
			if(name.length==0) continue;
			if(!!chat[i][name[0]]) chatId = chat[i][name[0]];
			if(!chatId) continue;//пропускаем цикл, если нет chatId
			if(!!chat[i].message_thread_id) threadId = chat[i].message_thread_id;
			if(!!threadId) opt.message_thread_id = threadId;
			let res = await sendTextToBot(NewsBot,chatId,raspis,opt);
			if(res===false) WriteLogFile('Не смог послать Расписание в '+name[0]);
			else if(Object.hasOwn(res, 'code'))//в ответе есть ошибка
			{	
				if(res.code.indexOf('ETELEGRAM')+1)//ошибка от Телеги 
				{
					await WriteLogFile(' '+res);
				}
				else //ошибка от Ноды
				{//можно послать сообщение админу в телегу
					let obj = {}; obj.message = '';
					if(Object.hasOwn(res, 'message')) obj.message = res.message;
					await WriteLogFile('Что-то случилось...\ncode='+obj.message,'вчат');
				}
			}
			else await WriteLogFile('в '+name[0]+' = ОК');

		  }catch(err){WriteLogFile(err+'\nfrom send_Raspis()=>for()','вчат');}
		}
	}
  } catch (err) 
  {WriteLogFile(err+'\nfrom send_Raspis()','вчат');
  }
}
//====================================================================
//вернем кнопку со ссылкой, парс режим и выкл превью
function getButtonUrl(pars, preview)
{
try{
	let opt = {};
	if(Object.hasOwn(Buttons, 'reply_markup')) opt.reply_markup = Buttons.reply_markup;
	if(pars==='HTML' || pars==='markdown') opt.parse_mode = pars;
	if(preview===true) opt.disable_web_page_preview = true;
	return opt;
}catch(err){WriteLogFile(err+'\nfrom getButtonUrl()','вчат'); return {};}	
}
//====================================================================
//используется в рассылке
async function send_Images(now,offset)
{ try
  {	let good = 0;
    //WriteLogFile('Рассылка картинок:');
	//if(Object.keys(ImagesList).length == 0) {WriteLogFile('К сожалению на сегодня ничего нет :('); return;}
	let made = 0;
	let timepublic = getDateTimeForZone(timePablic, offset);//время "Ч" в зоне в абсолютах
	if(!now || now.isValid()==false) now = moment();//проверяем
	//читаем список
	let dayzone = now.clone().utcOffset(Number(offset),true).startOf('day');//текущий день в зоне
	for(let key in ImagesList)
	{	try{  
		  let date = ImagesList[key].date;//запись даты
          let day = ImagesList[key].dayOfWeek;//запись дня
		  let timeobj;
		  if(Object.hasOwn(ImagesList[key], 'time') && !!ImagesList[key].time)
		  {	if(moment(ImagesList[key].time, 'HH:mm').isValid()) 
			{	timeobj = getDateTimeForZone(ImagesList[key].time, offset);//приводим к местному времени
			}
		  }
          let flag = 0;
          
          //если по дням из массива
          if(masDay.indexOf(day)+1)
          { //если дата окончания не наступила
			if(moment(date,'DD.MM.YYYY').isValid())//проверяем правильная ли дата
			{	let time = getDateTimeForZone(date, offset);//дата окончания по местному времени
				if(time.diff(dayzone, 'days') >= 0)//разница в днях, 0 = сегодня
				{	if(day==masDay[8])//ежедневно 
					{	let sec;
						//без timeobj, публикуем во время timepublic
						if(!timeobj) sec = now.diff(timepublic, 'seconds');//разница в секундах
						//иначе публикуем во время timeobj
						else sec = now.diff(timeobj, 'seconds');//разница в секундах
						if(sec >= 0 && sec < 120) flag++;//в 2х-минутном интервале
					}
					else
					{ 	//сегодняшний день недели в зоне: 0-воскресенье, 1-понедельник
						let dayWeek = now.utcOffset(Number(offset),true).day();
						if(dayWeek==0) dayWeek=7;//приведем к формату 1..7
						if(dayWeek==masDay.indexOf(day))//совпали дни, публикуем 
						{	let sec;
							//без timeobj, публикуем во время timepublic
							if(!timeobj) sec = now.diff(timepublic, 'seconds');//разница в секундах
							//иначе публикуем во время timeobj
							else sec = now.diff(timeobj, 'seconds');//разница в секундах
							if(sec >= 0 && sec < 120) flag++;//в 2х-минутном интервале
						}
					}
				}
			}
          }
          //если чистая дата
          else if(moment(date,'DD.MM.YYYY').isValid() && day=='Дата')
          {
            if(public_byDate(date,now,offset))//совпадение по дате в цикле 'по Дате' 
			{	let sec;
				//без timeobj, публикуем во время timepublic
				if(!timeobj) sec = now.diff(timepublic, 'seconds');//разница в секундах
				//иначе публикуем во время timeobj
				else sec = now.diff(timeobj, 'seconds');//разница в секундах
				if(sec >= 0 && sec < 120) flag++;//в 2х-минутном интервале
			}
          }
          //если Однократно или Завтра или Сегодня и дата верна
		  else if(moment(date,'DD.MM.YYYY').isValid() && (day=='Однократно' || day=='Завтра' || day=='Сегодня'))
          { 
            let time = dayzone.format('DD.MM.YYYY');
			if(date==time)//прям сегодня 
			{	let sec;
				//без timeobj, публикуем во время timepublic
				if(!timeobj) sec = now.diff(timepublic, 'seconds');//разница в секундах
				//иначе публикуем во время timeobj
				else sec = now.diff(timeobj, 'seconds');//разница в секундах
				if(sec >= 0 && sec < 120) flag++;//в 2х-минутном интервале
			}
          }
		  let timestr = !!ImagesList[key].time?(' '+ImagesList[key].time):'';
		  if(flag>0) {WriteLogFile('image "'+key+'"'+' в очередь => день='+day+'; дата='+date+timestr);made++;}
          
          //публикуем файлы
          if(flag) 
          { let opt = new Object();
            if(Object.hasOwn(ImagesList[key], 'caption')) opt.caption = ImagesList[key].caption;
			if(Object.hasOwn(ImagesList[key], 'caption_entities')) opt.caption_entities = ImagesList[key].caption_entities;
            if(Object.hasOwn(ImagesList[key], 'parse_mode')) opt.parse_mode = ImagesList[key].parse_mode;
			//выделим массив по смещению
			//let all_chats = getAllChats();
			let all_chats = chat_news[offset] ? chat_news[offset] : [];
			//основной канал новостей
			for(let i=0;i<all_chats.length;i++) 
			{	let chatId = '', threadId = '';
				if(!!all_chats[i] && !all_chats[i].News) continue;//не выбран News в доставке
				let name = Object.keys(all_chats[i]);
				if(!!all_chats[i][name[0]]) chatId = all_chats[i][name[0]];//привязан к порядку в объекте!
				if(!chatId) continue;//пропускаем цикл, если нет chatId
				if(!!all_chats[i].message_thread_id) threadId = all_chats[i].message_thread_id;
				if(!!threadId) opt.message_thread_id = threadId;
				let res;
				if(!!ImagesList[key].type)
				{if(ImagesList[key].type == 'image') res = await sendPhoto(NewsBot, chatId, ImagesList[key].path, opt);
				 else if(ImagesList[key].type == 'video') res = await sendVideo(NewsBot, chatId, ImagesList[key].path, opt);
				 else if(ImagesList[key].type == 'audio') {res = await sendAudio(NewsBot, chatId, ImagesList[key].path, opt);}
				 else if(ImagesList[key].type == 'document') {res = await sendDocument(NewsBot, chatId, ImagesList[key].path, opt);}
				 else if(ImagesList[key].type == 'album') 
				 {	let tmp = [...ImagesList[key].media];
					if(!!threadId) tmp.message_thread_id = threadId;
					res = await sendAlbum(NewsBot, chatId, tmp);
				 }
				}
				else res = await sendPhoto(NewsBot, chatId, ImagesList[key].path, opt);
				if(res===false) WriteLogFile('Не смог послать файл image "'+key+'"'+' в '+name[0]); 
				else if(Object.hasOwn(res, 'code'))//в ответе есть ошибка
				{	
					if(res.code.indexOf('ETELEGRAM')+1)//ошибка от Телеги 
					{//нельзя послать сообщение админу в телегу
						WriteLogFile(' '+res);
					}
					else //ошибка от Ноды
					{//можно послать сообщение админу в телегу
						let obj = {}; obj.message = '';
						if(Object.hasOwn(res, 'message')) obj.message = res.message;
						WriteLogFile('Что-то случилось...\ncode='+obj.message,'вчат');
					}
				}
				else 
				{	good++;//если без ошибок
					WriteLogFile('в '+name[0]+' = ОК');
				}
			}
          }
		}catch(err){WriteLogFile(err+'\nfrom send_Images()=>for()','вчат');}
	}
	//if(made==0) WriteLogFile('К сожалению на сегодня ничего нет :(');
  } catch (err) 
  {console.error(getTimeStr()+err); 
   WriteLogFile(err+'\nfrom send_Images()','вчат');
  }
}
//====================================================================
//особое расписание публикаций по Дате
function public_byDate(date,now,offset)
{	
try{
	let flag = false;
	let dayzone = now.clone().utcOffset(Number(offset),true).startOf('day');//начало текущего дня в зоне
	let datezone = getDateTimeForZone(date, Number(offset));//дата конца в зоне
	let days = datezone.diff(dayzone, 'days')+1;
    if(days>0 && days%7==0) flag=true;
    else if(days<14)//менее 2х недель
    {	let tmp=days-1;
		if(forDate.indexOf(tmp)+1) flag=true;
	}
	return flag;
}catch(err){WriteLogFile(err+'\nfrom public_byDate()','вчат'); return false;}
}
//====================================================================
//используется в рассылке
//now=время системы с внутренним utcOffset, offset=смещение, строка
async function send_Text(now,offset)
{ try
  {	
	let good = 0;
	//WriteLogFile('Рассылка текстов:');
	//if(Object.keys(TextList).length == 0) {WriteLogFile('К сожалению на сегодня ничего нет :('); return;}
	let made = 0;
	let timepublic = getDateTimeForZone(timePablic, offset);//время "Ч" в зоне в абсолютах
	if(!now || now.isValid()==false) now = moment();//проверяем
	//читаем список
	let dayzone = now.clone().utcOffset(Number(offset),true).startOf('day');//текущий день в зоне
	for(let key in TextList)
	{   try{  
		  let date = TextList[key].date;//запись даты
		  let day = TextList[key].dayOfWeek;//запись дня
		  let timeobj;
		  if(Object.hasOwn(TextList[key], 'time') && !!TextList[key].time)
		  {	if(moment(TextList[key].time, 'HH:mm').isValid()) 
			{	timeobj = getDateTimeForZone(TextList[key].time, offset);//приводим к местному времени
			}
		  }
          let flag = 0;
          
          //если по дням
          if(masDay.indexOf(day)+1)
          { //если дата окончания не наступила
			if(moment(date,'DD.MM.YYYY').isValid())//проверяем правильная ли дата
			{	let time = getDateTimeForZone(date, offset);//дата окончания по местному времени
				if(time.diff(dayzone, 'days') >= 0)//разница в днях, 0 = сегодня
				{	if(day==masDay[8])//ежедневно 
					{	let sec;
						//без timeobj, публикуем во время timepublic
						if(!timeobj) sec = now.diff(timepublic, 'seconds');//разница в секундах
						//иначе публикуем во время timeobj
						else sec = now.diff(timeobj, 'seconds');//разница в секундах
						if(sec >= 0 && sec < 120) flag++;//в 2х-минутном интервале
					}
					else //по дням недели
					{ 	//сегодняшний день недели в зоне: 0-воскресенье, 1-понедельник
						let dayWeek = now.clone().utcOffset(Number(offset),true).day();
						if(dayWeek==0) dayWeek=7;//приведем к формату 1..7
						if(dayWeek==masDay.indexOf(day))//совпали дни, публикуем 
						{	let sec;
							//без timeobj, публикуем во время timepublic
							if(!timeobj) sec = now.diff(timepublic, 'seconds');//разница в секундах
							//иначе публикуем во время timeobj
							else sec = now.diff(timeobj, 'seconds');//разница в секундах
							if(sec >= 0 && sec < 120) flag++;//в 2х-минутном интервале
						}
					}
				}
			}
          }
          //если чистая дата
          else if(moment(date,'DD.MM.YYYY').isValid() && day=='Дата')
          {
            if(public_byDate(date,now,offset))//совпадение по дате в цикле 'по Дате' 
			{	let sec;
				//без timeobj, публикуем во время timepublic
				if(!timeobj) sec = now.diff(timepublic, 'seconds');//разница в секундах
				//иначе публикуем во время timeobj
				else sec = now.diff(timeobj, 'seconds');//разница в секундах
				if(sec >= 0 && sec < 120) flag++;//в 2х-минутном интервале
			}
          }
          //если Однократно или Завтра или Сегодня и дата верна
		  else if(moment(date,'DD.MM.YYYY').isValid() && (day=='Однократно' || day=='Завтра' || day=='Сегодня'))
          { 
            let time = dayzone.format('DD.MM.YYYY');
			if(date==time)//прям сегодня 
			{	let sec;
				//без timeobj, публикуем во время timepublic
				if(!timeobj) sec = now.diff(timepublic, 'seconds');//разница в секундах
				//иначе публикуем во время timeobj
				else sec = now.diff(timeobj, 'seconds');//разница в секундах
				if(sec >= 0 && sec < 120) flag++;//в 2х-минутном интервале
			}
          }
		  let timestr = !!TextList[key].time?(' '+TextList[key].time):'';
		  if(flag>0) {WriteLogFile('text "'+key+'"'+' в очередь => день='+day+'; дата='+date+timestr);made++;}
          
          //публикуем текст
		  if(flag)
          { let opt = new Object();
            opt.entities = TextList[key].entities;
			if(Object.hasOwn(TextList[key], 'link_preview_options'))
			{opt.link_preview_options=JSON.stringify(TextList[key].link_preview_options);
			 if(Object.hasOwn(TextList[key].link_preview_options, 'is_disabled')) opt.disable_web_page_preview = true;
			}
			if(!!TextList[key].parse_mode) opt.parse_mode = TextList[key].parse_mode;
            //соберем все чаты в новый массив
			//let all_chats = getAllChats();
			let all_chats = chat_news[offset] ? chat_news[offset] : [];
			//основной канал новостей
			for(let i=0;i<all_chats.length;i++) 
			{	let chatId = '', threadId = '';
				if(!!all_chats[i] && !all_chats[i].News) continue;//не выбран News в доставке
				let name = Object.keys(all_chats[i]);
				if(!!all_chats[i][name[0]]) chatId = all_chats[i][name[0]];//привязан к порядку в объекте!
				if(!chatId) continue;//пропускаем цикл, если нет chatId
				if(!!all_chats[i].message_thread_id) threadId = all_chats[i].message_thread_id;
				if(!!threadId) opt.message_thread_id = threadId;
				let res = await sendTextToBot(NewsBot, chatId, TextList[key].text, opt);//посылаем пост
				if(res===false) WriteLogFile('Не смог послать текст text "'+key+'"'+' в '+name[0]);
				else if(Object.hasOwn(res, 'code'))//в ответе есть ошибка
				{	
					if(res.code.indexOf('ETELEGRAM')+1)//ошибка от Телеги 
					{//нельзя послать сообщение админу в телегу
						WriteLogFile(' '+res);
					}
					else //ошибка от Ноды
					{//можно послать сообщение админу в телегу
						let obj = {}; obj.message = '';
						if(Object.hasOwn(res, 'message')) obj.message = res.message;
						WriteLogFile('Что-то случилось...\ncode='+obj.message,'вчат');
					}
				}
				else 
				{	good++;//если без ошибок
					WriteLogFile('в '+name[0]+' = ОК');
				}
			}
          }
		}catch(err){WriteLogFile(err+'\nfrom send_Text()=>for()','вчат');}
	}
	//if(made==0) WriteLogFile('К сожалению на сегодня ничего нет :(');
  } catch (err) 
  {console.error(getTimeStr()+err); 
   WriteLogFile(err+'\nfrom send_Text()','вчат');
  }
}
//====================================================================
function setTimezoneByOffset(offsetMinutes)
{	
	// Ищем подходящую временную зону
    const allZones = moment.tz.names();
    let rus = ['Europe/Kaliningrad','Europe/Moscow','Europe/Samara','Asia/Yekaterinburg','Asia/Omsk','Asia/Novosibirsk','Asia/Irkutsk','Asia/Chita','Asia/Vladivostok'];
	let suitableZones = allZones.filter(zone => 
	{	const zoneOffset = moment.tz(zone).utcOffset();
        return zoneOffset === offsetMinutes;
    });
    if(suitableZones.length > 0) 
	{	let res;
		//ищем российские зоны сначала
		let rusZona = suitableZones.find(item => rus.includes(item));
		if(!!rusZona) res = rusZona;// берем русскую, если есть
		else res = suitableZones[0];// Берем первую подходящую зону
		moment.tz.setDefault(res);//устанавливаем зону
        //WriteLogFile('Установлена зона: '+res+', смещение: '+moment().format('Z'), 'нет');
        return res;
    }
	else
	{	// Если точной зоны нет, то ищем наиболее подходящую
		const sign = offsetMinutes >= 0 ? '+' : '-';
		let hours = Math.floor(Math.abs(offsetMinutes) / 60);
		let minutes = Math.abs(offsetMinutes) % 60;
		if(minutes<30) minutes = 0;
		else {minutes = 0; hours++;}
		if(hours>12) hours = 12;
		let localOffset = hours*60 + minutes;
		if(sign=='-') localOffset = -localOffset;
		// Ищем подходящую временную зону
		suitableZones = allZones.filter(zone => 
		{	const zoneOffset = moment.tz(zone).utcOffset();
			return zoneOffset === localOffset;
		});
		if(suitableZones.length > 0) 
		{	// Берем первую подходящую зону
			moment.tz.setDefault(suitableZones[0]);
			//WriteLogFile('Установлена зона: '+suitableZones[0]+', смещение: '+moment().format('Z'));
			return suitableZones[0];
		}
		else 
		{	WriteLogFile('Таймзона не установлена! Смещение: '+moment().format('Z'),'вчат');
			return null;
		}
    }
}
//====================================================================
function clearTempWait(chatId)
{	if(WaitFlag[chatId]) delete WaitFlag[chatId];
	if(TempPost[chatId]) delete TempPost[chatId];
	numOfDelete[chatId]='';
}
//====================================================================
// Обработчики событий очереди
queue.on('error', (error) => {WriteLogFile(error);});
//queue.on('queued', (item) => {WriteLogFile(`Сообщение добавлено в очередь: ${item.id}`);});
//queue.on('sent', (item) => {WriteLogFile(`Сообщение отправлено: ${item.id}`);});
queue.on('failed', (item, error) => 
{if(!!item.bot) delete item.bot;
 try
 {	WriteLogFile('Ошибка отправки сообщения из очереди: '+error.message+'\n'+JSON.stringify(item,null,2));
	if(error.message.includes('chat not found') && item.chatId)//левый чат в списке, удалим
	{	let flag = 0;
		let chatId = String(item.chatId);
		Object.keys(chat_news || {}).forEach(key => 
		{	if (Array.isArray(chat_news[key])) 
			{	const originalLength = chat_news[key].length;
                chat_news[key] = chat_news[key].filter(chatObj => 
				{	// Проверяем все значения объекта
                    const values = Object.values(chatObj || {});
                    // Если ни одно значение не совпадает с chatId - оставляем объект
                    return !values.some(value => String(value) === chatId);
                });
                if (chat_news[key].length !== originalLength) {flag++;}
            }
        });
		if(flag)
		{	let obj = require(TokenDir+"/chatId.json");
			obj.chat_news = chat_news;
			WriteFileJson(TokenDir+"/chatId.json",obj);
			WriteLogFile('Чат '+chatId+' удален из списка чатов.');
		}
	}		
 }catch(err){WriteLogFile('Не могу распарсить item из ошибки очереди');}
});
//queue.on('retry', (item, error, attempt) => {WriteLogFile('Повторная попытка '+attempt+' для '+item.id+': '+error.message);});
queue.on('connected', () => {WriteLogFile('=> bot connected');});
queue.on('disconnected', (error) => {WriteLogFile(error+'; => bot disconnected');});
//queue.on('processing_started', (item) => {WriteLogFile('processing_started, queue length = '+item);});
//queue.on('processing_finished', () => {WriteLogFile('processing_finished');});
//queue.on('cleared', (item) => {WriteLogFile('cleared = '+item);});
//====================================================================
//преобразуем массив объектов в объект с массивами
function transform_chat2obj(arr)
{	let obj = {};
	let zona = (utcOffset>0) ? ('+'+utcOffset) : String(utcOffset);
	obj[zona] = [];//таймзона по-умолчанию, в ней массив объектов
	for(let i=0; i<arr.length; i++) {if(typeof(arr[i])==='object') obj[zona].push(arr[i]);}
	
	return obj;
}
//====================================================================
//возвращает таймстамп юзера в формате moment()
function getUserDateTime(now, offset)
{	offset = Number(offset);
	let userTime = now.unix() + ((offset - utcOffset) * 60);//в сек
	return moment.unix(userTime);//дата/время юзера
}
//====================================================================
function getDateTimeForZone(inputStr, offset)
{
    let offsetNum = Number(offset);
	// Проверяем формат
    if (inputStr.includes('.'))
	{	// Это дата DD.MM.YYYY - возвращаем начало этого дня в зоне
        return moment.utc(inputStr, 'DD.MM.YYYY')
            .utcOffset(offsetNum, true)
            .startOf('day');
    } 
	else if (inputStr.includes(':'))
	{
        // Это время HH:mm:ss - возвращаем это время сегодня в зоне
        let [hours, minutes, seconds] = inputStr.split(':').map(Number);
        return moment().utc()
            .utcOffset(offsetNum, true)
            .startOf('day')
            .hours(hours)
            .minutes(minutes)
            .seconds(seconds || 0);
    } 
	else throw new Error('Неизвестный формат: ' + inputStr);
}
//====================================================================
//соберем все чаты в новый массив
function getAllChats()
{
	let obj = chat_news;
	let all_chats = [];
	let keys = (obj && typeof obj === 'object') ? Object.keys(obj) : [];//смещения
	if(keys.length==0) return all_chats;
	for(let i=0;i<keys.length;i++)
	{	let chats = obj[keys[i]];//массив объектов чатов
		if(chats.length==0) continue;
		for(let j=0;j<chats.length;j++) all_chats.push(chats[j]);
	}
	return all_chats;
}
//====================================================================
//возвращает таймстамп файла Ежика на сегодня в формате moment()
function getEgDateTime(refpath)
{	let now = moment();//по-умолчанию
	if(!fs.existsSync(refpath)) {WriteLogFile('getEgDateTime(refPath) - некорректный путь = '+refpath); return now;}
	const timestampPath = path.join(path.dirname(refpath), 'timestamp.json');//к файлу с unixtimestamp
	if(fs.existsSync(timestampPath))
	{	try {const obj = JSON.parse(fs.readFileSync(timestampPath));
			if(!!obj.UnixTime) now = moment.unix(obj.UnixTime);//дата/время создания файла Ежика
		} 
		catch (err) {console.log(err);}
	}

	return now;
}
//====================================================================

