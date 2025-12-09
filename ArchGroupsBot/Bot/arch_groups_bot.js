process.env["NTBA_FIX_350"] = 1;
const fs = require('fs');
const path = require('path');
const moment = require('moment');
const TelegramBot = require('node-telegram-bot-api');
//const cp = require('child_process');
const currentDir = (process.env.CURRENT_DIR) ? process.env.CURRENT_DIR : __dirname;
const FileReaderList = currentDir+"/ReaderList.txt";//имя файла списка чтение
const FileBlackList = currentDir+"/BlackList.txt";//имя файла черного листа
const FilePasswordList = currentDir+"/PasswordList.txt";//имя файла списка с паролем
const FileAdminBot = currentDir+"/AdminBot.txt";//имя файла списка админов бота
const FileWriterList = currentDir+"/WriterList.txt";//имя файла списка чтение/запись
const FileKeyboard = currentDir+"/json/knopki.json";
//const FilePID = currentDir+"/ChildProc.txt";//имя файла ПИД дочернего процесса
const FileComitee = currentDir+"/Comitee.txt";//имя файла списка комитетов
const FileYear = currentDir+"/Year.txt";//имя файла списка годов
const FileGrandCount = currentDir+"/GrandCount.txt";//имя файла счетчика посещений общий
const TokenDir=currentDir+"/Token";//путь к папке с токенами, на уровень выше
const reportDir=currentDir+"/reports";//путь к папке с отчетами
const LOGGING = true;//включение/выключение записи лога в файл
//---------------------------------------------------
//сразу проверяем или создаем необходимые папки и файлы
setContextFiles();
//----------------------------------------------------
const chat_Supervisor = require(TokenDir+"/chatId.json").Supervisor;//пользователь 'Supervisor'
//проверим папку логов
if(!fs.existsSync(currentDir+"/../log"))
{fs.mkdirSync(currentDir+"/../log"); fs.chmod(currentDir+"/../log", 0o777, () => {});
}
var nameBot = 'my_arch_bot'; try{nameBot = require(TokenDir+'/'+require(currentDir+"/filename_bot.json").file_arch_bot).comment} catch (err) {}//имя бота
const LogFile = currentDir+"/../log/"+nameBot+'.log';

//загрузим имена файлов ботов
let flagMso=false,objbot={},mestnost='',tokenLog;
let MsoBot, logBot;
try {
objbot = JSON.parse(fs.readFileSync(currentDir+"/filename_bot.json"));
}
catch (err){console.log(err);WriteFileJson(currentDir+"/filename_bot.json",objbot);}

//if(Object.hasOwn(objbot, 'mso_enable')) flagMso=objbot.mso_enable;
if(Object.hasOwn(objbot, 'mestnost')) mestnost = objbot.mestnost;//название местности
try{tokenLog = require(TokenDir+"/logs_bot.json").token;}catch(err){}

