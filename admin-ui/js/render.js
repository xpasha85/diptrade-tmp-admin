import { API_BASE } from './api.js';

export function renderTable(cars) {
    const tbody = document.getElementById('cars-table-body');
    const thead = document.querySelector('thead tr');
    
    // Обновим заголовки таблицы один раз, чтобы соответствовать новым колонкам
    // (ID, Дата, Страна, Фото, Авто, Характеристики, Цена, Статус, Действия)
    if (thead && thead.children.length < 9) {
        thead.innerHTML = `
            <th scope="col">ID</th>
            <th scope="col">Дата</th>
            <th scope="col">Страна</th>
            <th scope="col">Фото</th>
            <th scope="col">Автомобиль</th>
            <th scope="col">Характеристики</th>
            <th scope="col">Цена</th>
            <th scope="col">Статус</th>
            <th scope="col">Действия</th>
        `;
    }

    tbody.innerHTML = '';

    if (cars.length === 0) {
        tbody.innerHTML = '<tr><td colspan="9" style="text-align:center">Нет автомобилей</td></tr>';
        return;
    }

    // Сортировка: Сначала новые
    const sortedCars = [...cars].sort((a, b) => b.id - a.id);

    sortedCars.forEach(car => {
        const tr = document.createElement('tr');
        
        // Если скрыто - делаем строку полупрозрачной
        if (car.is_visible === false) {
            tr.classList.add('row-hidden');
        }

        // --- 1. Логика Данных ---
        
        // Дата (ДД.ММ)
        const dateDate = new Date(car.added_at);
        const dateStr = !isNaN(dateDate) 
            ? dateDate.toLocaleDateString('ru-RU', {day: '2-digit', month: '2-digit'})
            : '-';

        // Фото
        let photoHtml = '<div class="no-photo">Нет фото</div>';
        if (car.photos && car.photos.length > 0) {
            const thumbUrl = `${API_BASE}/assets/cars/${car.assets_folder}/${car.photos[0]}`;
            photoHtml = `<img src="${thumbUrl}" alt="img" class="table-thumb" loading="lazy">`;
        }

        // Авто + Featured
        const isFeatured = car.is_featured ? '<span title="На главной">⭐</span> ' : '';
        const monthStr = car.month ? ` • ${car.month} мес.` : '';
        
        // Характеристики
        const specs = car.specs || {};
        const volLiters = specs.volume ? (specs.volume / 1000).toFixed(1) + ' л' : '-';
        const hpStr = specs.hp ? `${specs.hp} л.с.` : '';
        const mileageStr = specs.mileage ? new Intl.NumberFormat('ru-RU').format(specs.mileage) + ' км' : '';
        const fuelStr = specs.fuel || '';

        // Цена
        const rawPrice = (typeof car.price === 'object') ? car.price.total_rub : car.price;
        const priceStr = new Intl.NumberFormat('ru-RU', { 
            style: 'currency', currency: 'RUB', maximumFractionDigits: 0 
        }).format(rawPrice || 0);

        // Статус (Приоритет: Sold > InStock > Auction > Order)
        let statusBadge = '<span class="badge order">Под заказ</span>';
        if (car.is_sold) {
            statusBadge = '<span class="badge sold">Продано</span>';
        } else if (car.in_stock) {
            statusBadge = '<span class="badge stock">В наличии</span>';
        } else if (car.is_auction) {
            statusBadge = '<span class="badge auction">Аукцион</span>';
        }

        // --- 2. HTML Строки ---
        tr.innerHTML = `
            <td>${car.id}</td>
            <td><small>${dateStr}</small></td>
            <td><strong>${car.country || 'KR'}</strong></td>
            <td class="thumb-cell">${photoHtml}</td>
            
            <td>
                <div>${isFeatured}<strong>${car.brand} ${car.model}</strong></div>
                <small class="text-muted">${car.year} г.${monthStr}</small>
            </td>

            <td>
                <div class="specs-row">${volLiters} • ${mileageStr}</div>
                <div class="specs-row small">${hpStr} • ${fuelStr}</div>
            </td>

            <td><strong>${priceStr}</strong></td>
            <td>${statusBadge}</td>
            
            <td class="actions-cell">
                <button class="action-btn btn-edit" onclick="editCar(${car.id})" title="Редактировать">
                    ✏️
                </button>
                <button class="action-btn btn-delete" onclick="deleteCar(${car.id})" title="Удалить">
                    🗑️
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}