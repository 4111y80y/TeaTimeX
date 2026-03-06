/**
 * 喝茶神器 Background Service Worker
 * 插件安装/更新时加载群聊名单
 */

// 插件安装或更新时初始化
chrome.runtime.onInstalled.addListener(async (details) => {
    if (details.reason === 'install' || details.reason === 'update') {
        console.log(`[喝茶神器] 插件${details.reason === 'install' ? '已安装' : '已更新'}，正在加载群聊名单...`);

        try {
            // 加载内置的 members.json（新格式含 groups）
            const response = await fetch(chrome.runtime.getURL('members.json'));
            const data = await response.json();
            const newGroups = data.groups || [];

            if (details.reason === 'update') {
                // 更新时：合并现有数据
                const result = await chrome.storage.local.get('groups');
                const existingGroups = result.groups || [];

                if (existingGroups.length > 0) {
                    // 构建现有群聊 map
                    const existingMap = {};
                    existingGroups.forEach((g) => {
                        existingMap[g.id] = g;
                    });

                    // 合并内置群聊的成员到现有群聊
                    const merged = newGroups.map((newGroup) => {
                        const existing = existingMap[newGroup.id];
                        if (existing) {
                            // 保留用户自定义的 icon 和名称
                            const mergedGroup = {
                                ...newGroup,
                                icon: existing.icon || newGroup.icon,
                                name: existing.name || newGroup.name,
                                link: existing.link || newGroup.link,
                            };
                            // 合并成员列表：保留现有 + 添加新成员
                            const existingHandles = new Set(
                                existing.members.map((m) => m.handle.toLowerCase())
                            );
                            const newMembers = newGroup.members.filter(
                                (m) => !existingHandles.has(m.handle.toLowerCase())
                            );
                            mergedGroup.members = [...existing.members, ...newMembers];
                            return mergedGroup;
                        }
                        return newGroup;
                    });

                    // 保留用户手动创建的不在内置数据中的群聊
                    const newGroupIds = new Set(newGroups.map((g) => g.id));
                    existingGroups.forEach((g) => {
                        if (!newGroupIds.has(g.id)) {
                            merged.push(g);
                        }
                    });

                    await chrome.storage.local.set({ groups: merged });
                    console.log(`[喝茶神器] 已合并更新 ${merged.length} 个群聊`);
                } else {
                    // 旧版本升级：尝试迁移旧的 members 数据
                    const oldResult = await chrome.storage.local.get('members');
                    if (oldResult.members && Array.isArray(oldResult.members) && oldResult.members.length > 0) {
                        // 将旧成员数据迁移到默认群聊
                        const defaultGroup = newGroups.length > 0 ? { ...newGroups[0] } : {
                            id: 'default',
                            name: '默认群聊',
                            link: '',
                            icon: '🍵',
                            members: [],
                        };
                        const newHandles = new Set(defaultGroup.members.map((m) => m.handle.toLowerCase()));
                        oldResult.members.forEach((m) => {
                            if (!newHandles.has(m.handle.toLowerCase())) {
                                defaultGroup.members.push({
                                    handle: m.handle,
                                    displayName: m.displayName || m.handle,
                                });
                            }
                        });
                        const migratedGroups = [defaultGroup, ...newGroups.slice(1)];
                        await chrome.storage.local.set({ groups: migratedGroups });
                        await chrome.storage.local.remove('members');
                        console.log(`[喝茶神器] 已从旧版本迁移 ${oldResult.members.length} 位成员`);
                    } else {
                        await chrome.storage.local.set({ groups: newGroups });
                        console.log(`[喝茶神器] 已加载 ${newGroups.length} 个初始群聊`);
                    }
                }
            } else {
                // 首次安装：直接写入
                await chrome.storage.local.set({ groups: newGroups });
                console.log(`[喝茶神器] 已加载 ${newGroups.length} 个初始群聊`);
            }
        } catch (error) {
            console.error('[喝茶神器] 加载名单失败:', error);
            if (details.reason === 'install') {
                await chrome.storage.local.set({ groups: [] });
            }
        }
    }
});

