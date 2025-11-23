process.env["NTBA_FIX_350"] = 1;
const fs = require('fs');
const moment = require('moment-timezone');
const path = require('path');
const TelegramBot = require('node-telegram-bot-api');
const TelegramQueue = require('./TelegramQueue');
const tzLookup = require('tz-lookup');
const homedir = require('os').homedir();
const needle = require('needle');
const currentDir = (process.env.CURRENT_DIR) ? process.env.CURRENT_DIR : __dirname;
const AudioDir=currentDir+"/../../Audio";//путь к папке с книгами, на 2 уровня выше
const FileAdminList = currentDir+"/AdminList.txt";//имя файла списка админов
const FileUserList = currentDir+"/UserList.txt";//имя файла списка служенцев
const FileEventList = currentDir+"/EventList.txt";//имя файла списка событий
const FileHelpAdmin = currentDir+"/helpAdmin.txt";//имя файла help админа
const FileHelpUser = currentDir+"/helpUser.txt";//имя файла help служенца
const PathToDoc = currentDir+'/doc';//путь к докам
const PathToPhoto = currentDir+'/photo';//путь к фоткам
const PathToVideo = currentDir+'/video';//путь к видео
const PathToAudio = currentDir+'/audio';//путь к аудио
const PathToGif = currentDir+'/gif';//путь к гифкам
const PathToSticker = currentDir+'/sticker';//путь к стикерам
const PathToLog = currentDir+'/../log';//путь к логам
const PathToQuestions = currentDir+'/questions';//путь к папке вопросов 10го шага
//проверим наличие папки json, если папки нет, то создадим ее
if(!fs.existsSync(currentDir+"/json")) {fs.mkdirSync(currentDir+"/json");}
const FileHistory = currentDir+"/json/History.json";// путь к файлу массива историй
const FileTree = currentDir+'/json/Tree.json';//дерево кнопок
const FileWeekCount = currentDir+"/json/WeekCount.json";//имя файла счетчика посещений недельный
const FileGrandCount = currentDir+"/json/GrandCount.json";//имя файла счетчика посещений общий
var FileEg = currentDir+'/../Rassilka/eg.txt';//файл с ежиком по-умолчанию
var FileRaspis = currentDir+'/../Rassilka/raspis.txt';//файл с расписанием по-умолчанию
const FileTen = currentDir+"/tenstep.txt";//файл вопросов к 10-му шагу
const FileBarrels = currentDir+"/barrels.txt";//файл вопросов Бочонки
const FileSticker = PathToSticker+"/sticker.json";//файл id стикеров
const TokenDir=currentDir+"/Token";//путь к папке с токенами
const FileSignOff = currentDir+"/SignOff.txt";//файл с флагом запрета подписки
const LOGGING = true;//включение/выключение записи лога в файл
const SPEEDLIMIT = 15;//ограничение скорости сообщений в сек
const QUEUELIMIT = 200;//ограничение макс размера очереди
const randomGenerator = createPseudoRandom(Date.now());//генератор случайных чисел
//---------------------------------------------------
//сразу проверяем или создаем необходимые папки и файлы
setContextFiles();
//---------------------------------------------------
const chat_Supervisor = require(TokenDir+"/chatId.json").Supervisor;//пользователь 'Supervisor'
FileEg = currentDir+require(currentDir+"/filename_bot.json").FileEg;//путь к файлу с Ежиком после контекста
FileRaspis = currentDir+require(currentDir+"/filename_bot.json").FileRaspis;//путь к файлу с Расписанием после контекста
const filenamebot = '/' + require(currentDir+"/filename_bot.json").filename;//имя файла с токеном бота
const tokenBot = require(TokenDir+filenamebot).token;//рабочий бот
var nameBot = 'my_bot'; try{nameBot = require(TokenDir+filenamebot).comment} catch (err) {}//имя бота
const LogFile = PathToLog+'/'+nameBot+'.log';
var Bot = new TelegramBot(tokenBot, {polling: true});
Bot.isPolling = true;//доп свойство
let tokenLog;
try{tokenLog = require(TokenDir+"/logs_bot.json").token;}catch(err){}
//if(!!tokenLog && tokenLog=='ТокенБотаЛогов') tokenLog = null;
var logBot;
if(!!tokenLog){try{logBot = new TelegramBot(tokenLog, {polling: false});}catch(err){logBot=null;}}//бот для вывода лог-сообщений 
// Создаем очередь для Bot
const queue = new TelegramQueue(Bot, {
    maxRetries: 5,
    retryDelay: 10000,
    messagesPerSecond: 10,
	maxConsecutiveErrors: 5
});
//---------------------------------------------------
let LastMessId=new Object();//массив для хранения последнего message_id, и не только
let FileId=new Object();//массив для хранения последнего file_id
let AdminList=new Object();//массив админов
let UserList=new Object();//массив служенцев
let EventList=new Object();//массив событий
let LastKey=new Object();//ключ в массиве строк, последний посланный, для Админа
let WaitEditText=new Object();//маркер ожидания текста после редакции
let CutList = new Object();//вспомогательный массив для переноса кнопок
let DayCount = new Object();//счетчик посещений разделов за день
let GrandCount = new Object();//счетчик посещений разделов общий
let Tree = new Object();//дерево кнопок
let LastHistory=new Object();//последняя история
let photos_key='', file_key='', video_key='', audio_key='';
const smilik = '¯\\_(ツ)_/¯';
let TenList = [];//массив вопросов к 10-му шагу
let AnswerList = {};//массивы ответов от пользователей по 10-му шагу
let PRIVAT = 1;//глобальная приватность, пускает только Админа и Юзера с разрешениями
let DISTANCE = 1;//дистанция в днях о скором наступлении события
let COMMUNITY_TEXT = '';//текст для счетчика чистого времени (трезвости, брака, развода и т.д.)
let MediaList=new Object();//массив группы медиа файлов
let Stickers=new Object();//объект стикеров
let SignOff = 0;
let utcOffset = moment().utcOffset();//пока системное смещение
let localTimeZona = '';
const RUSSIAN_TIMEZONES = ['Europe/Kaliningrad','Europe/Moscow','Europe/Samara','Asia/Yekaterinburg','Asia/Omsk','Asia/Novosibirsk','Asia/Irkutsk','Asia/Chita','Asia/Vladivostok'];

//проверим наличие файла дерева кнопок, если файл отсутствует, то создадим его 
try {Tree = JSON.parse(fs.readFileSync(FileTree));} 
catch (err) {addNode('0',null,'start','text');addNode('Назад',null,'Назад','text');}
//прочитаем сохраненный файл FileId.txt, если файл отсутствует, то создадим его
try {FileId = JSON.parse(fs.readFileSync(currentDir+"/FileId.txt"));} 
catch (err) {WriteFileJson(currentDir+"/FileId.txt",FileId);}
//проверим наличие файла общего счетчика посещений разделов, если файл отсутствует, то создадим его
try {GrandCount = JSON.parse(fs.readFileSync(FileGrandCount));}
catch (err) {GrandCount = initObjCount(); fs.writeFileSync(FileGrandCount, JSON.stringify(GrandCount,null,2));}
//проверим наличие файла историй, если файл отсутствует, то создадим его 
try {let history = JSON.parse(fs.readFileSync(FileHistory));} catch (err) {WriteFileJson(FileHistory,new Object());}
//проверим наличие файла конфига, если файл отсутствует, то создадим его 
let config = {};
try 
{	config = JSON.parse(fs.readFileSync(currentDir+"/config.json"));
	if(!config.community_text) {config.community_text = "чистого времени"; WriteFileJson(currentDir+"/config.json",config);}
	if(!config.utcOffset) {config.utcOffset = utcOffset>0?'+'+String(moment().utcOffset()):String(moment().utcOffset()); WriteFileJson(currentDir+"/config.json",config);}
} 
catch (err) 
{config = {"community_text":"чистого времени","utcOffset":String(moment().utcOffset())};
 WriteFileJson(currentDir+'/config.json',config);
}
//устанавливаем локальную таймзону
if(isNaN(Number(config.utcOffset))) {config.utcOffset = String(utcOffset); WriteLogFile('Ошибка в utcOffset');}
utcOffset = Number(config.utcOffset);
localTimeZona = setTimezoneByOffset(utcOffset);
//проверим наличие файла лога, если файл отсутствует, то создадим его
try 
{var oldmask = process.umask(0);
 if(!fs.existsSync(PathToLog)) fs.mkdirSync(PathToLog, 0777);//создадим папку, если нет
 try {let bl = fs.readFileSync(LogFile).toString();} catch (err) {fs.writeFileSync(LogFile, '\n');}
 process.umask(oldmask);
 WriteLogFile('=======================================================');
 WriteLogFile('запуск процесса '+path.basename(__filename));
 if(!!localTimeZona) WriteLogFile('Установлена таймзона: '+localTimeZona+', смещение: '+moment().format('Z'));
 else WriteLogFile('Таймзона не установлена! Смещение: '+moment().format('Z'));
} catch (err) {console.log(err);}
//прочитаем сохраненный файл LastMessId.txt, если файл отсутствует, то создадим его
try {LastMessId = JSON.parse(fs.readFileSync(currentDir+"/LastMessId.txt"));} 
catch (err) {WriteFileJson(currentDir+"/LastMessId.txt",LastMessId);}
//список админов, если файл отсутствует, то создадим его
if(!fs.existsSync(FileAdminList)) {WriteFileJson(FileAdminList,{});}
try 
{AdminList = JSON.parse(fs.readFileSync(FileAdminList));
 //проверим на правильность chatId
 let flag=0;
 let keys = Object.keys(AdminList);
 for(let i in keys) 
 {if(!isValidChatId(keys[i])) {console.log('Неверный chatId в AdminList='+keys[i]); delete AdminList[keys[i]]; flag=1;}
 }
 if(flag) WriteFileJson(FileAdminList,AdminList);//записываем файл
}
catch(err){WriteFileJson(FileAdminList,{}); WriteLogFile(err,'вчат');}
//проверим наличие файла Служенцев, если файл отсутствует, то создадим его 
try 
{UserList = JSON.parse(fs.readFileSync(FileUserList));
 //проверим на правильность chatId
 let flag=0;
 let keys = Object.keys(UserList);
 for(let i in keys) 
 {if(!isValidChatId(keys[i])) {console.log('Неверный chatId в UserList='+keys[i]); delete UserList[keys[i]]; flag=1;}
 }
 if(flag) WriteFileJson(FileUserList,UserList);//записываем файл
} 
catch (err) {WriteFileJson(FileUserList,UserList);}
//проверим наличие файла helpAdmin, если файл отсутствует, то создадим его 
try {let bl = fs.readFileSync(FileHelpAdmin);} catch (err) {WriteFileJson(FileHelpAdmin,"1");}
//проверим наличие файла helpUser, если файл отсутствует, то создадим его 
try {let bl = fs.readFileSync(FileHelpUser);} catch (err) {WriteFileJson(FileHelpUser,"2");}
//проверим наличие файла EventList, если файл отсутствует, то создадим его 
try {EventList = JSON.parse(fs.readFileSync(FileEventList));} catch (err) {WriteFileJson(FileEventList,EventList);}
//проверим наличие файла недельного счетчика посещений разделов, если файл отсутствует, то создадим его
try {let bl = fs.readFileSync(FileWeekCount);}
catch (err) 
{let WeekCount = new Object();
 WeekCount.index = 0;
 DayCount = initObjCount();
 WeekCount[WeekCount.index] = new Object();
 WeekCount[WeekCount.index] = DayCount;
 fs.writeFileSync(FileWeekCount, JSON.stringify(WeekCount,null,2));
}
//проверим наличие папки фоток, если папки нет, то создадим ее
if(!fs.existsSync(PathToPhoto)) {fs.mkdirSync(PathToPhoto);}
//проверим наличие папки доков, если папки нет, то создадим ее
if(!fs.existsSync(PathToDoc)) {fs.mkdirSync(PathToDoc);}
//проверим наличие папки видео, если папки нет, то создадим ее
if(!fs.existsSync(PathToVideo)) {fs.mkdirSync(PathToVideo);}
//проверим наличие папки аудио, если папки нет, то создадим ее
if(!fs.existsSync(PathToAudio)) {fs.mkdirSync(PathToAudio);}
//проверим наличие папки гифок, если папки нет, то создадим ее
if(!fs.existsSync(PathToGif)) {fs.mkdirSync(PathToGif);}
//проверим наличие папки стикеров, если папки нет, то создадим ее
if(!fs.existsSync(PathToSticker)) {fs.mkdirSync(PathToSticker);}
//проверим наличие папки вопросов, если папки нет, то создадим ее
if(!fs.existsSync(PathToQuestions)) {fs.mkdirSync(PathToQuestions);}
//проверим наличие файла приватности, если файл отсутствует, то создадим его 
try 
{PRIVAT = JSON.parse(fs.readFileSync(currentDir+'/privat.json')).privat;
 DISTANCE = JSON.parse(fs.readFileSync(currentDir+'/privat.json')).distance;
 if(!DISTANCE) {DISTANCE=1; WriteFileJson(currentDir+'/privat.json',{"privat":PRIVAT, "distance":DISTANCE});}
} 
catch (err) {WriteFileJson(currentDir+'/privat.json',{"privat":PRIVAT, "distance":DISTANCE});}
//загрузим вопросы из файла tenstep.txt
try {TenList = fs.readFileSync(FileTen).toString().split('\n');} catch (err) {WriteLogFile(err,'вчат'); TenList.push('Файл вопросов отсутствует!');}
if(TenList.length==0) WriteLogFile('Список TenList пуст!','вчат');
//загрузим ответы из временного файла answer.txt
if(fs.existsSync(currentDir+'/answer.txt'))
{try {AnswerList = JSON.parse(fs.readFileSync(currentDir+'/answer.txt'));
	 fs.unlinkSync(currentDir+'/answer.txt');//удаляем временный файл
 } 
 catch (err) {console.log(err)}
}
//загрузим стикеры
try {Stickers = JSON.parse(fs.readFileSync(FileSticker));} catch (err) {Stickers.ubik=[];}
//проверим наличие файла FileSignOff, если файл отсутствует, то создадим его 
try {let bl = fs.readFileSync(FileSignOff); SignOff=Number(bl);} catch (err) {WriteFileJson(FileSignOff,SignOff.toString());}

getDayCount();//загрузим счетчики текущего дня
sendMessage.count = 0;//обнулим счетчик сообщений в сек

/*(async () => {
	for(let i=0;i<20;i++)
	{
		let res = await sendMessage(chat_Supervisor, i);
		//await sendMessage(chat_Supervisor, JSON.stringify(res,null,2));
		//await sendMessage(chat_Supervisor, i).then(async (res)=>{await sendMessage(chat_Supervisor, JSON.stringify(res,null,2));});
	}
})();*/
//====================================================================
//динамически создаем массив кнопок с колбеками, добавляем текст из obj
function klava(num, obj, chatId)
{  
try{	
	let backbutton;
	let option = new Object();
	if(!!obj) 
	{	if(Object.hasOwn(obj, 'parse_mode')) option.parse_mode = obj.parse_mode;
		else option.entities = obj;
		if(Object.hasOwn(obj, 'disable_web_page_preview')) option.disable_web_page_preview = obj.disable_web_page_preview;
		if(!!obj.backbutton)
		{	backbutton = obj.backbutton;//если это кнопка Назад и есть
			delete obj.backbutton; 
		}
	}
	if(Object.hasOwn(Tree, num) && !!Tree[num].child && Tree[num].child.length>0)//если есть потомки
	{	option.reply_markup = new Object();
		option.reply_markup.inline_keyboard = [];
		//сначала проверим, а все ли потомки есть в наличии
		for(let i=0;i<Tree[num].child.length;i++) if(!Object.hasOwn(Tree,Tree[num].child[i])) Tree[num].child.splice(i,1);
		//собираем кнопки
		for(let i=0;i<Tree[num].child.length;i++)
		{	let key = String(Tree[num].child[i]);
			//проверим, а есть ли такая кнопка
			if(Object.hasOwn(Tree, key))
			{	let tobj = {};
				tobj.text = Tree[key].name;//имя кнопки
				if(!!Tree[key].type)
				{if(Tree[key].type=='url') tobj.url = Tree[key].url;//в колбек - url
				 else tobj.callback_data = key+'_'+Tree[key].type;//в колбек - номер кнопки и тип
				 if(Tree[key].type!='admin') option.reply_markup.inline_keyboard.push([tobj]);//добавляем кнопку
				 else if(!!chatId && validAdmin(chatId)) option.reply_markup.inline_keyboard.push([tobj]);//добавляем кнопку
				}
				else option.reply_markup.inline_keyboard.push([tobj]);//добавляем кнопку
			}
		}
	}
	//Добавляем кнопку Следующая, если это Истории
	if(Object.hasOwn(Tree, num) && !!Tree[num].type && Tree[num].type == 'history')
	{	if(!option.reply_markup) 
		{	option.reply_markup = new Object();
			option.reply_markup.inline_keyboard = [];
		}
		let i = option.reply_markup.inline_keyboard.length;//кол-во кнопок
		option.reply_markup.inline_keyboard.push([new Object()]);
		option.reply_markup.inline_keyboard[i][0].text = 'Следующая';//имя кнопки в последний индекс
		option.reply_markup.inline_keyboard[i][0].callback_data = num+'_next';//в колбек - номер той же кнопки
	}
	//добавляем кнопку Назад, если есть родитель
	if((Object.hasOwn(Tree, num) && Tree[num].parent != null) || !!backbutton)
	{	if(!option.reply_markup) 
		{	option.reply_markup = new Object();
			option.reply_markup.inline_keyboard = [];
		}
		let i = option.reply_markup.inline_keyboard.length;//кол-во кнопок
		option.reply_markup.inline_keyboard.push([new Object()]);
		option.reply_markup.inline_keyboard[i][0].text = Tree['Назад'].name;//имя кнопки в последний индекс
		if(!!backbutton) option.reply_markup.inline_keyboard[i][0].callback_data = backbutton+'_'+Tree[backbutton].type;//в колбек - номер кнопки родителя и тип
		else option.reply_markup.inline_keyboard[i][0].callback_data = Tree[num].parent+'_'+Tree[Tree[num].parent].type;//в колбек - номер кнопки родителя и тип
	}
	//в текстовых кнопках добавляем превью, если есть
	if(Object.hasOwn(Tree, num) && !!Tree[num].type && Tree[num].type == 'text' && Object.hasOwn(Tree[num], 'link_preview_options'))
	{	if(Object.hasOwn(Tree[num].link_preview_options, 'is_disabled')) option.disable_web_page_preview = true;
		option.link_preview_options = Tree[num].link_preview_options;
	}
	option.disable_notification = true;//все кнопочные сообщения - без уведомления
	//console.log(JSON.stringify(option,null,2));
	return option;
} catch (err){WriteLogFile(err+'\nfrom klava()','вчат');}
}
//====================================================================
// обработка ответов от кнопок
Bot.on('callback_query', async (msg) => 
{	
try
{	if(msg.from && msg.from.is_bot) return;//ботов не пускаем
	const chatId = msg.message.chat.id.toString();
	if(!isValidChatId(chatId)) return;//левые chatId не пускаем
	const messId = msg.message.message_id;
    const messText = msg.message.text;
    const messEnt = msg.message.entities;
	const firstname = msg.message.chat.first_name;
	const user = '@'+msg.message.chat.username;
	let answer = msg.data.split('_');
	if(answer.length<2) return;
	const index = answer[0];//номер кнопки
	const type = answer[1];//тип кнопок
	if(PRIVAT && !validAdmin(chatId) && !validUser(chatId)) return;//приватность
	if(validAdmin(chatId) || (validUser(chatId) && !PRIVAT)) {photos_key = ''; file_key = '';}
	if(SignOff != 0 && !Object.hasOwn(LastMessId, chatId)) return;//если ни разу не был
	
	//любая текстовая кнопка
	if(type=='text' || type=='admin')
	{	if(!Object.hasOwn(Tree[index], 'text'))
		{	Tree[index].text = 'Тут пока ничего нет\nДобавь текст командой /EditText';
		}
		//если есть текст, то чисто текстовая кнопка
		if(!!Tree[index].text)
		{	let str = Tree[index].text;
			const ubik_true = ubik(chatId,'srok');
			if(index==0 && !!LastMessId[chatId] && Object.hasOwn(LastMessId[chatId], 'srok') && ubik_true==false)
			{	let name = '';
				if(!!firstname) name = firstname;
				else if(!!user) name = '@'+user;
				name = name.replace(/_/g, '\\_');//экранируем нижнее подчеркивание
				name = name.replace(/\*/g, '\\*');//экранируем звездочку
				//заменяем строку текста на срок чистоты
				str = 'Привет, '+name+'!\n';
				str += get_srok(chatId);
				
				await sendMessage(chatId, str, klava(index, {parse_mode:"markdown"}, chatId), index);
			}
			else await sendMessage(chatId, str, klava(index, Tree[index].entities, chatId), index);
		}
		//если есть имя файла, то кнопка с картинкой
		else if(!!Tree[index].filename)
		{	let filename = Tree[index].filename;
			let path = PathToPhoto+'/'+index+'/'+filename;
			//если есть fileId, то замена пути на fileId
			if(!!FileId[filename]) 
			{	//проверяем наличие файла на сервере Телеграм из FileId[]
				let info; 
				try{info=await Bot.getFile(FileId[filename]);} catch(err){if(String(err).indexOf('file is too big')+1) info = true;}
				//если есть отклик, то замена пути на fileId
				if(!!info) path = FileId[filename];
			}
			let option = klava(index, null, chatId);//получим чайлд-кнопки
			if(!!Tree[index].caption) option.caption = Tree[index].caption;
			if(!!Tree[index].caption_entities) option.caption_entities = Tree[index].caption_entities;
			await sendMessageImage(chatId,path,option,index);
		}
	}
	//кнопка Фотки
	else if(type=='photo')
	{	await sendPhotos(chatId, false, index);//показать фотки из папки
	}
	//кнопка Файлы
	else if(type=='file')
	{	await sendFiles(chatId,false,index);//отослать доки
	}
	//кнопка Видео
	else if(type=='video')
	{	await sendVideos(chatId,false,index);//отослать видео
	}
	//кнопка Аудио
	else if(type=='audio')
	{	await sendAudios(chatId,false,index);//отослать аудио
	}
	//кнопка Расписание
	else if(type=='raspis')
	{	let raspis = '';
		let mode = 'HTML';//по-умолчанию
		try
		{   let path;
			let str;
			if(Object.hasOwn(Tree[index], 'path')) 
			{	let ownpath = currentDir + Tree[index].path;//путь из кнопки, если есть
				const isFile = (() => { try { return fs.statSync(ownpath).isFile() } catch { return false } })();
				if(isFile) path = ownpath;
			}
			else path = FileRaspis;//путь по-умолчанию
			try{str = (await fs.promises.readFile(path)).toString();}catch(err){}
			let obj = {};
			let flag = 1;
			//проверим на объект
			try{obj = JSON.parse(str);}catch(err){flag = 0;}//если не JSON
			if(flag)//если это объект
			{	if(!!obj.text) raspis = obj.text; else raspis = 'Ошибка!';
				if(!!obj.mode) mode = obj.mode;
			}
		}
		catch(err) {console.error(err);}
		if(!raspis || raspis=='') raspis = 'Извините, пока недоступно 🤷';
		await sendMessage(chatId, raspis, klava(index, {parse_mode:mode,disable_web_page_preview: true}, chatId), index);
	}
	//кнопка Ежедневник
	else if(type=='eg')
	{	let eg = '';
		let mode = 'markdown';
		try
		{   let refpath;
			if(Object.hasOwn(Tree[index], 'path')) 
			{	let ownpath = currentDir + Tree[index].path;//путь из кнопки, если есть
				const isFile = (() => { try { return fs.statSync(ownpath).isFile() } catch { return false } })();
				if(isFile) refpath = ownpath;
			}
			else refpath = FileEg;//путь по-умолчанию
			const userDate = getUserDateTime(chatId).startOf('day');
			const todayDate = getEgDateTime(refpath).startOf('day'); //дата Ежика на сегодня
			const diffDays = todayDate.diff(userDate, 'days');//разница в днях
			if(diffDays > 0)
			{	const yesterdayPath = path.join(path.dirname(refpath), 'yesterday_' + path.basename(refpath));//с префиксом вчера
				if(fs.existsSync(yesterdayPath)) refpath = yesterdayPath;
			}
			else if(diffDays < 0)
			{	const tomorrowPath = path.join(path.dirname(refpath), 'tomorrow_' + path.basename(refpath));//с префиксом завтра
				if(fs.existsSync(tomorrowPath)) refpath = tomorrowPath;
			}		
			eg = (await fs.promises.readFile(refpath)).toString();//получаем "сегодняшний" для юзера Ежик 
		}
		catch(err) {console.error(err);}
		if(!eg || eg=='') eg = 'Извините, пока недоступно 🤷';
		await sendMessage(chatId, eg, klava(index, {parse_mode:mode,disable_web_page_preview: true}, chatId), index);
	}
	//кнопка Личные истории
	else if(type=='history' || type=='next')
	{	let history = new Object();
		try
		{   history = JSON.parse(await fs.promises.readFile(FileHistory));
			history = shiftObject(history);//упорядочиваем номера-ключи в массиве
			let keys = Object.keys(history);
			//если в историях что-то есть
			if(keys.length>0)
			{	if(!!LastHistory[chatId])//если это не первая история у юзера
				{	let ind = keys.indexOf(LastHistory[chatId]);
					if(ind < 0) ind =0;
					ind = (ind+1)%keys.length;//сл. индекс
					LastHistory[chatId] = keys[ind];
				}
				else {LastHistory[chatId] = keys[0];}
				let str=history[LastHistory[chatId]].text+'\n';
				str += '№'+LastHistory[chatId];//добавляем в конец номер истории
				if(str.length>4096)//разбиваем большую строку на несколько
				{let len=str.length;
				 let n=parseInt(len/4000);//сколько полных блоков
				 for(let i=0;i<n;i++) {await sendMessage(chatId, str.substring(4000*i,4000*i+4000));}
				 await sendMessage(chatId, str.substring(4000*n,len), klava(index, history[LastHistory[chatId]].entities, chatId), index);
				}
				else await sendMessage(chatId, str, klava(index, history[LastHistory[chatId]].entities, chatId), index);
			}
			else //если файл историй пустой
			{	await sendMessage(chatId, 'Извините, пока недоступно 🤷', klava(index,null, chatId), index);
			}
			console.log(JSON.stringify(klava(index,null, chatId),null,2));
		}
		catch(err) {console.error(err);}
	}
	//кнопка Счетчик ЧВ
	else if(type=='time') {srok(chatId,index);}//вычисляем и посылаем срок ЧВ
	
	//кнопка 10шаг
	else if(type=='ten')
	{	if(!LastMessId[chatId]) LastMessId[chatId]={};
		LastMessId[chatId].countTen = -1;//всегда сначала
		LastMessId[chatId].indexTen = index;
		await sendTenStep(chatId);
	}
	
	//кнопка Бочонки
	else if(type=='barrels')
	{	if(fs.existsSync(FileBarrels))
		{	if(!LastMessId[chatId]) LastMessId[chatId]={};
			LastMessId[chatId].indexTen = index;//будем использовать ключ от 10го шага
			let Barrels = [];
			fs.readFile(FileBarrels, 'utf8', async (err, data) => 
			{	if(err) {WriteLogFile(err); data = 'Файл бочонков отсутствует!';}
				Barrels = data.toString().split('\n');
				//сгенерируем случайное число по длине массива строк
				let min = 0;
				let max = Barrels.length-1;
				//let rand = Math.floor(Math.random() * (max - min + 1)) + min;
				let rand = randomGenerator.getRandomInt(min, max);
				if(rand > max) rand = max;
				//сформируем текст вопроса
				let str = Barrels[rand].replace(/\*/g,'').replace(/_/g,'');//удалим служебные символы, если есть
				str = '*Бочонок №'+(rand+1)+':*\n'+str;
				//сделаем кнопку Следующий
				let option = {}; 
				option.reply_markup = {};
				option.reply_markup.inline_keyboard = [];
				let i = option.reply_markup.inline_keyboard.length;//кол-во кнопок
				option.reply_markup.inline_keyboard.push([new Object()]);
				option.reply_markup.inline_keyboard[i][0].text = 'Следующий';//имя кнопки в последний индекс
				option.reply_markup.inline_keyboard[i][0].callback_data = LastMessId[chatId].indexTen+'_barrels';//в колбек - номер той же кнопки
				//добавим кнопку Назад
				i = option.reply_markup.inline_keyboard.length;//кол-во кнопок
				option.reply_markup.inline_keyboard.push([new Object()]);
				option.reply_markup.inline_keyboard[i][0].text = Tree['Назад'].name;//имя кнопки в последний индекс
				option.reply_markup.inline_keyboard[i][0].callback_data = Tree[LastMessId[chatId].indexTen].parent+'_'+Tree[Tree[LastMessId[chatId].indexTen].parent].type;//в колбек - номер кнопки родителя и тип
				option.parse_mode = 'markdown';
				await sendMessage(chatId, str, option, LastMessId[chatId].indexTen);
			});
		}
		else {await sendMessage(chatId, 'Бочонков пока нет!', klava(index,null, chatId), index);}
	}
	
	//кнопка Загрузить список вопросов 10го шага
	else if(type=='questions')
	{	await getQuestionsFromUser(chatId,index);//принять список
	}
	
	//кнопка Локация
	else if(type=='location')
	{	const Options =
		{	reply_markup:
			{	keyboard:
				[[{text:"Отправить мою локацию",request_location: true},{text:"Удалить мою локацию"}],
				 [{text: "❌ Отменить"}]
				],
				resize_keyboard: true
			}
		};
		let str;
		if(!!LastMessId[chatId].location&&!!LastMessId[chatId].location.tz) str = 'Ваша таймзона у меня уже есть = '+LastMessId[chatId].location.tz;
		//else str = "Поделитесь локацией 👇";
		else
		{str = "Для корректного определения Вашей даты мне нужно точно знать Ваш часовой пояс. ";
		 str += "Это позволит исключить ошибки в дате Ежедневника или срока "+(!!config.community_text?config.community_text:'выздоровления')+', или времени события, и т.п. ';
		 str += "Если не трудно, нажмите пожалуйста на нужную кнопку снизу, и система автоматически пришлет ";
		 str += "мне Ваши координаты. По ним я определю Ваш часовой пояс.\n";
		 str += "Если этого не сделать, то я буду считать, что Вы находитесь в моей зоне "+localTimeZona+".";
		}
		LastMessId[chatId].loc_mess_id = 'запрос';//ставим запрос на сохранение id этого сообщения
		await sendMessage(chatId, str, Options);
		await Bot.answerCallbackQuery(msg.id);
	}
	
	//кнопка Расписание с ЕС
	else if(type=='ESclosed'||type=='ESopened')
	{	let slug;
		let str = '';
		if(!!LastMessId[chatId].location && !!LastMessId[chatId].location.slug) slug = LastMessId[chatId].location.slug;
		if(!!slug)
		{	if(type=='ESclosed') str = 'Вот ссылка на расписание в Вашем городе:\n'+'https://na-russia.org/'+slug+'/meetings-today';
			if(type=='ESopened') str = 'Вот ссылка на расписание в Вашем городе:\n'+'https://na-russia.org/'+slug+'/schedule-pro';
		}
		else
		{	str = 'Прошу прощения, но я не могу прислать Вам ссылку на расписание собраний в Вашем городе. ';
			str += 'Если не трудно, пришлите мне еще раз свою Локацию!\n';
			str += 'А пока я дам Вам общую ссылку на сайт РЗФ:\n'+'https://na-russia.org \n';
			str += 'где Вы сможете в ручном режиме подыскать для себя ближайщие собрания!';
		}
		if(!LastKey[chatId]) LastKey[chatId] = '0';
		await sendMessage(chatId, str, klava('Назад', {'backbutton':LastKey[chatId]}, chatId));
	}
	
	//при нажатии на ЛЮБУЮ другую кнопку - обнуляем счетчик 10го шага
	if(type != 'ten') LastMessId[chatId].countTen = -1;
	
	if(index != '0')
	{
		if(!DayCount[index]) DayCount[index] = 0; 
		DayCount[index]++;
		if(!GrandCount[index]) GrandCount[index] = 0; 
		GrandCount[index]++;
	}
	
} catch(err){WriteLogFile(err+'\nfrom callback_query()','вчат');}
});
//====================================================================
Bot.on('polling_error', async (error) => 
{	WriteLogFile(error+' => from Bot.on("polling_error")');
	if(error.code === 'EFATAL' || error.message.includes('502'))
	{	if(!Bot.isPolling) return;
		Bot.isPolling = false;
		await pauseBot(5000);
	}
});

async function pauseBot(duration = 10000)
{	if(Bot.isPolling) return;
    WriteLogFile('Останавливаем бот на '+duration/1000+'сек');
    try {
		await Bot.stopPolling();
        WriteLogFile('Polling stopped');
        // Автоматическое возобновление
        setTimeout(() => {resumeBot();}, duration);
    } catch (error) {
        WriteLogFile('Error stopping polling: '+error);
		// Пытаемся возобновить несмотря на ошибку остановки
        setTimeout(() => {resumeBot();}, duration);
    }
}
async function resumeBot() 
{	if(Bot.isPolling) return;
	WriteLogFile('Запускаем бот после паузы');
    try {
        await Bot.startPolling();
        Bot.isPolling = true;
        WriteLogFile('Polling resumed, bot connected');
    } catch (error) {
        WriteLogFile('Error resuming polling: '+error);
        Bot.isPolling = false;
		// Повторная попытка через 30 секунд
        setTimeout(() => resumeBot(), 30000);
    }
}

