/**
 * 喝茶神器 Background Service Worker
 * 插件安装/更新时加载成员名单
 */

// 插件安装或更新时初始化
chrome.runtime.onInstalled.addListener(async (details) => {
    if (details.reason === 'install' || details.reason === 'update') {
        console.log(`[喝茶神器] 插件${details.reason === 'install' ? '已安装' : '已更新'}，正在加载成员名单...`);

        try {
            // 加载内置的 members.json
            const response = await fetch(chrome.runtime.getURL('members.json'));
            const newMembers = await response.json();

            if (details.reason === 'update') {
                // 更新时：合并现有自定义图标设置
                const result = await chrome.storage.local.get('members');
                const existingMembers = result.members || [];
                const existingMap = {};
                existingMembers.forEach((m) => {
                    existingMap[m.handle.toLowerCase()] = m;
                });

                // 合并：保留用户自定义的图标，添加新成员
                const merged = newMembers.map((m) => {
                    const existing = existingMap[m.handle.toLowerCase()];
                    if (existing && existing.icon !== '🍵') {
                        return { ...m, icon: existing.icon };
                    }
                    return m;
                });

                // 保留用户手动添加的不在 JSON 中的成员
                const newHandles = new Set(newMembers.map((m) => m.handle.toLowerCase()));
                existingMembers.forEach((m) => {
                    if (!newHandles.has(m.handle.toLowerCase())) {
                        merged.push(m);
                    }
                });

                await chrome.storage.local.set({ members: merged });
                console.log(`[喝茶神器] 已合并更新 ${merged.length} 位成员`);
            } else {
                // 首次安装：直接写入
                await chrome.storage.local.set({ members: newMembers });
                console.log(`[喝茶神器] 已加载 ${newMembers.length} 位初始成员`);
            }
        } catch (error) {
            console.error('[喝茶神器] 加载名单失败:', error);
            if (details.reason === 'install') {
                await chrome.storage.local.set({ members: [] });
            }
        }
    }
});

// 监听来自 content script 或 popup 的消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'GET_MEMBERS') {
        chrome.storage.local.get('members', (result) => {
            sendResponse({ members: result.members || [] });
        });
        return true; // 异步响应
    }

    if (message.type === 'GET_MEMBER_COUNT') {
        chrome.storage.local.get('members', (result) => {
            const count = (result.members || []).length;
            sendResponse({ count });
        });
        return true;
    }
});
