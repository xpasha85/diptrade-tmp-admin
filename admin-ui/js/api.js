export const API_BASE = "http://localhost:3001";

export async function getHealth() {
    try {
        const response = await fetch(`${API_BASE}/health`);
        return response.ok;
    } catch (e) {
        return false;
    }
}

export async function getCars() {
    try {
        const response = await fetch(`${API_BASE}/cars`);
        if (!response.ok) throw new Error('Network response was not ok');
        const data = await response.json();
        return data.cars || (Array.isArray(data) ? data : []);
    } catch (e) {
        console.error("Ошибка загрузки авто:", e);
        return [];
    }
}

// --- ФОТО ---

export async function uploadPhotos(id, files) {
    const formData = new FormData();
    for (const file of files) {
        formData.append('files', file);
    }
    // ВАЖНО: Возвращаем JSON ответа, чтобы узнать новые имена файлов
    const res = await fetch(`${API_BASE}/cars/${id}/photos`, {
        method: 'POST',
        body: formData
    });
    return await res.json();
}

export async function deletePhoto(carId, filename) {
    await fetch(`${API_BASE}/cars/${carId}/photos/${filename}`, {
        method: 'DELETE'
    });
}

export async function reorderPhotos(carId, newOrderArray) {
    await fetch(`${API_BASE}/cars/${carId}/photos/reorder`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ photos: newOrderArray })
    });
}

// Удаление машины целиком
export async function deleteCar(id) {
    const response = await fetch(`${API_BASE}/cars/${id}`, {
        method: 'DELETE'
    });
    if (!response.ok) throw new Error('Не удалось удалить автомобиль');
}