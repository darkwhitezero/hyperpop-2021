document.addEventListener('DOMContentLoaded', async () => {
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // 1. Анимация счетчиков
    const countTargets = document.querySelectorAll('.count-up');
    const streamCounters = document.querySelectorAll('.count-up[data-spotify-track-id], .count-up[data-spotify-track-name]');
    const numberFormatter = new Intl.NumberFormat('ru-RU');

    const setCounterValue = (el, value) => {
        const prefix = el.dataset.prefix || '';
        const suffix = el.dataset.suffix || '';
        el.textContent = `${prefix}${numberFormatter.format(value)}${suffix}`;
    };

    // The published data is optional: when it is missing or unavailable, the
    // existing data-count values remain the source for the counters below.
    try {
        const response = await fetch('assets/data/playcounts.json', { cache: 'no-cache' });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const playcountData = await response.json();
        const tracks = playcountData?.tracks;
        if (tracks && typeof tracks === 'object') {
            const byName = new Map();
            Object.values(tracks).forEach((track) => {
                if (typeof track?.name === 'string' && Number.isFinite(Number(track.playcount))) {
                    const normalizedName = track.name.trim().toLocaleLowerCase('ru-RU');
                    if (!byName.has(normalizedName)) byName.set(normalizedName, track);
                }
            });

            let updatedStreamCount = 0;
            streamCounters.forEach((counter) => {
                const track = counter.dataset.spotifyTrackId
                    ? tracks[counter.dataset.spotifyTrackId]
                    : byName.get(counter.dataset.spotifyTrackName.trim().toLocaleLowerCase('ru-RU'));
                const playcount = Number(track?.playcount);
                if (Number.isSafeInteger(playcount) && playcount >= 0) {
                    counter.dataset.count = String(playcount);
                    updatedStreamCount += 1;
                }
            });

            const streamCounts = Array.from(streamCounters, (counter) => Number(counter.dataset.count));
            if (updatedStreamCount === streamCounters.length && streamCounts.length > 0 && streamCounts.every(Number.isSafeInteger)) {
                const totalStreams = streamCounts.reduce((total, count) => total + count, 0);
                const averageStreams = Math.round(totalStreams / streamCounts.length);
                const totalCounter = document.querySelector('[data-stat="total-streams"]');
                const averageCounter = document.querySelector('[data-stat="average-per-release"]');

                if (totalCounter && averageCounter) {
                    totalCounter.dataset.count = String(totalStreams);
                    averageCounter.dataset.count = String(averageStreams);
                }
            }

            const updatedAt = new Date(playcountData.updatedAt);
            const updatedLabel = document.querySelector('#streams-updated');
            if (updatedLabel && Number.isFinite(updatedAt.getTime())) {
                const dateFormatter = new Intl.DateTimeFormat('ru-RU', {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                });
                updatedLabel.textContent = `Обновлено: ${dateFormatter.format(updatedAt)}`;
            }
        }
    } catch (error) {
        console.warn('Spotify playcounts are unavailable; using the page defaults.', error);
    }

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
