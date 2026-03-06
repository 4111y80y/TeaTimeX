/**
 * 喝茶神器 Popup Script
 * 管理用户列表的弹窗界面逻辑
 */

// 可选的 emoji 列表
const EMOJI_OPTIONS = [
    '🍵', '☕', '🫖', '🧋', '🍶', '🥤', '🧊', '🍹',
    '⭐', '🌟', '💫', '✨', '🔥', '💎', '👑', '🎯',
    '❤️', '💙', '💚', '💛', '💜', '🧡', '🤍', '🖤',
    '🎉', '🎊', '🎈', '🎁', '🏆', '🥇', '🎖️', '🏅',
    '🌸', '🌺', '🌻', '🌹', '🌷', '🍀', '🌿', '🎋',
    '🐉', '🦋', '🐝', '🐬', '🦊', '🐱', '🐶', '🦄',
    '💰', '💵', '🪙', '📈', '🚀', '💡', '🎨', '🎵',
];

let members = [];
let editingHandle = null;

// DOM 元素
const memberList = document.getElementById('memberList');
const memberCount = document.getElementById('memberCount');
const searchInput = document.getElementById('searchInput');
const addHandle = document.getElementById('addHandle');
const addName = document.getElementById('addName');
const btnAdd = document.getElementById('btnAdd');
const btnImport = document.getElementById('btnImport');
const btnExport = document.getElementById('btnExport');
const fileInput = document.getElementById('fileInput');
const emojiOverlay = document.getElementById('emojiOverlay');
const emojiGrid = document.getElementById('emojiGrid');
const btnCloseEmoji = document.getElementById('btnCloseEmoji');

// 初始化
document.addEventListener('DOMContentLoaded', () => {
    loadMembers();
    initEmojiPicker();
    bindEvents();
});

// 加载成员列表
function loadMembers() {
    chrome.storage.local.get('members', (result) => {
        members = result.members || [];
        renderMembers();
    });
}

// 保存成员列表
function saveMembers() {
    chrome.storage.local.set({ members }, () => {
        renderMembers();
    });
}

// 渲染成员列表
function renderMembers(filter = '') {
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
        <div class="empty-icon">${filter ? '🔍' : '🍵'}</div>
        <p>${filter ? '未找到匹配的成员' : '还没有添加成员<br>点击上方添加按钮开始'}</p>
      </div>
    `;
        return;
    }

    memberList.innerHTML = filtered
        .map(
            (m) => `
    <div class="member-item" data-handle="${escapeHtml(m.handle)}">
      <span class="member-icon" data-handle="${escapeHtml(m.handle)}" title="点击更换图标">${m.icon || '🍵'}</span>
      <div class="member-info">
        <div class="member-name">${escapeHtml(m.displayName || m.handle)}</div>
        <div class="member-handle">
          <a href="https://x.com/${encodeURIComponent(m.handle)}" target="_blank">@${escapeHtml(m.handle)}</a>
        </div>
      </div>
      <button class="btn-delete" data-handle="${escapeHtml(m.handle)}" title="删除成员">✕</button>
    </div>
  `
        )
        .join('');
}

// 绑定事件
function bindEvents() {
    // 搜索
    searchInput.addEventListener('input', (e) => {
        renderMembers(e.target.value);
    });

    // 添加成员
    btnAdd.addEventListener('click', addMember);
    addHandle.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') addMember();
    });
    addName.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') addMember();
    });

    // 删除成员和更换图标 (事件委托)
    memberList.addEventListener('click', (e) => {
        const deleteBtn = e.target.closest('.btn-delete');
        if (deleteBtn) {
            const handle = deleteBtn.dataset.handle;
            deleteMember(handle);
            return;
        }

        const iconEl = e.target.closest('.member-icon');
        if (iconEl) {
            editingHandle = iconEl.dataset.handle;
            showEmojiPicker();
            return;
        }
    });

    // 导入
    btnImport.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', handleImport);

    // 导出
    btnExport.addEventListener('click', handleExport);

    // 关闭 emoji 选择器
    btnCloseEmoji.addEventListener('click', hideEmojiPicker);
    emojiOverlay.addEventListener('click', (e) => {
        if (e.target === emojiOverlay) hideEmojiPicker();
    });
}

// 添加成员
function addMember() {
    let handle = addHandle.value.trim().replace(/^@/, '');
    const displayName = addName.value.trim();

    if (!handle) {
        showToast('请输入用户 handle');
        addHandle.focus();
        return;
    }

    // 检查重复
    if (members.some((m) => m.handle.toLowerCase() === handle.toLowerCase())) {
        showToast('该用户已在列表中');
        return;
    }

    members.push({
        handle,
        displayName: displayName || handle,
        icon: '🍵',
    });

    addHandle.value = '';
    addName.value = '';
    saveMembers();
    showToast(`已添加 @${handle}`);
}

// 删除成员
function deleteMember(handle) {
    members = members.filter((m) => m.handle !== handle);
    saveMembers();
    showToast(`已删除 @${handle}`);
}

// 初始化 emoji 选择器
function initEmojiPicker() {
    emojiGrid.innerHTML = EMOJI_OPTIONS.map(
        (emoji) => `<button class="emoji-option" data-emoji="${emoji}">${emoji}</button>`
    ).join('');

    emojiGrid.addEventListener('click', (e) => {
        const btn = e.target.closest('.emoji-option');
        if (btn && editingHandle) {
            const emoji = btn.dataset.emoji;
            const member = members.find((m) => m.handle === editingHandle);
            if (member) {
                member.icon = emoji;
                saveMembers();
                showToast(`图标已更改为 ${emoji}`);
            }
            hideEmojiPicker();
        }
    });
}

// 显示/隐藏 emoji 选择器
function showEmojiPicker() {
    emojiOverlay.style.display = 'flex';
}

function hideEmojiPicker() {
    emojiOverlay.style.display = 'none';
    editingHandle = null;
}

// 导入名单
function handleImport(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
        try {
            const imported = JSON.parse(event.target.result);
            if (!Array.isArray(imported)) {
                showToast('文件格式错误');
                return;
            }

            let added = 0;
            imported.forEach((item) => {
                if (item.handle && !members.some((m) => m.handle.toLowerCase() === item.handle.toLowerCase())) {
                    members.push({
                        handle: item.handle,
                        displayName: item.displayName || item.handle,
                        icon: item.icon || '🍵',
                    });
                    added++;
                }
            });

            saveMembers();
            showToast(`成功导入 ${added} 位新成员`);
        } catch (err) {
            showToast('解析文件失败');
        }
    };
    reader.readAsText(file);
    fileInput.value = '';
}

// 导出名单
function handleExport() {
    const blob = new Blob([JSON.stringify(members, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `teatimex_members_${new Date().toISOString().slice(0, 10)}.json`;
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
