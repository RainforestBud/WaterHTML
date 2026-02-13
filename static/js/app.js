// 全局变量
let mqttClient = null;
let chart = null;
let currentData = {
    quality: 0,
    pressure: 0,
    flow: 0
};

// 默认配置
let config = {
    host: 'wss://broker.emqx.io:8084/mqtt',
    topics: {
        quality: 'sensor/water/quality',
        pressure: 'sensor/water/pressure',
        flow: 'sensor/water/flow',
        pump: 'control/pump',
        valve: 'control/valve'
    },
    llm: {
        apiUrl: 'https://open.bigmodel.cn/api/paas/v4/chat/completions',
        apiKey: 'a3957d88a9e04bc288c4214a5201e847.H6PkLGmnTLQrzkTk',
        model: 'GLM-4.7-Flash'
    }
};

// 初始化
document.addEventListener('DOMContentLoaded', () => {
    initChart();
    initMQTT();
    setupEventListeners();
    loadSettings();
    initTheme();
});

// 初始化图表
function initChart() {
    const ctx = document.getElementById('mainChart').getContext('2d');

    // 渐变色
    const gradientQuality = ctx.createLinearGradient(0, 0, 0, 400);
    gradientQuality.addColorStop(0, 'rgba(48, 209, 88, 0.5)');
    gradientQuality.addColorStop(1, 'rgba(48, 209, 88, 0)');

    const gradientPressure = ctx.createLinearGradient(0, 0, 0, 400);
    gradientPressure.addColorStop(0, 'rgba(255, 159, 10, 0.5)');
    gradientPressure.addColorStop(1, 'rgba(255, 159, 10, 0)');

    const gradientFlow = ctx.createLinearGradient(0, 0, 0, 400);
    gradientFlow.addColorStop(0, 'rgba(10, 132, 255, 0.5)');
    gradientFlow.addColorStop(1, 'rgba(10, 132, 255, 0)');

    chart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: Array(20).fill(''),
            datasets: [
                {
                    label: '水质',
                    data: Array(20).fill(null),
                    borderColor: '#30d158',
                    backgroundColor: gradientQuality,
                    borderWidth: 2,
                    tension: 0.4,
                    fill: true,
                    yAxisID: 'y'
                },
                {
                    label: '水压',
                    data: Array(20).fill(null),
                    borderColor: '#ff9f0a',
                    backgroundColor: gradientPressure,
                    borderWidth: 2,
                    tension: 0.4,
                    fill: true,
                    yAxisID: 'y1'
                },
                {
                    label: '流量',
                    data: Array(20).fill(null),
                    borderColor: '#0a84ff',
                    backgroundColor: gradientFlow,
                    borderWidth: 2,
                    tension: 0.4,
                    fill: true,
                    yAxisID: 'y'
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                mode: 'index',
                intersect: false,
            },
            plugins: {
                legend: {
                    labels: { color: '#86868b' }
                }
            },
            scales: {
                x: {
                    grid: { color: 'rgba(255, 255, 255, 0.05)' },
                    ticks: { color: '#86868b' }
                },
                y: {
                    type: 'linear',
                    display: true,
                    position: 'left',
                    grid: { color: 'rgba(255, 255, 255, 0.05)' },
                    ticks: { color: '#86868b' },
                    title: { display: true, text: '水质', color: '#86868b' }
                },
                y1: {
                    type: 'linear',
                    display: true,
                    position: 'right',
                    grid: { drawOnChartArea: false },
                    ticks: { color: '#86868b' },
                    title: { display: true, text: '水压 (MPa)', color: '#86868b' }
                }
            }
        }
    });

    // 启动图表自动滚动
    startChartLoop();
}

// 图表自动滚动循环
function startChartLoop() {
    setInterval(() => {
        const timestamp = new Date().toLocaleTimeString();
        const labels = chart.data.labels;

        // 移除旧数据
        if (labels.length >= 20) {
            labels.shift();
            chart.data.datasets.forEach(dataset => dataset.data.shift());
        }

        // 添加新数据
        labels.push(timestamp);
        chart.data.datasets[0].data.push(currentData.quality);
        chart.data.datasets[1].data.push(currentData.pressure);
        chart.data.datasets[2].data.push(currentData.flow);

        chart.update('none'); // 使用 'none' 模式以获得更好的性能
    }, 2000); // 每2秒更新一次
}

