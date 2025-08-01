﻿process.env["NTBA_FIX_350"] = 1;
const fs = require('fs');
const moment = require('moment');
const needle = require('needle');
const {htmlToText} = require('html-to-text');//преобразователь html в текст

const currentDir = (process.env.CURRENT_DIR) ? process.env.CURRENT_DIR : __dirname;
const FilePaths = currentDir+'/paths.json';//файл со списком выходных файлов.
let PathsList={};//список выходных файлов
//файл списка выходных путей и файлов
try 
{ PathsList = JSON.parse(fs.readFileSync(FilePaths));
} catch (err) 
{console.log('Ошибка парсинга PathsList\n'+err);
 PathsList.DirEg = [];
 PathsList.Links = [];
 PathsList.FileEgHtml = 'eg.html';
 PathsList.FileEgMD = 'eg.txt';
 PathsList.TimeZoneMinutes = '';
 fs.writeFileSync(FilePaths, JSON.stringify(PathsList,null,2));
}

//проверим наличие папок, если папки нет, то создадим ее
if(!!PathsList.DirEg && PathsList.DirEg.length>0)
{for(let i=0;i<PathsList.DirEg.length;i++) if(!fs.existsSync(currentDir+PathsList.DirEg[i])) {fs.mkdirSync(currentDir+PathsList.DirEg[i]);}
}
//текстовые файлы переписываем из образа принудительно
try{
let cBot = '/home/pi/context/Bot';
if(fs.existsSync(cBot))
{	if(fs.existsSync(cBot+'/readme.txt'))
	{fs.copyFileSync(cBot+'/readme.txt',currentDir+'/readme.txt');}
	if(fs.existsSync(cBot+'/parserEg.js'))
	{fs.copyFileSync(cBot+'/parserEg.js',currentDir+'/parserEg.js');}
}
} catch (err){console.log(err);}
//добавим таймзону, если ее нет
if(!!PathsList && !PathsList.TimeZoneMinutes)
{	PathsList.TimeZoneMinutes = '';
	fs.writeFileSync(FilePaths, JSON.stringify(PathsList,null,2));
}

