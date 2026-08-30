// utils.js
const moment = require('moment-timezone');
// Конфигурация маркдаун-символов → тип сущности
const MARKDOWN_PATTERNS = [
    // Жирный
    { regex: /\*\*(.*?)\*\*/, type: 'bold', groups: 1 },   // **текст**
    { regex: /\*(.*?)\*/, type: 'bold', groups: 1 },       // *текст*
    // Курсив
    { regex: /_(.*?)_/, type: 'italic', groups: 1 },       // _текст_
    // Зачеркнутый
    { regex: /~~(.*?)~~/, type: 'strikethrough', groups: 1 }, // ~~текст~~
    // Подчеркнутый
    { regex: /\+\+(.*?)\+\+/, type: 'underline', groups: 1 }, // ++текст++
    // Ссылка
    { regex: /\[(.*?)\]\((.*?)\)/, type: 'text_link', groups: 2 }, // [текст](url)
    // Моноширинный
    { regex: /`(.*?)`/, type: 'code', groups: 1 },         // `код`
    // Блок кода
    { regex: /```(.*?)```/, type: 'pre', groups: 1 },      // ```блок кода```
];

const ENTITY_TO_MARKDOWN = [
    // Жирный: web — *текст*, bot — **текст**
    { type: 'bold', web: (f) => `*${f}*`, bot: (f) => `**${f}**` },
    // Курсив
    { type: 'italic', fn: (f) => `_${f}_` },
    // Зачеркнутый
    { type: 'strikethrough', fn: (f) => `~~${f}~~` },
    // Подчеркнутый
    { type: 'underline', fn: (f) => `++${f}++` },
    // Ссылка
    { type: 'text_link', fn: (f, url) => `[${f}](${url})` },
    // Моноширинный
    { type: 'code', fn: (f) => `\`${f}\`` },
    // Блок кода
    { type: 'pre', fn: (f) => `\`\`\`\n${f}\n\`\`\`` },
];

