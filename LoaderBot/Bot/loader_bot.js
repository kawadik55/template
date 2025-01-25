process.env["NTBA_FIX_350"] = 1;
const fs = require('fs');
const path = require('path');
const moment = require('moment');
const TelegramBot = require('node-telegram-bot-api');
const currentDir = (process.env.CURRENT_DIR) ? process.env.CURRENT_DIR : __dirname;
const PathToImages = currentDir+'/images';//путь к файлам на выполнение
const PathToImagesModer = currentDir+'/moder';//путь к файлам на выполнение
const FileUserList = currentDir+"/UserList.txt";//имя файла белого листа
const FileBlackList = currentDir+"/BlackList.txt";//имя файла черного листа
const FileAdminList = currentDir+"/AdminList.txt";//имя файла списка админов
const FileAdminBot = currentDir+"/AdminBot.txt";//имя файла списка админов бота
const FileImagesList = currentDir+"/ImagesList.txt";//имя файла списка файлов.
const FileTextList = currentDir+"/TextList.txt";//имя файла списка текстов
const FileModerImagesList = currentDir+"/ModerImagesList.txt";//имя файла списка файлов на модерацию
const FileModerTextList = currentDir+"/ModerTextList.txt";//имя файла списка текстов на модерацию
const FileBackUpText = currentDir+"/BackUpText.txt";//имя файла бэкапа текстов
const TokenDir=currentDir+"/../Token";//путь к папке с токенами, на уровень выше
const smilik = '¯\\_(ツ)_/¯';
const PathToLog = currentDir+'/../log';//путь к логам
const LOGGING = true;//включение/выключение записи лога в файл
let area = 'АН';//местность
let timePablic='06:00:00';//опорное машинное время выхода публикаций на текущие сутки по-умолчанию
let forDate=[3,0];//массив дней по дате - 3й и 0й день, если меньше 2х недель
let lifeTime=180;//время жизни юзера в днях
let config={};
try{config = JSON.parse(fs.readFileSync(currentDir+"/config.json"));
	if(!config.lifeTime) {config.lifeTime = lifeTime; WriteFileJson(currentDir+"/config.json",config);}
}catch(err)
{config = {"area":area, "timePablic":timePablic, "forDate":forDate, "lifeTime":lifeTime};
 WriteFileJson(currentDir+"/config.json",config);
}
area = config.area; timePablic = config.timePablic; forDate = config.forDate; lifeTime = config.lifeTime;
//проверим папку логов
if(!fs.existsSync(PathToLog)) {fs.mkdirSync(PathToLog); fs.chmod(currentDir+"/../log", 0o777, () => {});}
const LogFile = PathToLog+'/loader_bot.txt';
//---------------------------------------------------
//сразу проверяем или создаем необходимые папки и файлы
setContextFiles();
//---------------------------------------------------
const chat_Supervisor = require(TokenDir+"/chatId.json").Supervisor;//пользователь 'Supervisor'
// выбор токена
let tokenLoader = '', tokenNews = '', chat_news = [];
tokenLoader = require(TokenDir+"/loader_bot.json").token;
var namebot = 'unnown';
try{namebot = require(TokenDir+"/loader_bot.json").comment;}catch(err){console.log(err);}//юзернейм бота
tokenNews = require(TokenDir+"/news_bot.json").token;
//Загрузим ID новостных каналов
(async () => 
{try{
 let mas = require(TokenDir+"/chatId.json");
 if(Object.hasOwn(mas, 'chat_news'))
 {let key = Object.keys(mas.chat_news);
  for(let i=0;i<key.length;i++) {chat_news[i] = mas.chat_news[key[i]];}
 }
 else chat_news[0]='-12345';
 }catch(err) {console.log(err);}	
})();

const LoaderBot = new TelegramBot(tokenLoader, {polling: true});
const NewsBot = new TelegramBot(tokenNews, {polling: false});//этот без поллинга
let tokenLog;
try{tokenLog = require(TokenDir+"/logs_bot.json").token;}catch(err){console.log(err);}
var logBot;
if(!!tokenLog) logBot = new TelegramBot(tokenLog, {polling: false});//бот для вывода лог-сообщений
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

