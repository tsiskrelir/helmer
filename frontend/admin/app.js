const API_BASE_URL = window.API_BASE_URL || '/api/admin';

let currentPage = 1;
let currentStatus = '';
let currentSearch = '';
let currentInquiryId = null;

function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function getToken() {
  return localStorage.getItem('admin_token');
}

function authHeaders() {
  return { 'Authorization': 'Bearer ' + getToken() };
}

function authFetch(url, options = {}) {
  options.headers = { ...options.headers, ...authHeaders() };
  return fetch(url, options).then(res => {
    if (res.status === 401) {
      localStorage.removeItem('admin_token');
      window.location.href = 'login.html';
      throw new Error('unauthorized');
    }
    return res;
  });
}

// Auth gate: verify token on load, redirect if invalid
(async () => {
  const token = getToken();
  if (!token) { window.location.href = 'login.html'; return; }
  try {
    const res = await fetch(API_BASE_URL + '/verify', { headers: authHeaders() });
    const data = await res.json();
    if (!data.valid) { localStorage.removeItem('admin_token'); window.location.href = 'login.html'; }
  } catch { window.location.href = 'login.html'; }
})();

function showToast(message, type = 'success') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => {
    toast.classList.add('fadeout');
    toast.addEventListener('animationend', () => toast.remove());
  }, 3000);
}

function showModal(message) {
  return new Promise((resolve) => {
    const overlay = document.getElementById('modal-overlay');
    document.getElementById('modal-body').textContent = message;
    const actions = document.getElementById('modal-actions');
    actions.innerHTML = '';

    const okBtn = document.createElement('button');
    okBtn.className = 'modal-btn modal-btn-ok';
    okBtn.textContent = 'OK';
    okBtn.onclick = () => { overlay.classList.remove('visible'); resolve(); };
    actions.appendChild(okBtn);

    overlay.classList.add('visible');
    okBtn.focus();
  });
}

function showConfirm(message) {
  return new Promise((resolve) => {
    const overlay = document.getElementById('modal-overlay');
    document.getElementById('modal-body').textContent = message;
    const actions = document.getElementById('modal-actions');
    actions.innerHTML = '';

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'modal-btn modal-btn-cancel';
    cancelBtn.textContent = 'Abbrechen';
    cancelBtn.onclick = () => { overlay.classList.remove('visible'); resolve(false); };

    const confirmBtn = document.createElement('button');
    confirmBtn.className = 'modal-btn modal-btn-confirm';
    confirmBtn.textContent = 'Bestätigen';
    confirmBtn.onclick = () => { overlay.classList.remove('visible'); resolve(true); };

    actions.appendChild(cancelBtn);
    actions.appendChild(confirmBtn);

    overlay.classList.add('visible');
    confirmBtn.focus();
  });
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  loadInquiries();
  setupEventListeners();
  loadChatbotToggle();
});

function setupEventListeners() {
  // Status tabs
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      currentStatus = tab.dataset.status;
      currentPage = 1;
      loadInquiries();
    });
  });

  // Search
  document.getElementById('search-btn').addEventListener('click', () => {
    currentSearch = document.getElementById('search-input').value;
    currentPage = 1;
    loadInquiries();
  });

  // Pagination
  document.getElementById('prev-page').addEventListener('click', () => {
    if (currentPage > 1) {
      currentPage--;
      loadInquiries();
    }
  });

  document.getElementById('next-page').addEventListener('click', () => {
    currentPage++;
    loadInquiries();
  });

  // Back button
  document.getElementById('back-btn').addEventListener('click', () => {
    showListView();
  });

  // Detail tabs
  document.querySelectorAll('.detail-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      const tabName = tab.dataset.tab;
      document.querySelectorAll('.detail-tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.detail-tab-content').forEach(c => c.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById(`${tabName}-tab`).classList.add('active');
    });
  });

  // Update status
  document.getElementById('update-status-btn').addEventListener('click', updateStatus);

  // Export to Kleos
  document.getElementById('export-kleos-btn').addEventListener('click', exportToKleos);

  // Legal area → topic sync
  document.getElementById('legal-area-select').addEventListener('change', (e) => {
    populateTopicSelect(e.target.value, null);
  });
}

async function loadInquiries() {
  try {
    const params = new URLSearchParams({
      page: currentPage.toString(),
      limit: '20',
    });
    if (currentStatus) params.append('status', currentStatus);
    if (currentSearch) params.append('search', currentSearch);

    const response = await authFetch(`${API_BASE_URL}/inquiries?${params}`);
    if (!response.ok) throw new Error('API error');
    const data = await response.json();

    displayInquiries(data.inquiries || []);
    if (data.pagination) updatePagination(data.pagination);

    // Load stats
    loadStats();
  } catch (error) {
    console.error('Error loading inquiries:', error);
    showToast('Fehler beim Laden der Anfragen', 'error');
  }
}

