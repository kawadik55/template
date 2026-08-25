// utils.js
const moment = require('moment-timezone');

//====================================================================
function parseMarkdownToElements(text) 
{
    let processedText = text;
    const elements = [];
    
    const regex = /\*(.*?)\*|_(.*?)_|~~(.*?)~~|\[(.*?)\]\((.*?)\)/g;//со ссылками
	//const regex = /\*(.*?)\*|_(.*?)_|~~(.*?)~~|\[(.*?)\]\((.*?)\)|\[@(.*?)\]\(user:\/\/(.*?)\)/g;//с упоминанием
    let match;
    
    // Сбрасываем lastIndex перед началом
    regex.lastIndex = 0;
    
    while ((match = regex.exec(processedText)) !== null) 
	{
        // Определяем тип и содержимое
        let type, content, url, userId;
        if (match[1] !== undefined) {
            type = 'STRONG';//жирный
            content = match[1];
        } else if (match[2] !== undefined) {
            type = 'EMPHASIZED';//курсив
            content = match[2];
        } else if (match[3] !== undefined) {
            type = 'STRIKETHROUGH';//зачеркнутый
            content = match[3];
        } else if (match[4] !== undefined && match[5] !== undefined) {
            const linkUrl = match[5];
			content = match[4];
			if (linkUrl.startsWith('user://')) {
				// Это упоминание
				type = 'USER_MENTION';
				userId = parseInt(linkUrl.substring(7),10); // убираем 'user://'
			} else {
				// Обычная ссылка
				type = 'LINK';
				url = linkUrl;
			}
        } else {
            continue;
        }
        
        // Сохраняем элемент с учётом смещения
        if(content && content.length>0)
		{
			const element = {
                type: type,
                from: match.index,
                length: content.length
            };
            
            if ((type==='LINK' || type==='link') && url) {
                element.attributes = { url: url };
            }
			
			if ((type==='USER_MENTION' || type==='user_mention') && userId) {
				element.entityId = userId;
			}
            
            elements.push(element);
			
			// Удаляем символы форматирования из текста
			//match.index указывает на первый символ форматирования
			const before = processedText.slice(0, match.index);//от 0 до match.index, не включая самого
			const after = processedText.slice(match.index+match[0].length);
			processedText = before + content + after;
		} else {
			// Если content пустой, просто удаляем match[0]
			const before = processedText.slice(0, match.index);
			const after = processedText.slice(match.index + match[0].length);
			processedText = before + after;
		}
        
        // Сбрасываем lastIndex и продолжаем поиск с новой позиции
        regex.lastIndex = 0;
    }
    
	return { text: processedText, elements: elements };
}
//====================================================================
function parseHtmlToMarkdown(htmlText) 
{
    let text = htmlText;
    
    // 1. Экранируем * и _, чтобы они не сломали маркдаун
    text = text.replace(/\*/g, '\\*');
    text = text.replace(/_/g, '\\_');
    
    // 2. Жирный текст: <strong>текст</strong> → *текст*
    text = text.replace(/<strong>(.*?)<\/strong>/g, '*$1*');
    text = text.replace(/<b>(.*?)<\/b>/g, '*$1*');
    
    // 3. Курсив: <em>текст</em> → _текст_
    text = text.replace(/<em>(.*?)<\/em>/g, '_$1_');
    text = text.replace(/<i>(.*?)<\/i>/g, '_$1_');
    
    // 4. Ссылки: <a href="url">текст</a> → [текст](url)
    text = text.replace(/<a\s+(?:[^>]*?\s+)?href="([^"]*)"(?:\s+[^>]*?)?>(.*?)<\/a>/gi, '[$2]($1)');
    
    // 5. Переход на новую строку: <br> или <br/> → \n
    text = text.replace(/<br\s*\/?>/gi, '\n');
    
    // 6. Удаляем все оставшиеся HTML-теги
	text = removeHtmlTags(text);
    
    return text;
}
//====================================================================
function parseMarkdownToHtml(text) {
    let html = text;
    
   // 1. Преобразуем Markdown в HTML
    html = html.replace(/\*(.*?)\*/g, '<strong>$1</strong>');
    html = html.replace(/_(.*?)_/g, '<em>$1</em>');
    html = html.replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2">$1</a>');
    //html = html.replace(/\n/g, '<br>');
    
    return html;
}
//====================================================================
function removeHtmlTags(text) {
    // Список разрешённых (которые нужно удалить) тегов HTML
    const htmlTags = [
        'div', 'span', 'p', 'a', 'strong', 'b', 'em', 'i', 
        'br', 'hr', 'img', 'ul', 'ol', 'li', 'h1', 'h2', 
        'h3', 'h4', 'h5', 'h6', 'table', 'tr', 'td', 'th',
        'section', 'article', 'header', 'footer', 'nav', 'main'
    ];
    
    // Создаём регулярку из списка
    const tagsPattern = htmlTags.join('|');
    const regex = new RegExp(`</?(${tagsPattern})(?:\\s[^>]*)?>`, 'gi');
    
    return text.replace(regex, '');
}
//====================================================================
function EntitiesToMax(entities) {
    if (!entities || entities.length === 0) return [];
    
    const elements = [];
    
    for (const entity of entities) {
        const element = {
            from: entity.offset,
            length: entity.length
        };
        
        switch (entity.type) {
            case 'bold':
                element.type = 'STRONG';
                break;
            case 'italic':
                element.type = 'EMPHASIZED';
                break;
            case 'strikethrough':
                element.type = 'STRIKETHROUGH';
                break;
            case 'underline':
                element.type = 'UNDERLINE';
                break;
            case 'text_link':
                element.type = 'LINK';
                element.attributes = { url: entity.url };
                break;
            case 'code':
            case 'pre':
                element.type = 'MONOSPACED';
                break;
            default:
                continue;
        }
        
        elements.push(element);
    }
    
    return elements;
}
//====================================================================
function EntitiesToHtml(text, entities) {
    if (!entities || entities.length === 0) return text;
    
    // Сортируем сущности по позиции от конца к началу (чтобы не сбивать индексы)
    const sorted = [...entities].sort((a, b) => b.offset - a.offset);
    let htmlText = text;
    
    for (const entity of sorted) {
        const from = entity.offset;
        const to = from + entity.length;
        
        // Извлекаем фрагмент текста
        const fragment = htmlText.substring(from, to);
        
        // Определяем HTML-тег для MAX
        let openTag = '';
        let closeTag = '';
        
        switch (entity.type) {
            case 'bold':
                openTag = '<strong>';
                closeTag = '</strong>';
                break;
            case 'italic':
                openTag = '<em>';
                closeTag = '</em>';
                break;
            case 'strikethrough':
                openTag = '<s>';
                closeTag = '</s>';
                break;
            case 'underline':
                openTag = '<u>';
                closeTag = '</u>';
                break;
            case 'text_link':
                openTag = `<a href="${entity.url}">`;
                closeTag = '</a>';
                break;
            case 'code':
                openTag = '<code>';
                closeTag = '</code>';
                break;
            case 'pre':
                openTag = '<pre>';
                closeTag = '</pre>';
                break;
            default:
                continue;
        }
        
        const replacement = openTag + fragment + closeTag;
        
        // Заменяем фрагмент на отформатированный
        htmlText = htmlText.substring(0, from) + replacement + htmlText.substring(to);
    }
    
    return htmlText;
}
//====================================================================
//   для MAX
function mentionUser(userName, entityId) {
    // userName — для отображения в тексте (из ONEME)
    // entityId — userId пользователя
    return `[${userName}](user://${entityId})`;
}
//====================================================================
// Получаем текст Чистого Времени на сегодня
function get_srok(date, COMMUNITY_TEXT = 'Чистого Времени')
{
	let mess = {text:'', ubik:false};
	//вычисляем срок чистого времени
	let begin = date;
	if(!begin) {return mess;}
	if (!moment(begin, 'DD.MM.YYYY', true).isValid())
	{	//mess = 'Дата ЧВ не соответствует шаблону, или символы введены некорректно!\nПопробуйте еще разок сначала\n';
		return mess;
	}
	let now = moment().startOf('day');//сегодня для юзера в формате дней
	let time = moment(begin,'DD.MM.YYYY');//начало в формате времени
	let days = now.diff(time, 'days');//дни всего
	let months = now.diff(time, 'months');//месяцы всего
	let b = time;
	let y = now.diff(b, 'years');//годы
	b.add(y, 'years');
	let m = now.diff(b, 'months');//месяцы
	b.add(m, 'months');
	let d = now.diff(b, 'days');//дни
	let god = 'лет ';
	if(y<5) god = 'г. ';
	else if(y>20 && y%20<5) god = 'г. ';
	else if(y>30 && y%30<5) god = 'г. ';
	else if(y>40 && y%40<5) god = 'г. ';
	//проверяем на юбик
	if(days==10 || days==20 || days==30 || days==60 || days==90 || (days%100 == 0 && days>0))//по дням
	{	mess.text += 'Поздравляем с Юбилеем!!!\n';
		mess.text += 'Сегодня у Вас:\n*' + days + ' дн.*\n'+COMMUNITY_TEXT+'!!!\n';
		if(days==30 || days==90) 
		{mess.text += 'Приходите на собрание, там Вас ждет Медалька!!!\n';
		}
		mess.text += '👏🏻👏🏻👏🏻🫂💐';
		mess.ubik = true;
	}
	else if(d==0 && m==0 && y > 0)//годы
	{	mess.text += 'Поздравляем с Большим Юбилеем!!!\n';
		mess.text += 'Сегодня у Вас:\n*';
		mess.text += y + god;
		mess.text += '*\n'+COMMUNITY_TEXT+'!!!\n';
		mess.text += '👏🏻👏🏻👏🏻🫂💐';
		mess.ubik = true;
	}
	else if(d==0 && months > 0)//месяцы и годы
	{	mess.text += 'Поздравляем с Юбилеем!!!\n';
		mess.text += 'Сегодня у Вас:\n*';
		if(y==0) mess.text += m + 'мес. ';
		else //сколько то лет уже есть
		{	mess.text += y + god;
			if(m>0) mess.text += m + 'мес. ';
		}
		mess.text += '*\n'+COMMUNITY_TEXT+'!!!\n';
		if(months==1 || months==3 || months==6 || months==9) 
		{mess.text += 'Приходите на собрание, там Вас ждет Медалька!!!\n';
		}
		mess.text += '👏🏻👏🏻👏🏻🫂💐';
		mess.ubik = true;
	}
	else //юбика нет пока
	{	mess.text += 'Сегодня у Вас:\n*';
		if(y>0) mess.text += y + god;
		if(m>0) mess.text += m + 'мес. ' + '(' + months + 'мес.) ';
		if(d>0) mess.text += d + 'дн. ';
		if(y>0 || m>0) mess.text += '\nили '+days+'дн. ';//общее дней
		mess.text += '*\n'+COMMUNITY_TEXT+'!!!';
		mess.ubik = false;
	}
		
	return mess;
}
//====================================================================
module.exports = {
    parseMarkdownToElements,
	parseHtmlToMarkdown,
	parseMarkdownToHtml,
	removeHtmlTags,
	EntitiesToMax,
	EntitiesToHtml,
	mentionUser,
	get_srok
};
