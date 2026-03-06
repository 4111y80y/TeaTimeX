/**
 * 喝茶神器 Popup Script
 * 多群聊分类管理界面逻辑
 */

// 预设 Logo 候选列表
const LOGO_OPTIONS = [
    // 茶饮
    '🍵', '☕', '🫖', '🧋', '🍶', '🥤', '🧊', '🍹', '🍺', '🥂', '🍷',
    // 星象
    '⭐', '🌟', '💫', '✨', '🔥', '💎', '👑', '🎯', '🏆', '🥇',
    // 心
    '❤️', '💙', '💚', '💛', '💜', '🧡', '🤍', '🖤', '💗', '💖',
    // 庆祝
    '🎉', '🎊', '🎈', '🎁', '🎖️', '🏅', '🎀', '🪅',
    // 花草
    '🌸', '🌺', '🌻', '🌹', '🌷', '🍀', '🌿', '🎋', '🌴', '🌵',
    // 动物
    '🐉', '🦋', '🐝', '🐬', '🦊', '🐱', '🐶', '🦄', '🐼', '🦁',
    '🐯', '🦅', '🐸', '🐰', '🐧', '🦜', '🐠', '🦈', '🐢', '🦉',
    // 符号
    '💰', '💵', '🪙', '📈', '🚀', '💡', '🎨', '🎵', '🎮', '🛡️',
    '⚡', '🔮', '🎪', '🧲', '🔔',
    // 圆点
    '🔴', '🟠', '🟡', '🟢', '🔵', '🟣', '⚫', '⚪', '🟤',
    // 食物
    '🍎', '🍊', '🍋', '🍉', '🍇', '🍓', '🍑', '🥝', '🌶️', '🍔',
    // 天气
    '🌞', '🌙', '🌈', '⛅', '❄️', '🌊', '💧',
];

let groups = [];
let currentGroupId = null;
let editingGroupId = null;   // null=新建, groupId=编辑
let selectedLogo = '🍵';

// DOM 元素
const headerIcon = document.getElementById('headerIcon');
const headerName = document.getElementById('headerName');
const headerSubtitle = document.getElementById('headerSubtitle');
const groupTabs = document.getElementById('groupTabs');
const btnNewGroup = document.getElementById('btnNewGroup');
const memberList = document.getElementById('memberList');
const memberCount = document.getElementById('memberCount');
const searchInput = document.getElementById('searchInput');
const addHandle = document.getElementById('addHandle');
const addName = document.getElementById('addName');
const btnAdd = document.getElementById('btnAdd');
const btnEditGroup = document.getElementById('btnEditGroup');
const btnImport = document.getElementById('btnImport');
const btnExport = document.getElementById('btnExport');
const fileInput = document.getElementById('fileInput');
const footerLink = document.getElementById('footerLink');

// Modal 元素
const groupModal = document.getElementById('groupModal');
const modalTitle = document.getElementById('modalTitle');
const groupNameInput = document.getElementById('groupName');
const groupLinkInput = document.getElementById('groupLink');
const logoPreview = document.getElementById('logoPreview');
const logoGrid = document.getElementById('logoGrid');
const btnSaveGroup = document.getElementById('btnSaveGroup');
const btnDeleteGroup = document.getElementById('btnDeleteGroup');
const btnCancelModal = document.getElementById('btnCancelModal');
const btnCloseModal = document.getElementById('btnCloseModal');

// 初始化
document.addEventListener('DOMContentLoaded', () => {
    loadGroups();
    initLogoGrid();
    bindEvents();
});

// 加载群聊列表
function loadGroups() {
    chrome.storage.local.get('groups', (result) => {
        groups = result.groups || [];
        // 如果有之前选中的群聊，保持选中
        if (currentGroupId && !groups.find(g => g.id === currentGroupId)) {
            currentGroupId = null;
        }
        if (!currentGroupId && groups.length > 0) {
            currentGroupId = groups[0].id;
        }
        renderGroupTabs();
        renderCurrentGroup();
    });
}

// 保存群聊列表
function saveGroups(callback) {
    chrome.storage.local.set({ groups }, () => {
        renderGroupTabs();
        renderCurrentGroup();
        if (callback) callback();
    });
}

// 获取当前群聊
function getCurrentGroup() {
    return groups.find(g => g.id === currentGroupId) || null;
}

// 渲染群聊 Tab 栏
function renderGroupTabs() {
    groupTabs.innerHTML = groups.map(g => `
        <button class="group-tab ${g.id === currentGroupId ? 'active' : ''}" data-id="${escapeHtml(g.id)}">
            <span class="group-tab-icon">${g.icon || '🍵'}</span>
            <span class="group-tab-name">${escapeHtml(g.name || '未命名')}</span>
        </button>
    `).join('');
}

