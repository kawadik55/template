process.env["NTBA_FIX_350"] = 1;
const fs = require('fs');
const moment = require('moment');
//const TelegramBot = require('node-telegram-bot-api');
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

//проверим наличие папки Rassilka, если папки нет, то создадим ее
if(!fs.existsSync(RassilkaDir)) {fs.mkdirSync(RassilkaDir);}

const zagol='🔷*ЕЖЕДНЕВНИК*🔷\n';
let masDay=['','Понедельник','Вторник','Среда','Четверг','Пятница','Суббота','Воскресенье'];

/*(async () => {   
	let time = moment('7 : 40','HH:mm').format('HH:mm');
	console.log(time);
})();*/

//====================================================================
//парсер ежика
/*function parser_eg()
{ var URL = 'https://na-russia.org/eg';
  try
  {
  needle.get(URL, async function(err, response)
  {	if(response.statusCode==200)
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
    
       //запишем готовый текст в файл
       fs.writeFile(FileEg, message, (err) => {if(err) {console.log(err);}});
	   fs.writeFile(FileEgRassilka, message, (err) => {if(err) {console.log(err);}});
     
       console.log(moment().format('DD-MM-YY HH:mm:ss:ms')+' - Парсер Ежик - OK!');
     }
     else console.log('Страница Ежика не распарсилась!');  
	}
	else {console.log(err);}
  });
  } catch(err) {console.log('error from parser_eg():/n'+err.message);}//если что, через 10 минут повторим
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
//парсер расписания групп
async function parser_raspis()
{ var URL = 'https://аннн.рф';
  
  try
  {
  needle.get(URL, async function(err, response)
  {	if(response.statusCode==200)
	{
	 let spisok = [];
	 var week = new Object();
     var currentPage = response.body; 
     //fs.writeFileSync(currentDir+'/page1.txt', currentPage);// Запись полученного результата
     const dom = new JSDOM(currentPage);
	 //собираем массив групп - относительные ссылки с названиями
	 let mas = dom.window.document.getElementsByClassName('gruppa');
	 if((mas[0].innerHTML.indexOf('Группы NA')+1) > 0) mas[0].remove();//удаляем строку заголовка
	 //делаем текстовый массив групп уже с абсолютными ссылками
	 let gruppa=[];
	 for(let n=0;n<mas.length;n++) 
	 {	gruppa[n]=[];
		gruppa[n][0]=mas[n].innerHTML.replace(/\/groups/, URL+'/groups');//полный референс с именем группы
		gruppa[n][1]=await get_adres(gruppa[n][0]);//распарсим адрес группы по ссылке
	 }
	 //теперь соберем массив день недели - время для всех групп
	 mas = dom.window.document.getElementsByClassName('str');
	 //for(let n in mas) console.log(mas[n].innerHTML);
	 if(gruppa.length != mas.length)
	 {	console.log('Не совпадают длины массивов имен групп и mas');
		//надо что-то делать
	 }
	 //делаем двумерный массив daystime, где первый индекс = номер группы, второй = время по дням недели
	 let daystime=[];
	 for(let n=0;n<mas.length;n++)//по кол-ву групп 
	 {temp = mas[n].getElementsByClassName("left");//7 дней недели
	  daystime[n]=[];
	  for(let j=0;j<temp.length;j++) daystime[n][j] = temp[j].innerHTML;
	 }
	 //соберем все в один недельный массив день=имя=время,адрес
	 for(let d=0;d<masDay.length-1;d++)//по дням недели из массива
	 {	let day = masDay[d+1];//0=понедельник, 6=воскресенье
		week[day] = [];//создаем массив объектов в этот день
		//собираем группы, время и адрес в этот день (d)
		for(n=0;n<gruppa.length;n++)//по всему списку групп
		{	if(daystime[n][d].indexOf(':')+1)//если время в этот день недели у группы есть, то пишем в объект
			{	let obj = {};
				obj.name = gruppa[n][0];//имя
				obj.time = daystime[n][d];
				obj.adres = gruppa[n][1];
				week[day].push(obj);
				//сложим в список групп местности
				let name = gruppa[n][0];
				name = name.slice(name.indexOf('>')+1, name.indexOf('</')).trim();
				if(spisok.indexOf(name) < 0) spisok.push(name);
			}
		}
	 }
	 //console.log(JSON.stringify(week,null,2));
       
     //недельный файл расписаний создан
     //запишем готовый текст в файл
     fs.writeFile(FileWeek, JSON.stringify(week,null,2), (err) => {if(err) {console.log(err);}});
	 spisok.sort();
	 fs.writeFile(currentDir+'/spisok.json', JSON.stringify(spisok,null,2), (err) => {if(err) {console.log(err);}});
	 
	 //запишем текст текущего дня в файл
     await save_today_file(week);
	 
	 console.log(moment().format('DD-MM-YY HH:mm:ss:ms')+' - Парсер Сайта - OK!');
	}
	else {console.log(err);}
  });
  } catch(err) {console.log('error from parser_raspis():/n'+err.message);}
}
//====================================================================
async function get_adres(name)
{	//вытащим url группы из имени
	let msk=name.slice(name.indexOf('<'), name.indexOf('"')+1);// от < до "
	name = name.replace(msk,'');
	let n=name.indexOf('"');
	name = name.slice(0,n);
	let URL = name;
	try{
		let promise = new Promise((resolve, reject) => {
		needle.get(URL, function(err, response)
		{	if(response.statusCode==200)
			{	var currentPage = response.body;
				const dom = new JSDOM(currentPage);
				let temp = dom.window.document.getElementsByClassName('field field-name-field-adres field-type-text field-label-above');
				temp = temp[0].getElementsByClassName('field-item even');
				let str = temp[0].innerHTML;
				str = str.replace(/<p>/g, '');//удаляем теги подчеркивания
				str = str.replace(/<\/p>/g, '');
				//console.log(temp[0].innerHTML);
				resolve (str);
			}
			else reject('');
		});
		});
		return await promise;
	}
	catch(err){console.log('error from get_adres():/n'+err.message);}
}
//====================================================================
async function save_today_file(mas_week)
{      //запишем текст текущего дня в файл
       //по текущему дню недели получим расписание из массива
       var dayWeek = new Date().getDay();
       if(dayWeek==0) dayWeek=7;//приведем к формату 1..7
       let str = '🔷<strong>Расписание собраний</strong>🔷\n\n';//заголовок
       str += '<strong>'+masDay[dayWeek]+'</strong>\n\n';//день недели в заголовке
       let gr = mas_week[masDay[dayWeek]];//массив объектов групп в этот день
	   if(gr.length > 0)//если есть собрания в этот день
	   {	//сортируем группы по времени
			gr.sort((a, b) => 
			{	let timea, timeb;
				timea = moment(a.time, 'HH:mm');
				timeb = moment(b.time, 'HH:mm');
				if(timea < timeb) return -1;
				else if(timea > timeb) return 1;
				else return 0;
			});
			for(var j=0; j<gr.length; j++)//соберем строку для телеги
			{ 	//время
				let time = gr[j].time;
				//имя
				let name = gr[j].name;
				//адрес
				let adres = gr[j].adres;
				//соберем результат
				str += '<strong>'+time+'</strong> - '+name+' - '+adres+'\n\n'; 
			}
			str += '<strong>* группа, собрание со звездочкой: смотрите на странице группы</strong>\n\n';
	   }
	   else str += 'К сожалению, сегодня собраний нет... 😩';
	   
	   
	   //запишем файл текущего дня
       let obj = {}; obj.text = str; obj.mode = 'HTML';
	   let err = fs.writeFileSync(FileRaspis, JSON.stringify(obj,null,2));
       if(err) {console.log(err.message);}
	   fs.writeFileSync(FileRaspisRassilka, JSON.stringify(obj,null,2));
	   //console.log(JSON.stringify(new1,null,2));
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
    catch (err) {console.log('Ошибка в Расписании Из Файла '+err.message);}
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
	str += '@na_ninov_arch_bot\n';
	try {obj = JSON.parse(fs.readFileSync(currentDir+"/../ArchBot/AdminBot.txt"));}catch(err){console.log('Ошибка в getAdminList(): '+err);}
	if(!obj) str += 'пусто\n\n';
	else
	{ 	let keys = Object.keys(obj);
		for(let i in keys) str += obj[keys[i]]+'\n';
		str += '\n';
	}
	//читаем файлы бота ArchGroupsBot
	/*obj = '';
	str += '@na_ufa_arch_groups_bot\n';
	try {obj = JSON.parse(fs.readFileSync(currentDir+"/../ArchGroupsBot/AdminBot.txt"));}catch(err){console.log('Ошибка в getAdminList(): '+err);}
	if(!obj) str += 'пусто\n\n';
	else
	{ 	let keys = Object.keys(obj);
		for(let i in keys) str += obj[keys[i]]+'\n';
		str += '\n';
	}*/
	//читаем файлы бота InfoBot
	obj = '';
	str += '@NA52_bot\n';
	try {obj = JSON.parse(fs.readFileSync(currentDir+"/../InfoBot/AdminList.txt"));}catch(err){console.log('Ошибка в getAdminList(): '+err);}
	if(!obj) str += 'пусто\n\n';
	else
	{ 	let keys = Object.keys(obj);
		for(let i in keys) str += obj[keys[i]]+'\n';
		str += '\n';
	}
	//читаем файлы бота LoaderBot
	obj = '';
	str += '@na52_loader_bot\n';
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
	/*obj = '';
	str += '@na_ufa_xls_bot\n';
	try {obj = JSON.parse(fs.readFileSync(currentDir+"/../XlsBot/AdminList.txt"));}catch(err){console.log('Ошибка в getAdminList(): '+err);}
	if(!obj) str += 'пусто\n\n';
	else
	{ 	let keys = Object.keys(obj);
		for(let i in keys) str += obj[keys[i]]+'\n';
		str += '\n';
	}*/
	
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
  //await parser_eg();
  await parser_raspis();
  //await raspis_from_file();
  await getAdminList();
})();

