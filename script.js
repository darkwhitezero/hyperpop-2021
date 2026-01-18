document.addEventListener('DOMContentLoaded', () => {
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // 1. Анимация счетчиков
    const countTargets = document.querySelectorAll('.count-up');
    const numberFormatter = new Intl.NumberFormat('ru-RU');

    const setCounterValue = (el, value) => {
        const prefix = el.dataset.prefix || '';
        const suffix = el.dataset.suffix || '';
        el.textContent = `${prefix}${numberFormatter.format(value)}${suffix}`;
    };

    const animateValue = (el, start, end, duration) => {
        let startTimestamp = null;
        const step = (timestamp) => {
            if (!startTimestamp) startTimestamp = timestamp;
            const progress = Math.min((timestamp - startTimestamp) / duration, 1);
            const value = Math.floor(progress * (end - start) + start);
            setCounterValue(el, value);

            if (progress < 1) {
                window.requestAnimationFrame(step);
            }
        };
        window.requestAnimationFrame(step);
    };

    if (countTargets.length) {
        if (reduceMotion) {
            countTargets.forEach((el) => {
                const endValue = parseInt(el.dataset.count, 10);
                if (!Number.isNaN(endValue)) {
                    setCounterValue(el, endValue);
                }
            });
        } else {
            const observer = new IntersectionObserver((entries) => {
                entries.forEach(entry => {
                    if (entry.isIntersecting) {
                        const target = entry.target;
                        const endValue = parseInt(target.getAttribute('data-count'), 10);
                        if (!Number.isNaN(endValue)) {
                            animateValue(target, 0, endValue, 2000);
                        }
                        observer.unobserve(target);
                    }
                });
            }, { threshold: 0.5 });

            countTargets.forEach(counter => {
                observer.observe(counter);
            });
        }
    }

    // 2. Параллакс эффект для карточек при движении мыши
    if (!reduceMotion) {
        const cards = document.querySelectorAll('.artist-card');

        cards.forEach(card => {
            card.addEventListener('mousemove', (e) => {
                const rect = card.getBoundingClientRect();
                const x = e.clientX - rect.left;
                const y = e.clientY - rect.top;

                // Вычисляем центр
                const centerX = rect.width / 2;
                const centerY = rect.height / 2;

                // Угол поворота
                const rotateX = ((y - centerY) / centerY) * -5; // максимум 5 градусов
                const rotateY = ((x - centerX) / centerX) * 5;

                card.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale(1.02)`;
            });

            card.addEventListener('mouseleave', () => {
                card.style.transform = 'perspective(1000px) rotateX(0) rotateY(0) scale(1)';
            });
        });
    }
});