//запуск ботов
const Bot = new TelegramBot(require(TokenDir+'/'+objbot.file_arch_bot).token, {polling: true});
//if(flagMso) MsoBot = new TelegramBot(require(TokenDir+'/'+objbot.file_mso_bot).token, {polling: true});
if(!!tokenLog) logBot = new TelegramBot(tokenLog, {polling: false});
//---------------------------------------------------
let ReaderList=new Object();//массив допущенных к чтению
let WriterList=new Object();//массив допущенных к чтению/записи
let BlackList=new Object();//массив забаненных
let PasswordList=new Object();//массив пароля
let AdminBot=new Object();//массив админов бота
let CountPass=new Object();//массив счетчиков попыток ввода пароля
let WaitText=new Object();//флаг готовности приема текста от юзера
let ForDeletePath=new Object();//пути файлов для удаления
let LastMessId=new Object();//массив для хранения нужных message_id
let GrandCount = new Object();//счетчик чтений отчетов общий
const TmpPath = "/tmp";//путь для временных файлов
let keyboard = require(FileKeyboard);// массив клавиатур из файла, будут изменены далее
let masComi=[];//кнопки выбора подкомитетов, можно менять
let masYear=[];//кнопки выбора года, можно менять
const masMonth=['01','02','03','04','05','06','07','08','09','10','11','12'];
const masMonthStr=['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];
const smilik = '¯\\_(ツ)_/¯';
//====================================================================
//====================================================================
//сначала читаем сохраненные списки
//====================================================================
//прочитаем файл Comitee.txt
try {
masComi = JSON.parse(fs.readFileSync(FileComitee));
}
catch (err){
masComi = ['Весна','Красна','Ноябрь','Новичок'];
WriteFileJson(FileComitee,masComi);	
}

//прочитаем файл Year.txt
try {
masYear = JSON.parse(fs.readFileSync(FileYear));
}
catch (err){
masYear = ['2022','2023','2024'];
WriteFileJson(FileYear,masYear);	
}

//прочитаем сохраненный файл LastMessId.txt
try 
{let bl = fs.readFileSync(currentDir+"/LastMessId.txt");
 LastMessId = JSON.parse(bl);
}
//если файл отсутствует, то создадим его 
catch (err) {WriteFileJson(currentDir+"/LastMessId.txt",LastMessId);}

//лист чтения
try 
{let wl = fs.readFileSync(FileReaderList);
 ReaderList = JSON.parse(wl);
 //проверим на правильность chatId
 let flag=0;
 let keys = Object.keys(ReaderList);
 for(let i in keys) 
 {if(!isValidChatId(keys[i])) {console.log('Неверный chatId в ReaderList='+keys[i]); delete ReaderList[keys[i]]; flag=1;}
 }
 if(flag) WriteFileJson(FileReaderList,ReaderList);//записываем файл
}
catch (err)//если файл отсутствует, то создадим его 
{WriteFileJson(FileReaderList,ReaderList);
}

//лист записи
try 
{let wl = fs.readFileSync(FileWriterList);
 WriterList = JSON.parse(wl);
}
catch (err)//если файл отсутствует, то создадим его 
{WriteFileJson(FileWriterList,WriterList);
}

//черный лист
try 
{let bl = fs.readFileSync(FileBlackList);
 BlackList = JSON.parse(bl);
}
catch (err)//если файл отсутствует, то создадим его 
{WriteFileJson(FileBlackList,BlackList);
}

//список паролей
try 
{let bl = fs.readFileSync(FilePasswordList);
 PasswordList = JSON.parse(bl);
}
catch (err)//если файл отсутствует, то создадим его 
{WriteFileJson(FilePasswordList,PasswordList);
}

//список админов бота
try 
{let bl = fs.readFileSync(FileAdminBot);
 AdminBot = JSON.parse(bl);
 //проверим на правильность chatId
 let flag=0;
 let keys = Object.keys(AdminBot);
 for(let i in keys) 
 {if(!isValidChatId(keys[i])) {console.log('Неверный chatId в AdminBot='+keys[i]); delete AdminBot[keys[i]]; flag=1;}
 }
 if(flag) WriteFileJson(FileAdminBot,AdminBot);//записываем файл
}
catch (err)//если файл отсутствует, то создадим его 
{if(!AdminBot[chat_Supervisor]) {AdminBot[chat_Supervisor] = "Supervisor";}
 WriteFileJson(FileAdminBot,AdminBot);
}

//проверим наличие директории репортов
if(!fs.existsSync(reportDir)) {fs.mkdirSync(reportDir);}//если нет такой, то создаем

//проверим наличие файла лога
try 
{var bl = fs.readFileSync(LogFile);}
//если файл отсутствует, то создадим его 
catch (err) {fs.writeFileSync(LogFile, '\n');}
WriteLogFile('=======================================================', 'непосылать');
WriteLogFile('запуск процесса arch_groups_bot.js', 'непосылать');

//проверим наличие файла общего счетчика чтений отчетов, если файл отсутствует, то создадим его
try {GrandCount = JSON.parse(fs.readFileSync(FileGrandCount));}
catch (err) {GrandCount = initObjCount(); fs.writeFileSync(FileGrandCount, JSON.stringify(GrandCount,null,2));}

//загрузим пароль в переменную
let password;
if(PasswordList.password) password = PasswordList.password;
else {password = '111222'; PasswordList.password=password; WriteFileJson(FilePasswordList,PasswordList);}//левый, пока нету легального
let password2;
if(PasswordList.password2) password2 = PasswordList.password2;
else {password2 = '654321'; PasswordList.password2=password2; WriteFileJson(FilePasswordList,PasswordList);}//левый, пока нету легального

//создадим кнопки с годами и подкомитетами из массивов masComi и masYear
change_buttons();
//перепроверим на наличие новых комитетов в счетчик
GrandCount = initObjCount();

//====================================================================
function klava(keyb, obj)
{	
try{
	var option = new Object();
	if(!!obj)//проверяем наличие форматирования 
	{	if(Object.hasOwn(obj, 'parse_mode')) option.parse_mode = obj.parse_mode;
		else if(Object.hasOwn(obj, 'entities')) option.entities = obj.entities;
		//else option.entities = obj;
	}
	if(Object.hasOwn(keyboard, keyb))//добавляем клаву
	{	option.reply_markup = new Object();
		option.reply_markup.inline_keyboard = keyboard[keyb];
	}

    return option;
}catch(err){console.log(err+'\nfrom klava()'); WriteLogFile(err+'\nfrom klava()');}
}
//====================================================================
// СТАРТ
Bot.onText(/\/start/, async (msg) => 
{
try{
	const chatId = msg.chat.id;
	const name = msg.chat.first_name;
	const user = '@'+msg.chat.username;
	let ban = banUser(chatId);
	let valid = validUser(chatId);
	if(name=='') name = user;
	
	let str='Привет, '+name+'! Это чат-бот сообщества Анонимные Наркоманы местности '+mestnost+'! ';
	str+='С моей помощью Вы сможете сохранить или прочитать отчеты NAших групп. ';
	
	//проверим юзера
	if(ban) await sendMessage(chatId, str+'Извините, ' + name + ', но Вы забанены! Обратитесь к админу. ');
	/*else if(!valid)
	{	sendMessage(chatId, str+'Извините, ' + name + ', но Вам необходимо сначала пройти авторизацию! ');
		send_instruction(chatId,user,'');
	}*/
	else 
	{	await sendMessage(chatId, str); 
		await welcome(chatId,name);
	}
}catch(err){console.log(err+'\nfrom start()'); WriteLogFile(err+'\nfrom start()');}
});
//====================================================================
// ПАРОЛЬ
Bot.onText(/\/pass (.+)/, async (msg, match) => 
{
try{
	const chatId = msg.chat.id;
	const name = msg.chat.first_name;
	const user = ''+msg.chat.username;
	if(!user) user=name;
	if(!name) user='unnown user';
	const pass = match[1];
	let ban = banUser(chatId);
	let valid = validUser(chatId);
	
	//проверяем только незарегистрированного юзера
	if(ban) sendMessage(chatId, 'Извините, ' + user + ', но Вы забанены! Обратитесь к админу.');
	else //if(!valid)
	{	if(pass == password)
		{	ReaderList[chatId] = user;//добавляем юзера в список чтения
			WriteFileJson(FileReaderList,ReaderList);
			welcome(chatId,name);
			let str='Юзер "'+name+'" ('+user+') был добавлен в список для чтения';
			sendMessageToAdmin(str);//пошлем сообщение админам
			WriteLogFile(str, 'непосылать');
            CountPass=new Object();//очищаем счетчик попыток
		}
		else if(pass == password2)
		{	WriterList[chatId] = user;//добавляем юзера в список записи
			WriteFileJson(FileWriterList,WriterList);
			ReaderList[chatId] = user;//добавляем юзера в список чтения
			WriteFileJson(FileReaderList,ReaderList);
			welcome(chatId,name);
			let str='Юзер "'+name+'" ('+user+') был добавлен в список для записи/чтения';
			sendMessageToAdmin(str);//пошлем сообщение админам
			WriteLogFile(str, 'непосылать');
            CountPass=new Object();//очищаем счетчик попыток
		}
		else
		{	sendMessage(chatId, 'Извините, ' + user + ', но пароль не верный! Попробуйте еще разок...');
			send_instruction(chatId,user,pass);
		}
	}
	/*else 
	{	let ind; if(validAdminBot(chatId)) ind='adm01_01'; else ind='01_01';
		sendMessage(chatId, 'В этом нет необходимости, ' + name + ', Вы уже авторизованы ранее!',klava(ind,{parse_mode:"markdown"}));
	}*/
}catch(err){console.log(err+'\nfrom pass()'); WriteLogFile(err+'\nfrom pass()');}
});
//====================================================================
// обработка ответов от кнопок
Bot.on('callback_query', async (msg) => 
{	
try{	
	const chatId = msg.message.chat.id;
	const messId = msg.message.message_id;
	const name = msg.message.chat.first_name;
	let user = ''+msg.message.chat.username;
    if(!user) user=name;
	if(!name) user='unnown user';
	var answer = msg.data.split('_');
	const layer = answer[0];//номер уровня в дереве
	const group = answer[1];//номер набора кнопок
	const button = answer[2];//номер кнопки в наборе
	let ban = banUser(chatId);
	let valid = validUser(chatId);//чтение, запись или админ
	
	//проверяем только незарегистрированного юзера
	if(ban) sendMessage(chatId, 'Извините, ' + name + ', но Вы забанены! Обратитесь к админу.');
	/*else if(!valid)
	{	sendMessage(chatId, 'Извините, ' + name + ', но Вам необходимо сначала пройти авторизацию!');
		send_instruction(chatId,user,'');
	}*/
	else //все в порядке
	{
	
	//----------------------------------------------------------------------------------------------
	//уровень 01
	//----------------------------------------------------------------------------------------------
	if(layer=='01')
	{	
	    //группа 01_01
	    if(group=='01')
	    {	if(button!='01')
			{	//любая кнопка с годом
				LastMessId[chatId].year = button;//сохраняем в юзере выбранный год
				let str = '*'+LastMessId[chatId].year+'г.*\n';
				str += 'Выбери интересующий тебя месяц';
				//await sendMessage(chatId, str, klava('02_01',{parse_mode:"markdown"}));
				await sendMessage(chatId, str, EditMonthButton(chatId));//добавляем на кнопку кол-во файлов
			}
			else//админ
			{	if(validAdminBot(chatId)) 
				{	sendMessage(chatId, 'Админ бота', klava('10_01',{parse_mode:"markdown"}));
					delete WaitText[chatId];//удаляем из листа ожиданий, если есть
				}
			}
		}
	}
	if(layer=='02')
	{	
	    //группа 02_01
	    if(group=='01')
	    {	if(button=='13')//назад
			{	str = 'Выбери интересующий тебя год';
				let ind; if(validAdminBot(chatId)) ind='adm01_01'; else ind='01_01';
				await sendMessage(chatId, str, klava(ind,{parse_mode:"markdown"}));
			}
			else
			{	//любая кнопка с месяцем
				LastMessId[chatId].month = button;//сохраняем в юзере выбранный месяц
                let str = '*'+LastMessId[chatId].year+'-'+LastMessId[chatId].month+'*\n';
				str += 'Выбери группу';
				await sendMessage(chatId, str, EditComiButton(chatId));//добавляем на кнопку кол-во файлов
			}	
		}
		
		//группа 02_02
	    if(group=='02')
	    {	if(button=='10')//назад
			{	let str = '*'+LastMessId[chatId].year+'г.*\n';
				str += 'Выбери интересующий тебя месяц';
				//await sendMessage(chatId, str, klava('02_01',{parse_mode:"markdown"}));
				await sendMessage(chatId, str, EditMonthButton(chatId));//добавляем на кнопку кол-во файлов
			}
			else
			{	//любая кнопка с комитетом
				LastMessId[chatId].comitee = button;//сохраняем в юзере выбранный комитет
				let str = '*'+LastMessId[chatId].year+'-'+LastMessId[chatId].month+'-'+LastMessId[chatId].comitee+'*\n';
				str += 'Выбери действие';
				let ind; if(validAdminBot(chatId)) ind='adm02_03'; else ind='02_03';
				await sendMessage(chatId, str, klava(ind,{parse_mode:"markdown"}));
			}	
		}
		
		//группа 02_03
	    if(group=='03')
	    {	if(button=='01')//записать
			{	if(!(validWriter(chatId) || validAdminBot(chatId)))//если не писатель и не админ
				{	await sendMessage(chatId, 'Извините, ' + name + ', но записи Вам необходимо сначала пройти авторизацию!');
					send_instruction(chatId,user,'');
					return;
				}
				let str = 'Теперь пришли мне отчет в виде текста или файла, возможно форматирование и эмодзи.';
				await sendMessage(chatId, str, klava('02_04',{parse_mode:"markdown"}));
				WaitText[chatId]=20;//взводим флаг ожидания текста отчета от админа
			}
			if(button=='02')//прочитать
			{	if(!valid)//если не писатель, не читатель и не админ
				{	await sendMessage(chatId, 'Извините, ' + name + ', но для чтения Вам необходимо сначала пройти авторизацию!');
					send_instruction(chatId,user,'');
					return;
				}
				//сделаем путь
				let pathRep=reportDir+'/'+LastMessId[chatId].year+'/'+LastMessId[chatId].month+'/'+LastMessId[chatId].comitee;
				//проверим путь
				if(fs.existsSync(pathRep))//если путь существует
				{	const isFile = fileName => {return fs.lstatSync(fileName).isFile()};
					//загружаем список файлов из pathRep - полный путь
					let FilesList = fs.readdirSync(pathRep).map(fileName => {return path.join(pathRep, fileName)}).filter(isFile);
					//если в списке не json, то удаляем
					for(let i=FilesList.length-1; i>=0; i--) if(FilesList[i].indexOf('.json')<0) FilesList.splice(i, 1);
					if(Object.keys(FilesList).length>0)//если есть файлы 
					{	let count=0;
                        for(let i in FilesList)
						{	let obj = new Object();
							obj = JSON.parse(fs.readFileSync(FilesList[i]));
							if(Object.hasOwn(obj, 'type') && obj.type=='file')//если файл
							{let capt = obj.caption;
							 let ent = obj.caption_entities;
							 let path = obj.path;//путь из объекта
							 let file_id = obj.file_id;
							 if(obj.file_id)
							 {//проверяем наличие файла на сервере Телеграм
							  let info=false; try{info=await Bot.getFile(file_id);} catch(err){}
							  if(info) path = file_id;//если есть отклик, то замена пути на file_id
							 }
							 await sendDocument(chatId, path, {caption:capt,caption_entities:ent});
							}
							else //иначе текст
							{await sendMessage(chatId, obj.text, {entities:obj.entities});//посылаем отчеты
							}
                            count++;
						}
						let str = '👆 *Получите '+count+'шт!* 👆';
						await sendMessage(chatId, str, klava('02_04',{parse_mode:"markdown"}));//назад
						GrandCount[LastMessId[chatId].comitee] += 1;
						WriteFileJson(FileGrandCount, GrandCount);
					}
					else//если файлов нет
					{	let str = 'Извиняюсь, в этом периоде отчетов нет '+smilik;
						await sendMessage(chatId, str, klava('02_04'));//назад
					}
				}
				else//если путь недействительный
				{	let str = 'Извиняюсь, в этом периоде отчетов нет '+smilik;
					await sendMessage(chatId, str, klava('02_04'));//назад
				}
			}
			if(button=='10')//назад
			{	let str = '*'+LastMessId[chatId].year+'-'+LastMessId[chatId].month+'*\n';
				str += 'Выбери группу';
				await sendMessage(chatId, str, EditComiButton(chatId));//добавляем на кнопку кол-во файлов
			}
			if(button=='11')//Удалить
			{	//сделаем путь
				let pathRep=reportDir+'/'+LastMessId[chatId].year+'/'+LastMessId[chatId].month+'/'+LastMessId[chatId].comitee;
				//проверим путь
				if(fs.existsSync(pathRep))//если путь существует
				{	const isFile = fileName => {return fs.lstatSync(fileName).isFile()};
					//загружаем список файлов из pathRep - полный путь
					let FilesList = fs.readdirSync(pathRep).map(fileName => {return path.join(pathRep, fileName)}).filter(isFile);
					//если в списке не json, то удаляем
					for(let i=FilesList.length-1; i>=0; i--) if(FilesList[i].indexOf('.json')<0) FilesList.splice(i, 1);
					ForDeletePath=new Object();//чистим массив путей
					if(Object.keys(FilesList).length>0)//если есть файлы
					{	for(let i in FilesList)
						{	ForDeletePath[i] = FilesList[i];//сохраняем пути для удаления
							let obj = new Object();
							obj = JSON.parse(fs.readFileSync(FilesList[i]));
							if(Object.hasOwn(obj, 'type') && obj.type=='file')//если файл
							{let capt = obj.caption;
							 capt += '\n\nНомер = «'+i+'»';
							 let ent = obj.caption_entities;
							 let path = obj.path;//путь из объекта
							 let file_id = obj.file_id;
							 if(obj.file_id)
							 {//проверяем наличие файла на сервере Телеграм
							  let info=false; try{info=await Bot.getFile(file_id);} catch(err){}
							  if(info) path = file_id;//если есть отклик, то замена пути на file_id
							 }
							 await sendDocument(chatId, path, {caption:capt,caption_entities:ent});
							}
							else //иначе текст
							{obj.text += '\n\nНомер = «'+i+'»';
							 await sendMessage(chatId, obj.text, {entities:obj.entities});//посылаем отчеты
							}
						}
						str = 'Внизу каждого отчета показан его номер. Пришли мне номер отчета, который нужно удалить';
						await sendMessage(chatId, str, klava('10_03',{parse_mode:"markdown"}));
						WaitText[chatId]=3;//взводим флаг ожидания номера на удаление от админа
					}
					else//если файлов нет
					{	let str = 'Извиняюсь, в этом периоде отчетов нет '+smilik;
						await sendMessage(chatId, str, klava('02_04'));//назад
					}
				}
				else//если путь недействительный
				{	let str = 'Извиняюсь, в этом периоде отчетов нет '+smilik;
					await sendMessage(chatId, str, klava('02_04'));//назад
				}
			}	
		}
		
		//группа 02_04
	    if(group=='04')
	    {	if(button=='10')//назад
			{	let str = '*'+LastMessId[chatId].year+'-'+LastMessId[chatId].month+'-'+LastMessId[chatId].comitee+'*\n';
				str += 'Выбери действие';
				let ind; if(validAdminBot(chatId)) ind='adm02_03'; else ind='02_03';
				await sendMessage(chatId, str, klava(ind,{parse_mode:"markdown"}));
			}
		}  
	}
	
	if(layer=='10')
	{	
		//группа 10_01
	    if(group=='01')
	    {
			if(button=='01')//Посмотреть пароли
			{	let str = 'Пароль *Reader* = '+PasswordList.password+'\n';
				str += 'Пароль *Writer* = '+PasswordList.password2+'\n';
				await sendMessage(chatId, str, {parse_mode:"markdown"});
				await sendMessage(chatId, '👆 Пароли 👆', klava('10_02',{parse_mode:"markdown"}));
			}
			if(button=='02')//Изменить пароль Reader
			{	let str = 'Пришли мне новый пароль для *Reader*\n';
				str += 'или нажми кнопку Назад';
				await sendMessage(chatId, str, klava('10_02',{parse_mode:"markdown"}));
				WaitText[chatId]=1;//взводим флаг ожидания пароля Reader от админа
			}
			if(button=='03')//Изменить пароль Writer
			{	let str = 'Пришли мне новый пароль для *Writer*\n';
				str += 'или нажми кнопку Назад';
				await sendMessage(chatId, str, klava('10_02',{parse_mode:"markdown"}));
				WaitText[chatId]=2;//взводим флаг ожидания пароля Writer от админа
			}
			if(button=='04')//Показать список Reader
			{	let str = '👇 Список *Reader* 👇\n';
				ReaderList = JSON.parse(fs.readFileSync(FileReaderList));
				let mas=Object.keys(ReaderList);
				let count = 0;
				for(let i in mas) 
				{	let s = ReaderList[mas[i]];
					s = s.replace(/_/g,'\\_');
					str += mas[i]+' = '+s+'\n'; count++;
				}
				str += 'Всего пользователей *Reader* = '+count;
				await sendMessage(chatId, str,{parse_mode:"markdown"});
				str = '👆 Список *Reader* 👆';
				await sendMessage(chatId, str, klava('10_02',{parse_mode:"markdown"}));
			}
			if(button=='05')//Показать список Writer
			{	let str = '👇 Список *Writer* 👇\n';
				WriterList = JSON.parse(fs.readFileSync(FileWriterList));
				let mas=Object.keys(WriterList);
				let count = 0;
				for(let i in mas)
				{	let s = WriterList[mas[i]];
					s = s.replace(/_/g,'\\_');
					str += mas[i]+' = '+s+'\n'; count++;
				}
				str += 'Всего пользователей *Writer* = '+count;
				await sendMessage(chatId, str,{parse_mode:"markdown"});
				str = '👆 Список *Writer* 👆';
				await sendMessage(chatId, str, klava('10_02',{parse_mode:"markdown"}));
			}
			if(button=='06')//Статистика чтений
			{	let str = StatGrand();
				await sendMessage(chatId, str, klava('10_02',{parse_mode:"markdown"}));
			}
			if(button=='10')//Ответ Да на удалить файл
			{	let flag=0;
				try
				{if(ForDeletePath[10]) 
				 {fs.unlinkSync(ForDeletePath[10]); 
				  console.log(ForDeletePath[10]+' was Deleted'); 
				  flag=1;
				 }
				 if(ForDeletePath[11]) 
				 {fs.unlinkSync(ForDeletePath[11]); 
				  console.log(ForDeletePath[11]+' was Deleted'); 
				  flag=1;
				 }
				} catch (e) {console.log(e);}
				if(flag)
				{	let str = '👍 Отчет успешно удален! 👍';
					await sendMessage(chatId, str, klava('10_03',{parse_mode:"markdown"}));//назад
				}
				else
				{	let str = 'Что-то пошло не так... извиняюсь '+smilik;
					await sendMessage(chatId, str, klava('10_03'));//назад
				}
			}
			if(button=='11')//Изменить url
			{	let str = 'Пришли мне новый *url*\n';
				str += 'или нажми кнопку Назад';
				await sendMessage(chatId, str, klava('10_02',{parse_mode:"markdown"}));
				WaitText[chatId]=21;//взводим флаг ожидания нового url от админа
			}
		}
	}
	}
}catch(err){console.log(err+'\nfrom callback_query()'); 
			WriteLogFile(err+'\nfrom callback_query()');
			welcome(chatId,user);
			}
});
//====================================================================
// ловим ТЕКСТЫ
Bot.on('message', async (msg) => 
{	
try{	
	if(!msg.text) {return;}//если текста нет
	if(msg.text.slice(0,1)=='/') return;//если команда
	//console.log(msg);
	
	const chatId = msg.chat.id;
	const username = msg.chat.first_name;
	const user = ''+msg.chat.username;
    if(!user) user=username;
	if(!username) user='unnown user';
	let ban = banUser(chatId);
	let valid = validWriter(chatId) | validAdminBot(chatId);
	
	//проверяем только незарегистрированного юзера
	if(ban) sendMessage(chatId, 'Извините, ' + username + ', но Вы забанены! Обратитесь к админу.');
	/*else if(!valid)
	{	sendMessage(chatId, 'Извините, ' + username + ', но Вам необходимо сначала пройти авторизацию!');
		send_instruction(chatId,user,'');
	}*/
	else //все в порядке
	{	if(valid && !!WaitText[chatId])//если есть ожидаемый текст
		{	if(WaitText[chatId]==1)//ожидаем текст пароля для Reader
			{	password = msg.text;
				if(PasswordList['password'] != password)//если пароли различаются
				{	ReaderList = new Object();//чистим массив читателей
					WriteFileJson(FileReaderList,ReaderList);
				}
				PasswordList['password'] = password;
				WriteFileJson(FilePasswordList,PasswordList);
				
				let str = '👍 Пароль для *Reader* успешно изменен! 👍';
				await sendMessage(chatId, str, klava('10_02',{parse_mode:"markdown"}));//в начало	
			}
			if(WaitText[chatId]==2)//ожидаем текст пароля для Writer
			{	password2 = msg.text;
				if(PasswordList['password2'] != password2)//если пароли различаются
				{	WriterList = new Object();//чистим массив писателей
					WriteFileJson(FileWriterList,WriterList);
				}
				PasswordList['password2'] = password2;
				WriteFileJson(FilePasswordList,PasswordList);
				let str = '👍 Пароль для *Writer* успешно изменен! 👍';
				await sendMessage(chatId, str, klava('10_02',{parse_mode:"markdown"}));//в начало	
			}
			if(WaitText[chatId]==3)//ожидаем номер файла на удаление
			{	let num = msg.text;
				let obj = new Object();
				if(num<Object.keys(ForDeletePath).length)//если номер правильный 
				{	let pathDel = ForDeletePath[num];
					ForDeletePath = new Object();
					obj = JSON.parse(fs.readFileSync(pathDel));
					if(Object.hasOwn(obj, 'type') && obj.type=='file')//если файл
					{let capt = obj.caption;
					 let ent = obj.caption_entities;
					 let path = obj.path;//путь из объекта
					 ForDeletePath[11] = path;
					 let file_id = obj.file_id;
					 if(obj.file_id)
					 {//проверяем наличие файла на сервере Телеграм
					  let info=false; try{info=await Bot.getFile(file_id);} catch(err){}
					  if(info) path = file_id;//если есть отклик, то замена пути на file_id
					 }
					 await sendDocument(chatId, path, {caption:capt,caption_entities:ent});
					 obj.text = '';
					}
					obj.text += '\n\nЭтот отчет необходимо удалить?';
					await sendMessage(chatId, obj.text, klava('10_04',{entities:obj.entities}));//Да/Нет
					ForDeletePath[10] = pathDel;
				}
				else
				{	let str = 'Такого номера не было '+smilik;
					await sendMessage(chatId, str, klava('02_04'));
				}
			}
			if(WaitText[chatId]==20)//ожидаем текст отчета
			{	//проверяем наличие директорий
				let yeaR = moment().year();//год сегодня
				if(	  LastMessId[chatId].year<2020 || LastMessId[chatId].year>yeaR
					|| LastMessId[chatId].month<1 || LastMessId[chatId].month>12
				)
				{let str = 'Ошибка в выборе периода!';
				 await sendMessage(chatId, str, klava('02_05',{parse_mode:"markdown"}));//в начало
				 return;
				}  
				let path=reportDir+'/'+LastMessId[chatId].year;//сначала директория с годом
				if(!fs.existsSync(path)) {fs.mkdirSync(path);}//если нет такой, то создаем
				path += '/'+LastMessId[chatId].month;//потом директория с месяцем
				if(!fs.existsSync(path)) {fs.mkdirSync(path);}//если нет такой, то создаем
				path += '/'+LastMessId[chatId].comitee;//потом директория с комитетом
				if(!fs.existsSync(path)) {fs.mkdirSync(path);}//если нет такой, то создаем
				//теперь соберем имя файла со временем в конце
				path += '/'+moment().format('DDMMYYYY-HH_mm_ss_ms')+'.json';
				//сделаем объект
				let TempText=new Object();
				TempText.text=msg.text;//сам текст
				TempText.entities=JSON.stringify(msg.entities);//форматирование
				WriteFileJson(path,TempText);//записываем файл
				let str = '👍 *Готово!* 👍';
				await sendMessage(chatId, str, klava('02_04',{parse_mode:"markdown"}));//назад
				str='Юзер "'+username+'" добавил отчет ' + path.replace(reportDir,'');
				sendMessageToAdmin(str);//пошлем сообщение админам
				WriteLogFile(str, 'непосылать');
			}
			if(WaitText[chatId]==21)//ожидаем текст нового url
			{	let url = msg.text;
				if(!!url && url.indexOf('https://t.me/')+1)
				{	keyboard['01_01'][keyboard['01_01'].length-1][0].url = url;
					change_buttons();
					let str = '👍 Ссылка для *Вопросов* успешно изменена! 👍';
					await sendMessage(chatId, str, klava('10_02',{parse_mode:"markdown"}));//в начало
				}				
			}
			delete WaitText[chatId];//удаляем из листа ожиданий
		}
		else//левый
		{	welcome(chatId,username);	
		}
	}
}catch(err){console.log(err+'\nfrom message()'); WriteLogFile(err+'\nfrom message()');}
});
//====================================================================
// ловим ФАЙЛЫ
Bot.on('document', async (msg) => 
{	
try{	
	//if(!msg.text) {return;}//если текста нет
	//if(msg.text.slice(0,1)=='/') return;//если команда
	//console.log(msg);
	
	const chatId = msg.chat.id;
	const username = msg.chat.first_name;
	const user = ''+msg.chat.username;
	const file_id = msg.document.file_id;
	const file_size = msg.document.file_size;
	const caption = msg.caption;//подпись
	const caption_entities = JSON.stringify(msg.caption_entities);//форматирование
	//проверяем подпись
	if(Object.hasOwn(msg,'caption') && caption.length > 1000)
	{	await sendMessage(chatId, '🤷‍♂️Сожалею, но подпись не может превышать 1000 символов!🤷‍♂️', klava('02_04',{parse_mode:"markdown"}));//назад
		delete WaitText[chatId];//удаляем из листа ожиданий
		return;
	}
	let filename;
	if(msg.document.file_name) //если у файла есть имя
	{	filename = msg.document.file_name;
	}
	else filename = msg.document.file_unique_id;//если имени нет, то короткий id
    
	if(!user) user=username;
	if(!username) user='unnown user';
	let ban = banUser(chatId);
	let valid = validWriter(chatId) | validAdminBot(chatId);
	
	//проверяем только незарегистрированного юзера
	if(ban) sendMessage(chatId, 'Извините, ' + username + ', но Вы забанены! Обратитесь к админу.');
	/*else if(!valid)
	{	sendMessage(chatId, 'Извините, ' + username + ', но Вам необходимо сначала пройти авторизацию!');
		send_instruction(chatId,user,'');
	}*/
	else //все в порядке
	{	if(valid && !!WaitText[chatId])//если есть ожидаемый
		{	if(WaitText[chatId]==20)//ожидаем текст или файл отчета
			{	//проверяем наличие директорий
				let yeaR = moment().year();//год сегодня
				if(	  LastMessId[chatId].year<2020 || LastMessId[chatId].year>yeaR
					|| LastMessId[chatId].month<1 || LastMessId[chatId].month>12
				)
				{let str = 'Ошибка в выборе периода!';
				 await sendMessage(chatId, str, klava('02_05',{parse_mode:"markdown"}));//в начало
				 return;
				}  
				let path=reportDir+'/'+LastMessId[chatId].year;//сначала директория с годом
				if(!fs.existsSync(path)) {fs.mkdirSync(path);}//если нет такой, то создаем
				path += '/'+LastMessId[chatId].month;//потом директория с месяцем
				if(!fs.existsSync(path)) {fs.mkdirSync(path);}//если нет такой, то создаем
				path += '/'+LastMessId[chatId].comitee;//потом директория с комитетом
				if(!fs.existsSync(path)) {fs.mkdirSync(path);}//если нет такой, то создаем
				//загружаем файл
				let pathfile;
				try {pathfile = await Bot.downloadFile(file_id, path);}//загружаем файл
				catch(err)
				{   let str='Не могу загрузить этот файл '+filename+'!\n';
					str += 'Длина файла = '+file_size+'\n';
					await sendMessage(chatId, str, klava('02_04',{parse_mode:"markdown"}));//назад
					delete WaitText[chatId];//удаляем из листа ожиданий
					console.log(err);
					return;
				}
				//вытащим чисто имя файла
				let tmp=pathfile.split('/');
				let namefile=tmp[tmp.length-1];//имя файла в конце
				//переименуем файл
				let newpath = pathfile.replace(namefile,filename);
				fs.renameSync(pathfile, newpath);
				console.log("New file was loaded to "+newpath);//новый путь с именем файла
				//теперь соберем имя файла со временем в конце
				//сделаем объект
				let TempText=new Object();
				TempText.caption=caption;//подпись
				TempText.caption_entities=caption_entities;//форматирование
				TempText.path=newpath;//путь к файлу
				TempText.file_id=file_id;//идентификатор файла
				TempText.type='file';
				WriteFileJson(path+'/'+moment().format('DDMMYYYY-HH_mm_ss_ms')+'.json',TempText);//записываем файл
				let str = '👍 *Готово!* 👍';
				await sendMessage(chatId, str, klava('02_04',{parse_mode:"markdown"}));//назад
				str='Юзер "'+username+'" добавил файл ' + newpath.replace(reportDir,'');
				sendMessageToAdmin(str);//пошлем сообщение админам
				WriteLogFile(str, 'непосылать');
			}
			delete WaitText[chatId];//удаляем из листа ожиданий
		}
		else//левый
		{	welcome(chatId,username);	
		}
	}
}catch(err){console.log(err+'\nfrom document()'); WriteLogFile(err+'\nfrom document()');}
});
//====================================================================
async function send_instruction(chatId,user,pass)
{	
try{	
	let str = "";
	str += "Пожалуйста, введите пароль в формате '/pass вашпароль' без кавычек, с пробелом";
	sendMessage(chatId, str);
	//тут же проверяем кол-во попыток
	const keys = Object.keys(CountPass);//счетчик попыток
	if(keys.indexOf(''+user)+1) {let count=CountPass[user].count; count+=1; CountPass[user].count=count; CountPass[user].pass=pass;}
	else {CountPass[user]=new Object(); CountPass[user].count=1; CountPass[user].pass=pass;}
	
	if(CountPass[user].count >= 10 && validUser(chatId)==false)
	{	BlackList[chatId] = user;//добавляем юзера в список банов
		WriteFileJson(FileBlackList,BlackList);
        let str='Юзер "'+user+'"  занесен в список банов!';
        sendMessageToAdmin(str);//пошлем сообщение админу
        WriteLogFile(str);
	}
	console.log('CountPass '+user+' = '+JSON.stringify(CountPass[user]));
}catch(err){console.log(err+'\nfrom send_instruction()'); WriteLogFile(err+'\nfrom send_instruction()');}
}
//====================================================================
function welcome(chatId,name)
{	
try{	
	let str='';
	str+='Для сохранения/чтения отчета просто нажимай соответствующие кнопки и следуй моим подсказкам. ';
	str+='Выбери интересующий тебя год.';
	let ind; if(validAdminBot(chatId)) ind='adm01_01'; else ind='01_01';
	sendMessage(chatId, str, klava(ind,{parse_mode:"markdown"}));
}catch(err){console.log(err+'\nfrom welcome()'); WriteLogFile(err+'\nfrom welcome()');}
}
//====================================================================
function sendMessageToAdmin(str, opt)
{
try{
    let keys = Object.keys(AdminBot);
    for(let i in keys) 
	{if(isValidChatId(keys[i])) Bot.sendMessage(keys[i], str, opt);//пошлем сообщение админу из списка
	}
}catch(err){console.log(err+'\nfrom sendMessageToAdmin()'); WriteLogFile(err+'\nfrom sendMessageToAdmin()');}
}
//====================================================================
//проверка юзера на валидность
function validUser(chatId)
{	
try{	
	/*const keys = Object.keys(ReaderList);//лист чтения
	if(keys.indexOf(''+chatId)+1) return true;//есть в разрешенных для чтения
	else if(validWriter(chatId)) return true;//есть в разрешенных для чтения/записи
	else if(validAdminBot(chatId)) return true;//есть в админах бота
	else return false;//нет в разрешенных*/
	return true;
}catch(err){console.log(err+'\nfrom validUser()'); WriteLogFile(err+'\nfrom validUser()');}	
}
//====================================================================
//проверка на право записи
function validWriter(chatId)
{	
	/*const keys = Object.keys(WriterList);
	if(keys.indexOf(''+chatId)+1) return true;//есть в разрешенных
	else return false;//нет в разрешенных*/
	return true;	
}
//====================================================================
//проверка админа бота на валидность
function validAdminBot(chatId)
{	
	const keys = Object.keys(AdminBot);
	if(keys.indexOf(''+chatId)+1 || chatId==chat_Supervisor) return true;//есть в разрешенных
	else return false;//нет в разрешенных	
}
//====================================================================
//проверка банов
function banUser(chatId)
{
	const bans = Object.keys(BlackList);
	if(bans.indexOf(''+chatId)+1) return true;//есть в банах
	else return false;//нет в банах	
}
//====================================================================
//подписка на выход из скрипта
[`SIGINT`, `uncaughtException`, `SIGTERM`].forEach((event) => 
{	process.on(event, async ()=>
	{	//await WriteFileJson(FilePID,'{}');
		fs.writeFile(currentDir+'/LastMessId.txt', JSON.stringify(LastMessId,null,2), async (err) =>
		{if(err) console.log(err);
		 await WriteLogFile('выход из процесса arch_groups_bot.js', 'непосылать');
		 process.exit();
		});
	});
});
//====================================================================
//запись в файл объекта, массива
async function WriteFileJson(path,arr)
{
try{
	if(typeof arr === 'object') res = fs.writeFileSync(path, JSON.stringify(arr,null,2));
    else res = fs.writeFileSync(path, arr);
}catch(err){console.log(err+'\nfrom WriteFileJson()'); WriteLogFile(err+'\nfrom WriteFileJson()');}
}
//====================================================================
async function sendMessage(chatId,str,option)
{   
try{	
	if(!isValidChatId(chatId)) return;//если не число, то не пускаем
	//сохраняем для посл.удаления
	let chat_id='', mess_id='';
	if(LastMessId[chatId]) {chat_id=chatId; mess_id=LastMessId[chatId].messId;}
	
	let res = new Object();
    if(option)
    {	//option.parse_mode = "markdown";
		res=await Bot.sendMessage(chatId, str, option);//посылаем сообщение
		//сохраняем xxx_id, если с кнопками
		if(Object.hasOwn(res, 'reply_markup') && Object.hasOwn(res.reply_markup, 'inline_keyboard'))
		{
		 if(!LastMessId[chatId]) LastMessId[chatId]=new Object();
		 LastMessId[chatId].messId=res.message_id;
		 LastMessId[chatId].username=res.chat.username;
         LastMessId[chatId].first_name=res.chat.first_name;
         //удаляем предыдущее сообщение с кнопками
		 if(!!mess_id) {await remove_message(chat_id, mess_id);}
		}
	}
	else {res=await Bot.sendMessage(chatId, str/*, {parse_mode:"markdown"}*/);}

	return res;
}catch(err){console.log(err+'\nfrom sendMessage()'); WriteLogFile(err+'\nfrom sendMessage()');}
}
//====================================================================
async function remove_message(chatId,messId)
{	
try{await Bot.deleteMessage(chatId, messId);} 
catch(err){ 
	if(String(err).indexOf("message can't be deleted")+1)
	{	try{await Bot.editMessageText("!",{chat_id:chatId, message_id:messId});}
		catch(err1){/*WriteLogFile('Ошибка: не могу исправить старое сообщение\n'+err1, 'непосылать');*/}
		try{await Bot.deleteMessage(chatId, messId);}
		catch(err1){/*WriteLogFile('Ошибка: не могу удалить старое сообщение\n'+err1, 'непосылать');*/}
	}
	else {console.error(err); WriteLogFile(err, 'непосылать');}
}
}
//====================================================================
async function sendDocument(chatId, path, option)
{	
try{//if(!isValidChatId(chatId)) return;//если не число, то не пускаем
	if(Number(chatId)<0) return;//отрицательные chatId не пускаем
	if(!!option && !!option.caption) 
	{if(option.caption.length > 1024) {option.caption = option.caption.substr(0,1023);}//обрезаем подпись
	}
	await Bot.sendDocument(chatId, path, option);
}catch(err){console.log(err+'\nfrom sendDocument()'); WriteLogFile(err+'\nfrom sendDocument()');}
}
//====================================================================
async function WriteLogFile(arr, flag) 
{   if(!LOGGING) return;
	var str=moment().format('DD.MM.YY HH:mm:ss:ms')+' - '+arr+'\n';
    try{await fs.appendFileSync(LogFile, str);} catch(err){console.error(err);}
	try{
		if(!!logBot && !flag) 
		{str='From '+nameBot+'\n'+str;
		 await logBot.sendMessage(chat_Supervisor, str);
		}
	}catch(err){}
}
//====================================================================
//периодически будем проверять какой нынче год
let interval = 6*3600;//в сек
setInterval(function()
{	
try{
	let year = String(moment().year());//год сегодня
	if(masYear.indexOf(year)<0)//если года нет в массиве
	{	masYear.push(year);//добавляем год в массив
		WriteFileJson(FileYear,masYear);//сохраняем массив годов
		change_buttons();//меняем кнопки
	}
}catch(err){console.log(err+'\nfrom setInterval()'); WriteLogFile(err+'\nfrom setInterval()');}
},interval*1000);
//====================================================================
function change_buttons()
{ 
try{	
  //сначала изменим кнопки с годами на значения из массива masYear
  let j=0;
  let url;
  if(keyboard['01_01'].length > 0 && !!keyboard['01_01'][keyboard['01_01'].length-1][0].url) 
	  url = keyboard['01_01'][keyboard['01_01'].length-1][0].url;//сохраним имеющийся url
  keyboard['01_01'] = [];//чистим
  keyboard['adm01_01'] = [];//чистим
  for(let i in masYear)
  {	j = Math.floor(i/2);//по 2 кнопки в строке
	let k = i%2;
	if(!keyboard['01_01'][j]) {keyboard['01_01'].push([]);}
	if(!keyboard['01_01'][j][k]) keyboard['01_01'][j][k] = new Object();
	if(!keyboard['adm01_01'][j]) {keyboard['adm01_01'].push([]);}
	if(!keyboard['adm01_01'][j][k]) keyboard['adm01_01'][j][k] = new Object();
	keyboard['01_01'][j][k].text = masYear[i];
	keyboard['adm01_01'][j][k].text = masYear[i];
	keyboard['01_01'][j][k].callback_data = '01_01_'+masYear[i];
	keyboard['adm01_01'][j][k].callback_data = '01_01_'+masYear[i];
  }
  j = keyboard['01_01'].length;
  if(!keyboard['adm01_01'][j]) {keyboard['adm01_01'].push([]);}
  if(!keyboard['adm01_01'][j][0]) keyboard['adm01_01'][j][0] = new Object();
  keyboard['adm01_01'][j][0].text = 'АдминБота';
  keyboard['adm01_01'][j][0].callback_data = '01_01_01';
  
  //теперь для всех добавим кнопку Вопросы
  j = keyboard['01_01'].length;
  keyboard['01_01'].push([]);//кнопка будет последняя
  keyboard['01_01'][j][0] = new Object();
  keyboard['01_01'][j][0].text = 'Вопросы';
  if(!!url) keyboard['01_01'][j][0].url = url;
  else keyboard['01_01'][j][0].url = "https://t.me/my_url";
  
  j = keyboard['adm01_01'].length;
  keyboard['adm01_01'].push([]);//кнопка будет последняя
  keyboard['adm01_01'][j][0] = new Object();
  keyboard['adm01_01'][j][0].text = 'Вопросы';
  if(!!url) keyboard['adm01_01'][j][0].url = url;
  else keyboard['adm01_01'][j][0].url = "https://t.me/my_url";
  
  //теперь для Админа добавим кнопку изменения url
  j = keyboard['10_01'].length-1;//последний индекс
  while(keyboard['10_01'][j][0].text != 'Статистика чтений' && keyboard['10_01'][j][0].text != 'Список Writer' && j>0) j--;
  if(j>0)
  {	j++;
	if(!keyboard['10_01'][j]) {keyboard['10_01'].push([]);}
	keyboard['10_01'][j][0] = {"text": "Изменить ссылку для Вопросов","callback_data": "10_01_11"};
	j++;
	if(!keyboard['10_01'][j]) {keyboard['10_01'].push([]);}
	keyboard['10_01'][j][0] = {"text": "Назад","callback_data": "02_01_13"};
  }
  
  //затем изменим кнопки с подкомитетами на названия из массива masComi
  keyboard['02_02'] = [];//очищаем массив объектов
  keyboard['02_02'].push([new Object()]);
  for(let i in masComi)
  {	if(!keyboard['02_02'][i]) {keyboard['02_02'].push([new Object()]);}
	keyboard['02_02'][i][0].text = masComi[i];
	keyboard['02_02'][i][0].callback_data = '02_02_'+masComi[i];
  }
  i = masComi.length;
  if(!keyboard['02_02'][i]) {keyboard['02_02'].push([new Object()]);}
  keyboard['02_02'][i][0].text = 'Назад';
  keyboard['02_02'][i][0].callback_data = '02_02_10';
  
  WriteFileJson(FileKeyboard, keyboard);//сохраняем массив кнопок
  
}catch(err){console.log(err+'\nfrom change_buttons()'); WriteLogFile(err+'\nfrom change_buttons()');}
}
//====================================================================
//добавляет к имени кнопки кол-во записей в комитете
// и возвращает объект кнопок
function EditComiButton(chatId)
{
try{
    let obj = new Object();//новая клавиатура будет
    obj.parse_mode = "markdown";
    obj.reply_markup = new Object();
    obj.reply_markup.inline_keyboard = [];
    //узнаем и покажем на кнопке, сколько записей есть у каждого комитета в этом месяце
    for(let i=0;i<masComi.length;i++)//пройдемся по всему массиву комитетов
    {   //собираем кнопку
        obj.reply_markup.inline_keyboard.push([new Object()]);
        obj.reply_markup.inline_keyboard[i][0].text = masComi[i];
        obj.reply_markup.inline_keyboard[i][0].callback_data = '02_02_'+masComi[i];
        //сделаем путь в папку комитета
        let pathRep=reportDir+'/'+LastMessId[chatId].year+'/'+LastMessId[chatId].month+'/'+masComi[i];
        //проверим путь
        if(fs.existsSync(pathRep))//если путь существует
        {   let FilesList = fs.readdirSync(pathRep).map(fileName => {return path.join(pathRep, fileName)});
            //если в списке не json, то удаляем
			for(let i=FilesList.length-1; i>=0; i--) if(FilesList[i].indexOf('.json')<0) FilesList.splice(i, 1);
			let num = FilesList.length;//кол-во файлов
            //изменим кнопку комитета
            if(num>0) obj.reply_markup.inline_keyboard[i][0].text += ' ('+num+')';
        }
    }
    //добавляем кнопку Назад
    let i = masComi.length;
    obj.reply_markup.inline_keyboard.push([new Object()]);
    obj.reply_markup.inline_keyboard[i][0].text = 'Назад';
    obj.reply_markup.inline_keyboard[i][0].callback_data = '02_02_10';
                
    return obj;
}catch(err){console.log(err+'\nfrom EditComiButton()'); WriteLogFile(err+'\nfrom EditComiButton()');}
}
//====================================================================
//добавляет к имени кнопки кол-во записей в месяце по всем комитетам
// и возвращает объект кнопок
function EditMonthButton(chatId)
{
try{
    let obj = new Object();//новая клавиатура будет
    obj.parse_mode = "markdown";
    obj.reply_markup = new Object();
    obj.reply_markup.inline_keyboard = [];
    //узнаем и покажем на кнопке, сумму записей всех комитетов в этом месяце
    for(let j=0;j<masMonth.length;j++)//пройдемся по всему массиву месяцев
	{ //собираем кнопку - 4 строки по 3 кнопки в ряду
      let nrow = Math.floor(j/3);//номер строки кнопок
      if((nrow+1) > obj.reply_markup.inline_keyboard.length) obj.reply_markup.inline_keyboard.push([new Object()]);
	  if((j%3+1) > obj.reply_markup.inline_keyboard[nrow].length) obj.reply_markup.inline_keyboard[nrow].push(new Object());
	  obj.reply_markup.inline_keyboard[nrow][j%3].text = masMonthStr[j];
      obj.reply_markup.inline_keyboard[nrow][j%3].callback_data = '02_01_'+masMonth[j];
	  let sumnum = 0;//сумма записей в месяце
	  for(let i=0;i<masComi.length;i++)//пройдемся по всему массиву комитетов
      { //сделаем путь в папку комитета
        let pathRep=reportDir+'/'+LastMessId[chatId].year+'/'+masMonth[j]+'/'+masComi[i];
        //проверим путь
        if(fs.existsSync(pathRep))//если путь существует
        {   let FilesList = fs.readdirSync(pathRep).map(fileName => {return path.join(pathRep, fileName)});
            //если в списке не json, то удаляем
			for(let i=FilesList.length-1; i>=0; i--) if(FilesList[i].indexOf('.json')<0) FilesList.splice(i, 1);
			let num = FilesList.length;//кол-во файлов
            //прибавим найденное к сумме
            if(num>0) sumnum += num;
        }
      }
	  //изменим кнопку месяца
      if(sumnum>0) obj.reply_markup.inline_keyboard[nrow][j%3].text += ' ('+sumnum+')';
    }
	//добавляем кнопку Назад
    let i = obj.reply_markup.inline_keyboard.length;
	obj.reply_markup.inline_keyboard.push([new Object()]);
	obj.reply_markup.inline_keyboard[i][0].text = 'Назад';
    obj.reply_markup.inline_keyboard[i][0].callback_data = '02_01_13';
                
    return obj;
}catch(err){console.log(err+'\nfrom EditMonthButton()'); WriteLogFile(err+'\nfrom EditMonthButton()');}
}
//====================================================================
function initObjCount()
{   
try{	
	let mas = new Object();
	if(masComi.length<=0) return mas;
	let key =  masComi;//массив имен комитетов  
    for(let i in key) 
    {	if(!Object.hasOwn(GrandCount, key[i])) mas[key[i]] = 0;
		else mas[key[i]] = GrandCount[key[i]];
	}
    return mas;
}catch(err){console.log(err+'\nfrom initObjCount()'); WriteLogFile(err+'\nfrom initObjCount()');}
}
//====================================================================
// Команда StatGrand
function StatGrand()
{
  try{
		let str = '';
		let num_users = Object.keys(LastMessId).length;//кол-во подписчиков
		str += 'Число активных подписчиков на сегодня = '+num_users+'\n\n';
		str += '*Общая сумма за все время:*\n\n';
		//теперь выведем суммы счетчиков в строку
		let num = Object.keys(GrandCount);//массив имен комитетов
		for(let i in num) str += '  *'+num[i]+'* = '+GrandCount[num[i]]+'\n';	
        return str;
  }catch(err){console.log(err); return err;}
}
//====================================================================
function isValidChatId(value) 
{
    if(typeof(value)==='string')
	{return /^-?\d+$/.test(value);//целые отрицательные можно
	 //return /^\d+$/.test(value);//целые отрицательные нельзя
	 //return /^-?\d+(\.\d+)?$/.test(value);//вещественные отрицательные можно
	}
	else if(typeof(value)==='number') return true;
	else return false;
}
//====================================================================
// ловим КОМАНДУ хештег в чате МСО
if(flagMso) MsoBot.onText(/^#отчет (.+)-(\d+)-(\d+)/, async (msg, match) => //в начале строки до конца слова
{
try{	
	let opt = new Object();
	if(msg.message_thread_id) opt.message_thread_id = msg.message_thread_id;//id темы в группе, если есть
	const comitee = match[1].replace(/\s/g,'');
	const month = match[2].replace(/\s/g,'');
	const year = match[3].replace(/\s/g,'');
	
	
	if(msg.chat.id==chat_id_MSO)
	{	if(masMonth.indexOf(month)+1)
		{	let obj = new Object();
			obj.text = msg.text;
			obj.entities = msg.entities;
			obj.comitee = comitee;
			obj.month = month;
			obj.year = year;
			//читаем файлы комитетов и годов
			/*let masComi=[], masYear=[];
			try{	masComi = JSON.parse(fs.readFileSync(FileComitee));
					masYear = JSON.parse(fs.readFileSync(FileYear));
			} catch(err) {await sendMessage(ServiceChat, JSON.stringify(err,null,2));}*/
			//проверяем правильность даты и комитета
			if((masYear.indexOf(obj.year)+1)&&(masMonth.indexOf(obj.month)+1)&&(masComi.indexOf(obj.comitee)+1))
			{	//посылаем сообщение родителю
				await from_mso(obj);
				await MsoBot.sendMessage(chat_id_MSO, 'Спасибо, '+msg.from.first_name+'('+msg.from.username+'), отчет от тебя принят!', opt);
			}
			else await MsoBot.sendMessage(chat_id_MSO, 'Извиняюсь, '+msg.from.first_name+'('+msg.from.username+'), недопустимая дата в хештеге '+obj.comitee+'-'+obj.month+'-'+obj.year, opt);
		}
	}
}catch(err){await sendMessage(ServiceChat, JSON.stringify(err,null,2)); WriteLogFile(err+'\nfrom MsoBot.onText()');}
});
//====================================================================
// Ловим сообщение от дочернего бота в группе МСО
async function from_mso(m) 
{	
try{//принимаем объект с отчетом и хештегом
	//sendMessageToAdmin(JSON.stringify(m,null,2));
	//проверим комитет, месяц и год
	if((masYear.indexOf(m.year)+1)&&(masMonth.indexOf(m.month)+1)&&(masComi.indexOf(m.comitee)+1))
	{	//sendMessageToAdmin(JSON.stringify(m,null,2));
		let path=reportDir+'/'+m.year;//сначала директория с годом
		if(!fs.existsSync(path)) {fs.mkdirSync(path);}//если нет такой, то создаем
		path += '/'+m.month;//потом директория с месяцем
		if(!fs.existsSync(path)) {fs.mkdirSync(path);}//если нет такой, то создаем
		path += '/'+m.comitee;//потом директория с комитетом
		if(!fs.existsSync(path)) {fs.mkdirSync(path);}//если нет такой, то создаем
		//теперь соберем имя файла со временем в конце
		path += '/'+moment().format('DDMMYYYY-HH_mm_ss_ms')+'.json';
		//сделаем объект
		let TempText=new Object();
		TempText.text=m.text;//сам текст
		TempText.entities=JSON.stringify(m.entities);//форматирование
		WriteFileJson(path,TempText);//записываем файл
		//пошлем сообщение админам
		let str='Сообщение от *mso-bot*: _пришел отчет с хештегом_ *'+m.comitee+'-'+m.month+'-'+m.year+'*. _Отчет записан._';
		sendMessageToAdmin(str, {parse_mode:"markdown"});
		WriteLogFile(str, 'непосылать');
	}
	else
	{	let str='Сообщение от mso-bot: недопустимая дата в хештеге *'+m.comitee+'-'+m.month+'-'+m.year+'*';
		WriteLogFile(str, 'непосылать');
	}
}catch(err) {sendMessageToAdmin(err); WriteLogFile(err+'\nfrom from_mso()');}
}
//====================================================================
//если бот запускается в пустой папке местности, то нужно создать папки и файлы по-умолчанию
//из контекста сборки, или из ENV
//это будет работать только из контейнера
function setContextFiles()
{//файлы контекста находятся в /home/pi/context/Bot
	let cBot = '/home/pi/context/Bot';
	let cToken = cBot+'/Token';
	let SUPERVISOR = (process.env.SUPERVISOR) ? process.env.SUPERVISOR : '';//чатайди супера из ENV
	let TOKEN_BOT = (process.env.TOKEN_BOT) ? process.env.TOKEN_BOT : '';//токен бота из ENV
	let NAME_BOT = (process.env.NAME_BOT) ? process.env.NAME_BOT : '';//имя бота из ENV
	let TOKEN_LOG = (process.env.TOKEN_LOG) ? process.env.TOKEN_LOG : '';//токен лог-бота из ENV
	let NAME_LOG = (process.env.NAME_LOG) ? process.env.NAME_LOG : '';//имя лог-бота из ENV
	//let TOKEN_MSO = (process.env.TOKEN_MSO) ? process.env.TOKEN_MSO : '';//токен мсо-бота из ENV
	//let NAME_MSO = (process.env.NAME_MSO) ? process.env.NAME_MSO : '';//имя мсо-бота из ENV
	let REGION = (process.env.REGION) ? process.env.REGION : '';//имя местности из ENV
	//let MSO_ENABLE = (process.env.MSO_ENABLE) ? process.env.MSO_ENABLE : '';//выключатель МСО из ENV
	//let CHATID_MSO = (process.env.CHATID_MSO) ? process.env.CHATID_MSO : '';//chatId МСО из ENV
	if(!fs.existsSync(currentDir+'/json')) {fs.mkdirSync(currentDir+'/json');}//создадим папку, если ее нет
	if(!fs.existsSync(TokenDir)) {fs.mkdirSync(TokenDir);}//создадим папку, если ее нет
	if(fs.existsSync(cBot))
	{	
		if(fs.existsSync(cBot+'/json/knopki.json') && !fs.existsSync(currentDir+'/json/knopki.json'))
		{fs.copyFileSync(cBot+'/json/knopki.json',currentDir+'/json/knopki.json');}
		if(fs.existsSync(cBot+'/readme.txt'))//текстовые файлы переписываем принудительно
		{fs.copyFileSync(cBot+'/readme.txt',currentDir+'/readme.txt');}
		if(!fs.existsSync(currentDir+'/filename_bot.json'))
		{	let tmp=currentDir.split('/'); 
			let name=tmp[tmp.length-1]+'_bot.json';//вытащим чисто имя папки в конце
			let obj = {};
			obj.file_arch_bot = name;
			//obj.file_mso_bot = '';
			//obj.mso_enable = false;
			obj.mestnost = 'НазваниеНашейМестности';
			WriteFileJson(currentDir+'/filename_bot.json',obj);
		}
		if(fs.existsSync(currentDir+'/filename_bot.json'))//если файл уже имеется
		{	let obj;
			try{obj = require(currentDir+'/filename_bot.json');}catch(err){console.log(err);}
			if(typeof(obj) != 'object') 
			{	obj={}; 
				let tmp=currentDir.split('/'); 
				let name=tmp[tmp.length-1]+'_bot.json';//вытащим чисто имя папки в конце
				obj.file_arch_bot = name;
				//obj.file_mso_bot = '';
				//obj.mso_enable = false;
				obj.mestnost = 'НазваниеНашейМестности'; 
				WriteFileJson(currentDir+'/filename_bot.json',obj);
			}
			//если запрошено изменение параметров мсо-бота в ENV
			/*if(!!TOKEN_MSO || !!NAME_MSO) 
			{	if(!obj.file_mso_bot)//то создаем ссылку на файл с токеном
				{	let tmp=currentDir.split('/');
					obj.file_mso_bot=tmp[tmp.length-1]+'_mso_bot.json';//вытащим чисто имя папки в конце
					WriteFileJson(currentDir+'/filename_bot.json',obj);
				}
			}*/
			//если запрошено изменение выключателя МСО
			//if(!!MSO_ENABLE) {obj.mso_enable = MSO_ENABLE; WriteFileJson(currentDir+'/filename_bot.json',obj);}
			//если запрошено изменение местности
			if(!!REGION) {obj.mestnost = REGION; WriteFileJson(currentDir+'/filename_bot.json',obj);}			
		}
	}
	if(fs.existsSync(cToken))
	{	
		if(!fs.existsSync(TokenDir+'/chatId.json'))
		{	let obj = {};
			obj.Supervisor = "123456789";
			//obj.chat_id_MSO = '';
			WriteFileJson(TokenDir+'/chatId.json',obj);
		}
		if(fs.existsSync(TokenDir+'/chatId.json'))//если файл уже имеется
		{	let obj;
			try{obj = require(TokenDir+"/chatId.json");}catch(err){console.log(err);}
			if(typeof(obj) != 'object') {obj={}; obj.Supervisor="123456789";/*obj.chat_id_MSO="";*/ WriteFileJson(TokenDir+'/chatId.json',obj);}
			//если запрошено изменение чатайди МСО в ENV
			//if(!!CHATID_MSO) {obj.chat_id_MSO = CHATID_MSO; WriteFileJson(TokenDir+'/chatId.json',obj);}
		}
		//файл токена лог бота
		if(!fs.existsSync(TokenDir+'/logs_bot.json'))
		{WriteFileJson(TokenDir+'/logs_bot.json',{"token":"сюда надо вписать токен бота", "comment":"имя_бота"});}
		if(fs.existsSync(TokenDir+'/logs_bot.json'))//если файл уже имеется
		{	let obj;
			try{obj = require(TokenDir+'/logs_bot.json');}catch(err){console.log(err);}
			if(typeof(obj) != 'object')
			{obj={}; obj.token = "ТокенБотаЛогов"; obj.comment = "имяБота";
			 WriteFileJson(TokenDir+'/logs_bot.json',obj);
			}
			//если запрошено изменение токена лог-бота в ENV
			if(!!TOKEN_LOG) {obj.token = TOKEN_LOG; WriteFileJson(TokenDir+'/logs_bot.json',obj);}
			//если запрошено изменение имени лог-бота в ENV
			if(!!NAME_LOG) {obj.name = NAME_LOG; WriteFileJson(TokenDir+'/logs_bot.json',obj);}
		}
		//файл токена основного бота
		let filenamebot = require(currentDir+"/filename_bot.json").file_arch_bot;
		if(!fs.existsSync(TokenDir+'/'+filenamebot))//если файла с токеном нет, то создадим по-умолчанию
		{WriteFileJson(TokenDir+'/'+filenamebot,{"token":"сюда надо вписать токен бота", "comment":"имя_бота"});}
		if(fs.existsSync(TokenDir+'/'+filenamebot))//если файл уже имеется
		{	let obj;
			try{obj = require(TokenDir+'/'+filenamebot);}catch(err){console.log(err);}
			if(typeof(obj) != 'object')
			{obj={}; obj.token = "ТокенБота"; obj.comment = "имяБота";
			 WriteFileJson(TokenDir+'/'+filenamebot,obj);
			}
			//если запрошено изменение токена лог-бота в ENV
			if(!!TOKEN_BOT) {obj.token = TOKEN_BOT; WriteFileJson(TokenDir+'/'+filenamebot,obj);}
			//если запрошено изменение имени лог-бота в ENV
			if(!!NAME_BOT) {obj.name = NAME_BOT; WriteFileJson(TokenDir+'/'+filenamebot,obj);}
		}
		//файл токена МСО бота
		/*filenamebot = require(currentDir+"/filename_bot.json").file_mso_bot;
		if(!fs.existsSync(TokenDir+'/'+filenamebot))//если файла с токеном нет, то создадим по-умолчанию
		{WriteFileJson(TokenDir+'/'+filenamebot,{"token":"сюда надо вписать токен бота", "comment":"имя_бота"});}
		if(fs.existsSync(TokenDir+'/'+filenamebot))//если файл уже имеется
		{	let obj;
			try{obj = require(TokenDir+'/'+filenamebot);}catch(err){console.log(err);}
			if(typeof(obj) != 'object')
			{obj={}; obj.token = "ТокенБота"; obj.comment = "имяБота";
			 WriteFileJson(TokenDir+'/'+filenamebot,obj);
			}
			//если запрошено изменение токена мсо-бота в ENV
			if(!!TOKEN_MSO) {obj.token = TOKEN_MSO; WriteFileJson(TokenDir+'/'+filenamebot,obj);}
			//если запрошено изменение имени мсо-бота в ENV
			if(!!NAME_MSO) {obj.name = NAME_MSO; WriteFileJson(TokenDir+'/'+filenamebot,obj);}
		}*/
	}
}
//====================================================================
