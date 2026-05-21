// 🔥 NVIDIA DSX Air GPU 抢机器脚本 v2.0
// 先停掉旧脚本
window.__simStateLoop?.stop?.();

window.__gpuGrabber = (() => {
    const SIM_ID = '45363619-449a-47dc-b9b3-19006e7b0390';
    const BASE = `https://api.dsx-air.nvidia.com/api/v3/simulations/${SIM_ID}`;
    const REFERER = `https://dsx-air.nvidia.com/simulations/${SIM_ID}`;

    let stopped = false;
    let stats = { checks: 0, starts: 0, errors: 0, startTime: Date.now() };

    const sleep = (ms) => new Promise(r => setTimeout(r, ms));
    const ts = () => new Date().toLocaleTimeString();

    // 🔊 抢到时播放提示音
    const beep = () => {
        try {
            const ctx = new AudioContext();
            const osc = ctx.createOscillator();
            osc.connect(ctx.destination);
            osc.frequency.value = 800;
            osc.start(); osc.stop(ctx.currentTime + 0.3);
            setTimeout(() => { osc.frequency.value = 1200; const o2 = ctx.createOscillator(); o2.connect(ctx.destination); o2.frequency.value = 1200; o2.start(); o2.stop(ctx.currentTime + 0.5); }, 400);
        } catch (e) { }
    };

    // 📡 GET 查状态（轻量，不会触发 validation error）
    const getState = async () => {
        const r = await fetch(`${BASE}/`, {
            method: 'GET', mode: 'cors', credentials: 'include',
            referrer: REFERER,
            headers: { 'accept': 'application/json, text/plain, */*' }
        });
        const d = await r.json();
        stats.checks++;
        return d.state;
    };

    // 🚀 PATCH 启动（仅在 INACTIVE 时调用）
    const startSim = async () => {
        const r = await fetch(`${BASE}/start/`, {
            method: 'PATCH', mode: 'cors', credentials: 'include',
            referrer: REFERER,
            headers: {
                'accept': 'application/json, text/plain, */*',
                'cache-control': 'no-cache', 'pragma': 'no-cache'
            },
            body: null
        });
        stats.starts++;
        const d = await r.json();
        return { ok: r.ok, state: d.state, detail: d.detail };
    };

    const run = async () => {
        console.log(`%c[${ts()}] 🎮 GPU Grabber v2.0 启动！`, 'color: #76b900; font-weight: bold; font-size: 14px');

        while (!stopped) {
            try {
                const state = await getState();
                const elapsed = ((Date.now() - stats.startTime) / 60000).toFixed(1);

                switch (state) {
                    case 'INACTIVE':
                        // 🎯 机器空了！立即抢！
                        console.log(`%c[${ts()}] 💤 INACTIVE → 立即发起 start！`, 'color: orange; font-weight: bold');
                        const result = await startSim();
                        if (result.ok) {
                            console.log(`%c[${ts()}] 🚀 REQUESTING！正在排队等 GPU...`, 'color: #76b900');
                        } else {
                            console.warn(`[${ts()}] ⚠️ start 失败:`, result.detail);
                        }
                        await sleep(1000); // 1秒后再查状态
                        break;

                    case 'REQUESTING':
                        // ⏳ 排队中，快速轮询等 GPU 分配
                        console.log(`[${ts()}] ⏳ REQUESTING... (${elapsed}min | 查${stats.checks}次 | 抢${stats.starts}次)`);
                        await sleep(3000); // 3秒轮询
                        break;

                    case 'ACTIVE':
                        // 🎉 抢到了！
                        console.log(`%c[${ts()}] 🎉🎉🎉 GPU 已分配！state=ACTIVE！`, 'color: #76b900; font-weight: bold; font-size: 18px');
                        beep();
                        // 弹窗提醒
                        if (Notification.permission === 'granted') {
                            new Notification('🎮 NVIDIA GPU 抢到了！', { body: 'DSX Air simulation 已激活' });
                        }
                        stopped = true;
                        return;

                    default:
                        console.log(`[${ts()}] ❓ 未知状态: ${state}`);
                        await sleep(5000);
                }
            } catch (e) {
                stats.errors++;
                console.error(`[${ts()}] ❌ 请求失败 (第${stats.errors}次):`, e.message);
                await sleep(5000); // 出错等久一点
            }
        }
    };

    // 请求通知权限
    Notification.requestPermission?.();
    run();

    return {
        stop() { stopped = true; console.log(`%c[${ts()}] 🛑 Grabber 已停止`, 'color: red'); },
        stats() { return { ...stats, elapsed: ((Date.now() - stats.startTime) / 60000).toFixed(1) + 'min' }; }
    };
})();

// 用法：
// window.__gpuGrabber.stop()   — 停止
// window.__gpuGrabber.stats()  — 查看统计