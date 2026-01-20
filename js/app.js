/**
 * Minecraft 服务器监控面板 - 主JavaScript文件
 * 包含所有前端交互逻辑
 */

// 全局变量
let autoRefreshInterval = null;
let isRefreshing = false;
let serversData = null;

// DOMContentLoaded事件
document.addEventListener('DOMContentLoaded', function() {
    initializeApp();
});

/**
 * 应用初始化
 */
function initializeApp() {
    console.log('🎮 Minecraft服务器监控面板正在启动...');

    // 绑定事件监听器
    bindEventListeners();

    // 加载服务器数据
    loadServers();

    // 启动自动刷新
    startAutoRefresh();

    // 页面可见性变化监听
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // 添加键盘快捷键
    document.addEventListener('keydown', handleKeyboardShortcuts);

    console.log('✅ 应用初始化完成');
}

/**
 * 绑定事件监听器
 */
function bindEventListeners() {
    // 添加服务器表单
    const addServerForm = document.getElementById('addServerForm');
    if (addServerForm) {
        addServerForm.addEventListener('submit', addServer);
    }

    // 关闭模态框按钮
    const closeModalBtn = document.querySelector('.close-modal');
    if (closeModalBtn) {
        closeModalBtn.addEventListener('click', hideAddServerModal);
    }

    // 模态框外部点击关闭
    const modal = document.getElementById('addServerModal');
    if (modal) {
        modal.addEventListener('click', function(event) {
            if (event.target === this) {
                hideAddServerModal();
            }
        });
    }

    // 服务器地址输入框回车键监听
    const serverAddressInput = document.getElementById('serverAddress');
    if (serverAddressInput) {
        serverAddressInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                const form = this.closest('form');
                if (form) {
                    const submitBtn = form.querySelector('button[type="submit"]');
                    if (submitBtn) submitBtn.click();
                }
            }
        });
    }
}

/**
 * 页面可见性变化处理
 */
function handleVisibilityChange() {
    if (document.visibilityState === 'visible') {
        console.log('🔄 页面恢复可见，刷新数据');
        loadServers();
    } else {
        console.log('⏸️ 页面隐藏，暂停自动刷新');
        clearInterval(autoRefreshInterval);
    }
}

/**
 * 键盘快捷键处理
 */
function handleKeyboardShortcuts(event) {
    // 按F5刷新
    if (event.key === 'F5') {
        event.preventDefault();
        refreshAllServers();
    }

    // 按ESC关闭模态框
    if (event.key === 'Escape') {
        hideAddServerModal();
    }

    // 按Ctrl+N或Cmd+N添加服务器
    if ((event.ctrlKey || event.metaKey) && event.key === 'n') {
        event.preventDefault();
        showAddServerModal();
    }
}

/**
 * 加载服务器列表
 */
