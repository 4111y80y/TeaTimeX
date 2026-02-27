/**
 * TeaTimeX Background Service Worker
 * 插件安装时加载初始成员名单
 */

// 插件安装时初始化
chrome.runtime.onInstalled.addListener(async (details) => {
    if (details.reason === 'install') {
        console.log('[TeaTimeX] 插件已安装，正在加载初始成员名单...');

        try {
            // 加载内置的 members.json
            const response = await fetch(chrome.runtime.getURL('members.json'));
            const members = await response.json();

            // 存储到 chrome.storage.local
            await chrome.storage.local.set({ members });
            console.log(`[TeaTimeX] 已加载 ${members.length} 位初始成员`);
        } catch (error) {
            console.error('[TeaTimeX] 加载初始名单失败:', error);
            // 初始化为空列表
            await chrome.storage.local.set({ members: [] });
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
