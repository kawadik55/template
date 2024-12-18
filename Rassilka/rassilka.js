process.env["NTBA_FIX_350"] = 1;
const fs = require('fs');
const moment = require('moment');
const TelegramBot = require('node-telegram-bot-api');
const currentDir = (process.env.CURRENT_DIR) ? process.env.CURRENT_DIR : __dirname;
const TokenDir=currentDir+"/../Token";//путь к папке с токенами, на уровень выше
const FileImages = 	currentDir+'/../LoaderBot/ImagesList.txt';//файл картинок
const FileText =   	currentDir+'/../LoaderBot/TextList.txt';//файл Текстов
const FileForDate = currentDir+'/../LoaderBot/config.json';//файл дней по дате
//const FileEg = 		currentDir+'/../Parser/eg.txt';//файл с ежиком в другой папке
//const FileRaspis = currentDir+'/../Parser/raspis.txt';//файл с расписанием на день
const FileEg = 		currentDir+'/eg.txt';//файл с ежиком
const FileRaspis = currentDir+'/raspis.txt';//файл с расписанием на день
const FileRun = currentDir+'/run.txt';//файл со списком запуска
const FileButtons = currentDir+'/buttons.txt';//файл с кнопками
const PathToLog = currentDir+'/../log';//путь к логам
const LOGGING = true;//включение/выключение записи лога в файл
const LogFile = PathToLog+'/rassilka.txt';

const token = require(TokenDir+"/news_bot.json").token;
var nameBot = 'news_bot';
try{nameBot = require(TokenDir+"/news_bot.json").comment;}catch(err){}

