process.env["NTBA_FIX_350"] = 1;
const fs = require('fs');
const moment = require('moment');
const TelegramBot = require('node-telegram-bot-api');
const currentDir = (process.env.CURRENT_DIR) ? process.env.CURRENT_DIR : __dirname;
const TokenDir=currentDir+"/Token";//путь к папке с токенами
const FileImages = 	currentDir+'/ImagesList.txt';//файл картинок
const FileText =   	currentDir+'/TextList.txt';//файл Текстов
const FileForDate = currentDir+'/config.json';//файл дней по дате.
var FileEg = 		currentDir+'/../Raspis/eg.txt';//файл с ежиком
var FileRaspis = currentDir+'/../Raspis/raspis.txt';//файл с расписанием на день.
const FileRun = currentDir+'/run.txt';//файл со списком запуска
const FileButtons = currentDir+'/buttons.txt';//файл с кнопками
const PathToLog = currentDir+'/../log';//путь к логам
const LOGGING = true;//включение/выключение записи лога в файл
//---------------------------------------------------
//сразу проверяем или создаем необходимые папки и файлы
//setContextFiles();
//---------------------------------------------------
var LogFile;
(() =>{	let tmp=currentDir.split('/'); let name=tmp[tmp.length-1]+'_rassilka.log';//вытащим чисто имя папки в конце
		LogFile = PathToLog+'/'+name;
})();
const token = require(TokenDir+"/news_bot.json").token;
var nameBot = 'news_bot';
try{nameBot = require(TokenDir+"/news_bot.json").comment;}catch(err){}

const bot = new TelegramBot(token, {polling: false});
var ServiceChat = require(TokenDir+"/chatId.json").Supervisor;//пользователь 'Supervisor'
var chat_news={};
//Загрузим ID новостных каналов
(async () => 
{try{
 let mas = require(TokenDir+"/chatId.json");
 if(Object.hasOwn(mas, 'chat_news')) chat_news = mas.chat_news;
 /*{let key = Object.keys(mas.chat_news);
  for(let i=0;i<key.length;i++) {chat_news[i] = mas.chat_news[key[i]];}
 }*/
 else {chat_news = {'отсутствует':'-12345'}}
 }catch(err) {console.log(err);}	
})();
let tokenLog;
try{tokenLog = require(TokenDir+"/logs_bot.json").token;}catch(err){}
var logBot;
if(!!tokenLog) logBot = new TelegramBot(tokenLog, {polling: false});//бот для вывода лог-сообщений.
//---------------------------------------------------
var ImagesList=new Object();//массив загруженных картинок на выполнение
let TextList=new Object();//массив загруженных текстов на выполнение
let RunList={};//список запуска функций
let Buttons={};//кнопки
let masDay=['пустота','Понедельник','Вторник','Среда','Четверг','Пятница','Суббота','Воскресенье','Ежедневно'];
var flagEg=0, eg='', raspis='', flagRaspis=0, fun={}, count_text=0, count_photo=0;
let forDate=[];

//файл списка запуска функций
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

//файл списка картинок
if(RunList.Image)
{try {ImagesList = JSON.parse(fs.readFileSync(FileImages));}
 catch (err) {console.error(err); bot.sendMessage(ServiceChat,err);}
}

//файл списка текстов
if(RunList.Text)
{try {TextList = JSON.parse(fs.readFileSync(FileText));} 
 catch (err) {console.error(err); bot.sendMessage(ServiceChat,err);}
}

//файл с ежиком
if(RunList.Eg)
{try {	let stats=fs.statSync(FileEg);//свойства файла
		let diff=moment().diff(moment(stats.mtime),'hours');
		if(diff<23) {eg = fs.readFileSync(FileEg).toString(); flagEg=1;}//если не вчерашнее
	 }
 catch (err) {console.log(err); bot.sendMessage(ServiceChat,err);}
}

//файл с расписанием на день
if(RunList.Raspis)
{try{ 	let stats=fs.statSync(FileRaspis);//свойства файла
		let diff=moment().diff(moment(stats.mtime),'hours');
		if(diff<23) {raspis = fs.readFileSync(FileRaspis).toString(); flagRaspis=1;}//если не вчерашнее
	}
	catch (err) {console.error(err); bot.sendMessage(ServiceChat,err);}
}