// 渲染当前群聊的内容
function renderCurrentGroup() {
    const group = getCurrentGroup();

    if (!group) {
        // 没有群聊
        headerIcon.textContent = '🍵';
        headerName.textContent = '喝茶神器';
        headerSubtitle.textContent = '点击 ＋ 创建你的第一个群聊';
        memberCount.textContent = '0 位成员';
        footerLink.href = '#';
        footerLink.style.visibility = 'hidden';
        btnEditGroup.style.display = 'none';
        memberList.innerHTML = `
            <div class="no-group-state">
                <div class="no-group-icon">🍵</div>
                <p>还没有群聊分类<br>点击上方 ＋ 按钮创建</p>
            </div>
        `;
        return;
    }

    // 更新 header 为当前群聊名称
    headerIcon.textContent = group.icon || '🍵';
    headerName.textContent = group.name || '未命名群聊';
    headerSubtitle.textContent = `${group.members.length} 位成员`;
    btnEditGroup.style.display = '';

    // 更新底部链接
    if (group.link) {
        footerLink.href = group.link;
        footerLink.style.visibility = 'visible';
    } else {
        footerLink.href = '#';
        footerLink.style.visibility = 'hidden';
    }

    renderMembers(searchInput.value);
}

// 渲染成员列表
function renderMembers(filter = '') {
    const group = getCurrentGroup();
    if (!group) return;

    const members = group.members || [];
    const filtered = filter
        ? members.filter(
            (m) =>
                m.handle.toLowerCase().includes(filter.toLowerCase()) ||
                (m.displayName && m.displayName.toLowerCase().includes(filter.toLowerCase()))
        )
        : members;

    memberCount.textContent = `${members.length} 位成员`;

    if (filtered.length === 0) {
        memberList.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">${filter ? '🔍' : group.icon || '🍵'}</div>
                <p>${filter ? '未找到匹配的成员' : '还没有添加成员<br>在上方输入 handle 添加'}</p>
            </div>
        `;
        return;
    }

    memberList.innerHTML = filtered.map((m) => `
        <div class="member-item" data-handle="${escapeHtml(m.handle)}">
            <span class="member-icon">${group.icon || '🍵'}</span>
            <div class="member-info">
                <div class="member-name">${escapeHtml(m.displayName || m.handle)}</div>
                <div class="member-handle">
                    <a href="https://x.com/${encodeURIComponent(m.handle)}" target="_blank">@${escapeHtml(m.handle)}</a>
                </div>
            </div>
            <button class="btn-delete" data-handle="${escapeHtml(m.handle)}" title="删除成员">✕</button>
        </div>
    `).join('');
}

// 绑定事件
function bindEvents() {
    // 群聊 Tab 切换
    groupTabs.addEventListener('click', (e) => {
        const tab = e.target.closest('.group-tab');
        if (tab) {
            currentGroupId = tab.dataset.id;
            searchInput.value = '';
            renderGroupTabs();
            renderCurrentGroup();
        }
    });

    // 新建群聊
    btnNewGroup.addEventListener('click', () => openGroupModal(null));

    // 编辑当前群聊
    btnEditGroup.addEventListener('click', () => {
        if (currentGroupId) openGroupModal(currentGroupId);
    });

    // 搜索
    searchInput.addEventListener('input', (e) => {
        renderMembers(e.target.value);
    });

    // 添加成员
    btnAdd.addEventListener('click', addMember);
    addHandle.addEventListener('keydown', (e) => { if (e.key === 'Enter') addMember(); });
    addName.addEventListener('keydown', (e) => { if (e.key === 'Enter') addMember(); });

    // 删除成员 (事件委托)
    memberList.addEventListener('click', (e) => {
        const deleteBtn = e.target.closest('.btn-delete');
        if (deleteBtn) {
            deleteMember(deleteBtn.dataset.handle);
        }
    });

    // 导入
    btnImport.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', handleImport);

    // 导出
    btnExport.addEventListener('click', handleExport);

    // Modal 关闭
    btnCloseModal.addEventListener('click', closeGroupModal);
    btnCancelModal.addEventListener('click', closeGroupModal);
    groupModal.addEventListener('click', (e) => {
        if (e.target === groupModal) closeGroupModal();
    });

    // Modal 保存
    btnSaveGroup.addEventListener('click', saveGroup);

    // Modal 删除
    btnDeleteGroup.addEventListener('click', deleteGroup);
}

// 添加成员到当前群聊
function addMember() {
    const group = getCurrentGroup();
    if (!group) {
        showToast('请先选择或创建群聊');
        return;
    }

    let handle = addHandle.value.trim().replace(/^@/, '');
    const displayName = addName.value.trim();

    if (!handle) {
        showToast('请输入用户 handle');
        addHandle.focus();
        return;
    }

    // 检查重复
    if (group.members.some((m) => m.handle.toLowerCase() === handle.toLowerCase())) {
        showToast('该用户已在此群聊中');
        return;
    }

    group.members.push({
        handle,
        displayName: displayName || handle,
    });

    addHandle.value = '';
    addName.value = '';
    saveGroups(() => showToast(`已添加 @${handle}`));
}

// 删除成员
function deleteMember(handle) {
    const group = getCurrentGroup();
    if (!group) return;

    group.members = group.members.filter((m) => m.handle !== handle);
    saveGroups(() => showToast(`已删除 @${handle}`));
}

// ============ 群聊 Modal ============

function openGroupModal(groupId) {
    editingGroupId = groupId;

    if (groupId) {
        // 编辑模式
        const group = groups.find(g => g.id === groupId);
        if (!group) return;
        modalTitle.textContent = '编辑群聊';
        groupNameInput.value = group.name || '';
        groupLinkInput.value = group.link || '';
        selectedLogo = group.icon || '🍵';
        btnDeleteGroup.style.display = '';
    } else {
        // 新建模式
        modalTitle.textContent = '新建群聊';
        groupNameInput.value = '';
        groupLinkInput.value = '';
        selectedLogo = '🍵';
        btnDeleteGroup.style.display = 'none';
    }

    logoPreview.textContent = selectedLogo;
    updateLogoSelection();
    groupModal.style.display = 'flex';
}

function closeGroupModal() {
    groupModal.style.display = 'none';
    editingGroupId = null;
}

function saveGroup() {
    const name = groupNameInput.value.trim();
    if (!name) {
        showToast('请输入群聊名称');
        groupNameInput.focus();
        return;
    }

    const link = groupLinkInput.value.trim();

    if (editingGroupId) {
        // 更新现有群聊
        const group = groups.find(g => g.id === editingGroupId);
        if (group) {
            group.name = name;
            group.link = link;
            group.icon = selectedLogo;
        }
    } else {
        // 创建新群聊
        const newGroup = {
            id: 'g_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
            name,
            link,
            icon: selectedLogo,
            members: [],
        };
        groups.push(newGroup);
        currentGroupId = newGroup.id;
    }

    closeGroupModal();
    saveGroups(() => showToast(editingGroupId ? '群聊已更新' : '群聊已创建'));
}

function deleteGroup() {
    if (!editingGroupId) return;

    const group = groups.find(g => g.id === editingGroupId);
    const groupName = group ? group.name : '';

    groups = groups.filter(g => g.id !== editingGroupId);

    if (currentGroupId === editingGroupId) {
        currentGroupId = groups.length > 0 ? groups[0].id : null;
    }

    closeGroupModal();
    saveGroups(() => showToast(`已删除群聊「${groupName}」`));
}

// 初始化 Logo 选择网格
function initLogoGrid() {
    logoGrid.innerHTML = LOGO_OPTIONS.map(
        (logo) => `<button class="logo-option" data-logo="${logo}">${logo}</button>`
    ).join('');

    logoGrid.addEventListener('click', (e) => {
        const btn = e.target.closest('.logo-option');
        if (btn) {
            selectedLogo = btn.dataset.logo;
            logoPreview.textContent = selectedLogo;
            updateLogoSelection();
        }
    });
}

function updateLogoSelection() {
    logoGrid.querySelectorAll('.logo-option').forEach(btn => {
        btn.classList.toggle('selected', btn.dataset.logo === selectedLogo);
    });
}

// 导入名单
function handleImport(e) {
    const file = e.target.files[0];
    if (!file) return;

    const group = getCurrentGroup();
    if (!group) {
        showToast('请先选择或创建群聊');
        fileInput.value = '';
        return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
        try {
            const imported = JSON.parse(event.target.result);

            // 支持新格式（groups）和旧格式（扁平数组）
            let membersToImport = [];
            if (imported.groups && Array.isArray(imported.groups)) {
                // 新格式：合并所有群聊的成员
                imported.groups.forEach(g => {
                    if (g.members) membersToImport.push(...g.members);
                });
            } else if (Array.isArray(imported)) {
                membersToImport = imported;
            } else {
                showToast('文件格式错误');
                return;
            }

            let added = 0;
            membersToImport.forEach((item) => {
                if (item.handle && !group.members.some((m) =>
                    m.handle.toLowerCase() === item.handle.toLowerCase()
                )) {
                    group.members.push({
                        handle: item.handle,
                        displayName: item.displayName || item.handle,
                    });
                    added++;
                }
            });

            saveGroups(() => showToast(`成功导入 ${added} 位新成员`));
        } catch (err) {
            showToast('解析文件失败');
        }
    };
    reader.readAsText(file);
    fileInput.value = '';
}

// 导出名单
function handleExport() {
    const group = getCurrentGroup();
    if (!group) {
        showToast('请先选择一个群聊');
        return;
    }

    const exportData = {
        groups: [group]
    };
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const safeName = (group.name || 'group').replace(/[^a-zA-Z0-9\u4e00-\u9fff]/g, '_');
    a.download = `喝茶神器_${safeName}_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('名单已导出');
}

// Toast 提示
function showToast(msg) {
    let toast = document.querySelector('.toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.className = 'toast';
        document.body.appendChild(toast);
    }
    toast.textContent = msg;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 2000);
}

// HTML 转义
function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}
