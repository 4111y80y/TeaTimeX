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
});