//файл дней по дате
try 
{ forDate = JSON.parse(fs.readFileSync(FileForDate)).forDate;
} catch (err) {console.error(err); forDate=[3,0];}

//файл кнопок
try 
{ Buttons = JSON.parse(fs.readFileSync(FileButtons));
} catch (err) {console.error(err);}

//====================================================================
async function send_Images()
{ try
  {	if(fun['sendImages']) {clearTimeout(fun['sendImages']); fun['sendImages'] = null;}
	let good = 0;
	let interval = 60*1000*10;//10 мин
    WriteLogFile('Рассылка картинок:');
	if(Object.keys(ImagesList).length == 0) {WriteLogFile('К сожалению на сегодня ничего нет :('); return;}
	let made = 0;
	//читаем список
	let now = moment().startOf('day');//текущий день
	for(let key in ImagesList)
	{	try{  
		  let flag = 0;
          let date = ImagesList[key].date;//запись даты
          let day = ImagesList[key].dayOfWeek;//запись дня
          
          //если по дням из массива
          if(masDay.indexOf(day)+1)
          { //если дата окончания не наступила
			if(date == moment(date,'DD.MM.YYYY').format('DD.MM.YYYY'))//правильная дата
			{	let time = moment(date,'DD.MM.YYYY');//дата окончания
				if(time.diff(now, 'days') >= 0)//разница в днях, 0 = сегодня
				{	if(day==masDay[8]) flag++;//ежедневно, публикуем однозначно
					else
					{ 	let dayWeek = new Date().getDay();//сегодняшний день недели
						if(dayWeek==0) dayWeek=7;//приведем к формату 1..7
						if(dayWeek==masDay.indexOf(day)) flag++;//совпали дни, публикуем
					}
				}
			}
          }
          //если чистая дата
          else if(date==moment(date,'DD.MM.YYYY').format('DD.MM.YYYY') && day=='Дата')
          {
            if(public_byDate(date)) flag++;
          }
          //если Однократно или Завтра и дата верна
		  else if(date == moment(date,'DD.MM.YYYY').format('DD.MM.YYYY') && (day=='Однократно' || day=='Завтра'))
          { 
            let time = moment(now,'DD.MM.YYYY').format('DD.MM.YYYY');
			if(date==time) flag++;//прям сегодня
          }
		  
		  if(flag>0) {WriteLogFile('"'+key+'"'+' => день='+day+'; дата='+date+'('+((flag>0)?'да':'нет')+')');made++;}
          
          //публикуем файлы
          if(flag) 
          { let opt = new Object();
            if(Object.hasOwn(ImagesList[key], 'caption')) opt.caption = ImagesList[key].caption;
			if(Object.hasOwn(ImagesList[key], 'caption_entities')) opt.caption_entities = ImagesList[key].caption_entities;
            if(Object.hasOwn(ImagesList[key], 'parse_mode')) opt.parse_mode = ImagesList[key].parse_mode;
			//основной канал новостей
            //console.log(getTimeStr()+'Файлы в каналы:');
            let name = Object.keys(chat_news);
			for(let i=0;i<name.length;i++) 
			{	let res;
				if(!!ImagesList[key].type)
				{if(ImagesList[key].type == 'image') res = await sendPhotoToBot(chat_news[name[i]], ImagesList[key].path, opt);
				 else if(ImagesList[key].type == 'video') res = await sendVideoToBot(chat_news[name[i]], ImagesList[key].path, opt);
				 else if(ImagesList[key].type == 'audio') {res = await sendAudioToBot(chat_news[name[i]], ImagesList[key].path, opt);}
				 else if(ImagesList[key].type == 'document') {res = await sendDocumentToBot(chat_news[name[i]], ImagesList[key].path, opt);}
				 else if(ImagesList[key].type == 'album') {res = await sendAlbumToBot(chat_news[name[i]], ImagesList[key].media);}
				}
				else res = await sendPhotoToBot(chat_news[name[i]], ImagesList[key].path, opt);
				if(res===false) WriteLogFile('Не смог послать файл "'+key+'"'+' в '+name[i]); 
				else if(Object.hasOwn(res, 'code'))//в ответе есть ошибка
				{	
					if(res.code.indexOf('ETELEGRAM')+1)//ошибка от Телеги 
					{//нельзя послать сообщение админу в телегу
						/*if(good==0)//если не послано еще ни одного корректного сообщения 
						{	fun['sendImages'] = setTimeout(send_Images, interval);
							return;//выходим, дальше цикл теряет смысл
						}*/
						WriteLogFile(' '+res);
					}
					else //ошибка от Ноды
					{//можно послать сообщение админу в телегу
						let obj = {}; obj.message = '';
						if(Object.hasOwn(res, 'message')) obj.message = res.message;
						await sendTextToBot(ServiceChat,'Что-то случилось...\ncode='+obj.message);
					}
				}
				else 
				{	good++;//если без ошибок
					WriteLogFile('"'+key+'"'+' в '+name[i]+' = ОК');
				}
			}
          }
		}catch(err){WriteLogFile(err+'\nfrom send_Images()=>for()','вчат');}
	}
	if(made==0) WriteLogFile('К сожалению на сегодня ничего нет :(');
  } catch (err) 
  {console.error(getTimeStr()+err); 
   WriteLogFile(err+'\nfrom send_Images()','вчат');
  }
}
//====================================================================
async function send_Text()
{ try
  {	
	if(fun['sendText']) {clearTimeout(fun['sendText']); fun['sendText'] = null;}
	let good = 0;
	let interval = 60*1000*10;//10 мин
	WriteLogFile('Рассылка текстов:');
	if(Object.keys(TextList).length == 0) {WriteLogFile('К сожалению на сегодня ничего нет :('); return;}
	let made = 0;
	//читаем список
	let now = moment().startOf('day');//текущий день
	for(let key in TextList)
	{   try{  
		  let date = TextList[key].date;//запись даты
		  let day = TextList[key].dayOfWeek;//запись дня
          let flag = 0;
          
          //если по дням
          if(masDay.indexOf(day)+1)
          { //если дата окончания не наступила
			if(date == moment(date,'DD.MM.YYYY').format('DD.MM.YYYY'))//правильная дата
			{	let time = moment(date,'DD.MM.YYYY')//дата окончания
				if(time.diff(now, 'days') >= 0);//разница в днях, 0 = сегодня
				{	if(day==masDay[8]) flag++;//ежедневно, публикуем однозначно
					else
					{ 	let dayWeek = new Date().getDay();//сегодняшний день недели
						if(dayWeek==0) dayWeek=7;//приведем к формату 1..7
						if(dayWeek==masDay.indexOf(day)) flag++;//совпали дни, публикуем
					}
				}
			}
          }
          //если чистая дата
          else if(date==moment(date,'DD.MM.YYYY').format('DD.MM.YYYY') && day=='Дата')
          {
            if(public_byDate(date)) flag++;
          }
          //если Однократно и дата верна
		  else if(date == moment(date,'DD.MM.YYYY').format('DD.MM.YYYY') && (day=='Однократно' || day=='Завтра'))
          { 
            let time = moment(now,'DD.MM.YYYY').format('DD.MM.YYYY');
			if(date==time) flag++;//прям сегодня
          }
		  
		  if(flag>0) {WriteLogFile('"'+key+'"'+' => день='+day+'; дата='+date+'('+((flag>0)?'да':'нет')+')');made++;}
          
          //публикуем текст
		  if(flag)
          { let opt = new Object();
            opt.entities = TextList[key].entities;
			if(Object.hasOwn(TextList[key], 'link_preview_options'))
			{opt.link_preview_options=JSON.stringify(TextList[key].link_preview_options);
			 if(Object.hasOwn(TextList[key].link_preview_options, 'is_disabled')) opt.disable_web_page_preview = true;
			}
			if(!!TextList[key].parse_mode) opt.parse_mode = TextList[key].parse_mode;
            //основной канал новостей
            //console.log(getTimeStr()+'Текст в каналы:');
            let name = Object.keys(chat_news);
			for(let i=0;i<name.length;i++) 
			{	let res = await sendTextToBot(chat_news[name[i]], TextList[key].text, opt);
				if(res===false) WriteLogFile('Не смог послать текст "'+key+'"'+' в '+name[i]);
				else if(Object.hasOwn(res, 'code'))//в ответе есть ошибка
				{	
					if(res.code.indexOf('ETELEGRAM')+1)//ошибка от Телеги 
					{//нельзя послать сообщение админу в телегу
						/*if(good==0)//если не послано еще ни одного корректного сообщения 
						{	fun['sendText'] = setTimeout(send_Text, interval);
							return;//выходим, дальше цикл теряет смысл
						}*/
						WriteLogFile(' '+res);
					}
					else //ошибка от Ноды
					{//можно послать сообщение админу в телегу
						let obj = {}; obj.message = '';
						if(Object.hasOwn(res, 'message')) obj.message = res.message;
						await sendTextToBot(ServiceChat,'Что-то случилось...\ncode='+obj.message);
					}
				}
				else 
				{	good++;//если без ошибок
					WriteLogFile('"'+key+'"'+' в '+name[i]+' = ОК');
				}
			}
          }
		}catch(err){WriteLogFile(err+'\nfrom send_Text()=>for()','вчат');}
	}
	if(made==0) WriteLogFile('К сожалению на сегодня ничего нет :(');
  } catch (err) 
  {console.error(getTimeStr()+err); 
   WriteLogFile(err+'\nfrom send_Text()','вчат');
  }
}
//====================================================================
//посылает Ежик всегда в markdown
async function send_Eg()
{ try
  {	if(flagEg)
	{
		if(!eg) {WriteLogFile(getTimeStr()+'файл с ежиком отсутствует'); return;}
		if(fun['sendEg']) {clearTimeout(fun['sendEg']); fun['sendEg'] = null;}
		let good = 0;
		let interval = 60*1000*10;//10 мин
		WriteLogFile('Рассылка Ежика в каналы:');
		let name = Object.keys(chat_news);
		for(let i=0;i<name.length;i++) 
		{  try{	
			let res = await bot.sendMessage(chat_news[name[i]],eg,{parse_mode:"markdown",disable_web_page_preview:true});
			if(res===false) WriteLogFile('Не смог послать Ежик "'+' в '+name[i]);
			else if(Object.hasOwn(res, 'code'))//в ответе есть ошибка
			{	
				if(res.code.indexOf('ETELEGRAM')+1)//ошибка от Телеги 
				{//нельзя послать сообщение админу в телегу
					/*if(good==0)//если не послано еще ни одного корректного сообщения 
					{	fun['sendEg'] = setTimeout(send_Eg, interval);
						return;//выходим, дальше цикл теряет смысл
					}*/
					WriteLogFile(' '+res);
				}
				else //ошибка от Ноды
				{//можно послать сообщение админу в телегу
					let obj = {}; obj.message = '';
					if(Object.hasOwn(res, 'message')) obj.message = res.message;
					await sendTextToBot(ServiceChat,'Что-то случилось...\ncode='+obj.message);
				}
			}
			else 
			{	good++;//если без ошибок
				WriteLogFile('в '+name[i]+' = ОК');
			}
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
  {	if(flagRaspis)
	{
		if(!raspis) {WriteLogFile('файл с расписанием отсутствует'); return;}
		if(fun['sendRaspis']) {clearTimeout(fun['sendRaspis']); fun['sendRaspis'] = null;}
		let good = 0;
		let interval = 60*1000*10;//10 мин
		
		let mode = 'HTML';//по-умолчанию
		let obj = {};
		let flag = 1;
		//проверим на объект
		try{obj = JSON.parse(raspis);}catch(err){flag = 0;}//если не JSON
		if(flag)//если это объект
		{	if(Object.hasOwn(obj, 'text')) raspis = obj.text;
			if(Object.hasOwn(obj, 'mode')) mode = obj.mode;
		}
		
		WriteLogFile('Рассылка Расписания в каналы:');
		const keyboard = getButtonUrl(mode,true);//прилепим кнопку с ботом с отключенным превью ссылок
		let name = Object.keys(chat_news);
		for(let i=0;i<name.length;i++) 
		{  try{
			let res = await sendTextToBot(chat_news[name[i]],raspis,keyboard);
			if(res===false) WriteLogFile('Не смог послать Расписание "'+' в '+name[i]);
			else if(Object.hasOwn(res, 'code'))//в ответе есть ошибка
			{	
				if(res.code.indexOf('ETELEGRAM')+1)//ошибка от Телеги 
				{//нельзя послать сообщение админу в телегу
					/*if(good==0)//если не послано еще ни одного корректного сообщения 
					{	fun['sendRaspis'] = setTimeout(send_Raspis, interval);
						return;//выходим, дальше цикл теряет смысл
					}*/
					WriteLogFile(' '+res);
				}
				else //ошибка от Ноды
				{//можно послать сообщение админу в телегу
					let obj = {}; obj.message = '';
					if(Object.hasOwn(res, 'message')) obj.message = res.message;
					await sendTextToBot(ServiceChat,'Что-то случилось...\ncode='+obj.message);
				}
			}
			else 
			{	good++;//если без ошибок
				WriteLogFile('в '+name[i]+' = ОК');
			}
		  }catch(err){WriteLogFile(err+'\nfrom send_Raspis()=>for()','вчат');}
		}
	}
  } catch (err) 
  {WriteLogFile(err+'\nfrom send_Raspis()','вчат');
  }
}
//====================================================================
//особое расписание публикаций по Дате
function public_byDate(date)
{	
try{
	let flag = false;
	let now = moment().startOf('day');//текущий день
	let time = moment(date,'DD.MM.YYYY');
	let days = time.diff(now, 'days')+1;
    if(days>0 && days%7==0) flag=true;
    else if(days<14)//менее 2х недель
	//else if(days<7)//менее 1 недели
    {	/*switch(days)
        {	//case 10: flag=true; break;
            //case 7: flag=true; break;
            case 4: flag=true; break;
            //case 3: flag=true; break;
            //case 2: flag=true; break;
            case 1: flag=true; break;
		}*/
		let tmp=days-1;
		if(forDate.indexOf(tmp)+1) flag=true;
	}
	return flag;
}catch(err){WriteLogFile(err+'\nfrom public_byDate()','вчат'); return false;}
}
//====================================================================
//запускаем функции
(async () => 
{
try{
  WriteLogFile('\nНачинаем Рассылку:'); 
  
  //ежик
  if(RunList.Eg===true) await send_Eg();
  
  //расписание
  if(RunList.Raspis===true) await send_Raspis();
  
  //публикуем тексты
  if(RunList.Text===true) await send_Text();
  
  //публикуем фото
  if(RunList.Image===true) await send_Images();

}catch(err){WriteLogFile(err+'\nfrom запускаем функции()','вчат');}
})();
//====================================================================
function getTimeStr() {return moment().format('DD-MM-YY HH:mm:ss:ms ');}
//====================================================================
async function sendTextToBot(chat, text, opt)
{ let res;
  try{
	  if(!isValidChatId(chat)) return false;//если не число, то не пускаем
	  if(text=='') return false;
	  res = await bot.sendMessage(chat,text,opt);
  }catch(err)
  {	console.error(getTimeStr()+err);
    console.error('Не смог послать текст в '+chat);
	WriteLogFile(err+'\nfrom sendTextToBot()','вчат');
	res=err;
  }
  return res;
}
//====================================================================
async function sendPhotoToBot(chat, path, opt)
{ let res;
  try{
	if(!isValidChatId(chat)) return false;//если не число, то не пускаем
	if(path=='') return false;
	if(!fs.existsSync(path)) return false;
	res = await bot.sendPhoto(chat,path,opt);
  }catch(err)
  { console.error(getTimeStr()+err);
    console.error('Не смог послать фотку в '+chat);
	WriteLogFile(err+'\nfrom sendPhotoToBot()','вчат');
	res=err;
  }
  return res;
}
//====================================================================
async function sendVideoToBot(chat, path, opt)
{ let res;
  try{
	if(!isValidChatId(chat)) return false;//если не число, то не пускаем
	if(path=='') return false;
	if(!fs.existsSync(path)) return false;
	res = await bot.sendVideo(chat,path,opt);
  }catch(err)
  { console.error(getTimeStr()+err);
    console.error('Не смог послать ролик в '+chat);
	WriteLogFile(err+'\nfrom sendVideoToBot()','вчат');
	res = err;
  }
  return res;
}
//====================================================================
async function sendAudioToBot(chat, path, opt)
{ let res;
  try{
	if(!isValidChatId(chat)) return false;//если не число, то не пускаем
	if(path=='') return false;
	if(!fs.existsSync(path)) return false;
	res = await bot.sendAudio(chat,path,opt);
  }catch(err)
  { console.error(getTimeStr()+err);
    console.error('Не смог послать audio в '+chat);
	WriteLogFile(err+'\nfrom sendAudioToBot()','вчат');
	res = err;
  }
  return res;
}
//====================================================================
async function sendDocumentToBot(chat, path, opt)
{ let res;
  try{
	if(!isValidChatId(chat)) return false;//если не число, то не пускаем
	if(path=='') return false;
	if(!fs.existsSync(path)) return false;
	res = await bot.sendDocument(chat,path,opt);
  }catch(err)
  { console.error(getTimeStr()+err);
    console.error('Не смог послать документ в '+chat);
	WriteLogFile(err+'\nfrom sendDocumentToBot()','вчат');
	res = err;
  }
  return res;
}
//====================================================================
async function sendAlbumToBot(chat, media)
{ let res;
  try{
	if(!isValidChatId(chat)) return false;//если не число, то не пускаем
	if(media=='') return false;
	for(let i=0;i<media.length;i++) {if(!fs.existsSync(media[i].media)) return false;}
	res = await bot.sendMediaGroup(chat,media);
  }catch(err)
  { console.error(getTimeStr()+err);
    console.error('Не смог послать альбом в '+chat);
	WriteLogFile(err+'\nfrom sendAlbumToBot()','вчат');
	res = err;
  }
  return res;
}
//====================================================================
function isValidChatId(value) 
{
    if(typeof(value)==='string')
	{return /^-?\d+$/.test(value);//целые отрицательные можно
	 //return /^\d+$/.test(value);//целые отрицательные нельзя
	 //return /^-?\d+(\.\d+)?$/.test(value);//вещественные отрицательные можно
	}
	else if(typeof(value)==='number') return true;
	else return false;
}
//====================================================================
//вернем кнопку со ссылкой, парс режим и выкл превью
function getButtonUrl(pars, preview)
{
try{
	let opt = {};
	if(Object.hasOwn(Buttons, 'reply_markup')) opt.reply_markup = Buttons.reply_markup;
	/*{ 	reply_markup: 
		{ inline_keyboard: 
			[ [{"text": "Бот АН52", "url": "https://t.me/NA52_bot"}],
				[{"text": "Духовные принципы на каждый день", "url": "https://t.me/+a8HO46bHu8MwZjZk"}]
			]	 
		}
	};*/
	if(pars==='HTML' || pars==='markdown') opt.parse_mode = pars;
	if(preview===true) opt.disable_web_page_preview = true;
	return opt;
}catch(err){WriteLogFile(err+'\nfrom getButtonUrl()','вчат'); return {};}	
}
//====================================================================
async function WriteLogFile(arr, flag) 
{   if(!LOGGING) return;
	let str=moment().format('DD.MM.YY HH:mm:ss:ms')+' - '+arr+'\n';
    try{
		await fs.appendFileSync(LogFile, str);
		if(!!logBot && !!flag) 
		{str='From rassilka by '+nameBot+'\n'+str;
		 await logBot.sendMessage(ServiceChat, str);
		}
		console.log(str);
	}catch(err){console.log(err);}
}
//====================================================================
//если бот запускается в пустой папке местности, то нужно создать папки и файлы по-умолчанию
//из контекста сборки
//это будет работать только из контейнера
function setContextFiles()
{//файлы контекста находятся в /home/pi/context/Bot и /home/pi/context/Token
	let cBot = '/home/pi/context/Bot';
	//let cToken = '/home/pi/context/Token';
	if(fs.existsSync(cBot))
	{	//текстовые файлы переписываем принудительно
		//if(fs.existsSync(cBot+'/readme.txt')) {fs.copyFileSync(cBot+'/readme.txt',currentDir+'/readme.txt');}
		//if(fs.existsSync(cBot+'/buttons.txt') && !fs.existsSync(currentDir+'/buttons.txt')) 
		//{fs.copyFileSync(cBot+'/buttons.txt',currentDir+'/buttons.txt');}
		//if(fs.existsSync(cBot+'/run.txt') && !fs.existsSync(currentDir+'/run.txt')) 
		//{fs.copyFileSync(cBot+'/run.txt',currentDir+'/run.txt');}
	}
}
//====================================================================