// 监听来自 content script 或 popup 的消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'GET_GROUPS') {
        chrome.storage.local.get('groups', (result) => {
            sendResponse({ groups: result.groups || [] });
        });
        return true;
    }

    if (message.type === 'GET_GROUP_COUNT') {
        chrome.storage.local.get('groups', (result) => {
            const groups = result.groups || [];
            const totalMembers = groups.reduce((sum, g) => sum + g.members.length, 0);
            sendResponse({ groupCount: groups.length, memberCount: totalMembers });
        });
        return true;
    }

    if (message.type === 'SYNC_GROUP') {
        handleSyncGroup(message.groupId, message.groupLink)
            .then(result => sendResponse(result))
            .catch(err => sendResponse({ success: false, error: err.message }));
        return true;
    }
});

// 处理群聊同步
async function handleSyncGroup(groupId, groupLink) {
    if (!groupLink) {
        return { success: false, error: '群聊没有设置链接，请先编辑群聊并填写群聊链接' };
    }

    // 确保链接指向 info 页面
    let infoUrl = groupLink;
    if (!infoUrl.endsWith('/info')) {
        infoUrl = infoUrl.replace(/\/$/, '') + '/info';
    }
    infoUrl = infoUrl.replace(/\/members$/, '/info');

    let tab = null;
    try {
        // 打开新 tab
        tab = await chrome.tabs.create({ url: infoUrl, active: false });

        // 等待页面加载完成
        await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('页面加载超时')), 30000);

            function listener(tabId, changeInfo) {
                if (tabId === tab.id && changeInfo.status === 'complete') {
                    chrome.tabs.onUpdated.removeListener(listener);
                    clearTimeout(timeout);
                    resolve();
                }
            }
            chrome.tabs.onUpdated.addListener(listener);
        });

        // 额外等待让 SPA 渲染完成（较长等待避免触发 X.com 速率限制）
        await new Promise(resolve => setTimeout(resolve, 6000));

        // 注入同步脚本（使用内联函数避免文件权限问题）
        const results = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: syncGroupPageScript,
        });

        // 关闭 tab
        await chrome.tabs.remove(tab.id);
        tab = null;

        if (results && results[0] && results[0].result) {
            return results[0].result;
        }

        return { success: false, error: '同步脚本未返回结果' };

    } catch (error) {
        if (tab) {
            try { await chrome.tabs.remove(tab.id); } catch (e) { /* ignore */ }
        }
        return { success: false, error: error.message || '同步失败' };
    }
}

