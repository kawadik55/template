process.env["NTBA_FIX_350"] = 1;
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
	if(!PathsList.StopListTowns || !Array.isArray(PathsList.StopListTowns)) 
	{	PathsList.StopListTowns = ['test', 'Test'];
		fs.writeFileSync(FilePaths, JSON.stringify(PathsList,null,2));
	}
} catch (err) 
{console.log('Ошибка парсинга PathsList\n'+err);
 PathsList.DirRaspis = [];
 PathsList.Links = [];
 PathsList.FileRaspisHtml = 'raspisES.html';
 PathsList.StopListTowns = ['test', 'Test'];
 fs.writeFileSync(FilePaths, JSON.stringify(PathsList,null,2));
}

//проверим наличие папок, если папки нет, то создадим ее
if(!!PathsList.DirRaspis && PathsList.DirRaspis.length>0)
{	for(let i=0;i<PathsList.DirRaspis.length;i++) 
	{	fs.mkdirSync(currentDir + PathsList.DirRaspis[i], {recursive: true});
	}
}
//текстовые файлы переписываем из образа принудительно
try{
let cBot = '/home/pi/context/Bot';
if(fs.existsSync(cBot))
{	if(fs.existsSync(cBot+'/readme.txt'))
	{fs.copyFileSync(cBot+'/readme.txt',currentDir+'/readme.txt');}
	if(fs.existsSync(cBot+'/raspisES.js'))
	{fs.copyFileSync(cBot+'/raspisES.js',currentDir+'/raspisES.js');}
}
} catch (err){console.log(err);}

