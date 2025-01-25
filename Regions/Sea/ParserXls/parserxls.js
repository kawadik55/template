process.env["NTBA_FIX_350"] = 1;
const fs = require('fs');
const XLSX = require('xlsx');

const currentDir = (process.env.CURRENT_DIR) ? process.env.CURRENT_DIR : __dirname;
const wwwDir=currentDir+"/../www";//путь к папке www, на уровень выше
const RassilkaDir = currentDir+"/../Rassilka";
//const RassilkaDir = currentDir+"/../Parser";
const FileRaspis = RassilkaDir+'/raspis.txt';//файл с расписанием на день
const FileXlsx = currentDir+'/../XlsBot/doc/1/ListSea.xls';//файл

//проверим наличие папки www, если папки нет, то создадим ее
if(!fs.existsSync(wwwDir)) {fs.mkdirSync(wwwDir);}
//проверим наличие папки Rassilka, если папки нет, то создадим ее
if(!fs.existsSync(RassilkaDir)) {fs.mkdirSync(RassilkaDir);}

let List = {};

//====================================================================
function Convert()
{
try{
	let sourse = '', sheets = {};
	try{sourse = XLSX.readFile(FileXlsx);}catch(err){console.log(err);}
	if(!!sourse)
	{	//скопируем файл для http-сервера
		if(!fs.existsSync(wwwDir+'/utils')) {fs.mkdirSync(wwwDir+'/utils');}//создадим папку, если ее нет
		let filename = FileXlsx.split('/')[FileXlsx.split('/').length-1];//последний элемент это имя файла
		fs.copyFileSync(FileXlsx, wwwDir+'/utils/'+filename);//копируем файл
		//вытащим листы
		for(let i=0;i<sourse.SheetNames.length;i++)//по именам листов
		{	sheets[sourse.SheetNames[i]] = [];
			sheets[sourse.SheetNames[i]] = XLSX.utils.sheet_to_json(sourse.Sheets[sourse.SheetNames[i]], {raw: false});
		}
	}
	else {console.log('Ошибка чтения таблицы'); return;}
	if(Object.keys(sheets).length>0)
	{	let err = fs.writeFileSync(currentDir+'/sheets.json', "\ufeff" + JSON.stringify(sheets,null,4));
		if(err) {console.log(err);}
	}
	else {console.log('Ошибка парсинга таблицы'); return;}
	if(!sheets) return;
	
	//сначала соберем шапку
	if(!!sheets['Местность'])
	{	if(!!sheets['Местность'][0]['Регион']) List.region = sheets['Местность'][0]['Регион'];
		if(!!sheets['Местность'][0]['Шорт']) List.shortname = sheets['Местность'][0]['Шорт'];
		if(!!sheets['Местность'][0]['Телефон']) List.phone = sheets['Местность'][0]['Телефон'];
		if(!!sheets['Местность'][0]['Сайт']) List.site = sheets['Местность'][0]['Сайт'];
		if(!!sheets['Местность'][0]['email']) List.email = sheets['Местность'][0]['email'];
		if(!!sheets['Местность'][0]['ID деятельности']) List.rubric_id = sheets['Местность'][0]['ID деятельности'];
	}
	
	//далее будем собирать группы
	let groups = {};
	let formats = Object.keys(sheets);//список форматов (=листов таблицы)
	for(let i=0;i<formats.length;i++) {if(formats[i]=='Местность') {formats.splice(i,1); break;}}//уберем лишнее
	for(let i in formats)//по форматам
	{	let format = formats[i];
		if(sheets[format].length==0) continue;//пропускаем, если массив объектов пустой
		for(let num=0;num<sheets[format].length;num++)
		{	let town, day, time, name, adres, karta, photo, mode, comment;
			if(!!sheets[format][num]['Город']) town = sheets[format][num]['Город'].trim();
			if(!!sheets[format][num]['День']) day = sheets[format][num]['День'].trim();
			if(!!sheets[format][num]['Время']) time = sheets[format][num]['Время'].trim();
			if(!!sheets[format][num]['Группа']) name = sheets[format][num]['Группа'].trim();
			if(!!sheets[format][num]['Адрес']) adres = sheets[format][num]['Адрес'].trim();
			if(!!sheets[format][num]['Формат']) mode = sheets[format][num]['Формат'].trim();
			if(!!sheets[format][num]['Маршрут']) karta = sheets[format][num]['Маршрут'].trim();
			if(!!sheets[format][num]['Вход / Фото']) photo = sheets[format][num]['Вход / Фото'].trim();
			if(!!sheets[format][num]['Комментарий']) comment = sheets[format][num]['Комментарий'].trim();
			//добавим в выходной объект
			if(!!town && !!name && !!day && !!time)//имена объектов группы
			{	if(!groups[town]) groups[town] = {};//город
				if(!groups[town][name]) groups[town][name] = {};//группа
				if(!groups[town][name][format]) groups[town][name][format] = {};//формат
				if(!groups[town][name][format][day]) groups[town][name][format][day] = {};//день
				if(!groups[town][name][format][day][time]) groups[town][name][format][day][time] = {};//время
				let obj = groups[town][name][format][day][time];
				//все что в скобках - дополнительный адрес
				let address_add = ' ';
				if(!!adres && adres.indexOf('(')+1)
				{	let tt = adres;
					adres = adres.slice(0, adres.indexOf('(')).trim();//отсекаем все что в скобках
					address_add = tt.slice(tt.indexOf('('), tt.indexOf(')')+1).trim();//оставим все что в скобках
				}
				obj.address = adres;
				obj.address_add = address_add;
				if(!!karta) obj.add_url = karta;
				if(!!photo) obj.photo = photo;
				if(!!mode) obj.mode = mode;
				if(!!comment) obj.comment = comment;
			}
		}
	}
	
	//сортируем по названиям групп
	let towns = Object.keys(groups);
	for(let i in towns) groups[towns[i]] = Object.fromEntries(Object.entries(groups[towns[i]]).sort());
	//сохраняем итоговый объект групп
	List.groups = groups;
	let err = fs.writeFileSync(currentDir+'/groups.json', "\ufeff" + JSON.stringify(List,null,4));
	if(!!err) {console.log(err);}
	err = '';
	err = fs.writeFileSync(wwwDir+'/groups.json', "\ufeff" + JSON.stringify(List,null,4));
	if(!!err) {console.log(err);}
	//console.log('Создал файл groups.json');
	
}catch(err){console.log(err);}
}
//====================================================================
//запишем текст текущего дня в файл
async function save_today_file()
{
try{	
	let masDay=['','Понедельник','Вторник','Среда','Четверг','Пятница','Суббота','Воскресенье'];
	let groups = '';
	if(!!List.groups) groups = List.groups;
	else {console.log('Ошибка! Отсутствует объект List.groups'); return;}
	//по текущему дню недели создадим расписание из объекта
	var dayWeek = new Date().getDay();
	if(dayWeek==0) dayWeek=7;//приведем к формату 1..7
	//подготовим текст для Телеги
	let str = '🔷<strong>РАСПИСАНИЕ</strong>🔷\n\n';//заголовок
	str += 'СЕГОДНЯ: ';
	str += '<strong>'+masDay[dayWeek]+'</strong>\n\n';//день недели в заголовке
	
	let town = Object.keys(groups);//массив городов
	if(!town) {console.log('Ошибка! Отсутствует массив городов'); return;}
	let out = {};//выходной объект
	
	for(let i=0;i<town.length;i++)//по городам
	{	let name = Object.keys(groups[town[i]]);//массив групп в городе
		if(!name) continue;//если групп нету, то пропускаем этот город
		for(let num=0;num<name.length;num++)//по группам
		{	let obj = groups[town[i]][name[num]];
			if(!obj['Закрытое']) continue;//пропускаем группу, если нет Закрытых
			let days = Object.keys(obj['Закрытое']);//массив дней у этой группы
			if(days.length == 0) continue;//пропускаем группу, если нет дней
			for(let day=0;day<days.length;day++)//по дням недели
			{	//будем собирать выходно массив - имя, время, адрес, тема, карта
				//если день совпадает
				if(masDay[dayWeek] == days[day])
				{	let time = Object.keys(obj['Закрытое'][days[day]]);
					for (t=0;t<time.length;t++)
					{	if(!out[town[i]]) out[town[i]] = [];
						out[town[i]].push(new Array(5));
						let cnt = out[town[i]].length-1;
						//сделаем гиперссылку из названия группы
						if(!!obj['Закрытое'][days[day]][time[t]].add_url) 
							out[town[i]][cnt][0] = '<a  href="'+obj['Закрытое'][days[day]][time[t]].add_url+'" >'+name[num]+'</a>';
						else out[town[i]][cnt][0] = name[num];//если url нет, то просто имя группы
						//out[town[i]][cnt][0] = '«'+name[num]+'»';
						//время
						out[town[i]][cnt][1] = time[t];
						//адрес
						let address_add = obj['Закрытое'][days[day]][time[t]].address_add.trim();
						let address = obj['Закрытое'][days[day]][time[t]].address;
						if(!!address_add) out[town[i]][cnt][2] = address+' '+address_add+';';
						else out[town[i]][cnt][2] = address+';';
						//тема
						out[town[i]][cnt][3] = '';
						if(!!obj['Закрытое'][days[day]][time[t]].mode && obj['Закрытое'][days[day]][time[t]].mode != ' ') 
							out[town[i]][cnt][3] += '\n<strong>Тема:</strong> <i>'+obj['Закрытое'][days[day]][time[t]].mode+'</i>';
						//карта
						let karta = '';
						if(obj['Закрытое'][days[day]][time[t]].add_url) 
							//karta += '\n'+'<a  href="'+obj['Закрытое'][days[day]][time[t]].add_url+'" >Маршрут</a>';
							karta += obj['Закрытое'][days[day]][time[t]].add_url;
						out[town[i]][cnt][4] = karta;
					}
				}
			}
		}
		if(!!out[town[i]])//если есть собрания в этот день
		{	//сортируем по времени
			out[town[i]].sort(function(a,b) 
			{	let aa = parseInt(a[1].replace(':', ''));
				let bb = parseInt(b[1].replace(':', ''));
				if (aa === bb) 
				{return 0;}
				else {return (aa < bb) ? -1 : 1;}
			});
			//соберем строку для телеги
			str += '<strong>'+town[i]+'</strong>\n\n';//город
			for(let j=0; j<out[town[i]].length; j++)
			{	name = out[town[i]][j][0];
				let time = out[town[i]][j][1];
				let adres = out[town[i]][j][2];
				let tema = out[town[i]][j][3];
				let karta = out[town[i]][j][4];
				//соберем результат
				str += '<strong>'+time+'</strong> - '+name+' - '+adres+tema+'\n\n';
			}
		}
	}
	if(!out || Object.keys(out).length==0) str += 'К сожалению, сегодня собраний нет... 😩';
			
	//добавляем объявление
	str += 'Приходи с верой, надеждой!!!😎\n'+'Да и просто так приходи... 😉' + '\n\n';
	   
	//запишем файл текущего дня
    let obj = {}; obj.text = str; obj.mode = 'HTML';
	let err = fs.writeFileSync(FileRaspis, /*"\ufeff" +*/ JSON.stringify(obj,null,2));
    if(!!err) {console.log(err);}
	//запишем расписание в формате html
	str = obj.text;
	str = str.replace(/\n/g,'<br />');//делаем перевод строки html
	err = '';
	err = fs.writeFileSync(currentDir+'/raspis.html', "\ufeff" + str);
	if(err) {bot.sendMessage(ServiceChat,err); console.log(err);}
	//console.log('Создал файл raspis.txt');
	
}catch(err){console.log(err);}
}
//====================================================================
//запускаем функции
(async () => 
{
  //console.log();//пустая строка-разделитель
  await Convert();
  await save_today_file();
  //console.log(new Date()+' parserxls - OK!');
})();
//====================================================================

