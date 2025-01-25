process.env["NTBA_FIX_350"] = 1;
const fs = require('fs');
const XLSX = require('xlsx');

const currentDir = (process.env.CURRENT_DIR) ? process.env.CURRENT_DIR : __dirname;
const wwwDir=currentDir+"/../www";//путь к папке www, на уровень выше
const RassilkaDir = currentDir+"/../Rassilka";
const RassilkaDirOpen = currentDir+"/../../pso/Rassilka";
//const RassilkaDir = currentDir+"/../Parser";
const FileRaspis = RassilkaDir+'/raspis.txt';//файл с расписанием на день
const FileRaspisOpen = RassilkaDirOpen+'/raspis_open.txt';//файл открытых с расписанием
const FileXlsDir = currentDir+'/../XlsBot/doc/1';//папка
//const FileZagol = /^ListUfa\.xls+x?$/;//маска файла, xlsx или xls
const FileZagol = 'Местность.xls';//маска заголовочного файла местности, xls
const MaskaXls = /^.+\.xls$/;//маска файлов табличных

//проверим наличие папки www, если папки нет, то создадим ее
if(!fs.existsSync(wwwDir)) {fs.mkdirSync(wwwDir);}
//проверим наличие папки Rassilka, если папки нет, то создадим ее
if(!fs.existsSync(RassilkaDir)) {fs.mkdirSync(RassilkaDir);}

let List = {};

