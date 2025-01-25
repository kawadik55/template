process.env["NTBA_FIX_350"] = 1;
const fs = require('fs');
const XLSX = require('xlsx');

const currentDir = (process.env.CURRENT_DIR) ? process.env.CURRENT_DIR : __dirname;
const wwwDir=currentDir+"/../www";//путь к папке www, на уровень выше
const RassilkaDir = currentDir+"/../Rassilka";
//const RassilkaDir = currentDir+"/../Parser";
const FileRaspis = RassilkaDir+'/raspis.txt';//файл с расписанием на день

const FileXlsDir = currentDir+'/../XlsBot/doc/1';//папка
const FileXlsName = /^ListKzn\.xls+x?$/;//маска файла, xlsx или xls

//проверим наличие папки www, если папки нет, то создадим ее
if(!fs.existsSync(wwwDir)) {fs.mkdirSync(wwwDir);}
//проверим наличие папки Rassilka, если папки нет, то создадим ее
if(!fs.existsSync(RassilkaDir)) {fs.mkdirSync(RassilkaDir);}

let List = {}, ListNew = {};

//====================================================================
function Convert(Path)
{
try{
	let sourse = '', sheets = {};
	try{sourse = XLSX.readFile(Path);}catch(err){console.log(err);}
	if(!!sourse)
	{	//скопируем файл для http-сервера
		if(!fs.existsSync(wwwDir+'/utils')) {fs.mkdirSync(wwwDir+'/utils');}//создадим папку, если ее нет
		let filename = Path.split('/')[Path.split('/').length-1];//последний элемент это имя файла
		fs.copyFileSync(Path, wwwDir+'/utils/'+filename);//копируем файл
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
	{	let mas = sheets['Местность'];
		if(!!mas[0]['region']) {ListNew.region = List.region = mas[0]['region'];}
		if(!!mas[0]['short']) {ListNew.shortname = List.shortname = mas[0]['short'];}
		if(!!mas[0]['email']) {ListNew.email = List.email = mas[0]['email'];}
		if(!!mas[0]['rubric_id']) {ListNew.rubric_id = List.rubric_id = mas[0]['rubric_id'];}
		if(!!mas[0]['site']) {ListNew.site = List.site = mas[0]['site'];}
		ListNew.links = {};
		if(!!mas[0]['phone']) {ListNew.links.phone = mas[0]['phone'];}
		if(!!mas[0]['telegream']) ListNew.links.telegream = mas[0]['telegream'];
		if(!!mas[0]['whatsApp']) ListNew.links.whatsApp = mas[0]['whatsApp'];
		if(!!mas[0]['vk']) ListNew.links.vk = mas[0]['vk'];
		if(!!mas[0]['yandexDzen']) ListNew.links.yandexDzen = mas[0]['yandexDzen'];
		if(!!mas[0]['bot']) ListNew.links.bot = mas[0]['bot'];
		ListNew.links.newsletter = {};
		if(!!mas[0]['newsTelegram']) ListNew.links.newsletter.telegram = mas[0]['newsTelegram'];
		if(!!mas[0]['newsWhatsApp']) ListNew.links.newsletter.whatsApp = mas[0]['newsWhatsApp'];
		List.links = ListNew.links;
	}
	//добавим в шапку Комитеты
	if(!!sheets['Комитеты'])
	{	let mas = sheets['Комитеты'];
		ListNew.serviceCommittees = [];
		for(let i in mas)
		{	ListNew.serviceCommittees.push(new Object());
			if(!!mas[i]['id']) ListNew.serviceCommittees[i].id = parseInt(mas[i]['id']);
			if(!!mas[i]['title']) ListNew.serviceCommittees[i].title = mas[i]['title'];
			if(!!mas[i]['description']) ListNew.serviceCommittees[i].description = mas[i]['description'];
			if(!!mas[i]['mail']) ListNew.serviceCommittees[i].mail = mas[i]['mail'];
			if(!!mas[i]['phone']) ListNew.serviceCommittees[i].phone = mas[i]['phone'];
		}
		List.serviceCommittees = ListNew.serviceCommittees;
	}
	
	//далее будем собирать группы
	let groups = {};//сюда будем отсортировывать группы по новому
	let oldgroups = {};//тут будет объект в обычном формате
	let towns = Object.keys(sheets);//список городов (=листов таблицы)
	for(let i=0;i<towns.length;i++) {if(towns[i]=='Местность') {towns.splice(i,1); break;}}//уберем лишнее
	for(let i=0;i<towns.length;i++) {if(towns[i]=='Комитеты') {towns.splice(i,1); break;}}//уберем лишнее
	for(let i in towns)//по городам
	{	let town = towns[i];
		if(sheets[town].length==0) continue;//пропускаем, если массив пустой
		for(let num=0;num<sheets[town].length;num++)//по массиву собраний города
		{	let id, name, description, format, oldformat, day, time, tema, address, address_add, image, coordinates, add_url, longtime;
			let mas = sheets[town][num];
			if(!!mas['id']) id = mas['id'].trim();
			if(!!mas['name']) name = mas['name'].trim();
			if(!!mas['description']) description = mas['description'].trim();
			if(!!mas['format']) format = mas['format'].trim();
			oldformat = format;
			if(format == 'Закрытое') format = 'closeMeetingtime';
			else if(format == 'Открытое') format = 'openMeetingtime';
			else if(format == 'Рабочее') format = 'serviceMeetingtime';
			else format = 'unnowh';
			if(!!mas['day']) day = mas['day'].trim();
			if(!!mas['time']) time = mas['time'].trim();
			if(!!mas['tema']) tema = mas['tema'].trim();
			if(!!mas['address']) address = mas['address'].trim();
			if(!!mas['address_add']) address_add = mas['address_add'].trim();
			if(!!mas['image']) image = mas['image'].trim();
			if(!!mas['add_url']) add_url = mas['add_url'].trim();
			coordinates = new Array(2);
			try{if(!!mas['coordinates1']) coordinates[0] = parseFloat(mas['coordinates1']);}catch(err){coordinates[0] = 0;}
			try{if(!!mas['coordinates2']) coordinates[1] = parseFloat(mas['coordinates2']);}catch(err){coordinates[1] = 0;}
			if(!!mas['longtime']) longtime = mas['longtime'].trim();
			//добавим в выходной объект
			if(!!format && !!name && !!day && !!time)//имена объектов группы
			{	//для нового формата
				if(!groups[town]) groups[town] = {};//город
				if(!groups[town][name]) groups[town][name] = {};//группа
				if(!!id && !groups[town][name].id) groups[town][name].id = id;
				if(!!name && !groups[town][name].name) groups[town][name].name = name;
				if(!!description && !groups[town][name].description) groups[town][name].description = description;
				if(!groups[town][name][format]) groups[town][name][format] = [];//формат
				let obj = {};
				obj.day = day;
				obj.time = time;
				if(!!address) obj.address = address;
				if(!!address_add) obj.address_add = address_add;
				if(!!tema) obj.tema = tema;
				if(!!image) obj.image = image;
				if(!!add_url) obj.add_url = add_url;
				obj.coordinates = coordinates;//массив
				if(!!longtime) obj.longtime = longtime;
				groups[town][name][format].push(obj);
				
				// по старому
				if(!oldgroups[town]) oldgroups[town] = {};//город
				if(!oldgroups[town][name]) oldgroups[town][name] = {};//группа
				if(!oldgroups[town][name][oldformat]) oldgroups[town][name][oldformat] = {};//формат
				if(!oldgroups[town][name][oldformat][day]) oldgroups[town][name][oldformat][day] = {};//день
				if(!oldgroups[town][name][oldformat][day][time]) oldgroups[town][name][oldformat][day][time] = {};//время
				obj = oldgroups[town][name][oldformat][day][time];
				obj.day = day;
				obj.time = time;
				obj.town = town;//город для удобства
				if(!!address) obj.address = address;
				if(!!address_add) obj.address_add = address_add;
				if(!!tema) obj.tema = tema;
				if(!!image) obj.photo = image;
				if(!!add_url) obj.add_url = add_url;
				obj.coordinates = coordinates;//массив
				if(!!longtime) obj.longtime = longtime;
			}
		}
	}
	
	//сортируем по названиям групп
	towns = Object.keys(groups);
	for(let i in towns) groups[towns[i]] = Object.fromEntries(Object.entries(groups[towns[i]]).sort());
	towns = Object.keys(oldgroups);
	for(let i in towns) oldgroups[towns[i]] = Object.fromEntries(Object.entries(oldgroups[towns[i]]).sort());
	
	//переделываем объект по новому
	towns = Object.keys(groups);//города
	let towns_tmp = [];
	for(let i in towns)//по городам
	{	let obj = {};
		obj.town = towns[i];
		obj.groups = [];
		let names = Object.keys(groups[towns[i]]);
		if(names.length==0) continue;
		for(let k in names)//по группам в городе
		{	obj.groups.push(groups[towns[i]][names[k]]);
		}
		towns_tmp.push(obj);
	}
	
	
	//сохраняем итоговый объект групп по новому
	ListNew.towns = towns_tmp;
	let err = fs.writeFileSync(currentDir+'/groupsnew.json', "\ufeff" + JSON.stringify(ListNew,null,4));
	if(!!err) {console.log(err);}
	err = '';
	err = fs.writeFileSync(wwwDir+'/groupsnew.json', "\ufeff" + JSON.stringify(ListNew,null,4));
	if(!!err) {console.log(err);}
	
	//сохраняем объект по нормальному
	List.groups = oldgroups;
	err = '';
	err = fs.writeFileSync(currentDir+'/groups.json', "\ufeff" + JSON.stringify(List,null,4));
	if(!!err) {console.log(err);}
	err = '';
	err = fs.writeFileSync(wwwDir+'/groups.json', "\ufeff" + JSON.stringify(List,null,4));
	if(!!err) {console.log(err);}
	//err = '';
	//err = fs.writeFileSync(wwwDir+'/groupsOrg.json', "\ufeff" + JSON.stringify(List,null,4));
	//if(!!err) {console.log(err);}
	
	//сделаем расписание на сегодня
	//save_today_file(oldgroups);
	
}catch(err){console.log(err);}
}
//====================================================================
//запишем текст текущего дня в файл
async function save_today_file(groups)
{
try{	
	let masDay=['','Понедельник','Вторник','Среда','Четверг','Пятница','Суббота','Воскресенье'];
	//let groups = '';
	//if(!!List.groups) groups = List.groups;
	//else {console.log('Ошибка! Отсутствует объект groups для расписания'); return;}
	//по текущему дню недели создадим расписание из объекта
	var dayWeek = new Date().getDay();
	if(dayWeek==0) dayWeek=7;//приведем к формату 1..7
	//подготовим текст для Телеги
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
						if(!!obj['Закрытое'][days[day]][time[t]].add_url) 
							out[town[i]][cnt][0] = '<a  href="'+obj['Закрытое'][days[day]][time[t]].add_url+'" >'+name[num]+'</a>';
						else out[town[i]][cnt][0] = name[num];//если url нет, то просто имя группы
						//out[town[i]][cnt][0] = '«'+name[num]+'»';
						//время
						out[town[i]][cnt][1] = time[t];
						//адрес
						let address_add = obj['Закрытое'][days[day]][time[t]].address_add.trim();
						let address = obj['Закрытое'][days[day]][time[t]].address;
						if(!!address_add) out[town[i]][cnt][2] = address+' ('+address_add+');';
						else out[town[i]][cnt][2] = address+';';
						//тема
						out[town[i]][cnt][3] = '';
						if(!!obj['Закрытое'][days[day]][time[t]].tema && obj['Закрытое'][days[day]][time[t]].tema != ' ') 
							out[town[i]][cnt][3] += '\n<strong>Тема:</strong> <i>'+obj['Закрытое'][days[day]][time[t]].tema+'</i>';
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
	//str += 'Приходи с верой, надеждой!!!😎\n'+'Да и просто так приходи... 😉' + '\n\n';
	   
	//запишем файл текущего дня
    let obj = {}; obj.text = str; obj.mode = 'HTML';
	let err = fs.writeFileSync(FileRaspis, /*"\ufeff" +*/ JSON.stringify(obj,null,2));
    if(!!err) {console.log(err);}
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
//запускаем функции
(async () => 
{
  //console.log();//пустая строка-разделитель
  //проверим директорию с файлом таблицей
  if(fs.existsSync(FileXlsDir))
  {	//читаем все файлы в директории
	let list = fs.readdirSync(FileXlsDir);
	if(!list.length) return;//если файлов нет
	//оставляем только нужные файлы
	for(let i=list.length-1;i>=0;i--) {if(list[i].search(FileXlsName)<0) list.splice(i,1);}
	if(!list.length) return;//если файлов нет
	if(list.length > 1)
	{	let time = [];
		//for(let i=0;i<list.length;i++) {console.log(JSON.stringify(fs.statSync(FileXlsDir+'/'+list[i]),null,2));}
		for(let i=0;i<list.length;i++) {time.push(fs.statSync(FileXlsDir+'/'+list[i]).mtimeMs);}
		let index = 0;
		let t = time[0];
		for(let i=0;i<time.length;i++) {if(time[i]>t) index = i;}//выбираем самый свежий файл
		console.log('Выбрали файл '+list[index]);
		await Convert(FileXlsDir+'/'+list[index]);
	}
	else await Convert(FileXlsDir+'/'+list[0]);
	
	//console.log(new Date()+' parserxls - OK!');
  }
})();
//====================================================================

