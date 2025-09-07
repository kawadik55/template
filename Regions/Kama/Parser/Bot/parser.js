process.env["NTBA_FIX_350"] = 1;
const fs = require('fs');
const moment = require('moment');
//const TelegramBot = require('node-telegram-bot-api');
//const needle = require('needle');
//const jsdom = require("jsdom"); // Подключение модуля jsdom для работы с DOM-деревом (1)
//const { JSDOM } = jsdom; // Подключение модуля jsdom для работы с DOM-деревом (2)
//const {htmlToText} = require('html-to-text');//преобразователь html в текст

const currentDir = (process.env.CURRENT_DIR) ? process.env.CURRENT_DIR : __dirname;
const RassilkaDir = currentDir+"/../Rassilka";
const FileEgRassilka = RassilkaDir+'/eg.txt';//файл с ежиком.
const FileRaspisRassilka = RassilkaDir+'/raspis.txt';//файл с расписанием на день
const FileEg = currentDir+'/eg.txt';//файл с ежиком
const FileRaspis = currentDir+'/raspis.txt';//файл с расписанием на день
const FileWeek = currentDir+'/week.txt';//файл с расписанием на неделю с сайта
const FileManual = currentDir+'/manual.txt';//файл с расписанием на неделю с сайта
//const FileIl = currentDir+'/il.txt';//файл ИЛ
const TokenDir=currentDir+"/Token";//путь к папке с токенами, на уровень выше

//const token = require(TokenDir+"/na_kzn_news_bot.json").token;//бот @na_kzn_news_bot
//const bot = new TelegramBot(token, {polling: false});

//var ServiceChat = require(TokenDir+"/chatId.json").Supervisor;//пользователь 'Supervisor'

//проверим наличие папки Rassilka, если папки нет, то создадим ее
if(!fs.existsSync(RassilkaDir)) {fs.mkdirSync(RassilkaDir);}

const zagol='🔷*ЕЖЕДНЕВНИК*🔷\n';
let masDay=['','Понедельник','Вторник','Среда','Четверг','Пятница','Суббота','Воскресенье'];

//====================================================================
async function save_today_file(mas_week)
{      //запишем текст текущего дня в файл
       //по текущему дню недели получим расписание из массива
       var dayWeek = new Date().getDay();
       if(dayWeek==0) dayWeek=7;//приведем к формату 1..7
       let str = '🔷<strong>Расписание собраний</strong>🔷\n\n';//заголовок
       str += '<strong>'+masDay[dayWeek]+'</strong>\n\n';//день недели в заголовке
       /*let gr = Object.keys(mas_week[masDay[dayWeek]]);//массив групп в этот день
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
	   else str += 'К сожалению, сегодня собраний нет... 😩';*/
	   
	   //соберем строку для телеги
	   str += '<a  href="'+'https://na-volga.ru/sobraniya-anonimnie-narkomani/anonimnyie-narkomanyi-v-izhevske'+'" >'+'<strong>Ижевск</strong>'+'</a>\n\n';
	   str += '<a  href="'+'https://na-volga.ru/an-v-glazove'+'" >'+'<strong>Глазов</strong>'+'</a>\n\n';
	   str += '<a  href="'+'https://na-volga.ru/an-v-neftekamske'+'" >'+'<strong>Нефтекамск</strong>'+'</a>\n\n';
	   str += '<a  href="'+'https://na-volga.ru/sobraniya-anonimnie-narkomani/an-v-sarapule'+'" >'+'<strong>Сарапул</strong>'+'</a>\n\n';
	   str += '<a  href="'+'https://na-volga.ru/an-v-gorode-chajkovskij'+'" >'+'<strong>Чайковский</strong>'+'</a>\n\n';
	   
	   //запишем файл текущего дня
       let obj = {}; obj.text = str; obj.mode = 'HTML';
	   fs.writeFileSync(FileRaspisRassilka, JSON.stringify(obj,null,2));
	   let err = fs.writeFileSync(FileRaspis, JSON.stringify(obj,null,2));
       if(err) {bot.sendMessage(ServiceChat,err); console.log(err);}
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
//запускаем функции
(async () => 
{
  console.log();//пустая строка-разделитель
  await save_today_file('');//пока расписание заполним только ссылками на страницы городов
  //await raspis_from_file();
})();