Bot.on('error', (error) => {WriteLogFile(error+' => from Bot.on("error"','вчат'); });
//====================================================================
// Обработчики событий очереди
//queue.on('error', (error) => {WriteLogFile(error);});
//queue.on('queued', (item) => {WriteLogFile(`Сообщение добавлено в очередь: ${item.id}`);});
//queue.on('sent', (item) => {WriteLogFile(`Сообщение отправлено: ${item.id}`);});
queue.on('failed', (item, error) => 
{if(!!item.bot) delete item.bot;
 try{WriteLogFile('Ошибка отправки сообщения из очереди: '+error.message+'\n'+JSON.stringify(item,null,2));}catch(err){WriteLogFile('Не могу распарсить item из ошибки очереди');}
 const chatId = item.chatId;
 if(String(error).indexOf('user is deactivated')+1) delete LastMessId[chatId];//удаляем ушедшего
 else if(String(error).indexOf('bot was blocked by the user')+1) delete LastMessId[chatId];//удаляем ушедшего
 else if(String(error).indexOf('chat not found')+1) delete LastMessId[chatId];//удаляем ушедшего
});
//queue.on('retry', (item, error, attempt) => {WriteLogFile('Повторная попытка '+attempt+' для '+item.id+': '+error.message);});
queue.on('connected', () => {WriteLogFile('=> bot connected (по callback_query)');});
queue.on('disconnected', (error) => {WriteLogFile(error+'; => bot disconnected');});
//queue.on('processing_started', (item) => {WriteLogFile('processing_started, queue length = '+item);});
//queue.on('processing_finished', () => {WriteLogFile('processing_finished');});
//queue.on('cleared', (item) => {WriteLogFile('cleared = '+item);});
//====================================================================
// Команда Послать всем подписчикам
Bot.onText(/^\/Public.+$/, async (msg) => 
{	
try{
	if(msg.from && msg.from.is_bot) return;//ботов не пускаем
	const chatId = msg.chat.id.toString();
	if(!isValidChatId(chatId)) return;//левые chatId не пускаем
	if(PRIVAT && !validAdmin(chatId) && !validUser(chatId)) return;//приватность
	
	if(validAdmin(chatId) /*|| validUser(chatId)*/)
	{	if(msg.text=='/PublicText') {PublicText(msg);}
		else if(msg.text=='/PublicTextAdmin') {PublicTextAdmin(msg);}
		else if(msg.text.indexOf('/PublicMessUser')+1) {PublicMessUser(msg);}
		else
		{	if(!LastKey[chatId]) LastKey[chatId] = '0';
			await sendMessage(chatId, "Команда '"+msg.text+"' не распознана", klava('Назад',{'backbutton':LastKey[chatId]}, chatId));
		}
		delete CutList[chatId];//очищаем вырезание кнопки
	}
	else await sendMessage(chatId, 'Извините, но Вы не являетесь Админом этого бота!', klava('0',null, chatId));
}catch(err){WriteLogFile(err+'\nfrom Public()','вчат');}
});
//====================================================================
// Команда Редактировать что либо
Bot.onText(/^\/Edit.+$/, async (msg) => 
{	
try{
	if(msg.from && msg.from.is_bot) return;//ботов не пускаем
	const chatId = msg.chat.id.toString();
	if(!isValidChatId(chatId)) return;//левые chatId не пускаем
	if(PRIVAT && !validAdmin(chatId) && !validUser(chatId)) return;//приватность
	
	if(validAdmin(chatId) || (validUser(chatId) && !PRIVAT))
	{	if(msg.text=='/EditText') {EditText(msg);}
		else if(msg.text.indexOf('/EditButtonName')+1) {EditButtonName(msg);}
		else if(msg.text.indexOf('/EditButtonUrl')+1) {EditButtonUrl(msg);}
		else if(msg.text.indexOf('/EditButtonEg')+1) {EditButtonEg(msg);}
		else if(msg.text.indexOf('/EditButtonRaspis')+1) {EditButtonRaspis(msg);}
		else if(msg.text.indexOf('/EditBackName')+1) {EditBackName(msg);}
		else
		{	if(!LastKey[chatId]) LastKey[chatId] = '0';
			await sendMessage(chatId, "Команда '"+msg.text+"' не распознана", klava('Назад',{'backbutton':LastKey[chatId]}, chatId));
		}
		delete CutList[chatId];//очищаем вырезание кнопки
	}
	else await sendMessage(chatId, 'Извините, но Вы не являетесь Админом этого бота!', klava('0',null, chatId));
}catch(err){WriteLogFile(err+'\nfrom callback_Public()','вчат');}
});
//====================================================================
// Команда Удалить что либо
Bot.onText(/^\/Del.+$/, async (msg) => 
{	
try{
	if(msg.from && msg.from.is_bot) return;//ботов не пускаем
	const chatId = msg.chat.id.toString();
	if(!isValidChatId(chatId)) return;//левые chatId не пускаем
	if(PRIVAT && !validAdmin(chatId) && !validUser(chatId)) return;//приватность
	
	if(validAdmin(chatId) || (validUser(chatId) && !PRIVAT))
	{	if(msg.text=='/DelHistory') {DelHistory(msg);}
		else if(msg.text.indexOf('/DelPhoto')+1) {DelPhoto(msg);}
		else if(msg.text.indexOf('/DelFile')+1) {DelFile(msg);}
		else if(msg.text.indexOf('/DelVideo')+1) {DelVideo(msg);}
		else if(msg.text.indexOf('/DelAudio')+1) {DelAudio(msg);}
		else if(msg.text.indexOf('/DelButton')+1) {DelButton(msg);}
		else if(msg.text.indexOf('/DelAdmin')+1) {DelAdmin(msg);}
		else if(msg.text.indexOf('/DelUser')+1) {DelUser(msg);}
		else if(msg.text.indexOf('/DelEvent')+1) {DelEvent(msg);}
		else
		{	if(!LastKey[chatId]) LastKey[chatId] = '0';
			await sendMessage(chatId, "Команда '"+msg.text+"' не распознана", klava('Назад',{'backbutton':LastKey[chatId]}, chatId));
		}
		delete CutList[chatId];//очищаем вырезание кнопки
	}
	else await sendMessage(chatId, 'Извините, но Вы не являетесь Админом этого бота!', klava('0',null, chatId));
}catch(err){WriteLogFile(err+'\nfrom Del()','вчат');}
});
//====================================================================
// Команда Добавить что либо
Bot.onText(/^\/Add.+$/, async (msg) => 
{	
try{
	if(msg.from && msg.from.is_bot) return;//ботов не пускаем
	const chatId = msg.chat.id.toString();
	if(!isValidChatId(chatId)) return;//левые chatId не пускаем
	if(PRIVAT && !validAdmin(chatId) && !validUser(chatId)) return;//приватность
	const match = msg.text.match(/\S+/g);
	const comm = match ? match[0] : null;
	
	if(validAdmin(chatId) || (validUser(chatId) && !PRIVAT))
	{	if(comm=='/AddHistory') {AddHistory(msg);}
		else if(comm=='/AddPhoto') {AddPhoto(msg);}
		else if(comm=='/AddFile') {AddFile(msg);}
		else if(comm=='/AddVideo') {AddVideo(msg);}
		else if(comm=='/AddAudio') {AddAudio(msg);}
		else if(comm=='/AddButtonText') {AddButtonText(msg);}
		else if(comm=='/AddButtonAdmin') {AddButtonAdmin(msg);}
		else if(comm=='/AddButtonUrl') {AddButtonUrl(msg);}
		else if(comm=='/AddButtonPhoto') {AddButtonPhoto(msg);}
		else if(comm=='/AddButtonFile') {AddButtonFile(msg);}
		else if(comm=='/AddButtonVideo') {AddButtonVideo(msg);}
		else if(comm=='/AddButtonAudio') {AddButtonAudio(msg);}
		else if(comm=='/AddButtonRaspis') {AddButtonRaspis(msg);}
		else if(comm=='/AddButtonEg') {AddButtonEg(msg);}
		else if(comm=='/AddButtonHistory') {AddButtonHistory(msg);}
		else if(comm=='/AddButtonTime') {AddButtonTime(msg);}
		else if(comm=='/AddAdmin') {AddAdmin(msg);}
		else if(comm=='/AddUser') {AddUser(msg);}
		else if(comm=='/AddButtonTen') {AddButtonTen(msg);}
		else if(comm=='/AddButtonQuestions') {AddButtonQuestions(msg);}
		else if(comm=='/AddEvent') {AddEvent(msg);}
		else if(comm=='/AddButtonBarrels') {AddButtonBarrels(msg);}
		else if(comm=='/AddButtonLocation') {AddButtonLocation(msg);}
		else if(comm=='/AddButtonESclosed') {AddButtonESclosed(msg);}
		else if(comm=='/AddButtonESopened') {AddButtonESopened(msg);}
		else
		{	if(!LastKey[chatId]) LastKey[chatId] = '0';
			await sendMessage(chatId, "Команда '"+msg.text+"' не распознана", klava('Назад',{'backbutton':LastKey[chatId]}, chatId));
		}
		delete CutList[chatId];//очищаем вырезание кнопки
	}
	else await sendMessage(chatId, 'Извините, но Вы не являетесь Админом этого бота!', klava('0',null, chatId));
}catch(err){WriteLogFile(err+'\nfrom Add()','вчат');}
});
//====================================================================
// Команда Переместить кнопку
Bot.onText(/^\/Move.+$/, async (msg) => 
{	
try{
	if(msg.from && msg.from.is_bot) return;//ботов не пускаем
	const chatId = msg.chat.id.toString();
	if(!isValidChatId(chatId)) return;//левые chatId не пускаем
	if(PRIVAT && !validAdmin(chatId) && !validUser(chatId)) return;//приватность
	
	if(validAdmin(chatId))
	{	if(msg.text.indexOf('/MoveButtonUp')+1) {MoveButtonUp(msg);}
		else if(msg.text.indexOf('/MoveButtonDown')+1) {MoveButtonDown(msg);}
		else
		{	if(!LastKey[chatId]) LastKey[chatId] = '0';
			await sendMessage(chatId, "Команда '"+msg.text+"' не распознана", klava('Назад',{'backbutton':LastKey[chatId]}, chatId));
		}
		delete CutList[chatId];//очищаем вырезание кнопки
	}
	else await sendMessage(chatId, 'Извините, но Вы не являетесь Админом этого бота!', klava('0',null, chatId));
}catch(err){WriteLogFile(err+'\nfrom Move()','вчат');}
});
//====================================================================
// Команда Вырезать кнопку
Bot.onText(/^\/CutButton (.+$)/, async (msg, match) => 
{	
try{
	
	if(msg.from && msg.from.is_bot) return;//ботов не пускаем
	const chatId = msg.chat.id.toString();
	if(!isValidChatId(chatId)) return;//левые chatId не пускаем
	if(PRIVAT && !validAdmin(chatId) && !validUser(chatId)) return;//приватность
	if(match.length<2) return;
	const key = match[1];//имя кнопки из текущего набора
	let str = '';

	if(validAdmin(chatId))
	{	if(!LastKey[chatId])
		{await sendMessage(chatId, 'Текущий набор не определен!', klava('Назад',{'backbutton':'0'}, chatId));//Отмена
		 return;
		}
		str = 'Кнопка определена! Теперь перейдите на нужный уровень и вставьте эту кнопку командой /InsertButton';
		//найдем номер кнопки из текущего набора по имени
		let i, dl=Tree[LastKey[chatId]].child.length;
		for(i=0;i<dl;i++)
		{	if(Tree[Tree[LastKey[chatId]].child[i]].name==key) 
			{CutList[chatId] = Tree[LastKey[chatId]].child[i];//сохраним номер вырезанной кнопки
			 break;
			}
		}
		if(i==dl) str = "В этом наборе кнопки '"+key+"' нет!";
		await sendMessage(chatId, str, klava(LastKey[chatId],null, chatId));//на прежнем уровне
	}
	else await sendMessage(chatId, 'Извините, но Вы не являетесь Админом этого бота!', klava('0',null, chatId));
}catch(err){WriteLogFile(err+'\nfrom CutButton()','вчат');}
});
//====================================================================
// Команда Вставить кнопку
Bot.onText(/^\/InsertButton/, async (msg) => 
{	
try{
	
	if(msg.from && msg.from.is_bot) return;//ботов не пускаем
	const chatId = msg.chat.id.toString();
	if(!isValidChatId(chatId)) return;//левые chatId не пускаем
	if(PRIVAT && !validAdmin(chatId) && !validUser(chatId)) return;//приватность
	if(msg.text!='/InsertButton' || !CutList[chatId]) return;

	if(validAdmin(chatId))
	{	if(!LastKey[chatId])
		{await sendMessage(chatId, 'Текущий набор не определен!', klava('Назад',{'backbutton':'0'}, chatId));//Отмена
		 return;
		}
		//удаляем вырезанную кнопку из потомков у бывшего родителя
		let numOldParent = Tree[CutList[chatId]].parent;
		let index = Tree[numOldParent].child.indexOf(CutList[chatId]);
		if(index+1)
		{	Tree[numOldParent].child.splice(index,1);//удаляем из детей
			//вставляем вырезанную кнопку в текущий набор в нижнее место
			Tree[LastKey[chatId]].child[Tree[LastKey[chatId]].child.length] = CutList[chatId];
			//обновляем у кнопки родителя
			Tree[CutList[chatId]].parent = LastKey[chatId];
			await sendMessage(chatId, 'Готово!', klava(LastKey[chatId],null, chatId));//закончили на прежнем уровне
			await WriteFileJson(FileTree,Tree);
		}
		delete CutList[chatId];
	}
	else await sendMessage(chatId, 'Извините, но Вы не являетесь Админом этого бота!', klava('0',null, chatId));
}catch(err){WriteLogFile(err+'\nfrom InsertButton()','вчат');}
});
//====================================================================
// Команда Статистики
Bot.onText(/^\/Stat.+$/, async (msg) => 
{	
try{
	if(msg.from && msg.from.is_bot) return;//ботов не пускаем
	const chatId = msg.chat.id.toString();
	if(!isValidChatId(chatId)) return;//левые chatId не пускаем
	const firstname = msg.chat.first_name;
	const user = '@'+msg.chat.username;
	if(PRIVAT && !validAdmin(chatId) && !validUser(chatId)) return;//приватность
	
	if(validAdmin(chatId) || (validUser(chatId) && !PRIVAT))
	{	if(msg.text=='/StatWeek') {StatWeek(msg);}
		else if(msg.text=='/StatGrand') {StatGrand(msg);}
		else
		{	if(!LastKey[chatId]) LastKey[chatId] = '0';
			await sendMessage(chatId, "Команда '"+msg.text+"' не распознана", klava('Назад',{'backbutton':LastKey[chatId]}, chatId));
		}
		delete CutList[chatId];//очищаем вырезание кнопки
	}
	else await sendMessage(chatId, 'Извините, но Вы не являетесь Админом этого бота!', klava('0',null, chatId));
}catch(err){WriteLogFile(err+'\nfrom Stat()','вчат');}
});
//====================================================================
// Команда Удалить 'мертвых' пользователей
Bot.onText(/^\/DeadUsers/, async (msg) => 
{	
try{
	if(msg.from && msg.from.is_bot) return;//ботов не пускаем
	const chatId = msg.chat.id.toString();
	if(!isValidChatId(chatId)) return;//левые chatId не пускаем
	const firstname = msg.chat.first_name;
	const user = '@'+msg.chat.username;
	if(PRIVAT && !validAdmin(chatId) && !validUser(chatId)) return;//приватность
	
	if(validAdmin(chatId))
	{	if(msg.text!='/DeadUsers') {return;}
		await sendMessage(chatId, 'Начинаем проверку *Мертвых* подписчиков!', {parse_mode:"markdown"});
		let str = '';	
		let mas = Object.keys(LastMessId);
		for(let i in mas)
		{	await sleep(150);
			if(Number(mas[i])<0) 
			{	delete LastMessId[mas[i]];//удаляем отрицательные
				str += 'chatId='+mas[i]+': отрицательный chatId\n';
			}
			else
			{
				try {let info = await Bot.getChat(mas[i]);}//проверяем чат юзера
				catch(err)
				{	str += 'chatId='+mas[i]+':'+err+'\n';
					if(String(err).indexOf('chat not found')+1) 
					{	if(fs.existsSync(PathToQuestions+'/'+mas[i]+'.txt'))//если у этого юзера есть файл вопросов
						{	await fs.promises.unlink(PathToQuestions+'/'+mas[i]+'.txt');//удаляем файл вопросов юзера
						}
						delete LastMessId[mas[i]];
					}
					//else if(String(err).indexOf('user is deactivated')+1) delete LastMessId[mas[i]];//удаляем ушедшего
					//else if(String(err).indexOf('bot was blocked by the user')+1) delete LastMessId[mas[i]];//удаляем ушедшего
				}
			}
		}
		//fs.writeFileSync(currentDir+"/DeadUsers.txt", str);
		if(str!='') await sendMessage(chatId, str);
		else await sendMessage(chatId, '*Мертвых* подписчиков не обнаружено!', {parse_mode:"markdown"});
		delete CutList[chatId];//очищаем вырезание кнопки
	}
}catch(err){WriteLogFile(err+'\nfrom DeadUsers()','вчат');}
});
//====================================================================
// СТАРТ
Bot.onText(/\/start/, async (msg) => 
{	
try{
	if(msg.from && msg.from.is_bot) return;//ботов не пускаем
	const chatId = msg.chat.id.toString();
	if(!isValidChatId(chatId)) return;//левые chatId не пускаем
	const firstname = msg.chat.first_name;
	const user = '@'+msg.chat.username;
	if(PRIVAT && !validAdmin(chatId) && !validUser(chatId)) return;//приватность
	if(SignOff != 0)//если запрет подписки 
	{	await sendMessage(chatId, 'Извините, подписка временно остановлена!');
		return;
	}

	//await sendMessage(chatId, 'Привет, '+firstname+'!', {reply_markup: {remove_keyboard: true}});//удаляем белые кнопки
	let index='0';
	if(!('text' in Tree[index]))
    {  Tree[index].text = 'Тут пока ничего нет\n';
       if((validAdmin(chatId) || (validUser(chatId) && !PRIVAT))) 
		Tree[index].text += '/help - выдаст полный список команд';
    }
	await sendMessage(chatId, Tree[index].text, klava(index, Tree[index].entities, chatId), index);
}catch(err){WriteLogFile(err+'\nfrom Start()','вчат');}
});
//====================================================================
// СТОП
Bot.onText(/\/off/, async (msg) => 
{
try{
	const chatId = msg.chat.id.toString();
	const firstname = msg.chat.first_name;
	const user = '@'+msg.chat.username;
	if(PRIVAT && !validAdmin(chatId) && !validUser(chatId)) return;//приватность
	if(msg.text != '/off') return;

	//удаляем юзера из массива
	if(Object.hasOwn(LastMessId, chatId)) delete LastMessId[chatId];
	await sendMessage(chatId, 'Вы отписались от бота!\n\nПришли мне любую букву, и подписка возобновится!');
}catch(err){WriteLogFile(err+'\nfrom off()','вчат');}
});
//====================================================================
// Команда Закрыть подписку новых юзеров
Bot.onText(/^\/SignOff.+$/, async (msg) => 
{	
try{
	if(msg.from && msg.from.is_bot) return;//ботов не пускаем
	const chatId = msg.chat.id.toString();
	if(!isValidChatId(chatId)) return;//левые chatId не пускаем
	if(PRIVAT && !validAdmin(chatId) && !validUser(chatId)) return;//приватность
	
	if(validAdmin(chatId))
	{	let match = [];
		match = msg.text.split('=');
		if(match.length<2) return;
		let num = Number(match[1]);
		if(!isNaN(num))//если железно число
		{	SignOff = num; 
			WriteFileJson(FileSignOff,SignOff.toString());
			await sendMessage(chatId, 'Принято!\nSignOff = '+SignOff);
		}
		else await sendMessage(chatId, 'Ошибка! Знаки после равно не являются числом.');
		delete CutList[chatId];//очищаем вырезание кнопки
	}
	else await sendMessage(chatId, 'Извините, но Вы не являетесь Админом этого бота!', klava('0',null, chatId));
}catch(err){WriteLogFile(err+'\nfrom callback_Public()','вчат');}
});
//====================================================================
// Команда help
Bot.onText(/\/help/, async (msg) => 
{	
try{
	if(msg.from && msg.from.is_bot) return;//ботов не пускаем
	const chatId = msg.chat.id.toString();
	if(!isValidChatId(chatId)) return;//левые chatId не пускаем
	if(PRIVAT && !validAdmin(chatId) && !validUser(chatId)) return;//приватность
	if(msg.text != '/help') return;//если не чисто команда
	let str='';
	if(validAdmin(chatId) || (validUser(chatId) && !PRIVAT))
	{	let flag=0;
		if(validAdmin(chatId)) try {str = (await fs.promises.readFile(FileHelpAdmin)).toString();} catch (err) {flag=1;}
		else try 
		{if(!PRIVAT) str = (await fs.promises.readFile(FileHelpUser)).toString(); else str = smilik;//в привате не показываем файл Юзеру
		}catch (err) {flag=1;}
		if(flag || str=='') str = 'Файл не найден или пуст!';
		if(!LastKey[chatId]) LastKey[chatId] = '0';
		//если текст получился большой, то зазбиваем его на части
		let len = 4100;
		if(str.length > len)
		{	let sub = [];
			while (str.length)
			{	sub.push(str.substring(0, len));
				str = str.substring(len);
			}
			for(let i in sub)
			{	if(i==sub.length-1) await sendMessage(chatId, sub[i], klava('Назад',{parse_mode:"markdown",'backbutton':LastKey[chatId]}, chatId));
				else await sendMessage(chatId, sub[i], {parse_mode:"markdown"});
			}
		}
		else await sendMessage(chatId, str, klava('Назад',{parse_mode:"markdown",'backbutton':LastKey[chatId]}, chatId));
		delete CutList[chatId];//очищаем вырезание кнопки
	}
	else await sendMessage(chatId, 'Извините, но Вы не являетесь Админом этого бота!', klava('0',null, chatId));
}catch(err){WriteLogFile(err+'\nfrom help()','вчат');}
});
//====================================================================
// ловим текст
Bot.on('message', async (msg) => 
{		
try{	
	if(msg.from && msg.from.is_bot) return;//ботов не пускаем
	const chatId = msg.chat.id.toString();
	if(!isValidChatId(chatId)) return;//левые chatId не пускаем
	const firstname = msg.chat.first_name;
	let media_group_id = msg.media_group_id;
	if(!msg.text && !media_group_id) {return;}//если текста нет и не альбом
	else if(!!msg.text && msg.text.slice(0,1)=='/') return;//если текст есть и это команда
	if(PRIVAT && !validAdmin(chatId) && !validUser(chatId)) return;//приватность
	
	//если это альбом
	if(!!media_group_id)
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
	if(msg.text.length > 4050)
	{	await sendMessage(chatId, '🤷‍♂️Сожалею, но длина текста не может превышать 4000 символов!🤷‍♂️', klava('Назад',{'backbutton':LastKey[chatId]}, chatId));
		WaitEditText[chatId]=0;
		return;
	}
	
	//пришел отредактированный текст от Админа
	if((validAdmin(chatId) || (validUser(chatId) && !PRIVAT)) && WaitEditText[chatId]==1)
	{	WaitEditText[chatId]=0;
		if(!!LastKey[chatId] && Object.hasOwn(Tree, LastKey[chatId]))//если в Tree[]
		{	Tree[LastKey[chatId]].text = msg.text;
			Tree[LastKey[chatId]].entities = msg.entities;
			if(msg.link_preview_options) Tree[LastKey[chatId]].link_preview_options = msg.link_preview_options;
			//удаляем папку с картинкой и форматирование
			if(fs.existsSync(PathToPhoto+'/'+LastKey[chatId])) {await delDir(LastKey[chatId]);}
			if(!!Tree[LastKey[chatId]].filename) 
			{	while(Object.hasOwn(FileId, Tree[LastKey[chatId]].filename)) {delete FileId[Tree[LastKey[chatId]].filename];}
				delete Tree[LastKey[chatId]].filename;
			}
			if(!!Tree[LastKey[chatId]].caption) delete Tree[LastKey[chatId]].caption;
			if(!!Tree[LastKey[chatId]].caption_entities) delete Tree[LastKey[chatId]].caption_entities;
			if(!!Tree[LastKey[chatId]].filename) 
				{	while(Object.hasOwn(FileId, Tree[LastKey[chatId]].filename)) {delete FileId[Tree[LastKey[chatId]].filename];}
					delete Tree[LastKey[chatId]].filename;
				}
			WriteFileJson(FileTree,Tree);
			await sendMessage(chatId, 'Принято! Можно проверять.', klava(LastKey[chatId],null, chatId));
		}
		else await sendMessage(chatId, 'Произошла ошибка, что-то пошло не так!', klava('0',null, chatId));
		LastKey[chatId] = null;
	}
	//пришел номер фотки для удаления из /photo
	else if((validAdmin(chatId) || (validUser(chatId) && !PRIVAT)) && WaitEditText[chatId]==12 && photos_key!='')
	{	if(Number(msg.text)==0) return;
		WaitEditText[chatId]=0;
		//загрузим подписи и fileId в opt
		let num = Number(msg.text);//номер выбранного файла
		let opt = new Object();
		try {opt = JSON.parse(await fs.promises.readFile(PathToPhoto+'/'+photos_key+'/'+'FileCaption.json'));}//загрузим подписи 
		catch (err) {}
		let index;
		for(let i in opt) if(!!opt[i].number && opt[i].number===num) {index = i; break;}
		if(!!index)
		{	if(!!opt[index].media)//если альбом
			{	for(let j in opt[index].media) 
				{	//удаляем file_id
					let tmp=opt[index].media[j].media.split('/'); 
					if(tmp.length>1)
					{	let file=tmp[tmp.length-1];//вытащим чисто имя файла в конце
						while(!!FileId[file]) delete FileId[file];
					}
					else
					{	let file = getKeyByValue(FileId, opt[index].media[j].media)
						while(!!FileId[file]) delete FileId[file];
					}
					//удаляем с диска
					try{if(fs.existsSync(opt[index].media[j].media))  fs.unlinkSync(opt[index].media[j].media);}catch(err){console.log(err);}
				}
			}
			else//одиночный файл
			{	try{fs.unlinkSync(PathToPhoto+'/'+photos_key+'/'+index);}catch(err){console.log(err);}
			}
			delete opt[index];
			WriteFileJson(PathToPhoto+'/'+photos_key+'/'+'FileCaption.json', opt);//сохраняем файл
			await sendMessage(chatId, 'Выбранный пост успешно удален!', klava(LastKey[chatId],null, chatId));
		}
		else
		{	await sendMessage(chatId, 'Такого номера нет в списке!', klava('Назад',{'backbutton':LastKey[chatId]}, chatId));//Отмена
		}
	}
	//пришел номер файла для удаления из /doc
	else if((validAdmin(chatId) || (validUser(chatId) && !PRIVAT)) && WaitEditText[chatId]==5 && file_key!='')
	{	if(Number(msg.text)==0) return;
		WaitEditText[chatId]=0;
		let k = 1;
		//загружаем список файлов из /doc - полный путь
		const isFile = fileName => {return fs.lstatSync(fileName).isFile()};
		let files = fs.readdirSync(PathToDoc+'/'+file_key).map(fileName => {return path.join(PathToDoc+'/'+file_key, fileName)}).filter(isFile);
		//заполним объект FileList
		let FileList = new Object();
		for(let i in files) 
		{	let tmp=files[i].split('/'); let name=tmp[tmp.length-1];//вытащим чисто имя файла в конце
			if(name != 'FileCaption.json') {FileList[name]=files[i];} 
		}
		//загрузим подписи и fileId в opt
		let opt = new Object();
		try {opt = JSON.parse(await fs.promises.readFile(PathToDoc+'/'+file_key+'/'+'FileCaption.json'));}//загрузим подписи 
		catch (err) {}
		//если FileList не пустой, то сортируем его в том порядке, как загружался в FileCaption.json
		if(!!FileList && Object.keys(FileList).length && !!opt && Object.keys(opt).length)
		{	let tobj = new Object();
			for(let name in opt)
			{if(Object.hasOwn(FileList, name)) {tobj[name]=FileList[name];}
			}
			FileList = tobj;
		}
		//теперь соберем список файлов воедино
		let NewList = new Object();//новый список
		//сначала полные пути из папки
		k = 1;
		for(let name in FileList) {NewList[k] = FileList[name]; k++;}
		//если присланный номер файла уже находится в массиве, то удаляем файл сразу
		if(!!NewList && Object.hasOwn(NewList, msg.text))
		{	//вытащим чисто имя файла
			let tmp=NewList[msg.text].split('/');
			let filename=tmp[tmp.length-1];//имя файла в конце
			await fs.promises.unlink(NewList[msg.text]);//удаляем файл из папки
			while(Object.hasOwn(opt, filename)) delete opt[filename];//стираем подпись
			WriteFileJson(PathToDoc+'/'+file_key+'/'+'FileCaption.json', opt);//сохраняем файл
			WriteLogFile(NewList[msg.text]+' was Deleted');
			//надо удалить запись из FileId, если там есть
			while(Object.hasOwn(FileId, filename)) {delete FileId[filename]; WriteFileJson(currentDir+'/FileId.txt',FileId);}
			await sendMessage(chatId, 'Выбранный файл успешно удален!', klava(LastKey[chatId],null, chatId));
		}
		else //присланный номер не находится в папке, доступен только по fileId
		{	//достаем из opt имена файлов, которых нет в папке, и кладем их в NewList
			for(let name in opt) {if(!Object.hasOwn(FileList, name)) {NewList[k] = name; k++;}}
			if(!!NewList && Object.hasOwn(NewList, msg.text))
			{	while(Object.hasOwn(opt, NewList[msg.text])) delete opt[NewList[msg.text]];//стираем подпись
				WriteFileJson(PathToDoc+'/'+file_key+'/'+'FileCaption.json', opt);//сохраняем файл
				WriteLogFile(NewList[msg.text]+' was Deleted');
				//надо удалить запись из FileId, если там есть
				while(Object.hasOwn(FileId, NewList[msg.text])) {delete FileId[NewList[msg.text]]; WriteFileJson(currentDir+'/FileId.txt',FileId);}
				await sendMessage(chatId, 'Выбранный файл успешно удален!', klava(LastKey[chatId],null, chatId));
			}
			else
			{	await sendMessage(chatId, 'Такого номера нет в списке!', klava('Назад',{'backbutton':LastKey[chatId]}, chatId));//Отмена
			}
		}
	}
	//пришел номер файла для удаления из /video
	else if((validAdmin(chatId) || (validUser(chatId) && !PRIVAT)) && WaitEditText[chatId]==20 && video_key!='')
	{	if(Number(msg.text)==0) return;
		WaitEditText[chatId]=0;
		let k = 1;
		//загружаем список файлов из /video - полный путь
		const isFile = fileName => {return fs.lstatSync(fileName).isFile()};
		let files = fs.readdirSync(PathToVideo+'/'+video_key).map(fileName => {return path.join(PathToVideo+'/'+video_key, fileName)}).filter(isFile);
		//заполним объект FileList
		let FileList = new Object();
		for(let i in files) 
		{	let tmp=files[i].split('/'); let name=tmp[tmp.length-1];//вытащим чисто имя файла в конце
			if(name != 'FileCaption.json') {FileList[name]=files[i];} 
		}
		//загрузим подписи и fileId в opt
		let opt = new Object();
		try {opt = JSON.parse(await fs.promises.readFile(PathToVideo+'/'+video_key+'/'+'FileCaption.json'));}//загрузим подписи 
		catch (err) {}
		//если FileList не пустой, то сортируем его в том порядке, как загружался в FileCaption.json
		if(!!FileList && Object.keys(FileList).length && !!opt && Object.keys(opt).length)
		{	let tobj = new Object();
			for(let name in opt)
			{if(Object.hasOwn(FileList, name)) {tobj[name]=FileList[name];}
			}
			FileList = tobj;
		}
		//теперь соберем список файлов воедино
		let NewList = new Object();//новый список
		//сначала полные пути из папки
		k = 1;
		for(let name in FileList) {NewList[k] = FileList[name]; k++;}
		//если присланный номер файла уже находится в массиве, то удаляем файл сразу
		if(!!NewList && Object.hasOwn(NewList, msg.text))
		{	//вытащим чисто имя файла
			let tmp=NewList[msg.text].split('/');
			let filename=tmp[tmp.length-1];//имя файла в конце
			await fs.promises.unlink(NewList[msg.text]);//удаляем файл из папки
			while(Object.hasOwn(opt, filename)) delete opt[filename];//стираем подпись
			WriteFileJson(PathToVideo+'/'+video_key+'/'+'FileCaption.json', opt);//сохраняем файл
			WriteLogFile(NewList[msg.text]+' was Deleted');
			//надо удалить запись из FileId, если там есть
			while(Object.hasOwn(FileId, filename)) {delete FileId[filename]; WriteFileJson(currentDir+'/FileId.txt',FileId);}
			await sendMessage(chatId, 'Выбранный файл успешно удален!', klava(LastKey[chatId],null, chatId));
		}
		else //присланный номер не находится в папке, доступен только по fileId
		{	//достаем из opt имена файлов, которых нет в папке, и кладем их в NewList
			for(let name in opt) {if(!Object.hasOwn(FileList, name)) {NewList[k] = name; k++;}}
			if(!!NewList && Object.hasOwn(NewList, msg.text))
			{	while(Object.hasOwn(opt, NewList[msg.text])) delete opt[NewList[msg.text]];//стираем подпись
				WriteFileJson(PathToVideo+'/'+video_key+'/'+'FileCaption.json', opt);//сохраняем файл
				WriteLogFile(NewList[msg.text]+' was Deleted');
				//надо удалить запись из FileId, если там есть
			while(Object.hasOwn(FileId, NewList[msg.text])) {delete FileId[NewList[msg.text]]; WriteFileJson(currentDir+'/FileId.txt',FileId);}
			await sendMessage(chatId, 'Выбранный файл успешно удален!', klava(LastKey[chatId],null, chatId));
			}
			else
			{	await sendMessage(chatId, 'Такого номера нет в списке!', klava('Назад',{'backbutton':LastKey[chatId]}, chatId));//Отмена
			}
		}
	}
	//пришел номер файла для удаления из /audio
	else if((validAdmin(chatId) || (validUser(chatId) && !PRIVAT)) && WaitEditText[chatId]==30 && audio_key!='')
	{	if(Number(msg.text)==0) return;
		WaitEditText[chatId]=0;
		let k = 1;
		//загружаем список файлов из /audio - полный путь
		const isFile = fileName => {return fs.lstatSync(fileName).isFile()};
		let files = fs.readdirSync(PathToAudio+'/'+audio_key).map(fileName => {return path.join(PathToAudio+'/'+audio_key, fileName)}).filter(isFile);
		//заполним объект FileList
		let FileList = new Object();
		for(let i in files) 
		{	let tmp=files[i].split('/'); let name=tmp[tmp.length-1];//вытащим чисто имя файла в конце
			if(name != 'FileCaption.json') {FileList[name]=files[i];} 
		}
		//загрузим подписи и fileId в opt
		let opt = new Object();
		try {opt = JSON.parse(await fs.promises.readFile(PathToAudio+'/'+audio_key+'/'+'FileCaption.json'));}//загрузим подписи 
		catch (err) {}
		//если FileList не пустой, то сортируем его в том порядке, как загружался в FileCaption.json
		if(!!FileList && Object.keys(FileList).length && !!opt && Object.keys(opt).length)
		{	let tobj = new Object();
			for(let name in opt)
			{if(Object.hasOwn(FileList, name)) {tobj[name]=FileList[name];}
			}
			FileList = tobj;
		}
		//теперь соберем список файлов воедино
		let NewList = new Object();//новый список
		//сначала полные пути из папки
		k = 1;
		for(let name in FileList) {NewList[k] = FileList[name]; k++;}
		//если присланный номер файла уже находится в массиве, то удаляем файл сразу
		if(!!NewList && Object.hasOwn(NewList, msg.text))
		{	//вытащим чисто имя файла
			let tmp=NewList[msg.text].split('/');
			let filename=tmp[tmp.length-1];//имя файла в конце
			await fs.promises.unlink(NewList[msg.text]);//удаляем файл из папки
			while(Object.hasOwn(opt, filename)) delete opt[filename];//стираем подпись
			WriteFileJson(PathToAudio+'/'+audio_key+'/'+'FileCaption.json', opt);//сохраняем файл
			WriteLogFile(NewList[msg.text]+' was Deleted');
			//надо удалить запись из FileId, если там есть
			while(Object.hasOwn(FileId, filename)) {delete FileId[filename]; WriteFileJson(currentDir+'/FileId.txt',FileId);}
			await sendMessage(chatId, 'Выбранный файл успешно удален!', klava(LastKey[chatId],null, chatId));
		}
		else //присланный номер не находится в папке, доступен только по fileId
		{	//достаем из opt имена файлов, которых нет в папке, и кладем их в NewList
			for(let name in opt) {if(!Object.hasOwn(FileList, name)) {NewList[k] = name; k++;}}
			if(!!NewList && Object.hasOwn(NewList, msg.text))
			{	while(Object.hasOwn(opt, NewList[msg.text])) delete opt[NewList[msg.text]];//стираем подпись
				WriteFileJson(PathToAudio+'/'+audio_key+'/'+'FileCaption.json', opt);//сохраняем файл
				WriteLogFile(NewList[msg.text]+' was Deleted');
				//надо удалить запись из FileId, если там есть
				while(Object.hasOwn(FileId, NewList[msg.text])) {delete FileId[NewList[msg.text]]; WriteFileJson(currentDir+'/FileId.txt',FileId);}
				await sendMessage(chatId, 'Выбранный файл успешно удален!', klava(LastKey[chatId],null, chatId));
			}
			else
			{	await sendMessage(chatId, 'Такого номера нет в списке!', klava('Назад',{'backbutton':LastKey[chatId]}, chatId));//Отмена
			}
		}
	}
	//пришел номер события для удаления
	else if(validAdmin(chatId) && WaitEditText[chatId]==40)
	{	WaitEditText[chatId]=0;
		if(Number(msg.text)==0) return;
		if(!!EventList && Object.hasOwn(EventList, msg.text)) delete EventList[msg.text];//удаляем событие
		EventList = shiftObject(EventList);//переупорядочиваем номера событий
		WriteFileJson(FileEventList,EventList);//сохраняем файл событий
		sendEvents(chatId, false);
	}
	//пришел текст для общей рассылки
	else if((validAdmin(chatId) || (validUser(chatId) && !PRIVAT)) && WaitEditText[chatId]==6)
	{	WaitEditText[chatId]=0;
		sendPublicText(msg);//функция рассылки с задержкой
		await sendMessage(chatId, 'Процесс пошел!', klava('Назад',{'backbutton':LastKey[chatId]}, chatId));
	}
	//пришел текст для рассылки Админам
	else if((validAdmin(chatId) || (validUser(chatId) && !PRIVAT)) && WaitEditText[chatId]=='public2admins')
	{	WaitEditText[chatId]=0;
		sendPublicTextAdmin(msg);//функция рассылки с задержкой
		await sendMessage(chatId, 'Процесс пошел!', klava('Назад',{'backbutton':LastKey[chatId]}, chatId));
	}
	//пришел текст личной истории для добавления
	else if((validAdmin(chatId) || (validUser(chatId) && !PRIVAT)) && WaitEditText[chatId]==7)
	{	WaitEditText[chatId]=0;
		let history = new Object();
		let flag=1;
		try
		{   if(msg.text.length<=4096)
			{history = JSON.parse(await fs.promises.readFile(FileHistory));
			 history = shiftObject(history);//упорядочиваем номера-ключи в массиве
			 let mas = Object.keys(history);
			 //создаем новую запись
			 let keys=Number(mas[mas.length-1])+1;
			 history[String(keys)]=new Object();
			 history[String(keys)].text=msg.text;
			 history[String(keys)].entities=msg.entities;
			 //сохраняем историю
			 WriteFileJson(FileHistory,history);
			 flag=0;
			}
		} catch(err) {console.error(err);}
		if(flag==0) await sendMessage(chatId, 'История добавлена!', klava('Назад',{'backbutton':LastKey[chatId]}, chatId));
		else await sendMessage(chatId, 'Текст истории слишком велик, история не добавлена!', klava('Назад',{'backbutton':LastKey[chatId]}, chatId));
	}
	//пришел номер личной истории для удаления
	else if((validAdmin(chatId) || (validUser(chatId) && !PRIVAT)) && WaitEditText[chatId]==8)
	{	WaitEditText[chatId]=0;
		let str = '';
		let history = new Object();
		try
		{   history = JSON.parse(await fs.promises.readFile(FileHistory));
			history = shiftObject(history);//упорядочиваем номера-ключи в массиве
			let mas = Object.keys(history);
			let num = msg.text;//номер истории
			if(mas.indexOf(num)+1) 
			{	delete history[num];
				history = shiftObject(history);//упорядочиваем номера-ключи в массиве
				WriteFileJson(FileHistory,history);//сохраняем историю 
				str = 'История удалена';
			}
			else str = 'Такого номера нет в списке!';
		}
		catch(err) {console.error(err);}
		await sendMessage(chatId, str, klava('Назад',{'backbutton':LastKey[chatId]}, chatId));
	}
	//если пришла дата начала срока чистоты
	else if(msg.text.indexOf('начало=')+1)
	{	let date = msg.text.replace('начало=','');//дата начала срока
		let smoke = false;
		if(date.indexOf('БН')+1) {date = date.replace('БН',''); smoke = true;}
		if(date == moment(date,'DD.MM.YYYY').format('DD.MM.YYYY'))//если дата верна
		{	if(!Object.hasOwn(LastMessId, chatId)) LastMessId[chatId] = {};
			if(smoke==false) LastMessId[chatId].srok = date;
			else LastMessId[chatId].smoke = date;
			srok(chatId);
		}
		else
		{	let str = 'Дата не соответствует шаблону, или символы введены некорректно!\nПопробуйте еще разок...\n';
			str +='*начало=ДД.ММ.ГГГГ*';
			await sendMessage(chatId, str, {parse_mode:"markdown"});
		}
	}
	// если пришел ответ на вопрос по 10му шагу
	else if(!!LastMessId[chatId] && Object.hasOwn(LastMessId[chatId], 'countTen') && LastMessId[chatId].countTen > -1)
	{	
		if(!!AnswerList && !Object.hasOwn(AnswerList, chatId)) AnswerList[chatId] = [];
		AnswerList[chatId][LastMessId[chatId].countTen-1] = msg.text;//ответ
		//пробуем загрузить файл вопросов пользователя, если нету, то стандартный набор
		let List = [];
		let path = PathToQuestions+'/'+chatId+'.txt';//путь к файлу вопросов пользователя
		try {List = (await fs.promises.readFile(path)).toString().split('\n');} catch (err) {List = TenList;}
		
		if(LastMessId[chatId].countTen < List.length) 
		{	sendTenStep(chatId);
		}
		else 
		{	//создаем файл вопрос/ответ
			if(AnswerList[chatId].length == List.length)
			{
				let str = '';
				for(let i=0;i<List.length;i++)
				{	str += (i+1)+'.\n'+'Вопрос: '+List[i]+'\n';
					str += 'Ответ: '+AnswerList[chatId][i]+'\n\n';
				}
				await fs.promises.writeFile(currentDir+'/'+chatId+'.txt', str);//записываем временный файл
				await sendDocument(chatId, currentDir+'/'+chatId+'.txt');//посылаем файл
				delete AnswerList[chatId];//удаляем массив ответов
			}
			let index = LastMessId[chatId].indexTen;
			LastMessId[chatId].countTen = -1;
			await sendMessage(chatId, 'Поздравляю!\nТы здорово поработал(а) сегодня!💪🏼 Забери файл своих ответов.', klava(index,null, chatId), index);
			if(fs.existsSync(currentDir+'/'+chatId+'.txt')) await fs.promises.unlink(currentDir+'/'+chatId+'.txt');//удаляем временный файл
			//setTimeout(function() {await fs.promises.unlink(currentDir+'/'+chatId+'.txt');},1000);
		}
	}
	//пришел текст со списком вопросов по 10му шагу
	else if(WaitEditText[chatId]=='questions')
	{	WaitEditText[chatId]=0;
		let List = msg.text.split('\n');//делаем массив строк
		if((List[0].indexOf('delete')+1)||(List[0].indexOf('Delete')+1))//если просят удаление списка
		{	if(fs.existsSync(PathToQuestions+'/'+chatId+'.txt'))
			{	await fs.promises.unlink(PathToQuestions+'/'+chatId+'.txt');//удаляем файл
				await sendMessage(chatId, 'Вы просили - мы удалили! :)', klava(LastKey[chatId],null, chatId));
			}
			else await sendMessage(chatId, smilik, klava(LastKey[chatId],null, chatId));
			return;
		}
		for(let i in List) if(List[i]=='') delete List[i];//удаляем пустые строки
		let str = '';
		if(List.length>0) {for(let i in List) str += List[i]+'\n';}//создадим строки вопросов
		str = str.replace(/\n$/m, '');
		if(!!str) 
		{	await sendMessage(chatId, str);
			await fs.promises.writeFile(PathToQuestions+'/'+chatId+'.txt', str);//запишем файл вопросов пользователя
			await sendMessage(chatId, 'Вот что я получил и запомнил! 👆🏻', klava(LastKey[chatId],null, chatId));
		}
		else await sendMessage(chatId, 'Ничего не получилось... 😢', klava(LastKey[chatId],null, chatId));
	}
	else if(msg.text === "❌ Отменить")
	{	//Убираем предыдущее сообщение
		if(!!LastMessId[chatId].messId) await Bot.deleteMessage(chatId, LastMessId[chatId].messId);
		await Bot.deleteMessage(chatId, msg.message_id);
		// Убираем текстовую клавиатуру
		let res = await sendMessage(chatId, 'Привет, '+firstname+'!', {reply_markup: {remove_keyboard: true}});//удаляем белую кнопку
		try {await Bot.deleteMessage(chatId, res.message_id);} catch(err) {console.log(err);}//удаляем верхнее сообщение
		let index='0';
		await sendMessage(chatId, Tree[index].text, klava('0', Tree[index].entities, chatId), index);
	}
	else if(msg.text === "Удалить мою локацию")
	{	//Убираем предыдущее сообщение
		if(!!LastMessId[chatId].messId) await Bot.deleteMessage(chatId, LastMessId[chatId].messId);
		await Bot.deleteMessage(chatId, msg.message_id);
		// Убираем текстовую клавиатуру
		let res = await sendMessage(chatId, 'Привет, '+firstname+'!', {reply_markup: {remove_keyboard: true}});//удаляем белую кнопку
		try {await Bot.deleteMessage(chatId, res.message_id);} catch(err) {console.log(err);}//удаляем верхнее сообщение
		delete LastMessId[chatId].location;
		let index='0';
		await sendMessage(chatId, Tree[index].text, klava('0', Tree[index].entities, chatId), index);
	}
	else
	{	//если пришел текст 'от фонаря'
		if(SignOff != 0 && !Object.hasOwn(LastMessId, chatId)) return;//если ни разу не был
		let index='0';
		if(!Object.hasOwn(Tree[index], 'text'))
		{  	Tree[index].text = 'Тут пока ничего нет\n';
			if(validAdmin(chatId) || (validUser(chatId) && !PRIVAT)) 
				Tree[index].text += '/help - выдаст полный список команд';
		}
		await sendMessage(chatId, Tree[index].text, klava('0', Tree[index].entities, chatId), index);
	}
}catch(err){WriteLogFile(err+'\nfrom ловим message','вчат');}
});
//====================================================================
// ловим ФОТО
Bot.on('photo', async (msg) => 
{		
try{	
	if(msg.from && msg.from.is_bot) return;//ботов не пускаем
	const chatId = msg.chat.id.toString();
	if(!isValidChatId(chatId)) return;//левые chatId не пускаем
	const firstname = msg.chat.first_name;
	if(PRIVAT && !validAdmin(chatId) && !validUser(chatId)) return;//приватность
	const file_id = msg.photo[msg.photo.length-1].file_id;
	const caption = msg.caption;//подпись
	const caption_entities = JSON.stringify(msg.caption_entities);//форматирование
	let media_group_id = msg.media_group_id;
	
	//если фотка для /photo
	if((validAdmin(chatId) || (validUser(chatId) && !PRIVAT)) && WaitEditText[chatId]==11 && photos_key!='')
	{	//проверяем подпись
		if(Object.hasOwn(msg,'caption') && caption.length > 1000)
		{	await sendMessage(chatId, '🤷‍♂️Сожалею, но подпись не может превышать 1000 символов!🤷‍♂️', klava('Назад',{'backbutton':LastKey[chatId]}, chatId));
			WaitEditText[chatId]=0;
			//если файлы уже были загружены, то нужно их удалить!
			if(media_group_id) {await deleteMediaFiles(MediaList[media_group_id]); delete MediaList[media_group_id];}
			photos_key='';
			return;
		}
		if(!media_group_id) WaitEditText[chatId]=0;
		let key = photos_key;
		let path;
		//загружаем файл
		try {path = await Bot.downloadFile(file_id, PathToPhoto+'/'+key);}
		catch(err)
		{   await sendMessage(chatId, 'Не могу загрузить этот файл!\n'+smilik, klava('Назад',{'backbutton':LastKey[chatId]}, chatId));
			WaitEditText[chatId]=0;
			//если файлы уже были загружены, то нужно их удалить!
			if(media_group_id) {await deleteMediaFiles(MediaList[media_group_id]); delete MediaList[media_group_id];}
			photos_key='';
			return;
		}
		//если одиночная картинка
		if(!media_group_id)
		{	//вытащим чисто имя файла
			let tmp=path.split('/');
			let name=tmp[tmp.length-1];//имя файла в конце
			let opt = new Object();
			//загружаем подписи из файла
			try {opt = JSON.parse(await fs.promises.readFile(PathToPhoto+'/'+key+'/'+'FileCaption.json'));} 
			catch (err) {console.log('from photo\n'+err);}
			opt[name] = new Object();
			opt[name].caption = caption;
			opt[name].caption_entities = caption_entities;
			WriteFileJson(PathToPhoto+'/'+key+'/'+'FileCaption.json', opt);//сохраняем подписи в файл
			WriteLogFile("New photo was loaded to "+path+ " by "+firstname);
			if(!LastKey[chatId]) LastKey[chatId] = '0';
			await sendMessage(chatId, 'Поздравляю! Фотка '+name+' загружена!', klava('Назад',{'backbutton':LastKey[chatId]}, chatId));
			photos_key='';
		}
		//если альбом
		else if(!!MediaList[media_group_id].count)
		{	if(!Object.hasOwn(MediaList, media_group_id) || MediaList[media_group_id].media.length==0)//если первый файл альбома
			{	if(!Object.hasOwn(MediaList, media_group_id)) MediaList[media_group_id] = {};
				if(!Object.hasOwn(MediaList, 'media')) MediaList[media_group_id].media = [];
				MediaList[media_group_id].type = 'album';
			}
			let mobj = {};
			mobj.type = 'photo';//тип
			if(!!caption) mobj.caption = caption;
			if(!!caption_entities) mobj.caption_entities = caption_entities;
			if(!!file_id) mobj.file_id = file_id;
			mobj.media = path;//путь
			MediaList[media_group_id].media.push(mobj);//пушим объект
			//проверяем конец альбома
			if(MediaList[media_group_id].media.length == MediaList[media_group_id].count.length)
			{	let opt = new Object();
				//загружаем подписи из файла
				if(!fs.existsSync(PathToPhoto+'/'+key+'/'+'FileCaption.json')) await WriteFileJson(PathToPhoto+'/'+key+'/'+'FileCaption.json', {});
				try {opt = JSON.parse(await fs.promises.readFile(PathToPhoto+'/'+key+'/'+'FileCaption.json'));}
				catch (err) {console.log('from photo\n'+err);}
				opt[media_group_id] = {};
				opt[media_group_id].media = MediaList[media_group_id].media;
				opt[media_group_id].type = MediaList[media_group_id].type;
				opt[media_group_id].media = sortMedia(opt[media_group_id].media);
				WriteFileJson(PathToPhoto+'/'+key+'/'+'FileCaption.json', opt);//сохраняем подписи в файл
				WriteLogFile("New album was loaded to "+PathToPhoto+'/'+key+ " by "+firstname);
				if(!LastKey[chatId]) LastKey[chatId] = '0';
				await sendMessage(chatId, 'Поздравляю! Альбом '+media_group_id+' загружен!', klava('Назад',{'backbutton':LastKey[chatId]}, chatId));
				photos_key='';
				WaitEditText[chatId]=0;
				delete MediaList[media_group_id];
			}
		}
		else
		{	WaitEditText[chatId]=0;
			//если файлы уже были загружены, то нужно их удалить!
			if(media_group_id) {await deleteMediaFiles(MediaList[media_group_id]); delete MediaList[media_group_id];}
			console.log('Удаляю MediaList[media_group_id]');
		}
	}
	//если картинка для кнопки text
	else if((validAdmin(chatId) || (validUser(chatId) && !PRIVAT)) && WaitEditText[chatId]==1)
	{	//проверяем подпись
		if(Object.hasOwn(msg,'caption') && caption.length > 1000)
		{	await sendMessage(chatId, '🤷‍♂️Сожалею, но подпись не может превышать 1000 символов!🤷‍♂️', klava('Назад',{'backbutton':LastKey[chatId]}, chatId));
			WaitEditText[chatId]=0;
			return;
		}
		WaitEditText[chatId]=0;
		let key = '';
		if(!!LastKey[chatId] && Object.hasOwn(Tree, LastKey[chatId])) key = LastKey[chatId];
		//console.log('LastKey[chatId]='+LastKey[chatId]);
		LastKey[chatId] = null;
		let path;
		//если одиночная картинка
		if(!media_group_id && !!key)
		{	//загружаем файл
			try 
			{	//сначала очистим старое
				if(fs.existsSync(PathToPhoto+'/'+key)) {await delDir(key);}//удаляем папку с картинкой
				if(!!Tree[key].filename) 
				{	while(Object.hasOwn(FileId, Tree[key].filename)) {delete FileId[Tree[key].filename];}
					delete Tree[key].filename;
				}
				if(!!Tree[key].caption) delete Tree[key].caption;
				if(!!Tree[key].caption_entities) delete Tree[key].caption_entities;
				Tree[key].text = 'начальный текст';
				//создадим папку для картинки
				if(!fs.existsSync(PathToPhoto+'/'+key)) {fs.mkdirSync(PathToPhoto+'/'+key);}
				path = await Bot.downloadFile(file_id, PathToPhoto+'/'+key);
			}
			catch(err)
			{   if(!key) key = '0';
				await sendMessage(chatId, 'Не могу загрузить этот файл!\n'+smilik, klava('Назад',{'backbutton':key}, chatId));
				WaitEditText[chatId]=0;
				return;
			}
			//вытащим чисто имя файла
			let tmp=path.split('/');
			let name=tmp[tmp.length-1];//имя файла в конце
			while(Object.hasOwn(FileId, name)) {delete FileId[name];}
			FileId[name] = file_id;
			WriteFileJson(currentDir+'/FileId.txt',FileId);
			Tree[key].filename = name;//в кнопку имя файла
			if(!!caption) Tree[key].caption = caption;//в кнопку подпись
			if(!!caption_entities) Tree[key].caption_entities = caption_entities;//в кнопку форматирование
			if(!!Tree[key].text) Tree[key].text = '';//очищаем
			if(!!Tree[key].entities) delete Tree[key].entities;//очищаем
			WriteFileJson(FileTree,Tree);
			await sendMessage(chatId, 'Принято! Можно проверять.', klava(key, null, chatId));
		}
	}
	else 
	{	await sendMessage(chatId, 'Что-то пошло не так!\n'+smilik, klava('Назад',{'backbutton':LastKey[chatId]}, chatId));
		WaitEditText[chatId]=0;
	}
}catch(err){WriteLogFile(err+'\nfrom ловим ФОТО','вчат');}
});
//====================================================================
// ловим ДОКУМЕНТ
Bot.on('document', async (msg) => 
{			
try{
	if(msg.from && msg.from.is_bot) return;//ботов не пускаем
	const chatId = msg.chat.id.toString();
	if(!isValidChatId(chatId)) return;//левые chatId не пускаем
	const firstname = msg.chat.first_name;
	if(PRIVAT && !validAdmin(chatId) && !validUser(chatId)) return;//приватность
	const file_id = msg.document.file_id;
	const file_size = msg.document.file_size;
	const caption = msg.caption;//подпись
	const caption_entities = JSON.stringify(msg.caption_entities);//форматирование
	let media_group_id = msg.media_group_id;
	//проверяем подпись
	if(Object.hasOwn(msg,'caption') && caption.length > 1000)
	{	await sendMessage(chatId, '🤷‍♂️Сожалею, но подпись не может превышать 1000 символов!🤷‍♂️', klava('Назад',{'backbutton':LastKey[chatId]}, chatId));
		WaitEditText[chatId]=0;
		file_key='';
		return;
	}
	let filename;
	if(msg.document.file_name) //если у файла есть имя
	{	filename = msg.document.file_name;
		if(Object.hasOwn(FileId, filename))//перезапишем, если Админом уже был пойман этот файл
		{	while(Object.hasOwn(FileId, filename)) delete FileId[filename];//удаляем старое
			FileId[filename] = msg.document.file_id;
		}
	}
	else filename = msg.document.file_unique_id;//если имени нет, то короткий id
	
	if((validAdmin(chatId) || (validUser(chatId) && !PRIVAT)) && WaitEditText[chatId]==4 && file_key!='')//если ждем файл от админа или служенца
	{	WaitEditText[chatId]=0;
		let key = file_key;
		//именованные файлы заносим в общий список
		if(msg.document.file_name)
		{	while(Object.hasOwn(FileId, msg.document.file_name)) delete FileId[msg.document.file_name]; 
			FileId[msg.document.file_name] = msg.document.file_id;
		}
		//сохраним подписи и fileId в массив
		let opt = new Object();
		try{opt = JSON.parse(await fs.promises.readFile(PathToDoc+'/'+key+'/'+'FileCaption.json'));}//читаем файл подписей 
		catch (err) {}
		if(!Object.hasOwn(opt, filename)) opt[filename] = new Object();
		opt[filename].fileId = file_id;//сохраняем fileId
		opt[filename].caption = caption;
		opt[filename].caption_entities = caption_entities;
		WriteFileJson(PathToDoc+'/'+key+'/'+'FileCaption.json', opt);//сохраняем подписи в файл
		//загружаем файл
        let path;
		try {path = await Bot.downloadFile(file_id, PathToDoc+'/'+key);}//загружаем файл
        catch(err)
		{   let str='Не могу загрузить этот файл '+filename+'!\n';
			str += 'Длина файла = '+file_size+'\n';
			str += 'Файл будет хранится на серверах Telegram и будет доступен для чтения';
			await sendMessage(chatId, str, klava('Назад',{'backbutton':LastKey[chatId]}, chatId));
			file_key='';
			return;
		}
		//вытащим чисто имя файла
		let tmp=path.split('/');
		let name=tmp[tmp.length-1];//имя файла в конце
		//переименуем файл
		let newpath = path.replace(name,filename);
		fs.renameSync(path, newpath);
		WriteLogFile("New doc was loaded to "+newpath+" by "+firstname);
		if(!LastKey[chatId]) LastKey[chatId] = '0';
		await sendMessage(chatId, 'Поздравляю! Файл '+filename+' загружен!', klava('Назад',{'backbutton':LastKey[chatId]}, chatId));
		file_key='';
	}
	//пришел файл со списком вопросов по 10му шагу
	else if(WaitEditText[chatId]=='questions')
	{	WaitEditText[chatId]=0;
		//загружаем файл
        let path;
		try {path = await Bot.downloadFile(file_id, PathToQuestions+'/');}//загружаем файл
        catch(err)
		{   let str='Не могу загрузить этот файл '+filename+'!\n';
			await sendMessage(chatId, str, klava(LastKey[chatId],null, chatId));
			return;
		}
		//проверим файл на размер
		if(fs.statSync(path).size > 20000)
		{	await sendMessage(chatId, 'Не нравится мне это файл... '+smilik, klava(LastKey[chatId],null, chatId));
			await fs.promises.unlink(path);//удаляем временный файл
			return;
		}
		//если файл короткий, то просто удаляем файл пользователя, если он есть
		if(fs.statSync(path).size<5) 
		{	/*if(fs.existsSync(PathToQuestions+'/'+chatId+'.txt'))
			{	await fs.promises.unlink(PathToQuestions+'/'+chatId+'.txt');//удаляем файл
				await sendMessage(chatId, 'Список своих вопросов был удален!', klava(LastKey[chatId]));
			}
			else*/ await sendMessage(chatId, smilik, klava(LastKey[chatId],null, chatId));
			await fs.promises.unlink(path);//удаляем временный файл
			return;
		}
		//разбираем принятый файл в массив вопросов
		let List = [];
		try {List = (await fs.promises.readFile(path)).toString().split('\n');} catch (err) {}
		if(List.length>0) for(let i in List) if(List[i]=='') delete List[i];//удаляем пустые строки 
		let str = '';
		if(List.length>0) {for(let i in List) str += List[i]+'\n';}//создадим строки вопросов
		str = str.replace(/\n$/m, '');
		if(!!str) 
		{	if(str.length>4000) str = str.substring(0,4000);
			await sendMessage(chatId, str);
			await fs.promises.writeFile(PathToQuestions+'/'+chatId+'.txt', str);//запишем файл вопросов пользователя
			await sendMessage(chatId, 'Вот что я получил и запомнил! 👆🏻', klava(LastKey[chatId],null, chatId));
		}
		else await sendMessage(chatId, 'Ничего не получилось... 😢', klava(LastKey[chatId],null, chatId));
		//удаляем временный файл
		await fs.promises.unlink(path);
	}
	else //если пришел файл от Админа без ожидания, то сохраним его id
	{	if(msg.document.file_name) //если у файла есть имя
		{	while(Object.hasOwn(FileId, msg.document.file_name)) delete FileId[msg.document.file_name]; 
			FileId[msg.document.file_name] = msg.document.file_id;
			WriteFileJson(currentDir+'/FileId.txt',FileId);
		}
	}
}catch(err){WriteLogFile(err+'\nfrom ловим ДОКУМЕНТ','вчат');}
});
//====================================================================
// ловим ВИДЕО
Bot.on('video', async (msg) => 
{			
try{
	if(msg.from && msg.from.is_bot) return;//ботов не пускаем
	const chatId = msg.chat.id.toString();
	if(!isValidChatId(chatId)) return;//левые chatId не пускаем
	const firstname = msg.chat.first_name;
	if(PRIVAT && !validAdmin(chatId) && !validUser(chatId)) return;//приватность
	const file_id = msg.video.file_id;
	const file_size = msg.video.file_size;
	const caption = msg.caption;//подпись
	const caption_entities = JSON.stringify(msg.caption_entities);//форматирование
	let media_group_id = msg.media_group_id;
	//проверяем подпись
	if(Object.hasOwn(msg,'caption') && caption.length > 1000)
	{	await sendMessage(chatId, '🤷‍♂️Сожалею, но подпись не может превышать 1000 символов!🤷‍♂️', klava('Назад',{'backbutton':LastKey[chatId]}, chatId));
		WaitEditText[chatId]=0;
		video_key='';
		return;
	}
	let filename;
	if(msg.video.file_name) //если у файла есть имя
	{	filename = msg.video.file_name;
		if(Object.hasOwn(FileId, filename))//перезапишем, если Админом уже был пойман этот файл
		{	while(Object.hasOwn(FileId, filename)) delete FileId[filename];//удаляем старое
			FileId[filename] = msg.video.file_id;
		}
	}
	else filename = msg.video.file_unique_id;//если имени нет, то короткий id
	
	//если ждем альбом от админа или служенца
	if((validAdmin(chatId) || (validUser(chatId) && !PRIVAT)) && WaitEditText[chatId]==11 && photos_key!='' && !!media_group_id)
	{	let key = photos_key;
		//именованные файлы заносим в общий список
		if(msg.video.file_name)
		{	while(Object.hasOwn(FileId, msg.video.file_name)) delete FileId[msg.video.file_name]; 
			FileId[msg.video.file_name] = msg.video.file_id;
		}
		//загружаем файл
        let path;
		try {path = await Bot.downloadFile(file_id, PathToPhoto+'/'+key);}//загружаем файл
        catch(err)
		{   let str='Не могу записать этот файл '+filename+'!\n';
			str += 'Длина файла = '+file_size+'\n';
			str += 'Файл будет хранится на серверах Telegram и будет доступен для чтения';
			await sendMessage(chatId, str);
		}
		if(!Object.hasOwn(MediaList, media_group_id) || MediaList[media_group_id].media.length==0)//если первый файл альбома
		{	if(!Object.hasOwn(MediaList, media_group_id)) MediaList[media_group_id] = {};
			if(!Object.hasOwn(MediaList, 'media')) MediaList[media_group_id].media = [];
			MediaList[media_group_id].type = 'album';
		}
		let mobj = {};
		mobj.type = 'video';//тип
		if(!!caption) mobj.caption = caption;
		if(!!caption_entities) mobj.caption_entities = caption_entities;
		if(!!path) mobj.media = path; else mobj.media = file_id;//путь
		if(!!file_id) mobj.file_id = file_id;
		MediaList[media_group_id].media.push(mobj);//пушим объект
		//проверяем конец альбома
		if(MediaList[media_group_id].media.length == MediaList[media_group_id].count.length)
		{	let opt = new Object();
			//загружаем подписи из файла
			if(!fs.existsSync(PathToPhoto+'/'+key+'/'+'FileCaption.json')) await WriteFileJson(PathToPhoto+'/'+key+'/'+'FileCaption.json', {});
			try {opt = JSON.parse(await fs.promises.readFile(PathToPhoto+'/'+key+'/'+'FileCaption.json'));}
			catch (err) {console.log('from video\n'+err);}
			opt[media_group_id] = {};
			opt[media_group_id].media = MediaList[media_group_id].media;
			opt[media_group_id].type = MediaList[media_group_id].type;
			opt[media_group_id].media = sortMedia(opt[media_group_id].media);
			WriteFileJson(PathToPhoto+'/'+key+'/'+'FileCaption.json', opt);//сохраняем подписи в файл
			WriteLogFile("New album was loaded to "+PathToPhoto+'/'+key+ " by "+firstname);
			if(!LastKey[chatId]) LastKey[chatId] = '0';
			await sendMessage(chatId, 'Поздравляю! Альбом '+media_group_id+' загружен!', klava('Назад',{'backbutton':LastKey[chatId]}, chatId));
			photos_key='';
			WaitEditText[chatId]=0;
			delete MediaList[media_group_id];
		}
	}
	//если ждем файл от админа или служенца
	else if((validAdmin(chatId) || (validUser(chatId) && !PRIVAT)) && WaitEditText[chatId]==21 && video_key!='')
	{	WaitEditText[chatId]=0;
		let key = video_key;
		//именованные файлы заносим в общий список
		if(msg.video.file_name)
		{	while(Object.hasOwn(FileId, msg.video.file_name)) delete FileId[msg.video.file_name]; 
			FileId[msg.video.file_name] = msg.video.file_id;
		}
		//сохраним подписи и fileId в массив
		let opt = new Object();
		try{opt = JSON.parse(await fs.promises.readFile(PathToVideo+'/'+key+'/'+'FileCaption.json'));}//читаем файл подписей 
		catch (err) {}
		if(!Object.hasOwn(opt, filename)) opt[filename] = new Object();
		opt[filename].fileId = file_id;//сохраняем fileId
		opt[filename].caption = caption;
		opt[filename].caption_entities = caption_entities;
		WriteFileJson(PathToVideo+'/'+key+'/'+'FileCaption.json', opt);//сохраняем подписи в файл
		//загружаем файл
        let path;
		try {path = await Bot.downloadFile(file_id, PathToVideo+'/'+key);}//загружаем файл
        catch(err)
		{   let str='Не могу загрузить этот файл '+filename+'!\n';
			str += 'Длина файла = '+file_size+'\n';
			str += 'Файл будет хранится на серверах Telegram и будет доступен для чтения';
			await sendMessage(chatId, str, klava('Назад',{'backbutton':LastKey[chatId]}, chatId));
			video_key='';
			return;
		}
		//вытащим чисто имя файла
		let tmp=path.split('/');
		let name=tmp[tmp.length-1];//имя файла в конце
		//переименуем файл
		let newpath = path.replace(name,filename);
		fs.renameSync(path, newpath);
		WriteLogFile("New video was loaded to "+newpath+" by "+firstname);
		if(!LastKey[chatId]) LastKey[chatId] = '0';
		await sendMessage(chatId, 'Поздравляю! Файл '+filename+' загружен!', klava('Назад',{'backbutton':LastKey[chatId]}, chatId));
		video_key='';
	}
	else //если пришел файл от Админа без ожидания, то сохраним его id
	{	if(msg.video.file_name) //если у файла есть имя
		{	while(Object.hasOwn(FileId, msg.video.file_name)) delete FileId[msg.video.file_name]; 
			FileId[msg.video.file_name] = msg.video.file_id;
			WriteFileJson(currentDir+'/FileId.txt',FileId);
		}
	}
}catch(err){WriteLogFile(err+'\nfrom ловим ВИДЕО','вчат');}
});
//====================================================================
// ловим АУДИО
Bot.on('audio', async (msg) => 
{			
try{
	if(msg.from && msg.from.is_bot) return;//ботов не пускаем
	const chatId = msg.chat.id.toString();
	if(!isValidChatId(chatId)) return;//левые chatId не пускаем
	const firstname = msg.chat.first_name;
	if(PRIVAT && !validAdmin(chatId) && !validUser(chatId)) return;//приватность
	const file_id = msg.audio.file_id;
	const file_size = msg.audio.file_size;
	const caption = msg.caption;//подпись
	const caption_entities = JSON.stringify(msg.caption_entities);//форматирование
	let media_group_id = msg.media_group_id;
	//проверяем подпись
	if(Object.hasOwn(msg,'caption') && caption.length > 1000)
	{	await sendMessage(chatId, '🤷‍♂️Сожалею, но подпись не может превышать 1000 символов!🤷‍♂️', klava('Назад',{'backbutton':LastKey[chatId]}, chatId));
		WaitEditText[chatId]=0;
		audio_key='';
		return;
	}
	let filename;
	if(msg.audio.file_name) //если у файла есть имя
	{	filename = msg.audio.file_name;
		if(Object.hasOwn(FileId, filename))//перезапишем, если Админом уже был пойман этот файл
		{	while(Object.hasOwn(FileId, filename)) delete FileId[filename];//удаляем старое
			FileId[filename] = msg.audio.file_id;
		}
	}
	else filename = msg.audio.file_unique_id;//если имени нет, то короткий id
	
	if((validAdmin(chatId) || (validUser(chatId) && !PRIVAT)) && WaitEditText[chatId]==31 && audio_key!='')//если ждем файл от админа или служенца
	{	WaitEditText[chatId]=0;
		let key = audio_key;
		//именованные файлы заносим в общий список
		if(msg.audio.file_name)
		{	while(Object.hasOwn(FileId, msg.audio.file_name)) delete FileId[msg.audio.file_name]; 
			FileId[msg.audio.file_name] = msg.audio.file_id;
		}
		//сохраним подписи и fileId в массив
		let opt = new Object();
		try{opt = JSON.parse(await fs.promises.readFile(PathToAudio+'/'+key+'/'+'FileCaption.json'));}//читаем файл подписей 
		catch (err) {}
		if(!Object.hasOwn(opt, filename)) opt[filename] = new Object();
		opt[filename].fileId = file_id;//сохраняем fileId
		opt[filename].caption = caption;
		opt[filename].caption_entities = caption_entities;
		WriteFileJson(PathToAudio+'/'+key+'/'+'FileCaption.json', opt);//сохраняем подписи в файл
		//загружаем файл
        let path;
		try {path = await Bot.downloadFile(file_id, PathToAudio+'/'+key);//загружаем файл
		}catch(err)
		{   let str='Не могу загрузить этот файл '+filename+'!\n';
			str += 'Длина файла = '+file_size+'\n';
			str += 'Файл будет хранится на серверах Telegram и будет доступен для чтения';
			await sendMessage(chatId, str, klava('Назад',{'backbutton':LastKey[chatId]}, chatId));
			audio_key='';
			return;
		}
		//вытащим чисто имя файла
		let tmp=path.split('/');
		let name=tmp[tmp.length-1];//имя файла в конце
		//переименуем файл
		let newpath = path.replace(name,filename);
		fs.renameSync(path, newpath);
		WriteLogFile("New audio was loaded to "+newpath+newpath+" by "+firstname);
		if(!LastKey[chatId]) LastKey[chatId] = '0';
		await sendMessage(chatId, 'Поздравляю! Файл '+filename+' загружен!', klava('Назад',{'backbutton':LastKey[chatId]}, chatId));
		audio_key='';
	}
	else //если пришел файл от Админа без ожидания, то сохраним его id
	{	if(msg.audio.file_name) //если у файла есть имя
		{	while(Object.hasOwn(FileId, msg.audio.file_name)) delete FileId[msg.audio.file_name]; 
			FileId[msg.audio.file_name] = msg.audio.file_id;
			WriteFileJson(currentDir+'/FileId.txt',FileId);
		}
	}	
}catch(err){WriteLogFile(err+'\nfrom ловим АУДИО','вчат');}
});
//====================================================================
// Обработка получения геолокации
Bot.on('location', async (msg) => 
{
try{
	if(msg.from && msg.from.is_bot) return;//ботов не пускаем
	const chatId = msg.chat.id.toString();
	if(!isValidChatId(chatId)) return;//левые chatId не пускаем
	const firstname = msg.chat.first_name;
	if(PRIVAT && !validAdmin(chatId) && !validUser(chatId)) return;//приватность
	const lat = msg.location.latitude;
	const lon = msg.location.longitude;
	if(!LastMessId[chatId]) LastMessId[chatId]={};
  
	// Возвращает СТРОКУ, не массив!
	const tz = tzLookup(lat, lon);
	if(!!tz)
	{	const zoneOffset = moment.tz(tz).utcOffset();//в минутах
		delete LastMessId[chatId].tz;//старая
		delete LastMessId[chatId].utcOffset;//старая
		let obj = {};
		obj.tz = tz;
		obj.utcOffset = zoneOffset;//числом
		obj.lat = lat;
		obj.lon = lon;
		//запрашиваем город на ЕС по локации
		let url = 'https://na-russia.org/api/towns/closest/?lat='+lat+'&lon='+lon;
		let res = await getObjFromES(url);
		let slug, general_town='';
		if(res != 'NO')
		{	slug = (!!res&&!!res.town&&!!res.town.slug) ? res.town.slug : '';
			//запросим головной город, если есть
			if(!!res&&!!res.town&&!!res.town.general_town)
			{	url = 'https://na-russia.org/api/service-struct/'+res.town.general_town+'/';
				res = await getObjFromES(url);
				if(res != 'NO' && (!!res&&!!res.slug)) general_town = res.slug;
			}
			if(!!slug) obj.slug = slug;
			if(!!general_town) obj.general_town = general_town;
		}
		LastMessId[chatId].location = obj;
		//убираем белую кнопку
		await sendMessage(chatId, 'Ваша таймзона = '+tz+(!!slug?' ('+slug+')':''), {reply_markup: {remove_keyboard: true}});
		exit();
	}
	else
	{	await sendMessage(chatId, 'Не могу определить часовой пояс по Вашей локации!', {reply_markup: {remove_keyboard: true}});
	}

	async function exit()
	{	let index='0';
		if(!('text' in Tree[index]))
		{  	Tree[index].text = 'Тут пока ничего нет\n';
			if((validAdmin(chatId) || (validUser(chatId) && !PRIVAT))) 
			{Tree[index].text += '/help - выдаст полный список команд';
			}
		}
		await sendMessage(chatId, Tree[index].text, klava(index, Tree[index].entities, chatId), index);
	}
}catch(err){WriteLogFile(err+'\nfrom ловим location','вчат');}
});
//====================================================================
async function sendMessage(chatId,str,option,index)
{	
try{
	let res;
	if(!isValidChatId(chatId))//если не число, то не пускаем 
	{	res = '\nfrom sendMessage("'+chatId+'")=>если не число, то не пускаем';
		WriteLogFile(res);
		return res;
	}
	while(!getMessageCount()) await sleep(50);//получаем разрешение по лимиту сообщ/сек
	
	//сохраняем для посл.удаления
	let chat_id='', mess_id='';
	if(!!LastMessId[chatId]&&!!LastMessId[chatId].messId) {chat_id=chatId; mess_id=LastMessId[chatId].messId;}
	if(!option) option = new Object();
	let err='';
	str = str.toString();
	if(str.length > 4200) {str = str.slice(0,4200);}//обрезаем строку
	
	if(Object.hasOwn(option, 'link_preview_options')) option.link_preview_options = JSON.stringify(option.link_preview_options);
	//посылаем сообщение
	if(!!option.text) delete option.text;
	try{res = await Bot.sendMessage(chatId, str, option);
	}catch(err)
	{	console.log(err+'\nfrom Bot.sendMessage("'+chatId+'")'); 
		if(String(err).indexOf('user is deactivated')+1) delete LastMessId[chatId];//удаляем ушедшего
		else if(String(err).indexOf('bot was blocked by the user')+1) delete LastMessId[chatId];//удаляем ушедшего
		else if(String(err).indexOf('chat not found')+1) delete LastMessId[chatId];//удаляем ушедшего
		else if(String(err).indexOf('Too Many Requests:')+1) WriteLogFile(err+'\nfrom Bot.sendMessage','вчат');
		else WriteLogFile(err+'\nfrom Bot.sendMessage("'+chatId+'")'+'\nstr = '+str+'\noption = '+JSON.stringify(option,null,2),'вчат');
		return err;	
	}
	
	if((validAdmin(chatId) || (validUser(chatId) && !PRIVAT)) && WaitEditText[chatId] != 1)//для Админа сохраним ключ строки 
	{	if(index != null) LastKey[chatId]=index;
	}
	
	//если есть id сообщений локации, то удаляем
	if(!!LastMessId[chatId] && !!LastMessId[chatId].loc_mess_id && LastMessId[chatId].loc_mess_id !== 'запрос')
	{	remove_message(chat_id, LastMessId[chatId].loc_mess_id);
		delete LastMessId[chatId].loc_mess_id;
	}
	
	//сохраняем mess_id, если с кнопками
	let off = (SignOff != 0 && !Object.hasOwn(LastMessId, chatId));//если ни разу не был, и подписка запрещена
	if(Object.hasOwn(res, 'reply_markup') && Object.hasOwn(res.reply_markup, 'inline_keyboard') && !off)
	{if(!Object.hasOwn(LastMessId, chatId)) LastMessId[chatId]=new Object();
	 if(res.message_id) LastMessId[chatId].messId=res.message_id;
	 if(res.chat.username) LastMessId[chatId].username=res.chat.username;
     if(res.chat.first_name) LastMessId[chatId].first_name=res.chat.first_name;
     //удаляем предыдущее сообщение с кнопками, если оно было
	 if(!!mess_id) {await remove_message(chat_id, mess_id);}
	}
	//сохраняем id от локации, если запрошено
	if(!!LastMessId[chatId].loc_mess_id && LastMessId[chatId].loc_mess_id === 'запрос') LastMessId[chatId].loc_mess_id = res.message_id;
	return res;
	
}catch(err){
	WriteLogFile(err+'\nfrom sendMessage("'+chatId+'")','вчат');
	return err;	
}
}
//====================================================================
async function sendMessageImage(chatId,path,option,index)
{	
try{
	let res;
	if(!isValidChatId(chatId))//если не число, то не пускаем 
	{	res = '\nfrom sendMessageImage("'+chatId+'")=>if(!isValidChatId(chatId))';
		WriteLogFile(res);
		return res;
	}
	while(!getMessageCount()) await sleep(50);//получаем разрешение по лимиту сообщ/сек
	
	//сохраняем для посл.удаления
	let chat_id='', mess_id='';
	if(!!LastMessId[chatId]) {chat_id=chatId; mess_id=LastMessId[chatId].messId;}
	if(!option) option = new Object();
	let err='';
	
	//посылаем сообщение
	if(!!option.text) delete option.text;
	try{res = await sendPhoto(chatId, path, option);
	}catch(err)
	{	console.log(err+'\nfrom Bot.sendMessageImage("'+chatId+'")'); 
		if(String(err).indexOf('user is deactivated')+1) delete LastMessId[chatId];//удаляем ушедшего
		else if(String(err).indexOf('bot was blocked by the user')+1) delete LastMessId[chatId];//удаляем ушедшего
		else if(String(err).indexOf('chat not found')+1) delete LastMessId[chatId];//удаляем ушедшего
		else if(String(err).indexOf('Too Many Requests:')+1) WriteLogFile(err+'\nfrom Bot.sendMessage','вчат');
		else WriteLogFile(err+'\nfrom Bot.sendMessageImage("'+chatId+'")'+'\nstr = '+path+'\noption = '+JSON.stringify(option,null,2),'вчат');
		return err;	
	}
	
	if((validAdmin(chatId) || (validUser(chatId) && !PRIVAT)) && WaitEditText[chatId] != 1)//для Админа сохраним ключ строки 
	{	if(index != null) LastKey[chatId]=index;
	}
	
	//если есть id сообщений локации, то удаляем
	if(!!LastMessId[chatId] && !!LastMessId[chatId].loc_mess_id && LastMessId[chatId].loc_mess_id !== 'запрос')
	{	remove_message(chat_id, LastMessId[chatId].loc_mess_id);
		delete LastMessId[chatId].loc_mess_id;
	}
	
	//сохраняем mess_id, если с кнопками
	let off = (SignOff != 0 && !Object.hasOwn(LastMessId, chatId));//если ни разу не был, и подписка запрещена
	if(Object.hasOwn(res, 'reply_markup') && Object.hasOwn(res.reply_markup, 'inline_keyboard') && !off)
	{if(!Object.hasOwn(LastMessId, chatId)) LastMessId[chatId]=new Object();
	 if(res.message_id) LastMessId[chatId].messId=res.message_id;
	 if(res.chat.username) LastMessId[chatId].username=res.chat.username;
     if(res.chat.first_name) LastMessId[chatId].first_name=res.chat.first_name;
     //удаляем предыдущее сообщение с кнопками, если оно было
	 if(!!mess_id) {await remove_message(chat_id, mess_id);}
	}
	
	return res;
	
}catch(err){
	WriteLogFile(err+'\nfrom sendMessageImage("'+chatId+'")','вчат');
	return err;	
}
}
//====================================================================
async function remove_message(chatId,messId)
{	
try{return await Bot.deleteMessage(chatId, messId);} 
catch(err){ 
	if(String(err).indexOf("message can't be deleted")+1)
	{	try{await Bot.editMessageText("!",{chat_id:chatId, message_id:messId});}
		catch(err1){/*WriteLogFile('Ошибка: не могу исправить старое сообщение\n'+err1);*/}
		try{await Bot.deleteMessage(chatId, messId);}
		catch(err1){/*WriteLogFile('Ошибка: не могу удалить старое сообщение\n'+err1);*/}
	}
	else
	{	if(String(err).indexOf("message to delete not found")+1 == 0)//если другое
		{WriteLogFile(err+'\nfrom remove_message("'+chatId+'")','вчат');
		}
	}
	return err;
}
}
//====================================================================
//послать файлы из-под кнопки с файлами index
async function sendFiles(chatId, flag, index)
{	
try{if(!isValidChatId(chatId)) return false;//если не число, то не пускаем
	//сначала читаем директорию с файлами
	let k = 1;
	const isFile = fileName => {return fs.lstatSync(fileName).isFile()};
	//загружаем список файлов из /doc - полный путь
    let files = fs.readdirSync(PathToDoc+'/'+String(index)).map(fileName => {return path.join(PathToDoc+'/'+String(index), fileName)}).filter(isFile);
    //заполним объект FileList
    let FileList = new Object();
    for(let i in files) 
	{	let tmp=files[i].split('/'); 
		let name=tmp[tmp.length-1];//вытащим чисто имя файла в конце
		if(name != 'FileCaption.json') {FileList[name]=new Object(); FileList[name].path=files[i];} 
	}
	//загрузим подписи и fileId в opt
	let opt = new Object();
	try {opt = JSON.parse(await fs.promises.readFile(PathToDoc+'/'+String(index)+'/'+'FileCaption.json'));}//загрузим подписи 
	catch (err) {}
    if(!Object.keys(FileList).length && !Object.keys(opt).length)//если пусто везде 
		await sendMessage(chatId, 'Тут пока ничего нет '+smilik, klava(index,null, chatId), index);
    else
	{	//если FileList не пустой, то сортируем его в том порядке, как загружался в FileCaption.json
		if(Object.keys(FileList).length && Object.keys(opt).length)
		{	let tobj = new Object();
			//let mas = Object.keys(opt);//ключи - это имена файлов в opt
			for(let name in opt)
			{if(Object.hasOwn(FileList, name)) {tobj[name]=new Object(); tobj[name].path=FileList[name].path;}
			}
			FileList = tobj;
		}
		//посылаем разграничитель
		await sendMessage(chatId, '👇🏻 '+Tree[index].name+' 👇🏻');
		//теперь отсылаем по списку файлов в папке
		for(let name in FileList) 
		{	//вытащим чисто имя файла
			//let tmp=FileList[num].path.split('/');
			//let name=tmp[tmp.length-1];//имя файла в конце
			if(!Object.hasOwn(opt, name)) opt[name] = new Object;
			let capt = opt[name].caption;
			let ent = opt[name].caption_entities;
			if(flag==true) {capt += "\n** "+k+" **";}//для удаления проставим номера
			let path = FileList[name].path;//путь из папки
			if(opt[name].fileId)
			{	//проверяем наличие файла на сервере Телеграм из opt[]
				let info; try{info=await Bot.getFile(opt[name].fileId);} catch(err){if(String(err).indexOf('file is too big')+1) info = true;}
				if(info) path = opt[name].fileId;//если есть отклик, то замена пути на fileId
				else //если fileId битый, то пробуем этот файл из FileId[]
				{	delete opt[name].fileId; WriteFileJson(PathToDoc+'/'+String(index)+'/'+'FileCaption.json', opt);
					if(Object.hasOwn(FileId, name))
					{	//проверяем наличие файла на сервере Телеграм из FileId[]
						let info; try{info=await Bot.getFile(FileId[name]);} catch(err){if(String(err).indexOf('file is too big')+1) info = true;}
						if(info)//если есть отклик, то замена пути на fileId
						{	path = FileId[name];
							opt[name].fileId = FileId[name];
							WriteFileJson(PathToDoc+'/'+String(index)+'/'+'FileCaption.json', opt);
						}
						else {}//если нет, то путь остается прежним
					}
					else {}//если нет, то путь остается прежним
				}
			}
			await sendDocument(chatId, path, {caption:capt,caption_entities:ent});
			k++;
		}
		//теперь отсылаем по списку fileId
		for(let name in opt) 
		{	let capt = opt[name].caption;
			let ent = opt[name].caption_entities;
			if(flag==true) {capt += "\n** "+k+" **";}//для удаления проставим номера
			if(!Object.hasOwn(FileList, name))//посылаем только те, которые не послали ранее
			{	//проверяем наличие файла на сервере Телеграм из opt[]
				let info; try{info=await Bot.getFile(opt[name].fileId);} catch(err){if(String(err).indexOf('file is too big')+1) info = true;}
				if(info) {await sendDocument(chatId,opt[name].fileId, {caption:capt,caption_entities:ent}); k++;}
				else //если fileId битый, то пробуем этот файл из FileId[]
				{	if(Object.hasOwn(FileId, name))
					{	//проверяем наличие файла на сервере Телеграм из FileId[]
						let info; try{info=await Bot.getFile(FileId[name]);} catch(err){if(String(err).indexOf('file is too big')+1) info = true;}
						if(info)//если есть отклик
						{	opt[name].fileId = FileId[name];
							await await sendDocument(chatId, opt[name].fileId, {caption:capt,caption_entities:ent}); k++; 
							WriteFileJson(PathToDoc+'/'+String(index)+'/'+'FileCaption.json', opt);
						}
						else {await sendMessage(chatId,"Битый файл '"+name+"'\n** "+k+" **");  k++;}//если нет, то битый файл
					}
					else {await sendMessage(chatId,"Битый файл '"+name+"'\n** "+k+" **");  k++;}//если нет, то битый файл
				}
			}
		}
		if(flag)//если для удаления
		{await sendMessage(chatId, 'Теперь пришлите мне *номер* файла, который нужно удалить.\n', klava(index, {parse_mode:"markdown"}, chatId));
		 WaitEditText[chatId]=5;//взводим флаг ожидания номера от юзера
		}
		else await sendMessage(chatId, '👆 '+Tree[index].name+' 👆', klava(index,null, chatId), index);
	}
	return true;
	
}catch(err){WriteLogFile(err+'\nfrom sendFiles("'+chatId+'")','вчат'); return err;}
}
//====================================================================
//послать видео из-под кнопки с видео index
async function sendVideos(chatId, flag, index)
{	
try{if(!isValidChatId(chatId)) return false;//если не число, то не пускаем
	//сначала читаем директорию с файлами
	let k = 1;
	const isFile = fileName => {return fs.lstatSync(fileName).isFile()};
	//загружаем список файлов из /doc - полный путь
    let files = fs.readdirSync(PathToVideo+'/'+String(index)).map(fileName => {return path.join(PathToVideo+'/'+String(index), fileName)}).filter(isFile);
    //заполним объект FileList
    let FileList = new Object();
    for(let i in files) 
	{	let tmp=files[i].split('/'); let name=tmp[tmp.length-1];//вытащим чисто имя файла в конце
		if(name != 'FileCaption.json') {FileList[name]=new Object(); FileList[name].path=files[i];} 
	}
	//загрузим подписи и fileId в opt
	let opt = new Object();
	try {opt = JSON.parse(await fs.promises.readFile(PathToVideo+'/'+String(index)+'/'+'FileCaption.json'));}//загрузим подписи 
	catch (err) {}
    if(!Object.keys(FileList).length && !Object.keys(opt).length)//если пусто везде 
		await sendMessage(chatId, 'Тут пока ничего нет '+smilik, klava(index,null, chatId), index);
    else
	{	//если FileList не пустой, то сортируем его в том порядке, как загружался в FileCaption.json
		if(Object.keys(FileList).length && Object.keys(opt).length)
		{	let tobj = new Object();
			//let mas = Object.keys(opt);//ключи - это имена файлов в opt
			for(let name in opt)
			{if(Object.hasOwn(FileList, name)) {tobj[name]=new Object(); tobj[name].path=FileList[name].path;}
			}
			FileList = tobj;
		}
		//теперь отсылаем по списку файлов в папке
		for(let name in FileList) 
		{	//вытащим чисто имя файла
			//let tmp=FileList[name].path.split('/');
			//let name=tmp[tmp.length-1];//имя файла в конце
			if(!Object.hasOwn(opt, name)) opt[name] = new Object;
			let capt = opt[name].caption;
			let ent = opt[name].caption_entities;
			if(flag==true) {capt += "\n** "+k+" **";}//для удаления проставим номера
			let path = FileList[name].path;//путь из папки
			if(opt[name].fileId)
			{	//проверяем наличие файла на сервере Телеграм из opt[]
				let info; try{info=await Bot.getFile(opt[name].fileId);} catch(err){if(String(err).indexOf('file is too big')+1) info = true;}
				if(info) path = opt[name].fileId;//если есть отклик, то замена пути на fileId
				else //если fileId битый, то пробуем этот файл из FileId[]
				{	if(Object.hasOwn(FileId, name))
					{	//проверяем наличие файла на сервере Телеграм из FileId[]
						let info; try{info=await Bot.getFile(FileId[name]);} catch(err){if(String(err).indexOf('file is too big')+1) info = true;}
						if(info)//если есть отклик, то замена пути на fileId
						{	path = FileId[name];
							opt[name].fileId = FileId[name];
							WriteFileJson(PathToVideo+'/'+String(index)+'/'+'FileCaption.json', opt);
						}
						else {}//если нет, то путь остается прежним
					}
					else {}//если нет, то путь остается прежним
				}
			}
			await sendVideo(chatId, path, {caption:capt,caption_entities:ent});
			k++;
		}
		//теперь отсылаем по списку fileId
		for(let name in opt) 
		{	let capt = opt[name].caption;
			let ent = opt[name].caption_entities;
			if(flag==true) {capt += "\n** "+k+" **";}//для удаления проставим номера
			if(!Object.hasOwn(FileList, name))//посылаем только те, которые не послали ранее
			{	//проверяем наличие файла на сервере Телеграм из opt[]
				let info; try{info=await Bot.getFile(opt[name].fileId);} catch(err){if(String(err).indexOf('file is too big')+1) info = true;}
				if(info) {await sendVideo(chatId,opt[name].fileId, {caption:capt,caption_entities:ent}); k++;}
				else //если fileId битый, то пробуем этот файл из FileId[]
				{	if(Object.hasOwn(FileId, name))
					{	//проверяем наличие файла на сервере Телеграм из FileId[]
						let info; try{info=await Bot.getFile(FileId[name]);} catch(err){if(String(err).indexOf('file is too big')+1) info = true;}
						if(info)//если есть отклик
						{	opt[name].fileId = FileId[name];
							await sendVideo(chatId, opt[name].fileId, {caption:capt,caption_entities:ent}); k++; 
							WriteFileJson(PathToVideo+'/'+String(index)+'/'+'FileCaption.json', opt);
						}
						else {await sendMessage(chatId,"Битый файл '"+name+"'\n** "+k+" **");  k++;}//если нет, то битый файл
					}
					else {await sendMessage(chatId,"Битый файл '"+name+"'\n** "+k+" **");  k++;}//если нет, то битый файл
				}
			}
		}
		if(flag)//если для удаления
		{await sendMessage(chatId, 'Теперь пришлите мне *номер* файла, который нужно удалить.\n', klava(index, {parse_mode:"markdown"}, chatId));
		 WaitEditText[chatId]=20;//взводим флаг ожидания номера от юзера
		}
		else await sendMessage(chatId, '👆 '+Tree[index].name+' 👆', klava(index,null, chatId), index);
	}
	return true;
	
}catch(err){WriteLogFile(err+'\nfrom sendVideos("'+chatId+'")','вчат'); return err;}
}
//====================================================================
//послать аудио из-под кнопки с аудио index
async function sendAudios(chatId, flag, index)
{	
try{if(!isValidChatId(chatId)) return false;//если не число, то не пускаем
	//сначала читаем директорию с файлами
	let k = 1;
	const isFile = fileName => {return fs.lstatSync(fileName).isFile()};
	//загружаем список файлов из /doc - полный путь
    let files = fs.readdirSync(PathToAudio+'/'+String(index)).map(fileName => {return path.join(PathToAudio+'/'+String(index), fileName)}).filter(isFile);
    //заполним объект FileList
    let FileList = new Object();
    for(let i in files) 
	{	let tmp=files[i].split('/'); let name=tmp[tmp.length-1];//вытащим чисто имя файла в конце
		if(name != 'FileCaption.json') {FileList[name]=new Object(); FileList[name].path=files[i];} 
	}
	//загрузим подписи и fileId в opt
	let opt = new Object();
	try {opt = JSON.parse(await fs.promises.readFile(PathToAudio+'/'+String(index)+'/'+'FileCaption.json'));}//загрузим подписи 
	catch (err) {}
    if(!Object.keys(FileList).length && !Object.keys(opt).length)//если пусто везде 
		await sendMessage(chatId, 'Тут пока ничего нет '+smilik, klava(index), index, chatId);
    else
	{	//если FileList не пустой, то сортируем его в том порядке, как загружался в FileCaption.json
		if(Object.keys(FileList).length && Object.keys(opt).length)
		{	let tobj = new Object();
			//let mas = Object.keys(opt);//ключи - это имена файлов в opt
			for(let name in opt)
			{if(Object.hasOwn(FileList, name)) {tobj[name]=new Object(); tobj[name].path=FileList[name].path;}
			}
			FileList = tobj;
		}
		//теперь отсылаем по списку файлов в папке
		for(let name in FileList) 
		{	//вытащим чисто имя файла
			//let tmp=FileList[name].path.split('/');
			//let name=tmp[tmp.length-1];//имя файла в конце
			if(!Object.hasOwn(opt, name)) opt[name] = new Object;
			let capt = opt[name].caption;
			let ent = opt[name].caption_entities;
			if(flag==true) {capt += "\n** "+k+" **";}//для удаления проставим номера
			let path = FileList[name].path;//путь из папки
			if(opt[name].fileId)//если есть fileId, то замена пути на fileId
			{	//проверяем наличие файла на сервере Телеграм из opt[]
				let info; try{info=await Bot.getFile(opt[name].fileId);} catch(err){if(String(err).indexOf('file is too big')+1) info = true;}
				if(info) path = opt[name].fileId;//если есть отклик, то замена пути на fileId
				else //если fileId битый, то пробуем этот файл из FileId[]
				{	if(Object.hasOwn(FileId, name))
					{	//проверяем наличие файла на сервере Телеграм из FileId[]
						let info; try{info=await Bot.getFile(FileId[name]);} catch(err){if(String(err).indexOf('file is too big')+1) info = true;}
						if(info)//если есть отклик, то замена пути на fileId
						{	path = FileId[name];
							opt[name].fileId = FileId[name];
							WriteFileJson(PathToAudio+'/'+String(index)+'/'+'FileCaption.json', opt);
						}
						else {}//если нет, то путь остается прежним
					}
					else {}//если нет, то путь остается прежним
				}
			}
			await sendAudio(chatId, path, {caption:capt,caption_entities:ent});
			k++;
		}
		//теперь отсылаем по списку fileId
		for(let name in opt) 
		{	let capt = opt[name].caption;
			let ent = opt[name].caption_entities;
			if(flag==true) {capt += "\n** "+k+" **";}//для удаления проставим номера
			if(!Object.hasOwn(FileList, name))//посылаем только те, которые не послали ранее
			{	//проверяем наличие файла на сервере Телеграм из opt[]
				let info; try{info=await Bot.getFile(opt[name].fileId);} catch(err){if(String(err).indexOf('file is too big')+1) info = true;}
				if(info) {await sendAudio(chatId,opt[name].fileId, {caption:capt,caption_entities:ent}); k++;}
				else //если fileId битый, то пробуем этот файл из FileId[]
				{	if(Object.hasOwn(FileId, name))
					{	//проверяем наличие файла на сервере Телеграм из FileId[]
						let info; try{info=await Bot.getFile(FileId[name]);} catch(err){if(String(err).indexOf('file is too big')+1) info = true;}
						if(info)//если есть отклик
						{	opt[name].fileId = FileId[name];
							WriteFileJson(PathToAudio+'/'+String(index)+'/'+'FileCaption.json', opt);
							await sendAudio(chatId, opt[name].fileId, {caption:capt,caption_entities:ent}); k++;
						}
						else {await sendMessage(chatId,"Битый файл '"+name+"'\n* "+k+" *");  k++;}//если нет, то битый файл
					}
					else {await sendMessage(chatId,"Битый файл '"+name+"'\n** "+k+" **");  k++;}//если нет, то битый файл
				}
			}
		}
		if(flag)//если для удаления
		{await sendMessage(chatId, 'Теперь пришлите мне *номер* файла, который нужно удалить.\n', klava(index, {parse_mode:"markdown"}, chatId));
		 WaitEditText[chatId]=30;//взводим флаг ожидания номера от юзера
		}
		else await sendMessage(chatId, "Слушайте на здоровье! ❤️", klava(index,null, chatId), index);//для кнопки Назад
	}
	return true;
}catch(err){WriteLogFile(err+'\nfrom sendAudios("'+chatId+'")','вчат'); return err;}
}
//====================================================================
async function sendPhotos(chatId, flag, index)
{	
try{if(!isValidChatId(chatId)) return false;//если не число, то не пускаем
	//сначала читаем директорию с катинками
	let k = 1;
	const isFile = fileName => {return fs.lstatSync(fileName).isFile()};
	//загружаем список файлов из Photos - полный путь
    let pat = PathToPhoto+'/'+String(index);//папка с номером кнопки
    let files = fs.readdirSync(pat).map(fileName => {return path.join(pat, fileName)}).filter(isFile);
    //заполним объект FileList
    let FileList = new Object();
    for(let i in files) 
	{	let tmp=files[i].split('/'); let name=tmp[tmp.length-1];//вытащим чисто имя файла в конце
		if(name != 'FileCaption.json') {FileList[name]=new Object(); FileList[name].path=files[i];} 
	}
	//загрузим подписи и fileId в opt
	let opt = new Object();
	try {opt = JSON.parse(await fs.promises.readFile(PathToPhoto+'/'+String(index)+'/'+'FileCaption.json'));}//загрузим подписи 
	catch (err) {}
    if(!Object.keys(FileList).length && !Object.keys(opt).length) await sendMessage(chatId, 'Тут пока ничего нет '+smilik, klava(index,null, chatId), index);
    else
	{	//по списку из FileCaption.json
		for(let key in opt)
		{	//если key есть на диске, то это одиночный файл
			if(Object.hasOwn(FileList, key))
			{	let option = {}; option.caption = '';
				if(!!opt[key].caption) option.caption = opt[key].caption;
				if(!!opt[key].caption_entities) option.caption_entities = opt[key].caption_entities;
				if(flag==true)//для удаления проставим номера 
				{option.caption += "\n** "+k+" **";
				 opt[key].number = k;//номер файла
				}
				let path = FileList[key].path;//путь из папки
				//если есть fileId, то замена пути на fileId
				if(!!opt[key].fileId) 
				{	//проверяем наличие файла на сервере Телеграм из FileId[]
					let info; 
					try{info=await Bot.getFile(opt[key].fileId);} catch(err){if(String(err).indexOf('file is too big')+1) info = true;}
					//если есть отклик, то замена пути на fileId
					if(!!info) path = opt[key].fileId;
				}
				await sendPhoto(chatId, path, option);
				delete FileList[key];//удаляем из списка
				k++;
			}
			//если key нет на диске, то может это альбом
			else if(!!opt[key].type && opt[key].type=='album')
			{	let med = [];
				for(let i in opt[key].media) med.push({...opt[key].media[i]});
				if(!med[0].caption) med[0].caption = '';
				if(flag==true)//для удаления проставим номера 
				{med[0].caption += "\n** "+k+" **";
				 opt[key].number = k;//номер файла
				}
				//подменим путь на file_id, если доступен
				for(let i in med) 
				{	if(!!med[i].file_id)
					{	//проверяем наличие файла на сервере Телеграм из FileId[]
						let info; 
						try{info=await Bot.getFile(med[i].file_id);} catch(err){if(String(err).indexOf('file is too big')+1) info = true;}
						//если есть отклик, то замена пути на fileId
						if(!!info) med[i].media = med[i].file_id;
					}
				}
				await sendAlbum(chatId,med);
				med = opt[key].media;
				for(let i in med) 
				{	let tmp=med[i].media.split('/'); let name=tmp[tmp.length-1];//вытащим чисто имя файла в конце
					delete FileList[name];//удаляем из текущего списка
				}
				k++;
			}
			//если нет на диске и не альбом, но есть file_id
			else if(!!opt[key].fileId)
			{	let option = {}; option.caption = '';
				if(!!opt[key].caption) option.caption = opt[key].caption;
				if(!!opt[key].caption_entities) option.caption_entities = opt[key].caption_entities;
				if(flag==true)//для удаления проставим номера 
				{option.caption += "\n** "+k+" **";
				 opt[key].number = k;//номер файла
				}
				let path = opt[key].fileId;
				await sendPhoto(chatId, path, option);
				k++;
			}
			else//иначе это потерянная запись
			{	delete opt[key];
				WriteFileJson(PathToPhoto+'/'+String(index)+'/'+'FileCaption.json', opt);//сохраняем подписи в файл
			}
		}
		//если в списке остались файлы, то это ничейные, и нужно удалить
		for(let name in FileList) 
		{	if(name.indexOf('FileCaption.json')==-1)//если файл не json
			{	await fs.promises.unlink(FileList[name].path);//удаляем файл из папки
			}
		}
		
		if(flag)//если для удаления
		{await sendMessage(chatId, 'Теперь пришлите мне *номер* Фотки, которую нужно удалить.\n', klava(index, {parse_mode:"markdown"}, chatId));
		 WaitEditText[chatId]=12;//взводим флаг ожидания номера от юзера
		 WriteFileJson(PathToPhoto+'/'+String(index)+'/'+'FileCaption.json', opt);//сохраняем номера в файл
		}
		else await sendMessage(chatId, '👆 '+Tree[index].name+' 👆', klava(index,null, chatId), index);
	}
	return true;
}catch(err){WriteLogFile(err+'\nfrom sendPhotos("'+chatId+'")','вчат'); return err;}
}
//====================================================================
async function sendAlbum(chatId, media, opt)
{
try{
	if(!isValidChatId(chatId)) return;//если не число, то не пускаем
	let mas = [...media];
	if(!!opt && !!opt.caption)
	{	if(!mas[0].caption) mas[0].caption = '';
		mas[0].caption += opt.caption;//добавляем к подписи
	}
	if(!!mas[0].caption_entities && typeof(mas[0].caption_entities) == 'string')
	{	mas[0].caption_entities = JSON.parse(mas[0].caption_entities);
	}
	if(!!mas[0].caption && mas[0].caption.length > 1024) {mas[0].caption = mas[0].caption.substr(0,1023);}//обрезаем подпись
	await Bot.sendMediaGroup(chatId, mas);
	return true;
}catch(err){WriteLogFile(err+'\nfrom sendAlbum()','вчат');return Promise.reject(false);}
}
//====================================================================
async function sendEvents(chatId, flag)
{	
try{if(!isValidChatId(chatId)) return false;//если не число, то не пускаем
	if(!PRIVAT) return false;//только в приватном режиме
	if(!LastKey[chatId]) LastKey[chatId] = '0';
	//читаем файл событий
	try {EventList = JSON.parse(await fs.promises.readFile(FileEventList));} catch (err) {WriteFileJson(FileEventList,EventList);}
	let mas = Object.keys(EventList);
	if(!mas.length) await sendMessage(chatId, 'Тут пока ничего нет '+smilik, klava('Назад',{'backbutton':LastKey[chatId]}, chatId));//Назад
    else
	{	//теперь отсылаем список событий
		str='Список Событий:\n\n';
		for(i in mas) 
		{str += EventList[mas[i]].name + '\n  ' + EventList[mas[i]].event + '\n  ' + EventList[mas[i]].date + '\n';
		 if(flag==true) {str += "** "+mas[i]+" **\n\n";}//для удаления проставим номера
		}
			
		if(flag)//если для удаления, то 2 сообщения
		{await sendMessage(chatId, str);
		 await sendMessage(chatId, 'Теперь пришлите мне *номер* события, которое нужно удалить.\n', klava('Назад', {parse_mode:"markdown",'backbutton':LastKey[chatId]}, chatId));
		 WaitEditText[chatId]=40;//взводим флаг ожидания номера от юзера
		}
		else await sendMessage(chatId, str, klava('Назад',{'backbutton':LastKey[chatId]}, chatId));
	}
	return true;
}catch(err){WriteLogFile(err+'\nfrom sendEvents()','вчат'); return err;}
}
//====================================================================
async function sendDocument(chatId, path, option)
{	
try{	let res;
		if(!isValidChatId(chatId))//если не число, то не пускаем 
		{	res = '\nfrom sendDocument("'+chatId+'")=>if(!isValidChatId(chatId))';
			WriteLogFile(res);
			return res;
		}
		while(!getMessageCount()) await sleep(50);//получаем разрешение по лимиту сообщ/сек
		if(!!option && !!option.caption) 
		{if(option.caption.length > 1024) {option.caption = option.caption.substring(0,1023);}//обрезаем подпись
		}
		try {res = await Bot.sendDocument(chatId, path, option);
		}catch(err)
		{	console.log(err+'\nfrom Bot.sendDocument("'+chatId+'")'); 
			if(String(err).indexOf('user is deactivated')+1) delete LastMessId[chatId];//удаляем ушедшего
			else if(String(err).indexOf('bot was blocked by the user')+1) delete LastMessId[chatId];//удаляем ушедшего
			else if(String(err).indexOf('chat not found')+1) delete LastMessId[chatId];//удаляем ушедшего
			else WriteLogFile(err+'\nfrom Bot.sendDocument("'+chatId+'")','вчат');
			return err;	
		}
		return res;
}catch(err)
{	WriteLogFile(err+'\nfrom sendDocument("'+chatId+'")','вчат');
	return err;
}
}
//====================================================================
async function sendAudio(chatId, path, option)
{	
try{	let res;
		if(!isValidChatId(chatId))//если не число, то не пускаем 
		{	res = '\nfrom sendAudio("'+chatId+'")=>if(!isValidChatId(chatId))';
			WriteLogFile(res);
			return res;
		}
		while(!getMessageCount()) await sleep(50);//получаем разрешение по лимиту сообщ/сек
		if(!!option && !!option.caption) 
		{if(option.caption.length > 1024) {option.caption = option.caption.substring(0,1023);}//обрезаем подпись
		}
		try{res = await Bot.sendAudio(chatId, path, option);
		}catch(err)
		{	console.log(err+'\nfrom Bot.sendAudio("'+chatId+'")'); 
			if(String(err).indexOf('user is deactivated')+1) delete LastMessId[chatId];//удаляем ушедшего
			else if(String(err).indexOf('bot was blocked by the user')+1) delete LastMessId[chatId];//удаляем ушедшего
			else if(String(err).indexOf('chat not found')+1) delete LastMessId[chatId];//удаляем ушедшего
			else WriteLogFile(err+'\nfrom Bot.sendAudio("'+chatId+'")','вчат');
			return err;	
		}
		return res;
}catch(err)
{	WriteLogFile(err+'\nfrom sendAudio("'+chatId+'")','вчат');
	return err;
}
}
//====================================================================
async function sendVideo(chatId, path, option)
{	
try{	let res;
		if(!isValidChatId(chatId))//если не число, то не пускаем 
		{	res = '\nfrom sendVideo("'+chatId+'")=>if(!isValidChatId(chatId))';
			WriteLogFile(res);
			return res;
		}
		while(!getMessageCount()) await sleep(50);//получаем разрешение по лимиту сообщ/сек
		if(!!option && !!option.caption) 
		{if(option && option.caption.length > 1024) {option.caption = option.caption.substring(0,1023);}//обрезаем подпись
		}
		try{res = await Bot.sendVideo(chatId, path, option);
		}catch(err)
		{	console.log(err+'\nfrom Bot.sendVideo("'+chatId+'")'); 
			if(String(err).indexOf('user is deactivated')+1) delete LastMessId[chatId];//удаляем ушедшего
			else if(String(err).indexOf('bot was blocked by the user')+1) delete LastMessId[chatId];//удаляем ушедшего
			else if(String(err).indexOf('chat not found')+1) delete LastMessId[chatId];//удаляем ушедшего
			else WriteLogFile(err+'\nfrom Bot.sendVideo("'+chatId+'")','вчат');
			return err;	
		}
		return res;
}catch(err)
{	WriteLogFile(err+'\nfrom sendVideo("'+chatId+'")','вчат');
	return err;
}
}
//====================================================================
async function sendPhoto(chatId, path, option)
{	
try{	let res;
		if(!isValidChatId(chatId))//если не число, то не пускаем 
		{	res = '\nfrom sendPhoto("'+chatId+'")=>if(!isValidChatId(chatId))';
			WriteLogFile(res);
			return res;
		}
		while(!getMessageCount()) await sleep(50);//получаем разрешение по лимиту сообщ/сек
		if(!!option && !!option.caption) 
		{if(option && option.caption.length > 1024) {option.caption = option.caption.substring(0,1023);}//обрезаем подпись
		}
		try{res = await Bot.sendPhoto(chatId, path, option);
		}catch(err)
		{	console.log(err+'\nfrom Bot.sendPhoto("'+chatId+'")'); 
			if(String(err).indexOf('user is deactivated')+1) delete LastMessId[chatId];//удаляем ушедшего
			else if(String(err).indexOf('bot was blocked by the user')+1) delete LastMessId[chatId];//удаляем ушедшего
			else if(String(err).indexOf('chat not found')+1) delete LastMessId[chatId];//удаляем ушедшего
			else WriteLogFile(err+'\nfrom Bot.sendPhoto("'+chatId+'")','вчат');
			return err;	
		}
		return res;
}catch(err)
{	WriteLogFile(err+'\nfrom sendPhoto("'+chatId+'")','вчат');
	return err;
}
}
//====================================================================
async function sendTenStep(chatId)
{	
try{if(!isValidChatId(chatId)) return false;//если не число, то не пускаем
	let index = LastMessId[chatId].indexTen;//индекс кнопки для возврата
	//пробуем загрузить файл вопросов пользователя, если нету, то стандартный набор
	let List = [];
	let path = PathToQuestions+'/'+chatId+'.txt';//путь к файлу вопросов пользователя
	try {List = (await fs.promises.readFile(path)).toString().split('\n');} catch (err) {List = TenList;}

	if(List.length==0) {await sendMessage(chatId, 'Вопросов пока нет!', klava(index,null, chatId), index); return true;}
	let count;
	if(!Object.hasOwn(LastMessId[chatId], 'countTen') || LastMessId[chatId].countTen == -1)
	{	count=0;//начинаем с 1-го вопроса
		LastMessId[chatId].countTen = count;
	}
	else count = LastMessId[chatId].countTen;

	if(count < List.length)
	{	let str = 'Всего вопросов = '+List.length+'\n';
		str += (count+1)+'. '+List[count];
		await sendMessage(chatId, str);//вопрос
		await sendMessage(chatId, 'Для возврата в Начало нажми кнопку', klava(index,null, chatId), index);
		LastMessId[chatId].countTen++;
	}
	return true;
}catch(err){WriteLogFile(err+'\nfrom sendTenStep()','вчат'); return err;}
}
//====================================================================
async function getQuestionsFromUser(chatId,index)
{	
try{if(!isValidChatId(chatId)) return false;//если не число, то не пускаем
	let str = '';
	//пробуем загрузить файл вопросов пользователя, если нету, то стандартный набор
	let List = [];
	let path = PathToQuestions+'/'+chatId+'.txt';//путь к файлу вопросов пользователя
	if(fs.existsSync(path)) await sendDocument(chatId, path);//файл пользователя
	else if(fs.existsSync(FileTen)) await sendDocument(chatId, FileTen);//стандартный файл
	else {await sendMessage(chatId, 'Вопросов пока нет!', klava(index,null, chatId), index); return true;}//если ничего нету
	str = 'Выше показан текущий список вопросов. Пришлите мне новый список вопросов в текстовом сообщении или файлом. ';
	str += 'Каждый вопрос должен начинаться с новой строки, нумерация вопросов не нужна. ';
	str += 'В одной строке - один вопрос.\n';
	str += 'Чтобы удалить свой список вопросов, пришлите мне слово ` delete` с маленькой буквы.';
	let obj = klava(index,null, chatId);
	obj.parse_mode = 'markdown';
	await sendMessage(chatId, str, obj, index);
	WaitEditText[chatId] = 'questions';//ожидаем список вопросов
	return true;
}catch(err){WriteLogFile(err+'\nfrom sendTenStep()','вчат'); return err;}
}
//====================================================================
// периодически будем сохранять файл LastMessId
let time_interval1 = 2*3600;//в сек
let sutki = 14;//кол-во суток сбора статистики
var interval1 = setInterval(function()
{	
try{//а также DayCount в недельном файле только ночью
    let time1 = moment('02:00:00','HH:mm:ss').unix();
    let time2 = time1 + time_interval1;
    let now = moment().unix();
    if(now>=time1 && now<time2)
    {   let WeekCount = JSON.parse(fs.readFileSync(FileWeekCount));//читаем недельный файл
        let index = WeekCount.index;
        WeekCount[index] = new Object();
        WeekCount[index] = DayCount;//добавляем суточный счетчик
        index = (index+1)%sutki;//увеличиваем индекс по модулю sutki
        WeekCount.index = index;
        DayCount = initObjCount();//чистим суточный счетчик
        WeekCount[index] = new Object();
        WeekCount[index] = DayCount;//чистим запись на новые сутки
        WriteFileJson(FileWeekCount,WeekCount);
        //а также сохраним общий счетчик
        WriteFileJson(FileGrandCount,GrandCount);
		//а также обнулим массив ответов по 10-му шагу
		AnswerList = {};
		for(let i in LastMessId) {if(Object.hasOwn(LastMessId[i], 'countTen')) LastMessId[i].countTen = -1;}
    }
	
	fs.writeFile(currentDir+'/LastMessId.txt', JSON.stringify(LastMessId,null,2), (err) => {if(err){WriteLogFile(err+'\nfrom setInterval()','вчат');}});
}catch(err){WriteLogFile(err+'\nfrom setInterval()','вчат');}
},time_interval1*1000);
//====================================================================
//подписка на выход из скрипта
[`SIGINT`, `uncaughtException`, `SIGTERM`].forEach((event) => 
{	process.on(event, async ()=>
	{	fs.writeFileSync(currentDir+'/LastMessId.txt', JSON.stringify(LastMessId,null,2));
		fs.writeFileSync(currentDir+'/FileId.txt', JSON.stringify(FileId,null,2));
		let WeekCount = JSON.parse(fs.readFileSync(FileWeekCount));//читаем недельный файл
        let index = WeekCount.index;
        WeekCount[index] = new Object();
        WeekCount[index] = DayCount;//добавляем суточный счетчик
        fs.writeFileSync(FileWeekCount, JSON.stringify(WeekCount,null,2));
        await WriteLogFile('выход из процесса по '+event);
        fs.writeFileSync(FileGrandCount, JSON.stringify(GrandCount,null,2));
        if(event==`uncaughtException`) console.log(event);
        fs.writeFileSync(currentDir+"/answer.txt", JSON.stringify(AnswerList));
		if(!!interval1) clearInterval(interval1);
		if(!!interval2) clearInterval(interval2);
		process.exit();
	});
});
//====================================================================
//запись в файл объекта, массива
function WriteFileJson(path,arr)
{	let res;
    if(typeof arr === 'object') res = fs.writeFileSync(path, JSON.stringify(arr,null,2));
    else res = fs.writeFileSync(path, arr);
}
//====================================================================
//запись в бэкап файл массива с добавлением в конец
function AppendFileJson(path,arr)
{
	fs.appendFile(path, JSON.stringify(arr,null,2), (err) => 
	{if(err) {WriteLogFile(err+'\nfrom AppendFileJson()','вчат');}
	});
}
//====================================================================
//проверка админа на валидность
function validAdmin(chatId)
{	if(Object.hasOwn(AdminList, chatId) || chatId==chat_Supervisor) return true;//есть в разрешенных
	else return false;//нет в разрешенных
}
//====================================================================
//проверка служенца на валидность
function validUser(chatId)
{	if(Object.hasOwn(UserList, chatId)) return true;//есть в разрешенных
	else return false;//нет в разрешенных
}
//====================================================================
async function WriteLogFile(arr, flag) 
{   console.log(arr);
	if(!LOGGING) return false;
	let str=moment().format('DD.MM.YY HH:mm:ss.ms')+' - '+arr+'\n';
    await fs.promises.appendFile(LogFile, str);
	try{
		if(!!logBot && !!flag) 
		{str='From '+nameBot+'\n'+str;
		 await logBot.sendMessage(chat_Supervisor, str);
		}
	}catch(err){console.log(err+'\nfrom WriteLogFile()'); return err;}
	return true;
}
//====================================================================
function initObjCount()
{   
try{	
	let mas = new Object();
	if(Object.keys(Tree).length<=0) return mas;
	let key =  Object.keys(Tree);  
    for(let i in key) mas[key[i]] = 0;
    delete mas["Назад"];//удалим кнопку Назад
    delete mas["0"];//удалим нулевой уровень
    return mas;
}catch(err){WriteLogFile(err+'\nfrom initObjCount()','вчат');}
}
//====================================================================
//получить дневной счетчик из недельного
async function getDayCount()
{   
try{	
	let WeekCount = JSON.parse(await fs.promises.readFile(FileWeekCount));
    DayCount = initObjCount();
    let index = WeekCount.index;
    if(Object.hasOwn(WeekCount, index)) 
    {	for(let i in DayCount) 
		{	if(Object.hasOwn(WeekCount[index], DayCount[i])) DayCount[i] = WeekCount[index][i];
		}
		//DayCount = JSON.parse(JSON.stringify(WeekCount[index]));
	}
	return true;
}catch(err){WriteLogFile(err+'\nfrom getDayCount()','вчат'); return err;}
}
//====================================================================
async function addNode(num,parent,name,type,url)
{ try{	
	if(Object.hasOwn(Tree, num)) return false;//если такой уже есть
	Tree[num] = new Object();
	if(!!parent) Tree[num].parent = String(parent);//родитель
	Tree[num].name = name;//текст на кнопке
	Tree[num].child = [];//детей пока нет
	Tree[num].type = type;//тип кнопки
	if(type=='url' && url) Tree[num].url = url;//url кнопки
	if(type=='text')//пока в текст -> дерево верхних кнопок
	{	let str = Tree[num].name;//справа будет имя новой кнопки
		if(!parent && num=='0') str = 'Тут пока ничего нет '+smilik;
		let k = Tree[num].parent;
		while(k && k!='0') {str = Tree[k].name+'/'+str; k = Tree[k].parent;}
		Tree[num].text = str;
		Tree[num].entities = [{"offset": 0,"length": str.length,"type": "bold"}];
	}
	if(!!Tree[parent])//если есть родитель
	{	//проверим, нет ли у родителя уже такого узла
		if(Tree[parent].child.indexOf(Number(num))<0) Tree[parent].child[Tree[parent].child.length] = Number(num);//добавим ребенка родителю в последнюю позицию
	}
	await WriteFileJson(FileTree,Tree);
	//добавим кнопку в структуру статистики и дневной счетчик
	if(num != '0' && num != 'Назад')
	{DayCount[String(num)] = 0;
	 GrandCount[String(num)] = 0;
	 await WriteFileJson(FileGrandCount,GrandCount);
	}
	return true;
  } catch(err){WriteLogFile(err+'\nfrom addNode()','вчат'); return err;}
}
//====================================================================
async function delNode(num)
{ try{	
	if(!Object.hasOwn(Tree, num)) return false;//если такого нету
	if(num==0) return true;//главное меню удалять не будем
	//если есть дети - удалить
	while(Tree[num].child.length > 0)
	{	for(let i=0;i<Tree[num].child.length;i++)
		{	delNode(Tree[num].child[i]);//и сам узел
		}
	}
	//удалим этот узел у родителя
	let index = Tree[Tree[num].parent].child.indexOf(Number(num));
	if(index+1) Tree[Tree[num].parent].child.splice(index,1);
	//удаляем папку с контентом
	await delDir(num);
	//удаляем из FileId
	if(!!Tree[num].filename && !!FileId[Tree[num].filename]) delete FileId[Tree[num].filename];
	//в конце удалим сам узел из дерева
	delete Tree[num];
	await WriteFileJson(FileTree,Tree);
	//удалим эту кнопку из дневного счетчика
	delete DayCount[String(num)];
	//удалим кнопку из общего счетчика
	delete GrandCount[String(num)];
	await WriteFileJson(FileGrandCount,GrandCount);
	return true;
  } catch(err){WriteLogFile(err+'\nfrom delNode()','вчат'); return err;}
}
//====================================================================
async function delDir(num)
{ try{
			//удаляем папку с фотками, если она есть
			if(fs.existsSync(PathToPhoto+'/'+String(num)))
			{	let opt = new Object();
				try {opt = JSON.parse(await fs.promises.readFile(PathToPhoto+'/'+String(num)+'/'+'FileCaption.json'));} catch (err) {}
				//удаляем file_id
				for(let name in opt) 
				{	if(!!opt[name].media)//если альбом
					{	for(let i in opt[name].media)
						{	let tmp=opt[name].media[i].media.split('/'); 
							if(tmp.length>1)
							{	let file=tmp[tmp.length-1];//вытащим чисто имя файла в конце
								while(!!FileId[file]) delete FileId[file];
							}
							else
							{	let file = getKeyByValue(FileId, tmp[0])
								while(!!FileId[file]) delete FileId[file];
							}
						}
					}
					else {while(FileId[name]) delete FileId[name];}//если одиночный файл
				}
				fs.rmSync(PathToPhoto+'/'+String(num), { recursive: true });
			}
			//удаляем папку с доками, если она есть
			if(fs.existsSync(PathToDoc+'/'+String(num))) 
			{	let opt = new Object();
				try {opt = JSON.parse(await fs.promises.readFile(PathToDoc+'/'+String(num)+'/'+'FileCaption.json'));} catch (err) {}
				for(let name in opt) while(FileId[name]) delete FileId[name];
				fs.rmSync(PathToDoc+'/'+String(num), { recursive: true });
			}
			//удаляем папку с видео, если она есть
			if(fs.existsSync(PathToVideo+'/'+String(num)))
			{	let opt = new Object();
				try {opt = JSON.parse(await fs.promises.readFile(PathToVideo+'/'+String(num)+'/'+'FileCaption.json'));} catch (err) {}
				for(let name in opt) while(FileId[name]) delete FileId[name];
				fs.rmSync(PathToVideo+'/'+String(num), { recursive: true });
			}
			//удаляем папку с аудио, если она есть
			if(fs.existsSync(PathToAudio+'/'+String(num)))
			{	let opt = new Object();
				try {opt = JSON.parse(await fs.promises.readFile(PathToAudio+'/'+String(num)+'/'+'FileCaption.json'));} catch (err) {}
				for(let name in opt) while(FileId[name]) delete FileId[name];
				fs.rmSync(PathToAudio+'/'+String(num), { recursive: true });
			}
			return true;
  } catch(err){WriteLogFile(err+'\nfrom delDir()','вчат'); return err;}
}
//====================================================================
// Команда Редактировать Текст
async function EditText(msg)
{
try{
	const chatId = msg.chat.id.toString();
	if(!isValidChatId(chatId)) return;//левые chatId не пускаем
	if(validAdmin(chatId) || (validUser(chatId) && !PRIVAT))
	{	if(!LastKey[chatId])
		{await sendMessage(chatId, 'Нет подходящего текста для редактирования', klava('0',null, chatId));}
		else
		{	WaitEditText[chatId]=1;
			if(Object.hasOwn(Tree[LastKey[chatId]], 'text') && !!Tree[LastKey[chatId]].text)//если есть текст у кнопки
			{await sendMessage(chatId, Tree[LastKey[chatId]].text, {entities:Tree[LastKey[chatId]].entities});//текст, который редактируется
			}
			else if(!!Tree[LastKey[chatId]].filename)//если картинка вместо текста
			{	let option = {};
				let index = LastKey[chatId];
				let filename = Tree[index].filename;
				let path = PathToPhoto+'/'+index+'/'+filename;
				//если есть fileId, то замена пути на fileId
				if(!!FileId[filename]) 
				{	//проверяем наличие файла на сервере Телеграм из FileId[]
					let info; 
					try{info=await Bot.getFile(FileId[filename]);} catch(err){if(String(err).indexOf('file is too big')+1) info = true;}
					//если есть отклик, то замена пути на fileId
					if(!!info) path = FileId[filename];
				}
				if(!!Tree[index].caption) option.caption = Tree[index].caption;
				if(!!Tree[index].caption_entities) option.caption_entities = Tree[index].caption_entities;
				await sendMessageImage(chatId,path,option);
			}
			await sendMessage(chatId, 'Пришлите мне исправленный текст или картинку', klava('Назад',{'backbutton':LastKey[chatId]}, chatId));
			//теперь ловим текст
		} 
	}
	else await sendMessage(chatId, 'Извините, но Вы не являетесь Админом этого бота!', klava('0',null, chatId));
	return true;
}catch(err){WriteLogFile(err+'\nfrom EditText()','вчат'); return err;}
}
//====================================================================
// Команда EditButtonName
async function EditButtonName(msg)
{
try{
	const chatId = msg.chat.id.toString();
	if(!isValidChatId(chatId)) return;//левые chatId не пускаем
	let match = msg.text.match(/\/EditButtonName (.+$)/);
	if(!match || match.length<2) return false;
	let str = match[1];
	match = [];
	match = str.split('=');
	if(match.length<2) return false;
	const key = match[0];//старое имя кнопки
	const newkey = match[1];//новое имя кнопки

	if(validAdmin(chatId))
	{	if(!LastKey[chatId])
		{await sendMessage(chatId, 'Текущий набор не определен!', klava('Назад',{'backbutton':'0'}, chatId));//Отмена
		 return true;
		}
		//найдем номер кнопки из текущего набора по имени и изменим имя
		let i, dl=Tree[LastKey[chatId]].child.length;
		for(i=0;i<dl;i++)
		{	if(Tree[Tree[LastKey[chatId]].child[i]].name==key) 
			{Tree[Tree[LastKey[chatId]].child[i]].name = newkey;
			 await WriteFileJson(FileTree,Tree);
			 break;
			}
		}
		if(i==dl) str = "В этом наборе кнопки '"+key+"' нет!";
		else str = 'Готово';
		await sendMessage(chatId, str, klava('Назад',{'backbutton':LastKey[chatId]}, chatId));//Назад
	}
	else await sendMessage(chatId, 'Извините, но Вы не являетесь Админом этого бота!', klava('0',null, chatId));
	return true;
}catch(err){WriteLogFile(err+'\nfrom EditButtonName()','вчат'); return err;}
}
//====================================================================
// Команда EditButtonName
async function EditBackName(msg)
{
try{
	const chatId = msg.chat.id.toString();
	if(!isValidChatId(chatId)) return;//левые chatId не пускаем
	let match = msg.text.match(/\/EditBackName (.+$)/);
	if(!match || match.length<2) return false;
	let str = match[1];
	if(!str) return false;
	const newkey = str;//новое имя кнопки Назад

	if(validAdmin(chatId))
	{	if(!LastKey[chatId])
		{sendMessage(chatId, 'Текущий набор не определен!', klava('Назад',{'backbutton':'0'}, chatId));//Отмена
		 return true;
		}
		Tree['Назад'].name = newkey;//новое имя кнопки
		await WriteFileJson(FileTree,Tree);
		str = 'Готово';
		await sendMessage(chatId, str, klava('Назад',{'backbutton':LastKey[chatId]}, chatId));//Назад
	}
	else await sendMessage(chatId, 'Извините, но Вы не являетесь Админом этого бота!', klava('0',null, chatId));
	return true;
}catch(err){WriteLogFile(err+'\nfrom EditBackName()','вчат'); return err;}
}
//====================================================================
// Команда EditButtonUrl
async function EditButtonUrl(msg)
{
try{
	const chatId = msg.chat.id.toString();
	if(!isValidChatId(chatId)) return;//левые chatId не пускаем
	let match = msg.text.match(/\/EditButtonUrl (.+$)/);
	if(!match || match.length<2) return false;
	let str = match[1];
	match = [];
	match = str.split('=');
	if(match.length<2) return false;
	const key = match[0];//имя кнопки
	const url = match[1];//новое url кнопки
	if(url.indexOf('http')!=0) return false;

	if(validAdmin(chatId))
	{	if(!LastKey[chatId])
		{await sendMessage(chatId, 'Текущий набор не определен!', klava('Назад',{'backbutton':'0'}, chatId));//Отмена
		 return true;
		}
		//найдем номер кнопки из текущего набора по имени и изменим имя
		let i, dl=Tree[LastKey[chatId]].child.length;
		for(i=0;i<dl;i++)
		{	if(Tree[Tree[LastKey[chatId]].child[i]].name==key && Tree[Tree[LastKey[chatId]].child[i]].type=='url') 
			{Tree[Tree[LastKey[chatId]].child[i]].url = url;
			 await WriteFileJson(FileTree,Tree);
			 break;
			}
		}
		if(i==dl) str = "В этом наборе нет кнопки '"+key+"' типа 'url'!";
		else str = 'Готово';
		await sendMessage(chatId, str, klava('Назад',{'backbutton':LastKey[chatId]}, chatId));//Назад
	}
	else await sendMessage(chatId, 'Извините, но Вы не являетесь Админом этого бота!', klava('0',null, chatId));
	return true;
}catch(err){WriteLogFile(err+'\nfrom EditButtonUrl()','вчат'); return err;}
}
//====================================================================
// Команда EditButtonEg
async function EditButtonEg(msg)
{
try{
	const chatId = msg.chat.id.toString();
	if(!isValidChatId(chatId)) return;//левые chatId не пускаем
	let match = msg.text.match(/\/EditButtonEg (.+$)/);
	if(!match || match.length<2) return false;
	let str = match[1];
	match = [];
	match = str.split('=');
	if(match.length<2) return false;
	const key = match[0];//имя кнопки
	const path = match[1];//новый путь к файлу

	if(validAdmin(chatId))
	{	if(!LastKey[chatId])
		{await sendMessage(chatId, 'Текущий набор не определен!', klava('Назад',{'backbutton':'0'}, chatId));//Отмена
		 return true;
		}
		if(!checkPathFile(currentDir+path)) {await sendMessage(chatId, '😉', klava('Назад',{'backbutton':'0'}, chatId));return true;}
		//найдем номер кнопки из текущего набора по имени и изменим путь к файлу
		let i, dl=Tree[LastKey[chatId]].child.length;
		for(i=0;i<dl;i++)
		{	if(Tree[Tree[LastKey[chatId]].child[i]].name==key && Tree[Tree[LastKey[chatId]].child[i]].type=='eg') 
			{Tree[Tree[LastKey[chatId]].child[i]].path = path;
			 await WriteFileJson(FileTree,Tree);
			 break;
			}
		}
		if(i==dl) str = "В этом наборе нет кнопки '"+key+"' типа 'eg'!";
		else str = 'Готово';
		await sendMessage(chatId, str, klava('Назад',{'backbutton':LastKey[chatId]}, chatId));//Назад
	}
	else await sendMessage(chatId, 'Извините, но Вы не являетесь Админом этого бота!', klava('0',null, chatId));
	return true;
}catch(err){WriteLogFile(err+'\nfrom EditButtonEg()','вчат'); return err;}
}
//====================================================================
// Команда EditButtonRaspis
async function EditButtonRaspis(msg)
{
try{
	const chatId = msg.chat.id.toString();
	if(!isValidChatId(chatId)) return;//левые chatId не пускаем
	let match = msg.text.match(/\/EditButtonRaspis (.+$)/);
	if(!match || match.length<2) return false;
	let str = match[1];
	match = [];
	match = str.split('=');
	if(match.length<2) return false;
	const key = match[0];//имя кнопки
	const path = match[1];//новый путь к файлу

	if(validAdmin(chatId))
	{	if(!LastKey[chatId])
		{await sendMessage(chatId, 'Текущий набор не определен!', klava('Назад',{'backbutton':'0'}, chatId));//Отмена
		 return true;
		}
		if(!checkPathFile(currentDir+path)) {await sendMessage(chatId, '😉', klava('Назад',{'backbutton':'0'}, chatId));return true;}
		//найдем номер кнопки из текущего набора по имени и изменим путь к файлу
		let i, dl=Tree[LastKey[chatId]].child.length;
		for(i=0;i<dl;i++)
		{	if(Tree[Tree[LastKey[chatId]].child[i]].name==key && Tree[Tree[LastKey[chatId]].child[i]].type=='raspis') 
			{Tree[Tree[LastKey[chatId]].child[i]].path = path;
			 await WriteFileJson(FileTree,Tree);
			 break;
			}
		}
		if(i==dl) str = "В этом наборе нет кнопки '"+key+"' типа 'raspis'!";
		else str = 'Готово';
		await sendMessage(chatId, str, klava('Назад',{'backbutton':LastKey[chatId]}, chatId));//Назад
	}
	else await sendMessage(chatId, 'Извините, но Вы не являетесь Админом этого бота!', klava('0',null, chatId));
	return true;
}catch(err){WriteLogFile(err+'\nfrom EditButtonRaspis()','вчат'); return err;}
}
//====================================================================
// Команда DelPhoto
async function DelPhoto(msg)
{
try{
	const chatId = msg.chat.id.toString();
	if(!isValidChatId(chatId)) return;//левые chatId не пускаем
	let match = msg.text.match(/\/DelPhoto (.+$)/);
	if(!match || match.length<2) return false;
	const key = match[1];//имя кнопки

	if(validAdmin(chatId) || (validUser(chatId) && !PRIVAT))
	{	if(!LastKey[chatId])
		{await sendMessage(chatId, 'Текущий набор не определен!', klava('Назад',{'backbutton':'0'}, chatId));//Отмена
		 return true;
		}
		//найдем номер кнопки из текущего набора по имени и сохраним
		let i, dl=Tree[LastKey[chatId]].child.length;
		for(i=0;i<dl;i++)
		{	if(Tree[Tree[LastKey[chatId]].child[i]].name==key && Tree[Tree[LastKey[chatId]].child[i]].type=='photo') 
			{photos_key = Tree[LastKey[chatId]].child[i];
			 break;
			}
			else photos_key = '';
		}
		if(i==dl) await sendMessage(chatId, "В этом наборе нет кнопки '"+key+"' типа 'photo'!", klava('Назад',{'backbutton':LastKey[chatId]}, chatId));
		else {await sendPhotos(chatId, true, photos_key);}//показываем все фотки с номерами файлов
	}
	else await sendMessage(chatId, 'Извините, но Вы не являетесь Админом этого бота!', klava('0',null, chatId));
	return true;
}catch(err){WriteLogFile(err+'\nfrom DelPhoto()','вчат'); return err;}
}
//====================================================================
// Команда DelFile
async function DelFile(msg) 
{
try{
	const chatId = msg.chat.id.toString();
	if(!isValidChatId(chatId)) return;//левые chatId не пускаем
	let match = msg.text.match(/\/DelFile (.+$)/);
	if(!match || match.length<2) return false;
	const key = match[1];//имя кнопки
	
	if(validAdmin(chatId) || (validUser(chatId) && !PRIVAT))
	{	if(!LastKey[chatId])
		{await sendMessage(chatId, 'Текущий набор не определен!', klava('Назад',{'backbutton':'0'}, chatId));//Отмена
		 return true;
		}
		//найдем номер кнопки из текущего набора по имени и сохраним
		let i, dl=Tree[LastKey[chatId]].child.length;
		for(i=0;i<dl;i++)
		{	if(Tree[Tree[LastKey[chatId]].child[i]].name==key && Tree[Tree[LastKey[chatId]].child[i]].type=='file') 
			{file_key = Tree[LastKey[chatId]].child[i];
			 break;
			}
			else file_key = '';
		}
		if(i==dl) await sendMessage(chatId, "В этом наборе нет кнопки '"+key+"' типа 'file'!", klava('Назад', {parse_mode:"markdown",'backbutton':LastKey[chatId]}, chatId));//Отмена
		else {await sendFiles(chatId, true, file_key);}//показываем все файлы с номерами 
	}
	else await sendMessage(chatId, 'Извините, но Вы не являетесь Админом этого бота!', klava('0',null, chatId));
	return true;
}catch(err){WriteLogFile(err+'\nfrom DelFile()','вчат'); return err;}
}
//====================================================================
// Команда DelVideo
async function DelVideo(msg) 
{
try{
	const chatId = msg.chat.id.toString();
	if(!isValidChatId(chatId)) return;//левые chatId не пускаем
	let match = msg.text.match(/\/DelVideo (.+$)/);
	if(!match || match.length<2) return false;
	const key = match[1];//имя кнопки
	
	if(validAdmin(chatId) || (validUser(chatId) && !PRIVAT))
	{	if(!LastKey[chatId])
		{await sendMessage(chatId, 'Текущий набор не определен!', klava('Назад',{'backbutton':'0'}, chatId));//Отмена
		 return true;
		}
		//найдем номер кнопки из текущего набора по имени и сохраним
		let i, dl=Tree[LastKey[chatId]].child.length;
		for(i=0;i<dl;i++)
		{	if(Tree[Tree[LastKey[chatId]].child[i]].name==key && Tree[Tree[LastKey[chatId]].child[i]].type=='video') 
			{video_key = Tree[LastKey[chatId]].child[i];
			 break;
			}
			else video_key = '';
		}
		if(i==dl) await sendMessage(chatId, "В этом наборе нет кнопки '"+key+"' типа 'video'!", klava('Назад', {parse_mode:"markdown",'backbutton':LastKey[chatId]}, chatId));//Отмена
		else {await sendVideos(chatId, true, video_key);}//показываем все файлы с номерами 
	}
	else await sendMessage(chatId, 'Извините, но Вы не являетесь Админом этого бота!', klava('0',null, chatId));
	return true;
}catch(err){WriteLogFile(err+'\nfrom DelVideo()','вчат'); return err;}
}
//====================================================================
// Команда DelAudio
async function DelAudio(msg) 
{
try{
	const chatId = msg.chat.id.toString();
	if(!isValidChatId(chatId)) return;//левые chatId не пускаем
	let match = msg.text.match(/\/DelAudio (.+$)/);
	if(!match || match.length<2) return false;
	const key = match[1];//имя кнопки
	
	if(validAdmin(chatId) || (validUser(chatId) && !PRIVAT))
	{	if(!LastKey[chatId])
		{await sendMessage(chatId, 'Текущий набор не определен!', klava('Назад',{'backbutton':'0'}, chatId));//Отмена
		 return true;
		}
		//найдем номер кнопки из текущего набора по имени и сохраним
		let i, dl=Tree[LastKey[chatId]].child.length;
		for(i=0;i<dl;i++)
		{	if(Tree[Tree[LastKey[chatId]].child[i]].name==key && Tree[Tree[LastKey[chatId]].child[i]].type=='audio') 
			{audio_key = Tree[LastKey[chatId]].child[i];
			 break;
			}
			else audio_key = '';
		}
		if(i==dl) await sendMessage(chatId, "В этом наборе нет кнопки '"+key+"' типа 'audio'!", klava('Назад', {parse_mode:"markdown",'backbutton':LastKey[chatId]}, chatId));//Отмена
		else {await sendAudios(chatId, true, audio_key);}//показываем все файлы с номерами 
	}
	else await sendMessage(chatId, 'Извините, но Вы не являетесь Админом этого бота!', klava('0',null, chatId));
	return true;
}catch(err){WriteLogFile(err+'\nfrom DelAudio()','вчат'); return err;}
}
//====================================================================
// Команда DelEvent
async function DelEvent(msg)
{
try{
	if(!PRIVAT) return false;//только в приватном режиме
	const chatId = msg.chat.id.toString();
	if(!isValidChatId(chatId)) return false;//левые chatId не пускаем
	if(!validAdmin(chatId)) return false;//только для админов
	if(!LastKey[chatId])
	{await sendMessage(chatId, 'Текущий набор не определен!', klava('Назад',{'backbutton':'0'}, chatId));//Отмена
	 return true;
	}
	Tree['Назад'].parent = LastKey[chatId];//куда возвращаться
	await sendEvents(chatId, true, LastKey[chatId]);//показываем все события с номерами
	return true;
}catch(err){WriteLogFile(err+'\nfrom DelEvent()','вчат'); return err;}
}
//====================================================================
// Команда DelHistory
async function DelHistory(msg) 
{
try{
	const chatId = msg.chat.id.toString();
	if(!isValidChatId(chatId)) return false;//левые chatId не пускаем
	if(validAdmin(chatId) || (validUser(chatId) && !PRIVAT))
	{	let str = 'Теперь пришлите мне *номер* истории, которую нужно удалить. Он указывается в самом низу при просмотре истории.\n';
        if(!LastKey[chatId]) LastKey[chatId] = '0';
        await sendMessage(chatId, str, klava('Назад', {parse_mode:"markdown",'backbutton':LastKey[chatId]}, chatId));//Отмена
        WaitEditText[chatId]=8;//взводим флаг ожидания номера от Админа
	}
	else await sendMessage(chatId, 'Извините, но Вы не являетесь Админом этого бота!', klava('0',null, chatId));
	return true;
}catch(err){WriteLogFile(err+'\nfrom DelHistory()','вчат'); return err;}
}
//====================================================================
// Команда DelButton
async function DelButton(msg) 
{
try{
	const chatId = msg.chat.id.toString();
	if(!isValidChatId(chatId)) return false;//левые chatId не пускаем
	let match = msg.text.match(/\/DelButton (.+$)/);
	if(!match || match.length<2) return false;
	const name = match[1];//имя удаляемой кнопки
	let str = '';

	if(validAdmin(chatId))
	{	if(!LastKey[chatId])
		{await sendMessage(chatId, 'Текущий набор не определен!', klava('Назад',{'backbutton':'0'}, chatId));//Отмена
		 return false;
		}
		//найдем номер кнопки из текущего набора по имени и удалим кнопку
		let i, dl=Tree[LastKey[chatId]].child.length, num=0;
		for(i=0;i<dl;i++)
		{	if(Tree[Tree[LastKey[chatId]].child[i]].name==name)
			{num = Tree[LastKey[chatId]].child[i];
			 delNode(num);
			 break;
			}
		}
		if(i==dl) str = "В этом наборе кнопки '"+name+"' нет!";
		else str = 'Готово';
		await sendMessage(chatId, str, klava('Назад',{'backbutton':LastKey[chatId]}, chatId));//Назад
	}
	else await sendMessage(chatId, 'Извините, но Вы не являетесь Админом этого бота!', klava('0',null, chatId));
	return true;
}catch(err){WriteLogFile(err+'\nfrom DelButton()','вчат'); return err;}
}
//====================================================================
// Команда DelAdmin
async function DelAdmin(msg)
{
try{
	const chatId = msg.chat.id.toString();
	let match = msg.text.match(/\/DelAdmin (.+$)/);
	if(!match || match.length<2) return false;

	if(validAdmin(chatId))
	{	//читаем файл админов
		try {AdminList = JSON.parse(await fs.promises.readFile(FileAdminList));/*if(!AdminList[chat_Supervisor]) {AdminList[chat_Supervisor] = "root";}*/}
		//catch (err) {if(!AdminList[chat_Supervisor]) {AdminList[chat_Supervisor] = "root";} WriteFileJson(FileAdminList,AdminList);}
		catch(err){WriteLogFile(err,'вчат');}
		let id = match[1];
		if(id==chat_Supervisor) return true;//рута удалять не будем
		if(!LastKey[chatId]) LastKey[chatId] = '0';
		let str = '';
		if(!!id && Object.keys(AdminList).indexOf(id)+1)//если такой Админ есть в списке
		{	delete AdminList[id];
			WriteFileJson(FileAdminList,AdminList);//записываем файл
			str='Новый список Админов:\n\n';
			let mas = Object.keys(AdminList);
			for(i in mas) str += mas[i] + ' - ' + AdminList[mas[i]] + '\n';
		}
		else str = 'Такого Админа в списке нет!';
		await sendMessage(chatId, str, klava('Назад',{'backbutton':LastKey[chatId]}, chatId));//Назад
	}
	else await sendMessage(chatId, 'Извините, но Вы не являетесь Админом этого бота!', klava('0',null, chatId));
	return true;
}catch(err){WriteLogFile(err+'\nfrom DelAdmin()','вчат'); return err;}
}
//====================================================================
// Команда DelUser
async function DelUser(msg)
{
try{
	const chatId = msg.chat.id.toString();
	let match = msg.text.match(/\/DelUser (.+$)/);
	if(!match || match.length<2) return false;

	if(validAdmin(chatId))
	{	//читаем файл служенцев
		try {UserList = JSON.parse(await fs.promises.readFile(FileUserList));}
		catch (err) {WriteFileJson(FileUserList,UserList);}
		let id = match[1];
		if(!LastKey[chatId]) LastKey[chatId] = '0';
		let str = '';
		if(!!id && Object.keys(UserList).indexOf(id)+1)//если такой User есть в списке
		{	delete UserList[id];
			WriteFileJson(FileUserList,UserList);//записываем файл
			str='Новый список Служенцев:\n\n';
			let mas = Object.keys(UserList);
			for(i in mas) str += mas[i] + ' - ' + UserList[mas[i]] + '\n';
		}
		else str = 'Такого Служенца в списке нет!';
		await await sendMessage(chatId, str, klava('Назад',{'backbutton':LastKey[chatId]}, chatId));//Назад
	}
	else await sendMessage(chatId, 'Извините, но Вы не являетесь Админом этого бота!', klava('0',null, chatId));
	return true;
}catch(err){WriteLogFile(err+'\nfrom DelUser()','вчат'); return err;}
}
//====================================================================
// Команда AddPhoto
async function AddPhoto(msg)
{
try{
	const chatId = msg.chat.id.toString();
	let match = msg.text.match(/\/AddPhoto (.+$)/);
	if(!match || match.length<2) return false;
	const key = match[1];//имя кнопки

	if(validAdmin(chatId) || (validUser(chatId) && !PRIVAT))
	{	if(!LastKey[chatId])
		{await sendMessage(chatId, 'Текущий набор не определен!', klava('Назад',{'backbutton':'0'}, chatId));//Отмена
		 return true;
		}
		//найдем номер кнопки из текущего набора по имени и сохраним
		let i, dl=Tree[LastKey[chatId]].child.length;
		for(i=0;i<dl;i++)
		{	if(Tree[Tree[LastKey[chatId]].child[i]].name==key && Tree[Tree[LastKey[chatId]].child[i]].type=='photo') 
			{photos_key = Tree[LastKey[chatId]].child[i];
			 break;
			}
			else photos_key = '';
		}
		let str = '';
		if(i==dl) str = "В этом наборе нет кнопки '"+key+"' типа 'photo'!";
		else 
		{str = 'Теперь пришлите мне фотку или альбом';
		 WaitEditText[chatId]=11;//взводим флаг ожидания фотки от юзера
		}
		await sendMessage(chatId, str, klava('Назад',{'backbutton':LastKey[chatId]}, chatId));//Назад
	}
	else await sendMessage(chatId, 'Извините, но Вы не являетесь Админом этого бота!', klava('0',null, chatId));
	return true;
}catch(err){WriteLogFile(err+'\nfrom AddPhoto()','вчат'); return err;}
}
//====================================================================
// Команда AddFile
async function AddFile(msg)
{
try{
	const chatId = msg.chat.id.toString();
	let match = msg.text.match(/\/AddFile (.+$)/);
	if(!match || match.length<2) return false;
	const key = match[1];//имя кнопки
	
	if(validAdmin(chatId) || (validUser(chatId) && !PRIVAT))
	{	if(!LastKey[chatId])
		{await sendMessage(chatId, 'Текущий набор не определен!', klava('Назад',{'backbutton':'0'}, chatId));//Отмена
		 return true;
		}
		//найдем номер кнопки из текущего набора по имени и сохраним
		let i, dl=Tree[LastKey[chatId]].child.length;
		for(i=0;i<dl;i++)
		{	if(Tree[Tree[LastKey[chatId]].child[i]].name==key && Tree[Tree[LastKey[chatId]].child[i]].type=='file') 
			{file_key = Tree[LastKey[chatId]].child[i];
			 break;
			}
			else file_key = '';
		}
		let str = '';
		if(i==dl) str = "В этом наборе нет кнопки '"+key+"' типа 'file'!";
		else 
		{	str = 'Теперь пришлите мне один файл';
			WaitEditText[chatId]=4;//взводим флаг ожидания файла от юзера
		}
		await sendMessage(chatId, str, klava('Назад',{'backbutton':LastKey[chatId]}, chatId));//Назад
	}
	else await sendMessage(chatId, 'Извините, но Вы не являетесь Админом этого бота!', klava('0',null, chatId));
	return true;
}catch(err){WriteLogFile(err+'\nfrom AddFile()','вчат'); return err;}
}
//====================================================================
// Команда AddVideo
async function AddVideo(msg)
{
try{
	const chatId = msg.chat.id.toString();
	let match = msg.text.match(/\/AddVideo (.+$)/);
	if(!match || match.length<2) return false;
	const key = match[1];//имя кнопки
	
	if(validAdmin(chatId) || (validUser(chatId) && !PRIVAT))
	{	if(!LastKey[chatId])
		{await sendMessage(chatId, 'Текущий набор не определен!', klava('Назад',{'backbutton':'0'}, chatId));//Отмена
		 return true;
		}
		//найдем номер кнопки из текущего набора по имени и сохраним
		let i, dl=Tree[LastKey[chatId]].child.length;
		for(i=0;i<dl;i++)
		{	if(Tree[Tree[LastKey[chatId]].child[i]].name==key && Tree[Tree[LastKey[chatId]].child[i]].type=='video') 
			{video_key = Tree[LastKey[chatId]].child[i];
			 break;
			}
			else video_key = '';
		}
		let str = '';
		if(i==dl) str = "В этом наборе нет кнопки '"+key+"' типа 'video'!";
		else 
		{	str = 'Теперь пришлите мне одно видео';
			WaitEditText[chatId]=21;//взводим флаг ожидания файла от юзера
		}
		await sendMessage(chatId, str, klava('Назад',{'backbutton':LastKey[chatId]}, chatId));//Назад
	}
	else await sendMessage(chatId, 'Извините, но Вы не являетесь Админом этого бота!', klava('0',null, chatId));
	return true;
}catch(err){WriteLogFile(err+'\nfrom AddVideo()','вчат');return err;}
}
//====================================================================
// Команда AddAudio
async function AddAudio(msg)
{
try{
	const chatId = msg.chat.id.toString();
	let match = msg.text.match(/\/AddAudio (.+$)/);
	if(!match || match.length<2) return false;
	const key = match[1];//имя кнопки
	
	if(validAdmin(chatId) || (validUser(chatId) && !PRIVAT))
	{	if(!LastKey[chatId])
		{await sendMessage(chatId, 'Текущий набор не определен!', klava('Назад',{'backbutton':'0'}, chatId));//Отмена
		 return true;
		}
		//найдем номер кнопки из текущего набора по имени и сохраним
		let i, dl=Tree[LastKey[chatId]].child.length;
		for(i=0;i<dl;i++)
		{	if(Tree[Tree[LastKey[chatId]].child[i]].name==key && Tree[Tree[LastKey[chatId]].child[i]].type=='audio') 
			{audio_key = Tree[LastKey[chatId]].child[i];
			 break;
			}
			else audio_key = '';
		}
		let str = '';
		if(i==dl) str = "В этом наборе нет кнопки '"+key+"' типа 'audio'!";
		else 
		{	str = 'Теперь пришлите мне одно аудио';
			WaitEditText[chatId]=31;//взводим флаг ожидания файла от юзера
		}
		await sendMessage(chatId, str, klava('Назад',{'backbutton':LastKey[chatId]}, chatId));//Назад
	}
	else await sendMessage(chatId, 'Извините, но Вы не являетесь Админом этого бота!', klava('0',null, chatId));
	return true;
}catch(err){WriteLogFile(err+'\nfrom AddAudio()','вчат'); return err;}
}
//====================================================================
// Команда AddHistory
async function AddHistory(msg)
{
try{
	const chatId = msg.chat.id.toString();
	if(validAdmin(chatId) || (validUser(chatId) && !PRIVAT))
	{	if(!LastKey[chatId]) LastKey[chatId] = '0';
		await sendMessage(chatId, 'Теперь пришлите мне текст истории', klava('Назад',{'backbutton':LastKey[chatId]}));//Отмена
		WaitEditText[chatId]=7;//взводим флаг ожидания текста истории от Админа
	}
	else await sendMessage(chatId, 'Извините, но Вы не являетесь Админом этого бота!', klava('0',null, chatId));
	return true;
}catch(err){WriteLogFile(err+'\nfrom AddHistory()','вчат'); return err;}
}
//====================================================================
// Команда AddButtonText
async function AddButtonText(msg)
{
try{
	const chatId = msg.chat.id.toString();
	let match = msg.text.match(/\/AddButtonText (.+$)/);
	if(!match || match.length<2) return false;
	const key = match[1];//имя кнопки

	if(validAdmin(chatId))
	{	if(!LastKey[chatId]) LastKey[chatId]=0;
		if(key=='')
		{await sendMessage(chatId, 'Что-то не так с именем кнопки.', klava('Назад',{'backbutton':LastKey[chatId]}, chatId));//Отмена
		 return true;
		}
		//сначала выберем номер новой кнопки
		let mas = Object.keys(Tree), max = -1;
		for(let i=0;i<mas.length;i++) if(Number(mas[i]) > max) max = Number(mas[i]);//выберем максимальный номер
		max++;//следующий по порядку
		addNode(String(max),LastKey[chatId],key,'text');
		await sendMessage(chatId, 'Готово!', klava('Назад',{'backbutton':LastKey[chatId]}, chatId));//Отмена	
	}
	else await sendMessage(chatId, 'Извините, но Вы не являетесь Админом этого бота!', klava('0',null, chatId));
	return true;
}catch(err){WriteLogFile(err+'\nfrom AddButtonText()','вчат'); return err;}
}
//====================================================================
// Команда AddButtonAdmin
async function AddButtonAdmin(msg)
{
try{
	const chatId = msg.chat.id.toString();
	let match = msg.text.match(/\/AddButtonAdmin (.+$)/);
	if(!match || match.length<2) return false;
	const key = match[1];//имя кнопки

	if(validAdmin(chatId))
	{	if(!LastKey[chatId]) LastKey[chatId]=0;
		if(key=='')
		{await sendMessage(chatId, 'Что-то не так с именем кнопки.', klava('Назад',{'backbutton':LastKey[chatId]}, chatId));//Отмена
		 return true;
		}
		//сначала выберем номер новой кнопки
		let mas = Object.keys(Tree), max = -1;
		for(let i=0;i<mas.length;i++) if(Number(mas[i]) > max) max = Number(mas[i]);//выберем максимальный номер
		max++;//следующий по порядку
		addNode(String(max),LastKey[chatId],key,'admin');
		await sendMessage(chatId, 'Готово!', klava('Назад',{'backbutton':LastKey[chatId]}, chatId));//Отмена	
	}
	else await sendMessage(chatId, 'Извините, но Вы не являетесь Админом этого бота!', klava('0',null, chatId));
	return true;
}catch(err){WriteLogFile(err+'\nfrom AddButtonAdmin()','вчат'); return err;}
}
//====================================================================
// Команда AddButtonTen
async function AddButtonTen(msg)
{
try{
	const chatId = msg.chat.id.toString();
	let match = msg.text.match(/\/AddButtonTen (.+$)/);
	if(!match || match.length<2) return false;
	const key = match[1];//имя кнопки

	if(validAdmin(chatId))
	{	if(!LastKey[chatId]) LastKey[chatId]=0;
		if(key=='')
		{await sendMessage(chatId, 'Что-то не так с именем кнопки.', klava('Назад',{'backbutton':LastKey[chatId]}, chatId));//Отмена
		 return true;
		}
		//сначала выберем номер новой кнопки
		let mas = Object.keys(Tree), max = -1;
		for(let i=0;i<mas.length;i++) if(Number(mas[i]) > max) max = Number(mas[i]);//выберем максимальный номер
		max++;//следующий по порядку
		addNode(String(max),LastKey[chatId],key,'ten');
		await sendMessage(chatId, 'Готово!', klava('Назад',{'backbutton':LastKey[chatId]}, chatId));//Отмена	
	}
	else await sendMessage(chatId, 'Извините, но Вы не являетесь Админом этого бота!', klava('0',null, chatId));
	return true;
}catch(err){WriteLogFile(err+'\nfrom AddButtonTen()','вчат'); return err;}
}
//====================================================================
// Команда AddButtonBarrels
async function AddButtonBarrels(msg)
{
try{
	const chatId = msg.chat.id.toString();
	let match = msg.text.match(/\/AddButtonBarrels (.+$)/);
	if(!match || match.length<2) return false;
	const key = match[1];//имя кнопки

	if(validAdmin(chatId))
	{	if(!LastKey[chatId]) LastKey[chatId]=0;
		if(key=='')
		{await sendMessage(chatId, 'Что-то не так с именем кнопки.', klava('Назад',{'backbutton':LastKey[chatId]}, chatId));//Отмена
		 return true;
		}
		//сначала выберем номер новой кнопки
		let mas = Object.keys(Tree), max = -1;
		for(let i=0;i<mas.length;i++) if(Number(mas[i]) > max) max = Number(mas[i]);//выберем максимальный номер
		max++;//следующий по порядку
		addNode(String(max),LastKey[chatId],key,'barrels');
		await sendMessage(chatId, 'Готово!', klava('Назад',{'backbutton':LastKey[chatId]}, chatId));//Отмена	
	}
	else await sendMessage(chatId, 'Извините, но Вы не являетесь Админом этого бота!', klava('0',null, chatId));
	return true;
}catch(err){WriteLogFile(err+'\nfrom AddButtonTen()','вчат'); return err;}
}
//====================================================================
// Команда AddButtonQuestions
async function AddButtonQuestions(msg)
{
try{
	const chatId = msg.chat.id.toString();
	let match = msg.text.match(/\/AddButtonQuestions (.+$)/);
	if(!match || match.length<2) return false;
	const key = match[1];//имя кнопки

	if(validAdmin(chatId))
	{	if(!LastKey[chatId]) LastKey[chatId]=0;
		if(key=='')
		{await sendMessage(chatId, 'Что-то не так с именем кнопки.', klava('Назад',{'backbutton':LastKey[chatId]}, chatId));//Отмена
		 return true;
		}
		//сначала выберем номер новой кнопки
		let mas = Object.keys(Tree), max = -1;
		for(let i=0;i<mas.length;i++) if(Number(mas[i]) > max) max = Number(mas[i]);//выберем максимальный номер
		max++;//следующий по порядку
		addNode(String(max),LastKey[chatId],key,'questions');
		await sendMessage(chatId, 'Готово!', klava('Назад',{'backbutton':LastKey[chatId]}, chatId));//Отмена	
	}
	else await sendMessage(chatId, 'Извините, но Вы не являетесь Админом этого бота!', klava('0',null, chatId));
	return true;
}catch(err){WriteLogFile(err+'\nfrom AddButtonQuestions()','вчат'); return err;}
}
//====================================================================
// Команда AddButtonUrl 
async function AddButtonUrl(msg)
{
try{
	const chatId = msg.chat.id.toString();
	if(validAdmin(chatId))
	{	let match = msg.text.replace('/AddButtonUrl','').trim().split('=');
		if(!match || match.length!=2) return false;
		const key = match[0].trim();//имя кнопки
		const url = match[1].trim();// url кнопки
		//проверяем url
		let ret = await isValidUrl(url);
		if(!ret)
		{	await sendMessage(chatId, url+'\nЧто-то не так со ссылкой...', klava('Назад',{'backbutton':LastKey[chatId]}, chatId));
			return true;
		}
		if(!LastKey[chatId]) LastKey[chatId]=0;
		if(key=='')
		{await sendMessage(chatId, 'Что-то не так с именем кнопки.', klava('Назад',{'backbutton':LastKey[chatId]}, chatId));
		 return true;
		}
		//сначала выберем номер новой кнопки
		let mas = Object.keys(Tree), max = -1;
		for(let i=0;i<mas.length;i++) if(Number(mas[i]) > max) max = Number(mas[i]);//выберем максимальный номер
		max++;//следующий по порядку
		let res = addNode(String(max),LastKey[chatId],key,'url',url);
		if(res) await sendMessage(chatId, 'Готово!', klava('Назад',{'backbutton':LastKey[chatId]}, chatId));
		else await sendMessage(chatId, smilik+'\nЧто-то пошло не так...', klava('Назад',{'backbutton':LastKey[chatId]}, chatId));		
	}
	else await sendMessage(chatId, 'Извините, но Вы не являетесь Админом этого бота!', klava('0'));
	return true;
}catch(err){WriteLogFile(err+'\nfrom AddButtonUrl()','вчат'); return err;}
}
//====================================================================
// Команда AddButtonPhoto
async function AddButtonPhoto(msg)
{
try{
	const chatId = msg.chat.id.toString();
	let match = msg.text.match(/\/AddButtonPhoto (.+$)/);
	if(!match || match.length<2) return false;
	const key = match[1];//имя кнопки

	if(validAdmin(chatId))
	{	if(!LastKey[chatId]) LastKey[chatId]=0;
		if(key=='')
		{await sendMessage(chatId, 'Что-то не так с именем кнопки.', klava('Назад',{'backbutton':LastKey[chatId]}, chatId));//Отмена
		 return true;
		}
		//сначала выберем номер новой кнопки
		let mas = Object.keys(Tree), max = -1;
		for(let i=0;i<mas.length;i++) if(Number(mas[i]) > max) max = Number(mas[i]);//выберем максимальный номер
		max++;//следующий по порядку
		addNode(String(max),LastKey[chatId],key,'photo');
		//создадим папку с номером новой кнопки
		if(!fs.existsSync(PathToPhoto+'/'+String(max))) {fs.mkdirSync(PathToPhoto+'/'+String(max));}
		await sendMessage(chatId, 'Готово!', klava('Назад',{'backbutton':LastKey[chatId]}, chatId));//Отмена	
	}
	else await sendMessage(chatId, 'Извините, но Вы не являетесь Админом этого бота!', klava('0'));
	return true;
}catch(err){WriteLogFile(err+'\nfrom AddButtonPhoto()','вчат'); return err;}
}
//====================================================================
// Команда AddButtonFile
async function AddButtonFile(msg)
{
try{
	const chatId = msg.chat.id.toString();
	let match = msg.text.match(/\/AddButtonFile (.+$)/);
	if(!match || match.length<2) return false;
	const key = match[1];//имя кнопки

	if(validAdmin(chatId))
	{	if(!LastKey[chatId]) LastKey[chatId]=0;
		if(key=='')
		{await sendMessage(chatId, 'Что-то не так с именем кнопки.', klava('Назад',{'backbutton':LastKey[chatId]}, chatId));//Отмена
		 return true;
		}
		//сначала выберем номер новой кнопки
		let mas = Object.keys(Tree), max = -1;
		for(let i=0;i<mas.length;i++) if(Number(mas[i]) > max) max = Number(mas[i]);//выберем максимальный номер
		max++;//следующий по порядку
		addNode(String(max),LastKey[chatId],key,'file');
		//создадим папку с номером новой кнопки
		if(!fs.existsSync(PathToDoc+'/'+String(max))) {fs.mkdirSync(PathToDoc+'/'+String(max));}
		await sendMessage(chatId, 'Готово!', klava('Назад',{'backbutton':LastKey[chatId]}, chatId));//Отмена	
	}
	else await sendMessage(chatId, 'Извините, но Вы не являетесь Админом этого бота!', klava('0',null, chatId));
	return true;
}catch(err){WriteLogFile(err+'\nfrom AddButtonFile()','вчат'); return err;}
}
//====================================================================
// Команда AddButtonVideo
async function AddButtonVideo(msg)
{
try{
	const chatId = msg.chat.id.toString();
	let match = msg.text.match(/\/AddButtonVideo (.+$)/);
	if(!match || match.length<2) return false;
	const key = match[1];//имя кнопки

	if(validAdmin(chatId))
	{	if(!LastKey[chatId]) LastKey[chatId]=0;
		if(key=='')
		{await sendMessage(chatId, 'Что-то не так с именем кнопки.', klava('Назад',{'backbutton':LastKey[chatId]}, chatId));//Отмена
		 return true;
		}
		//сначала выберем номер новой кнопки
		let mas = Object.keys(Tree), max = -1;
		for(let i=0;i<mas.length;i++) if(Number(mas[i]) > max) max = Number(mas[i]);//выберем максимальный номер
		max++;//следующий по порядку
		addNode(String(max),LastKey[chatId],key,'video');
		//создадим папку с номером новой кнопки
		if(!fs.existsSync(PathToVideo+'/'+String(max))) {fs.mkdirSync(PathToVideo+'/'+String(max));}
		await sendMessage(chatId, 'Готово!', klava('Назад',{'backbutton':LastKey[chatId]}, chatId));//Отмена	
	}
	else await sendMessage(chatId, 'Извините, но Вы не являетесь Админом этого бота!', klava('0',null, chatId));
	return true;
}catch(err){WriteLogFile(err+'\nfrom AddButtonVideo()','вчат'); return err;}
}
//====================================================================
// Команда AddButtonAudio
async function AddButtonAudio(msg)
{
try{
	const chatId = msg.chat.id.toString();
	let match = msg.text.match(/\/AddButtonAudio (.+$)/);
	if(!match || match.length<2) return false;
	const key = match[1];//имя кнопки

	if(validAdmin(chatId))
	{	if(!LastKey[chatId]) LastKey[chatId]=0;
		if(key=='')
		{await sendMessage(chatId, 'Что-то не так с именем кнопки.', klava('Назад',{'backbutton':LastKey[chatId]}, chatId));//Отмена
		 return true;
		}
		//сначала выберем номер новой кнопки
		let mas = Object.keys(Tree), max = -1;
		for(let i=0;i<mas.length;i++) if(Number(mas[i]) > max) max = Number(mas[i]);//выберем максимальный номер
		max++;//следующий по порядку
		addNode(String(max),LastKey[chatId],key,'audio');
		//создадим папку с номером новой кнопки
		if(!fs.existsSync(PathToAudio+'/'+String(max))) {fs.mkdirSync(PathToAudio+'/'+String(max));}
		await sendMessage(chatId, 'Готово!', klava('Назад',{'backbutton':LastKey[chatId]}, chatId));//Отмена	
	}
	else await sendMessage(chatId, 'Извините, но Вы не являетесь Админом этого бота!', klava('0',null, chatId));
	return true;
}catch(err){WriteLogFile(err+'\nfrom AddButtonAudio()','вчат'); return err;}
}
//====================================================================
// Команда AddButtonTime
async function AddButtonTime(msg)
{
try{
	const chatId = msg.chat.id.toString();
	let match = msg.text.match(/\/AddButtonTime (.+$)/);
	if(!match || match.length<2) return false;
	const key = match[1];//имя кнопки

	if(validAdmin(chatId))
	{	if(!LastKey[chatId]) LastKey[chatId]=0;
		if(key=='')
		{await sendMessage(chatId, 'Что-то не так с именем кнопки.', klava('Назад',{'backbutton':LastKey[chatId]}, chatId));//Отмена
		 return true;
		}
		//сначала выберем номер новой кнопки
		let mas = Object.keys(Tree), max = -1;
		for(let i=0;i<mas.length;i++) if(Number(mas[i]) > max) max = Number(mas[i]);//выберем максимальный номер
		max++;//следующий по порядку
		addNode(String(max),LastKey[chatId],key,'time');//создаем основную кнопку
		let parent = String(max);//сохраняем номер основной кнопки
		max++;//следующий по порядку
		addNode(String(max),parent,'Справка','text');//создаем кнопку Справка
		Tree[String(max)].text = "В любое время, в любом месте можно прислать боту дату начала срока чистоты, отправив ему команду (обязательно с маленькой буквы!)\n\nначало=ДД.ММ.ГГГГ\n\nи бот запомнит эту новую дату. Менять ее можно сколь угодно раз.\nТочно также можно прислать боту дату начала жизни Без Никотина, просто добавив в конце буквы БН\n\nначало=ДД.ММ.ГГГГБН\n\nСтереть все даты сразу тоже можно, послав боту команду\n\n/off\n\nУдачи!";
		Tree[String(max)].entities = [{"offset": 131,"length": 19,"type": "bold"},{"offset": 312,"length": 21,"type": "bold"},{"offset": 389,"length": 4,"type": "bot_command"},{"offset": 389,"length": 4,"type": "bold"}];
		await sendMessage(chatId, 'Готово!', klava('Назад',{'backbutton':LastKey[chatId]}, chatId));//Отмена	
	}
	else await sendMessage(chatId, 'Извините, но Вы не являетесь Админом этого бота!', klava('0',null, chatId));
	return true;
}catch(err){WriteLogFile(err+'\nfrom AddButtonTime()','вчат'); return err;}
}
//====================================================================
// Команда AddButtonRaspis
async function AddButtonRaspis(msg)
{
try{
	const chatId = msg.chat.id.toString();
	let match = msg.text.match(/\/AddButtonRaspis (.+$)/);
	if(!match || match.length<2) return false;
	let mas = match[1].split('=');//разбиваем строку
	const key = mas[0];//имя кнопки
	let path = '';
	if(mas.length>1 && !!mas[1]) path = mas[1];//путь из команды, если есть

	if(validAdmin(chatId))
	{	if(!LastKey[chatId]) LastKey[chatId]=0;
		if(key=='')
		{await sendMessage(chatId, 'Что-то не так с именем кнопки.', klava('Назад',{'backbutton':LastKey[chatId]}, chatId));//Отмена
		 return true;
		}
		if(!!path && !checkPathFile(currentDir+path)) {await sendMessage(chatId, '😉', klava('Назад',{'backbutton':LastKey[chatId]}, chatId));return true;}
		//сначала выберем номер новой кнопки
		let mas = Object.keys(Tree), max = -1;
		for(let i=0;i<mas.length;i++) if(Number(mas[i]) > max) max = Number(mas[i]);//выберем максимальный номер
		max++;//следующий по порядку
		await addNode(String(max),LastKey[chatId],key,'raspis');
		if(!!path)
		{	Tree[String(max)].path = path;//добавляем путь к файлу
			await WriteFileJson(FileTree,Tree);
		}
		await sendMessage(chatId, 'Готово!', klava('Назад',{'backbutton':LastKey[chatId]}, chatId));//Отмена	
	}
	else await sendMessage(chatId, 'Извините, но Вы не являетесь Админом этого бота!', klava('0',null, chatId));
	return true;
}catch(err){WriteLogFile(err+'\nfrom AddButtonRaspis()','вчат'); return err;}
}
//====================================================================
// Команда AddButtonEg
async function AddButtonEg(msg)
{
try{
	const chatId = msg.chat.id.toString();
	let match = msg.text.match(/\/AddButtonEg (.+$)/);
	if(!match || match.length<2) return false;
	let mas = match[1].split('=');//разбиваем строку
	const key = mas[0];//имя кнопки
	let path = '';
	if(mas.length>1 && !!mas[1]) path = mas[1];//путь из команды, если есть

	if(validAdmin(chatId))
	{	if(!LastKey[chatId]) LastKey[chatId]=0;
		if(key=='')
		{await sendMessage(chatId, 'Что-то не так с именем кнопки.', klava('Назад',{'backbutton':LastKey[chatId]}, chatId));//Отмена
		 return true;
		}
		if(!!path && !checkPathFile(currentDir+path)) {await sendMessage(chatId, '😉', klava('Назад',{'backbutton':LastKey[chatId]}, chatId));return true;}
		//сначала выберем номер новой кнопки
		let mas = Object.keys(Tree), max = -1;
		for(let i=0;i<mas.length;i++) if(Number(mas[i]) > max) max = Number(mas[i]);//выберем максимальный номер
		max++;//следующий по порядку
		await addNode(String(max),LastKey[chatId],key,'eg');
		if(!!path)
		{	Tree[String(max)].path = path;//добавляем путь к файлу
			await WriteFileJson(FileTree,Tree);
		}
		await sendMessage(chatId, 'Готово!', klava('Назад',{'backbutton':LastKey[chatId]}, chatId));//Отмена	
	}
	else await sendMessage(chatId, 'Извините, но Вы не являетесь Админом этого бота!', klava('0',null, chatId));
	return true;
}catch(err){WriteLogFile(err+'\nfrom AddButtonEg()','вчат'); return err;}
}
//====================================================================
// Команда AddButtonHistory
async function AddButtonHistory(msg)
{
try{
	const chatId = msg.chat.id.toString();
	let match = msg.text.match(/\/AddButtonHistory (.+$)/);
	if(!match || match.length<2) return false;
	const key = match[1];//имя кнопки

	if(validAdmin(chatId))
	{	if(!LastKey[chatId]) LastKey[chatId]=0;
		if(key=='')
		{await sendMessage(chatId, 'Что-то не так с именем кнопки.', klava('Назад',{'backbutton':LastKey[chatId]}, chatId));//Отмена
		 return true;
		}
		//сначала выберем номер новой кнопки
		let mas = Object.keys(Tree), max = -1;
		for(let i=0;i<mas.length;i++) if(Number(mas[i]) > max) max = Number(mas[i]);//выберем максимальный номер
		max++;//следующий по порядку
		addNode(String(max),LastKey[chatId],key,'history');
		await sendMessage(chatId, 'Готово!', klava('Назад',{'backbutton':LastKey[chatId]}, chatId));//Отмена	
	}
	else await sendMessage(chatId, 'Извините, но Вы не являетесь Админом этого бота!', klava('0',null, chatId));
	return true;
}catch(err){WriteLogFile(err+'\nfrom AddButtonHistory()','вчат'); return err;}
}
//====================================================================
// Команда AddButtonLocation
async function AddButtonLocation(msg)
{
try{
	const chatId = msg.chat.id.toString();
	let match = msg.text.match(/\/AddButtonLocation (.+$)/);
	if(!match || match.length<2) return false;
	const key = match[1];//имя кнопки

	if(validAdmin(chatId))
	{	if(!LastKey[chatId]) LastKey[chatId]=0;
		if(key=='')
		{await sendMessage(chatId, 'Что-то не так с именем кнопки.', klava('Назад',{'backbutton':LastKey[chatId]}, chatId));//Отмена
		 return true;
		}
		//сначала выберем номер новой кнопки
		let mas = Object.keys(Tree), max = -1;
		for(let i=0;i<mas.length;i++) if(Number(mas[i]) > max) max = Number(mas[i]);//выберем максимальный номер
		max++;//следующий по порядку
		addNode(String(max),LastKey[chatId],key,'location');
		await sendMessage(chatId, 'Готово!', klava('Назад',{'backbutton':LastKey[chatId]}, chatId));//Отмена	
	}
	else await sendMessage(chatId, 'Извините, но Вы не являетесь Админом этого бота!', klava('0',null, chatId));
	return true;
}catch(err){WriteLogFile(err+'\nfrom AddButtonLocation()','вчат'); return err;}
}
//====================================================================
// Команда AddButtonESclosed
async function AddButtonESclosed(msg)
{
try{
	const chatId = msg.chat.id.toString();
	let match = msg.text.match(/\/AddButtonESclosed (.+$)/);
	if(!match || match.length<2) return false;
	const key = match[1];//имя кнопки

	if(validAdmin(chatId))
	{	if(!LastKey[chatId]) LastKey[chatId]=0;
		if(key=='')
		{await sendMessage(chatId, 'Что-то не так с именем кнопки.', klava('Назад',{'backbutton':LastKey[chatId]}, chatId));//Отмена
		 return true;
		}
		//сначала выберем номер новой кнопки
		let mas = Object.keys(Tree), max = -1;
		for(let i=0;i<mas.length;i++) if(Number(mas[i]) > max) max = Number(mas[i]);//выберем максимальный номер
		max++;//следующий по порядку
		addNode(String(max),LastKey[chatId],key,'ESclosed');
		await sendMessage(chatId, 'Готово!', klava('Назад',{'backbutton':LastKey[chatId]}, chatId));//Отмена	
	}
	else await sendMessage(chatId, 'Извините, но Вы не являетесь Админом этого бота!', klava('0',null, chatId));
	return true;
}catch(err){WriteLogFile(err+'\nfrom AddButtonESclosed()','вчат'); return err;}
}
//====================================================================
// Команда AddButtonESopened
async function AddButtonESopened(msg)
{
try{
	const chatId = msg.chat.id.toString();
	let match = msg.text.match(/\/AddButtonESopened (.+$)/);
	if(!match || match.length<2) return false;
	const key = match[1];//имя кнопки

	if(validAdmin(chatId))
	{	if(!LastKey[chatId]) LastKey[chatId]=0;
		if(key=='')
		{await sendMessage(chatId, 'Что-то не так с именем кнопки.', klava('Назад',{'backbutton':LastKey[chatId]}, chatId));//Отмена
		 return true;
		}
		//сначала выберем номер новой кнопки
		let mas = Object.keys(Tree), max = -1;
		for(let i=0;i<mas.length;i++) if(Number(mas[i]) > max) max = Number(mas[i]);//выберем максимальный номер
		max++;//следующий по порядку
		addNode(String(max),LastKey[chatId],key,'ESopened');
		await sendMessage(chatId, 'Готово!', klava('Назад',{'backbutton':LastKey[chatId]}, chatId));//Отмена	
	}
	else await sendMessage(chatId, 'Извините, но Вы не являетесь Админом этого бота!', klava('0',null, chatId));
	return true;
}catch(err){WriteLogFile(err+'\nfrom AddButtonESopened()','вчат'); return err;}
}
//====================================================================
// Команда AddAdmin
async function AddAdmin(msg)
{
try{
	const chatId = msg.chat.id.toString();
	let match = msg.text.match(/\/AddAdmin (.+$)/);
	if(!match || match.length<2) return false;
	let str = match[1];
	match = [];
	match = str.split('=');
	if(match.length<1) return false;

	if(validAdmin(chatId))
	{	//читаем файл админов
		try {AdminList = JSON.parse(await fs.promises.readFile(FileAdminList));/*if(!AdminList[chat_Supervisor]) {AdminList[chat_Supervisor] = "root";}*/}
		//catch (err) {if(!AdminList[chat_Supervisor]) {AdminList[chat_Supervisor] = "root";} WriteFileJson(FileAdminList,AdminList);}
		catch(err){WriteLogFile(err,'вчат');}
		//если только показать
		if(match[0]=='show')
		{
			str='Список Админов:\n\n';
			let mas = Object.keys(AdminList);
			for(i in mas) str += mas[i] + ' - ' + AdminList[mas[i]] + '\n';
			if(!LastKey[chatId]) LastKey[chatId] = '0';
			await sendMessage(chatId, str, klava('Назад',{'backbutton':LastKey[chatId]}, chatId));//Назад
			return true;
		}
		//далее пойдет добавление Админа
		if(match.length<1) return false;
		if(!isValidChatId(match[0])) 
		{await sendMessage(chatId, match[0]+' не есть chatId', {parse_mode:"markdown"}); 
		 return true;
		}
		const id = match[0];//chatId
		const name = match[1];//имя		
		
		AdminList[id] = name;//добавлянм новичка
		WriteFileJson(FileAdminList,AdminList);//записываем файл
		str='Список Админов:\n\n';//выводим новый список
		let mas = Object.keys(AdminList);
		for(i in mas) str += mas[i] + ' - ' + AdminList[mas[i]] + '\n';
		if(!LastKey[chatId]) LastKey[chatId] = '0';
		await sendMessage(chatId, str, klava('Назад',{'backbutton':LastKey[chatId]}, chatId));//Назад
	}
	else await sendMessage(chatId, 'Извините, но Вы не являетесь Админом этого бота!', klava('0',null, chatId));
	return true;
}catch(err){WriteLogFile(err+'\nfrom AddAdmin()','вчат'); return err;}
}
//====================================================================
// Команда AddUser
async function AddUser(msg)
{
try{
	const chatId = msg.chat.id.toString();
	let match = msg.text.match(/\/AddUser (.+$)/);
	if(!match || match.length<2) return false;
	let str = match[1];
	match = [];
	match = str.split('=');
	if(match.length<1) return false;

	if(validAdmin(chatId))
	{	//читаем файл служенцев
		try {UserList = JSON.parse(await fs.promises.readFile(FileUserList));} catch (err) {WriteFileJson(FileUserList,UserList);}
		//если только показать
		if(match[0]=='show')
		{
			str='Список Служенцев:\n\n';
			let mas = Object.keys(UserList);
			for(i in mas) str += mas[i] + ' - ' + UserList[mas[i]] + '\n';
			if(!LastKey[chatId]) LastKey[chatId] = '0';
			await sendMessage(chatId, str, klava('Назад',{'backbutton':LastKey[chatId]}, chatId));//Назад
			return true;
		}
		//далее пойдет добавление Юзера
		if(match.length<1) return false;
		if(!isValidChatId(match[0])) 
		{await sendMessage(chatId, match[0]+' не есть chatId', {parse_mode:"markdown"}); 
		 return true;
		}
		const id = match[0];//chatId
		const name = match[1];//имя		
		
		UserList[id] = name;//добавлянм новичка
		WriteFileJson(FileUserList,UserList);//записываем файл
		str='Список Служенцев:\n\n';//выводим новый список
		let mas = Object.keys(UserList);
		for(i in mas) str += mas[i] + ' - ' + UserList[mas[i]] + '\n';
		if(!LastKey[chatId]) LastKey[chatId] = '0';
		await sendMessage(chatId, str, klava('Назад',{'backbutton':LastKey[chatId]}, chatId));//Назад
	}
	else await sendMessage(chatId, 'Извините, но Вы не являетесь Админом этого бота!', klava('0',null, chatId));
	return true;
}catch(err){WriteLogFile(err+'\nfrom AddUser()','вчат'); return err;}
}
//====================================================================
// Команда AddEvent
async function AddEvent(msg)
{
try{
	if(!PRIVAT) return;//только в приватном режиме
	const chatId = msg.chat.id.toString();
	let match = msg.text.match(/\/AddEvent (.+$)/);
	if(!match || match.length<2) return false;
	let str = match[1];
	match = [];
	match = str.split('=');// событие=имя=дата
	if(match.length<1) return false;

	if(validAdmin(chatId))
	{	//читаем файл событий
		try {EventList = JSON.parse(await fs.promises.readFile(FileEventList));} catch (err) {WriteFileJson(FileEventList,EventList);}
		//если только показать
		if(match[0]=='show')
		{sendEvents(chatId, false);//без номеров
		 return true;
		}
		//далее пойдет добавление события
		if(match.length<3) return false;
		const event = match[0];//событие
		const name = match[1];//имя
		const date = match[2];//дата
		//проверяем дату
		if(date != moment(date,'DD.MM.YYYY').format('DD.MM.YYYY'))
		{	let str = 'Дата события не соответствует шаблону, или символы введены некорректно!\nПопробуйте еще разок сначала\n';
			if(!LastKey[chatId]) LastKey[chatId] = '0';
			await sendMessage(chatId, str, klava('Назад',{'backbutton':LastKey[chatId]}, chatId));//Назад
			return true;
		}
		
		//добавляем событие
		let mas = Object.keys(EventList);
		let num;
		if(!mas.length) num = 1;
		else 
		{if(mas.length>1) EventList = shiftObject(EventList);//переупорядочиваем номера событий
		 num = Number(mas[mas.length-1]) + 1;//следующий номер
		}
		EventList[num] = {};
		EventList[num].event = event;
		EventList[num].name = name;
		EventList[num].date = date;
		WriteFileJson(FileEventList,EventList);//записываем файл
		await sendEvents(chatId, false);//без номеров
	}
	else await sendMessage(chatId, 'Извините, но Вы не являетесь Админом этого бота!', klava('0',null, chatId));
	return true;
}catch(err){WriteLogFile(err+'\nfrom AddEvent()','вчат'); return err;}
}
//====================================================================
// Команда MoveButtonUp 
async function MoveButtonUp(msg)
{
try{
	const chatId = msg.chat.id.toString();
	let match = msg.text.match(/\/MoveButtonUp (.+$)/);
	if(!match || match.length<2) return false;
	const name = match[1];//имя кнопки
	let str = '';

	if(validAdmin(chatId))
	{	if(!LastKey[chatId])
		{await sendMessage(chatId, 'Текущий набор не определен!', klava('Назад',{'backbutton':'0'}, chatId));//Отмена
		 return true;
		}
		//найдем номер кнопки из текущего набора по имени и переместим ее
		let i, dl=Tree[LastKey[chatId]].child.length;
		for(i=0;i<dl;i++)
		{	if(Tree[Tree[LastKey[chatId]].child[i]].name==name)
			{//индекс i теперь указывает на положение кнопки в массиве
			 if(i > 0)
			 {let tmp = Tree[LastKey[chatId]].child[i-1];//запоминаем верхнюю кнопку
			  Tree[LastKey[chatId]].child[i-1] = Tree[LastKey[chatId]].child[i];//меняем местами кнопки
			  Tree[LastKey[chatId]].child[i] = tmp;
			  await WriteFileJson(FileTree,Tree);
			 }
			 break;
			}
		}
		if(i==dl) str = "В этом наборе кнопки '"+name+"' нет!";
		else str = 'Готово';
		await sendMessage(chatId, str, klava('Назад',{'backbutton':LastKey[chatId]}, chatId));//Назад
	}
	else await sendMessage(chatId, 'Извините, но Вы не являетесь Админом этого бота!', klava('0',null, chatId));
	return true;
}catch(err){WriteLogFile(err+'\nfrom MoveButtonUp()','вчат'); return err;}
}
//====================================================================
// Команда MoveButtonDown 
async function MoveButtonDown(msg)
{
try{
	const chatId = msg.chat.id.toString();
	let match = msg.text.match(/\/MoveButtonDown (.+$)/);
	if(!match || match.length<2) return false;
	const name = match[1];//имя кнопки
	let str = '';

	if(validAdmin(chatId))
	{	if(!LastKey[chatId])
		{await sendMessage(chatId, 'Текущий набор не определен!', klava('Назад',{'backbutton':'0'}, chatId));//Отмена
		 return true;
		}
		//найдем номер кнопки из текущего набора по имени и переместим ее
		let i, dl=Tree[LastKey[chatId]].child.length;
		for(i=0;i<dl;i++)
		{	if(Tree[Tree[LastKey[chatId]].child[i]].name==name)
			{//индекс i теперь указывает на положение кнопки в массиве
			 if(i < Tree[LastKey[chatId]].child.length-1)
			 {let tmp = Tree[LastKey[chatId]].child[i+1];//запоминаем нижнюю кнопку
			  Tree[LastKey[chatId]].child[i+1] = Tree[LastKey[chatId]].child[i];//меняем местами кнопки
			  Tree[LastKey[chatId]].child[i] = tmp;
			  await WriteFileJson(FileTree,Tree);
			 }
			 break;
			}
		}
		if(i==dl) str = "В этом наборе кнопки '"+name+"' нет!";
		else str = 'Готово';
		await sendMessage(chatId, str, klava('Назад',{'backbutton':LastKey[chatId]}, chatId));//Назад
	}
	else await sendMessage(chatId, 'Извините, но Вы не являетесь Админом этого бота!', klava('0',null, chatId));
	return true;
}catch(err){WriteLogFile(err+'\nfrom MoveButtonDown()','вчат'); return err;}
}
//====================================================================
// Команда StatWeek
async function StatWeek(msg)
{
	const chatId = msg.chat.id.toString();
  try{	
		let str = '';
		let num_users = Object.keys(LastMessId).length;//кол-во подписчиков
		str += 'Число активных подписчиков на сегодня = '+num_users+'\n\n';
		//просуммируем все счетчики за 2 недели
		let WeekCount = JSON.parse(await fs.promises.readFile(FileWeekCount));//читаем недельный файл
        WeekCount[WeekCount.index] = DayCount;//добавим текущие сутки, а то там может быть 0 все еще
		let arr = Object.keys(WeekCount);//соберем массив ключей дней недельного счетчика
		let sum = initObjCount();//инит выходного массива
		for(let i in arr)//пройдемся по дням недели
		{	if(arr[i]=='index') continue;
			let tmp = Object.keys(WeekCount[arr[i]]);//массив номеров кнопок в этом дне
			for(let k in tmp) sum[tmp[k]] += WeekCount[arr[i]][tmp[k]];
		}
		//теперь выведем суммы счетчиков в строку
		str += '_По кнопкам:_\n';
		let num = Object.keys(sum);//массив номеров кнопок в sum
		num.sort((a, b) => //сортируем кнопки по значению счетчика
		{	let aa, bb;
			aa = sum[a];
			bb = sum[b];
			if(aa > bb) return -1;//a идет первым
			else if(aa < bb) return 1;//b идет первым
			else return 0;
		});
		for(let i in num)
		{   if(Object.hasOwn(Tree,num[i]))
			{	if(Tree[num[i]].type.indexOf('audio')<0)//если не Аудио
				{	let name = Tree[num[i]].name;//вытащим имя кнопки
					str += '  *'+name+'* = '+sum[num[i]]+'\n';
				}
			}	
		}
		str += '\n*Сумма за '+(Object.keys(WeekCount).length-1)+' суток*';
        
		if(!LastKey[chatId]) LastKey[chatId] = '0';
		await sendMessage(chatId, str, klava('Назад', {parse_mode:"markdown",'backbutton':LastKey[chatId]}, chatId));
		return true;
  }catch(err){WriteLogFile(err+'\nfrom StatWeek()','вчат'); return err;}
}
//====================================================================
// Команда StatGrand
async function StatGrand(msg)
{
	const chatId = msg.chat.id.toString();
  try{
		let str = '';
		let num_users = Object.keys(LastMessId).length;//кол-во подписчиков
		str += 'Число активных подписчиков на сегодня = '+num_users+'\n\n';
		str += '*Общая сумма за все время:*\n\n';
		//теперь выведем суммы счетчиков в строку
		let num = Object.keys(GrandCount);
		num.sort((a, b) => //сортируем кнопки по значению счетчика
		{	let aa, bb;
			aa = GrandCount[a];
			bb = GrandCount[b];
			if(aa > bb) return -1;//a идет первым
			else if(aa < bb) return 1;//b идет первым
			else return 0;
		});
		for(let i in num)
		{   if(Object.hasOwn(Tree,num[i]))
			{	if(Tree[num[i]].type.indexOf('audio')<0)//если не Аудио
				{	let name = Tree[num[i]].name;//вытащим имя кнопки
					str += '  *'+name+'* = '+GrandCount[num[i]]+'\n';
				}
			}	
		}
        
		if(!LastKey[chatId]) LastKey[chatId] = '0';
		await sendMessage(chatId, str, klava('Назад', {parse_mode:"markdown",'backbutton':LastKey[chatId]}, chatId));
		return true;
  }catch(err){WriteLogFile(err+'\nfrom StatGrand()','вчат'); return err;}
}
//====================================================================
// Команда PublicText
async function PublicText(msg)
{
try{
	const chatId = msg.chat.id.toString();
	if(validAdmin(chatId) || (validUser(chatId) && !PRIVAT))
	{	if(!LastKey[chatId]) LastKey[chatId] = '0';
		await sendMessage(chatId, 'Теперь пришлите мне текст  для рассылки', klava('Назад',{'backbutton':LastKey[chatId]}, chatId));//Отмена
		WaitEditText[chatId]=6;//взводим флаг ожидания текста от юзера	
	}
	else await sendMessage(chatId, 'Извините, но Вы не являетесь Админом этого бота!', klava('0',null, chatId));
	return true;
}catch(err){WriteLogFile(err+'\nfrom PublicText()','вчат'); return err;}
}
//====================================================================
// Команда PublicTextAdmin
async function PublicTextAdmin(msg)
{
try{
	const chatId = msg.chat.id.toString();
	if(validAdmin(chatId) || (validUser(chatId) && !PRIVAT))
	{	if(!LastKey[chatId]) LastKey[chatId] = '0';
		await sendMessage(chatId, 'Теперь пришлите мне текст  для рассылки', klava('Назад',{'backbutton':LastKey[chatId]}, chatId));//Отмена
		WaitEditText[chatId]='public2admins';//взводим флаг ожидания текста от юзера	
	}
	else await sendMessage(chatId, 'Извините, но Вы не являетесь Админом этого бота!', klava('0',null, chatId));
	return true;
}catch(err){WriteLogFile(err+'\nfrom PublicText()','вчат'); return err;}
}
//====================================================================
// Команда PublicMessUser
async function PublicMessUser(msg)
{
try{
	const chatId = msg.chat.id.toString();
	let match = msg.text.match(/\/PublicMessUser (.+$)/);
	if(!match || match.length<2) return false;
	let str = match[1].trim();
	match = [];
	match = str.split('=');
	if(match.length<2) return false;

	if(validAdmin(chatId))
	{	//проверка chatId
		if(!isValidChatId(match[0])) 
		{await sendMessage(chatId, match[0]+' не есть chatId', {parse_mode:"markdown"}); 
		 return true;
		}
		//проверка текста
		if(!match[1])//если текста нет
		{await sendMessage(chatId, 'Тект сообщения не может быть пустым!', {parse_mode:"markdown"}); 
		 return true;
		}
		if(match.length>2) str = str.replace(match[0],'');
		else str = match[1];
		await sendMessage(match[0], str);//Посылаем сообщение подписчику
		await sendMessage(chatId, 'Сообщение отправлено!');
	}
	else await sendMessage(chatId, 'Извините, но Вы не являетесь Админом этого бота!', klava('0',null, chatId));
	return true;
}catch(err){WriteLogFile(err+'\nfrom AddUser()','вчат'); return err;}
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
async function sendPublicText(obj) 
{	
try{//загрузим массив chatId подписчиков
	let mas = Object.keys(LastMessId);
	let option = new Object();
	if(!obj) {WriteLogFile('\nfrom sendPublicText()\nПустой объект на входе'); return false;}
	if(!obj.text) {WriteLogFile('\nfrom sendPublicText()\nНет текста на входе'); return false;}
	if(Object.hasOwn(obj, 'entities')) option.entities = obj.entities;
	if(Object.hasOwn(obj, 'link_preview_options') && Object.hasOwn(obj.link_preview_options, 'is_disabled'))
	{	if(obj.link_preview_options.is_disabled) option.disable_web_page_preview = true;
	}
	for(let i=0;i<mas.length;i++)
	{	//try{await sleep(500);} catch(err){WriteLogFile(err+'\nfrom sendPublicText()=>sleep()');}
		await sendMessage(mas[i], obj.text, option);
	}
	return true;
}catch(err){WriteLogFile(err+'\nfrom sendPublicText()','вчат'); return err;}
}
//====================================================================
async function sendPublicTextAdmin(obj) 
{	
try{//загрузим массив chatId Админов
	let mas = [];
	if(Object.keys(AdminList).length>0) mas = mas.concat(Object.keys(AdminList));
	if(Object.keys(UserList).length>0) mas = mas.concat(Object.keys(UserList));
	if(!!chat_Supervisor) mas.push(chat_Supervisor);
	let option = new Object();
	if(!obj) {WriteLogFile('\nfrom sendPublicTextAdmin()\nПустой объект на входе'); return false;}
	if(!obj.text) {WriteLogFile('\nfrom sendPublicTextAdmin()\nНет текста на входе'); return false;}
	if(Object.hasOwn(obj, 'entities')) option.entities = obj.entities;
	if(Object.hasOwn(obj, 'link_preview_options') && Object.hasOwn(obj.link_preview_options, 'is_disabled'))
	{	if(obj.link_preview_options.is_disabled) option.disable_web_page_preview = true;
	}
	for(let i=0;i<mas.length;i++)
	{	//try{await sleep(500);} catch(err){WriteLogFile(err+'\nfrom sendPublicTextAdmin()=>sleep()');}
		await sendMessage(mas[i], obj.text, option);
	}
	return true;
}catch(err){WriteLogFile(err+'\nfrom sendPublicTextAdmin()','вчат'); return err;}
}
//====================================================================
async function srok(chatId,index)
{
try{
	let mess = '';
	if(!LastMessId[chatId]) LastMessId[chatId] = {};
	
	//сначала по чистому времени ----------------------------------------------------------------------
	if(!Object.hasOwn(LastMessId[chatId], 'srok'))//если еще не регистрировался
	{	let str = 'Вы еще не присылали мне дату начала срока '+COMMUNITY_TEXT+'.\n';
		str += 'Вы можете в любой момент прислать мне новую дату в формате команды:\n\n';
		str += '*начало=ДД.ММ.ГГГГ*\n\n';
		str += 'и я ее запомню!😎 (обязательно с маленькой буквы!😉)';
		await sendMessage(chatId, str, klava(index, {parse_mode:"markdown"}, chatId), index);
		return true;
	}
	else //получаем срок чистого времени
	{	mess += get_srok(chatId);
	}
	//потом по времени Без Никотина
	if(Object.hasOwn(LastMessId[chatId], 'smoke'))//если есть
	{	mess += '🔷\n';
		mess += get_smoke(chatId);
	}
	
	if(index) await sendMessage(chatId, mess, klava(index, {parse_mode:"markdown"}, chatId), index);
	else await sendMessage(chatId, mess, {parse_mode:"markdown"});
	return true;
	
}catch(err){WriteLogFile(err+'\nfrom srok("'+chatId+'")','вчат'); return err;}
}
//====================================================================
function get_srok(chatId)
{
try{
		let mess = '';
		//вычисляем срок чистого времени
		let begin = '';
		if(!!LastMessId[chatId] && !!LastMessId[chatId].srok) begin = LastMessId[chatId].srok;//начало
		if(!begin) {return mess;}
		if(begin != moment(begin,'DD.MM.YYYY').format('DD.MM.YYYY'))
		{	mess = 'Дата '+COMMUNITY_TEXT+' не соответствует шаблону, или символы введены некорректно!\nПопробуйте еще разок сначала\n';
			return mess;
		}
		let now = getUserDateTime(chatId).startOf('day');//сегодня для юзера в формате дней
		let time = moment(begin,'DD.MM.YYYY');//начало в формате времени
		let days = now.diff(time, 'days');//дни всего
		let months = now.diff(time, 'months');//месяцы всего
		let b = time;
		let y = now.diff(b, 'years');//годы
		b.add(y, 'years');
		let m = now.diff(b, 'months');//месяцы
		b.add(m, 'months');
		let d = now.diff(b, 'days');//дни
		let god = 'лет ';
		if(y<5) god = 'г. ';
		else if(y>20 && y%20<5) god = 'г. ';
		else if(y>30 && y%30<5) god = 'г. ';
		else if(y>40 && y%40<5) god = 'г. ';
		//проверяем на юбик
		if(days==10 || days==20 || days==30 || days==60 || days==90 || (days%100 == 0 && days>0))//по дням
		{	mess += 'Поздравляем с Юбилеем!!!\n';
			mess += 'Сегодня у Вас:\n*' + days + ' дн.*\n'+COMMUNITY_TEXT+'!!!\n';
			if(days==30 || days==90) 
			{mess += 'Приходите на собрание, там Вас ждет Медалька!!!\n';
			}
			mess += '👏🏻👏🏻👏🏻🫂💐';
		}
		else if(d==0 && m==0 && y > 0)//годы
		{	mess += 'Поздравляем с Большим Юбилеем!!!\n';
			mess += 'Сегодня у Вас:\n*';
			mess += y + god;
			mess += '*\n'+COMMUNITY_TEXT+'!!!\n';
			mess += '👏🏻👏🏻👏🏻🫂💐';
		}
		else if(d==0 && months > 0)//месяцы и годы
		{	mess += 'Поздравляем с Юбилеем!!!\n';
			mess += 'Сегодня у Вас:\n*';
			if(y==0) mess += m + 'мес. ';
			else //сколько то лет уже есть
			{	mess += y + god;
				if(m>0) mess += m + 'мес. ';
			}
			mess += '*\n'+COMMUNITY_TEXT+'!!!\n';
			if(months==1 || months==3 || months==6 || months==9) 
			{mess += 'Приходите на собрание, там Вас ждет Медалька!!!\n';
			}
			mess += '👏🏻👏🏻👏🏻🫂💐';
		}
		else //юбика нет пока
		{	mess += 'Сегодня у Вас:\n*';
			if(y>0) mess += y + god;
			if(m>0) mess += m + 'мес. ' + '(' + months + 'мес.) ';
			if(d>0) mess += d + 'дн. ';
			if(y>0 || m>0) mess += '\nили '+days+'дн. ';//общее дней
			mess += '*\n'+COMMUNITY_TEXT+'!!!';
		}
		return mess;
	
	}catch(err){WriteLogFile(err+'\nfrom get_srok("'+chatId+'")','вчат'); return '';}
}
//====================================================================
function get_smoke(chatId)
{
try{	
		let mess = '';
		//вычисляем срок времени БН
		let begin = '';
		if(!!LastMessId[chatId] && !!LastMessId[chatId].smoke) begin = LastMessId[chatId].smoke;//начало
		if(!begin) {return mess;}
		if(begin != moment(begin,'DD.MM.YYYY').format('DD.MM.YYYY'))
		{	mess = 'Дата БН не соответствует шаблону, или символы введены некорректно!\nПопробуйте еще разок сначала';
			return mess;
		}
		//mess += '🔷\n';
		let now = getUserDateTime(chatId).startOf('day');//сегодня для юзера в формате дней
		let time = moment(begin,'DD.MM.YYYY');//начало в формате времени
		let days = now.diff(time, 'days');//дни всего
		let months = now.diff(time, 'months');//месяцы всего
		let b = time;
		let y = now.diff(b, 'years');//годы
		b.add(y, 'years');
		let m = now.diff(b, 'months');//месяцы
		b.add(m, 'months');
		let d = now.diff(b, 'days');//дни
		let god = 'лет ';
		if(y<5) god = 'г. ';
		else if(y>20 && y%20<5) god = 'г. ';
		else if(y>30 && y%30<5) god = 'г. ';
		else if(y>40 && y%40<5) god = 'г. ';
		//проверяем на юбик
		if(days==10 || days==20 || days==30 || days==60 || days==90 || (days%100 == 0 && days>0))//по дням
		{	mess += 'Поздравляем с Юбилеем!!!\n';
			mess += 'Сегодня у Вас:\n*' + days + ' дн.*\nБез Никотина!!!\n';
			mess += '👏🏻👏🏻👏🏻🫂💐';
		}
		else if(d==0 && m==0 && y > 0)//годы
		{	mess += 'Поздравляем с Большим Юбилеем!!!\n';
			mess += 'Сегодня у Вас:\n*';
			mess += y + god;
			mess += '*\nБез Никотина!!!\n';
			mess += '👏🏻👏🏻👏🏻🫂💐';
		}
		else if(d==0 && months > 0)//месяцы и годы
		{	mess += 'Поздравляем с Юбилеем!!!\n';
			mess += 'Сегодня у Вас:\n*';
			if(y==0) mess += m + 'мес. ';
			else //сколько то лет уже есть
			{	mess += y + god;
				if(m>0) mess += m + 'мес. ';
					
			}
			mess += '*\nБез Никотина!!!\n';
			mess += '👏🏻👏🏻👏🏻🫂💐';
		}
		else //юбика нет пока
		{	mess += 'Сегодня у Вас:\n*';
			if(y>0) mess += y + god;
			if(m>0) mess += m + 'мес. ';
			if(d>0) mess += d + 'дн. ';
			if(y>0 || m>0) mess += '\nили '+days+'дн. ';//общее дней
			mess += '*\nБез Никотина!!!';
		}
		return mess;

	}catch(err){WriteLogFile(err+'\nfrom smoke("'+chatId+'")','вчат'); return '';}
}
//====================================================================
function get_event()
{
try{
		let mess = '';
		//читаем файл событий
		try {EventList = JSON.parse(fs.readFileSync(FileEventList));} catch (err) {WriteFileJson(FileEventList,EventList);}
		let now = moment().startOf('day');//сегодня в формате дней
		let nowmonth = Number(moment().month())+1;//текущий месяц
		let nowyear = Number(moment().year());//текущий год
		let mas = Object.keys(EventList);
		for(let i in mas)
		{	//достаем дату
			let date = EventList[mas[i]].date;
			let arr = date.split('.');// день.месяц.год;
			if(arr.length < 3) continue;
			let eventday = Number(arr[0]);//число события
			let eventmonth = Number(arr[1]);//месяц события
			let eventyear = Number(arr[2]);//год события
			let event = moment(''+eventday+'.'+eventmonth+'.'+nowyear,'DD.MM.YYYY');//событие в формате времени
			if((eventmonth-nowmonth) < 0) event = moment(''+eventday+'.'+eventmonth+'.'+(nowyear+1),'DD.MM.YYYY');//переход на сл.год
			let days = event.diff(now, 'days');//разница в днях
			if(days > Number(DISTANCE) || days < 0) continue;
			if(days==1) mess += 'Завтра ';
			else if(days==0) mess += 'Сегодня ';
			else mess += 'Скоро, через '+days+' дн. ';
			event=''; let name='';
			if(!!EventList[mas[i]].event) event = EventList[mas[i]].event;
			if(!!EventList[mas[i]].name) name = EventList[mas[i]].name;
			mess += event + ' ' + name + '\n';
			let year = nowyear - eventyear;
			if((eventmonth-nowmonth) < 0) year += 1;
			if(year > 0) mess += year + '-я годовщина!\n';
		}
		return mess;

	}catch(err){WriteLogFile(err+'\nfrom get_event','вчат'); return '';}
}
//====================================================================
//вычисляем Юбик, если есть, то возвращаем true, иначе false
function ubik(chatId,typ)
{
try{
		if(!LastMessId[chatId] || !LastMessId[chatId][typ]) return false;
		let begin = LastMessId[chatId][typ];//начало, typ=srok или smoke
		if(begin != moment(begin,'DD.MM.YYYY').format('DD.MM.YYYY')) {return false;}
		let now = getUserDateTime(chatId);//дата юзера или сервера
		let b = moment(begin,'DD.MM.YYYY');//начало в формате времени
		let days = now.diff(b, 'days');//дни всего
		let months = now.diff(b, 'months');//месяцы всего
		let y = now.diff(b, 'years');//годы
		b.add(y, 'years');
		let m = now.diff(b, 'months');//месяцы
		b.add(m, 'months');
		let d = now.diff(b, 'days');//дни
		//проверяем на юбик
		if(days==10 || days==20 || days==30 || days==60 || days==90 || (days%100==0 && days!=0)) {return true;}//по дням
		if(d==0 && months > 0) {return true;}//месяцы и годы
		return false;
	}catch(err){WriteLogFile(err+'\nfrom ubik()','вчат'); return false;}		
}
//====================================================================
// с 8.05 до 8.35 будем проверять всех подписанных на Юбик
let time_interval2 = 30*60;//в сек
var interval2 = setInterval(checkTime, time_interval2*1000);//заведем часы
checkTime();//выполним при запуске скрипта, вдруг уже в интервале...

//посылаем через очередь, чтоб при потере связи не потерялись сообщения
async function checkTime()
{	
try{
	let time1 = moment('08:05:00','HH:mm:ss').unix();//в сек
	let time2 = time1 + time_interval2;
    let now = moment().unix();//в сек
	//загружаем список файлов из /gif - полный путь
	const isFile = fileName => {return fs.lstatSync(fileName).isFile()};
	let files = fs.readdirSync(PathToGif).map(fileName => {return path.join(PathToGif, fileName)}).filter(isFile);
	if(!files) WriteLogFile('Ошибка файла салюта','вчат');
	
	//ищем юзеров, попадающих в интервал по местному времени юзера
	const arruser = Object.keys(LastMessId);
	for(const i in arruser)
	{	let chatId = arruser[i].toString();
		let userTime = getUserDateTime(chatId).unix();//unix время юзера
		//если в промежутке времени
		if(userTime>=time1 && userTime<time2)
		{	const ubik_srok = ubik(chatId,'srok');//true или false
			const ubik_smoke = ubik(chatId,'smoke');//true или false
			if(ubik_srok) sendUbikSrok(chatId);
			if(ubik_smoke) sendUbikSmoke(chatId);
		}
	}
	
	//в приватном режиме проверяем близость или наступление события
	//и отсылаем сообщение всем админам и юзерам
	//всегда по локальному времени сервера
	try{
		if(now>=time1 && now<time2 && PRIVAT && Object.keys(EventList).length > 0)
		{	let mess = get_event();//по локальной дате сервера
			if(!!mess && typeof(mess)==='string')
			{	let user = Object.keys(AdminList);//создаем массив ключей из списка админов
				for(let i in user)
				{	while(queue.getQueueStats().queueLength >= QUEUELIMIT) await sleep(50);//ограничение очереди
					let chatId = user[i].toString();
					await queue.addToQueue({type:'sendMessage', chatId:chatId, data:mess, options:{parse_mode:"markdown"}, bot:null});
					//await sendMessage(chatId, mess, {parse_mode:"markdown"});
				}
				user = Object.keys(UserList);//создаем массив ключей из списка юзеров
				if(user.length)
				{	for(let i in user)
					{	while(queue.getQueueStats().queueLength >= QUEUELIMIT) await sleep(50);//ограничение очереди
						let chatId = user[i].toString();
						await queue.addToQueue({type:'sendMessage', chatId:chatId, data:mess, options:{parse_mode:"markdown"}, bot:null});
						//await sendMessage(chatId, mess, {parse_mode:"markdown"});
					}
				}
			}
		}
	}catch(err){WriteLogFile(err+'\nfrom checkTime()=>events','вчат');}
		
	async function sendUbikSrok(chatId)
	{
		let username = 'unnown';
		if(!!LastMessId[chatId].username) username = '@'+LastMessId[chatId].username;
		if(!!LastMessId[chatId].first_name) username = '"'+LastMessId[chatId].first_name+'"';
		username += '('+chatId+')';
		try{	
			let mess = get_srok(chatId);
			//посылаем поздравление Юбиляру ЧВ
			if(!!mess && typeof(mess)==='string')
			{ 	if(mess.indexOf('Большим')+1) 
				{	if(!!files && files.length > 0) 
					{for(let k in files) 
					 {	//посылаем салют(ы)
						if(files[k].toLowerCase().indexOf('.gif')+1) 
						{	//let res = await sendDocument(chatId, files[k]);
							while(queue.getQueueStats().queueLength >= QUEUELIMIT) await sleep(50);//ограничение очереди
							let res = await queue.addToQueue({type:'sendDocument', chatId:chatId, data:files[k], options:{}, bot:null});
							if(!(String(res).indexOf('ETELEGRAM')+1)) WriteLogFile('Послал салют '+username+' из ubik_srok');
							else WriteLogFile('Ошибка при посылке салюта '+username+' из ubik_srok');
						}
					 }
					}
					if(!!Stickers.ubik && Stickers.ubik.length>0)//если есть стикеры
					{	for(let k in Stickers.ubik)
						{	//let res = await Bot.sendSticker(chatId, Stickers.ubik[k]);
							while(queue.getQueueStats().queueLength >= QUEUELIMIT) await sleep(50);//ограничение очереди
							let res = await queue.addToQueue({type:'sendSticker', chatId:chatId, data:Stickers.ubik[k], options:{}, bot:null});
							if(!(String(res).indexOf('ETELEGRAM')+1)) WriteLogFile('Послал стикер '+username+' из ubik_srok');
							else WriteLogFile('Ошибка при посылке стикера '+username+' из ubik_srok');
						}
					}
				}
				//let res = await sendMessage(chatId, mess, {parse_mode:"markdown"});//без кнопки
				while(queue.getQueueStats().queueLength >= QUEUELIMIT) await sleep(50);//ограничение очереди
				let res = await queue.addToQueue({type:'sendMessage', chatId:chatId, data:mess, options:{parse_mode:"markdown"}, bot:null});
				if(!(String(res).indexOf('ETELEGRAM')+1)) WriteLogFile('Послал поздравление '+username+' из ubik_srok');
				else WriteLogFile('Ошибка при посылке поздравления '+username+' из ubik_srok');
			}
		}catch(err){WriteLogFile(err+'\nfrom checkTime('+username+')=>if(ubik_srok)','вчат');}
	}
		
	async function sendUbikSmoke(chatId) 
	{
		let username = 'unnown';
		if(!!LastMessId[chatId].username) username = '@'+LastMessId[chatId].username;
		if(!!LastMessId[chatId].first_name) username = '"'+LastMessId[chatId].first_name+'"';
		username += '('+chatId+')';
		try{ 	
			let mess = get_smoke(chatId);
			//посылаем поздравление Юбиляру БН
			if(!!mess && typeof(mess)==='string')
			{	if(mess.indexOf('Большим')+1) 
				{	if(!!files && files.length > 0) 
					{for(let k in files) 
					 {	//посылаем салют
						if(files[k].toLowerCase().indexOf('.gif')+1) 
						{	//let res = await sendDocument(chatId, files[k]);
							while(queue.getQueueStats().queueLength >= QUEUELIMIT) await sleep(50);//ограничение очереди
							let res = await queue.addToQueue({type:'sendDocument', chatId:chatId, data:files[k], options:{}, bot:null});
							if(!(String(res).indexOf('ETELEGRAM')+1)) WriteLogFile('Послал салют '+username+' из ubik_smoke');
							else WriteLogFile('Ошибка при посылке салюта '+username+' из ubik_smoke');
							//await sleep(2000);
						}
					 }
					}
					if(!!Stickers.ubik && Stickers.ubik.length>0)//если есть стикеры
					{	for(let k in Stickers.ubik)
						{	//let res = await Bot.sendSticker(chatId, Stickers.ubik[k]);
							while(queue.getQueueStats().queueLength >= QUEUELIMIT) await sleep(50);//ограничение очереди
							let res = await queue.addToQueue({type:'sendSticker', chatId:chatId, data:Stickers.ubik[k], options:{}, bot:null});if(!(String(res).indexOf('ETELEGRAM')+1)) WriteLogFile('Послал стикер '+username+' из ubik_smoke');
							else WriteLogFile('Ошибка при посылке стикера '+username+' из ubik_smoke');
						}
					}
				}
				//let res = await sendMessage(chatId, mess, {parse_mode:"markdown"});//без кнопки
				while(queue.getQueueStats().queueLength >= QUEUELIMIT) await sleep(50);//ограничение очереди
				let res = await queue.addToQueue({type:'sendMessage', chatId:chatId, data:mess, options:{parse_mode:"markdown"}, bot:null});
				if(!(String(res).indexOf('ETELEGRAM')+1)) WriteLogFile('Послал поздравление '+username+' из ubik_smoke');
				else WriteLogFile('Ошибка при посылке поздравления '+username+' из ubik_smoke');
				//await sleep(1000);
			}
		}catch(err){WriteLogFile(err+'\nfrom checkTime('+username+')=>if(ubik_smoke)','вчат');}
	}
}catch(err) {WriteLogFile(err+'\nfrom checkTime()','вчат');}
}
//====================================================================
function shiftObject(obj)
{
	if(typeof obj !== 'object') return obj;
	let tmp = new Object();
	let n = 1;
	for(let i in obj) {tmp[n] = obj[i]; n++;}
	return tmp;
}
//====================================================================
function isValidChatId(value) 
{
    const id = Number(value);
	if(!isNaN(id) && Number.isInteger(id)) 
	{	if(id > 0) return true;//можно только положительные
		//else if(id < 0) return true;//можно и отрицательные тоже
		else if(id <= 0)
		{	if(!!LastMessId[value]) delete LastMessId[value];//удаляем отрицательный
			return false;
		}
		else return false;//0 нельзя
	}
	else return false;
}
//====================================================================
async function isValidUrl(url) 
{	
	const controller = new AbortController();
	const timeout = setTimeout(() => {controller.abort();}, 2000); // will time out after 1000ms
	try {
        const response = await fetch(url, 
		{method: 'HEAD', // Используем HEAD вместо GET, чтобы не загружать тело
         redirect: 'follow',
		 signal: controller.signal
        });
		// Возвращаем статус (200-399 обычно означает успех)
        return response.ok;
    } 
	catch(e) {return false;}
	finally {clearTimeout(timeout);}
}
//====================================================================
function checkPathFile(path)
{
try{
	if(!(path.indexOf(homedir+'/js')+1)&&!(path.indexOf(homedir+'/telegram')+1)) return false;
	if((path.indexOf('/Token')+1)||(path.indexOf('.js')+1)||(path.indexOf('.sh')+1)) return false;//запретный путь
	return true;
}catch(err){WriteLogFile(err+'\nfrom checkPath()','вчат');}
}
//====================================================================
//если бот запускается в пустой папке местности, то нужно создать папки и файлы по-умолчанию
//из контекста сборки, или из ENV
//это будет работать только из контейнера
function setContextFiles()
{//файлы контекста находятся в /home/pi/context/Bot
	let cBot = '/home/pi/context/Bot';
	let cToken = cBot+'/Token';
	let SUPERVISOR = (process.env.SUPERVISOR) ? process.env.SUPERVISOR : '';//чатайди супера из ENV
	let PRIVAT = (process.env.PRIVAT) ? Number(process.env.PRIVAT) : -1;//приватность из ENV
	let DISTANCE = (process.env.DISTANCE) ? Number(process.env.DISTANCE) : -1;//дистанция напоминания из ENV
	let TOKEN_BOT = (process.env.TOKEN_BOT) ? process.env.TOKEN_BOT : '';//токен бота из ENV
	let NAME_BOT = (process.env.NAME_BOT) ? process.env.NAME_BOT : '';//имя бота из ENV
	let TOKEN_LOG = (process.env.TOKEN_LOG) ? process.env.TOKEN_LOG : '';//токен лог-бота из ENV
	let NAME_LOG = (process.env.NAME_LOG) ? process.env.NAME_LOG : '';//имя лог-бота из ENV
	let PATHEG = (process.env.PATHEG) ? process.env.PATHEG : '';//путь к файлу Ежика из ENV
	let PATHRASPIS = (process.env.PATHRASPIS) ? process.env.PATHRASPIS : '';//путь к файлу Расписания из ENV
	let COMMUNITY_TEXT_QW = (process.env.COMMUNITY_TEXT) ? process.env.COMMUNITY_TEXT : '';//путь к файлу Расписания из ENV
	let TIMEZONE_MINUTES = (process.env.TIMEZONE_MINUTES) ? process.env.TIMEZONE_MINUTES : '';
	if(!fs.existsSync(TokenDir)) {fs.mkdirSync(TokenDir);}//создадим папку, если ее нет
	if(fs.existsSync(cBot))
	{	//текстовые файлы переписываем принудительно
		if(fs.existsSync(cBot+'/Команды.pdf'))
		{fs.copyFileSync(cBot+'/Команды.pdf',currentDir+'/Команды.pdf');}
		if(fs.existsSync(cBot+'/helpAdmin.txt'))
		{fs.copyFileSync(cBot+'/helpAdmin.txt',currentDir+'/helpAdmin.txt');}
		if(fs.existsSync(cBot+'/helpUser.txt'))
		{fs.copyFileSync(cBot+'/helpUser.txt',currentDir+'/helpUser.txt');}
		if(fs.existsSync(cBot+'/readme.txt'))
		{fs.copyFileSync(cBot+'/readme.txt',currentDir+'/readme.txt');}
		if(fs.existsSync(cBot+'/tenstep.txt'))
		{fs.copyFileSync(cBot+'/tenstep.txt',currentDir+'/tenstep.txt');}
		if(fs.existsSync(cBot+'/barrels.txt'))
		{fs.copyFileSync(cBot+'/barrels.txt',currentDir+'/barrels.txt');}
		if(fs.existsSync(cBot+'/CreatorUserGuid.txt'))
		{fs.copyFileSync(cBot+'/CreatorUserGuid.txt',currentDir+'/CreatorUserGuid.txt');}
		if(!fs.existsSync(currentDir+'/filename_bot.json'))
		{	let tmp=currentDir.split('/'); let name=tmp[tmp.length-1]+'_bot.json';//вытащим чисто имя папки в конце
			let obj = {};
			obj.filename = name;
			obj.FileEg = '/../Rassilka/eg.txt';
			obj.FileRaspis = '/../Rassilka/raspis.txt';
			WriteFileJson(currentDir+'/filename_bot.json',obj);
		}
		if(fs.existsSync(currentDir+'/filename_bot.json'))//если файл уже имеется
		{	let obj;
			try{obj = require(currentDir+'/filename_bot.json');}catch(err){console.log(err);}
			if(typeof(obj) != 'object') 
			{obj={};
			 let tmp=currentDir.split('/'); let name=tmp[tmp.length-1]+'_bot.json';//вытащим чисто имя папки в конце
			 obj.filename = name;
			 obj.FileEg = '/../Rassilka/eg.txt';
			 obj.FileRaspis = '/../Rassilka/raspis.txt';
			 WriteFileJson(currentDir+'/filename_bot.json',obj);
			}
			if(!obj.FileEg){obj.FileEg = '/../Rassilka/eg.txt'; WriteFileJson(currentDir+'/filename_bot.json',obj);}
			if(!obj.FileRaspis){obj.FileRaspis = '/../Rassilka/raspis.txt'; WriteFileJson(currentDir+'/filename_bot.json',obj);}
			if(!!PATHEG) {obj.FileEg = PATHEG; WriteFileJson(currentDir+'/filename_bot.json',obj);}
			if(!!PATHRASPIS) {obj.FileRaspis = PATHRASPIS; WriteFileJson(currentDir+'/filename_bot.json',obj);}
		}
		if(!fs.existsSync(currentDir+'/privat.json') && fs.existsSync(cBot+'/privat.json'))
		{fs.copyFileSync(cBot+'/privat.json',currentDir+'/privat.json');}
		//если запрошено изменение приватности или дистанции в ENV
		if(PRIVAT >= 0 || DISTANCE >= 0)
		{	let obj;
			try{obj = require(currentDir+'/privat.json');}catch(err){console.log(err);}
			if(typeof(obj) != 'object') {obj={}; obj.privat=0; obj.distance=1;}
			if(!!PRIVAT) {obj.privat = PRIVAT;}
			if(!!DISTANCE) {obj.distance = DISTANCE;}
			WriteFileJson(currentDir+'/privat.json',obj);
		}
		if(!fs.existsSync(currentDir+'/config.json') && fs.existsSync(cBot+'/config.json'))
		{	fs.copyFileSync(cBot+'/config.json',currentDir+'/config.json');
		}
		if(fs.existsSync(currentDir+'/config.json'))
		{	let obj;
			try{obj = require(currentDir+'/config.json');}catch(err){console.log(err);}
			let offset = moment().utcOffset();
			if(!Object.hasOwn(obj,'utcOffset')) {obj.utcOffset = offset>0?'+'+String(offset):String(offset); WriteFileJson(currentDir+'/config.json',obj);}
			if(!Object.hasOwn(obj,'community_text')) {obj.community_text='чистого времени'; WriteFileJson(currentDir+'/config.json',obj);}
		}
		//если запрошено изменение текста сообщества
		if(!!COMMUNITY_TEXT_QW)
		{	let obj;
			try{obj = require(currentDir+'/config.json');}catch(err){console.log(err);}
			if(typeof(obj) != 'object') {obj={}; obj.community_text='чистого времени'; obj.utcOffset='+180';}
			obj.community_text = COMMUNITY_TEXT_QW;
			WriteFileJson(currentDir+'/config.json',obj);
		}
		//если запрошено изменение таймзоны
		if(!!TIMEZONE_MINUTES)
		{	let obj;
			try{obj = require(currentDir+'/config.json');}catch(err){console.log(err);}
			if(typeof(obj) != 'object') {obj={}; obj.community_text='чистого времени'; obj.utcOffset='+180';}
			obj.utcOffset = TIMEZONE_MINUTES;
			WriteFileJson(currentDir+'/config.json',obj);
		}
		if(fs.existsSync(cBot+'/gif/Salut.gif'))
		{if(!fs.existsSync(currentDir+'/gif')) {fs.mkdirSync(currentDir+'/gif');}//создадим папку, если ее нет
		 if(fs.readdirSync(currentDir+'/gif').length===0)//если папка пустая
		 {fs.copyFileSync(cBot+'/gif/Salut.gif',currentDir+'/gif/Salut.gif');}
		}
		if(fs.existsSync(cBot+'/sticker/sticker.json'))
		{if(!fs.existsSync(PathToSticker)) {fs.mkdirSync(PathToSticker);}//создадим папку, если ее нет
		 if(fs.readdirSync(PathToSticker).length===0)//если папка пустая
		 {fs.copyFileSync(cBot+'/sticker/sticker.json',FileSticker);}
		}
	}
	if(fs.existsSync(cToken))
	{	
		if(!fs.existsSync(TokenDir+'/chatId.json') && fs.existsSync(cToken+'/chatId.json'))
		{fs.copyFileSync(cToken+'/chatId.json',TokenDir+'/chatId.json');}
		if(fs.existsSync(TokenDir+'/chatId.json'))//если файл уже имеется
		{	let obj;
			try{obj = require(TokenDir+"/chatId.json");}catch(err){console.log(err);}
			if(typeof(obj) != 'object') {obj={}; obj.Supervisor="123456789"; WriteFileJson(TokenDir+'/chatId.json',obj);}
			//если запрошено изменение чатайди супера в ENV
			if(!!SUPERVISOR) {obj.Supervisor = SUPERVISOR; WriteFileJson(TokenDir+'/chatId.json',obj);}
		}
		if(!fs.existsSync(TokenDir+'/logs_bot.json') && fs.existsSync(cToken+'/logs_bot.json'))
		{fs.copyFileSync(cToken+'/logs_bot.json',TokenDir+'/logs_bot.json');}
		if(fs.existsSync(TokenDir+'/logs_bot.json'))//если файл уже имеется
		{	let obj;
			try{obj = require(TokenDir+'/logs_bot.json');}catch(err){console.log(err);}
			if(typeof(obj) != 'object')
			{obj={}; obj.token = "ТокенБотаЛогов"; obj.comment = "имяБота";
			 WriteFileJson(TokenDir+'/logs_bot.json',obj);
			}
			//если запрошено изменение токена лог-бота в ENV
			if(!!TOKEN_LOG) {obj.token = TOKEN_LOG; WriteFileJson(TokenDir+'/logs_bot.json',obj);}
			//если запрошено изменение имени лог-бота в ENV
			if(!!NAME_LOG) {obj.name = NAME_LOG; WriteFileJson(TokenDir+'/logs_bot.json',obj);}
		}
		const filenamebot = require(currentDir+"/filename_bot.json").filename;
		if(!fs.existsSync(TokenDir+'/'+filenamebot))//если файла с токеном нет, то создадим по-умолчанию
		{WriteFileJson(TokenDir+'/'+filenamebot,{"token":"сюда надо вписать токен бота", "comment":"имя_бота"});}
		if(fs.existsSync(TokenDir+'/'+filenamebot))//если файл уже имеется
		{	let obj;
			try{obj = require(TokenDir+'/'+filenamebot);}catch(err){console.log(err);}
			if(typeof(obj) != 'object')
			{obj={}; obj.token = "ТокенБота"; obj.comment = "имяБота";
			 WriteFileJson(TokenDir+'/'+filenamebot,obj);
			}
			//если запрошено изменение токена лог-бота в ENV
			if(!!TOKEN_BOT) {obj.token = TOKEN_BOT; WriteFileJson(TokenDir+'/'+filenamebot,obj);}
			//если запрошено изменение имени лог-бота в ENV
			if(!!NAME_BOT) {obj.comment = NAME_BOT; WriteFileJson(TokenDir+'/'+filenamebot,obj);}
		}
	}
}
//====================================================================
function createPseudoRandom(seed) 
{
    const a = 1664525;
    const c = 1013904223;
    const m = Math.pow(2, 32); // модуль

    function next() {
        // Генерация следующего числа
        seed = (a * seed + c) % m;
        return seed;
    }
	
	function resetCount() {getRandomInt.arr = [];}

    function getRandomInt(min, max) {
        if(typeof getRandomInt.arr == 'undefined') resetCount();//в первом заходе 
		const range = max - min + 1;//диапазон
        let res, flag=true;
		while(flag) 
		{	res = min + (next() % range); // Вырезаем верхнюю границу
			if(getRandomInt.arr.includes(res)==false)
			{	getRandomInt.arr.push(res);
				flag = false;
				if(getRandomInt.arr.length >= range) resetCount();
			}
		}
		return res;
    }

    return {
		getRandomInt: getRandomInt, 
		resetCount: resetCount
	};
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
			{	//удаляем file_id
				let tmp=obj.media[i].media.split('/'); 
				if(tmp.length>1)//если есть путь
				{	let file=tmp[tmp.length-1];//вытащим чисто имя файла в конце
					while(!!FileId[file]) delete FileId[file];
					try{fs.unlinkSync(obj.media[i].media);}catch(err){console.log(err);}//удаление с диска
				}
				else
				{	let file = getKeyByValue(FileId, tmp[0])
					while(!!FileId[file]) delete FileId[file];
				}
			}
		}
		return true;
	}
	return false;
}catch(err){WriteLogFile(err+'\nfrom deleteMediaFiles()','вчат');}
}
//====================================================================
function getKeyByValue(object, value) {return Object.keys(object).find(key => object[key] === value);
}
//====================================================================
function setTimezoneByOffset(offsetMinutes)
{	
	// Ищем подходящую временную зону
    const allZones = moment.tz.names();
	let suitableZones = allZones.filter(zone => 
	{	const zoneOffset = moment.tz(zone).utcOffset();
        return zoneOffset === offsetMinutes;
    });
    if(suitableZones.length > 0) 
	{	let res;
		//ищем российские зоны сначала
		let rusZona = suitableZones.find(item => RUSSIAN_TIMEZONES.includes(item));
		if(!!rusZona) res = rusZona;// берем русскую, если есть
		else res = suitableZones[0];// Берем первую подходящую зону
		moment.tz.setDefault(res);//устанавливаем зону
        //WriteLogFile('Установлена зона: '+res+', смещение: '+moment().format('Z'));
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
		{	//WriteLogFile('Таймзона не установлена! Смещение: '+moment().format('Z'));
			return null;
		}
    }
}
//====================================================================
//возвращает таймстамп юзера в формате moment()
function getUserDateTime(chatId)
{	let now = moment();
	if(!!LastMessId[chatId].location&&!!LastMessId[chatId].location.utcOffset)//таймзона юзера
	{	let userTime = moment().unix() + ((Number(LastMessId[chatId].location.utcOffset) - utcOffset) * 60);//в сек
		now = moment.unix(userTime);//дата/время юзера
	}
	return now;
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
async function getObjFromES(URL)
{	try
	{
		let promise = new Promise((resolve, reject) => 
		{	needle.get(URL, async function(err, response) 
			{ 	if(response.statusCode==200)
				{
					resolve (response.body);	
				}
				else {console.log(moment().format('DD-MM-YY HH:mm:ss:ms ')+'Страница '+URL+' не получена! ' +response.statusCode); resolve('NO');} 
			});
  
		});//конец промиса
		return await promise;
	} catch(err) {console.log('Ошибка в parser_eg()\n'+err.message);}//
}
//====================================================================