// 初始化 MQTT
function initMQTT() {
    if (mqttClient) {
        mqttClient.end();
    }

    const statusEl = document.getElementById('connection-status');
    statusEl.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> 连接中...';
    statusEl.className = 'status-badge';

    console.log(`Connecting to ${config.host}...`);

    mqttClient = mqtt.connect(config.host);

    mqttClient.on('connect', () => {
        console.log('MQTT Connected');
        statusEl.innerHTML = '<i class="fa-solid fa-circle"></i> 已连接';
        statusEl.className = 'status-badge connected';

        // 订阅主题
        const topics = [
            config.topics.quality,
            config.topics.pressure,
            config.topics.flow,
            config.topics.pump,
            config.topics.valve
        ];
        mqttClient.subscribe(topics, (err) => {
            if (!err) console.log('Subscribed to topics');
        });
    });

    mqttClient.on('message', (topic, message) => {
        try {
            const payload = JSON.parse(message.toString());
            const value = payload.value !== undefined ? payload.value : payload;

            updateData(topic, value);
        } catch (e) {
            // 如果不是JSON，尝试直接解析数字
            const value = parseFloat(message.toString());
            if (!isNaN(value)) {
                updateData(topic, value);
            }
        }
    });

    mqttClient.on('error', (err) => {
        console.error('MQTT Error:', err);
        statusEl.innerHTML = '<i class="fa-solid fa-circle"></i> 连接错误';
        statusEl.className = 'status-badge disconnected';
    });

    mqttClient.on('offline', () => {
        statusEl.innerHTML = '<i class="fa-solid fa-circle"></i> 离线';
        statusEl.className = 'status-badge disconnected';
    });
}

// 更新数据
function updateData(topic, value) {
    if (topic === config.topics.quality) {
        currentData.quality = value;
        document.getElementById('val-quality').textContent = value;
    } else if (topic === config.topics.pressure) {
        currentData.pressure = value;
        document.getElementById('val-pressure').textContent = value;
    } else if (topic === config.topics.flow) {
        currentData.flow = value;
        document.getElementById('val-flow').textContent = value;
    } else if (topic === config.topics.pump) {
        // 更新水泵开关状态，但不触发 change 事件
        const checkbox = document.getElementById('sw-pump');
        const newState = (String(value).toUpperCase() === 'ON');
        if (checkbox.checked !== newState) {
            checkbox.checked = newState;
        }
    } else if (topic === config.topics.valve) {
        // 更新电磁阀开关状态，但不触发 change 事件
        const checkbox = document.getElementById('sw-valve');
        const newState = (String(value).toUpperCase() === 'ON');
        if (checkbox.checked !== newState) {
            checkbox.checked = newState;
        }
    }
}

// 设置事件监听器
function setupEventListeners() {
    // 控制开关
    document.getElementById('sw-pump').addEventListener('change', (e) => {
        const cmd = e.target.checked ? 'ON' : 'OFF';
        publishControl(config.topics.pump, cmd);
    });

    document.getElementById('sw-valve').addEventListener('change', (e) => {
        const cmd = e.target.checked ? 'ON' : 'OFF';
        publishControl(config.topics.valve, cmd);
    });

    // AI 诊断
    document.getElementById('diagnose-btn').addEventListener('click', performDiagnosis);

    // 主题切换
    document.getElementById('theme-toggle').addEventListener('click', toggleTheme);

    // 聊天功能
    const chatBtn = document.getElementById('chat-btn');
    const chatBox = document.getElementById('chat-box');
    const closeChat = document.getElementById('close-chat');
    const sendBtn = document.getElementById('send-msg-btn');
    const chatInput = document.getElementById('chat-input');

    chatBtn.addEventListener('click', () => {
        chatBox.classList.add('active');
        chatBtn.style.display = 'none';
    });

    closeChat.addEventListener('click', () => {
        chatBox.classList.remove('active');
        chatBtn.style.display = 'flex';
    });

    sendBtn.addEventListener('click', sendMessage);
    chatInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') sendMessage();
    });

    // 设置模态框
    const modal = document.getElementById('settings-modal');
    const btn = document.getElementById('settings-btn');
    const span = document.getElementsByClassName('close')[0];
    const saveBtn = document.getElementById('save-settings');

    btn.onclick = () => {
        // 填充当前设置
        document.getElementById('mqtt-host').value = config.host;
        document.getElementById('topic-quality').value = config.topics.quality;
        document.getElementById('topic-pressure').value = config.topics.pressure;
        document.getElementById('topic-flow').value = config.topics.flow;
        document.getElementById('topic-pump').value = config.topics.pump;
        document.getElementById('topic-valve').value = config.topics.valve;
        document.getElementById('llm-api-url').value = config.llm.apiUrl;
        document.getElementById('llm-api-key').value = config.llm.apiKey;
        document.getElementById('llm-model').value = config.llm.model;
        modal.style.display = 'block';
    }

    span.onclick = () => modal.style.display = 'none';
    window.onclick = (event) => {
        if (event.target == modal) modal.style.display = 'none';
    }

    saveBtn.onclick = () => {
        config.host = document.getElementById('mqtt-host').value.trim();
        config.topics.quality = document.getElementById('topic-quality').value.trim();
        config.topics.pressure = document.getElementById('topic-pressure').value.trim();
        config.topics.flow = document.getElementById('topic-flow').value.trim();
        config.topics.pump = document.getElementById('topic-pump').value.trim();
        config.topics.valve = document.getElementById('topic-valve').value.trim();
        config.llm.apiUrl = document.getElementById('llm-api-url').value.trim();
        config.llm.apiKey = document.getElementById('llm-api-key').value.trim();
        config.llm.model = document.getElementById('llm-model').value.trim();

        if (!config.llm.apiKey) {
            alert('⚠️ API Key 为空，AI诊断和聊天功能将无法使用！');
        }

        console.log('Saving config:', JSON.stringify(config.llm));
        localStorage.setItem('mqtt_config', JSON.stringify(config));
        modal.style.display = 'none';
        initMQTT(); // 重新连接
    }
}