//====================================================================
function Convert(Path)
{
try{
	let sourse = '', sheets = {};
	try{sourse = XLSX.readFile(Path);}catch(err){console.log(err);}
	if(!!sourse)
	{	//скопируем файл для http-сервера
		//if(!fs.existsSync(wwwDir+'/utils')) {fs.mkdirSync(wwwDir+'/utils');}//создадим папку, если ее нет
		//let filename = Path.split('/')[Path.split('/').length-1];//последний элемент это имя файла
		//fs.copyFileSync(Path, wwwDir+'/utils/'+filename);//копируем файл в /www/utils
		//вытащим листы
		for(let i=0;i<sourse.SheetNames.length;i++)//по именам листов
		{	sheets[sourse.SheetNames[i]] = [];
			sheets[sourse.SheetNames[i]] = XLSX.utils.sheet_to_json(sourse.Sheets[sourse.SheetNames[i]], {raw: false});
		}
	}
	if(Object.keys(sheets).length>0)
	{	//let err = fs.writeFileSync(currentDir+'/sheets.json', "\ufeff" + JSON.stringify(sheets,null,4));
		//if(err) {console.log(err);}
	}
	else {console.log('Ошибка парсинга таблицы'); return;}
	if(!sheets) return;
	
	//сначала соберем шапку
	if(!!sheets['Местность'] && !List.region && !List.shortname && !List.phone)
	{	if(!!sheets['Местность'][0]['Регион']) List.region = sheets['Местность'][0]['Регион'];
		if(!!sheets['Местность'][0]['Шорт']) List.shortname = sheets['Местность'][0]['Шорт'];
		if(!!sheets['Местность'][0]['Телефон']) List.phone = sheets['Местность'][0]['Телефон'];
		if(!!sheets['Местность'][0]['Сайт']) List.site = sheets['Местность'][0]['Сайт'];
		if(!!sheets['Местность'][0]['email']) List.email = sheets['Местность'][0]['email'];
		if(!!sheets['Местность'][0]['ID деятельности']) List.rubric_id = sheets['Местность'][0]['ID деятельности'];
	}
	
	//далее будем собирать группы
	let groups = {};
	if(!!List.groups) groups = List.groups;//если уже есть, то ссылаемся на него
	let formats = Object.keys(sheets);//список форматов (=листов таблицы)
	for(let i=0;i<formats.length;i++) {if(formats[i]=='Местность') {formats.splice(i,1); break;}}//уберем лишнее
	for(let i in formats)//по форматам
	{	let format = formats[i];
		if(sheets[format].length==0) continue;//пропускаем, если массив объектов пустой
		for(let num=0;num<sheets[format].length;num++)
		{	let town, day, time, name, adres, karta, photo, mode, comment, map2gis, longtime, online;
			if(!!sheets[format][num]['Город']) 
			{	town = 'г.' + sheets[format][num]['Город'].trim();
				if(town.search(/^г./)<0) town = 'г.' + town;
			}
			if(!!sheets[format][num]['День']) day = sheets[format][num]['День'].trim();
			if(!!sheets[format][num]['Время']) time = sheets[format][num]['Время'].trim();
			if(!!sheets[format][num]['Группа']) name = sheets[format][num]['Группа'].trim();
			if(!!sheets[format][num]['Адрес']) 
			{	adres = sheets[format][num]['Адрес'].trim();
				//if(adres.search(/^ул./)<0) adres = 'ул.' + adres;
			}
			if(!!sheets[format][num]['Формат']) mode = sheets[format][num]['Формат'].trim();
			if(!!sheets[format][num]['Маршрут']) karta = sheets[format][num]['Маршрут'].trim();
			if(!!sheets[format][num]['Вход / Фото']) photo = sheets[format][num]['Вход / Фото'].trim();
			if(!!sheets[format][num]['Комментарий']) comment = sheets[format][num]['Комментарий'].trim();
			if(!!sheets[format][num]['2гис']) map2gis = sheets[format][num]['2гис'].trim();
			if(!!sheets[format][num]['Длительность']) longtime = sheets[format][num]['Длительность'].trim();
			if(!!sheets[format][num]['Онлайн']) online = sheets[format][num]['Онлайн'].trim();
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
				else obj.mode = 'Ежедневник';
				if(!!comment) obj.comment = comment;
				if(!!map2gis) obj.map2gis = map2gis;
				if(!!longtime) obj.longtime = longtime;
				if(!!online) obj.online = online;
			}
		}
	}
	
	//сортируем по названиям групп
	let towns = Object.keys(groups);
	for(let i in towns) groups[towns[i]] = Object.fromEntries(Object.entries(groups[towns[i]]).sort());
	//сохраняем итоговый объект групп
	if(!List.groups) List.groups = groups;
	//в текущую папку 
	let err = fs.writeFileSync(currentDir+'/groups.json', "\ufeff" + JSON.stringify(List,null,4));
	if(!!err) {console.log(err);}
	//в папку /www
	err='';
	err = fs.writeFileSync(wwwDir+'/groups.json', "\ufeff" + JSON.stringify(List,null,4));
	if(!!err) {console.log(err);}
	//console.log('Создал файл groups.json');
	
}catch(err){console.log(err);}
}
//====================================================================
//https://yandex.ru/support/business-priority/branches/basic.html
async function setCsvYandex()
{
try{
	let groups = '';
	if(!!List.groups) groups = List.groups;
	else {console.log('Ошибка! Отсутствует объект List.groups'); return;}
	let town = Object.keys(groups);//массив городов
	if(!town) {console.log('Ошибка! Отсутствует массив городов'); return;}
	let out = {};//выходной объект, ключ=адрес, свойства = доп, время с днями
	
	//будем собирать только адрес группы с допами, и время/дни работы
	//"г.Уфа, ул.Бакалинская, 11 (вход слева)", "Пн-чт, вс 10:00, пт-сб 19:00"
	for(let i=0;i<town.length;i++)//по городам
	{	let name = Object.keys(groups[town[i]]);//массив групп в городе
		if(!name) continue;//если групп нету, то пропускаем этот город
		for(let num=0;num<name.length;num++)//по группам
		{	let obj = groups[town[i]][name[num]];
			if(!obj['Закрытое']) continue;//пропускаем группу, если нет Закрытых
			let days = Object.keys(obj['Закрытое']);//массив дней у этой группы
			if(days.length == 0) continue;//пропускаем группу, если нет дней
			for(let day=0;day<days.length;day++)//по дням недели
			{	let time = Object.keys(obj['Закрытое'][days[day]]);//собираем время в этот день
				for (t=0;t<time.length;t++)//по времени
				{	if(!obj['Закрытое'][days[day]][time[t]].address) continue;//пропускаем, если нет адреса
					let map2gis;
					if(!!obj['Закрытое'][days[day]][time[t]].map2gis) map2gis = obj['Закрытое'][days[day]][time[t]].map2gis;
					if(!map2gis || map2gis.toLowerCase().search(/^да/)<0) continue;//пропускаем, если запрещено арендодателем
					let address = town[i] + ', ' + obj['Закрытое'][days[day]][time[t]].address;//с городом
					if(!out[address]) out[address] = {};
					if(!out[address].address_add) out[address].address_add = obj['Закрытое'][days[day]][time[t]].address_add;
					if(!out[address][time[t]]) out[address][time[t]] = [];
					if(!out[address][time[t]].includes(days[day])) out[address][time[t]].push(days[day]);//собираем дни
				}
			}
		}
	}
	//console.log(JSON.stringify(out,null,2));
	if(!out) return;//если ничего не собрали
	
	//соберем csv файл
	let adr = Object.keys(out);
	if(adr.length==0) return;
	let str = 'name,country,address,address-add,phone,url,rubric-id,working-time,lat,lon\n';//заголовок
	for(let i=0;i<adr.length;i++)//по адресам
	{	//общие параметры
		str += List.shortname+',Россия,';//имя, страна
		str += '"'+adr[i]+'","'+out[adr[i]].address_add+'",';//адрес с допом
		str += List.phone+','+List.site+','+List.rubric_id+',';//тлф и урл и рубрика
		let time = Object.keys(out[adr[i]]);//массив времени 
		if(!!out[adr[i]].address_add) time.splice(0,1);//уберем доп адрес из массива времени
		if(time.length != 0) str += '"';//открываем кавычки working-time
		for(let k=0;k<time.length;k++)//по времени
		{	let days = out[adr[i]][time[k]];
			for(let t=0;t<days.length;t++)//по массиву дней адреса
			{	if(days[t] == 'Понедельник') str += 'Пн,';
				else if(days[t] == 'Вторник') str += 'Вт,';
				else if(days[t] == 'Среда') str += 'Ср,';
				else if(days[t] == 'Четверг') str += 'Чт,';
				else if(days[t] == 'Пятница') str += 'Пт,';
				else if(days[t] == 'Суббота') str += 'Сб,';
				else if(days[t] == 'Воскресенье') str += 'Вс,';
				else continue;
			}
			//удаляем последнюю запятую
			if(str.charAt(str.length-1)==',') str = str.slice(0, -1);
			str += ' - '+time[k]+'; ';//добавляем время в эти дни
		}
		str += '",';//закрываем кавычки working-time
		str += ',\n';//пропускаем lat,lon и закрываем строку
	}
	//console.log(str);
	
	//сохраняем csv файл
	if(!fs.existsSync(wwwDir+'/utils')) {fs.mkdirSync(wwwDir+'/utils');}//создадим папку, если ее нет
	let err = fs.writeFileSync(wwwDir+'/utils/naufa.csv', "\ufeff" + str);
	if(!!err) {console.log(err);}
	
	
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
	let str = '🔷<strong>Расписание собраний</strong>🔷\n\n';//заголовок
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
						//if(!!obj['Закрытое'][days[day]][time[t]].photo) 
						//	out[town[i]][cnt][0] = '<a  href="'+obj['Закрытое'][days[day]][time[t]].photo+'" >'+name[num]+'</a>';
						//else out[town[i]][cnt][0] = '«'+name[num]+'»';//если url нет, то просто имя группы
						out[town[i]][cnt][0] = '«'+name[num]+'»';
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
						{	let tema = obj['Закрытое'][days[day]][time[t]].mode;
							let online;
							if(obj['Закрытое'][days[day]][time[t]].online) online = obj['Закрытое'][days[day]][time[t]].online;
							if(!!online) tema = '<a  href="'+online+'" >'+tema+'</a>';
							out[town[i]][cnt][3] += '\nТема: <i>'+tema+'</i>';
						}
						//карта
						let karta = '';
						if(obj['Закрытое'][days[day]][time[t]].add_url) 
							karta += '\n'+'<a  href="'+obj['Закрытое'][days[day]][time[t]].add_url+'" >Маршрут</a>';
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
				str += '<strong>'+time+'</strong> - '+name+' - '+adres+tema+karta+'\n\n';
			}
		}
	}
	if(!out || Object.keys(out).length==0) str += 'К сожалению, сегодня собраний нет... 😩';
			
	//добавляем объявление
	str += 'Расписание собраний города <a  href="https://na-volga.ru/sobraniya-anonimnie-narkomani/an-v-sterlitamake/" >Стерлитамак</a>, время и место их проведения Вы можете уточнить позвонив по номеру \n<strong>+79173702268</strong> или <strong>+79610402244</strong>\n';
	str += 'Расписание собраний города <a  href="https://na-volga.ru/an-v-neftekamske/" >Нефтекамск</a>, время и место их проведения Вы можете уточнить позвонив по номеру \n<strong>+79656540044</strong>\n';
	str += 'Расписание собраний городов <a  href="https://na-sea.ru/raspisanie-grupp/tujmazy.html" >Туймазы</a> и <a  href="https://na-sea.ru/raspisanie-grupp/oktyabrskij.html" >Октябрьский</a>, время и место их проведения Вы можете уточнить позвонив по номеру \n<strong>+79003225686</strong>\n';
	   
	//запишем файл текущего дня в папку /Rassilka/raspis.txt
    let obj = {}; obj.text = str; obj.mode = 'HTML';
	let err = fs.writeFileSync(FileRaspis, /*"\ufeff" +*/ JSON.stringify(obj,null,2));
    if(err) {console.log(err);}
	//запишем расписание в формате html
	str = obj.text;
	str = str.replace(/\n/g,'<br />');//делаем перевод строки html
	err = '';
	err = fs.writeFileSync(currentDir+'/raspis.html', "\ufeff" + str);
	if(!!err) {bot.sendMessage(ServiceChat,err); console.log(err);}
	//console.log('Создал файл raspis.txt');
	
}catch(err){console.log(err);}
}
//====================================================================
//запишем текст расписания открытых собраний в файл
async function save_open_file()
{
try{
	let groups = '';
	if(!!List.groups) groups = List.groups;
	else {console.log('Ошибка! Отсутствует объект List.groups'); return;}
	let town = Object.keys(groups);//массив городов
	if(!town) {console.log('Ошибка! Отсутствует массив городов'); return;}
	let out = {};//выходной объект, ключ=город, свойства = массив
	
	//будем собирать по городам - время, группу, адрес с допом, день, маршрут
	for(let i=0;i<town.length;i++)//по городам
	{	let name = Object.keys(groups[town[i]]);//массив групп в городе
		if(!name) continue;//если групп нету, то пропускаем этот город
		for(let num=0;num<name.length;num++)//по группам
		{	let obj = groups[town[i]][name[num]];
			if(!obj['Открытое']) continue;//пропускаем группу, если нет Открытых
			let days = Object.keys(obj['Открытое']);//массив дней у этой группы
			if(days.length == 0) continue;//пропускаем группу, если нет дней
			for(let day=0;day<days.length;day++)//по дням
			{	let time = Object.keys(obj['Открытое'][days[day]]);
				for (t=0;t<time.length;t++)//по времени
				{	if(!obj['Открытое'][days[day]][time[t]].address) continue;//пропускаем, если нет адреса
					if(!out[town[i]]) out[town[i]] = [];//создаем массив для города
					let arr = [];
					arr.push(time[t]);//время
					arr.push(name[num]);//группа
					let address = obj['Открытое'][days[day]][time[t]].address;
					if(!!obj['Открытое'][days[day]][time[t]].address_add) address += ' '+obj['Открытое'][days[day]][time[t]].address_add;
					arr.push(address);//адрес с допом
					arr.push(days[day]);//день
					if(!!obj['Открытое'][days[day]][time[t]].add_url) arr.push(obj['Открытое'][days[day]][time[t]].add_url);
					else arr.push('');
					out[town[i]].push(arr);
				}
			}
		}
	}
	//console.log(JSON.stringify(out,null,2));
	if(!out) return;//если ничего не собрали
	
	//соберем файл расписания открытых
	let str = '🔷<strong>Расписание открытых собраний</strong>🔷\n\n';
	town = Object.keys(out);//массив городов
	for(let i=0;i<town.length;i++)//по городам
	{	str += '<strong>'+town[i]+'</strong>\n\n';
		for(let k=0;k<out[town[i]].length;k++)//по группам
		{	str += '<strong>'+out[town[i]][k][0]+'</strong>';//время
			str += ' - «'+out[town[i]][k][1]+'» - ';//группа
			str += out[town[i]][k][2]+'\n';//адрес с допом, перевод строки
			str += out[town[i]][k][3]+'\n';//день
			str += '<a href="'+out[town[i]][k][4]+'">Маршрут</a>\n\n';
		}
	}
	str += 'Расписание открытых собраний города <a  href="https://na-volga.ru/sobraniya-anonimnie-narkomani/an-v-sterlitamake/" >Стерлитамак</a>, время и место их проведения Вы можете уточнить позвонив по номеру\n'; 
	str += '<strong>+79173702268</strong> или <strong>+79610402244</strong>\n';
	str += 'Расписание открытых собраний города <a  href="https://na-volga.ru/an-v-neftekamske/" >Нефтекамск</a>, время и место их проведения Вы можете уточнить позвонив по номеру\n'; 
	str += '<strong>+79656540044</strong>\n';
	str += 'Расписание открытых собраний городов <a  href="https://na-sea.ru/raspisanie-grupp/tujmazy.html" >Туймазы</a> и <a  href="https://na-sea.ru/raspisanie-grupp/oktyabrskij.html" >Октябрьский</a>, время и место их проведения Вы можете уточнить позвонив по номеру\n'; 
	str += '<strong>+79003225686</strong>\n';
	
	//запишем файл текущего дня /../../pso/Rassilka/raspis_open.txt
    let obj = {}; obj.text = str; obj.mode = 'HTML';
	let err = fs.writeFileSync(FileRaspisOpen, /*"\ufeff" +*/ JSON.stringify(obj,null,2));
    if(!!err) {console.log(err);}
	
}catch(err){console.log(err);}
}
//====================================================================
//запускаем функции
(async () => 
{
  //console.log();//пустая строка-разделитель
  //проверим директорию с файлом таблицей
  if(fs.existsSync(FileXlsDir))
  {	//читаем все файлы в директории
	let list = fs.readdirSync(FileXlsDir);//только имена
	if(!list.length) return;//если файлов нет
	//оставляем только нужные файлы
	for(let i=list.length-1;i>=0;i--) {if(list[i].search(MaskaXls)<0) list.splice(i,1);}
	let index = list.indexOf(FileZagol);//ищем файл заголовка
	if(index >= 0) 
	{	await Convert(FileXlsDir+'/'+FileZagol);//конвертируем заголовок первым
		list.splice(index,1);//убираем из списка
	}
	if(!list.length) return;//если файлов нет
	
	for(let i=0;i<list.length;i++)//конвертируем файлы групп
	{	await Convert(FileXlsDir+'/'+list[i]);
	}
	
	await save_today_file();
	setCsvYandex();
	save_open_file();
	//console.log(new Date()+' parserxls - OK!');
  }
})();
//====================================================================