const mas = ['','Января','Февраля','Марта','Апреля','Мая','Июня','Июля','Августа','Сентября','Октября','Ноября','Декабря'];
const gURL = 'https://na-russia.org/';
let getListTowns = 'api/towns/with-regions/';//без аргументов
let getTypesMeetings = 'api/scheduled-meetings/types/';//без аргументов
//город и дата добавляется отдельно
let getMeetingsInTown = 'api/scheduled-meetings/merged/?limit=200&&include_child_towns=false&&include_general_town=false';
let typesMeetings = {};
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
//====================================================================
//парсер расписаний, на выходе тексты в markdown и html
async function parser_raspis()
{	
try
{	let filenameHtml = PathsList.FileRaspisHtml ? PathsList.FileRaspisHtml : 'raspis.html';
	let masDay=['','Понедельник','Вторник','Среда','Четверг','Пятница','Суббота','Воскресенье'];
	let res, listTowns = {}, HtmlRaspis = {};
	
	console.log(moment().format('DD-MM-YY HH:mm:ss:ms')+' - Начинаем парсинг расписаний...');
	
	//формируем даты для Расписаний
	let timeServer = moment();//дата/время текущего момента
	let dateToday = timeServer.format('YYYY-MM-DD');
	let dayOfWeekToday = masDay[timeServer.isoWeekday()];//день недели сегодня
	let dateTomorrow = moment(timeServer).add(1, 'day').format('YYYY-MM-DD');
	let dayOfWeekTomorrow = masDay[moment(timeServer).add(1, 'day').isoWeekday()];//день недели завтра
	let dateYesterday = moment(timeServer).subtract(1, 'day').format('YYYY-MM-DD');
	let dayOfWeekYesterday = masDay[moment(timeServer).subtract(1, 'day').isoWeekday()];//день недели вчера
	
	//сначала получим список типов собраний
	res = await getObjectFromES(gURL+getTypesMeetings);
	if(res==='NO') return res;
	if(!Array.isArray(res))
	{	throw new Error('Ошибка объекта от getObjectFromES');
	}
	typesMeetings = Object.fromEntries(res.map(item => [item.id, item.name]));//переделаем объект в {'id':'name'}
	writeFile('typesMeetings.json', JSON.stringify(typesMeetings,null,2));
	console.log(moment().format('DD-MM-YY HH:mm:ss:ms')+' - Создали файл typesMeetings.json');
	
	//теперь получим список городов, всех
	res = await getObjectFromES(gURL+getListTowns);
	if(res==='NO') return res;
	if(typeof(res) != 'object' || !res.results || !res.results.towns)
	{	throw new Error('Ошибка объекта от getObjectFromES');
	}
	writeFile('listTownsRes.json', JSON.stringify(res.results,null,2));//сохраним респонс
	if(Array.isArray(res.results.towns))
	{	// Фильтруем города, исключая те, что в StopListTowns
		const filteredTowns = res.results.towns.filter(town => 
					!PathsList.StopListTowns || !Array.isArray(PathsList.StopListTowns) || 
					!PathsList.StopListTowns.includes(town.name)
		);
		listTowns = Object.fromEntries(		//преобразуем в объект {'Адлер':{'id','slug' и т.д.}}
			filteredTowns.map(town => [
				town.name, 
				{	id: town.id,
					slug: town.slug,
					geographic_region: town.geographic_region
				}
			])
		);
		writeFile('listTowns.json', JSON.stringify(listTowns,null,2));
		console.log(moment().format('DD-MM-YY HH:mm:ss:ms')+' - Создали файл listTowns.json');
	}
	else throw new Error('Ошибка массива от res.results.towns');
	
	//теперь пройдемся по массиву всех городов и для каждого получим расписания
	//сначала на сегодня
	let count = 0;
	HtmlRaspis = {};
	for(let key in listTowns)
	{	let attempts = 0;
		while(attempts < 3)
		{	let command = getMeetingsInTown;
			command += '&&town='+listTowns[key].id+'&&exact_date='+dateToday;
			await sleep(500);//задержка
			//console.log('Запрашиваем город '+key+' ('+count+')');
			res = await getObjectFromES(gURL+command);
			if(res==='NO') //неудача
			{	console.log('Не удалось получить расписание в городе '+key+'; попытка №'+(attempts+1));
				attempts++;
				await sleep(1000); // пауза перед повтором
			}
			else if(Array.isArray(res.results))//массив объектов
			{	
				HtmlRaspis[key] = parseRaspisToHtml(dayOfWeekToday, res.results, listTowns[key].slug || null, key);
				//console.log('Запросили город '+key+' ('+res.results.length+')');
				HtmlRaspis[key].UnixTime = moment().unix();//добавим время создания
				//для каждого города пишем в свою директорию
				let filename = key + '/' + PathsList.FileRaspisHtml;
				writeFile(filename, JSON.stringify(HtmlRaspis[key],null,2));
				count++;
				break;
			}
		}
		if(attempts >= 3) {console.log('Выходим после 3 попыток'); return 'NO';}
	}
	HtmlRaspis.UnixTime = moment().unix();//добавим время создания
	writeFile(''+PathsList.FileRaspisHtml, JSON.stringify(HtmlRaspis,null,2));//запишем общий файл на сегодня
	console.log(moment().format('DD-MM-YY HH:mm:ss:ms')+' - Создали файл Сегодня');
	
	//потом на завтра
	count = 0;
	HtmlRaspis = {};
	for(let key in listTowns)
	{	let attempts = 0;
		while(attempts < 3)
		{	let command = getMeetingsInTown;
			command += '&&town='+listTowns[key].id+'&&exact_date='+dateTomorrow;
			await sleep(500);//задержка
			//console.log('Запрашиваем город '+key+' ('+count+')');
			res = await getObjectFromES(gURL+command);
			if(res==='NO') //неудача
			{	console.log('Не удалось получить расписание в городе '+key+'; попытка №'+(attempts+1));
				attempts++;
				await sleep(1000); // пауза перед повтором
			}
			else if(Array.isArray(res.results))//массив объектов
			{	
				HtmlRaspis[key] = parseRaspisToHtml(dayOfWeekTomorrow, res.results, listTowns[key].slug || null, key);
				//console.log('Запросили город '+key+' ('+res.results.length+')');
				HtmlRaspis[key].UnixTime = moment().unix();//добавим время создания
				//для каждого города пишем в свою директорию
				let filename = key + '/tomorrow_' + PathsList.FileRaspisHtml;
				writeFile(filename, JSON.stringify(HtmlRaspis[key],null,2));
				count++;
				break;
			}
		}
		if(attempts >= 3) {console.log('Выходим после 3 попыток'); return 'NO';}
	}
	HtmlRaspis.UnixTime = moment().unix();//добавим время создания
	writeFile('tomorrow_'+PathsList.FileRaspisHtml, JSON.stringify(HtmlRaspis,null,2));//запишем общий файл на завтра
	console.log(moment().format('DD-MM-YY HH:mm:ss:ms')+' - Создали файл Завтра');
	
	//потом на вчера
	count = 0;
	HtmlRaspis = {};
	for(let key in listTowns)
	{	let attempts = 0;
		while(attempts < 3)
		{	let command = getMeetingsInTown;
			command += '&&town='+listTowns[key].id+'&&exact_date='+dateYesterday;
			await sleep(500);//задержка
			//console.log('Запрашиваем город '+key+' ('+count+')');
			res = await getObjectFromES(gURL+command);
			if(res==='NO') //неудача
			{	console.log('Не удалось получить расписание в городе '+key+'; попытка №'+(attempts+1));
				attempts++;
				await sleep(5000); // пауза перед повтором
			}
			else if(Array.isArray(res.results))//массив объектов
			{	
				HtmlRaspis[key] = parseRaspisToHtml(dayOfWeekYesterday, res.results, listTowns[key].slug || null, key);
				//console.log('Запросили город '+key+' ('+res.results.length+')');
				HtmlRaspis[key].UnixTime = moment().unix();//добавим время создания
				//для каждого города пишем в свою директорию
				let filename = key + '/yesterday_' + PathsList.FileRaspisHtml;
				writeFile(filename, JSON.stringify(HtmlRaspis[key],null,2));
				count++;
				break;
			}
		}
		if(attempts >= 3) {console.log('Выходим после 3 попыток'); return 'NO';}
	}
	HtmlRaspis.UnixTime = moment().unix();//добавим время создания
	writeFile('yesterday_'+PathsList.FileRaspisHtml, JSON.stringify(HtmlRaspis,null,2));//запишем общий файл на вчера
	console.log(moment().format('DD-MM-YY HH:mm:ss:ms')+' - Создали файл Вчера');
	
	//удаляем папки/города, которых больше нет в списке
	deleteDir(Object.keys(listTowns));
	
	console.log(moment().format('DD-MM-YY HH:mm:ss:ms')+' - Парсер Расписаний - OK!');
	console.log();
	return 'OK';
	
} catch(err) {console.log('Ошибка в parser_raspis()\n'+err.message); return 'NO'}
}
//====================================================================
async function getObjectFromES(command)
{	try
	{	let promise = new Promise((resolve, reject) => 
		{	needle.get(command, async function(err, response) 
			{ 	if(err) {
					console.log(moment().format('DD-MM-YY HH:mm:ss:ms ')+'Ошибка запроса: ' + command + ' - ' + err.message);
					resolve('NO');
				}
				else if(response.statusCode==200) 
				{	resolve(response.body);
				}
				else {
					console.log(moment().format('DD-MM-YY HH:mm:ss:ms ')+'По команде ' + command + ' объект не получен ' + response.statusCode);
					resolve('NO');
				}
			});
  
		});//конец промиса
		return await promise;
	} catch(err) {
		console.log('Ошибка в getObjectFromES()\n'+err.message);
		return 'NO';
	}
}
//====================================================================
function replaceHtml(str)
{	const options = {wordwrap: false};
	str = htmlToText(str, options);
	//str = str.replace(/_/g, '\\_');//экранируем нижнее подчеркивание
	return str;
}
//====================================================================
function parseRaspisToHtml(day, arr, slug, town)
{	//if(arr.length==0) return '';
	let str = '🔷<strong>Расписание собраний</strong>🔷\n\n';//заголовок
	str += '<strong>'+day+'</strong>\n\n';//день недели в заголовке
	if(!!town) str += '<strong>'+town+'</strong>\n\n';//город
	if(arr.length==0) str += 'Сожалею, но сегодня собраний нет... 😥\n\n';
	for(let i=0;i<arr.length;i++)
	{	//время
		let time = arr[i].time ? arr[i].time.split(':').slice(0, 2).join(':') : 'unknown'; //без секунд
		//группа
		let name = '«' + escapeHtml(arr[i].group.name) + '»';
		//адрес
		let address = escapeHtml(arr[i].group.location.address);
		//как пройти
		let place_description = arr[i]?.group?.location?.place_description ? replaceHtml(arr[i].group.location.place_description) : '';
		//добавим к адресу
		if(place_description) address = address + ' - ' + place_description + ';\n';
		else address = address + ';\n';
		//тема
		let types, tema;
		let meetingTypes = arr[i].types ? arr[i].types : [];
		if(meetingTypes.length>0) types = meetingTypes.map(id => typesMeetings[id]).filter(Boolean).join(', ');
		if(!!types) tema = 'Тема: <i>'+types+'</i>\n';//курсивом
		//карта
		let map_frame = arr[i]?.group?.location?.map_frame ? (escapeHtml(arr[i].group.location.map_frame)).trim() : '';
		let match = map_frame.match(/^[^\s]+/);
		map_frame = (match && match[0].startsWith('https://')) ? match[0] : '';
		if(!!map_frame) map_frame = '<a href="'+map_frame+'" >Маршрут</a>';
		//фото
		let photo = '';
		let url = arr[i]?.group?.location?.images ? arr[i].group.location.images : '';
		if(!!url) photo = getFirstImageUrl(url);
		if(!!photo) photo = '<a href="'+photo+'" >Фото</a>';
		//таблица со ссылками по краям
		let tabl = '';
		if(map_frame || photo)
		{	tabl = map_frame ? map_frame : '';
			if(!!photo) tabl += '  |  ' + photo;
			else tabl += photo;
			if(!!tabl) tabl += '\n';
		}
		//соберем результат в промежуточную
		let tmpstr = '<strong>'+time+'</strong> - '+ name +' - '+ address + tema + tabl + '\n';
		
		if((str+tmpstr).length < 3700) str += tmpstr;//до предела не добрались
		else if(i < (arr.length-1))
		{	str += '<i>Это не все собрания в этот день...</i>\n\n';
			break;
		}
	}
	//завершение
	if(PathsList.Links && Array.isArray(PathsList.Links) && PathsList.Links.length>0)
	{	for(let i in PathsList.Links)
		{	if (typeof PathsList.Links[i] === 'object' && PathsList.Links[i] !== null) 
			{	let link = PathsList.Links[i]?.link ? PathsList.Links[i].link : 'https://na-russia.org/';
				if (!link.endsWith('/')) {link += '/';}
				if(slug) link += slug + '/meetings-today';
				let text = PathsList.Links[i]?.text ? PathsList.Links[i].text : 'Гораздо больше информации вы найдете на сайте АН РЗФ!';
				let tempstr = '<a href="'+link+'" target="_blank">'+text+'</a>\n\n';
				if((str+tempstr).length>4000) {break;}//добавлять не будем
				else str += tempstr;
			}
		}
	}
	
	return {text:str, mode:'HTML', slug};
}
//====================================================================
function getFirstImageUrl(htmlString)
{	const match = htmlString.match(/src\s*=\s*["']([^"']+)["']/);
	if (!match) return '';
	// Проверяем, что найденная ссылка начинается с gURL
	if (match[1].startsWith(gURL)) return match[1];
	
	return '';
}
//====================================================================
function escapeHtml(text)
{
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
//====================================================================
function writeFile(filename, message)
{	// Убираем начальный слеш если есть
	if(filename.startsWith('/')) {filename = filename.substring(1);}
	// Функция для создания папок по пути
	const ensurePath = (basePath, filePath) => 
	{	fs.mkdirSync(basePath, {recursive: true});
		if(!filePath.includes('/')) return basePath + '/' + filePath;
		let fullPath = basePath + '/' + filePath;
		let dirPath = fullPath.substring(0, fullPath.lastIndexOf('/'));
		fs.mkdirSync(dirPath, {recursive: true});
		return fullPath;
	};
	//запишем готовый текст в файлы
	let mainPath = ensurePath(currentDir+'/BaseES', filename);
	fs.writeFileSync(mainPath, /*"\ufeff" +*/ message);//в корень
	
	if(!!PathsList.DirRaspis && PathsList.DirRaspis.length>0)
	{	for(let i=0;i<PathsList.DirRaspis.length;i++) 
		{	let extraPath = ensurePath(currentDir + PathsList.DirRaspis[i], filename);
			fs.writeFileSync(extraPath, /*"\ufeff" +*/ message);//в служебные директории
		}
	}
}
//====================================================================
function deleteDir(actualTowns)
{	try
	{	// Сначала чистим корневую директорию BaseES
		let basePath = currentDir + '/BaseES';
		if(fs.existsSync(basePath))
		{	const items = fs.readdirSync(basePath);
			for(let item of items)
			{	const fullPath = basePath + '/' + item;
				// Проверяем, что это директория и её нет в списке актуальных городов
				if(fs.statSync(fullPath).isDirectory() && !actualTowns.includes(item))
				{	fs.rmSync(fullPath, { recursive: true, force: true });
					console.log(moment().format('DD-MM-YY HH:mm:ss:ms')+' - Удалена устаревшая папка: ' + item + ' в /BaseES');
				}
			}
		}
		// Теперь чистим дополнительные директории из PathsList.DirRaspis
		if(PathsList.DirRaspis && Array.isArray(PathsList.DirRaspis) && PathsList.DirRaspis.length>0)
		{	for(let i=0;i<PathsList.DirRaspis.length;i++) 
			{	basePath = currentDir + PathsList.DirRaspis[i];
				if(!fs.existsSync(basePath)) continue;
				const items = fs.readdirSync(basePath);
				for(let item of items)
				{	const fullPath = basePath + '/' + item;
					if(fs.statSync(fullPath).isDirectory() && !actualTowns.includes(item))
					{	fs.rmSync(fullPath, { recursive: true, force: true });
						console.log(moment().format('DD-MM-YY HH:mm:ss:ms')+' - Удалена устаревшая папка: ' + item + ' в ' + PathsList.DirRaspis[i]);
					}
				}
			}
		}
	} catch(err) {console.log('Ошибка в deleteDir()\n'+err.message);}
}
//====================================================================
//====================================================================
let repeate = 12;//счетчик повторений запросов в случае ошибок
let minutes = 15;//период перезапуска, мин
let mess = 'Парсер Расписаний ЕС не смог отработать в течение '+(repeate*minutes)+' минут';
async function main() 
{
  console.log();//пустая строка-разделитель
  let res = await parser_raspis();
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

