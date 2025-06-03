process.env["NTBA_FIX_350"] = 1;
const fs = require('fs');
const moment = require('moment');
const TelegramBot = require('node-telegram-bot-api');
const needle = require('needle');
const jsdom = require("jsdom"); // Подключение модуля jsdom для работы с DOM-деревом (1)
const { JSDOM } = jsdom; // Подключение модуля jsdom для работы с DOM-деревом (2)
const {htmlToText} = require('html-to-text');//преобразователь html в текст

const currentDir = (process.env.CURRENT_DIR) ? process.env.CURRENT_DIR : __dirname;
const RassilkaDir = currentDir+"/../Rassilka";
const FileEgRassilka = RassilkaDir+'/eg.txt';//файл с ежиком
const FileRaspisRassilka = RassilkaDir+'/raspis.txt';//файл с расписанием на день
const FileEg = currentDir+'/eg.txt';//файл с ежиком
const FileRaspis = currentDir+'/raspis.txt';//файл с расписанием на день
const FileWeek = currentDir+'/week.txt';//файл с расписанием на неделю с сайта
const FileManual = currentDir+'/manual.txt';//файл с расписанием на неделю с сайта
//const FileIl = currentDir+'/il.txt';//файл ИЛ
const TokenDir=currentDir+"/../Token";//путь к папке с токенами, на уровень выше

const token = require(TokenDir+"/news_bot.json").token;//бот @na_kzn_news_bot
const bot = new TelegramBot(token, {polling: false});
//var chat_newsnakazan = require(TokenDir+"/chatId.json").chat_newsnakazan;//канал

//var ServiceChat = require(TokenDir+"/chatId.json").Supervisor;//пользователь 'Supervisor'

//проверим наличие папки Rassilka, если папки нет, то создадим ее
if(!fs.existsSync(RassilkaDir)) {fs.mkdirSync(RassilkaDir);}

const zagol='🔷*ЕЖЕДНЕВНИК*🔷\n';
let masDay=['','Понедельник','Вторник','Среда','Четверг','Пятница','Суббота','Воскресенье'];
let ListGroups = {};