//====================================================================
//парсер ежика, на выходе текст в markdown и html
async function parser_eg()
{	let offset= '';
	if(!!PathsList.TimeZoneMinutes)//если есть таймзона
	{	if(PathsList.TimeZoneMinutes.indexOf('-')==0)//если отрицательное
		{	let str = PathsList.TimeZoneMinutes.replace('-','');
			if(!isNaN(Number(str))) offset += '&&timezone_offset=' + String(Math.floor(Number(str)));
			else console.log('Ошибка формата отрицательного числа таймзоны');
		}
		else
		{	let str = PathsList.TimeZoneMinutes.replace('+','');
			if(!isNaN(Number(str))) offset += '&&timezone_offset=-' + String(Math.floor(Number(str)));
			else console.log('Ошибка формата положительного числа таймзоны');
		}
	}
	let URL = 'https://na-russia.org/api/daily-meditation/?format=json'+offset;
	let mas = ['','Января','Февраля','Марта','Апреля','Мая','Июня','Июля','Августа','Сентября','Октября','Ноября','Декабря'];
	try
	{
		let promise = new Promise((resolve, reject) => 
		{
			needle.get(URL, async function(err, response) 
			{ 	if(response.statusCode==200)
				{
					let EgObj = response.body[0]; // Получаем json
					//fs.writeFileSync(currentDir+'/page_eg.txt', JSON.stringify(EgObj,null,2));// Запись полученного результата
					//собираем текст ежика для markdown
					let message='';
					message += '🔷*ЕЖЕДНЕВНИК*🔷\n';//zagol;
					message += 'https://na-russia.org/\n\n';
					message += EgObj.day + ' ' + mas[EgObj.month] + '\n\n';//дата
					
					message += '*' + replaceHtml(EgObj.title) + '*' + '\n\n';//тема жирно
					
					message += '_' + replaceHtml(EgObj.quote) + '_' + '\n';//аннотация курсивом
					message += '_' + EgObj.quote_from + '_' + '\n\n';//страница БТ курсивом
					
					message += replaceHtml(EgObj.body) + '\n\n';//сам текст
					
					message += '*ТОЛЬКО СЕГОДНЯ:* ' + replaceHtml(EgObj.jft) + '\n\n';
					
					//в конце добавляем ссылки на аудио треки в markdown, если есть
					try{
					if(!!PathsList.Links && PathsList.Links.length>0)
					{	for(let i=0;i<PathsList.Links.length;i++)
						{message += '['+String(PathsList.Links[i][0])+']('+String(PathsList.Links[i][1])+')\n\n';
						}
					}
					}catch(err){console.log('Ошибка в "Links":\n'+err);}
					
					//запишем готовый текст в файлы
					fs.writeFileSync(currentDir+'/'+PathsList.FileEgMD, /*"\ufeff" +*/ message);//в корень
					if(!!PathsList.DirEg && PathsList.DirEg.length>0)
					{for(let i=0;i<PathsList.DirEg.length;i++) fs.writeFileSync(currentDir+PathsList.DirEg[i]+'/'+PathsList.FileEgMD, /*"\ufeff" +*/ message);
					}
					
					//-------------------------------------------------------------
					//теперь соберем текст в формате html
					message='';
					message += '🔷<b>ЕЖЕДНЕВНИК</b>🔷<br>';//zagol;
					message += 'https://na-russia.org/<br><br>';
					message += EgObj.day + ' ' + mas[EgObj.month] + '<br><br>';//дата
					
					message += '<b>' + EgObj.title + '</b>' + '<br><br>';//тема жирно
					
					message += '<i>' + EgObj.quote + '</i>' + '<br>';//аннотация курсивом
					message += '<i>' + EgObj.quote_from + '</i>' + '<br><br>';//страница БТ курсивом
					
					message += EgObj.body + '<br><br>';//сам текст
					
					message += '<b>ТОЛЬКО СЕГОДНЯ:</b> ' + EgObj.jft + '<br><br>';
					
					//в конце добавляем ссылки на аудио треки в html, если есть
					try{
					if(!!PathsList.Links && PathsList.Links.length>0)
					{	for(let i=0;i<PathsList.Links.length;i++)
						{message += '<a href="'+String(PathsList.Links[i][1])+'">'+String(PathsList.Links[i][0])+'</a><br><br>';
						}
					}
					}catch(err){console.log('Ошибка в "Links":\n'+err);}
					
					//запишем готовый текст в файлы
					fs.writeFileSync(currentDir+'/'+PathsList.FileEgHtml, "\ufeff" + message);//в корень
					if(!!PathsList.DirEg && PathsList.DirEg.length>0)
					{for(let i=0;i<PathsList.DirEg.length;i++) fs.writeFileSync(currentDir+PathsList.DirEg[i]+'/'+PathsList.FileEgHtml, "\ufeff" + message);
					}
     
					//----------------------------------------------------------
					console.log(moment().format('DD-MM-YY HH:mm:ss:ms')+' - Парсер Ежик - OK!');
					resolve ('OK');
					
					function replaceHtml(str)
					{	const options = {wordwrap: false};
						str = htmlToText(str, options);
						str = str.replace(/_/g, '\\_');//экранируем нижнее подчеркивание
						return str;
					}
				}
				else {console.log(moment().format('DD-MM-YY HH:mm:ss:ms ')+'Страница Ежика не распарсилась!'); resolve('NO');} 
			});
  
		});//конец промиса
		return await promise;
	} catch(err) {console.log('Ошибка в parser_eg()\n'+err.message);}//
}
//====================================================================
let repeate = 12;//счетчик повторений запросов в случае ошибок
let minutes = 15;//период перезапуска, мин
let mess = 'Парсер не смог отработать в течение '+(repeate*minutes)+' минут';
async function main() 
{
  console.log();//пустая строка-разделитель
  let res = await parser_eg();
  if(res !== 'OK')//если страница не распарсилась
  {	
	repeate--;
	if(repeate >= 0)
	{
		console.log(moment().format('DD-MM-YY HH:mm:ss:ms ')+'Будем делать повторный запуск через '+minutes+'мин');
		setTimeout(main,(minutes*60*1000));
	}
	else console.log(moment().format('DD-MM-YY HH:mm:ss:ms ')+mess);
  }
};
//====================================================================
//запускаем функции
(async () => 
{
  await main();
})();