function displayInquiries(inquiries) {
  const tbody = document.getElementById('inquiry-table-body');
  tbody.innerHTML = '';

  if (inquiries.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 40px;">Keine Anfragen gefunden</td></tr>';
    return;
  }

  inquiries.forEach(inquiry => {
    const row = document.createElement('tr');
    const date = new Date(inquiry.created_at).toLocaleDateString('de-DE');
    const name = `${inquiry.first_name || ''} ${inquiry.last_name || ''}`.trim() || 'Unbekannt';
    
    row.innerHTML = `
      <td>${date}</td>
      <td>${name}</td>
      <td>${inquiry.legal_area || '-'}</td>
      <td>${inquiry.legal_topic || '-'}</td>
      <td>${inquiry.channel === 'chatbot' ? 'Chatbot' : 'E-Mail'}</td>
      <td><span class="status-badge ${inquiry.status}">${getStatusLabel(inquiry.status)}</span></td>
      <td><button class="btn-open" onclick="showDetailView('${inquiry.id}')">Öffnen</button></td>
    `;
    tbody.appendChild(row);
  });
}

function updatePagination(pagination) {
  document.getElementById('page-info').textContent = `Seite ${pagination.page}`;
  document.getElementById('prev-page').disabled = pagination.page === 1;
  document.getElementById('next-page').disabled = pagination.page * pagination.limit >= pagination.total;
}

async function loadStats() {
  try {
    const response = await authFetch(`${API_BASE_URL}/stats`);
    const data = await response.json();
    document.getElementById('total-count').textContent = data.stats.total_count;
  } catch (error) {
    console.error('Error loading stats:', error);
  }
}

function getStatusLabel(status) {
  const labels = {
    'new': 'Neu',
    'in_progress': 'In Bearbeitung',
    'completed': 'Abgeschlossen',
    'rejected': 'Abgelehnt',
  };
  return labels[status] || status;
}

const topicsByArea = {
  'Arbeitsrecht': [
    'K\u00fcndigung Arbeitsvertrag',
    'Abfindung',
    'Abmahnung',
    'Allgemein',
  ],
  'Mietrecht': [
    'K\u00fcndigung Mietvertrag',
    'R\u00e4umungsklage',
    'Mietstreit / M\u00e4ngel',
    'Allgemein',
  ],
  'Sonstiges': [
    'Allgemein',
  ],
};

function populateTopicSelect(area, currentTopic) {
  const select = document.getElementById('legal-topic-select');
  select.innerHTML = '';
  const topics = topicsByArea[area] || ['Allgemein'];
  topics.forEach(t => {
    const opt = document.createElement('option');
    opt.value = t;
    opt.textContent = t;
    select.appendChild(opt);
  });
  if (currentTopic) {
    const exists = topics.includes(currentTopic);
    if (!exists) {
      const opt = document.createElement('option');
      opt.value = currentTopic;
      opt.textContent = currentTopic;
      select.appendChild(opt);
    }
    select.value = currentTopic;
  }
}

async function showDetailView(inquiryId) {
  currentInquiryId = inquiryId;
  
  try {
    const response = await authFetch(`${API_BASE_URL}/inquiries/${inquiryId}`);
    const data = await response.json();

    // Populate sidebar
    const contactName = `${data.contact?.first_name || ''} ${data.contact?.last_name || ''}`.trim();
    const contactEl = document.getElementById('contact-info');
    if (contactName) {
      contactEl.innerHTML = `
        <div class="contact-name">${contactName}</div>
        ${data.contact?.email ? `<div class="contact-detail">${data.contact.email}</div>` : ''}
        ${data.contact?.phone ? `<div class="contact-detail">${data.contact.phone}</div>` : ''}
      `;
    } else {
      contactEl.innerHTML = `<div class="contact-detail" style="font-style:italic;">Noch keine Kontaktdaten</div>`;
    }

    document.getElementById('detail-status-badge').innerHTML = 
      `<span class="status-badge ${data.inquiry.status}">${getStatusLabel(data.inquiry.status)}</span>`;
    
    document.getElementById('detail-created').textContent = 
      new Date(data.inquiry.created_at).toLocaleString('de-DE', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit'
      });
    document.getElementById('detail-channel').textContent = 
      data.inquiry.channel === 'chatbot' ? 'Chatbot' : 'E-Mail';

    // Set legal area and populate topic dropdown
    const area = data.inquiry.legal_area || '';
    document.getElementById('legal-area-select').value = area;
    populateTopicSelect(area, data.inquiry.legal_topic);

    document.getElementById('status-select').value = data.inquiry.status;

    // Export button: disable if already exported
    const exportBtn = document.getElementById('export-kleos-btn');
    if (data.inquiry.exported_to_kleos_at) {
      exportBtn.disabled = true;
      exportBtn.textContent = 'Bereits exportiert';
      exportBtn.classList.add('btn-exported');
    } else {
      exportBtn.disabled = false;
      exportBtn.textContent = 'Nach Kleos exportieren';
      exportBtn.classList.remove('btn-exported');
    }

    // Display conversation
    displayConversation(data.conversations);

    // Display documents
    displayDocuments(data.documents);

    // Show detail view
    document.getElementById('inquiry-list-view').classList.remove('active');
    document.getElementById('inquiry-detail-view').classList.add('active');
  } catch (error) {
    console.error('Error loading inquiry details:', error);
    showToast('Fehler beim Laden der Anfrage', 'error');
  }
}

