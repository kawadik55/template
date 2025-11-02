/**
 * Модуль для работы с расписанием собраний
 * @module meetingSchedule
 */

/**
 * Находит дату ближайшего собрания
 * @param {Object} meeting - Объект с данными о собрании
	meeting.type - тип периодичности
	meeting.period - массив или число
	meeting.day - день недели
	meeting.ref_data - дата отсчета для floating
 * @returns {string} Дата в формате ДД.ММ.ГГГГ
 */
function getNextDate(meeting) {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();
    
    if (meeting.type === 'static') {
        return findNearestStaticMeeting(meeting, now, currentYear, currentMonth);
    } else if (meeting.type === 'floating') {
        return findNearestFloatingMeeting(meeting, now);
    } else {
        return 'не найдено';
    }
}

function findNearestStaticMeeting(meeting, now, currentYear, currentMonth) {
    const dayOfWeek = getDayNumber(meeting.day);
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    
    // Сортируем недели по порядку, чтобы искать от ближайших к дальним
    const sortedWeeks = [...meeting.period].sort((a, b) => {
        // 'last' всегда в конце
        if (a === 'last') return 1;
        if (b === 'last') return -1;
        return parseInt(a) - parseInt(b);
    });
    
    // Проверяем текущий месяц и следующий
    for (let monthOffset = 0; monthOffset <= 1; monthOffset++) {
        const year = currentYear + Math.floor((currentMonth + monthOffset) / 12);
        const month = (currentMonth + monthOffset) % 12;
        
        for (const week of sortedWeeks) {
            const day = calculateDayInMonth(year, month, dayOfWeek, week);
            const meetingDate = new Date(year, month, day);
            
            // Если дата сегодня - возвращаем 'Сегодня'
            if (isSameDate(meetingDate, today)) {
                return 'Сегодня';
            }
            
            // Если дата в будущем - возвращаем её
            if (meetingDate > today) {
                return formatDate(meetingDate);
            }
        }
    }
    
    // Если ничего не нашли в текущем и следующем месяце, ищем в следующем году
    return findNearestStaticMeeting(meeting, now, currentYear + 1, 0);
}

function calculateDayInMonth(year, month, dayOfWeek, week) {
    if (week === 'last') {
        // Для последней недели ищем последний указанный день недели в месяце
        const lastDay = new Date(year, month + 1, 0);
        const lastDayOfWeek = lastDay.getDay() || 7; // Воскресенье = 7
        
        // Вычисляем разницу до нужного дня недели
        let diff = (lastDayOfWeek - dayOfWeek + 7) % 7;
        return lastDay.getDate() - diff;
    } else {
        // Для обычных недель: 1-я неделя = дни 1-7, 2-я = 8-14, 3-я = 15-21, 4-я = 22-28
        const weekNum = parseInt(week);
        const firstDayOfMonth = new Date(year, month, 1);
        const firstDayOfWeek = firstDayOfMonth.getDay() || 7; // Воскресенье = 7
        
        // Вычисляем первый день указанной недели
        const firstDayOfWeekNum = 1 + (weekNum - 1) * 7;
        
        // Вычисляем разницу до нужного дня недели
        const diff = (dayOfWeek - firstDayOfWeek + 7) % 7;
        return firstDayOfWeekNum + diff;
    }
}

function findNearestFloatingMeeting(meeting, now) {
    const refDate = parseDate(meeting.ref_data);
    const periodWeeks = parseInt(meeting.period);
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    
    // Вычисляем разницу в неделях от эталонной даты
    const diffTime = today - refDate; // Используем today вместо now
    const diffWeeks = Math.floor(diffTime / (1000 * 60 * 60 * 24 * 7));
    
    // Вычисляем номер собрания
    const meetingNumber = Math.floor(diffWeeks / periodWeeks);
    
    // Проверяем текущее собрание (может быть сегодня)
    const currentMeetingDate = new Date(refDate);
    currentMeetingDate.setDate(refDate.getDate() + meetingNumber * periodWeeks * 7);
    
    if (isSameDate(currentMeetingDate, today)) {return 'Сегодня';}//если сегодня
    
    // Берем следующее собрание
    const nextMeetingNumber = meetingNumber + 1;
    const weeksFromRef = nextMeetingNumber * periodWeeks;
    const nextMeetingDate = new Date(refDate);
    nextMeetingDate.setDate(refDate.getDate() + weeksFromRef * 7);
    
    return formatDate(nextMeetingDate);
}

function getDayNumber(dayName) {
    const days = {
        'Понедельник': 1,
        'Вторник': 2,
        'Среда': 3,
        'Четверг': 4,
        'Пятница': 5,
        'Суббота': 6,
        'Воскресенье': 7
    };
    return days[dayName];
}

function parseDate(dateString) {
    const [day, month, year] = dateString.split('.').map(Number);
    return new Date(year, month - 1, day);
}

function formatDate(date) {
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}.${month}.${year}`;
}

function isSameDate(date1, date2) {
    return date1.getFullYear() === date2.getFullYear() &&
           date1.getMonth() === date2.getMonth() &&
           date1.getDate() === date2.getDate();
}

module.exports = {
    getNextDate
};
