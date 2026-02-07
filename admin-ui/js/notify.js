// Обертка над Toastify для удобства

const defaultOptions = {
    duration: 3000,       // Сколько висит (3 сек)
    close: true,          // Кнопка закрыть
    gravity: "top",       // "top" или "bottom"
    position: "right",    // "left", "center" или "right"
    stopOnFocus: true,    // Пауза при наведении
};

export const notify = {
    // Зеленый (Успех)
    success: (text) => {
        Toastify({
            text: text,
            backgroundColor: "#2ecc71", // Ярко-зеленый
            ...defaultOptions
        }).showToast();
    },

    // Красный (Ошибка)
    error: (text) => {
        Toastify({
            text: text,
            backgroundColor: "#e74c3c", // Ярко-красный
            duration: 5000, // Ошибки висят подольше
            ...defaultOptions
        }).showToast();
    },

    // Синий (Инфо)
    info: (text) => {
        Toastify({
            text: text,
            backgroundColor: "#3498db", // Голубой
            ...defaultOptions
        }).showToast();
    }
};