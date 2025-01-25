process.env["NTBA_FIX_350"] = 1;
const fs = require('fs');
const moment = require('moment');
const TelegramBot = require('node-telegram-bot-api');
const currentDir = (process.env.CURRENT_DIR) ? process.env.CURRENT_DIR : __dirname;
const TokenDir=currentDir+"/../Token";//путь к папке с токенами, на уровень выше
const FileImages = 	currentDir+'/../LoaderBot/ImagesList.txt';//файл картинок
const FileText =   	currentDir+'/../LoaderBot/TextList.txt';//файл Текстов
//const FileEg = 		currentDir+'/../Parser/eg.txt';//файл с ежиком в другой папке
const FileRaspis = currentDir+'/raspis_open.txt';//файл с расписанием открытых собраний

const token = require(TokenDir+"/news_bot.json").token;//бот @na_ufa_news_bot
const bot = new TelegramBot(token, {polling: false});
var chat_Supervisor = require(TokenDir+"/chatId.json").Supervisor;//пользователь 'Supervisor'
var ServiceChat = chat_Supervisor;//чат для служебной информации
var chat_chanell=[]; 
chat_chanell[0] = '-1001505518619';//чат Октябрьский, будем посылать все, кроме расписания и ежика
//---------------------------------------------------
var ImagesList=new Object();//массив загруженных картинок на выполнение
let TextList=new Object();//массив загруженных текстов на выполнение
let masDay=['пустота','Понедельник','Вторник','Среда','Четверг','Пятница','Суббота','Воскресенье','Ежедневно'];
var flagEg=0, eg='', raspis='', flagRaspis=0, fun={}, count_text=0, count_photo=0;

//файл списка картинок
try 
{ ImagesList = JSON.parse(fs.readFileSync(FileImages));
} catch (err) {console.error(err); /*bot.sendMessage(ServiceChat,err);*/}

//файл списка текстов
try 
{ TextList = JSON.parse(fs.readFileSync(FileText));
} catch (err) {console.error(err);}

//файл с ежиком
/*try 
{ let stats=fs.statSync(FileEg);//свойства файла
  let diff=moment().diff(moment(stats.mtime),'hours');
  if(diff<23) {eg = fs.readFileSync(FileEg); flagEg=1;}//если не вчерашнее
} catch (err) {console.error(err);}*/

//файл с расписанием
try 
{ //let stats=fs.statSync(FileRaspis);//свойства файла
  //let diff=moment().diff(moment(stats.mtime),'hours');
  //if(diff<23) {raspis = fs.readFileSync(FileRaspis); flagRaspis=1;}//если не вчерашнее
  raspis = fs.readFileSync(FileRaspis);//принудительно прочитаем то, что есть
  flagRaspis=1;
} catch (err) {console.error(err);}

