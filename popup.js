/**
 * 喝茶神器 Popup Script
 * 多群聊分类管理界面逻辑
 */

// 预设 Logo 候选列表
const LOGO_OPTIONS = [
    // 茶饮
    '🍵', '☕', '🍶', '🥤', '🍹', '🍺', '🥂', '🍷', '🍸', '🥃', '🧃',
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

// 预设底色列表
const COLOR_OPTIONS = [
    { name: '浅绿', value: 'rgba(34, 197, 94, 0.08)', dot: '#22c55e' },
    { name: '浅红', value: 'rgba(239, 68, 68, 0.08)', dot: '#ef4444' },
    { name: '浅蓝', value: 'rgba(59, 130, 246, 0.08)', dot: '#3b82f6' },
    { name: '浅黄', value: 'rgba(234, 179, 8, 0.08)', dot: '#eab308' },
    { name: '浅紫', value: 'rgba(168, 85, 247, 0.08)', dot: '#a855f7' },
    { name: '浅橙', value: 'rgba(249, 115, 22, 0.08)', dot: '#f97316' },
    { name: '浅青', value: 'rgba(6, 182, 212, 0.08)', dot: '#06b6d4' },
    { name: '浅粉', value: 'rgba(236, 72, 153, 0.08)', dot: '#ec4899' },
    { name: '无', value: 'none', dot: 'transparent' },
];
const DEFAULT_BG_COLOR = COLOR_OPTIONS[0].value;

let groups = [];
let currentGroupId = null;
let editingGroupId = null;   // null=新建, groupId=编辑
let selectedLogo = '🍵';
let selectedColor = DEFAULT_BG_COLOR;

// DOM 元素
const headerIcon = document.getElementById('headerIcon');
const headerName = document.getElementById('headerName');
const headerSubtitle = document.getElementById('headerSubtitle');
const groupSelect = document.getElementById('groupSelect');
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

// Modal 元素
const groupModal = document.getElementById('groupModal');
const modalTitle = document.getElementById('modalTitle');
const groupNameInput = document.getElementById('groupName');
const groupLinkInput = document.getElementById('groupLink');
const logoPreview = document.getElementById('logoPreview');
const logoGrid = document.getElementById('logoGrid');
const colorGrid = document.getElementById('colorGrid');
const btnSaveGroup = document.getElementById('btnSaveGroup');
const btnDeleteGroup = document.getElementById('btnDeleteGroup');
const btnCancelModal = document.getElementById('btnCancelModal');
const btnCloseModal = document.getElementById('btnCloseModal');

// 初始化
document.addEventListener('DOMContentLoaded', () => {
    loadGroups();
    initLogoGrid();
    initColorGrid();
    bindEvents();
});

// 加载群聊列表
function loadGroups() {
    chrome.storage.local.get('groups', (result) => {
        groups = result.groups || [];
        if (currentGroupId && !groups.find(g => g.id === currentGroupId)) {
            currentGroupId = null;
        }
        if (!currentGroupId && groups.length > 0) {
            currentGroupId = groups[0].id;
        }
        renderGroupSelect();
        renderCurrentGroup();
    });
}

// 保存群聊列表
function saveGroups(callback) {
    chrome.storage.local.set({ groups }, () => {
        renderGroupSelect();
        renderCurrentGroup();
        if (callback) callback();
    });
}

// 获取当前群聊
function getCurrentGroup() {
    return groups.find(g => g.id === currentGroupId) || null;
}

// 渲染群聊下拉选择器
function renderGroupSelect() {
    if (groups.length === 0) {
        groupSelect.innerHTML = '<option value="">-- 请创建群聊 --</option>';
        return;
    }

    groupSelect.innerHTML = groups.map(g =>
        `<option value="${escapeHtml(g.id)}" ${g.id === currentGroupId ? 'selected' : ''}>` +
        `${g.icon || '🍵'} ${escapeHtml(g.name || '未命名')}</option>`
    ).join('');
}

// 渲染当前群聊的内容
function renderCurrentGroup() {
    const group = getCurrentGroup();

    if (!group) {
        headerIcon.textContent = '🍵';
        headerName.textContent = '喝茶神器';
        headerSubtitle.textContent = '点击 ＋ 创建你的第一个群聊';
        memberCount.textContent = '0 位成员';
        btnEditGroup.style.display = 'none';
        memberList.innerHTML = `
            <div class="no-group-state">
                <div class="no-group-icon">🍵</div>
                <p>还没有群聊分类<br>点击上方 ＋ 按钮创建</p>
            </div>
        `;
        return;
    }

    headerIcon.textContent = group.icon || '🍵';
    headerName.textContent = group.name || '未命名群聊';
    headerSubtitle.textContent = `${group.members.length} 位成员`;
    btnEditGroup.style.display = '';

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
    // 群聊下拉切换
    groupSelect.addEventListener('change', (e) => {
        currentGroupId = e.target.value;
        searchInput.value = '';
        renderCurrentGroup();
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
        const group = groups.find(g => g.id === groupId);
        if (!group) return;
        modalTitle.textContent = '编辑群聊';
        groupNameInput.value = group.name || '';
        groupLinkInput.value = group.link || '';
        selectedLogo = group.icon || '🍵';
        selectedColor = group.bgColor || DEFAULT_BG_COLOR;
        btnDeleteGroup.style.display = '';
    } else {
        modalTitle.textContent = '新建群聊';
        groupNameInput.value = '';
        groupLinkInput.value = '';
        selectedLogo = '🍵';
        selectedColor = DEFAULT_BG_COLOR;
        btnDeleteGroup.style.display = 'none';
    }

    logoPreview.textContent = selectedLogo;
    updateLogoSelection();
    updateColorSelection();
    groupModal.style.display = 'flex';
}

function closeGroupModal() {
    groupModal.style.display = 'none';
    editingGroupId = null;
}

function saveGroup() {
    const name = groupNameInput.value.trim();
    const link = groupLinkInput.value.trim();

    if (!name) {
        showToast('请输入群聊名称');
        groupNameInput.focus();
        return;
    }

    if (editingGroupId) {
        const group = groups.find(g => g.id === editingGroupId);
        if (group) {
            group.name = name;
            group.link = link;
            group.icon = selectedLogo;
            group.bgColor = selectedColor;
        }
    } else {
        const newGroup = {
            id: 'g_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
            name,
            link,
            icon: selectedLogo,
            bgColor: selectedColor,
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
    if (!group) return;

    const memberCount = group.members ? group.members.length : 0;
    const confirmed = confirm(`确定要删除群聊「${group.name}」吗？\n\n该群聊有 ${memberCount} 位成员，删除后不可恢复。`);
    if (!confirmed) return;

    const groupName = group.name;
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

// 初始化颜色选择网格
function initColorGrid() {
    colorGrid.innerHTML = COLOR_OPTIONS.map(opt => {
        const noneClass = opt.value === 'none' ? ' color-option-none' : '';
        return `<button class="color-option${noneClass}" data-color="${opt.value}" ` +
            `style="background:${opt.dot}" title="${opt.name}"></button>`;
    }).join('');

    colorGrid.addEventListener('click', (e) => {
        const btn = e.target.closest('.color-option');
        if (btn) {
            selectedColor = btn.dataset.color;
            updateColorSelection();
        }
    });
}

function updateColorSelection() {
    colorGrid.querySelectorAll('.color-option').forEach(btn => {
        btn.classList.toggle('selected', btn.dataset.color === selectedColor);
    });
}

// ============ 导入导出（包含群聊名称） ============

// 导入名单
function handleImport(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
        try {
            const imported = JSON.parse(event.target.result);

            // 支持新格式（groups 数组含群名）和旧格式（扁平数组）
            if (imported.groups && Array.isArray(imported.groups)) {
                // 新格式：每个群聊独立导入或合并
                let importedCount = 0;
                let newGroupCount = 0;

                imported.groups.forEach(importedGroup => {
                    if (!importedGroup.members || !Array.isArray(importedGroup.members)) return;

                    // 尝试按 id 或 name 匹配已有群聊
                    let existingGroup = null;
                    if (importedGroup.id) {
                        existingGroup = groups.find(g => g.id === importedGroup.id);
                    }
                    if (!existingGroup && importedGroup.name) {
                        existingGroup = groups.find(g => g.name === importedGroup.name);
                    }

                    if (existingGroup) {
                        // 合并到已有群聊
                        if (importedGroup.name) existingGroup.name = importedGroup.name;
                        if (importedGroup.icon) existingGroup.icon = importedGroup.icon;
                        if (importedGroup.link) existingGroup.link = importedGroup.link;

                        importedGroup.members.forEach(m => {
                            if (m.handle && !existingGroup.members.some(
                                em => em.handle.toLowerCase() === m.handle.toLowerCase()
                            )) {
                                existingGroup.members.push({
                                    handle: m.handle,
                                    displayName: m.displayName || m.name || m.handle,
                                });
                                importedCount++;
                            }
                        });
                    } else {
                        // 创建新群聊
                        const newGroup = {
                            id: importedGroup.id || 'g_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
                            name: importedGroup.name || '导入的群聊',
                            link: importedGroup.link || importedGroup.url || '',
                            icon: importedGroup.icon || '🍵',
                            members: importedGroup.members.map(m => ({
                                handle: m.handle,
                                displayName: m.displayName || m.name || m.handle,
                            })),
                        };
                        groups.push(newGroup);
                        if (!currentGroupId) currentGroupId = newGroup.id;
                        importedCount += newGroup.members.length;
                        newGroupCount++;
                    }
                });

                saveGroups(() => {
                    const parts = [];
                    if (newGroupCount > 0) parts.push(`新建 ${newGroupCount} 个群聊`);
                    if (importedCount > 0) parts.push(`导入 ${importedCount} 位成员`);
                    showToast(parts.length > 0 ? parts.join(', ') : '无新数据');
                });
            } else if (Array.isArray(imported)) {
                // 旧格式：扁平数组，导入到当前群聊
                const group = getCurrentGroup();
                if (!group) {
                    showToast('请先选择或创建群聊');
                    fileInput.value = '';
                    return;
                }

                let added = 0;
                imported.forEach((item) => {
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
            } else {
                showToast('文件格式错误');
            }
        } catch (err) {
            showToast('解析文件失败');
        }
    };
    reader.readAsText(file);
    fileInput.value = '';
}

// 导出当前群聊名单（包含群聊名称、logo等信息）
function handleExport() {
    const group = getCurrentGroup();
    if (!group) {
        showToast('请先选择一个群聊');
        return;
    }

    const exportData = {
        groups: [{
            id: group.id,
            name: group.name,
            link: group.link || '',
            icon: group.icon || '🍵',
            bgColor: group.bgColor || '',
            members: group.members.map(m => ({
                handle: m.handle,
                displayName: m.displayName || m.handle,
            })),
        }]
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const safeName = (group.name || 'group').replace(/[^a-zA-Z0-9\u4e00-\u9fff]/g, '_');
    a.download = `喝茶神器_${safeName}_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast(`已导出「${group.name}」${group.members.length} 位成员`);
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
