process.env["NTBA_FIX_350"] = 1;
const fs = require('fs');
const moment = require('moment');
const TelegramBot = require('node-telegram-bot-api');
const needle = require('needle');
const jsdom = require("jsdom"); // Подключение модуля jsdom для работы с DOM-деревом (1)
const { JSDOM } = jsdom; // Подключение модуля jsdom для работы с DOM-деревом (2)
const beautify = require('js-beautify').html;
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
//const wwwDir=currentDir+"/../www";//путь к папке www, на уровень выше

const token = require(TokenDir+"/news_bot.json").token;
const bot = new TelegramBot(token, {polling: false});

var ServiceChat = require(TokenDir+"/chatId.json").Supervisor;//пользователь 'Supervisor'

const zagol='🔷*ЕЖЕДНЕВНИК*🔷\n';
let masDay=['','Понедельник','Вторник','Среда','Четверг','Пятница','Суббота','Воскресенье'];
let spisok = [], ListGroups = {};

//проверим наличие папки www, если папки нет, то создадим ее
//if(!fs.existsSync(wwwDir)) {fs.mkdirSync(wwwDir);}

//проверим наличие папки Rassilka, если папки нет, то создадим ее
if(!fs.existsSync(RassilkaDir)) {fs.mkdirSync(RassilkaDir);}

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
	   message += '["Духовные принципы на каждый день"](https://t.me/+a8HO46bHu8MwZjZk)\n\n'.replace(/_/g, '\\_');//экранируем нижнее подчеркивание
    
       //запишем готовый текст в файл
       fs.writeFile(FileEg, message, (err) => {if(err) {console.log(err);}});
	   fs.writeFile(FileEgRassilka, message, (err) => {if(err) {console.log(err);}});
     
       console.log(moment().format('DD-MM-YY HH:mm:ss:ms')+' - Парсер Ежик - OK!');
	   resolve ('OK');
     }
     else {console.log('Страница Ежика не распарсилась!'); reject('NO');}  
     
    }
    else {console.log(err); reject('NO');}
  });
  });//конец промиса
  return await promise;
  
  } catch(err) {console.log('Ошибка в parser_eg()\n'+err.message);}
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
					message += '["Духовные принципы на каждый день"](https://t.me/+a8HO46bHu8MwZjZk)\n\n';
					
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
  var URL = 'https://na-ufa.ru/sobrania-anonimnih-narkomanov/';
  
  try
  {
  let promise = new Promise((resolve, reject) => {
  needle.get(URL, async function(err, response) 
  {
    if(response.statusCode==200)
    {
     var week = new Object();//недельный объект
     fs.writeFileSync(currentDir+'/page_closed.html', beautify(response.body, { indent_size: 2 }));// Запись полученного результата
     
	 /*const dom = new JSDOM(response.body);
	 for(let i=1;i<8;i++) week[masDay[i]] = {};
	 //для Уфы
	 for(let i=1;i<8;i++)
	 {
		week[masDay[i]]['УФА'] = {};
		week[masDay[i]]['УФА'] = ConvertToJsonClosed(dom.window.document.getElementById('tablepress-'+i).getElementsByTagName("tbody")[0]);
	 }
	 //console.log(JSON.stringify(week[masDay[3]]['УФА'],null,2));
	 //для Белебея, только вторник и пятница одно и то же
	 week[masDay[2]]['БЕЛЕБЕЙ'] = {};
	 week[masDay[2]]['БЕЛЕБЕЙ'] = ConvertToJsonClosed(dom.window.document.getElementById('tablepress-8').getElementsByTagName("tbody")[0]);
	 week[masDay[5]]['БЕЛЕБЕЙ'] = {};
	 week[masDay[5]]['БЕЛЕБЕЙ'] = week[masDay[2]]['БЕЛЕБЕЙ'];
	 //для Благовещенска, понедельник и пятница
	 week[masDay[1]]['БЛАГОВЕЩЕНСК'] = {};
	 week[masDay[1]]['БЛАГОВЕЩЕНСК'] = ConvertToJsonClosed(dom.window.document.getElementById('tablepress-10').getElementsByTagName("tbody")[0]);
	 week[masDay[5]]['БЛАГОВЕЩЕНСК'] = {};
	 week[masDay[5]]['БЛАГОВЕЩЕНСК'] = ConvertToJsonClosed(dom.window.document.getElementById('tablepress-11').getElementsByTagName("tbody")[0]);

	 //недельный файл расписаний создан
     //запишем готовый текст в файл
	 let err = fs.writeFileSync(FileWeek, JSON.stringify(week,null,2));
     if(err) {bot.sendMessage(ServiceChat,err); console.log(err);}
	 spisok.sort();
	 fs.writeFileSync(currentDir+'/spisok.json', "\ufeff" + JSON.stringify(spisok,null,2));
	 
	 ListGroups = rebuild_Obj(week);//перестроим объект по группам
	 fs.writeFileSync(currentDir+'/groups.json', "\ufeff" + JSON.stringify(ListGroups,null,4));
	 
	 console.log(moment().format('DD-MM-YY HH:mm:ss:ms')+' - Парсер Закрытых собраний - OK!');
             
     //запишем текст текущего дня в файл
     await save_today_file(week);
	 //await raspis_from_file(FileWeek);*/
	 resolve ('OK');
    }
    else
    {bot.sendMessage(ServiceChat,response.data);
     console.log(err);
	 reject('NO');
    }
  });
  });//конец промиса
  return await promise;
  
  } catch(err) {console.log('Ошибка в parser_raspis_closed()\n'+err.message);}
}
//====================================================================
//парсер расписания открытых собраний
async function parser_raspis_opened()
{
  var URL = 'https://na-ufa.ru/sobraniya-an-dlya-vseh/';
  
  try
  {
  let promise = new Promise((resolve, reject) => {
  needle.get(URL, async function(err, response) 
  {
    if(response.statusCode==200)
    {
     let gropen = new Object();//недельный объект
     fs.writeFileSync(currentDir+'/page_opened.html', beautify(response.body, { indent_size: 2 }));// Запись полученного результата
	 
	 /*const dom = new JSDOM(response.body);
	 gropen = ConvertToJsonOpened(dom.window.document.getElementById('tablepress-41').getElementsByTagName("tbody")[0]);

	 console.log(moment().format('DD-MM-YY HH:mm:ss:ms')+' - Парсер Открытых собраний - OK!');*/
	 resolve ('OK');
    }
    else
    {bot.sendMessage(ServiceChat,response.data);
     console.log(err);
	 reject('NO');
    }
  });
  });//конец промиса
  return await promise;
  
  } catch(err) {console.log('Ошибка в parser_raspis_opened()\n'+err.message);}
}
//====================================================================
async function save_today_file(mas_week)
{	//запишем текст текущего дня в файл
	//по текущему дню недели получим расписание из массива
	var dayWeek = new Date().getDay();
	if(dayWeek==0) dayWeek=7;//приведем к формату 1..7
	let str = '🔷<strong>Расписание собраний</strong>🔷\n\n';//заголовок
	str += '<strong>'+masDay[dayWeek]+'</strong>\n\n';//день недели в заголовке
	let city = Object.keys(mas_week[masDay[dayWeek]]);//массив городов в этот день
	
	for(let i=0;i<city.length;i++)//по городам
	{
		let gr = Object.keys(mas_week[masDay[dayWeek]][city[i]]);//массив групп в этот день в этом городе
		if(gr.length > 0)//если есть собрания в этот день
		{	//сортируем группы по времени
			gr.sort((a, b) => 
			{	let timea, timeb;
				timea = moment(mas_week[masDay[dayWeek]][city[i]][a].time, 'HH:mm');
				timeb = moment(mas_week[masDay[dayWeek]][city[i]][b].time, 'HH:mm');
				if(timea < timeb) return -1;
				else if(timea > timeb) return 1;
				else return 0;
			});
			//соберем строку для телеги
			str += '<strong>'+city[i]+'</strong>\n\n';//город
			for(var j=0; j<gr.length; j++)
			{ 	let url;
				//сделаем гиперссылку из названия группы
				let name = mas_week[masDay[dayWeek]][city[i]][gr[j]].name;
				if(mas_week[masDay[dayWeek]][city[i]][gr[j]].url) 
					url = '<a  href="'+mas_week[masDay[dayWeek]][city[i]][gr[j]].url+'" >'+name+'</a>';
				else url = '«'+name+'»';//если url нет, то просто имя группы
				//время
				let time = mas_week[masDay[dayWeek]][city[i]][gr[j]].time;
				//адрес
				let adres = mas_week[masDay[dayWeek]][city[i]][gr[j]].adres+';';
				//сделаем тему собрания, если есть
				let tema = '';
				if(mas_week[masDay[dayWeek]][city[i]][gr[j]].tema) 
					tema += '\nТема: <i>'+mas_week[masDay[dayWeek]][city[i]][gr[j]].tema+'</i>';
				//сделаем гиперссылку из адреса группы, если есть ссылка на карту
				let karta = '';
				if(mas_week[masDay[dayWeek]][city[i]][gr[j]].karta) 
					//adres += '<a  href="'+mas_week[masDay[dayWeek]][city[i]][gr[j]].url2gis+'" > (Карта)</a>';
					karta += '\n'+mas_week[masDay[dayWeek]][city[i]][gr[j]].karta+'';
				//соберем результат
				str += '<strong>'+time+'</strong> - '+url+' - '+adres+tema+karta+'\n\n'; 
			}
		}
		else str += 'К сожалению, сегодня собраний нет... 😩';
	}
	//добавляем объявление
	str += 'Расписание собраний города <a  href="https://na-volga.ru/sobraniya-anonimnie-narkomani/an-v-sterlitamake/" >Стерлитамак</a>, время и место их проведения Вы можете уточнить позвонив по номеру \n<strong>+79173702268</strong> или <strong>+79610402244</strong>\n';
	str += 'Расписание собраний города <a  href="https://na-volga.ru/an-v-neftekamske/" >Нефтекамск</a>, время и место их проведения Вы можете уточнить позвонив по номеру \n<strong>+79656540044</strong>\n';
	str += 'Расписание собраний городов <a  href="https://na-sea.ru/raspisanie-grupp/tujmazy.html" >Туймазы</a> и <a  href="https://na-sea.ru/raspisanie-grupp/oktyabrskij.html" >Октябрьский</a>, время и место их проведения Вы можете уточнить позвонив по номеру \n<strong>+79003225686</strong>\n';
	   
	//запишем файл текущего дня
    let obj = {}; obj.text = str; obj.mode = 'HTML';
	let err = fs.writeFileSync(FileRaspis, /*"\ufeff" +*/ JSON.stringify(obj,null,2));
	err = fs.writeFileSync(FileRaspisRassilka, /*"\ufeff" +*/ JSON.stringify(obj,null,2));
    if(err) {bot.sendMessage(ServiceChat,err); console.log(err);}
	//запишем расписание в формате html
	str = obj.text;
	str = str.replace(/\n/g,'<br />');//делаем перевод строки html
	err = fs.writeFileSync(currentDir+'/raspis.html', "\ufeff" + str);
	if(err) {bot.sendMessage(ServiceChat,err); console.log(err);}
}
//====================================================================
async function raspis_from_file(path)
{   try
    {   
        var week = new Object();
        //грузим недельный файл
        week = JSON.parse(fs.readFileSync(path));
        //запишем текст текущего дня в файл
        await save_today_file(week);
        console.log(moment().format('DD-MM-YY HH:mm:ss:ms')+' - Расписание на сегодня из недельного файла - OK!');
    }
    catch (err) {console.log('Ошибка в Расписании Из Файла '+err);}
}
//====================================================================
function ConvertToJsonClosed(table) 
{
        let obj = {};
		let num = -1;
		let mas = [];
		let cnt = 0;
		let trs = table.getElementsByTagName("tr");
		//console.log('длина trs='+trs.length);
		//for(let i in trs) console.log(trs[i].innerHTML);
 
        for (let i = 0; i < trs.length; i++) 
		{
            let k = 0;
			//четные = время, группа, адрес; нечетные = маршрут, вход/фото
			let tds = trs[i].getElementsByTagName("td");
			//сложим все строки в единый массив
			for(let k=0;k<tds.length;k++) {mas[cnt] = tds[k].innerHTML; cnt++;}
        }
		//console.log(JSON.stringify(mas,null,2));
		for (let i = 0; i < mas.length; i++)
		{	if(mas[i].indexOf(':')+1 && mas[i].indexOf('://')<0)//ищем время, оно первое идет
			{	num++;
				obj[num] = {};
				obj[num].time = mas[i]; i++;//время
				obj[num].name = mas[i]; i++;//имя группы
				obj[num].adres = mas[i]; i++;//адрес
				//сложим в список групп местности
				let name = obj[num].name;
				if(!name) name = 'unnown';
				if(spisok.indexOf(name) < 0) spisok.push(name);
				//console.log(obj[num]);
				
				//перебираем строки до карты или сл. или конца
				while(i<mas.length && mas[i].indexOf('Маршрут')<0 && mas[i].indexOf(':')<0) {i++;}
				if(i<mas.length && mas[i].indexOf('Маршрут')+1)//только если карта
				{	obj[num].karta = mas[i];
					i++;
				}
				else i--;
				//перебираем строки до фото или сл. или конца
				while(i<mas.length && mas[i].indexOf('Вход')<0 && mas[i].indexOf(':')<0) {i++;}
				if(i<mas.length && mas[i].indexOf('Вход')+1)//только если карта
				{	obj[num].photo = mas[i];
					//i++;
				}
				else i--;
			}
		}
		return obj;
}
//====================================================================
function ConvertToJsonOpened(table) 
{try{
        var obj = {};
		var num = -1;
		let trs = table.getElementsByTagName("tr");
		let mas = [];
		let cnt = 0;
		if(!ListGroups.groups) ListGroups.groups = new Object();
		if(!ListGroups.groups['ГОРОД НЕИЗВЕСТЕН']) ListGroups.groups['ГОРОД НЕИЗВЕСТЕН'] = new Object();//город		
		let groups = ListGroups.groups['ГОРОД НЕИЗВЕСТЕН'];
		
 
        for (let i = 0; i < trs.length; i++) 
		{
            let tds = trs[i].getElementsByTagName("td");
			//console.log('длина tds='+tds.length);
			//for(let i=0;i<tds.length;i++) console.log(JSON.stringify(tds[i].innerHTML,null,2));
			//сложим все строки в единый массив
			for(let k=0;k<tds.length;k++) {mas[cnt] = tds[k].innerHTML; cnt++;}
        }
		//console.log(JSON.stringify(mas,null,2));
		for (let i = 0; i < mas.length; i++)
		{	if(mas[i].indexOf(':')+1 && mas[i].indexOf('://')<0)//ищем время, оно первое идет
			{	num++;
				obj[num] = {};
				obj[num].time = mas[i]; i++;//время
				obj[num].adres = mas[i]; i++;//адрес
				//следующий - строка с днем недели и названием группы
				let str = mas[i];
				obj[num].day = str.slice(0,str.indexOf('<')).trim();//день недели
				obj[num].name = str.slice(str.indexOf('“')+1,str.indexOf('”'));
				i++;
				//следующий - карта
				if(mas[i].indexOf('Маршрут')+1) {obj[num].karta = mas[i]; i++;}
				//следующий - фото
				if(mas[i].indexOf('Вход')+1) {obj[num].photo = mas[i]; i++;}
				//остальное пропускаем
				i--;
			}
		}
		//console.log(JSON.stringify(obj,null,2));
		
			//дополним объект групп форматом Открытых собраний
			for(num=0;num<Object.keys(obj).length;num++)
			{	let den = obj[num].day;
				let name=obj[num].name;//имя группы
				let time=obj[num].time;
				let add_url = '';
				let format = 'Открытое';
				let mode = 'Ёжик';
				if(!!obj[num].karta) 
				{	add_url = obj[num].karta;
					//вырежем url до чистой ссылки
					add_url = add_url.slice(add_url.indexOf('href=\"')+6, add_url.indexOf('\">')).trim();
				}
				//все что в скобках - дополнительный адрес
				let address = '';
				if(!!obj[num].adres) address = obj[num].adres.trim();
				let address_add = ' ';
				if(address.indexOf('(')+1) 
				{	let tt = address;
					address = address.slice(0, address.indexOf('(')).trim();//отсекаем все что в скобках
					address_add = tmp.slice(tt.indexOf('(')+1, tt.indexOf(')')).trim();//оставим все что в скобках
				}
				//фото
				let photo = '';
				if(!!obj[num].photo) photo = obj[num].photo.trim();
				
				if(!groups[name]) groups[name] = new Object();//имя группы
				//if(!groups[name].town) groups[name].town = 'Неизвестен';//город
				if(!groups[name][format]) groups[name][format] = new Object();//формат собрания
				if(!groups[name][format][den]) groups[name][format][den] = new Object();//день недели
				if(!groups[name][format][den][time]) groups[name][format][den][time] = new Object();//время
				if(!!address) groups[name][format][den][time].address = address;
				if(!!address_add) groups[name][format][den][time].address_add = address_add;
				if(!!add_url) groups[name][format][den][time].add_url = add_url;
				if(!!photo) groups[name][format][den][time].photo = photo;
				if(!!mode) groups[name][format][den][time].mode = mode;
			}
		//запишем дополненный файл
		//groups = Object.fromEntries(Object.entries(groups).sort());//сортировка объекта по ключам
		fs.writeFileSync(currentDir+'/groups.json', "\ufeff" + JSON.stringify(ListGroups,null,4), 'utf8');
		
		return obj;
}catch(err){console.log('Ошибка в ConvertToJsonOpened(table): '+err);}
}
//====================================================================
//перестройка объекта по группам
function rebuild_Obj(obj)
{try{	
	//https://yandex.ru/support/business-priority/branches/basic.html#basic__parameters-description
	let tmp = new Object();
	//заголовок
	tmp.region = 'Анонимные Наркоманы г.Уфа';
	tmp.shortname = 'АН г.Уфа';
	tmp.phone = '+7 917 38-38-380';
	tmp.site = 'https://na-ufa.ru/';
	tmp.rubric_id = '184106274';//рубрика деятельности компании по Якартам
	tmp.email = 'ufa@na-ufa.ru';
	let groups = {};
	let days=Object.keys(obj);//массив имен дней недели
	for(let day=0;day<days.length;day++)
	{	let towns=Object.keys(obj[days[day]]);//массив имен городов в этот день
		for(let town=0;town<towns.length;town++)//по списку городов
		{	let nums=Object.keys(obj[days[day]][towns[town]])
			//соберем Закрытые собрания
			for(let num=0;num<nums.length;num++)
			{	let den = days[day];
				let name=obj[den][towns[town]][nums[num]].name;//имя группы
				let time=obj[den][towns[town]][nums[num]].time;
				let add_url = '';
				let format = 'Закрытое';
				let mode = 'Ёжик';
				if(!!obj[den][towns[town]][nums[num]].karta) 
				{	add_url = obj[den][towns[town]][nums[num]].karta;
					//вырежем url до чистой ссылки
					add_url = add_url.slice(add_url.indexOf('href=\"')+6, add_url.indexOf('\">')).trim();
				}
				//все что в скобках - дополнительный адрес
				let address = '';
				if(!!obj[den][towns[town]][nums[num]].adres) address = obj[den][towns[town]][nums[num]].adres.trim();
				let address_add = ' ';
				if(address.indexOf('(')+1) 
				{	let tt = address;
					address = address.slice(0, address.indexOf('(')).trim();//отсекаем все что в скобках
					address_add = tmp.slice(tt.indexOf('(')+1, tt.indexOf(')')).trim();//оставим все что в скобках
				}
				let photo = '';
				if(!!obj[den][towns[town]][nums[num]].photo)
				{	photo = obj[den][towns[town]][nums[num]].photo;
				}
				
				if(!groups[towns[town]]) groups[towns[town]] = new Object();//город
				if(!groups[towns[town]][name]) groups[towns[town]][name] = new Object();//имя группы
				if(!groups[towns[town]][name][format]) groups[towns[town]][name][format] = new Object();//формат собрания
				if(!groups[towns[town]][name][format][den]) groups[towns[town]][name][format][den] = new Object();//день недели
				if(!groups[towns[town]][name][format][den][time]) groups[towns[town]][name][format][den][time] = new Object();//время
				if(!!address) groups[towns[town]][name][format][den][time].address = address;
				if(!!address_add) groups[towns[town]][name][format][den][time].address_add = address_add;
				if(!!add_url) groups[towns[town]][name][format][den][time].add_url = add_url;
				if(!!photo) groups[towns[town]][name][format][den][time].photo = photo;
				if(!!mode) groups[towns[town]][name][format][den][time].mode = mode;
			}
			
			//соберем Рабочие собрания
			for(let num=0;num<nums.length;num++)
			{	let den = days[day];
				let name=obj[den][towns[town]][nums[num]].name;//имя группы
				let time=obj[den][towns[town]][nums[num]].time;
				let add_url = '';
				let format = 'Рабочее';
				let mode = ' ';
				if(!!obj[den][towns[town]][nums[num]].karta) 
				{	add_url = obj[den][towns[town]][nums[num]].karta;
					//вырежем url до чистой ссылки
					add_url = add_url.slice(add_url.indexOf('href=\"')+6, add_url.indexOf('\">')).trim();
				}
				//все что в скобках - дополнительный адрес
				let address = '';
				if(!!obj[den][towns[town]][nums[num]].adres) address = obj[den][towns[town]][nums[num]].adres.trim();
				let address_add = ' ';
				if(address.indexOf('(')+1) 
				{	let tt = address;
					address = address.slice(0, address.indexOf('(')).trim();//отсекаем все что в скобках
					address_add = tmp.slice(tt.indexOf('(')+1, tt.indexOf(')')).trim();//оставим все что в скобках
				}
				
				den = 'День неизвестен';
				time='Время неизвестно';
				if(!groups[towns[town]]) groups[towns[town]] = new Object();//город
				if(!groups[towns[town]][name]) groups[towns[town]][name] = new Object();//имя группы
				if(!groups[towns[town]][name][format]) groups[towns[town]][name][format] = new Object();//формат собрания
				if(!groups[towns[town]][name][format][den]) groups[towns[town]][name][format][den] = new Object();//день недели
				if(!groups[towns[town]][name][format][den][time]) groups[towns[town]][name][format][den][time] = new Object();//время
				if(!!address) groups[towns[town]][name][format][den][time].address = address;
				if(!!address_add) groups[towns[town]][name][format][den][time].address_add = address_add;
				if(!!add_url) groups[towns[town]][name][format][den][time].add_url = add_url;
				if(!!mode) groups[towns[town]][name][format][den][time].mode = mode;
			}
			groups[towns[town]] = Object.fromEntries(Object.entries(groups[towns[town]]).sort());//сортировка объекта по ключам
		}
		
	}
	//groups = Object.fromEntries(Object.entries(groups).sort());//сортировка объекта по ключам
	tmp.groups = groups;
	
	return tmp;
}catch(err){console.log('Ошибка в rebuild_Obj(obj): '+err);}
}
//====================================================================
// Собираем список Админов всех ботов, и кладем в файл
async function getAdminList()
{try{
	let str = '<strong>Список Админов всех ботов</strong>\n\n';
	let obj = '';
	//читаем файлы бота ArchBot
	obj = '';
	str += '@na_ufa_arch_bot\n';
	try {obj = JSON.parse(fs.readFileSync(currentDir+"/../ArchBot/AdminBot.txt"));}catch(err){console.log('Ошибка в getAdminList(): '+err);}
	if(!obj) str += 'пусто\n\n';
	else
	{ 	let keys = Object.keys(obj);
		for(let i in keys) str += obj[keys[i]]+'\n';
		str += '\n';
	}
	//читаем файлы бота ArchGroupsBot
	obj = '';
	str += '@na_ufa_arch_groups_bot\n';
	try {obj = JSON.parse(fs.readFileSync(currentDir+"/../ArchGroupsBot/AdminBot.txt"));}catch(err){console.log('Ошибка в getAdminList(): '+err);}
	if(!obj) str += 'пусто\n\n';
	else
	{ 	let keys = Object.keys(obj);
		for(let i in keys) str += obj[keys[i]]+'\n';
		str += '\n';
	}
	//читаем файлы бота InfoBot
	obj = '';
	str += '@na_ufa_bot\n';
	str += '@na_ufa_info_bot\n';
	try {obj = JSON.parse(fs.readFileSync(currentDir+"/../InfoBot/AdminList.txt"));}catch(err){console.log('Ошибка в getAdminList(): '+err);}
	if(!obj) str += 'пусто\n\n';
	else
	{ 	let keys = Object.keys(obj);
		for(let i in keys) str += obj[keys[i]]+'\n';
		str += '\n';
	}
	//читаем файлы бота LoaderBot
	obj = '';
	str += '@na_ufa_loader_bot\n';
	str += '@na_ufa_info_loader_bot\n';
	try {obj = JSON.parse(fs.readFileSync(currentDir+"/../LoaderBot/AdminBot.txt"));}catch(err){console.log('Ошибка в getAdminList(): '+err);}
	if(!obj) str += 'пусто\n\n';
	else
	{ 	let keys = Object.keys(obj);
		for(let i in keys) str += obj[keys[i]]+'\n';
		str += '\n';
	}
	//читаем файлы бота NoteBot
	obj = '';
	str += '@na_ufa_note_bot\n';
	try {obj = JSON.parse(fs.readFileSync(currentDir+"/../NoteBot/AdminList.txt"));}catch(err){console.log('Ошибка в getAdminList(): '+err);}
	if(!obj) str += 'пусто\n\n';
	else
	{ 	let keys = Object.keys(obj);
		for(let i in keys) str += obj[keys[i]]+'\n';
		str += '\n';
	}
	//читаем файлы бота XlsBot
	obj = '';
	str += '@na_ufa_xls_bot\n';
	try {obj = JSON.parse(fs.readFileSync(currentDir+"/../XlsBot/AdminList.txt"));}catch(err){console.log('Ошибка в getAdminList(): '+err);}
	if(!obj) str += 'пусто\n\n';
	else
	{ 	let keys = Object.keys(obj);
		for(let i in keys) str += obj[keys[i]]+'\n';
		str += '\n';
	}
	
	//записываем список в файл
	//str = str.replace(/_/g, '\_');//экранируем нижнее подчеркивание
	obj = {};
	obj.text = str;
	obj.mode = 'HTML';
	let err = fs.writeFileSync(currentDir+"/AdminsList.txt", JSON.stringify(/*"\ufeff" +*/ obj,null,2));
    if(err) {bot.sendMessage(ServiceChat,err); console.log(err);}
}catch(err){console.log('Ошибка в getAdminList(): '+err);}
}
//====================================================================
//запускаем функции
(async () => 
{
  console.log();//пустая строка-разделитель
  await parser_eg();
  await parser_raspis_closed();//парсим в недельный файл, и из него на сегодня
  await parser_raspis_opened();
  //await raspis_from_file(FileWeek);
  await getAdminList();
})();
//====================================================================