//====================================================================
async function send_Images()
{ try
  {	if(fun['sendImages']) {clearTimeout(fun['sendImages']); fun['sendImages'] = null;}
	let good = 0;
	let interval = 60*1000*10;//10 мин
    if(Object.keys(ImagesList).length == 0) 
	{	console.log(getTimeStr()+' - Картинок сегодня нету...');
		return;
	}
    console.log(getTimeStr()+' - Рассылка картинок:');
	//читаем список
	let now = moment().startOf('day');//текущий день
	for(let key in ImagesList)
	{	  let flag = 0;
          let date = ImagesList[key].date;//запись даты
          let day = ImagesList[key].dayOfWeek;//запись дня
          
          //если по дням из массива
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
          
          //публикуем картинки и ролики
          if(flag) 
          { let opt = {};//кнопку с ботом не будем сюда лепить
			if(Object.hasOwn(ImagesList[key], 'caption')) opt.caption = ImagesList[key].caption;
			if(Object.hasOwn(ImagesList[key], 'caption_entities')) opt.caption_entities = ImagesList[key].caption_entities;
			//основной канал новостей
            console.log(getTimeStr()+'Фото в каналы:');
            for(let i=0;i<chat_chanell.length;i++) 
			{	let res;
				if(ImagesList[key].type && ImagesList[key].type != undefined)
				{if(ImagesList[key].type == 'image') res = await sendPhotoToBot(chat_chanell[i], ImagesList[key].path, opt);
				 else if(ImagesList[key].type == 'video') res = await sendVideoToBot(chat_chanell[i], ImagesList[key].path, opt);
				 else if(ImagesList[key].type == 'audio') res = await sendAudioToBot(chat_chanell[i], ImagesList[key].path, opt);
				 else if(ImagesList[key].type == 'document') res = await sendDocumentToBot(chat_chanell[i], ImagesList[key].path, opt);
				}
				else res = await sendPhotoToBot(chat_chanell[i], ImagesList[key].path, opt);
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
					console.log(getTimeStr()+'в '+chat_chanell[i]+' = ОК');
				}
			}
          }
	}
  } catch (err) {console.error(getTimeStr()+err); bot.sendMessage(ServiceChat,err);}
}
//====================================================================
async function send_Text()
{ try
  {	
	if(fun['sendText']) {clearTimeout(fun['sendText']); fun['sendText'] = null;}
	let good = 0;
	let interval = 60*1000*10;//10 мин
	if(Object.keys(TextList).length == 0)
	{	console.log(getTimeStr()+' - Текстов сегодня нету...');
		return;
	}
	console.log(getTimeStr()+' - Рассылка текстов:');
	//читаем список
	let now = moment().startOf('day');//текущий день
	for(let key in TextList)
	{     let date = TextList[key].date;//запись даты
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
          { let opt = {};//кнопку с ботом не будем сюда лепить
            opt.entities = TextList[key].entities;
			//opt.disable_web_page_preview = true;//отключаем превью ссылок
            //основной канал новостей
            console.log(getTimeStr()+'Текст в каналы:');
            for(let i=0;i<chat_chanell.length;i++) 
			{	let res = await sendTextToBot(chat_chanell[i], TextList[key].text, opt);
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
					console.log(getTimeStr()+'в '+chat_chanell[i]+' = ОК');
				}
			}
          }
	}
  } catch (err) {console.error(getTimeStr()+err); bot.sendMessage(ServiceChat,err);}
}
//====================================================================
async function send_Eg()
{ try
  {	if(flagEg)
	{
		if(fun['sendEg']) {clearTimeout(fun['sendEg']); fun['sendEg'] = null;}
		let good = 0;
		let interval = 60*1000*10;//10 мин
		console.log(getTimeStr()+' - Рассылка Ежика в каналы:');
		for(let i=0;i<chat_chanell.length;i++) 
		{	let res = await bot.sendMessage(chat_chanell[i],eg,{parse_mode:"markdown",disable_web_page_preview: true});
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
				console.log(getTimeStr()+'в '+chat_chanell[i]+' = ОК');
			}
		}
	}
  } catch (err) {console.error(getTimeStr()+err); bot.sendMessage(ServiceChat,err);}
}
//====================================================================
async function send_Raspis()
{ try
  {	if(flagRaspis)
	{
		if(fun['sendRaspis']) {clearTimeout(fun['sendRaspis']); fun['sendRaspis'] = null;}
		let good = 0;
		let interval = 60*1000*10;//10 мин
		console.log(getTimeStr()+' - Рассылка Расписания в каналы:');
		const keyboard = getButtonUrl("HTML",true);//прилепим кнопку с ботом с отключенным превью ссылок
		
		for(let i=0;i<chat_chanell.length;i++) 
		{	let res = await sendTextToBot(chat_chanell[i],raspis,keyboard);
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
				console.log(getTimeStr()+'в '+chat_chanell[i]+' = ОК');
			}
		}
	}
  } catch (err) {console.error(getTimeStr()+err); bot.sendMessage(ServiceChat,err);}
}
//====================================================================
//особое расписание публикаций по Дате
function public_byDate(date)
{	let flag = false;
	let now = moment().startOf('day');//текущий день
	let time = moment(date,'DD.MM.YYYY');
	let days = time.diff(now, 'days')+1;
    if(days>0 && days%7==0) flag=true;
    else if(days<14)//менее 2х недель
    {	switch(days)
        {	case 10: flag=true; break;
            case 7: flag=true; break;
            case 4: flag=true; break;
            case 3: flag=true; break;
            case 2: flag=true; break;
            case 1: flag=true; break;
		}
	}
	/*if(days>0 && days%7==0) flag=true;
	else if(days<7)//менее 1 недели
    {	switch(days)
        {	//case 10: flag=true; break;
            //case 7: flag=true; break;
            case 4: flag=true; break;
            //case 3: flag=true; break;
            //case 2: flag=true; break;
            case 1: flag=true; break;
		}
	}*/
	return flag;
}
//====================================================================
//запускаем функции
(async () => 
{
  console.log(getTimeStr()+'Начинаем Рассылку в чат Октябрьского:');
  
  //ежик
  //await send_Eg();
  
  //публикуем фото
  await send_Images();
  
  //публикуем тексты
  await send_Text();
  
  //расписание
  //await send_Raspis();
  
  console.log();//пустая строка
})();
//====================================================================
function getTimeStr() {return moment().format('DD-MM-YY HH:mm:ss:ms ');}
//====================================================================
async function sendTextToBot(chat, text, opt)
{ try{
	  if(!isValidChatId(chat)) return;//если не число, то не пускаем
	  if(text=='') return;
	  const res = await bot.sendMessage(chat,text,opt);
	  return res;
  }catch(err)
  {	console.error(getTimeStr()+err);
    console.error('Не смог послать текст в '+chat);
	return err;
  }
}
//====================================================================
async function sendPhotoToBot(chat, path, opt)
{ try{
	if(!isValidChatId(chat)) return;//если не число, то не пускаем
	if(path=='') return;
	const res = await bot.sendPhoto(chat,path,opt);
    return res;
  }catch(err)
  { console.error(getTimeStr()+err);
    console.error('Не смог послать фотку в '+chat);
  }
}
//====================================================================
async function sendVideoToBot(chat, path, opt)
{ try{
	if(!isValidChatId(chat)) return;//если не число, то не пускаем
	if(path=='') return;
	const res = await bot.sendVideo(chat,path,opt);
    return res;
  }catch(err)
  { console.error(getTimeStr()+err);
    console.error('Не смог послать ролик в '+chat);
  }
}
//====================================================================
async function sendAudioToBot(chat, path, opt)
{ try{
	if(!isValidChatId(chat)) return;//если не число, то не пускаем
	if(path=='') return;
	const res = await bot.sendAudio(chat,path,opt);
    return res;
  }catch(err)
  { console.error(getTimeStr()+err);
    console.error('Не смог послать аудио в '+chat);
  }
}
//====================================================================
async function sendDocumentToBot(chat, path, opt)
{ try{
	if(!isValidChatId(chat)) return;//если не число, то не пускаем
	if(path=='') return;
	const res = await bot.sendDocument(chat,path,opt);
    return res;
  }catch(err)
  { console.error(getTimeStr()+err);
    console.error('Не смог послать документ в '+chat);
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
	let opt = 
	{ 	reply_markup: 
		{ inline_keyboard: 
			[ [{"text": "О сообществе АН Уфа", "url": "https://t.me/na_ufa_info_bot"}]
			]	 
		}
	};
	if(pars==='HTML' || pars==='markdown') opt.parse_mode = pars;
	if(preview===true) opt.disable_web_page_preview = true;
	return opt;
}
//====================================================================

