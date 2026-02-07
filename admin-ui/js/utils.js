// Форматирование цены (обрабатывает и number, и object)
export function formatPrice(priceValue) {
    if (priceValue === null || priceValue === undefined) return 'Цена не указана';
    
    let amount = 0;
    
    // Если пришел объект { total_rub: ... }
    if (typeof priceValue === 'object' && priceValue.total_rub) {
        amount = priceValue.total_rub;
    } 
    // Если пришло число
    else if (typeof priceValue === 'number') {
        amount = priceValue;
    }

    return new Intl.NumberFormat('ru-RU', { 
        style: 'currency', 
        currency: 'RUB',
        maximumFractionDigits: 0 
    }).format(amount);
}

// Определение статуса (возвращает объект с классом и текстом)
export function getStatusInfo(car) {
    // Приоритет 1: Продано
    if (car.is_sold) return { class: 'sold', text: 'Продано' };
    
    // Приоритет 2: Скрыто (если явно false или вообще не задано и не в стоке)
    // Тут логику можно будет уточнить, пока простая:
    if (car.is_visible === false) return { class: 'hidden', text: 'Скрыто' };
    
    // Иначе: В продаже
    return { class: 'active', text: 'В продаже' };
}