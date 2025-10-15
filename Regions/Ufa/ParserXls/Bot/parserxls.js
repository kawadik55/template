process.env["NTBA_FIX_350"] = 1;
const fs = require('fs');
const XLSX = require('xlsx');

const currentDir = (process.env.CURRENT_DIR) ? process.env.CURRENT_DIR : __dirname;
const wwwDir=currentDir+"/../www";//путь к папке www, на уровень выше
const utilsDir=wwwDir+'/utils';
const RassilkaDir = currentDir+"/../Rassilka";
const RassilkaDirOpen = currentDir+"/../../pso/Rassilka";
//const RassilkaDir = currentDir+"/../Parser";
const FileRaspis = RassilkaDir+'/raspis.txt';//файл с расписанием на день.
const FileRaspisOpen = RassilkaDirOpen+'/raspis_open.txt';//файл открытых с расписанием
const FileCommitee = RassilkaDir+'/commitee.txt';//файл с расписанием комитетов
const FileXlsDir = currentDir+'/../XlsBot/doc/1';//папка
//const FileZagol = /^ListUfa\.xls+x?$/;//маска файла, xlsx или xls.
const FileZagol = 'Местность.xls';//маска заголовочного файла местности, xls
const MaskaXls = /^.+\.xls$/;//маска файлов табличных

//проверим наличие папки www, если папки нет, то создадим ее
if(!fs.existsSync(wwwDir)) {fs.mkdirSync(wwwDir);}
//проверим наличие папки Rassilka, если папки нет, то создадим ее
if(!fs.existsSync(RassilkaDir)) {fs.mkdirSync(RassilkaDir);}

let List = {};