// 注入到群聊页面的同步脚本（内联函数）
async function syncGroupPageScript() {
    const SCROLL_DELAY = 800;
    const MAX_SCROLL_ATTEMPTS = 50;

    function delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    try {
        await delay(3000);

        // 1. 提取群聊名称
        let groupName = '';
        const urlMatch = window.location.pathname.match(/\/i\/chat\/(g\d+)/);
        const groupId = urlMatch ? urlMatch[1] : null;

        const allSpans = document.querySelectorAll('span');
        for (const span of allSpans) {
            const style = window.getComputedStyle(span);
            const fontSize = parseInt(style.fontSize);
            if (fontSize >= 20 && span.textContent.trim().length > 0 && span.textContent.trim().length < 100) {
                const text = span.textContent.trim();
                if (!['Chat', 'Messages', 'Settings', 'chat info'].includes(text.toLowerCase()) && text !== 'X') {
                    groupName = text;
                    break;
                }
            }
        }

        // 2. 点击 "View All"
        let viewAllClicked = false;
        const allClickable = document.querySelectorAll('span, a, button, div[role="button"]');
        for (const el of allClickable) {
            const text = el.textContent.trim().toLowerCase();
            if (text === 'view all' || text === '查看全部' || text === 'view all members') {
                el.click();
                viewAllClicked = true;
                break;
            }
        }

        if (!viewAllClicked) {
            for (const el of allClickable) {
                const text = el.textContent.trim();
                if (text.includes('Members') || text.includes('成员')) {
                    const parent = el.closest('div');
                    if (parent) {
                        const viewAll = parent.querySelector('span[role="button"], a, button');
                        if (viewAll && viewAll !== el) {
                            viewAll.click();
                            viewAllClicked = true;
                            break;
                        }
                    }
                }
            }
        }

        await delay(3000);

        // 3. 抓取成员列表
        const members = new Map();

        async function collectVisibleMembers() {
            // 方法1: 查找 @handle 文本
            const allElements = document.querySelectorAll('*');
            for (const el of allElements) {
                if (el.children.length === 0) {
                    const text = el.textContent.trim();
                    if (text.startsWith('@') && text.length > 1 && text.length < 50 && !text.includes(' ')) {
                        const handle = text.substring(1);
                        if (!members.has(handle.toLowerCase())) {
                            let displayName = handle;
                            const container = el.closest('div[class]');
                            if (container) {
                                const spans = container.querySelectorAll('span');
                                for (const span of spans) {
                                    const spanText = span.textContent.trim();
                                    if (spanText && !spanText.startsWith('@') && spanText.length > 0 && spanText.length < 80) {
                                        if (span.children.length === 0 || (span.children.length === 1 && span.querySelector('img'))) {
                                            displayName = spanText;
                                            break;
                                        }
                                    }
                                }
                            }
                            members.set(handle.toLowerCase(), { handle, displayName });
                        }
                    }
                }
            }

            // 方法2: 查找个人资料链接
            const profileLinks = document.querySelectorAll('a[href^="/"]');
            for (const link of profileLinks) {
                const href = link.getAttribute('href');
                if (!href) continue;
                const match = href.match(/^\/([A-Za-z0-9_]+)\/?$/);
                if (match && match[1]) {
                    const handle = match[1];
                    const skipList = ['home', 'explore', 'notifications', 'messages', 'settings', 'search', 'compose', 'i', 'tos', 'privacy'];
                    if (skipList.includes(handle.toLowerCase())) continue;
                    if (!members.has(handle.toLowerCase())) {
                        const displayName = link.textContent.trim() || handle;
                        members.set(handle.toLowerCase(), { handle, displayName: displayName.length < 80 ? displayName : handle });
                    }
                }
            }
        }

        await collectVisibleMembers();

        // 4. 滚动收集更多成员
        let scrollContainer = null;
        const allDivs = document.querySelectorAll('div');
        for (const div of allDivs) {
            const style = window.getComputedStyle(div);
            if ((style.overflowY === 'auto' || style.overflowY === 'scroll') && div.scrollHeight > div.clientHeight + 50) {
                const handles = div.querySelectorAll('*');
                let hasHandle = false;
                for (const h of handles) {
                    if (h.children.length === 0 && h.textContent.trim().startsWith('@')) {
                        hasHandle = true;
                        break;
                    }
                }
                if (hasHandle) {
                    scrollContainer = div;
                    break;
                }
            }
        }

        if (scrollContainer) {
            let prevCount = members.size;
            let noChangeCount = 0;

            for (let i = 0; i < MAX_SCROLL_ATTEMPTS; i++) {
                scrollContainer.scrollTop += 300;
                await delay(SCROLL_DELAY);
                await collectVisibleMembers();

                if (members.size === prevCount) {
                    noChangeCount++;
                    if (noChangeCount >= 3) break;
                } else {
                    noChangeCount = 0;
                    prevCount = members.size;
                }
            }
        }

        return {
            success: true,
            groupName: groupName,
            groupId: groupId,
            members: Array.from(members.values()),
            memberCount: members.size,
        };

    } catch (error) {
        return {
            success: false,
            error: error.message,
        };
    }
}