function displayConversation(conversations) {
  const container = document.getElementById('conversation-container');
  container.innerHTML = '';

  const internalMessages = ['Session started', 'files_uploaded', 'skip'];

  const filtered = conversations.filter(msg => {
    if (msg.sender === 'system') return false;
    if (internalMessages.includes(msg.message)) return false;
    return true;
  });

  // Deduplicate consecutive identical bot messages
  const deduped = [];
  for (const msg of filtered) {
    const prev = deduped[deduped.length - 1];
    if (prev && prev.sender === 'bot' && msg.sender === 'bot' && prev.message === msg.message) continue;
    deduped.push(msg);
  }

  if (deduped.length === 0) {
    container.innerHTML = '<p style="text-align:center;color:#999;padding:20px;">Keine Nachrichten vorhanden</p>';
    return;
  }

  deduped.forEach(msg => {
    const div = document.createElement('div');
    div.className = `message-item ${msg.sender}`;
    const time = new Date(msg.created_at).toLocaleString('de-DE', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
    const label = msg.sender === 'bot' ? 'Bot' : 'Mandant';
    let text = msg.message;
    if (msg.sender === 'user' && msg.message_type === 'contact') {
      text = text.replace(/^Kontaktdaten:\s*/, '');
    }
    div.innerHTML = `
      <div class="message-meta">${label} \u00b7 ${time}</div>
      <div class="message-body" style="white-space: pre-wrap;">${escapeHtml(text)}</div>
    `;
    container.appendChild(div);
  });
}

function displayDocuments(documents) {
  const container = document.getElementById('documents-list');
  container.innerHTML = '';

  if (documents.length === 0) {
    container.innerHTML = '<p>Keine Dokumente vorhanden</p>';
    return;
  }

  documents.forEach(doc => {
    const div = document.createElement('div');
    div.className = 'document-item';
    div.innerHTML = `
      <span class="doc-name" title="${doc.original_filename}">${doc.original_filename}</span>
      <a href="/uploads/${doc.filename}" target="_blank">&Ouml;ffnen</a>
    `;
    container.appendChild(div);
  });
}

function showListView() {
  document.getElementById('inquiry-detail-view').classList.remove('active');
  document.getElementById('inquiry-list-view').classList.add('active');
  loadInquiries();
}

async function updateStatus() {
  const status = document.getElementById('status-select').value;
  
  try {
    const response = await authFetch(`${API_BASE_URL}/inquiries/${currentInquiryId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });

    if (response.ok) {
      showToast('Status aktualisiert', 'success');
      showDetailView(currentInquiryId);
    } else {
      showToast('Fehler beim Aktualisieren des Status', 'error');
    }
  } catch (error) {
    console.error('Error updating status:', error);
    showToast('Fehler beim Aktualisieren des Status', 'error');
  }
}

async function exportToKleos() {
  const confirmed = await showConfirm('Möchten Sie diese Anfrage wirklich nach Kleos exportieren?');
  if (!confirmed) return;

  try {
    const response = await authFetch(`${API_BASE_URL}/inquiries/${currentInquiryId}/export-kleos`, {
      method: 'POST',
    });

    const data = await response.json();
    
    if (response.ok) {
      showToast('Erfolgreich nach Kleos exportiert', 'success');
      showDetailView(currentInquiryId);
    } else {
      showToast('Fehler beim Exportieren: ' + (data.message || 'Unbekannter Fehler'), 'error');
    }
  } catch (error) {
    console.error('Error exporting to Kleos:', error);
    showToast('Fehler beim Exportieren nach Kleos', 'error');
  }
}

// ── Chatbot toggle ──
async function loadChatbotToggle() {
  const toggle = document.getElementById('chatbot-toggle');
  if (!toggle) return;
  try {
    const res = await authFetch(`${API_BASE_URL}/settings`);
    const data = await res.json();
    toggle.checked = data.settings?.chatbot_enabled !== 'false';
  } catch {
    toggle.checked = true;
  }
  toggle.addEventListener('change', async () => {
    try {
      await authFetch(`${API_BASE_URL}/settings`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'chatbot_enabled', value: String(toggle.checked) }),
      });
      showToast(toggle.checked ? 'Chatbot aktiviert' : 'Chatbot deaktiviert', 'success');
    } catch {
      showToast('Fehler beim Speichern', 'error');
      toggle.checked = !toggle.checked;
    }
  });
}

// Make functions available globally
window.showDetailView = showDetailView;

