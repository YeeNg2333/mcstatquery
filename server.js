const express = require('express');
const cors = require('cors');
const fs = require('fs').promises;
const path = require('path');
const util = require('util');
const dns = require('dns');
const net = require('net');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

// 中间件
app.use(cors());
app.use(express.json());
app.use(express.static('.'));

// 缓存配置
let serverCache = {
    data: {},
    lastUpdated: 0,
    ttl: 30000 // 30秒缓存
};

// 解析DNS
async function resolveHostname(hostname) {
    return new Promise((resolve) => {
        dns.lookup(hostname, (err, address) => {
            if (err) resolve(hostname); // 失败时返回原始hostname
            else resolve(address);
        });
    });
}

// 从文件读取服务器列表
async function getServerList() {
    try {
        const data = await fs.readFile('servers.json', 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.error('读取服务器列表失败:', error);
        return [];
    }
}

// 保存服务器列表到文件
async function saveServerList(servers) {
    try {
        await fs.writeFile('servers.json', JSON.stringify(servers, null, 2));
        return true;
    } catch (error) {
        console.error('保存服务器列表失败:', error);
        return false;
    }
}

// 增强的Minecraft服务器查询函数
async function queryMinecraftServer(host, port = 25565, name) {
    return new Promise(async (resolve) => {
        const startTime = Date.now();
        const timeout = 5000; // 5秒超时
        const socket = new net.Socket();
        let hasResolved = false;

        socket.setTimeout(timeout);

        // 解析主机名
        let serverAddress = host;
        try {
            serverAddress = await resolveHostname(host);
        } catch (err) {
            console.log(`DNS解析失败: ${host}`);
        }

        const responseData = {
            id: crypto.createHash('md5').update(`${host}:${port}`).digest('hex').substring(0, 8),
            name: name,
            address: host,
            port: port,
            online: false,
            error: null,
            lastUpdated: new Date().toISOString(),
            ping: null,
            latency: null
        };

        const timeoutId = setTimeout(() => {
            if (!hasResolved) {
                hasResolved = true;
                socket.destroy();
                responseData.error = '连接超时';
                responseData.online = false;
                resolve(responseData);
            }
        }, timeout + 1000);

        socket.on('connect', () => {
            responseData.ping = Date.now() - startTime;

            // 发送握手包
            const handshake = createHandshakePacket(host, port);
            const statusRequest = createStatusRequestPacket();

            const writeVarInt = (value) => {
                const buffer = [];
                do {
                    let temp = value & 0x7F;
                    value >>>= 7;
                    if (value !== 0) {
                        temp |= 0x80;
                    }
                    buffer.push(temp);
                } while (value !== 0);
                return Buffer.from(buffer);
            };

            const writePacket = (packetId, data) => {
                const packetIdBuffer = writeVarInt(packetId);
                const packet = Buffer.concat([packetIdBuffer, data]);
                const lengthBuffer = writeVarInt(packet.length);
                return Buffer.concat([lengthBuffer, packet]);
            };

            // 发送握手包
            const handshakePacket = writePacket(0x00, handshake);
            socket.write(handshakePacket);

            // 发送状态请求
            const statusPacket = writePacket(0x00, statusRequest);
            socket.write(statusPacket);
        });

        socket.on('data', (data) => {
            try {
                const response = parseResponse(data);
                if (response && response.players) {
                    responseData.online = true;
                    responseData.version = response.version?.name || 'Unknown';
                    responseData.protocol = response.version?.protocol || 0;
                    responseData.players = {
                        online: response.players?.online || 0,
                        max: response.players?.max || 0,
                        sample: response.players?.sample || []
                    };
                    responseData.description = response.description?.text ||
                                             response.description ||
                                             'A Minecraft Server';
                    responseData.favicon = response.favicon || null;
                    responseData.ping = responseData.ping || 0;
                    responseData.latency = Date.now() - startTime;
                }
            } catch (err) {
                responseData.error = '解析响应失败: ' + err.message;
            }

            socket.end();
        });

        socket.on('error', (err) => {
            if (!hasResolved) {
                hasResolved = true;
                responseData.error = '连接错误: ' + err.message;
                responseData.online = false;
                resolve(responseData);
            }
        });

        socket.on('close', () => {
            if (!hasResolved) {
                hasResolved = true;
                if (!responseData.error) {
                    responseData.error = '连接关闭';
                }
                responseData.online = false;
                clearTimeout(timeoutId);
                resolve(responseData);
            }
        });
        
        socket.on('timeout', () => {
            if (!hasResolved) {
                hasResolved = true;
                socket.destroy();
                responseData.error = '连接超时';
                responseData.online = false;
                resolve(responseData);
            }
        });
        
        try {
            socket.connect(port, serverAddress);
        } catch (err) {
            if (!hasResolved) {
                hasResolved = true;
                responseData.error = '连接失败: ' + err.message;
                responseData.online = false;
                clearTimeout(timeoutId);
                resolve(responseData);
            }
        }
    });
}

// 创建握手包
function createHandshakePacket(host, port) {
    const protocolVersion = 763; // 1.20.1
    const hostBuffer = Buffer.from(host, 'utf8');
    
    const buffer = Buffer.alloc(1024);
    let offset = 0;
    
    // 写入协议版本 (VarInt)
    offset = writeVarInt(buffer, protocolVersion, offset);
    
    // 写入服务器地址
    offset = writeVarInt(buffer, hostBuffer.length, offset);
    hostBuffer.copy(buffer, offset);
    offset += hostBuffer.length;
    
    // 写入端口 (Unsigned Short)
    buffer.writeUInt16BE(port, offset);
    offset += 2;
    
    // 下一个状态: 1 (status)
    offset = writeVarInt(buffer, 1, offset);
    
    return buffer.slice(0, offset);
}

// 创建状态请求包
function createStatusRequestPacket() {
    return Buffer.alloc(0);
}

// 写入VarInt
function writeVarInt(buffer, value, offset) {
    do {
        let temp = value & 0x7F;
        value >>>= 7;
        if (value !== 0) {
            temp |= 0x80;
        }
        buffer.writeUInt8(temp, offset);
        offset++;
    } while (value !== 0);
    return offset;
}

// 解析响应
function parseResponse(buffer) {
    let offset = 0;
    
    // 读取数据包长度
    const { value: length, offset: newOffset } = readVarInt(buffer, offset);
    offset = newOffset;
    
    // 读取数据包ID
    const { value: packetId, offset: newOffset2 } = readVarInt(buffer, offset);
    offset = newOffset2;
    
    if (packetId !== 0x00) {
        throw new Error('无效的数据包ID');
    }
    
    // 读取JSON长度
    const { value: jsonLength, offset: newOffset3 } = readVarInt(buffer, offset);
    offset = newOffset3;
    
    // 读取JSON数据
    const jsonData = buffer.toString('utf8', offset, offset + jsonLength);
    
    try {
        return JSON.parse(jsonData);
    } catch (err) {
        throw new Error('JSON解析失败: ' + err.message);
    }
}

// 读取VarInt
function readVarInt(buffer, offset) {
    let result = 0;
    let shift = 0;
    let b;
    
    do {
        b = buffer.readUInt8(offset++);
        result |= (b & 0x7F) << shift;
        shift += 7;
    } while (b & 0x80);
    
    return { value: result, offset };
}

// 查询单个服务器
async function queryServer(server) {
    try {
        const result = await queryMinecraftServer(server.address, server.port, server.name);
        return {
            ...server,
            ...result,
            category: server.category || '未分类',
            description: server.description || '',
            lastUpdated: new Date().toISOString()
        };
    } catch (error) {
        return {
            ...server,
            online: false,
            error: error.message,
            players: { online: 0, max: 0, sample: [] },
            lastUpdated: new Date().toISOString()
        };
    }
}

// 查询所有服务器
async function queryAllServers(useCache = true) {
    const now = Date.now();
    
    // 检查缓存
    if (useCache && (now - serverCache.lastUpdated) < serverCache.ttl) {
        return serverCache.data;
    }
    
    const servers = await getServerList();
    const queries = servers.map(server => queryServer(server));
    
    try {
        const results = await Promise.all(queries.map(p => p.catch(e => ({
            online: false,
            error: e.message,
            players: { online: 0, max: 0, sample: [] }
        }))));
        
        // 按在线状态和玩家数量排序
        const sortedResults = results.sort((a, b) => {
            if (a.online && !b.online) return -1;
            if (!a.online && b.online) return 1;
            if (a.online && b.online) {
                return b.players.online - a.players.online;
            }
            return a.name.localeCompare(b.name);
        });
        
        // 更新缓存
        serverCache.data = {
            servers: sortedResults,
            total: sortedResults.length,
            online: sortedResults.filter(s => s.online).length,
            totalPlayers: sortedResults.reduce((sum, s) => sum + (s.players?.online || 0), 0),
            lastUpdated: new Date().toISOString(),
            timestamp: now
        };
        
        serverCache.lastUpdated = now;
        
        return serverCache.data;
    } catch (error) {
        console.error('查询服务器时出错:', error);
        throw error;
    }
}

// API路由

// 获取所有服务器状态
app.get('/api/servers', async (req, res) => {
    try {
        const useCache = req.query.nocache !== 'true';
        const serverData = await queryAllServers(useCache);
        res.json(serverData);
    } catch (error) {
        console.error('获取服务器列表失败:', error);
        res.status(500).json({ error: '获取服务器列表失败: ' + error.message });
    }
});

// 获取单个服务器状态
app.get('/api/server/:id', async (req, res) => {
    try {
        const servers = await getServerList();
        const server = servers.find(s => s.id == req.params.id);
        
        if (!server) {
            return res.status(404).json({ error: '服务器未找到' });
        }
        
        const result = await queryServer(server);
        res.json(result);
    } catch (error) {
        console.error('查询服务器失败:', error);
        res.status(500).json({ error: '查询服务器失败: ' + error.message });
    }
});

// 添加新服务器
app.post('/api/servers', async (req, res) => {
    try {
        const { name, address, port = 25565, category, description } = req.body;
        
        if (!name || !address) {
            return res.status(400).json({ error: '服务器名称和地址不能为空' });
        }
        
        const servers = await getServerList();
        const newId = servers.length > 0 ? Math.max(...servers.map(s => s.id)) + 1 : 1;
        
        const newServer = {
            id: newId,
            name,
            address,
            port: parseInt(port) || 25565,
            type: 'java',
            category: category || '未分类',
            description: description || ''
        };
        
        servers.push(newServer);
        await saveServerList(servers);
        
        // 清除缓存
        serverCache.lastUpdated = 0;
        
        res.json({ success: true, server: newServer });
    } catch (error) {
        console.error('添加服务器失败:', error);
        res.status(500).json({ error: '添加服务器失败: ' + error.message });
    }
});

// // 删除服务器
// app.delete('/api/server/:id', async (req, res) => {
//     try {
//         const servers = await getServerList();
//         const index = servers.findIndex(s => s.id == req.params.id);
//
//         if (index === -1) {
//             return res.status(404).json({ error: '服务器未找到' });
//         }
//
//         const deleted = servers.splice(index, 1);
//         await saveServerList(servers);
//
//         // 清除缓存
//         serverCache.lastUpdated = 0;
//
//         res.json({ success: true, server: deleted[0] });
//     } catch (error) {
//         console.error('删除服务器失败:', error);
//         res.status(500).json({ error: '删除服务器失败: ' + error.message });
//     }
// });
// 修复的删除服务器API
app.delete('/api/server/:id', async (req, res) => {
    try {
        console.log(`🗑️ 收到删除请求，ID: ${req.params.id}`);

        const servers = await getServerList();
        console.log(`当前服务器数量: ${servers.length}`);

        // 确保ID是数字
        const serverId = parseInt(req.params.id);
        if (isNaN(serverId)) {
            return res.status(400).json({
                error: '无效的服务器ID',
                details: `ID "${req.params.id}" 不是有效的数字`
            });
        }

        // 查找要删除的服务器
        const serverIndex = servers.findIndex(s => s.id === serverId);
        console.log(`找到的索引: ${serverIndex}`);

        if (serverIndex === -1) {
            return res.status(404).json({
                error: '服务器未找到',
                details: `ID为 ${serverId} 的服务器不存在`
            });
        }

        // 保存要删除的服务器信息用于返回
        const deletedServer = servers[serverIndex];
        console.log(`要删除的服务器: ${deletedServer.name} (ID: ${deletedServer.id})`);

        // 从数组中移除
        servers.splice(serverIndex, 1);
        console.log(`删除后服务器数量: ${servers.length}`);

        // 保存到文件
        const saveResult = await saveServerList(servers);
        if (!saveResult) {
            throw new Error('保存服务器列表到文件失败');
        }

        // 清除缓存
        serverCache.lastUpdated = 0;

        console.log(`✅ 成功删除服务器: ${deletedServer.name}`);

        res.json({
            success: true,
            server: deletedServer,
            message: `服务器 "${deletedServer.name}" 已成功删除`
        });

    } catch (error) {
        console.error('❌ 删除服务器失败:', error);

        // 提供更详细的错误信息
        res.status(500).json({
            error: '删除服务器失败',
            details: error.message,
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
});

// 更新服务器信息
app.put('/api/server/:id', async (req, res) => {
    try {
        const servers = await getServerList();
        const index = servers.findIndex(s => s.id == req.params.id);
        
        if (index === -1) {
            return res.status(404).json({ error: '服务器未找到' });
        }
        
        const updatedServer = { ...servers[index], ...req.body };
        servers[index] = updatedServer;
        
        await saveServerList(servers);
        
        // 清除缓存
        serverCache.lastUpdated = 0;
        
        res.json({ success: true, server: updatedServer });
    } catch (error) {
        console.error('更新服务器失败:', error);
        res.status(500).json({ error: '更新服务器失败: ' + error.message });
    }
});

// 手动刷新所有服务器
app.post('/api/refresh', async (req, res) => {
    try {
        serverCache.lastUpdated = 0; // 清除缓存
        const serverData = await queryAllServers(false);
        res.json(serverData);
    } catch (error) {
        console.error('刷新服务器失败:', error);
        res.status(500).json({ error: '刷新服务器失败: ' + error.message });
    }
});

// 启动服务器
app.listen(PORT, () => {
    console.log(`🎮 Minecraft服务器监控面板运行在 http://localhost:${PORT}`);
    console.log(`📁 服务器列表配置文件: servers.json`);
    console.log(`🔄 自动刷新间隔: 30秒`);
    console.log(`✅ 准备就绪，开始监控服务器...`);
});

// 添加错误处理
process.on('uncaughtException', (err) => {
    console.error('未捕获的异常:', err);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('未处理的Promise拒绝:', reason);
});