//====================================================================
//конвертация одного файла
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
	if(Object.keys(sheets).length>0)//запишем файл
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
	//проверим, есть ли лист Локаций
	let location = {};
	if(!!sheets['Локация'] && sheets['Локация'].length>0)
	{	for(let i in sheets['Локация'])
		{	let id = '';
			if(!!sheets['Локация'][i]['ID']) id = sheets['Локация'][i]['ID'];
			if(id=='') continue; 
			if(!!sheets['Локация'][i]['ID']) location[id] = {};
			if(!!sheets['Локация'][i]['Группа'] && !!id) location[id].group = sheets['Локация'][i]['Группа'];
			if(!!sheets['Локация'][i]['Город'] && !!id) location[id].town = sheets['Локация'][i]['Город'];
			if(!!sheets['Локация'][i]['Адрес'] && !!id) location[id].adress = sheets['Локация'][i]['Адрес'];
			if(!!sheets['Локация'][i]['Как пройти'] && !!id) location[id].adress_add = sheets['Локация'][i]['Как пройти'];
			if(!!sheets['Локация'][i]['2гис'] && !!id) location[id].map2gis = sheets['Локация'][i]['2гис'];
			if(!!sheets['Локация'][i]['Маршрут'] && !!id) location[id].karta = sheets['Локация'][i]['Маршрут'];
			if(!!sheets['Локация'][i]['Вход / Фото'] && !!id) location[id].photo = sheets['Локация'][i]['Вход / Фото'];
		}
	}
	
	//далее будем собирать группы и комитеты
	let groups = {};//сюда собираем группы
	let commitee = {};//сюда собираем комитеты
	if(!!List.groups) groups = List.groups;//если уже есть, то ссылаемся на него
	if(!!List.commitee) commitee = List.commitee;//если уже есть, то ссылаемся на него
	let spisok = Object.keys(sheets);//список листов таблицы
	for(let i=0;i<spisok.length;i++) {if(spisok[i]=='Местность') {spisok.splice(i,1); break;}}//уберем лишнее
	for(let i=0;i<spisok.length;i++) {if(spisok[i]=='Локация') {spisok.splice(i,1); break;}}//уберем лишнее
	
	for(let i in spisok)//по листам
	{	let name_list = spisok[i];
		if(sheets[name_list].length==0) continue;//пропускаем, если массив объектов пустой
		if(name_list != 'Все собрания') continue;//должен остаться только один лист
		
		for(let num=0;num<sheets[name_list].length;num++)
		{	let town, day, time, name, adres, address_add, karta, photo, tema, comment, map2gis, longtime, online;
			let format;
			let stat = [], floating = {};
			//если есть ссылка на лист локаций, то заполним из него
			if(!!sheets[name_list][num]['Локация'])
			{	let id = sheets[name_list][num]['Локация'];
				if(!!id && !!location[id])
				{	if(!!location[id].group) name = location[id].group.trim();
					if(!!location[id].town)
					{	town = 'г.' + location[id].town.trim();
						if(town.search(/^г./)<0) town = 'г.' + town;
					}
					if(!!location[id].adress) adres = location[id].adress.trim();
					if(!!location[id].adress_add) address_add = location[id].adress_add.trim();
					if(!!location[id].map2gis) map2gis = location[id].map2gis.trim();
					if(!!location[id].karta) karta = location[id].karta.trim();
					if(!!location[id].photo) photo = location[id].photo.trim();
				}
			}
			//определим периодичность
			if(!!sheets[name_list][num]['1й']) stat.push(1);
			if(!!sheets[name_list][num]['2й']) stat.push(2);
			if(!!sheets[name_list][num]['3й']) stat.push(3);
			if(!!sheets[name_list][num]['4й']) stat.push(4);
			if(!!sheets[name_list][num]['5й']) stat.push(5);
			if(!!sheets[name_list][num]['Последний']) stat.push('last');
			if(!!sheets[name_list][num]['Период недель']&&!!sheets[name_list][num]['Дата'])
			{	stat = [];//если плавающая периодичность, то чистим статический массив
				try
				{	floating.period = parseInt(sheets[name_list][num]['Период недель']);
					floating.ref_data = sheets[name_list][num]['Дата'];
					if(!floating.period || floating.period<1) {floating = {}; continue;}
					//вычислим дату ближайшего собрания
					let period = floating.period;//период в неделях
					let ref_data = floating.ref_data;//опорная дата в строке
					let mas = ref_data.split('.');
					if(!period || mas.length!=3) continue;//ошибка
					ref_data = mas[2]+'.'+mas[1]+'.'+mas[0];//перевернем дату для буржуйского представления
					let date = new Date();//текущая дата
					let date1 = new Date(ref_data);//опорная дата
					let diff_days = Math.floor((date - date1)/(24*3600*1000));//разница в днях
					if(diff_days<0) continue;//ошибка
					let k = Math.ceil(diff_days/(period*7))*(period*7);//большее кратное периоду
					date = new Date(date1.getTime()+new Date(k*24*3600*1000).getTime());//к опоре прибавляем дни по периоду
					let year = date.getFullYear();
					let month = date.getMonth()+1;
					let day = date.getDate();
					if(month<10) month = '0'+month;//делаем ведущий 0
					if(day<10) day = '0'+day;//делаем ведущий 0
					if(diff_days%(period*7)==0) floating.next_data = 'сегодня';
					else floating.next_data = day+'.'+month+'.'+year;//дата ближайшего собрания
				}catch(err){console.log(err);floating = {};}
			}
			if(stat.length==0 && !floating.period) {continue;}//если ошибки то пропускаем

			if(!!sheets[name_list][num]['День']) day = sheets[name_list][num]['День'].trim();
			if(!!sheets[name_list][num]['Время']) time = sheets[name_list][num]['Время'].trim();
			if(!!sheets[name_list][num]['Длительность']) longtime = sheets[name_list][num]['Длительность'].trim();
			if(!!sheets[name_list][num]['Тема']) tema = sheets[name_list][num]['Тема'].trim();
			if(!!sheets[name_list][num]['Комментарий']) comment = sheets[name_list][num]['Комментарий'].trim();
			if(!!sheets[name_list][num]['Онлайн']) online = sheets[name_list][num]['Онлайн'].trim();
			//формат
			if(!!sheets[name_list][num]['Закрытое']) {format = 'Закрытое';}
			else if(!!sheets[name_list][num]['Открытое']) {format = 'Открытое';}
			else if(!!sheets[name_list][num]['Рабочее']) {format = 'Рабочее';}
			else format = 'Неизвестное';
			//добавим в выходной объект
			if(!!town && !!name)//имена объектов группы
			{	let obj = {}, count;
				if(!!sheets[name_list][num]['Комитет'])//если это файл комитетов, то там есть такая колонка
				{	if(!commitee[town]) commitee[town] = {};//город
					if(!commitee[town][name]) commitee[town][name] = [];//группа
					commitee[town][name].push({});
					count=commitee[town][name].length-1;
					obj = commitee[town][name][count];
				}
				else//иначе это группа
				{	if(!groups[town]) groups[town] = {};//город
					if(!groups[town][name]) groups[town][name] = [];//группа
					groups[town][name].push({});
					count=groups[town][name].length-1;
					obj = groups[town][name][count];
				}
				if(!!format) obj.format = format;
				if(!!time) obj.time = time;//время
				if(!!longtime) obj.longtime = longtime;
				if(!!day) obj.day = day;//день
				if(stat.length>0) {obj.type = 'static'; obj.period = stat;}
				if(!!floating.period) 
				{obj.type = 'floating'; 
				 obj.period = floating.period; 
				 obj.ref_data = floating.ref_data;
				 obj.next_data = floating.next_data;
				 if(!!comment) comment += ' (ближайшее: '+obj.next_data+')';
				 else comment = '(ближайшее: '+obj.next_data+')';
				}
				if(!!tema) obj.tema = tema;
				else obj.tema = 'Ежедневник';
				if(!!adres) obj.address = adres;
				if(!!address_add) obj.address_add = '('+address_add+')';
				if(!!karta) obj.add_url = karta;
				if(!!photo) obj.photo = photo;
				if(!!online) obj.online = online;
				if(!!map2gis) obj.map2gis = map2gis;
				if(!!comment) obj.comment = comment;
			}
		}
	}
	
	//сортируем по названиям групп
	let towns = Object.keys(groups);
	for(let i in towns) groups[towns[i]] = Object.fromEntries(Object.entries(groups[towns[i]]).sort());
	//сортируем по названиям комитетов
	towns = Object.keys(commitee);
	for(let i in towns) commitee[towns[i]] = Object.fromEntries(Object.entries(commitee[towns[i]]).sort());
	//сохраняем итоговый объект групп
	if(!List.groups) List.groups = groups;
	//сохраняем итоговый объект комитетов
	if(!List.commitee) List.commitee = commitee;
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
/*async function setCsvYandex()
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
}*/
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
	
	//получим номер сегодняшнего дня недели в этом месяце
	let lastWeek=false;//признак последней недели месяца
	let date = new Date();//текущее местное время
	let DateOfMonth = date.getDate();//текущее число
	let month = date.getMonth();//текущий месяц
	let year = date.getFullYear();//текущий год
	let lastDateOfMonth = new Date(year, month + 1, 0).getDate();//последнее число в месяце
	let firstWeekday = new Date(year, month, 1).getDay();//первое число месяца
	let offsetDate = (dayWeek - firstWeekday + 7)%7;//до первого dayWeek в месяце
	let date1 = new Date(year,month,1+offsetDate).getTime();//дата первого dayWeek
	let weekOfMonth = date - date1;
	weekOfMonth = Math.trunc(weekOfMonth/(1000 * 3600 * 24));//разница в целых днях, будет кратна 7
	weekOfMonth = Math.trunc(weekOfMonth/7) + 1;//номер текущего сегодняшнего дня недели в месяце
	if((lastDateOfMonth-DateOfMonth)<7) lastWeek=true;//последняя неделя
	
	for(let i=0;i<town.length;i++)//по городам
	{	let name = Object.keys(groups[town[i]]);//массив групп в городе
		if(name.length==0) continue;//если групп нету, то пропускаем этот город
		for(let num=0;num<name.length;num++)//по группам
		{	let mas = groups[town[i]][name[num]];//массив собраний по имени группы
			if(mas.length == 0) continue;//пропускаем группу, если нет собраний
			for(let n in mas)//по массиву собраний
			{	//пропускаем группу, если нет нужных форматов
				if(mas[n].format!='Закрытое'&&mas[n].format!='Открытое'/*&&mas[n].format!='Рабочее'*/) continue;
				//будем собирать выходной массив - имя, время, адрес, тема, карта, коммент, некст дата, format
				//если сегодняшний день недели имеется в записи
				if(masDay[dayWeek] == mas[n].day)
				{	let time = mas[n].time;
					//проверим, совпадает ли день недели в периоде
					if(mas[n].type=='static') //если период статический
					{	let period = mas[n].period;//массив периода - недели месяца
						if(!period || period.length==0) continue;//ошибка
						//если только last и это не сегодня - пропускаем
						if(period.includes('last')&&period.length==1&&!lastWeek) {continue;}
						//если в периоде только цифры и сегодня не та неделя - пропускаем
						if(!period.includes(weekOfMonth)&&!period.includes('last')) {continue;}
						//если в периоде есть last и цифры, но это не сегодня - пропускаем
						if(period.includes('last')&&!lastWeek&&!period.includes(weekOfMonth)) {continue;}
					}
					else if(mas[n].type=='floating') //если период плавающий
					{	if(mas[n].next_data != 'сегодня') continue;//если не сегодня, то пропускаем
					}
					else continue;//иначе ошибка
					
					if(!out[town[i]]) out[town[i]] = [];
					let cnt;
					if(lastWeek)//если сегодня last неделя, то проверяем массив на совпадения имени и времени
					{	for(let k=0; k<out[town[i]].length; k++)//пробежимся по всему массиву
						{	//если запись с таким именем и временем уже есть
							if(out[town[i]][k][0]==('«'+name[num]+'»')&&out[town[i]][k][1]==time)
							{	//если текущая запись имеет приоритет = last, то перезаписываем имеющуюся
								if(mas[n].period.includes('last')) {cnt=i; break;}//устанавливаем счетчик
								else continue;//иначе пропускаем собрание
							}
						}
					}
					if(!cnt)
					{	out[town[i]].push(new Array(7));//имя, время, адрес, тема, карта, коммент, формат
						cnt = out[town[i]].length-1;
					}
					//сделаем гиперссылку из названия группы
					//if(!!mas[n].photo) 
					//	out[town[i]][cnt][0] = '<a  href="'+mas[n].photo+'" >'+name[num]+'</a>';
					//else out[town[i]][cnt][0] = '«'+name[num]+'»';//если url нет, то просто имя группы
					out[town[i]][cnt][0] = '«'+name[num]+'»';
					//время
					out[town[i]][cnt][1] = time;
					//адрес
					let address_add = (!!mas[n].address_add)? mas[n].address_add.trim():'';
					let address = mas[n].address;
					if(address.indexOf('https://')+1) address = '<b><a  href="'+address+'" >Онлайн собрание</a></b>'; 
					if(!!address_add) out[town[i]][cnt][2] = address+' '+address_add+';';
					else out[town[i]][cnt][2] = address+';';
					//тема
					out[town[i]][cnt][3] = '';
					if(!!mas[n].tema && mas[n].tema != ' ') 
					{	let tema = mas[n].tema;
						let online;
						if(!!mas[n].online) online = mas[n].online;
						if(!!online) tema = '<b><a  href="'+online+'" >'+tema+'</a></b>';//гиперссылкой
						if(tema.indexOf('Открытое')+1) out[town[i]][cnt][3] += '\nТема: <b>'+tema+'</b>';//жирный
						else if(tema.indexOf('Рабочее')+1) out[town[i]][cnt][3] += '\nТема: <b>'+tema+'</b>';//жирный
						else out[town[i]][cnt][3] += '\nТема: <i>'+tema+'</i>';//курсивом
					}
					//карта
					let karta = '';
					if(!!mas[n].add_url) karta += '\n'+'<a  href="'+mas[n].add_url+'" >Маршрут</a>';
					out[town[i]][cnt][4] = karta;
					//комментарий
					out[town[i]][cnt][5] = '';
					let comment;
					if(mas[n].comment) comment = mas[n].comment;
					if(!!comment) out[town[i]][cnt][5] = '\n'+comment;
					//формат
					out[town[i]][cnt][6] = '';
					if(mas[n].format) out[town[i]][cnt][6] = '\nФормат: <i>'+mas[n].format+'</i>';
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
				let comment = out[town[i]][j][5];
				//let format = out[town[i]][j][6];//пока формат не выводим
				//соберем результат
				str += '<strong>'+time+'</strong> - '+name+' - '+adres+tema+comment+karta+'\n\n';
			}
		}
	}
	if(!out || Object.keys(out).length==0) str += 'К сожалению, сегодня собраний нет... 😩';
			
	//добавляем объявление
	str += 'Расписание собраний города <a  href="https://na-volga.ru/sobraniya-anonimnie-narkomani/an-v-sterlitamake/" >Стерлитамак</a>, время и место их проведения Вы можете уточнить позвонив по номеру \n<strong>+79173702268</strong> или <strong>+79610402244</strong>\n';
	str += 'Расписание собраний города <a  href="https://na-volga.ru/an-v-neftekamske/" >Нефтекамск</a>, время и место их проведения Вы можете уточнить позвонив по номеру \n<strong>+79656540044</strong>\n';
	str += 'Расписание собраний города <a  href="https://na-sea.ru/raspisanie-grupp/tujmazy.html" >Туймазы</a>, время и место их проведения Вы можете уточнить позвонив по номеру \n<strong>+79376005686</strong>\n';
	str += '\n<a  href="https://vps.na-ufa.ru/commitee.html" >Расписание комитетов МКО Уфа</a>\n';
	
	//запишем файл текущего дня в папку /Rassilka/raspis.txt
    let obj = {}; obj.text = str; obj.mode = 'HTML';
	let err = fs.writeFileSync(FileRaspis, /*"\ufeff" +*/ JSON.stringify(obj,null,2));
    if(err) {console.log(err);}
	//запишем расписание в формате html
	str = obj.text;
	str = str.replace(/\n/g,'<br />');//делаем перевод строки html
	err = '';
	err = fs.writeFileSync(currentDir+'/raspis.html', "\ufeff" + str);
	if(!!err) console.log(err);
	err = '';
	err = fs.writeFileSync(utilsDir+'/raspis.html', "\ufeff" + str);
	if(!!err) console.log(err);
	
}catch(err){console.log(err);}
}
//====================================================================
//запишем расписание рабочек комитетов в файл
async function save_commitee_file()
{
try{	
	let masDay=['','Понедельник','Вторник','Среда','Четверг','Пятница','Суббота','Воскресенье'];
	let groups = '';
	if(!!List.commitee) groups = List.commitee;
	else {console.log('Ошибка! Отсутствует объект List.commitee'); return;}
	//по текущему дню недели создадим расписание из объекта
	var dayWeek = new Date().getDay();//сегодня день недели
	if(dayWeek==0) dayWeek=7;//приведем к формату 1..7
	let str = '🔷<strong>Расписание рабочих собраний комитетов</strong>🔷\n\n';//заголовок
	//str += '<strong>'+masDay[dayWeek]+'</strong>\n\n';//день недели в заголовке
	let town = Object.keys(groups);//массив городов
	if(!town) {console.log('Ошибка! Отсутствует массив городов'); return;}
	let out = {};//выходной объект
	
	//получим все что нужно в этом месяце
	let lastWeek=false;//признак последней недели месяца
	let date = new Date();//текущее местное время
	let DateOfMonth = date.getDate();//текущее число
	let month = date.getMonth();//текущий месяц
	let year = date.getFullYear();//текущий год
	let lastDateOfMonth = new Date(year, month + 1, 0).getDate();//последнее число в месяце
	let firstWeekday = new Date(year, month, 1).getDay();//первое число месяца
	let offsetDate = (dayWeek - firstWeekday + 7)%7;//до первого dayWeek в месяце
	let date1 = new Date(year,month,1+offsetDate).getTime();//дата первого dayWeek
	let weekOfMonth = date - date1;
	weekOfMonth = Math.trunc(weekOfMonth/(1000 * 3600 * 24));//разница в целых днях, будет кратна 7
	weekOfMonth = Math.trunc(weekOfMonth/7) + 1;//номер текущего сегодняшнего дня недели в месяце
	if((lastDateOfMonth-DateOfMonth)<7) lastWeek=true;//последняя неделя
	
	for(let i=0;i<town.length;i++)//по городам
	{	let name = Object.keys(groups[town[i]]);//массив комитетов в городе
		if(name.length==0) continue;//если комитетов нету, то пропускаем этот город
		for(let num=0;num<name.length;num++)//по комитетам
		{	let mas = groups[town[i]][name[num]];//массив собраний по имени комитета
			if(mas.length == 0) continue;//пропускаем комитет, если нет собраний
			for(let n in mas)//по массиву собраний
			{	//будем собирать выходной массив - имя, время, адрес, тема, карта, коммент, некст дата, format
				//если день недели имеется в записи
				if(!!mas[n].day)
				{	let time = mas[n].time;
					if(!out[town[i]]) out[town[i]] = [];
					let cnt;
					out[town[i]].push(new Array(7));//имя, время, адрес, день, карта, коммент, формат
					cnt = out[town[i]].length-1;
					//сделаем гиперссылку из названия комитета
					//if(!!mas[n].photo) 
					//	out[town[i]][cnt][0] = '<a  href="'+mas[n].photo+'" >'+name[num]+'</a>';
					//else out[town[i]][cnt][0] = '«'+name[num]+'»';//если url нет, то просто имя комитета
					out[town[i]][cnt][0] = '«'+name[num]+'»';
					//время
					out[town[i]][cnt][1] = time;
					//адрес
					let address_add = (!!mas[n].address_add)? mas[n].address_add.trim():'';
					let address = mas[n].address;
					if(address.indexOf('https://')+1) address = '<b><a  href="'+address+'" >Онлайн собрание</a></b>'; 
					if(!!address_add) out[town[i]][cnt][2] = address+' '+address_add+';';
					else out[town[i]][cnt][2] = address+';';
					//день
					out[town[i]][cnt][3] = '';
					if(mas[n].type=='static') //если период статический
					{	let period = mas[n].period;//массив периода - недели месяца
						let str = '<i>'+mas[n].day+' - ';//начало курсива жиром
						for(let k in period) {if(period[k]=='last') str += 'последняя '; else str += period[k]+'я, ';}
						str += 'неделя месяца:</i>';//конец курсива
						out[town[i]][cnt][3] = str;
					}
					else if(mas[n].type=='floating') //если период плавающий
					{	let period = mas[n].period;//раз в x недели
						let str = '<i>'+mas[n].day+' - раз в '+period+' недели (ближайшее: '+mas[n].next_data+'):</i>';//курсив жиром
						out[town[i]][cnt][3] = str;
					}
					else out[town[i]][cnt][3] = 'Неизвестный день'; 
					//карта
					let karta = '';
					if(!!mas[n].add_url) karta += '<a  href="'+mas[n].add_url+'" >Маршрут</a>';
					out[town[i]][cnt][4] = karta;
					//комментарий
					out[town[i]][cnt][5] = '';
					let comment;
					if(mas[n].comment) comment = mas[n].comment;
					if(!!comment) out[town[i]][cnt][5] = '\n'+comment;
					//формат
					out[town[i]][cnt][6] = '';
					if(mas[n].format) out[town[i]][cnt][6] = '\nФормат: <i>'+mas[n].format+'</i>';
				}
			}
		}
		
		if(!!out[town[i]])//если есть собрания
		{	//сортируем по именам комитетов
			out[town[i]].sort(function(a,b) 
			{	if (a === b) {return 0;}
				else {return (a < b) ? -1 : 1;}
			});
			//соберем строку для телеги
			let line = '====================\n';
			str += '<strong>'+'Местность '+town[i]+'</strong>\n\n';//город
			for(let j=0; j<out[town[i]].length; j++)
			{	name = line + (str.indexOf(out[town[i]][j][0])+1 ? '' : (out[town[i]][j][0]+'\n')) + line;
				if(str.indexOf(out[town[i]][j][0])+1) name = '\n';
				else name = line + out[town[i]][j][0] + '\n' + line;
				let time = out[town[i]][j][1];
				let adres = out[town[i]][j][2]+'\n';
				let day = out[town[i]][j][3]+'\n';
				let karta = !!out[town[i]][j][4] ? (out[town[i]][j][4]+'\n') : '';
				let comment = '';//out[town[i]][j][5];
				//let format = out[town[i]][j][6];//пока формат не выводим
				//соберем результат
				str += '<strong>'+name+'</strong>'+day+adres+karta;
			}
			str += '<b>'+line+'</b>';
		}
	}
	if(!out || Object.keys(out).length==0) str += 'К сожалению, сегодня собраний нет... 😩';
			
	//запишем файл комитетов в папку /Rassilka/commitee.txt
    let obj = {}; obj.text = str; obj.mode = 'HTML';
	let err = fs.writeFileSync(FileCommitee, /*"\ufeff" +*/ JSON.stringify(obj,null,2));
    if(err) {console.log(err);}
	//запишем расписание в формате html
	str = obj.text;
	str = str.replace(/\n/g,'<br />');//делаем перевод строки html
	err = '';
	err = fs.writeFileSync(currentDir+'/commitee.html', "\ufeff" + str);
	if(!!err) console.log(err);
	err = '';
	err = fs.writeFileSync(utilsDir+'/commitee.html', "\ufeff" + str);
	if(!!err) console.log(err);
	
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
	await save_commitee_file();
	//setCsvYandex();
	//save_open_file();
	//console.log(new Date()+' parserxls - OK!');
  }
})();
//====================================================================