const TmpPath = "/tmp";//путь для временных файлов
let forDeleteList = [];//список файлов на удаление
//let keyboard = require(currentDir+"/knopki.json");// массив клавиатур из файла
//====================================================================
function klava(keyb)
{try{	
	let arr = new Object();
	arr.reply_markup = new Object();
	arr.reply_markup.inline_keyboard = keyb;
	arr.parse_mode = "markdown";
	return arr;
}catch(err){WriteLogFile(err+'\nfrom klava()');}
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

/*(async () => {   
	let time = moment(timePablic,'HH:mm:ss');//время "Ч"
	let now = moment('00:00:00','HH:mm:ss');//текущее время
	let sec = now.diff(time, 'seconds');//разница в секундах
	console.log('sec='+sec);
})();*/
WriteLogFile('Запуск бота @'+namebot,'непосылать');
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
	
	let str='Привет, '+name+'! Это чат-бот сообщества '+area+'! ';
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
}catch(err){WriteLogFile(err+'\nfrom /start/');}
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
		let date = '', day = '';
		if(WaitFlag[chatId]==1)
		{	if(!!TempPost[chatId] && !!TempPost[chatId].date) 		date = TempPost[chatId].date;//дата
			if(!!TempPost[chatId] && !!TempPost[chatId].dayOfWeek) 	day = TempPost[chatId].dayOfWeek;//день
			delete WaitFlag[chatId];
		}
		if(!day || !date)
		{	numOfDelete[chatId]='';
			delete WaitFlag[chatId];
			delete TempPost[chatId];
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
			delete WaitFlag[chatId];
			delete TempPost[chatId];
			sendMessage(chatId, 'Неожиданная дата или период... игнорирую.', klava(begin(chatId)));
			return;
		}
		
		//загружаем картинку на модерацию
		let path;
		try {path = await LoaderBot.downloadFile(msg.photo[msg.photo.length-1].file_id, TmpPath);}
		catch(err)
		{sendMessage(chatId, 'Эта картинка слишком велика, разрешено не более 20Мб', klava(begin(chatId)));
		 numOfDelete[chatId]='';
		 delete WaitFlag[chatId];
		 delete TempPost[chatId];
		 return;
		}
		
		let mas = path.split('/');
		let fileName = moment().format('DDMMYYYY-HH_mm_ss_ms')+'-'+mas[mas.length-1];//вытащим и изменим имя файла
        let newpath = PathToImagesModer+'/'+fileName;//новый путь файла для модерации
		if(Object.hasOwn(msg, 'caption')) TempPost[chatId].caption = msg.caption;//подпись
		if(Object.hasOwn(msg, 'caption_entities')) TempPost[chatId].caption_entities = JSON.stringify(msg.caption_entities);//форматирование
		TempPost[chatId].type = 'image';//тип - картинка
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
		}
		//переносим картинку и записываем в список картинок на модерацию
		let len = await setToModerImagesList(path, newpath, TempPost[chatId]);//получаем последний индекс
            
		//пошлем сообщение админам
		sendMessageToAdmin('Юзер "'+name+'" ('+user+') просит добавить картинку '+'"'+date+' ('+day+')"');
			
		sendMessage(chatId, 'Поздравляю, '+name+'! Картинка "'+date+' ('+day+')" отправлена на модерацию!', klava(begin(chatId)));
		delete TempPost[chatId];
	}
}catch(err){WriteLogFile(err+'\nfrom LoaderBot.on(photo)');}
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
		let date = '', day = '';
		if(WaitFlag[chatId]==1)
		{	if(!!TempPost[chatId] && !!TempPost[chatId].date) 		date = TempPost[chatId].date;//дата
			if(!!TempPost[chatId] && !!TempPost[chatId].dayOfWeek) 	day = TempPost[chatId].dayOfWeek;//день
			delete WaitFlag[chatId];
		}
		if(!day || !date)
		{	numOfDelete[chatId]='';
			delete WaitFlag[chatId];
			delete TempPost[chatId];
			sendMessage(chatId, 'Неожиданно... игнорирую.', klava(begin(chatId)));
			return;
		}
		//проверяем подпись
		if(Object.hasOwn(msg, 'caption') && msg.caption.length > 1000)
		{	sendMessage(chatId, '🤷‍♂️Сожалею, но подпись к ролику не может превышать 1000 символов!🤷‍♂️', klava(keyboard['3']));
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
		
		//загружаем ролик на модерацию
		let path;
		try {path = await LoaderBot.downloadFile(msg.video.file_id, TmpPath);}
		catch(err)
		{sendMessage(chatId, 'Этот ролик слишком велик, разрешено не более 20Мб', klava(begin(chatId)));
		 numOfDelete[chatId]='';
		 delete TempPost[chatId];
		 return;
		}
		
		let mas = path.split('/');
		let fileName = moment().format('DDMMYYYY-HH_mm_ss_ms')+'-'+mas[mas.length-1];//вытащим и изменим имя файла
        let newpath = PathToImagesModer+'/'+fileName;//новый путь файла для модерации
		if(Object.hasOwn(msg, 'caption')) TempPost[chatId].caption = msg.caption;//подпись
		if(Object.hasOwn(msg, 'caption_entities')) TempPost[chatId].caption_entities = JSON.stringify(msg.caption_entities);//форматирование
		TempPost[chatId].type = 'video';//тип - видео
		//переносим ролик и записываем в список файлов на модерацию
		let len = await setToModerImagesList(path, newpath, TempPost[chatId]);//получаем последний индекс
            
		//пошлем сообщение админам
		sendMessageToAdmin('Юзер "'+name+'" ('+user+') просит добавить ролик '+'"'+date+' ('+day+')"');
			
		sendMessage(chatId, 'Поздравляю, '+name+'! Ролик "'+date+' ('+day+')" отправлен на модерацию!', klava(begin(chatId)));
		delete TempPost[chatId];
	}
}catch(err){WriteLogFile(err+'\nfrom LoaderBot.on(video)');}
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
		let date = '', day = '';
		if(WaitFlag[chatId]==1)
		{	if(!!TempPost[chatId] && !!TempPost[chatId].date) 		date = TempPost[chatId].date;//дата
			if(!!TempPost[chatId] && !!TempPost[chatId].dayOfWeek) 	day = TempPost[chatId].dayOfWeek;//день
			delete WaitFlag[chatId];
		}
		if(!day || !date)
		{	numOfDelete[chatId]='';
			delete WaitFlag[chatId];
			delete TempPost[chatId];
			sendMessage(chatId, 'Неожиданно... игнорирую.', klava(begin(chatId)));
			return;
		}
		//проверяем подпись
		if(Object.hasOwn(msg, 'caption') && msg.caption.length > 1000)
		{	sendMessage(chatId, '🤷‍♂️Сожалею, но подпись к аудио не может превышать 1000 символов!🤷‍♂️', klava(keyboard['3']));
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
		//переносим ролик и записываем в список файлов на модерацию
		let len = await setToModerImagesList(path, newpath, TempPost[chatId]);//получаем последний индекс
            
		//пошлем сообщение админам
		sendMessageToAdmin('Юзер "'+name+'" ('+user+') просит добавить аудио '+'"'+date+' ('+day+')"');
			
		sendMessage(chatId, 'Поздравляю, '+name+'! Аудиотрек "'+date+' ('+day+')" отправлен на модерацию!', klava(begin(chatId)));
		delete TempPost[chatId];
	}
}catch(err){WriteLogFile(err+'\nfrom LoaderBot.on(audio)');}
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
		let date = '', day = '';
		if(WaitFlag[chatId]==1)
		{	if(!!TempPost[chatId] && !!TempPost[chatId].date) 		date = TempPost[chatId].date;//дата
			if(!!TempPost[chatId] && !!TempPost[chatId].dayOfWeek) 	day = TempPost[chatId].dayOfWeek;//день
			delete WaitFlag[chatId];
		}
		if(!day || !date)
		{	numOfDelete[chatId]='';
			delete WaitFlag[chatId];
			delete TempPost[chatId];
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
		//переносим ролик и записываем в список файлов на модерацию
		let len = await setToModerImagesList(path, newpath, TempPost[chatId]);//получаем последний индекс
            
		//пошлем сообщение админам
		sendMessageToAdmin('Юзер "'+name+'" ('+user+') просит добавить документ '+'"'+date+' ('+day+')"');
			
		sendMessage(chatId, 'Поздравляю, '+name+'! Документ "'+date+' ('+day+')" отправлен на модерацию!', klava(begin(chatId)));
		delete TempPost[chatId];
	}
}catch(err){WriteLogFile(err+'\nfrom LoaderBot.on(document)');}
});
//====================================================================
// ловим тексты
LoaderBot.on('message', async (msg) => 
{	
try{	
	if(!msg.text) {return;}//если текста нет
	if(msg.text.slice(0,1)=='/') return;//если команда
	
	const chatId = msg.chat.id;
	const name = ' '+msg.chat.first_name;
	const user = '@'+msg.chat.username;
	let ban = banUser(chatId);
	let valid = validUser(chatId);
	
	//проверим юзера
	if(ban) sendMessage(chatId, 'Извините, ' + name + ', но Вы забанены! Обратитесь к админу.');
	else if(!valid)
	{	sendMessage(chatId, 'Извините, ' + name + ', но Вам необходимо сначала пройти авторизацию!');
		send_instruction(chatId,user,'');
	}
	else //все в порядке
	{
	  //проверяем текст
		if(msg.text.length > 4050)
		{	sendMessage(chatId, '🤷‍♂️Сожалею, но длина текста не может превышать 4000 символов!🤷‍♂️', klava(keyboard['3']));
			delete WaitFlag[chatId];//удаляем из листа ожиданий
			delete TempPost[chatId];
			numOfDelete[chatId]='';
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
		await sendMessage(chatId, TempPost[chatId].text, obj);//показываем присланный текст
		await sendMessage(chatId, '👆Вот что я получил.👆\nДата="'+date+' ('+day+')"\nВсе ли верно?', klava(keyboard['2']));
	  }
	  //----------------------------------------------------------------
	  //второй стейт - сюда входим только если ждем Дату
	  else if(WaitFlag[chatId]==2)
	  {	let mark = WaitFlag[chatId];
		delete WaitFlag[chatId];//удаляем из листа ожиданий
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
			let str = 'Теперь пришлите мне один пост (текст, картинка, видео, аудио, документ), который необходимо опубликовать. ';
			str += 'Его можно просто скопировать-вставить из любого чата, или загрузить из хранилища. ';
			str += 'Форматирование текста и подписи сохраняется.';
			WaitFlag[chatId]=1;//взводим флаг ожидания текста или файла от юзера
			await sendMessage(chatId, str, klava(keyboard['3']));
			//теперь будем ждать или текст, или файл
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
			 if(Object.hasOwn(List[num], 'type'))
			 {if(List[num].type == 'image') {await sendPhoto(chatId, List[num].path, opt);}
			  else if(List[num].type == 'video') {await sendVideo(chatId, List[num].path, opt);}
			  else if(List[num].type == 'audio') {await sendAudio(chatId, List[num].path, opt);}
			  else if(List[num].type == 'document') {await sendDocument(chatId, List[num].path, opt);}
			 }
			 else await sendPhoto(chatId, List[num].path, opt);
			}
			
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
			if(Object.hasOwn(ImagesList[num], 'type'))
			{if(ImagesList[num].type == 'image') {await sendPhoto(chatId, ImagesList[num].path, opt);}
			 else if(ImagesList[num].type == 'video') {await sendVideo(chatId, ImagesList[num].path, opt);}
			 else if(ImagesList[num].type == 'audio') {await sendAudio(chatId, ImagesList[num].path, opt);}
			 else if(ImagesList[num].type == 'document') {await sendDocument(chatId, ImagesList[num].path, opt);}
			}
			else await sendPhoto(chatId, ImagesList[num].path, opt);
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
			if(Object.hasOwn(ModerImagesList[num], 'type'))
			{if(ModerImagesList[num].type == 'image') {await sendPhoto(chatId, ModerImagesList[num].path, opt);}
			 else if(ModerImagesList[num].type == 'video') {await sendVideo(chatId, ModerImagesList[num].path, opt);}
			 else if(ModerImagesList[num].type == 'audio') {await sendAudio(chatId, ModerImagesList[num].path, opt);}
			 else if(ModerImagesList[num].type == 'document') {await sendDocument(chatId, ModerImagesList[num].path, opt);}
			}
			else await sendPhoto(chatId, ModerImagesList[num].path, opt);
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
		 {if(ModerImagesList[numOfDelete[chatId]].type == 'image') {await sendPhoto(ModerImagesList[numOfDelete[chatId]].chatId, ModerImagesList[numOfDelete[chatId]].path, opt);}
		  else if(ModerImagesList[numOfDelete[chatId]].type == 'video') {await sendVideo(ModerImagesList[numOfDelete[chatId]].chatId, ModerImagesList[numOfDelete[chatId]].path, opt);}
		  else if(ModerImagesList[numOfDelete[chatId]].type == 'audio') {await sendAudio(ModerImagesList[numOfDelete[chatId]].chatId, ModerImagesList[numOfDelete[chatId]].path, opt);}
		  else if(ModerImagesList[numOfDelete[chatId]].type == 'document') {await sendDocument(ModerImagesList[numOfDelete[chatId]].chatId, ModerImagesList[numOfDelete[chatId]].path, opt);}
		 }
		 else await sendPhoto(ModerImagesList[numOfDelete[chatId]].chatId, ModerImagesList[numOfDelete[chatId]].path, opt);
		 await sendMessage(ModerImagesList[numOfDelete[chatId]].chatId, '😢 К сожалению этот файл не прошел модерацию и был удален по причине:\n'+msg.text);
		}
		try//удаляем сам файл
		{	fs.unlinkSync(ModerImagesList[numOfDelete[chatId]].path);
		} catch (e) {console.log(e);}
		delete ModerImagesList[numOfDelete[chatId]];//удаляем запись в списке
		await sendMessage(chatId, 'Выбранный файл успешно удален!', klava(get_keyb100()));
		ModerImagesList = shiftObject(ModerImagesList);//упорядочиваем номера-ключи в массиве
		WriteFileJson(FileModerImagesList,ModerImagesList);//сохраняем вычищенный список
		numOfDelete[chatId]='';
	  }
	  //----------------------------------------------------------------
	  else //если пришел текст 'от фонаря'
	  {	if(forDeleteList.length > 0) forDeleteList = [];//очищаем список удаляемых файлов
		delete TempPost[chatId];//удаляем из временного текста
		delete WaitFlag[chatId];//удаляем из листа ожиданий
		numOfDelete[chatId]='';
		//сохраняем для посл.удаления
		let chat_id='', mess_id='';
		if(LastMessId[chatId]) {chat_id=chatId; mess_id=LastMessId[chatId].messId;}
		welcome(chatId,name);
	  }	
	}
}catch(err){WriteLogFile(err+'\nfrom LoaderBot.on(message)');}
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
		if(state>=10 && !(validAdmin(chatId) | validAdminBot(chatId))) return;
		
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
                await sendMessage(chatId, str, klava(keyboard['3']));//В Начало
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
			{	delete TempPost[chatId];//удаляем временный текст
                delete WaitFlag[chatId];
                numOfDelete[chatId]='';
				await sendMessage(chatId, 'Не беда! Давайте попробуем еще разок с начала!', klava(begin(chatId)));
			}
			else if(button=='Назад')
			{	delete WaitFlag[chatId];
				delete TempPost[chatId];//удаляем временный текст
				numOfDelete[chatId]='';
				welcome(chatId,name);
			}
		}
		//------------ В Начало ----------------------------------------
		else if(state==3)
		{	if(WaitFlag[chatId]) delete WaitFlag[chatId];
			if(TempPost[chatId]) delete TempPost[chatId];
			numOfDelete[chatId]='';
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
			{	let date = moment().add(1,'day').format('DD.MM.YYYY');//дата на завтра в строке
				TempPost[chatId].date = date;//запоминаем дату
				str = 'Режим Завтра, на '+date+'\n';
				str += 'Теперь пришлите мне один пост (текст, картинка, видео, аудио, документ), который необходимо опубликовать. ';
				str += 'Его можно просто скопировать-вставить из любого чата, или загрузить из хранилища. ';
				str += 'Форматирование текста и подписи сохраняется.';
				WaitFlag[chatId]=1;//взводим флаг ожидания текста или файла от юзера
				await sendMessage(chatId, str, klava(keyboard['3']));
				//теперь будем ждать или текст, или файл
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
				try//удаляем сам файл
				{	fs.unlinkSync(ImagesList[numOfDelete[chatId]].path);
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
				await sendMessage(chatId, str, klava(keyboard['102']));//Назад	
			}
			else if(button=='Публиковать Файлы')
			{	if(Object.keys(ModerImagesList).length > 0)
				{
					await showModerImagesList(chatId, 0);
					let str = 'Публикуем эти файлы?';
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
				numOfDelete[chatId]='';
				delete WaitFlag[chatId];//удаляем из листа ожиданий
			}
		}
		//------------ Назад ----------------------------------------
		else if(state==102)
		{	if(WaitFlag[chatId]) delete WaitFlag[chatId];
			if(TempPost[chatId]) delete TempPost[chatId];
			numOfDelete[chatId]='';
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
				numOfDelete[chatId]='';
				delete WaitFlag[chatId];//удаляем из листа ожиданий
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
				for(var key in ModerTextList)
				{	await setToTextList(ModerTextList[key]);//сохраняем в списке текстов
					//публикуем текст прямо сейчас, если дата или день недели совпадает
					await publicText(ModerTextList[key]);
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
				}
				//теперь очистим массив модерации
				ModerTextList = new Object();
				WriteFileJson(FileModerTextList,ModerTextList);//сохраняем вычищенный список
				sendMessage(chatId, 'Сделано, шеф!', klava(get_keyb100()));
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
				for(var key in ModerImagesList)
				{	//сообщаем отправителю
					if(Object.hasOwn(ModerImagesList[key], 'chatId'))
					{let opt=new Object();
					 opt.caption = ModerImagesList[key].caption;
					 if(Object.hasOwn(ModerImagesList[key], 'caption_entities')) opt.caption_entities = ModerImagesList[key].caption_entities;
					 if(Object.hasOwn(ModerImagesList[key], 'type'))
					 {if(ModerImagesList[key].type == 'image') {await sendPhoto(ModerImagesList[key].chatId, ModerImagesList[key].path, opt);}
					  else if(ModerImagesList[key].type == 'video') {await sendVideo(ModerImagesList[key].chatId, ModerImagesList[key].path, opt);}
					  else if(ModerImagesList[key].type == 'audio') {await sendAudio(ModerImagesList[key].chatId, ModerImagesList[key].path, opt);}
					  else if(ModerImagesList[key].type == 'document') {await sendDocument(ModerImagesList[key].chatId, ModerImagesList[key].path, opt);}
					 }
					 else await sendPhoto(ModerImagesList[key].chatId, ModerImagesList[key].path, opt);
					 await sendMessage(ModerImagesList[key].chatId, '👍🏻 Ура! Этот файл прошел модерацию и будет опубликован!!');
					}
					let path = ModerImagesList[key].path;
					let mas = path.split('/');
					let fileName = mas[mas.length-1];//вытащим имя файла
					let newpath = PathToImages+'/'+fileName;//новый путь файла для модерации
					//переносим файл и записываем в список файлов
					let len = await setToImagesList(newpath, ModerImagesList[key]);//получаем последний индекс
					//публикуем файл сразу первый раз, если по Дате, или день недели совпадает
					await publicImage(ImagesList[len]);
				}
				//теперь очистим массив модерации
				ModerImagesList = new Object();
				WriteFileJson(FileModerImagesList,ModerImagesList);//сохраняем вычищенный список
				sendMessage(chatId, 'Сделано, шеф!', klava(get_keyb100()));
			}
			else
			{	await sendMessage(chatId, 'Вот и хорошо, торопиться не будем!', klava(get_keyb100()));
			}
		}
	}
}catch(err){WriteLogFile(err+'\nfrom LoaderBot.on(callback_query)');}
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
		str += '/help - список команд бота\n';
		str += '/UserList - список авторизованных юзеров\n';
		//str += '/BlackList - список забаненных юзеров\n';
		str += '/AdminList - посмотреть настройки\n';
		str += '/ShowTextList - посмотреть тексты\n';
		str += '/ShowImagesList - посмотреть картинки\n';
		str += '/ShowLifeTime - посмотреть общий срок жизни юзеров\n';
		str += '/AddUser chatID=Имя=НазваниеГруппы - добавить Юзера\n';
		str += '/AddAdmin chatID=Имя - добавить Админа Бота\n';
		str += '/AddWhatsApp chatID=Имя - добавить Координатора Вотсап\n';
		//str += '/AddBan chatID=Имя - добавить в Черный список\n';
		str += '/DeleteFiles - удаление старых картинок\n';
		str += '/DelAdmin chatID - удалить Админа Бота\n';
		str += '/DelWhatsApp - удалить Координатора Вотсап\n';
		str += '/DelUser chatID - удалить Юзера\n';
		str += '/EditUrl новыйUrl - изменить ссылку в Вопросах\n';
		str += '/EditLifeTime новыйСрок - изменить срок жизни юзеров\n';
		//str += '/DelBan chatID - удалить из Черного списка\n';
		sendMessage(chatId, str);
	}
	else sendMessage(chatId, smilik);
}catch(err){WriteLogFile(err+'\nfrom LoaderBot.on(/help/)');}
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
        for(let i in keys) str += keys[i]+' : '+UserList[keys[i]][0]+' ('+UserList[keys[i]][1]+')\n';
		sendMessage(chatId, str);
	}
	else sendMessage(chatId, smilik);
}catch(err){WriteLogFile(err+'\nfrom LoaderBot.on(/UserList/)');}
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
}catch(err){WriteLogFile(err+'\nfrom LoaderBot.on(/BlackList/)');}
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
}catch(err){WriteLogFile(err+'\nfrom LoaderBot.on(/AdminList/)');}
});
//====================================================================
// Добавить Админа Бота
LoaderBot.onText(/\/AddAdmin/, async (msg) => 
{
try{
	const chatId = msg.chat.id;
	let valid = validAdmin(chatId);//только для СуперАдминов
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
}catch(err){WriteLogFile(err+'\nfrom LoaderBot.on(/AddAdmin/)');}
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
}catch(err){WriteLogFile(err+'\nfrom LoaderBot.on(/AddWhatsApp/)');}
});
//====================================================================
// Добавить Юзера
LoaderBot.onText(/\/AddUser/, async (msg) => 
{
try{
	const chatId = msg.chat.id;
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
		UserList[id] = mas;//добавляем новичка
		WriteFileJson(FileUserList,UserList);//записываем файл

		str = 'Новый Пользователь бота:\n'
        str += UserList[id][0]+'('+UserList[id][1]+')';
        sendMessage(chatId, str);
    }
	else sendMessage(chatId, smilik);
}catch(err){WriteLogFile(err+'\nfrom LoaderBot.on(/AddUser/)');}
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
}catch(err){WriteLogFile(err+'\nfrom LoaderBot.on(/AddBun/)');}
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
}catch(err){WriteLogFile(err+'\nfrom LoaderBot.on(/ImagesList/)');}	
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
}catch(err){WriteLogFile(err+'\nfrom LoaderBot.on(/ShowUserList/)');}	
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
}catch(err){WriteLogFile(err+'\nfrom LoaderBot.on(/ShowLifeTime/)');}	
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
}catch(err){WriteLogFile(err+'\nfrom LoaderBot.on(/TextList/)');}	
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
}catch(err){WriteLogFile(err+'\nfrom LoaderBot.on(/ShowTextList/)');}	
});
//====================================================================
// Удаление Админа Бота
LoaderBot.onText(/\/DelAdmin/, async (msg) => 
{	
try{
	const chatId = msg.chat.id;
	let valid = validAdmin(chatId);//только для СуперАдминов
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
}catch(err){WriteLogFile(err+'\nfrom LoaderBot.on(/DelAdmin/)');}	
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
}catch(err){WriteLogFile(err+'\nfrom LoaderBot.on(/DelWhatsApp/)');}	
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
}catch(err){WriteLogFile(err+'\nfrom LoaderBot.on(/DelUser/)');}	
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
}catch(err){WriteLogFile(err+'\nfrom LoaderBot.on(/DelBan/)');}	
});
//====================================================================
// Очистка папки картинок от старых файлов
LoaderBot.onText(/\/DeleteFiles/, async (msg) => 
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
}catch(err){WriteLogFile(err+'\nfrom LoaderBot.on(/DeleteFiles/)');}	
});
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
}catch(err){WriteLogFile(err+'\nfrom LoaderBot.on(/EditUrl/)');}	
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
}catch(err){WriteLogFile(err+'\nfrom LoaderBot.on(/EditLifeTime/)');}	
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
    for(let key in ImagesList)
	{	let time = moment(ImagesList[key].date,'DD.MM.YYYY');
		if(!isNaN(time))//только по дате
		{let days = time.diff(now, 'days')+1;
		 if(days<=0 || !time)//если вчерашняя и далее 
		 {try{fs.unlinkSync(ImagesList[key].path);} catch(err){}//удаляем файл из папки
		  delete ImagesList[key];//удаляем запись, если просрочена
		  flag = 1;
		 }
		}
		else if(ImagesList[key].date==='')//удаляем запись, как битую
		{try{fs.unlinkSync(ImagesList[key].path);} catch(err){}//удаляем файл из папки
		 delete ImagesList[key]; 
		 flag = 1;
		}
	}
	if(flag) WriteFileJson(FileImagesList,ImagesList);//сохраняем вычищенный список
	
	//Удаляем старые файлы, потерянные
	const isFile = fileName => {return fs.lstatSync(fileName).isFile()};
    //загружаем список файлов из Images - полный путь
    let FilesList = fs.readdirSync(PathToImages).map(fileName => {return path.join(PathToImages, fileName)}).filter(isFile);
    //сравниваем с файлами из рабочего списка и удаляем ненужные
    let key=[];
	for(let i in ImagesList) key.push(ImagesList[i].path);//собираем массив рабочих путей из списка
    for(let i in FilesList)
    {	//если в папке есть файл, которого нет в рабочем списке
		if(key.indexOf(FilesList[i])==-1)
        {	fs.unlinkSync(FilesList[i]);
		}
    }
	//---------------------------------------------
	//список текстов
	await readTextList();//читаем файл текстов в TextList
	for(let key in TextList)
	{	let time = moment(TextList[key].date,'DD.MM.YYYY');
		if(!isNaN(time))//только по дате
		{let days = time.diff(now, 'days')+1;
		 if(days<=0)//если вчерашняя и далее
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
}catch(err){WriteLogFile(err+'\nfrom SetInterval()');}		
},2*3600000);
//====================================================================
async function send_instruction(chatId,user,pass)
{try{	
	let str = "";
	str += "Обратитесь, пожалуйста, к Админу бота для регистрации.";
	//let but = keyboard['1']; but.splice(0,1);//оставляем только Вопросы
	//await sendMessage(chatId, str, klava(but));
	await sendMessage(chatId, str, klava(keyboard['1']));
}catch(err){WriteLogFile(err+'\nfrom send_instruction()');}
}
//====================================================================
//запись в файл объекта, массива
async function WriteFileJson(path,arr)
{
try{
	if(typeof arr === 'object') res = fs.writeFileSync(path, JSON.stringify(arr,null,2));
    else res = fs.writeFileSync(path, arr);
}catch(err){console.log(err+'\nfrom WriteFileJson()'); WriteLogFile(err+'\nfrom WriteFileJson()');}
}
//====================================================================
//запись с бэкап файл массива с добавлением в конец
function AppendFileJson(path,arr)
{
try{
	fs.appendFile(path, JSON.stringify(arr,null,2), (err) => 
	{if(err) {console.log(err);}
	});
}catch(err){WriteLogFile(err+'\nfrom AppendFileJson()');}
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
			WriteLogFile(err+'По сроку давности удален пользователь "'+chatId+'":\n'+JSON.stringify(tmp,null,2));
		}
	}
	if(!!UserList[chatId]) return true;//есть в юзерах
	else if(validAdmin(chatId)) return true;//есть в админах
	else if(validAdminBot(chatId)) return true;//есть в админах бота
	else if(chatId==chat_coordinatorWhatsApp) return true;//координатор вотсап
	else return false;//нету нигде
}catch(err){WriteLogFile(err+'\nfrom validUser()');}
}
//====================================================================
//проверка админа на валидность
function validAdmin(chatId)
{	
try{
	const keys = Object.keys(AdminList);
	
	if(keys.indexOf(''+chatId)+1 || chatId==chat_Supervisor) return true;//есть в разрешенных
	else return false;//нет в разрешенных
}catch(err){WriteLogFile(err+'\nfrom validAdmin()');}	
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
}catch(err){WriteLogFile(err+'\nfrom ValidAdminBot()');}	
}
//====================================================================
//проверка банов
function banUser(chatId)
{
try{
	const bans = Object.keys(BlackList);
	
	if(bans.indexOf(''+chatId)+1) return true;//есть в банах
	else return false;//нет в банах
}catch(err){WriteLogFile(err+'\nfrom banUser()');}	
}
//====================================================================
function welcome(chatId,name)
{	
try{
	let str='';
	str+='Для загрузки текста или файла (картинка, видео, аудио, документ) просто нажми соответствующую кнопку и следуй моим подсказкам.';
	sendMessage(chatId, str, klava(begin(chatId)));
}catch(err){WriteLogFile(err+'\nfrom welcome()');}	
}
//====================================================================
async function sendMessage(chatId,str,option)
{
try{	
	if(Number(chatId)<0) return;//отрицательные chatId не пускаем
	if(!isValidChatId(chatId)) return;//если не число, то не пускаем
	//сохраняем для посл.удаления
	let chat_id='', mess_id='';
	if(LastMessId[chatId]) {chat_id=chatId; mess_id=LastMessId[chatId].messId;}
	if(str.length > 4097) {str = str.substr(0,4096);}//обрезаем строку
	
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
	else {res=await LoaderBot.sendMessage(chatId, str/*, {parse_mode:"markdown"}*/);}

	return res;
}catch(err)
		{	/*if(!!res.chat.username) WriteLogFile(err+'\nfrom sendMessage("'+chatId+'", '+res.chat.username+')');
			else*/ WriteLogFile(err+'\nfrom sendMessage("'+chatId+'")');
		}
}
//====================================================================
async function sendPhoto(chatId, path, opt)
{
try{
	if(Number(chatId)<0) return;//отрицательные chatId не пускаем
	if(!isValidChatId(chatId)) return;//если не число, то не пускаем
	if(!!opt && !!opt.caption && opt.caption.length > 1024) {opt.caption = opt.caption.substr(0,1023);}//обрезаем подпись
	await LoaderBot.sendPhoto(chatId, path, opt);
	return true;
}catch(err){WriteLogFile(err+'\nfrom sendPhoto()');return Promise.reject(false);}
}
//====================================================================
async function sendVideo(chatId, path, opt)
{
try{
	if(Number(chatId)<0) return;//отрицательные chatId не пускаем
	if(!isValidChatId(chatId)) return;//если не число, то не пускаем
	if(!!opt && !!opt.caption && opt.caption.length > 1024) {opt.caption = opt.caption.substr(0,1023);}//обрезаем подпись
	await LoaderBot.sendVideo(chatId, path, opt);
	return true;
}catch(err){WriteLogFile(err+'\nfrom sendVideo()');return Promise.reject(false);}
}
//====================================================================
async function sendAudio(chatId, path, opt)
{
try{
	if(Number(chatId)<0) return;//отрицательные chatId не пускаем
	if(!isValidChatId(chatId)) return;//если не число, то не пускаем
	if(!!opt && !!opt.caption && opt.caption.length > 1024) {opt.caption = opt.caption.substr(0,1023);}//обрезаем подпись
	await LoaderBot.sendAudio(chatId, path, opt);
	return true;
}catch(err){WriteLogFile(err+'\nfrom sendAudio()');return Promise.reject(false);}
}
//====================================================================
async function sendDocument(chatId, path, opt)
{
try{
	if(Number(chatId)<0) return;//отрицательные chatId не пускаем
	if(!isValidChatId(chatId)) return;//если не число, то не пускаем
	if(!!opt && !!opt.caption && opt.caption.length > 1024) {opt.caption = opt.caption.substr(0,1023);}//обрезаем подпись
	await LoaderBot.sendDocument(chatId, path, opt);
	return true;
}catch(err){WriteLogFile(err+'\nfrom sendDocument()');return Promise.reject(false);}
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
		await WriteLogFile('выход из процесса по '+event, 'непосылать');
		process.exit();
	});
});
//====================================================================
async function readImagesList()
{   //список файлов
    try 
	{	ImagesList = shiftObject(JSON.parse(fs.readFileSync(FileImagesList))); 
		let flag=0;
		for(let key in ImagesList) 
		{	if(!fs.existsSync(ImagesList[key].path)) 
			{	await sendMessage(chat_Supervisor, 'Обнаружено отсутствие файла из списка '+ImagesList[key].path);
			}
		}
		return 'OK';
	}
    catch (err) {WriteLogFile(err+'\nfrom readImagesList()'); return 'NO';}
}
//====================================================================
function readModerImagesList()
{   //список файлов
    try {ModerImagesList = shiftObject(JSON.parse(fs.readFileSync(FileModerImagesList)));}
    catch (err) {WriteLogFile(err+'\nfrom readModerImagesList()');}
}
//====================================================================
async function readTextList()
{   //список текстов
    try {TextList = shiftObject(JSON.parse(fs.readFileSync(FileTextList))); return 'OK';}
    catch (err) {WriteLogFile(err+'\nfrom readTextList()'); return 'NO';}
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
}catch(err){WriteLogFile(err+'\nfrom readPostList()');}
}
//====================================================================
function readModerTextList()
{   //список текстов
    try {ModerTextList = shiftObject(JSON.parse(fs.readFileSync(FileModerTextList)));}
    catch (err) {WriteLogFile(err+'\nfrom readModerTextList()');}
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
			if(flag!=0) str = TextList[mas[i]].text + '\n\n** номер: '+mas[i]+' ** ('+TextList[mas[i]].date+' - '+TextList[mas[i]].dayOfWeek+')';//с номером
			else str = TextList[mas[i]].text + '\n\n('+TextList[mas[i]].date+' - '+TextList[mas[i]].dayOfWeek+')';//без номера
			let opt = {};
			opt.entities = TextList[mas[i]].entities; 
			opt.link_preview_options=TextList[mas[i]].link_preview_options;
			if(!!TextList[mas[i]].parse_mode) opt.parse_mode = TextList[mas[i]].parse_mode;
			await sendMessage(chatId, str, opt);
		}
	}
	else await sendMessage(chatId, '*Упс... А список то пустой!*\n', {parse_mode:"markdown"});
}catch(err){WriteLogFile(err+'\nfrom showTextList()');}
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
				if(flag!=0) str = List[mas[i]].text + '\n\n** номер: '+mas[i]+' ** ('+List[mas[i]].date+' - '+List[mas[i]].dayOfWeek+')';//с номером
				else str = List[mas[i]].text + '\n\n('+List[mas[i]].date+' - '+List[mas[i]].dayOfWeek+')';//без номера
				let opt = {};
				opt.entities = List[mas[i]].entities; 
				opt.link_preview_options=List[mas[i]].link_preview_options;
				if(!!List[mas[i]].parse_mode) opt.parse_mode = List[mas[i]].parse_mode;
				await sendMessage(chatId, str, opt);
			}
			else if(Object.hasOwn(List[mas[i]], 'path'))//это файл
			{	let opt = new Object();
				if(Object.hasOwn(List[mas[i]], 'caption')) 
				{	opt.caption = List[mas[i]].caption;
					opt.caption_entities = List[mas[i]].caption_entities;
				}
				else opt.caption = '';
				if(Object.hasOwn(List[mas[i]], 'parse_mode')) opt.parse_mode = List[mas[i]].parse_mode;
				if(flag!=0) opt.caption += "\n\n** номер: "+mas[i]+" ** ("+List[mas[i]].date+" - "+List[mas[i]].dayOfWeek+")";
				else opt.caption += "\n\n("+List[mas[i]].date+" - "+List[mas[i]].dayOfWeek+")";
				if(!!List[mas[i]].parse_mode) opt.parse_mode = List[mas[i]].parse_mode;
				if(Object.hasOwn(List[mas[i]], 'type'))
				{if(List[mas[i]].type=='image') {await sendPhoto(chatId, List[mas[i]].path, opt);}
				 else if(List[mas[i]].type=='video') {await sendVideo(chatId, List[mas[i]].path, opt);}
				 else if(List[mas[i]].type=='audio') {await sendAudio(chatId, List[mas[i]].path, opt);}
				 else if(List[mas[i]].type=='document') {await sendDocument(chatId, List[mas[i]].path, opt);}
				}
				else await sendPhoto(chatId, List[mas[i]].path, opt);
			}
		}
	}
	else await sendMessage(chatId, '*Упс... А список то пустой!*\n', {parse_mode:"markdown"});
}catch(err){WriteLogFile(err+'\nfrom showTextList()');}
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
			if(flag!=0) str = ModerTextList[mas[i]].text + '\n\n** номер: '+mas[i]+' ** ('+ModerTextList[mas[i]].date+' - '+ModerTextList[mas[i]].dayOfWeek+')';//с номером
			else str = ModerTextList[mas[i]].text + '\n\n('+ModerTextList[mas[i]].date+' - '+ModerTextList[mas[i]].dayOfWeek+')';//без номера
			let opt = {};
			opt.entities = ModerTextList[mas[i]].entities;
			opt.link_preview_options=ModerTextList[mas[i]].link_preview_options;
			if(!!ModerTextList[mas[i]].parse_mode) opt.parse_mode = ModerTextList[mas[i]].parse_mode;
			await sendMessage(chatId, str, opt);
		}
	}
	else await sendMessage(chatId, '*Упс... А список то пустой!*\n', {parse_mode:"markdown"});
}catch(err){WriteLogFile(err+'\nfrom showModerTextList()');}
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
			if(Object.hasOwn(ImagesList[key], 'caption')) 
			{	opt.caption = ImagesList[key].caption;
				opt.caption_entities = ImagesList[key].caption_entities;
			}
			else opt.caption = '';
			if(Object.hasOwn(ImagesList[key], 'parse_mode')) opt.parse_mode = ImagesList[key].parse_mode;
			if(flag!=0) opt.caption += "\n\n** номер: "+key+" ** ("+ImagesList[key].date+" - "+ImagesList[key].dayOfWeek+")";
			else opt.caption += "\n\n("+ImagesList[key].date+" - "+ImagesList[key].dayOfWeek+")";
			if(!!ImagesList[key].parse_mode) opt.parse_mode = ImagesList[key].parse_mode;
			if(Object.hasOwn(ImagesList[key], 'type'))
			{if(ImagesList[key].type=='image') {await sendPhoto(chatId, ImagesList[key].path, opt);}
			 else if(ImagesList[key].type=='video') {await sendVideo(chatId, ImagesList[key].path, opt);}
			 else if(ImagesList[key].type=='audio') {await sendAudio(chatId, ImagesList[key].path, opt);}
			 else if(ImagesList[key].type=='document') {await sendDocument(chatId, ImagesList[key].path, opt);}
			}
			else await sendPhoto(chatId, ImagesList[key].path, opt);
		}
	}
	else await sendMessage(chatId, '*Упс... А список то пустой!*\n', {parse_mode:"markdown"});
}catch(err){WriteLogFile(err+'\nfrom showImagesList()');}
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
			if(flag!=0) opt.caption += "\n\n** номер: "+key+" ** ("+ModerImagesList[key].date+" - "+ModerImagesList[key].dayOfWeek+")";
			else opt.caption += "\n\n("+ModerImagesList[key].date+" - "+ModerImagesList[key].dayOfWeek+")";
			if(!!ModerImagesList[key].parse_mode) opt.parse_mode = ModerImagesList[key].parse_mode;
			if(Object.hasOwn(ModerImagesList[key], 'type'))
			{if(ModerImagesList[key].type=='image') {await sendPhoto(chatId, ModerImagesList[key].path, opt);}
			 else if(ModerImagesList[key].type=='video') {await sendVideo(chatId, ModerImagesList[key].path, opt);}
			 else if(ModerImagesList[key].type=='audio') {await sendAudio(chatId, ModerImagesList[key].path, opt);}
			 else if(ModerImagesList[key].type=='document') {await sendDocument(chatId, ModerImagesList[key].path, opt);}
			}
			else await sendPhoto(chatId, ModerImagesList[key].path, opt);
		}
	}
	else await sendMessage(chatId, '*Упс... А список то пустой!*\n', {parse_mode:"markdown"});
}catch(err){WriteLogFile(err+'\nfrom showModerImagesList()');}
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
    for(let i in keys) sendPhoto(keys[i], path, opt);//пошлем картинку админу из списка
}catch(err){WriteLogFile(err+'\nfrom sendPhotoToAdmin()');}
}
//====================================================================
async function sendVideoToAdmin(path, opt)
{
try{
    let keys = Object.keys(AdminBot);
    for(let i in keys) await sendVideo(keys[i], path, opt);//пошлем ролик админу из списка
}catch(err){WriteLogFile(err+'\nfrom sendVideoToAdmin()');}
}
//====================================================================
async function sendAudioToAdmin(path, opt)
{
try{
    let keys = Object.keys(AdminBot);
    for(let i in keys) await sendAudio(keys[i], path, opt);//пошлем аудио админу из списка
}catch(err){WriteLogFile(err+'\nfrom sendAudioToAdmin()');}
}
//====================================================================
async function sendDocToAdmin(path, opt)
{
try{
    let keys = Object.keys(AdminBot);
    for(let i in keys) await sendDocument(keys[i], path, opt);//пошлем файл админу из списка
}catch(err){WriteLogFile(err+'\nfrom sendDocToAdmin()');}
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
}catch(err){WriteLogFile(err+'\nfrom shiftObject()');}
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
}catch(err){WriteLogFile(err+'\nfrom setToTextList()');}
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
}catch(err){WriteLogFile(err+'\nfrom setToModerTextList()');}
}
//====================================================================
//проверка на возможность немедленной публикации
function check_permissions(obj)
{
try{
	//публикуем текст прямо сейчас, если дата или день недели совпадает
	let flag = 0;
	let now = moment().startOf('day');//текущий день
	let day;
	if(Object.hasOwn(obj, 'dayOfWeek')) day=obj.dayOfWeek;
	
	//если по Дате и дата верна
	if(obj.date == moment(obj.date,'DD.MM.YYYY').format('DD.MM.YYYY') && day=='Дата') 
	{	let time = moment(obj.date,'DD.MM.YYYY');
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
	//если Однократно и дата верна
	else if(obj.date == moment(obj.date,'DD.MM.YYYY').format('DD.MM.YYYY') && day=='Однократно')
	{	let timet = moment(now,'DD.MM.YYYY').format('DD.MM.YYYY');
        if(obj.date==timet) flag++;//прям сегодня
	}
	//если по Дням недели
	else if(masDay.indexOf(day)+1)
	{ 	//если дата окончания не наступила
		if(obj.date == moment(obj.date,'DD.MM.YYYY').format('DD.MM.YYYY'))//правильная дата
		{	let timet = moment(obj.date,'DD.MM.YYYY');//дата окончания
			if(timet.diff(now, 'days') >= 0);//разница в днях, 0 = сегодня
			{	if(obj.dayOfWeek==masDay[8]) flag++;//ежедневно, публикуем однозначно
				else
				{ 	let dayWeek = new Date().getDay();//сегодняшний день недели
					if(dayWeek==0) dayWeek=7;//приведем к формату 1..7
					if(dayWeek==masDay.indexOf(day)) flag++;//совпали дни, публикуем
				}
			}
		}
	}
	return flag;
}catch(err){WriteLogFile(err+'\nfrom check_permissions()');}
}
//====================================================================
async function publicText(obj)
{
try{
	//проверяем разрешение на публикацию немедленно
	let flag = check_permissions(obj);
	// до или после утренней публикации
	let time = moment(timePablic,'HH:mm:ss');//время "Ч"
	let now = moment();//текущее время
	let sec = now.diff(time, 'seconds');//разница в секундах 
	//публикуем в каналах из массива, если условия совпадают
	if(flag && sec>0)//если после времени утренней публикации
	{	for(let i=0;i<chat_news.length;i++) 
		try{
		  if(!!chat_news[i])
		  {	let opt = {};
			opt.entities = obj.entities;
			if(Object.hasOwn(obj, 'link_preview_options'))
			{opt.link_preview_options=JSON.stringify(obj.link_preview_options);
			 if(Object.hasOwn(obj.link_preview_options, 'is_disabled')) opt.disable_web_page_preview = true;
			}
			if(!!obj.parse_mode) opt.parse_mode = obj.parse_mode;
			await NewsBot.sendMessage(chat_news[i], obj.text, opt);
		  }
		}catch(err){WriteLogFile(err+'\nfrom publicText()=>for()');}
	}
}catch(err){WriteLogFile(err+'\nfrom publicText()');}
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
}catch(err){WriteLogFile(err+'\nfrom sendTextToWhatsApp()'); return -1;}
}
//====================================================================
async function setToImagesList(newpath, obj)
{
try{
	//скопируем файл с новым именем в основную папку Images
	fs.copyFileSync(obj.path, newpath);
	//сразу удалим временный файл
	try {fs.unlinkSync(obj.path);} catch (e) {console.log(e);}
	await readImagesList();//читаем список из файла
	ImagesList = shiftObject(ImagesList);//упорядочиваем номера-ключи
	//определим длину массива
	let len=Object.keys(ImagesList).length;
	if(len===0) len=1;
	else {let mas=Object.keys(ImagesList); len=mas[mas.length-1]; len++;}//последний ключ + 1
    ImagesList[len]=new Object();
    ImagesList[len].path = newpath;//путь
    ImagesList[len].dayOfWeek = obj.dayOfWeek;//день недели
	ImagesList[len].date = obj.date;
    if(Object.hasOwn(obj, 'caption')) ImagesList[len].caption = obj.caption;//подпись
	if(Object.hasOwn(obj, 'caption_entities')) ImagesList[len].caption_entities = obj.caption_entities;//форматирование
	if(Object.hasOwn(obj, 'parse_mode')) ImagesList[len].parse_mode = obj.parse_mode;//режим
	if(Object.hasOwn(obj, 'type')) ImagesList[len].type = obj.type;//тип файла
	
    ImagesList = shiftObject(ImagesList);//упорядочиваем номера-ключи в массиве
	WriteFileJson(FileImagesList,ImagesList);//сохраним список в файл
	return len;
}catch(err){WriteLogFile(err+'\nfrom setToImagesList()'); return -1;}
}
//====================================================================
async function setToModerImagesList(oldpath, newpath, obj)
{
try{
	//скопируем файл с новым именем в папку moder
	fs.copyFileSync(oldpath, newpath);
	//сразу удалим временный файл
	try {fs.unlinkSync(oldpath);} catch (e) {console.log(e);}
	readModerImagesList();//читаем список из файла
	ModerImagesList = shiftObject(ModerImagesList);//упорядочиваем номера-ключи
	//определим длину массива
	let len=Object.keys(ModerImagesList).length;
	if(len==0) len=1;
	else {let mas=Object.keys(ModerImagesList); len=mas[mas.length-1]; len++;}//последний ключ + 1
    ModerImagesList[len]=new Object();
    ModerImagesList[len].path = newpath;//путь
    ModerImagesList[len].dayOfWeek = obj.dayOfWeek;//день недели или однократно или Дата
	ModerImagesList[len].date = obj.date;//дата
    ModerImagesList[len].chatId = obj.chatId;
    if(!!obj && !!obj.caption) ModerImagesList[len].caption = obj.caption;//подпись
    if(Object.hasOwn(obj, 'caption_entities')) ModerImagesList[len].caption_entities = obj.caption_entities;//форматирование
	if(Object.hasOwn(obj, 'parse_mode')) ModerImagesList[len].parse_mode = obj.parse_mode;
	if(Object.hasOwn(obj, 'type')) ModerImagesList[len].type = obj.type;//тип файла
	
	ModerImagesList = shiftObject(ModerImagesList);//упорядочиваем номера-ключи в массиве
	WriteFileJson(FileModerImagesList,ModerImagesList);//сохраним список в файл
	return len;
}catch(err){WriteLogFile(err+'\nfrom setToModerImagesList()'); return -1;}
}
//====================================================================
async function publicImage(obj)
{
try{
	let opt = new Object();
	if(Object.hasOwn(obj, 'caption')) opt.caption = obj.caption;
	if(Object.hasOwn(obj, 'caption_entities')) opt.caption_entities = obj.caption_entities;
	if(Object.hasOwn(obj, 'parse_mode')) opt.parse_mode = obj.parse_mode;
	//проверяем разрешение на публикацию немедленно
	let flag = check_permissions(obj);
	// до или после утренней публикации
	let time = moment(timePablic,'HH:mm:ss');//время "Ч"
	let now = moment();//текущее время
	let sec = now.diff(time, 'seconds');//разница в секундах 
	//публикуем в каналах из массива, если условия совпадают
	if(flag && sec>0)//если после времени утренней публикации 
    {for(let i=0;i<chat_news.length;i++) 
	 {	try{
		  if(chat_news[i]!=='') 
		  {	if(Object.hasOwn(obj, 'type')) 
			{	if(obj.type=='image') {await NewsBot.sendPhoto(chat_news[i], obj.path, opt);}//если картинка
				else if(obj.type=='video') {await NewsBot.sendVideo(chat_news[i], obj.path, opt);}//если видео
				else if(obj.type=='audio') {await NewsBot.sendAudio(chat_news[i], obj.path, opt);}//если audio
				else if(obj.type=='document') {await NewsBot.sendDocument(chat_news[i], obj.path, opt);}//если document
			}
			else NewsBot.sendPhoto(chat_news[i], obj.path, opt);//без типа - картинка 
		  }
		}catch(err){WriteLogFile(err+'\nfrom publicImage()=>for()');}
	 }
	}
}catch(err){WriteLogFile(err+'\nfrom publicImage()');}
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
			if(obj.type=='image') {await sendPhoto(chat_coordinatorWhatsApp, obj.path, opt);}//если картинка
			else if(obj.type=='video') {await sendVideo(chat_coordinatorWhatsApp, obj.path, opt);}//если видео
			else if(obj.type=='audio') {await sendAudio(chat_coordinatorWhatsApp, obj.path, opt);}//если audio
			else if(obj.type=='document') {await sendDocument(chat_coordinatorWhatsApp, obj.path, opt);}//если document
			await sendMessage(chat_coordinatorWhatsApp, '👆🏻👆🏻👆🏻👆🏻👆🏻👆🏻👆🏻\n'+obj.date+' - '+obj.dayOfWeek);
			flag++;
		}
	}
	if(flag) return 'OK'; else return 'NO';
}catch(err){WriteLogFile(err+'\nfrom sendImageToWhatsup()'); return -1;}
}
//====================================================================
function begin(chatId)
{try{	
	if(validAdmin(chatId) || validAdminBot(chatId)) return keyboard['adm1'];
	else return keyboard['1'];
}catch(err){WriteLogFile(err+'\nfrom begin()');}
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
}catch(err){WriteLogFile(err+'\nfrom get_keyb100()');}
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
}catch(err){WriteLogFile(err+'\nfrom isValidChatId()');}
}
//====================================================================
async function WriteLogFile(arr, flag) 
{   if(!LOGGING) return;
	console.log(arr);
	let str=moment().format('DD.MM.YY HH:mm:ss:ms')+' - '+arr+'\n';
    try{
		await fs.appendFileSync(LogFile, str);
		if(!!logBot && !flag) 
		{str='From @'+namebot+' '+area+'\n'+str;
		 await logBot.sendMessage(chat_Supervisor, str);
		}
	}catch(err){}
}
//====================================================================
//если бот запускается в пустой папке местности, то нужно создать папки и файлы по-умолчанию
//из контекста сборки
//это будет работать только из контейнера
function setContextFiles()
{//файлы контекста находятся в /home/pi/context/Bot и /home/pi/context/Token
	let cBot = '/home/pi/context/Bot';
	let cToken = '/home/pi/context/Token';
	if(!fs.existsSync(TokenDir)) {fs.mkdirSync(TokenDir);}//создадим папку, если ее нет
	let SUPERVISOR = (process.env.SUPERVISOR) ? process.env.SUPERVISOR : '';//чатайди супера из ENV
	let TOKEN_BOT = (process.env.TOKEN_BOT) ? process.env.TOKEN_BOT : '';//токен бота из ENV
	let NAME_BOT = (process.env.NAME_BOT) ? process.env.NAME_BOT : '';//имя бота из ENV
	let TOKEN_LOG = (process.env.TOKEN_LOG) ? process.env.TOKEN_LOG : '';//токен лог-бота из ENV
	let NAME_LOG = (process.env.NAME_LOG) ? process.env.NAME_LOG : '';//имя лог-бота из ENV
	let TOKEN_NEWS = (process.env.TOKEN_NEWS) ? process.env.TOKEN_NEWS : '';//токен news-бота из ENV
	let NAME_NEWS = (process.env.NAME_NEWS) ? process.env.NAME_NEWS : '';//имя news-бота из ENV
	let REGION = (process.env.REGION) ? process.env.REGION : '';//имя местности из ENV
	let CHAT_NEWS_OBJ = (process.env.CHAT_NEWS_OBJ) ? process.env.CHAT_NEWS_OBJ : '';//объект с chatId каналов из ENV
	if(!fs.existsSync(TokenDir)) {fs.mkdirSync(TokenDir);}//создадим папку, если ее нет
	if(fs.existsSync(cBot))
	{	//текстовые файлы переписываем принудительно
		if(fs.existsSync(cBot+'/readme.txt')) {fs.copyFileSync(cBot+'/readme.txt',currentDir+'/readme.txt');}
		if(fs.existsSync(cBot+'/LoaderUserGuid.txt')) {fs.copyFileSync(cBot+'/LoaderUserGuid.txt',currentDir+'/LoaderUserGuid.txt');}
		//config.json
		if(!fs.existsSync(currentDir+'/config.json')) {WriteFileJson(currentDir+'/config.json',{"timePablic":"06:00:00"});}
		if(fs.existsSync(currentDir+'/config.json'))//если файл уже имеется
		{	let obj;
			try{obj = require(currentDir+'/config.json');}catch(err){console.log(err);}
			if(typeof(obj) != 'object')
			{obj={}; obj.area = "НашаМестность"; obj.timePablic = "06:00:00"; obj.forDate = [3,0]; obj.lifeTime = 180;
			 WriteFileJson(currentDir+'/config.json',obj);
			}
			//если запрошено изменение местности в ENV
			if(!!REGION) {obj.area = REGION; WriteFileJson(currentDir+'/config.json',obj);}
		}
	}
	if(fs.existsSync(cToken))
	{	
		if(!fs.existsSync(TokenDir+'/chatId.json'))
		{	let obj = {};
			obj.Supervisor = "123456789";
			obj.chat_news = {};
			obj.chat_news['ИмяКанала'] = 'chatID канала';
			obj.chat_news['СколькоХочешь'] = 'может быть каналов';
			WriteFileJson(TokenDir+'/chatId.json',obj);
		}
		if(fs.existsSync(TokenDir+'/chatId.json'))//если файл уже имеется.
		{	let obj = {};
			try{obj = require(TokenDir+"/chatId.json");}catch(err){obj = {};}
			if(typeof(obj) != 'object') {obj={}; obj.Supervisor="123456789"; WriteFileJson(TokenDir+'/chatId.json',obj);}
			if(!obj.Supervisor) {obj.Supervisor = "123456789"; WriteFileJson(TokenDir+'/chatId.json',obj);}
			if(!obj.chat_news) 
			{obj.chat_news = {};
			 obj.chat_news['ИмяКанала'] = 'chatID канала';
			 obj.chat_news['СколькоХочешь'] = 'может быть каналов';
			 WriteFileJson(TokenDir+'/chatId.json',obj);
			}
			//если запрошено изменение чатайди супера в ENV
			if(!!SUPERVISOR) {obj.Supervisor = SUPERVISOR; WriteFileJson(TokenDir+'/chatId.json',obj);}
			//если запрошено изменение chatId каналов
			if(!!CHAT_NEWS_OBJ)
			{	let mas;
				try{mas = JSON.parse(CHAT_NEWS_OBJ);}catch(err){mas = '';}
				if(!mas) WriteLogFile('Кривой объект в CHAT_NEWS_OBJ','непосылать');
				else {obj.chat_news = mas; WriteFileJson(TokenDir+'/chatId.json',obj);}
			}
		}
		//файл токена лог бота
		if(!fs.existsSync(TokenDir+'/logs_bot.json'))
		{WriteFileJson(TokenDir+'/logs_bot.json',{"token":"сюда надо вписать токен бота", "comment":"имя_бота"});}
		if(fs.existsSync(TokenDir+'/logs_bot.json'))//если файл уже имеется
		{	let obj;
			try{obj = require(TokenDir+'/logs_bot.json');}catch(err){console.log(err);}
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
			try{obj = require(TokenDir+"/loader_bot.json");}catch(err){console.log(err);}
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
			try{obj = require(TokenDir+"/news_bot.json");}catch(err){console.log(err);}
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
