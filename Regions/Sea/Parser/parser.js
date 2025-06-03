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
const FileWeek = currentDir+'/week.txt';//файл с расписанием на неделю
const FileIl = currentDir+'/il.txt';//файл ИЛ
const FileIlRassilka = RassilkaDir+'/il.txt';//файл ИЛ
const TokenDir=currentDir+"/../Token";//путь к папке с токенами, на уровень выше

const token = require(TokenDir+"/news_bot.json").token;//бот @na_sea_news_bot
const bot = new TelegramBot(token, {polling: false});
//var chat_annovosti = require(TokenDir+"/chatId.json").chat_annovosti;//канал
//var chat_NaOkt = require(TokenDir+"/chatId.json").chat_NaOkt;//группа

var chat_Supervisor = require(TokenDir+"/chatId.json").chat_Supervisor;//пользователь 'Supervisor'
var ServiceChat = chat_Supervisor;

//проверим наличие папки Rassilka, если папки нет, то создадим ее
if(!fs.existsSync(RassilkaDir)) {fs.mkdirSync(RassilkaDir);}

const zagol='*АН ЮгоВосток Новости*🔷\n';

//====================================================================
//парсер ежика
/*function parser_eg()
{ var URL = 'https://na-russia.org/eg';
  try
  {
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
       message += mas[0] + '\n\n';//дата
       mas[1] = mas[1].replace(/_/g, '\\_');//экранируем нижнее подчеркивание
       message += '*' + mas[1] + '*' + '\n\n';//тема
       mas[2] = mas[2].replace(/_/g, '\\_');//экранируем нижнее подчеркивание
       message += '_' + mas[2] + '_' + '\n';//аннотация курсивом
       mas[3] = mas[3].replace(/_/g, '\\_');//экранируем нижнее подчеркивание
       message += '_' + mas[3] + '_' + '\n\n';//страница БТ курсивом
       mas[4] = mas[4].replace(/_/g, '\\_');//экранируем нижнее подчеркивание
       message += mas[4] + '\n\n';//сам текст
       mas[5] = mas[5].replace(/_/g, '\\_');//экранируем нижнее подчеркивание
       message += mas[5] + '\n\n';//ТС
	   
	   //в конце добавляем ссылки на аудио треки в markdown
	   message += '[Аудио версия "Только сегодня"](https://t.me/BookForNA)\n\n'.replace(/_/g, '\\_');//экранируем нижнее подчеркивание
    
       //запишем готовый текст в файл
       fs.writeFile(FileEg, message, (err) => 
       {if(err) {bot.sendMessage(ServiceChat,err); console.log(err);}
       });
	   fs.writeFile(FileEgRassilka, message, (err) => {if(err) {console.log(err);}});
     
       console.log(moment().format('DD-MM-YY HH:mm:ss:ms')+' - Парсер Ежик - OK!');
     }
     else console.log('Страница Ежика не распарсилась!');  
     
    }
    else
    {bot.sendMessage(ServiceChat,err);
     console.log(err);
    }
  });
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
function parser_raspis()
{ var URL = 'https://na-sea.ru/raspisanie-grupp.html';
  //создадим массив городов
  var masCity = ['Азнакаево','Альметьевск','Нижняя','Бавлы','Бугульма','Лениногорск','Туймазы','Октябрьский'];
  //создадим массив ссылок на города для линков в тексте
  var masLinks =
  {
    Азнакаево     : 'https://na-sea.ru/raspisanie-grupp/aznakaevo.html',
    Альметьевск   : 'https://na-sea.ru/raspisanie-grupp/almetevsk.html',
    Нижняя        : 'https://na-sea.ru/raspisanie-grupp/almetevsk.html',
    Бавлы         : 'https://na-sea.ru/raspisanie-grupp/bavly.html',
    Бугульма      : 'https://na-sea.ru/raspisanie-grupp/bugulma.html',
    Лениногорск   : 'https://na-sea.ru/raspisanie-grupp/leninogorsk.html',
    Туймазы       : 'https://na-sea.ru/raspisanie-grupp/tujmazy.html',
    Октябрьский   : 'https://na-sea.ru/raspisanie-grupp/oktyabrskij.html'
  }
  let masDay=['','Понедельник','Вторник','Среда','Четверг','Пятница','Суббота','Воскресенье'];
  
  try
  {
  needle.get(URL, async function(err, response)
  {
    if(response.statusCode==200)
    {
     fs.writeFileSync(currentDir+'/page.html', beautify(response.body, { indent_size: 2 }));// Запись полученного результата
	 
	 return;//----------------------------------
	 
	 var spisok = [];
     var mas=[];
     var raspis='';
     var currentPage = response.body; // Запись полученного результата
     const dom = new JSDOM(currentPage);
     var elements = dom.window.document.getElementsByClassName('sppb-panel-group');//это панелька с выпадающими барами
     //console.log(elements.length);
     var len1 = elements.length;//кол-во элементов 'sppb-panel-group'
     if(len1>0)
     {
      // мы будем исследовать только самую первую панельку с расписанием по дням недели, индекс 0
      for(var j=0; j<1; j++)
      {
        //выпадающие бары в кол-ве 7 дней недели с понедельника
        elements = dom.window.document.getElementsByClassName('sppb-panel-group')[j].getElementsByClassName('sppb-panel-default');
        //console.log('sppb-panel-default '+elements.length);
        var len2 = elements.length;//кол-во элементов 'sppb-panel-default' (дней недели)
        if(len2>0)
        {
          for(var i=0;i<len2;i++)//по дням недели
          {
            var ss='';
            //день недели
            var day=i+1;
            //str += day+'\n';//от 1 до 7
            mas[day]=[];
            //теперь найдем группы в этот день по классу 'sppb-panel-body', она тоже одна лишь
            ss = dom.window.document.getElementsByClassName('sppb-panel-group')[j].getElementsByClassName('sppb-panel-default')[i].getElementsByClassName('sppb-panel-body')[0].outerHTML;
            ss = ss.replace('<div class="sppb-panel-body">', '');
            ss = ss.replace(/<strong><br>/g, '<br><strong>');
            ss = ss.replace(/&nbsp;/g, ' ');
            ss = ss.replace(/<span style="font-size: 8pt;">/g, '');
            ss = ss.replace(/<\/span>/g, '');
            ss = ss.replace(/<\/div>/g, '');
            ss = ss.replace(/<strong>/g, '');
            ss = ss.replace(/<\/strong>/g, '');
            var arr=ss.split('<br>');
            for(var k=0;k<arr.length;k++) 
            { 	if(arr[k].indexOf('Бавлы')<0)//Бавлы исключаем 
				{	mas[day][k]=arr[k].trim();
					//сложим в список групп местности
					let name = mas[day][k];
					name = name.slice(name.indexOf('«')+1, name.indexOf('»')).trim();
					if(spisok.indexOf(name) < 0) spisok.push(name);
				}
            }
            ss = ss.replace(/<br>/g, '\n');
          }
          
          //соберем недельный массив расписаний
          var Week=[];
          for(var k=1;k<8;k++)
          {
            raspis = mas[k];//получаем массив групп в этот день
            for(var i=0;i<raspis.length;i++) {if(raspis[i]==null) raspis.splice(i,1);}//удаляем пустые строки
            //в строку каждой группы добавим ссылку на раписание города
            for(var i=0;i<raspis.length;i++)
            { //ищем в строке группы название города
              if(raspis[i] != null)
              for(var j=0;j<masCity.length;j++)
              {if(raspis[i].indexOf(masCity[j])+1)
                {//raspis[i]+='\n'+masLinks[masCity[j]];//добавляем ссылку на город
                 //делаем из Города - гиперссылку markdown = [город](ссылка)
                 raspis[i]=raspis[i].replace(masCity[j], '['+masCity[j]+']('+masLinks[masCity[j]]+')');
                 break;
                }
              }
            }
            //подготовим текст для Телеги
            let message='';//текст в телегу
            message += '🔷*РАСПИСАНИЕ*🔷\n';//zagol;
            message += 'СЕГОДНЯ:\n';
            //day=new Date().getDay();
            message += '*'+masDay[k] + '*\n\n';//день недели жирным
            //добавляем само расписание из массива строк
            for(let i=0;i<raspis.length;i++)
            { if(raspis[i])//если не null
              { raspis[i] = raspis[i].replace(/_/g, '\\_');//экранируем нижнее подчеркивание для markdown
                message += raspis[i] + '\n\n';
              }
            }
          
            //message += '*Внимание!\nГр. Новая жизнь сейчас будет проходить на Советской 73. В Мактаме затеяли ремонт.\n';
            //message += 'Понедельник 19:00 до 20:30. Мск\nСреда  19:30 до 20:30 Мск\nПятница 19:30 до 20:30 Мск\n';
            //message += 'Рабочка 2 и 4 пятница месяца. 19:30 мск*\n\n';
          
            message += 'Приходи с верой, надеждой!!!😎\n'+'Да и просто так приходи... 😉' + '\n\n';
            //текст на день готов, кладем его в массив
            Week[k] = message;
          }
          
          //запишем текст текущего дня в файл
          //по текущему дню недели получим расписание из массива
          var dayWeek = new Date().getDay();
		  if(dayWeek==0) dayWeek=7;//приведем к формату 1..7
		  
		  let obj = {}; obj.text = Week[dayWeek]; obj.mode = 'markdown';
		  let err = fs.writeFileSync(FileRaspis, JSON.stringify(obj,null,2));
		  if(err) {bot.sendMessage(ServiceChat,err); console.log(err);}
		  fs.writeFileSync(FileRaspisRassilka, JSON.stringify(obj,null,2));
          
          //запишем недельное расписание в файл
          //с небольшими изменениями
          //for(var i=1;i<8;i++) Week[i]=Week[i].replace('СЕГОДНЯ','Расписание собраний');
          for(var i=1;i<8;i++) Week[i]=Week[i].replace('СЕГОДНЯ:','');
          fs.writeFile(FileWeek, JSON.stringify(Week,null,2), (err) => 
          { if(err) {bot.sendMessage(ServiceChat,err); console.log(err);}
          });
		  spisok.sort();
		  fs.writeFile(currentDir+'/spisok.json', JSON.stringify(spisok,null,2), (err) => {if(err) {console.log(err);}});
          
          console.log(moment().format('DD-MM-YY HH:mm:ss:ms')+' - Парсер Расписание - OK!'); 
        }
      }
     }
     else console.log('Сраница Расписания не распарсилась!');

    }
    else
    {bot.sendMessage(ServiceChat,err);
     console.log(err);
    }
  });
  } catch(err) {console.log('Ошибка в parser_raspis()\n'+err.message);}
}
//====================================================================
function raspis_from_file()
{   try
    {   var Week = JSON.parse(fs.readFileSync(FileWeek));
        //по текущему дню недели получим расписание из массива
        var dayWeek = new Date().getDay();
        if(dayWeek==0) dayWeek=7;//приведем к формату 1..7
        var str = Week[dayWeek];//расписание на сегодня
        //сделаем небольшое изменение
        str = str.replace('Расписание собраний','СЕГОДНЯ');
        //запишем итог в файл для рассылки
        let obj = {}; obj.text = Week[dayWeek]; obj.mode = 'markdown';
		fs.writeFile(FileRaspis, JSON.stringify(obj,null,2), (err) => 
        {if(err) {bot.sendMessage(ServiceChat,err); console.log(err);}
         else console.log(moment().format('DD-MM-YY HH:mm:ss:ms')+' - Расписание Из Файла - OK!'); 
        });
		fs.writeFileSync(FileRaspisRassilka, JSON.stringify(obj,null,2));
    }
    catch (err) {console.log('Ошибка в Расписании Из Файла '+err);}
}
//====================================================================
function parser_il()
{
  let message='';//текст в телегу
  //собираем сообщение боту телеги
  message += zagol;
  message += '*ИНФОРМАЦИОНАЯ ЛИНИЯ*\n';//жирный
  message += 'АЛЬМЕТЬЕВСК, АЗНАКАЕВО, ЛЕНИНОГОРСК, БУГУЛЬМА, БАВЛЫ, ОКТЯБРЬСКИЙ, ТУЙМАЗЫ.' + '\n';
  message += '\n';
  message += '*+7  937 600 56 86*' + '\n';//жирный
  message += '\n';
  message += '*Ссылки:*' + '\n\n';//жирный
  /*message += 'О сообществе:' + '\n';
  message += 'http://na-sea.ru' + '\n';*/
  message += '[О сообществе](http://na-sea.ru)' + '\n';
  message += '\n';
  /*message += 'О мероприятиях:' + '\n';
  message += 'http://na-sea.ru/blog.html' + '\n';*/
  message += '[О мероприятиях](http://na-sea.ru/blog.html)' + '\n';
  message += '\n';
  /*message += 'Контакты АН в городах Поволжья:' + '\n';
  message += 'http://na-volga.ru' + '\n';*/
  message += '[Контакты АН в городах Поволжья](http://na-volga.ru)' + '\n';
  message += '\n';
  /*message += 'Наш whatsApp:' + '\n';
  message += 'https://chat.whatsapp.com/3vQqyZYeClD7W86WaKX0GC' + '\n';*/
  message += '[Наш whatsApp](https://chat.whatsapp.com/3vQqyZYeClD7W86WaKX0GC)' + '\n';
  message += '\n';
  /*message += 'Наш Telegram:' + '\n';
  message += 'Новостной канал - t.me/annovosti' + '\n';
  message += 'Инфо-бот - t.me/na_sea_bot' + '\n';*/
  message += '[Новостной канал Telegram](https://t.me/annovosti)' + '\n';
  message += '\n';
  message += '[Инфо-бот Telegram](https://t.me/na_sea_bot)' + '\n';
  message += '\n';
  /*message += 'Конвенция РЗФ в Самаре:' + '\n';
  message += '[Сайт РЗФ](https://rzf4.ru/)' + '\n';
  message += '[Telegram](https://t.me/RZF_SMR)' + '\n';
  message += '[ВКонтакте](https://vk.com/rzf2023)' + '\n';
  message += '\n';*/
  //message = message.replace(/_/g, '\\_');//экранируем нижнее подчеркивание для markdown
  
  //запишем полученный текст в файл
  fs.writeFile(FileIl, message, (err) => 
  {if(err) {bot.sendMessage(ServiceChat,err); console.log(err);}
  });
  //bot.sendMessage(ServiceChat,message,{parse_mode:"markdown"});
  fs.writeFileSync(FileIlRassilka, message);
  
  console.log(moment().format('DD-MM-YY HH:mm:ss:ms')+' - Парсер ИЛ - OK!');
}
//====================================================================
//запускаем функции
console.log();//пустая строка - разделитель
parser_eg();
parser_raspis();//файл раписания с сайта
//raspis_from_file();//файл расписания из файла week.txt
parser_il();