//====================================================================
//парсер ежика
/*async function parser_eg()
{ var URL = 'https://na-russia.org/eg';
  try
  {
  let promise = new Promise((resolve, reject) => {
  needle.get(URL, async function(err, response) 
  { if(response.statusCode==200)
    {
     var mas=[];
     var currentPage = response.body; // Запись полученного результата
     //console.log(currentPage);
     const dom = new JSDOM(currentPage);
     var elements = dom.window.document.getElementsByTagName('tbody');
     var len1 = elements.length;
     //console.log('len1='+len1);
     
     if(len1>0)//берем только 0-й tbody, там других не должно быть
     { 
       var td = elements[0].getElementsByTagName('td');
       var len2 = td.length;
       //console.log(len2);
       if(len2>0)
       { for(var i=0;i<len2;i++)
         { var ss='';
           ss += td[i].innerHTML;
           if(ss!='')
           { ss = ss.replace(/<hr>/g, '');
             ss = ss.replace(/<\/hr>/g, '');
             ss = ss.replace(/<br>/g, '');
             ss = ss.replace(/<\/br>/g, '');
             ss = ss.replace(/<strong>/g, '*');//mark для телеги
             ss = ss.replace(/<\/strong>/g, '*');//mark для телеги
             mas[i] = ss;
           }
         }
       }
     
       //собираем текст ежика для Телеги
       let message='';//текст в телегу
       message += '🔷*ЕЖЕДНЕВНИК*🔷\n';//zagol;
       message += 'http://na-russia.org/\n\n';
       //расположение в массиве:
       //0 - дата, 1 - тема, 2 - аннотация, 3 - страница БТ, 4 - текст, 5 - ТС
       mas[0] = mas[0].replace(/_/g, '\\_');//экранируем нижнее подчеркивание
       message += mas[0] + '\r\n\r\n';//дата
       mas[1] = mas[1].replace(/_/g, '\\_');//экранируем нижнее подчеркивание
       message += '*' + mas[1] + '*' + '\r\n\r\n';//тема
       mas[2] = mas[2].replace(/_/g, '\\_');//экранируем нижнее подчеркивание
       message += '_' + mas[2] + '_' + '\r\n';//аннотация курсивом
       mas[3] = mas[3].replace(/_/g, '\\_');//экранируем нижнее подчеркивание
       message += '_' + mas[3] + '_' + '\r\n\r\n';//страница БТ курсивом
       mas[4] = mas[4].replace(/_/g, '\\_');//экранируем нижнее подчеркивание
       message += mas[4] + '\r\n\r\n';//сам текст
       mas[5] = mas[5].replace(/_/g, '\\_');//экранируем нижнее подчеркивание
       message += mas[5] + '\r\n\r\n';//ТС
	   
	   //в конце добавляем ссылки на аудио треки в markdown
	   message += '[Аудио версия "Только сегодня"](https://t.me/BookForNA)\n\n'.replace(/_/g, '\\_');//экранируем нижнее подчеркивание
    
       //запишем готовый текст в файл utf8
       fs.writeFileSync(FileEg, "\ufeff" + message);
	   fs.writeFileSync(FileEgRassilka, "\ufeff" + message);
     
       console.log(moment().format('DD-MM-YY HH:mm:ss:ms')+' - Парсер Ежик - OK!');
	   resolve ('OK');
     }
	else {console.log('Страница Ежика не распарсилась!'); reject('NO');}  
     
    }
    else 
	{console.log(err); reject('NO');
	}
  });
  });//конец промиса
  return await promise;
  
  } catch(err) {console.log('Ошибка в parser_eg()\n'+err.message);}//
}*/
//====================================================================
//парсер ежика, на выходе текст в markdown
async function parser_eg()
{ //var URL = 'https://na-russia.org/eg';
	var URL = 'https://na-russia.org/api/daily-meditation/?format=json';
	let mas = ['','Января','Февраля','Марта','Апреля','Мая','Июня','Июля','Августа','Сентября','Октября','Ноября','Декабря'];
	try
	{
		let promise = new Promise((resolve, reject) => 
		{
			needle.get(URL, async function(err, response) 
			{ 	if(response.statusCode==200)
				{
					let EgObj = response.body[0]; // Получаем json
					fs.writeFileSync(currentDir+'/page_eg.txt', JSON.stringify(EgObj,null,2));// Запись полученного результата
					//собираем текст ежика для Телеги
					let message='';//текст в телегу
					message += '🔷*ЕЖЕДНЕВНИК*🔷\n';//zagol;
					message += 'http://na-russia.org/\n\n';
					message += EgObj.day + ' ' + mas[EgObj.month] + '\n\n';//дата
					
					message += '*' + replaceHtml(EgObj.title) + '*' + '\n\n';//тема жирно
					
					message += '_' + replaceHtml(EgObj.quote) + '_' + '\n';//аннотация курсивом
					message += '_' + EgObj.quote_from + '_' + '\n\n';//страница БТ курсивом
					
					message += replaceHtml(EgObj.body) + '\n\n';//сам текст
					
					message += '*ТОЛЬКО СЕГОДНЯ:* ' + replaceHtml(EgObj.jft) + '\n\n';
					//в конце добавляем ссылки на аудио треки в markdown
					message += '[Аудио версия "Только сегодня"](https://t.me/BookForNA)\n\n';
					
					//запишем готовый текст в файл utf8
					//fs.writeFileSync(FileEg, "\ufeff" + message);
					//fs.writeFileSync(FileEgRassilka, "\ufeff" + message);
					fs.writeFileSync(FileEg, message);
					fs.writeFileSync(FileEgRassilka, message);
     
					console.log(moment().format('DD-MM-YY HH:mm:ss:ms')+' - Парсер Ежик - OK!');
					resolve ('OK');
					
					function replaceHtml(str)
					{	/*str = str.replace(/&laquo;/g, '«');
						str = str.replace(/&raquo;/g, '»');
						str = str.replace(/&mdash;/g, '—');
						str = str.replace(/&hellip;/g, '…');
						str = str.replace(/<br>/g, '\n  ');
						str = str.replace(/<\/br>/g, '\n  ');*/
						const options = {wordwrap: false};
						str = htmlToText(str, options);
						str = str.replace(/_/g, '\\_');//экранируем нижнее подчеркивание
						return str;
					}
				}
				else {console.log('Страница Ежика не распарсилась!'); reject('NO');} 
			});
  
		});//конец промиса
		return await promise;
	} catch(err) {console.log('Ошибка в parser_eg()\n'+err.message);}//
}
//====================================================================
//парсер расписания закрытых собраний
async function parser_raspis_closed()
{
  var URL = 'https://na-kzn.ru/';
  
  try
  {
  let promise = new Promise((resolve, reject) => {
  needle.get(URL, async function(err, response) 
  {
    if(response.statusCode==200)
    {
     let spisok = [];
	 //https://yandex.ru/support/business-priority/branches/basic.html#basic__parameters-description
	 //заголовок
	 ListGroups.region = 'Анонимные Наркоманы г.Казань';
	 ListGroups.shortname = 'АН г.Казань';
	 ListGroups.phone = '+7 (843) 239-26-62';
	 ListGroups.site = 'https://na-kzn.ru/';
	 ListGroups.rubric_id = '184106274';//рубрика деятельности компании по Якартам
	 ListGroups.email = 'na@na-kzn.ru';
	 if(!ListGroups.groups) ListGroups.groups = new Object();
	 let groups = {};
	 
	 var week = new Object();
     var currentPage = response.body; 
     fs.writeFileSync(currentDir+'/page_closed.txt', currentPage);// Запись полученного результата
     const dom = new JSDOM(currentPage);
     var tables = dom.window.document.getElementsByClassName('dayof');//выдергиваем массив по дням недели
     //fs.writeFileSync(currentDir+'/page2.txt', tables[0].innerHTML);
     var len1 = tables.length;//кол-во таблиц = дней недели
     //console.log('len1='+len1);
     if(len1>0)
     { //пройдемся по дням недели
       for(var j=0; j<len1; j++)
       {  var mas = tables[j].getElementsByClassName('rasp__title');//день недели
          var day = mas[0].innerHTML.replace(/^\s+|\s+$/g, '');//уберем все пробелы
          week[day] = new Object();//создаем запись дня недели
          mas = tables[j].getElementsByClassName('day1');//соберем массив из время,группа,адрес в этот день
          if(mas.length>0)
          {   for(var i=1; i<mas.length; i++)//пройдемся по массиву всех групп без заголовка
              {  let time, adres, name, url;
                 //время
                 let tmp = mas[i].getElementsByClassName('time');
                 time = tmp[0].innerHTML.replace(/^\s+|\s+$/g, '');
                 //адрес
                 tmp = mas[i].getElementsByClassName('place');
                 adres = tmp[0].innerHTML.replace(/^\s+|\s+$/g, '').replace(/\n/g, ' ');//s символы в начале, конце строки. и переводы строки всередине
                 adres = adres.replace(/(?=( ))\1{2,}/g, ' ');//удаляем пробелы, которые встречаются 2 и более раз
                 adres = adres.replace('target="_blank"', '');
                 adres = adres.replace('<span>', '');
                 adres = adres.replace('</span>', '');
				 adres = adres.replace(/<br \/>/g, ' ');
				 adres = adres.replace(/<br\/>/g, ' ');
				 adres = adres.replace(/<br>/g, ' ');
				 adres = adres.trim();//убираем пробелы по краям
                 //имя группы и url, отрезаем все ненужное
                 tmp = mas[i].innerHTML;
                 var index = tmp.indexOf('<a target="_blank"');//сверху
                 tmp = tmp.slice(index-1);
                 index = tmp.indexOf('<div class="place">');//снизу
                 tmp = tmp.slice(1, index);
                 tmp = tmp.replace(/(?=( ))\1{2,}/g, '');//удаляем пробелы, которые встречаются 2 и более раз
                 tmp = tmp.replace('target="_blank"', '');
                 tmp = tmp.replace('class="gr"', '');
                 tmp = tmp.replace('class="gr1"', '');
                 //переделаем полный URL в именах
                 //вытащим href из имени
                 index = tmp.indexOf('href="')+7;//отрежем все сверху
                 let ref = tmp.slice(index-1);
                 index = ref.indexOf('"');//отрежем все снизу
                 ref = ref.slice(0, index);
                 url = ref;//это еще не полный url
                 //если это не zoom, то меняем
                 if(ref.indexOf('https:')<0) {tmp = tmp.replace(ref,URL+ref); url=URL+url;}//заменим ref на полный URL
                 //удаляем пробелы в начале и в конце строки, также переводы строки
                 tmp = tmp.replace(/^\s+|\s+$/g, '').replace(/\n/g, '');
                 //теперь вытащим чисто имя группы
                 index = tmp.indexOf('>');//отрежем все сверху
                 tmp = tmp.slice(index+1);
                 index = tmp.indexOf('<');//отрежем все снизу
                 tmp = tmp.slice(0, index);
                 name = tmp;
				 name = name.trim();//убираем пробелы в имени по краям
                 
                 //создаем запись группы
                 week[day][name] = new Object();
                 week[day][name].time = time;
                 week[day][name].adres = adres;
                 week[day][name].url = url;
				 //сложим в список групп местности
				 if(spisok.indexOf(name) < 0) spisok.push(name);
				 
				 let address = adres.trim();
				 let address_add = ' ';
				 //все что в скобках - дополнительный адрес
				 if(address.indexOf('(')+1) 
				 {	tmp = address;
					address = address.slice(0, address.indexOf('(')).trim();//отсекаем все что в скобках
					address_add = tmp.slice(tmp.indexOf('(')+1, tmp.indexOf(')')).trim();//оставим все что в скобках
				 }				 
				 
				 //сложим в объект групп местности
				 let format = 'Закрытое';
				 let mode = 'Ёжик';
				 let add_url = url;
				 let den = day;
				 if(!groups[name]) groups[name] = new Object();//имя группы
				 if(!groups[name].town) groups[name].town = 'Казань';//город
				 if(!groups[name][format]) groups[name][format] = new Object();//формат собрания
				 if(!groups[name][format][den]) groups[name][format][den] = new Object();//день недели
				 if(!groups[name][format][den][time]) groups[name][format][den][time] = new Object();//время
				 if(!!address) groups[name][format][den][time].address = address;
				 if(!!address_add) groups[name][format][den][time].address_add = address_add;
				 if(!!add_url) groups[name][format][den][time].add_url = add_url;
				 if(!!mode) groups[name][format][den][time].mode = mode;
				 
				 //добавим рабочие собрания по-умолчанию
				 format = 'Рабочее';
				 mode = ' ';
				 den = 'День неизвестен';
				 time = 'Время неизвестно';
				 if(!groups[name]) groups[name] = new Object();//имя группы
				 if(!groups[name][format]) groups[name][format] = new Object();//формат собрания
				 if(!groups[name][format][den]) groups[name][format][den] = new Object();//день недели
				 if(!groups[name][format][den][time]) groups[name][format][den][time] = new Object();//время
				 if(!!address) groups[name][format][den][time].address = address;
				 if(!!address_add) groups[name][format][den][time].address_add = address_add;
				 if(!!add_url) groups[name][format][den][time].add_url = add_url;
				 if(!!mode) groups[name][format][den][time].mode = mode;
              }
          }
       }
       //console.log(JSON.stringify(week,null,2));
       
       //недельный файл расписаний создан
       //запишем готовый текст в файл
       fs.writeFileSync(FileWeek, "\ufeff" + JSON.stringify(week,null,2));
	   
	   spisok.sort();//сортируем список-массив
	   fs.writeFileSync(currentDir+'/spisok.json', "\ufeff" + JSON.stringify(spisok,null,2));
	   
	   groups = Object.fromEntries(Object.entries(groups).sort());//сортировка объекта по ключам
	   ListGroups.groups = groups;
	   fs.writeFileSync(currentDir+'/groups.json', "\ufeff" + JSON.stringify(ListGroups,null,4));
              
       console.log(moment().format('DD-MM-YY HH:mm:ss:ms')+' - Парсер Закрытых собраний - OK!');
             
       //запишем текст текущего дня в файл
       await save_today_file(week);
	   resolve ('OK');
     }
	else {console.log('Страница Расписания не распарсилась!'); reject('NO');}
    }
    else
    {console.log(err); reject('NO');
    }
  });
  });//конец промиса
  return await promise;
  
  } catch(err) {console.log('Ошибка в parser_parser_raspis_closed()\n'+err.message);}//
}
//====================================================================
//парсер расписания открытых собраний
async function parser_raspis_opened()
{
  var URL = 'https://na-kzn.ru/';
  let URL2 = 'https://na-kzn.ru/otkrsobr.html';
  if(!ListGroups.groups) ListGroups.groups = new Object();
  let groups = ListGroups.groups;
  
  try
  {
  let promise = new Promise((resolve, reject) => {
  needle.get(URL2, async function(err, response) 
  {
    if(response.statusCode==200)
    {
     let currentPage = response.body; 
     fs.writeFileSync(currentDir+'/page_opened.txt', currentPage);// Запись полученного результата
     const dom = new JSDOM(currentPage);
     let tables = dom.window.document.getElementsByClassName('dayof');//выдергиваем массив по дням недели
     //fs.writeFileSync(currentDir+'/page2.txt', tables[0].innerHTML);
     let len1 = tables.length;//кол-во таблиц = дней недели
     //console.log('len1='+len1);
     if(len1>0)
     { //пройдемся по дням недели
       for(let j=0; j<len1; j++)
       {  let mas = tables[j].getElementsByClassName('rasp__title');//день недели
          mas = tables[j].getElementsByClassName('day1');//соберем массив из время,ссылка на группу,день месяца
          if(mas.length>0)
          {   for(var i=1; i<mas.length; i++)//пройдемся по массиву всех групп в этот день без заголовка
              {  let time, day, name, url;
                 //время
                 let tmp = mas[i].getElementsByClassName('time');
                 time = tmp[0].innerHTML.replace(/^\s+|\s+$/g, '');
                 //день недели
                 tmp = mas[i].getElementsByClassName('place');
                 day = tmp[0].innerHTML.replace(/^\s+|\s+$/g, '').replace(/\n/g, ' ');//s символы в начале, конце строки. и переводы строки всередине
                 day = day.replace(/(?=( ))\1{2,}/g, ' ');//удаляем пробелы, которые встречаются 2 и более раз
				 day = day.trim();//убираем пробелы по краям
                 
				 //имя группы и url, отрезаем все ненужное
                 tmp = mas[i].innerHTML;
                 let index = tmp.indexOf('<a target="_blank"');
                 tmp = tmp.slice(index-1);//режем сверху
				 tmp = tmp.replace('<a target="_blank"', '');//удаляем
				 index = tmp.indexOf('</a>');//снизу
                 tmp = tmp.slice(1, index);
                 tmp = tmp.replace('class="gr">', '');//убираем лишнее
				 tmp = tmp.replace(/(?=( ))\1{2,}/g, '');//удаляем пробелы, которые встречаются 2 и более раз
				 //удаляем пробелы в начале и в конце строки, также переводы строки
                 tmp = tmp.replace(/^\s+|\s+$/g, '').replace(/\n/g, '');
				 
                 //переделаем полный URL в именах
                 //вытащим url
                 index = tmp.indexOf('href="')+7;//отрежем все слева
                 url = tmp.slice(index-1);
                 index = url.indexOf('"');//отрежем все справа
                 url = url.slice(0, index);//это еще не полный url
                 //если это не zoom, то меняем
                 if(url.indexOf('https:')<0) {tmp = tmp.replace(url,URL+url); url=URL+url;}//заменим на полный URL
                 //теперь в tmp лежит строка с href и полной ссылкой
				 //удаляем пробелы в начале и в конце строки, также переводы строки
                 tmp = tmp.replace(/^\s+|\s+$/g, '').replace(/\n/g, '');
                 //теперь вытащим чисто имя группы
                 name = tmp.replace('href="', '').replace(url+'"', '');
				 name = name.trim();//убираем пробелы в имени по краям
                 
                 let address = '??';
				 let address_add = ' ';
				 //все что в скобках - дополнительный адрес
				 if(address.indexOf('(')+1) 
				 {	tmp = address;
					address = address.slice(0, address.indexOf('(')).trim();//отсекаем все что в скобках
					address_add = tmp.slice(tmp.indexOf('(')+1, tmp.indexOf(')')).trim();//оставим все что в скобках
				 }				 
				 
				 //сложим в объект групп местности
				 let format = 'Открытое';
				 let mode = 'Ёжик';
				 let add_url = url;
				 let den = day;
				 if(!groups[name]) groups[name] = new Object();//имя группы
				 if(!groups[name][format]) groups[name][format] = new Object();//формат собрания
				 if(!groups[name][format][den]) groups[name][format][den] = new Object();//день недели
				 if(!groups[name][format][den][time]) groups[name][format][den][time] = new Object();//время
				 if(!!address) groups[name][format][den][time].address = address;
				 if(!!address_add) groups[name][format][den][time].address_add = address_add;
				 if(!!add_url) groups[name][format][den][time].add_url = add_url;
				 if(!!mode) groups[name][format][den][time].mode = mode;
              }
          }
       }
       
       groups = Object.fromEntries(Object.entries(groups).sort());//сортировка объекта по ключам
	   ListGroups.groups = groups;
	   fs.writeFileSync(currentDir+'/groups.json', "\ufeff" + JSON.stringify(ListGroups,null,4));
              
       console.log(moment().format('DD-MM-YY HH:mm:ss:ms')+' - Парсер Открытых собраний - OK!');
	   resolve ('OK');
     }
	else {console.log('Страница Открытых собраний не распарсилась!'); reject('NO');}
    }
    else
    {console.log(err); reject('NO');
    }
  });
  });//конец промиса
    return await promise;
	
  } catch(err) {console.log('Ошибка в parser_parser_raspis_opened()\n'+err.message);}//
}
//====================================================================
async function save_today_file(mas_week)
{      //запишем текст текущего дня в файл
       //по текущему дню недели получим расписание из массива
       var dayWeek = new Date().getDay();
       if(dayWeek==0) dayWeek=7;//приведем к формату 1..7
       let str = '🔷<strong>Расписание собраний</strong>🔷\n\n';//заголовок
       str += '<strong>'+masDay[dayWeek]+'</strong>\n\n';//день недели в заголовке
       let gr = Object.keys(mas_week[masDay[dayWeek]]);//массив групп в этот день
       if(gr.length > 0)//если есть собрания в этот день
	   {	//сортируем группы по времени
			gr.sort((a, b) => 
			{	let timea, timeb;
				timea = moment(mas_week[masDay[dayWeek]][a].time, 'HH:mm');
				timeb = moment(mas_week[masDay[dayWeek]][b].time, 'HH:mm');
				if(timea < timeb) return -1;
				else if(timea > timeb) return 1;
				else return 0;
			});
			for(var j=0; j<gr.length; j++)//соберем строку для телеги
			{ 	let url;
				//сделаем гиперссылку
				if(mas_week[masDay[dayWeek]][gr[j]].url) 
					url = '<a  href="'+mas_week[masDay[dayWeek]][gr[j]].url+'" >'+gr[j]+'</a>';
				else url = ''+gr[j]+'';//если url нет, то просто имя группы
				//время
				let time = mas_week[masDay[dayWeek]][gr[j]].time;
				//адрес
				let adres = mas_week[masDay[dayWeek]][gr[j]].adres;
				//соберем результат
				str += '<strong>'+time+'</strong> - '+url+' - '+adres+'\n\n'; 
			}
	   }
	   else str += 'К сожалению, сегодня собраний нет... 😩';
	   
	   //запишем файл текущего дня
       let obj = {}; obj.text = str; obj.mode = 'HTML';
	   let err = fs.writeFileSync(FileRaspis, JSON.stringify(obj,null,2));
       if(err) {console.log(err);}
	   fs.writeFileSync(FileRaspisRassilka, JSON.stringify(obj,null,2));
	   //запишем расписание в формате html
		str = obj.text;
		str = str.replace(/\n/g,'<br />');//делаем перевод строки html
		err = fs.writeFileSync(currentDir+'/raspis.html', "\ufeff" + str);
		if(err) {console.log(err);}
}
//====================================================================
async function raspis_from_file()
{   try
    {   
        var week = new Object();
        //грузим ручной файл
        week = JSON.parse(fs.readFileSync(FileManual));
        //запишем текст текущего дня в файл
        await save_today_file(week);
        console.log(moment().format('DD-MM-YY HH:mm:ss:ms')+' - Парсер Из Файла - OK!');
    }
    catch (err) {console.log('Ошибка в Расписании Из Файла '+err);}
}
//====================================================================
// Собираем список Админов всех ботов, и кладем в файл
async function getAdminList()
{try{
	//let str = '<strong>Список Админов всех ботов</strong>\n\n';
	let str = 'Список Админов всех ботов\n\n';
	let obj = '';
	
	//читаем файлы бота ArchBot
	obj = '';
	str += '@na_kzn_arch_bot\n';
	try {obj = JSON.parse(fs.readFileSync(currentDir+"/../ArchBot/AdminBot.txt"));}catch(err){console.log('Ошибка в getAdminList(): '+err);}
	if(!obj) str += 'пусто\n\n';
	else
	{ 	let keys = Object.keys(obj);
		for(let i in keys) str += obj[keys[i]]+'\n';
		str += '\n';
	}
	//читаем файлы бота ArchGroupsBot
	obj = '';
	str += '@na_kzn_arch_groups_bot\n';
	try {obj = JSON.parse(fs.readFileSync(currentDir+"/../ArchGroupsBot/AdminBot.txt"));}catch(err){console.log('Ошибка в getAdminList(): '+err);}
	if(!obj) str += 'пусто\n\n';
	else
	{ 	let keys = Object.keys(obj);
		for(let i in keys) str += obj[keys[i]]+'\n';
		str += '\n';
	}
	//читаем файлы бота InfoBot
	obj = '';
	str += '@na_kzn_bot\n';
	try {obj = JSON.parse(fs.readFileSync(currentDir+"/../InfoBot/AdminList.txt"));}catch(err){console.log('Ошибка в getAdminList(): '+err);}
	if(!obj) str += 'пусто\n\n';
	else
	{ 	let keys = Object.keys(obj);
		for(let i in keys) str += obj[keys[i]]+'\n';
		str += '\n';
	}
	//читаем файлы бота LoaderBot
	obj = '';
	str += '@na_kzn_loader_bot\n';
	try {obj = JSON.parse(fs.readFileSync(currentDir+"/../LoaderBot/AdminBot.txt"));}catch(err){console.log('Ошибка в getAdminList(): '+err);}
	if(!obj) str += 'пусто\n\n';
	else
	{ 	let keys = Object.keys(obj);
		for(let i in keys) str += obj[keys[i]]+'\n';
		str += '\n';
	}
	//читаем файлы бота NoteBot
	/*obj = '';
	str += '@na_ufa_note_bot\n';
	try {obj = JSON.parse(fs.readFileSync(currentDir+"/../NoteBot/AdminList.txt"));}catch(err){console.log('Ошибка в getAdminList(): '+err);}
	if(!obj) str += 'пусто\n\n';
	else
	{ 	let keys = Object.keys(obj);
		for(let i in keys) str += obj[keys[i]]+'\n';
		str += '\n';
	}*/
	//читаем файлы бота XlsBot
	obj = '';
	str += '@na_kzn_xls_bot\n';
	try {obj = JSON.parse(fs.readFileSync(currentDir+"/../XlsBot/AdminList.txt"));}catch(err){console.log('Ошибка в getAdminList(): '+err);}
	if(!obj) str += 'пусто\n\n';
	else
	{ 	let keys = Object.keys(obj);
		for(let i in keys) str += obj[keys[i]]+'\n';
		str += '\n';
	}
	
	//записываем список в файл
	//str = str.replace(/_/g, '\_');//экранируем нижнее подчеркивание
	/*obj = {};
	obj.text = str;
	obj.mode = 'HTML';*/
	//let err = fs.writeFileSync(currentDir+"/AdminsList.txt", JSON.stringify(/*"\ufeff" +*/ obj,null,2));
    let err = fs.writeFileSync(currentDir+"/AdminsList.txt", /*"\ufeff" +*/ str);
	if(err) {bot.sendMessage(ServiceChat,err); console.log(err);}
}catch(err){console.log('Ошибка в getAdminList(): '+err);}
}
//====================================================================
//запускаем функции
(async () => 
{
  console.log();//пустая строка-разделитель
  await parser_eg();
  await parser_raspis_closed();//закрытые собрания
  await parser_raspis_opened();//открытые собрания
  //await raspis_from_file();
  await getAdminList();
})();

