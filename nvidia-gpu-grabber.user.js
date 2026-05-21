// ==UserScript==
// @name         🎮 NVIDIA DSX Air GPU Grabber
// @namespace    https://dsx-air.nvidia.com/
// @version      2.0
// @description  自动抢占 NVIDIA DSX Air GPU 模拟实例，带可视化控制面板
// @author       You
// @match        https://dsx-air.nvidia.com/*
// @grant        GM_notification
// @grant        GM_addStyle
// @grant        GM_getValue
// @grant        GM_setValue
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';

    // ─── Config ───
    // 自动从 URL 中提取 SIM_ID，或从存储中读取
    function detectSimId() {
        const m = location.pathname.match(/\/simulations\/([0-9a-f-]{36})/);
        return m ? m[1] : '';
    }
    let simId = detectSimId() || GM_getValue('sim_id', '');
    const getBase = () => `https://api.dsx-air.nvidia.com/api/v3/simulations/${simId}`;
    const getReferer = () => `https://dsx-air.nvidia.com/simulations/${simId}`;

    // ─── State ───
    let running = false;
    let stopped = true;
    let stats = { checks: 0, starts: 0, errors: 0, startTime: 0 };
    let logs = [];
    const MAX_LOGS = 80;

    // ─── Helpers ───
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const ts = () => new Date().toLocaleTimeString();
    const elapsed = () => stats.startTime ? ((Date.now() - stats.startTime) / 60000).toFixed(1) : '0.0';

    // ─── Audio ───
    function beep() {
        try {
            const ctx = new AudioContext();
            const o = ctx.createOscillator();
            o.connect(ctx.destination);
            o.frequency.value = 800;
            o.start();
            o.stop(ctx.currentTime + 0.3);
            setTimeout(() => {
                const o2 = ctx.createOscillator();
                o2.connect(ctx.destination);
                o2.frequency.value = 1200;
                o2.start();
                o2.stop(ctx.currentTime + 0.5);
                setTimeout(() => ctx.close(), 600);
            }, 400);
        } catch (e) { }
    }

    // ─── API ───
    async function getState() {
        const r = await fetch(`${getBase()}/`, {
            method: 'GET', mode: 'cors', credentials: 'include',
            referrer: getReferer(),
            headers: { 'accept': 'application/json, text/plain, */*' }
        });
        const d = await r.json();
        stats.checks++;
        return d.state;
    }

    async function startSim() {
        const r = await fetch(`${getBase()}/start/`, {
            method: 'PATCH', mode: 'cors', credentials: 'include',
            referrer: getReferer(),
            headers: {
                'accept': 'application/json, text/plain, */*',
                'cache-control': 'no-cache', 'pragma': 'no-cache'
            },
            body: null
        });
        stats.starts++;
        const d = await r.json();
        return { ok: r.ok, state: d.state, detail: d.detail };
    }

    // ─── Logging ───
    function addLog(msg, type = 'info') {
        logs.unshift({ time: ts(), msg, type });
        if (logs.length > MAX_LOGS) logs.pop();
        renderLogs();
    }

    // ─── Main Loop ───
    async function mainLoop() {
        // 读取并验证 SIM_ID
        const input = document.getElementById('gg-sim-id');
        simId = (input.value || '').trim();
        if (!/^[0-9a-f-]{36}$/.test(simId)) {
            addLog('❌ SIM_ID 格式无效，请输入正确的 UUID', 'error');
            return;
        }
        GM_setValue('sim_id', simId);
        running = true;
        stopped = false;
        stats = { checks: 0, starts: 0, errors: 0, startTime: Date.now() };
        logs = [];
        if (statsTimer) clearInterval(statsTimer);
        statsTimer = setInterval(() => { if (running) updateStats(); }, 5000);
        updateUI();
        addLog('🎮 GPU Grabber 启动！', 'success');

        while (!stopped) {
            try {
                const state = await getState();
                updateStatus(state);

                switch (state) {
                    case 'INACTIVE':
                        addLog('💤 INACTIVE → 发起 start...', 'warn');
                        const result = await startSim();
                        if (result.ok) {
                            addLog('🚀 REQUESTING！排队等 GPU...', 'success');
                        } else {
                            addLog(`⚠️ start 失败: ${result.detail}`, 'error');
                        }
                        await sleep(1000);
                        break;
                    case 'REQUESTING':
                        addLog(`⏳ 排队中... (${elapsed()}min)`, 'info');
                        await sleep(3000);
                        break;
                    case 'ACTIVE':
                        addLog('🎉🎉🎉 GPU 已分配！抢到了！', 'success');
                        beep();
                        try {
                            GM_notification({ title: '🎮 NVIDIA GPU 抢到了！', text: 'DSX Air simulation 已激活', timeout: 10000 });
                        } catch (e) { }
                        updateStatus('ACTIVE');
                        stopGrabber();
                        return;
                    default:
                        addLog(`❓ 未知状态: ${state}`, 'warn');
                        await sleep(5000);
                }
                updateStats();
            } catch (e) {
                stats.errors++;
                addLog(`❌ 请求失败: ${e.message}`, 'error');
                updateStats();
                await sleep(5000);
            }
        }
    }

    function stopGrabber() {
        stopped = true;
        running = false;
        if (statsTimer) { clearInterval(statsTimer); statsTimer = null; }
        addLog('🛑 Grabber 已停止', 'error');
        updateUI();
    }

    // ─── Inject Styles ───
    GM_addStyle(`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');

        #gpu-grabber-panel {
            position: fixed; top: 20px; right: 20px; z-index: 999999;
            width: 340px; font-family: 'Inter', sans-serif;
            background: rgba(15, 15, 20, 0.88);
            backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px);
            border: 1px solid rgba(118, 185, 0, 0.25);
            border-radius: 16px; overflow: hidden;
            box-shadow: 0 8px 32px rgba(0,0,0,0.5), 0 0 60px rgba(118,185,0,0.08);
            transition: all 0.3s cubic-bezier(0.4,0,0.2,1);
            user-select: none;
        }
        #gpu-grabber-panel:hover { box-shadow: 0 8px 32px rgba(0,0,0,0.6), 0 0 80px rgba(118,185,0,0.12); }

        #gpu-grabber-panel .gg-header {
            background: linear-gradient(135deg, rgba(118,185,0,0.15), rgba(118,185,0,0.05));
            padding: 14px 16px; display: flex; align-items: center; justify-content: space-between;
            cursor: move; border-bottom: 1px solid rgba(118,185,0,0.15);
        }
        #gpu-grabber-panel .gg-title {
            font-size: 14px; font-weight: 700; color: #76b900;
            display: flex; align-items: center; gap: 8px;
        }
        #gpu-grabber-panel .gg-title span { font-size: 16px; }
        #gpu-grabber-panel .gg-minimize {
            width: 28px; height: 28px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.1);
            background: rgba(255,255,255,0.05); color: #aaa; font-size: 16px; cursor: pointer;
            display: flex; align-items: center; justify-content: center; transition: all 0.2s;
        }
        #gpu-grabber-panel .gg-minimize:hover { background: rgba(255,255,255,0.1); color: #fff; }

        #gpu-grabber-panel .gg-body { padding: 16px; }
        #gpu-grabber-panel.minimized .gg-body { display: none; }

        #gpu-grabber-panel .gg-status-row {
            display: flex; align-items: center; gap: 10px; margin-bottom: 14px;
        }
        #gpu-grabber-panel .gg-dot {
            width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0;
            animation: gg-pulse 2s infinite;
        }
        @keyframes gg-pulse {
            0%, 100% { opacity: 1; } 50% { opacity: 0.4; }
        }
        #gpu-grabber-panel .gg-dot.idle { background: #555; animation: none; }
        #gpu-grabber-panel .gg-dot.running { background: #76b900; }
        #gpu-grabber-panel .gg-dot.active { background: #00e5ff; }
        #gpu-grabber-panel .gg-dot.error { background: #ff4444; }

        #gpu-grabber-panel .gg-status-text {
            font-size: 13px; color: #ccc; font-weight: 500;
        }
        #gpu-grabber-panel .gg-state-badge {
            margin-left: auto; padding: 3px 10px; border-radius: 20px;
            font-size: 11px; font-weight: 600; letter-spacing: 0.5px;
            background: rgba(255,255,255,0.06); color: #888; border: 1px solid rgba(255,255,255,0.08);
        }
        #gpu-grabber-panel .gg-state-badge.INACTIVE { color: #ffa726; border-color: rgba(255,167,38,0.3); background: rgba(255,167,38,0.1); }
        #gpu-grabber-panel .gg-state-badge.REQUESTING { color: #42a5f5; border-color: rgba(66,165,245,0.3); background: rgba(66,165,245,0.1); }
        #gpu-grabber-panel .gg-state-badge.ACTIVE { color: #66bb6a; border-color: rgba(102,187,106,0.3); background: rgba(102,187,106,0.1); }

        #gpu-grabber-panel .gg-stats {
            display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 14px;
        }
        #gpu-grabber-panel .gg-stat {
            background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06);
            border-radius: 10px; padding: 10px 12px; text-align: center;
        }
        #gpu-grabber-panel .gg-stat-val {
            font-size: 20px; font-weight: 700; color: #fff;
            font-variant-numeric: tabular-nums;
        }
        #gpu-grabber-panel .gg-stat-label {
            font-size: 10px; color: #777; margin-top: 2px; text-transform: uppercase;
            letter-spacing: 0.8px;
        }

        #gpu-grabber-panel .gg-btn-row { display: flex; gap: 8px; margin-bottom: 14px; }
        #gpu-grabber-panel .gg-btn {
            flex: 1; padding: 10px; border: none; border-radius: 10px;
            font-size: 13px; font-weight: 600; cursor: pointer;
            transition: all 0.2s; font-family: 'Inter', sans-serif;
        }
        #gpu-grabber-panel .gg-btn:active { transform: scale(0.97); }
        #gpu-grabber-panel .gg-btn-start {
            background: linear-gradient(135deg, #76b900, #5a8f00);
            color: #fff; box-shadow: 0 4px 15px rgba(118,185,0,0.3);
        }
        #gpu-grabber-panel .gg-btn-start:hover { box-shadow: 0 4px 20px rgba(118,185,0,0.5); }
        #gpu-grabber-panel .gg-btn-start:disabled {
            background: #333; color: #666; box-shadow: none; cursor: not-allowed;
        }
        #gpu-grabber-panel .gg-btn-stop {
            background: linear-gradient(135deg, #d32f2f, #b71c1c);
            color: #fff; box-shadow: 0 4px 15px rgba(211,47,47,0.3);
        }
        #gpu-grabber-panel .gg-btn-stop:hover { box-shadow: 0 4px 20px rgba(211,47,47,0.5); }
        #gpu-grabber-panel .gg-btn-stop:disabled {
            background: #333; color: #666; box-shadow: none; cursor: not-allowed;
        }

        #gpu-grabber-panel .gg-input-group {
            margin-bottom: 14px;
        }
        #gpu-grabber-panel .gg-input-label {
            font-size: 11px; color: #777; margin-bottom: 6px; display: flex;
            align-items: center; gap: 6px; text-transform: uppercase;
            letter-spacing: 0.8px; font-weight: 600;
        }
        #gpu-grabber-panel .gg-input-label .gg-auto-tag {
            font-size: 9px; color: #76b900; background: rgba(118,185,0,0.12);
            border: 1px solid rgba(118,185,0,0.25); border-radius: 4px;
            padding: 1px 5px; text-transform: none; letter-spacing: 0;
        }
        #gpu-grabber-panel .gg-sim-input {
            width: 100%; box-sizing: border-box; padding: 9px 12px;
            background: rgba(0,0,0,0.35); border: 1px solid rgba(255,255,255,0.1);
            border-radius: 8px; color: #ddd; font-size: 12px;
            font-family: 'Consolas', 'Monaco', monospace; outline: none;
            transition: border-color 0.2s;
        }
        #gpu-grabber-panel .gg-sim-input:focus {
            border-color: rgba(118,185,0,0.5);
        }
        #gpu-grabber-panel .gg-sim-input:disabled {
            opacity: 0.5; cursor: not-allowed;
        }
        #gpu-grabber-panel .gg-sim-input::placeholder {
            color: #555;
        }

        #gpu-grabber-panel .gg-logs {
            background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.05);
            border-radius: 10px; height: 160px; overflow-y: auto; padding: 8px 10px;
            font-size: 11px; line-height: 1.7;
        }
        #gpu-grabber-panel .gg-logs::-webkit-scrollbar { width: 4px; }
        #gpu-grabber-panel .gg-logs::-webkit-scrollbar-thumb { background: rgba(118,185,0,0.3); border-radius: 4px; }
        #gpu-grabber-panel .gg-log-entry { color: #888; }
        #gpu-grabber-panel .gg-log-entry .gg-log-time { color: #555; margin-right: 6px; }
        #gpu-grabber-panel .gg-log-entry.success { color: #76b900; }
        #gpu-grabber-panel .gg-log-entry.warn { color: #ffa726; }
        #gpu-grabber-panel .gg-log-entry.error { color: #ef5350; }

        #gpu-grabber-panel .gg-footer {
            padding: 8px 16px; text-align: center; font-size: 10px; color: #444;
            border-top: 1px solid rgba(255,255,255,0.04);
        }
    `);

    // ─── Build DOM ───
    const panel = document.createElement('div');
    panel.id = 'gpu-grabber-panel';
    panel.innerHTML = `
        <div class="gg-header" id="gg-drag-handle">
            <div class="gg-title"><span>🎮</span> GPU Grabber</div>
            <button class="gg-minimize" id="gg-toggle-btn">−</button>
        </div>
        <div class="gg-body">
            <div class="gg-input-group">
                <div class="gg-input-label">Simulation ID ${simId && detectSimId() ? '<span class="gg-auto-tag">自动检测</span>' : ''}</div>
                <input type="text" class="gg-sim-input" id="gg-sim-id" value="${simId}" placeholder="请输入 Simulation UUID..." spellcheck="false" />
            </div>
            <div class="gg-status-row">
                <div class="gg-dot idle" id="gg-dot"></div>
                <div class="gg-status-text" id="gg-status-text">待命中</div>
                <div class="gg-state-badge" id="gg-state-badge">—</div>
            </div>
            <div class="gg-stats">
                <div class="gg-stat"><div class="gg-stat-val" id="gg-s-checks">0</div><div class="gg-stat-label">查询</div></div>
                <div class="gg-stat"><div class="gg-stat-val" id="gg-s-starts">0</div><div class="gg-stat-label">抢占</div></div>
                <div class="gg-stat"><div class="gg-stat-val" id="gg-s-errors">0</div><div class="gg-stat-label">错误</div></div>
                <div class="gg-stat"><div class="gg-stat-val" id="gg-s-time">0.0m</div><div class="gg-stat-label">运行时长</div></div>
            </div>
            <div class="gg-btn-row">
                <button class="gg-btn gg-btn-start" id="gg-btn-start">▶ 开始抢占</button>
                <button class="gg-btn gg-btn-stop" id="gg-btn-stop" disabled>■ 停止</button>
            </div>
            <div class="gg-logs" id="gg-logs"><div style="color:#555;text-align:center;margin-top:60px;">等待启动...</div></div>
        </div>
        <div class="gg-footer">NVIDIA DSX Air GPU Grabber v2.0</div>
    `;
    document.body.appendChild(panel);

    // ─── Drag ───
    const handle = document.getElementById('gg-drag-handle');
    let dragging = false, dx = 0, dy = 0;
    handle.addEventListener('mousedown', e => {
        if (e.target.id === 'gg-toggle-btn') return;
        dragging = true;
        const rect = panel.getBoundingClientRect();
        dx = e.clientX - rect.left;
        dy = e.clientY - rect.top;
    });
    document.addEventListener('mousemove', e => {
        if (!dragging) return;
        panel.style.left = (e.clientX - dx) + 'px';
        panel.style.top = (e.clientY - dy) + 'px';
        panel.style.right = 'auto';
    });
    document.addEventListener('mouseup', () => dragging = false);

    // ─── Minimize Toggle ───
    document.getElementById('gg-toggle-btn').addEventListener('click', () => {
        panel.classList.toggle('minimized');
        document.getElementById('gg-toggle-btn').textContent = panel.classList.contains('minimized') ? '+' : '−';
    });

    // ─── Button Events ───
    document.getElementById('gg-btn-start').addEventListener('click', () => {
        if (!running) mainLoop();
    });
    document.getElementById('gg-btn-stop').addEventListener('click', () => {
        if (running) stopGrabber();
    });

    // ─── UI Updates ───
    function updateUI() {
        document.getElementById('gg-btn-start').disabled = running;
        document.getElementById('gg-btn-stop').disabled = !running;
        document.getElementById('gg-sim-id').disabled = running;
        const dot = document.getElementById('gg-dot');
        const statusText = document.getElementById('gg-status-text');
        if (running) {
            dot.className = 'gg-dot running';
            statusText.textContent = '运行中...';
        } else {
            dot.className = 'gg-dot idle';
            statusText.textContent = '待命中';
        }
    }

    function updateStatus(state) {
        const badge = document.getElementById('gg-state-badge');
        badge.textContent = state;
        badge.className = 'gg-state-badge ' + state;
        const dot = document.getElementById('gg-dot');
        if (state === 'ACTIVE') {
            dot.className = 'gg-dot active';
            document.getElementById('gg-status-text').textContent = '🎉 已抢到！';
        }
    }

    function updateStats() {
        document.getElementById('gg-s-checks').textContent = stats.checks;
        document.getElementById('gg-s-starts').textContent = stats.starts;
        document.getElementById('gg-s-errors').textContent = stats.errors;
        document.getElementById('gg-s-time').textContent = elapsed() + 'm';
    }

    function renderLogs() {
        const el = document.getElementById('gg-logs');
        el.innerHTML = logs.map(l =>
            `<div class="gg-log-entry ${l.type}"><span class="gg-log-time">${l.time}</span>${l.msg}</div>`
        ).join('');
    }

    // ─── Timer for elapsed ───
    let statsTimer = null;
})();