//====================================================================
function MarkdownToElements(text) 
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
        } else if (match[4] !== undefined && match[5] !== undefined) {//ссылка
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
    
	return { text: unescapeMarkdown(processedText), elements: elements };
}
//====================================================================
function MarkdownToEntities(text) 
{
    if (!text || text.length === 0) return { text: text, entities: [] };
    
    const entities = [];
    let processedText = text;
    
    const regexParts = MARKDOWN_PATTERNS.map(p => p.regex.source);
    const regex = new RegExp(regexParts.join('|'), 'g');
    let match;
    
    while ((match = regex.exec(processedText)) !== null) {
        let matchedPattern = null;
        let content = '';
        let url = '';
        let groupOffset = 1;
        
        // Ищем, какой паттерн сработал
        for (let i = 0; i < MARKDOWN_PATTERNS.length; i++) {
            const pattern = MARKDOWN_PATTERNS[i];
            if (match[groupOffset] !== undefined) {
                matchedPattern = pattern;
                content = match[groupOffset];
                
                // Если у паттерна 2 группы, берем вторую
                if (pattern.groups === 2) {
                    url = match[groupOffset + 1];
                }
                break;
            }
            groupOffset += pattern.groups;
        }
        
        if (!matchedPattern) continue;
        
        const entity = {
            offset: match.index,
            length: content.length,
            type: matchedPattern.type
        };
        
        if (url) {
            entity.url = url;
        }
        
        entities.push(entity);
        
        const before = processedText.slice(0, match.index);
        const after = processedText.slice(match.index + match[0].length);
        processedText = before + content + after;
        
        regex.lastIndex = 0;
    }
    
    return { text: unescapeMarkdown(processedText), entities: entities };
}
//====================================================================
function MarkdownToHtml(text, napr='bot') {
    // 1. Markdown → Entities
    const parsed = MarkdownToEntities(text);
    
    // 2. Entities → HTML
    const html = EntitiesToHtml(parsed.text, parsed.entities);
    
    // 3. Если napr === 'web', заменяем переносы на <br>
    if (napr === 'web') {
        return html.replace(/\n/g, '<br>');
    }
    
    return html;
}
//====================================================================
function HtmlToMarkdown(htmlText, napr = 'web') {
    // 1. HTML → Entities
    const result = HtmlToEntities(htmlText);
    
    // 2. Entities → Markdown
    const res = EntitiesToMarkdown(result.text, result.entities, napr);
	return res;
}
//====================================================================
function HtmlToElements(htmlText) 
{
    // 1. HTML → Entities
	const result = HtmlToEntities(htmlText);
    
    // 2. Entities → Elements (MAX)
    const elements = EntitiesToElements(result.entities);
    
    // 3. Текст — очищенный от HTML
    const text = result.text;
    
    return { text: text, elements: elements };
}
//====================================================================
function HtmlToEntities(htmlText) {
    if (!htmlText || htmlText.length === 0) return { text: '', entities: [] };
    
    let text = htmlText;
    const entities = [];
    
    // Маппинг тегов → типы сущностей
    const tagMap = {
        'strong': 'bold',
        'b': 'bold',
        'em': 'italic',
        'i': 'italic',
        's': 'strikethrough',
        'strike': 'strikethrough',
        'del': 'strikethrough',
        'u': 'underline',
        'ins': 'underline',
        'code': 'code',
        'pre': 'pre',
        'a': 'text_link'
    };
    
    // Создаем регулярку из ключей tagMap (без флага 'i')
    const tags = Object.keys(tagMap).join('|');
    const tagRegex = new RegExp(`<(${tags})\\b[^>]*>([\\s\\S]*?)<\\/\\1>`, 'g');
    let match;
    
    while ((match = tagRegex.exec(text)) !== null) {
        const tag = match[1].toLowerCase();
        const content = match[2];
        const offset = match.index;
        const type = tagMap[tag];
        let url = '';
        
        // Для ссылки извлекаем URL
        if (tag === 'a') {
            const hrefMatch = match[0].match(/href="([^"]*)"/);
            url = hrefMatch ? hrefMatch[1] : '';
        }
        
        const entity = { offset, length: content.length, type };
        if (url) entity.url = url;
        entities.push(entity);
        
        text = text.substring(0, offset) + content + text.substring(offset + match[0].length);
        tagRegex.lastIndex = 0;
    }
    
    text = text.replace(/<br\s*\/?>/gi, '\n');
    text = removeHtmlTags(text);
    
    entities.sort((a, b) => a.offset - b.offset);
    
    return { text, entities };
}
//====================================================================
function EntitiesToElements(entities) {
    if (!entities || entities.length === 0) return [];
	if (typeof entities === 'string') {try { entities = JSON.parse(entities); } catch (e) { entities = []; }}
    
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
	if (!text || text.length === 0) return '';
	if (typeof entities === 'string') {try { entities = JSON.parse(entities); } catch (e) { entities = []; }}
    
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
function EntitiesToMarkdown(text, entities, napr = 'web') 
{
    if (!entities || entities.length === 0) return escapeMarkdown(text);
    if (!text || text.length === 0) return '';
    if (typeof entities === 'string') {
        try { entities = JSON.parse(entities); } catch (e) { entities = []; }
    }
    
    const sorted = [...entities].sort((a, b) => a.offset - b.offset);
    let result = '';
    let lastPos = 0;
    
    for (const entity of sorted) 
	{
        const from = entity.offset;
        const to = from + entity.length;
        
        // Чистый текст до сущности — экранируем
        const plainText = text.substring(lastPos, from);
        result += escapeMarkdown(plainText);
        
        // Фрагмент сущности — экранируем содержимое
        let fragment = text.substring(from, to);
        fragment = escapeMarkdown(fragment);
        
        // Находим правило для типа сущности
        const rule = ENTITY_TO_MARKDOWN.find(r => r.type === entity.type);
        if (!rule) continue;
        
        let replacement;
        if (rule.fn) {
            // Для типов с fn (все кроме bold)
            replacement = (entity.type === 'text_link') 
                ? rule.fn(fragment, entity.url) 
                : rule.fn(fragment);
        } else {
            // Для bold — выбираем web или bot
            replacement = (napr === 'web') ? rule.web(fragment) : rule.bot(fragment);
        }
        
        result += replacement;
        lastPos = to;
    }
    
    // Остаток текста после последней сущности — экранируем
    result += escapeMarkdown(text.substring(lastPos));
    
    return result;
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
function escapeMarkdown(text) {
    if (!text) return '';
    
    // Экранируем только те символы, которые используются
    // * _ ~ + [ ] ( ) `
    return text.replace(/([*_~+[\]()`])/g, '\\$1');
}
//====================================================================
function unescapeMarkdown(text) {
    if (!text) return '';
    
    // Убираем обратные слеши перед спецсимволами
    // * _ ~ + [ ] ( ) `
    return text.replace(/\\([*_~+[\]()`])/g, '$1');
}
//====================================================================
function fixMarkdownForMaxBot(text) 
{
    if (!text) return '';
    let fixed = text;
    // 1. Жирный: *текст* → **текст**
    fixed = fixed.replace(/(?<!\\)\*(.*?)(?<!\\)\*/g, '**$1**');
    return fixed;
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
    MarkdownToElements,
	MarkdownToHtml,
	MarkdownToEntities,
	
	HtmlToMarkdown,
	HtmlToElements,
	HtmlToEntities,
	
	EntitiesToElements,
	EntitiesToHtml,
	EntitiesToMarkdown,
	
	removeHtmlTags,
	fixMarkdownForMaxBot,
	mentionUser,
	get_srok,
	escapeMarkdown,
	unescapeMarkdown
};
