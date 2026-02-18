/**
 * DRAM Voice Mode - Waveform Animation
 * Extracted to maintain modularity and adhere to the 500-line rule.
 */

export function createWaveform(canvas, audioContext, analyser) {
    if (!canvas || !analyser) return null;

    const ctx = canvas.getContext('2d');
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const resize = () => {
        const dpr = window.devicePixelRatio || 1;
        const rect = canvas.getBoundingClientRect();

        if (canvas.width !== rect.width * dpr || canvas.height !== rect.height * dpr) {
            canvas.width = rect.width * dpr;
            canvas.height = rect.height * dpr;
        }
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        return { w: rect.width, h: rect.height };
    };

    let dimensions = resize();

    // Use ResizeObserver for robust layout changes
    const resizeObserver = new ResizeObserver(() => {
        dimensions = resize();
    });
    resizeObserver.observe(canvas.parentElement);

    // 3D Sphere Settings
    const PARTICLE_COUNT = 600;
    const particles = [];

    class Particle3D {
        constructor() {
            const theta = Math.random() * 2 * Math.PI;
            const phi = Math.acos(2 * Math.random() - 1);

            this.baseX = Math.sin(phi) * Math.cos(theta);
            this.baseY = Math.sin(phi) * Math.sin(theta);
            this.baseZ = Math.cos(phi);

            this.x = this.baseX;
            this.y = this.baseY;
            this.z = this.baseZ;

            this.freqIndex = Math.floor(Math.random() * bufferLength);
            this.noise = 1 + (Math.random() * 0.2 - 0.1);
        }

        project(width, height, energyRadius, audioDisplacement) {
            const bounce = (audioDisplacement / 255) * (energyRadius * 0.25);
            const currentRadius = (this.noise * energyRadius) + bounce;

            const norm = Math.sqrt(this.baseX ** 2 + this.baseY ** 2 + this.baseZ ** 2);

            const px = (this.baseX / norm) * currentRadius;
            const py = (this.baseY / norm) * currentRadius;
            const pz = (this.baseZ / norm) * currentRadius;

            const time = Date.now() * 0.0006;
            const angleY = time * 0.5;
            const angleX = time * 0.2;

            const cosY = Math.cos(angleY);
            const sinY = Math.sin(angleY);
            const rx = px * cosY - pz * sinY;
            const rz = pz * cosY + px * sinY;

            const cosX = Math.cos(angleX);
            const sinX = Math.sin(angleX);
            const ry = py * cosX - rz * sinX;
            const frz = rz * cosX + py * sinX;

            const fov = Math.max(280, energyRadius * 8);
            const scale = fov / (fov + frz);

            const x2d = rx * scale + width / 2;
            const y2d = ry * scale + height / 2;

            let alpha = (scale - 0.6) * 2;
            if (alpha < 0.1) alpha = 0.1;
            if (alpha > 1) alpha = 1;

            return { x: x2d, y: y2d, scale, alpha };
        }
    }

    for (let i = 0; i < PARTICLE_COUNT; i++) {
        particles.push(new Particle3D());
    }

    return {
        update: (isVoiceActive, isPlayingAudio, _currentAudioSource) => {
            analyser.getByteFrequencyData(dataArray);

            let sum = 0;
            const relevantBins = Math.floor(bufferLength * 0.8);
            for (let i = 0; i < relevantBins; i++) {
                sum += dataArray[i];
            }
            const rawEnergy = sum / relevantBins / 255;

            const minDim = Math.max(1, Math.min(dimensions.w, dimensions.h));
            const baseRadius = Math.max(18, minDim * 0.32);
            const energyMultiplier = 1 + (rawEnergy * 0.3);
            const currentSphereRadius = baseRadius * energyMultiplier;

            ctx.clearRect(0, 0, dimensions.w, dimensions.h);

            const centerX = dimensions.w / 2;
            const centerY = dimensions.h / 2;

            // Dynamic coloring
            const isSelfSpeaking = isPlayingAudio;
            const isUserSpeaking = !isPlayingAudio && isVoiceActive && rawEnergy > 0.05;

            let baseRGB = '192, 132, 252'; // Purple default
            if (isSelfSpeaking) baseRGB = '59, 130, 246'; // AI Blue
            if (isUserSpeaking) baseRGB = '16, 185, 129'; // User Green

            // Inner Core
            ctx.beginPath();
            const coreBase = Math.max(6, baseRadius * 0.18);
            const coreSize = coreBase + (rawEnergy * (baseRadius * 0.4));
            ctx.fillStyle = `rgba(${baseRGB}, ${0.4 + rawEnergy * 0.6})`;
            ctx.arc(centerX, centerY, coreSize, 0, Math.PI * 2);
            ctx.fill();

            // Particles
            particles.forEach(p => {
                const audioVal = dataArray[p.freqIndex] || 0;
                const point = p.project(dimensions.w, dimensions.h, currentSphereRadius, audioVal);
                const size = Math.max(0.8, (baseRadius / 45) * point.scale);

                ctx.beginPath();
                ctx.arc(point.x, point.y, size, 0, Math.PI * 2);
                ctx.fillStyle = `rgba(${baseRGB}, ${point.alpha})`;
                ctx.fill();
            });

            return { rawEnergy, resizeObserver };
        }
    };
}