const bot = new TelegramBot(token, {polling: false});
var ServiceChat = require(TokenDir+"/chatId.json").Supervisor;//пользователь 'Supervisor'
var chat_news=[];
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
let tokenLog;
try{tokenLog = require(TokenDir+"/logs_bot.json").token;}catch(err){}
var logBot;
if(!!tokenLog) logBot = new TelegramBot(tokenLog, {polling: false});//бот для вывода лог-сообщений
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
{console.error(err);
 RunList.Text = false; RunList.Image = false; RunList.Eg = false; RunList.Raspis = false;
 fs.writeFileSync(FileRun, JSON.stringify(RunList,null,2));
}

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
 catch (err) {console.error(err); bot.sendMessage(ServiceChat,err);}
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
    if(Object.keys(ImagesList).length == 0) return;
    console.log(getTimeStr()+' - Рассылка картинок:');
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
          //если Однократно и дата верна
		  else if(date == moment(date,'DD.MM.YYYY').format('DD.MM.YYYY') && day=='Однократно')
          { 
            let time = moment(now,'DD.MM.YYYY').format('DD.MM.YYYY');
			if(date==time) flag++;//прям сегодня
          }
		  
		  console.log(getTimeStr()+' "'+key+'"'+' => день='+day+'; дата='+date+'('+((flag>0)?'да':'нет')+')');
          
          //публикуем картинки
          if(flag) 
          { let opt = new Object();
            if(Object.hasOwn(ImagesList[key], 'caption')) opt.caption = ImagesList[key].caption;
			if(Object.hasOwn(ImagesList[key], 'caption_entities')) opt.caption_entities = ImagesList[key].caption_entities;
            if(Object.hasOwn(ImagesList[key], 'parse_mode')) opt.parse_mode = ImagesList[key].parse_mode;
			//основной канал новостей
            console.log(getTimeStr()+'Фото в каналы:');
            for(let i=0;i<chat_news.length;i++) 
			{	let res;
				if(!!ImagesList[key].type)
				{if(ImagesList[key].type == 'image') res = await sendPhotoToBot(chat_news[i], ImagesList[key].path, opt);
				 else if(ImagesList[key].type == 'video') res = await sendVideoToBot(chat_news[i], ImagesList[key].path, opt);
				 else if(ImagesList[key].type == 'audio') {res = await sendAudioToBot(chat_news[i], ImagesList[key].path, opt);}
				 else if(ImagesList[key].type == 'document') {res = await sendDocumentToBot(chat_news[i], ImagesList[key].path, opt);}
				}
				else res = await sendPhotoToBot(chat_news[i], ImagesList[key].path, opt);
				//console.log('res='+JSON.stringify(res,null,2));
				if(Object.hasOwn(res, 'code'))//в ответе есть ошибка
				{	
					if(res.code.indexOf('ETELEGRAM')+1)//ошибка от Телеги 
					{//нельзя послать сообщение админу в телегу
						if(good==0)//если не послано еще ни одного корректного сообщения 
						{	fun['sendImages'] = setTimeout(send_Images, interval);
							return;//выходим, дальше цикл теряет смысл
						}
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
					console.log(getTimeStr()+'в '+chat_news[i]+' = ОК');
				}
			}
          }
		}catch(err){WriteLogFile(err+'\nfrom send_Images()=>for()');}
	}
  } catch (err) 
  {console.error(getTimeStr()+err); 
   WriteLogFile(err+'\nfrom send_Images()');
  }
}
//====================================================================
async function send_Text()
{ try
  {	
	if(fun['sendText']) {clearTimeout(fun['sendText']); fun['sendText'] = null;}
	let good = 0;
	let interval = 60*1000*10;//10 мин
	if(Object.keys(TextList).length == 0) return;
	console.log(getTimeStr()+' - Рассылка текстов:');
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
		  else if(date == moment(date,'DD.MM.YYYY').format('DD.MM.YYYY') && day=='Однократно')
          { 
            let time = moment(now,'DD.MM.YYYY').format('DD.MM.YYYY');
			if(date==time) flag++;//прям сегодня
          }
		  
		  console.log(getTimeStr()+' "'+key+'"'+' => день='+day+'; дата='+date+'('+((flag>0)?'да':'нет')+')');
          
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
            console.log(getTimeStr()+'Текст в каналы:');
            for(let i=0;i<chat_news.length;i++) 
			{	let res = await sendTextToBot(chat_news[i], TextList[key].text, opt);
				//console.log('res='+JSON.stringify(res,null,2));
				if(Object.hasOwn(res, 'code'))//в ответе есть ошибка
				{	
					if(res.code.indexOf('ETELEGRAM')+1)//ошибка от Телеги 
					{//нельзя послать сообщение админу в телегу
						if(good==0)//если не послано еще ни одного корректного сообщения 
						{	fun['sendText'] = setTimeout(send_Text, interval);
							return;//выходим, дальше цикл теряет смысл
						}
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
					console.log(getTimeStr()+'в '+chat_news[i]+' = ОК');
				}
			}
          }
		}catch(err){WriteLogFile(err+'\nfrom send_Text()=>for()');}
	}
  } catch (err) 
  {console.error(getTimeStr()+err); 
   WriteLogFile(err+'\nfrom send_Text()');
  }
}
//====================================================================
async function send_Eg()
{ try
  {	if(flagEg)
	{
		if(fun['sendEg']) {clearTimeout(fun['sendEg']); fun['sendEg'] = null;}
		let good = 0;
		let interval = 60*1000*10;//10 мин
		console.log(getTimeStr()+' Рассылка Ежика в каналы:');
		for(let i=0;i<chat_news.length;i++) 
		{  try{	
			let res = await bot.sendMessage(chat_news[i],eg,{parse_mode:"markdown",disable_web_page_preview:true});
			//console.log('res='+JSON.stringify(res,null,2));
			if(Object.hasOwn(res, 'code'))//в ответе есть ошибка
			{	
				if(res.code.indexOf('ETELEGRAM')+1)//ошибка от Телеги 
				{//нельзя послать сообщение админу в телегу
					if(good==0)//если не послано еще ни одного корректного сообщения 
					{	fun['sendEg'] = setTimeout(send_Eg, interval);
						return;//выходим, дальше цикл теряет смысл
					}
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
				console.log(getTimeStr()+'в '+chat_news[i]+' = ОК');
			}
		  }catch(err){WriteLogFile(err+'\nfrom send_Eg()=>for()');}
		}
	}
  } catch (err) 
  {console.error(getTimeStr()+err); WriteLogFile(err+'\nfrom send_Eg()');
  }
}
//====================================================================
async function send_Raspis()
{ try
  {	if(flagRaspis)
	{
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
		
		console.log(getTimeStr()+' Рассылка Расписания в каналы:');
		const keyboard = getButtonUrl(mode,true);//прилепим кнопку с ботом с отключенным превью ссылок
		for(let i=0;i<chat_news.length;i++) 
		{  try{
			let res = await sendTextToBot(chat_news[i],raspis,keyboard);
			//console.log('res='+JSON.stringify(res,null,2));
			if(Object.hasOwn(res, 'code'))//в ответе есть ошибка
			{	
				if(res.code.indexOf('ETELEGRAM')+1)//ошибка от Телеги 
				{//нельзя послать сообщение админу в телегу
					if(good==0)//если не послано еще ни одного корректного сообщения 
					{	fun['sendRaspis'] = setTimeout(send_Raspis, interval);
						return;//выходим, дальше цикл теряет смысл
					}
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
				console.log(getTimeStr()+'в '+chat_news[i]+' = ОК');
			}
		  }catch(err){WriteLogFile(err+'\nfrom send_Raspis()=>for()');}
		}
	}
  } catch (err) 
  {console.error(getTimeStr()+err); WriteLogFile(err+'\nfrom send_Raspis()');
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
}catch(err){WriteLogFile(err+'\nfrom public_byDate()'); return false;}
}
//====================================================================
//запускаем функции
(async () => 
{
try{
  console.log(getTimeStr()+'Начинаем Рассылку:');
  
  //ежик
  if(RunList.Eg) await send_Eg();
  
  //расписание
  if(RunList.Raspis) await send_Raspis();
  
  //публикуем тексты
  if(RunList.Text) await send_Text();
  
  //публикуем фото
  if(RunList.Image) await send_Images();
}catch(err){WriteLogFile(err+'\nfrom запускаем функции()');}
})();
//====================================================================
function getTimeStr() {return moment().format('DD-MM-YY HH:mm:ss:ms ');}
//====================================================================
async function sendTextToBot(chat, text, opt)
{ try{
	  if(!isValidChatId(chat)) return false;//если не число, то не пускаем
	  if(text=='') return false;
	  const res = await bot.sendMessage(chat,text,opt);
	  return res;
  }catch(err)
  {	console.error(getTimeStr()+err);
    console.error('Не смог послать текст в '+chat);
	WriteLogFile(err+'\nfrom sendTextToBot()');
	return err;
  }
}
//====================================================================
async function sendPhotoToBot(chat, path, opt)
{ try{
	if(!isValidChatId(chat)) return false;//если не число, то не пускаем
	if(path=='') return false;
	const res = await bot.sendPhoto(chat,path,opt);
    return res;
  }catch(err)
  { console.error(getTimeStr()+err);
    console.error('Не смог послать фотку в '+chat);
	WriteLogFile(err+'\nfrom sendPhotoToBot()');
	return err;
  }
}
//====================================================================
async function sendVideoToBot(chat, path, opt)
{ try{
	if(!isValidChatId(chat)) return false;//если не число, то не пускаем
	if(path=='') return false;
	const res = await bot.sendVideo(chat,path,opt);
    return res;
  }catch(err)
  { console.error(getTimeStr()+err);
    console.error('Не смог послать ролик в '+chat);
	WriteLogFile(err+'\nfrom sendVideoToBot()');
	return err;
  }
}
//====================================================================
async function sendAudioToBot(chat, path, opt)
{ try{
	if(!isValidChatId(chat)) return false;//если не число, то не пускаем
	if(path=='') return false;
	const res = await bot.sendAudio(chat,path,opt);
    return res;
  }catch(err)
  { console.error(getTimeStr()+err);
    console.error('Не смог послать audio в '+chat);
	WriteLogFile(err+'\nfrom sendAudioToBot()');
	return err;
  }
}
//====================================================================
async function sendDocumentToBot(chat, path, opt)
{ try{
	if(!isValidChatId(chat)) return false;//если не число, то не пускаем
	if(path=='') return false;
	const res = await bot.sendDocument(chat,path,opt);
    return res;
  }catch(err)
  { console.error(getTimeStr()+err);
    console.error('Не смог послать документ в '+chat);
	WriteLogFile(err+'\nfrom sendDocumentToBot()');
	return err;
  }
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
}catch(err){WriteLogFile(err+'\nfrom getButtonUrl()'); return {};}	
}
//====================================================================
async function WriteLogFile(arr, flag) 
{   if(!LOGGING) return;
	let str=moment().format('DD.MM.YY HH:mm:ss:ms')+' - '+arr+'\n';
    try{
		await fs.appendFileSync(LogFile, str);
		if(!!logBot && !flag) 
		{str='From rassilka by '+nameBot+'\n'+str;
		 await logBot.sendMessage(ServiceChat, str);
		}
	}catch(err){}
}
//====================================================================