// 发布控制命令
function publishControl(topic, command) {
    if (mqttClient && mqttClient.connected) {
        mqttClient.publish(topic, command, { qos: 1, retain: true });
        console.log(`Published ${command} to ${topic} (QoS 1)`);
    } else {
        alert('MQTT 未连接');
    }
}

// 执行 AI 诊断
async function performDiagnosis() {
    const loadingEl = document.getElementById('ai-loading');
    const resultEl = document.getElementById('ai-result');
    const btn = document.getElementById('diagnose-btn');

    loadingEl.classList.remove('hidden');
    resultEl.classList.add('hidden');
    btn.disabled = true;

    try {
        const prompt = `
        请作为一位专业的水质监测专家，根据以下传感器数据进行分析并给出简短的诊断报告和建议：
        
        - 水质指数: ${currentData.quality} (0-100，数值越高水质越好)
        - 水压: ${currentData.pressure} MPa
        - 流量: ${currentData.flow} L/min
        
        请分析当前系统状态是否正常，是否存在潜在风险，并给出操作建议。请保持回答简洁专业。
        `;

        const response = await fetch(config.llm.apiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + config.llm.apiKey
            },
            body: JSON.stringify({
                model: config.llm.model,
                messages: [
                    { role: 'system', content: '你是一个专业的水处理系统诊断助手。' },
                    { role: 'user', content: prompt }
                ],
                temperature: 0.7
            })
        });

        if (!response.ok) {
            throw new Error(`API Error: ${response.status}`);
        }

        const data = await response.json();
        const diagnosis = data.choices[0].message.content;

        resultEl.innerHTML = marked.parse(diagnosis);
    } catch (error) {
        console.error('Diagnosis error:', error);
        resultEl.textContent = '诊断失败: ' + error.message;
    } finally {
        loadingEl.classList.add('hidden');
        resultEl.classList.remove('hidden');
        btn.disabled = false;
    }
}

// 加载设置
function loadSettings() {
    const savedConfig = localStorage.getItem('mqtt_config');
    if (savedConfig) {
        const saved = JSON.parse(savedConfig);
        // 合并，确保新字段有默认值
        config.host = saved.host || config.host;
        config.topics = { ...config.topics, ...saved.topics };
        config.llm = { ...config.llm, ...(saved.llm || {}) };
    }
}

// 主题管理
function initTheme() {
    const savedTheme = localStorage.getItem('theme') || 'dark';
    document.documentElement.setAttribute('data-theme', savedTheme);
    updateThemeIcon(savedTheme);
}

function toggleTheme() {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';

    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
    updateThemeIcon(newTheme);
}

function updateThemeIcon(theme) {
    const icon = document.querySelector('#theme-toggle i');
    if (theme === 'dark') {
        icon.className = 'fa-solid fa-sun';
    } else {
        icon.className = 'fa-solid fa-moon';
    }
}

// 聊天功能
async function sendMessage() {
    const input = document.getElementById('chat-input');
    const message = input.value.trim();
    const messagesContainer = document.getElementById('chat-messages');

    if (!message) return;

    // 添加用户消息
    appendMessage('user', message);
    input.value = '';
    input.disabled = true;

    // 添加加载状态
    const loadingId = 'loading-' + Date.now();
    const loadingHtml = `
        <div id="${loadingId}" class="message ai">
            <div class="typing-indicator">
                <span></span><span></span><span></span>
            </div>
        </div>
    `;
    messagesContainer.insertAdjacentHTML('beforeend', loadingHtml);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;

    try {
        const response = await fetch(config.llm.apiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + config.llm.apiKey
            },
            body: JSON.stringify({
                model: config.llm.model,
                messages: [
                    { role: 'system', content: '你是一个专业的水处理系统助手。你可以回答关于水质监测、设备维护和一般水处理知识的问题。' },
                    { role: 'user', content: message }
                ],
                temperature: 0.7
            })
        });

        if (!response.ok) throw new Error('API Error');

        const data = await response.json();
        const reply = data.choices[0].message.content;

        // 移除加载状态并添加回复
        document.getElementById(loadingId).remove();
        appendMessage('ai', reply);

    } catch (error) {
        document.getElementById(loadingId).remove();
        appendMessage('ai', '抱歉，我现在无法回答。请稍后再试。');
        console.error('Chat error:', error);
    } finally {
        input.disabled = false;
        input.focus();
    }
}

function appendMessage(role, text) {
    const messagesContainer = document.getElementById('chat-messages');
    const div = document.createElement('div');
    div.className = `message ${role}`;
    div.innerHTML = marked.parse(text);
    messagesContainer.appendChild(div);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}