async function loadServers() {
    if (isRefreshing) return;

    try {
        isRefreshing = true;
        showLoading(true);

        const timestamp = Date.now();
        const response = await fetch(`/api/servers?t=${timestamp}`);

        if (!response.ok) {
            throw new Error(`HTTP错误! 状态: ${response.status}`);
        }

        const data = await response.json();
        serversData = data;

        updateDashboard(data);
        renderServerList(data.servers);

    } catch (error) {
        console.error('❌ 加载服务器失败:', error);
        showToast(`加载失败: ${error.message}`, 'error');

        // 显示错误状态
        const serverList = document.getElementById('serverList');
        if (serverList) {
            serverList.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-exclamation-triangle"></i>
                    <h3>加载失败</h3>
                    <p>无法连接到服务器监控服务</p>
                    <button class="btn btn-primary" onclick="loadServers()">
                        <i class="fas fa-redo"></i> 重试
                    </button>
                </div>
            `;
        }
    } finally {
        showLoading(false);
        isRefreshing = false;
    }
}

/**
 * 刷新所有服务器
 */
async function refreshAllServers() {
    if (isRefreshing) {
        showToast('正在刷新中，请稍候...', 'info');
        return;
    }

    try {
        isRefreshing = true;
        showToast('正在刷新服务器状态...', 'info');

        const response = await fetch('/api/refresh', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            }
        });

        if (!response.ok) {
            throw new Error(`刷新失败! 状态: ${response.status}`);
        }

        const data = await response.json();
        serversData = data;

        updateDashboard(data);
        renderServerList(data.servers);
        showToast(`✅ 已刷新 ${data.online}/${data.total} 个在线服务器`, 'success');

    } catch (error) {
        console.error('❌ 刷新服务器失败:', error);
        showToast(`刷新失败: ${error.message}`, 'error');
    } finally {
        isRefreshing = false;
    }
}

/**
 * 更新仪表板统计数据
 */
function updateDashboard(data) {
    if (!data) return;

    const elements = {
        totalServers: document.getElementById('totalServers'),
        onlineServers: document.getElementById('onlineServers'),
        totalPlayers: document.getElementById('totalPlayers'),
        lastUpdated: document.getElementById('lastUpdated')
    };

    if (elements.totalServers) {
        elements.totalServers.textContent = data.total || 0;
        elements.totalServers.className = 'stat-value total';
    }

    if (elements.onlineServers) {
        const online = data.online || 0;
        const total = data.total || 1;
        const percentage = Math.round((online / total) * 100);

        elements.onlineServers.textContent = online;
        elements.onlineServers.className = 'stat-value online';
        elements.onlineServers.title = `${percentage}% 在线率`;
    }

    if (elements.totalPlayers) {
        elements.totalPlayers.textContent = data.totalPlayers || 0;
    }

    if (elements.lastUpdated) {
        elements.lastUpdated.textContent = formatRelativeTime(data.timestamp || Date.now());
    }
}

/**
 * 渲染服务器列表
 */
function renderServerList(servers) {
    const serverList = document.getElementById('serverList');
    if (!serverList) return;

    if (!servers || servers.length === 0) {
        serverList.innerHTML = createEmptyState();
        return;
    }

    serverList.innerHTML = servers.map(server => createServerCard(server)).join('');

    // 为每个卡片添加删除按钮事件
    servers.forEach(server => {
        const deleteBtn = document.getElementById(`delete-server-${server.id}`);
        if (deleteBtn) {
            deleteBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                deleteServer(server.id, server.name);
            });
        }
    });
}

/**
 * 创建服务器卡片HTML
 */
function createServerCard(server) {
    const isOnline = server.online;
    const playerCount = server.players?.online || 0;
    const maxPlayers = server.players?.max || 0;
    const playerPercentage = maxPlayers > 0 ? Math.round((playerCount / maxPlayers) * 100) : 0;

    return `
        <div class="server-card ${isOnline ? 'online' : 'offline'}" 
             id="server-${server.id}"
             onclick="viewServerDetail(${server.id})"
             style="cursor: pointer;">
            <div class="server-header">
                <div class="server-info">
                    <h3>
                        <i class="fas fa-server"></i>
                        ${escapeHtml(server.name || '未知服务器')}
                    </h3>
                    <div class="server-address" title="${server.address}:${server.port}">
                        ${server.address}:${server.port}
                    </div>
                </div>
                <div class="server-status">
                    <div class="status-dot ${isOnline ? 'online' : 'offline'}"></div>
                    <span>${isOnline ? '在线' : '离线'}</span>
                </div>
            </div>
            
            <div class="server-content">
                ${server.description ? `
                    <div class="server-description" title="${escapeHtml(server.description)}">
                        ${escapeHtml(server.description)}
                    </div>
                ` : ''}
                
                <div class="server-stats">
                    <div class="stat">
                        <div class="stat-label">在线玩家</div>
                        <div class="stat-value">${playerCount}</div>
                    </div>
                    <div class="stat">
                        <div class="stat-label">服务器负载</div>
                        <div class="stat-value">${playerPercentage}%</div>
                    </div>
                    <div class="stat">
                        <div class="stat-label">版本</div>
                        <div class="stat-value" title="${escapeHtml(server.version || '未知版本')}">
                            ${escapeHtml((server.version || '未知').substring(0, 10))}
                        </div>
                    </div>
                    <div class="stat">
                        <div class="stat-label">延迟</div>
                        <div class="stat-value">${server.ping ? server.ping + 'ms' : '-'}</div>
                    </div>
                </div>
                
                ${isOnline && playerCount > 0 ? `
                    <div class="server-players">
                        <div class="players-header">
                            <div class="player-count">在线玩家 (${playerCount}/${maxPlayers})</div>
                        </div>
                        ${server.players?.sample && server.players.sample.length > 0 ? `
                            <div class="player-list">
                                ${server.players.sample.slice(0, 8).map(player => `
                                    <span class="player-tag" title="${escapeHtml(player.name || player)}">
                                        <i class="fas fa-user"></i>
                                        ${escapeHtml((player.name || player).substring(0, 12))}
                                    </span>
                                `).join('')}
                                ${playerCount > 8 ? `
                                    <span class="player-tag">+${playerCount - 8}</span>
                                ` : ''}
                            </div>
                        ` : `
                            <div class="no-players">玩家列表不可用</div>
                        `}
                    </div>
                ` : ''}
            </div>
            
            <div class="server-footer">
                <span class="server-category">${escapeHtml(server.category || '未分类')}</span>
                <div class="server-actions">
                    <button class="btn btn-outline btn-small" 
                            onclick="refreshServer(${server.id}, event)">
                        <i class="fas fa-redo"></i>
                    </button>
                    <button class="btn btn-danger btn-small" 
                            id="delete-server-${server.id}">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
                <span class="last-updated" title="${new Date(server.lastUpdated).toLocaleString()}">
                    ${formatRelativeTime(new Date(server.lastUpdated))}
                </span>
            </div>
        </div>
    `;
}

/**
 * 创建空状态HTML
 */
function createEmptyState() {
    return `
        <div class="empty-state">
            <i class="fas fa-server"></i>
            <h3>暂无服务器</h3>
            <p>点击下方按钮添加您的第一个Minecraft服务器</p>
            <button class="btn btn-primary" onclick="showAddServerModal()">
                <i class="fas fa-plus"></i> 添加服务器
            </button>
        </div>
    `;
}

/**
 * 显示添加服务器模态框
 */
function showAddServerModal() {
    const modal = document.getElementById('addServerModal');
    if (!modal) return;

    modal.classList.add('show');
    document.getElementById('serverName').focus();
    document.body.style.overflow = 'hidden'; // 防止背景滚动

    // 添加动画类
    const modalContent = modal.querySelector('.modal-content');
    if (modalContent) {
        modalContent.style.animation = 'slideUp 0.3s ease';
    }
}

/**
 * 隐藏添加服务器模态框
 */
function hideAddServerModal() {
    const modal = document.getElementById('addServerModal');
    if (!modal) return;

    modal.classList.remove('show');
    document.body.style.overflow = '';

    // 重置表单
    const form = document.getElementById('addServerForm');
    if (form) {
        form.reset();
        clearFormErrors();
    }
}

/**
 * 清除表单错误信息
 */
function clearFormErrors() {
    document.querySelectorAll('.error-message').forEach(el => {
        el.classList.remove('show');
    });
}

/**
 * 添加服务器
 */
async function addServer(event) {
    event.preventDefault();

    const formData = {
        name: document.getElementById('serverName').value.trim(),
        address: document.getElementById('serverAddress').value.trim(),
        port: document.getElementById('serverPort').value.trim() || '25565',
        category: document.getElementById('serverCategory').value.trim(),
        description: document.getElementById('serverDescription').value.trim()
    };

    // 验证表单
    if (!validateServerForm(formData)) {
        return;
    }

    try {
        const response = await fetch('/api/servers', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                ...formData,
                port: parseInt(formData.port)
            })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || '添加失败');
        }

        const result = await response.json();

        hideAddServerModal();
        showToast(`✅ 服务器 "${formData.name}" 添加成功`, 'success');

        // 加载更新后的服务器列表
        setTimeout(() => loadServers(), 500);

    } catch (error) {
        console.error('❌ 添加服务器失败:', error);
        showToast(`添加失败: ${error.message}`, 'error');
    }
}

/**
 * 验证服务器表单
 */
function validateServerForm(data) {
    let isValid = true;
    clearFormErrors();

    // 验证服务器名称
    if (!data.name) {
        showFormError('nameError', '请输入服务器名称');
        isValid = false;
    } else if (data.name.length > 50) {
        showFormError('nameError', '服务器名称不能超过50个字符');
        isValid = false;
    }

    // 验证服务器地址
    if (!data.address) {
        showFormError('addressError', '请输入服务器地址');
        isValid = false;
    } else if (!isValidAddress(data.address)) {
        showFormError('addressError', '请输入有效的服务器地址');
        isValid = false;
    }

    // 验证端口号
    const port = parseInt(data.port);
    if (isNaN(port) || port < 1 || port > 65535) {
        showFormError('portError', '端口号必须在 1-65535 之间');
        isValid = false;
    }

    return isValid;
}

/**
 * 显示表单错误
 */
function showFormError(fieldId, message) {
    const errorElement = document.getElementById(fieldId);
    if (errorElement) {
        errorElement.textContent = message;
        errorElement.classList.add('show');

        // 输入框高亮
        const inputField = document.getElementById(fieldId.replace('Error', ''));
        if (inputField) {
            inputField.style.borderColor = 'var(--danger)';
            inputField.addEventListener('input', function() {
                this.style.borderColor = '';
            }, { once: true });
        }
    }
}

/**
 * 验证服务器地址格式
 */
function isValidAddress(address) {
    // 允许域名、IP地址、本地地址
    const patterns = [
        /^[a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?)*\.[a-zA-Z]{2,}$/, // 域名
        /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/, // IPv4
        /^localhost$/, // localhost
        /^[a-zA-Z0-9\-_]+$/, // 无后缀的主机名
    ];

    return patterns.some(pattern => pattern.test(address));
}

// /**
//  * 删除服务器
//  */
// async function deleteServer(serverId, serverName) {
//     if (!confirm(`确定要删除服务器 "${serverName}" 吗？`)) {
//         return;
//     }
//
//     try {
//         const response = await fetch(`/api/server/${serverId}`, {
//             method: 'DELETE'
//         });
//
//         if (!response.ok) {
//             throw new Error('删除失败');
//         }
//
//         showToast(`✅ 服务器 "${serverName}" 已删除`, 'success');
//
//         // 重新加载服务器列表
//         setTimeout(() => loadServers(), 500);
//
//     } catch (error) {
//         console.error('❌ 删除服务器失败:', error);
//         showToast('删除失败: ' + error.message, 'error');
//     }
// }

/**
 * 删除服务器
 */
async function deleteServer(serverId, serverName) {
    // 显示确认对话框
    const confirmed = await showConfirmDialog(
        '确认删除',
        `确定要删除服务器 <strong>"${escapeHtml(serverName)}"</strong> 吗？`,
        'warning'
    );

    if (!confirmed) {
        return;
    }

    try {
        showToast('正在删除服务器...', 'info');

        const response = await fetch(`/api/server/${serverId}`, {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json'
            }
        });

        const data = await response.json();

        if (!response.ok) {
            // 从响应中获取更详细的错误信息
            const errorMessage = data.details || data.error || '删除失败';
            throw new Error(errorMessage);
        }

        // 显示成功消息
        showToast(data.message || `✅ 服务器 "${serverName}" 已删除`, 'success');

        // 重新加载服务器列表
        setTimeout(() => {
            loadServers();
        }, 1000);

    } catch (error) {
        console.error('❌ 删除服务器失败:', error);

        // 显示详细的错误信息
        let errorMessage = error.message;
        if (errorMessage.includes('NetworkError') || errorMessage.includes('Failed to fetch')) {
            errorMessage = '网络错误：无法连接到服务器监控服务';
        }

        showToast(`删除失败: ${errorMessage}`, 'error');
    }
}

/**
 * 显示确认对话框
 */
function showConfirmDialog(title, message, type = 'warning') {
    return new Promise((resolve) => {
        // 创建对话框元素
        const dialog = document.createElement('div');
        dialog.className = 'confirm-dialog';
        dialog.innerHTML = `
            <div class="confirm-dialog-overlay"></div>
            <div class="confirm-dialog-content">
                <div class="confirm-dialog-header">
                    <h3>${title}</h3>
                    <button class="confirm-dialog-close">×</button>
                </div>
                <div class="confirm-dialog-body">
                    ${message}
                </div>
                <div class="confirm-dialog-footer">
                    <button class="btn btn-outline confirm-cancel">取消</button>
                    <button class="btn btn-danger confirm-ok">确认删除</button>
                </div>
            </div>
        `;

        document.body.appendChild(dialog);

        // 添加样式
        const style = document.createElement('style');
        style.textContent = `
            .confirm-dialog {
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                z-index: 2000;
            }
            
            .confirm-dialog-overlay {
                position: absolute;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0, 0, 0, 0.5);
                backdrop-filter: blur(4px);
            }
            
            .confirm-dialog-content {
                position: absolute;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                background: white;
                border-radius: 16px;
                padding: 24px;
                min-width: 300px;
                max-width: 400px;
                box-shadow: 0 10px 30px rgba(0, 0, 0, 0.2);
                animation: slideUp 0.3s ease;
            }
            
            .confirm-dialog-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 20px;
            }
            
            .confirm-dialog-header h3 {
                color: var(--dark);
                font-size: 18px;
                font-weight: 600;
                margin: 0;
            }
            
            .confirm-dialog-close {
                background: none;
                border: none;
                font-size: 24px;
                color: var(--gray);
                cursor: pointer;
                padding: 0;
                width: 30px;
                height: 30px;
                display: flex;
                align-items: center;
                justify-content: center;
                border-radius: 50%;
                transition: all 0.3s;
            }
            
            .confirm-dialog-close:hover {
                background: var(--light);
                color: var(--danger);
            }
            
            .confirm-dialog-body {
                margin-bottom: 24px;
                color: var(--dark);
                line-height: 1.5;
            }
            
            .confirm-dialog-footer {
                display: flex;
                gap: 12px;
                justify-content: flex-end;
            }
        `;
        document.head.appendChild(style);

        // 绑定事件
        const closeBtn = dialog.querySelector('.confirm-dialog-close');
        const cancelBtn = dialog.querySelector('.confirm-cancel');
        const okBtn = dialog.querySelector('.confirm-ok');

        const closeDialog = (result) => {
            document.body.removeChild(dialog);
            document.head.removeChild(style);
            resolve(result);
        };

        closeBtn.addEventListener('click', () => closeDialog(false));
        cancelBtn.addEventListener('click', () => closeDialog(false));
        okBtn.addEventListener('click', () => closeDialog(true));

        // ESC键关闭
        dialog.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') closeDialog(false);
        });

        // 点击遮罩层关闭
        dialog.querySelector('.confirm-dialog-overlay').addEventListener('click', () => closeDialog(false));

        // 聚焦确认按钮
        okBtn.focus();
    });
}

/**
 * 刷新单个服务器
 */
async function refreshServer(serverId, event) {
    if (event) event.stopPropagation();

    const serverCard = document.getElementById(`server-${serverId}`);
    if (serverCard) {
        const refreshBtn = serverCard.querySelector('.fa-redo').closest('button');
        if (refreshBtn) {
            refreshBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
            refreshBtn.disabled = true;
        }
    }

    try {
        const response = await fetch(`/api/server/${serverId}`);
        if (!response.ok) throw new Error('刷新失败');

        const server = await response.json();

        // 更新缓存中的服务器数据
        if (serversData?.servers) {
            const index = serversData.servers.findIndex(s => s.id == serverId);
            if (index !== -1) {
                serversData.servers[index] = server;
                updateDashboard(serversData);
                renderServerList(serversData.servers);
            }
        }

        showToast(`✅ 服务器状态已更新`, 'success');

    } catch (error) {
        console.error('❌ 刷新服务器失败:', error);
        showToast('刷新失败: ' + error.message, 'error');
    }
}

/**
 * 查看服务器详情
 */
function viewServerDetail(serverId) {
    if (!serversData?.servers) return;

    const server = serversData.servers.find(s => s.id == serverId);
    if (!server) return;

    // 这里可以扩展为显示详细信息的模态框
    console.log('查看服务器详情:', server);

    // 临时显示服务器信息
    alert(`服务器详情:\n\n` +
          `名称: ${server.name}\n` +
          `地址: ${server.address}:${server.port}\n` +
          `状态: ${server.online ? '在线' : '离线'}\n` +
          `玩家: ${server.players?.online || 0}/${server.players?.max || 0}\n` +
          `版本: ${server.version || '未知'}\n` +
          `延迟: ${server.ping ? server.ping + 'ms' : '-'}\n` +
          `最后更新: ${new Date(server.lastUpdated).toLocaleString()}`);
}

/**
 * 显示Toast消息
 */
function showToast(message, type = 'info', duration = 3000) {
    const toast = document.getElementById('toast');
    if (!toast) return;

    // 清除之前的toast
    toast.className = 'toast';
    void toast.offsetWidth; // 触发重排

    // 设置新内容
    toast.textContent = message;
    toast.className = `toast ${type} show`;

    // 添加图标
    const icons = {
        success: 'fas fa-check-circle',
        error: 'fas fa-exclamation-circle',
        info: 'fas fa-info-circle'
    };

    if (icons[type]) {
        toast.innerHTML = `<i class="${icons[type]}"></i> ${message}`;
    }

    // 自动隐藏
    setTimeout(() => {
        toast.classList.remove('show');
    }, duration);
}

/**
 * 显示/隐藏加载状态
 */
function showLoading(show) {
    const loadingElement = document.getElementById('loading');
    if (!loadingElement) return;

    if (show) {
        loadingElement.style.display = 'block';
    } else {
        loadingElement.style.display = 'none';
    }
}

/**
 * 启动自动刷新
 */
function startAutoRefresh(interval = 30000) {
    if (autoRefreshInterval) {
        clearInterval(autoRefreshInterval);
    }

    autoRefreshInterval = setInterval(() => {
        if (!isRefreshing && document.visibilityState === 'visible') {
            loadServers();
        }
    }, interval);

    console.log(`🔄 自动刷新已启动 (${interval / 1000}秒)`);
}

/**
 * 格式化相对时间
 */
function formatRelativeTime(timestamp) {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now - date;
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHour = Math.floor(diffMin / 60);

    if (diffSec < 10) return '刚刚';
    if (diffSec < 60) return `${diffSec}秒前`;
    if (diffMin < 60) return `${diffMin}分钟前`;
    if (diffHour < 24) return `${diffHour}小时前`;

    return date.toLocaleTimeString('zh-CN', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    });
}

/**
 * HTML转义
 */
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * 导出服务器列表
 */
function exportServers() {
    if (!serversData?.servers) {
        showToast('没有可导出的服务器数据', 'error');
        return;
    }

    const dataStr = JSON.stringify(serversData.servers, null, 2);
    const dataUri = 'data:application/json;charset=utf-8,' + encodeURIComponent(dataStr);

    const exportFileDefaultName = `minecraft-servers-${new Date().toISOString().split('T')[0]}.json`;

    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', exportFileDefaultName);
    linkElement.click();

    showToast('服务器列表已导出', 'success');
}

/**
 * 导入服务器列表
 */
function importServers() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';

    input.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        try {
            const text = await file.text();
            const servers = JSON.parse(text);

            if (!Array.isArray(servers)) {
                throw new Error('文件格式错误');
            }

            // 这里应该实现导入逻辑
            showToast('导入功能开发中...', 'info');

        } catch (error) {
            console.error('❌ 导入失败:', error);
            showToast(`导入失败: ${error.message}`, 'error');
        }
    };

    input.click();
}

// 暴露必要的函数到全局作用域
window.showAddServerModal = showAddServerModal;
window.hideAddServerModal = hideAddServerModal;
window.refreshAllServers = refreshAllServers;
window.loadServers = loadServers;
window.exportServers = exportServers;
window.importServers = importServers;